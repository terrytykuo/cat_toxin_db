#!/usr/bin/env python3
"""
clean_plants.py — Use OpenAI API (gpt-4o-mini) to clean messy text in processed plant JSON files.

Reads from:  data/plants_processed/
Writes to:   data/plants_cleaned/
Progress:    data/clean_progress.json

Requires: OPENAI_API_KEY in environment or .env file.

Usage:
  python3 clean_plants.py               # process next batch of 10
  python3 clean_plants.py --batch-size 5
  python3 clean_plants.py --status      # show progress only
  python3 clean_plants.py --retry-failed
"""

import json
import sys
import argparse
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

from openai import OpenAI

PROCESSED_DIR = Path("data/plants_processed")
CLEANED_DIR = Path("data/plants_cleaned")
PROGRESS_FILE = Path("data/clean_progress.json")
DEFAULT_BATCH = 10

SYSTEM_PROMPT = """\
You are a data cleaning assistant for a veterinary toxicology database.
You will receive a JSON array of plant toxicity records.

Clean ALL string fields in every record by applying these rules:

1. INLINE CITATIONS — remove superscript-style numbers embedded in text.
   e.g. "inhibits protein synthesis1." → "inhibits protein synthesis."
   e.g. "gastrointestinal signs1, which" → "gastrointestinal signs, which"

2. BULLET CHARACTERS — remove leading •, ◦, –, → at the start of lines.
   Replace with plain text (keep the sentence, just remove the symbol).

3. BOILERPLATE NON-ANSWERS — replace the entire field value with null when
   the text is a placeholder like:
   - "Not provided in the given sources."
   - "Not specified in the provided sources."
   - "No information available."
   - Any variation of "not mentioned / not detailed / not stated in the sources"

4. REDUNDANT PREFIXES — strip these prefixes from field values:
   - "in cats: " at the start of toxin descriptions
   - "Brief Description (Appearance, Habitat, and Where Commonly Found)\n"
   - "Brief Description:\n"
   - "Brief Description: "

5. PRESERVE everything else exactly — scientific names, dosages, medical terms,
   factual sentences, severity levels, body systems.

Return a JSON array with EXACTLY the same number of records in the same order.
Each record must keep the exact same structure and keys as the input.
Output ONLY the JSON array, no commentary."""


def load_progress() -> dict:
    if PROGRESS_FILE.exists():
        return json.loads(PROGRESS_FILE.read_text())
    return {"completed": [], "failed": []}


def save_progress(progress: dict):
    PROGRESS_FILE.write_text(json.dumps(progress, indent=2, ensure_ascii=False))


def get_all_files() -> list[Path]:
    return sorted(PROCESSED_DIR.glob("*.json"))


def get_pending(progress: dict) -> list[Path]:
    done = set(progress["completed"])
    return [f for f in get_all_files() if f.name not in done]


def get_failed(progress: dict) -> list[Path]:
    return [PROCESSED_DIR / name for name in progress["failed"]
            if (PROCESSED_DIR / name).exists()]


def print_status(progress: dict):
    all_files = get_all_files()
    total = len(all_files)
    done = len(progress["completed"])
    failed = len(progress["failed"])
    pending = total - done
    print(f"Total:     {total}")
    print(f"Cleaned:   {done}")
    print(f"Pending:   {pending}")
    print(f"Failed:    {failed}")
    if progress["failed"]:
        print("Failed files:")
        for name in progress["failed"]:
            print(f"  {name}")


def clean_batch(client: OpenAI, files: list[Path]) -> list[dict]:
    records = [json.loads(f.read_text()) for f in files]

    response = client.chat.completions.create(
        model="gpt-4o",
        max_tokens=16000,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {
                "role": "user",
                "content": (
                    f"Clean these {len(records)} plant records and return the cleaned JSON array:\n\n"
                    + json.dumps(records, indent=2, ensure_ascii=False)
                ),
            },
        ],
    )

    raw = response.choices[0].message.content.strip()

    # Extract JSON array robustly
    start = raw.find("[")
    end = raw.rfind("]") + 1
    if start == -1 or end == 0:
        raise ValueError(f"No JSON array found in response. Response starts with: {raw[:200]!r}")

    cleaned = json.loads(raw[start:end])

    if len(cleaned) != len(records):
        raise ValueError(
            f"Record count mismatch: sent {len(records)}, got {len(cleaned)}"
        )

    return cleaned


def main():
    parser = argparse.ArgumentParser(description="Clean processed plant JSON via OpenAI API")
    parser.add_argument("--batch-size", type=int, default=DEFAULT_BATCH,
                        help=f"Files per API call (default: {DEFAULT_BATCH})")
    parser.add_argument("--status", action="store_true",
                        help="Show progress and exit")
    parser.add_argument("--retry-failed", action="store_true",
                        help="Retry previously failed files")
    args = parser.parse_args()

    CLEANED_DIR.mkdir(exist_ok=True)
    progress = load_progress()

    if args.status:
        print_status(progress)
        return

    if args.retry_failed:
        batch = get_failed(progress)[:args.batch_size]
        # Remove from failed list so they can be retried
        retry_names = {f.name for f in batch}
        progress["failed"] = [n for n in progress["failed"] if n not in retry_names]
        save_progress(progress)
    else:
        batch = get_pending(progress)[:args.batch_size]

    if not batch:
        print("Nothing to process. Run with --status to see progress.")
        return

    total = len(get_all_files())
    done_before = len(progress["completed"])
    print(f"Processing {len(batch)} files  ({done_before}/{total} already done)")
    print()

    client = OpenAI()

    try:
        cleaned_records = clean_batch(client, batch)
    except Exception as e:
        print(f"ERROR during API call: {e}")
        for f in batch:
            if f.name not in progress["failed"]:
                progress["failed"].append(f.name)
        save_progress(progress)
        sys.exit(1)

    errors = []
    for f, record in zip(batch, cleaned_records):
        try:
            out_path = CLEANED_DIR / f.name
            out_path.write_text(json.dumps(record, indent=2, ensure_ascii=False))
            progress["completed"].append(f.name)
            progress["failed"] = [n for n in progress["failed"] if n != f.name]
            print(f"  ✓  {f.name}")
        except Exception as e:
            errors.append(f.name)
            print(f"  ✗  {f.name}: {e}")

    if errors:
        progress["failed"].extend(errors)

    save_progress(progress)

    done_after = len(progress["completed"])
    remaining = total - done_after
    print()
    print(f"Batch done. {done_after}/{total} cleaned, {remaining} remaining.")
    if progress["failed"]:
        print(f"Failed: {len(progress['failed'])} files — run with --retry-failed")


if __name__ == "__main__":
    main()
