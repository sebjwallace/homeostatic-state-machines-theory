# m001 distributed assemblies: findings

Design: **fully distributed**. One shared population of 4,096 cells, assemblies of 4 cells (0.1% of the population active per step), and state machines superimposed in one sparse synapse matrix. Seed 1, 40,028-character stream. `node run.js` takes about 42 s.

**Short version.** The automaton beats the spec's counting baseline (order-3: **1.378 vs 1.783 bpc** over the full stream, **1.213 vs 1.385** over the final 20%), and it does so on three seeds. It still loses clearly to a stronger counting model: interpolated Witten-Bell at order 3 gets 1.145 and at order 5 gets 1.016. One mechanism matters more than all the others: **residual heat recruiting fresh cells for a context**. Without it the model is order-1 counting (2.615 bpc). With it, the model grows into a variable-order context model. That is what it is, and not yet more.

---

## What I built

**Cells and fields.** Each of the 28 characters owns a disjoint *field* of 146 cells, scattered at random across the population. A character is always represented by cells from its own field. *Which* cells fire is what carries context: "h after t" and "h after s" can be different 4-cell assemblies in the h field. There is no history buffer. The only memory of the past is which cells are currently active (README: "states, not activity"; sparse distributed representations).

**State machines in connections.** `out[i]` holds Hebbian synapses from a cell active at t−1 to a cell active at t. Each synapse has `w`, a co-activity count, and `fz` in [0,1], how frozen it is. A transition is the bundle of synapses from one assembly to the next. All state machines share the same cells and the same matrix. Lateral synapses bind the cells of each newly formed assembly together, which makes assemblies content-addressable (rung 1).

**Priming and the next state.** A cell is *primed* when at least θ = 75% of the active cells synapse onto it. This coincidence detection keeps superimposed machines from bleeding into one another. When character c arrives, the 4 most-primed cells in c's field become the new state. If nothing specific primed c, the previous character's whole field "bursts" (the broad, order-1 view). If that fails too, c's *base* assembly fires: its first, most general formation (README: memory first).

**Energy = misfit.** Each active cell measures, locally, what share of the synaptic mass it put onto primed cells went to fields other than the one that arrived. Energy is the weight-averaged misfit of the active cells. No global signal is involved.

**Heat.** Each active cell's heat is an exponential moving average of its own misfit (κ = 0.3). An optional σ term adds a share of the heat of the state it handed activity to, so heat spreads *back along the connection*. This term matters for rung 2.

**Residual heat recruits fresh capacity.** When a transition from state Y reaches a hot state X (mean heat > 0.25), X is left alone. Y gets a **young copy** X′ built from the least-used cells of c's field, and Y's transition moves to X′. X′ inherits a share of X's outgoing expectations equal to Y's share of X's incoming traffic, so the total of past experience is conserved. The old state is untouched ("growing, not overwriting").

**Cooling freezes.** A young state is watched for 12 uses. If the heat it carries stays below 2× its parent's, its incoming transition freezes (fz = 1), and frozen synapses are never moved again. Otherwise it dissolves back into its parent, and the parent transition freezes so that context is not split again (satisficing). Transitions that keep fitting while their cell is cool also freeze gradually (rate φ = 0.05).

**Prediction.** The next-character distribution is read from what is primed. Synaptic weight from the current state onto each field is summed, then blended with the order-1 field view and with field frequency using **Witten-Bell weights** (count plus number of distinct followers). *Caveat, stated honestly:* this readout is a counting formula applied to synaptic weights. The automaton's dynamics decide *which* cells, and therefore which contexts, are consulted; the formula that turns weights into probabilities is borrowed from counting. Without some blending, young states with 1–2 counts give near-certain wrong predictions.

**Quiet period.** With no input, heat relaxes toward σ × the weighted heat of each cell's successors. Optionally, all pending young states are judged at once.

**Deviations and disclosures.**
- Parameters were tuned by hand on the seed-1 stream, which is also the stream being scored. Seeds 2 and 3 were never used for tuning and are reported as a check.
- Completion (rung 1) uses the lateral synapses. Prediction never reads them, so the two parts share cells but not machinery.
- The number of cells per field is fixed. "Growth" means recruiting unused cells from a fixed pool. Once a field is used up, recruitment reuses the least-used cells, so some cells belong to several assemblies.

---

## Results

### Rung 5: prediction (prequential bpc, each character predicted before learning)

| model | full stream | final 20% |
|---|---|---|
| **automaton (m001, default)** | **1.378** | **1.213** |
| order-2 counting, Laplace + backoff (spec baseline) | 1.834 | 1.587 |
| order-3 counting, Laplace + backoff (spec baseline; the better of the two) | 1.783 | 1.385 |
| *stronger reference:* interpolated Witten-Bell order 5 | 1.016 | 0.870 |
| *stronger reference:* interpolated Witten-Bell order 3 (computed separately, not in results.json) | 1.145 | 1.056 |
| *stronger reference:* interpolated Witten-Bell order 2 (same) | 1.505 | 1.447 |

