# Schemas

This directory is the schema source of truth for toxin records.

## Files

- `toxin.zod.ts`: hand-written Zod schema mirroring `admin/src/types.ts`; exports `ToxinSchema` (Firestore shape) and `ToxinDiskSchema` (on-disk shape with `FIRESTORE_ONLY_FIELDS` omitted)
- `toxin.types.ts`: generated type aliases from Zod inference
- `toxin.schema.json`: generated JSON Schema Draft-07 for the Firestore shape
- `toxin.disk.schema.json`: generated JSON Schema Draft-07 for the on-disk shape (what pipeline JSON files must match)
- `build-schemas.ts`: regenerates artifacts and can check for staleness

## Commands

From repo root:

```bash
npm run build:schemas
npm run check:schemas
```

Or directly:

```bash
cd schemas
npm run build
npm run check
```

## Firestore-only Field Policy

Exported from `toxin.zod.ts`:

```ts
export const FIRESTORE_ONLY_FIELDS = ['id', 'imageUrls', 'imageUrl', 'hidden', 'curatedList']
```

These fields live on the Firestore doc only and must be stripped before writing to
`data/{plants,foods}_processed/*.json`. Validate on-disk records against `toxin.disk.schema.json`
(or `ToxinDiskSchema`), not the full `toxin.schema.json`.
