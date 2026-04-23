import json
import os
import re
import glob

from paths import RAW_FOODS_DIR, PROCESSED_FOODS_DIR

INPUT_DIR = str(RAW_FOODS_DIR)
OUTPUT_DIR = str(PROCESSED_FOODS_DIR)

KNOWN_PARTS = [
    "leaf", "leaves", "bulb", "bulbs", "flower", "flowers", "pollen", 
    "stem", "stems", "root", "roots", "seed", "seeds", "bark", "sap", "latex", 
    "fruit", "fruits", "berry", "berries", "entire plant", "whole plant",
    "skin", "pits", "raw form", "cooked form", "entire food", "powder",
    "flesh", "juice", "peel"
]

VALID_SEVERITIES = {"mild", "moderate", "severe", "fatal"}
SEVERITY_RANK = {"mild": 1, "moderate": 2, "severe": 3, "fatal": 4}

BODY_SYSTEM_MAP = {
    "gastrointestinal": "Gastrointestinal",
    "gi": "Gastrointestinal",
    "renal": "Renal",
    "kidney": "Renal",
    "neurological": "Neurological",
    "nervous": "Neurological",
    "cns": "Neurological",
    "cardiac": "Cardiac",
    "heart": "Cardiac",
    "dermal": "Dermal",
    "skin": "Dermal",
    "respiratory": "Respiratory",
    "hepatic": "Hepatic",
    "liver": "Hepatic",
    "hematological": "Hematological",
    "blood": "Hematological",
    "endocrine": "Endocrine",
    "metabolic": "Metabolic",
    "musculoskeletal": "Musculoskeletal"
}

def clean_text(text):
    if not text:
        return None
    return re.sub(r'^["\']|["\']$', '', text.strip())

def strip_header(text):
    if not text:
        return ""
    if "============================================================" in text:
        return text.split("============================================================")[-1].strip()
    return text

def strip_source_refs(text):
    if not text:
        return text
    text = re.sub(r'[\n\r]\s*[•◦\-\*]?\s*Sources?\s*:\s*[\d,\s\.]+\s*$', '', text, flags=re.IGNORECASE)
    text = re.sub(r'\s*Sources?\s*:\s*[\d,\s\.]+\s*$', '', text, flags=re.IGNORECASE)
    text = re.sub(r'(?<=[a-zA-Z\)\]])[\d,]+\s*$', '', text)
    text = re.sub(r"Would you like me to.*", "", text, flags=re.IGNORECASE)
    text = re.sub(r'\n\s*-{3,}.*$', '', text, flags=re.DOTALL)
    text = re.sub(r'[\n\r]\s*◦\s*(?:Highest |Distribution|Concentration).*$', '', text, flags=re.DOTALL)
    text = re.sub(r'The provided text does not contain.*$', '', text, flags=re.IGNORECASE | re.DOTALL)
    text = re.sub(r'[\d,]+\.+\s*$', '', text.rstrip())
    return text.strip()

def clean_toxin_name(val):
    if not val:
        return None
    val = strip_source_refs(val)
    val = re.sub(r'^\d+\.\s*', '', val)
    return val

def clean_concentration_notes(val):
    if not val:
        return val
    val = re.sub(r'\n\d+\.\s.*$', '', val, flags=re.DOTALL)
    return strip_source_refs(val)

def strip_trailing_period(val):
    if not val:
        return val
    val = val.replace('…', '...').replace('．', '.')
    val = re.sub(r'[\d,]+\.+\s*$', '', val.rstrip())
    return re.sub(r'[^\w)]+$', '', val).strip()

def clean_name(name, max_len=150):
    if not name or len(name) <= max_len:
        return name
    truncated = name[:max_len]
    for sep in [' (', ', ', ' — ', ' - ']:
        idx = truncated.rfind(sep)
        if idx > 20: return truncated[:idx].rstrip()
    return truncated.rstrip()

def normalize_severity(val):
    if not val:
        return None
    cleaned = val.strip().lower().rstrip('.')
    if cleaned in VALID_SEVERITIES:
        return cleaned
    found = [sev for sev in VALID_SEVERITIES if sev in cleaned]
    if found:
        return max(found, key=lambda s: SEVERITY_RANK[s])
    return None

def normalize_body_system(val):
    if not val:
        return None
    cleaned = val.strip().rstrip('.')
    if cleaned.lower() in BODY_SYSTEM_MAP:
        return BODY_SYSTEM_MAP[cleaned.lower()]
    for part in re.split(r'[/,]', cleaned):
        part_clean = re.sub(r'\(.*?\)', '', part.strip().lower()).strip()
        if part_clean in BODY_SYSTEM_MAP:
            return BODY_SYSTEM_MAP[part_clean]
        for key, canonical in BODY_SYSTEM_MAP.items():
            if key in part_clean:
                return canonical
    for key, canonical in BODY_SYSTEM_MAP.items():
        if key in cleaned.lower():
            return canonical
    return cleaned

