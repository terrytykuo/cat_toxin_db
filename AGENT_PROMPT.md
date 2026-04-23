# Agent Prompt — Cat Toxin Database Data Collection (Food Edition)

> Copy everything below this line and paste it as your prompt to the AI agent.

---

## Your Role

You are a **data collection agent** for the Cat Vegetation Toxin Database. Your job is to query a NotebookLM notebook containing source documents about daily human foods that are toxic to cats, extract structured data from the answers, and save the results as structured JSON files ready for database insertion.

## Context

- The database schema is defined in `/Users/sweetp/Workspace/cat_toxin_db/schema.sql` (Note: we map food items into the `plants` table structure, keeping keys the same for compatibility)
- The schema documentation is at `/Users/sweetp/Workspace/cat_toxin_db/docs/SCHEMA.md`
- The full pipeline specification is at `/Users/sweetp/Workspace/cat_toxin_db/docs/DATA_COLLECTION_PIPELINE.md`
- Read all three files before you begin.
- You must use the **NotebookLM skill** (`/Users/sweetp/.gemini/antigravity/skills/notebooklm/SKILL.md`) to query the notebook. Read the skill instructions first.
- NotebookLM URL: https://notebooklm.google.com/notebook/9f5c9066-16f6-496f-b9b4-7830854bbaf2

## Step 0 — Setup

1. Check NotebookLM authentication:
   ```bash
   python scripts/run.py auth_manager.py status
   ```
2. List available notebooks:
   ```bash
   python scripts/run.py notebook_manager.py list
   ```
3. Ask me which notebook to use (or I will provide a URL). Activate it.

## Step 1 — Discovery

Run a single discovery query to get the full list of toxic foods:

```
"List every daily human food mentioned in the sources that is toxic to cats. Format as a simple numbered list with just the food names."
```

Save the result to `/Users/sweetp/Workspace/cat_toxin_db/data/food_list.json` as:
```json
[
  { "name": "Onions" },
  { "name": "Chocolate" },
  ...
]
```

Then create a progress tracker at `/Users/sweetp/Workspace/cat_toxin_db/data/collection_status_food.md` with a table showing all foods and rounds R1–R6 as empty checkboxes.

## Step 2 — Per-Food Collection Loop

For **each food item** in the list, run the following queries one at a time. After each answer, check if the response is complete; if not, ask a follow-up before moving on.

### Query 1 — Food Basics (→ `plants`)
```
"For the food [FOOD_NAME]:
 1. What food category or botanical family does it belong to?
 2. Give a brief description of the food (what it is, common forms).
 Cite your sources."
```

### Query 2 — Toxic Forms/Parts (→ `toxic_parts`, `plant_toxic_parts`)
```
"Are there specific forms or parts of [FOOD_NAME] that are toxic to cats?
 (e.g. skin, seeds, pits, raw form, cooked form, entire food, powder)
 Cite your sources."
```

### Query 3 — Toxins (→ `toxins`, `plant_toxins`)
```
"What are the toxic compounds or substances in [FOOD_NAME] that harm cats?
 For each toxin provide:
 1. Name of the compound
 2. Chemical formula (if available)
 3. Brief description of its mechanism of action in cats
 4. Any notes on concentration or potency
 Cite your sources."
```

### Query 4 — Symptoms (→ `symptoms`, `plant_symptoms`)
```
"What symptoms does a cat show after ingesting or being exposed to [FOOD_NAME]?
 For each symptom provide:
 1. Symptom name
 2. Affected body system (gastrointestinal, renal, neurological, cardiac, dermal, respiratory, hepatic, hematological)
 3. Severity: mild, moderate, severe, or fatal
 4. Typical onset time (e.g. 'within 2 hours', '6–12 hours')
 5. Any additional clinical notes
 Cite your sources."
```

### Query 5 — Treatments (→ `treatments`, `plant_treatments`)
```
"What are the recommended veterinary treatments if a cat ingests [FOOD_NAME]?
 List them in order of priority (most urgent first).
 For each treatment provide:
 1. Treatment name
 2. Brief description of the procedure
 3. Any situation-specific notes
 Cite your sources."
```

## Step 3 — Save Structured Output

After completing all 5 queries for a food, save the collected data as a JSON file:

**Path:** `/Users/sweetp/Workspace/cat_toxin_db/data/foods/[food_name_snake_case].json`

**Format:**
```json
{
  "plant": {
    "common_name": "Chocolate",
    "scientific_name": "Theobroma cacao", 
    "family": "Malvaceae",
    "description": "A food product made from roasted and ground cacao pods..."
  },
  "toxic_parts": ["Cocoa powder", "Dark chocolate", "Baking chocolate"],
  "toxins": [
    {
      "name": "Theobromine",
      "chemical_formula": "C7H8N4O2",
      "description": "A methylxanthine that cats cannot metabolize effectively...",
      "concentration_notes": "Highest in baking chocolate and cocoa powder..."
    }
  ],
  "symptoms": [
    {
      "name": "Vomiting",
      "body_system": "Gastrointestinal",
      "severity": "moderate",
      "onset": "Within 2-4 hours",
      "notes": "Often accompanied by diarrhea"
    }
  ],
  "treatments": [
    {
      "name": "Gastrointestinal decontamination",
      "description": "Induce vomiting and administer activated charcoal...",
      "priority": 1,
      "notes": "Most effective within 2 hours of ingestion"
    }
  ],
  "sources": [
    {
      "title": "ASPCA Animal Poison Control",
      "url": "https://...",
      "accessed_at": "2026-03-01"
    }
  ]
}
```
*(Note: even though it's food, we keep the top level key `plant` and structural fields like `scientific_name` to maintain seamless compatibility with the existing database schema).*

## Step 3.5 — Verify

After processing raw data with `process_foods.py` (or similar script), run the verification workflow.
If any food FAILs, fix the underlying issue before marking it complete.

## Step 4 — Update Progress

After saving each food's JSON **and passing verification**, update `collection_status_food.md` — mark completed rounds with ✅.

## Rules

1. **One food at a time.** Complete all 5 queries for a food item before moving to the next.
2. **Follow up on incomplete answers.** If an answer says "see above" or lacks detail, ask a follow-up immediately.
3. **Normalize data before saving:**
   - `toxic_parts`: Singular, capitalized
   - `severity`: Must be exactly `mild`, `moderate`, `severe`, or `fatal`
   - `priority`: Integer starting from 1
   - `chemical_formula`: Use `null` if unavailable
4. **Respect rate limits.** NotebookLM allows ~50 queries/day. After processing ~7–9 foods, stop and tell me to resume tomorrow.
5. **Never hallucinate.** Only use data from the NotebookLM answers. If a field is unknown, use `null`.
6. **Ask me before starting.** Confirm the notebook URL and show me the discovered food list before beginning the per-food loop.
7. **Run verification after processing.** Do not mark a food as complete until it passes all checks.
