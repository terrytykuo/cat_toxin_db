/**
 * Upload plants_processed entries that are missing from Firestore.
 * Also attaches local zh-TW translation if available.
 *
 * Usage:
 *   cd cat_toxin_db/admin
 *   node scripts/upload-missing-entries.mjs [--dry-run]
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
  return readFileSync(filePath, 'utf8').split('\n').reduce((env, line) => {
    const t = line.trim()
    if (!t || t.startsWith('#')) return env
    const sep = t.indexOf('=')
    if (sep === -1) return env
    env[t.slice(0, sep).trim()] = t.slice(sep + 1).trim()
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

const FIRESTORE_EN_DIR = resolve(__dirname, '../../data/site/firestore/en')
const PLANTS_DIR = resolve(__dirname, '../../data/plants_processed')
const FOODS_DIR = resolve(__dirname, '../../data/foods_processed')
const ZH_TW_DIR = resolve(__dirname, '../../data/site/zh-TW')

const firestoreSlugs = new Set(
  readdirSync(FIRESTORE_EN_DIR).filter(f => f.endsWith('.json')).map(f => f.replace('.json', ''))
)

function readJson(path) {
  return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : null
}

function buildL10nPayload(d) {
  const symptoms = (d.symptoms ?? []).map(s => {
    const e = { name: s.name ?? '', body_system: s.body_system ?? '' }
    if (s.onset) e.onset = s.onset
    return e
  })
  const p = {
    name: d.name ?? '',
    aliases: d.aliases ?? [],
    description: d.description ?? '',
    safetyNotes: d.safetyNotes ?? [],
    toxicParts: d.toxicParts ?? [],
    symptoms,
  }
  if (d.emergencyNote) p.emergencyNote = d.emergencyNote
  if (Array.isArray(d.chemicals) && d.chemicals.length > 0) p.chemicals = d.chemicals
  if (Array.isArray(d.treatments) && d.treatments.length > 0) p.treatments = d.treatments
  return p
}

// Collect all processed slugs not yet in Firestore
const candidates = []
for (const dir of [PLANTS_DIR, FOODS_DIR]) {
  for (const file of readdirSync(dir).filter(f => f.endsWith('.json'))) {
    const slug = file.replace('.json', '')
    if (!firestoreSlugs.has(slug)) {
      candidates.push({ slug, dir })
    }
  }
}

console.log(`Firestore en cache: ${firestoreSlugs.size} entries`)
console.log(`Missing from Firestore: ${candidates.length} entries`)
console.log(DRY_RUN ? '[DRY RUN]\n' : '')

for (const { slug, dir } of candidates) {
  const data = readJson(resolve(dir, `${slug}.json`))
  if (!data) continue

  // Build Firestore document: canonical data + hidden:false (needs review before publish)
  const doc = {
    ...data,
    hidden: true,   // hidden until reviewed in admin UI
    imageUrls: [],
  }
  delete doc.id  // Firestore doc id is the slug, not a field

  // Attach zh-TW translation if available
  const zhData = readJson(resolve(ZH_TW_DIR, `${slug}.json`))
  if (zhData && /[一-鿿㐀-䶿]/.test(zhData.name ?? '')) {
    doc['l10n'] = { 'zh-TW': buildL10nPayload(zhData) }
  }

  const hasZh = !!doc['l10n']
  console.log(`  ${DRY_RUN ? 'WOULD CREATE' : 'CREATE'} ${slug}  (hidden:true${hasZh ? ', +zh-TW' : ''})`)

  if (!DRY_RUN) {
    await db.collection('toxins').doc(slug).set(doc)
  }
}

console.log(`\nDone. ${candidates.length} entries ${DRY_RUN ? 'would be' : ''} created.`)
process.exit(0)
