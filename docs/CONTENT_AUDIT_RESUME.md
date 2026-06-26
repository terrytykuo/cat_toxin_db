# Toxin 內容驗證 + 中文化 — 跨 Session 續跑手冊

> **這份文件是這項工作的單一事實來源（single source of truth）。**
> 每完成「一小份」工作，就立刻回來更新本檔的「進度快照」勾選框與「完成日誌」，
> 再順手更新 `PROGRESS.md`。這樣任何新 session 讀本檔即可無縫接續，不必重新推導。
>
> Token 很貴：對抗式網路查證一輪約 2–7M token，且常撞 account 層級 session 額度。
> **每個 batch 跑完務必先存檔結果**（見各任務的「存檔」步驟），再做下一步。

關聯：goal 工作流 `.agent/workflows/verify-and-localize-toxins.md`（§1–§9 為完整方法）。

---

## 進度快照（202​6-06-25 起）

權威範圍 = Firestore live 快取：`data/site/firestore/en/`（200）+ `firestore/zh-TW/`（201）。
依 zh-TW provenance（`gemini_model`）分桶：P1 機器來源 44、P2 人工審過 149、1 孤兒。

- [x] **建立 goal 工作流** `.agent/workflows/verify-and-localize-toxins.md`
- [x] **P1 對抗式審查（44/44）** → 報告 `data/audits/verify-localize-2026-06-25-p1.md` (+`.json`)
- [x] **P1 事實修正（13/13）** — 已寫 disk，已 review diff
- [x] **glossary 正規化** 257 處 / 76 檔（`pipeline/normalize_zh_glossary.py --apply`）
- [x] **NotebookLM 雜訊清理（保守）** 921 欄位 / 212 檔（`pipeline/clean_notebooklm_noise.py --apply`）
- [x] **P2 stage-1 審查（149/149）** → `data/audits/verify-localize-2026-06-25-p2.json`
- [x] **P2 對抗式 refute（95/149）** → 已合併進 p2.json；15 筆 FAIL、16 筆 NEEDS_REVIEW
- [x] **P2 事實修正（15/15）** — 已寫 disk → 摘要 `data/audits/p2-factual-fix-2026-06-25.json`
- [x] **補齊缺 severity 的 live 條目（31）** — backfill 完成；unripened_pineapples override→cautious。剩 9 筆 disk-only dup 屬 K11/K16（任務 A2）
- [x] **P2 refute 補跑（54 筆）** — ✅ 2026-06-26 完成（task wsrpnfji9，54/54）。結果存 `data/audits/verify-localize-2026-06-26-p2-refute-round2.json`，已合併進 p2.json，pending=0。新發現 16 FAIL（7 筆 safe↔toxic）、11 NEEDS_REVIEW。
- [x] **P2 round-2 FAIL 修正（16/16）** — ✅ 2026-06-26（task wh9k16vjo，腳本 `factual-fix-p2-round2.workflow.js`，摘要 `data/audits/p2-round2-factual-fix-2026-06-26.json`）。7 筆 severity 翻轉 + pudding 一致性已寫 *_processed canonical；2 處 glossary key 正規化（peony Leaves→Leaf、potato_chips Hematologic→Hematological）；16 筆 schema enum 0 違規。**firestore/en 快取部分仍舊值（6 筆），不影響 sync**（sync 讀 *_processed，firestore/en 僅判 slug 存在）。
- [x] **P2 NEEDS_REVIEW（11/11）跟進** — ✅ 2026-06-26（task wig1q79dc，腳本 `factual-fix-p2-round3.workflow.js`，摘要 `data/audits/p2-round3-needsreview-fix-2026-06-26.json`）。全部方向正確；清理交叉污染症狀（mentha_chocolate 移除 methylxanthine、nightshade 移除溶血/呼吸麻痺等馬科 cross-contam）、isToxic 一致性（peaches/pretzels/raw_meat false→true）、raw_eggs severity toxic→cautious（高估降級）。0 SCHEMA enum 違規。**注意：部分 firestore/zh-TW 快取仍含舊 fabricated 症狀，待任務 D sync 從 canonical 重生。**
- [x] **截斷類雜訊 LLM pass** — ✅ 2026-06-26 完成（task wz2urpg8b，56 批 ~2.27M token）。看似 3301 flag，扣除 979+ 個 name/onset 短標籤假陽性，真正候選 1929。安全 context-aware 修補：911 ADD_PERIOD、581 STRIP_LEAK、433 TRIM_TRUNCATED、4 LEAVE（不可復原，未捏造）。另先做 480 確定性 strip（43 footnote/雙標題 + 437 嚴格 leaked header）+ 後續 489 footnote 清理。**0 捏造、0 新 schema 違規、JSON 全合法。** 完整 provenance：`data/audits/content-noise-llm-pass-2026-06-26.json`。剩 4 LEAVE 為來源端真截斷，留待人工 re-query（見下方清單）。
- [ ] **Firestore sync（§8）** — ⏳ 未做，需先人工 review 全部 disk diff。見任務 D
- [ ] **§9 記錄 + commit** — 每個檢查點做。見任務 E。**任務 C 的資料檔變更沿用前 session 模式：disk 已套用但未 commit，待人工 reconciliation 一併處理；本 session 只 commit 工具/audit/docs（非資料檔）。**

