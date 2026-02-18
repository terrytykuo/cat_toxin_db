import json

with open("data/plant_list.json", "r") as f:
    plants = json.load(f)

print("--- Plants 40 to 50 ---")
for i in range(40, 51):
    if i < len(plants):
        p = plants[i]
        print(f"{i}: {p.get('common_name')} ({p.get('scientific_name')})")
