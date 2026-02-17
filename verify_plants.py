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
import re
import glob
import sys
from datetime import datetime

PROCESSED_DIR = "data/plants_processed"
REPORT_PATH = "data/verification_report.json"

# --- Valid values ---
VALID_SEVERITIES = {"mild", "moderate", "severe", "fatal"}
VALID_TOXIC_PARTS = {
    "Leaf", "Bulb", "Flower", "Pollen", "Stem", "Root", "Seed",
    "Bark", "Sap", "Latex", "Fruit", "Berry", "Entire Plant"
}
VALID_BODY_SYSTEMS = {
    "gastrointestinal", "renal", "neurological", "cardiac",
    "dermal", "respiratory", "hepatic", "hematological",
    "endocrine", "metabolic", "musculoskeletal"
}

# --- Patterns that indicate dirty data ---
ARTIFACT_PATTERNS = [
    (r"Sources?:\s*[\d,]+", "trailing source references"),
    (r"Would you like me to", "chatbot artifact"),
    (r"EXTREMELY IMPORTANT", "NotebookLM UI artifact"),
    (r"============+", "separator artifact"),
    (r"📚|❓|✅|⏳|🌐|📤", "emoji UI artifact"),
    (r"Loaded library with \d+ notebooks", "script log artifact"),
]

HEADER_LABELS = [
    "botanical family", "brief description", "description",
    "symptom name", "treatment name", "name of the compound",
    "affected body system", "severity", "typical onset time",
]

# --- Column length limits from schema.sql ---
LENGTH_LIMITS = {
    "common_name": 150,
    "scientific_name": 200,
    "family": 100,
    "symptom_name": 150,
    "toxin_name": 150,
    "treatment_name": 200,
    "body_system": 100,
    "onset": 100,
    "toxic_part_name": 50,
    "chemical_formula": 100,
    "source_title": 300,
}


def check_completeness(data, filename):
    """Tier 1: Are all required sections present and non-empty?"""
    issues = []
    plant = data.get("plant", {})

    # Plant identity
    cn = plant.get("common_name")
    if not cn or not cn.strip():
        issues.append("[COMPLETENESS] common_name is missing or empty")

    sn = plant.get("scientific_name")
    if not sn or not sn.strip():
        issues.append("[COMPLETENESS] scientific_name is null or empty")
    elif sn.strip().lower() == "n/a":
        issues.append("[COMPLETENESS] scientific_name is 'N/A' — needs a real binomial")
    elif len(sn.split()) < 2 and "spp" not in sn.lower():
        issues.append(f'[COMPLETENESS] scientific_name "{sn}" does not look like a binomial')

    fam = plant.get("family")
    if not fam or not fam.strip():
        issues.append("[COMPLETENESS] family is missing")

    desc = plant.get("description")
    if not desc or len(desc.strip()) < 20:
        issues.append("[COMPLETENESS] description is missing or too short (< 20 chars)")

    # Data arrays
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
    """Tier 2: Do values conform to the DB schema constraints?"""
    issues = []
    plant = data.get("plant", {})

    # Length checks on plant fields
    for field, limit in [("common_name", 150), ("scientific_name", 200), ("family", 100)]:
        val = plant.get(field, "")
        if val and len(val) > limit:
            issues.append(f'[SCHEMA] plant.{field} exceeds {limit} chars ({len(val)} chars)')

    # Toxic parts: must be singular capitalized from known set
    for part in data.get("toxic_parts", []):
        if part not in VALID_TOXIC_PARTS:
            issues.append(f'[SCHEMA] toxic_part "{part}" is not in the valid set')

    # Symptoms: severity must be an enum
    for i, s in enumerate(data.get("symptoms", [])):
        sev = s.get("severity", "")
        if sev:
            normalized = sev.strip().lower().rstrip(".")
            if normalized not in VALID_SEVERITIES:
                issues.append(f'[SCHEMA] symptoms[{i}].severity "{sev}" is not a valid enum (must be mild/moderate/severe/fatal)')

        # Body system should be from known set
        bs = s.get("body_system", "")
        if bs:
            bs_clean = bs.strip().lower().rstrip(".")
            if bs_clean not in VALID_BODY_SYSTEMS:
                issues.append(f'[SCHEMA] symptoms[{i}].body_system "{bs}" is not a recognized system')

        # Onset length
        onset = s.get("onset", "")
        if onset and len(onset) > 100:
            issues.append(f'[SCHEMA] symptoms[{i}].onset exceeds 100 chars ({len(onset)} chars)')

        # Symptom name length
        name = s.get("name", "")
        if name and len(name) > 150:
            issues.append(f'[SCHEMA] symptoms[{i}].name exceeds 150 chars ({len(name)} chars)')

    # Toxins: chemical_formula should be null or short
    for i, t in enumerate(data.get("toxins", [])):
        cf = t.get("chemical_formula")
        if cf and len(cf) > 100:
            issues.append(f'[SCHEMA] toxins[{i}].chemical_formula exceeds 100 chars')
        if cf and len(cf) > 30 and not re.match(r'^[A-Za-z0-9()\[\]{}\s,\-\.]+$', cf):
            issues.append(f'[SCHEMA] toxins[{i}].chemical_formula looks like prose, not a formula')

        name = t.get("name", "")
        if name and len(name) > 150:
            issues.append(f'[SCHEMA] toxins[{i}].name exceeds 150 chars ({len(name)} chars)')

    # Treatments: priority must be int >= 1
    for i, t in enumerate(data.get("treatments", [])):
        p = t.get("priority")
        if p is None:
            issues.append(f"[SCHEMA] treatments[{i}] has no priority")
        elif not isinstance(p, int) or p < 1:
            issues.append(f'[SCHEMA] treatments[{i}].priority "{p}" is not a valid int >= 1')

        name = t.get("name", "")
        if name and len(name) > 200:
            issues.append(f'[SCHEMA] treatments[{i}].name exceeds 200 chars ({len(name)} chars)')

    return issues


