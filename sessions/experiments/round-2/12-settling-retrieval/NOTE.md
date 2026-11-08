# Sketch 12: settling retrieval (the cue's candidates chosen by energy)

The question: in sketch 11, chained replay picked the next ledger row by matching the cue token, with ties broken at random. It reached the right row (the second fact's `ev:in` after C) in 28 of 60 chains, and the link formed in 18. Does it help to let the **automaton** choose among the ledger's candidates by settling, taking the row that leaves the least misfit with everything it currently holds?

Run: `node sketch.js` (about 30 s, output in `out.txt`) and `node trace12.js` (hop diagnostics). The world, queries, seeds, subject rule, cap and scoring are unchanged. Sketch 11's S/C rows are reproduced exactly at the top of `out.txt`. Sketch 10's rows are dropped from the default run (`ALL=1` adds them back).

## The change (fixed before the run)

- **Ledger.** It returns every unused row in the window that has at least one key equal to the cue. It does no scoring.
- **Automaton, mode `echain`.** For each candidate row q, E(q) = prediction heat + situation misfit.
  - Prediction heat = `1 - overlap(current prediction, code[input of q]) / K`. This is the learning rule's heat measure.
  - Situation misfit is the mean over slots {last, last2, day, time, who, where, weather, subj} that are set in both the automaton's current situation and the row's. For each slot it is `1 - overlap(codes) / K`.
  - The lowest E wins. Exact ties are broken at random. The measure makes no reference to keys, containers, rooms or the query.
- **Ablations.** `echainS` uses the situation term only. `echainP` uses the prediction term only.
- **Subject-rule variants (env `sm`).** `noisy`: the rule fails to fire 40% of the time, so the subject stays stale. `last`: every content token sets the subject, so in "K in C" the subject ends as C. `last` stands in for a different word order.
- **Post hoc (after the first run): `echainX`.** It is `echain` with the row that comes next in time removed from the candidates. Reasons are below.

## Results (5 seeds, 60 join queries)

```
condition              | join right% bits day-st% | half ctrl | free→room | K in→C | C in→R | went% rule% ruleGen% | subj margin | right row reached / link formed (of 60) | subjK→true/other room
S  none                |    7  0.04   8           |   23      |    2      |  100   | 100    |  93   99 100         |  -0.38      |  -                    | -
S+C after, hot (sk11)  |   35  0.25  35           |   20      |   30      |  100   | 100    |  88  100 100         |  17.5       | 28 / 18               | 38 / 11
S+C after, all (sk11)  |   25  0.19  27           |   20      |   28      |  100   | 100    |  85   99 100         |  12.3       | 19 / 11               | 34 / 6
S+E after, hot         |   10  0.07  12           |   20      |    2      |  100   | 100    |  97  100 100         |   1.7       |  2 / 2                |  2 / 0
S+E after, all         |   10  0.07  13           |   20      |    0      |  100   | 100    |  97  100 100         |   1.7       |  2 / 2                |  2 / 0
S+E before, hot        |    7  0.05   8           |   23      |    2      |  100   | 100    |  95  100 100         |  -0.39      |  -                    | -
S+E before, all        |    7  0.04   8           |   23      |    2      |  100   | 100    |  95  100 100         |  -0.39      |  -                    | -
E after, hot (no S)    |   23  0.07  17           |   10      |    3      |  100   |  95    |  98  100 100         |   -         |  -                    | -
S+Esit (sit. only)     |    7  0.04   8           |   23      |    0      |  100   | 100    |  98  100 100         |  -0.38      |  -                    | -
S+Epred (pred. only)   |    9  0.05  11           |   20      |    3      |  100   | 100    |  74  100 100         |   0.74      |  2 / 1                |  1 / 0
S+rC shuffled (sk11)   |   12  0.05  17           |   15      |    2      |   95   | 100    |  91   93 100         |   0.60      |  -                    | -
-- post hoc: time-next row excluded from candidates --
S+EX after, hot        |   23  0.15  25           |   18      |   17      |  100   | 100    |  78   99  90         |   -         | 14 / 9                | 11 / 8
S+EX after, all        |   18  0.14  20           |   23      |   17      |  100   | 100    |  80   99 100         |   -         | 12 / 8                |  9 / 10
S+EX before, hot       |    7  0.04   8           |   23      |    2      |  100   | 100    |  83  100 100         |   -         |  -                    | -
-- subject rule weakened --
noisyS none            |   12  0.05  12           |   23      |    2      |  100   |  98    |  92  100 100         |  -0.04      |  -                    | -
noisyS+C after, hot    |   22  0.12  28           |   25      |   33      |  100   | 100    |  85  100 100         |   6.7       | 11 / 8                | 28 / 48
noisyS+E after, hot    |   13  0.06  13           |   20      |    3      |  100   | 100    |  97  100 100         |   1.1       |  1 / 1                |  5 / 25
noisyS+EX after, hot   |   33  0.18  31           |   18      |   20      |   94   |  93    |  80  100 100         |   -         | 15 / 11               | 20 / 40
lastS+C after, hot     |    8  0.05  27           |   20      |   20      |  100   | 100    |  86  100 100         |  -0.39      |  0 / 0                |  0 / 0
lastS+E after, hot     |    7  0.05  13           |   20      |    2      |  100   | 100    |  98   99 100         |  -0.39      |  0 / 0                |  0 / 0
lastS+EX after, hot    |    8  0.05  13           |   23      |    8      |  100   | 100    |  76   97 100         |   -         |  0 / 0                |  0 / 0
chance 17%
```

## What happened

**Settling by energy makes retrieval worse: 2 right rows of 60, against 28 by random tie-break.** At a C cue under subj=K (S+E, hot), the mean energy terms per candidate type are:

| candidate | prediction heat | situation misfit |
|---|---|---|
| the next row in time (same episode) | 0.03 | 0.00 |
| another row from the same day | 1.00 | 0.38 |
| **the right row** (2nd fact, `ev:in` after C) | 0.96 | 0.77 |
| the room row (wrong slot) | 1.00 | 0.90 |

- Among the candidates, the row that comes next in time is always the best fit, by construction. Its situation is exactly the automaton's current one, and its input is exactly what the automaton predicts. So settling turns chained replay back into in-order replay (54 of 60 C hops). That is why `went%` recovers to 97: this is close to restore replay.
- The right row is high energy by its nature. It comes from a different day, time, weather and companion. Its recorded subject is C, not K. Its input (`ev:in` after C) is not what the automaton predicts. **A bridge row is the row that does not fit the current context. That is what makes it a bridge.** A misfit measure against "everything held" therefore selects against it. Both terms do this separately (Esit: 0 links; Epred: 1).
- **Post hoc (EX), with the in-time next row removed.** Settling then goes to the next most familiar row, usually another row from the same day (19 of 60). The right row is reached in 14 of 60, half of sketch 11's 28. The join is 23% (sketch 11: 35%). Damage is worse: `went%` 78 and ruleGen 90, because the hops land on same-day rows and scramble that day's sequence. Removing the next row is also an ad hoc fix, not settling.
- The room slot, sketch 11's main wrong hop, does disappear under settling (0 vs 20). But it loses to familiar rows, not to the right one.

## Does the energy choice encode the answer?

**No, and here the question hardly comes up, because it does not find the answer.** It never prefers the right row. Measured against K, the subject term pushes away from the right row, whose subject is C. Nothing is keyed to word order inside the energy.

What *is* keyed to word order is still sketch 11's subject rule, and this sketch confirms it.
- With `last` (subject = the last content token, which is what "in the tin is the key" would give), every mode has 0 links and 7–8% join. That holds for C, E and EX alike.
- With `noisy` (40% misfires), sketch 11's tie-break falls from 35% to 22%, and false links rise sharply: subj=K followed by the wrong room 48 times, against 28 right. noisyS+EX's 33% (11 links, all answered right) is the best number under noise. But it is post hoc, it has 40 false subj→room steps, and it dents the direct facts (94/93). I would not read it as a gain that survives; on 60 queries it is within noise of 22–35%.

## Verdict

Settling by "least misfit with everything held" does not fix retrieval. It fails for a structural reason, not a tuning one. A join needs the replay to cross to a row from a different context that shares one token. Total-context energy rewards staying in the same context. In the README's terms, the valley nearest the current state is the current episode. Hopfield settling completes the pattern you are already in, and that is the opposite of hopping.

What might work, and was not tried here: the cue alone defines the basin, and the rest of the held state acts only as a weak tiebreak. Alternatively, the episode just replayed is made *hot* (high misfit with the row just used, so the automaton moves away from it). In either case, the "fit" that matters is fit on the shared token, not on the whole situation. That is closer to sketch 11's tie-break than to settling.

## Ways it could be fooling us

- The situation term compares slot by slot with random codes, so codes of different tokens barely overlap. Misfit is close to binary (same token or not). A learned similarity might grade candidates differently. But it would still rank the same-episode row at 0.
- The prediction term uses the current prediction, which already knows the day's sequence. That bias is inherent to "fit with own predictions".
- EX was added after seeing the first run. A bug in the first EX run silently fell through to sketch 11's tie-break and gave identical numbers. It was caught and fixed, and the table above is from the fixed run.
- 60 queries per row. The trace counts (links formed → answered right, 100% in every mode) are firmer than the percentages.
