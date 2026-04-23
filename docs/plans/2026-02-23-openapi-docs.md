# OpenAPI Documentation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add OpenAPI spec + Swagger UI to the existing Hono API so developers and AI agents can discover and integrate with the cat toxin database API.

**Architecture:** Use `@hono/zod-openapi` to replace plain Hono routes with schema-aware routes. Zod schemas define request/response shapes, which are automatically compiled into an OpenAPI 3.0 JSON spec served at `/openapi.json`. Swagger UI is served at `/docs` using Hono's built-in `hono/swagger-ui` middleware.

**Tech Stack:** Hono v4, `@hono/zod-openapi`, `zod`, Cloudflare Workers, Vitest

---

### Task 1: Install dependencies

**Files:**
- Modify: `api/package.json` (via npm)

**Step 1: Install packages**

```bash
cd api && npm install @hono/zod-openapi zod
```

Expected: `@hono/zod-openapi` and `zod` appear in `dependencies` in `package.json`.

**Step 2: Commit**

```bash
cd api && git add package.json package-lock.json
git commit -m "feat: install @hono/zod-openapi and zod"
```

---

### Task 2: Write failing tests for new endpoints

**Files:**
- Modify: `api/test/index.spec.ts`

**Step 1: Add tests for /docs and /openapi.json**

Append these tests inside the `describe('Cat Toxin API', ...)` block in `api/test/index.spec.ts`:

```typescript
it('GET /docs returns Swagger UI HTML', async () => {
  const response = await SELF.fetch('https://example.com/docs');
  expect(response.status).toBe(200);
  const text = await response.text();
  expect(text.toLowerCase()).toContain('swagger');
});

it('GET /openapi.json returns OpenAPI 3.0 spec', async () => {
  const response = await SELF.fetch('https://example.com/openapi.json');
  expect(response.status).toBe(200);
  const body = await response.json() as { openapi: string; info: { title: string } };
  expect(body.openapi).toBe('3.0.0');
  expect(body.info.title).toBe('Cat Toxin Database API');
});
```

**Step 2: Run tests to confirm they fail**

```bash
cd api && npm test
```

Expected: The two new tests FAIL with 404 or similar. The two existing tests still PASS.

---

### Task 3: Create shared Zod schemas

**Files:**
- Create: `api/src/schemas.ts`

**Step 1: Write the schemas file**

Create `api/src/schemas.ts` with this exact content:

```typescript
import { z } from '@hono/zod-openapi';

export const ErrorSchema = z.object({
  error: z.string(),
}).openapi('Error');

// --- Plants ---

export const PlantSummarySchema = z.object({
  id:              z.number(),
  common_name:     z.string(),
  scientific_name: z.string(),
  family:          z.string().nullable(),
  max_severity:    z.enum(['mild', 'moderate', 'severe', 'fatal']).nullable(),
}).openapi('PlantSummary');

export const PlantsListResponseSchema = z.object({
  data:     z.array(PlantSummarySchema),
  total:    z.number(),
  page:     z.number(),
  per_page: z.number(),
}).openapi('PlantsListResponse');

export const ToxinDetailSchema = z.object({
  name:                z.string().nullable(),
  chemical_formula:    z.string().nullable(),
  description:         z.string().nullable(),
  concentration_notes: z.string().nullable(),
}).openapi('ToxinDetail');

export const SymptomDetailSchema = z.object({
  name:        z.string().nullable(),
  body_system: z.string().nullable(),
  severity:    z.enum(['mild', 'moderate', 'severe', 'fatal']).nullable(),
  onset:       z.string().nullable(),
  notes:       z.string().nullable(),
}).openapi('SymptomDetail');

export const TreatmentDetailSchema = z.object({
  name:        z.string().nullable(),
  description: z.string().nullable(),
  priority:    z.number().nullable(),
  notes:       z.string().nullable(),
}).openapi('TreatmentDetail');

export const PlantDetailSchema = z.object({
  id:              z.number(),
  common_name:     z.string(),
  scientific_name: z.string(),
  family:          z.string().nullable(),
  description:     z.string().nullable(),
  image_url:       z.string().nullable(),
  toxic_parts:     z.array(z.string().nullable()),
  toxins:          z.array(ToxinDetailSchema),
  symptoms:        z.array(SymptomDetailSchema),
  treatments:      z.array(TreatmentDetailSchema),
}).openapi('PlantDetail');

// --- Symptoms ---

export const SymptomSchema = z.object({
  id:          z.number(),
  name:        z.string(),
  body_system: z.string().nullable(),
}).openapi('Symptom');

export const PlantWithSeveritySchema = z.object({
  id:              z.number().nullable(),
  common_name:     z.string().nullable(),
  scientific_name: z.string().nullable(),
  severity:        z.enum(['mild', 'moderate', 'severe', 'fatal']).nullable(),
}).openapi('PlantWithSeverity');

// --- Toxins ---

export const ToxinSchema = z.object({
  id:               z.number(),
  name:             z.string(),
  chemical_formula: z.string().nullable(),
  description:      z.string().nullable(),
}).openapi('Toxin');

export const PlantWithConcentrationSchema = z.object({
  id:                  z.number().nullable(),
  common_name:         z.string().nullable(),
  scientific_name:     z.string().nullable(),
  concentration_notes: z.string().nullable(),
}).openapi('PlantWithConcentration');
```

