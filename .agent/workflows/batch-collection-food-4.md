---
description: Automated workflow to collect, process, and verify data for a batch of 4 foods
---

1. Run the collection script. The script automatically identifies the next 4 unchecked foods in `data/collection_status_food.md`.
// turbo
python3 batch_collect_food.py
2. Process the collected data into JSON.
// turbo
python3 process_foods.py
3. Verify the data quality.
// turbo
python3 verify_foods.py
4. If verification fails, use the `/re-collect-failed` workflow to fix and re-verify. Repeat until all pass.
5. Sync the progress tracker.
// turbo
python3 sync_status_food.py
6. Commit the collected data.
// turbo
git add data/foods/ data/foods_processed/ data/collection_status_food.md data/completed_log_food.txt data/verification_report_food.json && git commit -m "feat: collect and process foods $(date +%Y-%m-%d) batch"
