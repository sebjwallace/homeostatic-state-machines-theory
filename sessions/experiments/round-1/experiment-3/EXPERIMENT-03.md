# Experiment 03: combining the wins

Round two produced two wins in two different models: shared assemblies (m003) beat every counter on unseen word combinations, and held state (m004) beat them on noise and topic return. Round three asked whether one automaton could have both, and added two tests that can't be won with built-in knowledge.

**Language.** Still Rust. The round-two harness was correct, verified and fast; rebuilding it in Go would have cost a round and broken comparability with earlier numbers. Model iteration in Rust was slower to write than Node but not a bottleneck: each full run takes seconds. Go remains a good option for a future rewrite if models need much faster exploration.

**Setup.** The round-two harness plus two new tests, with tests 1–8 verified unchanged (4,317 values, zero differences):
- **Test 9, unseen noise shapes:** doubled characters, swaps at distance two, random bursts and moved word boundaries. No model was told about these.
- **Test 10, context conflict:** a cue at the start of a paragraph ("in the morning", "at the farm") decides a completion at least 21 characters later ("the sky was blue / red"). Low-order counting can't see the cue. Quiet periods should have something to resolve here.

Two new models, each descended from a round-two winner, each in its own workspace, then merged and re-run together from scratch (37 seconds for every model and baseline on three seeds; numbers match the agents' reports, and survived a workspace restart).

- **m005, assemblies with state** (from m003): adds held context that structure can bind to and, crucially, *release*.
- **m006, state with assemblies** (from m004): adds shared assemblies, removes the hand-designed corruption shapes, and speeds up the topic machine.

## Results (three-seed means)

| test | best counter | m003 | m004 | **m005** | **m006** |
|---|---|---|---|---|---|
| 1 Prediction, bpc | **0.746** | 0.764 | 0.779 | 0.767 | 0.756 |
| 2 Composition, verb bpc | 1.863 | 0.826 | 4.079 | **0.778** | 0.948 |
| 3 Persistence, topic return | 1.004 | 1.036 | 0.987 | 1.039 | **0.983** |
| 4 Noise, 10% | 2.389 | 2.383 | **1.617** | 2.381 | 1.779 |
| 5 Forgetting, survival | **0.981** | 0.941 | 0.979 | 0.948 | 0.955 |
| 9 Unseen noise, 10% | 2.414 | 2.410 | **1.927** | 2.407 | 2.054 |
| 10 Context conflict | **0.200** | 0.364 | 0.479 | 0.278 | 0.276 |
| 7 Thinking without data | – | 0.000 | 0.000 | 0.000 | +0.007 |

Lower is better except survival. Bold marks the best entry per row.

## What it found

**1. The wins combine, when the parts feed each other.** m006 beats the best counter on composition (49% fewer bits), persistence, noise and unseen noise at once, and over the final 20% of the stream it predicts better than any counter (0.636 against 0.645). Its largest single gain came from shared assemblies that have a version for each held topic: neither idea alone, but each conditioned on the other. And because alternative readings now pass through the shared structure, a novel verb that fits its word group is read as a new combination rather than explained away as a typo. In m004, the same readings made composition far worse; in m006 they make it slightly better.

**2. A held state is only useful if it can be released.** m005's key finding. Bindings to held context did nothing on the context-conflict test until structure that depended on a held state could drop it the moment it misfitted. With release, conflict-word bpc fell from 0.36 to 0.28. This is a local answer to round two's lag problem: a slow state changes the moment something that depends on it fails, and holds otherwise. m006 got a similar effect a different way, switching topics in a median of 11 characters instead of 31.

**3. The hidden context is found where it matters, but counting still wins the rest.** On the first character of a cue-dependent completion, where the hidden context actually decides, both new models beat every counter (about 0.89 against 1.06). They lose overall only because an order-8 counter gets the remaining characters of a long completion almost free. That's the clearest sign yet of the theory's "nothing is wrong, only out of context" working, but it's still the start of a win, not a win.

**4. Thinking without data is still not there.** Quiet periods changed structure (m006 activated hundreds of nodes and made new bindings) but the effect on later prediction was tiny and changed sign between seeds. m005 found why, at least in its design: conflicts that held context can resolve were already resolved while reading. Nothing was left over for the quiet period to do, and forcing it to bind more created coincidental bindings that hurt.

**5. Remembering versus learning: better, not solved.** Melting the least valuable structure first (m005) and gating recruitment on large unexplained misfit (m006) both moved the trade-off in the right direction. With freezing off, m003 kept 47% of what it knew; m005 keeps 81%. But a counter that simply stops growing when full still beats every model on both remembering and learning.

## Honest caveats

- **Still counting underneath.** Both models declared it in detail: outputs are count tables, confidence is Witten–Bell's escape weight, shared assemblies amount to class-based backoff. What is genuinely new is *which* structure exists, *when* it speaks, and *when* it lets go, all decided by local heat. That is the part the theory claims, and it's the part producing the wins.
- **m006 keeps a generic channel for misreadings** (insert, delete, substitute) whose form is given, though its rates are learnt and nothing matches test 9's corruption kinds. Its unseen-noise win is real but not fully discovered.
- **m006 is costly:** about 9 seconds per seed and 50,000 peak units, mostly untested structure that never switches on. m005 is leaner at about 3 seconds.
- Everything was tuned on seed 1. Seeds 2 and 3 were used only for reporting.

## Where the theory stands after three rounds

| idea | status |
|---|---|
| Residual heat recruits fresh capacity | supported in every round |
| Heat spreads along connections | supported; needs the resolvable/irreducible distinction |
| Energy rises on novelty; structure makes heat possible | supported in every round |
| Shared assemblies give composition | supported, strongly |
| States persist and carry context | supported, once they can be released |
| Freezing protects memory | supported once melting is real; trades against learning |
| Specialists and generalists coexist | supported, but needs a referee (the specific state's own uncertainty) |
| Old pieces compose into new responses | supported (word groups, topic-keyed assemblies) |
| Thinking without data | not yet supported |
| No reward signal needed | consistent with all results so far; not directly tested |

## Proposal for round four

1. **Give thinking a real job.** m005's diagnosis suggests a test where conflict *can't* be resolved while reading: contradictory sources that only make sense once two separate experiences are connected, with the connecting evidence arriving apart in time. Then a quiet period has something genuine to do.
2. **Move off counting at the core.** Replace count tables with assemblies whose connection strengths are the prediction, to test whether the wins survive without borrowed smoothing.
3. **Act in a world.** The grid environment from the README (rung 13): mazes and simple puzzles where the energy is in the environment. Everything so far has been passive prediction.
4. **Fix the cost.** Prune untested structure in m006's lineage and see how much of the advantage survives at a third of the size.

I'd suggest 1 and 3 as the most informative next steps, and keeping m006 as the base model since it combines the most wins.
