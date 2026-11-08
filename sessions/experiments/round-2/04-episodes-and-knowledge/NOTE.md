# Sketch 04: episodes and knowledge

The question: are episodic and semantic memory one structure at different hardnesses? Shared transitions should be recruited by many episodes and harden into general knowledge, while one-off detail stays soft. Recall is content-addressable replay from a cue.

`PART=old node sketch.js` (about 19 s, seeds 1–3; `SEEDS=1,2,3,4,5` and `LAMBDA=…` are env knobs). Plain `node sketch.js` also runs the follow-up parts (about 2.5 min in total; `VARIANTS=base,C,C2` picks variants). That is slower than the "few seconds" asked for. Most of the time goes on the dense k=80 runs.

## Set-up

- **Episodes.** Each is `U A went to P ate F_P`. `U` is a cue unique to the episode (think "that Tuesday"). There are 5 agents and 5 places. Food is fixed by place, so `P→ate→F_P` is a rule. Agent–place pairs with a==p are never shown and are held out for generalisation. Each episode is seen once.
- **Cells.** There are two pools of N=400 cells.
  - **Symbol states.** Every symbol has a random k-of-400 code: sparse k=8, mid k=32 or dense k=80.
  - **Context state.** This is a drifting trace, `x ← λ·x + R·code(sym)`. R is a fixed random projection, and kWTA keeps the top k cells. This is the only thing that carries "which episode am I in" past the first step. λ=0.85 by default.
- **Transitions.**
  - Symbol→next-symbol weights, plus context→next-symbol weights. Prediction is the kWTA of their summed input.
  - Every connection carries a weight and an earned **hardness** (sketch 01/03): `melt = 0.5 + 0.4·h`, `plasticity = clamp((heat − melt)/0.5, 0, 1)`.
