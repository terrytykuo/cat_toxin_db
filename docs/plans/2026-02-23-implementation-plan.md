# Cat Toxin DB — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Clean 154 plant JSON files, import into Cloudflare D1, and serve via a Hono API on Cloudflare Workers.

**Architecture:** Python pipeline cleans data via Claude API then generates an import.sql. TypeScript API project (Hono + Drizzle ORM) runs on Cloudflare Workers against a D1 SQLite database.

**Tech Stack:** Python 3, Anthropic SDK, Cloudflare D1, Cloudflare Workers, Hono, Drizzle ORM, TypeScript, Wrangler CLI

---

## Context

- **Design doc:** `docs/plans/2026-02-23-api-architecture-design.md` — read this first for full rationale
- **Drizzle schema:** see Section "Database / Schema" in design doc
- **API endpoints:** see Section "API / Endpoints" in design doc
- **Working directory:** repo root `/Users/sweetp/Workspace/cat_toxin_db/`

---

## Task 1: Run the data cleaning pipeline

**Goal:** Produce `data/plants_cleaned/` with all 154 files cleaned.

**Files:**
- Run: `clean_plants.py` (already written)
- Reads: `data/plants_processed/*.json`
- Writes: `data/plants_cleaned/*.json`
- Progress: `data/clean_progress.json`

**Step 1: Verify ANTHROPIC_API_KEY is set**
```bash
echo $ANTHROPIC_API_KEY
```
Expected: a non-empty string. If empty, set it before continuing.

**Step 2: Check initial status**
```bash
python3 clean_plants.py --status
```
Expected:
```
Total:     154
Cleaned:   0
Pending:   154
Failed:    0
```

**Step 3: Run first batch**
```bash
python3 clean_plants.py --batch-size 10
```
Expected: 10 files cleaned, output ends with `144 remaining`.

**Step 4: Spot-check one cleaned file**
```bash
python3 -c "
import json
d = json.load(open('data/plants_cleaned/abrus_precatorius.json'))
for toxin in d.get('toxins', []):
    print('toxin desc:', repr(toxin.get('description', '')[:120]))
print('toxic_parts:', d.get('toxic_parts'))
"
```
Check:
- No trailing numbers like `synthesis1.`
- No `•` characters
- No `"Not provided in the given sources."`
- No `"in cats:"` prefix

If output looks wrong, stop. Re-read the system prompt in `clean_plants.py` and adjust before continuing.

**Step 5: Process all remaining batches**
```bash
python3 clean_plants.py --batch-size 10
```
Run this repeatedly until status shows `Pending: 0`. If any batch fails:
```bash
python3 clean_plants.py --retry-failed
```

**Step 6: Full verification**
```bash
python3 -c "
import json, glob, re
boilerplate = ['not provided', 'not specified', 'based on the provided']
cite_re = re.compile(r'\w\d+[.\s]')
bullet_re = re.compile(r'[•◦]')
issues = []
for f in sorted(glob.glob('data/plants_cleaned/*.json')):
    d = json.load(open(f))
    text = json.dumps(d)
    name = d.get('plant', {}).get('common_name', f)
    if any(b in text.lower() for b in boilerplate): issues.append(f'[boilerplate] {name}')
    if cite_re.search(text): issues.append(f'[citation]   {name}')
    if bullet_re.search(text): issues.append(f'[bullet]     {name}')
if issues:
    print(f'Issues ({len(issues)}):')
    for i in issues: print(' ', i)
else:
    print(f'All clean! {len(list(glob.glob(\"data/plants_cleaned/*.json\")))} files verified.')
"
```
Expected: `All clean! 154 files verified.`

**Step 7: Commit**
```bash
git add data/plants_cleaned/ data/clean_progress.json
git commit -m "feat: clean all plant data via Claude API"
```

---

## Task 2: Write `import_d1.py`

**Goal:** Generate `import.sql` from `data/plants_cleaned/` ready for D1 import.

