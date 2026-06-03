# Translation Notes

This file records curator decisions that should feed the glossary and the next translation pass.

## Locked Style Rules

- Audience: Taiwan Traditional Chinese.
- 專有名詞格式：中文在前，括號裡寫英文。
  - Example: 灰安毒素 (grayanotoxins)
- Scientific names stay in Latin.
- `Action:` is translated as `處理方式：`.
- Body system labels should use the glossary values, not one-off translations.

## Editorial Translation Rules From A Pass

These rules come from the manually edited A entries. Follow them before applying glossary terms, so the output reads like Taiwan Traditional Chinese health content instead of sentence-by-sentence English.

### 1. Do not translate English `it` mechanically

English toxin entries often start follow-up sentences with `it`, `they`, `this`, or `these`. In Chinese, avoid repeated `它／牠／它們` when the referent is obvious. Use the plant/food name, a category noun, or omit the pronoun.

| English pattern | Preferred zh-TW move | Example |
|---|---|---|
| `It contains...` | Use `這種植物含有...`, `該植物含有...`, or name the toxin-bearing part. | `It contains insoluble calcium oxalate crystals...` → `它含有不溶性草酸鈣晶體...` is acceptable once, but prefer `葉子、莖和根...含有不溶性草酸鈣晶體...` when the part matters. |
| `It is toxic to cats...` | Make the risk direct. | `...but it is mildly toxic to cats` → `然而，它對貓有輕微毒性` or `但植物本身對貓有毒。` |
| `These needle-like crystals...` | Keep `這些` only when it improves clarity; otherwise describe the action. | `These needle-like crystals cause immediate mechanical injury...` → `貓咪咬到植物時，這些像細針一樣的結晶會立刻刺傷嘴巴和消化道裡柔軟的組織。` |

### 2. Rewrite passive voice into active or result-focused Chinese

English medical copy often uses passive constructions because the agent is less important. Direct passive translations usually sound stiff in Chinese. Prefer the natural trigger-result order: exposure happens first, then the symptom or injury occurs.

| English | Avoid | Preferred |
|---|---|---|
| `When a cat bites or chews any part of the plant, these crystals are forcibly ejected and physically penetrate...` | `這些晶體會被強制射出並物理性穿透...` | `貓咬下或咀嚼植物任何部位時，像細針一樣的結晶會立刻刺傷嘴巴和消化道裡柔軟的組織。` |
| `The colorful berries ... are particularly attractive to cats` | `彩色漿果被貓特別吸引` | `色彩鮮豔的果實對貓咪可能特別有吸引力。` |
| `Symptoms are typically self-limiting` | `症狀通常是自限性的` | `症狀通常會自行緩解。` |

### 3. Split long English sentences when Chinese needs breathing room

English entries often pack identity, appearance, toxin, mechanism, and risk into one sentence. In zh-TW, split when there are two or more ideas. Use short paragraphs for app detail copy when the risk explanation changes topic.

Example from Aloe Vera:

| English structure | zh-TW structure |
|---|---|
| `Aloe Vera is... but... The primary toxic agents are... concentrated in... along with... Cats have... causing...` | `蘆薈是一種...，但植物本身對貓有毒。透明的內層凝膠...但如果貓咪啃咬整片葉子...主要毒性成分是...；此外...。` Then a new paragraph: `貓咪代謝這些化合物的能力有限，因此...` |

### 4. Prefer concrete cause-and-effect wording over abstract nominal phrases

English often uses nouns like `exposure`, `ingestion`, `toxicity`, `reaction`, `effect`, and `mechanism`. Chinese should usually turn these into actions.

| English | Preferred zh-TW |
|---|---|
| `after exposure` | `接觸後` |
| `after ingestion` | `攝入後` or `誤食後` |
| `causes gastrointestinal irritation` | `會刺激腸胃道` |
| `produce cat-specific neurological effects` | `可能出現貓特別容易看到的神經症狀` |
| `pose the highest risk` | `風險最高` |

### 5. Keep labels compact and consistent

Safety notes should keep the label-colon rhythm, but labels should sound like zh-TW app copy, not literal headings.

| English label | zh-TW label |
|---|---|
| `Symptoms:` | `症狀：` |
| `Action:` | `處理方式：` |
| `Rapid onset:` | `快速發作：` |
| `Berries are an additional hazard:` | `漿果是額外危害：` |
| `Berries:` | `漿果：` |
| `Gel vs. latex:` | `凝膠 vs. 乳汁：` |
| `All parts toxic:` | `全株有毒：` |

### 6. Use Taiwan-friendly pet-owner language

Use clear household language for owners while keeping medical terms when they matter.

- Prefer `貓咪` in explanatory prose when the tone is owner-facing; `貓` is fine in compact labels and symptom text.
- Use `獸醫` or `就醫` instead of region-neutral or formal alternatives like `獸醫師照護` unless the sentence needs that formality.
- Use `聯絡獸醫`, `諮詢獸醫`, `請立即就醫`, or `請立即尋求獸醫協助` depending on urgency.
- Avoid Mainland-leaning or overly literal terms: prefer `資訊`, `症狀`, `攝入／誤食`, `接觸`, `精神不振`, `食慾不振`.

