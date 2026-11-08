# Sketch 19: learnt overlapping codes (+ slow topic state)

Sketch 17 with two switchable changes: `LEARN=1` (learnt codes) and `TOPIC=1` (slow topic state). It uses the same seeds (1–5), world, settings and scoring. Run `LEARN=1 TOPIC=1 node sketch.js` (~30 s). The runs are `run-base.txt` (neither change), `run-learn.txt`, `run-topic.txt` and `run-both.txt`.

## What changed

- **Ambiguous word `j0`.** It gets 40 extra sentences per seed, inserted with a separate RNG. Half use it as an object (on / has / `j0 in C`) and half as a container (`O in j0`, `opened j0`, `j0 in R`). The base run therefore differs slightly from sketch 17's numbers (they are in the table).
- **Learnt codes (rule fixed before running, not tuned).**
  - Each code is 8 cells. 4 of them are the word's own fixed random cells, to keep its identity. The other 4 are the word's top-4 cells by *affinity* (k-winners).
  - After each sentence, every noun token's context is collected: the sequence-machine pair state just before it (what brings it on) and the pair state just after it (what it brings on), both projected onto the 3200 cells.
  - Affinity update: every affinity decays ×0.9 per occurrence, and each context cell adds `1/count(cell)`. That is homeostatic, so ubiquitous context cells count for less.
  - Codes are reassigned immediately. Links learnt onto old cells stay where they were.
- **Topic state.** This is a held state made of the current subject and the previous subject. It is not released at `.` and changes only when a new subject arrives. It persists across sentences in the stream, and it contributes a (topic × current symbol) conjunctive code to the context route.
- **Measurement-only additions, made after the first run.**
  - Kind heat at the slot: 1 − the maximum overlap between the prediction and any word of the actual word's kind.
  - A level-2 probe that feeds the two premises *with learning on* before probing.
  - Per-seed `j0` overlaps.

No setting was changed after the first run.

## Overlaps (learnt codes, 5 seeds, mean shared cells out of 8; random baseline ≈ 0.02)

| | objects | held-out obj | chain obj X | containers | held-out C | rooms | surfaces | people |
|---|---|---|---|---|---|---|---|---|
| objects | **1.3** | **1.6** | 0.5 | 0.04 | 0.01 | 0.01 | 0.02 | 0.01 |
| containers | | | 0.02 | **2.6** | **2.4** | 1.1 | 0.03 | 0.04 |
| rooms | | | | | 1.1 | **3.6** | 0.02 | 0.03 |
| surfaces / people | | | | | | | **3.8** / **1.7** | |
| `j0` (ambiguous) | 0.3 | 0.4 | 0.1 | 2.5 | 2.4 | 0 | 0 | 0 |

- Kinds emerge cleanly. Within-kind overlap is 1.3–3.8 of the 4 learnable cells, and cross-kind overlap is about 0.
- Held-out words join their kind, because their codes come from the contexts they did appear in.
- Containers and rooms overlap (1.1), since both fill "in the ___".
- Chain objects X are rare (3 uses each), so they reach only 0.2–0.5 overlap.
- **The ambiguous word is not graded.** Per seed it went *entirely* one way: containers in 4 seeds (overlap 2.2–3.6, objects 0) and objects in 1 seed (1.4, containers 0). Top-4 k-winners with fast decay is winner-take-all. "jaguar shares cells with both" did not happen.

## Comparison (5 seeds pooled)

| test | sketch 17 | base (17 + `j0`) | learnt codes | topic only | both |
|---|---|---|---|---|---|
| **L1** held-out obj `in the` → container (all / hard) | 40 / 70 | 40 / 65 | 55 / 70 | 35 / 55 | 60 / 60 |
| **held-out container → room** (all / hard) | 33 / 33 | 33 / 40 | **80 / 100** | 27 / 40 | **73 / 87** |
| seen obj → container (all) | 100 | 100 | 78 | 98 | 88 |
| positional controls | 95–100 | 95–100 | 98–100 | 100 | 98–100 |
| pairing links hard (% h≥3) | 14 | 14 | **37** | 14 | 37 |
| `(in,the)`→container hardness, mean | 19 | 20 | **82** | 20 | 82 |
| **Break**: word heat at the slot, normal / novel / break #1 | .80/.68/1.0 | .80/.82/.97 | .70/.78/.97 | .80/.97/.97 | .50/.75/1.0 |
| kind heat at the slot, normal / novel / break #1 / break #5 | – | .10/.53/.97/.78 | .50/.47/.97/.78 | .15/.70/.97/.85 | .28/.25/1.0/.78 |
| person in slot: before / after break / after quiet | 0/.22/.22 | 0/.19/.19 | 0/.21/.21 | 0/.12/.12 | 0/.21/.21 |
| **L2** test chains → Z (no quiet / quiet) | 0 / 0 | 0 / 0 | 4 / 4 | 0 / 0 | 8 / 10 |
| test → Y (episode recall) | 98 | 98 | 50 | 100 | 46 |
| test, premises in context (learning off) → Z | 0 | 0 | 4 | 0 | 10 |
| test, premises re-experienced with learning on → Z | – | 0 | 0 | 0 | 0 |
| train chains → Z (memorised) | 90 | 88 | 56 | 98 | 54 |
| control `Y in` → Z | 100 | 100 | 88 | 100 | 82 |
| replays running X…Y…Z | 2/600 | 1/650 | 0 | 0 | 0 |

