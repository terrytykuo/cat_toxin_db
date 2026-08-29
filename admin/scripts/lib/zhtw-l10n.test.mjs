import test from 'node:test'
import assert from 'node:assert/strict'
import { buildL10nPayload, chooseWinner, payloadEquals, hasChineseContent } from './zhtw-l10n.mjs'

test('hasChineseContent', () => {
  assert.equal(hasChineseContent('薄荷'), true)
  assert.equal(hasChineseContent('Peppermint'), false)
  assert.equal(hasChineseContent(undefined), false)
})

test('buildL10nPayload strips metadata and keeps only l10n fields', () => {
  const src = {
    slug: 'x', category: 'plant', source_hash: 'abc', translated_at: 't',
    gemini_model: 'g', manual_override: true,
    name: '薄荷', aliases: ['A'], description: 'D', safetyNotes: ['S'],
    toxicParts: ['葉'], symptoms: [{ name: '嘔吐', body_system: '腸胃道', onset: '快', extra: 'drop-me' }],
  }
  const p = buildL10nPayload(src)
  assert.deepEqual(Object.keys(p).sort(),
    ['aliases', 'description', 'name', 'safetyNotes', 'symptoms', 'toxicParts'])
  assert.deepEqual(p.symptoms, [{ name: '嘔吐', body_system: '腸胃道', onset: '快' }])
})

test('buildL10nPayload omits empty onset and empty optional arrays', () => {
  const p = buildL10nPayload({ name: '貓', symptoms: [{ name: '嘔吐', body_system: '腸胃道' }], chemicals: [] })
  assert.equal('onset' in p.symptoms[0], false)
  assert.equal('chemicals' in p, false)
})

test('buildL10nPayload merge-preserves live-only optional fields', () => {
  const live = { emergencyNote: '緊急', chemicals: ['皂苷'], treatments: [{ name: 'T' }] }
  const p = buildL10nPayload({ name: '貓', symptoms: [] }, live)
  assert.equal(p.emergencyNote, '緊急')
  assert.deepEqual(p.chemicals, ['皂苷'])
  assert.deepEqual(p.treatments, [{ name: 'T' }])
})

test('buildL10nPayload local optional field wins over live', () => {
  const p = buildL10nPayload({ name: '貓', symptoms: [], emergencyNote: '本地' }, { emergencyNote: 'live' })
  assert.equal(p.emergencyNote, '本地')
})

test('chooseWinner prefers legacy when it passes the structural gate', () => {
  const legacy = { name: '薄荷', symptoms: [{}, {}] }
  const fstore = { name: '薄荷舊', symptoms: [{}, {}, {}] }
  const w = chooseWinner({ legacy, fstore, enSymptomCount: 2 })
  assert.equal(w.source, 'legacy')
})

test('chooseWinner falls back to fstore when legacy fails the gate or is missing', () => {
  const fstore = { name: '龍葵', symptoms: [{}, {}, {}, {}] }
  assert.equal(chooseWinner({ legacy: { name: '龍', symptoms: [{}] }, fstore, enSymptomCount: 4 }).source, 'fstore')
  assert.equal(chooseWinner({ legacy: null, fstore, enSymptomCount: 4 }).source, 'fstore')
})

test('chooseWinner rejects non-Chinese names and returns null when nothing passes', () => {
  assert.equal(chooseWinner({ legacy: { name: 'Mint', symptoms: [{}] }, fstore: null, enSymptomCount: 1 }), null)
  assert.equal(chooseWinner({ legacy: { name: '薄荷', symptoms: [{}] }, fstore: null, enSymptomCount: 2 }), null)
})

test('payloadEquals is key-order insensitive', () => {
  assert.equal(payloadEquals({ a: 1, b: [1, 2] }, { b: [1, 2], a: 1 }), true)
  assert.equal(payloadEquals({ a: 1 }, { a: 2 }), false)
  assert.equal(payloadEquals(null, undefined), true)
})
