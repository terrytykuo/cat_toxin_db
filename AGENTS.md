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
| Site sync handoff/runbook | `docs/SITE_SYNC_HANDOFF.md`, `docs/SITE_SYNC_RUNBOOK.md` |
| Site sync caches | `data/site/en/`, `data/site/zh-TW/`, `data/site/firestore/{en,zh-TW}/`, `data/site/translation_glossary.json` |
| Progress log | `PROGRESS.md`; current site/firestore cache work is also reflected by dirty files under `data/site/` |

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

**Toxin content localization + site cache reconciliation** — the old 100-plant `pipeline/sync_site_plants.py` milestone is historical. Current site generation is driven from sibling `../mewguard_site` by `scripts/sync-firestore-toxin-data.mjs`, which reads Firestore and writes cache/progress under this repo's `data/site/firestore/` before emitting `../mewguard_site/src/data/toxins.generated.ts`.

Current dirty-state notes (2026-06):

- A large local toxin-content diff exists across canonical processed JSON (`data/{plants,foods}_processed/`), legacy site cache (`data/site/{en,zh-TW}/`), Firestore-shaped cache (`data/site/firestore/{en,zh-TW}/`), and `data/site/translation_glossary.json`; current status also includes many untracked `data/site/*` entries and untracked `admin/scripts/`.
- The latest recorded batch in `PROGRESS.md` is S-Z description simplification + zh-TW localization, followed by a targeted live Firestore sync for Admin UI review.
- Do not treat `data/site/firestore/*` as proof of live Firestore state by itself; it is local cache/snapshot unless a Firestore read-back/upload command is recorded in `PROGRESS.md`.
- Before committing generated site artifacts in `../mewguard_site`, reconcile this repo's dirty cache/progress files with `../mewguard_site/src/data/toxins.generated.ts`.
