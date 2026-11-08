# Sketch 09: a ledger beside the automaton

The question: alongside the automaton, add a dead-simple, non-learning ledger (a loose hippocampus). How small can it be while whole-day reconstruction stays near-perfect? And does replaying it into the automaton help general knowledge?

`node sketch.js` takes about 90 s and prints everything. The raw output is in `out.txt`. `sketch06.js` is sketch 06 unchanged; `sketch.js` loads it and adds the ledger.

## Set-up

- **World and automaton.** Sketch 06's stress test, unchanged: summed voting, time of day, 3200 cells, k=8, threshold 3, seeds 1–3, 50 and 200 days. No tuning.
- **Ledger row.** One row per input: the held states (day, time, who, where, weather), the last two tokens, and the input itself. There is no learning in the ledger.
- **Reconstruction.** A free run from the opening cue, as in sketch 06. At each step, if the ledger has a row whose situation matches exactly, its input is read. Otherwise the automaton predicts. "Replay" is this chain of reads.
- **Content-addressable lookup.** Given any subset of keys, return the row matching the most keys, with ties broken at random. There are 3 random non-clock targets per day.
- **Write policies.** Each is decided at the time of the input, from the automaton's own prediction before learning:
  - `fail`: the prediction was wrong.
  - `heat`: heat above 0.
  - `surprise`: heat above 0.5.
  - `soft`: wrong, or the hard-only readout was wrong. This is the brief's suggestion.
  - `predSoft`: right, but the hard-only readout was wrong. This is sketch 08's "predicted through soft links" taken literally.
  - `pred`: the prediction was right.
  - `random` / `randomPred`: random rows at the rate of `soft` / `pred`.
  - `oracle`: not causal. The rows the *final* automaton gets wrong, one step at a time.
- **Consolidation.** At the end of each day, that day's rows are replayed once through the automaton with learning on. Two versions: all rows (`all`), or only the `soft` rows (`soft`).
- **Forgetting.** Ledger rows from the first 80% of days are pruned, and only the last 20% are kept. Because every row key contains the day, pruned days are rebuilt by the automaton alone.

## Results

```
Whole-day reconstruction, opening cue. perfect% / events% (rows stored as % of all)
                             50 days                     200 days
ledger                no cons  cons:all cons:soft  | no cons  cons:all cons:soft  | rows %
none (automaton)       43/75    63/87    55/81     |  36/70    50/79    39/73     |   0
all (ceiling)         100/100  100/100  100/100    | 100/100  100/100  100/100    | 100
fail / surprise        45/76    66/88    57/82     |  37/71    54/80    42/74     | 57-63
heat                   52/79    71/90    63/85     |  43/75    57/83    49/78     | 59-64
soft (brief)           75/90    85/94    76/89     |  61/84    70/89    57/82     | 68-75
random @ soft rate     83/94    88/96    85/95     |  70/88    81/92    74/89     | 68-75
predSoft               72/89    81/92    73/87     |  58/82    65/86    53/80     | 10-12
pred (predicted right) 96/98    94/98    94/98     |  95/98    93/97    94/98     | 37-43
random @ pred rate     56/80    76/91    63/86     |  56/81    65/86    57/82     | 37-43
oracle (not causal)   100/100  100/100  100/100    | 100/100  100/100  100/100    |  3-5
pred, last 20% days    49/77    64/87    57/82     |  43/74    54/80    47/76     |  8-9

Content-addressable lookup, full ledger    exact row / right day+place / right day %; mean ties
cue                          50 days               200 days       misses land on (200 d)
weather+who+time           23 / 38 / 57  (8)    10 / 18 / 28 (21)   other day, same who 47%, same who+where 40%
  same, time +/-1           3 / 17 / 38 (26)     2 /  9 / 20 (48)   other day, same who 49%
who+where+weather+time     47 / 74 / 74  (5)    34 / 54 / 54 (12)   other day, same who+where 100%
all 7 keys, one wrong      95 / 96 / 96  (1)    92 / 92 / 92  (2)   other day, same who+where 86%
all 7 keys, day wrong      85 / 85 / 85  (2)    68 / 68 / 68  (3)   other day, same who+where 96%
day+where (clean)          20 /100 /100  (7)    20 /100 /100  (7)

Consolidation and forgetting (automaton alone; old = first 80% of days, whose rows are pruned)
                 gen place-rule all/hard | one-step | old days: meet/move, rule | whole-day perf old / new | %hard day/joint/where
 50 d  none            81 / 17           |   96     |     92    94              |   36 / 73                |  0  0 20
       cons:all        80 / 98           |   97     |     95    94              |   58 / 83                |  3  1 34
       cons:soft       80 / 98           |   97     |     95    94              |   49 / 77                |  3  1 34
200 d  none            68 / 83           |   95     |     91    86              |   30 / 58                |  1  0 27
       cons:all        61 / 69           |   97     |     95    91              |   44 / 77                |  5  4 44
       cons:soft       61 / 69           |   96     |     94    90              |   34 / 61                |  5  4 44
```

