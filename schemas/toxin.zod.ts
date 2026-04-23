import { z } from 'zod'

export const SeveritySchema = z.enum(['safe', 'cautious', 'toxic'])
export const CategorySchema = z.enum(['plant', 'food'])
export const SymptomSeveritySchema = z.enum(['mild', 'moderate', 'severe', 'fatal'])

export const ToxinSymptomSchema = z.object({
  name: z.string(),
  body_system: z.string(),
  severity: SymptomSeveritySchema,
  onset: z.string().optional(),
  notes: z.string().optional(),
})

export const ToxinChemicalSchema = z.object({
  name: z.string(),
  chemical_formula: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  concentration_notes: z.string().nullable().optional(),
})

export const ToxinTreatmentSchema = z.object({
  name: z.string(),
  description: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  priority: z.number(),
})

export const ToxinSchema = z.object({
  id: z.string(),
  name: z.string(),
  scientific_name: z.string().optional(),
  family: z.string().optional(),
  aliases: z.array(z.string()),
  category: CategorySchema,
  imageUrls: z.array(z.string()).optional(),
  imageUrl: z.string().optional(),
  toxicParts: z.array(z.string()),
  symptoms: z.array(ToxinSymptomSchema),
  chemicals: z.array(ToxinChemicalSchema).optional(),
  treatments: z.array(ToxinTreatmentSchema).optional(),
  severity: SeveritySchema,
  description: z.string(),
  curatedList: z.enum(['foliage', 'kitchen', 'blooms']).optional(),
  safetyNotes: z.array(z.string()).optional(),
  emergencyNote: z.string().optional(),
  hidden: z.boolean().optional(),
})

export const FIRESTORE_ONLY_FIELDS = [
  'id',
  'imageUrls',
  'imageUrl',
  'hidden',
  'curatedList',
] as const

export const ToxinDiskSchema = ToxinSchema.omit({
  id: true,
  imageUrls: true,
  imageUrl: true,
  hidden: true,
  curatedList: true,
})
