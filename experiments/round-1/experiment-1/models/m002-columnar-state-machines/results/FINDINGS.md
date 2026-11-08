# m002 — Columnar state machines: findings

All numbers are from `node run.js` (seed 1, 40,025-character corpus, about 35 s on 2 CPU cores) unless marked otherwise. Raw data is in `results/results.json`.

## Summary

- Against the spec's baseline (the better of order-2 and order-3, which is order-3), the automaton wins clearly. Full stream: **0.854 vs 0.990 bpc**. Final 20%: **0.673 vs 0.906 bpc**.
- Against stronger counting it **does not win**. Order-6 counting with the same escape scheme ties or beats it: 0.852 / 0.682 on seed 1. Averaged over four seeds, the model gets **0.873 / 0.697** and order-6 gets **0.852 / 0.697**.
- I tuned the hyperparameters on seed 1, so seed 1 flatters the model. On held-out seeds 2 to 4 the model **loses to order-5 and order-6 on the full stream** by 0.02 to 0.035 bpc, and roughly ties order-6 on the final 20%.
- The most important finding: in this localised design, residual-heat recruitment grows a **variable-order context tree**. Its prediction is therefore a form of PPM-style counting. Heat is a good local rule for deciding *which* longer contexts deserve a cell, and that is where all the gains over order-3 come from. **Freezing has no measurable effect** (ablation: 0.8546 vs 0.8539). Because the design grows rather than overwrites, nothing is ever at risk of being forgotten, so there is nothing for freezing to protect.

## What I built

**Columns and cells.** There is one column per alphabet character (29 columns). Each column has a fixed budget of cells (512). Cell 0 is the column's generalist: "this character, in any context". Every other cell is a context cell: "this character, when it came right after cell P". P is a cell in another column, or in the same one. Following the context links, each cell stands for a specific recent history, such as column `w` in context `". a co"`. Cells are recruited only when needed, so each column grows its own tree of increasingly specific contexts. This is how sparse representations arise *within* a column (which cell is active) and *across* columns (which column is active).

**State and transitions.** The automaton's state is the **active chain**: the cells of the current column that match the recent past, from the generalist to the most specific cell that exists. That is at most 13 of about 8,600 cells, roughly 0.15% active. Each column also *holds* the last cell it was in until that column fires again, which is the README's "a state persists until something makes it transition". This held state is recorded and shown in the viewer, but **prediction does not use it**. That is a gap, discussed below. A transition is moving from the active chain to the matching chain in the next column.

**Prediction from the dynamics.** Each active cell has Hebbian transition weights to the next column: the count of "this cell was active, then that column fired". The primed distribution blends these weights from general to specific. Each cell trusts its own weights in proportion to how much it has seen, and hands the rest of the probability to its more general neighbour, weighted by how many different next columns it has seen. That is the same Witten–Bell escape rule the baseline uses. I am stating this plainly because it matters for interpreting the results: **the per-step prediction is mathematically a counting model over whichever contexts the automaton chose to build.** What differs from the baseline is only *which* contexts exist, and that is decided by heat.

**Energy and heat.** The step's energy is its surprise: −log₂ p(actual), in bits. Each active cell also measures its own local misfit: its own surprise at what arrived, minus the entropy of its own prediction. In plain terms, this is how much worse it did than it expected to do. A cell's heat is a running average of that misfit. Heat **spreads along the context connection** to the predecessor cell.

**Residual heat recruits fresh capacity.** There are two recruitment rules.
1. *Split.* If the step was surprising (more than 0.5 bits), or the predicting cell is hot (heat above 0.4, accumulated partly from heat spread back by its successors), a fresh twin of that cell is recruited. The twin is bound to one more step of context, taken from the previous state, which is still held. The twin takes over as the active state. This is the README's "discovering a hidden context".
2. *Extend.* If the arriving character had no cell for the full current context and the step was surprising, a fresh cell is recruited for it, one level deeper.

The old cell is never modified. It stays as the general fallback, so "old specialists live alongside newer generalists" holds by construction. When a column's budget is exhausted, only unfrozen, little-used leaf cells can be recycled.

**Cooling freezes.** An active cell whose heat is low and falling gains frozenness F. Strong heat lowers F. Cells with F above 0.5 are never recycled and never merged.

