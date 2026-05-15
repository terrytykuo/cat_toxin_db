# Site Sync + Translation — Handoff Notes

**Date:** 2026-05-15
**Status:** Design locked. Bridge sync script implemented for the 100-plant / 10-translation milestone. See `docs/SITE_SYNC_RUNBOOK.md` before continuing.

This doc captures what the previous agent (me) explored so the next agent does **not** need to re-explore. Read this first, then jump to the file paths cited inline.

---

## 1. The big picture in 60 seconds

```
Firestore `toxins/*`            <-- system of record (edited via admin UI)
  ↓ dump_firestore.py           [EXISTS]   pipeline/dump_firestore.py
data/{plants,foods}_processed/*.json
  ↓ sync_site_plants.py         [BRIDGE]   → data/site/en/{slug}.json
  ↓ sync_site_plants.py         [BRIDGE]   → data/site/zh-TW/{slug}.json  (calls gemini CLI)
  ↓ download_images.py          [MISSING]  → mewguard_site/public/toxins/{slug}/...
  ↓ sync_site_plants.py         [BRIDGE]   → mewguard_site/src/data/plants.ts
  ↓ emit_to_site.py             [MISSING]  → mewguard_site/src/content/toxins/{slug}.json (future target)
Astro static build
```

- **198** plant JSON files in `data/plants_processed/` (validated against `schemas/toxin.disk.schema.json`).
- **57** food JSON files in `data/foods_processed/`.
- Site now has **100 generated plants** in `mewguard_site/src/data/plants.ts`; foods are still hard-coded in `mewguard_site/src/data/foods.ts`.
- Translation progress is recorded in `data/site/sync_progress.json` and `data/site/translation_log.jsonl`. Current milestone: first 10 selected plants translated, next pending index is 11.

## 2. Design source (READ THIS NEXT)

The full design is locked in:

→ **`cat_toxin_db/docs/plans/2026-05-15-mewguard-site-sync-pipeline-design.md`**

It specifies stages, file layouts, the cache-by-hash translation algorithm, batching rules (5 entries per Gemini call, 30k-token cap), the glossary injection format, failure handling (`translation_log.jsonl`, `--retry-failed`), the Astro content-collection schema, and the eight proposed PRs.

Do **not** redesign — implement against that doc.

## 3. Glossary — what the user just edited

- **Storage:** Firestore collection `glossary`, doc `main`. Edited via admin tab (`cat_toxin_db/admin/src/GlossaryEditor.tsx`).
- **Shape** (per `schemas/glossary.schema.json`):
  - `symptoms_severity` — fixed enum: mild / moderate / severe / fatal → 繁中
  - `body_system` — auto-synced from toxins data → 繁中
  - `toxic_parts` — auto-synced from toxins data → 繁中
  - `terms` — free-form vocabulary the human curator adds
- **Server endpoints** (in `cat_toxin_db/admin/server.js`):
  - `GET /api/glossary` — seeds doc if missing (line 342)
  - `PUT /api/glossary` — validates via `lib/glossary-validator.js`, writes (line 365)
  - `GET /api/glossary/examples` — example sentences for each term (line 413)
  - `POST /api/glossary/sync-vocabulary` — diffs body_system/toxic_parts vs toxins (line 532)
- **What the design says to do with it:** dump the glossary to `data/site/translation_glossary.json` (or read directly from Firestore) and inject it inline into every Gemini prompt's system message. The plan calls the on-disk file `data/site/translation_glossary.json`; the Firestore doc is the source of truth — decide whether to dump on each translate run or hand-export.

## 4. Site data shape — current vs. target

**Current** (`mewguard_site/src/data/types.ts`):

```ts
interface ToxinEntry {
  id: string;
  category: 'plant' | 'food';
  severity: Severity;
  name: { 'zh-TW': string; en: string };
  scientificName?: string;
  symptoms: { 'zh-TW': string[]; en: string[] };
  description: { 'zh-TW': string; en: string };
  emoji: string;
}
```

Consumed by:
- `src/pages/{en,zh-TW}/toxins/plants.astro` (and `index.astro`, `foods.astro`)
- `src/components/ToxinCard.astro` — reads `name[dataLang]`, `symptoms[dataLang]`, `description[dataLang]`

**Target** (from design doc §"Content Collection config"):
- Move to Astro Content Collection at `mewguard_site/src/content/toxins/{slug}.json`.
- Bilingual fields are `{ en: ..., 'zh-TW': ... | null }`. Null → site falls back to English silently.
- Includes new fields: `aliases`, `safetyNotes`, `toxicParts`, `symptoms[]` with body_system/severity/onset, `imageCount`.
- Detail page `[slug].astro` is new — does not exist yet.
- Existing `src/data/{plants,foods}.ts` should be **deleted** once collection is wired up.

**Note:** there's an emoji field on the current shape but **not** in the target schema. Decide before emitting whether to keep it (the App probably uses image only).

## 5. What the user asked for right now

1. **Document the sync + translate flow** — this doc + the CLAUDE.md / AGENTS.md updates.
2. **Clear current toxic plants on the site** — i.e. empty `src/data/plants.ts` array, or (better) skip straight to deleting it once the content collection lands.
3. **Sync 100 English plants from cat_toxin_db → mewguard_site.**
4. **Translate the first 10** via Gemini CLI.
5. **Record progress** so the next agent can pick up at entry 11.

The bridge implementation that satisfies this request is:

- `pipeline/sync_site_plants.py` picks 100 from `data/plants_processed/`, writes `data/site/en/{slug}.json`, exports the Firestore glossary to `data/site/translation_glossary.json`, translates pending entries into `data/site/zh-TW/{slug}.json`, and emits `../mewguard_site/src/data/plants.ts`.
- `docs/SITE_SYNC_RUNBOOK.md` documents the commands and resume procedure.
- Progress files: `data/site/sync_progress.json`, `data/site/translation_log.jsonl`, and the per-entry zh-TW cache.
- Re-runs skip entries whose `source_hash` matches. To continue from entry 11, run `python3 pipeline/sync_site_plants.py --plant-limit 100 --translate-limit 10 --emit-site`.

If the next agent wants to ship the full plan staged via PR, follow the **eight-PR order** at the bottom of the design doc. If they want the quick path, collapse PRs 1–3 + 5 + 7 into one pass.

## 6. Gemini CLI — what we know

- Installed at `/opt/homebrew/bin/gemini`, version `0.38.2`.
- The design doc says default batch is 5 entries per call, cap 30k tokens, system prompt carries the glossary, user prompt is a JSON array of entries, response is a JSON array of the same shape and order.
- Wrapper code is now in `pipeline/sync_site_plants.py`.
- Important: the user's Gemini config starts a local MCP server that hangs headless runs. The wrapper passes `--allowed-mcp-server-names none`.

## 7. Selection criteria for "the 100"

The 2026-05-15 milestone uses alphabetical order by processed filename, then takes the first 100. This is deterministic and is the order recorded in `data/site/sync_progress.json`.

Future option: match the App's curated list (Firestore `toxins` docs with `curatedList: true` — that field exists in `FIRESTORE_ONLY_FIELDS`).

## 8. Open questions for the next agent

- Confirm long-term policy: **dump glossary from Firestore each run, or commit a frozen snapshot to `data/site/translation_glossary.json`?** The bridge script currently exports from Firestore each run when credentials are available.
- Confirm: **strip emoji** from the new schema or carry it forward as an optional?
- Content collection migration remains pending. The milestone is currently unblocked by emitting the existing `src/data/plants.ts` shape.
- Image sync (`download_images.py`) — out of scope for the 100/10 milestone? The site can render without images if `imageCount: 0`.

## 9. Quick file map

| Concern | Path |
|---|---|
| Source-of-truth schema | `cat_toxin_db/schemas/toxin.zod.ts` (Zod) → `toxin.disk.schema.json` (generated) |
| Glossary schema | `cat_toxin_db/schemas/glossary.zod.ts` → `glossary.schema.json` |
| Processed plant data | `cat_toxin_db/data/plants_processed/*.json` (198 files) |
| Processed food data | `cat_toxin_db/data/foods_processed/*.json` (57 files) |
| Admin UI (glossary tab) | `cat_toxin_db/admin/src/GlossaryEditor.tsx` |
| Admin server (glossary endpoints) | `cat_toxin_db/admin/server.js:296-560` |
| Glossary validator | `cat_toxin_db/admin/lib/glossary-validator.js` |
| Firestore dumper | `cat_toxin_db/pipeline/dump_firestore.py` |
| Site data (current bridge) | `mewguard_site/src/data/plants.ts` generated, `foods.ts` still hard-coded, `types.ts` |
| Site toxin card | `mewguard_site/src/components/ToxinCard.astro` |
| Site toxin pages | `mewguard_site/src/pages/{en,zh-TW}/toxins/{index,plants,foods}.astro` |
| Site content config | `mewguard_site/src/content.config.ts` (currently only `articles` collection) |
| Site i18n strings (chrome) | `mewguard_site/src/i18n/translations.ts` |
| Pipeline design plan | `cat_toxin_db/docs/plans/2026-05-15-mewguard-site-sync-pipeline-design.md` |
| This handoff doc | `cat_toxin_db/docs/SITE_SYNC_HANDOFF.md` |
