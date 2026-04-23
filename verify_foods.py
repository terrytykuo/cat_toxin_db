#!/usr/bin/env python3
import json
import os
import re
import glob
import sys
from datetime import datetime

PROCESSED_DIR = "data/foods_processed"
REPORT_PATH = "data/verification_report_food.json"

VALID_SEVERITIES = {"mild", "moderate", "severe", "fatal"}
VALID_BODY_SYSTEMS = {
    "gastrointestinal", "renal", "neurological", "cardiac",
    "dermal", "respiratory", "hepatic", "hematological",
    "endocrine", "metabolic", "musculoskeletal"
}

ARTIFACT_PATTERNS = [
    (r"Sources?:\s*[\d,]+", "trailing source references"),
    (r"Would you like me to", "chatbot artifact"),
    (r"EXTREMELY IMPORTANT", "NotebookLM UI artifact"),
    (r"============+", "separator artifact"),
    (r"📚|❓|✅|⏳|🌐|📤", "emoji UI artifact"),
]

def check_completeness(data, filename):
    issues = []
    plant = data.get("plant", {})

    cn = plant.get("common_name")
    if not cn or not cn.strip():
        issues.append("[COMPLETENESS] common_name is missing or empty")

    sn = plant.get("scientific_name")
    if not sn or not sn.strip():
        issues.append("[COMPLETENESS] scientific_name is null or empty")

    fam = plant.get("family")
    if not fam or not fam.strip():
        issues.append("[COMPLETENESS] family is missing")

    desc = plant.get("description")
    if not desc or len(desc.strip()) < 10:
        issues.append("[COMPLETENESS] description is missing or too short")

    if not data.get("toxic_parts"):
        issues.append("[COMPLETENESS] toxic_parts[] is empty")

    toxins = data.get("toxins", [])
    if not toxins:
        issues.append("[COMPLETENESS] toxins[] is empty")
    else:
        for i, t in enumerate(toxins):
            if not t.get("name"):
                issues.append(f"[COMPLETENESS] toxins[{i}] has no name")

    symptoms = data.get("symptoms", [])
    if not symptoms:
        issues.append("[COMPLETENESS] symptoms[] is empty")
    else:
        for i, s in enumerate(symptoms):
            if not s.get("name"):
                issues.append(f"[COMPLETENESS] symptoms[{i}] has no name")

    treatments = data.get("treatments", [])
    if not treatments:
        issues.append("[COMPLETENESS] treatments[] is empty")
    else:
        for i, t in enumerate(treatments):
            if not t.get("name"):
                issues.append(f"[COMPLETENESS] treatments[{i}] has no name")

    return issues

def check_schema(data, filename):
    issues = []
    plant = data.get("plant", {})

    for field, limit in [("common_name", 150), ("scientific_name", 200), ("family", 100)]:
        val = plant.get(field, "")
        if val and len(val) > limit:
            issues.append(f'[SCHEMA] plant.{field} exceeds {limit} chars ({len(val)} chars)')

    for i, s in enumerate(data.get("symptoms", [])):
        sev = s.get("severity", "")
        if sev and sev.strip().lower().rstrip(".") not in VALID_SEVERITIES:
            issues.append(f'[SCHEMA] symptoms[{i}].severity "{sev}" is not a valid enum (must be mild/moderate/severe/fatal)')
        
        bs = s.get("body_system", "")
        if bs and bs.strip().lower().rstrip(".") not in VALID_BODY_SYSTEMS:
            issues.append(f'[SCHEMA] symptoms[{i}].body_system "{bs}" is not a recognized system')
            
        if s.get("onset") and len(s["onset"]) > 100: issues.append(f'[SCHEMA] symptoms[{i}].onset > 100 chars')
        if s.get("name") and len(s["name"]) > 150: issues.append(f'[SCHEMA] symptoms[{i}].name > 150 chars')

    for i, t in enumerate(data.get("toxins", [])):
        cf = t.get("chemical_formula")
        if cf and len(cf) > 100: issues.append(f'[SCHEMA] toxins[{i}].chemical_formula > 100 chars')
        if t.get("name") and len(t["name"]) > 150: issues.append(f'[SCHEMA] toxins[{i}].name > 150 chars')

    for i, t in enumerate(data.get("treatments", [])):
        p = t.get("priority")
        if p is None or not isinstance(p, int) or p < 1:
            issues.append(f'[SCHEMA] treatments[{i}].priority "{p}" is not a valid int >= 1')
        if t.get("name") and len(t["name"]) > 200: issues.append(f'[SCHEMA] treatments[{i}].name > 200 chars')

    return issues

def check_cleanliness(data, filename):
    issues = []
    def collect_strings(obj, path=""):
        if isinstance(obj, str): yield (path, obj)
        elif isinstance(obj, dict):
            for k, v in obj.items(): yield from collect_strings(v, f"{path}.{k}" if path else k)
        elif isinstance(obj, list):
            for i, v in enumerate(obj): yield from collect_strings(v, f"{path}[{i}]")

    all_strings = list(collect_strings(data))
    for path, val in all_strings:
        for pattern, label in ARTIFACT_PATTERNS:
            if re.search(pattern, val):
                snippet = val[:60].replace("\n", "\\n")
                issues.append(f'[CLEANLINESS] {path} contains {label}: "{snippet}..."')
                break

    for section in ["toxins", "symptoms", "treatments"]:
        for i, item in enumerate(data.get(section, [])):
            name = item.get("name", "")
            if name and name.rstrip().endswith("."):
                issues.append(f'[CLEANLINESS] {section}[{i}].name ends with a period')

    return issues


def verify_file(filepath):
    filename = os.path.basename(filepath)
    try:
        with open(filepath, "r") as f: data = json.load(f)
    except Exception as e:
        return {"file": filename, "status": "ERROR", "issues": [f"[ERROR] {e}"]}

    issues = check_completeness(data, filename) + check_schema(data, filename) + check_cleanliness(data, filename)
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
