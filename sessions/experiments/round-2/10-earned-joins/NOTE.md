# Sketch 10: earned joins

The question: if the ledger replays rows into the automaton during a quiet period, and the automaton learns from them with exactly the waking rule, does it join "the key is in the tin" (one day) with "the tin is in the kitchen" (a later day)?

**Short answer: no.** The join does not appear under any replay condition, and the reason is structural, not a matter of tuning. The ordinary rule has no way to form it from ledger rows.

`node sketch.js` takes about 8 s. Raw output is in `out.txt`. `sketch06.js` is unchanged; `sketch.js` uses its automaton (`context`, `inp`, `learn`, kwta, hardening) and a copy of sketch 09's `step`.

## Set-up

- **World.** 32 days. Phase 1 (days 0–15): each day has one first fact `obj:K ev:in obj:C` among 3 distractor stories. Phase 2 (days 16–31): 12 days have the second fact `obj:C ev:in where:R`, and 4 have distractors only. The 4 objects whose container never gets a room are the "half-chain" controls. There are 6 rooms, so chance is 17%. Distractors are either `who:P ev:went where:R` (day-specific), or a weather change followed by a general rule (rainy → `ev:took obj:umbrella`, sunny → `ev:took obj:hat`, otherwise `ev:stayed`). The day, time and weather machines are set by tokens, as in sketch 06. Seeds 1–5.
- **Automaton and learning.** Sketch 06 unchanged. One `step` function is used both awake and in replay.
- **Ledger.** One row per input: the input plus the situation it arrived in, and the heat at that moment. It does no learning.
- **Quiet period.** It replays the rows written since the last quiet period, once, with learning on. The selections and modes were fixed before the first run, except `chain`:
  - Selection: `all` rows, or `hot` rows (heat > 0.5 when they arrived, about 68% of rows).
  - `restore`: each row is replayed with its recorded situation. This is equivalent to living the selected steps again.
  - `stream`: the selected inputs are fed in as one continuous stream, and the machines are set by tokens, as when awake.
  - `shuffle`: like `stream`, but in shuffled order.
  - `chain` (added after the first null result): the next row is an unused row whose previous token is the input just replayed, so replay can hop across days at a shared token. Otherwise it continues in time order.
- **Conditions.** 1 = no quiet period. 2 = quiet period after both facts. 3 = quiet period at the start of phase 2, before the second facts. 4 = shuffled. 5 = chain.
- **Queries (learning off).** All machine states are empty. The query is prev=`obj:K`, cur=`ev:in`. The score for each room is the summed input into that room's code cells. "right%" means the right room is the top room, with ties split. "bits" is log2(6 × the smoothed share of input going to the right room). "perm%" is the same query scored against a different chain's room, as a frequency baseline. "day-state%" sets the day machine to the day of the first fact. "free-run reaches room" checks whether a 4-step free run from `(K, in)` emits the right room anywhere.

## Results (5 seeds, 60 join queries per condition)

```
condition              | join right% bits perm% day-st% | half-chain ctrl right% | free-run hits room (empty/day) | K in→C | C in→R decode/rank | went% rule% ruleGen%
1 none                 |   23  0.08   10   12           |   10                   |   7  2                          |  100   |  95 /  97          |  92  100 100
2 after, all/restore   |   23  0.07   10   12           |   10                   |   3  0                          |  100   |  95 /  97          |  99  100 100
2 after, hot/restore   |   23  0.07   10   12           |   10                   |   7  2                          |  100   |  97 /  97          |  93  100 100
2 after, hot/stream    |   23  0.07   10   12           |   10                   |   7  7                          |  100   |  95 /  95          |  92   34  70
3 before, all/restore  |   23  0.08   10   12           |   15                   |   7  2                          |  100   |  97 / 100          |  93  100 100
3 before, hot/restore  |   23  0.07   10   12           |   15                   |   7  2                          |  100   |  98 / 100          |  92  100 100
3 before, hot/stream   |   22  0.08   10   10           |   15                   |   5  7                          |  100   |  98 / 100          |  92   87 100
4 after, hot/shuffle   |   24  0.08   11   14           |    8                   |   5  0                          |  100   |  90 /  97          |  92   64  80
5 after, hot/chain     |   23  0.08   10   10           |   10                   |   7  3                          |  100   |  88 /  88          |  93   44  60
5 before, hot/chain    |   22  0.07   10   10           |   15                   |   5  2                          |  100   |  97 /  98          |  92   89  80
5 after, all/chain     |   23  0.07   10   12           |   10                   |   3  0                          |  100   |  97 /  97          |  99  100 100
chance 17%; "always guess the commonest chain room" baseline: 30%
```