**Files:**
- Create: `import_d1.py`
- Reads: `data/plants_cleaned/*.json`
- Writes: `import.sql`

**Step 1: Create `import_d1.py`**

```python
#!/usr/bin/env python3
"""
import_d1.py — Generate import.sql from data/plants_cleaned/ for Cloudflare D1.

Usage:
  python3 import_d1.py            # generate import.sql
  python3 import_d1.py --stats    # show entity counts only
  python3 import_d1.py --execute  # generate then run via wrangler
"""

import json
import glob
import argparse
import subprocess
from pathlib import Path

CLEANED_DIR = Path("data/plants_cleaned")
OUTPUT_FILE = Path("import.sql")


def escape(val):
    """Escape a string value for SQL."""
    if val is None:
        return "NULL"
    return "'" + str(val).replace("'", "''") + "'"


def normalize_name(name: str) -> str:
    """Normalize entity names: strip whitespace, title case."""
    return name.strip().title()


def load_all() -> list[dict]:
    files = sorted(CLEANED_DIR.glob("*.json"))
    if not files:
        raise FileNotFoundError(f"No files found in {CLEANED_DIR}. Run clean_plants.py first.")
    return [json.loads(f.read_text()) for f in files]


def build_lookup_tables(records: list[dict]) -> tuple[dict, dict, dict, dict]:
    """
    Scan all records and build dedup dicts.
    Returns: (toxic_parts, toxins, symptoms, treatments)
    Each dict maps normalized_name → {id, ...fields}
    """
    toxic_parts = {}   # name → {id}
    toxins      = {}   # name → {id, chemical_formula, description}
    symptoms    = {}   # name → {id, body_system}
    treatments  = {}   # name → {id, description}

    def next_id(d):
        return len(d) + 1

    for record in records:
        for part in record.get("toxic_parts", []):
            if not part:
                continue
            name = normalize_name(part)
            if name not in toxic_parts:
                toxic_parts[name] = {"id": next_id(toxic_parts)}

        for toxin in record.get("toxins", []):
            name = normalize_name(toxin.get("name", "") or "")
            if not name:
                continue
            if name not in toxins:
                toxins[name] = {
                    "id":              next_id(toxins),
                    "chemical_formula": toxin.get("chemical_formula"),
                    "description":     toxin.get("description"),
                }
            else:
                # Merge: fill in nulls from later occurrences
                existing = toxins[name]
                if not existing["chemical_formula"] and toxin.get("chemical_formula"):
                    existing["chemical_formula"] = toxin["chemical_formula"]
                if not existing["description"] and toxin.get("description"):
                    existing["description"] = toxin["description"]

        for symptom in record.get("symptoms", []):
            name = normalize_name(symptom.get("name", "") or "")
            if not name:
                continue
            if name not in symptoms:
                symptoms[name] = {
                    "id":          next_id(symptoms),
                    "body_system": symptom.get("body_system"),
                }

        for treatment in record.get("treatments", []):
            name = normalize_name(treatment.get("name", "") or "")
            if not name:
                continue
            if name not in treatments:
                treatments[name] = {
                    "id":          next_id(treatments),
                    "description": treatment.get("description"),
                }

    return toxic_parts, toxins, symptoms, treatments


def generate_sql(records, toxic_parts, toxins, symptoms, treatments) -> str:
    lines = []
    lines.append("-- Cat Toxin DB — D1 Import")
    lines.append("-- Generated by import_d1.py")
    lines.append("PRAGMA foreign_keys = ON;")
    lines.append("")

    # 1. toxic_parts
    lines.append("-- toxic_parts")
    for name, row in toxic_parts.items():
        lines.append(
            f"INSERT OR IGNORE INTO toxic_parts (id, name) VALUES ({row['id']}, {escape(name)});"
        )
    lines.append("")

    # 2. toxins
    lines.append("-- toxins")
    for name, row in toxins.items():
        lines.append(
            f"INSERT OR IGNORE INTO toxins (id, name, chemical_formula, description) "
            f"VALUES ({row['id']}, {escape(name)}, {escape(row['chemical_formula'])}, {escape(row['description'])});"
        )
    lines.append("")

    # 3. symptoms
    lines.append("-- symptoms")
    for name, row in symptoms.items():
        lines.append(
            f"INSERT OR IGNORE INTO symptoms (id, name, body_system) "
            f"VALUES ({row['id']}, {escape(name)}, {escape(row['body_system'])});"
        )
    lines.append("")

    # 4. treatments
    lines.append("-- treatments")
    for name, row in treatments.items():
        lines.append(
            f"INSERT OR IGNORE INTO treatments (id, name, description) "
            f"VALUES ({row['id']}, {escape(name)}, {escape(row['description'])});"
        )
    lines.append("")

    # 5. plants + junctions
    lines.append("-- plants and junction tables")
    for plant_id, record in enumerate(records, start=1):
        plant = record.get("plant", {})
        basics = record.get("basics", {})
        common  = escape(plant.get("common_name"))
        sci     = escape(plant.get("scientific_name"))
        family  = escape(basics.get("family") or plant.get("family"))
        desc    = escape(basics.get("description") or plant.get("description"))

        lines.append(
            f"INSERT INTO plants (id, common_name, scientific_name, family, description) "
            f"VALUES ({plant_id}, {common}, {sci}, {family}, {desc});"
        )

        # plant_toxic_parts
        for part in record.get("toxic_parts", []):
            if not part:
                continue
            part_name = normalize_name(part)
            part_id = toxic_parts[part_name]["id"]
            lines.append(
                f"INSERT OR IGNORE INTO plant_toxic_parts (plant_id, toxic_part_id) "
                f"VALUES ({plant_id}, {part_id});"
            )

        # plant_toxins
        for toxin in record.get("toxins", []):
            name = normalize_name(toxin.get("name", "") or "")
            if not name or name not in toxins:
                continue
            toxin_id = toxins[name]["id"]
            notes = escape(toxin.get("concentration_notes"))
            lines.append(
                f"INSERT OR IGNORE INTO plant_toxins (plant_id, toxin_id, concentration_notes) "
                f"VALUES ({plant_id}, {toxin_id}, {notes});"
            )

        # plant_symptoms
        VALID_SEVERITY = {"mild", "moderate", "severe", "fatal"}
        for symptom in record.get("symptoms", []):
            name = normalize_name(symptom.get("name", "") or "")
            if not name or name not in symptoms:
                continue
            symptom_id = symptoms[name]["id"]
            severity = symptom.get("severity", "moderate") or "moderate"
            if severity.lower() not in VALID_SEVERITY:
                severity = "moderate"
            onset = escape(symptom.get("onset"))
            notes = escape(symptom.get("notes"))
            lines.append(
                f"INSERT OR IGNORE INTO plant_symptoms (plant_id, symptom_id, severity, onset, notes) "
                f"VALUES ({plant_id}, {symptom_id}, {escape(severity.lower())}, {onset}, {notes});"
            )

        # plant_treatments
        for treatment in record.get("treatments", []):
            name = normalize_name(treatment.get("name", "") or "")
            if not name or name not in treatments:
                continue
            treatment_id = treatments[name]["id"]
            priority = int(treatment.get("priority") or 0)
            notes = escape(treatment.get("notes"))
            lines.append(
                f"INSERT OR IGNORE INTO plant_treatments (plant_id, treatment_id, priority, notes) "
                f"VALUES ({plant_id}, {treatment_id}, {priority}, {notes});"
            )

        lines.append("")

    return "\n".join(lines)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--stats",   action="store_true", help="Show counts only")
    parser.add_argument("--execute", action="store_true", help="Run via wrangler after generating")
    args = parser.parse_args()

    print("Loading cleaned plant data...")
    records = load_all()
    print(f"  {len(records)} plants loaded")

    print("Building lookup tables...")
    toxic_parts, toxins, symptoms, treatments = build_lookup_tables(records)

    print(f"  toxic_parts : {len(toxic_parts)}")
    print(f"  toxins      : {len(toxins)}")
    print(f"  symptoms    : {len(symptoms)}")
    print(f"  treatments  : {len(treatments)}")

    if args.stats:
        return

    print("Generating SQL...")
    sql = generate_sql(records, toxic_parts, toxins, symptoms, treatments)
    OUTPUT_FILE.write_text(sql)
    print(f"  Written to {OUTPUT_FILE} ({OUTPUT_FILE.stat().st_size:,} bytes)")

    if args.execute:
        print("Running: wrangler d1 execute cat-toxin-db --file=import.sql --remote")
        result = subprocess.run(
            ["wrangler", "d1", "execute", "cat-toxin-db", "--file=import.sql", "--remote"],
            capture_output=True, text=True
        )
        print(result.stdout)
        if result.returncode != 0:
            print("ERROR:", result.stderr)


if __name__ == "__main__":
    main()
```

