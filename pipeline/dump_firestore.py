#!/usr/bin/env python3
"""
dump_firestore.py — Read every document from the Firestore ``toxins``
collection, strip Firestore-only fields, validate against the disk schema,
and write one JSON file per document under ``data/plants_processed/`` or
``data/foods_processed/`` (based on the document's ``category`` field).

This is the alignment baseline for PR 6: after running this, the on-disk
processed JSON matches Firestore verbatim (minus the id / imageUrls /
imageUrl / hidden / curatedList fields that only live in Firestore).

Usage
-----
Requires a Firebase Admin SDK service-account JSON. Configure via env or
command line:

    FIREBASE_ADMIN_KEY_PATH=/abs/path/to/service-account.json \\
        python3 pipeline/dump_firestore.py

    # or:
    python3 pipeline/dump_firestore.py --key /abs/path/to/service-account.json

Safe by default: this script is **read-only** against Firestore. It only
writes to the local filesystem. No Firestore mutation is ever performed.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
from pathlib import Path
from typing import Any

from paths import (
    DATA_DIR,
    PROCESSED_FOODS_DIR,
    PROCESSED_PLANTS_DIR,
    TOXIN_DISK_SCHEMA,
)

FIRESTORE_ONLY_FIELDS = ("id", "imageUrls", "imageUrl", "hidden", "curatedList")
COLLECTION = "toxins"

SLUG_RE = re.compile(r"[^a-z0-9]+")


def slugify(value: str) -> str:
    return SLUG_RE.sub("_", value.lower()).strip("_")


def resolve_output_path(doc_id: str, data: dict[str, Any]) -> Path:
    category = data.get("category")
    scientific = data.get("scientific_name")
    stem = slugify(scientific) if scientific else slugify(doc_id)
    if not stem:
        stem = slugify(doc_id) or doc_id
    base = PROCESSED_FOODS_DIR if category == "food" else PROCESSED_PLANTS_DIR
    return base / f"{stem}.json"


def atomic_write_json(target: Path, payload: dict[str, Any]) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    tmp = target.with_suffix(target.suffix + ".tmp")
    with open(tmp, "w") as fh:
        json.dump(payload, fh, indent=2, ensure_ascii=False, sort_keys=True)
        fh.write("\n")
    os.replace(tmp, target)


def strip_firestore_only(data: dict[str, Any]) -> dict[str, Any]:
    return {k: v for k, v in data.items() if k not in FIRESTORE_ONLY_FIELDS}


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Dump the Firestore `toxins` collection to processed JSON.")
    p.add_argument(
        "--key",
        default=os.environ.get("FIREBASE_ADMIN_KEY_PATH"),
        help="Path to Firebase Admin SDK service-account JSON.",
    )
    p.add_argument(
        "--dry-run",
        action="store_true",
        help="Fetch and validate but do not write any files.",
    )
    return p.parse_args()


def load_firestore_client(key_path: str):
    try:
        import firebase_admin
        from firebase_admin import credentials, firestore
    except ImportError:
        print("firebase-admin is not installed. `pip install firebase-admin`", file=sys.stderr)
        sys.exit(1)

    if not firebase_admin._apps:
        cred = credentials.Certificate(key_path)
        firebase_admin.initialize_app(cred)
    return firestore.client()


def load_validator():
    try:
        from jsonschema import Draft7Validator
    except ImportError:
        print("jsonschema is not installed. `pip install jsonschema`", file=sys.stderr)
        sys.exit(1)
    if not TOXIN_DISK_SCHEMA.exists():
        print(f"schema not found at {TOXIN_DISK_SCHEMA}", file=sys.stderr)
        sys.exit(1)
    with open(TOXIN_DISK_SCHEMA, "r") as fh:
        return Draft7Validator(json.load(fh))


def main() -> int:
    args = parse_args()
    key_path = args.key
    if not key_path:
        print("Missing --key or FIREBASE_ADMIN_KEY_PATH env var.", file=sys.stderr)
        return 2
    if not Path(key_path).is_file():
        print(f"Service-account key not found at {key_path}", file=sys.stderr)
        return 2

    db = load_firestore_client(key_path)
    validator = load_validator()

    docs = list(db.collection(COLLECTION).stream())
    fetched = len(docs)
    written = 0
    validation_failures: list[tuple[str, str, str]] = []
    written_paths: set[Path] = set()

    for doc in docs:
        raw = doc.to_dict() or {}
        disk_payload = strip_firestore_only(raw)

        errors = sorted(validator.iter_errors(disk_payload), key=lambda e: list(e.absolute_path))
        if errors:
            first = errors[0]
            loc = "/".join(str(p) for p in first.absolute_path) or "<root>"
            validation_failures.append((doc.id, loc, first.message))
            continue

        target = resolve_output_path(doc.id, raw)
        if target in written_paths:
            print(
                f"WARN: {doc.id} would overwrite {target} (duplicate slug); skipping.",
                file=sys.stderr,
            )
            continue

        if args.dry_run:
            written += 1
            written_paths.add(target)
            continue

        atomic_write_json(target, disk_payload)
        written += 1
        written_paths.add(target)

    print()
    print(f"Firestore docs fetched:  {fetched}")
    print(f"JSON files written:      {written}{' (dry run)' if args.dry_run else ''}")
    print(f"Validation failures:     {len(validation_failures)}")
    for doc_id, loc, msg in validation_failures:
        print(f"  FAIL {doc_id}: {loc}: {msg[:120]}")

    if validation_failures:
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
