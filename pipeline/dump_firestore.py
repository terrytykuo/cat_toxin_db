#!/usr/bin/env python3
"""Dump Firestore toxins collection into processed JSON files with schema validation."""

import json
import os
import re
from pathlib import Path
from tempfile import NamedTemporaryFile

from dotenv import dotenv_values
from jsonschema import Draft7Validator

FIRESTORE_ONLY_FIELDS = ['id', 'imageUrls', 'imageUrl', 'hidden', 'curatedList']
PROJECT_ROOT = Path(__file__).resolve().parent.parent
SCHEMA_PATH = PROJECT_ROOT / 'schemas' / 'toxin.schema.json'
PLANTS_OUTPUT_DIR = PROJECT_ROOT / 'data' / 'plants_processed'
FOODS_OUTPUT_DIR = PROJECT_ROOT / 'data' / 'foods_processed'
ROOT_ENV_PATH = PROJECT_ROOT / '.env.local'
ADMIN_ENV_PATH = PROJECT_ROOT / 'admin' / '.env.local'


def load_validator() -> Draft7Validator:
    with SCHEMA_PATH.open('r', encoding='utf-8') as fp:
        schema = json.load(fp)
    return Draft7Validator(schema)


def load_service_account_path() -> str:
    admin_env = dotenv_values(ADMIN_ENV_PATH)
    service_account_path = admin_env.get('FIREBASE_ADMIN_KEY_PATH')
    if not service_account_path:
        raise RuntimeError('Missing FIREBASE_ADMIN_KEY_PATH in admin/.env.local')
    return service_account_path


def load_bucket() -> str:
    root_env = dotenv_values(ROOT_ENV_PATH)
    bucket = root_env.get('FIREBASE_STORAGE_BUCKET')
    if not bucket:
        raise RuntimeError('Missing FIREBASE_STORAGE_BUCKET in .env.local')
    return bucket


def to_filename(value: str) -> str:
    normalized = re.sub(r'[^a-zA-Z0-9_\s-]', '', (value or '').strip().lower())
    normalized = re.sub(r'[\s-]+', '_', normalized).strip('_')
    return normalized or 'unknown'


def atomic_write_json(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with NamedTemporaryFile('w', delete=False, dir=path.parent, suffix='.tmp', encoding='utf-8') as tmp:
        json.dump(payload, tmp, ensure_ascii=False, indent=2)
        tmp.write('\n')
        tmp_path = Path(tmp.name)
    os.replace(tmp_path, path)


def build_disk_record(doc_id: str, record: dict) -> dict:
    merged = {'id': doc_id, **record}
    for field in FIRESTORE_ONLY_FIELDS:
        merged.pop(field, None)
    return merged


def main() -> None:
    try:
        from firebase_admin import credentials, firestore, initialize_app
    except ModuleNotFoundError as err:
        raise SystemExit(
            "Missing firebase-admin dependency. Install with: python3 -m pip install -r requirements.txt"
        ) from err

    validator = load_validator()
    service_account_path = load_service_account_path()
    storage_bucket = load_bucket()

    cred = credentials.Certificate(service_account_path)
    initialize_app(cred, {'storageBucket': storage_bucket})
    db = firestore.client()

    docs_fetched = 0
    docs_written = 0
    docs_failed = 0

    for snapshot in db.collection('toxins').stream():
        docs_fetched += 1
        data = snapshot.to_dict() or {}
        disk_record = build_disk_record(snapshot.id, data)

        validation_target = {"id": snapshot.id, **disk_record}
        errors = sorted(validator.iter_errors(validation_target), key=lambda err: list(err.path))
        if errors:
            docs_failed += 1
            details = '; '.join([f"{'.'.join(map(str, err.path)) or '<root>'}: {err.message}" for err in errors])
            print(f"[validation-failed] {snapshot.id}: {details}")
            continue

        category = (disk_record.get('category') or '').lower()
        scientific_name = disk_record.get('scientific_name') or snapshot.id
        file_name = f"{to_filename(scientific_name)}.json"

        if category == 'food':
            output_path = FOODS_OUTPUT_DIR / file_name
        else:
            output_path = PLANTS_OUTPUT_DIR / file_name

        atomic_write_json(output_path, disk_record)
        docs_written += 1

    print(f"Summary: fetched={docs_fetched}, written={docs_written}, validation_failed={docs_failed}")


if __name__ == '__main__':
    main()
