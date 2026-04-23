import json
import os
import subprocess
import time
import re

# Ref
FOOD_LIST = "data/food_list.json"
OUTPUT_DIR = "data/foods"
STATUS_FILE = "data/collection_status_food.md"
NOTEBOOK_URL = "https://notebooklm.google.com/notebook/9f5c9066-16f6-496f-b9b4-7830854bbaf2"

def snake_case(s):
    if not s:
        return "unknown_food"
    s = re.sub(r'[^a-zA-Z0-9_\s]', '', s)
    return s.lower().replace(" ", "_")

def ask(question):
    print(f"\n❓ Asking: {question[:60]}...")
    cmd = [
        "python3", "scripts/run.py", "ask_question.py",
        "--question", question,
        "--notebook-url", NOTEBOOK_URL
    ]
    # Execute in the notebooklm skill directory
    result = subprocess.run(
        cmd, 
        cwd="/Users/sweetp/.gemini/antigravity/skills/notebooklm",
        capture_output=True,
        text=True
    )
    
    if result.returncode != 0:
        print("❌ Error asking question:")
        print(result.stderr)
        return None
        
    output = result.stdout
    
    marker = "EXTREMELY IMPORTANT: Is that ALL you need to know?"
    if marker in output:
        output = output.split(marker)[0]
    
    return output.strip()

def collect_food(food, index):
    food_name = food.get("name", "Unknown")
    
    print(f"\n🍔 Processing #{index}: {food_name}")
    
    data = {
        "plant": {
            "common_name": food_name,
            "scientific_name": food_name
        },
        "raw_responses": {}
    }

    filepath = os.path.join(OUTPUT_DIR, snake_case(food_name) + ".json")
    if os.path.exists(filepath):
        try:
             with open(filepath, "r") as f:
                 existing_data = json.load(f)
             if "raw_responses" in existing_data:
                 data["raw_responses"] = existing_data["raw_responses"]
        except:
             pass

    # Query 1: Basics
    if not data["raw_responses"].get("basics"):
        q1 = f"For the food {food_name}: 1. What food category or botanical family does it belong to? 2. Give a brief description of the food (what it is, common forms). Cite your sources."
        ans1 = ask(q1)
        if ans1:
             data["raw_responses"]["basics"] = ans1
             with open(filepath, "w") as f: json.dump(data, f, indent=2)
    
    # Query 2: Toxic Parts / Forms
    if not data["raw_responses"].get("toxic_parts"):
        q2 = f"Are there specific forms or parts of {food_name} that are toxic to cats? (e.g. skin, seeds, pits, raw form, cooked form, entire food, powder) Cite your sources."
        ans2 = ask(q2)
        if ans2:
            data["raw_responses"]["toxic_parts"] = ans2
            with open(filepath, "w") as f: json.dump(data, f, indent=2)
    
    # Query 3: Toxins
    if not data["raw_responses"].get("toxins"):
        q3 = f"What are the toxic compounds or substances in {food_name} that harm cats? For each toxin provide: 1. Name of the compound 2. Chemical formula (if available) 3. Brief description of its mechanism of action in cats 4. Any notes on concentration or potency Cite your sources."
        ans3 = ask(q3)
        if ans3:
            data["raw_responses"]["toxins"] = ans3
            with open(filepath, "w") as f: json.dump(data, f, indent=2)
    
    # Query 4: Symptoms
    if not data["raw_responses"].get("symptoms"):
        q4 = f"What symptoms does a cat show after ingesting or being exposed to {food_name}? For each symptom provide: 1. Symptom name 2. Affected body system (gastrointestinal, renal, neurological, cardiac, dermal, respiratory, hepatic, hematological) 3. Severity: mild, moderate, severe, or fatal 4. Typical onset time (e.g. 'within 2 hours', '6–12 hours') 5. Any additional clinical notes Cite your sources."
        ans4 = ask(q4)
        if ans4:
            data["raw_responses"]["symptoms"] = ans4
            with open(filepath, "w") as f: json.dump(data, f, indent=2)
    
    # Query 5: Treatments
    if not data["raw_responses"].get("treatments"):
        q5 = f"What are the recommended veterinary treatments if a cat ingests {food_name}? List them in order of priority (most urgent first). For each treatment provide: 1. Treatment name 2. Brief description of the procedure 3. Any situation-specific notes Cite your sources."
        ans5 = ask(q5)
        if ans5:
             data["raw_responses"]["treatments"] = ans5
             with open(filepath, "w") as f: json.dump(data, f, indent=2)
    
    print(f"✅ Saved to {filepath}")
    update_status(index, food_name)
    
def update_status(index, name):
    with open("data/completed_log_food.txt", "a") as f:
        f.write(f"{index}. {name} - DONE\n")

def main():
    if not os.path.exists(OUTPUT_DIR):
        os.makedirs(OUTPUT_DIR)
        
    with open(FOOD_LIST, "r") as f:
        foods = json.load(f)
        
    completed = set()
    if os.path.exists("data/completed_log_food.txt"):
        with open("data/completed_log_food.txt", "r") as f:
            for line in f:
                if "." in line:
                    idx = int(line.split(".")[0])
                    completed.add(idx)
    
    # target workflow: auto-detect next 6 foods
    target_indices = []
    if os.path.exists(STATUS_FILE):
        with open(STATUS_FILE, "r") as f:
            for line in f:
                line = line.strip()
                if not line.startswith("|") or len(line.split("|")) < 11: continue
                parts = [p.strip() for p in line.split("|")]
                if parts[1].isdigit() and parts[9] == "[ ]":
                    idx = int(parts[1]) - 1
                    target_indices.append(idx)
                    if len(target_indices) == 6:
                        break
    
    print(f"🎯 Targeting {len(target_indices)} foods for collection: {target_indices}")

    for i in target_indices:
        food_num = i + 1
        
        if i >= len(foods):
            print(f"⚠️ Index {i} out of range")
            continue
            
        try:
            collect_food(foods[i], food_num)
            time.sleep(2)
        except Exception as e:
            print(f"❌ Failed processing #{food_num}: {e}")

if __name__ == "__main__":
    main()
