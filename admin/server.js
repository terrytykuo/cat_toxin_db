import { createRequire } from 'node:module'
import { readFileSync, existsSync, unlinkSync } from 'node:fs'
import { resolve, dirname, isAbsolute } from 'node:path'
import { fileURLToPath } from 'node:url'
import express from 'express'
import cors from 'cors'
import multer from 'multer'
import sharp from 'sharp'

import { stripFirestoreOnly } from './lib/field-policy.js'
import { atomicWriteJson, resolveDiskPath, validateDiskPayload } from './lib/disk-writer.js'
import { validateGlossary } from './lib/glossary-validator.js'

const TRANSLATABLE_FIELDS = new Set([
  'name',
  'description',
  'aliases',
  'toxicParts',
  'safetyNotes',
  'emergencyNote',
  'symptoms',
  'chemicals',
  'treatments',
])

async function compressImage(buffer) {
  return sharp(buffer)
    .resize({ width: 800, withoutEnlargement: true })
    .jpeg({ quality: 75 })
    .toBuffer()
}

const __dirname = dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)
const admin = require('firebase-admin')

const ZH_TW_DIR = resolve(__dirname, '..', 'data', 'site', 'zh-TW')

function parseEnvFile(filePath) {
  if (!existsSync(filePath)) return {}
  const raw = readFileSync(filePath, 'utf8')
  return raw.split('\n').reduce((env, line) => {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) return env

    const separatorIndex = trimmed.indexOf('=')
    if (separatorIndex === -1) return env

    const key = trimmed.slice(0, separatorIndex).trim()
    const value = trimmed.slice(separatorIndex + 1).trim()
    env[key] = value
    return env
  }, {})
}

const rootEnv = parseEnvFile(resolve(__dirname, '../.env.local'))
const adminEnv = parseEnvFile(resolve(__dirname, '.env.local'))
const storageBucket = process.env.FIREBASE_STORAGE_BUCKET || rootEnv.FIREBASE_STORAGE_BUCKET
const adminSecret = process.env.ADMIN_SECRET || adminEnv.ADMIN_SECRET
const serviceAccountPath =
  process.env.FIREBASE_ADMIN_KEY_PATH ||
  process.env.GOOGLE_APPLICATION_CREDENTIALS ||
  adminEnv.FIREBASE_ADMIN_KEY_PATH

if (!serviceAccountPath) {
  console.error('Missing FIREBASE_ADMIN_KEY_PATH in environment or admin/.env.local')
  process.exit(1)
}

if (!storageBucket) {
  console.error('Missing FIREBASE_STORAGE_BUCKET in environment or .env.local (repo root)')
  process.exit(1)
}

if (!adminSecret) {
  console.error('Missing ADMIN_SECRET in environment or admin/.env.local')
  process.exit(1)
}

const resolvedServiceAccountPath = isAbsolute(serviceAccountPath)
  ? serviceAccountPath
  : resolve(__dirname, serviceAccountPath)
const serviceAccount = require(resolvedServiceAccountPath)

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  storageBucket,
})
const db = admin.firestore()
const bucket = admin.storage().bucket()

const upload = multer({ storage: multer.memoryStorage() })
const PLACEHOLDER_PATTERNS = [
  /^\s*not specified\b/i,
  /^\s*not explicitly specified\b/i,
  /^\s*not provided\b/i,
  /^\s*not available\b/i,
]

const DOC_ID_PATTERN = /^[A-Za-z0-9_-]+$/
const STORAGE_PREFIX = 'toxins/'

function isValidDocId(id) {
  return typeof id === 'string' && id.length > 0 && id.length <= 128 && DOC_ID_PATTERN.test(id)
}

function cleanText(value) {
  if (typeof value !== 'string') return undefined

  const cleaned = value.replace(/\s+/g, ' ').trim()
  if (!cleaned) return undefined
  if (PLACEHOLDER_PATTERNS.some(pattern => pattern.test(cleaned))) return undefined

  return cleaned
}

function sanitizeSymptoms(symptoms) {
  if (!Array.isArray(symptoms)) return []

  return symptoms.flatMap(symptom => {
    const name = cleanText(symptom?.name)
    if (!name) return []

    const onset = cleanText(symptom?.onset)
    const notes = cleanText(symptom?.notes)

    return [{
      name,
      body_system: cleanText(symptom?.body_system) ?? 'Other',
      severity: symptom?.severity ?? 'moderate',
      ...(onset ? { onset } : {}),
      ...(notes ? { notes } : {}),
    }]
  })
}

