import { z } from 'zod'

export const GlossarySchema = z.object({
  symptoms_severity: z.record(z.string(), z.string()),
  body_system: z.record(z.string(), z.string()),
  toxic_parts: z.record(z.string(), z.string()),
  terms: z.record(z.string(), z.string()),
})

export type Glossary = z.infer<typeof GlossarySchema>
