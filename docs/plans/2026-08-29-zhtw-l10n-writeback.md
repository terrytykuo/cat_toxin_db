# zh-TW l10n 回寫 + 快取重生 + 網站重建 — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 把內容審計修正後的 zh-TW 翻譯推回 live Firestore `toxins/{slug}.l10n.zh-TW`（給 app），同步覆蓋本地網站翻譯快取 `data/site/firestore/zh-TW/`（給網站），最後重生 `mewguard_site/src/data/toxins.generated.ts`。

**Architecture:** 三段式：① read-only 盤點腳本產出 per-slug 決策報告（winner 選擇 + 分桶）→ ② 備份 live l10n 後，diff-driven 推送腳本寫入 Firestore（dry-run 先行）→ ③ 覆蓋本地 zh 快取並跑 `npm run build:toxins` 重生網站資料。共用邏輯抽成 lib 並附單元測試。

**Tech Stack:** Node 26 ESM（firebase-admin，已裝於 `admin/node_modules`）、`node --test`、Python3（驗證 one-liner）。

---

## ✅ 執行結果（2026-08-29 全部完成）

| Task | 結果 |
|---|---|
| 1 共用 lib + 測試 | ✅ 9/9 pass（commit `0aab1cd`） |
| 2 盤點腳本 | ✅ 211 live docs；首跑 `UPDATE 176 / NEEDS_RETRANSLATION 8 / NO_LOCAL 8 / NO_CHANGE 18 / CREATE_L10N 1`；**deletions 全空**（commit `8ac9eea`） |
| 3 語意方向 spot-check | ✅ 54 筆受檢 **0 筆需改**；另掃全庫，3 筆命中為否定句假陽性；1 筆 FLAG `sweet_pea`（EN 側過期，非 zh 問題） |
| 4 重寫 NEEDS_RETRANSLATION | ✅ 8 筆（預期 3 + 逐筆查證過的 5）；重跑後 NEEDS_RETRANSLATION **0**，終局 `UPDATE 184 / NO_CHANGE 18 / CREATE_L10N 1 / NO_LOCAL 8` |
| 5 備份 + 推送 | ✅ 備份 211 筆；dry-run 184+1、0 abort/0 deletions；apply **185 筆**、**Verify OK 185 / mismatch 0**（commit `2a3bd7e`） |
| 6 快取 reconcile | ✅ write-from-legacy **140**、unchanged 63、missing 0；203 檔 JSON 全合法（commit `156760b`） |
| 7 重生網站資料 | ✅ `Wrote 200 toxins`；translation pending **0**；捏造症狀字串 0 命中；mentha zh 症狀 = 5；`npm run build` 427 頁通過 |
| 8 記錄 + 收尾 | ✅ 本檔 + `CONTENT_AUDIT_RESUME.md` + `PROGRESS.md` |

**Task 2 的 8 筆 NEEDS_RETRANSLATION 成因**（皆為真實資料狀況，winner 邏輯無誤）：
`aloe_barbadensis_or_aloe_spp` 缺 `name` 欄位｜`averrhoa_carambola`、`begonia_maculata` name 仍英文｜`candies`、`prunus_serotina` 尾端有空白 symptom placeholder（8 vs 7、6 vs 5）｜`colchicum_autumnale` EN 後來多一筆症狀（6 vs 7）｜`lemon_mint` 無 legacy 檔且 fstore 為舊版（4 vs 2）｜`vitis__implied` zh 把 6 筆症狀壓縮成 3。
註：計劃原本預期的 `persea_americana` 未進此桶——live EN 已是 6 筆症狀，與 zh 相符。

**遺留 FLAG（EN 側，未處理）**：`sweet_pea`（審計判定無毒，live/disk EN 仍 toxic）、`lemon_mint`（live EN severity=safe 但 description 仍寫 mildly toxic）。

---

## 背景知識（執行前必讀，全部已由前置調查確認）

### 資料流（兩個 zh-TW 消費者，路徑完全不同）

```
App     ← Firestore toxins/{slug}.l10n.zh-TW          ← 本計劃 Task 5 推送
網站    ← mewguard_site npm run build:toxins
          （讀 live Firestore EN + 本地快取 data/site/firestore/zh-TW/）← Task 6 覆蓋、Task 7 重生
```

