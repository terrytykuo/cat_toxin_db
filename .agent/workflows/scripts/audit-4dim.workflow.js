export const meta = {
  name: 'toxin-adversarial-audit-p1',
  description: 'Adversarially audit the 44 machine-origin (P1) cat-toxin entries: 4-dimension content audit + web-grounded factual refutation',
  phases: [
    { title: 'Audit', detail: 'per-entry: catsafe quality + zh-TW fidelity + raw-noise + extract factual claims' },
    { title: 'Refute', detail: 'web-grounded adversarial verification of each factual claim against ASPCA / Pet Poison Helpline / vet sources' },
  ],
}

const BASE = '/Users/sweetp/Workspace/MewGuard/cat_toxin_db'
const EN = (s) => `${BASE}/data/site/firestore/en/${s}.json`
const ZH = (s) => `${BASE}/data/site/firestore/zh-TW/${s}.json`
const GLOSSARY = `${BASE}/data/site/translation_glossary.json`

const SLUGS = args && Array.isArray(args) && args.length ? args : [
  'abrus_precatorius','adenium_obesum','agave_americana','aglaonema_modestum','allium_schoenoprasum',
  'alocasia_reginula','alstroemeria_spp','anthurium_hookeri','anthurium_spp','arum_spp','asclepias_spp',
  'aucuba_japonica','basil','begonia_maculata','begonia_spp','bones','boston-fern','caffeinated_drinks__soda',
  'caladium_spp_or_alocasia_spp','calathea','candies','cannabis_sativa','capsicum_annuum','cast-iron-plant',
  'cat-grass','catharanthus_reseus','celastrus_scandens','cercocarpus_spp','cherries','chocolate',
  'chrysanthemum_morifolium','cinnamomum_verum','citrus_fruits_oranges_tangerines_lemons_pomelos','citrus_spp',
  'clivia_miniata','cocoa','codiaeum_variegatum','coffee','colchicum_autumnale','convallaria_majalis',
  'corn_on_the_cob','crassula_arborescens_or_crassula','crocus_vernus','cycas_spp_or_zamia_spp','cyclamen_spp',
  'dahlia_pinnata','darlingtonia_californica','dianthus_caryophyllus','dieffenbachia_spp','digitalis_purpurea',
  'dracaena_fragrans','dracaena_marginata_or_dracaena_spp','dracaena_sanderiana','dracaena_spp',
  'epipremnum_aureum_or_epipremnum_spp','eucalyptus','euphorbia_pulcherrima','ficus_benghalensis','ficus_elastica',
  'ficus_lyrata','ficus_spp','gardenia_jasminoides','garlic','gerbera-daisy','gladiolus_spp','green_tomatoes','gum',
  'hedera_spp','helleborus_niger','hemerocallis_spp','homalomena_selby','honeysuckle','hummingbird_mint',
  'hyacinthoides_nonscripta','hyacinthus_spp','hydrangea_spp','ilex','indian_borage','iris','jelly','jimson_weed',
  'kalanchoe_spp','kalmia_latifolia','lantana','lavandula','leeks','lemon_mint','lilium_spp','lisianthus','liver',
  'lyonia_spp','macadamia_nuts','matricaria_chamomilla','mentha__piperita','mentha_pulegium','mentha_requienii',
  'mentha_spp','mentha_x_piperita_chocolate','milk_and_dairy_products','monstera_deliciosa_or_monstera_adansonii',
  'morning_glory','nandina_photina_spp','nandina_spp','narcissus_spp','nerium_oleander','nightshade','onions',
  'orange_mint','peaches','peanuts','peony','persimmons','phalaenopsis-orchid','philodendron_spp_including_birkin',
  'phoradendron_spp_or_viscum','pieris_japonica','pine','pistachios','plums','poppy','potato_chips','pretzels',
  'prunus_laurocerasus','prunus_serotina','pudding','ragwort__tansy','raw_dough','raw_eggs__raw_egg_whites',
  'raw_fish','raw_meat','rheum_rhabarbarum','ricinus_communis','rose','rosemary','rumex_spp',
  'sambucus_spp_including_sambucus_nigra_and_sambucus_racemosa','scadoxus_spp','schlumbergera_spp',
  'solanum_melongena','solanum_pseudocapsicum','spathiphyllum_spp_or_spathiphyllum_wallisii','strelitzia_reginae',
  'syzygium_aromaticum','tradescantia_spathacea','vitis__implied','zamia_furfuracea','zamia_pumila',
  'zantedeschia_aethiopica_or_zantedeschia_spp','zephyranthes_drummondii',
]