def clean_family(val):
    if not val:
        return None
    stripped = val.strip()
    fam_extract = re.search(r'(?:belongs?\s+to\s+(?:the\s+)?(?:family\s+)?|family[:\s]+)([A-Z][a-z]+(?:aceae|idae|ales|eae|ium))', stripped)
    if fam_extract: return fam_extract.group(1)
    if len(stripped) <= 60 and '.' not in stripped:
        cleaned = re.sub(r'\d+$', '', stripped).strip()
        if cleaned: return cleaned
    return "Various"

def clean_chemical_formula(val):
    if not val: return None
    cleaned = val.strip()
    if cleaned.lower().startswith('not specified') or cleaned.lower().startswith('n/a') or cleaned.lower() == 'unknown':
        return None
    if len(cleaned) > 40 and len(cleaned.split()) > 3:
        return None
    return cleaned

def clean_onset(val):
    if not val: return val
    val = re.sub(r'\n\d+\.\s.*$', '', val, flags=re.DOTALL)
    val = strip_source_refs(val.strip())
    if len(val) > 100:
        truncated = val[:100]
        for sep in ['. ', ', ', ' — ', ' - ', '; ']:
            idx = truncated.rfind(sep)
            if idx > 20: return truncated[:idx + 1].rstrip()
        return truncated.rstrip()
    return val

# Parsers
def parse_basics(text):
    text = strip_header(text)
    data = {}
    fam_match = re.search(r"(?:1\.\s*Botanical Family:|Category:|Family:|1\.)\s*(.*?)(?:2\.|Brief Description:|Description:|$)", text, re.IGNORECASE | re.DOTALL)
    if fam_match:
        val = clean_text(fam_match.group(1))
        data["family"] = re.sub(r"^:\s*", "", val)
    desc_match = re.search(r"(?:2\.|Brief Description:|Description:)\s*(.*)", text, re.IGNORECASE | re.DOTALL)
    if desc_match:
        val = clean_text(desc_match.group(1))
        data["description"] = re.sub(r"^:\s*", "", val)
    return data

def parse_toxic_parts(text):
    text = strip_header(text)
    parts = set()
    lower_text = text.lower()
    for known in KNOWN_PARTS:
        if known in lower_text:
            parts.add(known.capitalize())
            
    # For foods, maybe some arbitrary list is provided by NotebookLM
    # If the standard ones aren't found, try to extract comma-separated values if short
    if not parts and len(text) < 200 and "\n" not in text:
        extracted = [p.strip().capitalize() for p in text.split(",") if 2 < len(p.strip()) < 30]
        for e in extracted:
            parts.add(e)
            
    # Normalize plurals to singular if simple
    normalized = set()
    for p in parts:
        if p.endswith("s") and p != "Citrus":
            normalized.add(p[:-1])
        else:
            normalized.add(p)
            
    return list(normalized) if normalized else ["Entire Plant"]

def parse_toxins(text):
    text = strip_header(text)
    toxins = []
    blocks = re.split(r'\n\s*[\*\-]?\s*(?:\*\*)?Toxin\s*\d*(?:\*\*|\:)?\s*', text, flags=re.IGNORECASE)
    if len(blocks) < 2:
        blocks = re.split(r'\n\s*\d+\.\s+(?:\*\*)?', text)
    
    for block in blocks:
        if not block.strip(): continue
        t = {}
        name_m = re.match(r'^([^*:\n]+).*?(?:\n|$)', block)
        if name_m: t["name"] = name_m.group(1).strip()
        
        formula_m = re.search(r'(?:Chemical formula|Formula)[:\s]+([^:\n]+)', block, re.IGNORECASE)
        t["chemical_formula"] = formula_m.group(1).strip() if formula_m else None
        
        desc_m = re.search(r'(?:Mechanism of action|Mechanism)[:\s]+(.*?)(?:\n\s*Notes|\n\s*\d+\.|$)', block, re.IGNORECASE | re.DOTALL)
        if desc_m: t["description"] = desc_m.group(1).strip()
        
        notes_m = re.search(r'(?:Notes on concentration|Notes)[:\s]+(.*)', block, re.IGNORECASE | re.DOTALL)
        if notes_m: t["concentration_notes"] = notes_m.group(1).strip()
        
        if "name" in t and len(t["name"]) > 2:
            toxins.append(t)
            
    # Fallback to entire block if structural parsing failed entirely
    if not toxins and len(text.strip()) > 10:
        toxins.append({"name": clean_name(strip_trailing_period(strip_source_refs(text.split("\n")[0]))), "description": text.strip()})
        
    return toxins