**Quiet period.** With no input, heat decays. Leaf cells whose prediction differs from their parent's by less than 0.05 bits (KL divergence) are dissolved, because they are a redundant patch. Cool cells finish freezing.

## Results

### Rung 5 — prediction (prequential bpc; lower is better)

| | full stream | final 20% |
|---|---|---|
| **automaton** | **0.854** | **0.673** |
| order-2 counting | 1.410 | 1.358 |
| order-3 counting (spec baseline, better of 2 and 3) | 0.990 | 0.906 |
| order-4 | 0.882 | 0.774 |
| order-5 | 0.858 | 0.724 |
| order-6 | 0.852 | 0.682 |
| order-8 | 0.933 | 0.713 |

Other seeds (held out from tuning):

| seed | model full | order-3 | order-6 | model final 20% | order-3 | order-6 |
|---|---|---|---|---|---|---|
| 2 | 0.874 | 0.990 | **0.850** | 0.706 | 0.906 | 0.705 |
| 3 | 0.877 | 0.987 | **0.855** | **0.700** | 0.900 | 0.704 |
| 4 | 0.888 | 0.986 | **0.851** | 0.709 | 0.903 | **0.695** |

Learning calms over time. Cells recruited per 1,000 characters fell from 497 to 413, 258, 150, 83, about 30, and about 15. bpc per window fell from 2.38 to 0.66. Total cells: 8,618, of which 2,406 are frozen.

Autocompletions, by greedy generation fed back as input:

| prompt | automaton | order-3 |
|---|---|---|
| the cat sat | under the hat. | under the bird slept near the bird slept |
| she ate | a bread. | ate ate ate ate … |
| once upon a | time there was a little old house by the | bird slept near the bird slept near the |
| all the birds sang | in the trees at dawn, and then they slep | into a bird slept near the bird slept ne |
| she sells sea | shells by the sea. | she bird slept near the bird slept near |
| tom ran to | a barn. | a bird slept near … |

### Rung 1 — completion

Each test stores N random 10-letter patterns, shown 3 times each. The cue is the first 5 letters; the score is the accuracy of greedy recall of the last 5.

| patterns | half cue: model | half cue: order-3 | half cue, one char corrupted: model | corrupted: order-3 | cells |
|---|---|---|---|---|---|
| 5 | 1.00 | 1.00 | 0.80 | 0.80 | 270 |
| 50 | 1.00 | 1.00 | 0.75 | 0.74 | 2,590 |
| 100 | 1.00 | 0.94 | 0.61 | 0.58 | 5,233 |
| 200 | 1.00 | 0.87 | 0.59 | 0.55 | 10,106 |
| 400 | 1.00 | 0.74 | 0.53 | 0.43 | 14,337 |

Clean recall does not degrade up to 400 patterns, because capacity grows with demand. Recall from a corrupted cue degrades almost exactly like counting's. There is no attractor clean-up: a wrong character simply cuts the context chain, and the model backs off to a shorter suffix. This is **not Hopfield-style completion**. The structure is addressed by recent suffix, not by content.

### Rung 2 — sequences with a shared middle (`x M y` vs `z M w`)

Accuracy predicting y or w after the cue `x M` or `z M`. 0.5 is chance between the two endings.

| middle length | exposures | model | order-3 | order-5 |
|---|---|---|---|---|
| 2 | 1 | 1.0 | 1.0 | 1.0 |
| 4 | 1 | 0.5 | 0.5 | 1.0 |
| 4 | 2 | **1.0** | 0.5 | 1.0 |
| 6 | 3 | **1.0** | 0.5 | 0.5 |
| 8 | 3 | 0.5 | 0.5 | 0.5 |
| 8 | 5 | **1.0** | 0.5 | 0.5 |

This is the clearest win. Heat at the end of the shared middle flows back along the context links, and each re-exposure splits one more level of context. A middle of length m therefore needs about m/2 exposures before it resolves. Fixed-order counting can never resolve a middle of length k or more. Without the heat-spread split (`hotSplit: 0`), the model only resolved middles of length 2 or less within 12 exposures.

### Rung 3 — noise

Learning is off for this test. Scores are on held-out sentences with characters inserted, dropped and swapped at the given rate.

