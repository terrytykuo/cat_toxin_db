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

# --- Post-processing cleanup ---

VALID_SEVERITIES = {"mild", "moderate", "severe", "fatal"}

# Severity ranking for picking the highest from ranges like "Mild to Severe"
SEVERITY_RANK = {"mild": 1, "moderate": 2, "severe": 3, "fatal": 4}

# Header labels that should never be used as actual values
HEADER_LABELS = {
    "botanical family", "brief description", "description",
    "symptom name", "treatment name", "name of the compound",
    "affected body system", "severity", "typical onset time",
}

# Known body systems (lowercase) for normalization
BODY_SYSTEM_MAP = {
    "gastrointestinal": "Gastrointestinal",
    "gi": "Gastrointestinal",
    "renal": "Renal",
    "kidney": "Renal",
    "neurological": "Neurological",
    "nervous": "Neurological",
    "cns": "Neurological",
    "central nervous system": "Neurological",
    "cardiac": "Cardiac",
    "cardiovascular": "Cardiac",
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
    "musculoskeletal": "Musculoskeletal",
    "neuromuscular": "Neurological",
    "behavioral": "Neurological",
    "ocular": "Dermal",
    "mucous membranes": "Dermal",
    "behavioral": "Neurological",
    "systemic": "Metabolic",
    "multisystem": "Metabolic"
}


# Manual overrides for plants where source data is consistently missing or poor
MANUAL_FAMILIES = {
    "Crassula arborescens": "Crassulaceae",
    "Crassula arborescens or Crassula": "Crassulaceae",
    "Asparagus densiflorus": "Asparagaceae",
    "Celastrus scandens": "Celastraceae",
    "Dianthus caryophyllus": "Caryophyllaceae",
    "Scadoxus spp.": "Amaryllidaceae",
    "Hyacinthoides non-scripta": "Asparagaceae",
    "Alocasia reginula": "Araceae",
    "Capsicum annuum": "Solanaceae",
    "Ricinus communis": "Euphorbiaceae",
    "Matricaria chamomilla": "Asteraceae",
    "Allium schoenoprasum": "Amaryllidaceae",
    "Helleborus niger": "Ranunculaceae",
    "Cinnamomum verum": "Lauraceae",
    "Citrus spp.": "Rutaceae",
    "Syzygium aromaticum": "Myrtaceae",
    "Darlingtonia californica": "Sarraceniaceae",
    "Eucalyptus spp.": "Myrtaceae",
    "Rumex spp.": "Polygonaceae",
    "Clivia miniata": "Amaryllidaceae",
    "Allium sativum": "Amaryllidaceae",
    "Digitalis purpurea": "Plantaginaceae",
    "Gardenia jasminoides": "Rubiaceae",
    "Lyonia spp.": "Ericaceae",
    "Gladiolus spp.": "Iridaceae",
    "Lonicera spp.": "Caprifoliaceae",
    "Agastache spp.": "Lamiaceae",
    "Hydrangea spp.": "Hydrangeaceae",
    "Nandina spp.": "Berberidaceae",
    "Asclepias spp.": "Apocynaceae",
    "Kalmia latifolia": "Ericaceae",
    "Monstera deliciosa or Monstera adansonii": "Araceae",
    "Ipomoea spp.": "Convolvulaceae",
    "Phoradendron spp. or Viscum": "Santalaceae"
}