## What it suggests

- **Learnt codes give kinds, and kinds give the level-1 transfer sketch 17 lacked.**
  - Held-out containers now go to a room: 33% → 80% (100% on hard links).
  - Their codes share cells with seen containers, so the subject × slot links that seen containers laid down now apply to them.
  - Kind-level links also harden. 37% of pairing links are hard, against 14%, and `(in,the)`→container links reach mean h 82 against 20, because every container sentence reuses the shared cells. This is "knowledge = hardened recurring structure" appearing at kind level, which is what the theory predicts.
  - Held-out objects improve less (40 → 55%), which is within noise of the 62% frequency baseline.
- **The cost is the blurring the README warns about.**
  - Episode recall drops: test X → Y falls from 98% to 50%, and memorised training chains fall from 88% to 56%.
  - Seen objects drop from 100% to 78%, and even the world fact Y→Z falls from 100% to 88%.
  - Half the code is shared, so particular pairings leak across the kind.
  - Without a separate, sparser episodic code this trade-off is direct.
- **Level 2 is still a fail.**
  - The 4–10% → Z under learnt codes is not composition. The prediction overlaps Z by about 1.5 of 8 cells and "another room" by 6–10%, which is room-kind leakage, not X→Z. It appears just as much without the topic state.
  - **The topic state did nothing for transitivity**, even with the premises re-experienced with learning on (0%).
  - Diagnosis: the join (topic X × `in the`) → Z *is* laid down while `Y in Z` is experienced, but `Y in Z` is a well-predicted, hard world fact. Heat is near zero there, so plasticity is only the 0.05 base rate. A single 0.05 link cannot beat X's own (subject × slot) → Y link.
  - Replay never ran X…Y…Z (0 of 650 replays). Replay still falls into the high-frequency container/room attractors.
  - In the theory's terms, the join should be driven by the *gap*. But nothing makes the `X … Y in Z` situation warm, because each step on its own is predicted fine. Sketch 04's joining worked because the episode state made the second half *unpredicted* given the held state. Here the held topic does not raise heat, because heat is measured only against the next symbol.
- **Reheating is unchanged.**
  - Kind heat does separate a broken filler: about 0.1–0.5 for normal fillers against 0.97 at break #1. So measuring heat at kind level fixes the measurement problem from sketch 17.
  - Hard template links still need heat above melt (≥ 6 at h ≥ 14), and heat is capped at 1. The break is added as new soft links (about 20% person-in-slot), and quiet changes nothing.
  - That is a melt-scale issue, untouched by either change.

## Verdict

Change 1 works for what it was meant to fix. Codes learnt from co-activity give clean kind overlaps, and they produce kind-level transfer and kind-level hardening. Held-out containers → room went from 33% to 80–100%. That is the first level-1 success in this line of sketches.

It does not give graded dual membership: the ambiguous word went winner-take-all to one kind per seed. It also pays a real price in episodic precision: recall roughly halved.

Change 2, the topic state, as built, contributes nothing measurable. Level 2 stays at about 0%. The missing piece now looks like *heat*, not a held state: a join made in a cold situation is too weak to matter.

## Ways it could be fooling us

- **Context cells are hashed projections of the sequence-machine pair states.** Kinds emerge mostly because each kind has a distinctive *preceding* frame (`in the`, `on the`, `opened the`, `has a`). This toy grammar makes that almost trivially easy.
- **The ambiguous result depends on the rule.** Top-4 with ×0.9 decay is short-memory k-winners. A slower decay or a larger learnt fraction might give graded overlap. That was not tried, because settings were fixed.
- **Codes change under existing links.** Recall loss is partly links pointing at a word's old cells, not only blur. The 4 fixed own cells limit this, but the two causes are not separated here.
- **Small n.** There are 15 held-out containers and 20 held-out objects. A 33 → 80% change is large. 40 → 55% is not meaningful.
- **The topic is "current + previous subject", a choice of mine.** It is still told what a subject is (noun after `. the`), as in sketch 17.
