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
