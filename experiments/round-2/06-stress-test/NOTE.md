# Sketch 06: stress test

## PREDICTION (written before any code for this sketch was run)

**World I will build.** One continuous stream, as in sketch 05 `time`:
- 8 people, 6 places and 4 weathers to start. Two new people and two new places appear halfway through the days.
- Each day has a story: someone calls someone, they meet, they move around or the weather changes, one goes home, and the other carries on alone for a bit.
- Shared rules: two (place, weather) → move rules, plus one person rule ("Bob always goes home when it turns misty").
- Context the world provides: **day** (changes once per story), **time of day** (4 values, ticking every 5 world tokens), **who** (single person or pair), **where**, and **weather**. There is no story id, and no position-in-day counter finer than the time of day.

**What context full reconstruction needs.** It needs a set of held states whose combination, together with the last two tokens, never repeats within a day with a different continuation.
- Day alone separates days but not visits within a day.
- Time of day breaks most within-day repeats, provided it ticks faster than places recur. With 6 places and ticks every 5 tokens, I expect the ceiling (the share of days with no ambiguous situation) to be about **95–100%**.
- So I expect missing context to explain **few** failures, under about 10%.

**Where I expect it to fail.**
1. **Compounding of per-step errors.** Sketch 05 `time` had ~95% step accuracy and ~33% perfect days, with stories of ~25 tokens. Stories here are a bit longer, and more people and pairs make more shared links compete with each soft day link. I predict step accuracy of **90–94%** and perfect whole-day reconstruction of **15–30%** at 50 days, falling slowly with more days (**~10–20% at 300–1,000**). Events correct should be **60–70%**.
2. **Most failures are interference, not missing context.** The situation is unique, but a continuation from another day wins. I predict that **≥70%** of failures fall in the "unique: day differ" class.
3. **Specific one-step recall** (meet place, move destination): **85–95%**, against a common-answer baseline near 1/(number of places).
4. **Generalisation to never-seen combinations** (a new person at a familiar place in a familiar weather → the place rule fires): **≥85%**, because the rule lives on where×weather-token links that don't involve who. Bob's rule at new places should hold too (who×weather-token link). New places in the rules aren't testable, because the rules don't mention them.
5. **Hardness:** day- and joint-keyed links stay soft (≤2% hard), and rule links become hard at threshold 3 once the rule has fired a few times.
6. **Familiar vs novel.** Days after new people and places appear reconstruct about as well as earlier ones, maybe slightly better, because novel combinations have fewer competing links. They don't do worse.

If time of day does *not* bring the ceiling near 100% here, the prediction about missing context is wrong. If perfect reconstruction is well above 30%, the interference I expect is weaker than I think.

## Set-up (as built)

`node sketch.js` takes about 25 s (3 seeds; 50 and 200 days; capacity at 50/200). `CAPDAYS=1000 node sketch.js` adds the 1,000-day point (about 1.5 min).

- **World.** As predicted above.
  - 8 people, 6 places and 4 weathers. Ivan, Judy, cliff and meadow join from the halfway day.
  - Pairs are their own `who` token (`who:Alice+Bob`).
  - Place rules: rain at the beach leads to the forest, and wind on the hill leads to the park. Bob rule: if it turns misty while Bob is in the pair, the pair phase ends (`ev:home`).
  - Stories average 25.5 tokens.
- **Automaton.** Copied unchanged from sketch 05 variant `time`: machines day, time, who, where and weather; 3200 cells, k=8; threshold 3. The capacity runs use 1600 cells and a 2^18 pool, as in sketch 05.
- **Measures.** The same as sketch 05, plus two more:
  - Generalisation is asked only for (who, where, weather) triples that never occur anywhere in the stream, on days in the second half, with `time:afternoon`.
  - Perfect reconstruction is split into first-half days, second-half days with only familiar people and places, and second-half days that include a new person or place.

## Results

```
Reconstruction (free run; perfect % / events %)
days | dayOnly  | opening  | ceil step | opening perfect: 1st half / 2nd half familiar (n) / 2nd half with new (n)
  50 | 38  74   | 43  75   | 100   96  |   37 / 33 (15) / 53 (60)
 200 | 31  71   | 35  70   | 100   95  |   27 / 45 (56) / 44 (244)
capacity (1600 cells, 2^18 pool)
  50 | 34  72   | 43  73   | 100   96
 200 | 29  69   | 32  67   | 100   94
1000 | 12  60   | 14  57   | 100   90

Failure classes at the first wrong token (both cues)
 50 days (n=178): novel continuation 34% | unique, day + one or more of who/where/weather/time differ ~52% | unique, day only 7% | unique, without day 4% | same situation 0%
200 days (n=803): day+who 21% | novel 19% | day only 13% | other day+... ~43% | time only 3% | same situation 0%
1000 days (n=5216): day only 26% | day+who 22% | day+where 11% | day+weather 11% | novel 8% | rest ~22% | same situation 0%

Specific one-step recall (%): auto / most-common baseline / hard-only / soft-only
 50 | meet 96 / 21 / 32 / 13 | move 92 / 36 / 34 / 61 | order in day: states differ 96 (n=79), identical: none occur
200 | meet 93 / 19 / 23 / 68 | move 92 / 26 / 34 / 61 | order in day: states differ 94 (n=321)

Generalisation to never-seen (who, where, weather) combinations (% all / hard-only / soft-only)
                                                       50 days            200 days
place rule, pair with a new person                   82 / 18 / 50       62 / 81 / 24
place rule, unseen familiar pair                     73 / 19 / 43       72 / 85 / 16
Bob rule, familiar Bob pair at a new place           39 / 39 / 17       35 / 34 / 27
Bob rule, Bob + new person                           21 / 33 /  5       50 / 24 / 40
control (non-Bob pair, misty) -> ev:home             26 / 37 /  6       25 / 18 / 18

Hardness (%hard at h>=3, median h)    50 days     200 days
day -> meet place                      0  (1)      0  (1)
joint -> meet place                    0  (1)      0  (1)
where -> place-rule destination       65  (3)     96 (12)
who(Bob pair) -> ev:home               0  (1)     47  (2)
all day / joint links                  0–1%        0–1%
time / who / where / weather / seq     6–29%       18–34%
```

