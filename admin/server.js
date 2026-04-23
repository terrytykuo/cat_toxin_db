import { createRequire } from 'node:module'
import { readFileSync, existsSync } from 'node:fs'
import { resolve, dirname, isAbsolute } from 'node:path'
import { fileURLToPath } from 'node:url'
import express from 'express'
import cors from 'cors'
import multer from 'multer'
import sharp from 'sharp'

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
  console.error('Missing FIREBASE_STORAGE_BUCKET in .env.local (repo root)')
  process.exit(1)
}

if (!adminSecret) {
  console.error('Missing ADMIN_SECRET in admin/.env.local')
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
    await db.collection('toxins').doc(id).update(sanitizeToxin(req.body))
    res.json({ ok: true })
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

const HOST = '127.0.0.1'
const PORT = 3001
app.listen(PORT, HOST, () => console.log(`Admin API running at http://${HOST}:${PORT}`))
