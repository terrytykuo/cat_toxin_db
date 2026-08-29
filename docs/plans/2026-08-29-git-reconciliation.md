# cat_toxin_db Git Reconciliation — Implementation Plan

> **狀態：✅ 已於 2026-08-29 執行完畢。** 結果摘要見 `PROGRESS.md` 的「2026-08-29 (c)」條目。
>
> 執行結果：驗證閘門全過（JSON 826 檔 bad=0、機密掃描空、測試全綠）；disk-vs-live 比對 compared=489 / skipped=60 / **mismatch=113，逐字元查證確認全為空白差異**（`\n\n`→` ` 段落壓平），name/severity mismatch 皆為 0，故依「僅 severity mismatch 才 abort」放行。5 組 commit：`154add3`(244) / `e2e927b`(228) / `d9d94a7`(354) / `0b6b7a2`(3) / `140f1a6`(3) = 832 檔。`--ff-only` 併回 main 成功並 push origin；`mewguard_site` commit `0382049` 已 push。
>
> **與計劃的兩處出入（皆為計劃本身的算術／內部矛盾，非執行偏離）：**
> 1. Task 3／Task 4 預期的「~326／~356 檔」把 untracked 重複計入（盤點的 `61 M + 4 ??` 中 61 已含那 4 筆）。實際 228／354，組成與路徑完全符合預期。
> 2. Task 5 驗收要求 `git status --porcelain` 為 0 行，但 Task 8 又明確 `git add` 本計劃檔——本計劃檔在 Task 5 當下必然仍是唯一 untracked（1 行）。已依 Task 8 的明確指示處理。

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 把 `cat_toxin_db` 分支 `content-audit-2026-06-25` 上累積的 832 個未 commit 檔案（729 M + 103 ??）依語意分成 5 組 commit、驗證後 fast-forward 併回 main 並 push；同時把 `mewguard_site` 的 `toxins.generated.ts` 收尾 commit。

**Architecture:** 先跑 read-only 驗證閘門（JSON 合法性、機密掃描、disk-vs-live 抽樣比對），通過後依「canonical 資料 → legacy 快取 → firestore-shaped 快取 → 工具 → 文件」順序分組 commit，每組用目錄 pathspec 精準 stage 並檢查 `--cached --stat`，最後 `--ff-only` 併 main。

**Tech Stack:** git（pathspec staging、ff-only merge）、Python3（驗證 one-liner）、node --test。

---

## 盤點快照（2026-08-29 已確認，執行前重新確認數字級別一致即可）

```
分支：content-audit-2026-06-25（領先 main 12 commits；main..HEAD=12、HEAD..main=0 → 可 fast-forward）
remote：origin = github.com/terrytykuo/cat_toxin_db.git

dirty 832 = 729 modified + 103 untracked：
  data/plants_processed/        185 M                  ← 內容審計後的 canonical
  data/foods_processed/          57 M                  ← 同上
  data/site/en/                  61 M + 4 ??           ← legacy EN site 快取
  data/site/zh-TW/              166 M + 94 ??          ← legacy zh 快取（審計修正的 zh 主要落點）
  data/site/firestore/          354 M + 2 ??           ← firestore-shaped 快取（2026-08-29 build:toxins 已從 live 重生）
  data/site/translation_glossary.json  1 M
  data/verification_report.json / _food.json  2 M      ← schema 驗證產出
  admin/scripts/                 3 ??                  ← check-firestore-sync / upload-local-translations / upload-missing-entries（歷史腳本，一直沒 commit）
  AGENTS.md, CLAUDE.md, admin/translation.md  3 M      ← 小型文件更新（合計 +40/-8 行）

mewguard_site（獨立 repo，main）：只有 src/data/toxins.generated.ts 1 M
```

## 安全事實（已查證）

- Firebase 憑證檔在 `/Users/sweetp/Workspace/`（**repo 外**）；`.env.local`/`admin/.env.local` 都被 .gitignore 覆蓋。
- untracked 103 檔全部是 `.json`/`.md`/`.mjs`，無二進位/機密檔。
- live Firestore 是 source of truth；disk 內容已於 2026-06-28（EN 194 筆）與 2026-08-29（zh 185+2 筆、EN 2 筆）推送完畢並 read-back 複驗過。`data/site/firestore/{en,zh-TW}/` 是 2026-08-29 `build:toxins` 之後從 live 重生的快照。

