import re
import json
import os

RAW_FILE = "data/discovery_raw.txt"
JSON_FILE = "data/plant_list.json"
STATUS_FILE = "data/collection_status.md"

def parse_discovery():
    plants = []
    
    if not os.path.exists(RAW_FILE):
        print(f"Error: {RAW_FILE} not found.")
        return

    with open(RAW_FILE, "r") as f:
        content = f.read()

    # Regex to match numbered list items: "1. Name (Scientific Name)"
    # Handles variations like:
    # 1. Lily (Lilium)
    # 2. Plant (Scientific Name not provided)
    # 3. Plant / Alias (Sci Name)
    pattern = re.compile(r"^\d+\.\s*(.+?)\s*\(([^)]+)\)", re.MULTILINE)
    
    for match in pattern.finditer(content):
        common_name = match.group(1).strip()
        scientific_name = match.group(2).strip()
        
        # Cleanup scientific name if it says "Scientific name not provided..."
        if "not provided" in scientific_name.lower():
            scientific_name = None

        plants.append({
            "common_name": common_name,
            "scientific_name": scientific_name
        })

    # Deduplicate by common name
    unique_plants = {p["common_name"]: p for p in plants}.values()
    plants = list(unique_plants)
    
    # Save to JSON
    with open(JSON_FILE, "w") as f:
        json.dump(plants, f, indent=2)
    
    print(f"Parsed {len(plants)} plants. Saved to {JSON_FILE}")
    
    # Create status tracker
    create_status_tracker(plants)

def create_status_tracker(plants):
    with open(STATUS_FILE, "w") as f:
        f.write("# Data Collection Status\n\n")
        f.write("| # | Plant | Common Name | Scientific Name | R1 | R2 | R3 | R4 | R5 | R6 | Done |\n")
        f.write("|---|---|---|---|---|---|---|---|---|---|---|\n")
        
        for i, plant in enumerate(plants, 1):
            c_name = plant["common_name"]
            s_name = plant["scientific_name"] or "N/A"
            f.write(f"| {i} | {c_name} | {c_name} | {s_name} | | | | | | | |\n")
            
    print(f"Created status tracker at {STATUS_FILE}")

if __name__ == "__main__":
    parse_discovery()