MANUAL_DESCRIPTIONS = {
    "Hyacinthoides non-scripta": "Bulbous perennial plant with bell-shaped blue flowers, native to western Europe.",
    "Asparagus densiflorus": "An evergreen perennial plant with fern-like foliage, commonly used as a houseplant. Toxic to cats.",
    "Celastrus scandens": "A woody vine known as American Bittersweet, producing orange-yellow berries. All parts are toxic.",
    "Dianthus caryophyllus": "Carnations are popular herbaceous flowering plants, often used in bouquets, with ruffled petals.",
    "Scadoxus spp.": "Also known as Blood Lily, a bulbous plant with large spherical flower heads. Highly toxic.",
    "Matricaria chamomilla": "An aromatic herb in the daisy family (Asteraceae). Contains volatile oils and other compounds that can be toxic to cats.",
    "Cinnamomum verum": "A small evergreen tree native to Sri Lanka, its inner bark is used to make cinnamon spice. Contains essential oils.",
    "Darlingtonia californica": "Carnivorous pitcher plant native to Northern California and Oregon, resembling a cobra.",
    "Eucalyptus spp.": "Fast-growing evergreen trees and shrubs native to Australia, known for their aromatic leaves containing essential oils.",
    "Rumex spp.": "Perennial flowering plant in the family Polygonaceae, commonly known as curly dock or yellow dock.",
    "Clivia miniata": "A flowering plant native to South Africa, popular as a houseplant for its vibrant orange or yellow flowers.",
    "Allium sativum": "Bulbous flowering plant in the onion genus. Highly toxic to cats due to N-propyl disulfide.",
    "Digitalis purpurea": "Common biennial plant known as Foxglove, containing cardiac glycosides.",
    "Gardenia jasminoides": "Evergreen flowering plant of the coffee family, known for its fragrant white flowers.",
    "Lyonia spp.": "Woody shrubs in the heath family, containing gryanotoxins.",
    "Gladiolus spp.": "Perennial cormous flowering plants in the iris family, known for tall flower spikes.",
    "Lonicera spp.": "Arching shrubs or twining vines with fragrant, tubular flowers and red or black berries.",
    "Agastache spp.": "Aromatic herbaceous perennials in the mint family, known for spikes of tubular flowers.",
    "Hydrangea spp.": "Deciduous shrubs known for large flower heads in shades of pink, blue, or white.",
    "Kalmia latifolia": "A broadleaved evergreen shrub in the heath family, native to the eastern United States. Contains grayanotoxins.",
    "Ipomoea spp.": "Fast-growing climbing vines with trumpet-shaped flowers. Seeds contain lysergic acid amides."
}

MANUAL_TOXIC_PARTS = {
    "Aglaonema modestum": ["Entire Plant", "Leaf", "Stem"],
    "Prunus serotina": ["Stem", "Leaf", "Seed"],
    "Prunus laurocerasus": ["Leaf", "Seed", "Berry"],
    "Cinnamomum verum": ["Sap", "Bark"],
    "Darlingtonia californica": ["Leaf"]
}

def strip_source_refs(text):
    """Remove trailing source references like '\n• Sources:1,2,3' or 'Source:1'."""
    if not text:
        return text
    # Remove patterns like: \n  • Source:1,2,3  or  Sources:1,2  or  ◦ Source:1...
    text = re.sub(r'[\n\r]\s*[•◦\u2022\u25e6\-\*\u25aa]?\s*Sources?\s*:\s*[\d,\s\.]+\s*$', '', text, flags=re.IGNORECASE)
    # Also inline at end: "...some text. Sources:1,2,3" or "Source:1,2"
    text = re.sub(r'\s*Sources?\s*:\s*[\d,\s\.]+\s*$', '', text, flags=re.IGNORECASE)
    # Remove trailing citation numbers (e.g. "...text1,2,3" or "...text1")
    text = re.sub(r'(?<=[a-zA-Z\)\]])[\d,]+\s*$', '', text)
    # Remove lines that are just citation refs: "\n  ◦ Sources:1,2,3"
    text = re.sub(r'[\n\r]\s*[•◦\u2022\u25e6\u25aa\-\*]?\s*Sources?\s*:\s*[\d,\s\.]+', '', text, flags=re.IGNORECASE)
    # Remove "Would you like me to..." chatbot questions
    text = re.sub(r"Would you like me to.*", "", text, flags=re.IGNORECASE)
    # Remove ◦-prefixed continuation lines (source artifacts in concentration_notes)
    text = re.sub(r'[\n\r]\s*◦\s*(?:Highest |Distribution|Concentration).*$', '', text, flags=re.DOTALL)
    # Remove horizontal rules and everything after
    text = re.sub(r'\n\s*-{3,}.*$', '', text, flags=re.DOTALL)
    # Remove trailing citation+period combos like "identified1." or "text1,2...."
    text = re.sub(r'[\d,]+\.+\s*$', '', text.rstrip())
    text = re.sub(r'The provided text does not contain.*$', '', text, flags=re.IGNORECASE | re.DOTALL)
    
    return text.strip()


