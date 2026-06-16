import json
import os
import re
import unicodedata

from paths import FOOD_LIST, STATUS_FILE_FOOD, RAW_FOODS_DIR, PROCESSED_FOODS_DIR

FOOD_LIST_FILE = str(FOOD_LIST)
STATUS_FILE = str(STATUS_FILE_FOOD)
FOODS_DIR = str(RAW_FOODS_DIR)
PROCESSED_DIR = str(PROCESSED_FOODS_DIR)


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
    for directory in [FOODS_DIR, PROCESSED_DIR]:
        if not os.path.exists(directory):
            continue
        for filename in os.listdir(directory):
            if not filename.endswith(".json"):
                continue
            known.update(iter_names_from_json(os.path.join(directory, filename)))
    return known

def main():
    if not os.path.exists(FOOD_LIST_FILE) or not os.path.exists(STATUS_FILE):
        print("Error: Missing prerequisites.")
        return

    with open(FOOD_LIST_FILE, "r") as f: foods = json.load(f)
    known_names = collect_known_names()
    
    with open(STATUS_FILE, "r") as f: lines = f.readlines()
        
    for i, line in enumerate(lines):
        if "| # | Food |" in line:
            header_idx = i
            break
    else: return

    for i in range(header_idx + 2, len(lines)):
        line = lines[i].strip()
        if not line.startswith("|") or len(line.split("|")) < 11: continue
            
        parts = [p.strip() for p in line.split("|")]
        try:
            if not parts[1].isdigit(): continue
            idx = int(parts[1])
            if idx <= len(foods):
                food = foods[idx-1]
                target_name = food.get("name")
                if normalize_name(target_name) in known_names:
                    for col in range(3, 10): parts[col] = "[x]" # Updated logic to cover correct columns
                    lines[i] = "| " + " | ".join(parts[1:-1]) + " |\n"
        except ValueError: continue

    with open(STATUS_FILE, "w") as f: f.writelines(lines)
    print("Status file updated.")

if __name__ == "__main__":
    main()
