# AGENTS.md — cat_toxin_db

Mirror of [`CLAUDE.md`](CLAUDE.md). Same content; this file exists so agents that look for `AGENTS.md` find it. **Edit both together.**

Quick navigation for agents. **Read `docs/SITE_SYNC_HANDOFF.md` and `docs/SITE_SYNC_RUNBOOK.md` if the current task is anything about syncing data to `mewguard_site` or translating to zh-TW** — they capture the current bridge workflow and progress so you don't have to repeat it.

## Repo role

System of record for the cat toxin database. Firestore is the live store; processed JSON on disk is the canonical mirror.

End-to-end flow lives in [`README.md`](README.md):

```
NotebookLM → batch_collect → process_plants → admin UI ↔ Firestore → dump_firestore
                                                          ↘ data/{plants,foods}_processed/*.json
```

## Where things live

| Concern | Path |
|---|---|
| Schemas (Zod source) | `schemas/toxin.zod.ts`, `schemas/glossary.zod.ts` |
| Generated JSON schemas | `schemas/toxin.disk.schema.json`, `schemas/glossary.schema.json` |
| Processed data (disk mirror) | `data/plants_processed/*.json` (198), `data/foods_processed/*.json` (57) |
| Pipeline scripts | `pipeline/*.py` (collect, process, verify, dump) and `pipeline/seed_firestore.js` |
| Admin UI (React) | `admin/src/` — App.tsx, ToxinEditor.tsx, ToxinsView.tsx, **GlossaryEditor.tsx** |
| Admin server (Express) | `admin/server.js` — toxin endpoints (line 142+), glossary endpoints (line 342+) |
| Plans & design docs | `docs/plans/` |
| Handoff for site-sync task | `docs/SITE_SYNC_HANDOFF.md` |
| Progress log | `PROGRESS.md`; site translation progress is under `data/site/` |

## Schema sync invariant

`schemas/toxin.zod.ts` is the source of truth. `cat_toxin_app` and (future) `mewguard_site` keep **read-only copies** + a `SCHEMA_VERSION` hash and CI fails on drift. When you edit the schema:

1. Edit `schemas/toxin.zod.ts` here, run `npm run build:schemas` (in `schemas/`).
2. Copy `toxin.types.ts` and `toxin.zod.ts` into the consumer repos (`cat_toxin_app/types/`, `mewguard_site/src/lib/` once that exists).
3. Regenerate the consumer's `SCHEMA_VERSION` (`cat path1 path2 | shasum -a 256 | awk '{print $1}'`).

## Field policy

`FIRESTORE_ONLY_FIELDS` (`id`, `imageUrls`, `imageUrl`, `hidden`, `curatedList`) never appear in processed JSON on disk. The admin UI's double-write strips them; `dump_firestore.py` strips them on the way out. See `admin/lib/field-policy.js`.

## Glossary

- Firestore: `glossary/main` doc.
- Edited via admin UI's **Glossary tab** (`admin/src/GlossaryEditor.tsx`).
- Four buckets: `symptoms_severity` (fixed enum), `body_system` (auto-synced from toxins), `toxic_parts` (auto-synced from toxins), `terms` (free-form).
- The "Sync from toxins" button diffs the live toxin docs against the glossary and adds missing keys.
- Used by the site translation pipeline (see handoff doc) to keep zh-TW terminology consistent.

## Common commands

```bash
# Snapshot Firestore back to disk (after admin UI edits)
FIREBASE_ADMIN_KEY_PATH=/abs/path/sa.json python3 pipeline/dump_firestore.py

# Schema check
cd schemas && npm run check:schemas

# Run admin UI (Express + Vite, both on 127.0.0.1)
cd admin && npm run dev
```

## Active work

**Site sync pipeline** — design locked in `docs/plans/2026-05-15-mewguard-site-sync-pipeline-design.md`. Bridge script implemented at `pipeline/sync_site_plants.py`; runbook is `docs/SITE_SYNC_RUNBOOK.md`. Current milestone: 100 English plants emitted to `mewguard_site/src/data/plants.ts`, first 10 translated, next pending index 11 in `data/site/sync_progress.json`.
