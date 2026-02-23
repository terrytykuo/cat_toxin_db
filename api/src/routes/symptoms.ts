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