**Step 2: Test stats (no API needed)**
```bash
python3 import_d1.py --stats
```
Expected output (approximate):
```
Loading cleaned plant data...
  154 plants loaded
Building lookup tables...
  toxic_parts : ~12
  toxins      : ~80
  symptoms    : ~40
  treatments  : ~30
```
If it crashes, `data/plants_cleaned/` is probably empty — run Task 1 first.

**Step 3: Generate SQL**
```bash
python3 import_d1.py
```
Expected: `import.sql` created.

**Step 4: Spot-check the SQL**
```bash
head -40 import.sql
grep -c "INSERT INTO plants" import.sql
```
Expected: 154 plant inserts.

**Step 5: Commit**
```bash
git add import_d1.py
git commit -m "feat: add D1 import script"
```

---

## Task 3: Scaffold the API project

**Goal:** Create `api/` with Hono + Drizzle + Wrangler configured and running locally.

**Files:**
- Create: `api/` directory tree
- Key config: `api/wrangler.toml`, `api/package.json`, `api/src/db/schema.ts`

**Step 1: Create project**
```bash
mkdir api && cd api
npm create cloudflare@latest . -- --type=hello-world --lang=ts --no-deploy
```
When prompted:
- "Do you want to use git?": No (already in a git repo)

**Step 2: Install dependencies**
```bash
cd api
npm install hono drizzle-orm
npm install --save-dev drizzle-kit @cloudflare/workers-types wrangler
```

