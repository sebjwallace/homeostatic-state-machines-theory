# Experiment 02: composition, persistence and freezing

Round one showed the local rules work but both models collapsed into counting. Round two fixed the measurement first, then went after the parts of the theory round one never reached.

**Setup.** Rust, standard library only, no viewer. A shared harness (`exp02/harness`) with one deterministic corpus of about 60,000 characters, three topics in interleaved blocks, and 18 held-out noun–verb pairs verified never to appear in training. Sixteen counting baselines (PPM-C with exclusion and interpolated Witten–Bell, orders 1–8). Eight tests, three seeds, every model compared with the **best** baseline on each test. The whole comparison runs in about 15 seconds. I merged both models into one workspace and re-ran everything from scratch; the numbers match the agents' reports.

- **m003, shared assemblies:** context states plus shared cells that form when words are followed by similar things. Freezing on connections, fixed capacity, real melting.
- **m004, held state:** fast machines over recent characters, a slow topic machine whose held state feeds the fast ones, alternative readings of the input to survive corruption, and new structure that only switches on once it has proved it saves bits.

Code, findings and raw results: `exp02/models/*/FINDINGS.md`, `exp02/results/RESULTS.md`, `exp02/results/results.json`. Run it yourself with `cargo run --release -p harness --bin run` from `exp02/`.

## Results (three-seed means)

| test | best baseline | m003 shared assemblies | m004 held state |
|---|---|---|---|
| 1 Prediction, bpc (lower is better) | 0.746 | 0.764 | 0.779 |
| 2 **Composition**, bpc on held-out verbs | 1.863 | **0.826** | 4.079 |
| 3 **Persistence**, bpc after topic return | 1.004 | 1.036 | **0.987** |
| 4 **Noise**, bpc at 10% corruption | 2.389 | 2.383 | **1.617** |
| 5 Forgetting, survival of A (higher is better) | 0.981 | 0.941 | 0.979 |
| 5 Forgetting with freezing **off** | – | 0.467 | 0.629 |
| 6 Confusion | – | energy ordered correctly | energy ordered correctly |
| 7 Thinking without data | – | no effect | no effect |

## What it found

**1. Composition: the first result counting can't match.** m003 predicts the verb in sentences it has never seen with 56% fewer bits than the best counter. Its shared cells formed the grammar's word groups by themselves, from local rules: animals, vehicles and objects, people. "The dog sat" benefited from "the cat sat". This is the theory's "an assembly can belong to many state machines" working as intended.

**2. Freezing finally has a job.** With real melting under scarce capacity, turning freezing off makes the automata forget most of what they learnt: m003's survival drops from 0.94 to 0.47, m004's from 0.98 to 0.63. But freezing also starves new learning, because frozen slots can't be reused. Both models sit on a trade-off between remembering and learning, and neither found a way to get both. Counting baselines sidestep it by simply refusing to add anything once full, which is a kind of total freeze.

**3. Held state helps, but persistence has a price.** m004's topic state improves prediction inside topics, and noise recovery is a clear win. The cost shows exactly where the theory said it would be subtle: a state that only moves on sustained evidence lags on real change. After a topic returns, the topic machine takes a median of 31 characters to switch back. Lowering its threshold made it switch on noise instead. The resolvable-versus-irreducible distinction is needed for *when states change*, not only for when structure grows.

**4. Specialists and generalists need a referee.** m003's shared cells only paid off once the specific state's own uncertainty decided when they speak. Letting them always contribute cost prediction accuracy. One of the README's open questions, whether specialist-generalist competition needs its own mechanism, got a provisional answer: here it did, though a simple local one.

**5. Still no thinking.** Quiet periods did nothing measurable in either model. Neither design holds internal disagreements that settling could resolve.

## Honest caveats

- **Both models are still mostly counting underneath.** Each declared it: transition tables with Witten–Bell-style smoothing form the backbone. What's new is *which* structure exists and *when it speaks* (shared cells, topic state, proved-before-used structure), all decided by local heat. That's real, but the core prediction machinery is borrowed.
- **m004's noise win is partly built in.** It was given the insert, drop and swap shape of corruption, which matches the harness. It learnt only the rate. The win is genuine evidence that keeping alternative readings helps, but not that the automaton discovered what corruption is.
- **Each model wins its own target and loses the other's.** m003 has no held state; m004's alternative readings explain away novel verbs as corruption, which is why its composition result is so poor.
- Neither beats the best counter on plain prediction.

## For round three

The two wins live in different models and partly fight each other. Round three should test whether they combine, and push on the trade-off:

1. **Combine** shared assemblies (m003) with held state (m004) in one automaton, and see whether composition and persistence coexist.
2. **Resolve the remember-versus-learn trade-off.** Let residual heat recruit fresh capacity first and melt only the least valuable unfrozen structure, and let frozen structure be reused when it's been idle a long time.
3. **Learn, don't build in.** Drop m004's hand-designed corruption shapes; let alternative readings come from the automaton's own structure.
4. **Give thinking something to do.** Introduce genuine internal conflict, such as contradictory sources in the corpus, so a quiet period has something to resolve.