---

### Task 4: Refactor plants route

**Files:**
- Modify: `api/src/routes/plants.ts`

**Step 1: Replace the entire file content**

```typescript
import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { eq, sql } from 'drizzle-orm';
import { createDb, Env } from '../db/client';
import {
  plants, plantToxicParts, toxicParts,
  plantToxins, toxins,
  plantSymptoms, symptoms,
  plantTreatments, treatments,
} from '../db/schema';
import {
  PlantsListResponseSchema,
  PlantDetailSchema,
  ErrorSchema,
} from '../schemas';

const router = new OpenAPIHono<{ Bindings: Env }>();

const listPlantsRoute = createRoute({
  method: 'get',
  path: '/',
  summary: 'List plants',
  description: 'Returns a paginated list of plants toxic to cats. Supports filtering by name, severity level, and affected body system.',
  request: {
    query: z.object({
      q:           z.string().optional().openapi({ description: 'Search by common or scientific name' }),
      severity:    z.enum(['mild', 'moderate', 'severe', 'fatal']).optional().openapi({ description: 'Minimum severity filter' }),
      body_system: z.string().optional().openapi({ description: 'Filter by affected body system (e.g. gastrointestinal, cardiac)' }),
      page:        z.string().optional().openapi({ description: 'Page number (default: 1)' }),
      per_page:    z.string().optional().openapi({ description: 'Results per page (default: 20, max: 100)' }),
    }),
  },
  responses: {
    200: {
      content: { 'application/json': { schema: PlantsListResponseSchema } },
      description: 'Paginated list of plants',
    },
  },
});

router.openapi(listPlantsRoute, async (c) => {
  const db = createDb(c.env);
  const { q, severity, body_system, page = '1', per_page = '20' } = c.req.valid('query');

  const pageNum    = Math.max(1, parseInt(page));
  const perPageNum = Math.min(100, Math.max(1, parseInt(per_page)));
  const offset     = (pageNum - 1) * perPageNum;

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
    rows = rows.filter(r => (Number(r.maxSeverity) ?? 0) >= minLevel);
  }

  if (body_system) {
    const plantsWithSystem = await db
      .selectDistinct({ plantId: plantSymptoms.plantId })
      .from(plantSymptoms)
      .leftJoin(symptoms, eq(symptoms.id, plantSymptoms.symptomId))
      .where(sql`${symptoms.bodySystem} LIKE ${'%' + body_system + '%'}`)
      .all();
    const ids = new Set(plantsWithSystem.map(r => r.plantId));
    rows = rows.filter(r => ids.has(r.id));
  }

  const total = rows.length;
  const data  = rows.slice(offset, offset + perPageNum).map(r => ({
    id:              r.id,
    common_name:     r.commonName,
    scientific_name: r.scientificName,
    family:          r.family,
    max_severity:    severityLabel(Number(r.maxSeverity)),
  }));

  return c.json({ data, total, page: pageNum, per_page: perPageNum });
});

function severityLabel(n: number): string | null {
  return ['mild', 'moderate', 'severe', 'fatal'][n - 1] ?? null;
}

const getPlantRoute = createRoute({
  method: 'get',
  path: '/:id',
  summary: 'Get plant detail',
  description: 'Returns full detail for a single plant including toxins, symptoms, treatments, and toxic parts.',
  request: {
    params: z.object({
      id: z.string().openapi({ description: 'Plant ID' }),
    }),
  },
  responses: {
    200: {
      content: { 'application/json': { schema: PlantDetailSchema } },
      description: 'Plant detail',
    },
    400: {
      content: { 'application/json': { schema: ErrorSchema } },
      description: 'Invalid ID',
    },
    404: {
      content: { 'application/json': { schema: ErrorSchema } },
      description: 'Plant not found',
    },
  },
});

router.openapi(getPlantRoute, async (c) => {
  const db = createDb(c.env);
  const id = parseInt(c.req.valid('param').id);
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
      name:                r.name,
      chemical_formula:    r.chemicalFormula,
      description:         r.description,
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

---

### Task 5: Refactor symptoms route

**Files:**
- Modify: `api/src/routes/symptoms.ts`

**Step 1: Replace the entire file content**

```typescript
import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { eq } from 'drizzle-orm';
import { createDb, Env } from '../db/client';
import { symptoms, plantSymptoms, plants } from '../db/schema';
import { SymptomSchema, PlantWithSeveritySchema, ErrorSchema } from '../schemas';

