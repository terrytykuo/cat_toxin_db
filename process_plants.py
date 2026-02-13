import json
import os
import re
import glob

INPUT_DIR = "data/plants"
OUTPUT_DIR = "data/plants_processed"

# Known toxic parts keys to search for if extraction fails
KNOWN_PARTS = [
    "leaf", "leaves", "bulb", "bulbs", "flower", "flowers", "pollen", 
    "stem", "stems", "root", "roots", "seed", "seeds", "bark", "sap", "latex", 
    "fruit", "fruits", "berry", "berries", "entire plant", "whole plant"
]

def clean_text(text):
    if not text:
        return None
    text = text.strip()
    # Remove leading/trailing quotes
    text = re.sub(r'^["\']|["\']$', '', text)
    return text

def strip_header(text):
    if not text:
        return ""
    # Look for the standard separator used by ask_question.py
    separator = "============================================================"
    if separator in text:
        # Take the part AFTER the last separator
        parts = text.split(separator)
        return parts[-1].strip()
    return text

def parse_basics(text):
    text = strip_header(text)
    data = {}
    
    # Family
    # Match various forms: "1. Botanical Family:", "Botanical Family:", "1. Family:"
    fam_pat = r"(?:1\.\s*Botanical Family:|Botanical Family:|1\.\s*Family:|1\.)\s*(.*?)(?:\n|2\.|Brief Description:|Description:)"
    fam_match = re.search(fam_pat, text, re.IGNORECASE | re.DOTALL)
    if fam_match:
        val = clean_text(fam_match.group(1))
        # verification: usually short. if it looks like a question, ignore.
        if val and "what botanical" not in val.lower():
            # Remove leading : if present
            val = re.sub(r"^:\s*", "", val)
            data["family"] = val
        
    # Description
    desc_pat = r"(?:2\.|Brief Description:|Description:)\s*(.*)"
    desc_match = re.search(desc_pat, text, re.IGNORECASE | re.DOTALL)
    if desc_match:
        val = clean_text(desc_match.group(1))
        if val and "give a brief" not in val.lower():
             val = re.sub(r"^:\s*", "", val)
             data["description"] = val
        
    return data

def parse_toxic_parts(text):
    text = strip_header(text)
    # This is unstructured usually.
    # We'll just look for keywords for now.
    found_parts = set()
    lower_text = text.lower()
    
    for part in KNOWN_PARTS:
        # Simple word match
        if re.search(r"\b" + re.escape(part) + r"\b", lower_text):
            # Normalize
            if part in ["leaves"]: part = "Leaf"
            elif part in ["bulbs"]: part = "Bulb"
            elif part in ["flowers"]: part = "Flower"
            elif part in ["stems"]: part = "Stem"
            elif part in ["roots"]: part = "Root"
            elif part in ["seeds"]: part = "Seed"
            elif part in ["fruits", "berries", "berry"]: part = "Fruit"
            elif part in ["whole plant"]: part = "Entire Plant"
            else: part = part.title()
            found_parts.add(part)
            
    return list(found_parts)

def parse_list_items(text, field_maps):
    """
    Generic parser for lists of items (toxins, symptoms, treatments).
    text: input text
    field_maps: dict mapping target_key -> list of regex patterns
    """
    items = []
    
    # Strategy: Find all occurrences of the FIRST field key.
    first_key = list(field_maps.keys())[0]
    patterns = field_maps[first_key]
    
    # Find all start indices
    starts = []
    for pat in patterns:
        for match in re.finditer(pat, text, re.IGNORECASE):
            starts.append(match.start())
    
    starts.sort()
    
    # MAIN LOGIC: If keys found, split by keys
    if starts:
        chunks = []
        for i in range(len(starts)):
            start = starts[i]
            end = starts[i+1] if i+1 < len(starts) else len(text)
            chunks.append(text[start:end])
            
        for chunk in chunks:
            item = {}
            for key, pats in field_maps.items():
                # Find start of this value
                val = None
                for pat in pats:
                     m = re.search(pat, chunk, re.IGNORECASE)
                     if not m:
                         continue
                     val_start = m.end()
                     # Find nearest start of ANY other key in this chunk
                     min_end = len(chunk)
                     for other_key, other_pats in field_maps.items():
                         if other_key == key: continue 
                         for op in other_pats:
                             om = re.search(op, chunk[val_start:], re.IGNORECASE)
                             if om:
                                 if val_start + om.start() < min_end:
                                     min_end = val_start + om.start()
                     val = chunk[val_start:min_end].strip()
                     val = re.sub(r"^[:\-\.]\s*", "", val)
                     if val:
                         item[key] = clean_text(val)
                         break
            if item:
                items.append(item)

    # FALLBACK LOGIC: If no key-based items found, try numbered list extraction
    if not items:
         # Regex for numbered items: ^\d+\.\s+
         item_starts = [m.start() for m in re.finditer(r"(?:\n|^)\d+\.\s+", text)]
         
         if item_starts:
             chunks = []
             for i in range(len(item_starts)):
                 start = item_starts[i]
                 end = item_starts[i+1] if i+1 < len(item_starts) else len(text)
                 if text[start] == '\n': start += 1
                 chunks.append(text[start:end])
                 
             for chunk in chunks:
                 # "1. Name of Thing" -> "Name of Thing"
                 first_line_match = re.match(r"\d+\.\s*(.*)(?:\n|$)", chunk)
                 if not first_line_match: continue
                 
                 name = first_line_match.group(1).strip()
                 # check if it's just a label
                 if "symptom name" in name.lower() or "treatment name" in name.lower() or "name of the compound" in name.lower():
                     continue 
                     
                 item = {"name": clean_text(name)}
                 
                 # Now try to find other fields in the rest of the chunk
                 for key, pats in field_maps.items():
                     if key == "name": continue
                     for pat in pats:
                         m = re.search(pat, chunk, re.IGNORECASE)
                         if m:
                             val_start = m.end()
                             min_end = len(chunk)
                             for other_key, other_pats in field_maps.items():
                                 if other_key == key or other_key == "name": continue
                                 for op in other_pats:
                                     om = re.search(op, chunk[val_start:], re.IGNORECASE)
                                     if om:
                                         if val_start + om.start() < min_end:
                                             min_end = val_start + om.start()
                             
                             val = chunk[val_start:min_end].strip()
                             val = re.sub(r"^[:\-\.]\s*", "", val)
                             if val:
                                 item[key] = clean_text(val)
                                 break
                 items.append(item)
            
    return items

