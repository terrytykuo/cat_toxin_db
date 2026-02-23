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
