# Unify Data Pipeline — PR Plan

**Date:** 2026-04-22
**Design doc:** [`2026-04-22-unify-data-pipeline-design.md`](./2026-04-22-unify-data-pipeline-design.md)
**Execution:** Each PR below is implemented by OpenAI Codex, then reviewed.

---

## Conventions for every PR

- **Scope discipline:** do only what the PR describes. No drive-by refactors, no unrelated cleanup.
- **Commits:** one commit per logical change within the PR; commit messages in the style of existing repo history.
- **No behaviour change unless specified:** PRs labelled "pure relocation" or "additive only" must not alter any runtime behaviour.
- **No `.env.local` or credentials committed.** Service account JSON paths must come from env vars.
- **Atomic file writes** for any script that modifies JSON: write to `<file>.tmp` then rename.
- **Testing:** each PR description must include a manual verification section the reviewer can run.
- **Do not skip hooks** (`--no-verify` forbidden).
- **Do not modify `cat_toxin_app` production code paths** unless the PR is explicitly in the app repo (PRs 8–9).

Dependencies are linear unless stated otherwise. Codex should not start a PR until the previous one is merged.

---

## PR 1 — Delete unused API + SQL assets

**Repo:** `cat_toxin_db`
**Depends on:** none
**Type:** Deletion only

### Scope
Delete these paths entirely:
- `api/`
- `schema.sql`
- `import.sql`
- `import_d1.py`

Update `README.md`:
- Remove references to the deleted paths in the "Project Structure" tree
- Remove any mentions of PostgreSQL / D1 / Cloudflare Workers

### Acceptance criteria
- `git status` shows only deletions + README edits
- `grep -r "drizzle\|cloudflare\|wrangler\|postgres\|d1" .` (excluding `node_modules`, `.git`) returns no code references
- Python scripts (`batch_collect.py`, `process_plants.py`, `verify_*.py`) still run (`python3 -c "import ast; ast.parse(open('batch_collect.py').read())"`)

### Review checklist
- No accidental deletion of `data/`, `docs/`, or Python pipeline scripts
- README still accurate

---

## PR 2 — Add `schemas/` directory with Zod source + generated artefacts

**Repo:** `cat_toxin_db`
**Depends on:** PR 1
**Type:** Additive only

### Scope
Create:
```
schemas/
├── package.json              # deps: zod, zod-to-json-schema, typescript, tsx
├── tsconfig.json
├── toxin.zod.ts              # hand-written Zod source — must describe CURRENT Firestore shape
├── toxin.types.ts            # generated: z.infer export
├── toxin.schema.json         # generated: JSON Schema
├── build-schemas.ts          # regenerates .types.ts and .schema.json
└── README.md                 # how to regenerate, field policy blacklist documented
```

**Source of truth for the Zod schema** is `cat_toxin_app/admin/src/types.ts` at the HEAD of `main`. Copy every field, preserve optionality (`?`) and nullability (`| null`).

Add to `package.json` scripts:
- `"build:schemas": "tsx schemas/build-schemas.ts"`
- `"check:schemas": "tsx schemas/build-schemas.ts --check"` (exits non-zero if generated files are stale)

Document the blacklist in `schemas/README.md`:
```
FIRESTORE_ONLY_FIELDS = ['id', 'imageUrls', 'imageUrl', 'hidden', 'curatedList']
```

### Acceptance criteria
- `npm install` succeeds in `schemas/`
- `npm run build:schemas` regenerates artefacts with no diff the second time
- `npm run check:schemas` exits 0 on a clean tree
- `toxin.schema.json` validates against JSON Schema Draft-07
- Hand-run: `node -e "const s=require('./schemas/toxin.schema.json'); console.log(Object.keys(s.properties))"` lists every field from the source `types.ts`

### Review checklist
- Every field from `cat_toxin_app/admin/src/types.ts` is present with correct optionality
- No schema redesign — this is a mirror, not an improvement
- Blacklist documented but not yet enforced (PR 7 enforces)

