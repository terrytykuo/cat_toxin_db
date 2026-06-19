import { useEffect, useState, type FormEvent } from 'react'
import { adminFetch } from './api'

interface Coupon {
  code: string
  campaign: string | null
  grantDays: number | null
  maxRedemptions: number | null
  redemptionCount: number
  active: boolean
  note: string
  validUntil: string | null
  createdAt: string | null
}

// Common Pro durations; "custom" lets you type any day count.
const DURATION_PRESETS = [7, 14, 30, 90, 180, 365]

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString()
}

export default function CouponsView() {
  const [coupons, setCoupons] = useState<Coupon[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busyCode, setBusyCode] = useState<string | null>(null)

  // Create form
  const [code, setCode] = useState('')
  const [grantDays, setGrantDays] = useState(30)
  const [customDays, setCustomDays] = useState(false)
  const [maxRedemptions, setMaxRedemptions] = useState(150)
  const [campaign, setCampaign] = useState('')
  const [validUntil, setValidUntil] = useState('')
  const [note, setNote] = useState('')
  const [creating, setCreating] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const r = await adminFetch('/api/coupons')
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'Failed to load coupons')
      setCoupons(await r.json())
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  async function createCoupon(e: FormEvent) {
    e.preventDefault()
    setCreating(true)
    setFormError(null)
    try {
      const r = await adminFetch('/api/coupons', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: code.trim().toUpperCase(),
          grantDays,
          maxRedemptions,
          campaign: campaign.trim() || undefined,
          validUntil: validUntil || undefined,
          note: note.trim() || undefined,
        }),
      })
      const data = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(data.error || 'Failed to create coupon')
      setCode('')
      setCampaign('')
      setNote('')
      setValidUntil('')
      await load()
    } catch (e) {
      setFormError((e as Error).message)
    } finally {
      setCreating(false)
    }
  }

  async function patchCoupon(c: Coupon, body: Record<string, unknown>) {
    setBusyCode(c.code)
    try {
      const r = await adminFetch(`/api/coupons/${encodeURIComponent(c.code)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!r.ok) {
        alert((await r.json().catch(() => ({}))).error || 'Update failed')
        return
      }
      await load()
    } finally {
      setBusyCode(null)
    }
  }

  async function removeCoupon(c: Coupon) {
    if (!confirm(`Delete coupon ${c.code}? This cannot be undone.`)) return
    setBusyCode(c.code)
    try {
      const r = await adminFetch(`/api/coupons/${encodeURIComponent(c.code)}`, { method: 'DELETE' })
      if (!r.ok) {
        alert((await r.json().catch(() => ({}))).error || 'Delete failed')
        return
      }
      await load()
    } finally {
      setBusyCode(null)
    }
  }

  return (
    <div className="flex-1 overflow-auto p-4">
      <div className="max-w-4xl mx-auto flex flex-col gap-6">
        {/* Create form */}
        <form
          onSubmit={createCoupon}
          className="border border-gray-200 rounded-lg p-4 flex flex-col gap-3"
        >
          <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
            New coupon
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-xs text-gray-500">Code</span>
              <input
                value={code}
                onChange={e => setCode(e.target.value.toUpperCase())}
                placeholder="MEW30"
                className="border border-gray-300 rounded px-2 py-1 font-mono uppercase"
                required
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-xs text-gray-500">Campaign (optional)</span>
              <input
                value={campaign}
                onChange={e => setCampaign(e.target.value)}
                placeholder="early-2026q3"
                className="border border-gray-300 rounded px-2 py-1"
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-xs text-gray-500">Duration granted (Pro days)</span>
              <div className="flex gap-2 items-center">
                {customDays ? (
                  <input
                    type="number"
                    min={1}
                    max={3650}
                    value={grantDays}
                    onChange={e => setGrantDays(Number(e.target.value))}
                    className="border border-gray-300 rounded px-2 py-1 w-24"
                  />
                ) : (
                  <select
                    value={grantDays}
                    onChange={e => setGrantDays(Number(e.target.value))}
                    className="border border-gray-300 rounded px-2 py-1"
                  >
                    {DURATION_PRESETS.map(d => (
                      <option key={d} value={d}>
                        {d} days
                      </option>
                    ))}
                  </select>
                )}
                <button
                  type="button"
                  onClick={() => setCustomDays(v => !v)}
                  className="text-xs text-blue-500 hover:underline"
                >
                  {customDays ? 'presets' : 'custom'}
                </button>
              </div>
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-xs text-gray-500">Max redemptions (issue limit)</span>
              <input
                type="number"
                min={1}
                value={maxRedemptions}
                onChange={e => setMaxRedemptions(Number(e.target.value))}
                className="border border-gray-300 rounded px-2 py-1 w-32"
                required
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-xs text-gray-500">Redeemable until (optional)</span>
              <input
                type="date"
                value={validUntil}
                onChange={e => setValidUntil(e.target.value)}
                className="border border-gray-300 rounded px-2 py-1"
              />
            </label>

            <label className="flex flex-col gap-1">
              <span className="text-xs text-gray-500">Note (optional)</span>
              <input
                value={note}
                onChange={e => setNote(e.target.value)}
                placeholder="Early-user thank-you batch"
                className="border border-gray-300 rounded px-2 py-1"
              />
            </label>
          </div>

          {formError && <div className="text-xs text-red-500">{formError}</div>}

          <div>
            <button
              type="submit"
              disabled={creating}
              className="px-4 py-1.5 bg-blue-500 text-white text-xs font-medium rounded hover:bg-blue-600 disabled:opacity-50"
            >
              {creating ? 'Creating…' : 'Create coupon'}
            </button>
          </div>
        </form>

        {/* List */}
        {loading ? (
          <div className="text-gray-400 text-xs">Loading…</div>
        ) : error ? (
          <div className="text-red-500 text-xs">{error}</div>
        ) : coupons.length === 0 ? (
          <div className="text-gray-400 text-xs">No coupons yet.</div>
        ) : (
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="text-left text-gray-400 border-b border-gray-200">
                <th className="py-2 pr-3 font-medium">Code</th>
                <th className="py-2 pr-3 font-medium">Campaign</th>
                <th className="py-2 pr-3 font-medium">Duration</th>
                <th className="py-2 pr-3 font-medium">Activated</th>
                <th className="py-2 pr-3 font-medium">Until</th>
                <th className="py-2 pr-3 font-medium">Status</th>
                <th className="py-2 pr-3 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {coupons.map(c => {
                const max = c.maxRedemptions ?? 0
                const used = c.redemptionCount ?? 0
                const exhausted = max > 0 && used >= max
                const pct = max > 0 ? Math.min(100, Math.round((used / max) * 100)) : 0
                return (
                  <tr key={c.code} className="border-b border-gray-100 align-middle">
                    <td className="py-2 pr-3 font-mono font-semibold">{c.code}</td>
                    <td className="py-2 pr-3 text-gray-500">{c.campaign || '—'}</td>
                    <td className="py-2 pr-3">{c.grantDays ?? '—'} days</td>
                    <td className="py-2 pr-3">
                      <div className="flex items-center gap-2">
                        <span className={exhausted ? 'text-red-500 font-medium' : ''}>
                          {used} / {max}
                        </span>
                        <span className="inline-block w-16 h-1.5 bg-gray-100 rounded overflow-hidden">
                          <span
                            className={`block h-full ${exhausted ? 'bg-red-400' : 'bg-blue-400'}`}
                            style={{ width: `${pct}%` }}
                          />
                        </span>
                      </div>
                    </td>
                    <td className="py-2 pr-3 text-gray-500">{formatDate(c.validUntil)}</td>
                    <td className="py-2 pr-3">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-medium ${
                          c.active
                            ? 'bg-green-100 text-green-700'
                            : 'bg-gray-100 text-gray-500'
                        }`}
                      >
                        {c.active ? 'active' : 'inactive'}
                      </span>
                    </td>
                    <td className="py-2 pr-3">
                      <div className="flex gap-3 justify-end">
                        <button
                          onClick={() => patchCoupon(c, { active: !c.active })}
                          disabled={busyCode === c.code}
                          className="text-blue-500 hover:underline disabled:opacity-50"
                        >
                          {c.active ? 'Deactivate' : 'Activate'}
                        </button>
                        {used === 0 && (
                          <button
                            onClick={() => removeCoupon(c)}
                            disabled={busyCode === c.code}
                            className="text-red-500 hover:underline disabled:opacity-50"
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
