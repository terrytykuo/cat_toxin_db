import json
import os
import re

PLANT_LIST_FILE = "data/plant_list.json"
STATUS_FILE = "data/collection_status.md"
PLANTS_DIR = "data/plants"

def to_snake_case(text):
    text = re.sub(r'[^\w\s-]', '', text.lower())
    text = re.sub(r'[\s-]+', '_', text).strip('_')
    return text

def main():
    if not os.path.exists(PLANT_LIST_FILE):
        print(f"Error: {PLANT_LIST_FILE} not found")
        return

    with open(PLANT_LIST_FILE, "r") as f:
        plants = json.load(f)

    # Map name -> existing file
    if not os.path.exists(PLANTS_DIR):
        print(f"Error: {PLANTS_DIR} not found")
        return
        
    existing_files = set(os.listdir(PLANTS_DIR))
    print(f"Found {len(existing_files)} files in {PLANTS_DIR}")
    
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
                
                # Check file existence
                # Filename logic from batch_collect.py:
                # scientific_name if not N/A, else common_name
                sci_name = plant.get("scientific_name")
                com_name = plant.get("common_name")
                
                target_name = sci_name if sci_name and sci_name != "N/A" else com_name
                
                # Check both common and scientific just in case
                filename_sci = to_snake_case(target_name) + ".json"
                filename_com = to_snake_case(com_name) + ".json"
                
                found = False
                if filename_sci in existing_files:
                    found = True
                elif filename_com in existing_files:
                    found = True
                
                if found:
                    # Update row: check R1-R6 and Done
                    # Columns R1-R6 are indices 5-10. Done is 11.
                    for col in range(5, 12):
                        parts[col] = "[x]"
                    
                    # Reconstruct line
                    # Join with " | " and add leading/trailing "|"
                    # parts has empty first and last element due to split("|") ?
                    # split("|") on "| a | b |" gives ["", "a", "b", ""]
                    # so parts[1] is "a".
                    # My parts logic:
                    # parts = [p.strip() for p in line.split("|")]
                    # parts[0] = ""
                    # parts[1] = "#"
                    # ...
                    # parts[-1] = ""
                    
                    new_line = "| " + " | ".join(parts[1:-1]) + " |"
                    new_lines[i] = new_line + "\n"
                    # print(f"Updated status for #{idx} {com_name}")
                    
        except ValueError:
            continue

    with open(STATUS_FILE, "w") as f:
        f.writelines(new_lines)
    print("Status file updated.")

if __name__ == "__main__":
    main()
