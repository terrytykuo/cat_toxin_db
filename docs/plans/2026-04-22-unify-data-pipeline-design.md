# Unify Data Pipeline — Design

**Date:** 2026-04-22
**Status:** Approved, ready for implementation
**Scope:** Consolidate data pipeline from `cat_toxin_app` into `cat_toxin_db`

---

## Background

Currently, data work is split across two repositories:

- **`cat_toxin_db`** — NotebookLM collection (Python), raw + processed JSON, unused Cloudflare Workers API + Postgres schema
- **`cat_toxin_app`** — Production Expo app (Firestore), `scripts/` for transform/seed/migration, `admin/` web UI for live editing

Adding a single new plant currently requires switching between repos, running Python in one and JS in the other, and the schemas are not aligned. The processed JSON in `cat_toxin_db` has drifted from production Firestore because the admin UI writes only to Firestore.

---

## Goals

1. Single data pipeline lives in `cat_toxin_db`
2. One schema source of truth, consumed by both repos
3. Admin UI edits flow back to processed JSON, so JSON stays aligned with Firestore
4. Production app behaviour unchanged during and after migration

---

## Architecture

### Pipeline (linear, one repo)

```
NotebookLM
    │  batch_collect.py
    ▼
data/plants/<name>.json            (raw — kept for audit + LLM skill input)
    │  process_plants.py
    │    └─ validates against toxin.schema.json
    ▼
data/plants_processed/<name>.json  (normalized — git-tracked, source for re-seed)
    │  seed_firestore.py
    ▼
Firestore                          (production runtime data)
    ▲
    │  admin UI (React + Express server)
    │    └─ on save: write Firestore + write back processed JSON
    │       (excluding blacklisted fields)
    └─ human edits, image uploads
```

Same flow applies to foods (`batch_collect_food.py`, `data/foods_processed/`).

### Repo Layout (target)

```
cat_toxin_db/
├── schemas/                       # NEW
│   ├── toxin.zod.ts               # source of truth (Zod)
│   ├── toxin.types.ts             # generated (z.infer)
│   ├── toxin.schema.json          # generated (zod-to-json-schema)
│   └── build-schemas.ts
│
├── pipeline/                      # reorganized Python scripts
│   ├── batch_collect.py
│   ├── batch_collect_food.py
│   ├── process_plants.py          # validates against toxin.schema.json
│   ├── process_foods.py
│   ├── seed_firestore.py          # replaces app/scripts/seed-firestore.js
│   ├── dump_firestore.py          # one-time alignment + ongoing snapshot
│   └── verify_plants.py
│
├── data/
│   ├── plants/                    # raw (unchanged)
│   ├── plants_processed/          # normalized (admin writes back here)
│   ├── foods/
│   └── foods_processed/
│
├── admin/                         # moved from cat_toxin_app/admin
│   ├── server.js                  # double-write Firestore + processed JSON
│   ├── src/                       # React + Vite UI (unchanged)
│   └── package.json
│
├── docs/
└── .env.local                     # Firebase service account
```

### Removed

| Asset | Reason |
|---|---|
| `api/` (Cloudflare Workers + Hono + Drizzle) | App connects directly to Firestore; never used |
| `schema.sql` (PostgreSQL) | Migrated to Firestore |
| `import.sql` / `import_d1.py` | Same as above |

Future web version can re-introduce an API layer; deferred for cleanliness.

---

## Schema

### Source format

**Zod**, with two generated artefacts:

- `toxin.types.ts` — `z.infer<typeof ToxinSchema>` for TypeScript consumers
- `toxin.schema.json` — JSON Schema produced by `zod-to-json-schema`, consumed by:
  - Python LLM batch script (passed as `response_format` to OpenAI / Anthropic API for structured output)
  - `process_plants.py` for validating processed JSON

Build step (`scripts/build-schemas.ts`) regenerates both. CI fails if checked-in artefacts are stale.

### Field policy (admin write-back)

Admin server uses a **blacklist** when writing back to processed JSON. The following fields are written to Firestore only:

```ts
const FIRESTORE_ONLY_FIELDS = [
  'id',            // Firestore doc id (JSON uses filename as id)
  'imageUrls',     // current image refs
  'imageUrl',      // deprecated, kept during migration
  'hidden',        // operational flag
  'curatedList',   // operational categorization
];
```

Any field added to the Zod schema in the future is automatically included in write-back — no admin-server change needed.