const AUDIT_SCHEMA = {
  type: 'object',
  required: ['slug','name_en','category','severity_claimed','en_quality','zh_fidelity','raw_noise','factual_claims','preliminary_risk'],
  properties: {
    slug: { type: 'string' },
    name_en: { type: 'string' },
    category: { type: 'string', enum: ['TOXIC','NON-TOXIC-RISKY','SAFE'] },
    severity_claimed: { type: 'string' },
    isToxic_claimed: { type: ['boolean','null'] },
    en_quality: {
      type: 'object', required: ['verdict','word_count','issues'],
      properties: {
        verdict: { type: 'string', enum: ['PASS','NEEDS_REVISION','FAIL'] },
        word_count: { type: 'number' },
        issues: { type: 'array', items: { type: 'string' } },
        suggested_focus: { type: 'string' },
      },
    },
    zh_fidelity: {
      type: 'object', required: ['verdict','issues','glossary_divergences','untranslated_name'],
      properties: {
        verdict: { type: 'string', enum: ['PASS','NEEDS_REVISION','FAIL'] },
        issues: { type: 'array', items: { type: 'string' } },
        glossary_divergences: { type: 'array', items: { type: 'string' } },
        untranslated_name: { type: 'boolean' },
      },
    },
    raw_noise: { type: 'array', items: { type: 'string' } },
    factual_claims: {
      type: 'array',
      items: {
        type: 'object', required: ['claim_type','claim'],
        properties: {
          claim_type: { type: 'string', enum: ['compound','mechanism','symptom','toxic_part','severity','isToxic'] },
          claim: { type: 'string' },
        },
      },
    },
    preliminary_risk: { type: 'string', enum: ['low','medium','high'] },
  },
}

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

const CATSAFE = `CatSafe content-quality gate (app renders PLAIN TEXT — bullets must be "•", NO Markdown, no ** or *):
- TOXIC entries need ALL of: opening paragraph stating what it is AND why dangerous; named active compound/toxin; mechanism of harm; >=2 specific symptoms.
- NON-TOXIC-RISKY need: opening stating it is NOT toxic; specific risks (dangerous parts/prep/conditions); actionable guidance.
- SAFE need: states it is safe; minor caveats. Short OK.
- Length bands (words): TOXIC 100-380 (target 150-250); RISKY 80-350; SAFE 30-180.
- Auto-FAIL anti-patterns: bare one-liner; bullets-only with no opening paragraph; template "may cause GI upset" with no compound/mechanism; human-focused ("keep away from children"); repeated info; padding over max.`

const auditPrompt = (slug) => `You are auditing ONE cat-toxin database entry. Read both files:
- English (authoritative content): ${EN(slug)}
- zh-TW translation: ${ZH(slug)}
- Terminology glossary (canonical zh-TW for body_system / toxic_parts / severity): ${GLOSSARY}

${CATSAFE}

Do a 4-part audit and return structured JSON ONLY:
1. en_quality: classify category (TOXIC / NON-TOXIC-RISKY / SAFE), count words in description, apply the gate above, list concrete issues + a suggested_focus line.
2. zh_fidelity: is the zh-TW faithful to the EN (no dropped clauses, no invented claims, danger NOT softened)? Natural Traditional Mandarin, no machine-translationese, no Simplified-character leakage? Does terminology (body_system, toxicParts, severity words) match the glossary — list any glossary_divergences? Is "name" a real zh-TW name or still ASCII (untranslated_name)? Plain-text formatting (no Markdown)?
3. raw_noise: list any NotebookLM artifacts in the EN fields — footnote residue glued to words (e.g. "synthesis1"), placeholder strings ("Not provided in the given sources."), chemicals[].description starting with "in cats:" or prompt-echo prefixes, truncated/duplicated notes.
4. factual_claims: extract the discrete factual claims a vet toxicologist should verify — the toxin/compound name(s), the mechanism, each listed symptom, toxic_part(s), the severity grading, and isToxic. One claim per item. Also set preliminary_risk (high if severity toxic/fatal or if you suspect the toxic/safe classification itself may be wrong).
Return slug="${slug}".`

