#!/usr/bin/env python3
"""Strip leaked next-section headers where trailing '. N.' number == array index+2.
This is the strongest, safest signal: the glued number is exactly the next list
item's position, so it's unambiguously a leak (not a footnote). Removal leaves a
clean sentence-ending. Removal-only, never invents. Dry-run unless --apply."""
import json, re, glob, os, sys

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIRS = [os.path.join(REPO, "data", "plants_processed"),
        os.path.join(REPO, "data", "foods_processed")]
APPLY = "--apply" in sys.argv

# trailing ". N. Title Case ... <eof>" where Title runs to end of field
RE_END_LEAK = re.compile(r"\s*\.\s+(\d{1,2})\.\s+[A-Z][A-Za-z0-9 ./()'’,&-]*$")
FIELD_MAP = [("symptoms", ["notes"]),
             ("treatments", ["notes","description"]),
             ("chemicals", ["description","concentration_notes"])]

total = 0; files_changed = 0
for d in DIRS:
    for path in sorted(glob.glob(os.path.join(d, "*.json"))):
        data = json.load(open(path, encoding="utf-8"))
        fn = os.path.basename(path); changes = []
        for arr_key, fields in FIELD_MAP:
            for i, obj in enumerate(data.get(arr_key) or []):
                for f in fields:
                    v = obj.get(f)
                    if not isinstance(v, str) or not v: continue
                    m = RE_END_LEAK.search(v)
                    if not m: continue
                    if int(m.group(1)) != i + 2:   # strict: must be next-item number
                        continue
                    cleaned = v[:m.start()].rstrip()
                    # ensure clean terminal punctuation
                    if cleaned and cleaned[-1] not in ".!?)\"”%":
                        cleaned += "."
                    if cleaned != v:
                        changes.append((f"{arr_key}[{i}].{f}", v[-80:], cleaned[-80:]))
                        obj[f] = cleaned
        if changes:
            files_changed += 1; total += len(changes)
            print(f"\n### {fn} ({len(changes)}) ###")
            for loc, b, a in changes:
                print(f"  [{loc}]")
                print(f"    - …{b!r}")
                print(f"    + …{a!r}")
            if APPLY:
                with open(path, "w", encoding="utf-8") as fh:
                    json.dump(data, fh, ensure_ascii=False, indent=2); fh.write("\n")
print(f"\n{'APPLIED' if APPLY else 'DRY-RUN'}: {total} leaked headers stripped across {files_changed} files")
