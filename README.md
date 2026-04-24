# cat_toxin_db

Data pipeline, schemas, and admin UI for the cat toxin database. Firestore is the system of record; processed JSON on disk is the canonical mirror.

## End-to-end flow

```
NotebookLM       batch_collect     process_plants    admin UI           dump_firestore
(sources)   ─▶   raw JSON      ─▶  processed JSON ─▶ Firestore    ─▶    processed JSON
                 data/plants/      data/plants_processed/           data/plants_processed/
                                                       (double-write)
```

1. **Collect** raw answers from NotebookLM into `data/{plants,foods}/*.json` via `pipeline/batch_collect.py` / `pipeline/batch_collect_food.py`.
2. **Process** raw → validated canonical JSON in `data/{plants,foods}_processed/` via `pipeline/process_plants.py` / `pipeline/process_foods.py` (validates against `schemas/toxin.disk.schema.json`).
3. **Seed / edit** through the admin UI (`admin/`). Each save writes Firestore, then atomic-writes the disk JSON — no reverse sync.
4. **Snapshot** Firestore back to disk with `pipeline/dump_firestore.py` when reconciling.

## Layout

```
schemas/   # Zod source of truth + generated JSON Schema
pipeline/  # Python + JS scripts (collect, process, verify, dump)
admin/     # Local-only React + Express UI (double-writes Firestore → disk JSON)
data/      # Raw + processed JSON per plant/food
docs/      # Pipeline design & plan docs
```

## Adding a new plant

1. Add the plant to `data/plants_list.md` (or the food equivalent).
2. Run `python3 pipeline/batch_collect.py` to interview NotebookLM — writes `data/plants/<slug>.json`.
3. Run `python3 pipeline/process_plants.py` — validates and writes `data/plants_processed/<slug>.json`.
4. Run `python3 pipeline/verify_plants.py` for the 3-tier audit.
5. Seed to Firestore via the admin UI (upload image, tweak copy, save).

See [`docs/DATA_COLLECTION_PIPELINE.md`](docs/DATA_COLLECTION_PIPELINE.md) for the full NotebookLM interview protocol.

## Admin UI

See [`admin/README.md`](admin/README.md). Quick start:

```bash
cp .env.example .env.local                 # FIREBASE_STORAGE_BUCKET
cp admin/.env.example admin/.env.local     # ADMIN_SECRET + FIREBASE_ADMIN_KEY_PATH
cd admin && npm install && npm run dev
```

Then open `http://127.0.0.1:5173`.

## Schemas

Zod-authored schema lives in `schemas/toxin.zod.ts`; TS types and JSON Schemas (Firestore + disk shapes) are generated:

```bash
npm run build:schemas   # regenerate
npm run check:schemas   # exit non-zero if stale
```

See [`schemas/README.md`](schemas/README.md) for the `FIRESTORE_ONLY_FIELDS` policy.

## Firestore snapshots

Periodically dump Firestore to disk to catch drift between the admin UI and the JSON mirror:

```bash
FIREBASE_ADMIN_KEY_PATH=/abs/path/to/service-account.json \
  python3 pipeline/dump_firestore.py
```

Strips `FIRESTORE_ONLY_FIELDS`, validates each doc against `schemas/toxin.disk.schema.json`, and atomic-writes to `data/{plants,foods}_processed/`. An empty `git diff` afterwards means Firestore and disk are in sync.

## Unify-pipeline plan

Refactor tracked in [`docs/plans/2026-04-22-unify-data-pipeline-prs.md`](docs/plans/2026-04-22-unify-data-pipeline-prs.md).
