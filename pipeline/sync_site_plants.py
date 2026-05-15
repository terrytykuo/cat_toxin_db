#!/usr/bin/env python3
"""Sync plant toxin data into mewguard_site and optionally translate it.

This is the bridge implementation for the 2026-05-15 site-sync milestone.
It writes the long-term pipeline cache under data/site/ and emits the current
site data file at ../mewguard_site/src/data/plants.ts.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import signal
import shutil
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Tuple

from paths import DATA_DIR, PROCESSED_PLANTS_DIR, REPO_ROOT


SITE_ROOT = REPO_ROOT.parent / "mewguard_site"
SITE_PLANTS_TS = SITE_ROOT / "src" / "data" / "plants.ts"

SITE_DATA_DIR = DATA_DIR / "site"
EN_DIR = SITE_DATA_DIR / "en"
ZH_DIR = SITE_DATA_DIR / "zh-TW"
GLOSSARY_FILE = SITE_DATA_DIR / "translation_glossary.json"
TRANSLATION_LOG = SITE_DATA_DIR / "translation_log.jsonl"
SYNC_PROGRESS = SITE_DATA_DIR / "sync_progress.json"

GLOSSARY_COLLECTION = "glossary"
GLOSSARY_DOC = "main"
TRANSLATABLE_FIELDS = (
    "name",
    "aliases",
    "description",
    "safetyNotes",
    "toxicParts",
    "symptoms[].name",
    "symptoms[].body_system",
    "symptoms[].onset",
)
SITE_SEVERITIES = {"safe", "cautious", "toxic"}


def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def read_json(path: Path) -> Any:
    with open(path, "r") as fh:
        return json.load(fh)


def atomic_write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    with open(tmp, "w") as fh:
        json.dump(payload, fh, indent=2, ensure_ascii=False, sort_keys=True)
        fh.write("\n")
    os.replace(tmp, path)


def atomic_write_text(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    with open(tmp, "w") as fh:
        fh.write(text)
    os.replace(tmp, path)


def canonical_hash(payload: Any) -> str:
    raw = json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def as_string(value: Any, fallback: str = "") -> str:
    if isinstance(value, str):
        return re.sub(r"\s+", " ", value).strip()
    return fallback


def as_string_list(value: Any) -> List[str]:
    if not isinstance(value, list):
        return []
    cleaned: List[str] = []
    for item in value:
        if isinstance(item, str):
            text = as_string(item)
            if text:
                cleaned.append(text)
    return cleaned


def derive_site_severity(data: Dict[str, Any]) -> str:
    severity = data.get("severity")
    if severity in SITE_SEVERITIES:
        return severity

    is_toxic = data.get("isToxic")
    toxicity_level = as_string(data.get("toxicityLevel")).lower()
    if is_toxic is False:
        return "safe"
    if toxicity_level in {"severe", "high", "fatal"}:
        return "toxic"
    if is_toxic is True:
        return "toxic"
    if toxicity_level in {"low", "mild", "moderate"}:
        return "cautious"
    return "cautious"


def fallback_name(slug: str) -> str:
    return " ".join(part.capitalize() for part in slug.split("_") if part)


def normalize_symptoms(value: Any) -> List[Dict[str, str]]:
    if not isinstance(value, list):
        return []

    symptoms: List[Dict[str, str]] = []
    for item in value:
        if not isinstance(item, dict):
            continue
        name = as_string(item.get("name"))
        if not name:
            continue
        symptom: Dict[str, str] = {
            "name": name,
            "body_system": as_string(item.get("body_system"), "Other") or "Other",
            "severity": as_string(item.get("severity"), "moderate") or "moderate",
        }
        onset = as_string(item.get("onset"))
        if onset:
            symptom["onset"] = onset
        symptoms.append(symptom)
    return symptoms


def build_payload(source_path: Path) -> Dict[str, Any]:
    raw = read_json(source_path)
    if not isinstance(raw, dict):
        raise ValueError(f"{source_path} is not a JSON object")

    slug = source_path.stem
    name = as_string(raw.get("name"), fallback_name(slug))
    payload: Dict[str, Any] = {
        "slug": slug,
        "category": "plant",
        "severity": derive_site_severity(raw),
        "imageUrls": as_string_list(raw.get("imageUrls")),
        "name": name,
        "aliases": as_string_list(raw.get("aliases")),
        "description": as_string(raw.get("description")),
        "safetyNotes": as_string_list(raw.get("safetyNotes")),
        "toxicParts": as_string_list(raw.get("toxicParts")),
        "symptoms": normalize_symptoms(raw.get("symptoms")),
    }

    scientific_name = as_string(raw.get("scientific_name") or raw.get("scientificName"))
    if scientific_name:
        payload["scientificName"] = scientific_name
    return payload


def selected_plant_paths(limit: int) -> List[Path]:
    paths = sorted(PROCESSED_PLANTS_DIR.glob("*.json"))
    return paths[:limit]


def build_english_payloads(limit: int) -> List[Dict[str, Any]]:
    payloads = [build_payload(path) for path in selected_plant_paths(limit)]
    EN_DIR.mkdir(parents=True, exist_ok=True)
    selected_slugs = {payload["slug"] for payload in payloads}

    for payload in payloads:
        atomic_write_json(EN_DIR / f"{payload['slug']}.json", payload)

    for stale in EN_DIR.glob("*.json"):
        if stale.stem not in selected_slugs:
            stale.unlink()

    return payloads


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
        return None
    path = Path(env_value)
    if not path.is_absolute():
        path = (REPO_ROOT / "admin" / path).resolve()
    return path


def export_glossary_from_firestore(required: bool) -> bool:
    key_path = resolve_service_account_path()
    if not key_path or not key_path.exists():
        if required:
            raise RuntimeError("FIREBASE_ADMIN_KEY_PATH is missing or does not point to a file")
        return False

    try:
        import firebase_admin
        from firebase_admin import credentials, firestore
    except ImportError as exc:
        if required:
            raise RuntimeError("firebase-admin is required to export the glossary") from exc
        return False

    if not firebase_admin._apps:
        cred = credentials.Certificate(str(key_path))
        firebase_admin.initialize_app(cred)

    db = firestore.client()
    snap = db.collection(GLOSSARY_COLLECTION).document(GLOSSARY_DOC).get()
    if not snap.exists:
        if required:
            raise RuntimeError("Firestore glossary/main does not exist")
        return False

    data = snap.to_dict() or {}
    glossary = {
        "symptoms_severity": data.get("symptoms_severity") or {},
        "body_system": data.get("body_system") or {},
        "toxic_parts": data.get("toxic_parts") or {},
        "terms": data.get("terms") or {},
    }
    atomic_write_json(GLOSSARY_FILE, glossary)
    return True


def load_glossary() -> Dict[str, Any]:
    if GLOSSARY_FILE.exists():
        data = read_json(GLOSSARY_FILE)
        if isinstance(data, dict):
            return data
    return {"symptoms_severity": {}, "body_system": {}, "toxic_parts": {}, "terms": {}}


def zh_path_for(slug: str) -> Path:
    return ZH_DIR / f"{slug}.json"


def translation_status(payload: Dict[str, Any]) -> Tuple[str, Optional[Dict[str, Any]], str]:
    slug = payload["slug"]
    source_hash = canonical_hash(payload)
    path = zh_path_for(slug)
    if not path.exists():
        return "new", None, source_hash

    try:
        zh = read_json(path)
    except json.JSONDecodeError:
        return "stale", None, source_hash

    if not isinstance(zh, dict):
        return "stale", None, source_hash
    if zh.get("manual_override") is True:
        return "manual_override", zh, source_hash
    if zh.get("source_hash") == source_hash:
        return "current", zh, source_hash
    return "stale", zh, source_hash


def append_translation_log(row: Dict[str, Any]) -> None:
    TRANSLATION_LOG.parent.mkdir(parents=True, exist_ok=True)
    with open(TRANSLATION_LOG, "a") as fh:
        fh.write(json.dumps(row, ensure_ascii=False, sort_keys=True))
        fh.write("\n")


def translation_input(payload: Dict[str, Any]) -> Dict[str, Any]:
    symptoms = []
    for symptom in payload.get("symptoms", []):
        out = {
            "name": symptom.get("name", ""),
            "body_system": symptom.get("body_system", ""),
        }
        if symptom.get("onset"):
            out["onset"] = symptom["onset"]
        symptoms.append(out)

    return {
        "slug": payload["slug"],
        "name": payload.get("name", ""),
        "aliases": payload.get("aliases", []),
        "description": payload.get("description", ""),
        "safetyNotes": payload.get("safetyNotes", []),
        "toxicParts": payload.get("toxicParts", []),
        "symptoms": symptoms,
    }


def build_translation_prompt(batch: List[Dict[str, Any]], glossary: Dict[str, Any]) -> str:
    input_items = [translation_input(payload) for payload in batch]
    fields = ", ".join(TRANSLATABLE_FIELDS)
    return (
        "You are translating a cat toxin dictionary for a Taiwan Traditional Chinese audience.\n"
        "Return only valid JSON. Do not include markdown fences, comments, explanations, or extra keys.\n"
        "Translate from English to Traditional Chinese (zh-TW), using natural veterinary wording.\n"
        "Use the glossary exactly when an English term appears. Keep plant scientific names in Latin.\n"
        "Do not translate enum-like severity values because they are not included in this input.\n"
        f"Translate only these fields: {fields}.\n"
        "Return a JSON array with the same length, order, slugs, and object shape as the input.\n\n"
        "Glossary JSON:\n"
        f"{json.dumps(glossary, ensure_ascii=False, sort_keys=True)}\n\n"
        "Input JSON array:\n"
        f"{json.dumps(input_items, ensure_ascii=False, sort_keys=True)}"
    )


ANSI_RE = re.compile(r"\x1b\[[0-9;]*m")


def strip_ansi(value: str) -> str:
    return ANSI_RE.sub("", value)


def parse_json_response(raw: str) -> Any:
    text = strip_ansi(raw).strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text).strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        start = text.find("[")
        end = text.rfind("]")
        if start != -1 and end != -1 and end > start:
            return json.loads(text[start : end + 1])
        raise


def run_gemini(
    gemini_bin: str,
    prompt: str,
    timeout_seconds: int,
    model: Optional[str],
) -> Tuple[Any, str, int]:
    cmd = [gemini_bin]
    if model:
        cmd.extend(["--model", model])
    # The user's Gemini config may start local MCP servers. Translation only
    # needs model text, and disabling MCP avoids startup hangs in headless mode.
    cmd.extend(["--allowed-mcp-server-names", "none"])
    cmd.extend(["--prompt", prompt, "--output-format", "text"])

    started = time.time()
    process = subprocess.Popen(
        cmd,
        cwd=str(REPO_ROOT),
        stdin=subprocess.DEVNULL,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        start_new_session=True,
    )
    try:
        stdout, stderr = process.communicate(timeout=timeout_seconds)
    except subprocess.TimeoutExpired as exc:
        try:
            os.killpg(process.pid, signal.SIGTERM)
            stdout, stderr = process.communicate(timeout=5)
        except Exception:
            os.killpg(process.pid, signal.SIGKILL)
            stdout, stderr = process.communicate()
        raise RuntimeError(f"gemini timed out after {timeout_seconds} seconds") from exc

    duration_ms = int((time.time() - started) * 1000)
    raw = stdout.strip()
    if process.returncode != 0:
        raise RuntimeError((stderr or raw or f"gemini exited {process.returncode}").strip())
    return parse_json_response(raw), raw, duration_ms


def validate_translated_entry(
    source: Dict[str, Any],
    translated: Any,
    source_hash: str,
    model_name: str,
) -> Dict[str, Any]:
    if not isinstance(translated, dict):
        raise ValueError("translated entry is not an object")
    if translated.get("slug") != source["slug"]:
        raise ValueError(f"slug mismatch: expected {source['slug']}, got {translated.get('slug')}")

    symptoms = translated.get("symptoms")
    source_symptoms = source.get("symptoms", [])
    if not isinstance(symptoms, list) or len(symptoms) != len(source_symptoms):
        raise ValueError("symptoms length mismatch")

    normalized_symptoms: List[Dict[str, str]] = []
    for index, symptom in enumerate(symptoms):
        if not isinstance(symptom, dict):
            raise ValueError(f"symptom {index} is not an object")
        out = {
            "name": as_string(symptom.get("name")),
            "body_system": as_string(symptom.get("body_system")),
        }
        if not out["name"] or not out["body_system"]:
            raise ValueError(f"symptom {index} has empty translated fields")
        onset = as_string(symptom.get("onset"))
        if onset:
            out["onset"] = onset
        normalized_symptoms.append(out)

    payload = {
        "slug": source["slug"],
        "source_hash": source_hash,
        "translated_at": utc_now(),
        "gemini_model": model_name,
        "manual_override": False,
        "name": as_string(translated.get("name")),
        "aliases": as_string_list(translated.get("aliases")),
        "description": as_string(translated.get("description")),
        "safetyNotes": as_string_list(translated.get("safetyNotes")),
        "toxicParts": as_string_list(translated.get("toxicParts")),
        "symptoms": normalized_symptoms,
    }
    if not payload["name"]:
        raise ValueError("name is empty")
    if source.get("description") and not payload["description"]:
        raise ValueError("description is empty")
    return payload


def write_error(slug: str, raw_response: str, error: str) -> None:
    path = zh_path_for(slug).with_suffix(".json.error")
    atomic_write_text(path, f"{error}\n\n--- raw response ---\n{raw_response}\n")


def translate_pending(
    payloads: List[Dict[str, Any]],
    limit: int,
    batch_size: int,
    gemini_bin: str,
    timeout_seconds: int,
    model: Optional[str],
) -> Dict[str, int]:
    ZH_DIR.mkdir(parents=True, exist_ok=True)
    glossary = load_glossary()
    pending: List[Tuple[str, Dict[str, Any], str]] = []
    skipped = 0

    for payload in payloads:
        status, _zh, source_hash = translation_status(payload)
        if status in {"current", "manual_override"}:
            skipped += 1
            continue
        pending.append((status, payload, source_hash))

    selected = pending[:limit]
    translated_count = 0
    failed_count = 0
    model_name = model or "gemini-cli-default"

    for offset in range(0, len(selected), batch_size):
        chunk = selected[offset : offset + batch_size]
        batch_payloads = [item[1] for item in chunk]
        batch_id = int(time.time() * 1000)
        prompt = build_translation_prompt(batch_payloads, glossary)
        started_at = utc_now()
        try:
            translated, raw_response, duration_ms = run_gemini(
                gemini_bin=gemini_bin,
                prompt=prompt,
                timeout_seconds=timeout_seconds,
                model=model,
            )
            if not isinstance(translated, list) or len(translated) != len(chunk):
                raise ValueError("Gemini response must be an array matching the batch length")
        except Exception as exc:
            failed_count += len(chunk)
            raw = locals().get("raw_response", "")
            for status, payload, _source_hash in chunk:
                write_error(payload["slug"], raw, str(exc))
                append_translation_log(
                    {
                        "ts": utc_now(),
                        "slug": payload["slug"],
                        "action": "failed",
                        "source_action": status,
                        "error": str(exc),
                        "batch_id": batch_id,
                    }
                )
            continue

        for index, (status, payload, source_hash) in enumerate(chunk):
            try:
                zh_payload = validate_translated_entry(payload, translated[index], source_hash, model_name)
                atomic_write_json(zh_path_for(payload["slug"]), zh_payload)
                error_path = zh_path_for(payload["slug"]).with_suffix(".json.error")
                if error_path.exists():
                    error_path.unlink()
                translated_count += 1
                append_translation_log(
                    {
                        "ts": started_at,
                        "slug": payload["slug"],
                        "action": status,
                        "duration_ms": duration_ms,
                        "batch_id": batch_id,
                    }
                )
            except Exception as exc:
                failed_count += 1
                write_error(payload["slug"], raw_response, str(exc))
                append_translation_log(
                    {
                        "ts": utc_now(),
                        "slug": payload["slug"],
                        "action": "failed",
                        "source_action": status,
                        "error": str(exc),
                        "batch_id": batch_id,
                    }
                )

    return {
        "pending_before_limit": len(pending),
        "selected": len(selected),
        "skipped": skipped,
        "translated": translated_count,
        "failed": failed_count,
    }


def valid_cached_translation(payload: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    status, zh, source_hash = translation_status(payload)
    if status == "manual_override" and zh:
        return zh
    if status == "current" and zh and zh.get("source_hash") == source_hash:
        return zh
    return None


def translated_symptom_names(payload: Dict[str, Any], zh: Optional[Dict[str, Any]]) -> List[str]:
    en_symptoms = payload.get("symptoms", [])
    if not zh:
        return [symptom.get("name", "") for symptom in en_symptoms]
    zh_symptoms = zh.get("symptoms")
    if not isinstance(zh_symptoms, list) or len(zh_symptoms) != len(en_symptoms):
        return [symptom.get("name", "") for symptom in en_symptoms]
    names = [as_string(symptom.get("name")) for symptom in zh_symptoms if isinstance(symptom, dict)]
    if len(names) != len(en_symptoms) or any(not name for name in names):
        return [symptom.get("name", "") for symptom in en_symptoms]
    return names


def site_entry(payload: Dict[str, Any]) -> Dict[str, Any]:
    zh = valid_cached_translation(payload)
    entry: Dict[str, Any] = {
        "id": payload["slug"],
        "category": "plant",
        "severity": payload["severity"],
        "emoji": "🌿",
        "name": {
            "zh-TW": as_string(zh.get("name")) if zh else payload["name"],
            "en": payload["name"],
        },
        "symptoms": {
            "zh-TW": translated_symptom_names(payload, zh),
            "en": [symptom.get("name", "") for symptom in payload.get("symptoms", [])],
        },
        "description": {
            "zh-TW": as_string(zh.get("description")) if zh else payload.get("description", ""),
            "en": payload.get("description", ""),
        },
    }
    if payload.get("scientificName"):
        entry["scientificName"] = payload["scientificName"]
    return entry


def emit_site_plants(payloads: List[Dict[str, Any]]) -> None:
    entries = [site_entry(payload) for payload in payloads]
    rendered = json.dumps(entries, ensure_ascii=False, indent=2)
    text = (
        "import type { ToxinEntry } from './types';\n\n"
        "// Generated by ../../cat_toxin_db/pipeline/sync_site_plants.py.\n"
        "// Do not edit by hand; edit source JSON/glossary and rerun the sync.\n"
        f"export const plants: ToxinEntry[] = {rendered};\n"
    )
    atomic_write_text(SITE_PLANTS_TS, text)


def count_current_translations(payloads: List[Dict[str, Any]]) -> int:
    return sum(1 for payload in payloads if valid_cached_translation(payload) is not None)


def first_pending_index(payloads: List[Dict[str, Any]]) -> Optional[int]:
    for index, payload in enumerate(payloads, start=1):
        status, _zh, _source_hash = translation_status(payload)
        if status not in {"current", "manual_override"}:
            return index
    return None


def write_progress(
    payloads: List[Dict[str, Any]],
    glossary_exported: bool,
    emitted_site: bool,
    translation_result: Optional[Dict[str, int]],
    args: argparse.Namespace,
) -> None:
    current = count_current_translations(payloads)
    first_pending = first_pending_index(payloads)
    progress = {
        "updated_at": utc_now(),
        "plant_limit": args.plant_limit,
        "selected_count": len(payloads),
        "selected_slugs": [payload["slug"] for payload in payloads],
        "english_payload_dir": str(EN_DIR),
        "zh_cache_dir": str(ZH_DIR),
        "glossary_file": str(GLOSSARY_FILE),
        "glossary_exported": glossary_exported,
        "site_plants_file": str(SITE_PLANTS_TS),
        "site_emitted": emitted_site,
        "translation": {
            "current_count": current,
            "pending_count": len(payloads) - current,
            "first_pending_index": first_pending,
            "first_pending_slug": payloads[first_pending - 1]["slug"] if first_pending else None,
            "last_run": translation_result or {
                "pending_before_limit": None,
                "selected": 0,
                "skipped": None,
                "translated": 0,
                "failed": 0,
            },
        },
    }
    atomic_write_json(SYNC_PROGRESS, progress)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Sync plant toxin data to mewguard_site.")
    parser.add_argument("--plant-limit", type=int, default=100, help="Number of sorted plant JSON files to sync.")
    parser.add_argument("--translate-limit", type=int, default=0, help="Maximum pending entries to translate this run.")
    parser.add_argument("--batch-size", type=int, default=5, help="Gemini entries per batch.")
    parser.add_argument("--emit-site", action="store_true", help="Write ../mewguard_site/src/data/plants.ts.")
    parser.add_argument("--skip-glossary-export", action="store_true", help="Use existing translation_glossary.json.")
    parser.add_argument("--gemini-bin", default=shutil.which("gemini") or "/opt/homebrew/bin/gemini")
    parser.add_argument("--gemini-model", default=None, help="Optional Gemini model name to pass to the CLI.")
    parser.add_argument("--gemini-timeout", type=int, default=300, help="Per-batch timeout in seconds.")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if args.plant_limit <= 0:
        print("--plant-limit must be positive", file=sys.stderr)
        return 2
    if args.translate_limit < 0:
        print("--translate-limit cannot be negative", file=sys.stderr)
        return 2
    if args.batch_size <= 0:
        print("--batch-size must be positive", file=sys.stderr)
        return 2

    payloads = build_english_payloads(args.plant_limit)

    glossary_exported = False
    if not args.skip_glossary_export:
        glossary_exported = export_glossary_from_firestore(required=args.translate_limit > 0)

    translation_result: Optional[Dict[str, int]] = None
    if args.translate_limit > 0:
        if not Path(args.gemini_bin).exists() and shutil.which(args.gemini_bin) is None:
            print(f"Gemini CLI not found: {args.gemini_bin}", file=sys.stderr)
            return 2
        translation_result = translate_pending(
            payloads=payloads,
            limit=args.translate_limit,
            batch_size=args.batch_size,
            gemini_bin=args.gemini_bin,
            timeout_seconds=args.gemini_timeout,
            model=args.gemini_model,
        )

    if args.emit_site:
        emit_site_plants(payloads)

    write_progress(
        payloads=payloads,
        glossary_exported=glossary_exported,
        emitted_site=args.emit_site,
        translation_result=translation_result,
        args=args,
    )

    current = count_current_translations(payloads)
    print(f"English payloads: {len(payloads)}")
    print(f"Current translations: {current}/{len(payloads)}")
    if translation_result:
        print(
            "Translation run: "
            f"selected={translation_result['selected']} "
            f"translated={translation_result['translated']} "
            f"failed={translation_result['failed']} "
            f"pending_before_limit={translation_result['pending_before_limit']}"
        )
    if args.emit_site:
        print(f"Site plants emitted: {SITE_PLANTS_TS}")
    print(f"Progress: {SYNC_PROGRESS}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