function sanitizeToxin(toxin) {
  if (!toxin || typeof toxin !== 'object') return toxin

  return {
    ...toxin,
    ...(Array.isArray(toxin.symptoms) ? { symptoms: sanitizeSymptoms(toxin.symptoms) } : {}),
  }
}

const app = express()
app.use(cors({ origin: 'http://127.0.0.1:5173' }))
app.use(express.json({ limit: '2mb' }))

function requireAdmin(req, res, next) {
  const token = req.headers['x-admin-secret']
  if (!token || token !== adminSecret) {
    return res.status(401).json({ error: 'Unauthorized' })
  }
  next()
}
app.use('/api', requireAdmin)

app.get('/api/toxins', async (req, res) => {
  try {
    const snap = await db.collection('toxins').get()
    res.json(snap.docs.map(d => sanitizeToxin({ id: d.id, ...d.data() })))
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

app.patch('/api/toxins/:id', async (req, res) => {
  try {
    const { id } = req.params
    if (!isValidDocId(id)) return res.status(400).json({ error: 'Invalid id' })

    const patch = sanitizeToxin(req.body)
    const docRef = db.collection('toxins').doc(id)
    const prevSnap = await docRef.get()
    if (!prevSnap.exists) return res.status(404).json({ error: 'Not found' })

    const prev = prevSnap.data() || {}
    const merged = { id, ...prev, ...patch }
    const diskPayload = stripFirestoreOnly(merged)

    const { ok, errors } = validateDiskPayload(diskPayload)
    if (!ok) {
      return res.status(422).json({ error: 'Disk payload failed validation', errors })
    }

    const newDiskPath = resolveDiskPath(id, diskPayload)

    let prevDiskPath = null
    try {
      prevDiskPath = resolveDiskPath(id, stripFirestoreOnly({ id, ...prev }))
    } catch {
      prevDiskPath = null
    }

    await docRef.update(patch)

    try {
      atomicWriteJson(newDiskPath, diskPayload)
    } catch (diskErr) {
      console.error(
        `DISK WRITE FAILED for ${id} at ${newDiskPath} — Firestore already updated. Manual reconciliation required.`,
        diskErr,
      )
      return res.status(500).json({
        error: 'Firestore updated but disk write failed',
        detail: diskErr.message,
        path: newDiskPath,
      })
    }

    if (prevDiskPath && prevDiskPath !== newDiskPath && existsSync(prevDiskPath)) {
      try {
        unlinkSync(prevDiskPath)
      } catch (err) {
        console.warn(`Failed to remove old disk file ${prevDiskPath}:`, err.message)
      }
    }

    res.json({ ok: true, path: newDiskPath })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

app.post('/api/toxins/:id/image', upload.single('image'), async (req, res) => {
  try {
    const { id } = req.params
    if (!isValidDocId(id)) return res.status(400).json({ error: 'Invalid id' })
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' })

    const compressed = await compressImage(req.file.buffer)
    const destination = `${STORAGE_PREFIX}${id}/image.jpg`

    const file = bucket.file(destination)
    await file.save(compressed, { contentType: 'image/jpeg' })
    await file.makePublic()

    const imageUrl = `https://storage.googleapis.com/${bucket.name}/${destination}`
    await db.collection('toxins').doc(id).update({
      imageUrls: admin.firestore.FieldValue.arrayUnion(imageUrl),
      imageUrl: admin.firestore.FieldValue.delete(),
    })

    res.json({ imageUrl })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

app.post('/api/toxins/:id/images', upload.single('image'), async (req, res) => {
  try {
    const { id } = req.params
    if (!isValidDocId(id)) return res.status(400).json({ error: 'Invalid id' })
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' })

    const compressed = await compressImage(req.file.buffer)
    const destination = `${STORAGE_PREFIX}${id}/images/${Date.now()}.jpg`

    const file = bucket.file(destination)
    await file.save(compressed, { contentType: 'image/jpeg' })
    await file.makePublic()

    const imageUrl = `https://storage.googleapis.com/${bucket.name}/${destination}`
    await db.collection('toxins').doc(id).update({
      imageUrls: admin.firestore.FieldValue.arrayUnion(imageUrl),
    })

    res.json({ imageUrl })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

app.delete('/api/toxins/:id/images/:index', async (req, res) => {
  try {
    const { id, index } = req.params
    if (!isValidDocId(id)) return res.status(400).json({ error: 'Invalid id' })

    const snap = await db.collection('toxins').doc(id).get()
    if (!snap.exists) return res.status(404).json({ error: 'Not found' })

    const imageUrls = snap.data().imageUrls ?? []
    const idx = parseInt(index, 10)
    if (isNaN(idx) || idx < 0 || idx >= imageUrls.length) {
      return res.status(400).json({ error: 'Index out of range' })
    }

    const urlToDelete = imageUrls[idx]
    const next = imageUrls.filter((_, i) => i !== idx)
    await db.collection('toxins').doc(id).update({ imageUrls: next })

    const urlPrefix = `https://storage.googleapis.com/${bucket.name}/`
    if (typeof urlToDelete === 'string' && urlToDelete.startsWith(urlPrefix)) {
      const storagePath = urlToDelete.slice(urlPrefix.length)
      if (storagePath.startsWith(STORAGE_PREFIX) && !storagePath.includes('..')) {
        try {
          await bucket.file(storagePath).delete()
        } catch (err) {
          console.warn(`storage delete failed for ${storagePath}:`, err.message)
        }
      } else {
        console.warn(`refusing to delete storage path outside ${STORAGE_PREFIX}: ${storagePath}`)
      }
    }

    res.json({ ok: true, imageUrls: next })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ── Translations (zh-TW) ─────────────────────────────────────────────────────

function zhPathForSlug(slug) {
  return resolve(ZH_TW_DIR, `${slug}.json`)
}

function readZhFile(slug) {
  const path = zhPathForSlug(slug)
  if (!existsSync(path)) return null
  return JSON.parse(readFileSync(path, 'utf8'))
}

app.get('/api/translations/:slug', (req, res) => {
  try {
    const { slug } = req.params
    if (!isValidDocId(slug)) return res.status(400).json({ error: 'Invalid slug' })

    const data = readZhFile(slug)
    if (!data) return res.status(404).json({ error: 'Not translated yet', slug })
    res.json(data)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

function buildL10nPayload(merged) {
  const symptoms = (merged.symptoms ?? []).map(s => {
    const entry = { name: s.name ?? '', body_system: s.body_system ?? '' }
    if (s.onset) entry.onset = s.onset
    return entry
  })
  const payload = {
    name: merged.name ?? '',
    aliases: merged.aliases ?? [],
    description: merged.description ?? '',
    safetyNotes: merged.safetyNotes ?? [],
    toxicParts: merged.toxicParts ?? [],
    symptoms,
  }
  if (merged.emergencyNote) payload.emergencyNote = merged.emergencyNote
  if (Array.isArray(merged.chemicals) && merged.chemicals.length > 0) payload.chemicals = merged.chemicals
  if (Array.isArray(merged.treatments) && merged.treatments.length > 0) payload.treatments = merged.treatments
  return payload
}

app.patch('/api/translations/:slug', async (req, res) => {
  try {
    const { slug } = req.params
    if (!isValidDocId(slug)) return res.status(400).json({ error: 'Invalid slug' })

    const patch = req.body && typeof req.body === 'object' ? req.body : {}
    const invalid = Object.keys(patch).filter(k => !TRANSLATABLE_FIELDS.has(k))
    if (invalid.length > 0) {
      return res.status(400).json({ error: 'Unknown fields', fields: invalid })
    }

    const existing = readZhFile(slug) || { slug }
    const merged = {
      ...existing,
      ...patch,
      slug,
      manual_override: true,
      translated_at: new Date().toISOString(),
    }

    const path = zhPathForSlug(slug)
    atomicWriteJson(path, merged)

    // Sync to Firestore l10n.zh-TW
    await db.collection('toxins').doc(slug).update({ 'l10n.zh-TW': buildL10nPayload(merged) })

    res.json({ ok: true, path, data: merged })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

const GLOSSARY_COLLECTION = 'glossary'
const GLOSSARY_DOC = 'main'
const SYMPTOM_SEVERITY_KEYS = ['mild', 'moderate', 'severe', 'fatal']

function emptyMap(keys) {
  return Object.fromEntries(keys.map(k => [k, '']))
}

async function extractVocabularyFromToxins() {
  const snap = await db.collection('toxins').get()
  const body = new Set()
  const parts = new Set()
  for (const doc of snap.docs) {
    const t = doc.data() || {}
    for (const s of t.symptoms || []) {
      const bs = typeof s?.body_system === 'string' ? s.body_system.trim() : ''
      if (bs) body.add(bs)
    }
    for (const p of t.toxicParts || []) {
      const tp = typeof p === 'string' ? p.trim() : ''
      if (tp) parts.add(tp)
    }
  }
  return {
    body_system: [...body].sort(),
    toxic_parts: [...parts].sort(),
  }
}

function isoOrNull(value) {
  if (!value) return null
  if (typeof value.toDate === 'function') return value.toDate().toISOString()
  if (value instanceof Date) return value.toISOString()
  return null
}

async function seedGlossary() {
  const vocab = await extractVocabularyFromToxins()
  return {
    symptoms_severity: emptyMap(SYMPTOM_SEVERITY_KEYS),
    body_system: emptyMap(vocab.body_system),
    toxic_parts: emptyMap(vocab.toxic_parts),
    terms: {},
  }
}

app.get('/api/glossary', async (req, res) => {
  try {
    const ref = db.collection(GLOSSARY_COLLECTION).doc(GLOSSARY_DOC)
    const snap = await ref.get()
    if (snap.exists) {
      const data = snap.data() || {}
      return res.json({
        symptoms_severity: data.symptoms_severity || {},
        body_system: data.body_system || {},
        toxic_parts: data.toxic_parts || {},
        terms: data.terms || {},
        updated_at: isoOrNull(data.updated_at),
      })
    }
    const seed = await seedGlossary()
    await ref.set({ ...seed, updated_at: admin.firestore.FieldValue.serverTimestamp() })
    const written = await ref.get()
    res.json({ ...seed, updated_at: isoOrNull(written.data()?.updated_at) })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

app.put('/api/glossary', async (req, res) => {
  try {
    const payload = {
      symptoms_severity: req.body?.symptoms_severity || {},
      body_system: req.body?.body_system || {},
      toxic_parts: req.body?.toxic_parts || {},
      terms: req.body?.terms || {},
    }
    const { ok, errors } = validateGlossary(payload)
    if (!ok) return res.status(422).json({ error: 'Glossary failed validation', errors })

    const ref = db.collection(GLOSSARY_COLLECTION).doc(GLOSSARY_DOC)
    await ref.set({ ...payload, updated_at: admin.firestore.FieldValue.serverTimestamp() })
    const written = await ref.get()
    res.json({ ...payload, updated_at: isoOrNull(written.data()?.updated_at) })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

function splitSentences(text) {
  if (typeof text !== 'string' || !text.trim()) return []
  return text
    .split(/(?<=[.!?。！？])\s+/)
    .map(s => s.trim())
    .filter(s => s.length > 0 && s.length < 400)
}

function findSentenceContaining(text, needle) {
  if (typeof text !== 'string') return null
  const needleLower = needle.toLowerCase()
  for (const sentence of splitSentences(text)) {
    if (sentence.toLowerCase().includes(needleLower)) return sentence
  }
  return null
}

function extractTermExample(toxins, term) {
  for (const t of toxins) {
    const fields = [t.description, ...(t.safetyNotes || [])]
    for (const f of fields) {
      const hit = findSentenceContaining(f, term)
      if (hit) return { source: t.name || t.id, quote: hit }
    }
  }
  return null
}

app.get('/api/glossary/examples', async (req, res) => {
  try {
    const snap = await db.collection('toxins').get()
    const toxins = snap.docs.map(d => ({ id: d.id, ...d.data() }))

    const examples = {
      symptoms_severity: {},
      body_system: {},
      toxic_parts: {},
      terms: {},
    }

    function findSymptomContaining(predicate, term) {
      const needle = term.toLowerCase()
      for (const t of toxins) {
        for (const s of t.symptoms || []) {
          if (predicate(s) && typeof s?.name === 'string' && s.name.toLowerCase().includes(needle)) {
            return { source: t.name || t.id, quote: s.name }
          }
        }
      }
      return null
    }

    function collectSymptomNames(predicate, limit) {
      const seen = []
      const dedup = new Set()
      const MAX_NAME_LEN = 60
      for (const t of toxins) {
        for (const s of t.symptoms || []) {
          if (
            predicate(s) &&
            typeof s?.name === 'string' &&
            s.name.length <= MAX_NAME_LEN &&
            !dedup.has(s.name)
          ) {
            dedup.add(s.name)
            seen.push(s.name)
            if (seen.length >= limit) return seen
          }
        }
      }
      return seen
    }

    for (const sev of ['mild', 'moderate', 'severe', 'fatal']) {
      const direct = findSymptomContaining(s => s?.severity === sev, sev)
      if (direct) {
        examples.symptoms_severity[sev] = direct
      } else {
        const names = collectSymptomNames(s => s?.severity === sev, 3)
        if (names.length) {
          examples.symptoms_severity[sev] = {
            source: `${names.length} tagged ${sev}`,
            quote: names.join(' · '),
          }
        }
      }
    }

    const bsSeen = new Set()
    for (const t of toxins) {
      for (const s of t.symptoms || []) {
        const bs = typeof s?.body_system === 'string' ? s.body_system.trim() : ''
        if (bs) bsSeen.add(bs)
      }
    }
    for (const bs of bsSeen) {
      const direct = findSymptomContaining(s => s?.body_system === bs, bs)
      if (direct) {
        examples.body_system[bs] = direct
      } else {
        const names = collectSymptomNames(s => s?.body_system === bs, 3)
        if (names.length) {
          examples.body_system[bs] = {
            source: `${names.length} tagged "${bs}"`,
            quote: names.join(' · '),
          }
        }
      }
    }

    const partToToxins = new Map()
    for (const t of toxins) {
      for (const p of t.toxicParts || []) {
        const part = typeof p === 'string' ? p.trim() : ''
        if (!part) continue
        if (!partToToxins.has(part)) partToToxins.set(part, [])
        partToToxins.get(part).push(t)
      }
    }
    for (const [part, candidates] of partToToxins) {
      let chosen = null
      for (const t of candidates) {
        const hit = findSentenceContaining(t.description, part)
          || (t.safetyNotes || []).map(n => findSentenceContaining(n, part)).find(Boolean)
        if (hit) { chosen = { source: t.name || t.id, quote: hit }; break }
      }
      if (!chosen) {
        const first = candidates[0]
        chosen = { source: first.name || first.id, quote: `(used as toxic part of "${first.name || first.id}")` }
      }
      examples.toxic_parts[part] = chosen
    }

    const ref = db.collection(GLOSSARY_COLLECTION).doc(GLOSSARY_DOC)
    const gSnap = await ref.get()
    const termsMap = gSnap.exists ? (gSnap.data()?.terms || {}) : {}
    for (const term of Object.keys(termsMap)) {
      const ex = extractTermExample(toxins, term)
      if (ex) examples.terms[term] = ex
    }

    res.json(examples)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

app.post('/api/glossary/sync-vocabulary', async (req, res) => {
  try {
    const ref = db.collection(GLOSSARY_COLLECTION).doc(GLOSSARY_DOC)
    const [snap, vocab] = await Promise.all([ref.get(), extractVocabularyFromToxins()])
    const current = snap.exists ? (snap.data() || {}) : {}
    const currentBody = Object.keys(current.body_system || {})
    const currentParts = Object.keys(current.toxic_parts || {})

    const diff = (current, fromToxins) => {
      const setCurrent = new Set(current)
      const setToxins = new Set(fromToxins)
      return {
        add: fromToxins.filter(v => !setCurrent.has(v)),
        orphan: current.filter(v => !setToxins.has(v)),
      }
    }

    res.json({
      body_system: diff(currentBody, vocab.body_system),
      toxic_parts: diff(currentParts, vocab.toxic_parts),
    })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

const HOST = '127.0.0.1'
const PORT = 3001
app.listen(PORT, HOST, () => console.log(`Admin API running at http://${HOST}:${PORT}`))
