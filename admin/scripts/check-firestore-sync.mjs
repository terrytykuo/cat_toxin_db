/**
 * Compare plants_processed + foods_processed (disk/admin) against
 * data/site/firestore/en (Firestore cache pulled today).
 * Reports entries where key content fields diverge.
 *
 * Usage:
 *   cd cat_toxin_db/admin
 *   node scripts/check-firestore-sync.mjs
 */

import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'

const __dirname = dirname(fileURLToPath(import.meta.url))

const FIRESTORE_EN_DIR = resolve(__dirname, '../../data/site/firestore/en')
const PLANTS_DIR = resolve(__dirname, '../../data/plants_processed')
const FOODS_DIR = resolve(__dirname, '../../data/foods_processed')

const CHECK_FIELDS = ['name', 'description', 'safetyNotes', 'symptoms', 'toxicParts', 'severity']

function readJson(path) {
  return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : null
}

function hash(val) {
  return createHash('sha1').update(JSON.stringify(val ?? null)).digest('hex').slice(0, 8)
}

const firestoreFiles = readdirSync(FIRESTORE_EN_DIR).filter(f => f.endsWith('.json'))

const drifted = []
const inSync = []

for (const file of firestoreFiles) {
  const slug = file.replace('.json', '')
  const fData = readJson(resolve(FIRESTORE_EN_DIR, file))

  const diskData =
    readJson(resolve(PLANTS_DIR, `${slug}.json`)) ||
    readJson(resolve(FOODS_DIR, `${slug}.json`))

  if (!diskData) {
    // Firestore has entry but no disk mirror — not a sync issue, likely image-only or Firestore-native
    continue
  }

  const diffs = []
  for (const field of CHECK_FIELDS) {
    const fHash = hash(fData[field])
    const dHash = hash(diskData[field])
    if (fHash !== dHash) {
      diffs.push(field)
    }
  }

  if (diffs.length > 0) {
    drifted.push({ slug, diffs })
  } else {
    inSync.push(slug)
  }
}

console.log(`Checked ${firestoreFiles.length} Firestore en entries against disk`)
console.log(`In sync : ${inSync.length}`)
console.log(`Drifted : ${drifted.length}\n`)

if (drifted.length === 0) {
  console.log('✅ All entries match — disk and Firestore are in sync.')
} else {
  console.log('⚠️  Entries where disk differs from Firestore cache:\n')
  for (const { slug, diffs } of drifted) {
    console.log(`  ${slug}`)
    console.log(`    diverged fields: ${diffs.join(', ')}`)
  }
  console.log(`\nNote: Firestore cache was pulled on 2026-06-03 by npm run build:toxins.`)
  console.log('Disk edits after that date will always show as "drifted" — that is expected.')
  console.log('Edits before that date showing here may NOT be in Firestore.')
}
process.exit(0)
