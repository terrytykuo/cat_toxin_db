# Admin UI

A local-only React + Express app for editing toxin records in Firestore.

> **Security boundary:** the Express server binds to `127.0.0.1` and the Vite dev server binds to `127.0.0.1`. Neither is exposed to the network. Do **not** deploy this directory to any public host.

## Setup

1. Install dependencies:
   ```bash
   cd admin
   npm install
   ```

2. Create `admin/.env.local` from the example:
   ```bash
   cp .env.example .env.local
   ```
   Fill in:
   - `ADMIN_SECRET` — any random string (`openssl rand -hex 32`)
   - `FIREBASE_ADMIN_KEY_PATH` — path to a Firebase Admin SDK service-account JSON

3. Create `../.env.local` at the repo root from `../.env.example`:
   - `FIREBASE_STORAGE_BUCKET` — your Firebase Storage bucket name

## Run

```bash
npm run dev
```

This starts:
- Express API on `http://127.0.0.1:3001`
- Vite dev server on `http://127.0.0.1:5173`

Vite proxies `/api/*` to the Express server and injects the `x-admin-secret` header. The browser never sees the secret.

## Architecture

- `server.js` — Express endpoints for reading/updating `toxins/*` in Firestore and managing images in Firebase Storage.
- `src/` — React UI. Talks to `/api/*` via same-origin fetch (Vite proxy).
- Auth: single `x-admin-secret` header, validated server-side. Intended only as a second layer behind the 127.0.0.1 bind.

## Field policy

The server delegates field validation to `schemas/toxin.zod.ts` at the repo root. `FIRESTORE_ONLY_FIELDS` (`id`, `imageUrls`, `imageUrl`, `hidden`, `curatedList`) live only in Firestore, never in processed JSON on disk. That split is enforced by the double-write pipeline.

## Double-write

`PATCH /api/toxins/:id`:

1. Reads the current Firestore doc.
2. Applies the patch in memory, strips `FIRESTORE_ONLY_FIELDS`.
3. Validates the stripped payload against `schemas/toxin.disk.schema.json`.
4. If validation fails → responds 422, writes **nothing** (Firestore untouched).
5. If valid → Firestore `update(patch)`, then atomic write (tmp + rename) of the full disk payload to `data/plants_processed/<slug>.json` (or `foods_processed/` for `category === 'food'`).
6. If the slug changed (scientific_name or category edited), the old file is removed.

If the Firestore update succeeds but the disk write fails, the server logs loudly and returns 500 — the operator needs to reconcile. The reverse (disk → Firestore) never happens by design.

## Files not committed

- `.env.local` — gitignored. Holds `ADMIN_SECRET` and the service-account path.
- Service-account JSON — keep outside the repo, reference by absolute path.