**Step 3: Create D1 database**
```bash
cd api
npx wrangler d1 create cat-toxin-db
```
Copy the output `database_id` — you'll need it in the next step.

**Step 4: Configure `api/wrangler.toml`**

Replace the contents with:
```toml
name = "cat-toxin-api"
main = "src/index.ts"
compatibility_date = "2024-01-01"

[[d1_databases]]
binding      = "DB"
database_name = "cat-toxin-db"
database_id  = "PASTE_YOUR_DATABASE_ID_HERE"
```

**Step 5: Create `api/src/db/schema.ts`**

```typescript
import { sqliteTable, text, integer, primaryKey } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const plants = sqliteTable('plants', {
  id:             integer('id').primaryKey({ autoIncrement: true }),
  commonName:     text('common_name').notNull(),
  scientificName: text('scientific_name').notNull().unique(),
  family:         text('family'),
  description:    text('description'),
  imageUrl:       text('image_url'),
  createdAt:      text('created_at').default(sql`CURRENT_TIMESTAMP`),
  updatedAt:      text('updated_at').default(sql`CURRENT_TIMESTAMP`),
});

export const toxicParts = sqliteTable('toxic_parts', {
  id:   integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull().unique(),
});

export const plantToxicParts = sqliteTable('plant_toxic_parts', {
  plantId:     integer('plant_id').notNull().references(() => plants.id,     { onDelete: 'cascade' }),
  toxicPartId: integer('toxic_part_id').notNull().references(() => toxicParts.id, { onDelete: 'cascade' }),
}, (t) => ({ pk: primaryKey({ columns: [t.plantId, t.toxicPartId] }) }));

export const toxins = sqliteTable('toxins', {
  id:              integer('id').primaryKey({ autoIncrement: true }),
  name:            text('name').notNull().unique(),
  chemicalFormula: text('chemical_formula'),
  description:     text('description'),
});

export const plantToxins = sqliteTable('plant_toxins', {
  plantId:            integer('plant_id').notNull().references(() => plants.id,  { onDelete: 'cascade' }),
  toxinId:            integer('toxin_id').notNull().references(() => toxins.id,  { onDelete: 'cascade' }),
  concentrationNotes: text('concentration_notes'),
}, (t) => ({ pk: primaryKey({ columns: [t.plantId, t.toxinId] }) }));

export const symptoms = sqliteTable('symptoms', {
  id:         integer('id').primaryKey({ autoIncrement: true }),
  name:       text('name').notNull().unique(),
  bodySystem: text('body_system'),
});

export const plantSymptoms = sqliteTable('plant_symptoms', {
  plantId:   integer('plant_id').notNull().references(() => plants.id,    { onDelete: 'cascade' }),
  symptomId: integer('symptom_id').notNull().references(() => symptoms.id, { onDelete: 'cascade' }),
  severity:  text('severity', { enum: ['mild', 'moderate', 'severe', 'fatal'] })
               .notNull().default('moderate'),
  onset:     text('onset'),
  notes:     text('notes'),
}, (t) => ({ pk: primaryKey({ columns: [t.plantId, t.symptomId] }) }));

export const treatments = sqliteTable('treatments', {
  id:          integer('id').primaryKey({ autoIncrement: true }),
  name:        text('name').notNull(),
  description: text('description'),
});

export const plantTreatments = sqliteTable('plant_treatments', {
  plantId:     integer('plant_id').notNull().references(() => plants.id,      { onDelete: 'cascade' }),
  treatmentId: integer('treatment_id').notNull().references(() => treatments.id, { onDelete: 'cascade' }),
  priority:    integer('priority').notNull().default(0),
  notes:       text('notes'),
}, (t) => ({ pk: primaryKey({ columns: [t.plantId, t.treatmentId] }) }));

export const sources = sqliteTable('sources', {
  id:         integer('id').primaryKey({ autoIncrement: true }),
  plantId:    integer('plant_id').notNull().references(() => plants.id, { onDelete: 'cascade' }),
  title:      text('title').notNull(),
  url:        text('url'),
  accessedAt: text('accessed_at'),
});
```