Robustness (seeds not used for tuning):

| seed | automaton full / final 20% | order-3 full / final 20% | WB-5 full / final 20% |
|---|---|---|---|
| 2 | 1.398 / 1.252 | 1.783 / 1.390 | 1.003 / 0.861 |
| 3 | 1.467 / 1.313 | 1.785 / 1.385 | 1.001 / 0.849 |

Ablations (seed 1):

| variant | full | final 20% | assemblies |
|---|---|---|---|
| default | 1.378 | 1.213 | 1,277 |
| **no residual-heat recruitment (split off)** | **2.615** | **2.578** | 28 |
| heat spreads back (σ = 1) | 1.620 | 1.463 | 2,006 |
| no freeze on failed split | 1.375 | 1.221 | 1,286 |
| population 16,384 instead of 4,096 | 1.289 | 1.075 | 1,745 |

Autocompletion (greedy, no learning):

| prefix | automaton | order-3 |
|---|---|---|
| the quick brown f | `ok his bird.` | `ounder his bird.` |
| she sells sea sh | `e sat big bird.` | `e sat slept today.` |
| once upon a ti | `me tree sat sat sat sat…` | `me the sat slept today.` |
| the rain in sp | `ain.` | `ain.` |
| the cat sat o | `n the boy.` | `n his bird.` |
| she saw a d | `og se sat sat sat sat…` | `og slept today.` |
| the little old h | `ouse sat sat sat sat…` | `is bird.` |

Completions are poor. The automaton finishes the current word well ("fox" → "ok", "house", "dog", "spain"), but it never recalls the fixed sentences beyond a few characters. It also falls into `sat sat sat` loops that the counting model avoids.

### Rung 1: completion

Synthetic test: patterns of 40 cells (1% of 4,096) stored as lateral cliques, then cued with part of the pattern. The score is mean overlap with the stored pattern after 4 rounds of k-winners-take-all.

| stored patterns | cue ½ | cue ¼ | cue ⅛ | cue ½ + 20 random cells |
|---|---|---|---|---|
| 100 | 1.00 | 1.00 | 1.00 | 1.00 |
| 1,000 | 1.00 | 1.00 | 1.00 | 1.00 |
| 4,000 | 1.00 | 1.00 | 1.00 | 1.00 |
| 8,000 | 1.00 | 1.00 | 0.20 | 1.00 (90% exact) |
| 16,000 | 0.62 | 0.25 | 0.12 | 0.24 |

Capacity is large because sparse random patterns rarely overlap. Recall collapses sharply somewhere between 8k and 16k patterns, once the binary lateral graph saturates; tiny cues fail first.

The trained automaton's own assemblies, cued with half their cells and restricted to their field, are recalled exactly **91.7%** of the time (510 of 556). The misses are assemblies whose cells were reused by later ones.

### Rung 2: sequences with a shared middle ("xabcdy" / "zabcdw", 80 exposures in random order)

The automaton is cued with "xabcd" or "zabcd" and the probability it gives the correct ending is read off.

| variant | p(y \| xabcd) | p(w \| zabcd) | order-3 p(correct) | greedy replay from first char |
|---|---|---|---|---|
| default (σ = 0) | 0.51 | 0.49 | 0.39 / 0.37 | `xabcdy`, `zabcdy` (wrong) |
| **heat spreads back (σ = 1)** | **0.85** | **0.86** | 0.39 / 0.37 | `xabcdy`, `zabcdw` (both right) |

Order-3 counting cannot solve this even in principle, because it only sees "bcd". The default automaton cannot solve it either. Its heat stays local to the step where the misfit occurs ("d"), and the d-state is reached the same way in both sequences, so nothing upstream ever splits. Only when heat spreads back along transitions does the misfit at "d" warm "c", "b" and "a", and then x and z, so that x and z grow their own a-b-c-d chains. With σ = 1, p(correct) rises steadily: 0.49 after 10 exposures, 0.61 after 20, 0.73 after 30, 0.85 after 80.

### Rung 3: noise (frozen automaton, 150 fresh grammar sentences)

| corruption rate | automaton bpc | order-3 bpc | WB-5 bpc | automaton recovery bpc* | order-3 recovery bpc* |
|---|---|---|---|---|---|
| 0% | 1.217 | 1.335 | 0.899 | – | – |
| 5% | 2.289 | 1.950 | 2.805 | 3.77 | 2.96 |
| 10% | 3.284 | 2.482 | 4.372 | 3.89 | 3.03 |

\*bpc on the 1–4 clean characters following each corruption.

