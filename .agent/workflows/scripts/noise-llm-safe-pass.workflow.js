export const meta = {
  name: 'noise-llm-safe-pass',
  description: 'Safe context-aware NotebookLM noise repair for truncated toxin fields (no fabrication)',
  phases: [{ title: 'Repair', detail: 'one agent per 35-field batch, writes batch file' }],
}

// Working dir = <repo>/data/audits/noise_work (produced by pipeline/noise_build_candidates.py).
const WORK = "/Users/sweetp/Workspace/MewGuard/cat_toxin_db/data/audits/noise_work"
const CAND = `${WORK}/candidates.json`
const OUTDIR = `${WORK}/llm_batches`
const TOTAL = (args && args.total) || 1929
const SIZE = (args && args.size) || 35

const RULES = `You are cleaning NotebookLM source-collection artifacts from a cat-toxin safety database. STRICT NO-FABRICATION task: the content is veterinary/medical and must NEVER gain invented facts.

Read this JSON file (array of candidate fields):
${CAND}
Each item: file, arr, idx, field, item_name (the symptom/treatment/chemical this text belongs to), siblings (names of sibling list items — useful to recognize leaked headers), text (the value to clean).

Every text was flagged because it does NOT end in terminal punctuation. Pick the ONE correct safe action per item:
- "ADD_PERIOD": text is a COMPLETE sentence/clause merely missing its final period (last word is whole, e.g. "...electrolyte imbalances", "...into the cat's bloodstream", "...lethal quantities"). cleaned = original + "." (NO other change).
- "STRIP_LEAK": a leaked next-section header, sibling item name, footnote digits, bullet "•", or source/citation string (e.g. "...- Toxicology - Merck Veterinary Manual", "...risk of vomiting.Hypersalivation" where Hypersalivation is a sibling/next header) is glued onto the end. cleaned = remove ONLY the glued garbage, keep the clean sentence, end with proper punctuation. Never remove legitimate medical content.
- "TRIM_TRUNCATED": text is cut off MID-WORD (data lost at source, e.g. "...by a veterinary pr"=professional, "...lead to acute ki"=kidney, "...for fluid and electro"=electrolytes, "...resulting in rapid,"=dangling). DO NOT guess the missing word. cleaned = trim back to the LAST COMPLETE SENTENCE (ending . ! ?).
- "LEAVE": no safe fix — the ENTIRE field is one truncated sentence with no earlier complete sentence to fall back to. cleaned = text unchanged.

ABSOLUTE RULES:
- NEVER invent or complete a truncated word; NEVER add new medical facts/symptoms/compounds/clauses.
- ADD_PERIOD: cleaned must equal original + exactly ".".
- TRIM_TRUNCATED: cleaned must be a strict PREFIX of original, ending in . ! or ?.
- STRIP_LEAK: cleaned must be original with only trailing garbage removed (a prefix, optionally +"."), keeping all real medical content.
- When unsure between TRIM_TRUNCATED and LEAVE, prefer LEAVE.`

phase('Repair')

const batches = []
for (let s = 0; s < TOTAL; s += SIZE) batches.push([s, Math.min(s + SIZE, TOTAL)])

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['start', 'end', 'count', 'written'],
  properties: {
    start: { type: 'integer' },
    end: { type: 'integer' },
    count: { type: 'integer' },
    written: { type: 'boolean' },
  },
}

const results = await parallel(batches.map(([start, end]) => () =>
  agent(
    `${RULES}

Process ONLY items with global array index in [${start}, ${end}) (i.e. indices ${start} through ${end - 1} inclusive). Use the global index as "i".

Write a JSON array to: ${OUTDIR}/batch_${start}.json
Each element: {"i": <global index>, "action": "<ADD_PERIOD|STRIP_LEAK|TRIM_TRUNCATED|LEAVE>", "cleaned": "<full cleaned text>", "reason": "<=12 words"}.
Verify before finishing: every ADD_PERIOD is original+".", every TRIM/STRIP cleaned is a strict prefix of original ending in terminal punctuation. Fix any that violate, then rewrite the file.

Return the structured summary {start:${start}, end:${end}, count:<items written>, written:true}.`,
    { label: `batch ${start}-${end}`, phase: 'Repair', schema: SCHEMA }
  )
))

const ok = results.filter(Boolean)
const done = ok.filter(r => r.written).length
const missing = batches.filter(([s]) => !ok.find(r => r.start === s)).map(([s, e]) => `${s}-${e}`)
log(`batches done: ${done}/${batches.length}; missing: ${missing.length ? missing.join(',') : 'none'}`)
return { batchesDone: done, batchesTotal: batches.length, missing }
