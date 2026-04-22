#!/usr/bin/env python3
"""
verify_raw.py — Audit raw plant collection files for incomplete queries.

Scans data/plants/ and checks that every plant has all 5 raw responses
present and non-trivial. Answers: "which plants need re-querying?"

Output: human-readable summary to stdout.
"""

import json
import os
import glob
import sys

RAW_DIR = "data/plants"
REQUIRED_KEYS = ["basics", "toxic_parts", "toxins", "symptoms", "treatments"]
MIN_RESPONSE_LENGTH = 50  # responses shorter than this are likely errors


def verify_raw_file(filepath):
    """Check a single raw collection file."""
    filename = os.path.basename(filepath)
    issues = []

    try:
        with open(filepath, "r") as f:
            data = json.load(f)
    except (json.JSONDecodeError, IOError) as e:
        return {
            "file": filename,
            "status": "ERROR",
            "issues": [f"Could not parse: {e}"],
        }

    plant = data.get("plant", {})
    sn = plant.get("scientific_name")
    if not sn:
        issues.append("plant.scientific_name is null")

    raw = data.get("raw_responses", {})
    if not raw:
        issues.append("raw_responses is missing entirely")
        return {"file": filename, "status": "FAIL", "issues": issues}

    for key in REQUIRED_KEYS:
        val = raw.get(key)
        if val is None:
            issues.append(f"raw_responses.{key} is null — needs re-querying")
        elif not isinstance(val, str):
            issues.append(f"raw_responses.{key} is not a string (type: {type(val).__name__})")
        elif len(val.strip()) < MIN_RESPONSE_LENGTH:
            issues.append(f"raw_responses.{key} is suspiciously short ({len(val.strip())} chars)")

    return {
        "file": filename,
        "status": "FAIL" if issues else "PASS",
        "issues": issues,
    }


def main():
    files = sorted(glob.glob(os.path.join(RAW_DIR, "*.json")))

    if not files:
        print(f"⚠️  No files found in {RAW_DIR}/")
        sys.exit(1)

    results = []
    pass_count = 0
    fail_count = 0
    requery_plants = []

    for filepath in files:
        result = verify_raw_file(filepath)
        results.append(result)
        if result["status"] == "PASS":
            pass_count += 1
        else:
            fail_count += 1
            requery_plants.append(result["file"])

    # Print summary
    print(f"\n{'='*50}")
    print(f"  Raw Data Audit")
    print(f"  {len(files)} files scanned — {pass_count} PASS, {fail_count} FAIL")
    print(f"{'='*50}\n")

    for r in results:
        if r["status"] != "PASS":
            print(f"❌ {r['file']}")
            for issue in r["issues"]:
                print(f"   → {issue}")
            print()

    for r in results:
        if r["status"] == "PASS":
            print(f"✅ {r['file']}")

    if requery_plants:
        print(f"\n🔁 Plants needing re-collection ({len(requery_plants)}):")
        for p in requery_plants:
            print(f"   • {p}")

    sys.exit(1 if fail_count > 0 else 0)


if __name__ == "__main__":
    main()
