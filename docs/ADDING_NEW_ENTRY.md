# 新增一筆資料的完整路徑

從 NotebookLM 取回答案,到這筆資料出現在 production Firestore,中間經過的每一步、每個腳本、每個檔案落點。

植物(plant)與食物(food)用同一條鏈路,只差腳本與資料夾命名。下面以植物為主,食物差異用 ⚙️ 標註。

---

## 前置檢查

- `.env.local`(repo 根)有 `FIREBASE_STORAGE_BUCKET`
- `admin/.env.local` 有 `ADMIN_SECRET` 與 `FIREBASE_ADMIN_KEY_PATH`(Firebase service account JSON 的絕對路徑)
- NotebookLM skill 已登入:`python3 scripts/run.py auth_manager.py status`(在 `/Users/sweetp/.gemini/antigravity/skills/notebooklm`)
- `pip install -r requirements.txt`(含 `jsonschema`)
- `schemas/` 已建置:`npm run check:schemas` 應為 exit 0

---

## 步驟

### 1. 登錄條目

編輯 [data/plants_list.md](../data/plants_list.md) 加一行(或 ⚙️ 食物:[data/food_list.json](../data/food_list.json))。格式遵照檔案既有條目。

### 2. Collect — NotebookLM → raw JSON

```bash
python3 pipeline/batch_collect.py
# ⚙️ 食物:python3 pipeline/batch_collect_food.py
```

- 讀清單 vs `data/collection_status.md` + `data/completed_log.txt`,挑出未完成的條目(預設一輪 4–6 筆)
- 透過 `subprocess` 呼叫 NotebookLM skill `ask_question.py`,逐題問完
- 寫出 `data/plants/<slug>.json`(⚙️ `data/foods/<slug>.json`)— **原始稿**,保留引用編號與 bullet 字元
- 自動更新 `collection_status*.md`、`completed_log*.txt`

對帳:`python3 pipeline/sync_status.py`(⚙️ `sync_status_food.py`)會比對清單、raw 檔案與狀態檔。

### 3. Process — raw → canonical JSON(含 schema 驗證)

```bash
python3 pipeline/process_plants.py
# ⚙️ 食物:python3 pipeline/process_foods.py
```

處理內容:

- 去引用編號(`[1]`、`synthesis1.`)、bullet 字元、header 殘漬(如 `"Symptom name"`)
- Normalize `severity` 為 `mild` / `moderate` / `severe` / `fatal`;遇到 `"Mild to Severe"` 取最高
- 合併 toxic_parts 別名(`leaves` → `leaf` 等)
- 用 [schemas/toxin.disk.schema.json](../schemas/toxin.disk.schema.json) 跑 `jsonschema` Draft7 驗證
- 通過 → atomic write(`.tmp` + rename)到 `data/plants_processed/<slug>.json`(⚙️ `data/foods_processed/`)
- **不通過 → 不寫檔**,印出錯誤,繼續下一筆;結尾給 `N passed, M failed`

遇到 `M > 0`:回去看 raw JSON 判斷是**資料問題**(補問 NotebookLM)還是**schema 問題**(更新 [schemas/toxin.zod.ts](../schemas/toxin.zod.ts) → `npm run build:schemas`)。

### 4. Audit(選用,但建議)

```bash
python3 pipeline/verify_plants.py
# ⚙️ 食物:python3 pipeline/verify_foods.py
```

輸出 `data/verification_report.json`(⚙️ `verification_report_food.json`)。做欄位完整性 / 值合理性 / 交叉對照的 3-tier 檢查。

### 5. Seed → Firestore(人工,透過 admin UI)

啟動兩個 process:

```bash
cd admin
npm install            # 首次才需要
node server.js         # Express + Firebase Admin,http://127.0.0.1:3001
npm run dev            # Vite UI,http://127.0.0.1:5173
```

在 UI:

1. 找到新條目(UI 會從 Firestore 讀取;新條目這時還不存在於 Firestore — 需先透過既有「新增」流程或直接手動建檔)
2. 上傳圖片 → `POST /api/toxins/:id/image` → sharp 壓縮成 800px JPEG → 上傳 GCS → `imageUrls` arrayUnion
3. 微調文案 → 按儲存 → `PATCH /api/toxins/:id` 觸發**雙寫**

雙寫流程([admin/server.js:150](../admin/server.js#L150)):

```
sanitize(patch)              去除 "Not specified" 佔位符
merge = { prev, patch }      和 Firestore 現狀合併
diskPayload = stripFirestoreOnly(merge)
                             拔掉 id / imageUrls / imageUrl / hidden / curatedList
validateDiskPayload(...)     Ajv 驗 toxin.disk.schema.json
                             失敗 → 422,不寫 Firestore 也不寫磁碟
docRef.update(patch)         寫 Firestore
atomicWriteJson(newPath, diskPayload)
                             原子寫 data/plants_processed/<slug>.json
                             若失敗 → 500 + 醒目 log,Firestore 已改,人工對齊
```

鐵律:`FIRESTORE_ONLY_FIELDS` 絕不出現在磁碟 JSON;**沒有**反向同步(磁碟 → Firestore)。

### 6. Commit 磁碟變動

```bash
git diff data/plants_processed/
# 或 data/foods_processed/
```

檢查:

- 只動到預期欄位
- 沒有 blacklist 欄位(`id`、`imageUrls`、`imageUrl`、`hidden`、`curatedList`)混進來
- `git add` + commit

---

## 定期對帳(與新增無關,但值得做)

懷疑 admin UI 與磁碟失準,或多人編輯導致 drift 時:

```bash
FIREBASE_ADMIN_KEY_PATH=/abs/path/to/service-account.json \
  python3 pipeline/dump_firestore.py
```

唯讀讀 Firestore `toxins` collection → strip → validate → atomic 覆寫磁碟。跑完 `git diff` 空就是同步。

---

## 常見卡點

| 症狀 | 原因 | 處理 |
|---|---|---|
| Step 3 `M failed` | raw 缺欄位或值超出 enum | 看 raw,決定補問 NotebookLM 或放寬 schema |
| Step 5 UI 按儲存得 422 | `diskPayload` 驗證未過(Firestore 既有資料就不合 schema) | 先跑 `dump_firestore.py` 看是哪個欄位,修 raw 或 schema |
| Step 5 儲存 500 且訊息含 "disk write failed" | 磁碟寫失敗但 Firestore 已寫入 | 看 server.js console log 的檔案路徑,手動跑 `dump_firestore.py` 對齊 |
| Schema 改了但產物沒更新 | 忘記 build | `npm run build:schemas`,commit 產物 |

---

## 相關文件

- [docs/DATA_COLLECTION_PIPELINE.md](DATA_COLLECTION_PIPELINE.md) — NotebookLM 端的問卷協定細節
- [docs/CONTENT_REWRITE_GUIDE.md](CONTENT_REWRITE_GUIDE.md) — site payload 出爐後、翻譯前的「高中程度」改寫 prompt
- [docs/SITE_SYNC_RUNBOOK.md](SITE_SYNC_RUNBOOK.md) — sync_site_plants.py 與 Gemini 翻譯流程
- [docs/SCHEMA.md](SCHEMA.md) — 欄位定義
- [schemas/README.md](../schemas/README.md) — `FIRESTORE_ONLY_FIELDS` 政策與 schema 建置
- [docs/plans/2026-04-22-unify-data-pipeline-design.md](plans/2026-04-22-unify-data-pipeline-design.md) — 為何 pipeline 長這樣的設計文件