對抗式覆蓋率：**200/200（100%）** 已完成事實查證（P1 44 + P2 149 + 補齊）。
**內容事實修正（A/A2/B/round2/round3）全部完成**——所有 safe↔toxic 方向錯誤、交叉污染、假化合物均已修正落 disk canonical。

---

## 🟢 新 session 從這裡開始（只剩任務 D）

**事實查證 + 雜訊清理階段皆已收尾。** 只剩一件事：

1. ~~任務 C — 截斷類雜訊 LLM pass~~ ✅ **2026-06-26 完成**（見下方任務 C 與快照）。所有 notes/description 的 NotebookLM 雜訊已清，僅剩 4 LEAVE 真截斷。
2. **任務 D — Firestore sync**（把已修正的 disk canonical 推上 live store）。**需人工 review disk diff 後才能跑**，且有快取 caveat。見下方任務 D。**這是唯一剩餘工作，且需你人工把關。**

**4 個 LEAVE（來源端真截斷，未捏造，留待人工 re-query 原始 NotebookLM 來源）：**
- `plants_processed/cananga_odorata.json` symptoms[4].notes（`…pre-existing conditions l`）
- `plants_processed/melaleuca_alternifolia.json` symptoms[6].notes（`…medical conditions like as`）
- `plants_processed/sansevieria_spp.json` treatments[1].notes（`…saponins and`）
- `plants_processed/tulipa_spp.json` treatments[2].notes（`…requiring targeted emerg`）

**目前 git 狀態（branch `content-audit-2026-06-25`，與 main 隔離）：**
本 session 的內容修正**已 commit**到此分支（不同於 2026-06-25(d) 當時「資料檔未 commit」的狀態）：
- `d6dc837` — P2 round-2 16 FAIL 修正（含 7 筆 severity 翻轉）+ audits/腳本/docs
- `77e83a7` — P2 round-3 11 NEEDS_REVIEW 修正 + audits/腳本/docs
注意：**2026-06-25(d) 之前的大批資料檔變更（事實28/glossary257/雜訊921/severity34）仍未 commit**，依 reconciliation 計畫待人工分組；本分支 working tree 仍 dirty。跑任務 C 前先 `git status` 確認，commit 時延續「精準 stage 本批產出檔」模式（見任務 E）。

---

## 可重用資產（已在 repo，新 session 直接用）

| 用途 | 路徑 | 怎麼跑 |
|---|---|---|
| 四面向審查 + 對抗式查證 | `.agent/workflows/scripts/audit-4dim.workflow.js`（預設 SLUGS=P2 149） | `Workflow({scriptPath})` |
| 只跑對抗式 refute（self-source） | `.agent/workflows/scripts/refute-remaining.workflow.js`（預設 SLUGS=54 pending） | `Workflow({scriptPath})` |
| 事實修正（外科式 Edit，無網路） | `.agent/workflows/scripts/factual-fix.workflow.js`（P1 原版）；`factual-fix-p2-round2.workflow.js`（P2 16 FAIL）；`factual-fix-p2-round3.workflow.js`（P2 11 NEEDS_REVIEW） | 改 ENTRIES + REPORT 後 `Workflow({scriptPath})`。round2/3 的 prompt 已含「移除交叉污染症狀 / 修 toxicParts / null food 佔位 scientificName」等強化指引，新批次直接複製改 ENTRIES 即可 |
| glossary 正規化（確定性） | `pipeline/normalize_zh_glossary.py` | `python3 ... [--apply]` |
| 雜訊清理（保守確定性） | `pipeline/clean_notebooklm_noise.py` | `python3 ... [--apply] [--flags]` |
| 審查結果 + 待補清單 | `data/audits/verify-localize-2026-06-25-{p1,p2}.json`、`p2_refute_pending.json` | — |
| 雜訊：嚴格 leaked header strip（確定性，index+2） | `pipeline/noise_strip_leaked_headers.py` | `python3 … [--apply]` |
| 雜訊：建截斷候選清單 | `pipeline/noise_build_candidates.py` | `python3 …` → candidates.json |
| 雜訊：安全 LLM pass（4 動作，可續跑） | `.agent/workflows/scripts/noise-llm-safe-pass.workflow.js` | `Workflow({scriptPath})` |
| 雜訊：合併+重驗 invariant+套用（dir-aware） | `pipeline/noise_apply_llm_fixes.py` | `python3 … [--apply]` |
| 雜訊 pass 完整 provenance | `data/audits/content-noise-llm-pass-2026-06-26.json` | — |

