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
