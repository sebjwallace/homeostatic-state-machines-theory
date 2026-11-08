# Sketch 05: days and stories

The question: if there are no explicit episode boundaries, and the world just sets states that hold until it changes them (day, who, where, weather, plus events), does the C2 automaton from sketch 04 still keep days distinct, while regularities shared across days generalise and harden?

`node sketch.js` takes about 19 s (5 seeds for the main tables, plus capacity up to 200 days). `CAPDAYS=5,20,50,200,1000 node sketch.js` adds the 1,000-day point, which takes about 1 more minute.

## Set-up

- **World.** One continuous stream of tokens. Each token is a state change (`day:7`, `who:Alice`, `where:beach`, `weather:rainy`) or an event (`ev:called`, `ev:yes`, `ev:met`, `ev:went`, `ev:home`). There is one seeded random story per day:
  - The caller (Alice or David) is at home, with some weather. They call, the other says yes, and they meet at a random place (beach, forest or park). Then `who:both`.
  - Next come 3–5 segments. Each segment is either a move (`ev:went`, then a new place) or a weather change.
  - The other person goes home (`ev:home`, `who:<caller>`). The caller does one more segment and goes home.
  - **Rules that hold on every day:** rain at the beach always leads to `where:forest`, and mist in the forest always leads to `where:beach`.
  - The stream is never reset. Only the `day:d` token changes between stories, and the other machines carry over from the previous evening.
- **Automaton (C2, continuous).**
  - 3200 symbol cells with k=8. Context machines (day, who, where, weather) hold the last token that set them, without decay.
  - The context is the union of sparse conjunctive codes, hashed into a 2^24 pool and kept with probability 1/8:
    - (previous token × current token): the shared sequence machine.
    - (state of each context machine × current token).
    - (the code of the joint combination of all context states × current token): "the stretch".
  - The symbol→next route is unchanged from sketch 04.
  - Learning, heat and earned hardness are as in sketch 04, but **with no episode end**: after every step, each connection that carried it (w>0.5) hardens by 1. So hardness counts uses.
- **Variants.** `full`. `noday` removes the day machine everywhere. `pairs` removes the joint-combination code.
- **Queries.** Learning is off. The driver sets the machine states and the last two tokens, and the automaton predicts the next token.
  - Meet place and move destinations are day-specific (random per day).
  - Rule generalisation: for every day, set (day d, `who:both`, `where:beach`, `weather:rainy`) after arriving at the beach, and ask what comes next. Results are split by whether day d ever had that situation.
  - Order: departures from the same place on the same day that went to different places.
