"""Shared path constants for pipeline scripts.

All paths are resolved relative to the repo root so scripts work the same
whether invoked from the repo root or from inside ``pipeline/``.
"""
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = REPO_ROOT / "data"

PLANT_LIST = DATA_DIR / "plant_list.json"
RAW_PLANTS_DIR = DATA_DIR / "plants"
PROCESSED_PLANTS_DIR = DATA_DIR / "plants_processed"
CLEANED_PLANTS_DIR = DATA_DIR / "plants_cleaned"
STATUS_FILE = DATA_DIR / "collection_status.md"
COMPLETED_LOG = DATA_DIR / "completed_log.txt"

SCHEMAS_DIR = REPO_ROOT / "schemas"
TOXIN_DISK_SCHEMA = SCHEMAS_DIR / "toxin.disk.schema.json"