const router = new OpenAPIHono<{ Bindings: Env }>();

const listSymptomsRoute = createRoute({
  method: 'get',
  path: '/',
  summary: 'List symptoms',
  description: 'Returns all known symptoms that plants can cause in cats.',
  responses: {
    200: {
      content: { 'application/json': { schema: z.array(SymptomSchema) } },
      description: 'List of symptoms',
    },
  },
});

router.openapi(listSymptomsRoute, async (c) => {
  const db   = createDb(c.env);
  const rows = await db.select().from(symptoms).all();
  return c.json(rows.map(r => ({
    id:          r.id,
    name:        r.name,
    body_system: r.bodySystem,
  })));
});

const plantsBySymptomsRoute = createRoute({
  method: 'get',
  path: '/:id/plants',
  summary: 'Plants by symptom',
  description: 'Returns all plants that can cause a given symptom in cats.',
  request: {
    params: z.object({
      id: z.string().openapi({ description: 'Symptom ID' }),
    }),
  },
  responses: {
    200: {
      content: { 'application/json': { schema: z.array(PlantWithSeveritySchema) } },
      description: 'Plants that cause this symptom',
    },
    400: {
      content: { 'application/json': { schema: ErrorSchema } },
      description: 'Invalid ID',
    },
  },
});

router.openapi(plantsBySymptomsRoute, async (c) => {
  const db = createDb(c.env);
  const id = parseInt(c.req.valid('param').id);
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

---

### Task 6: Refactor toxins route

**Files:**
- Modify: `api/src/routes/toxins.ts`

**Step 1: Replace the entire file content**

```typescript
import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { eq } from 'drizzle-orm';
import { createDb, Env } from '../db/client';
import { toxins, plantToxins, plants } from '../db/schema';
import { ToxinSchema, PlantWithConcentrationSchema, ErrorSchema } from '../schemas';

const router = new OpenAPIHono<{ Bindings: Env }>();

const listToxinsRoute = createRoute({
  method: 'get',
  path: '/',
  summary: 'List toxins',
  description: 'Returns all known toxins found in plants that are toxic to cats.',
  responses: {
    200: {
      content: { 'application/json': { schema: z.array(ToxinSchema) } },
      description: 'List of toxins',
    },
  },
});

router.openapi(listToxinsRoute, async (c) => {
  const db   = createDb(c.env);
  const rows = await db.select().from(toxins).all();
  return c.json(rows.map(r => ({
    id:               r.id,
    name:             r.name,
    chemical_formula: r.chemicalFormula,
    description:      r.description,
  })));
});

const plantsByToxinRoute = createRoute({
  method: 'get',
  path: '/:id/plants',
  summary: 'Plants by toxin',
  description: 'Returns all plants that contain a given toxin.',
  request: {
    params: z.object({
      id: z.string().openapi({ description: 'Toxin ID' }),
    }),
  },
  responses: {
    200: {
      content: { 'application/json': { schema: z.array(PlantWithConcentrationSchema) } },
      description: 'Plants containing this toxin',
    },
    400: {
      content: { 'application/json': { schema: ErrorSchema } },
      description: 'Invalid ID',
    },
  },
});

router.openapi(plantsByToxinRoute, async (c) => {
  const db = createDb(c.env);
  const id = parseInt(c.req.valid('param').id);
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

---

### Task 7: Refactor index.ts

**Files:**
- Modify: `api/src/index.ts`

**Step 1: Replace the entire file content**

```typescript
import { OpenAPIHono } from '@hono/zod-openapi';
import { cors } from 'hono/cors';
import { swaggerUI } from 'hono/swagger-ui';
import { Env } from './db/client';
import plants   from './routes/plants';
import symptoms from './routes/symptoms';
import toxins   from './routes/toxins';

const app = new OpenAPIHono<{ Bindings: Env }>();

app.use('*', cors());

app.route('/plants',   plants);
app.route('/symptoms', symptoms);
app.route('/toxins',   toxins);

app.get('/', (c) => c.json({ status: 'ok', version: '1.0.0' }));

app.doc('/openapi.json', {
  openapi: '3.0.0',
  info: {
    title: 'Cat Toxin Database API',
    version: '1.0.0',
    description: 'Query plants toxic to cats — includes toxins, symptoms, treatments, and toxic parts.',
  },
  servers: [{ url: 'https://cat-toxin-api.oldiegoodie99.workers.dev' }],
});

app.get('/docs', swaggerUI({ url: '/openapi.json' }));

export default app;
```

---

### Task 8: Run all tests

**Step 1: Run the full test suite**

```bash
cd api && npm test
```

Expected: All 4 tests PASS:
- `GET / returns status ok (unit style)` ✓
- `GET / returns status ok (integration style)` ✓
- `GET /docs returns Swagger UI HTML` ✓
- `GET /openapi.json returns OpenAPI 3.0 spec` ✓

If TypeScript compilation errors appear, check that `@hono/zod-openapi` is installed correctly and that import paths match exactly.

**Step 2: Commit**

```bash
cd api && git add src/ test/
git commit -m "feat: add OpenAPI spec and Swagger UI via @hono/zod-openapi"
```

---

### Task 9: Deploy and verify

**Step 1: Deploy to Cloudflare Workers**

```bash
cd api && npm run deploy
```

**Step 2: Open the Swagger UI in browser**

Visit: `https://cat-toxin-api.oldiegoodie99.workers.dev/docs`

Expected: Swagger UI page showing all 6 endpoints with descriptions and interactive "Try it out" buttons.

**Step 3: Verify OpenAPI spec is accessible**

Visit: `https://cat-toxin-api.oldiegoodie99.workers.dev/openapi.json`

Expected: JSON response starting with `{"openapi":"3.0.0","info":{"title":"Cat Toxin Database API",...}}`
