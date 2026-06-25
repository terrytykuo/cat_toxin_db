---
description: Adversarially audit and localize the cat toxin database — verify English factual accuracy (web-grounded), content quality, zh-TW fidelity, and clean raw-source noise. Audit-first, human-gated fixes, then sync disk + Firestore.
---

# /verify-and-localize-toxins — Content Verification & Localization Goal

> **GOAL:** Produce a trustworthy, fully-localized cat toxin database. The data is the
> product's core asset — a wrong toxin, mechanism, or symptom can get a cat killed.
> Treat every factual claim as guilty until an authoritative source proves it innocent.

This workflow is **audit-first**. It NEVER rewrites entries during the audit pass
(per the `catsafe-content-quality-gate` skill). It produces a prioritized report,
**stops at a human gate**, and only then fixes and syncs.

---

## 0 — Load context & skill (do this first, every run)

1. **Invoke the `catsafe-content-quality-gate` skill** — it defines the category
   checklists (TOXIC / NON-TOXIC-RISKY / SAFE), anti-patterns, length bands, the
   plain-text formatting rules (`•` bullets, NO Markdown), and the verdict block format.
   The English-content-quality dimension of this workflow IS that skill. Do not
   re-derive its criteria from memory — read the current version.
2. Read `CLAUDE.md` and `docs/SITE_SYNC_HANDOFF.md` for the live data flow.
3. Confirm working dir: `/Users/sweetp/Workspace/MewGuard/cat_toxin_db` (all paths below
   are relative to this repo root unless absolute).

### What the database looks like (so the audit targets the right fields)

| Layer | Path | Role |
|---|---|---|
| English canonical (mirror) | `data/plants_processed/*.json` (198), `data/foods_processed/*.json` (57) | system-of-record content |
| zh-TW localization | `data/site/zh-TW/*.json` (~180) | translated `name`, `description`, `safetyNotes`, `symptoms[].name`, `toxicParts`, etc. |
| Terminology glossary | `data/site/translation_glossary.json` | canonical zh-TW for `body_system`, `toxic_parts`, `symptoms_severity`, free `terms` |
| Firestore EN cache | `data/site/firestore/en/*.json` | last pull from live store |
| Schema (source of truth) | `schemas/toxin.zod.ts` | field contract |

Audited content fields per entry: `name`, `scientific_name`, `description`,
`safetyNotes[]`, `symptoms[]` (`name`, `body_system`, `severity`, `onset?`),
`chemicals[]`, `treatments[]`, `toxicParts[]`, `severity` (`safe|cautious|toxic`),
`isToxic`, `toxicityLevel`, `emergencyNote`.

---

## 1 — Scope & priority bucketing

**Authoritative scope = the Firestore live caches**, NOT raw disk. Firestore is the
live store users actually see; `data/site/firestore/{en,zh-TW}/` is the most recent
pull. Raw disk (`data/{plants,foods}_processed/`, 253 slugs) and legacy
`data/site/zh-TW/` (180) carry **duplicate / alias slugs in inconsistent namespaces**
(e.g. `mint` / `mentha_piperita` / `mentha__piperita`; `onions` / `allium_cepa`) — a
disk-keyed "untranslated" diff is mostly slug noise, not missing translations. Treat
slug reconciliation as backlog (K11/K16), not part of this content audit.

Bucket the live set by zh-TW translation provenance (`gemini_model` field). The
`manual_override` flag alone is NOT a reliable verified-signal (it is set broadly) —
use `gemini_model`:

```bash
# Live scope: ~200 EN entries, each with a zh-TW counterpart.
ls data/site/firestore/en/*.json | wc -l          # ~200 (authoritative EN set)
ls data/site/firestore/zh-TW/*.json | wc -l       # ~201 (1 orphan zh-TW to reconcile)

# orphan zh-TW with no EN source (reconcile, don't audit as content):
comm -13 <(for f in data/site/firestore/en/*.json;    do basename "$f" .json; done | sort -u) \
         <(for f in data/site/firestore/zh-TW/*.json; do basename "$f" .json; done | sort -u)

# P1 — machine-origin (deep audit): gemini-2.5-pro / gemini-cli / gemini-cli-default (~44)
# P2 — human-touched (fast screen): codex-manual / gemini-cli-manual-review (~149)
for f in data/site/firestore/zh-TW/*.json; do
  printf '%s\t%s\n' "$(python3 -c "import json;print(json.load(open('$f')).get('gemini_model',''))")" "$(basename "$f" .json)"
done | sort
```

