# Cat Toxin DB — Progress Log

## 2026-06-26 — 內容驗證 P2 refute 補跑 + round-2/3 事實修正

詳見 `docs/CONTENT_AUDIT_RESUME.md`（single source of truth）。

- **round-3：11 筆 NEEDS_REVIEW 全數修正**（task wig1q79dc）：症狀交叉污染清理（mentha_chocolate methylxanthine、nightshade 馬科溶血/呼吸麻痺等）、isToxic 一致性（peaches/pretzels/raw_meat false→true）、raw_eggs severity toxic→cautious（高估降級）。0 SCHEMA enum 違規。至此 **P2 149 筆（16 FAIL + 11 NEEDS_REVIEW）全數修正**落 disk canonical。
- caveat：部分 firestore/zh-TW 快取仍含舊 fabricated 內容，待任務 D Firestore sync 從 canonical 重生。

- **任務 B：P2 refute 補跑 54/54 完成**（web-grounded 對抗式查證，refute-by-default）。對抗式事實查證覆蓋率達 **200/200（100%）**。pending 歸零。結果 `data/audits/verify-localize-2026-06-26-p2-refute-round2.json`。
- **新發現 16 FAIL → 全數修正（16/16）**，外科式 Edit 寫入 disk canonical（`*_processed` + 部分 zh-TW/firestore 快取）：
  - severity 方向修正 7 筆：peony、tradescantia_spathacea（標 safe 實則有毒 → cautious，漏報補正）；zephyranthes_drummondii（→safe）、milk_and_dairy、persimmons、pine、pistachios、peanuts、potato_chips（標 toxic 實則無毒 → cautious，假警報降級）；pudding 修 isToxic/toxicityLevel 一致性。
  - 內容/化合物/症狀修正：nandina（family Rosaceae→Berberidaceae、prunasin→nandinin）、mentha（移除 pennyroyal 交叉污染的致命肝毒）、poppy（瞳孔 miosis/mydriasis 矛盾）、ragwort（PA 化合物歸屬）、raw_dough（toxicParts/ADH 措辭）等。
  - glossary key 對齊 2 處：peony toxic_part Leaves→Leaf、potato_chips body_system Hematologic→Hematological。
  - schema 驗證：本批 16 筆 **0 SCHEMA enum 違規**（資料集整體 completeness shape 不匹配 170/198 屬 K11/K16 schema 形狀 reconciliation，非本批引入）。
- **11 筆 NEEDS_REVIEW** 留待人工/補查（清單見手冊）。
- **狀態誠實聲明：以上全部僅寫 disk canonical，尚未執行 Firestore sync（任務 D）。** `firestore/en` 快取對部分翻轉條目仍是舊值；sync 腳本讀 `*_processed` 為來源，不受快取舊值影響，任務 D 執行後會 reconcile。

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

## 2026-06-04 00:58 CEST — S-Z description simplification + zh-TW localization

### Scope

- Processed toxin entries whose JSON `name` starts with S, T, U, V, W, X, Y, or Z.
- Targeting was by `name`, not filename. Malformed/partial records without the complete expected processed schema were not repaired as part of this pass.
- Live Firestore was **not** updated; only local disk data and local cache/snapshot files were changed.

### Data layers updated

- Canonical processed files updated: 41 entries in `data/plants_processed/` and `data/foods_processed/`.
- Legacy site bridge cache updated: 11 `data/site/en/*.json` files and 11 `data/site/zh-TW/*.json` files.
- Firestore-shaped local cache updated: 39 `data/site/firestore/en/*.json` files and 39 `data/site/firestore/zh-TW/*.json` files.

### Generation / translation notes

- Used the `mewguard-toxin-data-localization` workflow and Taiwan zh-TW content style.
- Gemini CLI was called with `--model gemini-2.5-pro` to avoid relying on a possible Flash default.
- Batch output was persisted to `/tmp/mewguard_stuvwxyz_generated.partial.json`; the initial batch process hung on the final `walnuts.json` entry and was intentionally killed (`exit code 143`).
- `/tmp/mewguard_stuvwxyz_finish.py` resumed from the partial output and completed the final entry.
- zh-TW cache entries were marked `manual_override: true` and `gemini_model: "gemini-2.5-pro"`.

