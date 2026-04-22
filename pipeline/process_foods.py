#!/usr/bin/env python3
"""Process raw food collection files into normalized processed JSON output."""

import glob
import os

try:
    from . import process_plants as plants_processor
except ImportError:
    import process_plants as plants_processor

INPUT_DIR = "data/foods"


def main():
    files = glob.glob(os.path.join(INPUT_DIR, "*.json"))
    plants_processor.OUTPUT_DIR = str(plants_processor.PROJECT_ROOT / "data" / "foods_processed")
    passed = 0
    failed = 0
    for file_path in files:
        if plants_processor.process_file(file_path):
            passed += 1
        else:
            failed += 1
    print(f"Summary: {passed} passed, {failed} failed")


if __name__ == "__main__":
    main()
