# MewGuard Site Sync Pipeline — Design

**Date:** 2026-05-15
**Status:** Design approved, ready for implementation planning
**Scope:** One-way data pipeline `Firestore → mewguard_site` for the toxin dictionary (plants + foods), with English-to-Traditional-Chinese translation and image sync.

---

## Goals

1. One command syncs Firestore toxin data + images to `mewguard_site` so the website can present the same depth of information as the App.
2. English → zh-TW translation is batched, resumable, cached, and human-overridable. Must be possible to translate incrementally over many sessions.
3. Schema stays consistent across `cat_toxin_db` (source of truth), `cat_toxin_app`, and `mewguard_site` via the existing zod-schema-sync-by-hash pattern.
4. The website remains a static Astro build with no runtime dependency on Firestore or any custom API.

## Non-Goals

- No API layer. Firestore + build-time pipeline is the contract. (See "Alternatives considered" below.)
- No real-time data on the site. Site is rebuilt on demand.
- Site never writes back to Firestore.
- household category is out of scope for v1 (page shows "Under construction").
- No `emergencyNote` rendering on the site (no veterinary partnership).

## Decisions Locked

| Question | Decision |
|---|---|
| Data scope on site | Same as App detail screen + `scientificName`. Excludes `emergencyNote`, `chemicals`, `treatments`, `family`. |
| Categories | `plant` and `food` only. `household.astro` shows "Under Construction" placeholder. |
| Translation provider | Gemini CLI, results land as JSON, file-as-cache, batched (default 5 entries / call). |
| URL structure | Flat: `/[lang]/toxins/[slug]`. |
| Storage on site | Astro Content Collections (`src/content/toxins/`). Existing hardcoded `src/data/{plants,foods}.ts` to be removed. |
| Image format | WebP, downloaded to `mewguard_site/public/toxins/{slug}/{slug}-N.webp`. |
| Unbuilt-translation behaviour | Site falls back to English when `zh-TW` not yet translated. Allows incremental rollout. |

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  cat_toxin_db (pipeline home)                                │
└─────────────────────────────────────────────────────────────┘

  Firestore `toxins` collection
            │
            ▼  (1) dump_firestore.py            [exists]
  data/{plants,foods}_processed/{slug}.json
            │
            ▼  (2) build_site_payload.py        [new]
  data/site/en/{slug}.json
            │
            ▼  (3) translate_site.py            [new, resumable]
  data/site/zh-TW/{slug}.json
            │
            ▼  (4) download_images.py           [new]
  mewguard_site/public/toxins/{slug}/{slug}-N.webp
            │
            ▼  (5) emit_to_site.py              [new]
  mewguard_site/src/content/toxins/{slug}.json
            │
            ▼  Astro build
  Static HTML × (en + zh-TW) × N toxins
```

Driver: `pipeline/sync_site.sh` runs the chain. Each stage is independently re-runnable and idempotent.

## Stage Details

### Stage 1: `dump_firestore.py` (existing)

Already pulls every Firestore `toxins` doc into local JSON. No change needed.

### Stage 2: `build_site_payload.py`

Read processed dumps, filter to `category in {plant, food}`, normalize to the site payload shape, write to `data/site/en/{slug}.json`.

Output schema (English-only at this stage):

```json
{
  "slug": "lily",
  "category": "plant",
  "severity": "toxic",
  "scientificName": "Lilium spp.",
  "imageUrls": ["https://firebasestorage.googleapis.com/..."],
  "name": "Lily",
  "aliases": ["..."],
  "description": "...",
  "safetyNotes": ["..."],
  "toxicParts": ["..."],
  "symptoms": [
    { "name": "vomiting", "body_system": "digestive", "severity": "moderate", "onset": "6-12 hours" }
  ]
}
```

Drops fields not used on the site: `family`, `chemicals`, `treatments`, `emergencyNote`, `isToxic`, `toxicityLevel`.

### Stage 3: `translate_site.py` (the key piece)

#### File-as-cache model

`data/site/zh-TW/{slug}.json` IS the translation cache. No separate cache file.

```json
{
  "slug": "lily",
  "source_hash": "a3f1c8...",
  "translated_at": "2026-05-15T14:23:11Z",
  "gemini_model": "gemini-2.0-pro",
  "manual_override": false,
  "name": "百合花",
  "aliases": ["..."],
  "description": "...",
  "safetyNotes": ["..."],
  "toxicParts": ["..."],
  "symptoms": [
    { "name": "嘔吐", "body_system": "消化系統", "onset": "6-12 小時內" }
  ]
}
```

Fields not duplicated in zh-TW file: `category`, `severity`, `scientificName`, `symptoms[].severity` (Latin / enum / fixed values). These live in the EN file and `emit_to_site.py` merges both at write time.

#### Decision logic per entry

```
for slug in scan(en/):
  en_hash = sha256(en/{slug}.json)
  zh = read(zh-TW/{slug}.json) or None
  if zh and zh.manual_override:              SKIP    (never overwrite human edits)
  elif zh and zh.source_hash == en_hash:     SKIP    (unchanged since last translation)
  elif zh:                                   STALE   (re-translate)
  else:                                      NEW     (translate)
