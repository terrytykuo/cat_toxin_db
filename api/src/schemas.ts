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
