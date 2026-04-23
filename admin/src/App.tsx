import { useEffect, useState } from 'react'
import type { Toxin } from './types'
import ToxinEditor from './ToxinEditor'
import { adminFetch } from './api'

const SEVERITY_COLOR: Record<string, string> = {
  safe: 'bg-green-100 text-green-700',
  cautious: 'bg-yellow-100 text-yellow-700',
  toxic: 'bg-red-100 text-red-700',
}

export default function App() {
  const [toxins, setToxins] = useState<Toxin[]>([])
  const [selected, setSelected] = useState<Toxin | null>(null)
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<'all' | 'plant' | 'food'>('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    adminFetch('/api/toxins')
      .then(async r => {
        if (!r.ok) {
          const payload = await r.json().catch(() => ({}))
          throw new Error(payload.error ?? 'Failed to load toxins')
        }
        return r.json()
      })
      .then((data: Toxin[]) => {
        setToxins(data.sort((a, b) => (a.name ?? '').localeCompare(b.name ?? '')))
        setLoading(false)
      })
      .catch(e => {
        setError(e.message)
        setLoading(false)
      })
  }, [])

  const handleUpdate = (id: string, patch: Partial<Toxin>) => {
    setToxins(prev => prev.map(t => (t.id === id ? { ...t, ...patch } : t)))
    setSelected(prev => (prev?.id === id ? { ...prev, ...patch } : prev))
  }

  const filtered = toxins.filter(t => {
    if (categoryFilter !== 'all' && t.category !== categoryFilter) return false
    if (search && !(t.name ?? '').toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  return (
    <div className="flex h-screen bg-white text-gray-900 text-sm">
      {/* Sidebar */}
      <aside className="w-64 flex flex-col border-r border-gray-200 shrink-0">
        <div className="p-3 border-b border-gray-200">
          <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
            MewGuard Admin
          </div>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search…"
            className="w-full border border-gray-200 rounded px-2 py-1.5 text-sm focus:outline-none focus:border-blue-400 mb-2"
          />
          <div className="flex rounded overflow-hidden border border-gray-200 text-xs">
            {(['all', 'plant', 'food'] as const).map(cat => (
              <button
                key={cat}
                onClick={() => setCategoryFilter(cat)}
                className={`flex-1 py-1 capitalize transition-colors ${
                  categoryFilter === cat
                    ? 'bg-blue-500 text-white font-medium'
                    : 'text-gray-500 hover:bg-gray-50'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>
        <div className="overflow-y-auto flex-1">
          {loading && <div className="p-4 text-gray-400">Loading…</div>}
          {error && <div className="p-4 text-red-500 text-xs">{error}</div>}
          {filtered.map(t => (
            <button
              key={t.id}
              onClick={() => setSelected(t)}
              className={`w-full text-left px-3 py-2.5 border-b border-gray-100 hover:bg-gray-50 transition-colors ${
                selected?.id === t.id ? 'bg-blue-50 border-l-2 border-l-blue-500' : ''
              }`}
            >
              <div className={`font-medium leading-tight ${t.hidden ? 'text-gray-400 line-through' : ''}`}>
                {t.name ?? <span className="text-gray-300 italic">unnamed ({t.id})</span>}
              </div>
              <div className="flex gap-1.5 mt-0.5 items-center">
                <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${SEVERITY_COLOR[t.severity]}`}>
                  {t.severity}
                </span>
                <span className="text-[10px] text-gray-400">{t.category}</span>
                {t.hidden && <span className="text-[10px] text-red-400">hidden</span>}
              </div>
            </button>
          ))}
        </div>
        <div className="p-2 border-t border-gray-200 text-xs text-gray-400 text-center">
          {filtered.length} / {toxins.length} entries
        </div>
      </aside>

      {/* Main panel */}
      <main className="flex-1 overflow-y-auto">
        {selected ? (
          <ToxinEditor key={selected.id} toxin={selected} onUpdate={handleUpdate} />
        ) : (
          <div className="flex items-center justify-center h-full text-gray-400">
            ← Select a toxin to edit
          </div>
        )}
      </main>
    </div>
  )
}