### Verification

- `schemas`: `npm run check` → `Schema artifacts are up-to-date.`
- JSON syntax check over processed/site/firestore cache directories → `json-ok 905`.
- Target processed schema validation → `target processed schema-ok: 41`.
- zh-TW coverage check → `zh-description-coverage-ok {'data/site/en': 11, 'data/site/firestore/en': 39}`.

### Notes for next agent

- Do not treat `data/site/firestore/*` as proof of live Firestore updates; these are local snapshots/cache unless a Firestore upload script runs successfully.
- Commit this alphabet batch carefully: canonical processed files, legacy site cache, and Firestore-shaped cache may belong in separate commit groups depending on the current release/reconciliation plan.

## 2026-06-04 01:28 CEST — S-Z localization synced to live Firestore for Admin UI review

### Scope

- Live Firestore was updated after Terry said the S-Z pass would be checked in the Admin UI.
- Used a temporary targeted Node script at `/tmp/mewguard_sync_sz_to_firestore.mjs` rather than the broad `admin/scripts/sync-disk-to-firestore.mjs`, because this pass needed only S-Z entries and also needed to write `l10n.zh-TW`.

### Firestore updates

- Dry-run fetched 211 live `toxins` docs and resolved all S-Z targets.
- Applied updates to 40 unique live docs:
  - English `description` from the localized/simplified local source.
  - Firestore `l10n.zh-TW` payload from the zh-TW cache.
- The canonical S-Z target count is 41, but the live unique doc count is 40 because `Silver Leaf Philodendron` and `Satin Pothos` both resolve to `eg_satin_pothos`.
- No missing live docs were reported.

### Admin UI visibility

- The Admin UI main toxin list reads live Firestore via `GET /api/toxins`, so the updated English descriptions should now be visible there.
- The Admin UI translation endpoint reads `data/site/zh-TW/{slug}.json`, so the sync also wrote/updated 40 files by live Firestore doc ID with `manual_override: true`.

### Verification

- Firestore read-back verification: `Verify complete. OK: 40; missing live: 0; problems: 0`.
- JSON syntax check over `data/site/zh-TW`, `data/site/firestore/zh-TW`, and `data/site/firestore/en`: `json-ok 581`.
- Admin UI build from `admin/`: `npm run build` completed successfully.

## 2026-06-25 — 對抗式內容驗證 + 中文化（P1 完成；P2 進行中）

### 背景

新增可重複使用的 goal 工作流 `.agent/workflows/verify-and-localize-toxins.md`：以 Firestore live 快取（200 筆 EN / 201 zh-TW）為權威範圍，做四面向審查（英文事實正確性、英文品質結構、中文忠實度、原始雜訊），對抗式網路查證（ASPCA / Pet Poison Helpline / Merck Vet Manual，refute-by-default），audit-first + 人工閘門 + disk→Firestore sync。

依 zh-TW provenance（`gemini_model`）分桶：P1 機器來源 44 筆（深度審查）、P2 人工審過 149 筆（快篩）、1 筆孤兒 zh-TW（`dracaena_marginata_or_dracaena_spp`，待 reconcile）。

### P1 對抗式審查（44 筆，已完成）

- 報告：`data/audits/verify-localize-2026-06-25-p1.md` (+ `.json`)。
- 結果：英文品質 36 PASS / 8 需修訂 / 0 FAIL；**英文事實 13 FAIL（含 8 筆 safe↔toxic 矛盾）+ 3 NEEDS_REVIEW**；中文 10 PASS / 34 需修訂；原始雜訊 37/44。
- 對抗式查證抓到純內部審查會放行的核心錯誤：schefflera 標 safe 但 ASPCA 列 toxic、unripened_pineapples 誤植氰化物中毒（實為 bromelain）、agapanthus 捏造草酸鈣機制（實為皂苷）、chlorophytum 捏造致幻成分、brunfelsia 低估致死性 + 機制錯。

