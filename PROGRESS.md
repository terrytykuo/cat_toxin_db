# Cat Toxin DB — Progress Log

## 2026-02-23 — 完成資料清洗 + D1 匯入 + API 部署

### 完成項目

#### Task 1：資料清洗
- 使用 OpenAI gpt-4o API 清洗 154 個植物 JSON 檔案
- 移除 inline 引用編號（如 `synthesis1.`）、bullet 字元、boilerplate 文字
- 輸出至 `data/plants_cleaned/`（在 .gitignore 中）
- 修正 `clean_plants.py` bug：成功清洗的檔案現在會從 failed 清單移除

#### Task 2：import_d1.py
- 建立 `import_d1.py`，從 `data/plants_cleaned/` 生成 `import.sql`
- 去重處理：2 組重複學名（`Chrysanthemum morifolium`、`Mentha spp.`）
- 產出：152 plants、12 toxic_parts、200 toxins、515 symptoms、388 treatments

#### Task 3：API 腳手架
- 建立 `api/` 專案：Hono + Drizzle ORM + Cloudflare Workers
- D1 資料庫建立：`cat-toxin-db`（WEUR region，ID: `77bfb6f0-...`）
- Drizzle schema 定義 10 個資料表，生成並套用 migration

#### Task 4：資料匯入
- 本地 D1 匯入：3183 commands 成功
- 遠端 D1 匯入：同步完成

#### Task 5：API 路由實作
- `GET /plants`（列表，支援 `q`, `severity`, `body_system`, `page`, `per_page`）
- `GET /plants/:id`（完整詳情含 toxins、symptoms、treatments）
- `GET /symptoms` / `GET /symptoms/:id/plants`
- `GET /toxins` / `GET /toxins/:id/plants`

#### Task 6：部署
- 遠端 D1 migrations 套用成功
- 部署至 Cloudflare Workers

---

### 線上資源

| 項目 | 資訊 |
|------|------|
| Live API | `https://cat-toxin-api.oldiegoodie99.workers.dev` |
| D1 Database | `cat-toxin-db`（ID: `77bfb6f0-1786-47bf-b609-ae7326a1d2e6`） |
| GitHub | `terrytykuo/cat_toxin_db`（`main` branch） |

---

### 資料統計

| 資料表 | 筆數 |
|--------|------|
| plants | 152 |
| toxins | 200 |
| symptoms | 515 |
| treatments | 388 |
| toxic_parts | 12 |

---

### 已知事項

- `data/plants_cleaned/` 和 `import.sql` 在 `.gitignore`，不進版控
- 3 個 boilerplate 偽陽性（`cercocarpus_spp`、`citrus_spp`、`dracaena_sanderiana`）為合法的事實描述，非佔位符
- 2 組重複學名在 import 時取第一筆（`pom_flowers.json`、`mint.json` 被跳過）
- `api/` 使用 wrangler 3.x 本地指令，但系統安裝了 4.x，部分指令需加 `--config` 絕對路徑

## 2026-06-03 10:46 CEST — overview/audit pass（record-only）

### Scope

- Root-level documentation overview pass focused on `cat_toxin_db`.
- No functional code, data payloads, generated site files, or admin UI files were intentionally changed.
- This note was added so future sessions do not rely only on the older 2026-02 D1/API progress entry.

### Docs/files read

- Operating docs: `AGENTS.md`, `CLAUDE.md`, `README.md`, this `PROGRESS.md`.
- Site/data sync: `docs/SITE_SYNC_HANDOFF.md`, `docs/SITE_SYNC_RUNBOOK.md`, `pipeline/sync_site_plants.py`, `data/site/sync_progress.json`.
- Content workflow: `docs/ADDING_NEW_ENTRY.md`, `docs/CONTENT_REWRITE_GUIDE.md`, `admin/translation.md`.
- Admin/schema: `admin/README.md`, `admin/package.json`, `schemas/README.md`, `schemas/toxin.zod.ts`, `schemas/glossary.zod.ts`, `docs/SCHEMA.md`.
- Root handoff note also updated: `/Users/sweetp/Workspace/MewGuard/PROGRESS.md`.

### Git state captured

- Branch: `main`.
- Staged changes: none.
- Working tree before this note was already very dirty:
  - 193 tracked modified files.
  - 27 untracked files.
- Modified buckets observed:
  - `data/site/`: 110 tracked modified files.
  - `data/plants_processed/`: 69 tracked modified files.
  - `data/foods_processed/`: 12 tracked modified files.
  - `admin/`: 1 tracked modified file (`admin/translation.md`).
  - `docs/`: 1 tracked modified file (`docs/ADDING_NEW_ENTRY.md`).
- Untracked buckets observed:
  - `data/site/`: 26 untracked site payload / zh-TW cache files.
  - `docs/`: 1 untracked doc (`docs/CONTENT_REWRITE_GUIDE.md`).

### Current architecture summary