| noise | model bpc | order-3 bpc | model bpc on untouched chars | order-3 on untouched chars |
|---|---|---|---|---|
| 0% | **0.668** | 0.909 | 0.668 | 0.909 |
| 3% | 1.861 | **1.642** | **1.278** | 1.312 |
| 6% | 3.356 | **2.652** | 2.017 | **1.856** |
| 12% | 5.428 | **4.289** | 3.103 | **2.783** |

**The model loses to counting under noise.** Its deep contexts are confident, and confident predictions pay heavily when the character that arrives is corrupted. After a corruption the chain collapses to a short context and has to rebuild one character at a time. It does not "keep the thread": there is no mechanism that holds the previous state and re-joins it after the glitch.

### Rung 4 — words

The word's assembly is the chain of context cells spelling " word". The table shows, in exposures to " word": when that chain fully existed, when a half-word cue was first completed correctly, and when every cell in the chain was frozen.

| word | exposures | formed at | completed at | frozen at |
|---|---|---|---|---|
| the | 1,184 | 3 | 2 | 110 |
| he | 180 | 1 | 1 | 43 |
| cat | 157 | 3 | 2 | 110 |
| dog | 206 | 3 | 2 | 128 |
| saw / sat | 93 / 75 | 2 / 2 | 1 / 1 | 24 / 34 |
| ran | 165 | 3 | 2 | 39 |
| garden | 56 | 6 | 1 | 23 |
| quickly | 51 | 7 | 1 | 29 |
| she | 186 | 2 | 1 | never |
| horse | 184 | 5 | 1 | never |
| shells | 27 | 4 | never | never |

Words form within a handful of exposures, as the README hoped. They **freeze slowly or never**. Freezing measures the cell's misfit about *what comes next*, so word-final cells followed by many different words (she → any verb; horse → any verb) stay warm forever. Frozenness ends up tracking **how predictable the continuation is**, not "this is a word". "shells" never completes from " she" because " she" is overwhelmingly the pronoun.

### Rung 6 — visible confusion

Learning is off for this test.

| input | energy (bits/char) | internal misfit (deep vs general cell, bits/char) |
|---|---|---|
| fixed sentence ("she sells sea shells…") | **0.18** | 2.56 |
| seen grammar sentence | 0.67 | 1.78 |
| novel combination of known words | 2.69 | 3.36 |
| unseen words | 10.92 | 3.43 |
| random letters | 12.79 | **0.96** |

Energy clearly rises from familiar to novel input. The internal-misfit column is the interesting one: random letters produce the *lowest* internal disagreement, because they engage no deep structure at all, so there is nothing to disagree with. This is a small, concrete instance of the README's claim that "structure is what makes heat possible". Pronounceable unseen words engage partial structure and produce the most internal conflict.

### Rung 7 — thinking without data

The automaton reads the first half of the stream. Then it gets either 20 quiet settling steps or none (control, same seed). Both continue learning on the second half.

| capacity per column | control: bpc 2nd half | after quiet period | difference | cells dissolved |
|---|---|---|---|---|
| 512 | **0.707** | 0.727 | −0.020 (worse) | 2,695 |
| 32 | 1.171 | **1.162** | +0.009 (better) | 77 |

**Not supported.** My quiet-period rule is compression: dissolve leaves that agree with their parent. That throws away cells which looked redundant but were still accumulating evidence, so it hurts when capacity is plentiful. It helps slightly only when capacity is scarce, by freeing cells. I tried merge thresholds from 0.005 to 0.05 bits; all hurt at capacity 512. The quiet period here does pruning, not thinking: there is no internal conflict for it to resolve that would change future predictions.

### Ablations (seed 1)

| variant | full | final 20% | cells |
|---|---|---|---|
| default | 0.854 | 0.673 | 8,618 |
| no freezing | 0.855 | 0.674 | 8,637 |
| no heat gate (recruit on every miss) | 0.861 | 0.679 | 9,153 |
| no hot-predecessor split | 0.873 | 0.716 | 5,404 |
| no splitting at all (extend only) | 0.899 | 0.790 | 2,201 |
| recruit threshold 1.0 / 2.0 bits | 0.859 / 0.865 | 0.675 / 0.682 | ~8,600 |
| capacity 256 / 32 per column | 0.868 / 1.247 | 0.737 / 1.180 | 4,671 / 766 |
| capacity 32, no freezing | 1.251 | 1.190 | 773 |
| max depth 3 (same reach as order-3) | 0.990 | 0.906 | 656 |