The automaton beats order-3 on clean text but **loses to it under noise**, and it recovers more slowly. A corruption breaks the specific context chain, so the automaton drops to base or burst states. From there it rebuilds context one character at a time, but through cells that are not the ones its learnt chains start from. Longer-context counting (WB-5) suffers even more, so this is the general price of long context, not something unique to this design.

### Rung 4: words (seed-1 stream)

"Stable" = the chain of assemblies carrying the word is identical for 3 consecutive exposures. "Frozen" = mean frozenness of the word's internal transitions ≥ 0.5.

| word | exposures | stable after | frozen after |
|---|---|---|---|
| quick | 13 | 2 | 13 |
| lazy | 13 | 3 | 13 |
| shells | 18 | 3 | 13 |
| she | 164 | 7 | 24 |
| dog | 163 | 7 | 13 |
| the | 553 | 190 | 30 |
| cat | 152 | never | 5 |
| sat | 126 | never | 15 |
| house | 184 | never | 46 |
| saw | 87 | never | 68 |
| on | 115 | never | 43 |
| a | 496 | 2 | n/a (no internal transition) |

Words that appear in only one context ("quick", "lazy", "shells") form a stable chain within 2–3 exposures, and their transitions freeze by about the 13th. Words that follow many contexts ("cat", "sat", "house", "the") keep changing which cells carry them, because each new context splits a fresh copy, so they never settle into one assembly chain. Frozenness can even *drop*: "cat" reached 0.53 at its 5th exposure and 0.01 at its 7th, after its traffic was rerouted to a young copy. "A handful of exposures" therefore holds only for words that always appear in the same context.

### Rung 6: visible confusion (frozen automaton)

| input | mean energy (misfit) |
|---|---|
| the 4 fixed sentences | 0.343 |
| grammar sentences seen in the stream | 0.351 |
| sentences of made-up words ("flunx plix gnoth gnoth.") | 0.825 |

Energy while learning one novel sentence by repetition: 0.78 → 0.68 → 0.62 → 0.57 → 0.53 → 0.50 → … → 0.46 (12th repetition).

Over the whole stream, mean energy per 1,000-character window falls from 0.63 to about 0.36 by 6k characters, then stays flat at 0.36–0.40. New assemblies per 1k characters fall from 243 to between 0 and 14. Energy rises clearly on unfamiliar input and falls with familiarity, so the rung passes. Energy does **not** keep falling, though: it plateaus at the stream's irreducible uncertainty (the grammar's word choices are random), which is the correct behaviour.

### Rung 7: thinking without data

The automaton is snapshotted at 80% of the stream, with 545 young states pending. The next 3,000 characters are scored with learning on.

| condition | bpc on next 3,000 chars |
|---|---|
| control (no pause) | 1.196 |
| 20 quiet steps, heat relaxes only | 1.193 (−0.003, negligible) |
| 20 quiet steps, heat relaxes + pending young states judged | **1.308 (worse by 0.11)** |

**Negative.** The quiet period does not help, and judging young states early makes things worse: 504 of the 545 were "kept" and frozen too soon on too little evidence, which is the README's "cooling too fast". Mean heat fell from 0.26 to 0, so the automaton calmed down, but none of that calm became useful structure. In this design internal heat has nothing to *do* without input. There is no internal misfit between assemblies to resolve, only leftover prediction misfit, and that cannot be checked without new data.

---

## What worked, what didn't

**Worked**
- *Residual heat recruiting fresh capacity* is the whole story. It takes an order-1 model (2.615) to one that beats order-3 counting (1.378). Contexts get their own cells only where the old state was failing, so growth is demand-driven: 243 new assemblies in the first 1k characters, 0–14 per 1k at the end.
- Context really is carried by cell identity, with no history buffer. With σ = 1 this reaches back 5 characters on the shared-middle test, which order-3 counting cannot do.
- Freezing protects learnt transitions, and judging young states keeps failed splits from piling up (only 8 of 487 judged splits failed by the end). "Freeze on failure" itself turned out to matter little (1.375 vs 1.378).
- Energy works as a confusion signal.

**Didn't work**
- **It loses to stronger counting.** Interpolated Witten-Bell order 3 (1.145) and order 5 (1.016) beat the automaton on every seed. A good part of the win over the spec baseline is plausibly *smoothing*: the automaton's readout uses Witten-Bell blending, while the spec baseline uses Laplace with hard backoff. The rest comes from selectively deeper context, but order-3 counting with good smoothing already captures more than the automaton does.
- **The heat-spread dilemma.** Without backward heat spread (σ = 0), the automaton's context grows by one character per split, driven only by the misfit at that step. It is then a slow variable-order Markov learner and fails the high-order test. With σ = 1 it passes rung 2 but over-splits on the noisy corpus (2,006 assemblies vs 1,277) and loses 0.24 bpc. A single heat rule cannot tell "this misfit can be fixed with more context" from "this misfit is irreducible noise". The grammar's random word choices produce constant irreducible misfit, and heat spread back from it creates useless context copies.
- **Long-range memory.** The fixed sentences ("the quick brown fox…", seen about 60 times each) are never recalled past a few characters. Each split adds only one step of context, and splitting stops once heat drops below the threshold, which happens well before a whole sentence is distinguished.
- **Noise robustness** is worse than counting.
- **Thinking without data** did not help.
- Greedy autocompletion loops (`sat sat sat`), because states reached by fallback paths have generic successors.

