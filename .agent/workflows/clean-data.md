---
description: >
  Clean all processed plant JSON files using Claude API (Haiku).
  Removes inline citation numbers, bullet characters, and boilerplate text.
  Reads from data/plants_processed/, writes to data/plants_cleaned/.
  Process in batches of 10 (~16 batches total, ~$0.73 total cost).
---

## Overview

| Item | Value |
|---|---|
| Input | `data/plants_processed/` (154 files) |
| Output | `data/plants_cleaned/` |
| Progress tracker | `data/clean_progress.json` |
| Batch size | 10 files per API call |
| Total batches | ~16 |
| Model | `claude-haiku-4-5-20251001` |
| Est. total cost | ~$0.73 |

**Context window note:** Each batch sends ~25k tokens to the API.
Do NOT increase batch size beyond 15 without re-checking token counts.

---

## Steps

### 1. Check prerequisites

Ensure `ANTHROPIC_API_KEY` is set:

```
echo $ANTHROPIC_API_KEY
```

If empty, set it before proceeding.

### 2. Check current progress

// turbo
python3 clean_plants.py --status

If `Cleaned: 154`, all done — skip to step 6.

### 3. Run one batch

// turbo
python3 clean_plants.py --batch-size 10

Expected output:
```
Processing 10 files  (0/154 already done)

  ✓  abrus_precatorius.json
  ✓  adenium_obesum.json
  ...

Batch done. 10/154 cleaned, 144 remaining.
```

### 4. Spot-check the cleaned output

After the first batch, verify one file looks correct:

// turbo
python3 -c "
import json
d = json.load(open('data/plants_cleaned/abrus_precatorius.json'))
print(json.dumps(d, indent=2, ensure_ascii=False))
" | head -60

Look for:
- [ ] No trailing numbers like `synthesis1.`
- [ ] No `•` bullet characters
- [ ] `null` where boilerplate text was
- [ ] No `"in cats:"` prefix in toxin descriptions
- [ ] Same JSON structure as input

If the output looks wrong, stop and investigate before continuing.

### 5. Process all remaining batches

Repeat step 3 until all files are cleaned. Check progress after each batch:

// turbo
python3 clean_plants.py --batch-size 10

Continue running this command until you see `remaining: 0`.

If any batch fails, retry it:

// turbo
python3 clean_plants.py --retry-failed

### 6. Final verification

Run a full audit on the cleaned files:

// turbo
python3 -c "
import json, glob, re

boilerplate = ['not provided', 'not specified', 'based on the provided', 'the sources do not']
cite_re = re.compile(r'\w\d+[.\s]')
bullet_re = re.compile(r'[•◦]')

issues = []
for f in sorted(glob.glob('data/plants_cleaned/*.json')):
    d = json.load(open(f))
    text = json.dumps(d)
    name = d.get('plant', {}).get('common_name', f)

    if any(b in text.lower() for b in boilerplate):
        issues.append(f'[boilerplate] {name}')
    if cite_re.search(text):
        issues.append(f'[citation]   {name}')
    if bullet_re.search(text):
        issues.append(f'[bullet]     {name}')

if issues:
    print(f'Issues found ({len(issues)}):')
    for i in issues: print(f'  {i}')
else:
    print(f'All clean! {len(list(glob.glob(\"data/plants_cleaned/*.json\")))} files verified.')
"

If issues remain, re-run `--retry-failed` for affected files or investigate manually.

### 7. Commit

// turbo
git add data/plants_cleaned/ data/clean_progress.json && git commit -m "feat: clean plant data via Claude API $(date +%Y-%m-%d)"