def process_file(filepath):
    with open(filepath, "r") as f:
        data = json.load(f)
        
    raw = data.get("raw_responses", {})
    plant_info = data.get("plant", {})
    
    processed = {
        "plant": plant_info,
        "basics": parse_basics(raw.get("basics", "")),
        "toxic_parts": parse_toxic_parts(raw.get("toxic_parts", "")),
        "toxins": [],
        "symptoms": [],
        "treatments": []
    }
    
    # Update plant info with parsed basics
    if processed["basics"].get("family"):
        processed["plant"]["family"] = processed["basics"]["family"]
    if processed["basics"].get("description"):
        processed["plant"]["description"] = processed["basics"]["description"]
        
    # Toxins
    toxin_maps = {
        "name": [r"Name of the compound:?", r"1\.\s*Name:?", r"•\s*Name(?: of the compound)?:?"],
        "chemical_formula": [r"Chemical formula:?", r"2\.\s*Chemical formula:?", r"•\s*Chemical formula:?"],
        "description": [r"mechanism of action:?", r"3\.\s*Brief description:?", r"•\s*Brief description:?", r"•\s*Mechanism(?: of action)?:?"],
        "concentration_notes": [r"concentration or potency:?", r"4\.\s*Any notes:?", r"•\s*Any notes:?", r"•\s*Toxicity notes:?", r"•\s*Notes on concentration:?"]
    }
    processed["toxins"] = parse_list_items(strip_header(raw.get("toxins", "")), toxin_maps)
    
    # Symptoms
    symptom_maps = {
        "name": [r"Symptom name:?", r"1\.\s*Symptom name:?", r"•\s*Symptom name:?"],
        "body_system": [r"Affected body system:?", r"2\.\s*Affected body system:?", r"•\s*Affected body system:?"],
        "severity": [r"Severity:?", r"3\.\s*Severity:?", r"•\s*Severity:?"],
        "onset": [r"Typical onset time:?", r"4\.\s*Typical onset time:?", r"•\s*Typical onset time:?", r"•\s*Onset:?"],
        "notes": [r"clinical notes:?", r"5\.\s*Any additional:?", r"•\s*Additional:?", r"•\s*Notes:?", r"•\s*Clinical notes:?"]
    }
    processed["symptoms"] = parse_list_items(strip_header(raw.get("symptoms", "")), symptom_maps)
    
    # Treatments
    treatment_maps = {
        "name": [r"Treatment name:?", r"1\.\s*Treatment name:?", r"•\s*Treatment name:?"],
        "description": [r"description of the procedure:?", r"2\.\s*Brief description:?", r"•\s*Brief description:?", r"•\s*Procedure:?", r"•\s*Description:?"],
        "notes": [r"situation-specific notes:?", r"3\.\s*Any situation:?", r"•\s*Situation:?", r"•\s*Notes:?", r"•\s*Situation-specific notes:?"]
    }
    processed["treatments"] = parse_list_items(strip_header(raw.get("treatments", "")), treatment_maps)
    # Add priority based on order
    for i, t in enumerate(processed["treatments"]):
        t["priority"] = i + 1
        
    # Save
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    out_name = os.path.basename(filepath)
    out_path = os.path.join(OUTPUT_DIR, out_name)
    
    with open(out_path, "w") as f:
        json.dump(processed, f, indent=2)
        
    print(f"Processed {out_name}")

def main():
    files = glob.glob(os.path.join(INPUT_DIR, "*.json"))
    for f in files:
        process_file(f)

if __name__ == "__main__":
    main()
