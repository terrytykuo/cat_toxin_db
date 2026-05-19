import json
import os
import re
import unicodedata

from paths import PLANT_LIST, STATUS_FILE as STATUS_PATH, RAW_PLANTS_DIR, PROCESSED_PLANTS_DIR

PLANT_LIST_FILE = str(PLANT_LIST)
STATUS_FILE = str(STATUS_PATH)
PLANTS_DIR = str(RAW_PLANTS_DIR)
PROCESSED_DIR = str(PROCESSED_PLANTS_DIR)


def normalize_name(text):
    if not text:
        return ""
    text = unicodedata.normalize("NFKD", str(text))
    text = text.encode("ascii", "ignore").decode("ascii")
    text = text.lower().replace("&", " and ")
    text = re.sub(r"[^a-z0-9]+", " ", text)
    return " ".join(text.split())


def iter_names_from_json(path):
    try:
        with open(path, "r") as f:
            data = json.load(f)
    except (OSError, json.JSONDecodeError):
        return

    candidates = [os.path.splitext(os.path.basename(path))[0].replace("_", " ")]
    if "plant" in data:
        plant = data.get("plant", {})
        candidates.extend([plant.get("common_name"), plant.get("scientific_name")])
    else:
        candidates.extend([data.get("name"), data.get("scientific_name")])
        candidates.extend(data.get("aliases", []))

    for candidate in candidates:
        normalized = normalize_name(candidate)
        if normalized:
            yield normalized


def collect_known_names():
    known = set()
    for directory in [PLANTS_DIR, PROCESSED_DIR]:
        if not os.path.exists(directory):
            continue
        for filename in os.listdir(directory):
            if not filename.endswith(".json"):
                continue
            path = os.path.join(directory, filename)
            known.update(iter_names_from_json(path))
    return known

def main():
    if not os.path.exists(PLANT_LIST_FILE):
        print(f"Error: {PLANT_LIST_FILE} not found")
        return

    with open(PLANT_LIST_FILE, "r") as f:
        plants = json.load(f)

    known_names = collect_known_names()
    print(f"Indexed {len(known_names)} known raw/processed plant names")
    
    # Read status file lines
    with open(STATUS_FILE, "r") as f:
        lines = f.readlines()
        
    new_lines = []
    header_idx = -1
    for i, line in enumerate(lines):
        if "| # | Plant |" in line:
            header_idx = i
        new_lines.append(line)
        
    if header_idx == -1:
        print("Error: Could not find table header")
        return

    # Process each plant row
    # The table rows start after the separator line (header + 2)
    start_row = header_idx + 2
    
    for i in range(start_row, len(lines)):
        line = lines[i].strip()
        if not line.startswith("|") or len(line.split("|")) < 12:
            continue
            
        parts = [p.strip() for p in line.split("|")]
        # parts[0] is empty, parts[1] is #, parts[2] is Plant ...
        try:
            # Check if parts[1] is a number
            if not parts[1].isdigit():
                continue
                
            idx = int(parts[1])
            # Find corresponding plant in plant_list (1-based index)
            if idx <= len(plants):
                plant = plants[idx-1]
                
                sci_name = plant.get("scientific_name")
                com_name = plant.get("common_name")

                candidate_names = {
                    normalize_name(com_name),
                    normalize_name(sci_name),
                }
                candidate_names.discard("")

                if candidate_names & known_names:
                    # Update row: check R1-R6 and Done
                    for col in range(5, 12):
                        parts[col] = "[x]"
                    new_line = "| " + " | ".join(parts[1:-1]) + " |"
                    new_lines[i] = new_line + "\n"

        except ValueError:
            continue

    with open(STATUS_FILE, "w") as f:
        f.writelines(new_lines)
    print("Status file updated.")

if __name__ == "__main__":
    main()
