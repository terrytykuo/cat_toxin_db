# Admin UI Glossary Editor — Design

**Date:** 2026-05-15
**Status:** Design approved, implementation ready
**Scope:** A new page in `admin/` that lets the admin curate the translation glossary used by the upcoming `mewguard_site` sync pipeline (see `2026-05-15-mewguard-site-sync-pipeline-design.md`).
**Relationship to site sync pipeline:** This is a prerequisite. The pipeline's `translate_site.py` reads `glossary/main` from Firestore on each run and injects the glossary into the Gemini system prompt to lock medical terminology.

---

## Goals

1. Admin can review and edit the four glossary buckets (`symptoms_severity`, `body_system`, `toxic_parts`, `terms`) from the existing local admin UI.
2. Fixed-vocabulary buckets (`body_system`, `toxic_parts`) stay in sync with the actual Firestore `toxins` collection via an on-demand "Sync from toxins" diff flow — no silent additions on every page load.
3. Glossary changes are atomic, validated server-side, and the pipeline pulls a fresh copy at the start of every run.

## Non-Goals

- No per-term metadata (`reviewed_at`, `reviewed_by`, `notes`). YAGNI.
- No multi-user editing or conflict resolution. Single admin, last-write-wins is fine.
- No double-write to disk. Firestore is the canonical store for the glossary.
- No LLM-assisted translation in the admin UI. Glossary is human-curated by design; LLM use happens later in the pipeline.

## Decisions Locked

| ID | Decision | Rationale |
|---|---|---|
| D1 | Firestore storage: **single document `glossary/main`** with 4 fields, each a map of `en → zh-TW`. | One read per pipeline run, atomic writes, ~50–100 KB total even at scale (1 MB doc cap not at risk). Migrating to a collection later is a 10-minute script if requirements change. |
| D2 | `symptoms_severity` keys (`mild`, `moderate`, `severe`, `fatal`) are **hardcoded in the UI** with no sync. | The enum is already locked by `schemas/toxin.zod.ts`. Treating it as syncable is dead code. |
| D3 | "Sync from toxins" is a **manual button**, not auto-run on page load. | Avoids scanning the whole `toxins` collection on every navigation. Diff is shown in a confirmation modal before any write. |

## Firestore Schema

Single document at path `glossary/main`:

```ts
{
  symptoms_severity: { [en: string]: string },   // hardcoded keys: mild|moderate|severe|fatal
  body_system:       { [en: string]: string },   // keys come from toxins collection
  toxic_parts:       { [en: string]: string },   // keys come from toxins collection
  terms:             { [en: string]: string },   // free-form, admin-curated
  updated_at:        Timestamp,
}
```

Server-side zod schema (lives in `schemas/glossary.zod.ts`, mirrors-the-pattern of `toxin.zod.ts`):

```ts
export const Glossary = z.object({
  symptoms_severity: z.record(z.string(), z.string()),
  body_system:       z.record(z.string(), z.string()),
  toxic_parts:       z.record(z.string(), z.string()),
  terms:             z.record(z.string(), z.string()),
});
```