**Step 6: Create `api/src/db/client.ts`**
```typescript
import { drizzle } from 'drizzle-orm/d1';
import * as schema from './schema';

export type Env = {
  DB: D1Database;
};

export function createDb(env: Env) {
  return drizzle(env.DB, { schema });
}
```

**Step 7: Configure `api/drizzle.config.ts`**
```typescript
import type { Config } from 'drizzle-kit';

export default {
  schema:    './src/db/schema.ts',
  out:       './drizzle/migrations',
  driver:    'd1-http',
  dialect:   'sqlite',
} satisfies Config;
```

**Step 8: Generate migrations**
```bash
cd api
npx drizzle-kit generate
```
Expected: `drizzle/migrations/0000_*.sql` created.

**Step 9: Apply migrations to local D1**
```bash
cd api
npx wrangler d1 migrations apply cat-toxin-db --local
```
Expected: `Migrations applied` — no errors.

**Step 10: Commit scaffold**
```bash
git add api/
git commit -m "feat: scaffold Hono + Drizzle + Wrangler API project"
```

---

## Task 4: Import data into local D1

**Goal:** Load `import.sql` into the local D1 instance so API development can begin.

**Step 1: Run import against local D1**
```bash
cd api
npx wrangler d1 execute cat-toxin-db --file=../import.sql --local
```
Expected: completes without errors.

