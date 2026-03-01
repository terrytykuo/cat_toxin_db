import json
import os
import re

FOOD_LIST_FILE = "data/food_list.json"
STATUS_FILE = "data/collection_status_food.md"
FOODS_DIR = "data/foods"

def to_snake_case(text):
    text = re.sub(r'[^\w\s-]', '', text.lower())
    text = re.sub(r'[\s-]+', '_', text).strip('_')
    return text

def main():
    if not os.path.exists(FOOD_LIST_FILE) or not os.path.exists(STATUS_FILE) or not os.path.exists(FOODS_DIR):
        print("Error: Missing prerequisites.")
        return

    with open(FOOD_LIST_FILE, "r") as f: foods = json.load(f)
    existing_files = set(os.listdir(FOODS_DIR))
    
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
                if to_snake_case(target_name) + ".json" in existing_files:
                    for col in range(3, 10): parts[col] = "[x]" # Updated logic to cover correct columns
                    lines[i] = "| " + " | ".join(parts[1:-1]) + " |\n"
        except ValueError: continue

    with open(STATUS_FILE, "w") as f: f.writelines(lines)
    print("Status file updated.")

if __name__ == "__main__":
    main()
