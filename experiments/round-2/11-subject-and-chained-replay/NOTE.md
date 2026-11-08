# Sketch 11: subject state + content-following replay

The question: sketch 10 found no join. Do two additions produce one: a held **subject** state, and replay that **follows content** from row to row? The test is whether the ordinary waking rule then learns "key in tin" + "tin in kitchen" → (key, in) → kitchen.

To run: `node sketch.js` (about 18 s, output in `out.txt`) and `node trace.js` (diagnostics). The world, queries, seeds, scoring and sketch 10's conditions are all unchanged. Sketch 10's rows are reproduced exactly at the top of `out.txt`.

## What was added (fixed before the single run)

- **Subject state** (`subj`). This is a sixth held machine, wired exactly like `who`: it has its own `subj×cur` conjunction, and it is part of the joint code and part of every ledger row. **Rule:** a content token (not `day/time/weather`, not `ev:`) that directly follows a clock token sets the subject. It is held until the next such token. In this world that makes the subject K, C, `who:P` or `obj:umbrella/hat`. The patch to the automaton is two string replacements on sketch 06's `context`.
- **Chained replay** (`cchain`). Start rows are hot rows (or all rows) in time order, skipping rows already used. The first row is replayed with its recorded situation. After that:
  - If the input just replayed is a content token x, a content-addressable lookup over the unused rows of the window picks the next row. A row's score is the number of its keys (held states + last two tokens, not its input) equal to x. The best score must be at least 1, and ties are broken at random.
  - Otherwise, the next row in time is used.
  - The chosen row's *input* is fed as the next token. Held states persist; they are set only by tokens, as when awake. They are reset only between chains. The cap is 12 rows.
  - `rchain`: the lookup is replaced by a random unused row (the shuffled control).
- **Queries.** These are sketch 10's queries, with one change: `subj` is set to the query's first token (K, or C for the direct fact). That is what the subject rule does with the query "K in ?". Everything else stays empty.

## Results (5 seeds, 60 join queries per row)

```
condition              | join right% bits day-st% | half-chain ctrl | free-run→room | K in→C | C in→R | went% rule% ruleGen% | subj-route margin
1 none (sk10)          |   23  0.08  12           |   10            |    7          |  100   |  95    |  92  100 100         |   -
5 after, hot/chain(sk10)|  23  0.08  10           |   10            |    7          |  100   |  88    |  93   44  60         |   -
S  none                |    7  0.04   8           |   23            |    2          |  100   | 100    |  93   99 100         |  -0.38
S  after, all/restore  |    7  0.04   8           |   23            |    0          |  100   | 100    |  99  100 100         |  -0.38
S  after, hot/stream   |    7  0.04   8           |   23            |    5          |  100   |  97    |  92   39  70         |  -0.38
C  after, hot (no S)   |   25  0.09  30           |   10            |   23          |  100   |  98    |  87  100 100         |   -
C  after, all (no S)   |   25  0.09  25           |   10            |   25          |  100   | 100    |  90  100 100         |   -
S+C after, hot         |   35  0.25  35           |   20            |   30          |  100   | 100    |  88  100 100         |  17.5
S+C after, all         |   25  0.19  27           |   20            |   28          |  100   | 100    |  85   99 100         |  12.3
S+C before, hot        |    7  0.05   8           |   23            |    2          |  100   | 100    |  90  100 100         |  -0.44
S+C before, all        |    7  0.05  10           |   18            |    3          |  100   | 100    |  89  100 100         |  -0.44
S+rC after, hot (shuf) |   12  0.05  17           |   15            |    2          |   95   | 100    |  91   93 100         |   0.60
chance 17%
```

## Trace (`trace.js`, S+C after, hot)

