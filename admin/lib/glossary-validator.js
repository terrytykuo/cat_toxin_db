import Ajv from 'ajv'
import { readFileSync, existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(__dirname, '..', '..')
const SCHEMA_PATH = join(REPO_ROOT, 'schemas', 'glossary.schema.json')

function loadValidator() {
  if (!existsSync(SCHEMA_PATH)) {
    throw new Error(`Glossary schema not found at ${SCHEMA_PATH}`)
  }
  const schema = JSON.parse(readFileSync(SCHEMA_PATH, 'utf8'))
  const ajv = new Ajv({ allErrors: true, strict: false })
  return ajv.compile(schema)
}

const validate = loadValidator()

export function validateGlossary(payload) {
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
