/**
 * One-shot script: uploads local-only zh-TW translation files to Firestore l10n.zh-TW.
 * Only processes files that exist in data/site/zh-TW/ but NOT in data/site/firestore/zh-TW/.
 * Skips entries whose name field is still in ASCII-only (incomplete translation).
 *
 * Usage:
 *   cd cat_toxin_db/admin
 *   node scripts/upload-local-translations.mjs [--dry-run]
 */

import { createRequire } from 'node:module'
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)

const DRY_RUN = process.argv.includes('--dry-run')

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

const ZH_TW_DIR = resolve(__dirname, '../../data/site/zh-TW')
const FIRESTORE_ZH_TW_DIR = resolve(__dirname, '../../data/site/firestore/zh-TW')

function hasChineseContent(name) {
  return /[一-鿿㐀-䶿]/.test(name)
}

function buildL10nPayload(d) {
  const symptoms = (d.symptoms ?? []).map(s => {
    const entry = { name: s.name ?? '', body_system: s.body_system ?? '' }
    if (s.onset) entry.onset = s.onset
    return entry
  })
  const payload = {
    name: d.name ?? '',
    aliases: d.aliases ?? [],
    description: d.description ?? '',
    safetyNotes: d.safetyNotes ?? [],
    toxicParts: d.toxicParts ?? [],
    symptoms,
  }
  if (d.emergencyNote) payload.emergencyNote = d.emergencyNote
  if (Array.isArray(d.chemicals) && d.chemicals.length > 0) payload.chemicals = d.chemicals
  if (Array.isArray(d.treatments) && d.treatments.length > 0) payload.treatments = d.treatments
  return payload
}

const localSlugs = readdirSync(ZH_TW_DIR)
  .filter(f => f.endsWith('.json'))
  .map(f => f.replace('.json', ''))

const firestoreSlugs = new Set(
  readdirSync(FIRESTORE_ZH_TW_DIR)
    .filter(f => f.endsWith('.json'))
    .map(f => f.replace('.json', ''))
)

const localOnly = localSlugs.filter(slug => !firestoreSlugs.has(slug))

console.log(`Local zh-TW files: ${localSlugs.length}`)
console.log(`Firestore cache files: ${firestoreSlugs.size}`)
console.log(`Local-only (not in Firestore cache): ${localOnly.length}`)
console.log(DRY_RUN ? '[DRY RUN — no writes]\n' : '')

let uploaded = 0, skipped = 0

for (const slug of localOnly) {
  const data = JSON.parse(readFileSync(resolve(ZH_TW_DIR, `${slug}.json`), 'utf8'))

  if (!hasChineseContent(data.name ?? '')) {
    console.log(`  SKIP  ${slug}  (name "${data.name}" has no Chinese characters)`)
    skipped++
    continue
  }

  const payload = buildL10nPayload(data)
  console.log(`  ${DRY_RUN ? 'WOULD UPLOAD' : 'UPLOAD'} ${slug}  (name: ${data.name})`)

  if (!DRY_RUN) {
    await db.collection('toxins').doc(slug).update({ 'l10n.zh-TW': payload })
  }
  uploaded++
}

console.log(`\nDone. Uploaded: ${uploaded}, Skipped (no Chinese): ${skipped}`)
process.exit(0)
