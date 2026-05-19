#!/usr/bin/env python3
"""
verify_plants.py — Audit processed plant JSON files for data quality.

Scans data/plants_processed/ and runs 3 tiers of checks:
  1. Completeness  — are all required sections present?
  2. Schema        — do values conform to the DB schema?
  3. Cleanliness   — are values free of parsing artifacts?

Outputs:
  - data/verification_report.json  (machine-readable)
  - Human-readable summary to stdout
"""

import json
import os
import glob
import sys
from datetime import datetime

from paths import PROCESSED_PLANTS_DIR, DATA_DIR
from verify_common import check_cleanliness, check_completeness, check_schema, normalize_record

PROCESSED_DIR = str(PROCESSED_PLANTS_DIR)
REPORT_PATH = str(DATA_DIR / "verification_report.json")


def verify_file(filepath):
    """Run all verification tiers on a single file."""
    filename = os.path.basename(filepath)

    try:
        with open(filepath, "r") as f:
            data = json.load(f)
    except (json.JSONDecodeError, IOError) as e:
        return {
            "file": filename,
            "status": "ERROR",
            "issues": [f"[ERROR] Could not parse file: {e}"],
        }

    normalized = normalize_record(data)

    issues = []
    issues.extend(check_completeness(normalized, require_binomial=True, min_description_len=20))
    issues.extend(check_schema(normalized, validate_toxic_parts=True))
    issues.extend(check_cleanliness(normalized))

    return {
        "file": filename,
        "status": "FAIL" if issues else "PASS",
        "issue_count": len(issues),
        "issues": issues,
    }


def main():
    files = sorted(glob.glob(os.path.join(PROCESSED_DIR, "*.json")))

    if not files:
        print(f"⚠️  No files found in {PROCESSED_DIR}/")
        sys.exit(1)

    results = []
    pass_count = 0
    fail_count = 0

    for filepath in files:
        result = verify_file(filepath)
        results.append(result)
        if result["status"] == "PASS":
            pass_count += 1
        else:
            fail_count += 1

    # Write JSON report
    report = {
        "generated_at": datetime.now().isoformat(),
        "total_files": len(files),
        "passed": pass_count,
        "failed": fail_count,
        "results": results,
    }

    os.makedirs(os.path.dirname(REPORT_PATH), exist_ok=True)
    with open(REPORT_PATH, "w") as f:
        json.dump(report, f, indent=2)

    # Print human-readable summary
    print(f"\n{'='*50}")
    print(f"  Data Verification Report")
    print(f"  {len(files)} files scanned — {pass_count} PASS, {fail_count} FAIL")
    print(f"{'='*50}\n")

    # Show failures first
    for r in results:
        if r["status"] != "PASS":
            print(f"❌ {r['file']} ({r['issue_count']} issues)")
            for issue in r["issues"]:
                print(f"   {issue}")
            print()

    # Then passes
    for r in results:
        if r["status"] == "PASS":
            print(f"✅ {r['file']} — PASS")

    print(f"\n📄 Full report saved to {REPORT_PATH}")

    # Exit with non-zero if any failures
    sys.exit(1 if fail_count > 0 else 0)


if __name__ == "__main__":
    main()
