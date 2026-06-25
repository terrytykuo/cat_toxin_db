#!/usr/bin/env python3
"""
Clean NotebookLM source-artifact noise from EN canonical toxin JSON
(data/plants_processed/*.json + data/foods_processed/*.json).

Targets the systematic artifacts found in the 2026-06-25 content audit, which
live mostly in symptoms[].notes / .onset / .name and chemicals[].description:
  1. "[... Conversation History ...]" bracket placeholders (incl. unclosed).
  2. Leaked numbered-list section headers glued onto the end of a field, e.g.
     "...a cat will swallow3. 2. Excessive Drooling (Hypersalivation)".
  3. Footnote citation digits glued to a lowercase word at end-of-field
     ("...consumed3." -> "...consumed.").
  4. Stray "...." ellipsis residue.
  5. A leftover "in cats:" prompt-echo prefix at the start of a field.

SAFETY: conservative by design.
  - Footnote digits are stripped ONLY when glued to a lowercase letter (so
    chemistry/vitamin tokens like B12, O2, K1, CO2 — Capital+digits — are NOT touched).
  - Fields that look TRUNCATED mid-word/sentence are FLAGGED, never edited.
  - Default DRY-RUN; pass --apply to write. Idempotent.

Usage:
  cd cat_toxin_db
  python3 pipeline/clean_notebooklm_noise.py            # dry-run diff
  python3 pipeline/clean_notebooklm_noise.py --apply      # write
  python3 pipeline/clean_notebooklm_noise.py --flags      # also list truncation flags
"""
import json
import re
import sys
import glob
import os

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIRS = [os.path.join(REPO, "data", "plants_processed"),
        os.path.join(REPO, "data", "foods_processed")]

APPLY = "--apply" in sys.argv
SHOW_FLAGS = "--flags" in sys.argv

RE_CONV_CLOSED = re.compile(r"\s*\[[^\[\]]*Conversation History[^\[\]]*\]")
RE_CONV_OPEN = re.compile(r"\s*\[[^\[\]]*Conversation History[^\[\]]*$")
RE_IN_CATS = re.compile(r"^\s*in cats:\s*", re.IGNORECASE)
# Leaked enumeration header — ONLY the unambiguous DOUBLE-number signature
# ("...swallow3. 2. Excessive Drooling"): footnote digit, then a list number,
# then a Title-Case header to end of field. Single-number trailing text is NOT
# matched here (it is too often a legitimate footnoted sentence continuation —
# e.g. "...gastritis1. It should be noted that...") and is left for the flag pass.
RE_LEAKED_HEADER = re.compile(r"\s*\d{1,2}\.\s+\d{1,2}\.\s+[A-Z][^.]*$")
# footnote digit glued to a lowercase word/paren at end of field (safe: Capital+
# digit tokens like B12 / O2 / K1 are not preceded by a lowercase letter)
RE_FOOT_END = re.compile(r"(?<=[a-z\)])\d{1,2}(?=\.?\s*$)")
# footnote digit glued to lowercase word immediately before a leaked header boundary
RE_FOOT_BEFORE_HEADER = re.compile(r"(?<=[a-z\)])\d{1,2}(?=\.\s+\d{1,2}\.\s+[A-Z])")
RE_MULTIDOT = re.compile(r"\.{3,}")

TRUNC_OK_END = (".", "!", "?", ")", "%", "”", "\"")


def looks_truncated(s):
    s = s.rstrip()
    if not s:
        return False
    if s.endswith(TRUNC_OK_END):
        return False
    # ends mid-word (letter) or with a dangling connector/comma
    return bool(re.search(r"[A-Za-z,;:(\-]$", s))


def clean_text(s):
    """Return (cleaned, changed_bool)."""
    orig = s
    # remove footnote digit that sits right before a leaked header, so the header
    # strip leaves a clean word
    s = RE_FOOT_BEFORE_HEADER.sub("", s)
    # strip leaked enumeration headers (repeat: there can be several)
    prev = None
    while prev != s:
        prev = s
        s = RE_LEAKED_HEADER.sub("", s)
    # conversation-history brackets
    s = RE_CONV_CLOSED.sub("", s)
    s = RE_CONV_OPEN.sub("", s)
    # in cats: prefix
    s = RE_IN_CATS.sub("", s)
    # stray ellipsis
    s = RE_MULTIDOT.sub(".", s)
    # trailing footnote digit glued to lowercase word
    s = RE_FOOT_END.sub("", s)
    # tidy whitespace + duplicate terminal dots
    s = re.sub(r"\s+", " ", s).strip()
    s = re.sub(r"\.\s*\.$", ".", s)
    return s, (s != orig)


def process_field(obj, key, where, changes, flags):
    v = obj.get(key)
    if not isinstance(v, str) or not v:
        return
    cleaned, changed = clean_text(v)
    if changed:
        changes.append((where + "." + key, v, cleaned))
        obj[key] = cleaned
    if looks_truncated(obj.get(key, "")):
        flags.append((where + "." + key, obj.get(key, "")[-60:]))


def main():
    total = 0
    files_changed = 0
    all_flags = []
    for d in DIRS:
        for path in sorted(glob.glob(os.path.join(d, "*.json"))):
            data = json.load(open(path, encoding="utf-8"))
            changes = []
            flags = []
            for i, s in enumerate(data.get("symptoms") or []):
                process_field(s, "notes", f"symptoms[{i}]", changes, flags)
                process_field(s, "onset", f"symptoms[{i}]", changes, flags)
                process_field(s, "name", f"symptoms[{i}]", changes, flags)
            for i, c in enumerate(data.get("chemicals") or []):
                process_field(c, "description", f"chemicals[{i}]", changes, flags)
                process_field(c, "concentration_notes", f"chemicals[{i}]", changes, flags)
            for i, t in enumerate(data.get("treatments") or []):
                process_field(t, "notes", f"treatments[{i}]", changes, flags)
                process_field(t, "description", f"treatments[{i}]", changes, flags)
            if changes:
                files_changed += 1
                total += len(changes)
                print(f"\n### {os.path.basename(path)} ({len(changes)} field(s)) ###")
                for loc, before, after in changes:
                    print(f"  [{loc}]")
                    print(f"    -  …{before[-90:]!r}")
                    print(f"    +  …{after[-90:]!r}")
                if APPLY:
                    with open(path, "w", encoding="utf-8") as fh:
                        json.dump(data, fh, ensure_ascii=False, indent=2)
                        fh.write("\n")
            if flags:
                all_flags.append((os.path.basename(path), flags))

    print("\n" + ("APPLIED" if APPLY else "DRY-RUN") +
          f": {total} field(s) cleaned across {files_changed} files")
    if all_flags:
        print(f"\n⚠ {sum(len(f) for _, f in all_flags)} field(s) look TRUNCATED "
              f"(left untouched, need manual/LLM repair) in {len(all_flags)} files")
        if SHOW_FLAGS:
            for fn, flags in all_flags:
                for loc, tail in flags:
                    print(f"    {fn} [{loc}]: …{tail!r}")


if __name__ == "__main__":
    main()
