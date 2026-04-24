# Data Collection Pipeline — Cat Vegetation Toxin Database

How to systematically extract plant toxicity data from a NotebookLM notebook, shape it into validated JSON, and seed Firestore via the admin UI.

---

## High-Level Flow

```mermaid
flowchart TD
    A["📓 NotebookLM Notebook\n(source documents uploaded)"] --> B["🔍 Query Phase\nAsk structured questions\nper plant / per topic"]
    B --> C{"Answer complete?"}
    C -- No --> D["Ask follow-up\n(more detail / missing fields)"]
    D --> B
    C -- Yes --> E["📝 Parse & Normalize\nraw JSON → processed JSON\n(schema-validated)"]
    E --> F["💾 Seed to Firestore\nvia admin UI\n(double-writes disk JSON)"]
    F --> G{"More plants?"}
    G -- Yes --> B
    G -- No --> H["✅ Collection Complete"]
```

---

## Prerequisites

1. **NotebookLM notebook** — Upload your source documents (PDFs, web pages, articles on plant toxicity for cats) into a Google NotebookLM notebook.
2. **Authentication** — Run `python scripts/run.py auth_manager.py status` and authenticate if needed.
3. **Register the notebook** — Add it to the skill's library:
   ```bash
   python scripts/run.py notebook_manager.py add \
     --url "https://notebooklm.google.com/notebook/YOUR_ID" \
     --name "Cat Toxic Plants" \
     --description "Source documents on plants toxic to cats" \
     --topics "cats,toxicology,plants,veterinary"
   ```

---

## Query Strategy

The queries are organized into **rounds** that map directly onto the JSON record shape. Each round targets one plant at a time to keep answers focused and parseable.

### Round 0 — Discovery (run once)

> Get the full list of plants covered in your sources so you know what to iterate over.

```
"List every plant species mentioned in the sources that is toxic to cats.
 For each plant, provide the common name and scientific name.
 Format as a numbered list."
```

This gives you the **iteration list** for the remaining rounds.

---

### Round 1 — Plant basics

```
"For the plant [COMMON_NAME] ([SCIENTIFIC_NAME]):
 1. What botanical family does it belong to?
 2. Give a brief description of the plant (appearance, habitat, where commonly found).
 Cite your sources."
```

**Maps to JSON fields:** `family`, `description`

---

### Round 2 — Toxic parts

```
"Which parts of [COMMON_NAME] are toxic to cats?
 (e.g. leaves, bulbs, flowers, pollen, stems, roots, seeds, bark, sap, fruit, entire plant)
 Cite your sources."
```

**Maps to JSON fields:** `toxicParts[]`

---

### Round 3 — Chemicals

```
"What are the toxic compounds or substances in [COMMON_NAME] that harm cats?
 For each toxin provide:
 1. Name of the compound
 2. Chemical formula (if available)
 3. Brief description of its mechanism of action in cats
 4. Any notes on concentration or potency
 Cite your sources."
```

**Maps to JSON fields:** `chemicals[].name`, `chemicals[].chemical_formula`, `chemicals[].description`, `chemicals[].concentration_notes`

---

### Round 4 — Symptoms

```
"What symptoms does a cat show after ingesting or being exposed to [COMMON_NAME]?
 For each symptom provide:
 1. Symptom name
 2. Affected body system (e.g. gastrointestinal, renal, neurological, cardiac, dermal)
 3. Severity: mild, moderate, severe, or fatal
 4. Typical onset time (e.g. 'within 2 hours', '6–12 hours')
 5. Any additional clinical notes
 Cite your sources."
```

**Maps to JSON fields:** `symptoms[].name`, `symptoms[].body_system`, `symptoms[].severity`, `symptoms[].onset`, `symptoms[].notes`

---

### Round 5 — Treatments

```
"What are the recommended veterinary treatments if a cat ingests [COMMON_NAME]?
 List them in order of priority (most urgent first).
 For each treatment, provide:
 1. Treatment name
 2. Brief description of the procedure
 3. Any situation-specific notes
 Cite your sources."
```

**Maps to JSON fields:** `treatments[].name`, `treatments[].description`, `treatments[].notes`, `treatments[].priority`

---

### Round 6 — Sources (captured in raw JSON)

Every NotebookLM answer includes citations. These stay inline inside `data/plants/<slug>.json`'s `raw_responses` field for audit purposes — the processed toxin shape does not carry a structured `sources` array. If a citation contradicts later data, go back to the raw file.

---

## Rate Limit Budget

NotebookLM allows **~50 queries/day** on a free account.