```

#### Batching

- Default batch size: 5 entries per Gemini CLI call.
- Hard safety cap: 30k tokens per batch (well below Gemini's window, controls latency and blast radius). Batch shrinks dynamically if estimated tokens exceed the cap.
- Each entry's result is written atomically (`.tmp` then rename) — Ctrl-C loses at most the in-flight batch's unwritten results, never previously completed entries.

#### Prompt structure

```
System: [translation rules + glossary JSON inline]
User:   Translate the following JSON array of <N> entries from English to
        Traditional Chinese (zh-TW). Return a JSON array of the same length
        and order. Translate only these fields: name, aliases, description,
        safetyNotes, toxicParts, symptoms[].name, symptoms[].body_system,
        symptoms[].onset. Use the glossary for the listed terms exactly.
        [<input JSON array>]
```

#### Glossary: `data/site/translation_glossary.json`

Hand-curated, committed to the repo. Forces consistency on enums and recurring veterinary terminology.

```json
{
  "body_system": {
    "digestive": "消化系統",
    "respiratory": "呼吸系統",
    "...": "..."
  },
  "severity": {
    "mild": "輕微",
    "moderate": "中等",
    "severe": "嚴重",
    "fatal": "致命"
  },
  "terms": {
    "kidney failure": "腎衰竭",
    "calcium oxalate": "草酸鈣",
    "...": "..."
  }
}
```

The glossary is injected into the system prompt on every call. Grows organically as the human reviewer catches terminology drift.

#### Commands

```bash
python pipeline/translate_site.py                  # translate new + stale
python pipeline/translate_site.py --limit 20       # cap this session at 20 entries
python pipeline/translate_site.py --only lily      # force re-translate one entry
python pipeline/translate_site.py --retry-failed   # retry last session's failures
python pipeline/translate_site.py --dry-run        # plan only, no Gemini calls
python pipeline/translate_site.py --invalidate-all # nuke all and re-translate
```

#### Failure handling

- Gemini returns non-JSON or batch length mismatch → mark whole batch failed, log entries, write raw response to `zh-TW/{slug}.json.error` for debugging, continue.
- Per-entry JSON validation after batch returns. Entries that fail validation are logged; valid siblings still land.
- Failures are appended to `data/site/translation_log.jsonl` and can be replayed with `--retry-failed`.

#### Progress log: `data/site/translation_log.jsonl`

Append-only, one JSON object per line:

```json
{"ts":"2026-05-15T14:23:11Z","slug":"lily","action":"new","duration_ms":2341,"batch_id":12}
{"ts":"2026-05-15T14:23:13Z","slug":"pothos","action":"failed","error":"invalid_json","batch_id":12}
```

End-of-run summary: `Total: 247 | Done: 180 | New: 5 | Stale: 2 | Failed: 1 | Skipped: 239`.

### Stage 4: `download_images.py`

For each entry's `imageUrls[]`:

1. Compute URL hash, compare with `public/toxins/{slug}/manifest.json`.
2. If unchanged, skip; if changed or missing, download.
3. Convert to WebP via Pillow, cap at 1600px on the longest side.
4. Write as `public/toxins/{slug}/{slug}-{i}.webp` (1-indexed, matches imageUrls order).
5. Update `manifest.json` with `{sources, hashes, downloaded_at}`.

Naming uses the slug (e.g. `lily-1.webp`, not `0.webp`) for image-SEO benefits — Google Image Search uses filename as a ranking signal.

`--prune` mode deletes `public/toxins/{slug}/` for slugs no longer in Firestore.

### Stage 5: `emit_to_site.py`

Merge `en/{slug}.json` + `zh-TW/{slug}.json` (if present) → `mewguard_site/src/content/toxins/{slug}.json`:

```json
{
  "id": "lily",
  "category": "plant",
  "severity": "toxic",
  "scientificName": "Lilium spp.",
  "imageCount": 2,
  "name":        { "en": "Lily",    "zh-TW": "百合花" },
  "aliases":     { "en": [...],     "zh-TW": [...] },
  "description": { "en": "...",     "zh-TW": "..." },
  "safetyNotes": { "en": [...],     "zh-TW": [...] },
  "toxicParts":  { "en": [...],     "zh-TW": [...] },
  "symptoms": {
    "en":    [{ "name": "...", "body_system": "...", "severity": "...", "onset": "..." }],
    "zh-TW": [{ "name": "...", "body_system": "...", "severity": "...", "onset": "..." }]
  }
}
```

If `zh-TW` not yet translated, `zh-TW` values are `null`. Site renders English in their place. This is what enables incremental translation rollout.

### Stage 6: Schema sync (extend the existing pattern)

Add `mewguard_site/src/lib/toxin.schema.ts` and `toxin.zod.ts` as read-only copies of `cat_toxin_db/schemas/`. Track SHA256 in `mewguard_site/src/lib/SCHEMA_VERSION` and add a CI workflow mirroring `cat_toxin_app/.github/workflows/schema-sync.yml`.

## Astro Site Changes

### Content Collection config

```ts
// mewguard_site/src/content.config.ts
import { defineCollection, z } from 'astro:content';

