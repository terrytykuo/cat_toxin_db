/**
 * Diff-driven push of the reconciled zh-TW translations into live Firestore
 * toxins/{slug}.l10n['zh-TW'].
 *
 * Backs up every live l10n['zh-TW'] map first (dry-run included), recomputes the
 * winner/payload against a fresh read (never trusting the plan's snapshot), and
 * read-back verifies every write.
 *
 * Usage:
 *   cd cat_toxin_db/admin
 *   node scripts/sync-zhtw-l10n-to-firestore.mjs --plan ../data/audits/zhtw-writeback-plan-2026-08-29.json [--dry-run]
 */

import { createRequire } from 'node:module'
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

import { chooseWinner, buildL10nPayload, payloadEquals } from './lib/zhtw-l10n.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)

const DRY_RUN = process.argv.includes('--dry-run')
const planIdx = process.argv.indexOf('--plan')
if (planIdx === -1 || !process.argv[planIdx + 1]) {
  console.error('Missing --plan <path>')
  process.exit(1)
}
const PLAN_PATH = resolve(process.cwd(), process.argv[planIdx + 1])

function parseEnvFile(filePath) {
  if (!existsSync(filePath)) return {}
  const raw = readFileSync(filePath, 'utf8')
  return raw.split('\n').reduce((env, line) => {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) return env
    const sep = trimmed.indexOf('=')
    if (sep === -1) return env
    env[trimmed.slice(0, sep).trim()] = trimmed.slice(sep + 1).trim()
    return env
  }, {})
}

const rootEnv = parseEnvFile(resolve(__dirname, '../../.env.local'))
const adminEnv = parseEnvFile(resolve(__dirname, '../.env.local'))
const storageBucket = process.env.FIREBASE_STORAGE_BUCKET || rootEnv.FIREBASE_STORAGE_BUCKET
const serviceAccountPath =
  process.env.FIREBASE_ADMIN_KEY_PATH ||
  process.env.GOOGLE_APPLICATION_CREDENTIALS ||
  adminEnv.FIREBASE_ADMIN_KEY_PATH

if (!serviceAccountPath || !storageBucket) {
  console.error('Missing FIREBASE_ADMIN_KEY_PATH or FIREBASE_STORAGE_BUCKET')
  process.exit(1)
}

const admin = require('firebase-admin')
const serviceAccount = require(resolve(__dirname, '../', serviceAccountPath))
admin.initializeApp({ credential: admin.credential.cert(serviceAccount), storageBucket })
const db = admin.firestore()

const LEGACY_DIR = resolve(__dirname, '../../data/site/zh-TW')
const FSTORE_DIR = resolve(__dirname, '../../data/site/firestore/zh-TW')
const backupIdx = process.argv.indexOf('--backup')
const BACKUP = backupIdx !== -1 && process.argv[backupIdx + 1]
  ? resolve(process.cwd(), process.argv[backupIdx + 1])
  : resolve(__dirname, '../../data/audits/backups/l10n-zhtw-live-backup-2026-08-29.json')

function readJson(p) { return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null }

const plan = JSON.parse(readFileSync(PLAN_PATH, 'utf8'))
const targets = Object.entries(plan.entries)
  .filter(([, e]) => e.bucket === 'UPDATE' || e.bucket === 'CREATE_L10N')
  .map(([slug]) => slug)
console.log(`Plan targets (UPDATE + CREATE_L10N): ${targets.length}`)

// Fresh read of every live doc — the plan snapshot is only used to pick targets.
const snap = await db.collection('toxins').get()
const liveBySlug = new Map(snap.docs.map(d => [d.id, d.data()]))

// Backup first, always.
const backup = {}
for (const [slug, live] of liveBySlug) backup[slug] = live.l10n?.['zh-TW'] ?? null
mkdirSync(dirname(BACKUP), { recursive: true })
writeFileSync(BACKUP, JSON.stringify({ generated_at: '2026-08-29', docCount: snap.size, l10n: backup }, null, 2))
console.log(`Backup → ${BACKUP} (${Object.keys(backup).length} docs)`)

const work = []
const skipped = []
const aborts = []
for (const slug of targets) {
  const live = liveBySlug.get(slug)
  if (!live) { aborts.push(`${slug}: no live doc`); continue }
  const liveL10n = live.l10n?.['zh-TW'] ?? null
  const enSymptomCount = Array.isArray(live.symptoms) ? live.symptoms.length : 0
  const winner = chooseWinner({
    legacy: readJson(resolve(LEGACY_DIR, `${slug}.json`)),
    fstore: readJson(resolve(FSTORE_DIR, `${slug}.json`)),
    enSymptomCount,
  })
  if (!winner) { aborts.push(`${slug}: winner disappeared (NEEDS_RETRANSLATION)`); continue }
  const payload = buildL10nPayload(winner.data, liveL10n)
  const deletions = liveL10n ? Object.keys(liveL10n).filter(k => payload[k] === undefined) : []
  if (deletions.length) { aborts.push(`${slug}: deletions ${JSON.stringify(deletions)}`); continue }
  const changedFields = liveL10n
    ? [...new Set([...Object.keys(payload), ...Object.keys(liveL10n)])]
        .filter(k => !payloadEquals(payload[k], liveL10n[k]))
    : Object.keys(payload)
  if (liveL10n && changedFields.length === 0) { skipped.push(slug); continue }
  work.push({ slug, payload, changedFields, create: !liveL10n, winnerSource: winner.source })
}

if (aborts.length) {
  console.error('ABORT — recompute disagreed with the plan:')
  for (const a of aborts) console.error('  ', a)
  process.exit(1)
}

const wouldCreate = work.filter(w => w.create).length
const wouldUpdate = work.length - wouldCreate

if (DRY_RUN) {
  for (const w of work) {
    console.log(`  ${w.create ? 'CREATE' : 'UPDATE'} ${w.slug} [${w.winnerSource}] ${JSON.stringify(w.changedFields)}`)
  }
  console.log(`\nDRY RUN — would-update ${wouldUpdate}; would-create ${wouldCreate}; skipped(no-change) ${skipped.length}`)
  process.exit(0)
}

let written = 0
for (const w of work) {
  await db.collection('toxins').doc(w.slug).update({ 'l10n.zh-TW': w.payload })
  written++
}
console.log(`Applied: updated ${wouldUpdate}; created ${wouldCreate}; total writes ${written}; skipped(no-change) ${skipped.length}`)

// Read-back verification.
let ok = 0
const mismatches = []
for (const w of work) {
  const fresh = await db.collection('toxins').doc(w.slug).get()
  const got = fresh.data()?.l10n?.['zh-TW'] ?? null
  if (payloadEquals(got, w.payload)) ok++
  else mismatches.push(w.slug)
}
console.log(`Verify: OK ${ok}; mismatch ${mismatches.length}`)
if (mismatches.length) {
  for (const m of mismatches) console.error('  MISMATCH', m)
  process.exit(1)
}
process.exit(0)
