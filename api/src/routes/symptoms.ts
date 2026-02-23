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
