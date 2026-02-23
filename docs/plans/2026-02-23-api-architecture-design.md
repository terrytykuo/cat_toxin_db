# Cat Toxin DB — API Architecture Design

**Date:** 2026-02-23
**Status:** Approved

---

## Problem Statement

1. All collected plant data is in messy text format (inline citation numbers, bullet characters, boilerplate non-answers).
2. Data needs to be loaded into a database and served via an API for use in a consumer app.

---

## Data Cleaning

### Approach

Use Claude API (claude-haiku-4-5) to re-parse the processed JSON files and produce clean structured output.

**Why LLM over regex:**
The messiness is semantic — citation numbers embedded mid-sentence, boilerplate phrases mixed with real data — which regex handles poorly at edge cases. Haiku is fast and cheap enough to clean all 154 files in ~16 API calls.

### Pipeline

```
data/plants_processed/   (154 files, messy text)
        ↓
  clean_plants.py        (Claude API, batches of 10)
        ↓
data/plants_cleaned/     (same structure, clean text)
```

### Script: `clean_plants.py`

| Flag | Behaviour |
|---|---|
| *(none)* | Process next batch of 10 files |
| `--batch-size N` | Override batch size |
| `--status` | Show progress only |
| `--retry-failed` | Retry previously failed files |

Progress is tracked in `data/clean_progress.json`.

### Batch Size Rationale

| Batch | Tokens/call | Batches | Total cost |
|---|---|---|---|
| 10 ✓ | ~25,000 | 16 | ~$0.73 |
| 20 | ~49,500 | 8 | ~$0.73 |

Batch=10 chosen: same cost as larger batches, smaller blast radius on failure, well within Haiku's 200k context window.

### Cleaning Rules

1. **Inline citations** — remove numbers embedded in text (`synthesis1.` → `synthesis.`)
2. **Bullet characters** — strip `•`, `◦` at line starts
3. **Boilerplate** — replace with `null` (`"Not provided in the given sources."` → `null`)
4. **Redundant prefixes** — strip `"in cats:"`, `"Brief Description (...)"`

### Workflow

See `.agent/workflows/clean-data.md`.

---

## Database

### Choice: Cloudflare D1

D1 is SQLite at the edge, native to Cloudflare Workers. Chosen to stay fully within the Cloudflare ecosystem.

**Why not PostgreSQL:**
Cloudflare Workers run on V8 isolates with no persistent TCP connections. Native PostgreSQL is not supported. Alternatives (Hyperdrive + external PG, Supabase) introduce external dependencies and lose the edge-native advantage.

### Schema

The existing relational design (`docs/SCHEMA.md`) is preserved with minor SQLite adaptations:

| PostgreSQL | SQLite / Drizzle |
|---|---|
| `SERIAL` | `integer().primaryKey({ autoIncrement: true })` |
| `TIMESTAMPTZ` | `text()` (ISO 8601) |
| `CREATE TYPE ... AS ENUM` | `text({ enum: [...] })` |
| `VARCHAR(n)` | `text()` |

### Entity Relationships (unchanged)

```
plants ←→ toxic_parts     Many-to-Many   via plant_toxic_parts
plants ←→ toxins           Many-to-Many   via plant_toxins
plants ←→ symptoms         Many-to-Many   via plant_symptoms
plants ←→ treatments       Many-to-Many   via plant_treatments
plants  →  sources         One-to-Many
```

Key design insight: junction tables carry payload (severity, onset, priority, concentration_notes) because the same symptom or toxin has different clinical context per plant.

---

## API

### Stack

| Layer | Choice | Reason |
|---|---|---|
| Runtime | Cloudflare Workers | Edge-native, free tier sufficient |
| Framework | Hono | Lightweight, TypeScript-native, built for Workers |
| ORM | Drizzle ORM | Type-safe, D1-native, auto-generates migrations |
| Language | TypeScript | Cloudflare Workers ecosystem standard |

### Project Structure

```
api/
├── src/
│   ├── index.ts           Hono app entry point
│   ├── routes/
│   │   ├── plants.ts
│   │   ├── symptoms.ts
│   │   └── toxins.ts
│   └── db/
│       ├── schema.ts      Drizzle table definitions
│       └── client.ts      D1 binding helper
├── drizzle/
│   └── migrations/        Auto-generated SQL migrations
├── wrangler.toml
└── package.json
```

### Endpoints

#### Plants

```
GET /plants          List all plants (paginated, filterable)
GET /plants/:id      Single plant with full nested data
```

**`GET /plants` query parameters:**

| Param | Description | Example |
|---|---|---|
| `q` | Name search (common or scientific) | `?q=lily` |
| `severity` | Filter by max severity | `?severity=fatal` |
| `body_system` | Filter by affected body system | `?body_system=renal` |
| `page` | Page number (default: 1) | `?page=2` |
| `per_page` | Results per page (default: 20) | `?per_page=50` |

**`GET /plants` response shape:**
```json
{
  "data": [
    {
      "id": 1,
      "common_name": "Rosary Pea",
      "scientific_name": "Abrus precatorius",
      "family": "Fabaceae",
      "max_severity": "severe"
    }
  ],
  "total": 154,
  "page": 1,
  "per_page": 20
}
```

**`GET /plants/:id` response shape:**
```json
{
  "id": 1,
  "common_name": "Rosary Pea",
  "scientific_name": "Abrus precatorius",
  "family": "Fabaceae",
  "description": "A climbing vine with red seeds...",
  "image_url": null,
  "toxic_parts": ["Seed"],
  "toxins": [
    {
      "name": "Abrin",
      "chemical_formula": null,
      "description": "Inhibits cellular protein synthesis...",
      "concentration_notes": "Only released if seed coat is broken..."
    }
  ],
  "symptoms": [
    {
      "name": "Gastrointestinal distress",
      "body_system": "Gastrointestinal",
      "severity": "severe",
      "onset": null,
      "notes": "..."
    }
  ],
  "treatments": [
    {
      "name": "Electrolyte Replacement",
      "description": "...",
      "priority": 1,
      "notes": null
    }
  ]
}
```

#### Cross-reference

```
GET /symptoms              List all symptoms
GET /symptoms/:id/plants   Plants that cause this symptom

GET /toxins                List all toxins
GET /toxins/:id/plants     Plants that contain this toxin
```

### Intentional Omissions

- **No write endpoints** (`POST` / `PATCH` / `DELETE`) — data is updated via the import pipeline, not through the API
- **No authentication** — public read-only API; rate limiting handled by Cloudflare

---

## Deployment Architecture

```
Cloudflare CDN / DDoS protection
          ↓
  Cloudflare Workers  (Hono API)
          ↓
  Cloudflare D1       (SQLite)
```

---

## Remaining Work

- [ ] Run `clean_plants.py` across all 154 files
- [ ] Write `import_d1.py` — ETL from `data/plants_cleaned/` → D1
- [ ] Scaffold `api/` project (Hono + Drizzle + Wrangler)
- [ ] Implement API routes
- [ ] Deploy to Cloudflare Workers
