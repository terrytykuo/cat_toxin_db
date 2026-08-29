/**
 * Sync canonical disk data (plants_processed + foods_processed) → Firestore.
 * Only updates canonical fields; preserves Firestore-only fields (imageUrls, hidden, etc.).
 * Use --dry-run to preview changes without writing.
 * Use --force to also create missing Firestore documents (default: skip missing).
 *
 * Usage:
 *   cd cat_toxin_db/admin
 *   node scripts/sync-disk-to-firestore.mjs [--dry-run] [--force]
 */

import { createRequire } from 'node:module'
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'

const __dirname = dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)

const DRY_RUN = process.argv.includes('--dry-run')
const FORCE_CREATE = process.argv.includes('--force')
// Comma-separated slugs to exclude (e.g. K11/K16 collisions like malus_spp).
const SKIP_SLUGS = new Set(
  (process.env.SKIP_SLUGS || '').split(',').map(s => s.trim()).filter(Boolean)
)
// Comma-separated slugs to sync exclusively (targeted pushes); empty = all.
const ONLY_SLUGS = new Set(
  (process.env.ONLY_SLUGS || '').split(',').map(s => s.trim()).filter(Boolean)
)

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

// Fields owned by Firestore — never overwrite from disk
const FIRESTORE_ONLY_FIELDS = new Set(['id', 'imageUrls', 'imageUrl', 'hidden', 'curatedList'])

// Canonical content fields to sync
const CANONICAL_FIELDS = [
  'name', 'aliases', 'category', 'description', 'safetyNotes', 'severity',
  'symptoms', 'toxicParts', 'isToxic', 'chemicals', 'treatments', 'emergencyNote',
  'scientific_name', 'family', 'toxicityLevel',
]

// Determine which docs exist in Firestore from the LIVE collection (one query, ids only),
// not the local firestore/en cache, which can be stale and silently skip live-but-uncached docs.
const liveIdsSnap = await db.collection('toxins').select().get()
const firestoreSlugs = new Set(liveIdsSnap.docs.map(d => d.id))
console.log(`Live Firestore docs: ${firestoreSlugs.size}`)

function readJson(path) {
  return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : null
}

function hash(val) {
  return createHash('sha1').update(JSON.stringify(val ?? null)).digest('hex').slice(0, 8)
}

function buildCanonicalPatch(diskData) {
  const patch = {}
  for (const field of CANONICAL_FIELDS) {
    if (diskData[field] !== undefined) {
      patch[field] = diskData[field]
    }
  }
  return patch
}

// Collect all disk entries
const allDiskEntries = []
for (const [dir, cat] of [[PLANTS_DIR, 'plant'], [FOODS_DIR, 'food']]) {
  for (const file of readdirSync(dir).filter(f => f.endsWith('.json'))) {
    const slug = file.replace('.json', '')
    const data = readJson(resolve(dir, file))
    if (data) allDiskEntries.push({ slug, data, cat })
  }
}

console.log(`Disk entries: ${allDiskEntries.length}`)
console.log(`Firestore en cache: ${firestoreSlugs.size}`)
console.log(DRY_RUN ? '[DRY RUN — no writes]\n' : '')

let updated = 0, created = 0, skipped = 0

let skippedExcluded = 0
for (const { slug, data } of allDiskEntries) {
  if (ONLY_SLUGS.size > 0 && !ONLY_SLUGS.has(slug)) continue
  if (SKIP_SLUGS.has(slug)) {
    console.log(`  EXCLUDE ${slug} (SKIP_SLUGS)`)
    skippedExcluded++
    continue
  }
  const patch = buildCanonicalPatch(data)
  const inFirestore = firestoreSlugs.has(slug)

  if (!inFirestore) {
    if (FORCE_CREATE) {
      console.log(`  CREATE  ${slug}`)
      if (!DRY_RUN) {
        await db.collection('toxins').doc(slug).set({ ...patch, hidden: true, imageUrls: [] })
      }
      created++
    } else {
      skipped++
    }
    continue
  }

  // Exists in Firestore — update canonical fields only
  console.log(`  UPDATE  ${slug}`)
  if (!DRY_RUN) {
    await db.collection('toxins').doc(slug).update(patch)
  }
  updated++
}

console.log(`\nDone.`)
console.log(`  Updated : ${updated}`)
console.log(`  Created : ${created}`)
console.log(`  Skipped (not in Firestore, use --force to create): ${skipped}`)
console.log(`  Excluded (SKIP_SLUGS): ${skippedExcluded}`)
process.exit(0)
