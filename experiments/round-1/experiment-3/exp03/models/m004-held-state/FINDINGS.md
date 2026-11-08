# m004-held-state: findings

Design brief: **held state and resolvable heat.** Main targets were test 3 (persistence) and test 4 (noise).
All tuning was done on seed 1. Seeds 2 and 3 were used only for reporting, and for the ablation table, which was run after tuning stopped.
Full run (`cargo run --release -p harness --bin run -- --model m004`, 3 seeds, all 16 baselines): **8.5 s wall** on 2 threads. m004 takes about 1.9 s per seed.

## What was built, mapped to the README

| README idea | m004 mechanism |
|---|---|
| An estate of state machines, each holding a state until something makes it transition | Three kinds of machine, each holding its own state: (a) **fast context machines**. A state is "the last *d* characters were …" (d = 0..6), and its outgoing connections carry transition counts. (b) A **slow topic machine** with up to 4 held states, running at word rate. (c) A **slow noise machine** that holds an estimate of the corruption rate. |
| Slow machines change only when something sustained warrants it | The topic machine keeps a leaky *pressure* for every other state: how much better each would have fitted recent words. It transitions only when that pressure passes 4 bits. It recruits a new state only when its own *excess* misfit (surprisal above its usual level) has built up past 14 bits. Otherwise it holds its state indefinitely, including across sentence and block boundaries. |
| A slow machine's held state is an input to fast ones | Every fast context node can have a topic-keyed twin, "the last *d* characters, *while the topic machine holds state k*". This twin is blended on top of the plain node. Prediction mixes over the topic states that hold at least 5% belief. |
| Keep the thread through noise | The fast machine does not collapse on a misfit character. It holds up to 6 alternative readings (this character was inserted, a character was dropped, two characters were swapped) and rejoins whichever fits best. Their weights follow how well each predicts the characters that come next. The noise machine's held rate sets how much weight these readings get. |
| Resolvable vs irreducible heat | A new node starts as a **shadow**: a young connection that learns but is not used for prediction. It switches on only once the misfit it *would have removed* (accumulated bits saved over its parent's prediction) passes a gate. Irreducible variation never earns that gain, so it stays warm (it still shows as energy) without growing used structure. |
| Freezing lives on connections; fixed capacity with real melting | A node (the bundle of one state's outgoing connections) has heat = a running mean of its excess misfit. Once heat < 0.4 after ≥ 12 visits, it **freezes**: its counts stop changing and it can't be melted. Capacity is a hard limit on nodes. When it is full, an unfrozen node melts (is evicted, shadows first, then least recently used) so its slot can be reused. `set_freezing(false)` means nothing ever freezes. |
| Energy | `energy()` = surprisal of the arriving character under the model's mixed prediction. |

### Counting-equivalent parts (declared)

1. **The fast prediction is Witten–Bell interpolation.** Each active node blends its transition counts over the prediction of the node below it, with weight `distinct/(total+distinct)`. Over the plain context chain this is exactly interpolated Witten–Bell. The topic-keyed nodes extend the chain with one extra conditioning variable (the held topic state), which is still counting, just over a richer context. **The fast machines are counting-equivalent.** What is not counting: *which* nodes exist and are used (the gain gate), the held topic state they are keyed on, the held-hypothesis mixture, and the freezing/melting that decides what the counts can still change.
2. **The topic machine's word fit** is additive smoothing (count + 20 × background) over its own word counts. The background is itself add-½ smoothed over global word counts. Counting.
3. **The corruption channel** mixes ε/29 uniform mass into every prediction (ε held by the noise machine, between 2e-4 and 0.04). This acts as a smoothing floor.
4. **The corruption channel's shape (insert / drop / swap) is a designed-in prior** that matches the three corruption types the harness uses. The automaton learns its *rate*, not its *kinds*. The noise result below has to be read with this in mind.

## Results (best baseline on each headline, per the harness)

| test | headline | m004 seed 1 | best baseline seed 1 | m004 3-seed mean | best baseline mean | verdict |
|---|---|---|---|---|---|---|
| 1 Prediction | bpc_full | 0.769 | 0.740 (wb-o5) | 0.779 | 0.746 (wb-o5) | **loses** by 0.03 |
| 2 Composition | verb_bpc | 3.816 | 1.725 (ppmc-o2) | 4.079 | 1.863 (ppmc-o2) | **loses badly** |
| 3 Persistence | topic_bpc_boundary | 0.963 | 0.985 (wb-o6) | 0.987 | 1.004 (wb-o6) | **wins on seeds 1 and 2, loses on seed 3** (1.038 vs 1.031) |
| 4 Noise | bpc_10 | 1.636 | 2.383 (ppmc-o6) | 1.617 | 2.389 (ppmc-o6) | **wins clearly** (all seeds) |
| 5 Forgetting | survival (freeze on) | 0.988 | 0.982 (ppmc-o4) | 0.979 | 0.981 (ppmc-o4) | **ties** (see trade-off below) |
| 6 Confusion | ordering | familiar 0.687 | – | 0.723 < held-out 1.460 < unseen 5.944, random 8.377 | – | ordered on all seeds |
| 7 Thinking | diff | 0.000 | – | 0.000 | – | not implemented (quiet does nothing) |

Per seed, m004: bpc_full 0.769 / 0.787 / 0.781. verb_bpc 3.816 / 4.352 / 4.068. topic_bpc_boundary 0.963 / 0.959 / 1.038 (wb-o6: 0.985 / 0.998 / 1.031). bpc_10 1.636 / 1.601 / 1.614. survival 0.988 / 0.980 / 0.970.

Other numbers (3-seed means):
- **Prediction:** final 20% is 0.650, against wb-o5 0.658 and wb-o6 0.645. So m004 is about level late in the stream and loses early (first 20% is 1.184 vs 1.044).
- **Persistence detail:** topic_bpc_later 0.916 (wb-o6 0.944). topic_drop 0.070 (wb-o6 0.060). **m004's drop at the boundary is *larger* than the best baseline's, not smaller.** Its better boundary number comes from being better everywhere inside a block, and it gives back part of that advantage at the return.
- **Noise detail:** clean 0.655 (ppmc-o6 0.717, wb-o6 0.657). bpc_5 1.390 (ppmc-o6 1.646). after_bpc_10 1.797 (ppmc-o6 2.844). The 10 characters after a corruption cost m004 about 1 bit less each than the best baseline.
- **Forgetting, freezing on vs off** (capacity 2,000 nodes, 3-seed mean):

| | a_before | a_after | survival | b_final20 (learning B) |
|---|---|---|---|---|
| freezing **on** | 0.941 | 1.023 | **0.979** | 2.129 |
| freezing **off** | 0.879 | 2.357 | **0.629** | 0.827 |

  Freezing does a real job here: without it, learning B melts A away (survival 0.63). With it, A survives as well as the best counter (0.98). The price is plasticity: with freezing on, B's final-20% bpc is 2.13 against 0.83, because most of the 2,000 slots are frozen on A and B has almost nowhere to grow. a_before is also worse with freezing on (0.94 vs 0.88), because nodes that freeze early stop refining. On seed 1, other freezing settings trace a smooth trade-off curve, e.g. survival 0.927 with B at 0.941, or 0.958 with B at 1.095. No setting got both.
- **Cost:** about 1.9 s per seed (baselines take about 0.1 s). Peak 18,477 nodes, of which about 13,000 are shadows that never switched on and about 5,400 are active (wb-o5 uses 3,247 contexts).

### Ablations (3-seed means, run after tuning stopped)

| variant | bpc_full | verb_bpc | topic_bpc_boundary | bpc_10 | survival |
|---|---|---|---|---|---|
| **m004 as submitted** | 0.779 | 4.079 | **0.987** | **1.617** | 0.979 |
| topic machine off (no held topic state) | 0.803 | 3.515 | 1.040 | 1.578 | 0.973 |
| held hypotheses off (literal reading only; channel floor kept) | **0.765** | 2.595 | 0.985 | 2.235 | 0.982 |
| gate on topic-keyed nodes removed (0 bits) | 0.798 | 4.789 | 0.995 | 1.691 | 0.962 |
| no gating at all (every new node used at once) | 0.854 | 5.356 | 1.058 | 1.657 | 0.946 |

- **The held topic state is what wins test 3.** Without it, boundary bpc goes from 0.987 to 1.040, worse than wb-o6. It also gains 0.024 bpc on the whole stream.
- **The held hypotheses are what win test 4.** Without them, bpc_10 goes from 1.617 to 2.235. That still beats ppmc-o6's 2.389 slightly, because the channel's uniform floor remains. But held hypotheses also *cost* 0.014 bpc on clean prediction and a lot on composition (2.60 → 4.08): a surprising held-out verb is partly explained away as corruption, and learning follows the leading reading, which is occasionally a wrong noise reading.
- **The resolvable-heat gate does real work.** Removing it for topic-keyed nodes costs on every test. Removing it everywhere costs 0.075 bpc on the stream and 0.07 on topic return. Topic-keyed nodes switched on without proof of gain fragment the counts across topic states: this is exactly the over-splitting round one found, and the gate prevents it.

## What worked

- **Held hypotheses through noise.** Holding alternative readings of the input and rejoining the one that fits cuts the cost of 10% corruption by a third relative to the best counter. The bits in the 10 characters after a corruption drop from 2.84 to 1.80. The automaton keeps its place in the word and sentence instead of falling back to short contexts. Caveat: the insert/drop/swap shape of the channel was given, not learnt.
- **A slow machine holding topic, used as an input to fast machines.** It forms without supervision: 4 states, 85% purity against the true topics on seed 1, about 21 recruitments in 60k characters. It improves prediction inside topic blocks (later-block topic words 0.916 vs 0.944 for wb-o6).
- **Resolvable-heat gating** (shadow nodes that must prove they remove misfit before they are used). It is a cheap, local test that stops the extra conditioning from over-splitting. It is the clearest new mechanism here.
- **Freezing has a job under real melting.** Survival goes from 0.63 to 0.98 when it is on.

## What didn't

- **Composition (test 2): much worse than counting.** Deep and topic-keyed context nodes are confident about which verbs follow which nouns, nothing generalises across a noun group, and the noise hypotheses make it worse. Nothing in m004 shares structure across contexts. That was m003's brief, not this one, but m004 is *worse* here than plain high-order counting (PPM-C o5 2.30, WB-o5 4.55; m004 4.08).
- **Prediction (test 1): about 0.03 bpc behind wb-o5.** It matches wb-o6 late in the stream and is slower early, because the gate delays new structure until it has proven itself.
- **Persistence is only a narrow, seed-dependent win, and the boundary drop is not smaller.** The topic machine needs a median of 31 characters (p90: 74) after a return before it switches, because switching requires sustained evidence. During that time it confidently holds the *old* topic. With a 100-character boundary window, a third to half of the window is spent with the wrong held state.
- **Freezing trades plasticity for stability.** At this capacity nothing let both A survive and B be learnt. Freezing happened when the episode cooled, but nothing in m004 ever melts frozen structure that has become irrelevant.
- **Thinking without data:** not attempted. `quiet()` does nothing.

## Theory claims

- **Supported:**
  - States that persist until something sustained moves them can carry context that the input no longer shows. Topic held across sentences improves prediction, and an ablation proves it.
  - Holding the current state through a misfit, rather than collapsing, keeps the thread through noise.
  - Freezing protects old structure under real melting.
  - The resolvable/irreducible distinction can be made local: compare a candidate's misfit with its parent's, and only use the candidate if the difference accumulates.
- **Contradicted, or a cost the theory doesn't mention:**
  - **The persistence that carries context is the same thing that makes a return slow.** The README pictures held state recovering "where it was" on return. Here, a held state can only be as fast as its transition rule. A slow machine that resists noise and short digressions *must* lag on a genuine change, and it is stale precisely at the boundary the test scores. (On seed 1, lowering the switch threshold from 4 to 2 bits made topic return worse, not better (0.963 → 0.996; at 1 bit, 1.005): switching faster also switches on noise.)
  - Holding alternative readings works against novelty: the same machinery that rescues corrupted input explains away genuinely new combinations (test 2).
- **Untested:** thinking without data, composition by shared assemblies, curiosity.

## Surprises

- Hard switching between topic states lost to a held *belief* over them. Mixing all states with more than 5% belief helped every test. A held state works better as a distribution that shifts slowly than as a single committed state.
- Most of the automaton is shadows: about 13,000 of 18,500 nodes never proved themselves. Under scarcity they are the first to melt, which works well. With ample capacity they are dead weight.
- With freezing off, 2,000 slots learn B nearly as well as unlimited capacity does, and forget A almost entirely. Melting is real, and freezing is the only thing standing between them.

## Most important finding about the theory

**Persistence has a price, and it is paid at exactly the moment the persistence test scores.** A held slow state carries topic context well, and the topic-keyed structure it feeds only helps when it is gated to the misfit the state actually resolves. But a state that holds until something *sustained* warrants a change is necessarily stale for the first stretch after a real change. The theory needs a second rule for when slow machines may move faster. One candidate: a slow machine transitions faster when the fast machines' heat rises sharply and consistently, as opposed to scattered noise heat. In other words, the resolvable-vs-irreducible distinction is also needed for *state transitions*, not just for growing structure.

## Next steps

1. **Heat-driven switching for slow machines:** let a sharp, sustained rise in fast-machine heat, not just word fit, speed a slow machine's transition. Target: shrink the 31-character switch lag.
2. **Let the noise channel learn its kinds** (which edits occur), not only its rate, so the noise result is less of a designed-in prior. Also stop held noise readings from claiming genuine novelty: for example, a novel word that is still well formed should not count as corruption.
3. **Melting for frozen structure that is never visited again,** so that freezing does not starve new learning under scarcity.
4. **Combine with m003's shared assemblies** for composition. m004 has nothing to offer there.
5. Implement `quiet()`: for example, re-evaluate shadow nodes' gains or merge topic states that are rarely distinguished.

## Files

- `src/lib.rs`: the model. Parameters are constants in `par()` calls. The `M004` environment variable overrides them, and was used for tuning on seed 1 only.
- `examples/diag.rs`: diagnostics (stream bpc by decile, topic-state purity and switch lag, forgetting with freezing on/off). Run it on a corpus dumped with `--dump-corpus`.