def check_cleanliness(data, filename):
    """Tier 3: Are values free of parsing artifacts and noise?"""
    issues = []
    plant = data.get("plant", {})

    # Collect all string values to scan for artifacts
    def collect_strings(obj, path=""):
        """Yield (path, value) for all string values in a nested structure."""
        if isinstance(obj, str):
            yield (path, obj)
        elif isinstance(obj, dict):
            for k, v in obj.items():
                yield from collect_strings(v, f"{path}.{k}" if path else k)
        elif isinstance(obj, list):
            for i, v in enumerate(obj):
                yield from collect_strings(v, f"{path}[{i}]")

    all_strings = list(collect_strings(data))

    # Check for artifact patterns in all string values
    for path, val in all_strings:
        for pattern, label in ARTIFACT_PATTERNS:
            if re.search(pattern, val):
                # Truncate for display
                snippet = val[:60].replace("\n", "\\n")
                issues.append(f'[CLEANLINESS] {path} contains {label}: "{snippet}..."')
                break  # one artifact flag per field is enough

    # Family-specific: should be a short taxonomic name, not a sentence
    fam = plant.get("family", "")
    if fam:
        if len(fam) > 40:
            issues.append(f'[CLEANLINESS] family is too long ({len(fam)} chars) — should be a taxonomic family name')
        if "." in fam and len(fam) > 20:
            issues.append(f'[CLEANLINESS] family contains full stops — looks like prose')
        fam_lower = fam.lower().strip()
        for label in HEADER_LABELS:
            if fam_lower == label or fam_lower.startswith(label):
                issues.append(f'[CLEANLINESS] family "{fam}" looks like a header label, not a real value')
                break

    # Names ending with periods
    for section in ["toxins", "symptoms", "treatments"]:
        for i, item in enumerate(data.get(section, [])):
            name = item.get("name", "")
            if name and name.rstrip().endswith("."):
                issues.append(f'[CLEANLINESS] {section}[{i}].name ends with a period: "{name[:50]}..."')

    # Onset field containing trailing numbering (e.g. "\n5. Additional")
    for i, s in enumerate(data.get("symptoms", [])):
        onset = s.get("onset", "")
        if onset and re.search(r"\n\d+\.\s", onset):
            issues.append(f'[CLEANLINESS] symptoms[{i}].onset contains trailing numbered item')

    # Chemical formula that is actually prose
    for i, t in enumerate(data.get("toxins", [])):
        cf = t.get("chemical_formula", "")
        if cf and cf.lower().startswith("not specified"):
            issues.append(f'[CLEANLINESS] toxins[{i}].chemical_formula is prose "{cf[:40]}..." — should be null')

    return issues


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

    issues = []
    issues.extend(check_completeness(data, filename))
    issues.extend(check_schema(data, filename))
    issues.extend(check_cleanliness(data, filename))

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