- 網站腳本 `mewguard_site/scripts/sync-firestore-toxin-data.mjs` **完全不讀 Firestore 的 l10n 欄位**；zh 來源只有本地快取 `data/site/firestore/zh-TW/{slug}.json`（fallback：legacy `data/site/zh-TW/`，可用時會自動 migrate 進前者）。
- 快取檔「可用」條件（`isUsableTranslation`）：`manual_override === true` **或** `source_hash` 等於現在 live EN payload 的 hash。EN 內容 2026-06-28 已大改，**stale hash 的檔案只有靠 `manual_override: true` 才會被採用**。目前 201 個快取檔中 198 個已是 `manual_override: true`。
- 網站的 zh 症狀以 **index 對齊**：`zh.symptoms.length !== en.symptoms.length` 時整組 zh 症狀被丟棄（fallback 英文）。→ 結構閘門：**winner 的 symptoms 長度必須等於 live EN 的 symptoms 長度**。

### 修正後的 zh-TW 散落在兩個目錄（winner 規則的依據）

- **legacy `data/site/zh-TW/`（180 檔）**：內容審計的 zh 修正主要落在這裡——P1 13 筆改寫、glossary 正規化 257 處/76 檔（`normalize_zh_glossary.py` 只掃這個目錄）、S-Z sync 也寫這裡。
- **`data/site/firestore/zh-TW/`（201 檔）**：網站翻譯快取。round-2/3 修正 agent 只在 legacy 檔不存在時才 fallback 寫這裡。**129 檔與 legacy 內容不同，其中 legacy 那份幾乎都是較新/已修正的**（實測例：`mentha_x_piperita_chocolate` legacy 5 症狀=已修正、fstore 6 症狀=仍含捏造的 methylxanthine 症狀）。
- **Winner 規則：legacy 優先，fstore 次之，且必須通過結構閘門（symptoms 長度 == live EN）+ name 含中文。**

### 已知的 3 筆結構不符（預期進 NEEDS_RETRANSLATION 桶）

| slug | live EN symptoms | 現有 zh symptoms | 原因 |
|---|---|---|---|
| `persea_americana` | 5 | 6 | zh 是舊版翻譯 |
| `colchicum_autumnale` | 7 | 6 | EN 後來加了症狀 |
| `lemon_mint` | 2 | 4 | 審計把它改為 safe（Monarda 無毒），zh 還是舊的有毒版描述 |

這 3 筆的 zh **必須整篇依現在的 live EN 重寫**（不能只補症狀），見 Task 4。

### l10n payload 形狀（與 `admin/server.js` 的 `buildL10nPayload()` 一致）

```json
{
  "name": "…", "aliases": [], "description": "…",
  "safetyNotes": [], "toxicParts": [],
  "symptoms": [{ "name": "…", "body_system": "…", "onset": "…(optional)" }],
  "emergencyNote": "…(optional)", "chemicals": [](optional), "treatments": [](optional)
}
```

`update({'l10n.zh-TW': payload})` 是**整個 map 覆蓋**。本地 zh 檔沒有 emergencyNote/chemicals/treatments 欄位，若 live 現有 l10n 帶這些欄位而新 payload 沒有，會被刪掉 → **merge-preserve 規則**：live-only 的這三個欄位要保留進新 payload（lib 已內建）。其他任何「live 有、新 payload 沒有」的 key 都要列入報告的 `deletions` 旗標，出現即停下回報。

### ⚠️ 禁忌與坑