**讀取 Workflow 結果**：背景跑完會有 `<task-notification>`，內含 `output-file` 路徑。
該檔是 `{summary, agentCount, logs, result}`，要的資料在 `["result"]`（不是頂層）。
用 `python3 -c "import json; d=json.load(open('<output-file>'))['result']; ..."` 解析。

---

## 任務 A — P2 事實修正（15 筆）✅ 已完成（2026-06-25(b)）

> 歷史紀錄，保留方法供參。下方流程已套用完畢，**勿重跑**。

已查證的 15 筆 FAIL（10 筆 safe↔toxic）。修正依據 = `data/audits/verify-localize-2026-06-25-p2.json` 內各 slug 的 `verify.summary` / `verify.claim_verdicts`（**無需再上網**）。

清單：`alstroemeria_spp, aucuba_japonica, begonia_maculata, capsicum_annuum, celastrus_scandens, cercocarpus_spp, cinnamomum_verum, citrus_fruits_oranges_tangerines_lemons_pomelos, crocus_vernus, dahlia_pinnata, dianthus_caryophyllus, gum, hummingbird_mint, jelly, lemon_mint`

重點型態：**xylitol 假警報**（gum/jelly 標 toxic 但 xylitol 對貓無害，真風險是機械性哽塞）；**cross-contamination**（lemon_mint 套了 pennyroyal 的 pulegone；capsicum 套了茄科致命檔案；celastrus 套了 solanine）；**假化合物**（dianthus saponins、alstroemeria 草酸鈣→實為 tulipalin）。

**新 session 第一步——驗證 task `wg0saw146` 是否已完成這 15 筆：**
```bash
cd cat_toxin_db
for s in alstroemeria_spp aucuba_japonica begonia_maculata capsicum_annuum celastrus_scandens cercocarpus_spp cinnamomum_verum citrus_fruits_oranges_tangerines_lemons_pomelos crocus_vernus dahlia_pinnata dianthus_caryophyllus gum hummingbird_mint jelly lemon_mint; do
  p=data/plants_processed/$s.json; [ -f $p ] || p=data/foods_processed/$s.json
  echo "$s severity=$(python3 -c "import json;print(json.load(open('$p')).get('severity'))")"
done
```
- 若 severity 已是合理值（gum/jelly/hummingbird_mint/lemon_mint/capsicum → cautious 或 safe）＝已修，跳到任務 E commit。
- 若仍是原值 ＝ 未修，跑 `.agent/workflows/scripts/factual-fix.workflow.js`：先把該檔 `ENTRIES` 改成上面 15 筆（含 cat: plant/food，見下）、`REPORT` 指向 p2.json，再 `Workflow({scriptPath})`。
  - food：`citrus_fruits_oranges_tangerines_lemons_pomelos`, `gum`, `jelly`；其餘為 plant。`lemon_mint` 無 legacy zh-TW 檔（只修 EN）。

**完成後**：在本檔把 `[ ] P2 事實修正` 打勾、記入「完成日誌」、更新 PROGRESS.md。

---

## 任務 A2 — 補齊缺 severity 的條目 ✅ live 部分完成