- **Heat** is prediction misfit at each step, `1 − overlap(pred, actual)/k` (sketch 03's "heat from prediction").
  - Connections into the actual next state gain `(0.05 + plasticity)·(1−w)`. Familiar parts are reinforced a little. Novel parts are laid down hot, in one shot.
  - Connections into wrongly predicted cells are weakened only if they are hot enough to melt.
- **Cooling.** At the end of an episode (the whole gap has closed), every strong connection the episode used gains +1 hardness. So hardness ≈ the number of episodes that recruited the connection. No reward, no optimiser.
- **Recall.** Replay is cue-driven with learning off. Each step is cleaned up to the nearest known assembly. **Lesions** replay with only hard connections (h ≥ 3) or only soft ones.
- **Quiet (Q5).**
  - Two extra episodes: `U60 X Y` and later `U61 Y Z`.
  - In a quiet period, 40 replays start at a symbol picked with probability ∝ heat². Symbol heat is accumulated misfit, decaying ×0.97 per episode.
  - During replay, the symbol route drives the sequence. Wherever the context route disagrees with it, that is internal heat, and context→symbol connections are learned at that heat.
  - The test: after X,Y, does the **context route alone** predict Z? The symbol route Y→Z exists trivially, so it doesn't count.

## Results (3 seeds pooled, λ=0.85)

```
Q1/Q4  recall from unique cue          agent place both | newest10 mid oldest10 | wrong place = sibling% | ctx ovl same-agent/diff
sparse  k=8   25 eps                    100    73   73  |    80     73    60     |   80                   | 0.49 / 0.27
sparse  k=8  100 eps                     95    54   53  |    67     47    40     |   83                   | 0.51 / 0.28
sparse  k=8  300 eps                     85    33   30  |    40     13    30     |   73                   |
mid     k=32 100 eps                     95    45   45  |    60     30    60     |   67                   | 0.68 / 0.51
dense   k=80  25 eps                     91    31   31  |                        |                        | 0.80 / 0.68
dense   k=80 100 eps                     23     6    5  |     0      0    13     |                        |
(chance for place given the right agent is about 25%)

Q1b drift λ:  0.30 → 22%   0.60 → 34%   0.85 → 53%   0.95 → 54%   episodic recall (sparse, 100 eps)
              held-out generalisation 100 / 93 / 87 / 73 %   (trade-off)

Q2 hardness by connection kind (sparse, 100 eps, seed 1)   median h   %hard
   U→A           (one-off)                                    1         7
   A→went, to→P, P→ate, ate→F (shared)                        19–20   100
   went→to       (every episode)                              100     100
   context→P     (episode-specific)                            7       81   ← not soft
   histogram of all strong connections: h=1: 7199, 2: 1924, 3–9: 1521, 10–29: 1785, 30+: 182

Lesion (100 eps)  episodic both% | template% | held-out A_i…P_i → ate F_i | free run from agent consistent
sparse all             53        |    96     |          87               |   87
sparse hard only        8        |    25     |          87               |   93
sparse soft only        0        |     0     |           0               |    0
mid    hard only       24        |    57     |          87               |   87
dense  all              5        |    25     |          53               |   93

Q5 context route predicts Z after X,Y:  none 0%   quiet after both 100%   quiet before 2nd episode 0%   (sparse; mid the same pattern)
```

## What it suggests

- **Hardness does sort semantic from episodic, cleanly, for the symbol-level transitions.** Shared transitions sit at h≈20–100. One-off cue→agent links sit at h=1–2 (only 7% reach 3). The hardness histogram is bimodal. If you lesion everything soft, the general knowledge survives and specific episodes vanish:
  - Held-out generalisation stays at 87%.
  - Free runs from an agent stay at 87–93% ("A went to some P, ate the matching F").
  - Episodic recall falls from 53% to 8%.
  - Soft-only does nothing on its own. Episodic detail is a few soft links hung on the hard scaffold, not a separate store. That matches the hypothesis.
- **But the episode-specific part that matters most (which place) did not stay soft.** Context→place connections reached median h=7, and 81% count as hard. That is because context codes for different episodes overlap heavily (0.28–0.51, against a chance of 0.02), so "episode-specific" connections get recruited by many episodes. This is the blurring of Q4 happening inside the hardness signal itself. Hardness measures *reuse*, and with these context codes, reuse isn't the same as generality.
- **Episodic recall after one exposure works, then degrades with load, mostly through blurring rather than decay.**
  - Sparse recall: 73% at 25 episodes, 53% at 100, 30% at 300, against 25% chance.
  - The age effect is weak and noisy. There is no forgetting mechanism, so older episodes lose to interference, not to age.
  - 73–83% of wrong places are a place the same agent visited in *another* episode. So recall gives a sibling episode, not noise.
- **Sparseness does keep episodes apart, as predicted.** At 100 episodes, recall is sparse 53%, mid 45%, dense 5%. Dense codes collapse even on the shared template (25%), because everything overlaps everything. How long the unique cue lingers in context matters as much as code sparseness (λ sweep 22%→54%). It also trades directly against generalisation (100%→73%): the same context that separates episodes stops the hard template from applying to new combinations.
- **Joining during quiet worked, with the right control.** Only when replay happens after both episodes does the context route learn X,Y→Z (100% vs 0% with no quiet, 0% with quiet before the second episode). Heat-selected replay did reach the junction. Hot recent structure (U60, X, Y) was picked, and the replay chained through Y, where the symbol route ran ahead of the context route.

## Ways it could be fooling us

- **Q5 is close to built in.** Replay is driven by the symbol route, and I chose to learn context→symbol wherever the two routes disagree. Once a replay passes X→Y, learning X,Y-context→Z is almost guaranteed. The control shows the order matters, but "a link forms" is mostly a consequence of that rule, not an emergent find. Only 0.7–1.3 of 40 replays actually started at X. Most of the joining likely came from replays starting at U60 or Y, and I didn't break that down.
- **Hardness = "number of episodes that used it" by construction.** The bimodal histogram is mostly a readout of the stream statistics: each shared transition appears in about 20 of 100 episodes. The interesting result is the failure (context→place hardening), not the success.
- **The template is trivially regular and symbols are given.** Cells don't discover assemblies. Codes are assigned, and clean-up decodes against a known list. "Generalisation" is applying `P→ate→F_P`, which is a first-order transition anyone's Markov chain would get.
- **Episodic recall depends on a hand-designed drifting context.** That is a temporal-context-model device, not something the theory provides. λ was raised from 0.6 to 0.85 during the sketch because it doubled recall. That is tuning on the measure.
- **Small numbers.** There are 3 seeds and 5 held-out pairs per seed, so generalisation percentages move in steps of about 7%. Age bins hold 10 episodes. Treat differences under about 15 points as noise.

## Addendum: changes during the sketch

The first version used λ=0.6 and 5 seeds. Recall was lower (sparse/100: 31%), and the same qualitative picture held. Raising λ to 0.85 helped episodic recall and cost some generalisation. That trade-off is now reported as Q1b rather than hidden.

## Follow-up: does pattern separation keep episode detail soft?

`PART=sep node sketch.js` runs this part alone, in about 110 s. Most of that is A+B; the default `node sketch.js` now runs both parts. Part 1 is the same as before (`PART=old`).

The question: context→place connections hardened because the contexts of different episodes overlapped and were reused. If contexts are separated, do those connections stay soft, so that hardness tells episodic from semantic?

**Variants.** All settings were fixed before the first run and none were changed afterwards. λ stays 0.85 and k=8 throughout. The mechanics were reimplemented with sparse weight storage so pools can be large, which is why `base` differs from part 1 by a few points (50% vs 53% recall).

- `base`: as in part 1. 400 symbol cells, and the context is the k-winners of the trace in the same 400 cells.
- `A` (more capacity, sparser): 3200 symbol cells, context in 3200 cells, still 8 active. Sparsity drops from 2% to 0.25%.
- `B` (dentate-gyrus style): the trace (which includes the current symbol) is projected through fixed random connections (fan-in 16) into 4000 cells, keeping the top 8. Learning uses that code.
- `A+B`: 3200 symbol cells, expanded to 16000 context cells, top 8.

Hardness is measured on connections with w>0.5, at 100 episodes, over seeds 1–3. "ctx→P" means context at the place step → place cells, which is the episode-specific "where did they go". "ctx→A" means context right after the unique cue → agent.

```
variant  sym N  ctx cells | ctx overlap same-agent / diff-agent / chance | ctx→P %hard (median h) | ctx→A %hard | U→A %hard | template %hard
base       400      400   |   0.49 / 0.27 / 0.020                       |   82 (7)                 |   13        |   8       |  100
A         3200     3200   |   0.39 / 0.17 / 0.003                       |   67 (4)                 |    0        |   0       |  100
B          400     4000   |   0.45 / 0.20 / 0.002                       |   72 (5)                 |    1        |   8       |  100
A+B       3200    16000   |   0.31 / 0.07 / 0.001                       |   56 (3)                 |    0        |   0       |  100

ctx→P hardness histogram   h=1   2    3-4   5-9   10+
  base                       8%  10%  17%   29%   36%
  A                         18%  14%  18%   32%   17%
  B                         16%  12%  18%   26%   28%
  A+B                       26%  18%  23%   30%    3%

variant | episodic recall 25 / 100 / 300 eps | 100 eps hard-only / soft-only | held-out gen all / hard / soft | quiet join none / quiet / before
base    |   75 / 50 / 24                      |   8 / 0                       |   87 /  87 / 0                 |   0 /  67 / 0
A       |   85 / 71 / 51                      |   1 / 7                       |   93 /  80 / 0                 |  33 /  67 / 0
B       |   83 / 72 / 48                      |   9 / 0                       |   93 / 100 / 0                 |   0 /  33 / 0
A+B     |   93 / 82 / 61                      |   0 / 8                       |   93 / 100 / 0                 |   0 / 100 / 0
```

### What it suggests

- **Separation helps recall a lot and does not cost generalisation here.** Recall at 100 episodes goes from 50% to 71–82%, and at 300 from 24% to 48–61%. Held-out generalisation stays at 87–100%, and the hard-only lesion keeps it. The trade-off seen with λ didn't appear. That is because generalisation runs on the hard symbol→symbol template, which separating the context leaves untouched.
- **Hardness moves in the right direction but does not cleanly split episodic from semantic.**
  - The connection one step after the unique cue (ctx→A) becomes fully soft (0–1% hard) with any separation.
  - The place-step connections (ctx→P) soften only partly. In A+B the median hardness goes from 7 to 3, and h≥10 almost disappears (36% → 3%), but 56% are still at h≥3.
  - The template remains at h≈20–100. So in A+B there is a gradient: one-off detail ~1–4, template ~20+. The threshold of 3 sits in the middle of the episodic mass rather than between the two groups. With a threshold of ~10 they would separate, but I didn't change the threshold, to avoid tuning on the measure.
- **The reason is the input, not the separator.** At the place step, the trace holds `A, went, to` (shared) plus the unique cue, which has decayed to 0.85³ ≈ 0.6. So contexts of episodes with the same agent are genuinely similar, and a random expansion followed by k-winners only partly decorrelates them. Same-agent overlap is still 0.31 in A+B, against a chance of 0.001. Expansion separates *distinct-ish* inputs well; it cannot make inputs that share most of their content look unrelated. B on its own (expansion only) did less than A (more symbol cells). That suggests the overlap mostly comes from shared symbols in the trace, not from the size of the context pool.
- **Episodic recall still fails without the soft structure, and soft structure alone recalls nothing.** Hard-only recall is 0–9% and soft-only 0–8% in every variant. Episodes need both: soft links hung on the hard scaffold. That supports the "one structure" picture even where the hardness split is blurred.
- **Quiet joining is noisy at 3 seeds.** A+B gives 100% with the quiet period after both episodes and 0% in both controls, the clean pattern. B gets only 33%. A has a 33% hit with no quiet period, which is a spurious overlap. With 3 seeds, don't read anything finer than "the order still matters".

### Ways it could be fooling us

- **One structural setting, picked once.** The fan-in is 16 and the expanded code keeps 8 active cells. The trace that feeds the expansion is a dense real vector. A real dentate gyrus gets sparse input and has much stronger inhibition. A different expansion (sparse input, a lower k, or the cue weighted more) might separate much better. I didn't try one, to keep the "no tuning" rule.
- **"ctx→P %hard" depends on the w>0.5 filter and on the threshold of 3.** The histogram is the fairer view.
- **The hard/soft lesions use the same threshold.** A different threshold could move the hard-only recall numbers.
- **3 seeds and 5 held-out pairs.** Generalisation moves in steps of about 7%. Differences of 80 vs 100 are within noise.

## Follow-up 2: variant C, states that persist instead of a fading trace

`PART=sep VARIANTS=base,C-400,C,C2-400,C2 node sketch.js` runs in about 8 s.

Idea (the project owner's): the unique cue fades in the single drifting trace. The theory instead says states persist, so split the context into machines that each hold their own state.

**Set-up.** There is no drifting trace. Everything else is unchanged: same learning, heat, hardness, threshold 3, replay, measures and seeds 1–3.

- **Episode machine.** Its state is the unique cue's code. It is set at the episode's first step and held unchanged until the next episode's cue.
- **Sequence machine.**
  - In `C`, it is the current symbol.
  - In `C2`, it is the pair (previous symbol, current symbol), which is shared across episodes.
- **Context.**
  - `C`: a sparse conjunctive code of (current-symbol cell × episode cell). Each of the 64 cell pairs is hashed into an implicit pool of 2^24 cells and kept with probability 1/8, so about 8 context cells result.
  - `C2`: that same episode code, united with a conjunctive code of (previous-symbol cell × current-symbol cell). The direct symbol→next-symbol route (the hard template) is unchanged in both.
- `-400` uses 400 symbol cells. Plain `C`/`C2` use 3200 symbol cells, as in variant A. C+B wasn't run: the conjunctive pool already gives near-zero overlap, so an expansion would have nothing left to separate.

**A design change made after seeing results.** C, as first specified, failed generalisation (13–33%). A debug run shows `A0 went to P0 →` gives `ate F3`: `ate` is right, but the food is wrong. The food depends on the place *two steps back*, and nothing shared carries it.
- The symbol route from `ate` fans out to all five foods equally (all hard).
- The episode context at that step is (`ate` × episode cue). For a new cue, that has no learnt weights, and in training the place was only ever stored per episode.
- The drifting trace in base/A/B had been carrying the place forward by accident, as part of the blend.

I added C2, giving the sequence machine its own shared second-order state, which is what "a sequence machine walks the shared path" calls for. That is a structural change chosen after seeing a failure, not a parameter tuned on a measure, but it was not specified in advance. Both C and C2 are reported.

```
variant | sym N | ctx overlap same/diff agent (episode part) | ctx→P %hard (median h) | ctx→A %hard | U→A %hard | template %hard
base    |   400 | 0.49 / 0.27 (0.49)                         | 82 (7)                 | 13          |  8        | 100
A+B     |  3200 | 0.31 / 0.07 (0.31)                         | 56 (3)                 |  0          |  0        | 100
C-400   |   400 | 0.02 / 0.02 (0.02)                         |  5 (1)                 |  1          |  7        | 100
C       |  3200 | 0.00 / 0.00 (0.00)                         |  0 (1)                 |  0          |  0        | 100
C2-400  |   400 | 0.54 / 0.54 (0.02)                         |  5 (1)                 |  1          |  8        | 100
C2      |  3200 | 0.58 / 0.57 (0.00)                         |  0 (1)                 |  0          |  0        | 100
(C2's whole-context overlap is high because the shared sequence part is meant to overlap. The episode part is what has to separate.)

ctx→P hardness   h=1   2    3-4  5-9  10+
  base             8%  10%  17%  29%  36%
  A+B             26%  18%  23%  30%   3%
  C/C2 (3200)     95%   5%   0%   0%   0%
  C/C2-400        66%  29%   5%   0%   0%

variant | recall 25 / 100 / 300 | 100 eps hard-only / soft-only | held-out gen all / hard / soft | quiet join X,Y→Z: none / quiet / before | cue U60,X,Y: none / quiet / before
base    | 75 / 50 / 24          |  8 /  0                       |  87 /  87 / 0                  |  0 /  67 / 0                            |  0 /  67 / 0
A+B     | 93 / 82 / 61          |  0 /  8                       |  93 / 100 / 0                  |  0 / 100 / 0                            | 33 / 100 / 0
C-400   | 93 / 89 / 68          |  8 /  1                       |  33 /  20 / 0                  |  0 / 100 / 0                            |  0 /  33 / 0
C       | 97 / 95 / 91          |  0 /  8                       |  13 /  20 / 0                  |  0 /   0 / 0                            |  0 /   0 / 0
C2-400  | 92 / 87 / 69          |  8 /  2                       | 100 / 100 / 0                  |  0 / 100 / 0                            |  0 / 100 / 0
C2      | 97 / 95 / 90          |  0 / 12                       | 100 / 100 / 0                  |  0 / 100 / 0                            |  0 / 100 / 0

Clean split at the fixed threshold of 3 (all strong one-off links U→A, ctx→A, ctx→P vs shared template links):
  base    episodic soft  64%, template hard 100%
  A+B     episodic soft  80%, template hard 100%
  C/C2    episodic soft 100% (28 hard of 50k, 0.06%), template hard 100% (template min h 8, episodic max h 24)
  C/C2-400 episodic soft 96%, template hard 100% (template min h 1)
```

### What it suggests

- **Holding the episode state, rather than letting it fade, is what makes hardness separate episodic from semantic.**
  - With 3200 symbol cells, 99.94% of one-off links stay at hardness 1–2. The shared template is all hard. The threshold of 3 falls between the two groups without being moved.
  - A+B, the best of the separation variants, reached only 80%/100%.
  - The episode part's overlap between same-agent episodes drops from 0.31–0.49 to 0.00–0.02, because the place link is keyed by a pairing that occurs once.
- **Recall improves the most of any variant and barely degrades with load: 97/95/90% at 25/100/300 episodes** (A+B: 93/82/61). Recall still needs both kinds of link (hard-only 0%, soft-only 12%). Episodes are soft conjunctions hung on the hard path.
- **Generalisation needs a shared sequence state, not just the symbol route.** C without it generalises at 13–33%. C2 generalises at 100% (all and hard-only) and 0% soft-only. That is the predicted split: knowledge is hard, episodes are soft.
- **Quiet joining works in C2 with both controls clean** (0 / 100 / 0, with both the `X,Y` and the `U60,X,Y` cues). In C it fails (0%). C's context is keyed to the episode, so `X` and `Y` under episode U60 and `Y` under U61 never share context cells, and a link learnt during replay can't carry over. The shared sequence state in C2 is what lets two episodes join. That is the same part that carries generalisation.
- **Small symbol pools leak.** With 400 cells, 5% of ctx→P links reach h 3–4 and a few template links stay at h 1. Different symbols' codes collide on cells. So persistence handles the time side, but the clean split still needs enough capacity (variant A's point).

### Ways it could be fooling us

- **The conjunctive code is engineered.** A hashed pool of 2^24 cells guarantees near-zero accidental overlap, and nothing in the automaton learns it. It shows that persistent states plus conjunction is *sufficient*. It doesn't show that an automaton would grow this code.
- **The episode machine is told when an episode starts.** Its state is set by the first symbol of each episode, which is by construction the unique cue. Real streams have no marked boundary or guaranteed-unique cue. What moves the episode machine is the open question, and this sketch sidesteps it.
- **C2 was added after C failed** (see above). The direction was given by the spec ("a sequence machine walks the shared path"), but the second-order form was my choice, made after seeing results.
- **The template is first- and second-order Markov.** A sequence machine of order 2 covers it exactly. Longer-range shared structure would need a richer sequence machine.
- **3 seeds and 5 held-out pairs**, as before. The C/C2 differences are large (13% vs 100%, 61% vs 90%), so they are unlikely to be noise. Differences of 5 points are.
