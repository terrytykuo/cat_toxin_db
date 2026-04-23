# cat_toxin_db

Data pipeline and admin UI for the cat toxin database.

## Layout

```
schemas/   # Single source of truth for the toxin shape (Zod → JSON Schema)
admin/     # Local-only React + Express UI for editing Firestore records
data/      # Raw + processed JSON per plant/food
docs/      # Pipeline design & plan docs
```

Python scripts at the repo root (`batch_collect.py`, `process_plants.py`, `verify_*.py`) drive NotebookLM collection and JSON processing. They will move into `pipeline/` in PR 4 of the unify-pipeline plan.

## Admin UI

See [`admin/README.md`](admin/README.md). Quick start:

```bash
cp .env.example .env.local                 # FIREBASE_STORAGE_BUCKET
cp admin/.env.example admin/.env.local     # ADMIN_SECRET + FIREBASE_ADMIN_KEY_PATH
cd admin && npm install && npm run dev
```

Then open `http://127.0.0.1:5173`.

## Schemas

Zod-authored schema lives in `schemas/toxin.zod.ts`. TS types and JSON Schema are generated artefacts:

```bash
npm run build:schemas   # regenerate
npm run check:schemas   # exit non-zero if stale
```

## Unify-pipeline plan

Ongoing refactor tracked in [`docs/plans/2026-04-22-unify-data-pipeline-prs.md`](docs/plans/2026-04-22-unify-data-pipeline-prs.md).