**狀態 2026-06-25(b)**：原 42 缺口 → 已補 hummingbird_mint/lemon_mint(→safe) + backfill 31 筆 live（從 firestore/en 複製 severity/isToxic/toxicityLevel；unripened_pineapples override→cautious，因 firestore 仍是假氰化物 toxic）。255 檔 JSON+severity enum 驗證 0 違規。**剩 9 筆 disk-only dup 未處理**（`agapanthus_africanus_or_a_orientalis, allium_cepa, allium_porrum, allium_sativum, grapes, mint, pom_flowers, raisins, starfruit`）—無 firestore/en 對應、非 live，屬 K11/K16 slug reconciliation，本工作不處理。

**發現（保留供參）**：部分 `*_processed` 條目缺 `severity`/`isToxic`/`toxicityLevel`，severity 只在 `firestore/en`，導致 (a) safe↔toxic 修正寫進 `*_processed` 不生效、(b) `sync-disk-to-firestore` patch 不含 severity 推不出。backfill 已解此缺口（live 部分）。

偵測：
```bash
python3 -c "
import json,glob,os
for d in ['data/plants_processed','data/foods_processed']:
    for p in glob.glob(d+'/*.json'):
        if 'severity' not in json.load(open(p)): print(os.path.basename(p)[:-5])
"
```

處理原則（**注意：不能一律從 firestore/en 複製**，因為已修正條目的 firestore 值是舊的錯值）：
1. **未被本工作改過 severity 的條目** → 從 `firestore/en/<slug>.json` 複製 `severity`/`isToxic`/`toxicityLevel` 進 `*_processed`（補全 canonical，值不變，安全）。
2. **已被改過/查證需改 severity 的條目** → 用該條目的 **verify 判定** 設正確值，不可用 firestore 舊值。已知這類（缺欄位 ∩ 已查證）：
   - ✅ `hummingbird_mint` → safe（已補，Agastache 無毒）
   - ✅ `lemon_mint` → safe（已補，Monarda 無毒）
   - ⏳ `unripened_pineapples` → 應為 cautious（bromelain 輕微刺激，非氰化物 toxic）
   - ⏳ `ylang_ylang` → 維持 toxic（精油，確實有毒）
   - ⏳ `zamioculcas` → cautious（草酸鈣輕微刺激）
   - ⏳ `sweet_pea` → toxic/cautious（lathyrism，確實有毒）— 查 P1 verify 確認
   - 其餘缺欄位條目逐一對照 firestore 值 + 是否在 P1/P2 fails 清單。
3. safe 慣例：`isToxic:false, toxicityLevel:"low"`；toxic：`isToxic:true, toxicityLevel:"mild"|"severe"`。
4. 補完後務必重跑 schema check（`pipeline/verify_plants.py` / `verify_foods.py`）確認 severity enum 合法。

**完成後**：手冊打勾 + 記日誌 + PROGRESS.md。

---

## 任務 B — P2 refute 補跑（54 筆）✅ 已完成（2026-06-26）

> 歷史紀錄，保留方法供參（未來若再有 pending refute 可重用此流程）。本批 54 筆已 pending=0，**勿重跑**。

54 筆未完成對抗式查證（多為**已知有毒**：oleander、ricinus 蓖麻、philodendron、narcissus、prunus、kalanchoe、digitalis…分類大概率正確，修正風險低）。清單見 `data/audits/p2_refute_pending.json`，已 baked 進腳本。

```
Workflow({scriptPath: ".../.agent/workflows/scripts/refute-remaining.workflow.js"})
```
（路徑用絕對路徑。腳本 self-source：每個 agent 直接讀 `data/site/firestore/en/<slug>.json` 自行查證。）

**會撞額度 → 部分完成是常態。** 跑完後務必：
1. 讀 task output 的 `result.all`（已完成的 verify）。
2. 合併進 p2.json、重算 fails、更新 `p2_refute_pending.json`（移除已完成的）。合併腳本範式：
```bash
python3 - <<'PY'
import json
new=json.load(open('<TASK_OUTPUT>'))['result']
p2=json.load(open('data/audits/verify-localize-2026-06-25-p2.json'))
vmap={r['slug']:r['verify'] for r in new['all']}
for r in p2['full']:
    if r['slug'] in vmap and not r.get('verify'): r['verify']=vmap[r['slug']]
missing=[r['slug'] for r in p2['full'] if not r.get('verify')]
json.dump(p2,open('data/audits/verify-localize-2026-06-25-p2.json','w'),ensure_ascii=False,indent=2)
json.dump(missing,open('data/audits/p2_refute_pending.json','w'))
print('done; pending=',len(missing))
PY
```
3. 把 `refute-remaining.workflow.js` 的 SLUGS 換成新的 pending，重跑，直到 pending=0。
4. 新發現的 FAIL → 走任務 A 的修正流程（factual-fix.workflow.js，REPORT 指向 p2.json）。
5. 每輪更新本檔快照數字（已完成 refute X/149）。