const refutePrompt = (slug, audit) => `You are a SKEPTICAL veterinary-toxicology fact-checker. Your job is to DISPROVE the claims below about the entry "${audit?.name_en || slug}" (slug ${slug}), NOT to confirm them.

Claims to challenge:
${(audit?.factual_claims || []).map((c, i) => `${i + 1}. [${c.claim_type}] ${c.claim}`).join('\n') || '(no claims extracted — independently verify whether this item is toxic to cats and why)'}

Cross-check each claim with web search against AUTHORITATIVE sources, in priority order:
1) ASPCA Animal Poison Control toxic/non-toxic plant database, 2) Pet Poison Helpline, 3) peer-reviewed / veterinary clinical sources (Merck Vet Manual, VCA). Wikipedia/blogs are leads, not authorities.

Rules:
- Default to REFUTED or UNVERIFIABLE when authoritative sources are silent or conflicting. Absence of confirmation is a FLAG, not a pass.
- A claim is CONFIRMED only if an authoritative source backs it; record the authority name and url.
- Watch the lethal failure modes: (a) item marked toxic that authorities call NON-toxic to cats (false alarm), (b) item marked safe/non-toxic that is actually TOXIC (the dangerous miss) — set safe_toxic_disagreement=true for either, (c) wrong compound, (d) wrong mechanism, (e) missing/fabricated symptoms, (f) severity over/understated.
- overall_factual = FAIL if any safe↔toxic disagreement or any core compound/mechanism is REFUTED; NEEDS_REVIEW if claims are UNVERIFIABLE; PASS only if the core toxicity claims are CONFIRMED.
Return slug="${slug}".`

phase('Audit')
const results = await pipeline(
  SLUGS,
  (slug) => agent(auditPrompt(slug), { label: `audit:${slug}`, phase: 'Audit', schema: AUDIT_SCHEMA, effort: 'medium' }),
  (audit, slug) => {
    if (!audit) return { slug, audit: null, verify: null }
    return agent(refutePrompt(slug, audit), { label: `refute:${slug}`, phase: 'Refute', schema: VERIFY_SCHEMA, effort: 'high' })
      .then((verify) => ({ slug, audit, verify }))
      .catch(() => ({ slug, audit, verify: null }))
  },
)

const clean = results.filter(Boolean)
const refuted = clean.filter(r => r.verify && (r.verify.overall_factual === 'FAIL' || r.verify.safe_toxic_disagreement))
const needsReview = clean.filter(r => r.verify && r.verify.overall_factual === 'NEEDS_REVIEW')
const enFail = clean.filter(r => r.audit && (r.audit.en_quality?.verdict === 'FAIL'))
const zhFail = clean.filter(r => r.audit && (r.audit.zh_fidelity?.verdict === 'FAIL'))
const withNoise = clean.filter(r => r.audit && (r.audit.raw_noise?.length))

log(`P1 audit done: ${clean.length} entries | factual FAIL/safe-toxic: ${refuted.length} | factual NEEDS_REVIEW: ${needsReview.length} | EN-FAIL: ${enFail.length} | zh-FAIL: ${zhFail.length} | raw-noise: ${withNoise.length}`)

return {
  audited: clean.length,
  safe_toxic_or_factual_fail: refuted.map(r => ({ slug: r.slug, summary: r.verify?.summary, disagreement: r.verify?.safe_toxic_disagreement })),
  factual_needs_review: needsReview.map(r => r.slug),
  en_quality_fail: enFail.map(r => ({ slug: r.slug, issues: r.audit.en_quality.issues })),
  zh_fidelity_fail: zhFail.map(r => ({ slug: r.slug, issues: r.audit.zh_fidelity.issues })),
  raw_noise: withNoise.map(r => ({ slug: r.slug, noise: r.audit.raw_noise })),
  full: clean,
}