With the depth limited to 3, the model reproduces order-3 counting almost exactly (0.990 vs 0.990). That confirms the analysis above: the model *is* a counting model over the contexts it builds.

## What worked, what didn't

**Worked**
- Heat spreading back along context connections, so that a hot cell splits, is the mechanism that matters. It lets the automaton discover hidden context ("abcd" means y after x but w after z) a level at a time, with no global error signal. It beats any fixed-order counter on long shared middles.
- Recruitment from spare capacity instead of overwriting: clean recall stayed at 100% up to 400 stored patterns.
- The learning cycle calms down: recruitment per 1,000 characters falls by about 30 times over the run while bpc keeps falling.
- Autocompletion is qualitatively far better than order-3. It recites the fixed sentences and produces grammatical, sentence-final completions.

**Didn't work**
- **It does not beat good counting.** Order-6 ties or beats it on every seed, and on held-out seeds the model loses on the full stream (mean full-stream bpc: model 0.873, order-6 0.852, order-5 0.855). It also costs about 9 times the CPU time (0.9 s vs 0.1 s) and holds more structure: 8,618 cells, against 5,309 contexts for order-6 counting across all orders up to 6. The heat gate is not frugal enough to pay for itself in bpc. Recruiting on every miss is only about 0.007 bpc worse.
- **Freezing does nothing measurable.** Because cells are never overwritten, only added, there is no forgetting for freezing to prevent. At capacity 32 its benefit was 0.004 bpc.
- **Noise robustness is worse than counting.** Deep contexts are overconfident, and there is no state that persists through a glitch.
- **Content-addressable completion is absent.** A corrupted cue truncates the suffix rather than being cleaned up.
- **The quiet period hurt.**
- **The held column state is unused for prediction.** Columns do hold their last cell, but nothing reads it. So "state persists until something changes it" is only true in a bookkeeping sense here, and long-range context (the topic, or which fixed sentence we are in) beyond the context depth is invisible.

## What the theory got right or wrong (in this design)

- *Residual heat recruits fresh capacity; learn only what memory couldn't handle*: **supported.** It is a working, purely local rule for growing high-order structure, and it beats fixed-order counting on high-order tasks.
- *Heat spreads along connections*: **supported, and it was decisive.** Spreading misfit back to the predecessor gave about 0.045 bpc, and made the difference between solving and not solving long shared middles.
- *Cooling freezes, protecting what was learnt*: **untestable as a benefit here.** Growth-not-overwrite already prevents forgetting. Freezing would matter only if hot cells actually changed. I tried a "melt" rule (hot cells decay their counts), and it made no difference either.
- *Old specialists alongside new generalists*: true by construction (parent cells remain the fallback), so this run doesn't test it.
- *Energy rises on unfamiliar input*: **supported.** The "structure makes heat possible" claim got a small confirmation (random input causes the least internal conflict).
- *Thinking without data improves prediction*: **not supported** by my quiet-period rule.
- *Generalisation by composition*: **not reached.** Every context cell is specific to one exact history. Nothing lets "the cat" share what it learnt with "the dog". That is exactly why this design ends up as counting.

## Surprises

- The model converged to a known algorithm, a growing PPM / variable-order Markov context tree, from the theory's ingredients alone. Localised "one cell = one character in one context" units make this almost inevitable.
- Frozenness turned out to measure "is what follows me predictable", not "am I a stable word". Common words that are followed by anything never freeze.
- Raising the recruitment threshold mattered much less once heat-driven splitting existed. The spread heat does most of the selecting.

## What I'd try next

1. **Make held column states matter.** Let a column's held cell bias predictions when the column fires again (topic and long-range memory), with heat when the held expectation is violated. This is the one mechanism here that a counter cannot copy.
2. **Shared context across columns, for composition.** Let cells bind to *assemblies* of predecessors (for example, the set of "noun" cells) rather than to one exact predecessor, so that "the dog" can reuse what "the cat" learnt. This is where beating order-6 would have to come from.
3. **Robustness.** On a surprising character, keep the previous deep chain alive for a step or two and re-join it if the next character fits (skip-a-glitch).
4. **Give freezing a job.** Introduce a real plasticity cost (fixed capacity with overwriting, or count decay) so that frozen and hot cells actually behave differently, then re-test the freezing ablation.

Rungs 8 to 19 were not attempted.