---

## 任務 C — 截斷類雜訊 LLM pass ✅ 已完成（2026-06-26）

> 歷史紀錄 + 可重用方法。**勿重跑**（disk 已套用，dry-run 0 變更）。完整 provenance（每欄位 orig+cleaned+dir+arr+idx，可逆）：`data/audits/content-noise-llm-pass-2026-06-26.json`。

**做法（已執行）：**
1. 確定性清理 `pipeline/clean_notebooklm_noise.py --apply`（footnote 數字 1–2 位 + 雙數字 leaked header）。
2. 確定性嚴格 leaked header strip `pipeline/noise_strip_leaked_headers.py --apply`：只刪尾綴 `. N.` 且 **N == 陣列 index+2**（必為下一段標題洩漏，零誤判），共 437 筆。
3. 建候選 `pipeline/noise_build_candidates.py`（所有 `looks_truncated` 且非 symptoms.name/onset 短標籤 → 1929 筆）。
4. 安全 LLM pass `.agent/workflows/scripts/noise-llm-safe-pass.workflow.js`（56 批 ×35，每批寫 disk 可續跑）。四動作：**ADD_PERIOD**（完整句補句號）、**STRIP_LEAK**（刪黏連標題/sibling 名/引用/footnote）、**TRIM_TRUNCATED**（真截斷→修剪到上一個完整句，絕不補字）、**LEAVE**（整欄單一截斷句無可退守→原樣保留）。
5. 套用 `pipeline/noise_apply_llm_fixes.py --apply`：**獨立重驗 invariant**（ADD=orig+"."、TRIM/STRIP 必為 orig 前綴且收尾標點），違規一律不套（本次 0 違規）；再重跑步驟 1 清掉 trim 暴露出的 footnote。
6. 驗證：JSON 全合法、schema enum 0 新違規（既有 9 筆 toxic_part/body_system/長度屬 K11/K16，非本批）。

結果：**911 ADD_PERIOD + 581 STRIP_LEAK + 433 TRIM_TRUNCATED + 4 LEAVE**。`looks_truncated` flag 3301→985（剩餘全是合法 name/onset 短標籤 + 4 LEAVE）。

⚠️ **踩過的坑（已修進 `noise_apply_llm_fixes.py`）：** `malus_spp.json`、`persea_americana.json` 在 plants_processed 與 foods_processed **同名**。初版 apply 只用 basename 找檔（plants 優先）→ foods 候選被誤導到 plants 檔 → IndexError 中斷 + 可能靜默寫錯。修法：候選 = [plants 區塊]+[foods 區塊]，以「第一個 foods-only 候選」為 boundary（index 1082），`i<boundary→plants`。新 session 若再批次改這兩檔務必 dir-aware。

---

## 任務 C（原始說明，保留供參）

保守雜訊腳本只清明確型態，留下「來源句子中斷」（如 `…making the cat`）與單數字洩漏標題未修（避免誤刪合法內容）。查清單：
```bash
python3 pipeline/clean_notebooklm_noise.py --flags 2>&1 | grep -A99999 "TRUNCATED"
```
做法：對有截斷旗標的 `*_processed` 檔，用小型 LLM batch（context-aware，能分辨 `B12` 合法 vs `tract34` 雜訊）逐檔修補 `symptoms[].notes`。**先 dry-run/小批驗證再套用**（初版正則曾誤刪 raisins 496 字元合法內容——務必保持 audit-first）。

