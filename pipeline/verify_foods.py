#!/usr/bin/env python3
"""Run the same verification logic as verify_plants.py against foods output."""

try:
    from . import verify_plants as verifier
except ImportError:
    import verify_plants as verifier


verifier.PROCESSED_DIR = "data/foods_processed"
verifier.REPORT_PATH = "data/verification_report_food.json"


if __name__ == "__main__":
    verifier.main()
