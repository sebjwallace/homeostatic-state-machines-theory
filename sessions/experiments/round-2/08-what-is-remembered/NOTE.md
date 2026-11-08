# Sketch 08: what is remembered

The question: sketch 07 found that predictable moments leave only weak specific links, because only residual heat drives learning. Is the resulting forgetting *principled*? That would mean the surprising, distinctive parts of each day are kept, the predictable parts are lost, and anything lost is filled in from general knowledge. Or is detail lost at random?

`node sketch.js` (about 10 s) prints the tables below. The raw output is in `out.txt`.

## Set-up

- The automaton is sketch 06's, unchanged: summed voting, time of day, 3200 cells, k=8, threshold 3, seeds 1–3, at 50 and 200 days. There was no tuning. The only addition is that `live()` records the heat of each step.
- **Surprise at the time** is the heat when a token was first predicted while living (1 − overlap/k).
  - Heat turns out to be bimodal. About 36–41% of events have heat exactly 0, about 56% have heat above 0.75, and very few fall in between.
  - So the "top third by surprise" is not well defined, because of ties. I use heat groups instead: **top** (> 0.5), **mid** (0–0.5] and **bottom** (= 0).
- **General knowledge (GK)** has two versions:
  - **bigram:** the most common continuation of (prev, cur) over the whole stream. It ignores all held states and leaves the event itself out (leave-one-out).
  - **hard-only:** the automaton's own readout using only links with h ≥ 3.
- **Recall** is a one-step query with learning off, from the event's true full context (states plus the last two tokens).
- **Gist** is a free run from the opening cue, as in sketch 06, scored position by position against the true day. "Synced" means before that day's first error. After the first error, positions are misaligned and the score mostly measures drift.
- **Error types.** Each wrong token is judged in the automaton's own (possibly drifted) situation:
  - **typical:** it equals the bigram mode for that (prev, cur).
  - **plausible:** it occurs after that (prev, cur) somewhere in the stream, but is not the mode.
  - **novel:** it never occurs there.
- **chance-typical** is the share of errors that would be typical if wrong answers were drawn from the stream's other continuations in proportion to their frequency.

## Results

```
                                                         50 days        200 days
one-step recall overall                                    96%            95%

Recall by heat at the time            recall (n)        | GK bigram right | GK hard-only right
  heat 0                             91 (1371) / 90 (6265) |  85 / 83 |  86 / 87
  heat (0,.25]                       55 (  40) / 66 ( 328) |  45 / 35 |  68 / 66
  heat (.25,.5]                      60 (   5) / 77 (  44) |
  heat (.5,.75]                     100 (   4) / 93 (  27) |
  heat (.75,1]                      100 (2400) /100 (8633) |  37 / 30 |  30 / 30

Recall by GK predictability (bigram leave-one-out p(true next))   50 d     200 d
  p = 1                                                          99       99
  [.5,1)                                                         93       91
  [.2,.5)                                                        92       91
  (0,.2)                                                         94       93
  p = 0                                                          96       97
  seen once (no estimate)                                        97       97
  GK hard-only right / wrong                                  95 / 97  94 / 96

Recall, heat group x GK bigram          GK right       GK wrong
  top  (>.5)                           100 / 100      100 /  99
  mid  (0,.5]                           63 /  71       50 /  65
  bottom (=0)                           94 /  94       69 /  71
Where the lost events sit (share of one-step misses): top 4/5%, mid 13/16%, bottom 83/79%

Gist (free run, synced positions only)   50 d    200 d
  top-heat events                         100     100
  mid-heat events                          50      68
  bottom-heat events                       93      92
  GK bigram right / wrong              97 / 95  96 / 94
  (all positions incl. after drift: top 73/67, bottom 77/73 — dominated by misalignment)

Error types                         n (50/200)   typical  plausible  novel | = hard-only | chance-typical
  first error of the day             85 / 388    12 / 15   59 / 70  29 / 15 |   16 / 15   |   18 / 19
  all errors (incl. after drift)    791 / 3778   45 / 39   45 / 56  10 /  5 |   35 / 40   |   50 / 43
```

## What it suggests

- **The surprising parts are kept, very reliably.**
  - Events that were surprising when they happened (heat > 0.5) are recalled at 99–100%, whether or not general knowledge predicts them. That holds in one-step recall and in a free run up to the first error.
  - Losses concentrate where heat was zero: 79–83% of one-step misses are events the automaton had already predicted when they happened.
  - Half of the theory's claim holds: residual heat decides what is laid down firmly.
- **What is lost is not chosen by whether general knowledge could rebuild it.**
  - Recall is almost flat against GK predictability: 91–99% across the bins, 97% for events GK gets wrong, 95% for those it gets right.
  - The worst losses are the cell the principle says should *not* lose: events that were predicted at the time (heat 0) but that GK gets wrong. Their recall is 69–71%, against 94% where GK is right.
  - These events were predicted at the time by *specific* soft links (same day, same pair), so nothing was laid down. Later, other episodes compete those links away, and there is no general fallback to give the right answer. "Predicted at the time" is not the same as "predictable from general knowledge". Residual-heat learning treats the two as one.
- **Partly expected events fare worst.**
  - Recall is 50–77% at heat (0, 0.5]. Below the melting point (heat 0.5), plasticity is 0, so these events get only the 0.05 baseline increment.
  - They are rare (about 3%), but they are a structural blind spot: half-surprises are under-learnt.
- **Errors are not reconstructions from the usual.**
  - At the moment memory first fails each day, only 12–15% of wrong answers are the typical continuation. That is *below* the 18–19% chance level, and only 15–16% match the hard-links-only answer.
  - Most first errors (59–70%) are *plausible*: something that does follow those two tokens elsewhere, but not the norm. That is an intrusion from another episode, as in sketch 06's interference finding.
  - 15–29% are novel blends.
  - Over all errors, including after drift, typical answers make up 39–45%, again no better than chance (43–50%).
- **Verdict.** Half-principled. Keeping is principled: surprise is stored strongly and recalled. Forgetting is not selective in the right way, and the gaps are filled by intrusions from other episodes rather than by gist. This is not random noise, since 70–85% of errors are continuations that really occur in that spot. But it is closer to confabulation from neighbouring episodes than to "remember the surprises, rebuild the rest from the usual".

## Ways it could be fooling us

- **The definition of "typical" carries the verdict.** If "typical" means any continuation seen in that spot (typical + plausible), then 70–85% of first errors qualify, and the story becomes "sensible errors". I fixed "typical" as the bigram mode before running. A GK that conditions on *some* held states (where × weather, say) might judge many "plausible" errors typical. I didn't try that.
- **Surprise is nearly binary.** With heat almost always 0 or above 0.75, "recall vs surprise" is a two-group comparison, and the mid group is small (n = 45 / 372).
- **High-heat recall at 100% is partly built in.** A high-heat event got a large weight update at the last occurrence of its context, and one-step recall from the exact same context is the easiest test there is. A cue with partial context, or recall after much more interference (1,000 days), might separate the groups differently.
- **Heat is measured with the automaton's own readout while living.** Events seen early in the stream are high-heat simply because little was known. So surprise is confounded with time in the stream.
- **The gist comparison is position-aligned.** After the first error, a free run drifts out of step, and the "all positions" numbers mostly measure misalignment. Only the synced and first-error figures are clean, and the first-error n is modest (85 at 50 days).
- **3 seeds, no tuning, no capacity point.** Differences under about 5 points in the large bins, and about 15 points in the small ones, are noise.
