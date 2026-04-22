# cat_toxin_db

Single-repo data pipeline for cat toxin data.

## Repository Structure

```text
cat_toxin_db/
├── admin/                # Admin UI + API server (Firestore + JSON double-write)
├── pipeline/             # Collection / processing / verification scripts
├── schemas/              # Zod schema source + generated JSON Schema/types
├── data/
│   ├── plants/           # Raw plant collection files
│   ├── plants_processed/ # Normalized processed plant JSON
│   ├── foods/            # Raw food collection files
│   └── foods_processed/  # Normalized processed food JSON
├── docs/
└── .env.example
```

## Environment Setup

Create root env file:

```bash
cp .env.example .env.local
```

Create admin env file:

```bash
cp admin/.env.example admin/.env.local
```

Required keys:

- Root `.env.local`:
  - `FIREBASE_STORAGE_BUCKET`
- `admin/.env.local`:
  - `ADMIN_SECRET`
  - `FIREBASE_ADMIN_KEY_PATH`
  - `VITE_ADMIN_SECRET`

## Run Admin UI

```bash
cd admin
npm install
npm run dev
```

This starts:

- Express API server at `http://localhost:3001`
- Vite UI at `http://localhost:5173`

## Schema Commands

```bash
npm run build:schemas
npm run check:schemas
```

## Pipeline Commands

```bash
python3 pipeline/process_plants.py
python3 pipeline/process_foods.py
python3 pipeline/verify_plants.py
python3 pipeline/verify_foods.py
python3 pipeline/dump_firestore.py
```