Priority tiers for the audit:

- **P0 — untranslated** (EN entry exists, no zh-TW): in the live set this is ~0. Any
  disk-only entry that is genuinely a distinct toxin (not an alias) → localize from scratch.
- **P1 — machine-origin** (`gemini-2.5-pro` / `gemini-cli*`): full 4-dimension audit
  incl. web-grounded adversarial verification.
- **P2 — human-touched** (`codex-manual` / `gemini-cli-manual-review`): fast confirmatory
  screen — escalate to deep audit only on a red flag.

Process in batches of 10–20 (the `catsafe-content-quality-gate` Batch Review Mode).

---

## 2 — Mechanical pre-pass (cheap, deterministic — run before any LLM work)

```bash
python3 pipeline/verify_plants.py    # 3-tier: completeness, schema, cleanliness
python3 pipeline/verify_foods.py
```

Feed the report at `data/verification_report.json` into the audit as known-failures.
This catches schema drift, empty fields, and obvious junk for free.

---

## 3 — The four audit dimensions

For **each entry**, produce one verdict block (skill's format) covering all four:

### Dimension A — English content quality & structure
Apply the `catsafe-content-quality-gate` checklist for the entry's category
(TOXIC / NON-TOXIC-RISKY / SAFE): opening paragraph, named compound, mechanism,
≥2 specific symptoms, length band, anti-patterns, plain-text formatting (no Markdown,
`•` bullets). Verdict: PASS / NEEDS_REVISION / FAIL.

### Dimension B — English factual accuracy (ADVERSARIAL, web-grounded)
This is the highest-stakes dimension. See §4 for the adversarial protocol.

### Dimension C — zh-TW fidelity & terminology
- Translation is faithful to the EN source (no dropped clauses, no invented claims,
  no softened danger — an emergency in EN must read as an emergency in zh-TW).
- Natural Traditional Mandarin, **not** machine-translationese; full orthographic
  correctness (proper 繁體 characters, no Simplified leakage).
- Terminology matches `data/site/translation_glossary.json`: `body_system`,
  `toxicParts`, severity words must use the glossary's canonical zh-TW. Flag any
  divergence (e.g. `Gastrointestinal` must be `消化系統`/`腸胃道` per glossary, not ad-hoc).
- Same plain-text formatting rules as EN (no Markdown, `•` bullets).
- `name` must be a real zh-TW name, not left in ASCII.

### Dimension D — raw-source noise
Scan EN fields for NotebookLM artifacts that leaked through processing:
- footnote residue glued to words (`synthesis1`, `ricin)1`, trailing superscript digits)
- placeholder strings (`"Not provided in the given sources."`)
- `chemicals[].description` starting with `"in cats:"` or other prompt-echo prefixes
- duplicated/truncated `notes` fields
Flag these for cleanup (they also pollute the zh-TW source).

---

## 4 — Adversarial factual verification (the core safety mechanism)

For every **P0/P1 entry** and every **P2 entry that tripped a red flag**, spawn an
**adversarial verifier subagent** (Agent tool, general-purpose). Its job is NOT to
confirm — it is to **refute**.

Adversarial subagent contract:

> You are a skeptical veterinary-toxicology fact-checker. You are given ONE toxin
> entry's factual claims (toxin/compound name, mechanism of harm, listed symptoms,
> toxic parts, severity, isToxic). Your job is to **disprove** them. For each claim,
> cross-check against authoritative sources via web search — in priority order:
> **ASPCA Animal Poison Control toxic/non-toxic plant database, Pet Poison Helpline,
> peer-reviewed / veterinary clinical sources (Merck Vet Manual, VCA, journals).**
> Wikipedia and blogs are leads, not authorities.
>
> Default to REFUTED when sources are silent or conflicting — absence of confirmation
> is a flag, not a pass. For each claim return: `{claim, verdict: CONFIRMED|REFUTED|UNVERIFIABLE,
> authority_url, note}`. Call out the dangerous failure modes explicitly:
> (a) a plant/food listed as toxic that authorities say is **non-toxic** (false alarm),
> (b) a plant listed as safe/non-toxic that is actually **toxic** (the lethal miss),
> (c) wrong compound or wrong mechanism, (d) missing or fabricated symptoms,
> (e) severity over/understated vs. authoritative grading.

