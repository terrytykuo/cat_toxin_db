import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import type { Toxin } from './types'
import { adminFetch } from './api'

// ── Types ────────────────────────────────────────────────────────────────────

interface ZhSymptom {
  name?: string
  body_system?: string
  onset?: string
  notes?: string
}

interface ZhChemical {
  name?: string
  description?: string
  concentration_notes?: string
  chemical_formula?: string
}

interface ZhTreatment {
  name?: string
  description?: string
  notes?: string
}

interface Translation {
  slug: string
  name?: string
  description?: string
  aliases?: string[]
  toxicParts?: string[]
  safetyNotes?: string[]
  emergencyNote?: string
  symptoms?: ZhSymptom[]
  chemicals?: ZhChemical[]
  treatments?: ZhTreatment[]
  manual_override?: boolean
  translated_at?: string | null
}

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

// ── Auto-save hook ───────────────────────────────────────────────────────────

function useSave(slug: string) {
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  const [statuses, setStatuses] = useState<Record<string, SaveStatus>>({})

  const save = useCallback(
    (field: string, value: unknown) => {
      clearTimeout(timers.current[field])
      setStatuses(s => ({ ...s, [field]: 'saving' }))
      timers.current[field] = setTimeout(() => {
        adminFetch(`/api/translations/${slug}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ [field]: value }),
        })
          .then(async res => {
            if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Save failed')
            setStatuses(s => ({ ...s, [field]: 'saved' }))
            setTimeout(() => setStatuses(s => ({ ...s, [field]: 'idle' })), 2000)
          })
          .catch(() => setStatuses(s => ({ ...s, [field]: 'error' })))
      }, 800)
    },
    [slug],
  )

  const status = (field: string): SaveStatus => statuses[field] ?? 'idle'
  return { save, status }
}

// ── Dot / label ──────────────────────────────────────────────────────────────

function Dot({ status }: { status: SaveStatus }) {
  if (status === 'idle') return null
  const cls =
    status === 'saving' ? 'text-gray-400' : status === 'saved' ? 'text-green-500' : 'text-red-500'
  const label =
    status === 'saving' ? 'Saving…' : status === 'saved' ? '✓ Saved' : '✗ Error'
  return <span className={`text-xs ml-2 ${cls}`}>{label}</span>
}

function FieldLabel({ label, status }: { label: string; status: SaveStatus }) {
  return (
    <div className="flex items-center mb-1">
      <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{label}</span>
      <Dot status={status} />
    </div>
  )
}

// ── Field components ─────────────────────────────────────────────────────────

function ZhTextField({
  label, field, value, placeholder, status, onSave, multiline = false,
}: {
  label: string
  field: string
  value: string
  placeholder?: string
  status: SaveStatus
  onSave: (field: string, value: string) => void
  multiline?: boolean
}) {
  const [local, setLocal] = useState(value)
  useEffect(() => setLocal(value), [value])

  const cls =
    'w-full border border-gray-200 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-400 resize-y placeholder:text-gray-300 placeholder:italic'

  return (
    <div>
      <FieldLabel label={label} status={status} />
      {multiline ? (
        <textarea
          value={local}
          rows={4}
          placeholder={placeholder}
          onChange={e => {
            setLocal(e.target.value)
            onSave(field, e.target.value)
          }}
          className={cls}
        />
      ) : (
        <input
          value={local}
          placeholder={placeholder}
          onChange={e => {
            setLocal(e.target.value)
            onSave(field, e.target.value)
          }}
          className={cls}
        />
      )}
    </div>
  )
}

function ZhStringListField({
  label, field, values, placeholders, status, onSave,
}: {
  label: string
  field: string
  values: string[]
  placeholders: string[]
  status: SaveStatus
  onSave: (field: string, value: string[]) => void
}) {
  const max = Math.max(values.length, placeholders.length)
  const items: string[] = Array.from({ length: max }, (_, i) => values[i] ?? '')
  const [local, setLocal] = useState(items)
  useEffect(() => setLocal(items), [values.join(''), placeholders.join('')])

  const commit = (next: string[]) => {
    setLocal(next)
    // Trim trailing empties so file stays clean
    let end = next.length
    while (end > 0 && next[end - 1] === '') end -= 1
    onSave(field, next.slice(0, end))
  }

  const update = (i: number, val: string) => {
    const next = [...local]
    next[i] = val
    commit(next)
  }

  const cls =
    'w-full border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:border-blue-400 placeholder:text-gray-300 placeholder:italic'

  return (
    <div>
      <FieldLabel label={label} status={status} />
      <div className="space-y-1">
        {local.map((val, i) => (
          <input
            key={i}
            value={val}
            placeholder={placeholders[i] ?? ''}
            onChange={e => update(i, e.target.value)}
            className={cls}
          />
        ))}
        <button
          onClick={() => setLocal([...local, ''])}
          className="px-3 py-1 border border-dashed border-gray-300 rounded text-xs text-gray-500 hover:border-blue-400 hover:text-blue-500"
        >
          + Add
        </button>
      </div>
    </div>
  )
}

function ZhSymptomsField({
  values, english, status, onSave,
}: {
  values: ZhSymptom[]
  english: Array<{ name?: string; body_system?: string; onset?: string; notes?: string }>
  status: SaveStatus
  onSave: (field: string, value: ZhSymptom[]) => void
}) {
  const max = Math.max(values.length, english.length)
  const items: ZhSymptom[] = Array.from({ length: max }, (_, i) => values[i] ?? {})
  const [local, setLocal] = useState(items)
  useEffect(() => setLocal(items), [JSON.stringify(values), JSON.stringify(english)])

  const update = (i: number, patch: Partial<ZhSymptom>) => {
    const next = local.map((s, idx) => (idx === i ? { ...s, ...patch } : s))
    setLocal(next)
    onSave('symptoms', next)
  }

  const cls =
    'border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:border-blue-400 w-full placeholder:text-gray-300 placeholder:italic'

  return (
    <div>
      <FieldLabel label="Symptoms" status={status} />
      <div className="space-y-2">
        {local.map((s, i) => {
          const en = english[i] ?? {}
          return (
            <div key={i} className="rounded border border-gray-200 p-3 bg-gray-50">
              <div className="grid grid-cols-2 gap-2 mb-2">
                <input
                  value={s.name ?? ''}
                  onChange={e => update(i, { name: e.target.value })}
                  placeholder={en.name ?? '(no English source)'}
                  className={cls}
                />
                <input
                  value={s.body_system ?? ''}
                  onChange={e => update(i, { body_system: e.target.value })}
                  placeholder={en.body_system ?? ''}
                  className={cls}
                />
              </div>
              <input
                value={s.onset ?? ''}
                onChange={e => update(i, { onset: e.target.value })}
                placeholder={en.onset ?? 'Onset (optional)'}
                className={cls}
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}

function ZhChemicalsField({
  values, english, status, onSave,
}: {
  values: ZhChemical[]
  english: Array<{ name?: string; description?: string | null; concentration_notes?: string | null }>
  status: SaveStatus
  onSave: (field: string, value: ZhChemical[]) => void
}) {
  const max = Math.max(values.length, english.length)
  const items: ZhChemical[] = Array.from({ length: max }, (_, i) => values[i] ?? {})
  const [local, setLocal] = useState(items)
  useEffect(() => setLocal(items), [JSON.stringify(values), JSON.stringify(english)])

  const update = (i: number, patch: Partial<ZhChemical>) => {
    const next = local.map((c, idx) => (idx === i ? { ...c, ...patch } : c))
    setLocal(next)
    onSave('chemicals', next)
  }

  const inputCls =
    'border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:border-blue-400 w-full placeholder:text-gray-300 placeholder:italic'
  const textareaCls = inputCls + ' resize-y'

  return (
    <div>
      <FieldLabel label="Chemicals / Toxins" status={status} />
      <div className="space-y-2">
        {local.map((c, i) => {
          const en = english[i] ?? {}
          return (
            <div key={i} className="border border-gray-200 rounded p-3 bg-gray-50 space-y-2">
              <div>
                <div className="text-[10px] text-gray-400 mb-0.5">Name</div>
                <input
                  value={c.name ?? ''}
                  placeholder={en.name ?? ''}
                  onChange={e => update(i, { name: e.target.value })}
                  className={inputCls}
                />
              </div>
              <div>
                <div className="text-[10px] text-gray-400 mb-0.5">Description</div>
                <textarea
                  value={c.description ?? ''}
                  rows={3}
                  placeholder={en.description ?? ''}
                  onChange={e => update(i, { description: e.target.value })}
                  className={textareaCls}
                />
              </div>
              <div>
                <div className="text-[10px] text-gray-400 mb-0.5">Concentration Notes</div>
                <textarea
                  value={c.concentration_notes ?? ''}
                  rows={2}
                  placeholder={en.concentration_notes ?? ''}
                  onChange={e => update(i, { concentration_notes: e.target.value })}
                  className={textareaCls}
                />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function ZhTreatmentsField({
  values, english, status, onSave,
}: {
  values: ZhTreatment[]
  english: Array<{ name?: string; description?: string | null; notes?: string | null }>
  status: SaveStatus
  onSave: (field: string, value: ZhTreatment[]) => void
}) {
  const max = Math.max(values.length, english.length)
  const items: ZhTreatment[] = Array.from({ length: max }, (_, i) => values[i] ?? {})
  const [local, setLocal] = useState(items)
  useEffect(() => setLocal(items), [JSON.stringify(values), JSON.stringify(english)])

  const update = (i: number, patch: Partial<ZhTreatment>) => {
    const next = local.map((t, idx) => (idx === i ? { ...t, ...patch } : t))
    setLocal(next)
    onSave('treatments', next)
  }

  const inputCls =
    'border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:border-blue-400 w-full placeholder:text-gray-300 placeholder:italic'
  const textareaCls = inputCls + ' resize-y'

  return (
    <div>
      <FieldLabel label="Treatments" status={status} />
      <div className="space-y-2">
        {local.map((t, i) => {
          const en = english[i] ?? {}
          return (
            <div key={i} className="border border-gray-200 rounded p-3 bg-gray-50">
              <div className="flex items-center gap-2 mb-2">
                <span className="w-5 h-5 rounded-full bg-blue-500 text-white text-[10px] flex items-center justify-center shrink-0 font-bold">
                  {i + 1}
                </span>
                <input
                  value={t.name ?? ''}
                  placeholder={en.name ?? ''}
                  onChange={e => update(i, { name: e.target.value })}
                  className={inputCls}
                />
              </div>
              <div className="space-y-1 pl-7">
                <textarea
                  value={t.description ?? ''}
                  rows={2}
                  placeholder={en.description ?? ''}
                  onChange={e => update(i, { description: e.target.value })}
                  className={textareaCls}
                />
                <textarea
                  value={t.notes ?? ''}
                  rows={2}
                  placeholder={en.notes ?? ''}
                  onChange={e => update(i, { notes: e.target.value })}
                  className={textareaCls}
                />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="border-t border-gray-100 pt-5">
      <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4">{title}</h2>
      <div className="space-y-4">{children}</div>
    </div>
  )
}

// ── Main TranslationEditor ───────────────────────────────────────────────────

export default function TranslationEditor({ toxin }: { toxin: Toxin }) {
  const slug = toxin.id
  const [data, setData] = useState<Translation | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [missing, setMissing] = useState(false)
  const { save, status } = useSave(slug)

  useEffect(() => {
    setLoading(true)
    setLoadError(null)
    setMissing(false)
    adminFetch(`/api/translations/${slug}`)
      .then(async r => {
        if (r.status === 404) {
          setMissing(true)
          setData({ slug })
          return null
        }
        if (!r.ok) {
          throw new Error((await r.json().catch(() => ({}))).error ?? 'Failed to load translation')
        }
        return r.json() as Promise<Translation>
      })
      .then(d => {
        if (d) setData(d)
        setLoading(false)
      })
      .catch(e => {
        setLoadError(e.message)
        setLoading(false)
      })
  }, [slug])

  const handleSave = (field: string, value: unknown) => {
    setData(prev => (prev ? { ...prev, [field]: value } : prev))
    setMissing(false)
    save(field, value)
  }

  if (loading) {
    return <div className="p-6 text-gray-400">Loading translation…</div>
  }
  if (loadError) {
    return <div className="p-6 text-red-500 text-xs">{loadError}</div>
  }
  if (!data) return null

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-gray-400 font-mono">zh-TW · {slug}</span>
          {data.translated_at && (
            <span className="text-[10px] text-gray-400">
              {new Date(data.translated_at).toLocaleString()}
            </span>
          )}
          {data.manual_override && (
            <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">
              manual_override
            </span>
          )}
        </div>
        {missing && (
          <span className="text-[10px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded">
            尚未翻譯 · 編輯任一欄位即會建立檔案
          </span>
        )}
      </div>

      <ZhTextField
        label="Name"
        field="name"
        value={data.name ?? ''}
        placeholder={toxin.name ?? ''}
        status={status('name')}
        onSave={handleSave}
      />

      <Section title="Basic Info">
        <ZhStringListField
          label="Aliases"
          field="aliases"
          values={data.aliases ?? []}
          placeholders={toxin.aliases ?? []}
          status={status('aliases')}
          onSave={handleSave}
        />
      </Section>

      <Section title="Description">
        <ZhTextField
          label="Description"
          field="description"
          value={data.description ?? ''}
          placeholder={toxin.description ?? ''}
          status={status('description')}
          onSave={handleSave}
          multiline
        />
        <ZhStringListField
          label="Safety Notes"
          field="safetyNotes"
          values={data.safetyNotes ?? []}
          placeholders={toxin.safetyNotes ?? []}
          status={status('safetyNotes')}
          onSave={handleSave}
        />
        <ZhTextField
          label="Emergency Note"
          field="emergencyNote"
          value={data.emergencyNote ?? ''}
          placeholder={toxin.emergencyNote ?? ''}
          status={status('emergencyNote')}
          onSave={handleSave}
        />
      </Section>

      <Section title="Toxicity">
        <ZhStringListField
          label="Toxic Parts"
          field="toxicParts"
          values={data.toxicParts ?? []}
          placeholders={toxin.toxicParts ?? []}
          status={status('toxicParts')}
          onSave={handleSave}
        />
      </Section>

      <Section title="Symptoms">
        <ZhSymptomsField
          values={data.symptoms ?? []}
          english={toxin.symptoms ?? []}
          status={status('symptoms')}
          onSave={handleSave}
        />
      </Section>

      <Section title="Chemicals">
        <ZhChemicalsField
          values={data.chemicals ?? []}
          english={(toxin.chemicals ?? []).map(c => ({
            name: c.name,
            description: c.description ?? undefined,
            concentration_notes: c.concentration_notes ?? undefined,
          }))}
          status={status('chemicals')}
          onSave={handleSave}
        />
      </Section>

      <Section title="Treatments">
        <ZhTreatmentsField
          values={data.treatments ?? []}
          english={(toxin.treatments ?? []).map(t => ({
            name: t.name,
            description: t.description ?? undefined,
            notes: t.notes ?? undefined,
          }))}
          status={status('treatments')}
          onSave={handleSave}
        />
      </Section>

      <div className="h-10" />
    </div>
  )
}
