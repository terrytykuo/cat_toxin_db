# Cat Toxin DB — Progress Log

## 2026-08-29 (c) — git reconciliation 完成：832 檔分組 commit + 併回 main

計劃 `docs/plans/2026-08-29-git-reconciliation.md`。跨多個 session 累積、刻意不 commit 的資料檔積壓一次結清。

- **驗證閘門（read-only，全過才 commit）**：826 個 dirty JSON 全部合法（bad=0）；機密掃描兩份清單皆空（Firebase 憑證在 repo 外、`.env*` 已被 .gitignore 覆蓋）；`pipeline` unittest 6/6、`zhtw-l10n.test.mjs` 9/9、`schemas npm run check` up-to-date。
- **disk-vs-live 抽樣比對**（`data/site/firestore/en/` live 快照 vs `*_processed` canonical）：compared=489、skipped(mixed-schema)=60、mismatch=113。**逐字元查證後確認 113 筆全為空白差異**（222 處 `\n\n`→` `、3 處 `\n`→``、1 處 ` `→``），非空白差異 **0**；`name` mismatch **0**、`severity` mismatch **0**。成因：firestore-shaped 快照把段落換行壓平為單一空格，disk 保留段落結構——格式差異而非內容分歧，故放行。（`malus_spp` 無 live 快照故未進入比對。）
- **5 組 commit**（每組以 pathspec 精準 stage、`git diff --cached --stat` 覆核路徑與檔數，全程未用 `git add -A`）：
  - `154add3` — canonical 資料 **244 檔**（`data/{plants,foods}_processed/` + 兩份 verification report）
  - `e2e927b` — legacy site 快取 **228 檔**（en 57M+4A、zh-TW 72M+94A、glossary 1M）
  - `d9d94a7` — firestore-shaped 快取 **354 檔**（en 175、zh-TW 178、sync_progress 1）
  - `0b6b7a2` — 歷史 Firestore 同步腳本 **3 檔**（`admin/scripts/`，2026-06 起一直 untracked）
  - `140f1a6` — AGENTS/CLAUDE/translation 文件 **3 檔**
  - 合計 832 檔，與 reconciliation 前的 dirty 檔數一致（833 減去本計劃檔本身）。
- **併回 main**：`git merge --ff-only content-audit-2026-06-25` 成功（main 零新 commit，真正 fast-forward，無 rebase／squash／no-ff）；`main` 與分支同為 `140f1a6`。`origin/main` 5db6a2b→140f1a6，分支亦首次推上 origin。
- **`mewguard_site`**（獨立 repo）：`src/data/toxins.generated.ts` commit `0382049`（+2886/−3549）並 push origin main（f71e135→0382049）；working tree clean。
- **狀態變更**：本 repo working tree 自此 **clean**。過去多個 session 的「資料檔沿 reconciliation 慣例未 commit」聲明**到此失效**，之後每個 batch 正常 commit 資料檔即可。

## 2026-08-29 — zh-TW l10n 回寫 live Firestore + 網站快取／資料重生

詳見 `docs/CONTENT_AUDIT_RESUME.md`（single source of truth）與計劃 `docs/plans/2026-08-29-zhtw-l10n-writeback.md`。

- **盤點（read-only）**：211 個 live toxin docs → `UPDATE 184 / NO_CHANGE 18 / CREATE_L10N 1 / NO_LOCAL 8 / NEEDS_RETRANSLATION 0`（修正前為 8）。winner 規則：legacy `data/site/zh-TW/` 優先、fstore 快取次之，兩者都須通過結構閘門（zh symptoms 長度 == live EN，網站是 index 對齊）且 name 含中文。報告：`data/audits/zhtw-writeback-plan-2026-08-29.json`。
- **推送 live Firestore**：**185 筆**寫入 `toxins/{slug}.l10n['zh-TW']`（184 update + 1 create `ilex_aquifolium`）。推送前備份全部 211 筆 live l10n 至 `data/audits/backups/l10n-zhtw-live-backup-2026-08-29.json`；dry-run 0 abort、0 deletions；apply 後 **read-back 複驗 OK 185、mismatch 0**（log：`data/audits/zhtw-writeback-apply-log-2026-08-29.txt`）。
- **語意方向 spot-check**：對 54 筆審計曾改動的條目逐筆比對 live EN 與 winner zh 的 safe↔toxic／xylitol 方向，**0 筆需修**；全庫自動掃描另 3 筆命中為否定句式假陽性。
- **重寫 8 筆結構不符**（預期 3 筆，多出的 5 筆逐筆查證皆為真實資料狀況，非 winner 邏輯 bug）：`aloe_barbadensis_or_aloe_spp`、`averrhoa_carambola`、`begonia_maculata`、`candies`、`colchicum_autumnale`、`lemon_mint`（新建）、`prunus_serotina`、`vitis__implied`。
- **網站端**：快取 `data/site/firestore/zh-TW/` 從 legacy 覆蓋 **140 筆**（63 筆內容已相同、跳過）；`npm run build:toxins` 重生 200 筆 → `mewguard_site/src/data/toxins.generated.ts`，translation **pending 0**；`npm run build` 通過（427 頁）。抽驗 `mentha_x_piperita_chocolate` zh 症狀 6→5，捏造的 methylxanthine 症狀已不存在於產物。
- **狀態誠實聲明：本次只 commit 工具／單元測試／audits／docs；`data/site/zh-TW/`、`data/site/firestore/{en,zh-TW}/`、`toxins.generated.ts` 等資料檔沿用 reconciliation 慣例未 commit。** 未跑 `pipeline/dump_firestore.py`（它不 strip `l10n`，會污染 canonical）。
- **遺留 FLAG（EN 側，需人工決定）**：`sweet_pea` 的 P1 審計判定為對貓無毒但 live/disk EN 仍是 toxic；`lemon_mint` live EN `severity: safe` 與其 description「mildly toxic」自相矛盾。