## What the theory got right or wrong (for this design)

| README hypothesis | verdict here |
|---|---|
| Sparse assemblies give content-addressable memory with large capacity | **Supported** (rung 1: perfect up to about 4–8k patterns, then a sharp collapse) |
| Context can be carried by which cells represent a symbol (states, not activity) | **Supported**; it is the main driver of performance |
| Heat from misfit sets local plasticity | **Supported** as a trigger for *where* to grow. Heat alone does not say *how far back* the cause lies |
| Residual heat recruits fresh capacity instead of overwriting | **Strongly supported** (2.615 → 1.378 bpc). The core result |
| Memory first, learning only on what's left over | **Supported**: new assemblies per 1k characters fall from 243 to near 0 as frozen structure handles familiar input |
| Heat spreads along connections | **Mixed**: necessary for high-order sequences, harmful on noisy text. It needs a way to stop at irreducible misfit |
| Cooling freezes what mattered | Partly. Freezing works mechanically, but "cooled" here mostly means "predicts no worse than its parent" |
| A configuration lasts as long as nothing heats it | Supported mechanically (frozen synapses never move). But context-rich words like "cat" never settle, because new contexts keep rerouting them |
| Words form stable assemblies after a handful of exposures | Only for words seen in a single context. Frequent multi-context words never settle on one chain |
| Thinking without data improves prediction | **Not supported** by this design. Quiet judging hurt (+0.11 bpc), consistent with the README's own warning about cooling too fast |
| "An automaton that can't beat counting is only counting in a complicated way" | It beats the spec's counting but not good counting. Honestly, it is currently **a variable-order context model grown by heat**, with a counting-style readout |
| Composition (fewer new assemblies, more connections between old ones) | Not tested. Assembly growth slows, but there is no mechanism for connecting existing assemblies in new ways |

## Surprises

- A larger population helps a lot: 16,384 cells gives 1.289 / 1.075, close to WB order-3 on the final 20%. Capacity per field (146 cells, i.e. 36 four-cell assemblies before reuse) is a real bottleneck at N = 4,096.
- Small assemblies (4 cells) beat 8 or 16. The "few percent active" sparsity suggested in the brief (20–40 cells of 1–2k) was clearly worse, at about 2.2–2.5 bpc on 20k characters. Narrow, very sparse codes suit this mechanism.
- The coincidence threshold matters. At θ = 0.5 or lower, superimposed machines cross-talk and bpc gets worse. Requiring 3 of 4 active cells to agree is what keeps machines apart in a shared population.
- A word's frozenness can go *down*. Rerouting traffic to a young copy leaves the old frozen transitions in place but unused.
- In the quiet period, "freeze whatever is pending" is a reliable way to make things worse.

## What I'd try next

1. **Make heat stop at irreducible misfit.** Spread heat back only where the misfit is *reducible*, i.e. where the successor's misfit differs depending on which predecessor led to it (the same state reached from different contexts misfits differently). A cell can check this locally on its incoming synapses. This should keep the σ = 1 win on rung 2 without over-splitting the corpus.
2. Grow fields (add cells to a field when its free cells run out) instead of reusing cells. The N = 16,384 result suggests a large gain.
3. Replace the Witten-Bell readout with something that comes from the dynamics, e.g. priming strength normalised per cell, and see how much of the win survives. I suspect a good share of the win over Laplace is smoothing.
4. For thinking, give the quiet period internal misfit to resolve. One example: merge two young copies that have converged to the same expectations (compression, the README's "coping vs resolving"). That is a real candidate for structure that improves without new data.
5. Re-entry after noise: when a state arrives via the burst path, try to match it to known context chains a few characters later, instead of committing to the generic state.

## Files

- `src/automaton.js`: the automaton (cells, synapses, priming, heat, split/freeze, quiet, completion)
- `src/prng.js`: seeded PRNG
- `src/viewer.template.html`: viewer template; the trace is embedded by `run.js`
- `harness/corpus.js`: deterministic grammar corpus
- `harness/baseline.js`: order-k Laplace backoff (spec baseline) and the Witten-Bell reference
- `harness/rungs.js`: test runners
- `run.js`: runs everything and writes `results/results.json` and `viewer.html`
