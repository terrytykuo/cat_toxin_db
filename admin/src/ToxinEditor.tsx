import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import type { Toxin, ToxinSymptom, ToxinChemical, ToxinTreatment } from './types'
import { adminFetch } from './api'

// ── Image upload ──────────────────────────────────────────────────────────────

function ImagesField({ toxin, onUpdate }: { toxin: Toxin; onUpdate: (id: string, patch: Partial<Toxin>) => void }) {
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // 相容舊資料：遷移期間 imageUrls 可能還不存在
  const images: string[] = toxin.imageUrls ?? (toxin.imageUrl ? [toxin.imageUrl] : [])

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setError(null)
    try {
      const form = new FormData()
      form.append('image', file)
      const res = await adminFetch(`/api/toxins/${toxin.id}/images`, { method: 'POST', body: form })
      if (!res.ok) throw new Error((await res.json()).error ?? 'Upload failed')
      const { imageUrl } = await res.json() as { imageUrl: string }
      onUpdate(toxin.id, { imageUrls: [...images, imageUrl] })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const handleDelete = async (index: number) => {
    try {
      const res = await adminFetch(`/api/toxins/${toxin.id}/images/${index}`, { method: 'DELETE' })
      if (!res.ok) throw new Error((await res.json()).error ?? 'Delete failed')
      const { imageUrls } = await res.json() as { imageUrls: string[] }
      onUpdate(toxin.id, { imageUrls })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed')
    }
  }

  return (
    <div className="shrink-0">
      <div className="flex gap-2 flex-wrap">
        {images.map((url, i) => (
          <div key={url} className="relative w-24 h-24 rounded-lg border border-gray-200 overflow-hidden group">
            <img src={url} alt={`Image ${i + 1}`} className="w-full h-full object-cover" />
            {i === 0 && (
              <span className="absolute top-1 left-1 bg-black/60 text-white text-[9px] px-1 rounded">封面</span>
            )}
            <button
              onClick={() => handleDelete(i)}
              className="absolute top-1 right-1 w-5 h-5 bg-black/60 text-white rounded-full text-xs opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
            >
              ×
            </button>
          </div>
        ))}

        {/* Upload button */}
        <div
          className="w-24 h-24 rounded-lg border-2 border-dashed border-gray-300 flex flex-col items-center justify-center cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-colors"
          onClick={() => !uploading && inputRef.current?.click()}
        >
          {uploading ? (
            <span className="text-gray-400 text-xs">上傳中…</span>
          ) : (
            <>
              <span className="text-gray-400 text-2xl leading-none">+</span>
              <span className="text-gray-400 text-[10px] mt-1">新增圖片</span>
            </>
          )}
        </div>
      </div>
      {error && <p className="text-red-500 text-[10px] mt-1 leading-tight">{error}</p>}
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={handleUpload} />
    </div>
  )
}

// ── Auto-save hook ────────────────────────────────────────────────────────────

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

function useSave(toxinId: string) {
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  const [statuses, setStatuses] = useState<Record<string, SaveStatus>>({})

  const save = useCallback(
    (field: string, value: unknown) => {
      clearTimeout(timers.current[field])
      setStatuses(s => ({ ...s, [field]: 'saving' }))
      timers.current[field] = setTimeout(() => {
        adminFetch(`/api/toxins/${toxinId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ [field]: value }),
        })
          .then(async res => {
            if (!res.ok) {
              throw new Error((await res.json().catch(() => ({}))).error ?? 'Save failed')
            }
            setStatuses(s => ({ ...s, [field]: 'saved' }))
            setTimeout(
              () => setStatuses(s => ({ ...s, [field]: 'idle' })),
              2000
            )
          })
          .catch(() => setStatuses(s => ({ ...s, [field]: 'error' })))
      }, 800)
    },
    [toxinId]
  )

  const status = (field: string): SaveStatus => statuses[field] ?? 'idle'

  return { save, status }
}

// ── Save indicator ────────────────────────────────────────────────────────────

function Dot({ status }: { status: SaveStatus }) {
  if (status === 'idle') return null
  const cls =
    status === 'saving'
      ? 'text-gray-400'
      : status === 'saved'
        ? 'text-green-500'
        : 'text-red-500'
  const label =
    status === 'saving' ? 'Saving…' : status === 'saved' ? '✓ Saved' : '✗ Error'
  return <span className={`text-xs ml-2 ${cls}`}>{label}</span>
}

// ── Reusable field components ─────────────────────────────────────────────────

function FieldLabel({ label, status }: { label: string; status: SaveStatus }) {
  return (
    <div className="flex items-center mb-1">
      <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{label}</span>
      <Dot status={status} />
    </div>
  )
}

function TextField({
  label, field, value, onSave, multiline = false,
}: {
  label: string
  field: string
  value: string
  onSave: (field: string, value: string) => void
  multiline?: boolean
}) {
  const [local, setLocal] = useState(value)
  useEffect(() => setLocal(value), [value])

  const cls = 'w-full border border-gray-200 rounded px-3 py-2 text-sm focus:outline-none focus:border-blue-400 resize-y'

  return (
    <div>
      <FieldLabel label={label} status="idle" />
      {multiline ? (
        <textarea
          value={local}
          rows={4}
          onChange={e => {
            setLocal(e.target.value)
            onSave(field, e.target.value)
          }}
          className={cls}
        />
      ) : (
        <input
          value={local}
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

function SelectField<T extends string>({
  label, field, value, options, onSave,
}: {
  label: string
  field: string
  value: T
  options: T[]
  onSave: (field: string, value: T) => void
}) {
  return (
    <div>
      <FieldLabel label={label} status="idle" />
      <select
        value={value}
        onChange={e => onSave(field, e.target.value as T)}
        className="border border-gray-200 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-blue-400"
      >
        {options.map(o => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>
    </div>
  )
}

function TagListField({
  label, field, value, onSave,
}: {
  label: string
  field: string
  value: string[]
  onSave: (field: string, value: string[]) => void
}) {
  const [items, setItems] = useState(value)
  const [draft, setDraft] = useState('')
  useEffect(() => setItems(value), [value])

  const commit = (next: string[]) => {
    setItems(next)
    onSave(field, next)
  }

  const add = () => {
    const trimmed = draft.trim()
    if (!trimmed || items.includes(trimmed)) return
    commit([...items, trimmed])
    setDraft('')
  }

  return (
    <div>
      <FieldLabel label={label} status="idle" />
      <div className="flex flex-wrap gap-1.5 mb-2">
        {items.map((item, i) => (
          <span key={i} className="flex items-center gap-1 bg-gray-100 rounded px-2 py-0.5 text-xs">
            {item}
            <button
              onClick={() => commit(items.filter((_, idx) => idx !== i))}
              className="text-gray-400 hover:text-red-500 ml-0.5 font-bold"
            >
              ×
            </button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && add()}
          placeholder="Add item…"
          className="border border-gray-200 rounded px-2 py-1 text-sm focus:outline-none focus:border-blue-400 flex-1"
        />
        <button
          onClick={add}
          className="px-3 py-1 bg-blue-500 text-white rounded text-xs hover:bg-blue-600"
        >
          Add
        </button>
      </div>
    </div>
  )
}

// ── Symptoms editor ───────────────────────────────────────────────────────────

const SYMPTOM_SEVERITIES = ['mild', 'moderate', 'severe', 'fatal'] as const
const SEVERITY_BG: Record<string, string> = {
  mild: 'bg-green-100',
  moderate: 'bg-yellow-100',
  severe: 'bg-orange-100',
  fatal: 'bg-red-100',
}

function SymptomsField({
  value, onSave,
}: {
  value: ToxinSymptom[]
  onSave: (field: string, value: ToxinSymptom[]) => void
}) {
  const [items, setItems] = useState(value)
  useEffect(() => setItems(value), [value])

  const commit = (next: ToxinSymptom[]) => {
    setItems(next)
    onSave('symptoms', next)
  }

  const update = (i: number, patch: Partial<ToxinSymptom>) =>
    commit(items.map((s, idx) => (idx === i ? { ...s, ...patch } : s)))

  const add = () =>
    commit([...items, { name: '', body_system: '', severity: 'moderate' }])

  const remove = (i: number) => commit(items.filter((_, idx) => idx !== i))

  const inputCls = 'border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:border-blue-400 w-full'

  return (
    <div>
      <FieldLabel label="Symptoms" status="idle" />
      <div className="space-y-2">
        {items.map((s, i) => (
          <div key={i} className={`rounded border border-gray-200 p-3 ${SEVERITY_BG[s.severity]}`}>
            <div className="grid grid-cols-[1fr_1fr_auto_auto] gap-2 mb-2">
              <input
                value={s.name}
                onChange={e => update(i, { name: e.target.value })}
                placeholder="Symptom name"
                className={inputCls}
              />
              <input
                value={s.body_system}
                onChange={e => update(i, { body_system: e.target.value })}
                placeholder="Body system"
                className={inputCls}
              />
              <select
                value={s.severity}
                onChange={e => update(i, { severity: e.target.value as ToxinSymptom['severity'] })}
                className="border border-gray-200 rounded px-1 py-1 text-xs focus:outline-none focus:border-blue-400"
              >
                {SYMPTOM_SEVERITIES.map(sv => (
                  <option key={sv} value={sv}>{sv}</option>
                ))}
              </select>
              <button
                onClick={() => remove(i)}
                className="text-gray-400 hover:text-red-500 px-1 font-bold"
              >
                ×
              </button>
            </div>
            <input
              value={s.onset ?? ''}
              onChange={e => update(i, { onset: e.target.value })}
              placeholder="Onset (optional)"
              className={inputCls}
            />
          </div>
        ))}
      </div>
      <button
        onClick={add}
        className="mt-2 px-3 py-1 border border-dashed border-gray-300 rounded text-xs text-gray-500 hover:border-blue-400 hover:text-blue-500"
      >
        + Add Symptom
      </button>
    </div>
  )
}

// ── Chemicals editor ──────────────────────────────────────────────────────────

function ChemicalsField({
  value, onSave,
}: {
  value: ToxinChemical[]
  onSave: (field: string, value: ToxinChemical[]) => void
}) {
  const [items, setItems] = useState(value)
  const [expanded, setExpanded] = useState<number | null>(null)
  useEffect(() => setItems(value), [value])

  const commit = (next: ToxinChemical[]) => {
    setItems(next)
    onSave('chemicals', next)
  }

  const update = (i: number, patch: Partial<ToxinChemical>) =>
    commit(items.map((c, idx) => (idx === i ? { ...c, ...patch } : c)))

  const add = () => {
    const next = [...items, { name: '' }]
    commit(next)
    setExpanded(next.length - 1)
  }

  const remove = (i: number) => {
    commit(items.filter((_, idx) => idx !== i))
    setExpanded(null)
  }

  const inputCls = 'border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:border-blue-400 w-full'
  const textareaCls = inputCls + ' resize-y'

  return (
    <div>
      <FieldLabel label="Chemicals / Toxins" status="idle" />
      <div className="space-y-1">
        {items.map((c, i) => (
          <div key={i} className="border border-gray-200 rounded">
            <div
              className="flex items-center justify-between px-3 py-2 cursor-pointer hover:bg-gray-50"
              onClick={() => setExpanded(expanded === i ? null : i)}
            >
              <span className="text-xs font-medium truncate flex-1">{c.name || '(unnamed)'}</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={e => { e.stopPropagation(); remove(i) }}
                  className="text-gray-300 hover:text-red-500 font-bold"
                >
                  ×
                </button>
                <span className="text-gray-400 text-xs">{expanded === i ? '▲' : '▼'}</span>
              </div>
            </div>
            {expanded === i && (
              <div className="px-3 pb-3 space-y-2 border-t border-gray-100">
                <div className="pt-2">
                  <div className="text-[10px] text-gray-400 mb-0.5">Name</div>
                  <input value={c.name} onChange={e => update(i, { name: e.target.value })} className={inputCls} />
                </div>
                <div>
                  <div className="text-[10px] text-gray-400 mb-0.5">Chemical Formula</div>
                  <input value={c.chemical_formula ?? ''} onChange={e => update(i, { chemical_formula: e.target.value || null })} className={inputCls} />
                </div>
                <div>
                  <div className="text-[10px] text-gray-400 mb-0.5">Description</div>
                  <textarea value={c.description ?? ''} rows={3} onChange={e => update(i, { description: e.target.value || null })} className={textareaCls} />
                </div>
                <div>
                  <div className="text-[10px] text-gray-400 mb-0.5">Concentration Notes</div>
                  <textarea value={c.concentration_notes ?? ''} rows={2} onChange={e => update(i, { concentration_notes: e.target.value || null })} className={textareaCls} />
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
      <button
        onClick={add}
        className="mt-2 px-3 py-1 border border-dashed border-gray-300 rounded text-xs text-gray-500 hover:border-blue-400 hover:text-blue-500"
      >
        + Add Chemical
      </button>
    </div>
  )
}

// ── Treatments editor ─────────────────────────────────────────────────────────

function TreatmentsField({
  value, onSave,
}: {
  value: ToxinTreatment[]
  onSave: (field: string, value: ToxinTreatment[]) => void
}) {
  const [items, setItems] = useState([...value].sort((a, b) => a.priority - b.priority))
  useEffect(() => setItems([...value].sort((a, b) => a.priority - b.priority)), [value])

  const commit = (next: ToxinTreatment[]) => {
    setItems(next)
    onSave('treatments', next)
  }

  const update = (i: number, patch: Partial<ToxinTreatment>) =>
    commit(items.map((t, idx) => (idx === i ? { ...t, ...patch } : t)))

  const add = () =>
    commit([...items, { name: '', priority: items.length + 1 }])

  const remove = (i: number) => {
    const next = items.filter((_, idx) => idx !== i).map((t, idx) => ({ ...t, priority: idx + 1 }))
    commit(next)
  }

  const inputCls = 'border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:border-blue-400 w-full'
  const textareaCls = inputCls + ' resize-y'

  return (
    <div>
      <FieldLabel label="Treatments" status="idle" />
      <div className="space-y-2">
        {items.map((t, i) => (
          <div key={i} className="border border-gray-200 rounded p-3">
            <div className="flex items-center gap-2 mb-2">
              <span className="w-5 h-5 rounded-full bg-blue-500 text-white text-[10px] flex items-center justify-center shrink-0 font-bold">
                {i + 1}
              </span>
              <input
                value={t.name}
                onChange={e => update(i, { name: e.target.value })}
                placeholder="Treatment name"
                className={inputCls}
              />
              <button
                onClick={() => remove(i)}
                className="text-gray-300 hover:text-red-500 font-bold shrink-0"
              >
                ×
              </button>
            </div>
            <div className="space-y-1 pl-7">
              <textarea
                value={t.description ?? ''}
                rows={2}
                onChange={e => update(i, { description: e.target.value || null })}
                placeholder="Description (optional)"
                className={textareaCls}
              />
              <textarea
                value={t.notes ?? ''}
                rows={2}
                onChange={e => update(i, { notes: e.target.value || null })}
                placeholder="Notes (optional)"
                className={textareaCls}
              />
            </div>
          </div>
        ))}
      </div>
      <button
        onClick={add}
        className="mt-2 px-3 py-1 border border-dashed border-gray-300 rounded text-xs text-gray-500 hover:border-blue-400 hover:text-blue-500"
      >
        + Add Treatment
      </button>
    </div>
  )
}

// ── Section wrapper ───────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="border-t border-gray-100 pt-5">
      <h2 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4">{title}</h2>
      <div className="space-y-4">{children}</div>
    </div>
  )
}

// ── Main ToxinEditor ──────────────────────────────────────────────────────────

export default function ToxinEditor({
  toxin,
  onUpdate,
}: {
  toxin: Toxin
  onUpdate: (id: string, patch: Partial<Toxin>) => void
}) {
  const { save, status } = useSave(toxin.id)

  const handleSave = (field: string, value: unknown) => {
    onUpdate(toxin.id, { [field]: value } as Partial<Toxin>)
    save(field, value)
  }

  const anySaving = status('name') === 'saving' || status('description') === 'saving' || status('symptoms') === 'saving'
  const isHidden = toxin.hidden === true

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-5">
      {/* Hero */}
      <div className="flex gap-4">
        <ImagesField toxin={toxin} onUpdate={onUpdate} />
        <div className="flex-1 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-gray-400 font-mono">{toxin.id}</span>
              {anySaving && <span className="text-[10px] text-gray-400">Saving…</span>}
            </div>
            {/* Soft delete toggle */}
            <button
              onClick={() => handleSave('hidden', !isHidden)}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                isHidden
                  ? 'bg-red-50 border-red-300 text-red-600 hover:bg-red-100'
                  : 'bg-green-50 border-green-300 text-green-600 hover:bg-green-100'
              }`}
            >
              <span>{isHidden ? '🚫' : '✓'}</span>
              {isHidden ? 'Hidden in app' : 'Visible in app'}
            </button>
          </div>
          <TextField label="Name" field="name" value={toxin.name} onSave={handleSave} />
          <div className="flex gap-3">
            <SelectField
              label="Severity"
              field="severity"
              value={toxin.severity}
              options={['safe', 'cautious', 'toxic']}
              onSave={handleSave}
            />
            <SelectField
              label="Category"
              field="category"
              value={toxin.category}
              options={['plant', 'food']}
              onSave={handleSave}
            />
            {toxin.severity === 'safe' && (
              <SelectField
                label="Curated List"
                field="curatedList"
                value={toxin.curatedList ?? ''}
                options={['', 'foliage', 'kitchen', 'blooms']}
                onSave={(f, v) => handleSave(f, v === '' ? null : v)}
              />
            )}
          </div>
        </div>
      </div>

      <Section title="Basic Info">
        <TextField label="Scientific Name" field="scientific_name" value={toxin.scientific_name ?? ''} onSave={handleSave} />
        <TextField label="Family" field="family" value={toxin.family ?? ''} onSave={handleSave} />
        <TagListField label="Aliases" field="aliases" value={toxin.aliases} onSave={handleSave} />
      </Section>

      <Section title="Description">
        <TextField label="Description" field="description" value={toxin.description} onSave={handleSave} multiline />
        <TagListField label="Safety Notes" field="safetyNotes" value={toxin.safetyNotes ?? []} onSave={handleSave} />
        <TextField label="Emergency Note" field="emergencyNote" value={toxin.emergencyNote ?? ''} onSave={handleSave} />
      </Section>

      <Section title="Toxicity">
        <TagListField label="Toxic Parts" field="toxicParts" value={toxin.toxicParts} onSave={handleSave} />
      </Section>

      <Section title="Symptoms">
        <SymptomsField value={toxin.symptoms} onSave={handleSave} />
      </Section>

      <Section title="Chemicals">
        <ChemicalsField value={toxin.chemicals ?? []} onSave={handleSave} />
      </Section>

      <Section title="Treatments">
        <TreatmentsField value={toxin.treatments ?? []} onSave={handleSave} />
      </Section>

      <div className="h-10" />
    </div>
  )
}