- Firestore is the live system of record; processed JSON under `data/{plants,foods}_processed/` is the canonical disk mirror.
- `schemas/toxin.zod.ts` is the active schema source. On-disk JSON strips `FIRESTORE_ONLY_FIELDS`: `id`, `imageUrls`, `imageUrl`, `hidden`, `curatedList`.
- Admin UI is local-only React + Express. Saves update Firestore and then atomically double-write stripped/validated disk JSON; there is intentionally no disk-to-Firestore reverse sync.
- Glossary source is Firestore `glossary/main`, edited via the admin Glossary tab. It feeds site zh-TW translation.
- `pipeline/sync_site_plants.py` remains the current bridge site-sync implementation: processed plants → `data/site/en/` → optional Gemini zh-TW cache under `data/site/zh-TW/` → generated `../mewguard_site/src/data/plants.ts`.
- `data/site/sync_progress.json` records 100 selected plants, 10 current zh-TW translations, first pending index 11, first pending slug `allium_sativum`, `site_emitted: true`, last updated 2026-05-15.
- Data counts sampled: 198 processed plants, 57 processed foods, 104 site English JSON files, 108 site zh-TW JSON files, and 201 Firestore-shaped site JSON files per locale under `data/site/firestore/`.

### Consistency notes / risks

- This `PROGRESS.md` was stale before this append: it mainly described the old Cloudflare D1/API phase, while current docs/code show Firestore + admin UI + Zod schemas + site-sync bridge as the active architecture.
- `docs/SCHEMA.md` is old relational/D1 documentation; do not treat it as the current schema source. Use `schemas/toxin.zod.ts` and `schemas/README.md`.
- `AGENTS.md` / `CLAUDE.md` active-work note still says “100 English plants, first 10 translated.” The `data/site/` directory now contains more files than that milestone, so resume translation by inspecting hashes/progress instead of raw file counts.
- `admin/translation.md` has newer Taiwan zh-TW editorial rules from translation review passes and should likely remain durable guidance.
- `docs/CONTENT_REWRITE_GUIDE.md` is untracked but appears to be a meaningful workflow doc for rewriting `description` and `safetyNotes` before translation.
- Do not mass-commit current data/site changes; they mix canonical processed data edits, generated bridge payloads, Firestore-shaped mirrors, translation caches, and docs.

### Verification

- Ran `npm run check:schemas`; result: `Schema artifacts are up-to-date.`

### Recommended next step

- Classify the dirty working tree into commit-safe groups before any commit. Suggested first owner decision: track durable docs (`docs/CONTENT_REWRITE_GUIDE.md`, updated `docs/ADDING_NEW_ENTRY.md`, possibly `admin/translation.md`) separately before touching large data payload batches.

## 2026-06-03 14:52 CEST — K10 dirty working tree classification completed（record-only）

### Scope

- Root backlog K10 classified this repo's dirty working tree before any data commit.
- No data payloads, generated site cache files, or admin runtime code were intentionally edited by the classification pass.
- `npm run audit:registry` was run once for signal; it wrote generated audit outputs under `data/audits/` and `data/toxin_registry.draft.json`, and those side effects were immediately reverted.

### Root artifact

- Classification plan: `/Users/sweetp/Workspace/MewGuard/docs/product/backlog/k10-cat-toxin-db-dirty-classification.md`.

### Commit-safe grouping summary

1. Docs/guidance first: `docs/CONTENT_REWRITE_GUIDE.md`, `docs/ADDING_NEW_ENTRY.md`, `admin/translation.md`, optional this `PROGRESS.md`.
2. Admin runtime change separately after testing: `admin/server.js` now syncs translation PATCH saves to Firestore `l10n.zh-TW`.
3. Canonical processed data after validation: `data/plants_processed/*.json` and `data/foods_processed/*.json`.
4. Legacy site bridge cache only after source/progress reconciliation: `data/site/en/*.json` and `data/site/zh-TW/*.json`.
5. Firestore-to-site cache only in K11 with sibling site output: `data/site/firestore/*/*.json` plus `mewguard_site/src/data/toxins.generated.ts`.

### Verification

- `npm run check:schemas` passed: schema artifacts are up-to-date.
- Parsed 217 dirty/untracked `data/**/*.json` files; 0 JSON parse errors.

## 2026-06-03 15:01 CEST — K11 Firestore-to-site cache regenerated

### Scope

- Root backlog K11 reconciled this repo's Firestore-to-site generated cache/progress with sibling `../mewguard_site/src/data/toxins.generated.ts`.
- Generated/cache files were updated only by running the existing site generator; no generated toxin JSON was hand-edited.

### Command run from sibling site repo

```bash
cd ../mewguard_site
npm run build:toxins
```

Result:

```text
Wrote 200 toxins (157 plants, 43 foods, 199 with images) to /Users/sweetp/Workspace/MewGuard/mewguard_site/src/data/toxins.generated.ts
Progress: /Users/sweetp/Workspace/MewGuard/cat_toxin_db/data/site/firestore/sync_progress.json
```

### Cache/progress summary

- `data/site/firestore/sync_progress.json` updated to `2026-06-03T13:00:22Z`.
- Firestore source counts: 211 total docs (163 plants, 48 foods).
- Selected/generated visible site payload: 200 total (157 plants, 43 foods).
- `dracaena_marginata_or_dracaena_spp` dropped out of selected slugs during the live Firestore generator run.
- Usable zh-TW translation cache count is 199/200; `phalaenopsis-orchid` falls back to English until translated.

### Verification

- Reconstructed site entries from current `data/site/firestore/` working cache/progress matched sibling `mewguard_site/src/data/toxins.generated.ts` exactly.
- `npm run build` in sibling `mewguard_site` succeeded and built 427 pages.
- Root report: `/Users/sweetp/Workspace/MewGuard/docs/product/backlog/k11-generated-site-toxin-reconciliation.md`.