- **The join comes from exactly one link: `subj=K × ev:in → R`.** It forms when replay goes `… K in C` (day d), the lookup on C lands on the second fact's `ev:in` row (its last token = C), and then the next row in time is fed, giving `R`. At that step the subject still holds K, because C is not after a clock token, so it does not reset the subject. The ordinary rule then strengthens `subj(K)×ev:in → R`. The margin table shows the join is carried entirely by the `subj` route (17.5); `sym`, `seq` and `joint` are unchanged.
- **Every chain where that link formed is answered right: 18/60 (hot), 11/60 (all).** No chain where it didn't form gains anything beyond the baseline bias. So the effect is per fact and specific.
- **The join is weak because of coverage, not the rule.** With all-row starts, 19/60 chains hop to the `ev:in` row. 22/60 instead hop to the *room* row, whose key `last2` = C ties with `last` = C. That teaches `subj=K × C → R`, the wrong slot, which the query never asks. In the remaining 19/60, C is followed by its own day's next token (time/weather/who), or the chain ends.
- **False joins: some, and small.** Across all replay steps (about 2600), 38 had subj=K followed by K's true room, and 11 had subj=K followed by a different room. The half-chain controls do not rise: 23% under S with no replay vs 20% under S+C, and the subj-route maximum is unchanged at 2.73. Separately, 165 steps had subject = a person followed by an object token, linking a `who` sentence to an unrelated object fact. Those are false cross-links. They did not show in the measures.
- **Damage.** `went%` (day-specific) drops from 92/93 to 88 (hot) and 85 (all). Rules, rule generalisation and direct facts are untouched. That is far less damage than sketch 10's `chain`/`stream` modes (rule 44%, ruleGen 60%), because content-following hops at a shared token instead of stitching arbitrary rows.

## Ablations

- **S without chaining: no join (7%).** The subject state alone also *removes* sketch 10's 23% baseline. That 23% was partly the all-empty-joint leak. With subj=K in the query, the joint code changes and the leak goes, so the S rows' honest baseline is about 7–8%. Against that baseline, S+C's 35% is a larger lift than it looks against 23%.
- **Chaining without S: no one-step join (25%, bits 0.09).** But free runs from (K, in) now reach R 23–25% of the time, against 7%. Chaining teaches `(in, C) → in` across days, so the generated sequence goes `K in C in R`. That is a two-hop *recall by generation*, not a one-step join. It is a different and real effect.
- **Both together: the one-step join appears (35% / 0.25 bits hot, 25% / 0.19 all).**
- **Timing control: passes.** With the quiet period before the second facts there is nothing to join, and the result is 7%.
- **Shuffled chaining: 12%.** No join. It also gave the only dent in K in→C (95%) and in rule% (93).

## Earned or encoded?

**Partly earned.** The link is formed by the ordinary rule from ordinary held-state context, and it appears only when both additions are present, only after both facts, and only for the chains whose replay actually made the hop. The rule does no joining. But three set-up choices carry real weight, and each is a place where the task leaks in:

1. **The subject rule fits this world's grammar.** "First content token after a clock token" picks exactly K in "K in C". It is general in form, but in this world it is tuned to sentences starting with the thing they are about. If the world were "in the tin is the key", the subject would be the wrong token.
2. **The query sets subj=K.** That is the same rule applied to the query, and it is consistent, but without it the join would be invisible to the query. Sketch 10 queried with empty states.
3. **The chain hops on C and then runs on in time.** That is what makes `ev:in` the input arriving under subj=K. Hopping to the wrong slot (22/60) teaches a useless link. So which row wins the lookup decides whether the join is learned, and that is left to tie-breaking.

The automaton itself contributes no inference. What it contributes is that a held subject outlives the hop, and nothing more is needed. This confirms sketch 10's diagnosis (a): the missing piece was a held state that keeps K, plus a replay order that brings R while it is held.

## Ways it could be fooling us

- 60 queries; 35% vs 23–25% is about 7 extra hits. The trace (18/18 learned → right, 0 elsewhere) is stronger evidence than the percentages.
- The subject rule and cap were fixed before the run, but they were designed with this hypothesis in mind.
- The false `who`-subject → object links did not hurt any measure here, but nothing measured them directly.
