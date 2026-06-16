#!/usr/bin/env python3
import json
import os
import glob
import sys
from datetime import datetime

from paths import PROCESSED_FOODS_DIR, VERIFICATION_REPORT_FOOD
from verify_common import check_cleanliness, check_completeness, check_schema, normalize_record

PROCESSED_DIR = str(PROCESSED_FOODS_DIR)
REPORT_PATH = str(VERIFICATION_REPORT_FOOD)


def verify_file(filepath):
    filename = os.path.basename(filepath)
    try:
        with open(filepath, "r") as f: data = json.load(f)
    except Exception as e:
        return {"file": filename, "status": "ERROR", "issues": [f"[ERROR] {e}"]}

    normalized = normalize_record(data)
    issues = (
        check_completeness(normalized, require_binomial=False, min_description_len=10)
        + check_schema(normalized, validate_toxic_parts=False)
        + check_cleanliness(normalized)
    )
    return {"file": filename, "status": "FAIL" if issues else "PASS", "issue_count": len(issues), "issues": issues}

def main():
    if not os.path.exists(PROCESSED_DIR):
        os.makedirs(PROCESSED_DIR)
        print(f"⚠️  No files found in {PROCESSED_DIR}/")
        sys.exit(0)

    files = sorted(glob.glob(os.path.join(PROCESSED_DIR, "*.json")))
    if not files:
        print(f"⚠️  No files found in {PROCESSED_DIR}/")
        sys.exit(0)

    results = []
    for filepath in files: results.append(verify_file(filepath))

    pass_count = sum(1 for r in results if r["status"] == "PASS")
    fail_count = len(files) - pass_count

    report = {
        "generated_at": datetime.now().isoformat(),
        "total_files": len(files),
        "passed": pass_count,
        "failed": fail_count,
        "results": results,
    }
    with open(REPORT_PATH, "w") as f: json.dump(report, f, indent=2)

    print(f"\n==================================================")
    print(f"  Food Data Verification Report")
    print(f"  {len(files)} files scanned — {pass_count} PASS, {fail_count} FAIL")
    print(f"==================================================\n")

    for r in results:
        if r["status"] != "PASS":
            print(f"❌ {r['file']} ({r['issue_count']} issues)")
            for issue in r["issues"]: print(f"   {issue}")
            print()

    for r in results:
        if r["status"] == "PASS": print(f"✅ {r['file']} — PASS")

    print(f"\n📄 Full report saved to {REPORT_PATH}")
    sys.exit(1 if fail_count > 0 else 0)

if __name__ == "__main__":
    main()