const bilingualString = z.object({ en: z.string(), 'zh-TW': z.string().nullable() });
const bilingualArray  = z.object({ en: z.array(z.string()), 'zh-TW': z.array(z.string()).nullable() });

export const collections = {
  toxins: defineCollection({
    type: 'data',
    schema: z.object({
      id: z.string(),
      category: z.enum(['plant', 'food']),
      severity: z.enum(['safe', 'cautious', 'toxic']),
      scientificName: z.string().optional(),
      imageCount: z.number(),
      name: bilingualString,
      aliases: bilingualArray,
      description: bilingualString,
      safetyNotes: bilingualArray,
      toxicParts: bilingualArray,
      symptoms: z.object({
        en: z.array(z.object({ name: z.string(), body_system: z.string(), severity: z.string(), onset: z.string().optional() })),
        'zh-TW': z.array(z.object({ name: z.string(), body_system: z.string(), severity: z.string(), onset: z.string().optional() })).nullable(),
      }),
    }),
  }),
};
```

### Pages

```
src/pages/
  [lang]/
    toxins/
      index.astro          # existing, switch to content collection
      plants.astro         # existing, filter category==plant
      foods.astro          # existing, filter category==food
      household.astro      # show "Under construction"
      [slug].astro         # NEW: detail page
```

### Detail page essentials

- `getStaticPaths()` produces `{ lang, slug }` for every (lang, toxin) pair.
- Render order matches the App: image carousel → severity badge → name → aliases → description → safetyNotes → toxicParts (non-safe) → symptoms with body_system · onset meta (non-safe) → medical disclaimer.
- `<Image>` from `astro:assets` for all toxin images. First image `loading="eager"` (LCP). Auto srcset, AVIF + WebP.
- Per-image `alt` deterministically built from `{name, scientificName, severity, index, total}`. No LLM-generated alt text.
- `<link rel="alternate" hreflang="en" />` and `hreflang="zh-TW"` for each detail page.
- JSON-LD `Thing` block with `image: [{ "@type": "ImageObject", contentUrl, caption }]` per image.
- When `zh-TW` field is `null`, render the `en` value (no special "translation in progress" badge — silent fallback).

### Sitemap

Enable `@astrojs/sitemap` with i18n config so Google Image Search can index toxin photos.

## SEO Risk Mitigations

These are baked into the design, not afterthoughts:

1. **Auto-translated content risk** — Translations are reviewed by hand (file diffs in git PR), incremental rollout with `--limit` lets you spot-check 20 at a time, `manual_override` lets you fix bad translations permanently.
2. **Content originality risk** — Detail pages add internal links to related toxins (e.g., other plants with calcium oxalate), JSON-LD MedicalEntity markup, and the bilingual rendering is itself a moat against pure-English aggregators.
3. **Thin content risk** — Each detail page renders meaningful body content (description, symptoms with metadata, safetyNotes), not just a title + image.
4. **Image SEO** — Slug-based filenames, deterministic alt text, JSON-LD ImageObject, sitemap. EXIF/IPTC metadata deliberately ignored (negligible signal).

## Driver script

```bash
#!/usr/bin/env bash
# pipeline/sync_site.sh
set -e
python pipeline/dump_firestore.py
python pipeline/build_site_payload.py
python pipeline/translate_site.py "$@"     # passes through --limit etc.
python pipeline/download_images.py
python pipeline/emit_to_site.py
echo "✓ Pipeline complete."
echo "Next: cd ../mewguard_site && npm run build"
```

## Alternatives Considered

### Build an API layer in front of Firestore

Rejected. App already uses Firebase SDK directly (with offline cache, real-time updates, security rules); adding an API forces a rewrite of App data layer or creates two divergent paths. Site is static — a runtime API adds a server to maintain and defeats CDN-pure-static delivery. Translation belongs offline-with-cache, not request-time. Real shared contract is the zod schema, not an API.

Revisit if any of these occur: (a) site needs personalized data behind login, (b) third parties consume our data, (c) Android / Web App where Firebase SDK isn't viable.

### Fetch from Firestore at Astro build time

Rejected. Build would depend on Firestore being reachable + service-account secrets in CI. Translation results would have to live somewhere anyway (you don't want to retranslate on every build), so we'd end up with a cache layer in the build — at which point the dump-to-disk pattern is cleaner and gives PR-reviewable diffs.

### Keep `src/data/*.ts` hardcoded TS arrays

Rejected. Doesn't scale past ~20 entries, no type guardrails, manual editing for every Firestore change defeats the point.

## Implementation order (proposed PRs)

1. **PR 1** — `build_site_payload.py` + `translation_glossary.json` skeleton + en payload landing.
2. **PR 2** — `translate_site.py` with `--dry-run` only first; ship batching + cache logic without actually calling Gemini. Add unit tests for hash/skip/stale logic.
3. **PR 3** — Wire Gemini CLI into `translate_site.py`. Run on 5 entries, hand-review, iterate.
4. **PR 4** — `download_images.py` + WebP conversion.
5. **PR 5** — Astro content collection config + schema sync to `mewguard_site`. Delete `src/data/{plants,foods}.ts`.
6. **PR 6** — `[slug].astro` detail page + JSON-LD + hreflang. Update existing `plants.astro` / `foods.astro` to read collection.
7. **PR 7** — `emit_to_site.py` + `sync_site.sh` driver + sitemap config.
8. **PR 8** — `--retry-failed`, `--invalidate-all`, prune mode for images.

## Open Questions / Deferred

- Glossary seeding: who writes the initial ~50 terms? Probably a one-time pass after PR 1, before PR 3 runs.
- Internal-link generation between related toxins (e.g., "other plants with calcium oxalate") — out of scope for v1, revisit when content density justifies it.
- Per-image captions in Firestore — design leaves a path (optional `imageCaptions[]` field) but not implemented now.
- household pipeline — once Firestore schema is extended to allow `category: "household"`, the same pipeline works with minor filter change.
