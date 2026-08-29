export function hasChineseContent(name) {
  return /[一-鿿㐀-䶿]/.test(name ?? '')
}

// Mirrors buildL10nPayload() in admin/server.js, plus merge-preserve of
// live-only optional fields (the whole l10n.zh-TW map gets replaced on update,
// so anything we don't carry over is deleted).
export function buildL10nPayload(d, liveL10n = null) {
  const symptoms = (d.symptoms ?? []).map(s => {
    const entry = { name: s.name ?? '', body_system: s.body_system ?? '' }
    if (s.onset) entry.onset = s.onset
    return entry
  })
  const payload = {
    name: d.name ?? '',
    aliases: d.aliases ?? [],
    description: d.description ?? '',
    safetyNotes: d.safetyNotes ?? [],
    toxicParts: d.toxicParts ?? [],
    symptoms,
  }
  if (d.emergencyNote) payload.emergencyNote = d.emergencyNote
  if (Array.isArray(d.chemicals) && d.chemicals.length > 0) payload.chemicals = d.chemicals
  if (Array.isArray(d.treatments) && d.treatments.length > 0) payload.treatments = d.treatments
  if (liveL10n) {
    for (const k of ['emergencyNote', 'chemicals', 'treatments']) {
      if (payload[k] === undefined && liveL10n[k] !== undefined) payload[k] = liveL10n[k]
    }
  }
  return payload
}

// legacy data/site/zh-TW/ carries the audit-era fixes (P1 rewrites, glossary
// normalization) so it wins over the site translation cache; both must pass
// the structural gate (site zh symptoms are index-aligned to EN).
export function chooseWinner({ legacy, fstore, enSymptomCount }) {
  for (const [source, data] of [['legacy', legacy], ['fstore', fstore]]) {
    if (!data) continue
    if (!hasChineseContent(data.name)) continue
    if ((data.symptoms ?? []).length !== enSymptomCount) continue
    return { source, data }
  }
  return null
}

export function stableStringify(val) {
  if (Array.isArray(val)) return '[' + val.map(stableStringify).join(',') + ']'
  if (val && typeof val === 'object') {
    return '{' + Object.keys(val).sort()
      .map(k => JSON.stringify(k) + ':' + stableStringify(val[k])).join(',') + '}'
  }
  return JSON.stringify(val) ?? 'null'
}

export function payloadEquals(a, b) {
  return stableStringify(a ?? null) === stableStringify(b ?? null)
}