**Step 2: Verify row counts**
```bash
cd api
npx wrangler d1 execute cat-toxin-db --local --command="SELECT COUNT(*) as plants FROM plants;"
npx wrangler d1 execute cat-toxin-db --local --command="SELECT COUNT(*) as toxins FROM toxins;"
npx wrangler d1 execute cat-toxin-db --local --command="SELECT COUNT(*) as symptoms FROM symptoms;"
```
Expected: plants ≈ 154, toxins > 0, symptoms > 0.

---

## Task 5: Implement API routes

**Goal:** Implement all endpoints. No tests for Workers (Wrangler dev is the test harness).

**Files:**
- Modify: `api/src/index.ts`
- Create: `api/src/routes/plants.ts`
- Create: `api/src/routes/symptoms.ts`
- Create: `api/src/routes/toxins.ts`

**Step 1: Write `api/src/index.ts`**
```typescript
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { Env } from './db/client';
import plants   from './routes/plants';
import symptoms from './routes/symptoms';
import toxins   from './routes/toxins';

const app = new Hono<{ Bindings: Env }>();

app.use('*', cors());

app.route('/plants',   plants);
app.route('/symptoms', symptoms);
app.route('/toxins',   toxins);

app.get('/', (c) => c.json({ status: 'ok', version: '1.0.0' }));

export default app;
```

