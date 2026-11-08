# Sketch 15: learning which links are worth following (from confirmation heat)

Run: `node learn.js` (about 55 s) writes the grid to `out.txt`. Post hoc: `SCORE=ratio node learn.js` (`out_ratio.txt`). Env `LS`, `DS`, `NTRS` select cells.

## Set-up

- **World.** Sketch 14's mix A (colour `X is c`, `P took X`, `X near Y`; D per chain token; 100 filler sentences), with 2 or 3 links. Sizes changed: 40 objects and 96 containers, so there are enough for 16 test chains (12 full, 4 half) plus up to 24 **training chains**. Each training chain gets, after its last link (at least 5 sentences later), either (a) `obj in room` (a confirmation), or (b) `last moved W`, followed later by `obj in W` (50/50). Test chains get neither. `near` never confirms anything.
- **The automaton.** It lives the stream as before and supplies only the frame ("what goes after `went`" = place), so place-fit is learnt as in sketch 13.
- **Link kind** of a sentence = its `ev:` tokens. Nothing in the code names a specific one.
- **Search = a path walk** (new, not sketch 14's breadth trial). From the current token, the candidates are the sentences containing it that hold an unvisited content token. It moves to that sentence's other content token, and it stops when a place-fitting token is reached (fit ≥ 0.5). Gap heat = 1 − fit × min trust over the kinds followed, and the walk answers if heat < 0.5. So the answer is connected to the subject by the path itself.
- **Learning while living.** At the end of each day, every non-place token seen so far gets a walk using only sentences seen so far, and the place it reached is kept as a pending hypothesis. When X later co-occurs with a place P in a sentence: if a pending hypothesis equals P, every kind on its path is **confirmed** (c++). Otherwise it is contradicted (hardens nothing). At question time, trust(kind) = (c+1)/(max c + 1). The walk picks the highest-trust sentence, then the best place-fit, then at random.
- **Fixed before the grid / changed after one smoke cell (L2 D5).** Three fixes, all made before the full grid and all commented in the code:
  1. Living walks sample in proportion to trust, and the hypothesis is the reached place even if unconfident. Greedy + confident-only stopped learning after about 7 resolutions per seed.
  2. All of a token's pending walks are kept, not just the latest.
  3. Hardness = confirmation count c, not the rate c/u. With the rate, "in" was punished; see below.
- Settings: HOPS = L+2, COOL 0.5, 6 seeds, 12 joins + 4 half-chains + 12 direct per seed (72 / 24 / 72 per cell). Chance is 17%. Baselines on the same world: **rand walk** (same walk, random choice, trust ignored, so it answers whenever it reaches a place) and **sketch 14** (gap + whole-sentence trial + skip-empty, unchanged).

## Results (6 seeds)

Columns: join right / join wrong-confident / half-chain confabulated / direct right / join hops.

| L | D | train | **learned walk** | rand walk | sketch 14 | trust: in / moved / is / near / took / went |
|---|---|---|---|---|---|---|
| 2 | 0 | 0 | 0 / 0 / 0 / 0 / 2.0 | 100 / 0 / 0 / 50 | 100 / 0 / 0 / 100 | .05 .05 .05 .05 .05 **1.00** |
| 2 | 0 | 4 | 67 / 0 / 0 / 67 / 2.0 | 100 / 0 / 0 / 38 | 100 / 0 / 0 / 100 | **.75** .13 .03 .03 .03 .74 |
| 2 | 0 | 12 | 100 / 0 / 0 / 100 / 2.0 | 100 / 0 / 0 / 47 | 100 / 0 / 0 / 100 | **1.00** .04 .01 .01 .01 .23 |
| 2 | 2 | 0 | 4 / 7 / 8 / 3 / 2.4 | 14 / 32 / 50 / 33 | 42 / 51 / 79 / 100 | .14 .02 .05 .12 .33 **1.00** |
| 2 | 2 | 4 | 44 / 4 / 25 / 50 / 2.2 | 19 / 28 / 54 / 38 | 40 / 51 / 92 / 100 | .57 .03 .16 .25 .33 .95 |
| 2 | 2 | 12 | **100 / 0 / 17 / 100** / 2.0 | 15 / 38 / 54 / 26 | 49 / 50 / 100 / 100 | **.98** .01 .12 .26 .33 .56 |
| 2 | 2 | 24 | 85 / 7 / 25 / 90 / 2.3 | 13 / 43 / 63 / 31 | 40 / 58 / 96 / 100 | **.93** .01 .15 .27 .56 .53 |
| 2 | 5 | 0 | 8 / 50 / 54 / 14 / 2.2 | 10 / 22 / 42 / 22 | 35 / 49 / 83 / 100 | .20 .02 .09 .28 .62 **1.00** |
| 2 | 5 | 4 | 25 / 38 / 67 / 36 / 2.5 | 14 / 25 / 25 / 22 | 29 / 60 / 96 / 100 | .40 .02 .25 .38 .70 .96 |
| 2 | 5 | 12 | 25 / 43 / 71 / 24 / 2.7 | 7 / 17 / 42 / 17 | 32 / 64 / 88 / 100 | .58 .01 .14 .49 **.92** .82 |
| 2 | 5 | 24 | 54 / 29 / 67 / 57 / 2.4 | 10 / 26 / 29 / 18 | 29 / 68 / 100 / 100 | .70 .00 .11 .57 **.88** .64 |
| 3 | 0 | 4 | 83 / 0 / 0 / 83 / 3.0 | 100 / 0 / 0 / 46 | 100 / 0 / 0 / 100 | .73 .05 .02 .02 .02 .84 |
| 3 | 0 | 12+ | 100 / 0 / 0 / 100 / 3.0 | 100 / 0 / 0 / ~50 | 100 / 0 / 0 / 100 | **1.00** ≤.05 … .12–.29 |
| 3 | 2 | 12 | 72 / 26 / 38 / 79 / 2.8 | 14 / 42 / 46 / 28 | 25 / 65 / 96 / 100 | .86 .01 .16 .35 .72 .71 |
| 3 | 2 | 24 | **100 / 0 / 29 / 100** / 3.0 | 11 / 49 / 58 / 25 | 18 / 75 / 100 / 100 | **1.00** .00 .23 .34 .55 .49 |
| 3 | 5 | 0 | 19 / 72 / 96 / 24 / 2.2 | 4 / 31 / 29 / 14 | 21 / 68 / 88 / 100 | .24 .01 .16 .36 .87 **1.00** |
| 3 | 5 | 12 | 21 / 13 / 29 / 19 / 4.2 | 3 / 25 / 33 / 15 | 21 / 74 / 92 / 100 | .48 .01 .23 .52 .92 .74 |
| 3 | 5 | 24 | 4 / 15 / 25 / 17 / 4.8 | 7 / 18 / 33 / 15 | 8 / 78 / 92 / 100 | .67 .00 .44 .64 **.98** .59 |

Full grid in `out.txt` (also gives confirmations/contradictions during living). Sketch 14's direct = 100 here because test containers have only one sentence with a room in this world.

**Post hoc, rate scoring** (`out_ratio.txt`, trust = (c+1)/(u+2)): all kinds end at a confirmation rate of 0.13–0.24, and `in` is never above the others. Answers are never confident (0% everywhere). **The confirmation rate during living is about 17% for every kind = 1/6 rooms = chance.**

## What happened

- **With 0–2 distractors, it learns to prefer `in`, and that fixes the joins and most of the honesty problem.** At D2, 12 training chains give 100% joins, 0% wrong-confident, and 17% half-chain confabulation. On the same world, sketch 14 gives 49 / 50 / 100 and the random walk 15 / 38 / 54. At L3 D2, 24 chains give 100 / 0 / 29 vs sketch 14's 18 / 75 / 100. About **4 training chains** give partial preference (in ≈ .55–.75); **12** saturate at D ≤ 2. With no training chains it is honest by ignorance: `in` has no trust, so heat stays high and it never answers (0% right, 0% confab at D0).
- **At D5 it fails.** `took` (and later `near`) overtake `in`: .88–.98 vs .67–.70. Joins fall to 4–54% and confabulation to 25–71%. It is better than random on joins at L2 but not at L3.
- **Why, and what it really learnt.** Count-based hardness measures "how often this kind was on a path that ended at the place the world later named", and the rate shows that this happens at chance for *every* kind. The walk reaches some room, and 1 time in 6 it is the right one, whatever path it took. A confirmation then hardens every link on the path. So the count mostly tracks **traffic**: how often a kind gets walked. At D0–2 `in` dominates traffic near places, because every place is one `in`-hop away and the in-preference is self-reinforcing (rich-get-richer). At D5, `took` and `near` dominate traffic, so they win. `went` starts on top for the same reason, since "who went R" sentences touch a place directly. What reinforces the right preference at low D is a feedback loop, not the confirmations carrying information about `in`. The training chains help mostly by adding extra `in` traffic and `in`-confirmed events (`obj in room` sentences are themselves resolutions of walks that end in-in).
- **`moved` is never learnt** (trust ≈ 0). Moves are rare, and the walk can't exploit them: the static world after a move still says `last in oldroom`. So the "Y moved to W" lesson didn't land at all.
- **The brief's design premise is not met.** "Cool what took part when the answer is confirmed" is a credit-assignment rule with no contrast. Paths that confirm by luck harden their kinds just as much as correct ones. To learn that `in` *causes* confirmation, something must compare a kind's confirmation rate with its base rate, and the rate version shows that the rate is flat at chance. Flat because a correct `in`-path and a lucky `took`-path both end at "some room", and my walk then compares that room with whatever the world later says. A higher rate for `in` would require walks that follow only `in` to be confirmed noticeably more often than chance. They should be (they are right), but during living most walks mix kinds, so per-kind credit gets diluted. I did not separate pure-kind paths.

## Does anything encode "in"?

- No token is named in the automaton or the walk. But **the link kind is defined as "the `ev:` tokens of the sentence"**. That uses the world's prefix convention: relation tokens are marked `ev:`, and content tokens are excluded from the kind. In every sentence the relation is the only `ev:` token, in the middle slot. So the walk is told *which token is the relation*, though not which relation matters. That is a real structural gift.
- Sentence boundaries come from clock tokens (as in sketches 13/14), and places are recognised by learned frame fit (as before).
- "Confirmation" means the hypothesised place co-occurring with X in a later sentence. That too is a sentence-level gift.

## Ways it could be fooling us

- Three method changes were made after one smoke cell, and the scoring choice (count vs rate) was made because the rate punished `in`. That was a direction I preferred. The rate run is reported, and it is the more honest measure: it says the signal is at chance.
- The good low-D results may be mostly the rich-get-richer loop with a lucky initial bias. At D0 with 0 training, `went` wins (1.00), so the loop can lock onto the wrong kind. Training chains tip it toward `in`.
- 6 seeds, 72 joins per cell, so roughly ±8 points. The D5 rows are noisy and non-monotonic (L3 D5: 19 → 6 → 21 → 4).
- The random walk's direct right% (~50%) is low because it wanders off the container's in-sentence. Sketch 14's 100% direct is a feature of this world (one room sentence per container).

## Verdict

- **Partly works, for the wrong reason.** With ≤2 distractors per token, preferring the most-confirmed link kind makes multi-hop joins right (100%) and mostly honest (0% wrong-confident, 17–29% half-chain confab), after about 12 confirmed training chains. That is a large gain over sketch 14 on the same world (≈40% right, 50–75% wrong-confident).
- **It does not learn what "in" does.** The per-kind confirmation rate is at chance for every kind. Hardness-by-count tracks traffic, and the preference is a self-reinforcing loop that heavy distractors (D5) capture for `took` / `near`.
- What would be needed: contrastive credit, i.e. a kind earns trust only by being confirmed *more often than other kinds on comparable walks*, and single-kind walks (or credit for the last hop only) so that credit isn't diluted along mixed paths. Plus stating plainly that the relation slot is handed over by the `ev:` prefix.
