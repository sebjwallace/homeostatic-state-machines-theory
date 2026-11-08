# Sketch 07: specificity first

The question: sketch 06's remaining failures looked like competition. A single soft, day-specific link was outvoted by the summed votes of many shared links. Does replacing summed voting with "whichever fits the situation most specifically responds" fix reconstruction without costing generalisation?

- `sketch.js` is sketch 06's stress test.
- `sketch05.js` is sketch 05 (`full` and `time` variants).
- `VOTE=sum|spec|spec-seen|spec-strong` picks the readout. The default is `spec`. `VOTE=sum` reproduces sketches 05 and 06 exactly (checked: identical tables).
- Each run takes about 15–35 s. I ran the 1,000-day capacity point with a small driver; see below.

## Set-up

Everything is copied unchanged: world, automaton, learning, hardness, threshold and measures. Only the readout changes, and it is used both while living (it sets the heat) and in queries and free runs.

**Specificity ordering, fixed before the first run.** Specificity is the number of held states in a link's key:
- **Level 2:** the joint code (all context machines together).
- **Level 1:** one held state × current token (day, time, who, where, weather, or the sequence machine's previous token).
- **Level 0:** the symbol route (current token only).

**`spec` (pre-registered).**
- Take the most specific level whose cells have any links.
- Its own k-winners decide the prediction alone, if that level is *certain*: at least 6 of the 8 winning cells decode to one symbol. The level's own uncertainty is the referee.
- Otherwise drop to the next level. If no level is certain, fall back to the summed vote.

**Two follow-up readouts, added after looking at `spec`'s failures.** They were not pre-registered.
- **`spec-seen`:** a level counts as "seen" only if a majority of its cells have any link.
- **`spec-strong`:** a level counts as "seen" only if a majority of its cells have a strong link (w > 0.5, the same "strong" used for hardening).

Why I added them: a diagnostic on `spec` (50 days, seed 1) showed that level 2 decided 1,278 of 1,281 one-step predictions, including 49 of 50 errors.
- Joint cells for a situation seen once carry only weak links (w = 0.03–0.10), because the summed vote already predicted the next token well when that link was laid down, so it learnt little.
- A single hash-collided joint cell carrying a strong link from another situation (w = 1.05) then wins inside the level, and 6 of 8 winners agree.
- "Has any link" is far too weak a test of "has been seen".

## Results

`sum` = summed voting (the sketch 05/06 baseline). The stress test uses 3 seeds and sketch 05 uses 5.

```
Stress test (sketch 06 world)                 sum          spec         spec-seen    spec-strong
50 days   perfect dayOnly / opening        38 / 43      45 / 49      17 / 22      39 / 42
          events correct (opening)            75           72           57           73
          one-step accuracy                   96           96           93           96
200 days  perfect dayOnly / opening        31 / 35      26 / 32       5 /  8      25 / 30
          events correct (opening)            70           59           32           67
          one-step accuracy                   95           94           88           94
1000 days perfect dayOnly / opening        12 / 14       3 /  5       -            3 /  5
 (1600 cells) events correct (opening)        57           40           -            36
          one-step accuracy                   90           85           -            82

Specific one-step recall, meet / move
 50 days                                   96 / 92      99 / 96      97 / 91      96 / 92
200 days                                   93 / 92      94 / 94      91 / 92      93 / 92

Place rule on never-seen (who, where, weather): all links / hard-only
 50 days, pair with new person             82 / 18      60 / 18      83 /  7      74 /  7
200 days, pair with new person             62 / 81      20 / 66      57 / 46      66 / 56
200 days, unseen familiar pair             72 / 85      20 / 74      62 / 55      72 / 68
Bob rule (Bob + new person), 200 days      50 / 24      33 / 24      38 /  4      60 / 41    control 18–37 throughout

Hardness (%hard, threshold 3): day->meet and joint->meet 0% in every readout; where->rule place 65% (50 d), 96% (200 d)
in every readout; Bob-pair->ev:home 0 / 47–48%. The split is unchanged: the readout barely changes which links are strong.

Failure classes (first wrong token, both cues), 200 days
 sum          novel continuation 19%, day+who 21%, day only 13%, other "unique: day+…" ~47%, same situation 0%
 spec         novel continuation 68%, day+… ~30%, same situation 0%
 spec-strong  novel continuation 32%, day+who 18%, day only 12%, other ~38%, same situation 0%

Sketch 05 `time` setting (opening cue: perfect / events; one-step; rule gen on novel days)
             5 days            20 days           50 days           capacity 200 d (1600 cells)
 sum        68/83  96  52     32/68  94  68     34/70  95  63      29/68  94
 spec       80/91  99  48     55/79  97  57     30/57  93  41      19/47  90
 spec-seen  76/88  99  55     32/64  95  68      9/44  89  63       5/26  81
 spec-strong 56/77 96  55     24/65  94  68     27/65  94  64      13/46  88
(sketch 05 `full`, 50 days, rule gen on novel days: sum 96, spec 61, spec-seen 93, spec-strong 96)
```

## What it suggests

- **Specificity-first helps a little when few stories are stored, and hurts as they accumulate.**
  - `spec` lifts perfect reconstruction at small scale: sketch 05 `time` goes from 68 to 80% at 5 days and from 32 to 55% at 20; the stress test goes from 43 to 49% at 50 days.
  - It is behind summed voting by 200 days (32 vs 35%) and far behind at 1,000 (5 vs 14%), with one-step accuracy falling from 90 to 85%.
- **Generalisation pays for it, as feared: over-specific links fire where general knowledge should.**
  - The place rule on never-seen combinations drops from 62–72% to 20% at 200 days under `spec`. Novel-day rule generalisation in sketch 05 `full` drops from 96 to 61%.
  - At a never-seen (who, where, weather), the joint and day×token cells for that situation are new. But hash collisions and day×token links from the *same day* (seen earlier that day in another situation) give the specific level some links, and it is certain enough to decide. So a day-specific continuation pre-empts the hard rule. Day×token is level 1, the same level as where×token, so the ordering can't put the rule (where×weather-token) above the day's own detail.
- **The failure mode changes from interference to blends.**
  - Under `sum`, most failures took another stretch's continuation.
  - Under `spec`, 68% are "novel continuation": a token never seen after those two tokens. A single sparse level decides from a handful of weak, partly collided cells, and its 6-of-8 certainty is easy to reach by accident.
  - So the competition moved inside the most specific level instead of disappearing.
- **Making "seen" stricter doesn't rescue it.** `spec-strong` roughly matches summed voting in sketch 06 (42 vs 43%, 30 vs 35%) and keeps generalisation at about the summed level. It loses at scale (5 vs 14% at 1,000 days). `spec-seen` is worse everywhere. Neither was pre-registered.
- **The hardness split is untouched.** Day- and joint-keyed links stay soft (0%), and the place-rule links harden to 96%. The readout changes who speaks, not what is learnt.
- **Missing context stays at 0%.** "Same situation" failures stay at 0% everywhere, so the problem remaining with every readout is how the stored links are read, not what context is held.

**Verdict.** No. Specificity-first, implemented as "the most specific level with links decides if it is certain", does not fix reconstruction. It gives a gain at small scale and a loss at large scale, and it clearly costs generalisation to never-seen combinations. The underlying issue is that **"seen" and "specific" are not the same thing as a strong, reliable link**. On a sparse hashed code, a once-seen situation leaves weak links, often weaker than collided links from elsewhere, because learning was driven by the summed prediction's heat. Specificity needs a way to know that *this exact combination* was experienced, separately from the weight. One candidate is a per-key "seen" state that is set on first experience and held. With that, a once-seen key could win outright and an unseen key would defer to the general rule. I didn't test that.

## Ways it could be fooling us

- **The ordering is coarse.** Level 1 lumps day×token with where×token. The README's "most specific" might better rank day-keyed links above where-keyed ones, or count states by how rarely they recur. I fixed it to "number of held states" before running, as asked, and didn't explore further.
- **The certainty test (6 of 8) was fixed in advance and not varied.** A stricter test might fall back to the summed vote more often and land between `sum` and `spec`.
- **Learning interacts with the readout.** Heat comes from the readout's prediction, so `spec` also changes what is learnt. Joint links laid down while the summed vote was already right stay weak (w ≈ 0.05). Some of the effect is through learning, not only through the readout.
- **`spec-seen` and `spec-strong` were added after seeing `spec`'s failures.** Treat them as diagnostics, not as tests of the idea.
- **Noise.** 3 seeds in the stress test, 5 in sketch 05, and generalisation n=117–448. Differences under about 10 points are noise. The 1,000-day point uses 3 seeds and only the opening/dayOnly cues.
