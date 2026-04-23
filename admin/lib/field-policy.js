// Single source of truth for which fields live only in Firestore and must
// never be written to on-disk processed JSON.
//
// Mirrors `FIRESTORE_ONLY_FIELDS` in schemas/toxin.zod.ts. If that list
// changes, update this one (and regenerate schemas/toxin.disk.schema.json).

export const FIRESTORE_ONLY_FIELDS = Object.freeze([
  'id',
  'imageUrls',
  'imageUrl',
  'hidden',
  'curatedList',
])

export function stripFirestoreOnly(toxin) {
  const result = { ...toxin }
  for (const key of FIRESTORE_ONLY_FIELDS) {
    delete result[key]
  }
  return result
}