1. **絕對不要跑 `pipeline/dump_firestore.py`**。它只 strip `id/imageUrls/imageUrl/hidden/curatedList`，**不 strip `l10n`**，而 disk schema root 沒有 `additionalProperties:false`——現在跑會把整包 l10n 塞進 canonical processed 檔案，污染 200+ 檔。EN 快取重生改由 Task 7 的 `build:toxins` 完成（它會重寫並清理 `data/site/firestore/en/`）。
2. **不要 `git add` 整個資料目錄**。repo 有大量跨 session 未 commit 的 dirty diff（reconciliation 模式）。只精準 stage 本計劃產出的檔案（見 Task 8）。
3. 本計劃**只 commit 工具/測試/audits/docs**；`data/site/zh-TW/`、`data/site/firestore/zh-TW/`、`mewguard_site/src/data/toxins.generated.ts` 等資料檔沿用慣例**不 commit**，留給人工 reconciliation。
4. 分支：留在 `content-audit-2026-06-25`，不要切換、不要動 main。
5. 憑證：`admin/.env.local` 已有 `FIREBASE_ADMIN_KEY_PATH`（已驗證存在）。腳本的 env 解析是 script-dir-relative，但慣例上仍 `cd admin` 後執行。
6. 日期直接寫死 `2026-08-29`（`date` 指令會觸發權限提示）。
7. `data/site/firestore/zh-TW/` 有 1 筆孤兒 `dracaena_marginata_or_dracaena_spp`（無 live doc）與零星非 live 檔（如 `sunflower`、`cast-iron-plant`）：**一律略過不動**（屬 K11/K16）。盤點只迭代 live doc ids。
8. `malus_spp` live 是 Apple/plant 身分（上次 EN sync 刻意排除 foods 版）。zh winner 照常規則選，但結構閘門以 live 為準即可，不需特殊處理。

### 驗證用的已知事實（寫進測試/驗證步驟）

- live `toxins` 集合 ≈ 211 docs（含 hidden；非 hidden 200）。
- `mentha_x_piperita_chocolate`：winner 應為 legacy（5 症狀），推送後 live l10n 症狀應為 5 筆、**不含**「過度活躍、顫抖、癲癇、心律不整與體溫過高」（捏造的 methylxanthine 症狀）。
- `nightshade`：無 legacy 檔，winner 應為 fstore（4 症狀，round-3 已修）。

---

## Task 1: 共用 lib + 單元測試

**Files:**
- Create: `admin/scripts/lib/zhtw-l10n.mjs`
- Create: `admin/scripts/lib/zhtw-l10n.test.mjs`

**Step 1: 寫測試（先寫、先跑、先看它 fail）**

`admin/scripts/lib/zhtw-l10n.test.mjs`：

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { buildL10nPayload, chooseWinner, payloadEquals, hasChineseContent } from './zhtw-l10n.mjs'

test('hasChineseContent', () => {
  assert.equal(hasChineseContent('薄荷'), true)
  assert.equal(hasChineseContent('Peppermint'), false)
  assert.equal(hasChineseContent(undefined), false)
})

test('buildL10nPayload strips metadata and keeps only l10n fields', () => {
  const src = {
    slug: 'x', category: 'plant', source_hash: 'abc', translated_at: 't',
    gemini_model: 'g', manual_override: true,
    name: '薄荷', aliases: ['A'], description: 'D', safetyNotes: ['S'],
    toxicParts: ['葉'], symptoms: [{ name: '嘔吐', body_system: '腸胃道', onset: '快', extra: 'drop-me' }],
  }
  const p = buildL10nPayload(src)
  assert.deepEqual(Object.keys(p).sort(),
    ['aliases', 'description', 'name', 'safetyNotes', 'symptoms', 'toxicParts'])
  assert.deepEqual(p.symptoms, [{ name: '嘔吐', body_system: '腸胃道', onset: '快' }])
})

test('buildL10nPayload omits empty onset and empty optional arrays', () => {
  const p = buildL10nPayload({ name: '貓', symptoms: [{ name: '嘔吐', body_system: '腸胃道' }], chemicals: [] })
  assert.equal('onset' in p.symptoms[0], false)
  assert.equal('chemicals' in p, false)
})

test('buildL10nPayload merge-preserves live-only optional fields', () => {
  const live = { emergencyNote: '緊急', chemicals: ['皂苷'], treatments: [{ name: 'T' }] }
  const p = buildL10nPayload({ name: '貓', symptoms: [] }, live)
  assert.equal(p.emergencyNote, '緊急')
  assert.deepEqual(p.chemicals, ['皂苷'])
  assert.deepEqual(p.treatments, [{ name: 'T' }])
})

test('buildL10nPayload local optional field wins over live', () => {
  const p = buildL10nPayload({ name: '貓', symptoms: [], emergencyNote: '本地' }, { emergencyNote: 'live' })
  assert.equal(p.emergencyNote, '本地')
})

test('chooseWinner prefers legacy when it passes the structural gate', () => {
  const legacy = { name: '薄荷', symptoms: [{}, {}] }
  const fstore = { name: '薄荷舊', symptoms: [{}, {}, {}] }
  const w = chooseWinner({ legacy, fstore, enSymptomCount: 2 })
  assert.equal(w.source, 'legacy')
})

