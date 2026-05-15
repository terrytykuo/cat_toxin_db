import { useEffect, useMemo, useState } from 'react'
import { adminFetch } from './api'
import type { Glossary, GlossaryWithMeta, SyncVocabularyResponse, GlossaryExamplesResponse, GlossaryExample } from './types'

const SEVERITY_ORDER = ['mild', 'moderate', 'severe', 'fatal'] as const
type GlossaryKey = 'symptoms_severity' | 'body_system' | 'toxic_parts' | 'terms'

const emptyGlossary = (): Glossary => ({
  symptoms_severity: {},
  body_system: {},
  toxic_parts: {},
  terms: {},
})

function sortedKeys(map: Record<string, string>): string[] {
  return Object.keys(map).sort((a, b) => a.localeCompare(b))
}

function severityKeys(map: Record<string, string>): string[] {
  const known = SEVERITY_ORDER as readonly string[]
  const extras = Object.keys(map).filter(k => !known.includes(k))
  return [...SEVERITY_ORDER, ...extras]
}

function relativeAgo(iso: string | null | undefined): string {
  if (!iso) return 'never'
  const ms = Date.now() - new Date(iso).getTime()
  if (!Number.isFinite(ms) || ms < 0) return 'just now'
  const s = Math.floor(ms / 1000)
  if (s < 60) return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

const emptyExamples = (): GlossaryExamplesResponse => ({
  symptoms_severity: {},
  body_system: {},
  toxic_parts: {},
  terms: {},
})

export default function GlossaryEditor() {
  const [original, setOriginal] = useState<Glossary>(emptyGlossary)
  const [draft, setDraft] = useState<Glossary>(emptyGlossary)
  const [examples, setExamples] = useState<GlossaryExamplesResponse>(emptyExamples)
  const [updatedAt, setUpdatedAt] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [syncOpen, setSyncOpen] = useState<null | 'body_system' | 'toxic_parts' | 'both'>(null)
  const [syncDiff, setSyncDiff] = useState<SyncVocabularyResponse | null>(null)
  const [syncLoading, setSyncLoading] = useState(false)
  const [newTermKey, setNewTermKey] = useState('')

  useEffect(() => {
    const glossaryReq = adminFetch('/api/glossary').then(async r => {
      if (!r.ok) {
        const payload = await r.json().catch(() => ({}))
        throw new Error(payload.error ?? 'Failed to load glossary')
      }
      return r.json() as Promise<GlossaryWithMeta>
    })
    const examplesReq = adminFetch('/api/glossary/examples').then(async r => {
      if (!r.ok) throw new Error('Failed to load examples')
      return r.json() as Promise<GlossaryExamplesResponse>
    })

    Promise.all([glossaryReq, examplesReq])
      .then(([data, ex]) => {
        const next: Glossary = {
          symptoms_severity: data.symptoms_severity || {},
          body_system: data.body_system || {},
          toxic_parts: data.toxic_parts || {},
          terms: data.terms || {},
        }
        setOriginal(next)
        setDraft(structuredClone(next))
        setExamples(ex)
        setUpdatedAt(data.updated_at ?? null)
        setLoading(false)
      })
      .catch(e => {
        setError(e.message)
        setLoading(false)
      })
  }, [])

  const isDirty = useMemo(() => JSON.stringify(original) !== JSON.stringify(draft), [original, draft])

  const setValue = (bucket: GlossaryKey, key: string, value: string) => {
    setDraft(prev => ({ ...prev, [bucket]: { ...prev[bucket], [key]: value } }))
  }

  const deleteKey = (bucket: GlossaryKey, key: string) => {
    setDraft(prev => {
      const next = { ...prev[bucket] }
      delete next[key]
      return { ...prev, [bucket]: next }
    })
  }

  const addTerm = () => {
    const key = newTermKey.trim()
    if (!key) return
    if (key in draft.terms) {
      setError(`Term "${key}" already exists`)
      return
    }
    setDraft(prev => ({ ...prev, terms: { ...prev.terms, [key]: '' } }))
    setNewTermKey('')
    setError(null)
  }

  const openSync = async () => {
    setSyncLoading(true)
    setError(null)
    try {
      const r = await adminFetch('/api/glossary/sync-vocabulary', { method: 'POST' })
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? 'Sync failed')
      setSyncDiff(await r.json())
      setSyncOpen('both')
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSyncLoading(false)
    }
  }

  const save = async () => {
    setSaving(true)
    setError(null)
    try {
      const r = await adminFetch('/api/glossary', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      })
      if (!r.ok) {
        const payload = await r.json().catch(() => ({}))
        throw new Error(payload.error ?? 'Save failed')
      }
      const saved = (await r.json()) as GlossaryWithMeta
      const next: Glossary = {
        symptoms_severity: saved.symptoms_severity || {},
        body_system: saved.body_system || {},
        toxic_parts: saved.toxic_parts || {},
        terms: saved.terms || {},
      }
      setOriginal(next)
      setDraft(structuredClone(next))
      setUpdatedAt(saved.updated_at ?? null)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <div className="flex-1 p-8 text-gray-400">Loading glossary…</div>
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="flex-1 overflow-y-auto p-6 space-y-6 max-w-3xl mx-auto w-full">
        <Section title="Symptom Severity" subtitle="Fixed enum (4 values)">
          <KVTable
            keys={severityKeys(draft.symptoms_severity)}
            values={draft.symptoms_severity}
            examples={examples.symptoms_severity}
            onChange={(k, v) => setValue('symptoms_severity', k, v)}
            keysLocked
          />
        </Section>

        <Section
          title="Body System"
          subtitle={`${Object.keys(draft.body_system).length} terms`}
          headerRight={
            <button
              onClick={openSync}
              disabled={syncLoading}
              className="text-xs px-2 py-1 rounded border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-50"
            >
              {syncLoading ? 'Scanning…' : '↻ Sync from toxins'}
            </button>
          }
        >
          <KVTable
            keys={sortedKeys(draft.body_system)}
            values={draft.body_system}
            examples={examples.body_system}
            onChange={(k, v) => setValue('body_system', k, v)}
            keysLocked
          />
        </Section>

        <Section
          title="Toxic Parts"
          subtitle={`${Object.keys(draft.toxic_parts).length} terms`}
          headerRight={
            <button
              onClick={openSync}
              disabled={syncLoading}
              className="text-xs px-2 py-1 rounded border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-50"
            >
              {syncLoading ? 'Scanning…' : '↻ Sync from toxins'}
            </button>
          }
        >
          <KVTable
            keys={sortedKeys(draft.toxic_parts)}
            values={draft.toxic_parts}
            examples={examples.toxic_parts}
            onChange={(k, v) => setValue('toxic_parts', k, v)}
            keysLocked
          />
        </Section>

        <Section title="Terms" subtitle={`${Object.keys(draft.terms).length} terms (free-form)`}>
          <div className="flex gap-2 mb-3">
            <input
              value={newTermKey}
              onChange={e => setNewTermKey(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addTerm()}
              placeholder="English term to add…"
              className="flex-1 border border-gray-200 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-blue-400"
            />
            <button
              onClick={addTerm}
              className="px-3 py-1.5 text-xs font-medium rounded bg-blue-500 text-white hover:bg-blue-600"
            >
              + Add
            </button>
          </div>
          <KVTable
            keys={sortedKeys(draft.terms)}
            values={draft.terms}
            examples={examples.terms}
            onChange={(k, v) => setValue('terms', k, v)}
            onDelete={k => deleteKey('terms', k)}
          />
        </Section>
      </div>

      <footer className="border-t border-gray-200 px-6 py-3 flex items-center gap-4 shrink-0 bg-gray-50">
        <div className="text-xs text-gray-500">
          Last saved: <span className="font-mono">{relativeAgo(updatedAt)}</span>
        </div>
        {error && <div className="text-xs text-red-500 flex-1 truncate">{error}</div>}
        <div className="flex-1" />
        {isDirty && <span className="text-xs text-amber-600">● Unsaved changes</span>}
        <button
          onClick={save}
          disabled={!isDirty || saving}
          className="px-4 py-1.5 text-xs font-medium rounded bg-blue-500 text-white hover:bg-blue-600 disabled:bg-gray-300"
        >
          {saving ? 'Saving…' : 'Save Changes'}
        </button>
      </footer>

      {syncOpen && syncDiff && (
        <SyncModal
          diff={syncDiff}
          onCancel={() => {
            setSyncOpen(null)
            setSyncDiff(null)
          }}
          onApply={(applied) => {
            setDraft(prev => {
              const next = structuredClone(prev)
              for (const bucket of ['body_system', 'toxic_parts'] as const) {
                for (const k of applied[bucket].add) {
                  if (!(k in next[bucket])) next[bucket][k] = ''
                }
                for (const k of applied[bucket].remove) {
                  delete next[bucket][k]
                }
              }
              return next
            })
            setSyncOpen(null)
            setSyncDiff(null)
          }}
        />
      )}
    </div>
  )
}

function Section({
  title,
  subtitle,
  headerRight,
  children,
}: {
  title: string
  subtitle?: string
  headerRight?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="border border-gray-200 rounded-md">
      <header className="flex items-center justify-between px-4 py-2 border-b border-gray-200 bg-gray-50 rounded-t-md">
        <div>
          <h2 className="font-semibold text-sm">{title}</h2>
          {subtitle && <p className="text-[11px] text-gray-500">{subtitle}</p>}
        </div>
        {headerRight}
      </header>
      <div className="p-3">{children}</div>
    </section>
  )
}

function KVTable({
  keys,
  values,
  examples,
  onChange,
  onDelete,
  keysLocked,
}: {
  keys: string[]
  values: Record<string, string>
  examples?: Record<string, GlossaryExample>
  onChange: (key: string, value: string) => void
  onDelete?: (key: string) => void
  keysLocked?: boolean
}) {
  if (keys.length === 0) {
    return <div className="text-xs text-gray-400 italic py-2">No entries.</div>
  }
  return (
    <div className="divide-y divide-gray-100">
      {keys.map(k => {
        const ex = examples?.[k]
        return (
          <div key={k} className="py-2">
            <div className="flex items-center gap-3">
              <div className={`w-1/2 text-sm ${keysLocked ? 'text-gray-700 font-mono text-xs' : ''}`}>
                {k}
              </div>
              <input
                value={values[k] ?? ''}
                onChange={e => onChange(k, e.target.value)}
                placeholder="繁體中文翻譯…"
                className="flex-1 border border-gray-200 rounded px-2 py-1 text-sm focus:outline-none focus:border-blue-400"
              />
              {onDelete && (
                <button
                  onClick={() => onDelete(k)}
                  className="text-xs text-gray-400 hover:text-red-500 px-1"
                  aria-label={`Delete ${k}`}
                >
                  ✕
                </button>
              )}
            </div>
            {ex && (
              <div className="mt-1 ml-2 text-[11px] text-gray-500 leading-snug">
                <span className="text-gray-400">↳ </span>
                <span className="italic">&ldquo;{ex.quote}&rdquo;</span>
                <span className="text-gray-400"> — {ex.source}</span>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function SyncModal({
  diff,
  onCancel,
  onApply,
}: {
  diff: SyncVocabularyResponse
  onCancel: () => void
  onApply: (applied: {
    body_system: { add: string[]; remove: string[] }
    toxic_parts: { add: string[]; remove: string[] }
  }) => void
}) {
  const [addSelected, setAddSelected] = useState<Record<string, Set<string>>>({
    body_system: new Set(diff.body_system.add),
    toxic_parts: new Set(diff.toxic_parts.add),
  })
  const [removeSelected, setRemoveSelected] = useState<Record<string, Set<string>>>({
    body_system: new Set(),
    toxic_parts: new Set(),
  })

  const toggle = (
    bucket: 'body_system' | 'toxic_parts',
    op: 'add' | 'remove',
    key: string,
  ) => {
    const setter = op === 'add' ? setAddSelected : setRemoveSelected
    setter(prev => {
      const next = { ...prev, [bucket]: new Set(prev[bucket]) }
      if (next[bucket].has(key)) next[bucket].delete(key)
      else next[bucket].add(key)
      return next
    })
  }

  const total =
    diff.body_system.add.length +
    diff.body_system.orphan.length +
    diff.toxic_parts.add.length +
    diff.toxic_parts.orphan.length

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
      onClick={onCancel}
    >
      <div
        className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <header className="px-5 py-3 border-b border-gray-200">
          <h2 className="font-semibold text-base">Sync vocabulary from toxins</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            {total === 0
              ? 'Glossary already matches toxins data — nothing to sync.'
              : 'Review differences. Additions get blank Chinese values; orphans are deletes. You still need to Save after applying.'}
          </p>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {(['body_system', 'toxic_parts'] as const).map(bucket => (
            <div key={bucket}>
              <h3 className="font-semibold text-sm capitalize mb-2">{bucket.replace('_', ' ')}</h3>
              <DiffList
                label="To add"
                items={diff[bucket].add}
                selected={addSelected[bucket]}
                onToggle={k => toggle(bucket, 'add', k)}
                tone="add"
              />
              <DiffList
                label="Orphan (remove?)"
                items={diff[bucket].orphan}
                selected={removeSelected[bucket]}
                onToggle={k => toggle(bucket, 'remove', k)}
                tone="remove"
              />
            </div>
          ))}
        </div>

        <footer className="px-5 py-3 border-t border-gray-200 flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="px-3 py-1.5 text-xs font-medium rounded border border-gray-200 text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={() =>
              onApply({
                body_system: {
                  add: [...addSelected.body_system],
                  remove: [...removeSelected.body_system],
                },
                toxic_parts: {
                  add: [...addSelected.toxic_parts],
                  remove: [...removeSelected.toxic_parts],
                },
              })
            }
            className="px-3 py-1.5 text-xs font-medium rounded bg-blue-500 text-white hover:bg-blue-600"
          >
            Apply
          </button>
        </footer>
      </div>
    </div>
  )
}

function DiffList({
  label,
  items,
  selected,
  onToggle,
  tone,
}: {
  label: string
  items: string[]
  selected: Set<string>
  onToggle: (key: string) => void
  tone: 'add' | 'remove'
}) {
  if (items.length === 0) {
    return <div className="text-xs text-gray-400 italic mb-2">{label}: none.</div>
  }
  const dotColor = tone === 'add' ? 'bg-green-500' : 'bg-red-400'
  return (
    <div className="mb-3">
      <div className="text-xs text-gray-500 mb-1">{label} ({items.length}):</div>
      <ul className="space-y-1">
        {items.map(k => (
          <li key={k} className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={selected.has(k)}
              onChange={() => onToggle(k)}
              className="cursor-pointer"
            />
            <span className={`inline-block w-1.5 h-1.5 rounded-full ${dotColor}`} />
            <span className="font-mono text-xs">{k}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
