# 內容改寫指南 — 高中程度可讀性標準

**Last updated:** 2026-05-31

本文定義 MewGuard 資料庫中 `description` 與 `safetyNotes` 兩個欄位的內容難度標準與改寫流程。所有新進條目，以及任何被回報「讀不下去 / 太學術 / 翻譯腔」的條目，都應該套用這份 prompt 改寫。

---

## 在 pipeline 中的位置

```
NotebookLM raw
        ↓
process_plants.py / process_foods.py     (schema 驗證)
        ↓
sync_site_plants.py --emit-site          (產生 data/site/en/<slug>.json)
        ↓
★ Content rewrite (本文) ★               (改寫 description / safetyNotes)
        ↓
translate (用 translation-prompt.md)     (產生 data/site/zh-TW/<slug>.json)
        ↓
mewguard_site / app 渲染
```

**何時觸發：**

- 新進條目：英文 site payload 產生後，翻譯前
- 既有條目：被回報太學術 / 太嚇人 / 含過多酵素受體名稱時，重跑這個步驟，並設 `manual_override: true` 鎖住成品
- 月度抽查：每月隨機抽 5 筆已上線條目人讀一次，不過關就回到本流程

**改完之後**：英文檔 hash 會變，原本 zh-TW 的 `source_hash` 就對不上，sync 腳本會把它放回翻譯佇列。zh-TW 的人工成品必須一起重做（用 `translation-prompt.md` 的雙角色流程），否則 zh-TW 會顯示舊的中譯（與新英文不一致），或落回英文 fallback。

---

## 改寫 prompt（複製貼到 LLM）

> 建議模型：Claude Sonnet 4.6 以上、GPT-4.1 以上、Gemini 2.5 Pro。
> 一次處理一個 entry，避免批次降低品質。

```
你是一位寵物健康內容編輯，專門把過於艱深的動植物毒性說明，改寫成一般飼主能理解的內容。
請將我提供的文字改寫成「高中程度」的繁體中文，並另外提供英文版。

改寫目標：
- 讓一般貓飼主看得懂，但不要簡化到像國小程度。
- 保留重要的科學原因,但移除過度專業的生化機制。
- 如果原文有重要專有名詞,可以保留 1–2 個,但必須用簡單句子解釋。
- 文字要自然,不要有翻譯腔。
- 不要過度誇大風險,也不要把危險講得太輕。
- 如果不同部位、形式或劑量的風險不同,要清楚分開說明。
- 最後要給出明確的安全建議,例如避免餵食、避免接觸、放在貓碰不到的地方,或誤食後聯絡獸醫。

改寫方式：
1. 第一段：簡單說明這個東西是什麼,以及對貓是否安全。
2. 第二段：用高中程度解釋主要危險來源與原因。
3. 第三段：說明可能症狀、特別危險的部位或形式,並給出安全建議。
4. 接著提供英文版,意思要和中文版一致,但英文要自然,不要逐字翻譯。

請避免：
- 過多酵素名稱、受體名稱、細胞訊號路徑或化學反應細節。
- 使用「攻擊生理系統」「細胞窒息」這類太嚇人或太抽象的說法,除非原文重點必須保留。
- 把所有資訊壓縮到太短,導致重要風險被省略。
- 使用太多括號和專有名詞,讓讀者看不下去。

[貼上原始 description + safetyNotes]
```

---

## 寫回資料的結構

改寫後的成品塞回 `data/site/en/<slug>.json` 的兩個欄位：

| 來源（prompt 輸出） | 寫入欄位 |
|---|---|
| 三段式長文（段 1 + 段 2 + 段 3） | `description`（用 `\n\n` 分段） |
| 安全行動清單（從段 3 抽出，3–4 條） | `safetyNotes[]` |

**不動：** `scientificName`、`category`、`severity`、`symptoms[]`（symptom 名稱保留原樣，severity 是枚舉）、`toxicParts[]`。

**注意：** 即使 prompt 輸出已含中英雙語，**只把英文寫回 `data/site/en/`**。中文走 `translation-prompt.md` 的雙階段流程（避免直接信任改寫模型的中文，因為 prompt 的中文 prepare 階段沒有 native editor 校稿）。

---

## 改寫後檢核清單

- [ ] description 三段結構齊全（是什麼 + 為什麼危險 + 症狀＋建議）
- [ ] 化學名詞 ≤ 2 個，且每個都有一句白話解釋
- [ ] 沒有「攻擊」「窒息」「致命」這類過度情緒化用語（除非原文重點必須保留）
- [ ] 不同部位 / 形式 / 劑量的風險分開說明
- [ ] 最後一段給出可執行的安全建議
- [ ] safetyNotes 每條都是飼主能直接執行的動作或可觀察的訊號
- [ ] 寫回後 `manual_override: true`（避免被下一輪 sync 覆蓋）

---

## 相關文件

- [ADDING_NEW_ENTRY.md](ADDING_NEW_ENTRY.md) — 完整新增條目的步驟
- [SITE_SYNC_RUNBOOK.md](SITE_SYNC_RUNBOOK.md) — 英文 site payload 與翻譯快取的同步邏輯
- `../../translation-prompt.md` — 中文翻譯雙階段 prompt（改寫英文後必跑）