def parse_symptoms(text):
    text = strip_header(text)
    symptoms = []
    blocks = re.split(r'\n\s*\d+\.\s+(?:\*\*)?', text)
    for block in blocks:
        if not block.strip(): continue
        s = {}
        name_m = re.match(r'^([^*:\n]+).*?(?:\n|$)', block)
        if name_m: s["name"] = name_m.group(1).strip()
        
        system_m = re.search(r'(?:Affected body system|Body system|System)[:\s]+([^:\n]+)', block, re.IGNORECASE)
        s["body_system"] = normalize_body_system(system_m.group(1).strip()) if system_m else "Metabolic"
        
        sev_m = re.search(r'(?:Severity)[:\s]+([^:\n]+)', block, re.IGNORECASE)
        s["severity"] = sev_m.group(1).strip() if sev_m else "moderate"
        
        onset_m = re.search(r'(?:Typical onset time|Onset)[:\s]+([^:\n]+)', block, re.IGNORECASE)
        s["onset"] = onset_m.group(1).strip() if onset_m else None
        
        notes_m = re.search(r'(?:Additional clinical notes|Notes)[:\s]+(.*)', block, re.IGNORECASE | re.DOTALL)
        if notes_m: s["notes"] = notes_m.group(1).strip()
        

        if "name" in s and len(s["name"]) > 2:
            symptoms.append(s)
            
    return symptoms

def parse_treatments(text):
    text = strip_header(text)
    treatments = []
    blocks = re.split(r'\n\s*\d+\.\s+(?:\*\*)?', text)
    priority = 1
    for block in blocks:
        if not block.strip(): continue
        t = {}
        name_m = re.match(r'^([^*:\n]+).*?(?:\n|$)', block)
        if name_m: t["name"] = name_m.group(1).strip()
        
        desc_m = re.search(r'(?:Brief description|Description|Procedure)[:\s]+(.*?)(?:\n\s*Situation|Notes|$)', block, re.IGNORECASE | re.DOTALL)
        if desc_m: t["description"] = desc_m.group(1).strip()
        
        notes_m = re.search(r'(?:Situation-specific notes|Notes)[:\s]+(.*)', block, re.IGNORECASE | re.DOTALL)
        if notes_m: t["notes"] = notes_m.group(1).strip()
        
        if "name" in t and len(t["name"]) > 2:
            t["priority"] = priority
            priority += 1
            treatments.append(t)
    return treatments

def main():
    if not os.path.exists(OUTPUT_DIR):
        os.makedirs(OUTPUT_DIR)

    files = glob.glob(os.path.join(INPUT_DIR, "*.json"))
    print(f"🔄 Processing {len(files)} generated responses...")

    for fp in files:
        with open(fp, "r") as f:
            data = json.load(f)

        raw = data.get("raw_responses", {})
        processed = {
            "plant": data.get("plant", {}),
            "sources": []
        }

        processed.update(parse_basics(raw.get("basics", "")))
        processed["toxic_parts"] = parse_toxic_parts(raw.get("toxic_parts", ""))
        processed["toxins"] = parse_toxins(raw.get("toxins", ""))
        processed["symptoms"] = parse_symptoms(raw.get("symptoms", ""))
        processed["treatments"] = parse_treatments(raw.get("treatments", ""))

        processed["plant"]["family"] = clean_family(processed.get("family", data["plant"].get("family")))
        if "family" in processed: del processed["family"]
        processed["plant"]["description"] = processed.get("description", strip_source_refs(processed.get("plant", {}).get("description")))
        if "description" in processed: del processed["description"]

        for t in processed["toxins"]:
            t["name"] = strip_trailing_period(clean_name(clean_toxin_name(t.get("name")), 150))
            t["chemical_formula"] = clean_chemical_formula(t.get("chemical_formula"))
            t["description"] = strip_source_refs(t.get("description"))
            t["concentration_notes"] = clean_concentration_notes(t.get("concentration_notes"))

        for s in processed["symptoms"]:
            s["name"] = clean_name(strip_trailing_period(strip_source_refs(s.get("name"))), 150)
            s["severity"] = normalize_severity(s.get("severity")) or "moderate"
            s["body_system"] = s.get("body_system", "Metabolic")
            s["onset"] = clean_onset(s.get("onset"))
            s["notes"] = strip_source_refs(s.get("notes"))

        for t in processed["treatments"]:
            t["name"] = clean_name(strip_trailing_period(strip_source_refs(t.get("name"))), 200)
            t["description"] = strip_source_refs(t.get("description"))
            t["notes"] = strip_source_refs(t.get("notes"))

        out_fp = os.path.join(OUTPUT_DIR, os.path.basename(fp))
        with open(out_fp, "w") as f:
            json.dump(processed, f, indent=2)

    print(f"✅ Processed output written to {OUTPUT_DIR}/")

if __name__ == "__main__":
    main()
