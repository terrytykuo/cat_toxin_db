#!/usr/bin/env python3
"""Merge LLM batch results, RE-VALIDATE every invariant independently, then apply
to the real data files. Rejected (invariant-violating) items are NOT applied and
are reported. Dry-run unless --apply."""
import json, glob, os, sys

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# Working dir holds candidates.json, llm_batches/batch_*.json, apply_summary.json.
SCR = os.path.join(REPO, "data", "audits", "noise_work")
APPLY = "--apply" in sys.argv

cands = json.load(open(f"{SCR}/candidates.json"))
TOTAL = len(cands)

# dir resolver: candidates.json = [plants block] + [foods block]; boundary at the
# first foods-only candidate (index 1082 = alcohol.json). i<boundary -> plants.
# This disambiguates the malus_spp / persea_americana basename collisions.
import glob as _glob, os as _os
_plants = set(_os.path.basename(p) for p in _glob.glob(_os.path.join(REPO,"data","plants_processed","*.json")))
_foods  = set(_os.path.basename(p) for p in _glob.glob(_os.path.join(REPO,"data","foods_processed","*.json")))
_foods_only = _foods - _plants
BOUNDARY = next(i for i,c in enumerate(cands) if c["file"] in _foods_only)
def resolve_path(i, fn):
    d = "plants_processed" if i < BOUNDARY else "foods_processed"
    return _os.path.join(REPO, "data", d, fn)

# merge batches
fixes = {}
dup = 0
for bf in sorted(glob.glob(f"{SCR}/llm_batches/batch_*.json")):
    for r in json.load(open(bf)):
        i = r["i"]
        if i in fixes: dup += 1
        fixes[i] = r
covered = sorted(fixes.keys())
missing = [i for i in range(TOTAL) if i not in fixes]
print(f"batch files: {len(glob.glob(f'{SCR}/llm_batches/batch_*.json'))}")
print(f"fixes covered: {len(covered)}/{TOTAL}; duplicates: {dup}; missing indices: {len(missing)}")
if missing:
    print(f"  missing sample: {missing[:20]}")

TERM = ('.', '!', '?', ')', '"', '”', '%')
def validate(orig, r):
    act, cl = r["action"], r["cleaned"]
    if act == "LEAVE":
        return cl == orig, "LEAVE changed text" if cl != orig else ""
    if act == "ADD_PERIOD":
        return cl == orig + ".", "" if cl == orig + "." else "not orig+'.'"
    if act in ("TRIM_TRUNCATED", "STRIP_LEAK"):
        base = cl[:-1] if cl and cl[-1] in '.!?' else cl
        if not orig.startswith(base):
            return False, "not a prefix of original"
        if not cl or cl[-1] not in TERM:
            return False, "no terminal punctuation"
        if len(cl) < 3:
            return False, "suspiciously short"
        return True, ""
    return False, f"unknown action {act}"

from collections import Counter
actc = Counter()
rejected = []
final = {}   # i -> final value to write (cleaned if valid edit, else orig)
leaves = []
for i, c in enumerate(cands):
    if i not in fixes:
        final[i] = c["text"]   # no fix -> keep original (consistency restore)
        continue
    r = fixes[i]
    ok, why = validate(c["text"], r)
    actc[r["action"]] += 1
    if not ok:
        rejected.append((i, c["file"], r["action"], why, c["text"][-50:], r["cleaned"][-50:]))
        final[i] = c["text"]    # rejected -> keep original
        continue
    if r["action"] == "LEAVE":
        leaves.append((i, c["file"]))
        final[i] = c["text"]
        continue
    final[i] = r["cleaned"]

n_edit = sum(1 for i in final if final[i] != cands[i]["text"])
print(f"\naction counts: {dict(actc)}")
print(f"net edits: {n_edit}; LEAVE: {len(leaves)}; REJECTED(kept orig): {len(rejected)}")
if rejected:
    print("\n--- REJECTED (invariant violations, kept original) ---")
    for i, fn, act, why, it, ot in rejected[:30]:
        print(f"  #{i} {fn} {act}: {why}\n     in …{it!r}\n     out…{ot!r}")

# write a definitive value for EVERY candidate field, routed by resolve_path(i)
if APPLY:
    byfile = {}
    for i in final:
        byfile.setdefault(resolve_path(i, cands[i]["file"]), []).append(i)
    changed_files = 0
    for p, idxs in byfile.items():
        if not os.path.exists(p):
            print(f"  !! file not found: {p}"); continue
        data = json.load(open(p, encoding="utf-8"))
        touched = False
        for i in idxs:
            c = cands[i]
            cur = data[c["arr"]][c["idx"]].get(c["field"])
            if cur != final[i]:
                data[c["arr"]][c["idx"]][c["field"]] = final[i]; touched = True
        if touched:
            with open(p, "w", encoding="utf-8") as fh:
                json.dump(data, fh, ensure_ascii=False, indent=2); fh.write("\n")
            changed_files += 1
    print(f"\nAPPLIED final values; files rewritten: {changed_files}")
else:
    print(f"\nDRY-RUN. net-edit fields: {n_edit}; boundary index: {BOUNDARY} ({cands[BOUNDARY]['file']})")

# persist a reject list + leave list for the audit record
json.dump({"rejected_idx": [r[0] for r in rejected], "leave_idx": [l[0] for l in leaves],
           "net_edits": n_edit, "missing_idx": missing, "actions": dict(actc),
           "boundary": BOUNDARY},
          open(f"{SCR}/apply_summary.json", "w"), ensure_ascii=False, indent=2)