## Prediction vs outcome

| prediction | outcome | verdict |
|---|---|---|
| ceiling 95–100% | 100% at every size | right |
| missing context explains < 10% of failures | 0% ("same situation" is 0 at every size) | right |
| step accuracy 90–94% | 95–96% (90% at 1,000 days) | slightly pessimistic |
| perfect reconstruction 15–30% at 50 days, ~10–20% at 300–1,000 | 38–43% at 50, 31–35% at 200, 12–14% at 1,000 | too pessimistic at small scale, right at 1,000 |
| events correct 60–70% | 70–75% (57–60% at 1,000) | about right |
| ≥ 70% of failures are "unique: day differ" | day alone is only 7–26%. Most failures differ in day *plus* another machine, or are blends (8–34%). | wrong in detail. Right that it is interference, not missing context |
| specific recall 85–95% vs baseline ~1/places | 92–96% vs a 19–36% baseline | right |
| place rule generalises to never-seen combinations ≥ 85% | 62–82% (hard-only 81–85% at 200 days, but 18–19% at 50) | wrong: weaker than predicted |
| Bob rule holds for Bob at new places / with new people | 21–50%, not clearly above the 18–37% control | wrong: it did not generalise |
| day/joint links soft, rule links hard | day/joint 0–1% hard. Place-rule link 65→96% hard. Bob-rule link only 0→47% | right for the place rules, weak for the Bob rule |
| days with new people/places reconstruct no worse | 53 vs 33% at 50 days (n=15 familiar), 44 vs 45% at 200 | right (and the first half is lower, 27–37%) |

## What it suggests

- **With day and time of day, the context is sufficient for this world.** The ceiling is 100% and no failure traces to missing context. A unique story id wasn't needed.
- **Sufficient context is not the same as reliable replay.** Every failure happens in a situation the context *did* distinguish. The first wrong token is almost always a continuation from another stretch that shares the last two tokens and some held states (who, where, weather). The soft, single-use day-keyed link loses to the summed vote of many shared, partly hardened links. That is interference, and it grows slowly with the number of stored stories: perfect days 43 → 35 → 14% at 50 → 200 → 1,000.
- **Generalisation is the weak side under stress.**
  - The place rules transfer to unseen (who, where, weather) combinations at 62–82%. That is good but not clean. At 50 days, hard-only transfer is just 18% because the rule has not hardened yet (median h 3). By 200 days, hard-only transfer is 81–85%, *better* than all links (62–72%). So the soft, day-specific links are what drag generalisation down. This is the same competition as in the reconstruction failures, seen from the other side.
  - The Bob rule failed. It fires rarely (only when it turns misty while Bob is in the pair, about 1 in 9 pairs), so its links barely harden (0–47%). The test also can't separate the rule from the ordinary "weather change, then ev:home" ending, which the control shows at 18–37%.
- **Hardness keeps sorting episodic from semantic.** Day- and joint-keyed links stay soft (0–1%). Frequent rules harden. Rare rules don't, which is what earned hardness should do.
- **Novel people and places don't hurt.** Stories with new people or places reconstruct about as well, or better: they have fewer rivals for the shared links. Early days do worse, at 27–37%, probably because they share a smaller cast and so face more competing links from similar stories. I didn't test that.

## Ways it could be fooling us

- **"Context is sufficient" is measured against the automaton's own state variables.** The ceiling only checks that no situation repeats. A clock that ticks on world tokens is close to a coarse position counter, so the 100% ceiling is partly designed in.
- **The failure classes are heuristic.** They take the first wrong token and pick the closest stretch with the same continuation. "Novel continuation" (blends) could also be interference across many stretches at once.
- **The Bob rule's test is confounded.** "Weather change → ev:home" also happens without the rule. The rule needs a cleaner, more frequent signal to be judged.
- **Generalisation queries set `time:afternoon`.** That one choice wasn't varied. The time state adds context links that compete with the rule; in sketch 05 `time`, rule generalisation also dropped (63% vs 96%).
- **3 seeds.** Familiar-late days n=15 at 50 days. Treat differences under about 10 points as noise.
