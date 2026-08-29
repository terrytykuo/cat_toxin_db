/**
 * Reconciles the site's zh-TW translation cache (data/site/firestore/zh-TW/)
 * with the winner chosen by the writeback plan.
 *
 * - winner === 'legacy': copy the legacy file over the cache entry, forcing
 *   manual_override so the site accepts it despite a stale source_hash.
 * - winner === 'fstore': leave the content alone, only force manual_override.
 *
 * Orphan cache files (no live doc) are never touched — the plan only iterates
 * live doc ids.
 *
 * Usage:
 *   cd cat_toxin_db/admin
 *   node scripts/reconcile-zhtw-cache.mjs --plan ../data/audits/zhtw-writeback-plan-2026-08-29.json [--dry-run]
 */

import { readFileSync, existsSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

const DRY_RUN = process.argv.includes('--dry-run')
const planIdx = process.argv.indexOf('--plan')
if (planIdx === -1 || !process.argv[planIdx + 1]) {
  console.error('Missing --plan <path>')
  process.exit(1)
}
const PLAN_PATH = resolve(process.cwd(), process.argv[planIdx + 1])

const LEGACY_DIR = resolve(__dirname, '../../data/site/zh-TW')
const FSTORE_DIR = resolve(__dirname, '../../data/site/firestore/zh-TW')

function readJson(p) { return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null }
function stable(v) { return JSON.stringify(v) }

const plan = JSON.parse(readFileSync(PLAN_PATH, 'utf8'))
const targets = Object.entries(plan.entries)
  .filter(([, e]) => ['UPDATE', 'NO_CHANGE', 'CREATE_L10N'].includes(e.bucket) && e.winnerSource)

let wroteLegacy = 0, flippedOverride = 0, unchanged = 0, missing = 0
for (const [slug, e] of targets) {
  const dest = resolve(FSTORE_DIR, `${slug}.json`)
  const current = readJson(dest)
  if (e.winnerSource === 'legacy') {
    const legacy = readJson(resolve(LEGACY_DIR, `${slug}.json`))
    if (!legacy) { console.log('  MISSING legacy', slug); missing++; continue }
    const next = { ...legacy, slug, manual_override: true }
    if (current && stable(current) === stable(next)) { unchanged++; continue }
    console.log(`  ${current ? 'WRITE' : 'CREATE'} ${slug}`)
    if (!DRY_RUN) writeFileSync(dest, JSON.stringify(next, null, 2) + '\n')
    wroteLegacy++
  } else {
    if (!current) { console.log('  MISSING cache', slug); missing++; continue }
    if (current.manual_override === true) { unchanged++; continue }
    console.log(`  OVERRIDE ${slug}`)
    if (!DRY_RUN) writeFileSync(dest, JSON.stringify({ ...current, manual_override: true }, null, 2) + '\n')
    flippedOverride++
  }
}
console.log(`${DRY_RUN ? 'DRY RUN — would' : 'Applied:'} write-from-legacy ${wroteLegacy}; force-override ${flippedOverride}; unchanged ${unchanged}; missing ${missing}`)
process.exit(0)