`pred` and `randomPred` were added after seeing that `soft` lost to random rows. `oracle` was added as a lower bound.

## What it suggests

- **A ledger of about 40% of rows gives near-perfect reconstruction, if it stores the rows the automaton *got right* at the time.** `pred` reaches 94–96% perfect days at 37–43% of rows. A random ledger of the same size gets 56–76%. That is the inverse of "write down the surprises", and it fits sketch 08 exactly. Surprising inputs are laid down strongly and kept, so writing them is wasted: `fail` and `surprise` use about 60% of rows and add 0–2 points. The rows that get lost are the ones predicted at the time, because nothing was learnt from them. The literal sketch 08 rule (`predSoft`, predicted right but not by hard links, about 10% of rows) recovers about half the gap. `soft`, as briefed, does *worse* than random rows of the same size, because most of what it writes is surprises.
- **The non-causal floor is 3–5% of rows.** If the ledger could know which steps the automaton will lose *later*, writing those alone gives 100%. A causal policy needs about 10 times that, because at writing time you can't tell which correct predictions will later be competed away.
- **Partial cues mostly retrieve the wrong day.** weather+who+time finds the right day and place 18–38% of the time, falling with more days, with 8–21 tied rows. Misses land on another day with the same person, and often the same place: the same interference as inside the automaton, now in the lookup. One wrong key out of seven is tolerated (92–96%). A wrong *day* key is tolerated only where the rest of the situation is unique to that day: 85% at 50 days, 68% at 200. Day+where is always right on the day, because day is effectively a primary key.
- **Consolidation strongly helps the automaton's own recall, and its effect on general knowledge is mixed.** Replaying each day once lifts the automaton-alone perfect days from 43→63% at 50 days and 36→50% at 200, and lifts recall of old-day specifics (meet/move one-step 91→95). Hard-only rule generalisation jumps at 50 days (17→98), because the rule hardens sooner. But at 200 days it *falls*: all links 68→61%, hard-only 83→69%. Day- and joint-keyed links also start to harden (0–1% → 3–5%), which is the episodic-to-semantic confusion the hardness split was meant to avoid. Replaying only `soft` rows costs nearly the same generalisation and gives less recall gain.
- **Forgetting leaves the general rules standing and loses whole days.** After pruning old rows, old days fall to the automaton alone: 30–58% perfect. One-step recall of rules (86–94%) and of specifics (91–95%) stays high. So what is lost is the reliable *chaining* of specific steps, not the rules. Consolidation before pruning is what keeps more of it (36→58%, 30→44%).

## Ways it could be fooling us

- **A full ledger with clean keys is trivially a database.** Its 100% says nothing about memory. Every row key contains `day` and the exact last two tokens, so a "read" is an exact-match hash lookup that the automaton never has to find. The interesting numbers are the partial-cue table and how small the ledger can be, and even the small ledger leans on exact keys.
- **`pred` writes most of the predictable stream.** Forty percent of rows is not small, and a perfect "write what you got right" relies on the ledger knowing the outcome at once. That is fine for a ledger, but it means the automaton's own memory is doing the work only on the other 60%, which are mostly surprises it holds anyway.
- **The consolidation result is partly just repetition.** Replaying every row once means each day is experienced twice. A fairer control would compare against living each day twice without a ledger. I didn't run it. The fall in generalisation at 200 days is mostly seed-driven: seed 1 dropped from 43 to 18% on all links. Treat it as "no evidence it helps at scale", not as a clear cost.
- **Policies were partly chosen after looking.** `pred`, `randomPred` and the switch of the forgetting test to the `pred` ledger came after the first run. `soft`, `fail`, `heat` and `surprise` were fixed before it.
- **3 seeds, one world, and the lookup is a flat count of matching keys** with no weighting by how rare a key is. A weighted match (rare keys count more) would likely improve the partial-cue numbers. Differences under about 5–10 points are noise.
