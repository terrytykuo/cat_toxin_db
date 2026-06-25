export const meta = {
  name: 'toxin-p2-refute-remaining',
  description: 'Web-grounded adversarial factual verification for the 103 P2 entries whose refute stage failed on session limits',
  phases: [{ title: 'Refute', detail: 'one skeptic per entry, ASPCA/PPH/Merck cross-check, refute-by-default' }],
}

const BASE = '/Users/sweetp/Workspace/MewGuard/cat_toxin_db'
const EN = (s) => `${BASE}/data/site/firestore/en/${s}.json`

// NOTE: keep this list in sync with data/audits/p2_refute_pending.json.
// After a run, regenerate the pending list and paste it here before re-running.
// Current pending = 54 (the P2 entries whose refute stage never completed).
const SLUGS = [
  'mentha_pulegium', 'mentha_spp', 'mentha_x_piperita_chocolate', 'milk_and_dairy_products',
  'monstera_deliciosa_or_monstera_adansonii', 'morning_glory', 'nandina_photina_spp', 'nandina_spp',
  'narcissus_spp', 'nerium_oleander', 'nightshade', 'onions',
  'orange_mint', 'peaches', 'peanuts', 'peony',
  'persimmons', 'phalaenopsis-orchid', 'philodendron_spp_including_birkin', 'phoradendron_spp_or_viscum',
  'pieris_japonica', 'pine', 'pistachios', 'plums',
  'poppy', 'potato_chips', 'pretzels', 'prunus_laurocerasus',
  'prunus_serotina', 'pudding', 'ragwort__tansy', 'raw_dough',
  'raw_eggs__raw_egg_whites', 'raw_fish', 'raw_meat', 'rheum_rhabarbarum',
  'ricinus_communis', 'rose', 'rosemary', 'rumex_spp',
  'sambucus_spp_including_sambucus_nigra_and_sambucus_racemosa', 'scadoxus_spp', 'schlumbergera_spp', 'solanum_melongena',
  'solanum_pseudocapsicum', 'spathiphyllum_spp_or_spathiphyllum_wallisii', 'strelitzia_reginae', 'syzygium_aromaticum',
  'tradescantia_spathacea', 'vitis__implied', 'zamia_furfuracea', 'zamia_pumila',
  'zantedeschia_aethiopica_or_zantedeschia_spp', 'zephyranthes_drummondii',
]

const VERIFY_SCHEMA = {
  type: 'object',
  required: ['slug','claim_verdicts','safe_toxic_disagreement','overall_factual','summary'],
  properties: {
    slug: { type: 'string' },
    claim_verdicts: {
      type: 'array',
      items: {
        type: 'object', required: ['claim','verdict','note'],
        properties: {
          claim: { type: 'string' },
          verdict: { type: 'string', enum: ['CONFIRMED','REFUTED','UNVERIFIABLE'] },
          authority: { type: 'string' },
          url: { type: 'string' },
          note: { type: 'string' },
        },
      },
    },
    safe_toxic_disagreement: { type: 'boolean' },
    overall_factual: { type: 'string', enum: ['PASS','FAIL','NEEDS_REVIEW'] },
    summary: { type: 'string' },
  },
}

const prompt = (slug) => `You are a SKEPTICAL veterinary-toxicology fact-checker. Read this cat-toxin entry and DISPROVE its factual claims, do NOT rubber-stamp them.

Entry file (English, authoritative content): ${EN(slug)}

Extract the entry's discrete factual claims yourself: the toxin/compound name(s), mechanism of harm, each listed symptom, toxic part(s), the severity grading (severity / isToxic / toxicityLevel), and plant family if present. Then cross-check each with web search against AUTHORITATIVE sources, in priority order:
1) ASPCA Animal Poison Control toxic/non-toxic plant database, 2) Pet Poison Helpline, 3) peer-reviewed / veterinary clinical sources (Merck Vet Manual, VCA). Wikipedia/blogs are leads, not authorities.

Rules:
- Default to REFUTED or UNVERIFIABLE when authoritative sources are silent or conflicting. Absence of confirmation is a FLAG, not a pass.
- CONFIRMED only with an authoritative source; record authority + url.
- Watch the lethal failure modes: (a) item marked toxic that authorities call NON-toxic to cats (false alarm), (b) item marked safe/non-toxic that is actually TOXIC (dangerous miss) — set safe_toxic_disagreement=true for either, (c) wrong compound, (d) wrong mechanism, (e) missing/fabricated symptoms, (f) severity over/understated, (g) cross-contamination from a different plant's profile (a very common error in this dataset).
- overall_factual = FAIL if any safe↔toxic disagreement or any core compound/mechanism REFUTED; NEEDS_REVIEW if core claims UNVERIFIABLE; PASS only if core toxicity claims CONFIRMED.
Return slug="${slug}".`

phase('Refute')
const results = await parallel(SLUGS.map(s => () =>
  agent(prompt(s), { label: `refute:${s}`, phase: 'Refute', schema: VERIFY_SCHEMA, effort: 'high' })
    .then(v => ({ slug: s, verify: v }))
    .catch(() => ({ slug: s, verify: null }))
))

const ok = results.filter(r => r.verify)
const fails = ok.filter(r => r.verify.overall_factual === 'FAIL' || r.verify.safe_toxic_disagreement)
const review = ok.filter(r => r.verify.overall_factual === 'NEEDS_REVIEW')
const stillMissing = results.filter(r => !r.verify).map(r => r.slug)
log(`P2 remaining refute: ${ok.length}/${SLUGS.length} done | FAIL/safe-toxic: ${fails.length} | NEEDS_REVIEW: ${review.length} | still failed: ${stillMissing.length}`)
return {
  refuted: ok.length,
  still_missing: stillMissing,
  fails: fails.map(r => ({ slug: r.slug, disagreement: r.verify.safe_toxic_disagreement, summary: r.verify.summary })),
  needs_review: review.map(r => r.slug),
  all: ok.map(r => ({ slug: r.slug, verify: r.verify })),
}