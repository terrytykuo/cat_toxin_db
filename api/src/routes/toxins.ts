import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { createDb, Env } from '../db/client';
import { toxins, plantToxins, plants } from '../db/schema';

const router = new Hono<{ Bindings: Env }>();

router.get('/', async (c) => {
  const db   = createDb(c.env);
  const rows = await db.select().from(toxins).all();
  return c.json(rows.map(r => ({
    id:               r.id,
    name:             r.name,
    chemical_formula: r.chemicalFormula,
    description:      r.description,
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
