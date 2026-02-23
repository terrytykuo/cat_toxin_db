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
