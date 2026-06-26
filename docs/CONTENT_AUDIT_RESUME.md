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
- [ ] **截斷類雜訊 LLM pass（~3405 欄位）** — ⏳ 未做。見任務 C
- [ ] **Firestore sync（§8）** — ⏳ 未做，需先人工 review 全部 disk diff。見任務 D
- [ ] **§9 記錄 + commit** — 每個檢查點做。見任務 E

對抗式覆蓋率：**200/200（100%）** 已完成事實查證（P1 44 + P2 149 + 補齊）。

---

## 可重用資產（已在 repo，新 session 直接用）

| 用途 | 路徑 | 怎麼跑 |
|---|---|---|
| 四面向審查 + 對抗式查證 | `.agent/workflows/scripts/audit-4dim.workflow.js`（預設 SLUGS=P2 149） | `Workflow({scriptPath})` |
| 只跑對抗式 refute（self-source） | `.agent/workflows/scripts/refute-remaining.workflow.js`（預設 SLUGS=54 pending） | `Workflow({scriptPath})` |
| 事實修正（外科式 Edit，無網路） | `.agent/workflows/scripts/factual-fix.workflow.js` | 改 ENTRIES + REPORT 後 `Workflow({scriptPath})` |
| glossary 正規化（確定性） | `pipeline/normalize_zh_glossary.py` | `python3 ... [--apply]` |
| 雜訊清理（保守確定性） | `pipeline/clean_notebooklm_noise.py` | `python3 ... [--apply] [--flags]` |
| 審查結果 + 待補清單 | `data/audits/verify-localize-2026-06-25-{p1,p2}.json`、`p2_refute_pending.json` | — |

**讀取 Workflow 結果**：背景跑完會有 `<task-notification>`，內含 `output-file` 路徑。
該檔是 `{summary, agentCount, logs, result}`，要的資料在 `["result"]`（不是頂層）。
用 `python3 -c "import json; d=json.load(open('<output-file>'))['result']; ..."` 解析。

---

## 任務 A — P2 事實修正（15 筆）⏳ 進行中

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

## 任務 B — P2 refute 補跑（54 筆）⏳ 最燒 token

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

## 任務 C — 截斷類雜訊 LLM pass（~3405 欄位）⏳

保守雜訊腳本只清明確型態，留下「來源句子中斷」（如 `…making the cat`）與單數字洩漏標題未修（避免誤刪合法內容）。查清單：
```bash
python3 pipeline/clean_notebooklm_noise.py --flags 2>&1 | grep -A99999 "TRUNCATED"
```
做法：對有截斷旗標的 `*_processed` 檔，用小型 LLM batch（context-aware，能分辨 `B12` 合法 vs `tract34` 雜訊）逐檔修補 `symptoms[].notes`。**先 dry-run/小批驗證再套用**（初版正則曾誤刪 raisins 496 字元合法內容——務必保持 audit-first）。

---

## 任務 D — Firestore sync（§8）⏳ 需人工 review

**前置**：所有 disk 變更（事實修正 + glossary + 雜訊）經人工 review 確認無誤。

```bash
cd cat_toxin_db/admin
node scripts/sync-disk-to-firestore.mjs --dry-run   # EN canonical → Firestore，先預覽
node scripts/sync-disk-to-firestore.mjs              # 套用
node scripts/check-firestore-sync.mjs                # 驗證 divergence
```
**zh-TW 回寫缺口**：`upload-local-translations.mjs` 只處理「本地新增、Firestore 沒有」的檔；**改過的既有 zh-TW 不會被它重推**。既有條目需透過 admin UI PATCH `/api/translations/:slug`（會寫 `l10n.zh-TW`）或擴充 sync 腳本。完成後 `python3 pipeline/dump_firestore.py` 回快照。

---

## 任務 E — 記錄 + commit（每個檢查點）

```bash
cd cat_toxin_db
git add data/plants_processed data/foods_processed data/site/zh-TW data/audits \
        pipeline/normalize_zh_glossary.py pipeline/clean_notebooklm_noise.py \
        .agent/workflows docs/CONTENT_AUDIT_RESUME.md PROGRESS.md
git commit -m "content: <本檢查點做了什麼> $(date +%Y-%m-%d)"
```
PROGRESS.md 誠實記錄：實際做了什麼、**不謊報未執行的 Firestore 狀態**。

---

## 重要 caveats / 踩過的坑

- **全部變更僅寫 disk**（`*_processed` + `data/site/zh-TW`），**尚未碰 Firestore**。Firestore 是 live store，sync 是任務 D。
- **`Workflow` 的 `args` 參數對 scriptPath 無效**——曾導致誤跑 P1。要換 slug 就直接改腳本內 `SLUGS` 預設陣列。
- **session 額度是 account 層級、會反覆撞**。Workflow 支援 resume（`resumeFromRunId`，已完成 agent 走 cache），但跨 session 不可用——故改用「存檔結果 + 更新 pending 清單 + 重跑」模式。
- **雜訊正則危險**：醫療文字含合法數字（B12/O2）；只移除雙數字簽章等明確型態，截斷類一律標記不改。
- **repo 本就有大量未提交 dirty diff**（CLAUDE.md 警告過）；`git diff` 無法單獨歸因「我的改動」。以各 workflow 的 agent 報告 + 本檔日誌為準。
- **slug 命名空間**：disk 253 vs live 200，有重複別名（mint/onions/garlic 等）；屬 K11/K16，本工作不處理。對齊已修的 13+15 筆事實條目其 disk 檔名 = Firestore doc id。
- **已知資料模型缺漏**：`sweet_pea` 的 `*_processed` 缺 severity/isToxic 欄位；`schefflera` 學名拼字 `actinphylla`→`actinophylla`（牽動 slug，未動）。