**承接 round-2/3 留下的雜訊**：事實修正 agent 被明確指示「不碰純格式 footnote/截斷雜訊」，故多筆已修條目的 `symptoms[].notes` 仍帶尾綴 footnote 數字、黏連標題（如 `…unwell12.Nausea`、`pneumonia2.Liver Failure`）、截斷句——這些正是任務 C 範圍。明細散見各 agent `left_for_human`（`data/audits/p2-round2-*.json`、`p2-round3-*.json`）。
**特別注意 mentha_x_piperita_chocolate**：methylxanthine 假化合物的「種子」是 notes 裡的殘留標題片段；round-3 已移除假 chemical/symptom，但若任務 C 不一併清掉 notes 裡的 `CNS and Cardiac Stimulation (Methylxanthine Toxicity)` 等片段，未來重生有再污染風險（該 agent 已警告）。
**firestore 快取**：同樣的截斷/fabricated 殘留也存在 `data/site/firestore/zh-TW/` 對應檔；任務 C 若只清 *_processed，需確保任務 D 的 sync/resnapshot 會用 canonical 覆蓋快取，否則快取雜訊會回流。

---

## 任務 D — Firestore sync（§8）⏳ 需人工 review

**前置**：所有 disk 變更（事實修正 + glossary + 雜訊）經人工 review 確認無誤。

```bash
cd cat_toxin_db/admin
node scripts/sync-disk-to-firestore.mjs --dry-run   # EN canonical → Firestore，先預覽
node scripts/sync-disk-to-firestore.mjs              # 套用
node scripts/check-firestore-sync.mjs                # 驗證 divergence
```

**sync 機制（2026-06-26 讀碼確認，腳本在 `admin/scripts/sync-disk-to-firestore.mjs`）：**
- **來源 = `data/{plants,foods}_processed`（canonical）**，patch 欄位 `CANONICAL_FIELDS` 含 `severity`/`isToxic`/`toxicityLevel`/`toxicParts`/`safetyNotes`/`symptoms`/`chemicals`…。
- `data/site/firestore/en/` **僅用來判斷 slug 是否已存在**（決定 update vs create），**不參與內容 diff**。→ 故 firestore/en 快取對 6 筆翻轉條目仍是舊值「不影響推送正確性」（sync 會用 *_processed 的正確值 `.update()`）。
- ⚠️ **混合 schema 形狀**：部分 *_processed 用巢狀 snake_case（`plant`/`basics`/`toxic_parts`...），patch 讀的是 camelCase（`toxicParts`/`isToxic`...），這些檔的對應欄位會讀不到 → 推不出。屬 K11/K16 schema reconciliation，sync 前需評估（dry-run 看 UPDATE 清單與實際 patch 內容）。

**本 session 留下的快取 divergence（sync 後須一併處理）：**
- `firestore/en/`：6 筆翻轉條目（tradescantia/milk/persimmons/pistachios/peanuts/potato_chips）仍舊值；3 筆（peony/pine/zephyranthes）已被 agent 改成新值——sync+resnapshot 後會統一。
- `firestore/zh-TW/`：部分條目（如 mentha_x_piperita_chocolate、nightshade）**仍含本輪已從 canonical 移除的 fabricated 症狀**。這些是 firestore-shaped 快取，需在 sync/zh 回寫流程中從修正後的 canonical / zh-TW 重生，**勿直接信任為 live 內容**。

**zh-TW 回寫缺口**：`upload-local-translations.mjs` 只處理「本地新增、Firestore 沒有」的檔；**改過的既有 zh-TW 不會被它重推**。既有條目需透過 admin UI PATCH `/api/translations/:slug`（會寫 `l10n.zh-TW`）或擴充 sync 腳本。完成後 `python3 pipeline/dump_firestore.py` 回快照。

---

## 任務 E — 記錄 + commit（每個檢查點）

⚠️ **不要用 `git add data/plants_processed`（整目錄）**——repo 有大量前 session 未 commit 的 dirty diff，整目錄 add 會把不相干變更掃進來。
**改用「精準 stage 本批產出檔」模式**（本 session 2026-06-26 採用）：從該批 workflow 的 `result.entries[].files`（agent 實際寫入的絕對路徑）取檔清單，加上 audits/腳本/docs，只 stage 這些：

```bash
cd cat_toxin_db
python3 - <<'PY' > /tmp/cm_files.txt
import json
d=json.load(open('data/audits/<本批fix摘要>.json'))['result']
files=set()
for e in d['entries']:
    for f in e.get('files',[]): files.add(f.replace('/Users/sweetp/Workspace/MewGuard/cat_toxin_db/',''))
files.update(['data/audits/<本批產出>.json','.agent/workflows/scripts/<本批腳本>.workflow.js',
              'docs/CONTENT_AUDIT_RESUME.md','PROGRESS.md'])
print('\n'.join(sorted(files)))
PY
tr '\n' '\0' < /tmp/cm_files.txt | xargs -0 git add --
git diff --cached --stat        # commit 前檢視，確認無前 session 雜檔混入
git commit -m "content: <本檢查點做了什麼> 2026-..."
```
（`date` 指令在本環境可能觸發權限提示，日期直接寫死。）
PROGRESS.md 誠實記錄：實際做了什麼、**不謊報未執行的 Firestore 狀態**。

