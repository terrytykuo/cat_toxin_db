#!/usr/bin/env python3
"""Shared helpers for verifying processed plant/food JSON files."""

from __future__ import annotations

import re

VALID_SEVERITIES = {"mild", "moderate", "severe", "fatal"}
VALID_BODY_SYSTEMS = {
    "gastrointestinal",
    "renal",
    "neurological",
    "cardiac",
    "dermal",
    "respiratory",
    "hepatic",
    "hematological",
    "endocrine",
    "metabolic",
    "musculoskeletal",
}
VALID_TOXIC_PARTS = {
    "Leaf",
    "Peel",
    "Bulb",
    "Flower",
    "Pollen",
    "Stem",
    "Root",
    "Seed",
    "Bark",
    "Sap",
    "Latex",
    "Fruit",
    "Berry",
    "Essential Oil",
    "Entire Plant",
}
TOXIC_PART_ALIASES = {
    "Leaves": "Leaf",
    "Flowers": "Flower",
    "Stems": "Stem",
    "Roots": "Root",
    "Seeds": "Seed",
    "Berries": "Berry",
}
ARTIFACT_PATTERNS = [
    (r"Sources?:\s*[\d,]+", "trailing source references"),
    (r"Would you like me to", "chatbot artifact"),
    (r"EXTREMELY IMPORTANT", "NotebookLM UI artifact"),
    (r"============+", "separator artifact"),
    (r"📚|❓|✅|⏳|🌐|📤", "emoji UI artifact"),
    (r"Loaded library with \d+ notebooks", "script log artifact"),
]
HEADER_LABELS = [
    "botanical family",
    "brief description",
    "description",
    "symptom name",
    "treatment name",
    "name of the compound",
    "affected body system",
    "severity",
    "typical onset time",
]


def normalize_record(data: dict) -> dict:
    """Project legacy and Firestore-mirror records onto one verification shape."""
    if "plant" in data:
        plant = data.get("plant", {})
        toxic_parts = data.get("toxic_parts", [])
        toxins = data.get("toxins", [])
    else:
        plant = {
            "common_name": data.get("name"),
            "scientific_name": data.get("scientific_name"),
            "family": data.get("family"),
            "description": data.get("description"),
        }
        toxic_parts = data.get("toxicParts", [])
        toxins = data.get("chemicals", [])

    return {
        "plant": plant,
        "toxic_parts": toxic_parts,
        "toxins": toxins,
        "symptoms": data.get("symptoms", []),
        "treatments": data.get("treatments", []),
    }


def check_completeness(data: dict, *, require_binomial: bool, min_description_len: int) -> list[str]:
    issues: list[str] = []
    plant = data.get("plant", {})

    cn = plant.get("common_name")
    if not cn or not str(cn).strip():
        issues.append("[COMPLETENESS] common_name is missing or empty")

    sn = plant.get("scientific_name")
    if not sn or not str(sn).strip():
        issues.append("[COMPLETENESS] scientific_name is null or empty")
    elif require_binomial:
        sn_text = str(sn).strip()
        if sn_text.lower() == "n/a":
            issues.append("[COMPLETENESS] scientific_name is 'N/A' — needs a real binomial")
        elif len(sn_text.split()) < 2 and "spp" not in sn_text.lower():
            issues.append(f'[COMPLETENESS] scientific_name "{sn_text}" does not look like a binomial')

    fam = plant.get("family")
    if not fam or not str(fam).strip():
        issues.append("[COMPLETENESS] family is missing")

    desc = plant.get("description")
    if not desc or len(str(desc).strip()) < min_description_len:
        issues.append(f"[COMPLETENESS] description is missing or too short (< {min_description_len} chars)")

    if not data.get("toxic_parts"):
        issues.append("[COMPLETENESS] toxic_parts[] is empty")

    toxins = data.get("toxins", [])
    if not toxins:
        issues.append("[COMPLETENESS] toxins[] is empty")
    else:
        for i, toxin in enumerate(toxins):
            if not toxin.get("name"):
                issues.append(f"[COMPLETENESS] toxins[{i}] has no name")

    symptoms = data.get("symptoms", [])
    if not symptoms:
        issues.append("[COMPLETENESS] symptoms[] is empty")
    else:
        for i, symptom in enumerate(symptoms):
            if not symptom.get("name"):
                issues.append(f"[COMPLETENESS] symptoms[{i}] has no name")

    treatments = data.get("treatments", [])
    if not treatments:
        issues.append("[COMPLETENESS] treatments[] is empty")
    else:
        for i, treatment in enumerate(treatments):
            if not treatment.get("name"):
                issues.append(f"[COMPLETENESS] treatments[{i}] has no name")

    return issues


