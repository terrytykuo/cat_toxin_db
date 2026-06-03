#!/usr/bin/env python3
"""Upload zh-TW translations to Firestore as l10n.zh-TW on each toxin document.

Each toxins/{slug} document gets a new field:
    l10n: { "zh-TW": { name, aliases, description, safetyNotes, toxicParts, symptoms } }

Usage
-----
    python3 pipeline/upload_translations.py
    python3 pipeline/upload_translations.py --dry-run
    python3 pipeline/upload_translations.py --slug lilium_spp --dry-run
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional

from paths import DATA_DIR, REPO_ROOT

SITE_DATA_DIR = DATA_DIR / "site"
ZH_DIR = SITE_DATA_DIR / "firestore" / "zh-TW"

FIRESTORE_COLLECTION = "toxins"
LOCALE = "zh-TW"

METADATA_FIELDS = {"slug", "source_hash", "translated_at", "gemini_model", "manual_override", "migrated_from", "category"}
FIRESTORE_BATCH_LIMIT = 500


def read_json(path: Path) -> Any:
    with open(path, "r") as fh:
        return json.load(fh)


def parse_env_file(path: Path) -> Dict[str, str]:
    if not path.exists():
        return {}
    env: Dict[str, str] = {}
    for line in path.read_text().splitlines():
        trimmed = line.strip()
        if not trimmed or trimmed.startswith("#") or "=" not in trimmed:
            continue
        key, value = trimmed.split("=", 1)
        env[key.strip()] = value.strip().strip("'\"")
    return env


def resolve_service_account_path() -> Optional[Path]:
    env_value = os.environ.get("FIREBASE_ADMIN_KEY_PATH")
    if not env_value:
        env_value = parse_env_file(REPO_ROOT / "admin" / ".env.local").get("FIREBASE_ADMIN_KEY_PATH")
    if not env_value:
        env_value = parse_env_file(REPO_ROOT.parent / "cat_toxin_app" / "admin" / ".env.local").get("FIREBASE_ADMIN_KEY_PATH")
    if not env_value:
        return None
    path = Path(env_value)
    if not path.is_absolute():
        path = (REPO_ROOT / path).resolve()
    return path


def build_l10n_payload(raw: Dict[str, Any]) -> Dict[str, Any]:
    """Extract only the translatable fields from a zh-TW JSON file."""
    symptoms = []
    for s in raw.get("symptoms", []):
        if not isinstance(s, dict):
            continue
        entry: Dict[str, str] = {
            "name": s.get("name", ""),
            "body_system": s.get("body_system", ""),
        }
        if s.get("onset"):
            entry["onset"] = s["onset"]
        symptoms.append(entry)

    return {
        "name": raw.get("name", ""),
        "aliases": raw.get("aliases", []),
        "description": raw.get("description", ""),
        "safetyNotes": raw.get("safetyNotes", []),
        "toxicParts": raw.get("toxicParts", []),
        "symptoms": symptoms,
    }


def load_zh_files(slugs: Optional[List[str]]) -> List[tuple[str, Dict[str, Any]]]:
    if not ZH_DIR.exists():
        print(f"zh-TW directory not found: {ZH_DIR}", file=sys.stderr)
        sys.exit(1)

    if slugs:
        paths = [ZH_DIR / f"{slug}.json" for slug in slugs]
        missing = [p for p in paths if not p.exists()]
        if missing:
            for p in missing:
                print(f"File not found: {p}", file=sys.stderr)
            sys.exit(1)
    else:
        paths = sorted(ZH_DIR.glob("*.json"))

    entries = []
    for path in paths:
        raw = read_json(path)
        if not isinstance(raw, dict):
            print(f"SKIP {path.stem}: not a JSON object", file=sys.stderr)
            continue
        entries.append((path.stem, raw))
    return entries


def upload(entries: List[tuple[str, Dict[str, Any]]], dry_run: bool) -> None:
    try:
        import firebase_admin
        from firebase_admin import credentials, firestore
    except ImportError:
        print("firebase-admin is not installed. pip install firebase-admin", file=sys.stderr)
        sys.exit(1)

    key_path = resolve_service_account_path()
    if not key_path or not key_path.exists():
        print(
            "Service account key not found.\n"
            "Set FIREBASE_ADMIN_KEY_PATH env var or add it to admin/.env.local",
            file=sys.stderr,
        )
        sys.exit(1)

    if not firebase_admin._apps:
        cred = credentials.Certificate(str(key_path))
        firebase_admin.initialize_app(cred)

    db = firestore.client()

    total = len(entries)
    updated = 0
    skipped = 0

    # Process in batches of FIRESTORE_BATCH_LIMIT
    for batch_start in range(0, total, FIRESTORE_BATCH_LIMIT):
        chunk = entries[batch_start : batch_start + FIRESTORE_BATCH_LIMIT]

        if dry_run:
            for slug, raw in chunk:
                payload = build_l10n_payload(raw)
                print(f"  [dry-run] would update toxins/{slug}  l10n.zh-TW.name={payload['name']!r}")
            updated += len(chunk)
            continue

        batch = db.batch()
        for slug, raw in chunk:
            payload = build_l10n_payload(raw)
            ref = db.collection(FIRESTORE_COLLECTION).document(slug)
            batch.update(ref, {f"l10n.{LOCALE}": payload})
            print(f"  queued  toxins/{slug}  ({payload['name']})")

        batch.commit()
        updated += len(chunk)
        print(f"Committed batch {batch_start // FIRESTORE_BATCH_LIMIT + 1} ({len(chunk)} docs)")

    print()
    print(f"Total:   {total}")
    print(f"Updated: {updated}")
    print(f"Skipped: {skipped}")
    if dry_run:
        print("(dry-run — no Firestore writes)")


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Upload zh-TW translations to Firestore l10n.zh-TW.")
    p.add_argument("--dry-run", action="store_true", help="Print what would be uploaded without writing.")
    p.add_argument("--slug", nargs="+", metavar="SLUG", help="Only upload specific slug(s).")
    return p.parse_args()


def main() -> int:
    args = parse_args()
    entries = load_zh_files(args.slug)

    if not entries:
        print("No zh-TW files found.")
        return 1

    print(f"Found {len(entries)} zh-TW translation(s) in {ZH_DIR}")
    if args.dry_run:
        print("--- DRY RUN ---")
    print()

    upload(entries, dry_run=args.dry_run)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
