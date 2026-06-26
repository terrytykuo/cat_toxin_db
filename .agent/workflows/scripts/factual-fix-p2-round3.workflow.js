export const meta = {
  name: 'toxin-p2-round3-needsreview-fix',
  description: 'Apply authority-grounded cleanups to the 11 P2 NEEDS_REVIEW entries (symptom cross-contamination, overstated severity, misleading compounds) to canonical disk files, surgically via Edit',
  phases: [{ title: 'Fix', detail: 'one agent per entry, targeted field edits per audit finding' }],
}

const BASE = '/Users/sweetp/Workspace/MewGuard/cat_toxin_db'
// p2.json now carries the merged round-2 verify objects (verify.summary / verify.claim_verdicts) in "full".
const REPORT = `${BASE}/data/audits/verify-localize-2026-06-25-p2.json`

// The 11 NEEDS_REVIEW slugs from the P2 refute round-2 (directionally correct; need symptom/severity/compound cleanup per verify.summary).
// slug -> category (where the EN canonical lives)
const ENTRIES = [
  { slug: 'mentha_x_piperita_chocolate', cat: 'plant' },
  { slug: 'nightshade', cat: 'plant' },
  { slug: 'orange_mint', cat: 'plant' },
  { slug: 'philodendron_spp_including_birkin', cat: 'plant' },
  { slug: 'scadoxus_spp', cat: 'plant' },
  { slug: 'schlumbergera_spp', cat: 'plant' },
  { slug: 'vitis__implied', cat: 'plant' },
  { slug: 'peaches', cat: 'food' },
  { slug: 'pretzels', cat: 'food' },
  { slug: 'raw_eggs__raw_egg_whites', cat: 'food' },
  { slug: 'raw_meat', cat: 'food' },
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
- Fix REFUTED compound / mechanism in: description, safetyNotes[], and chemicals[] (name/description). Replace fabricated mechanisms with the authority-supported one. Remove fabricated symptoms (e.g. a "symptom" whose name is a truncated sentence fragment, or a symptom imported from a different plant's cyanide profile); do NOT soften real danger (if authorities document fatalities, severity/notes must reflect it).
- Fix wrong plant family / scientificName if the finding flags it. For manufactured-food entries where scientificName/family are meaningless placeholders ("Various", the product name), set them to null only if the finding explicitly calls them placeholders.
- Fix wrong toxicParts (remove plant-anatomy terms cross-contaminated onto a food entry, e.g. Seed/Pit/Skin on dairy/dough; add the genuinely dangerous part if the finding names it, e.g. shell for pistachios).
- Fix entry-specific FACTUAL zh mistranslations (e.g. wrong chemical name) to match the corrected EN.
- Formatting: plain text only — bullets use "•", NO Markdown (** or *). Traditional Mandarin for zh, full orthographic correctness.

DO NOT touch (a separate batch script handles these dataset-wide):
- symptoms[].notes NotebookLM noise that is purely formatting (trailing footnote digits, "[Conversation History]", leaked "2. Drooling" headers in an otherwise-valid note) — leave as-is. (But DO remove a whole symptom whose NAME is fabricated/truncated garbage.)
- body_system glossary normalization (消化系統 vs 腸胃道 etc.) — leave as-is.
- dropped per-symptom severity in zh — leave as-is.

SPECIAL CASE — botanical conflation (e.g. nandina_photina_spp merges two genera/families): do NOT attempt to split the entry into two. Fix only what is unambiguous from the finding (e.g. correct the named compound, correct the family to the authority value for the primary taxon) and record the split decision + any residual ambiguity in left_for_human.

STEP 4 — After editing, return structured JSON: slug="${slug}", severity_change (old->new or "none"), en_changes (list each concrete edit), zh_changes, files_written (absolute paths), left_for_human (anything ambiguous you intentionally did NOT change, with reason).

Be conservative: only change what the authority-grounded finding justifies. When genuinely unsure, leave it and report in left_for_human.`
}

phase('Fix')
const results = await parallel(ENTRIES.map(e => () =>
  agent(prompt(e.slug, e.cat), { label: `fix:${e.slug}`, phase: 'Fix', schema: FIX_SCHEMA, effort: 'high' })
    .catch(() => null)
))

const ok = results.filter(Boolean)
log(`P2 round-3 NEEDS_REVIEW fixes applied to ${ok.length}/${ENTRIES.length} entries`)
return {
  fixed: ok.length,
  entries: ok.map(r => ({ slug: r.slug, severity_change: r.severity_change, en: r.en_changes, zh: r.zh_changes, files: r.files_written, left: r.left_for_human })),
}