Margin traces for the join query (input to the right room minus the mean input to the other rooms, by route) are almost identical in every condition. They come from `sym` (about 2.8) and `joint` (1.85). Every other route contributes 0.

## What it suggests

- **No join, with or without replay, in any order.** Join right% is 22–24% in every condition, and it doesn't move between none, after, before, shuffle or chain. Bits are about 0.07. The 23% is the commonest-room bias: the `ev:in → room` symbol route favours rooms seen more often after `ev:in`. On top of that, one accidental `joint` code (the all-empty-states joint hashes onto cells shared with a trained joint) leaks a constant push toward one room per seed. The "perm" score against another chain's room is 10%, which is the bias seen from the other side. The free run from `(K, in)` produces C 97% of the time and then wanders into whatever followed C on day 1 (`time:…`, `day:…`). It reaches R only 3–7% of the time, which is about the rate at which any room shows up.
- **Why it can't happen here.** The rule learns `context(prev, cur, held states) → next input`. A link `(K, in) → R` forms only if R arrives while something in context still carries K. In the ledger, R only ever arrives after `(C, in)` on a phase-2 day. Nothing that holds K is still active by then: there is no object machine, and the seq code covers only two tokens. Replaying recorded rows, in any selection or order, re-presents the same input–context pairs. Restore mode reproduces them exactly. Stream and chain modes make new adjacencies, but the one that would matter, `K in C` immediately followed by `in R`, has the shared token C in the wrong slot: C is the *input* of the first fact and the *previous* token of the second. Even chain replay prefers C's original continuation from day 1. So the waking rule plus ledger replay is not enough to join, and this is a property of the architecture, not of the replay schedule.
- **What sketch 04 had that this doesn't.** In sketch 04, replay was generative: the symbol route drove the next state, and the context route learned from the automaton's *own* prediction. That is what pushed X,Y on to Z. Ledger replay only re-feeds stored inputs. For the join to be earned here, one of two mechanisms would be needed. I didn't add either, per the brief:
  - (a) A held state that keeps K after its step, such as an object/topic machine alongside who/where. That would be architecture, but it is a new machine, and its choice would be shaped by this task.
  - (b) Replay where the automaton's own prediction becomes the next input. For example, cue a replay with a ledger row, then let the automaton free-run with learning on. "The key is in" → `tin` (from memory) → … but then it also needs `(in, tin) → in` or a held `tin` subject, which brings back (a). (b) alone does nothing here because the rule is next-token. Generative replay is also arguably a different learning regime (learning from self-generated input), so it should be named as a mechanism rather than slipped in.
- **Replay's side-effects on other knowledge.** In restore mode it is harmless and mildly helpful. `all/restore` lifts day-specific "went" recall from 92% to 99%, and leaves the rules and direct facts unchanged. That is repetition, as in sketch 09. The modes that make new adjacencies are harmful. With `hot/stream` after, the weather rule falls from 100% to 34% and rule generalisation from 100% to 70%. With `hot/chain` after: rule 44%, ruleGen 60%, direct `C in → R` 95→88%. Stitching hot rows together teaches false transitions between unrelated rows. Direct first facts stay at 100% everywhere.
- **The timing control is moot.** With no join in condition 2, there is nothing for condition 3 to fail to show.

## Ways it could be fooling us

- **A null in one tiny world.** It has 6 rooms, 12 full chains per seed and 5 seeds. A join that is weak but real, such as a 0.1-bit shift, would be invisible here. The structural argument above is stronger evidence than the numbers.
- **The query uses empty machine states**, which never occurred in training. Empty states make the `joint` leak and the frequency bias the main drivers. Querying with the day-1 states (the "day-st%" column) gives the same null.
- **`chain` was added after seeing the null.** It is still task-agnostic: it matches on the previous token only and knows nothing about `ev:in`. It didn't help, so adding it after the fact doesn't flatter the result.
- **A bug was fixed before the reported run.** The first run stored meta tags incorrectly, so the went/rule columns read 0. The join columns were the same before and after.
- **The world's grammar decides it.** If the facts were phrased "tin: key" and later "tin: kitchen" (the shared token in the same slot, first in both), a `(tin)`-keyed seq/joint code could carry the link with no new mechanism. That would be a join built into the encoding, which is exactly what the brief rules out, so I didn't try it. But it shows that "can it join?" depends on where the shared piece sits, not only on replay.

## Bottom line

The join was **not earned**: it did not appear at all. With the waking rule and a ledger that only re-feeds stored rows, the automaton cannot join facts whose shared token sits in different slots. Getting the join needs one of two extra mechanisms, both described above and neither added: a held state that keeps the object across steps, or generative replay that learns from the automaton's own predictions. Sketch 04's join came from the second kind, generative replay.
