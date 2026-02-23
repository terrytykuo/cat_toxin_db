import json
import os
import subprocess
import time
import re

# Ref
PLANT_LIST = "data/plant_list.json"
OUTPUT_DIR = "data/plants"
STATUS_FILE = "data/collection_status.md"
NOTEBOOK_ID = "cat-toxin-safety-guide"

def snake_case(s):
    if not s:
        return "unknown_plant"
    # Remove chars that aren't alphanum or underscore
    s = re.sub(r'[^a-zA-Z0-9_\s]', '', s)
    return s.lower().replace(" ", "_")

def ask(question):
    print(f"\n❓ Asking: {question[:60]}...")
    cmd = [
        "python3", "scripts/run.py", "ask_question.py",
        "--question", question,
        "--notebook-id", NOTEBOOK_ID
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
        
    # extract answer from stdout (it might be noisy)
    # The output format is usually:
    # ...
    # <Answer Text>
    # ...
    # EXTREMELY IMPORTANT: Is that ALL you need to know? ...
    
    output = result.stdout
    
    # Simple heuristic to clean up the tail
    marker = "EXTREMELY IMPORTANT: Is that ALL you need to know?"
    if marker in output:
        output = output.split(marker)[0]
    
    return output.strip()

def collect_plant(plant, index):
    common_name = plant.get("common_name", "Unknown")
    scientific_name = plant.get("scientific_name", "Unknown")
    
    print(f"\n🌿Processing #{index}: {common_name} ({scientific_name})")
    
    data = {
        "plant": {
            "common_name": common_name,
            "scientific_name": scientific_name
        },
        "raw_responses": {}
    }

    # Load existing if present to resume
    filepath = os.path.join(OUTPUT_DIR, snake_case(scientific_name if scientific_name else common_name) + ".json")
    if os.path.exists(filepath):
        try:
             with open(filepath, "r") as f:
                 existing_data = json.load(f)
             # Merge existing
             if "raw_responses" in existing_data:
                 data["raw_responses"] = existing_data["raw_responses"]
        except:
             pass

    # Query 1: Basics
    if not data["raw_responses"].get("basics"):
        q1 = f"For the plant {common_name} ({scientific_name}): 1. What botanical family does it belong to? 2. Give a brief description of the plant (appearance, habitat, where commonly found). Cite your sources."
        ans1 = ask(q1)
        if ans1:
             data["raw_responses"]["basics"] = ans1
             # Save intermediate
             with open(filepath, "w") as f: json.dump(data, f, indent=2)
    
    # Query 2: Toxic Parts
    if not data["raw_responses"].get("toxic_parts"):
        q2 = f"Which parts of {common_name} are toxic to cats? (e.g. leaves, bulbs, flowers, pollen, stems, roots, seeds, bark, sap, fruit, entire plant). Cite your sources."
        ans2 = ask(q2)
        if ans2:
            data["raw_responses"]["toxic_parts"] = ans2
            with open(filepath, "w") as f: json.dump(data, f, indent=2)
    
    # Query 3: Toxins
    if not data["raw_responses"].get("toxins"):
        q3 = f"What are the toxic compounds or substances in {common_name} that harm cats? For each toxin provide: 1. Name of the compound. 2. Chemical formula (if available). 3. Brief description of its mechanism of action in cats. 4. Any notes on concentration or potency. Cite your sources."
        ans3 = ask(q3)
        if ans3:
            data["raw_responses"]["toxins"] = ans3
            with open(filepath, "w") as f: json.dump(data, f, indent=2)
    
    # Query 4: Symptoms
    if not data["raw_responses"].get("symptoms"):
        q4 = f"What symptoms does a cat show after ingesting or being exposed to {common_name}? For each symptom provide: 1. Symptom name. 2. Affected body system (gastrointestinal, renal, neurological, cardiac, dermal, respiratory, hepatic, hematological). 3. Severity: mild, moderate, severe, or fatal. 4. Typical onset time (e.g. 'within 2 hours', '6–12 hours'). 5. Any additional clinical notes. Cite your sources."
        ans4 = ask(q4)
        if ans4:
            data["raw_responses"]["symptoms"] = ans4
            with open(filepath, "w") as f: json.dump(data, f, indent=2)
    
    # Query 5: Treatments
    if not data["raw_responses"].get("treatments"):
        q5 = f"What are the recommended veterinary treatments if a cat ingests {common_name}? List them in order of priority (most urgent first). For each treatment provide: 1. Treatment name. 2. Brief description of the procedure. 3. Any situation-specific notes. Cite your sources."
        ans5 = ask(q5)
        if ans5:
             data["raw_responses"]["treatments"] = ans5
             with open(filepath, "w") as f: json.dump(data, f, indent=2)
    
    print(f"✅ Saved to {filepath}")
    update_status(index, common_name)
    
def update_status(index, name):
    # This is a bit hacky, it just appends to the file for now or logs it.
    # In a real run we'd parse and update rows.
    # For now let's just mark it in a new file to avoid complex file I/O on the markdown table
    with open("data/completed_log.txt", "a") as f:
        f.write(f"{index}. {name} - DONE\n")

def main():
    with open(PLANT_LIST, "r") as f:
        plants = json.load(f)
        
    # Check what's already done
    completed = set()
    if os.path.exists("data/completed_log.txt"):
        with open("data/completed_log.txt", "r") as f:
            for line in f:
                # format: "1. Common Name - DONE"
                if "." in line:
                    idx = int(line.split(".")[0])
                    completed.add(idx)
    
    # Process next 6 plants (total 7 for today including the test run)
    # Indices 0 to 6 (plants #1 to #7)
    
    # Process Phase: Next 8 plants
    # 116: Peppermint, 129: Ragwort, 140: Spider Plant, 142-146
    target_indices = [115, 128, 139, 141, 142, 143, 144, 145]
    
    print(f"🎯 Targeting {len(target_indices)} plants for collection: {target_indices}")

    for i in target_indices:
        plant_num = i + 1
        
        if i >= len(plants):
            print(f"⚠️ Index {i} out of range (max {len(plants)-1})")
            continue
            
        try:
            collect_plant(plants[i], plant_num)
            # Sleep a bit to be nice to the rate limiter? Not strictly needed but good practice.
            time.sleep(2)
        except Exception as e:
            print(f"❌ Failed processing #{plant_num}: {e}")

if __name__ == "__main__":
    main()
