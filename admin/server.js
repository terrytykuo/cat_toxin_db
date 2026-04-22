import { createRequire } from 'node:module'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import express from 'express'
import cors from 'cors'
import multer from 'multer'
import sharp from 'sharp'
import Ajv from 'ajv'
import { FIRESTORE_ONLY_FIELDS } from './lib/field-policy.js'

// 壓縮圖片：最大寬度 800px，JPEG 品質 75
async function compressImage(buffer) {
  return sharp(buffer)
    .resize({ width: 800, withoutEnlargement: true })
    .jpeg({ quality: 75 })
    .toBuffer()
}

const __dirname = dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)
const admin = require('firebase-admin')

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

function toSnakeCase(text) {
  if (!text || typeof text !== 'string') return 'unknown'
  const normalized = text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/[\s-]+/g, '_')
    .replace(/^_+|_+$/g, '')

  return normalized || 'unknown'
}

function stripFirestoreOnlyFields(toxin) {
  const jsonForDisk = { ...toxin }
  for (const field of FIRESTORE_ONLY_FIELDS) {
    delete jsonForDisk[field]
  }
  return jsonForDisk
}

function toValidationMessage(error) {
  const path = error.instancePath || '<root>'
  return `${path} ${error.message}`.trim()
}

function resolveJsonOutputPath(toxin, id) {
  const scientificName = toxin.scientific_name || id
  const fileName = `${toSnakeCase(scientificName)}.json`
  const category = toxin.category === 'food' ? 'food' : 'plant'
  const outputDir = category === 'food'
    ? resolve(__dirname, '../data/foods_processed')
    : resolve(__dirname, '../data/plants_processed')

  return resolve(outputDir, fileName)
}

function atomicWriteJson(filePath, payload) {
  mkdirSync(dirname(filePath), { recursive: true })
  const tempPath = `${filePath}.tmp`
  writeFileSync(tempPath, `${JSON.stringify(payload, null, 2)}\n`)
  renameSync(tempPath, filePath)
}

const rootEnv = parseEnvFile(resolve(__dirname, '../.env.local'))
const adminEnv = parseEnvFile(resolve(__dirname, '.env.local'))
const storageBucket = rootEnv.FIREBASE_STORAGE_BUCKET
const adminSecret = adminEnv.ADMIN_SECRET
const serviceAccountPath = adminEnv.FIREBASE_ADMIN_KEY_PATH

if (!serviceAccountPath) {
  console.error('Missing FIREBASE_ADMIN_KEY_PATH in admin/.env.local')
  process.exit(1)
}

if (!storageBucket) {
  console.error('Missing FIREBASE_STORAGE_BUCKET in .env.local')
  process.exit(1)
}

if (!adminSecret) {
  console.error('Missing ADMIN_SECRET in admin/.env.local')
  process.exit(1)
}

const serviceAccount = require(serviceAccountPath)

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  storageBucket,
})
const db = admin.firestore()
const bucket = admin.storage().bucket()

const toxinSchemaPath = resolve(__dirname, '../schemas/toxin.schema.json')
const toxinSchema = JSON.parse(readFileSync(toxinSchemaPath, 'utf8'))
const ajv = new Ajv({ allErrors: true, strict: false })
const validateDiskToxin = ajv.compile(toxinSchema)

const upload = multer({ storage: multer.memoryStorage() })
const PLACEHOLDER_PATTERNS = [
  /^\s*not specified\b/i,
  /^\s*not explicitly specified\b/i,
  /^\s*not provided\b/i,
  /^\s*not available\b/i,
]

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
app.use(cors({ origin: 'http://localhost:5173' }))
app.use(express.json())

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
  const { id } = req.params

  try {
    const docRef = db.collection('toxins').doc(id)
    await docRef.update(sanitizeToxin(req.body))

    const snap = await docRef.get()
    if (!snap.exists) {
      return res.status(404).json({ error: 'Not found after Firestore update' })
    }

    const latest = sanitizeToxin({ id: snap.id, ...snap.data() })
    const jsonForDisk = stripFirestoreOnlyFields(latest)
    const validationTarget = { id: latest.id, ...jsonForDisk }

    const valid = validateDiskToxin(validationTarget)
    if (!valid) {
      const details = (validateDiskToxin.errors || []).map(toValidationMessage)
      console.error(`[double-write] schema validation failed for ${id}: ${details.join('; ')}`)
      return res.status(500).json({
        error: 'Schema validation failed for processed JSON write',
        details,
      })
    }

    const outputPath = resolveJsonOutputPath(latest, id)
    atomicWriteJson(outputPath, jsonForDisk)

    return res.json({
      ok: true,
      path: relative(resolve(__dirname, '..'), outputPath),
    })
  } catch (e) {
    return res.status(500).json({ error: e.message })
  }
})

app.post('/api/toxins/:id/image', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' })

    const { id } = req.params
    const compressed = await compressImage(req.file.buffer)
    const destination = `toxins/${id}/image.jpg`

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
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' })

    const { id } = req.params
    const compressed = await compressImage(req.file.buffer)
    const destination = `toxins/${id}/images/${Date.now()}.jpg`

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

    const prefix = `https://storage.googleapis.com/${bucket.name}/`
    if (urlToDelete.startsWith(prefix)) {
      const storagePath = urlToDelete.slice(prefix.length)
      await bucket.file(storagePath).delete().catch(() => {})
    }

    res.json({ ok: true, imageUrls: next })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

app.listen(3001, () => console.log('Admin API running at http://localhost:3001'))