def check_schema(data: dict, *, validate_toxic_parts: bool) -> list[str]:
    issues: list[str] = []
    plant = data.get("plant", {})

    for field, limit in [("common_name", 150), ("scientific_name", 200), ("family", 100)]:
        value = plant.get(field, "")
        if value and len(str(value)) > limit:
            issues.append(f"[SCHEMA] plant.{field} exceeds {limit} chars ({len(str(value))} chars)")

    if validate_toxic_parts:
        for part in data.get("toxic_parts", []):
            canonical_part = TOXIC_PART_ALIASES.get(part, part)
            if canonical_part not in VALID_TOXIC_PARTS:
                issues.append(f'[SCHEMA] toxic_part "{part}" is not in the valid set')

    for i, symptom in enumerate(data.get("symptoms", [])):
        severity = symptom.get("severity", "")
        if severity:
            normalized = str(severity).strip().lower().rstrip(".")
            if normalized not in VALID_SEVERITIES:
                issues.append(
                    f'[SCHEMA] symptoms[{i}].severity "{severity}" is not a valid enum (must be mild/moderate/severe/fatal)'
                )

        body_system = symptom.get("body_system", "")
        if body_system:
            normalized = str(body_system).strip().lower().rstrip(".")
            if normalized not in VALID_BODY_SYSTEMS:
                issues.append(f'[SCHEMA] symptoms[{i}].body_system "{body_system}" is not a recognized system')

        onset = symptom.get("onset", "")
        if onset and len(str(onset)) > 100:
            issues.append(f"[SCHEMA] symptoms[{i}].onset exceeds 100 chars ({len(str(onset))} chars)")

        name = symptom.get("name", "")
        if name and len(str(name)) > 150:
            issues.append(f"[SCHEMA] symptoms[{i}].name exceeds 150 chars ({len(str(name))} chars)")

    for i, toxin in enumerate(data.get("toxins", [])):
        chemical_formula = toxin.get("chemical_formula")
        if chemical_formula and len(str(chemical_formula)) > 100:
            issues.append(f"[SCHEMA] toxins[{i}].chemical_formula exceeds 100 chars")
        if chemical_formula and len(str(chemical_formula)) > 30 and not re.match(
            r"^[A-Za-z0-9()\[\]{}\s,\-\.]+$", str(chemical_formula)
        ):
            issues.append(f"[SCHEMA] toxins[{i}].chemical_formula looks like prose, not a formula")

        name = toxin.get("name", "")
        if name and len(str(name)) > 150:
            issues.append(f"[SCHEMA] toxins[{i}].name exceeds 150 chars ({len(str(name))} chars)")

    for i, treatment in enumerate(data.get("treatments", [])):
        priority = treatment.get("priority")
        if priority is None:
            issues.append(f"[SCHEMA] treatments[{i}] has no priority")
        elif not isinstance(priority, int) or priority < 1:
            issues.append(f'[SCHEMA] treatments[{i}].priority "{priority}" is not a valid int >= 1')

        name = treatment.get("name", "")
        if name and len(str(name)) > 200:
            issues.append(f"[SCHEMA] treatments[{i}].name exceeds 200 chars ({len(str(name))} chars)")

    return issues


def check_cleanliness(data: dict) -> list[str]:
    issues: list[str] = []
    plant = data.get("plant", {})

    def collect_strings(obj, path=""):
        if isinstance(obj, str):
            yield (path, obj)
        elif isinstance(obj, dict):
            for key, value in obj.items():
                next_path = f"{path}.{key}" if path else key
                yield from collect_strings(value, next_path)
        elif isinstance(obj, list):
            for i, value in enumerate(obj):
                yield from collect_strings(value, f"{path}[{i}]")

    for path, value in collect_strings(data):
        for pattern, label in ARTIFACT_PATTERNS:
            if re.search(pattern, value):
                snippet = value[:60].replace("\n", "\\n")
                issues.append(f'[CLEANLINESS] {path} contains {label}: "{snippet}..."')
                break

    family = plant.get("family", "")
    if family:
        family_text = str(family)
        if len(family_text) > 40:
            issues.append(f"[CLEANLINESS] family is too long ({len(family_text)} chars) — should be a taxonomic family name")
        if "." in family_text and len(family_text) > 20:
            issues.append("[CLEANLINESS] family contains full stops — looks like prose")

        family_lower = family_text.lower().strip()
        for label in HEADER_LABELS:
            if family_lower == label or family_lower.startswith(label):
                issues.append(f'[CLEANLINESS] family "{family_text}" looks like a header label, not a real value')
                break

    for section in ["toxins", "symptoms", "treatments"]:
        for i, item in enumerate(data.get(section, [])):
            name = item.get("name", "")
            if name and str(name).rstrip().endswith("."):
                issues.append(f'[CLEANLINESS] {section}[{i}].name ends with a period: "{str(name)[:50]}..."')

    for i, symptom in enumerate(data.get("symptoms", [])):
        onset = symptom.get("onset", "")
        if onset and re.search(r"\n\d+\.\s", str(onset)):
            issues.append(f"[CLEANLINESS] symptoms[{i}].onset contains trailing numbered item")

    for i, toxin in enumerate(data.get("toxins", [])):
        chemical_formula = toxin.get("chemical_formula", "")
        if chemical_formula and str(chemical_formula).lower().startswith("not specified"):
            issues.append(
                f'[CLEANLINESS] toxins[{i}].chemical_formula is prose "{str(chemical_formula)[:40]}..." — should be null'
            )

    return issues