test('chooseWinner falls back to fstore when legacy fails the gate or is missing', () => {
  const fstore = { name: '龍葵', symptoms: [{}, {}, {}, {}] }
  assert.equal(chooseWinner({ legacy: { name: '龍', symptoms: [{}] }, fstore, enSymptomCount: 4 }).source, 'fstore')
  assert.equal(chooseWinner({ legacy: null, fstore, enSymptomCount: 4 }).source, 'fstore')
})

test('chooseWinner rejects non-Chinese names and returns null when nothing passes', () => {
  assert.equal(chooseWinner({ legacy: { name: 'Mint', symptoms: [{}] }, fstore: null, enSymptomCount: 1 }), null)
  assert.equal(chooseWinner({ legacy: { name: '薄荷', symptoms: [{}] }, fstore: null, enSymptomCount: 2 }), null)
})

test('payloadEquals is key-order insensitive', () => {
  assert.equal(payloadEquals({ a: 1, b: [1, 2] }, { b: [1, 2], a: 1 }), true)
  assert.equal(payloadEquals({ a: 1 }, { a: 2 }), false)
  assert.equal(payloadEquals(null, undefined), true)
})
```

**Step 2: 跑測試，確認 fail（module 不存在）**

Run: `cd /Users/sweetp/Workspace/MewGuard/cat_toxin_db/admin && node --test scripts/lib/zhtw-l10n.test.mjs`
Expected: FAIL（Cannot find module）

**Step 3: 實作 lib**

`admin/scripts/lib/zhtw-l10n.mjs`：

```js
export function hasChineseContent(name) {
  return /[一-鿿㐀-䶿]/.test(name ?? '')
}

// Mirrors buildL10nPayload() in admin/server.js, plus merge-preserve of
// live-only optional fields (the whole l10n.zh-TW map gets replaced on update,
// so anything we don't carry over is deleted).
export function buildL10nPayload(d, liveL10n = null) {
  const symptoms = (d.symptoms ?? []).map(s => {
    const entry = { name: s.name ?? '', body_system: s.body_system ?? '' }
    if (s.onset) entry.onset = s.onset
    return entry
  })
  const payload = {
    name: d.name ?? '',
    aliases: d.aliases ?? [],
    description: d.description ?? '',
    safetyNotes: d.safetyNotes ?? [],
    toxicParts: d.toxicParts ?? [],
    symptoms,
  }
  if (d.emergencyNote) payload.emergencyNote = d.emergencyNote
  if (Array.isArray(d.chemicals) && d.chemicals.length > 0) payload.chemicals = d.chemicals
  if (Array.isArray(d.treatments) && d.treatments.length > 0) payload.treatments = d.treatments
  if (liveL10n) {
    for (const k of ['emergencyNote', 'chemicals', 'treatments']) {
      if (payload[k] === undefined && liveL10n[k] !== undefined) payload[k] = liveL10n[k]
    }
  }
  return payload
}

// legacy data/site/zh-TW/ carries the audit-era fixes (P1 rewrites, glossary
// normalization) so it wins over the site translation cache; both must pass
// the structural gate (site zh symptoms are index-aligned to EN).
export function chooseWinner({ legacy, fstore, enSymptomCount }) {
  for (const [source, data] of [['legacy', legacy], ['fstore', fstore]]) {
    if (!data) continue
    if (!hasChineseContent(data.name)) continue
    if ((data.symptoms ?? []).length !== enSymptomCount) continue
    return { source, data }
  }
  return null
}

export function stableStringify(val) {
  if (Array.isArray(val)) return '[' + val.map(stableStringify).join(',') + ']'
  if (val && typeof val === 'object') {
    return '{' + Object.keys(val).sort()
      .map(k => JSON.stringify(k) + ':' + stableStringify(val[k])).join(',') + '}'
  }
  return JSON.stringify(val) ?? 'null'
}