def clean_toxin_name(val):
    if not val:
        return None
    # Assuming clean_text is a utility function defined elsewhere or intended to be added.
    # For now, we'll proceed without it to avoid a NameError.
    # val = clean_text(val) 
    val = strip_source_refs(val)
    # Remove "1. " prefix if present
    val = re.sub(r'^\d+\.\s*', '', val)
    # Remove leading slash or "substance:" prefix
    val = re.sub(r'^/substance:\s*', '', val, flags=re.IGNORECASE)
    return val


def clean_concentration_notes(val):
    """Clean concentration notes, removing trailing next-item artifacts."""
    if not val:
        return val
    # Cut at any trailing \n followed by a numbered item (start of next toxin)
    val = re.sub(r'\n\d+\.\s.*$', '', val, flags=re.DOTALL)
    return strip_source_refs(val)


def strip_trailing_period(val):
    if not val:
        return val
    # Standardize ellipsis to dots
    val = val.replace('…', '...').replace('．', '.')
    # Strip citation refs again just in case
    val = re.sub(r'[\d,]+\.+\s*$', '', val.rstrip())
    # Strip everything non-word at end except ')'
    return re.sub(r'[^\w)]+$', '', val).strip()


def clean_name(name, max_len=150):
    """Truncate a name that exceeds max_len by cutting at a natural boundary."""
    if not name or len(name) <= max_len:
        return name
    # Try to cut at a parenthetical or comma
    truncated = name[:max_len]
    # Find last natural break point
    for sep in [' (', ', ', ' — ', ' - ']:
        idx = truncated.rfind(sep)
        if idx > 20:  # Don't truncate too aggressively
            return truncated[:idx].rstrip()
    return truncated.rstrip()


def normalize_severity(val):
    """Normalize a severity value to one of: mild, moderate, severe, fatal.
    
    Handles cases like 'Mild to Severe.', 'Moderate to Severe.', 'Potentially Severe.'
    by extracting valid severity words and picking the highest.
    """
    if not val:
        return None
    cleaned = val.strip().lower().rstrip('.')
    
    # Direct match
    if cleaned in VALID_SEVERITIES:
        return cleaned
    
    # Find all valid severity words in the string
    found = []
    for sev in VALID_SEVERITIES:
        if sev in cleaned:
            found.append(sev)
    
    if found:
        # Pick the highest severity mentioned
        return max(found, key=lambda s: SEVERITY_RANK[s])
    
    return None  # Can't determine — will be flagged by verify


def normalize_body_system(val):
    """Normalize body system to a recognized single value.
    
    Handles compound values like 'Dermal (Skin).' or 'Gastrointestinal / Neuromuscular.'
    by finding the first recognized system.
    """
    if not val:
        return None
    cleaned = val.strip().rstrip('.')
    
    # Try direct match first
    if cleaned.lower() in BODY_SYSTEM_MAP:
        return BODY_SYSTEM_MAP[cleaned.lower()]
    
    # Split on / and try each part
    for part in re.split(r'[/,]', cleaned):
        part_clean = part.strip().lower()
        # Strip parenthetical
        part_clean = re.sub(r'\(.*?\)', '', part_clean).strip()
        if part_clean in BODY_SYSTEM_MAP:
            return BODY_SYSTEM_MAP[part_clean]
        # Try word-level matching
        for key, canonical in BODY_SYSTEM_MAP.items():
            if key in part_clean:
                return canonical
    
    # Last resort: search the whole string for any known keyword
    lower_val = cleaned.lower()
    for key, canonical in BODY_SYSTEM_MAP.items():
        if key in lower_val:
            return canonical
    
    return cleaned  # Return as-is if nothing matches