**Step 2: Write `api/src/routes/plants.ts`**
```typescript
import { Hono } from 'hono';
import { eq, like, or, sql } from 'drizzle-orm';
import { createDb, Env } from '../db/client';
import {
  plants, plantToxicParts, toxicParts,
  plantToxins, toxins,
  plantSymptoms, symptoms,
  plantTreatments, treatments,
} from '../db/schema';

const router = new Hono<{ Bindings: Env }>();

// GET /plants
router.get('/', async (c) => {
  const db = createDb(c.env);
  const { q, severity, body_system, page = '1', per_page = '20' } = c.req.query();

  const pageNum    = Math.max(1, parseInt(page));
  const perPageNum = Math.min(100, Math.max(1, parseInt(per_page)));
  const offset     = (pageNum - 1) * perPageNum;

  // Build base query with max severity per plant
  let rows = await db
    .select({
      id:             plants.id,
      commonName:     plants.commonName,
      scientificName: plants.scientificName,
      family:         plants.family,
      maxSeverity: sql<string>`MAX(CASE
        WHEN ${plantSymptoms.severity} = 'fatal'   THEN 4
        WHEN ${plantSymptoms.severity} = 'severe'  THEN 3
        WHEN ${plantSymptoms.severity} = 'moderate'THEN 2
        WHEN ${plantSymptoms.severity} = 'mild'    THEN 1
        ELSE 0 END)`,
    })
    .from(plants)
    .leftJoin(plantSymptoms, eq(plantSymptoms.plantId, plants.id))
    .groupBy(plants.id)
    .all();

  // Filters
  if (q) {
    const lower = q.toLowerCase();
    rows = rows.filter(r =>
      r.commonName.toLowerCase().includes(lower) ||
      r.scientificName.toLowerCase().includes(lower)
    );
  }

  if (severity) {
    const severityMap: Record<string, number> = { mild: 1, moderate: 2, severe: 3, fatal: 4 };
    const minLevel = severityMap[severity] ?? 0;
    rows = rows.filter(r => (r.maxSeverity ?? 0) >= minLevel);
  }

  if (body_system) {
    const plantsWithSystem = await db
      .selectDistinct({ plantId: plantSymptoms.plantId })
      .from(plantSymptoms)
      .leftJoin(symptoms, eq(symptoms.id, plantSymptoms.symptomId))
      .where(like(symptoms.bodySystem, `%${body_system}%`))
      .all();
    const ids = new Set(plantsWithSystem.map(r => r.plantId));
    rows = rows.filter(r => ids.has(r.id));
  }

  const total = rows.length;
  const data  = rows.slice(offset, offset + perPageNum).map(r => ({
    id:             r.id,
    common_name:    r.commonName,
    scientific_name: r.scientificName,
    family:         r.family,
    max_severity:   severityLabel(Number(r.maxSeverity)),
  }));

  return c.json({ data, total, page: pageNum, per_page: perPageNum });
});

function severityLabel(n: number): string | null {
  return ['mild', 'moderate', 'severe', 'fatal'][n - 1] ?? null;
}

// GET /plants/:id
router.get('/:id', async (c) => {
  const db = createDb(c.env);
  const id = parseInt(c.req.param('id'));
  if (isNaN(id)) return c.json({ error: 'Invalid id' }, 400);

  const [plant] = await db.select().from(plants).where(eq(plants.id, id)).limit(1);
  if (!plant) return c.json({ error: 'Not found' }, 404);

  const toxicPartsRows = await db
    .select({ name: toxicParts.name })
    .from(plantToxicParts)
    .leftJoin(toxicParts, eq(toxicParts.id, plantToxicParts.toxicPartId))
    .where(eq(plantToxicParts.plantId, id));

  const toxinsRows = await db
    .select({
      name:               toxins.name,
      chemicalFormula:    toxins.chemicalFormula,
      description:        toxins.description,
      concentrationNotes: plantToxins.concentrationNotes,
    })
    .from(plantToxins)
    .leftJoin(toxins, eq(toxins.id, plantToxins.toxinId))
    .where(eq(plantToxins.plantId, id));

  const symptomsRows = await db
    .select({
      name:       symptoms.name,
      bodySystem: symptoms.bodySystem,
      severity:   plantSymptoms.severity,
      onset:      plantSymptoms.onset,
      notes:      plantSymptoms.notes,
    })
    .from(plantSymptoms)
    .leftJoin(symptoms, eq(symptoms.id, plantSymptoms.symptomId))
    .where(eq(plantSymptoms.plantId, id));

  const treatmentsRows = await db
    .select({
      name:        treatments.name,
      description: treatments.description,
      priority:    plantTreatments.priority,
      notes:       plantTreatments.notes,
    })
    .from(plantTreatments)
    .leftJoin(treatments, eq(treatments.id, plantTreatments.treatmentId))
    .where(eq(plantTreatments.plantId, id))
    .orderBy(plantTreatments.priority);

  return c.json({
    id:              plant.id,
    common_name:     plant.commonName,
    scientific_name: plant.scientificName,
    family:          plant.family,
    description:     plant.description,
    image_url:       plant.imageUrl,
    toxic_parts:     toxicPartsRows.map(r => r.name),
    toxins:          toxinsRows.map(r => ({
      name:               r.name,
      chemical_formula:   r.chemicalFormula,
      description:        r.description,
      concentration_notes: r.concentrationNotes,
    })),
    symptoms:        symptomsRows.map(r => ({
      name:        r.name,
      body_system: r.bodySystem,
      severity:    r.severity,
      onset:       r.onset,
      notes:       r.notes,
    })),
    treatments:      treatmentsRows.map(r => ({
      name:        r.name,
      description: r.description,
      priority:    r.priority,
      notes:       r.notes,
    })),
  });
});

export default router;
```

**Step 3: Write `api/src/routes/symptoms.ts`**
```typescript
import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { createDb, Env } from '../db/client';
import { symptoms, plantSymptoms, plants } from '../db/schema';

const router = new Hono<{ Bindings: Env }>();

router.get('/', async (c) => {
  const db   = createDb(c.env);
  const rows = await db.select().from(symptoms).all();
  return c.json(rows.map(r => ({
    id:          r.id,
    name:        r.name,
    body_system: r.bodySystem,
  })));
});

router.get('/:id/plants', async (c) => {
  const db = createDb(c.env);
  const id = parseInt(c.req.param('id'));
  if (isNaN(id)) return c.json({ error: 'Invalid id' }, 400);

  const rows = await db
    .select({
      id:             plants.id,
      commonName:     plants.commonName,
      scientificName: plants.scientificName,
      severity:       plantSymptoms.severity,
    })
    .from(plantSymptoms)
    .leftJoin(plants, eq(plants.id, plantSymptoms.plantId))
    .where(eq(plantSymptoms.symptomId, id));

  return c.json(rows.map(r => ({
    id:              r.id,
    common_name:     r.commonName,
    scientific_name: r.scientificName,
    severity:        r.severity,
  })));
});

export default router;
```