export function payloadEquals(a, b) {
  return stableStringify(a ?? null) === stableStringify(b ?? null)
}
```

**Step 4: 跑測試，確認全 PASS**

Run: `node --test scripts/lib/zhtw-l10n.test.mjs`
Expected: 全部 pass。

**Step 5: Commit**

```bash
cd /Users/sweetp/Workspace/MewGuard/cat_toxin_db
git add admin/scripts/lib/zhtw-l10n.mjs admin/scripts/lib/zhtw-l10n.test.mjs
git commit -m "tooling: zh-TW l10n 回寫共用 lib + 單元測試 2026-08-29"
```

---

## Task 2: 盤點腳本（read-only）

**Files:**
- Create: `admin/scripts/report-zhtw-status.mjs`

**Step 1: 實作**

Firebase bootstrap（env 解析 + init）整段照抄 `admin/scripts/upload-local-translations.mjs` 第 11–50 行。主體：

```js
// … bootstrap（同 upload-local-translations.mjs）→ 得到 db …
import { chooseWinner, buildL10nPayload, payloadEquals } from './lib/zhtw-l10n.mjs'

const LEGACY_DIR = resolve(__dirname, '../../data/site/zh-TW')
const FSTORE_DIR = resolve(__dirname, '../../data/site/firestore/zh-TW')
const OUT = resolve(__dirname, '../../data/audits/zhtw-writeback-plan-2026-08-29.json')

function readJson(p) { return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null }

