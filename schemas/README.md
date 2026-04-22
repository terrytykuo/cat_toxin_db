# Schemas

This directory is the schema source of truth for toxin records.

## Files

- `toxin.zod.ts`: hand-written Zod schema mirroring `admin/src/types.ts`
- `toxin.types.ts`: generated type aliases from Zod inference
- `toxin.schema.json`: generated JSON Schema Draft-07
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

`FIRESTORE_ONLY_FIELDS = ['id', 'imageUrls', 'imageUrl', 'hidden', 'curatedList']`