---

## PR 3 — Move admin UI from `cat_toxin_app` to `cat_toxin_db` (behaviour unchanged)

**Repo:** `cat_toxin_db`
**Depends on:** PR 2
**Type:** Pure relocation

### Scope
- Copy `cat_toxin_app/admin/` → `cat_toxin_db/admin/` (entire directory including `package.json`, `server.js`, `src/`, configs)
- Update `admin/server.js` env loading:
  - Old: reads `../env.local` (app root) for `EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET`
  - New: read from `cat_toxin_db/.env.local` with key `FIREBASE_STORAGE_BUCKET` (drop the `EXPO_PUBLIC_` prefix)
  - Keep reading `admin/.env.local` for `ADMIN_SECRET` and `FIREBASE_ADMIN_KEY_PATH`
- Add `.env.example` at repo root listing `FIREBASE_STORAGE_BUCKET`
- Add `admin/.env.example` listing `ADMIN_SECRET`, `FIREBASE_ADMIN_KEY_PATH`
- Update `cat_toxin_db/README.md` with a section on running the admin UI
- **Do not delete `cat_toxin_app/admin/` yet** (PR 8 does that)

### Acceptance criteria
- `cd admin && npm install && npm run dev` starts the Vite dev server
- `cd admin && node server.js` starts the Express server
- UI loads, lists toxins from Firestore, can save a no-op edit (reviewer verifies manually against a dev plant if available, or against production with extreme care)
- No writes go to any JSON file yet — this PR keeps write-only-to-Firestore behaviour

### Review checklist
- `admin/server.js` does not write to `data/` in this PR
- Env var names changed consistently; no dangling `EXPO_PUBLIC_` references inside `admin/`
- `.env.example` files present, actual `.env.local` not committed

---

## PR 4 — Port `seed` and `transform` scripts to `pipeline/`

**Repo:** `cat_toxin_db`
**Depends on:** PR 2
**Type:** Pure relocation (functional equivalence)

### Scope
- Create `pipeline/` directory
- Port these files from `cat_toxin_app/scripts/`:
  - `transform-toxin-data.js` → `pipeline/transform_toxins.js` (or `.py` if trivial to translate)
  - `seed-firestore.js` → `pipeline/seed_firestore.js` (or `.py`)
- Move existing Python pipeline scripts into `pipeline/`:
  - `batch_collect.py`, `batch_collect_food.py`
  - `process_plants.py`, `process_foods.py`
  - `clean_plants.py`, `verify_plants.py`, `verify_foods.py`, `verify_raw.py`
  - `sync_status.py`, `sync_status_food.py`, `process_discovery.py`, `patch_sci_names.py`
- Update any relative paths inside the moved scripts (they reference `data/...`)
- Update `README.md` project structure section

Language choice for ported JS scripts: **keep as JS** if the script uses Firebase client SDK (seed, transform); don't translate to Python just for consistency. Reason: avoids introducing Python Firebase deps.

### Acceptance criteria
- Every script runs with no import errors: `python3 -c "import pipeline.batch_collect"` (add `__init__.py` if needed) and `node pipeline/seed_firestore.js --help` (if help flag exists, else `node -c pipeline/seed_firestore.js`)
- No script references `../scripts/` or `../../cat_toxin_app/`
- Data paths (`data/plants/`, `data/plants_processed/`) still resolve correctly
- **Do not delete `cat_toxin_app/scripts/` yet** (PR 8 does that)

### Review checklist
- Behaviour-preserving port: no logic changes beyond path fixes
- No new runtime dependencies added unless the original already required them

---

## PR 5 — Add `process_plants.py` validation against JSON Schema

**Repo:** `cat_toxin_db`
**Depends on:** PR 2, PR 4
**Type:** Additive validation

