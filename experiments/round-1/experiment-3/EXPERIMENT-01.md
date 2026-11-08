# Experiment 01: first rungs on a text stream

Two automata were built independently from `README.md` and `SPEC.md`, each by a separate agent, under the same fixed rules: Node.js only, no gradients or optimisers, local rules, online single pass, sparse, seeded. Both were re-run from fresh copies to check the numbers: same results, m001 in about 42 s and m002 in about 32 s.

- **m001, distributed assemblies:** one shared population of 4,096 cells, 4 active per step. Context is carried by which of a character's cells fire.
- **m002, columnar state machines:** one column per character, each growing context cells on demand.

Full write-ups are in each model's `results/FINDINGS.md`, raw numbers in `results/results.json`, and each has a `viewer.html` you can open by double-clicking.

## Headline numbers

Prequential bits per character, seed 1, lower is better. The two models generated their own corpora, so numbers are comparable within a row group, not across models.

| | full stream | final 20% |
|---|---|---|
| **m001 automaton** | **1.378** | **1.213** |
| m001's order-3 baseline (Laplace smoothing, as the spec asked) | 1.783 | 1.385 |
| Witten–Bell order-3 on m001's corpus (stronger counting) | 1.145 | 1.056 |
| Witten–Bell order-5 on m001's corpus | 1.016 | 0.870 |
| **m002 automaton** | **0.854** | **0.673** |
| m002's order-3 baseline (Witten–Bell) | 0.990 | 0.906 |
| order-6 on m002's corpus | 0.852 | 0.682 |

**A fairness note.** The spec's "Laplace smoothing" made m001's baseline weak. Against a properly smoothed order-3 counter, m001 loses. m002 used a stronger baseline and beat it, but ties or loses to order-5 and order-6 counting. **Neither automaton beats good counting yet.**

## By rung

| rung | m001 distributed | m002 columnar |
|---|---|---|
| 1 completion | passes: perfect recall up to 4,000 patterns, then collapses | passes for clean cues up to 400 patterns; corrupted cues degrade like counting |
| 2 shared middles | passes only with heat spread back (0.85 vs 0.39 for order-3) | clear win: resolves middles of 6–8 characters that fixed counting can't |
| 3 noise | loses to counting | loses to counting |
| 4 words | single-context words freeze in ~13 exposures; multi-context words never settle | words form in 1–7 exposures; freezing tracks predictability of what follows |
| 5 prediction | beats weak baseline, loses to proper counting; autocomplete loops | beats order-3, ties order-6; good autocomplete ("once upon a" → "time there was a little old house") |
| 6 confusion | passes: energy rises on novel input and falls with repetition | passes; random letters cause the *least* internal conflict |
| 7 thinking without data | no effect, or worse | worse with ample capacity, slightly better when scarce |

## What this says about the theory

**Held up.** Residual heat recruiting fresh capacity is a working, purely local learning rule; without it, m001 falls to 2.615 bpc. Heat spreading back along connections discovers hidden context. Energy rises on unfamiliar input, and structure is what makes heat possible.

**Not really tested yet.** Both designs only grew structure and never melted it, so freezing had nothing to protect, and its ablation made no measurable difference in either. Held states were never used for prediction. No cell or assembly was shared across contexts, so nothing composed; m002 converged on a known algorithm, a growing context tree, which is smart counting. With no internal disagreements to resolve, the quiet period could only prune.

**A new problem, found by both.** Local heat can't tell misfit that more context would fix from misfit that is just noise. Spreading heat back fixes shared middles but over-splits on random variation. The theory needs a way to tell resolvable heat from irreducible heat, which is the same distinction it already makes for curiosity: pull towards gaps that can close, not towards noise.

## Next experiment

1. **Shared assemblies.** Let states bind to groups of predecessors, so "the dog" can reuse what "the cat" learnt. Test on held-out word combinations, where counting can't win.
2. **Real melting.** Fixed capacity, with hot structure actually changing, so freezing has a job.
3. **Use held states.** Long-range context, tested by interleaving topics (rung 9).
4. **Resolvable vs irreducible heat.** Spread heat back only where a state's misfit depends on what came before it.
5. **Fix the baseline.** Witten–Bell orders 3 to 6 for every model, on one shared corpus.
