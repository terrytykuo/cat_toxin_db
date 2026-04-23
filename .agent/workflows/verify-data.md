---
description: Audit all collected plant data for quality issues, then fix and re-collect any failures
---

# /verify-data — Data Verification & Fix Workflow

Run this workflow after collecting or re-processing plant data to catch and fix quality issues.

// turbo-all

## Step 1 — Verify raw data

```bash
cd /Users/sweetp/Workspace/cat_toxin_db && python3 verify_raw.py
```

## Step 2 — Re-parse raw into processed JSON

```bash
cd /Users/sweetp/Workspace/cat_toxin_db && python3 process_plants.py
```

## Step 3 — Verify processed data (3-tier: completeness, schema, cleanliness)

```bash
cd /Users/sweetp/Workspace/cat_toxin_db && python3 verify_plants.py
```

Review the generated report at `data/verification_report.json` and the stdout summary.

## Step 4 — Fix failures

Categorize each failure and apply the appropriate fix:

| Failure type | Symptom | Fix |
|---|---|---|
| **Missing raw data** | `raw_responses.<key>` is null or short | Re-query NotebookLM (see below) |
| **Bad parsing** | Raw data exists but processed JSON is wrong/empty | Fix regex in `process_plants.py`, then re-run from Step 2 |
| **Source quality** | Processed data is vague or incomplete | Re-query that specific round with a follow-up prompt |

### Re-collecting missing raw data

Edit `batch_collect.py` to set `target_indices` to only the **failed plant IDs minus 1**, then:

```bash
cd /Users/sweetp/Workspace/cat_toxin_db && python3 batch_collect.py
```

Then re-run from Step 2. Repeat until all targeted plants pass.

## Step 5 — Sync and commit

```bash
cd /Users/sweetp/Workspace/cat_toxin_db && python3 sync_status.py
git add data/plants/ data/plants_processed/ data/collection_status.md data/verification_report.json && git commit -m "fix: re-collect failed plants $(date +%Y-%m-%d)"
```