### 已套用的修正（全部僅寫 disk，**未碰 Firestore**）

1. **13 筆事實 rewrite**（`data/{plants,foods}_processed/` + `data/site/zh-TW/`）：
   - severity 修正：schefflera safe→cautious、sugar toxic→cautious、sunflower_seeds cautious→safe、nymphaeaceae/tradescantia_zebrina safe→cautious。
   - 機制/化合物/科別/症狀更正、移除捏造項，依報告權威來源。模糊項由 agent 列入 `left_for_human` 未動。
   - 已知遺留：`sweet_pea` 的 `*_processed` 缺 severity/isToxic 欄位（資料模型缺漏）；schefflera 學名拼字 `actinphylla`→應 `actinophylla`（牽動 slug，未動）。
2. **glossary 正規化**（`pipeline/normalize_zh_glossary.py`）：257 處 body_system 術語對齊 glossary canonical（消化系統→腸胃道、心血管系統→心血管、ASCII 洩漏→中文等），76 檔；`ilex_spp` 的 `皮膚／口腔刺激` 標記待人工。
3. **NotebookLM 雜訊清理**（`pipeline/clean_notebooklm_noise.py`，保守版）：921 欄位/212 檔，僅移除明確型態（`[Conversation History]`、雙數字洩漏標題、`....`、行尾黏字腳註、`in cats:` 前綴）。**注意**：初版正則會誤刪腳註後的合法句子（dry-run 抓到 raisins 砍 496 字元），已收緊為雙數字簽章才移除。

### 待辦

- **P2 對抗式審查（149 筆）**：先前一次背景執行因 `args` 未生效實際重跑了 P1，且 refute 階段撞 session 額度全失敗 → P2 尚未真正審查，需重跑（已改腳本預設 SLUGS 為 P2）。
- **截斷類雜訊**：~3405 欄位疑似來源截斷（句子中斷），保守腳本未動，需 context-aware LLM pass 修補。
- **Firestore sync（§8）**：尚未執行，等使用者 review 全部 disk diff 後再進行。zh-TW 既有條目的 Firestore 回寫仍有缺口（`upload-local-translations.mjs` 只處理本地新增檔；既有條目需 admin UI PATCH 或擴充 sync 腳本）。
- slug 命名空間 reconciliation（disk 253 vs live 200，重複別名）屬 K11/K16，未在本次處理。

### 跨 session 續跑

- **單一事實來源：`docs/CONTENT_AUDIT_RESUME.md`**（進度快照、可重用腳本、各待辦的確切指令與 slug 清單、增量更新協定）。
- 可重用腳本已進 repo：`.agent/workflows/scripts/{audit-4dim,refute-remaining,factual-fix}.workflow.js`、`pipeline/{normalize_zh_glossary,clean_notebooklm_noise}.py`。
- 後續每完成一小份 batch，先更新該手冊與本檔，再續跑（token 昂貴、會反覆撞 session 額度）。

更新 2026-06-25(b)：
- P2 15 筆事實修正完成（disk）；摘要 `data/audits/p2-factual-fix-2026-06-25.json`。重點：gum/jelly/hummingbird_mint/lemon_mint/capsicum 等 xylitol/cross-contamination 假警報已降級。
- **資料缺口已補（任務 A2）**：原 42 個 `*_processed` 缺 `severity` 欄位 → backfill 31 筆 live（firestore→processed）+ hummingbird_mint/lemon_mint→safe + unripened_pineapples→cautious；255 檔驗證 0 違規。剩 9 筆 disk-only dup（無 firestore 對應、非 live）屬 K11/K16。
- 對抗式覆蓋率 139/200；P2 refute 仍剩 54 待補（手冊任務 B）。