Initial seed (when `glossary/main` doesn't exist on first `GET`):

```ts
{
  symptoms_severity: { mild: "", moderate: "", severe: "", fatal: "" },
  body_system: <auto-populated from toxins scan, all values "">,
  toxic_parts: <auto-populated from toxins scan, all values "">,
  terms: {},
  updated_at: <now>
}
```

## API Endpoints (additions to `admin/server.js`)

### `GET /api/glossary`

- Reads `glossary/main`.
- If document does not exist: scan `toxins` collection, build initial seed with empty Chinese values, write it, return it.
- Returns `Glossary` shape + `updated_at`.

### `PUT /api/glossary`

- Body: full `Glossary` object.
- Server-side validation with zod. On failure: 422 with errors.
- On success: atomic `set` on `glossary/main` with `updated_at` server timestamp.
- Returns the saved document.

### `POST /api/glossary/sync-vocabulary`

- Scans `toxins` collection: extracts unique `body_system` values from `symptoms[]`, unique `toxic_parts` values.
- Compares to current `glossary/main`.
- Returns `{ body_system: { add: [...], orphan: [...] }, toxic_parts: { add: [...], orphan: [...] } }`.
- `add` = key present in toxins but not glossary.
- `orphan` = key present in glossary but not referenced by any toxin.
- **Does not write.** Apply happens via a subsequent `PUT /api/glossary` after the admin confirms the diff in the UI.

## UI Structure

### Top-level navigation in `App.tsx`

Add a simple two-tab header switcher (no router needed):

```
┌─────────────────────────────────────────────────────────┐
│  MewGuard Admin   [ Toxins ] [ Glossary ]               │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  (current Toxins view OR new Glossary view)             │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

State: `const [view, setView] = useState<'toxins' | 'glossary'>('toxins')`.

### `GlossaryEditor.tsx` layout

Four collapsible sections, each rendering a two-column table (English key locked, Chinese value editable):

1. **Symptom Severity** (4 rows, locked keys)
2. **Body System** (rows from Firestore; `[↻ Sync from toxins]` button)
3. **Toxic Parts** (rows from Firestore; `[↻ Sync from toxins]` button)
4. **Terms** (free-form; `[+ Add row]` button; per-row delete `[✕]`)

Footer: sticky bar with `[Save Changes]` button. Disabled when not dirty. Shows "Saved 5m ago" / "Unsaved changes" status text.

### Sync flow (Body System / Toxic Parts)

1. Admin clicks `[↻ Sync from toxins]`.
2. UI calls `POST /api/glossary/sync-vocabulary`.
3. Server returns diff: `{ add: [...], orphan: [...] }`.
4. Modal shows:
   ```
   Sync Body System with toxins data
   ─────────────────────────────────
   To add (3):   • Lymphatic    [keep this row in modal, value will be empty]
                  • Reproductive
                  • Skeletal

   Orphans (1): ☐ Old_Value  (not referenced by any toxin — remove?)

   [Cancel]  [Apply]
   ```
5. On Apply: client merges diff into local state (new keys get empty Chinese; orphans removed if checkbox ticked). User still needs to fill Chinese and click Save.

This keeps "scan + diff" and "actually mutate" as two separate steps, so the admin always has a chance to back out.

### Dirty state and save

- Any input change marks the form dirty.
- Save calls `PUT /api/glossary` with the full local state.
- On 422: toast with first validation error, dirty state preserved.
- On 200: dirty state cleared, `updated_at` refreshed.
- No double-write to disk for this endpoint (glossary doesn't mirror to disk; only `toxins/*` does).

## Pipeline Integration (future work, not in this PR)

When `translate_site.py` (PR 3 of the site sync pipeline) is built:

1. At process start, read `glossary/main` once.
2. Inject the four maps into the Gemini system prompt as a strict-translation rule block.
3. Pass through unchanged for the rest of the run (no per-batch re-fetch).

This is mentioned here for context; no glossary-side changes needed.

## File Changes Summary

| File | Change | Lines (est.) |
|---|---|---|
| `schemas/glossary.zod.ts` | new | ~15 |
| `admin/server.js` | +3 endpoints, +glossary import | ~110 |
| `admin/src/App.tsx` | add tab switcher | ~25 |
| `admin/src/GlossaryEditor.tsx` | new component | ~260 |
| `admin/src/types.ts` | +Glossary type | ~10 |
| `admin/src/api.ts` | no change (already thin wrapper) | 0 |

## Open Questions / Deferred

- Per-term review metadata: deferred. If needed later, add a parallel `reviewed: { en: timestamp }` map to the same doc, or migrate to a collection-of-docs.
- Bulk import/export glossary as JSON: deferred. Useful if multiple admins exist someday.
- Versioning / history: deferred. Firestore doesn't provide point-in-time recovery on a single doc; if needed, write an append-only `glossary_history` collection on every PUT. Not in v1.