| Round | Queries per plant | Notes |
|---|---|---|
| 0 — Discovery | 1 (total) | Run once |
| 1 — Plant basics | 1 | |
| 2 — Toxic parts | 1 | |
| 3 — Chemicals | 1 | May need 1 follow-up |
| 4 — Symptoms | 1 | May need 1 follow-up |
| 5 — Treatments | 1 | |
| **Total per plant** | **~5–7** | |

**Throughput:** ~7–9 plants per day (with follow-ups). Plan your collection batches accordingly.

---

## Data Normalization Rules

Before writing processed JSON, normalize the raw answers:

| Field | Rule |
|---|---|
| `scientific_name` | Title-case binomial (e.g. *Lilium longiflorum*) |
| `toxicParts[]` | Singular, lowercase (e.g. `"leaf"` not `"Leaves"`) |
| `chemicals[].name` | Capitalize first letter (e.g. "Lycorine") |
| `symptoms[].name` | Capitalize first letter (e.g. "Vomiting") |
| `symptoms[].severity` | Exactly one of: `mild`, `moderate`, `severe`, `fatal` |
| `severity` (top-level) | Exactly one of: `safe`, `cautious`, `toxic` |
| `treatments[].priority` | Integer starting from 1 (1 = most urgent) |
| `category` | Exactly `plant` or `food` |

The canonical shape is defined in [`schemas/toxin.zod.ts`](../schemas/toxin.zod.ts) and the generated JSON Schema used for validation is `schemas/toxin.disk.schema.json`.

---

## Processed JSON shape

One file per toxin at `data/plants_processed/<slug>.json` (or `data/foods_processed/<slug>.json` when `category === 'food'`). `<slug>` is derived from `scientific_name`. Files must validate against `schemas/toxin.disk.schema.json` — `process_plants.py` / `process_foods.py` enforce this and refuse to write on failure.

Firestore-only fields (`id`, `imageUrls`, `imageUrl`, `hidden`, `curatedList`) never appear on disk; they are added later by the admin UI when seeding.

---

## Verification

Before seeding to Firestore, run the verification workflow (`/verify-data`) to catch issues:

```bash
python3 pipeline/verify_raw.py       # flags incomplete raw collection
python3 pipeline/process_plants.py   # re-parse raw → processed (schema-validated)
python3 pipeline/verify_plants.py    # 3-tier audit: completeness, schema, cleanliness
```

The audit checks for:
- **Completeness** — all required fields and arrays are non-empty
- **Schema** — values match `toxin.disk.schema.json` constraints (severity enum, field lengths, valid toxic parts)
- **Cleanliness** — no parsing artifacts, trailing source refs, header labels as values, or chatbot text

A plant should not be marked as "Done" in `collection_status.md` until it passes all checks.

---

## Example: Full Loop for One Plant

```
┌─ Query Round 0 ─────────────────────────────────────────┐
│  "List every toxic plant…"                              │
│  → Result: Easter Lily, Sago Palm, Azalea, …            │
└─────────────────────────────────────────────────────────┘
          │
          ▼  Pick: "Easter Lily"
┌─ Round 1 ───────────────────────────────────────────────┐
│  "For Easter Lily…family, description…"                 │
│  → raw JSON: data/plants/lilium_longiflorum.json        │
└─────────────────────────────────────────────────────────┘
          │
          ▼
┌─ Round 2 ───────────────────────────────────────────────┐
│  "Which parts of Easter Lily are toxic?"                │
│  → append to the same raw JSON (toxicParts)             │
└─────────────────────────────────────────────────────────┘
          │
          ▼
┌─ Rounds 3–5 (same pattern) ────────────────────────────┐
│  Chemicals → Symptoms → Treatments                      │
└─────────────────────────────────────────────────────────┘
          │
          ▼
┌─ Round 6 ───────────────────────────────────────────────┐
│  Citations stay inline inside raw_responses             │
└─────────────────────────────────────────────────────────┘
          │
          ▼  Then: process_plants.py → schema-validated
          ▼        admin UI → Firestore + disk JSON mirror
          ▼  Next plant: "Sago Palm" → repeat
```

---

## Progress Tracking

Create a simple checklist (or a `collection_status.md`) to track which plants have been fully collected:

```markdown
| # | Plant | R1 | R2 | R3 | R4 | R5 | R6 | Done |
|---|-------|----|----|----|----|----|----|------|
| 1 | Easter Lily | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| 2 | Sago Palm   | ✅ | ✅ | ⏳ |    |    |    |    |
| 3 | Azalea      |    |    |    |    |    |    |    |
```