### Scope
- Add `jsonschema` to `requirements.txt`
- In `pipeline/process_plants.py`, after writing each processed JSON file, validate against `schemas/toxin.schema.json`
- On validation failure: log the error, do not write the file, continue with next plant
- Write a summary at end: `N passed, M failed`
- Same treatment for `pipeline/process_foods.py`

### Acceptance criteria
- Running `process_plants.py` on an already-processed directory passes validation for all existing files **OR** produces a list of known divergences (documented in PR description so PR 6 can address them)
- `jsonschema` pinned to a specific version in `requirements.txt`

### Review checklist
- Validation does not crash the whole batch on a single failure
- Failure list is actionable (plant name + specific field + expected vs actual)

---

## PR 6 — Implement `dump_firestore.py` and commit alignment baseline

**Repo:** `cat_toxin_db`
**Depends on:** PR 5
**Type:** One-time alignment

### Scope
Part A — the script:
- `pipeline/dump_firestore.py`
- Reads every doc from Firestore `toxins` collection
- For each doc: strip `FIRESTORE_ONLY_FIELDS` (hardcoded list matching `schemas/README.md`)
- Validate against `schemas/toxin.schema.json`
- Write to `data/plants_processed/<scientific_name>.json` (or `data/foods_processed/` based on `category` field) using atomic write
- Print summary: docs fetched, written, validation failures

Part B — run it and commit the result:
- Execute the script against production Firestore
- `git add data/plants_processed/ data/foods_processed/`
- Commit with message: `chore: align processed JSON with Firestore (baseline)`
- PR description must include:
  - Count of files changed
  - Summary of notable content diffs (not just field order / whitespace)
  - Any validation failures and how they were resolved (either schema fix in a follow-up or data fix)

### Acceptance criteria
- After the baseline commit, running `dump_firestore.py` again produces zero diffs
- All dumped JSON passes `schemas/toxin.schema.json` validation
- No `FIRESTORE_ONLY_FIELDS` appear in any processed JSON

### Review checklist
- Script is **read-only** on Firestore (no writes anywhere near Firestore in this PR)
- Atomic writes used (temp file + rename)
- Baseline commit contains only JSON changes, not script logic changes

---

## PR 7 — Enable admin UI double-write

**Repo:** `cat_toxin_db`
**Depends on:** PR 3, PR 6
**Type:** Behaviour change (the core one)

**Precondition:** Admin UI editing must be paused in production during this PR's rollout window.

### Scope
Modify `admin/server.js` save handler(s):

1. Receive full toxin object from UI
2. Write to Firestore (unchanged from current behaviour)
3. Build `jsonForDisk = { ...toxin }` and delete every key in `FIRESTORE_ONLY_FIELDS`
4. Validate `jsonForDisk` against `schemas/toxin.schema.json` (load JSON Schema at server start); on failure, **do not write JSON**, return 500 with validation error, but the Firestore write has already happened — log loudly so the operator can reconcile
5. Compute target path: `data/plants_processed/<scientific_name>.json` (category === 'plant') or `data/foods_processed/<scientific_name>.json` (category === 'food')
6. Atomic write (temp + rename)
7. Return success with the path written

Additional requirements:
- Define `FIRESTORE_ONLY_FIELDS` in a single module (e.g. `admin/lib/field-policy.js`), not inline
- **Absolutely no code path in this PR writes processed JSON → Firestore.** Only Firestore → JSON.
- Add a unit-ish test if the admin has a test setup; otherwise document the manual test precisely in the PR

### Manual verification (in PR description)
1. Pull PR branch, start admin server and UI
2. Edit one non-critical field (e.g. `description` trailing whitespace) on a test plant
3. Save
4. Check Firestore changed (Firebase console)
5. Check `data/plants_processed/<that_plant>.json` changed
6. Check `git diff` shows only the edited field
7. Check `git diff` does NOT include any blacklisted field
8. Revert the change via admin UI, verify both sides revert