def clean_family(val):
    """Validate family field: extract actual family name from prose if needed."""
    if not val:
        return None
    stripped = val.strip()
    lower = stripped.lower()
    
    # Reject header labels
    for label in HEADER_LABELS:
        if lower == label or lower.startswith(label + " ") or lower.startswith(label + ":"):
            # But check if there's a family name embedded after the label
            remainder = stripped[len(label):].strip().lstrip(":")
            if remainder:
                return clean_family(remainder)
            return None
    
    # If it's already a clean short family name (1-3 words, no prose), accept it
    if len(stripped) <= 40 and '.' not in stripped and len(stripped.split()) <= 3:
        # Strip trailing digits (citation numbers)
        cleaned = re.sub(r'\d+$', '', stripped).strip()
        if cleaned:
            return cleaned
    
    # Try to extract a family name from prose
    # Pattern: "belongs to the family Liliaceae" or "family: Araceae" or "the Solanaceae family"
    fam_extract = re.search(
        r'(?:belongs?\s+to\s+(?:the\s+)?(?:family\s+)?|family[:\s]+)([A-Z][a-z]+(?:aceae|idae|ales|eae))',
        stripped
    )
    if fam_extract:
        return fam_extract.group(1)
    
    # Pattern: "the Araceae family" or "is Araceae"
    fam_extract2 = re.search(r'(?:the\s+|is\s+)([A-Z][a-z]+(?:aceae|idae|ales|eae))', stripped)
    if fam_extract2:
        return fam_extract2.group(1)
    
    # Look for any word ending in -aceae (most common botanical family suffix)
    fam_extract3 = re.search(r'\b([A-Z][a-z]+aceae)\b', stripped)
    if fam_extract3:
        return fam_extract3.group(1)
    
    # If short enough and no periods, accept as-is (strip trailing digits)
    if len(stripped) <= 60 and '.' not in stripped:
        cleaned = re.sub(r'\d+$', '', stripped).strip()
        if cleaned:
            return cleaned
    
    return None


def clean_chemical_formula(val):
    """Return null if chemical_formula is prose instead of a formula."""
    if not val:
        return None
    cleaned = val.strip()
    if cleaned.lower().startswith('not specified') or cleaned.lower().startswith('not available'):
        return None
    if cleaned.lower().startswith('n/a') or cleaned.lower() == 'unknown':
        return None
    # If too long and contains spaces between words, it's probably prose
    if len(cleaned) > 40 and len(cleaned.split()) > 3:
        return None
    return cleaned


def clean_onset(val):
    """Truncate onset at trailing numbered items like '\n5. Additional'."""
    if not val:
        return val
    # Cut at any trailing \n followed by a numbered item
    val = re.sub(r'\n\d+\.\s.*$', '', val, flags=re.DOTALL)
    val = strip_source_refs(val.strip())
    # Truncate to 100 chars if still too long
    if val and len(val) > 100:
        truncated = val[:100]
        # Cut at last natural boundary
        for sep in ['. ', ', ', ' — ', ' - ', '; ']:
            idx = truncated.rfind(sep)
            if idx > 20:
                val = truncated[:idx + 1].rstrip()
                break
        else:
            val = truncated.rstrip()
    return val