### 7. Translate plant/food names for recognition, not taxonomy alone

Use the most recognizable Traditional Chinese common name as the main `name`. Put English or Latin in parentheses only when it helps identification.

Examples:

| English name | Preferred zh-TW |
|---|---|
| `African Blue Lily` | `非洲百合` |
| `Allamanda` | `軟枝黃蟬` |
| `Black Velvet Alocasia` | `黑絲絨海芋` |
| `Bird's Nest Anthurium` | `鳥巢花燭` |
| `Aloe Vera` | `蘆薈` |

### 8. Preserve medical precision, but localize the explanation

Keep important toxicology terms, but pair them with readable Chinese when useful. For first mentions, use Chinese first and English or Latin in parentheses.

Examples:

- `不溶性草酸鈣晶體，也就是針晶體 (raphides)`
- `蘆薈素／蘆薈苷 (aloin/barbaloin)`
- `四氫大麻酚 (THC)`
- `百合屬 (Lilium) 和萱草屬 (Hemerocallis)`

### 9. Do not over-preserve awkward source artifacts

If the English source contains citation remnants, repeated headings, or broken notes, translate the useful meaning and omit the artifact.

Examples to clean:

- `sodas1`, `system4`, `1....`
- pasted heading fragments like `Excessive Drooling`, `Airway Obstruction and Dyspnea` inside a previous symptom's notes
- unfinished phrases such as `depending on the product);`

## Toxic Parts Tags

Toxic parts are limited to these 13 canonical tags. Use the Chinese label in zh-TW translation files.

| Canonical tag | zh-TW |
|---|---|
| Whole | 整個食物 |
| All parts of the plant | 全株有毒 |
| Leaf | 葉子 |
| Flower | 花 |
| Stem | 莖 |
| Root | 根 |
| Bulb | 球莖／球根 |
| Seed | 種子 |
| Fruit / berry | 果實 |
| Milky sap / latex | 乳狀汁液 |
| Pod | 種莢 |
| Skin | 果皮 |
| Flesh | 果肉 |

Note: `Whole` is currently used for food entries. If you prefer another zh-TW label, update this line and the glossary.

## Glossary Decisions From A Pass

| English | zh-TW |
|---|---|
| Variable (typically within hours of ingestion). | 不一定，但通常在攝入後幾小時內 |
| Rapid (secondary to swelling). | 快速（在腫脹之後發生）。 |
| Cats are sometimes attracted to its grass-like foliage, so households with this plant should monitor access. | 貓有時會被非洲百合像草一樣的葉子吸引，因此有此植物的家庭應監控接觸情況。 |
| Gastrointestinal Upset | 腸胃不適 |
| Neurological Impairment | 神經功能受損 |
| Hypothermia | 失溫 |
| Metabolic Acidosis | 代謝性酸中毒 |
| Respiratory Depression | 呼吸抑制 |
| Acute Organ Damage | 急性器官損傷 |
| secondary effect | 間接影響 |
| vomiting | 嘔吐 |
| diarrhea | 腹瀉 |
| Lethargy | 精神不振或嗜睡 |
| Hypoglycemia | 低血糖 |
| Anorexia | 食慾不振 |
| endocrine | 內分泌 |
| Hypotension | 低血壓 |
| Cardiac Arrhythmias | 心律不整 |
| gastrointestinal | 腸胃道 |
| Renal | 腎臟 |
| Cardiac | 心血管 |
| Seizures | 癲癇 |
| ataxia (stumbling) | 共濟失調（走路踉蹌） |
| Neurological | 神經系統 |

## Body System Labels

| English | zh-TW |
|---|---|
| Cardiac | 心血管 |
| Gastrointestinal | 腸胃道 |
| Respiratory | 呼吸系統 |
| Neurological | 神經系統 |
| Dermal | 皮膚 |
| Endocrine | 內分泌 |
| Hematological | 血液系統 |
| Hepatic | 肝臟 |
| Metabolic | 代謝 |
| Renal | 腎臟 |
| Other | 其他 |

## B Pass Generated For Review

Generated on 2026-05-28 into `data/site/zh-TW/` and mirrored to `data/site/firestore/zh-TW/`.

| Entry | Slug | Review notes |
|---|---|---|
| Basil | `basil` |  |
| Begonia | `begonia_spp` |  |
| Bell Pepper / Chili Pepper / Ornamental Pepper | `capsicum_annuum` |  |
| Bird of Paradise | `strelitzia_reginae` |  |
| Bird’s Nest Anthurium | `anthurium_hookeri` |  |
| Bittersweet | `celastrus_scandens` |  |
| Black Velvet Alocasia | `alocasia_reginula` |  |
| Blood Lily | `scadoxus_spp` |  |
| Bluebells | `hyacinthoides_nonscripta` |  |
| Bones | `bones` |  |
| Boston Fern | `boston-fern` |  |

Add any corrections or new glossary terms in the review notes column before the next pass.

New updates:
Toxic Parts Tags 新增 Pods，對應中文種莢