### Acceptance criteria
- All 8 verification steps pass
- No `FIRESTORE_ONLY_FIELDS` ever appear in processed JSON after a save
- Server does not auto-commit (human commits after reviewing diff)

### Review checklist
- Field policy is a named constant, not a magic array
- Validation failure path is safe (doesn't silently drop errors)
- No reverse sync (processed JSON → Firestore) anywhere in the codebase

---

## PR 8 — Clean up `cat_toxin_app` (admin + scripts removal, schema sync)

**Repo:** `cat_toxin_app`
**Depends on:** PR 7 merged and in use for at least a few days without incident
**Type:** Deletion + sync setup

### Scope
Delete:
- `admin/` (entire directory)
- `scripts/transform-toxin-data.js`
- `scripts/seed-firestore.js`
- `scripts/seed-safe-plants.js`
- `scripts/seed.ts`
- Other migration scripts that have done their job (reviewer to confirm list against db repo equivalents)

Add schema sync:
- Copy `cat_toxin_db/schemas/toxin.types.ts` → `cat_toxin_app/types/toxin.ts`
- Create `cat_toxin_app/types/SCHEMA_VERSION` containing the SHA-256 of the copied file
- Create `scripts/check-schema-sync.sh`:
  - Computes current SHA-256 of `types/toxin.ts`
  - Compares against `types/SCHEMA_VERSION`
  - Exits non-zero on mismatch
- Wire the check into CI (find existing CI config; add a step)
- Update `types/` re-exports if any other files depend on the old type location
- Update `CLAUDE.md` and `README.md` to point to `cat_toxin_db` for data pipeline work

### Acceptance criteria
- App builds (`npm run build` or equivalent) after the type file replacement
- `bash scripts/check-schema-sync.sh` exits 0 when file matches, non-zero when file tampered
- CI fails if someone edits `types/toxin.ts` without updating `SCHEMA_VERSION`
- No dead imports pointing to `admin/` or deleted scripts
- `grep -r "from '\.\./admin'" src/` returns nothing

### Review checklist
- No app runtime code is altered beyond what deletions/type moves require
- The deleted scripts genuinely have equivalents in `cat_toxin_db/pipeline/` (check against PR 4 merge)
- SCHEMA_VERSION is a real hash, not a placeholder

---

## PR 9 — Update docs (both repos)

**Repo:** `cat_toxin_app` + `cat_toxin_db` (can be two small PRs or one coordinated)
**Depends on:** PR 8
**Type:** Docs only

### Scope
`cat_toxin_db`:
- Update `README.md` with the new end-to-end pipeline: NotebookLM → raw → processed → Firestore → admin
- Update `docs/DATA_COLLECTION_PIPELINE.md` to reflect reality
- Document how to regenerate `schemas/` artefacts
- Document how to run `dump_firestore.py` for periodic snapshots

`cat_toxin_app`:
- Update `CLAUDE.md`: remove any mention of `scripts/` or `admin/` (they're gone); add a pointer to `cat_toxin_db` for data work
- Update `README.md` file index
- Update auto-memory if relevant (note: memory update is agent-side, not a code change)

### Acceptance criteria
- No doc references paths that no longer exist
- A new contributor reading only `README.md` can figure out where to add a new plant

---

## Review Order & Merge Gate

```
PR 1 ──► PR 2 ──► PR 3 ──► PR 7 ──► PR 8 ──► PR 9
          │
          └──► PR 4 ──► PR 5 ──► PR 6 ──┘
```

Do not open more than 2–3 PRs simultaneously. Each PR should be small enough to review in under 30 minutes.

---

## What Codex should NOT do

- Refactor unrelated code inside touched files
- Add new features beyond what the PR specifies
- Change schema shape "while you're in there"
- Commit `.env.local` or any service account JSON
- Modify production Firestore documents outside the explicit dump step in PR 6
- Use `--no-verify` to bypass hooks
- Create follow-up PRs on their own initiative — each PR is explicitly scoped; stop when done