def postprocess(processed):
    """Apply all cleanup transformations to a processed plant dict."""
    # --- Plant-level fields ---
    plant = processed.get("plant", {})
    
    # Fix Honeysuckle scientific name (Must be before manual family check)
    if plant.get("common_name") == "Honeysuckle" and not plant.get("scientific_name"):
        plant["scientific_name"] = "Lonicera spp."
    
    # Fix Hummingbird Mint scientific name (Must be before manual family check)
    if plant.get("common_name") == "Hummingbird Mint" and not plant.get("scientific_name"):
        plant["scientific_name"] = "Agastache spp."

    # Fix Eucalyptus scientific name
    if plant.get("common_name") == "Eucalyptus" and not plant.get("scientific_name"):
        plant["scientific_name"] = "Eucalyptus spp."

    # Fix Lantana scientific name
    if plant.get("common_name") == "Lantana" and not plant.get("scientific_name"):
        plant["scientific_name"] = "Lantana camara"

    # Fix Lemon Mint scientific name
    if plant.get("common_name") == "Lemon Mint" and not plant.get("scientific_name"):
        plant["scientific_name"] = "Monarda citriodora"

    # Fix Lavender scientific name
    if plant.get("common_name") == "Lavender" and (not plant.get("scientific_name") or plant.get("scientific_name") == "Lavandula"):
        plant["scientific_name"] = "Lavandula spp."

    # Fix Mint scientific name
    if plant.get("common_name") == "Mint" and not plant.get("scientific_name"):
        plant["scientific_name"] = "Mentha spp."
        
    # Fix Morning Glory scientific name
    if plant.get("common_name") == "Morning Glory" and (not plant.get("scientific_name") or str(plant.get("scientific_name")).lower() in ["none", "n/a"]):
        plant["scientific_name"] = "Ipomoea spp."
        
    plant["family"] = clean_family(plant.get("family"))
    
    # --- Description Cleaning ---
    if plant.get("description"):
        plant["description"] = strip_source_refs(plant["description"])
        # Remove chatbot artifacts
        desc = plant["description"]
        if desc:
            desc = re.sub(r'Would you like me to.*$', '', desc, flags=re.IGNORECASE | re.DOTALL).strip()
            desc = re.sub(r'The provided text does not contain.*$', '', desc, flags=re.IGNORECASE | re.DOTALL).strip()
            plant["description"] = desc if desc else None

    # --- Manual Overrides (if missing or bad quality) ---
    sci_name = plant.get("scientific_name", "")
    current_desc = plant.get("description", "")
    
    if sci_name in MANUAL_FAMILIES and not plant.get("family"):
        plant["family"] = MANUAL_FAMILIES[sci_name]
    
    if sci_name in MANUAL_DESCRIPTIONS:
        # Override if missing, short, or technically unhelpful
        if not current_desc or len(current_desc) < 20 or "limited information" in current_desc.lower() or "does not contain" in current_desc.lower():
            plant["description"] = MANUAL_DESCRIPTIONS[sci_name]

    # Manual Toxic Parts
    if sci_name in MANUAL_TOXIC_PARTS:
        # Use override if empty or if we trust the manual list more
        if not processed.get("toxic_parts"):
            processed["toxic_parts"] = MANUAL_TOXIC_PARTS[sci_name]

    # Handle Non-Toxic / Mechanical Irritants
    if sci_name == "Schlumbergera spp.":
        if not processed.get("toxins"):
            processed["toxins"] = [{
                "name": "Mechanical Irritant",
                "chemical_formula": None,
                "description": "Fibrous plant material causing mild gastrointestinal irritation.",
                "concentration_notes": "Non-toxic."
            }]

    if sci_name == "Darlingtonia californica":
        if not processed.get("toxins"):
            processed["toxins"] = [{
                "name": "Mechanical Irritant",
                "chemical_formula": None,
                "description": "Plant pitcher structure may cause mild mechanical irritation if ingested.",
                "concentration_notes": "Non-toxic."
            }]
        if not processed.get("symptoms"):
             processed["symptoms"] = [
                {"name": "Mild Gastrointestinal Upset", "severity": "mild", "body_system": "Gastrointestinal"}
            ]

    if sci_name == "Ficus benghalensis" and not processed.get("treatments"):
        processed["treatments"] = [{
            "name": "Decontamination and Supportive Care",
            "description": "Rinse mouth and skin to remove sap. If vomiting is severe, withhold food and water for a few hours, then introduce bland diet. Veterinary care if signs persist.",
            "priority": 1
        }]

    if sci_name == "Lonicera spp." and not processed.get("toxins"):
        processed["toxins"] = [{
            "name": "Saponins and Cyanogenic Glycosides",
            "chemical_formula": None,
            "description": "Can cause vomiting, diarrhea, and in rare cases, cardiovascular issues.",
            "concentration_notes": "Berries and sap are most toxic."
        }]

    if sci_name == "Ipomoea spp.":
        if not processed.get("toxins"):
            processed["toxins"] = [{
                "name": "Lysergic acid amides",
                "chemical_formula": None,
                "description": "Causes gastrointestinal upset and neurological signs.",
                "concentration_notes": "Mainly found in the seeds."
            }]
        if not processed.get("symptoms"):
            processed["symptoms"] = [
                {"name": "Vomiting and Diarrhea", "severity": "mild", "body_system": "Gastrointestinal"},
                {"name": "Agitation and Tremors", "severity": "moderate", "body_system": "Neurological"}
            ]

    if sci_name == "Phoradendron spp. or Viscum":
        if not processed.get("symptoms"):
            processed["symptoms"] = [
                {"name": "Vomiting and Diarrhea", "severity": "mild", "body_system": "Gastrointestinal"},
                {"name": "Cardiovascular Collapse", "severity": "severe", "body_system": "Cardiac"}
            ]
        if not processed.get("treatments"):
            processed["treatments"] = [{
                "name": "Decontamination and IV Fluids",
                "description": "Induce vomiting if recent, administer activated charcoal, and provide cardiovascular support.",
                "priority": 1
            }]

    # Force Scadoxus data if empty
    
    # Force Scadoxus data if empty
    if sci_name == "Scadoxus spp." and not processed.get("toxins"):
        processed["toxins"] = [{
            "name": "Lycorine and other alkaloids",
            "chemical_formula": "C16H17NO4",
            "description": " Alkaloids that cause gastrointestinal irritation and systemic distress.",
            "concentration_notes": "Found in bulbs and stems."
        }]
    if sci_name == "Scadoxus spp." and not processed.get("symptoms"):
        processed["symptoms"] = [
            {"name": "Vomiting", "severity": "moderate", "body_system": "Gastrointestinal"},
            {"name": "Salivation", "severity": "mild", "body_system": "Gastrointestinal"},
            {"name": "Diarrhea", "severity": "moderate", "body_system": "Gastrointestinal"}
        ]
        
    # --- Toxins ---
    for t in processed.get("toxins", []):
        if t.get("name"):
            t["name"] = clean_toxin_name(t["name"])
            # Run clean_name first (truncation), then strip trailing periods
            t["name"] = strip_trailing_period(clean_name(t["name"], 150))
        
        if t.get("chemical_formula"):
            t["chemical_formula"] = clean_chemical_formula(t["chemical_formula"])
        if t.get("description"):
            t["description"] = strip_source_refs(t["description"])
        if t.get("concentration_notes"):
            t["concentration_notes"] = clean_concentration_notes(t["concentration_notes"])
    
    # --- Symptoms ---
    for s in processed.get("symptoms", []):
        if s.get("name"):
            s["name"] = clean_name(strip_trailing_period(strip_source_refs(s["name"])), 150)
        s["severity"] = normalize_severity(s.get("severity"))
        s["body_system"] = normalize_body_system(s.get("body_system"))
        s["onset"] = clean_onset(s.get("onset"))
        if s.get("notes"):
            s["notes"] = strip_source_refs(s["notes"])
    
    # --- Treatments ---
    for t in processed.get("treatments", []):
        if t.get("name"):
            t["name"] = clean_name(strip_trailing_period(strip_source_refs(t["name"])), 200)
        if t.get("description"):
            t["description"] = strip_source_refs(t["description"])
        if t.get("notes"):
            t["notes"] = strip_source_refs(t["notes"])
    
    # --- Basics (mirror cleaned family back) ---
    if processed.get("basics"):
        processed["basics"]["family"] = plant.get("family")
        processed["basics"]["description"] = plant.get("description")
    
    return processed


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
    fam_pat = r"(?:1\.\s*Botanical Family:|Botanical Family:|1\.\s*Family:|1\.)\s*(.*?)(?:2\.|Brief Description:|Description:|$)"
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
        
    # Post-process: clean all fields
    processed = postprocess(processed)
        
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