### Cross-repo schema sync

`cat_toxin_app` consumes the schema via **file copy + CI hash check**:

- `cat_toxin_app/types/toxin.ts` is a copy of `cat_toxin_db/schemas/toxin.types.ts`
- `cat_toxin_app/scripts/check-schema-sync.sh` computes hash of the local copy and compares against the version pinned in a manifest committed alongside the copy
- CI runs the check; mismatch fails the build
- Updating the schema becomes a two-PR flow: db repo first, then app repo with the synced copy

Rationale: simpler than npm package or git submodule for a one-person project.

---

## Admin UI Behaviour

### Save flow (post-migration)

```
1. User edits a plant in admin UI
2. POST to admin server with full toxin object
3. Server writes Firestore (full object including image fields)
4. Server strips FIRESTORE_ONLY_FIELDS from object
5. Server validates stripped object against toxin.schema.json
6. Server writes data/plants_processed/<scientific_name>.json
   (atomic: write temp file → rename)
7. Response returned; user manually reviews diff and commits
```

### Safety rules

- **Never** sync from processed JSON back to Firestore. Only one direction: Firestore is authoritative for runtime; processed JSON is a derived snapshot.
- Admin server does not auto-commit. Human reviews `git diff` and commits.
- File write is atomic (temp file + rename) to avoid half-written state on crash.

---

## Migration Plan

Four phases. Each phase is independently deployable and reversible.

### Phase 1 — Pure relocation (zero production risk)

- Delete `cat_toxin_db/api/`, `schema.sql`, `import_d1.py`, `import.sql`
- Copy `cat_toxin_app/admin/` → `cat_toxin_db/admin/` (admin still writes Firestore only, no JSON write-back yet)
- Copy `cat_toxin_app/scripts/transform-toxin-data.js` and `seed-firestore.js` → `cat_toxin_db/pipeline/` (port to Python or keep as JS)
- Add `cat_toxin_db/schemas/` with Zod definitions describing **current** Firestore shape (do not redesign)
- Verify admin UI runs from new location against same Firebase project

App repo untouched. Production unaffected.

### Phase 2 — Alignment (read-only on Firestore)

- Implement `pipeline/dump_firestore.py`
- Run it; compare output against current `data/plants_processed/`
- Investigate diffs; commit a single "alignment baseline" with corrected processed JSON
- Run Zod validation across all processed JSON; fix schema or data until 100% pass

No writes to Firestore in this phase.

### Phase 3 — Enable double-write (writes resume)

- **Freeze admin UI editing** (announce or disable login)
- Update `admin/server.js` save handler to perform double-write per spec above
- Test by editing a single plant in a non-critical field; verify both Firestore and processed JSON updated
- Verify `git diff` is clean and minimal
- Resume admin editing

### Phase 4 — Cleanup `cat_toxin_app`

- Delete `cat_toxin_app/admin/`
- Delete `cat_toxin_app/scripts/` (migration scripts archived in db repo if needed)
- Replace `cat_toxin_app/types/toxin.ts` with copy from db repo
- Add `scripts/check-schema-sync.sh` and wire into CI
- Update `cat_toxin_app/CLAUDE.md` and `README.md` to point to new locations

---

## Risk & Mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| Admin double-write writes wrong data to Firestore | Low | Phase 3 only changes JSON write path; Firestore write path unchanged |
| Processed JSON gets reverse-synced to Firestore by mistake | Low | Hard rule: no code path writes processed JSON → Firestore. `seed_firestore.py` is the only exception, run manually for new plants only |
| Schema drift between repos | Medium | CI hash check fails the build |
| App breaks because Zod schema doesn't match Firestore reality | Low | Phase 2 validates 100% before Phase 3 starts; Phase 1's Zod defs describe current shape, not aspirational |
| New plant added during migration | Low | Migration is short (days, not weeks); pause new additions or use existing JS pipeline until Phase 3 done |

No staging Firebase project required: admin editing freeze + read-only Phase 2 + minimal Phase 3 test cover the same risk surface.

---

## Out of Scope

- LLM batch processing skill (raw → processed) — separate skill design
- Image management workflow changes — current Storage upload flow stays as-is
- Web admin version / public API — deferred until post-migration
- Multi-user admin auth — current single-secret model stays

---

## Open Questions

None at design time. Implementation may surface details to be decided in plan documents per phase.