---

## NEEDS_REVIEW（P2 round-2，11 筆，待人工/補查）

多為核心 claim UNVERIFIABLE（authoritative 來源沉默/衝突，依 refute-by-default 標記，非確定錯誤）：
`mentha_x_piperita_chocolate, nightshade, orange_mint, peaches, philodendron_spp_including_birkin, pretzels, raw_eggs__raw_egg_whites, raw_meat, scadoxus_spp, schlumbergera_spp, vitis__implied`。
判定依據在 `verify-localize-2026-06-25-p2.json` 各 slug 的 `verify`。處理：人工看 summary 決定是否改，或下一輪補查。

---

## 完成日誌（最新在上）

- 2026-06-26 (c) — **NEEDS_REVIEW 11/11 修正完成**（task wig1q79dc，~491K token）。症狀交叉污染清理 + isToxic 一致性 + raw_eggs toxic→cautious。0 SCHEMA enum 違規。摘要 `data/audits/p2-round3-needsreview-fix-2026-06-26.json`。至此 P2 149 筆（FAIL 16 + NEEDS_REVIEW 11）全數修正落 disk canonical。**caveat：部分 firestore/zh-TW 快取仍含舊值，待任務 D sync 重生。**
- 2026-06-26 (b) — **任務 B FAIL 修正完成**：16/16 事實修正（task wh9k16vjo，~655K token，外科式 Edit）。**7 筆 severity 方向修正**：peony safe→cautious、tradescantia_spathacea safe→cautious（漏報補正）；zephyranthes_drummondii cautious→safe、milk_and_dairy/persimmons/pine/pistachios/peanuts/potato_chips toxic→cautious（假警報降級）；pudding 修 isToxic/level 一致性。另修 nandina 學名/family/化合物、mentha 移除 pennyroyal 交叉污染肝毒、poppy 瞳孔矛盾、ragwort PA 化合物、raw_dough toxicParts/ADH 等。2 處 glossary key 對齊（peony Leaves→Leaf、potato_chips Hematologic→Hematological）。schema 驗證：16 筆 0 SCHEMA enum 違規（資料集既有 completeness shape 噪音 170/198 屬 K11/K16，非本批）。摘要 `data/audits/p2-round2-factual-fix-2026-06-26.json`。**全部僅寫 disk canonical，未碰 live Firestore（任務 D）。**
- 2026-06-26 (a) — **任務 B 完成**：P2 refute 補跑 54/54（task wsrpnfji9，~1.45M token，web-grounded refute-by-default）。對抗式覆蓋率達 **200/200（100%）**。合併進 p2.json（pending=0），結果存 `verify-localize-2026-06-26-p2-refute-round2.json` + FAIL 明細 `p2-refute-round2-fails-detail.json`。新發現 **16 FAIL**（7 筆 safe↔toxic disagreement）+ 11 NEEDS_REVIEW。：P2 refute 補跑 54/54（task wsrpnfji9，~1.45M token，web-grounded refute-by-default）。對抗式覆蓋率達 **200/200（100%）**。合併進 p2.json（pending=0），結果存 `verify-localize-2026-06-26-p2-refute-round2.json` + FAIL 明細 `p2-refute-round2-fails-detail.json`。新發現 **16 FAIL**（7 筆 safe↔toxic disagreement：peony/tradescantia_spathacea safe→toxic 漏報；zephyranthes_drummondii/milk_and_dairy/persimmons/pine/pistachios toxic→cautious/safe 假警報）+ 11 NEEDS_REVIEW。已啟動 `factual-fix-p2-round2.workflow.js`（task wh9k16vjo）修這 16 筆。
- 2026-06-25 (d) — §9 部分：基礎建設 commit 到分支 `content-audit-2026-06-25`（`04b7647`，14 檔：goal/scripts/audits/手冊/PROGRESS.md，**不含資料檔**、不動 main）。資料檔變更（事實28/glossary257/雜訊921/severity34）仍在 disk 未 commit，依 reconciliation 計畫由人工分組；Firestore sync 未做（任務 D）。
- 2026-06-25 (c) — 任務 A2：backfill 31 筆 live 條目的 severity（firestore→processed）+ unripened_pineapples override→cautious；255 檔驗證 0 違規；剩 9 disk-only dup（K11/K16）。
- 2026-06-25 (b) — P2 15 筆事實修正完成（task wg0saw146，摘要 `data/audits/p2-factual-fix-2026-06-25.json`）。發現 42 個 `*_processed` 缺 severity 欄位的資料缺口 → 新增任務 A2；已補 hummingbird_mint、lemon_mint → safe。
- 2026-06-25 (a) — 建立本手冊 + 複製可重用腳本進 `.agent/workflows/scripts/`。P1 全完成（審查+13 修正）；批次 glossary/雜訊已套用；P2 審查完成、refute 95/149。