## ⚠️ 規則

1. **絕不 `git add -A` / `git add .`**。每組都用計劃指定的 pathspec，add 後必看 `git diff --cached --stat` 的檔數與目錄是否符合預期，發現不對就 `git reset` 重來。
2. **不 rebase、不 squash、不改既有 commit**。分支歷史原樣保留，merge 用 `--ff-only`（已確認 main 零新 commit；若 ff 失敗表示狀況變了，停下回報）。
3. 不動 `../cat_toxin_app`（它有 2 檔 schema sync 未 commit，在 main 上，**本計劃範圍外**，最終回報提醒即可）；不動上層 `MewGuard` root repo 的 dirty 檔。
4. 驗證閘門任何一項 FAIL → 停止，不 commit，回報明細。
5. 日期寫死 `2026-08-29`。

---

## Task 1: 驗證閘門（read-only，全過才准 commit）

**Step 1: JSON 合法性（所有 dirty 的 .json）**

```bash
cd /Users/sweetp/Workspace/MewGuard/cat_toxin_db
git status --porcelain | sed 's/^...//' | grep '\.json$' | python3 -c "
import json,sys
bad=[]
for p in (l.strip() for l in sys.stdin):
    try: json.load(open(p))
    except Exception as e: bad.append((p,str(e)[:80]))
print('json checked; bad =', len(bad))
[print(' ',p,e) for p,e in bad]
assert not bad"
```
Expected: `bad = 0`。

**Step 2: 機密掃描**

```bash
git status --porcelain | grep '^??' | grep -viE '\.(json|md|mjs)$' ; echo "non-data untracked ↑（應為空）"
git status --porcelain | sed 's/^...//' | grep -iE 'key|secret|credential|service.?account|\.env' ; echo "secret-like paths ↑（應為空）"
```
Expected: 兩個清單皆空。

**Step 3: disk-vs-live 抽樣一致性（canonical vs firestore/en 快取）**

比對 `data/site/firestore/en/*.json`（live 快照）與同 slug 的 `*_processed`：凡 disk 檔頂層有該欄位者，`name`/`severity`/`description` 必須相等。混合 schema 檔（頂層缺欄位）跳過並計數。

```bash
python3 - <<'PY'
import json,glob,os
mismatch=[]; skipped=0; compared=0
for p in glob.glob('data/site/firestore/en/*.json'):
    slug=os.path.basename(p)[:-5]
    live=json.load(open(p))
    dp=None
    for d in ['data/plants_processed','data/foods_processed']:
        # persea_americana/malus_spp 同名衝突：以 live category 決定目錄
        cand=f'{d}/{slug}.json'
        if os.path.exists(cand):
            dp=cand
            if slug in ('malus_spp','persea_americana'):
                want='data/foods_processed' if live.get('category')=='food' else 'data/plants_processed'
                dp=f'{want}/{slug}.json' if os.path.exists(f'{want}/{slug}.json') else cand
            break
    if not dp: continue
    disk=json.load(open(dp))
    for f in ('name','severity','description'):
        if f not in disk or disk[f] in (None,''):
            skipped+=1; continue
        compared+=1
        if disk[f]!=live.get(f): mismatch.append((slug,f))
print(f'compared={compared} skipped(mixed-schema)={skipped} mismatch={len(mismatch)}')
[print(' MISMATCH',s,f) for s,f in mismatch[:30]]
PY
```
Expected: `mismatch=0`。已知例外：`malus_spp`（K11/K16 刻意保留 live 原樣、disk foods 版不同——若它出現在 mismatch 屬預期，記錄後放行；**其他任何 severity mismatch 一律 abort**）。

**Step 4: 單元測試 + schema check**

```bash
python3 -m unittest discover -s pipeline -p 'test_*.py'
(cd admin && node --test scripts/lib/zhtw-l10n.test.mjs)
(cd schemas && npm run check)
```
Expected: 全 pass / `Schema artifacts already up-to-date`。

---

## Task 2: Commit A — canonical 資料（~244 檔）

