#!/usr/bin/env python3
"""
Normalize zh-TW symptoms[].body_system values in data/site/zh-TW/*.json to the
canonical glossary terms (data/site/translation_glossary.json).

Fixes two systematic divergences found in the 2026-06-25 content audit:
  1. zh variants that appended 系統 or used a non-canonical synonym
     (消化系統 -> 腸胃道, 心血管系統 -> 心血管, 代謝系統 -> 代謝, ...).
  2. ASCII English body_system values left untranslated (Gastrointestinal, Cardiac, ...).

Deterministic and idempotent. Default DRY-RUN; pass --apply to write.

Usage:
  cd cat_toxin_db
  python3 pipeline/normalize_zh_glossary.py            # dry-run, prints diff
  python3 pipeline/normalize_zh_glossary.py --apply     # write changes
"""
import json
import sys
import glob
import os

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ZH_DIR = os.path.join(REPO, "data", "site", "zh-TW")
GLOSSARY = os.path.join(REPO, "data", "site", "translation_glossary.json")

APPLY = "--apply" in sys.argv

# Canonical EN -> zh from the glossary, plus known non-canonical zh variants.
def build_map():
    g = json.load(open(GLOSSARY, encoding="utf-8"))
    bs = g["body_system"]  # {EN: canonical_zh}
    canonical_zh = set(bs.values())

    m = {}
    # ASCII English leakage -> canonical zh
    for en, zh in bs.items():
        m[en] = zh
    # Known zh variants -> canonical zh (observed in audit)
    variants = {
        "消化系統": "腸胃道",
        "消化道系統": "腸胃道",
        "腸胃道系統": "腸胃道",
        "心血管系統": "心血管",
        "代謝系統": "代謝",
        "肝臟系統": "肝臟",
        "腎臟系統": "腎臟",
        "皮膚系統": "皮膚",
        "呼吸道系統": "呼吸系統",
        "血液系統系統": "血液系統",
        "神經系統系統": "神經系統",
    }
    m.update(variants)
    return m, canonical_zh

# Composite / ambiguous values we refuse to auto-map (report for manual review).
AMBIGUOUS = {"皮膚／口腔刺激"}


def main():
    mapping, canonical_zh = build_map()
    total_changes = 0
    changed_files = 0
    flagged = []

    for path in sorted(glob.glob(os.path.join(ZH_DIR, "*.json"))):
        try:
            d = json.load(open(path, encoding="utf-8"))
        except Exception as e:
            print(f"  SKIP (unreadable): {os.path.basename(path)} — {e}")
            continue
        syms = d.get("symptoms") or []
        file_changes = []
        for s in syms:
            bs = s.get("body_system")
            if not bs:
                continue
            if bs in AMBIGUOUS:
                flagged.append((os.path.basename(path), bs))
                continue
            if bs in mapping and mapping[bs] != bs:
                file_changes.append((bs, mapping[bs]))
                s["body_system"] = mapping[bs]
            elif bs not in canonical_zh:
                # unknown value not in our map and not canonical — flag, don't touch
                flagged.append((os.path.basename(path), bs))
        if file_changes:
            changed_files += 1
            total_changes += len(file_changes)
            print(f"{os.path.basename(path)}:")
            for a, b in file_changes:
                print(f"    {a}  ->  {b}")
            if APPLY:
                with open(path, "w", encoding="utf-8") as fh:
                    json.dump(d, fh, ensure_ascii=False, indent=2)
                    fh.write("\n")

    print("\n" + ("APPLIED" if APPLY else "DRY-RUN") +
          f": {total_changes} body_system values in {changed_files} files")
    if flagged:
        print(f"\n⚠ {len(flagged)} value(s) left for manual review (ambiguous / unknown):")
        for fn, v in flagged:
            print(f"    {fn}: {v!r}")


if __name__ == "__main__":
    main()