**Step 4: Write `api/src/routes/toxins.ts`**
```typescript
import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { createDb, Env } from '../db/client';
import { toxins, plantToxins, plants } from '../db/schema';

const router = new Hono<{ Bindings: Env }>();

router.get('/', async (c) => {
  const db   = createDb(c.env);
  const rows = await db.select().from(toxins).all();
  return c.json(rows.map(r => ({
    id:              r.id,
    name:            r.name,
    chemical_formula: r.chemicalFormula,
    description:     r.description,
  })));
});

router.get('/:id/plants', async (c) => {
  const db = createDb(c.env);
  const id = parseInt(c.req.param('id'));
  if (isNaN(id)) return c.json({ error: 'Invalid id' }, 400);

  const rows = await db
    .select({
      id:                 plants.id,
      commonName:         plants.commonName,
      scientificName:     plants.scientificName,
      concentrationNotes: plantToxins.concentrationNotes,
    })
    .from(plantToxins)
    .leftJoin(plants, eq(plants.id, plantToxins.plantId))
    .where(eq(plantToxins.toxinId, id));

  return c.json(rows.map(r => ({
    id:                  r.id,
    common_name:         r.commonName,
    scientific_name:     r.scientificName,
    concentration_notes: r.concentrationNotes,
  })));
});

export default router;
```

**Step 5: Start dev server and smoke test**
```bash
cd api
npx wrangler dev
```
In another terminal:
```bash
curl http://localhost:8787/
curl http://localhost:8787/plants | python3 -m json.tool | head -30
curl http://localhost:8787/plants/1 | python3 -m json.tool
curl "http://localhost:8787/plants?severity=fatal" | python3 -m json.tool | head -20
curl http://localhost:8787/symptoms | python3 -m json.tool | head -20
curl http://localhost:8787/toxins | python3 -m json.tool | head -20
```
Check:
- [ ] `/` returns `{"status":"ok"}`
- [ ] `/plants` returns `data` array with `total: 154`
- [ ] `/plants/1` returns nested toxins, symptoms, treatments
- [ ] `/plants?severity=fatal` returns only fatal-severity plants

**Step 6: Commit**
```bash
git add api/src/
git commit -m "feat: implement plants, symptoms, toxins API routes"
```

---

## Task 6: Deploy to Cloudflare

**Goal:** Live API at `https://cat-toxin-api.<your-subdomain>.workers.dev`

**Step 1: Apply migrations to remote D1**
```bash
cd api
npx wrangler d1 migrations apply cat-toxin-db --remote
```

**Step 2: Import data to remote D1**
```bash
cd api
npx wrangler d1 execute cat-toxin-db --file=../import.sql --remote
```
Note: for large SQL files Wrangler may need to batch. If it times out, split `import.sql` into chunks of ~1000 statements.

**Step 3: Deploy Workers**
```bash
cd api
npx wrangler deploy
```
Expected output includes the live URL.

**Step 4: Smoke test live API**
```bash
curl https://cat-toxin-api.<your-subdomain>.workers.dev/plants | python3 -m json.tool | head -10
curl https://cat-toxin-api.<your-subdomain>.workers.dev/plants/1 | python3 -m json.tool
```

**Step 5: Final commit**
```bash
git add api/wrangler.toml
git commit -m "feat: deploy API to Cloudflare Workers"
```
