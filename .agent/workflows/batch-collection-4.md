---
description: Automated workflow to collect, process, and verify data for a batch of 4 plants
---

1. Identify the next 4 unchecked plants in `data/collection_status.md` and note their IDs (e.g. 77, 78, 79, 80).
2. Edit `batch_collect.py` to set `target_indices` to these IDs minus 1 (e.g. `[76, 77, 78, 79]`).
3. Run the collection script.
// turbo
python3 batch_collect.py
4. Process the collected data into JSON.
// turbo
python3 process_plants.py
5. Verify the data quality.
// turbo
python3 verify_plants.py
6. If verification fails, use the `/re-collect-failed` workflow to fix and re-verify. Repeat until all pass.
7. Sync the progress tracker.
// turbo
python3 sync_status.py
8. Commit the collected data.
// turbo
git add data/plants/ data/plants_processed/ data/collection_status.md data/completed_log.txt data/verification_report.json && git commit -m "feat: collect and process plants $(date +%Y-%m-%d) batch"
