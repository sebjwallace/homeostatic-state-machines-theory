# Sketch 20: columns (dimensionality expansion)

Sketch 19 with each code unit turned into a **column of 8 cells**. Run with `CELLS=3200 LEARN=1 TOPIC=0 node sketch.js` (about 30 s for seeds 1–5). The sketch 17/19 baselines were re-run from `sketch19.js` in the same folder. The outputs are in the `run-*.txt` files.

## What changed (fixed before running, nothing tuned afterwards)

- **Budget.** Same total cells: 3200 = 400 columns × 8. A smaller budget is 1600 = 200 × 8. A code is still K = 8 *columns*, and sketch 19's learnt-code rule runs unchanged over columns (4 own + 4 by affinity).
- **Cell choice.** For each of the word's columns, the cell with the highest input from the previous active cells plus the held-state conjunctions fires, *if* that input is ≥ THETA = 4 (primed).
  - Otherwise the column **bursts**.
  - During learning, the least-used cell in the column is recruited (ties broken by excitability).
  - With learning off, the most-used cell fires.
- **Heat** = 1 − (number of the word's columns that were both predicted *and* primed) / 8. A burst therefore counts as heat.
- **Links** run from active cells to active cells (symbol route and context route). Conjunctive context codes are built from *cells*, so the subject, topic and sequence states are cell-specific.
- **Prediction rule, fixed in advance.** Columns that contain a primed cell (input ≥ THETA) rank first, by that cell's input (cell level). The remaining columns rank by summed column input (column level). The top 8 columns are decoded to a word. "Wrong" (depression) applies only to the cells predicted at cell level.
- **Measurement only.** For `j0`, `c5` and `o5` I log the cells used per role. A diagnostic (`DIAG=1`, added after the main runs) checks whether different objects in the same slot use the same cell in shared columns.
- **Bursts.** The sketch fires one recruited cell, not all 8 at once. Burst = heat + recruitment, so "all cells active" is represented only through heat, not as a learning input. This is a simplification.

## Comparison (5 seeds pooled; learning off at probe)

| test | s17 random | s19 learnt | **col 3200** | **col 1600** | col 3200 random codes | s19 + topic | col 3200 + topic | col 1600 + topic |
|---|---|---|---|---|---|---|---|---|
| overlap C×C / C×heldC / O×heldO / R×R (column level, of 8) | .02/.04/.02/.03 | 2.6/2.4/1.6/3.6 | 2.5/2.4/1.7/3.6 | 2.6/2.6/1.7/3.4 | .13/.16/.17/.47 | = s19 | = col 3200 | = col 1600 |
| cross-kind C×O | .02 | .04 | .20 | .32 | .16 | | | |
| **held-out C → room** (all / hard) | 33 / 40 | 80 / 100 | **100 / 100** | 80 / 100 | 27 / 40 | 73 / 87 | 80 / 100 | 100 / 100 |
| held-out O → container (all / hard) | 40 / 65 | 55 / 70 | 75 / 85 | 60 / 65 | 60 / 55 | 60 / 60 | 85 / 95 | 70 / 80 |
| seen O → container | 100 | 78 | 83 | 78 | 98 | 88 | 90 | 95 |
| **test chains → Y (episode recall)** | **98** | **50** | **52** | **58** | 86 | 46 | 46 | 40 |
| train chains → Z (memorised) | 88 | 56 | 46 | 40 | 86 | 54 | 48 | 32 |
| control Y in → Z (plain fact) | 100 | 88 | 68 | 74 | 100 | 82 | 76 | 84 |
| L2 test → Z (no quiet / in context) | 0 / 0 | 4 / 4 | 4 / 4 | 6 / 6 | 6 / 6 | 8 / 10 | 6 / 10 | 2 / 10 |
| replays running X…Y…Z | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| pairing links hard (% h≥3) | 14 | 37 | 35 | 39 | 18 | 37 | 36 | 41 |
| kind heat at slot: normal / break #1 | .10/.97 | .50/.97 | .40/.93 | .30/.93 | .17/.88 | .28/1.0 | .20/.95 | .33/.90 |
| person in slot after break (quiet changes nothing in any run) | .19 | .21 | .20 | .19 | .21 | .21 | .19 | .18 |

The held-out sets are small: 15 containers and 20 objects. Steps of 5–7 points are noise.

## The ambiguous word `j0` (col 3200, no topic)

- **Column level.** Mean overlap is 2.1 with containers and 0.6 with objects. Per seed, objects / containers: 0.1/3.3, 1.7/0.0, 0.1/3.6, 0.8/1.2, 0.5/2.4.
  - Seed 4 is mildly graded, but the rest are still mostly winner-take-all. That is the same learnt-code rule as sketch 19, and the same outcome.
  - At 1600 cells, overlaps with both kinds rise a little (heldO 0.3–1.0 in every seed), but that is largely crowding: cross-kind C×O also doubles.
- **Cell level.** Of `j0`'s 8 columns, used as an object vs as a container, 4 of 8 have a different typical cell in the two roles.
  - That is less than the controls: an unambiguous container in "opened the ___" vs "in the ___" differs in 7 of 8, and an object as subject vs in "has a ___" differs in 8 of 8.
- **So cells do split by context, but not specially for meaning.** Any change of preceding frame gets new cells. `j0` is not a word that shares columns with both kinds and swaps cells; it is a container-ish word whose cells vary with the frame, like every other word.

## Diagnostic: why recall does not recover

Measurement only, seeds 1–3, run after the main results. Take two *different* objects that are both subject of "in". Their shared columns number 1.47 per pair, and their shared *cells* also number 1.47.

In a shared column, different words in the same context fire **the same cell**: the cell encodes the context, and the context is identical. So the subject state of `x7` in `the x7 is in the ___` still shares half its cells with every other object in that frame. That is exactly the blur sketch 19 had, and the subject × slot → Y link leaks across the kind just as before.

## What it suggests

- **Columns do not remove the trade-off.**
  - Kinds generalise as well as sketch 19 or slightly better: held-out containers → room 80–100%, objects 60–85%.
  - Episode recall stays at sketch 19's level: test → Y 52% at 3200, 58% at 1600, against 98% for random codes.
  - The plain fact Y → Z gets *worse*: 68–74%, against 88% and 100%.
  - Memorised chains also drop: 40–46%, against 56% and 88%.
- **The mechanism separates contexts, not individuals.** Cell choice is driven by the context, so two words of the same kind in the same frame converge on the same cells. Episode recall needs the *identity* of X (which object), and context cells cannot provide it. In this design only the 4 own columns carry identity, which is the same as sketch 19.
- **Columns cost precision elsewhere.** Hard links (h ≥ 3) on "template" links fell from 100% to 92%, and the minimum hardness of `(in,the)`→container fell from 14 to about 1.4. Every new cell context starts its links from zero, so experience is split across cells, and some links stay soft and noisy. That probably explains why the world fact Y→Z degrades.
  - Random codes with columns (no learnt codes) give the same pattern in miniature: recall falls 98 → 86% and hardness falls.
- **Smaller budget (1600):** much the same. Kinds hold, recall is 58%, and cross-kind crowding is a bit higher. The topic state again does nothing reliable.
- **Level 2 and the break test are unchanged.** Level 2 is about 0–10%, replay never runs X…Y…Z, and a broken template adds about 20% person-in-slot without melting.

## Verdict

As built, columns keep the generalisation and do not bring back episode recall. The trade-off is still there, and it is a little worse for plain facts. The idea's premise was "cells carry context". That turned out true, but the episodic blur in sketch 19 is a blur of *identity within the same context*, and context cells don't touch it.

A version that could work would make the cell choice depend on something word-specific, such as the word's own columns or a per-word seed in the recruit rule, so that `key` and `cup` in the same frame pick different cells in their shared columns. That moves toward giving each word its own cells inside shared columns, which is just a sparser episodic code under a different name. That is a design decision for the owner, not something to tune here.

## Ways it could be fooling us

- **THETA = 4 was a guess.** If priming rarely reaches threshold, most columns burst and recruit, and the cell structure is mostly "least-used" churn. I did not measure the burst rate. The cell-sharing diagnostic suggests priming works (same frame → same cell), but a different THETA could change how fast contexts split.
- **The burst is simplified.** One recruited cell fires, not all 8. In an HTM-style burst all cells fire and the next step's links form from all of them. That might change learning dynamics, especially for novel episodes.
- **Cells are chosen from the full context, including the subject conjunction**, which already contains X's cells. A word-specific route therefore existed in principle. It did not dominate the choice in shared columns, because the sequence (prev × cur) input is larger. A different weighting is a different design, not tested.
- **Small n and noisy level-1 numbers** (n = 15 and 20). The "col 3200 beats s19 on held-out objects" difference (75 vs 55) is within noise, and the topic rows jump around by ±15 points with no consistent direction.
- **The diagnostic was added after seeing the results**, and only for seeds 1–3 and one role (subject of "in"). It explains the result, but it was not a pre-registered test.

---

# Sketch 20b: assembly columns (the owner's intended design)

`sketch-asm.js` is built from `sketch19.js`. Run it with `CELLS=3200 GROW=0 LEARN=1 TOPIC=0 node sketch-asm.js` (about 40 s). Outputs are in `run-asm*.txt`. The first version and its runs above are kept as they were.

## The error in version 1, and what changed

In version 1 the cell within a column was chosen by the *context*. So two words in the same frame fired the same cell, and columns separated frames, not individuals. The diagnostic showed objects in the same frame sharing 1.47 columns and 1.47 cells.

This version follows the owner's design. Settings were fixed before running, and nothing was changed after.

- **Columns = meaning.** The learnt code is sketch 19's rule over 400 (or 200) columns: 4 own columns + 4 by affinity.
- **Cells = the assembly, chosen per word, not per context.** When a word acquires a column, it claims the least-owned cell in it (ties broken by excitability). Those 8 cells *are* its assembly from then on.
  - If the learnt rule moves the word to a new column, it claims a cell there and releases the old one. Links stay where they are.
  - `GROW=1`: if every cell in the column is already owned, a fresh cell is added (columns start at 8).
- **Context links to the assembly cells.**
  - Every presynaptic set is read at two levels: the word's assembly cells (identity) and its columns (kind).
  - Held-state conjunctions (sequence pair, subject, topic) are built at both levels: cells × cells and columns × columns, with separate salts.
  - Postsynaptic targets are always assembly cells.
- **Combination rule (changed from v1, stated here).**
  - Cell level: if some word's assembly has ≥ 4 of its 8 cells primed (input ≥ THETA = 4), the prediction *completes* to that whole assembly. If several qualify, the one with the largest total input wins.
  - Column level: otherwise, take the top 8 columns by summed input and decode over columns.
  - Heat = 1 − overlap of the predicted cells with the actual assembly cells.
- **Simplification.** "Assembly cells wired to each other" is implemented as this completion rule (≥ half the assembly primed → all of it). There are no explicit learnt intra-assembly links.

## Comparison (5 seeds pooled; learning off at probe)

| test | s17 random | s19 learnt | col v1 3200 | **asm 3200** | asm 1600 | asm 3200 grow | asm 1600 grow | asm 3200, random codes | asm 3200 + topic |
|---|---|---|---|---|---|---|---|---|---|
| **same-frame objects: shared columns / shared cells (per pair)** | .02 / – | 1.31 / – | 1.47 / **1.47** | 1.52 / **0.09** | 1.46 / 0.08 | 1.52 / 0.00 | 1.46 / 0.00 | .16 / 0 | 1.52 / .09 |
| overlap C×C columns / cells (of 8) | .02 | 2.6 | 2.5 / – | 2.5 / .11 | 2.6 / .13 | 2.5 / 0 | 2.6 / 0 | .13 / 0 | 2.5 / .11 |
| **held-out C → room** (all / hard) | 33 / 40 | 80 / 100 | 100 / 100 | **100 / 100** | 67 / 73 | 87 / 100 | 67 / 87 | 0 / 33 | 87 / 100 |
| held-out O → container (all / hard) | 40 / 65 | 55 / 70 | 75 / 85 | **90 / 95** | 80 / 90 | 60 / 90 | 65 / 85 | 45 / 50 | 60 / 70 |
| seen O → container | 100 | 78 | 83 | **100** | 100 | 100 | 100 | 100 | 95 |
| **test chains → Y (episode recall)** | 98 | 50 | 52 | **88** | 92 | 84 | 86 | 92 | 72 |
| train chains → Z (memorised) | 88 | 56 | 46 | **98** | 98 | 98 | 98 | 100 | 98 |
| plain fact Y → Z | 100 | 88 | 68 | **100** | 100 | 100 | 100 | 100 | 100 |
| L2 test → Z (plain / premises in context) | 0 / 0 | 4 / 4 | 4 / 4 | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 | 2 / 4 |
| replays running X…Y…Z | 1 | 0 | 0 | 1 | 0 | 4 | 1 | 1 | 0 |
| pairing links hard (% h≥3) | 14 | 37 | 35 | 20 | 22 | 17 | 19 | 16 | 20 |
| template links hard (%) | 100 | 100 | 92 | 100 | 100 | 100 | 100 | 100 | 100 |
| kind heat at slot: normal / break #1 | .10/.97 | .50/.97 | .40/.93 | 0/1.0 | 0/1.0 | 0/1.0 | 0/1.0 | 0/1.0 | 0/1.0 |
| person in slot after break (quiet: no change) | .19 | .21 | .20 | .19 | .20 | .20 | .21 | .22 | .20 |

Other numbers:
- Predictions answered at cell level (completion): 99–100% in training steps and 100% in probes.
- Assembly cells owned by more than one word: 19% (3200), 26% (1600), 0% with GROW (111–138 cells grown per seed).
- Held-out sets are small (n = 15 containers, 20 objects), so steps of 5–7 points are noise.

## The ambiguous word `j0`

- **Columns are the same as in sketch 19 and v1.** The code rule is unchanged, so the per-seed results are unchanged: mostly winner-take-all. Overlap with objects / containers: 0.1/3.3, 1.7/0, 0.1/3.6, 0.8/1.2, 0.5/2.4.
- **Assembly.** `j0` has *one* assembly, by design. Its columns overlap objects in 2.8 and containers in 3.2 of 8. But that count is mostly chance: with random codes the figures are 2.6 and 1.0, because 20 objects × 8 columns cover a lot of 400 columns. In those shared columns its cell differs from the other words' cells (0.6 of 2.8 and 0.6 of 3.2 are also shared at 3200, and 0 of them with GROW).
- **So the answer is no.** It does not share columns with both kinds via different assemblies. The design gives a word one assembly, and the code rule still sends `j0` to one kind. Dual membership would need either a graded code rule or a word allowed two assemblies (one per sense). Neither is in this design.

## What it suggests

- **The trade-off is essentially removed at the same cell budget.**
  - Kinds generalise as well as sketch 19 or better: held-out containers → room 100%, objects 90%.
  - Episode recall comes back: test → Y 88%, against 50% in s19 and 98% in s17.
  - Memorised chains (98%), the plain fact (100%) and seen objects (100%) recover fully.
  - The diagnostic that exposed v1 is fixed: objects in the same frame share 1.5 columns but only 0.09 cells, or 0 with growth.
- **Both levels are doing work, and the controls show it.**
  - Random codes in the same assembly machinery recall well (92%) but do not generalise: held-out containers → room 0%.
  - Generalisation therefore comes from the column-level links of *learnt* columns, and identity comes from the cell-level links.
  - Note that almost every prediction is resolved at cell level (completion). The column-level presynaptic links and conjunctions contribute input to the right assemblies; the column-level *decode* fallback is almost never used.
- **The recall gap to s17 (88 vs 98) is the leftover cell sharing.** 19% of assembly cells have more than one owner.
  - GROW=1 removes the sharing, but recall does not improve (84–86%), and object generalisation falls (60–65%). It is unclear why, which is within noise for objects.
  - The 1600 budget is fine for recall (92%), but held-out containers drop to 67%. Fewer columns means more cross-kind crowding.
- **The topic state hurts recall again** (72–76%) and does nothing for level 2. That is consistent with s19.
- **Unchanged:** level 2 is 0%, replay never composes, and a broken template adds about 20% person-in-slot without melting. One new thing: kind heat is now crisp (0 for a normal filler, 1.0 for a break) because predictions complete to whole assemblies.

## Verdict (20b)

With cells chosen per assembly instead of per context, columns do what the owner's idea predicted. Columns carry kind, and cells carry identity. At the same budget, the s19 trade-off largely goes away: kind transfer at s19's level or better, recall back to 88% (98% in s17), and facts and memorised chains at 98–100%. That is the best combined result in this line of sketches.

It does not deliver the graded ambiguous word. It does not touch level 2 or reheating.

## Ways 20b could be fooling us

- **Completion is a rule, not learnt wiring.** "≥ 4 of 8 primed → the whole assembly" is a clean-up that the network is handed. It is close to a nearest-assembly decode, and much of the crispness (kind heat 0/1, seen objects 100%) may come from it, not from the column/cell idea. A version with learnt intra-assembly links and a settle step would be the honest test.
- **The two-level presynaptic code doubles the context input** (cells + columns, plus two conjunctions). Part of the gain may simply be that column-level and cell-level evidence add together into the right assembly. The random-code control isolates *learnt columns* but not this doubling.
- **v1 and 20b differ in more than the cell rule.** The combination rule and the heat definition changed too (stated above). The comparison with v1 is not a single-variable change.
- **GROW worsening object transfer is unexplained**, and the held-out sets are small. "Asm 3200 beats s19 on held-out objects (90 vs 55)" is suggestive, not established.
- **The pairing hardness numbers are not comparable across versions.** The pairing set now mixes cell- and column-level conjunctions, so "20% hard" vs s19's 37% says little.

---

# Sketch 20c: learnt assembly wiring + settling (no completion rule)

`sketch-settle.js` is built from `sketch-asm.js`, which is left untouched along with its runs. Run with `CELLS=3200 TWO=1 LEARN=1 TOPIC=0 node sketch-settle.js` (about 90 s). Outputs are in `run-settle*.txt`.

## What changed (all fixed before running; no setting changed after)

- **Internal wiring.**
  - Each time a word's assembly is the actual next state, its 8 cells strengthen their pairwise links by plain Hebbian learning: `w += 0.2·(1 − w)`.
  - It is **not** heat-modulated. It also runs during quiet replay, on the replayed word's assembly.
- **Settling replaces the completion rule.**
  - The context input to every cell is normalised by its maximum.
  - Each step, a cell's drive = context + 1·Σ(internal links from the current state)/8.
  - The state is one winner per column (the best cell), with the 8 best columns kept.
  - It starts from context alone and runs up to 5 steps or until the state stops changing.
  - The settled cells are the prediction. The dynamics never look up an assembly and have no "complete it" threshold.
  - A word is read out from the settled cells (most-overlapping assembly) only for scoring and for choosing the next replay symbol. Assembly cell choice is unchanged from 20b.
- **Two-level reading.**
  - `TWO=1` keeps 20b's cell + column presynaptic sets and conjunctions.
  - `TWO=0` uses cells only, which isolates the doubled context evidence.
- **New measures.**
  - Settling outcome: full stored assembly / mixture / other word.
  - Cue tests that feed a word's own cells straight into settling: keep 6, 4 or 2 of its 8 cells, or keep 6 + 2 random cells, or keep 4 + 4 random cells.
  - The test-chain probe with half of the primed cells randomly dropped.

## Comparison (5 seeds pooled)

| test | s17 | s19 | col v1 | **20b completion rule** | **20c settle (two-level)** | 20c settle, cells only | 20c 1600 | 20c random codes | 20c random, cells only | 20c + topic |
|---|---|---|---|---|---|---|---|---|---|---|
| same-frame objects: shared columns / cells | .02/– | 1.31/– | 1.47/1.47 | 1.52/.09 | 1.52/.09 | 1.52/.09 | 1.46/.08 | .16/0 | .16/0 | 1.52/.09 |
| **held-out C → room** (all / hard) | 33/40 | 80/100 | 100/100 | 100/100 | **87/100** | 67/33 | 60/87 | 0/33 | 20/20 | 80/100 |
| held-out O → container (all / hard) | 40/65 | 55/70 | 75/85 | 90/95 | **90/90** | 65/50 | 80/90 | 45/50 | 35/55 | 80/70 |
| seen O → container | 100 | 78 | 83 | 100 | 98 | 100 | 98 | 100 | 100 | 95 |
| **test chains → Y (episode recall)** | 98 | 50 | 52 | 88 | **84** | 90 | 90 | 92 | 98 | 92 |
| train chains → Z (memorised) | 88 | 56 | 46 | 98 | 92 | 84 | 84 | 100 | 82 | 92 |
| plain fact Y → Z | 100 | 88 | 68 | 100 | 100 | 92 | 100 | 100 | 100 | 100 |
| L2 test → Z (plain / in context) | 0/0 | 4/4 | 4/4 | 0/0 | 0/0 | 0/0 | 0/0 | 0/0 | 0/0 | 0/2 |
| kind heat at slot: normal / break #1 | .10/.97 | .50/.97 | .40/.93 | 0/1.0 | .13/1.0 | .23/1.0 | .03/1.0 | 0/1.0 | .10/1.0 | .03/1.0 |
| person in slot after break (quiet: no change) | .19 | .21 | .20 | .19 | .17 | .18 | .20 | .21 | .18 | .16 |

## Settling: where it lands, and partial or noisy cues

| | 20c two-level | 20c cells only | 20c random codes |
|---|---|---|---|
| level-1 probes: full stored assembly / mixture (≥4 of one word) / no word | .69 / .31 / 0 | .62 / .38 / 0 | .98 / .02 / 0 |
| training steps: full actual / mixture with actual on top / another word on top | .63 / .01 / .36 | .61 / .01 / .38 | .64 / 0 / .36 |
| cue keep 6 of 8 → full assembly / right word | .86 / 1.00 | .86 / 1.00 | 1.00 / 1.00 |
| cue keep 4 of 8 | .76 / .99 | .76 / .99 | 1.00 / 1.00 |
| cue keep 2 of 8 | .65 / .91 | .65 / .91 | 1.00 / 1.00 |
| cue 6 + 2 random cells | **0** / 1.00 | 0 / 1.00 | 0 / 1.00 |
| cue 4 + 4 random cells | **0** / 1.00 | 0 / 1.00 | 0 / 1.00 |
| test chain → Y: full context / half the primed cells dropped | .84 / .44 | .90 / .42 | .92 / .54 |

- **"Another word on top" in 36% of training steps** is mostly the honestly unpredictable filler slots (`the ___`), where the right answer is not knowable. This mirrors the ~0.4 baseline heat in earlier sketches. It is not a settling failure.
- **Mixtures (≈30% of level-1 probes) come from shared cells.** With learnt codes, 19% of assembly cells belong to more than one word, and settling then pulls in neighbours' cells. With random codes there is no sharing, and 98% of settles land on a full assembly.
- **Noisy cues never fully clean up.** With LAMBDA = 1 and links ≤ 1, a missing assembly cell's recurrent drive (≤ 6/8 of 1) never beats a random noise cell's context drive (1). So noise cells keep their columns, and the settled state is the right word plus the noise. Readout still names the right word every time, but the attractor does not *remove* noise. That is a consequence of the fixed LAMBDA, not tuned.
- **Partial cues fill in.** Keeping 6, 4 or 2 cells gives the full assembly 86%, 76% or 65% of the time. The failures are again the shared cells. With random codes, even 2 of 8 cells restore the full assembly every time.
- **Dropping half the primed context cells** costs about 40 points of recall (84 → 44). Settling recovers some, not most, of a degraded context.

## The ambiguous word `j0`

Unchanged from 20b, because codes and cell assignment are identical. It has one assembly, and its columns lean to one kind per seed. In shared columns it has its own cell (0.6 of 2.8 object-shared columns and 0.6 of 3.2 container-shared columns also coincide with another word's cell).

Settling neither adds nor removes anything here. There is still no second assembly per sense, so there is still no dual membership.

## What it suggests

- **Learnt wiring + settling can replace the hand-written completion rule with little loss** when two-level reading is kept.
  - Kind transfer: held-out containers → room 87% (100% on hard links), against 100%. Held-out objects 90%, against 90%.
  - Recall: 84% against 88%.
  - Facts and seen objects: 98–100%.
  - So the 20b gain was not mainly an artefact of the completion rule.
- **The doubled (column-level) context evidence is what carries kind transfer.**
  - With cells only, recall is as good or better (90%), but held-out containers → room drops to 67% (33% hard), and objects drop to 65% (50% hard). That is close to the random-code control.
  - So in this machinery, identity rides on cells and kind rides on reading the *columns*. Learnt shared columns alone, read only through cells, are not enough.
  - This is an honest split: the "columns carry meaning" claim holds only if links are also read at column level.
- **The trade-off from s19 is still largely gone** with the two-level reading: kind about s19's level or better, recall 84–92% against 50%.
- **The attractor is weak.**
  - It fills in partial cues well when cells aren't shared.
  - It does not clean up noise.
  - It produces mixtures where assemblies share cells.
  - A stronger LAMBDA or inhibition would change this, but that was not tried (settings fixed).
- **Unchanged:** level 2 is 0%, replay doesn't compose, and a break adds about 17–20% person-in-slot without melting.

## Ways 20c could be fooling us

- **Readout still uses the stored assemblies** (nearest assembly to the settled cells). Settling itself does not, but "read out as the right word" with noisy cues is a lenient score. The "full assembly" rate is the strict one.
- **Hebbian wiring is supervised by the actual word.** It learns on the assembly that *should* have been active, not on what the network actually settled to. That is the same teacher-forcing as the rest of the sketch.
- **Cue tests inject cells directly,** not through context links. They measure the attractor, not prediction.
- **The cells-only run changes two things at once:** presynaptic column links and column-level conjunctions. I did not separate them.
- **Small held-out sets** (15 / 20). The 100 vs 87 on held-out containers between 20b and 20c is two words.

---

# Sketch 20d: held states as assemblies (no hashed context pool)

`sketch-held.js` is built from `sketch-settle.js`, which is left untouched along with its runs. Run with `CELLS=3200 TWO=1 PUSH=1 LEARN=1 TOPIC=0 node sketch-held.js` (about 3 min). Outputs are in `run-held*.txt`.

## What changed (fixed before running; nothing changed after)

- **The hashed conjunctive pool is gone.** Previously there were (prev × cur), (subject × cur) and (topic × cur) codes, plus a separate context link matrix. Now:
  - The previous symbol, the subject and (if TOPIC=1) the two topic words keep **their own assembly cells** active. With TWO=1, their columns stay active too, exactly as when that word is the current input.
  - There is **one** link matrix from all active cells (current word + held assemblies) to the next word's cells, at cell level and column level as before.
  - Learning works as before, on that single matrix.
- **Held assemblies are kept on regardless.** They are input only and do not take part in the settling competition, which casts only the next state. I ran this option only. Letting held assemblies compete would need a combined state, so it was not cheap.
- **The constant-push test (PUSH=0).** The outside cue (context input, or the cue cells in the cue tests) drives only the first settling round. After that the network settles on its internal links alone. PUSH=1 is 20c's behaviour: context drives every round.
- **Everything else is as in 20c.** That includes assembly cell choice, Hebbian internal wiring, settling (5 steps, one winner per column, 8 columns), readout and scoring.

## Comparison (5 seeds pooled)

| test | 20c settle (hashed pool) | **20d held assemblies** | 20d no push | 20d cells only | 20d random codes | 20d 1600 | 20d + topic |
|---|---|---|---|---|---|---|---|
| same-frame objects: shared columns / cells | 1.52/.09 | 1.52/.09 | 1.52/.09 | 1.52/.09 | .16/0 | 1.46/.08 | 1.52/.09 |
| **held-out C → room** (all / hard) | 87/100 | **47/53** | 47/47 | 60/27 | 0/0 | 20/20 | 53/47 |
| held-out O → container (all / hard) | 90/90 | **90/90** | 90/85 | 90/80 | 25/5 | 65/55 | 65/65 |
| seen O → container | 98 | 100 | 95 | 100 | 95 | 100 | 88 |
| **test chains → Y (episode recall)** | 84 | **88** | 82 | 86 | 98 | 94 | 28 |
| train chains → Z (memorised) | 92 | 82 | 82 | 86 | 90 | 74 | 46 |
| plain fact Y → Z | 100 | 100 | 100 | 94 | 100 | 100 | 56 |
| L2 test → Z (plain / in context) | 0/0 | 0/0 | 0/0 | 0/0 | 0/0 | 0/0 | 2/6 |
| replays running X…Y…Z | 0 | 4 | 6 | 4 | 32 | 14 | 1 |
| kind heat at slot: normal / break #1 | .13/1.0 | .03/1.0 | .23/1.0 | .13/1.0 | 0/1.0 | .03/1.0 | .23/1.0 |
| person in slot after break (quiet: no change) | .17 | .21 | .20 | .19 | .23 | .20 | .36 |

## Settling and cues

| | 20c | **20d** | **20d no push** | 20d random codes |
|---|---|---|---|---|
| level-1 probes: full assembly / mixture / no word | .69/.31/0 | .72/.28/0 | .68/.32/0 | 1.0/0/0 |
| training steps: full actual / mixture / another word on top | .63/.01/.36 | .38/.01/.61 | .36/.01/.63 | .50/0/.50 |
| cue keep 6 / 4 / 2 of 8 → full assembly | .86/.76/.65 | .86/.76/.65 | **.70/.66/.60** | 1/1/1 |
| cue 6 + 2 noise / 4 + 4 noise → full assembly | 0/0 | 0/0 | **.69/.66** | 0/0 |
| (right word read out, noisy cues) | 1.0/1.0 | 1.0/1.0 | .98/.95 | 1.0/1.0 |
| test chain → Y: full / half the context dropped | .84/.44 | .88/.32 | .82/.46 | .98/.44 |

## The ambiguous word `j0`

Unchanged: codes and cell assignment are identical to 20b and 20c. It has one assembly, and its columns lean to one kind per seed. In shared columns it has its own cell (0.6 of 2.8 object-shared and 0.6 of 3.2 container-shared columns coincide with another word's cell). Held states change nothing here.

## What it suggests

- **Losing the explicit (subject × current word) combination does not hurt episode recall.**
  - Test → Y is 88%, against 84% with the hashed pool, and the plain fact stays at 100%.
  - Memorised chains drop a little (92 → 82).
  - Cells recover identity on their own: the held subject's own assembly cells are active only in that word's sentences, so subject cells → Y cells is an episode-specific link without any conjunction.
  - The random-code control reaches 98%, and replay ran X…Y…Z 32 times (versus about 0–6 elsewhere). That is the first non-trivial replay composition count in the series, though level-2 *probes* still score 0.
- **What the combination was buying was kind transfer for held-out containers.**
  - Held-out containers → room falls from 87% to 47% (53% on hard links). Objects are unaffected (90%).
  - Without a conjunction, the input is additive. "in" + "the" drive both containers and rooms, at the training prior of about 62/38. A held-out container's subject columns add only a modest column-level push toward rooms. The (subject columns × slot) conjunction had made that push specific to the slot.
  - The 1600 budget makes it worse (20%), because of crowding.
  - So columns/cells recover *identity* without conjunctions, but not *slot-specific kind transfer*.
- **Removing the constant push makes the attractor clean up noise.**
  - Noisy cues settle to the full assembly 66–69% of the time, against 0% with push.
  - Partial-cue fill-in drops somewhat: 70/66/60 against 86/76/65.
  - Recall changes little (82 vs 88). Kind heat on normal sentences rises (.23), so predictions are a bit less sharp.
  - That fits the reading of 20c: the persistent cue was pinning noise cells in place.
- **The topic state is now harmful** (recall 28%, the plain fact 56%). Two previous subjects' assemblies held on additively flood the input with the previous sentences' links. There is no conjunction to gate them. Additive held states carry no notion of *which* held state is relevant.
- **Unchanged:** level-2 probes are 0%, and a break adds about 20% person-in-slot without melting.

## Ways 20d could be fooling us

- **Held assemblies are always on and unweighted.** The sequence state (prev), the subject and the topic all contribute at equal strength. Another fixed weighting would change the kind-transfer and topic results, and was not tried.
- **"Prev" is now just one word, not a (prev, cur) pair.** The old sequence machine encoded the pair. Part of the "another word on top" rise in training steps (36 → 61%) may be lost position information, such as `the` at sentence start versus `the` in slot 2. Some of that is carried by the held subject, but not all of it.
- **The noisy-cue cleanup with no push uses the cue for one round only,** and sharing-driven mixtures persist (about 30% of probes). Cleanup is good for noise, not for overlap between real assemblies.
- **The replay X…Y…Z count in the random-code run (32) was not anticipated.** I did not check whether those replays are coherent sentences or just chained word links.
- **Small held-out sets** (15 / 20). 47 vs 87% is 6 words, but it is consistent across both mask conditions and across the cells-only run.
