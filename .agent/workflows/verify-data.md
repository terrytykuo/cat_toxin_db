---
description: Audit all collected plant data for quality issues before database insertion
---

# /verify-data — Data Verification Workflow

Run this workflow after collecting or re-processing plant data to catch quality issues.

// turbo-all

## Steps

1. Run the raw data audit to identify plants with incomplete collection:
```bash
cd /Users/sweetp/Workspace/cat_toxin_db && python3 verify_raw.py
```

2. Re-parse all raw data into processed JSON (picks up any raw fixes):
```bash
cd /Users/sweetp/Workspace/cat_toxin_db && python3 process_plants.py
```

3. Run the processed data verification (3-tier: completeness, schema, cleanliness):
```bash
cd /Users/sweetp/Workspace/cat_toxin_db && python3 verify_plants.py
```

4. Review the generated report at `data/verification_report.json` and the stdout summary.

5. For any plants that FAIL:
   - If the issue is **missing raw data** (flagged by step 1): re-run `batch_collect.py` targeting those plants
   - If the issue is **bad parsing** (data exists in raw but processed is wrong): improve regex patterns in `process_plants.py`, then re-run from step 2
   - If the issue is **source quality** (the NotebookLM answer was vague or incomplete): re-query that specific round for the plant

6. Repeat from step 1 until all plants PASS.
