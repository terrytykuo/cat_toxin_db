export const meta = {
  name: 'toxin-p1-factual-fix',
  description: 'Apply the 13 authority-grounded factual corrections from the P1 audit to canonical disk files (EN *_processed + zh-TW), surgically via Edit',
  phases: [{ title: 'Fix', detail: 'one agent per entry, targeted field edits per audit finding' }],
}

const BASE = '/Users/sweetp/Workspace/MewGuard/cat_toxin_db'
const REPORT = `${BASE}/data/audits/verify-localize-2026-06-25-p1.json`

// slug -> category (where the EN canonical lives)
const ENTRIES = [
  { slug: 'schefflera_spp_or_schefflera_actinphylla', cat: 'plant' },
  { slug: 'agapanthus_orientalis_or_agapanthus_africanus', cat: 'plant' },
  { slug: 'brunfelsia_pauciflora_floribunda', cat: 'plant' },
  { slug: 'chlorophytum_spp', cat: 'plant' },
  { slug: 'nymphaeaceae_spp', cat: 'plant' },
  { slug: 'sugar', cat: 'food' },
  { slug: 'sunflower_seeds', cat: 'food' },
  { slug: 'sweet_pea', cat: 'plant' },
  { slug: 'tradescantia_zebrina', cat: 'plant' },
  { slug: 'unripened_pineapples', cat: 'food' },
  { slug: 'walnuts', cat: 'food' },
  { slug: 'zamioculcas', cat: 'plant' },
  { slug: 'ylang_ylang', cat: 'plant' },
]

const FIX_SCHEMA = {
  type: 'object',
  required: ['slug', 'severity_change', 'en_changes', 'zh_changes', 'files_written', 'left_for_human'],
  properties: {
    slug: { type: 'string' },
    severity_change: { type: 'string', description: 'e.g. "safe -> cautious" or "none"' },
    en_changes: { type: 'array', items: { type: 'string' } },
    zh_changes: { type: 'array', items: { type: 'string' } },
    files_written: { type: 'array', items: { type: 'string' } },
    left_for_human: { type: 'array', items: { type: 'string' }, description: 'anything ambiguous you did NOT change and why' },
  },
}

const prompt = (slug, cat) => {
  const enPath = `${BASE}/data/${cat === 'food' ? 'foods' : 'plants'}_processed/${slug}.json`
  const zhPath = `${BASE}/data/site/zh-TW/${slug}.json`
  return `You are correcting ONE cat-toxin database entry with confirmed FACTUAL errors. Make SURGICAL, targeted edits — use the Edit tool for precise string replacements; do NOT rewrite whole files or reorder keys.

STEP 1 — Read the audit finding for this entry:
- Open ${REPORT}, locate the object in "full" whose slug == "${slug}".
- Use its verify.summary (the authority-grounded factual verdict, with ASPCA / Pet Poison Helpline / Merck citations) and verify.claim_verdicts (per-claim CONFIRMED/REFUTED) as your spec for WHAT to fix.
- Also read audit.zh_fidelity.issues for any entry-specific zh problems that are FACTUAL (e.g. a mistranslated chemical name) — fix those too.

STEP 2 — Read the two canonical files you will edit:
- EN canonical (source of truth): ${enPath}
- zh-TW: ${zhPath}

STEP 3 — Apply ONLY the corrections the finding supports, to BOTH files where applicable:
- severity field MUST be one of the schema enum: "safe" | "cautious" | "toxic". Use "safe" ONLY if authorities say non-toxic to cats; "cautious" for mild toxicity; "toxic" for serious/severe. Keep severity, isToxic (bool), and toxicityLevel internally CONSISTENT (e.g. toxic/cautious => isToxic true; safe => isToxic false).
- Fix REFUTED compound / mechanism in: description, safetyNotes[], and chemicals[] (name/description). Replace fabricated mechanisms with the authority-supported one. Remove fabricated symptoms; do NOT soften real danger (if authorities document fatalities, severity/notes must reflect it).
- Fix wrong plant family if the finding flags it.
- Fix entry-specific FACTUAL zh mistranslations (e.g. wrong chemical name) to match the corrected EN.
- Formatting: plain text only — bullets use "•", NO Markdown (** or *). Traditional Mandarin for zh, full orthographic correctness.

DO NOT touch (a separate batch script handles these dataset-wide):
- symptoms[].notes NotebookLM noise (footnote digits, "[Conversation History]", leaked "2. Drooling" headers) — leave as-is.
- body_system glossary normalization (消化系統 vs 腸胃道 etc.) — leave as-is.
- dropped per-symptom severity in zh — leave as-is.

STEP 4 — After editing, return structured JSON: slug="${slug}", severity_change (old->new or "none"), en_changes (list each concrete edit), zh_changes, files_written (absolute paths), left_for_human (anything ambiguous you intentionally did NOT change, with reason).

Be conservative: only change what the authority-grounded finding justifies. When genuinely unsure, leave it and report in left_for_human.`
}

phase('Fix')
const results = await parallel(ENTRIES.map(e => () =>
  agent(prompt(e.slug, e.cat), { label: `fix:${e.slug}`, phase: 'Fix', schema: FIX_SCHEMA, effort: 'high' })
    .catch(() => null)
))

const ok = results.filter(Boolean)
log(`Factual fixes applied to ${ok.length}/${ENTRIES.length} entries`)
return {
  fixed: ok.length,
  entries: ok.map(r => ({ slug: r.slug, severity_change: r.severity_change, en: r.en_changes, zh: r.zh_changes, left: r.left_for_human })),
}