Use a JSON schema for structured output. Run verifiers in parallel across the batch.
A claim survives only if CONFIRMED by ≥1 authoritative source; UNVERIFIABLE and
REFUTED both go to the report as must-fix. For maximum-stakes entries (severity
`toxic`/`fatal`, or any safe↔toxic disagreement) run **2–3 independent verifiers** and
require majority CONFIRMED.

> Scale to the asset's importance: this is the database's reason to exist. Do not
> shortcut the adversarial pass to save tokens on toxic entries.

---

## 5 — Consolidated audit report (NO fixes yet)

Write `data/audits/verify-localize-<YYYY-MM-DD>.md` containing:

1. **Summary counts** — entries audited, per-tier, per-verdict (PASS/NEEDS_REVISION/FAIL).
2. **Per-dimension issue rollup** — e.g. "12 entries missing compound name", "4 zh-TW
   glossary divergences", "3 raw-noise artifacts", and most importantly
   **"N factual claims REFUTED / UNVERIFIABLE"** with the authority URLs.
3. **Prioritized fix list** — ordered: factual REFUTED (Dimension B) → FAIL → NEEDS_REVISION,
   with the skill's `[SUGGESTED FOCUS]` line per entry.
4. **Safe↔toxic disagreements broken out at the top** — these are potential life-safety
   errors and get fixed first.

Log nothing as "verified" that the adversarial pass did not actually confirm.

---

## 6 — 🚦 HUMAN GATE (stop here)

Present the report summary and the prioritized fix list to the user. **Do not edit any
entry until the user approves the fix list** (they may accept all, a subset, or amend).
Surface the safe↔toxic disagreements as a blocking callout — these need a human decision.

---

## 7 — Fix phase (only after approval)

Work the approved list in priority order. For each entry:

- **English factual fixes**: correct compound/mechanism/symptoms/severity to match the
  authority cited in the report; update `data/{plants,foods}_processed/*.json`.
- **English quality fixes**: rewrite to satisfy the catsafe gate; keep plain-text
  formatting (`•`, no Markdown).
- **Raw-noise cleanup**: strip footnote residue, placeholders, `"in cats:"` prefixes.
- **Localization**: (re)write `data/site/zh-TW/*.json` faithful to the corrected EN,
  using glossary terminology. When an entry is now human-finalized, set
  `"manual_override": true` and `"gemini_model": "codex-manual"` so provenance is honest.

Re-run the mechanical pass (§2) after edits to confirm schema/cleanliness still pass.

---

## 8 — Sync: disk → Firestore (final step)

Firestore is the live store; sync only after fixes are reviewed.

```bash
# 1. EN canonical → Firestore (preview first, ALWAYS)
cd admin && node scripts/sync-disk-to-firestore.mjs --dry-run
node scripts/sync-disk-to-firestore.mjs            # apply

# 2. zh-TW → Firestore l10n.zh-TW
#    - brand-new local-only translations:
node scripts/upload-local-translations.mjs --dry-run
node scripts/upload-local-translations.mjs
#    - edited EXISTING zh-TW entries do NOT re-upload via the script above; push them
#      through the admin UI PATCH (/api/translations/:slug) which writes l10n.zh-TW,
#      or extend the sync script. Confirm in PROGRESS.md what actually ran.

# 3. Verify divergence is gone
node scripts/check-firestore-sync.mjs

# 4. Snapshot Firestore back to disk to close the loop
cd .. && FIREBASE_ADMIN_KEY_PATH=/abs/path/sa.json python3 pipeline/dump_firestore.py
```

---

## 9 — Record & commit

Append a batch entry to `PROGRESS.md` (what was audited, what was fixed, what synced —
do not claim Firestore state that no command above actually produced). Then:

```bash
git add data/plants_processed/ data/foods_processed/ data/site/zh-TW/ \
        data/audits/ PROGRESS.md
git commit -m "content: adversarial audit + zh-TW localization $(date +%Y-%m-%d)"
```

---

## Guardrails (non-negotiable)

- **Audit and rewrite are separate phases.** Never fix during the audit pass.
- **No claim is "verified" without an authoritative source.** Internal confidence ≠ proof.
- **Safe↔toxic disagreements are life-safety bugs** — top priority, human-decided.
- **Respond to the user in Traditional Mandarin**; keep code identifiers and field names
  in their original form.
- Do not weaken danger language when localizing — an EN emergency stays an emergency in zh-TW.
