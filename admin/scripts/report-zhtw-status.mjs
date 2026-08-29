/**
 * Read-only inventory: for every live toxin doc, decide which local zh-TW file
 * (legacy data/site/zh-TW/ vs site cache data/site/firestore/zh-TW/) should win
 * and how it differs from the live l10n['zh-TW'] map.
 *
 * Writes data/audits/zhtw-writeback-plan-2026-08-29.json.
 *
 * Usage:
 *   cd cat_toxin_db/admin
 *   node scripts/report-zhtw-status.mjs
 */

import { createRequire } from 'node:module'
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

import { chooseWinner, buildL10nPayload, payloadEquals } from './lib/zhtw-l10n.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)

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
const outIdx = process.argv.indexOf('--out')
const OUT = outIdx !== -1 && process.argv[outIdx + 1]
  ? resolve(process.cwd(), process.argv[outIdx + 1])
  : resolve(__dirname, '../../data/audits/zhtw-writeback-plan-2026-08-29.json')

function readJson(p) { return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null }

const snap = await db.collection('toxins').get()
const entries = {}
const counts = {}
for (const doc of snap.docs) {
  const slug = doc.id
  const live = doc.data()
  const liveL10n = live.l10n?.['zh-TW'] ?? null
  const enSymptomCount = Array.isArray(live.symptoms) ? live.symptoms.length : 0
  const legacy = readJson(resolve(LEGACY_DIR, `${slug}.json`))
  const fstore = readJson(resolve(FSTORE_DIR, `${slug}.json`))

  let bucket, winnerSource = null, changedFields = [], deletions = []
  const winner = chooseWinner({ legacy, fstore, enSymptomCount })
  if (!legacy && !fstore) bucket = 'NO_LOCAL'
  else if (!winner) bucket = 'NEEDS_RETRANSLATION'
  else {
    winnerSource = winner.source
    const payload = buildL10nPayload(winner.data, liveL10n)
    if (liveL10n) {
      deletions = Object.keys(liveL10n).filter(k => payload[k] === undefined)
      changedFields = [...new Set([...Object.keys(payload), ...Object.keys(liveL10n)])]
        .filter(k => !payloadEquals(payload[k], liveL10n[k]))
      bucket = changedFields.length === 0 ? 'NO_CHANGE' : 'UPDATE'
    } else bucket = 'CREATE_L10N'
  }
  counts[bucket] = (counts[bucket] || 0) + 1
  entries[slug] = {
    bucket, winnerSource, enSymptomCount, hidden: live.hidden === true,
    legacySymptoms: legacy ? (legacy.symptoms ?? []).length : null,
    fstoreSymptoms: fstore ? (fstore.symptoms ?? []).length : null,
    changedFields, deletions,
  }
}
mkdirSync(dirname(OUT), { recursive: true })
writeFileSync(OUT, JSON.stringify({ generated_at: '2026-08-29', liveDocs: snap.size, counts, entries }, null, 2))
console.log(`Live docs: ${snap.size}`)
console.log('Buckets:', JSON.stringify(counts))
for (const [slug, e] of Object.entries(entries)) {
  if (e.bucket === 'NEEDS_RETRANSLATION' || e.deletions.length) console.log('  FLAG', slug, JSON.stringify(e))
}
console.log(`Report → ${OUT}`)
process.exit(0)