- **Reconstruction (added at the owner's request).** A free run with learning off. Each predicted token is fed back in, and if it is a machine token it sets that machine. The run is compared with the true day, token by token. There are three cues:
  - `dayOnly`: `day:d` is set, and the other machines are as the previous evening left them.
  - `dayWho`: day + who, starting at `where:home`, with weather unset.
  - `opening`: day, who, home and weather all set.
- **Two diagnostics.**
  - `step%` is one-step accuracy over the whole stream, with the true states given.
  - `ceil%` is the share of days where no situation (all machine states + previous + current token) recurs within the day with a different next token. That is an upper bound for any learner on this context.
- **Capacity (added at the owner's request).** The full variant with fewer cells (1600 symbol cells and a 2^18 context pool, chosen before that run), 3 seeds, at 5–1,000 days, reconstruction only.

All settings, including the joint code and `pairs`, were in the first version before any run. Nothing was tuned on the measures. Reconstruction, the diagnostics and the capacity sweep were added after the first run, at the owner's request. They change no settings, and the earlier tables are identical. The 1,000-day point is opt-in because it takes about a minute.

## Results

```
One-step queries (%; 5 seeds). Chance: meet 33, move 50. "common" = most common answer in the same situation ignoring the day.
variant days | meet: auto common | move: auto common | rule gen: day had it / never on that day | order: states differ / identical
full       5 |      100    52    |       94    66    |    100 / 71                              |   92 (n=12) /  -
full      20 |       93    45    |       83    60    |     98 / 79                              |   78 (65)   / 50 (8)
full      50 |       92    40    |       82    57    |    100 / 96                              |   73 (148)  / 54 (26)
noday      5 |       88    52    |       85    66    |    100 / 84                              |   83        /  -
noday     20 |       53    45    |       67    60    |    100 / 87                              |   68        / 50
noday     50 |       45    40    |       58    57    |    100 / 100                             |   56        / 50
pairs     50 |       90    40    |       67    57    |    100 / 97                              |   51        / 54

Lesion by hardness (full): meet / move / rule gen on novel days
 5 days  all 100/94/71   hard 36/55/16   soft 72/74/55
20 days  all  93/83/79   hard 58/60/87   soft 54/62/ 0
50 days  all  92/82/96   hard 41/62/100  soft 82/63/14

Hardness (full, strong links): %hard (h>=3), median h at 5 / 20 / 50 days
 day×cur -> meet place          0 (1) /   1 (1) /   1 (1)
 joint×cur -> meet place        0 (1) /   0 (1) /   0 (1)
 where×cur -> rule place       50 (3) / 100 (5) / 100 (14)
 seq -> rule place              8 (1) /  20 (2) /  55 (3)
 all day / joint links          0–1%
 all who / where / weather / seq / sym links   8–48% (mixed)

Full reconstruction by free run (perfect day % / events correct % / of failures, % whose first error is a continuation seen elsewhere)
variant days | dayOnly        | dayWho         | opening        | ceil  step
full       5 | 32  63  35     | 28  63  56     | 36  66  50     |  84    95
full      20 | 18  50  51     | 22  52  64     | 25  56  73     |  80    92
full      50 | 20  51  56     | 20  51  69     | 24  57  79     |  77    92
noday     20 |  0  45  98     |  0  38  99     |  0  39  97     |  80    74
noday     50 |  0  43 100     |  0  37 100     |  0  37 100     |  77    68
pairs     50 | 10  47  64     | 10  46  75     | 11  49  84     |  77    88

Capacity (full, 1600 cells, 2^18 context pool, 3 seeds): perfect / events% per cue, ceiling, step%
days | dayOnly | dayWho | opening | ceil step
   5 | 33 63   | 27 61  | 33 64   |  73   94
  20 | 13 46   | 20 53  | 20 56   |  72   91
  50 | 17 51   | 18 53  | 23 58   |  78   91
 200 | 13 50   | 16 53  | 20 55   |  76   90
1000 |  8 50   |  6 45  | 10 50   |  77   88     (57 s for 3 seeds)
```

## What it suggests

- **One-step recall works with no boundaries, and the day state is what does it.**
  - When the states are set, the meet place is recalled at 92–100% (common answer 40–52%, chance 33%), and move destinations at 82–94% (common 57–66%).
  - Without the day machine, recall falls to the common answer as days accumulate: meet 45 vs 40, move 58 vs 57 at 50 days.
  - At 5 days, `noday` still gets 88% because who × weather is nearly unique per day. So the day only matters once the other machines' combinations recur.
- **Generalisation holds, and grows with exposure.**
  - On days where the rule situation never happened, the rule answer comes out at 71 / 79 / 96% at 5 / 20 / 50 days. The rule link's median hardness rises 3 → 5 → 14, and with only hard links generalisation is 87–100% at 20–50 days.
  - `noday` generalises a little better at small scale (84–87%). The day state adds day-specific soft links that compete with the rule on novel days, which is the episode/knowledge trade-off in mild form.
- **Hardness splits cleanly where it should.**
  - Day-keyed and joint-keyed links stay soft: 0–1% hard at every scale.
  - The rule link is 100% hard from 20 days on, at the fixed threshold of 3.
  - Other shared links (who, where, weather, seq) are a mixture (8–48% hard), because they carry both regular and random transitions.
  - Specific recall needs both kinds of link: hard-only gives roughly the common answer, and soft-only falls short too.
- **Whole-story reconstruction mostly fails, and it is not a capacity problem.**
  - Free runs reconstruct 20–36% of days perfectly, with 50–66% of events correct.
  - One-step accuracy is 92–95%, and 0.93^~20 steps ≈ 0.23, so the compounding accounts for it.
  - Even a perfect learner on this context is capped at 77–84% (`ceil`): within a day the same full situation recurs with different continuations. "Went to the beach, then later went to the beach again", with who/weather unchanged, gives an identical state.
  - Most failures (50–80%) begin by taking a continuation seen elsewhere, so they jump into another stretch at a shared point. Without the day, reconstruction is 0% beyond 5 days, and nearly every error is such a jump.
  - The joint code helps: `pairs` gets 10–15% perfect, against 20–25% for `full`.
- **Order within a day is the gap.** Departures from the same place in the same day are told apart at 73–92% when some machine (usually weather) differs between the two visits. When every machine state is identical, it is 50–54%, a coin flip, as the context allows. Held context states mark *which stretch*, not *where in the stretch*.
- **Capacity degrades slowly, not catastrophically.** With 1600 cells and a 2^18 pool, perfect reconstruction goes 33 → ~20 → 13–20 → 6–10% from 5 to 1,000 days. Events correct stays at about 50%, and step accuracy goes 94 → 88%. The ceiling, not the cell count, dominates throughout. 1,000 days ran in about 1 minute.

## Ways it could be fooling us

- **Queries hand over the exact situation.** One-step "recall" with all states set is a lookup keyed by a hashed conjunction (day × token, joint × token). The engineered 2^24 pool makes that near-collision-free, so it shows *sufficiency* of held states, not that an automaton would grow these codes.
- **The day is still given by the world.** `day:d` is a unique, clean token that changes exactly between stories. The boundary hasn't gone away; it has moved into a world state that the driver sets. A real "day" would be a slow, noisy drift, and this sketch doesn't test that.
- **The reconstruction ceiling is partly my world generator.** My stories revisit places under identical states, and nothing in the world marks the order within a day (time of day, tiredness, light). A richer world might break those ties for free. That makes the 77–84% ceiling a property of this stream as much as of the automaton.
- **Hardness = number of uses, by construction** (as in sketch 04, now per step). The clean day/rule split mostly reads out stream statistics: the day appears in one story, and the rule fires on many days.
- **Small numbers.** Order "identical" has n=8–26. Rule generalisation at 5 days has n=31. Capacity uses 3 seeds. `oth%` is crude: it counts any continuation seen anywhere in the stream, including the same day. Treat differences under about 10 points as noise.

## Does "episodes need no explicit boundaries when context is held by several state machines" hold up?

**Partly.** For *addressing* an episode, yes. Nothing marked a story's start or end, yet the held day state (together with the joint combination) separated days at 92–100%, versus 40–50% without it. Shared regularities still generalised to days that never saw them, and they hardened, while day-specific links stayed soft. For *replaying* an episode in order, no. Held context says which stretch you are in, not where you are within it. When a combination recurs within a stretch, a free run can't tell the visits apart, and it slips into another continuation. Perfect reconstruction stays at 20–36%, under a ceiling of about 80%. The next machine to try is one that changes with every event within a stretch and is reset by nothing: a phase or position machine, or a longer-held sequence state.

## Follow-up: time of day (variant `time`)

`node sketch.js` now runs all four variants plus capacity at 5/50/200 days (about 28 s). `CAPDAYS=1000 CAPVARS=time,full node sketch.js` runs the 1,000-day point (about 2 min).

**Change.** The world gains a `time` machine. `time:morning` is set right after `day:d`. After every 5 world tokens of the day it advances (midday, afternoon, evening) and then holds at evening. It is one more held context state, in the per-machine pairings and in the joint code, and it is written back during free runs like the others. Nothing else changed.

The tick of 5 and the four values were fixed before the first `time` run. The rule-generalisation query sets `time:afternoon`. That was a choice, and it wasn't varied.

**Reconstruction now uses the same cue positions found by search**, so `dayOnly`/`opening` are unchanged in meaning. Adding `time:*` tokens to the vocabulary shifts the random code draw for every variant, so the `full` numbers below differ from the table above by up to 5 points (for example, novel-day rule generalisation at 5 days went from 71 to 77). Read that as the noise level from the code draw.

**Failure classification.** At the first wrong token of a failed free run, every earlier token was right, so the automaton is in the true situation (all machine states + previous + current token). Each failure is put in one class:
- **Same situation, same day:** that exact situation recurs that day with a different continuation. This is missing context.
- **Same situation, other day:** the same, but the repeat is on another day. This is only possible without the day machine.
- **Unique: X differ:** the situation is unique, so the context did distinguish it, but the automaton gave a continuation seen after the same (previous, current) tokens elsewhere. X lists the machines that differ in the closest such stretch. This is interference.
- **Unique: novel continuation:** a continuation never seen after those two tokens. This is a blend.

```
variant days | dayOnly perf ev% | opening perf ev% | ceil  step | order in day: states differ / identical
full      5  |   28  62         |   32  64         |  84    95  |  92 (12)  /  -
full     20  |   16  50         |   20  55         |  80    92  |  77 (65)  / 50 (8)
full     50  |   18  52         |   23  57         |  77    92  |  72 (148) / 54 (26)
time      5  |   44  69         |   68  83         | 100    96  | 100 (12)  /  -
time     20  |   25  69         |   32  68         |  99    94  |  85 (73)  /  - (0)
time     50  |   32  73         |   34  70         | 100    95  |  80 (174) /  - (0)

one-step (time vs full, 50 days): meet 92 vs 91, move 87 vs 82, rule gen on novel days 63 vs 96 (seen days 65 vs 97)

capacity (1600 cells, 2^18 pool, 3 seeds), opening cue: perfect / events
        5      50      200     1000
full  33/61  23/57   19/55   11/50    (ceil 73-78, step 95 -> 87)
time  60/81  31/66   29/68   14/59    (ceil 99-100, step 97 -> 90)

failure classes (all cues pooled)
full  50: unique: day differ 47% | novel 30% | same situation, same day 11% | other unique 12%
time   5: novel 48% | unique: day+weather differ 30% | unique: time differ 18% | unique: day differ 3%
time  50: unique: day differ 47% | day+weather 17% | novel 13% | day+time 8% | day+where 7% | ... | same situation, same day 1%
time 1000 (capacity): unique: day differ 68% | day+weather 14% | novel 9% | day+time 6% | same situation 0%
```

### What it suggests

- **Time of day removes the missing-context problem.**
  - The ceiling goes from 77–84% to 99–100%.
  - Departures that used to be in identical states no longer exist, and same-place-same-day departures are told apart at 80–100%.
  - "Same situation, same day" failures fall from 11% to 0–1%.
- **Reconstruction improves but is not fixed.**
  - Perfect days rise from 32→68% at 5 days and 23→34% at 50 (opening cue). Events correct rise from 57–64% to 70–83%.
  - Step accuracy is only 94–96%, and over about 25 steps that compounds to roughly 30%.
- **The remaining failures are not missing context. They are interference.**
  - 47–68% are "unique: day differ". The situation was unique, and only the day separated it from another day's stretch, yet the other day's continuation won.
  - Most of the rest are a context machine plus the day differing, or blends.
  - So the hope that every failure is missing context **does not hold**. Once the context is sufficient, the limit is how strongly one soft day-keyed link beats the many shared links that recommend another day's continuation.
- **Capacity.** With time of day, perfect reconstruction goes 60→31→29→14% from 5 to 1,000 days, ahead of `full` at every size. Step accuracy falls 97→90%, which is the same slow interference.
- **A cost: generalisation dropped.** The rule on novel days is 63% at 50 days, against 96% for `full`. A held time state adds time×token and joint links, which compete with the hard where×weather rule link. This might be partly my choice of `time:afternoon` in the query. I didn't vary it, to keep the no-tuning rule, but it should be checked next.

### Ways it could be fooling us (additions)

- **The time clock is a perfect position signal at coarse grain.** It ticks on world tokens, not on world time, so it is partly a counter. A noisier clock would leave some missing context.
- **The failure classes are heuristic.** "Closest stretch with the generated continuation" picks the fewest differing machines. "Day differ" is therefore the most generous reading of interference.