---

## 重要 caveats / 踩過的坑

- **全部變更僅寫 disk**（`*_processed` canonical + zh-TW 快取），**尚未碰 Firestore**。Firestore 是 live store，sync 是任務 D。本 session 的修正已 commit 到分支 `content-audit-2026-06-25`（`d6dc837`、`77e83a7`），但只是 commit 到 disk 分支，**不等於 Firestore 已更新**。
- **zh-TW 檔路徑不一致**：legacy `data/site/zh-TW/` 只有部分 slug；多數 zh 修正落在 firestore-shaped 快取 `data/site/firestore/zh-TW/`（agent 發現 legacy 檔不存在時的 fallback）。新 session 改 zh 前先 `ls` 兩處確認哪個存在。
- **混合 schema 形狀**：部分 `*_processed` 是巢狀 snake_case（`plant`/`basics`/`toxic_parts`/`toxins`），部分是 camelCase-flat（`toxicParts`/`safetyNotes`/`chemicals`）。`verify_plants.py` 對前者驗證正常、對後者報一堆假 completeness（common_name missing 等，170/198）——**那是 schema 不匹配噪音，非內容缺陷**，只看 `[SCHEMA]` enum 違規即可（severity/body_system/toxic_part）。toxic_part 合法值為**單數**（Leaf 非 Leaves）、body_system 比對前會 lowercase（用 `Hematological` 不要 `Hematologic`）。
- **`Workflow` 的 `args` 參數對 scriptPath 無效**——曾導致誤跑 P1。要換 slug 就直接改腳本內 `SLUGS` 預設陣列。
- **session 額度是 account 層級、會反覆撞**。Workflow 支援 resume（`resumeFromRunId`，已完成 agent 走 cache），但跨 session 不可用——故改用「存檔結果 + 更新 pending 清單 + 重跑」模式。
- **雜訊正則危險**：醫療文字含合法數字（B12/O2）；只移除雙數字簽章等明確型態，截斷類一律標記不改。
- **repo 本就有大量未提交 dirty diff**（CLAUDE.md 警告過）；`git diff` 無法單獨歸因「我的改動」。以各 workflow 的 agent 報告 + 本檔日誌為準。
- **slug 命名空間**：disk 253 vs live 200，有重複別名（mint/onions/garlic 等）；屬 K11/K16，本工作不處理。對齊已修的 13+15 筆事實條目其 disk 檔名 = Firestore doc id。
- **已知資料模型缺漏**：`sweet_pea` 的 `*_processed` 缺 severity/isToxic 欄位；`schefflera` 學名拼字 `actinphylla`→`actinophylla`（牽動 slug，未動）。

---

## NEEDS_REVIEW（P2 round-2，11 筆）— ✅ 2026-06-26 已全數修正

已由 round-3（task wig1q79dc，`factual-fix-p2-round3.workflow.js`）處理完畢，**無待辦**。
11 筆：`mentha_x_piperita_chocolate, nightshade, orange_mint, peaches, philodendron_spp_including_birkin, pretzels, raw_eggs__raw_egg_whites, raw_meat, scadoxus_spp, schlumbergera_spp, vitis__implied`。
判定/修正明細見 `data/audits/p2-round3-needsreview-fix-2026-06-26.json` 與 p2.json 各 slug 的 `verify`。
殘留供下一輪人工判斷（UNVERIFIABLE，保守未動，記在各 agent 的 `left_for_human`）：
mentha_x_piperita_chocolate / orange_mint 的呼吸道症狀 severe 是否降級、nightshade 的 seizures 是否保留、scadoxus 是否從 toxic 降為 cautious（ASPCA 無條目，NC State 稱 LOW）。非阻塞，可併入未來內容微調。

---

## 完成日誌（最新在上）

