# Site Sync + Translation Runbook

**Last updated:** 2026-05-15

This runbook explains the current handoff-safe flow for syncing plant toxin data from `cat_toxin_db` into `mewguard_site`, translating entries with Gemini CLI, and resuming from recorded progress.

The long-term design is in `docs/plans/2026-05-15-mewguard-site-sync-pipeline-design.md`. The current implementation is a bridge: it writes the pipeline cache under `cat_toxin_db/data/site/` and emits the generated plants into the existing site file `../mewguard_site/src/data/plants.ts`, because the Astro content-collection migration is not wired yet.

## Source And Outputs

Source data:

- Plants: `data/plants_processed/*.json`
- Glossary: Firestore `glossary/main`, exported to `data/site/translation_glossary.json`
- Gemini CLI: `/opt/homebrew/bin/gemini`

Generated pipeline files:

- `data/site/en/{slug}.json` — English site payload, one file per plant
- `data/site/zh-TW/{slug}.json` — translation cache, one file per translated plant
- `data/site/translation_log.jsonl` — append-only translation progress and failures
- `data/site/sync_progress.json` — latest run summary and selected slug order

Generated site file:

- `../mewguard_site/src/data/plants.ts` — current Astro pages read this directly

## Selection Rule

Until the product owner requests a curated order, choose plants deterministically by filename:

1. Sort `data/plants_processed/*.json` alphabetically.
2. Take the first `--plant-limit` entries.
3. Preserve that order for translation and site emission.

For the 2026-05-15 milestone, use `--plant-limit 100`.

## Sync English Data

Run from `cat_toxin_db`:

```bash
python3 pipeline/sync_site_plants.py --plant-limit 100 --emit-site
```

This does four things:

1. Clears the old hand-written site plant array by replacing `../mewguard_site/src/data/plants.ts`.
2. Writes 100 normalized English payloads to `data/site/en/`.
3. Exports the latest glossary from Firestore into `data/site/translation_glossary.json` when `admin/.env.local` has `FIREBASE_ADMIN_KEY_PATH`.
4. Emits the site data with zh-TW falling back to English for untranslated entries.

The English payload intentionally excludes app-only or emergency fields that the website does not render: `family`, `chemicals`, `treatments`, `emergencyNote`, `isToxic`, and `toxicityLevel`.

## Translate With Gemini CLI

Run from `cat_toxin_db`:

```bash
python3 pipeline/sync_site_plants.py --plant-limit 100 --translate-limit 10 --emit-site
```

Translation behavior:

- Batch size defaults to 5 entries per Gemini call.
- The script passes `--allowed-mcp-server-names none` to Gemini CLI so local MCP startup cannot block headless translation.
- The script injects `data/site/translation_glossary.json` into the prompt.
- Gemini must return a JSON array in the same order and length as the batch.
- Only these fields are translated:
  - `name`
  - `aliases`
  - `description`
  - `safetyNotes`
  - `toxicParts`
  - `symptoms[].name`
  - `symptoms[].body_system`
  - `symptoms[].onset`
- These fields stay in English/enums and are merged from the English file:
  - `category`
  - `severity`
  - `scientificName`
  - `symptoms[].severity`

Each translated entry is written atomically to `data/site/zh-TW/{slug}.json` with:

- `source_hash`
- `translated_at`
- `gemini_model`
- `manual_override`

After translation, the script re-emits `../mewguard_site/src/data/plants.ts`. The first translated entries show zh-TW text; the rest use English fallback in the zh-TW fields.

## Resume And Progress

To continue after the first 10 entries, run:

```bash
python3 pipeline/sync_site_plants.py --plant-limit 100 --translate-limit 10 --emit-site
```

Already translated entries are skipped when their `source_hash` matches the English payload. With the first 10 complete, the same command translates entries 11-20.

Useful checks:

```bash
jq '.translation' data/site/sync_progress.json
tail -20 data/site/translation_log.jsonl
find data/site/zh-TW -maxdepth 1 -name '*.json' | wc -l
```

If a human edits a zh-TW cache file and wants to keep it, set:

```json
"manual_override": true
```

The script will never overwrite manual overrides.

## Failure Handling

If Gemini returns invalid JSON, mismatched batch length, or an invalid entry, the script:

1. Writes a `.json.error` file next to the affected zh-TW cache path.
2. Appends a `failed` row to `data/site/translation_log.jsonl`.
3. Continues with later batches when possible.

After fixing the issue, rerun the same command. Entries without a matching valid cache are picked up again.

## Build Check

After syncing or translating, verify the site:

```bash
cd ../mewguard_site
npm run build
```

The current site pages import `src/data/plants.ts`; the content collection flow remains the target architecture but is not required for this milestone.
