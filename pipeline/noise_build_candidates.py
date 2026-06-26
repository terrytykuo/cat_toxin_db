#!/usr/bin/env python3
"""Build the candidate set for the safe LLM noise pass: every field that still
looks_truncated (excluding symptoms name/onset short labels), with context."""
import json, re, glob, os

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIRS = [os.path.join(REPO, "data", "plants_processed"),
        os.path.join(REPO, "data", "foods_processed")]
TRUNC_OK_END = (".", "!", "?", ")", "%", "”", '"')
WORK = os.path.join(REPO, "data", "audits", "noise_work")
os.makedirs(WORK, exist_ok=True)
OUT = os.path.join(WORK, "candidates.json")

def looks_truncated(s):
    s = s.rstrip()
    if not s: return False
    if s.endswith(TRUNC_OK_END): return False
    return bool(re.search(r"[A-Za-z,;:(\-]$", s))

FIELD_MAP = [("symptoms", ["notes"]),     # skip name/onset labels
             ("chemicals", ["description","concentration_notes"]),
             ("treatments", ["notes","description"])]

cands = []
for d in DIRS:
    for path in sorted(glob.glob(os.path.join(d, "*.json"))):
        data = json.load(open(path, encoding="utf-8"))
        fn = os.path.basename(path)
        for arr_key, fields in FIELD_MAP:
            arr = data.get(arr_key) or []
            sib_names = [ (x.get("name") or "")[:60] for x in arr ] if arr_key in ("symptoms","treatments") else []
            for i, obj in enumerate(arr):
                for f in fields:
                    v = obj.get(f)
                    if not isinstance(v, str) or not v or not looks_truncated(v): continue
                    cands.append({
                        "file": fn, "arr": arr_key, "idx": i, "field": f,
                        "item_name": (obj.get("name") or "")[:60],
                        "siblings": sib_names,
                        "text": v,
                    })
json.dump(cands, open(OUT, "w"), ensure_ascii=False, indent=2)
print(f"candidates: {len(cands)} across {len(set(c['file'] for c in cands))} files")
# breakdown by field
from collections import Counter
bc = Counter((c['arr'], c['field']) for c in cands)
for k,v in sorted(bc.items(), key=lambda x:-x[1]):
    print(f"  {k}: {v}")
# length stats for batching
lens = sorted(len(c['text']) for c in cands)
print(f"  text len: min {lens[0]} median {lens[len(lens)//2]} max {lens[-1]}; total chars {sum(lens)}")