- 2026-06-26 (d) — **任務 C 完成：截斷類雜訊安全 LLM pass**（task wz2urpg8b，56 批 ~2.27M token）。1929 真候選（扣 979+ name/onset 假陽性）：911 ADD_PERIOD + 581 STRIP_LEAK + 433 TRIM_TRUNCATED + 4 LEAVE。另先做 480 確定性 strip + 489 footnote 清理。**0 捏造**（TRIM 只修剪到上一完整句、LEAVE 不補字）、**0 新 schema 違規**、JSON 全合法、collision 檔已正確分流。獨立 invariant 重驗 0 違規。Provenance：`data/audits/content-noise-llm-pass-2026-06-26.json`；工具：`pipeline/noise_*.py` + `.agent/workflows/scripts/noise-llm-safe-pass.workflow.js`。**資料檔僅寫 disk 未 commit**（沿用前 session reconciliation 模式）；本 session 只 commit 工具/audit/docs。剩 4 LEAVE 待人工 re-query。**至此只剩任務 D（Firestore sync，需人工把關）。**
- 2026-06-26 (c) — **NEEDS_REVIEW 11/11 修正完成**（task wig1q79dc，~491K token）。症狀交叉污染清理 + isToxic 一致性 + raw_eggs toxic→cautious。0 SCHEMA enum 違規。摘要 `data/audits/p2-round3-needsreview-fix-2026-06-26.json`。至此 P2 149 筆（FAIL 16 + NEEDS_REVIEW 11）全數修正落 disk canonical。**caveat：部分 firestore/zh-TW 快取仍含舊值，待任務 D sync 重生。**
- 2026-06-26 (b) — **任務 B FAIL 修正完成**：16/16 事實修正（task wh9k16vjo，~655K token，外科式 Edit）。**7 筆 severity 方向修正**：peony safe→cautious、tradescantia_spathacea safe→cautious（漏報補正）；zephyranthes_drummondii cautious→safe、milk_and_dairy/persimmons/pine/pistachios/peanuts/potato_chips toxic→cautious（假警報降級）；pudding 修 isToxic/level 一致性。另修 nandina 學名/family/化合物、mentha 移除 pennyroyal 交叉污染肝毒、poppy 瞳孔矛盾、ragwort PA 化合物、raw_dough toxicParts/ADH 等。2 處 glossary key 對齊（peony Leaves→Leaf、potato_chips Hematologic→Hematological）。schema 驗證：16 筆 0 SCHEMA enum 違規（資料集既有 completeness shape 噪音 170/198 屬 K11/K16，非本批）。摘要 `data/audits/p2-round2-factual-fix-2026-06-26.json`。**全部僅寫 disk canonical，未碰 live Firestore（任務 D）。**
- 2026-06-26 (a) — **任務 B 完成**：P2 refute 補跑 54/54（task wsrpnfji9，~1.45M token，web-grounded refute-by-default）。對抗式覆蓋率達 **200/200（100%）**。合併進 p2.json（pending=0），結果存 `verify-localize-2026-06-26-p2-refute-round2.json` + FAIL 明細 `p2-refute-round2-fails-detail.json`。新發現 **16 FAIL**（7 筆 safe↔toxic disagreement：peony/tradescantia_spathacea safe→toxic 漏報；zephyranthes_drummondii/milk_and_dairy/persimmons/pine/pistachios toxic→cautious/safe 假警報）+ 11 NEEDS_REVIEW。
- 2026-06-25 (d) — §9 部分：基礎建設 commit 到分支 `content-audit-2026-06-25`（`04b7647`，14 檔：goal/scripts/audits/手冊/PROGRESS.md，**不含資料檔**、不動 main）。資料檔變更（事實28/glossary257/雜訊921/severity34）仍在 disk 未 commit，依 reconciliation 計畫由人工分組；Firestore sync 未做（任務 D）。
- 2026-06-25 (c) — 任務 A2：backfill 31 筆 live 條目的 severity（firestore→processed）+ unripened_pineapples override→cautious；255 檔驗證 0 違規；剩 9 disk-only dup（K11/K16）。
- 2026-06-25 (b) — P2 15 筆事實修正完成（task wg0saw146，摘要 `data/audits/p2-factual-fix-2026-06-25.json`）。發現 42 個 `*_processed` 缺 severity 欄位的資料缺口 → 新增任務 A2；已補 hummingbird_mint、lemon_mint → safe。
- 2026-06-25 (a) — 建立本手冊 + 複製可重用腳本進 `.agent/workflows/scripts/`。P1 全完成（審查+13 修正）；批次 glossary/雜訊已套用；P2 審查完成、refute 95/149。
