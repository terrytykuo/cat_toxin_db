import Ajv from 'ajv'
import addFormats from 'ajv-formats'
import { readFileSync, mkdirSync, writeFileSync, renameSync, existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

const REPO_ROOT = resolve(__dirname, '..', '..')
const SCHEMA_PATH = join(REPO_ROOT, 'schemas', 'toxin.disk.schema.json')
const PLANTS_DIR = join(REPO_ROOT, 'data', 'plants_processed')
const FOODS_DIR = join(REPO_ROOT, 'data', 'foods_processed')

const SLUG_RE = /[^a-z0-9]+/g

function slugify(value) {
  return String(value).toLowerCase().replace(SLUG_RE, '_').replace(/^_|_$/g, '')
}

function loadValidator() {
  if (!existsSync(SCHEMA_PATH)) {
    throw new Error(`Disk schema not found at ${SCHEMA_PATH}`)
  }
  const schema = JSON.parse(readFileSync(SCHEMA_PATH, 'utf8'))
  const ajv = new Ajv({ allErrors: true, strict: false })
  addFormats(ajv)
  return ajv.compile(schema)
}

const validate = loadValidator()

export function validateDiskPayload(payload) {
  const ok = validate(payload)
  if (ok) return { ok: true, errors: [] }
  return {
    ok: false,
    errors: (validate.errors || []).map(e => ({
      path: e.instancePath || '<root>',
      message: e.message,
      params: e.params,
    })),
  }
}

export function resolveDiskPath(docId, payload) {
  const category = payload.category
  const stem = slugify(payload.scientific_name || docId)
  if (!stem) throw new Error(`Cannot compute disk path: empty slug for doc ${docId}`)
  const base = category === 'food' ? FOODS_DIR : PLANTS_DIR
  return join(base, `${stem}.json`)
}

export function atomicWriteJson(targetPath, payload) {
  mkdirSync(dirname(targetPath), { recursive: true })
  const tmp = `${targetPath}.tmp`
  writeFileSync(tmp, JSON.stringify(payload, null, 2) + '\n', 'utf8')
  renameSync(tmp, targetPath)
}
