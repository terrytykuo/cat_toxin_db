export type Severity = 'safe' | 'cautious' | 'toxic'
export type Category = 'plant' | 'food'
export type SymptomSeverity = 'mild' | 'moderate' | 'severe' | 'fatal'

export interface ToxinSymptom {
  name: string
  body_system: string
  severity: SymptomSeverity
  onset?: string
  notes?: string
}

export interface ToxinChemical {
  name: string
  chemical_formula?: string | null
  description?: string | null
  concentration_notes?: string | null
}

export interface ToxinTreatment {
  name: string
  description?: string | null
  notes?: string | null
  priority: number
}

export interface Toxin {
  id: string
  name: string
  scientific_name?: string
  family?: string
  aliases: string[]
  category: Category
  imageUrls?: string[]
  /** @deprecated 遷移期間相容用 */
  imageUrl?: string
  toxicParts: string[]
  symptoms: ToxinSymptom[]
  chemicals?: ToxinChemical[]
  treatments?: ToxinTreatment[]
  severity: Severity
  description: string
  curatedList?: 'foliage' | 'kitchen' | 'blooms'
  safetyNotes?: string[]
  emergencyNote?: string
  hidden?: boolean
}

export interface Glossary {
  symptoms_severity: Record<string, string>
  body_system: Record<string, string>
  toxic_parts: Record<string, string>
  terms: Record<string, string>
}

export interface GlossaryWithMeta extends Glossary {
  updated_at?: string | null
}

export interface VocabularyDiff {
  add: string[]
  orphan: string[]
}

export interface SyncVocabularyResponse {
  body_system: VocabularyDiff
  toxic_parts: VocabularyDiff
}

export interface GlossaryExample {
  source: string
  quote: string
}

export interface GlossaryExamplesResponse {
  symptoms_severity: Record<string, GlossaryExample>
  body_system: Record<string, GlossaryExample>
  toxic_parts: Record<string, GlossaryExample>
  terms: Record<string, GlossaryExample>
}