## 2026-06-26 — 任務 C：截斷類雜訊安全 LLM pass 完成

詳見 `docs/CONTENT_AUDIT_RESUME.md`（single source of truth）。

- **NotebookLM 截斷/洩漏雜訊全面清理**（task wz2urpg8b，56 批 ~2.27M token）。看似 3301 個 `looks_truncated` flag，扣除 979+ 個 `symptoms.name`/`onset` 短標籤假陽性，真正候選 **1929 筆**（symptoms/treatments/chemicals 的 notes/description）。
- 先做確定性清理：43（footnote 1–2 位 + 雙數字標題）+ 437（嚴格 leaked header，尾綴 `. N.` 且 N==index+2）+ 後續 489 footnote。
- 安全 context-aware LLM 修補，四動作 **不捏造**：**911 ADD_PERIOD**（完整句補句號）、**581 STRIP_LEAK**（刪黏連下一標題/sibling 名/來源引用/footnote）、**433 TRIM_TRUNCATED**（真截斷→修剪到上一完整句，絕不補回遺失字）、**4 LEAVE**（整欄單一截斷句，無可退守 → 原樣保留，待人工 re-query 來源）。
- 套用前**獨立重驗 invariant**（ADD=orig+"."、TRIM/STRIP 必為 orig 前綴且收尾標點）：本次 0 違規、0 套錯。
- **驗證：JSON 全合法、schema enum 0 新違規、`looks_truncated` 3301→985（剩餘全為合法短標籤 + 4 LEAVE）、collision 檔（malus_spp/persea_americana 同名於兩 dir）已正確分流。**
- 完整 provenance（每欄位 orig+cleaned+dir+arr+idx，可逆）：`data/audits/content-noise-llm-pass-2026-06-26.json`。可重用工具：`pipeline/noise_*.py`、`.agent/workflows/scripts/noise-llm-safe-pass.workflow.js`。
- **狀態誠實聲明：資料檔僅寫 disk canonical，未 commit（沿用前 session reconciliation 模式），亦未碰 Firestore（任務 D）。本 session 只 commit 工具/audit/docs。** 至此內容稽核只剩任務 D（Firestore sync，需人工把關）。

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

## 2026-08-29 (b) — sweet_pea / lemon_mint 兩筆 EN FLAG 裁定與落地

- 用戶提供交叉驗證依據後裁定：`sweet_pea` toxic→**cautious**（ASPCA 對貓無毒 vs PPH 有毒 + BAPN/lathyrism 真實存在但貓病例稀少，依「有安全疑慮改 cautious」原則）；`lemon_mint` 維持 **safe**（Monarda citriodora 非真薄荷，thymol/carvacrol 無 pulegone），description 移除 pennyroyal 交叉污染說法。
- 本次獨立網路複驗：ASPCA sweet-pea 頁（L. latifolius，non-toxic to cats/dogs、horse 症狀）、Pet Poison Helpline sweet-pea 頁（毒素遍布全株含種子、neuromuscular signs）、Monarda citriodora 化學組成（thymol/p-cymene/carvacrol）——與 P1/P2 審計結論一致。
- 落地：EN disk canonical（頂層補 name/scientific_name/family/description/safetyNotes/symptoms）+ zh-TW（data/site/zh-TW，症狀逐 index 對齊）→ `ONLY_SLUGS=sweet_pea,lemon_mint sync-disk-to-firestore`（2 UPDATE）＋ `sync-zhtw-l10n-to-firestore --plan …29b.json`（2 UPDATE，Verify OK 2 / mismatch 0）→ reconcile 快取 2 檔 → `build:toxins` 200 筆 + `npm run build` 427 頁通過。
- 工具：sync-disk-to-firestore 加 `ONLY_SLUGS`；report/sync-zhtw 加 `--out`/`--backup` 參數（避免覆寫既有報告與備份）。
- 資料檔（plants_processed×2、data/site/zh-TW×2、firestore 快取、toxins.generated.ts）依 reconciliation 慣例未 commit。