const snap = await db.collection('toxins').get()
const entries = {}
const counts = {}
for (const doc of snap.docs) {
  const slug = doc.id
  const live = doc.data()
  const liveL10n = live.l10n?.['zh-TW'] ?? null
  const enSymptomCount = Array.isArray(live.symptoms) ? live.symptoms.length : 0
  const legacy = readJson(resolve(LEGACY_DIR, `${slug}.json`))
  const fstore = readJson(resolve(FSTORE_DIR, `${slug}.json`))

  let bucket, winnerSource = null, changedFields = [], deletions = []
  const winner = chooseWinner({ legacy, fstore, enSymptomCount })
  if (!legacy && !fstore) bucket = 'NO_LOCAL'
  else if (!winner) bucket = 'NEEDS_RETRANSLATION'
  else {
    winnerSource = winner.source
    const payload = buildL10nPayload(winner.data, liveL10n)
    if (liveL10n) {
      deletions = Object.keys(liveL10n).filter(k => payload[k] === undefined)
      changedFields = [...new Set([...Object.keys(payload), ...Object.keys(liveL10n)])]
        .filter(k => !payloadEquals(payload[k], liveL10n[k]))
      bucket = changedFields.length === 0 ? 'NO_CHANGE' : 'UPDATE'
    } else bucket = 'CREATE_L10N'
  }
  counts[bucket] = (counts[bucket] || 0) + 1
  entries[slug] = {
    bucket, winnerSource, enSymptomCount, hidden: live.hidden === true,
    legacySymptoms: legacy ? (legacy.symptoms ?? []).length : null,
    fstoreSymptoms: fstore ? (fstore.symptoms ?? []).length : null,
    changedFields, deletions,
  }
}
writeFileSync(OUT, JSON.stringify({ generated_at: '2026-08-29', liveDocs: snap.size, counts, entries }, null, 2))
console.log(`Live docs: ${snap.size}`)
console.log('Buckets:', JSON.stringify(counts))
for (const [slug, e] of Object.entries(entries)) {
  if (e.bucket === 'NEEDS_RETRANSLATION' || e.deletions.length) console.log('  FLAG', slug, JSON.stringify(e))
}
console.log(`Report → ${OUT}`)
process.exit(0)
```

**Step 2: 執行並檢查輸出**

Run: `cd /Users/sweetp/Workspace/MewGuard/cat_toxin_db/admin && node scripts/report-zhtw-status.mjs`
Expected:
- `Live docs:` ≈ 211。
- NEEDS_RETRANSLATION 應恰好包含 `persea_americana`、`colchicum_autumnale`、`lemon_mint`（多出來的逐一檢視並記錄原因；多很多＝winner 邏輯有 bug，停下修正）。
- `deletions` 全空。**若任何 slug 有 deletions：停止，不進 Task 5**，把該欄位加進 merge-preserve 清單或回報用戶。
- spot-check：報告中 `mentha_x_piperita_chocolate.winnerSource === 'legacy'`、`nightshade.winnerSource === 'fstore'`。

**Step 3: Commit（腳本；報告 JSON 留到 Task 8 一起）**

```bash
cd /Users/sweetp/Workspace/MewGuard/cat_toxin_db
git add admin/scripts/report-zhtw-status.mjs
git commit -m "tooling: zh-TW l10n 盤點/決策報告腳本 2026-08-29"
```

---

## Task 3: 語意一致性 spot-check（審計已翻轉條目的 zh 描述）

事實審計翻轉了多筆 severity 方向（safe↔toxic），EN 描述已改寫，但部分 zh winner 的 description 可能仍是舊事實方向。**只檢查方向性錯誤，不重翻、不潤稿。**

**Step 1: 取得受檢清單**

從以下 audits 檔收集 slug（union，只留 bucket ∈ {UPDATE, NO_CHANGE, CREATE_L10N} 的）：
- `data/audits/p2-factual-fix-2026-06-25.json`
- `data/audits/p2-round2-factual-fix-2026-06-26.json`
- `data/audits/p2-round3-needsreview-fix-2026-06-26.json`
- P1 13 筆：見 `data/audits/verify-localize-2026-06-25-p1.json`（fails）

**Step 2: 逐筆比對方向**

對每個 slug：讀 live EN 的 `severity` + `description` 首段，對照 winner zh 檔的 `description`/`safetyNotes` 是否有**方向矛盾**（例：EN 已改 safe/cautious，zh 仍說「有毒／中毒風險高」；或 EN 已移除 xylitol 假警報，zh 仍講木糖醇中毒）。預期大多數已由審計 agent 修過（P1/round2/round3 都有 zh 修正）；有矛盾的直接**小幅修正 winner 檔**（legacy 檔存在改 legacy，否則改 fstore），改完維持 JSON 合法、症狀數不變。

**Step 3: 若有修改，重跑 Task 2 的報告腳本**

Run: `node scripts/report-zhtw-status.mjs`
Expected: buckets 數字更新，無新 FLAG。

（修改的 zh 資料檔不 commit，沿用 reconciliation 慣例；在 Task 8 的 PROGRESS.md 記錄清單。）

---

## Task 4: 重寫 3 筆 NEEDS_RETRANSLATION

**Files:**
- Modify/Create: `data/site/zh-TW/persea_americana.json`、`data/site/zh-TW/colchicum_autumnale.json`、`data/site/zh-TW/lemon_mint.json`（＋Task 2 若發現的其他筆）

**Step 1: 逐筆依 live EN 重寫 zh 翻譯**

對每筆：讀 live EN doc（用 `data/site/firestore/en/{slug}.json` 舊快取僅供參考，**以 Task 2 抓下的 live 內容為準**——可在報告腳本臨時加 dump 或用一次性 node one-liner 抓單筆 live doc）。翻譯規則：
- 全欄位翻譯：`name`/`aliases`/`description`/`safetyNotes`/`toxicParts`/`symptoms[].{name,body_system,onset}`，症狀**與 live EN 逐 index 對齊、數量相等**。
- `body_system` 用 `data/site/translation_glossary.json` 的 canonical 中文詞（如 腸胃道、心血管），不要自創。
- 檔案格式照既有 legacy 檔：保留/寫入 `slug`、`category`、`manual_override: true`、`translated_at: "2026-08-29T00:00:00Z"`、`gemini_model: "manual-claude"`；`source_hash` 可留舊值或省略（manual_override 已 bypass hash 檢查）。
- `lemon_mint` 特別注意：現為 **safe**（Monarda 屬，無毒），整篇必須是「無毒、安全」方向。

**Step 2: 驗證 + 重跑報告**

```bash
python3 -c "import json;[json.load(open(f'data/site/zh-TW/{s}.json')) for s in ['persea_americana','colchicum_autumnale','lemon_mint']];print('json-ok')"
cd admin && node scripts/report-zhtw-status.mjs
```
Expected: `NEEDS_RETRANSLATION` = 0；這 3 筆變為 `UPDATE`（winnerSource=legacy）。

---

## Task 5: 備份 + 推送 Firestore l10n.zh-TW

**Files:**
- Create: `admin/scripts/sync-zhtw-l10n-to-firestore.mjs`
- Create（執行產物）: `data/audits/backups/l10n-zhtw-live-backup-2026-08-29.json`

**Step 1: 實作推送腳本**

Bootstrap 同前。邏輯：

```js
// 用法: node scripts/sync-zhtw-l10n-to-firestore.mjs --plan ../data/audits/zhtw-writeback-plan-2026-08-29.json [--dry-run]
import { chooseWinner, buildL10nPayload, payloadEquals } from './lib/zhtw-l10n.mjs'
// 1. 讀 --plan 報告，目標 = bucket ∈ {UPDATE, CREATE_L10N} 的 slugs。
// 2. 重新 fetch 全部 live docs（不是信任報告的舊快照）。
// 3. 【備份】把所有 live doc 的 { slug: l10n['zh-TW'] ?? null } 寫到
//    data/audits/backups/l10n-zhtw-live-backup-2026-08-29.json（dry-run 也照寫，先備份再說）。
// 4. 對每個目標 slug 重算 winner + payload（傳入現在的 liveL10n 做 merge-preserve），
//    重新分桶；若重算結果與 plan 的 bucket 不一致（NO_CHANGE 化屬正常、直接略過並記 skipped；
//    變成 NEEDS_RETRANSLATION / 出現 deletions 則 abort 並列出 slug）。
// 5. dry-run: 印每個 slug 的 changedFields；結尾印 would-update / would-create / skipped 統計。
// 6. apply: await db.collection('toxins').doc(slug).update({ 'l10n.zh-TW': payload })
// 7. 【read-back 複驗】apply 後重新 fetch 目標 docs，payloadEquals(live.l10n['zh-TW'], expected)
//    逐筆比對，印 `Verify: OK <n>; mismatch <m>`；m 必須為 0，否則 exit 1。
```

**Step 2: dry-run 並審視**

Run: `node scripts/sync-zhtw-l10n-to-firestore.mjs --plan ../data/audits/zhtw-writeback-plan-2026-08-29.json --dry-run`
Expected:
- 備份檔已寫出且筆數 == live docs 數。
- would-update+create 數 ≈ Task 2/4 報告的 UPDATE+CREATE_L10N 數。
- 0 abort、0 deletions。
- 抽查 dry-run 輸出：`mentha_x_piperita_chocolate` 在清單內（症狀 6→5）。

**若 abort 或出現 deletions：停止並回報，不 apply。**

**Step 3: apply + read-back 複驗**

Run: `node scripts/sync-zhtw-l10n-to-firestore.mjs --plan ../data/audits/zhtw-writeback-plan-2026-08-29.json`
Expected: `Verify: OK <n>; mismatch 0`。把終端輸出全文存到 `data/audits/zhtw-writeback-apply-log-2026-08-29.txt`。

**Step 4: Commit（腳本）**

```bash
cd /Users/sweetp/Workspace/MewGuard/cat_toxin_db
git add admin/scripts/sync-zhtw-l10n-to-firestore.mjs
git commit -m "tooling: zh-TW l10n diff-driven 推送腳本（備份+dry-run+read-back 複驗） 2026-08-29"
```

---

## Task 6: 覆蓋本地網站 zh 快取

**Files:**
- Create: `admin/scripts/reconcile-zhtw-cache.mjs`
- Modify（執行產物）: `data/site/firestore/zh-TW/*.json`（僅 winner=legacy 且內容不同的檔）

**Step 1: 實作**

```js
// 讀 --plan 報告；對 bucket ∈ {UPDATE, NO_CHANGE, CREATE_L10N} 的 slug：
//   - winnerSource === 'legacy'：讀 legacy 檔，寫到 data/site/firestore/zh-TW/{slug}.json，
//     內容 = { ...legacyData, slug, manual_override: true }（其餘 metadata 原樣保留）。
//     寫前先比對：內容已相同就跳過（idempotent）。
//   - winnerSource === 'fstore'：確保該檔 manual_override === true，false 就改 true（stale
//     source_hash 下站點才會採用），其餘不動。
// 不迭代目錄裡的孤兒檔。支援 --dry-run 印 would-write 清單。
```

**Step 2: dry-run → apply → 驗證**

```bash
node scripts/reconcile-zhtw-cache.mjs --plan ../data/audits/zhtw-writeback-plan-2026-08-29.json --dry-run
node scripts/reconcile-zhtw-cache.mjs --plan ../data/audits/zhtw-writeback-plan-2026-08-29.json
python3 -c "
import json,glob
n=0
for p in glob.glob('../data/site/firestore/zh-TW/*.json'): json.load(open(p)); n+=1
print('json-ok', n)"
```
Expected: would-write 數 ≈ legacy-winner 且內容不同的筆數；JSON 全合法。抽查 `data/site/firestore/zh-TW/mentha_x_piperita_chocolate.json` 症狀變 5 筆、無 methylxanthine 症狀。

**Step 3: Commit（腳本）**

```bash
git add admin/scripts/reconcile-zhtw-cache.mjs
git commit -m "tooling: 網站 zh-TW 翻譯快取 reconcile 腳本 2026-08-29"
```

---

## Task 7: 重生網站資料（toxins.generated.ts）

**Step 1: 重生（不帶 --translate，不會叫 Gemini）**

Run: `cd /Users/sweetp/Workspace/MewGuard/mewguard_site && npm run build:toxins`
Expected: `Wrote 200 toxins (…) to …/src/data/toxins.generated.ts`，exit 0。此步同時重寫 `cat_toxin_db/data/site/firestore/en/`（EN 快取 resnapshot，取代 dump_firestore）。

**Step 2: 驗證產物**

```bash
# 1) 翻譯 pending 應為 0 或極少（>5 = 快取 reconcile 有漏，回 Task 6 查）
python3 -c "import json;d=json.load(open('../cat_toxin_db/data/site/firestore/sync_progress.json'));print(d['translation'])"
# 2) 捏造症狀不得出現在產物
grep -c "過度活躍、顫抖、癲癇、心律不整與體溫過高" src/data/toxins.generated.ts || echo "fabricated-symptom-absent-ok"
# 3) mentha zh 症狀 = 5
node -e "const {toxins}=await import('./src/data/toxins.generated.ts').catch(()=>({})); " 2>/dev/null || \
python3 -c "
import re,json
src=open('src/data/toxins.generated.ts').read()
arr=json.loads(re.search(r'= (\[.*\]) satisfies', src, re.S).group(1))
m=[t for t in arr if t['id']=='mentha_x_piperita_chocolate'][0]
assert len(m['symptoms']['zh-TW'])==5, m['symptoms']['zh-TW']
print('mentha-zh-5-ok; total', len(arr))"
```
Expected: pending_count ≤ 5、grep 找不到該字串、`mentha-zh-5-ok`。

**Step 3: 網站 build 驗證**

Run: `cd /Users/sweetp/Workspace/MewGuard/mewguard_site && npm run build`
Expected: exit 0。（失敗且原因在 generated 資料 → 回查；原因是既有無關問題 → 記錄後續報，不 rabbit-hole。）

---

## Task 8: 記錄 + 收尾 commit

**Step 1: 更新文件**

- `cat_toxin_db/docs/CONTENT_AUDIT_RESUME.md`：任務 D 尾段 zh-TW 快取重生標記 ✅（2026-08-29），完成日誌加一條（含推送筆數、備份檔路徑、複驗結果、Task 3 修正清單）；「新 session 從這裡開始」段落更新為只剩 K11/K16 + 4 LEAVE。
- `cat_toxin_db/PROGRESS.md`：同樣加一條，**誠實記錄實際數字**（推送 n 筆、mismatch 0、pending m）。
- 本計劃檔：把完成的 task 打勾/標註結果。

**Step 2: 精準 stage + commit**

```bash
cd /Users/sweetp/Workspace/MewGuard/cat_toxin_db
git add data/audits/zhtw-writeback-plan-2026-08-29.json \
        data/audits/backups/l10n-zhtw-live-backup-2026-08-29.json \
        data/audits/zhtw-writeback-apply-log-2026-08-29.txt \
        docs/CONTENT_AUDIT_RESUME.md PROGRESS.md docs/plans/2026-08-29-zhtw-l10n-writeback.md
git diff --cached --stat   # 確認無資料檔混入
git commit -m "content: zh-TW l10n 回寫 live Firestore + 網站快取重生 2026-08-29"
```

（`data/site/zh-TW/`、`data/site/firestore/zh-TW/`、`data/site/firestore/en/`、`mewguard_site/src/data/toxins.generated.ts` 維持不 commit。）

**Step 3: 最終回報**

彙整：各桶數量、推送/建立筆數、read-back 結果、Task 3 修正的 slug 清單、Task 4 重寫清單、網站 build 結果、以及任何 FLAG/未解事項。