```bash
git add data/plants_processed data/foods_processed data/verification_report.json data/verification_report_food.json
git diff --cached --stat | tail -3   # 應 ~244 files, 全在上述路徑
git commit -m "content: 內容審計後的 canonical 資料（2026-06-25 → 2026-08-29 全部批次）

對抗式查證 200/200 的落地結果：P1 13 筆 + P2 42 筆事實修正（含 safe↔toxic 翻轉）、
glossary 正規化、NotebookLM 雜訊清理（確定性 + LLM pass 1929 欄位）、severity backfill、
sweet_pea→cautious / lemon_mint 交叉污染清除。內容已全部推送 live Firestore 並複驗
（EN 2026-06-28 194 筆 + 2026-08-29 2 筆；provenance 見 data/audits/）。

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

**驗收**：`git status --porcelain | grep 'data/plants_processed\|data/foods_processed'` 為空。

## Task 3: Commit B — legacy site 快取（~326 檔）

```bash
git add data/site/en data/site/zh-TW data/site/translation_glossary.json
git diff --cached --stat | tail -3
git commit -m "data(site): legacy site 快取同步審計結果（en/zh-TW/glossary）

data/site/zh-TW 為審計期間 zh 修正的主要落點（glossary 正規化 257 處、P1 改寫、
NEEDS_RETRANSLATION 重寫、sweet_pea/lemon_mint 2026-08-29 裁定版）；內容已推送
live l10n.zh-TW 並複驗（185+2 筆，mismatch 0）。

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

## Task 4: Commit C — firestore-shaped 快取（~356 檔）

```bash
git add data/site/firestore
git diff --cached --stat | tail -3
git commit -m "data(generated): firestore-shaped 快取重生為 live 快照（2026-08-29）

build:toxins 於 zh-TW 回寫完成後重生：en/ 直接來自 live、zh-TW/ 經 reconcile
（write-from-legacy 140+2）、sync_progress translation pending=0。

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

## Task 5: Commit D+E — 歷史工具腳本 + 文件

```bash
git add admin/scripts/check-firestore-sync.mjs admin/scripts/upload-local-translations.mjs admin/scripts/upload-missing-entries.mjs
git commit -m "tooling: 補 commit 歷史 Firestore 同步腳本（2026-06 起一直 untracked）

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"

git diff AGENTS.md CLAUDE.md admin/translation.md   # 快速目視：應為小型文件更新，無意外內容
git add AGENTS.md CLAUDE.md admin/translation.md
git commit -m "docs: AGENTS/CLAUDE/translation 補充 firestore bridge 與翻譯流程說明

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

**驗收**：`git status --porcelain` **完全為空**（0 行）。若還有剩餘檔案：停下，列出並回報（不要硬塞進任一組）。

## Task 6: 併回 main + push

```bash
git checkout main
git merge --ff-only content-audit-2026-06-25
git log --oneline -3          # HEAD 應 = 分支 HEAD
git push origin main
git push origin content-audit-2026-06-25
```
Expected: ff merge 成功（若失敗 → abort 回報，不用 no-ff/rebase 硬解）；push 成功。留在 main。

## Task 7: mewguard_site 收尾

```bash
cd /Users/sweetp/Workspace/MewGuard/mewguard_site
git status --porcelain        # 應只有 src/data/toxins.generated.ts
git add src/data/toxins.generated.ts
git commit -m "data(generated): rebuild toxins.generated.ts after zh-TW l10n writeback (200 toxins, zh pending=0)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
git remote -v && git push origin main   # 有 remote 才 push；無 remote 則略過並回報
```

## Task 8: 記錄 + 最終回報

1. `cat_toxin_db/PROGRESS.md` 加一條：reconciliation 完成、各組 commit hash、main 已 ff + push。
2. `docs/CONTENT_AUDIT_RESUME.md`：「§9 記錄 + commit」勾選為完成；git 狀態段落更新為「已併回 main，working tree clean」。
3. 這兩個檔案（+ 本計劃檔的結果標註）在 **main** 上直接 commit：
   ```bash
   git add PROGRESS.md docs/CONTENT_AUDIT_RESUME.md docs/plans/2026-08-29-git-reconciliation.md
   git commit -m "docs: git reconciliation 完成記錄 2026-08-29

   Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
   git push origin main
   ```
4. 最終回報：驗證閘門各項結果、每組 commit hash 與檔數、ff/push 結果、mewguard_site 結果、以及範圍外提醒（`cat_toxin_app` 的 2 檔 schema sync、上層 MewGuard root repo 的 dirty 檔未動）。
