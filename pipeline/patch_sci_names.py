import json
import glob
import os

from paths import RAW_PLANTS_DIR

fixes = {
    "Honeysuckle": "Lonicera spp.",
    "Hummingbird Mint": "Agastache spp.",
    "Eucalyptus": "Eucalyptus spp.",
    "Lantana": "Lantana camara",
    "Lemon Mint": "Monarda citriodora",
    "Lavender": "Lavandula spp.",
    "Mint": "Mentha spp.",
    "Morning Glory": "Ipomoea spp.",
    "Nightshade": "Solanum spp.",
    "Peony": "Paeonia spp.",
    "Orange Mint": "Mentha citrata",
    "Pine": "Pinus spp.",
    "Pom Flowers": "Chrysanthemum morifolium",
    "Poppy": "Papaver spp.",
    "Ragwort / Tansy": "Senecio jacobaea or Tanacetum vulgare",
    "Sweet Birch": "Betula lenta",
    "Sweet Pea": "Lathyrus odoratus",
    "String of Pearls": "Senecio rowleyanus",
    "Tea Tree": "Melaleuca alternifolia",
    "Wintergreen": "Gaultheria procumbens"
}

for f in glob.glob(os.path.join(str(RAW_PLANTS_DIR), "*.json")):
    with open(f, "r") as file:
        data = json.load(file)
    if "plant" in data and not data["plant"].get("scientific_name"):
        cname = data["plant"].get("common_name")
        if cname in fixes:
            data["plant"]["scientific_name"] = fixes[cname]
            with open(f, "w") as file:
                json.dump(data, file, indent=2)
                print(f"Patched {f}")
