# m003-shared-assemblies: findings

Shared assemblies, with real melting. Rust, std only, online and single pass, local rules, deterministic (the harness determinism check passes on every seed). Defaults were tuned on seed 1 only. Seeds 2 and 3 were run only for reporting and for the ablation table below, after the defaults were fixed.

Reproduce: `cargo run --release -p harness --bin run -- --model m003` (all 16 baselines plus m003, three seeds, 7.2 s wall on 2 threads). Debug tools live in `examples/` (`probe`, `sweep`, `forget`, `think`, `diff`). They read texts written by `--dump-corpus DIR`.

## What it is, mapped to the README

| README idea | m003 |
|---|---|
| Cells, one shared population, hard capacity | One `Vec<Cell>`. `capacity` caps live cells of every kind. |
| States and transitions (state machines) | **Context cells** form a transition graph driven by input. The cell at depth d hands activity to its successor at depth d+1 for the arriving character. The active context cells are the suffixes of the last ≤6 characters. |
| An assembly belongs to many state machines | **Shared cells.** A context cell binds through a *membership connection* to up to 2 shared cells. A shared cell is woken by every member, learns from what follows every member, and has its own one-step successors. It is shared material: "dog␣", "cat␣", "cow␣", "bird␣", "pigeon␣" all wake the same cell. |
| Heat from misfit, local, spreading | A cell's misfit is the surprise of what arrived *beyond the cell's own entropy*, so irreducible variation (round one's open problem) doesn't heat it. A hot context cell spreads its heat through the input it just took to other cells that recently took the same input. It binds to the one whose followers look most alike over two steps (`sim2`, a histogram overlap, followed by overlap of the successors' histograms). |
| Residual heat recruits fresh capacity | New context cells are recruited on demand. Once the population is full, recruitment requires a parent visited ≥3 times. |
| Composition (connect existing assemblies) | Joining an existing shared cell is the default. A new shared cell is formed only when neither partner fits an existing one. In the main run, 1,151 memberships share 112 shared cells. |
| **Freezing on connections, not cells** | Each cell's incoming transition, its output connections and each membership connection have a freeze level. It rises as the cell cools (`freeze += rate·(1−freeze)·e^(−heat)`). Cells never freeze. |
| **Real melting** | (a) Hot, unfrozen output connections decay before new experience is added (`decay ∝ heat·(1−freeze)`). (b) Under full capacity, a leaf cell is melted and reused. Its incoming transition and memberships are cut and the cell is rewired elsewhere. The victim is the least-frozen and least-recent of 12 sampled leaves. A frozen transition (`freeze > 0.3`) refuses to melt and the new cell is not made. (c) Membership connections that no longer fit and are unfrozen melt away. `set_freezing(false)` makes every connection plastic, and victims are then chosen by recency alone. |
| Specialists vs generalists | Shared cells are consulted first, but their activation scales with the uncertainty (entropy) of the most specific active context cell. Where the specialist is sure, the generalist stays quiet. At branch points (what comes after a noun) it speaks. |
| Heat changes behaviour | Region temperature T = running mean of the active cells' misfit. Hot regions trust their cells less (escape × e^T) and keep a small uniform floor (≤10%). |
| Thinking without data | `quiet()`: the hottest uncertain context cells search for partners among *all* cells that took the same input, not only recent ones. |
| Energy | Activation-weighted misfit of the active cells, beyond what each expected. |

### Declared counting-equivalent parts

Most of the probability calculation is counting. I am declaring all of it:

1. **Output connections are counts.** `out[s] += 1` per observation. Melting multiplies them by (1−decay), but a cold cell's output is a plain count table.
2. **The context-cell backbone is a suffix trie of depth 6.** Without shared cells and heat (`theta_join=5,gamma=0,ufloor=0,kesc=1`), m003 is close to **interpolated Witten–Bell order 6** (seed 1: 0.744 vs wb-o6 0.747). Each cell takes rem·n/(n+u) of the remaining mass, deepest first.
3. **Confidence is Witten–Bell's escape weight** n/(n+k·u·e^(γT)) with k=1.3, γ=1. Heat-scaling the escape is new. The form is Witten–Bell.
4. **Shared cells are count tables over the union of their members' experience.** As predictors, they are a class-based n-gram backoff (Brown-cluster style). What is not counting is how the classes form: online, local, from heat spreading through the shared input and two-step successor likeness, with no global clustering pass.
5. **The heat-scaled uniform floor** is a mixture with the uniform distribution whose weight rises with recent misfit. It is a smoothing device, not something the states learned.

So the "no bolted-on counter" requirement is met only in the narrow sense that every count sits on a cell or connection of the automaton. The scoring maths is Witten–Bell plus class backoff.

## Results

Lower is better except survival. The best baseline per test is chosen by the harness (by mean headline). From `results/runs/m003/RESULTS.md`.

| test | headline | best baseline | baseline s1 | **m003 s1** | baseline mean | **m003 mean** | verdict |
|---|---|---|---|---|---|---|---|
| 1 Prediction | bpc_full | wb-o5 | 0.740 | 0.757 | 0.746 | 0.764 | **loses** by 0.018 |
| 2 Composition | verb_bpc | ppmc-o2 | 1.725 | **0.844** | 1.863 | **0.826** | **wins**, 56% lower |
| 3 Persistence | topic_bpc_boundary | wb-o6 | 0.985 | 1.023 | 1.004 | 1.036 | **loses** by 0.032 |
| 4 Noise | bpc_10 | ppmc-o6 | 2.383 | 2.378 | 2.389 | 2.383 | tie (ahead on all 3 seeds by ≤0.007) |
| 5 Forgetting | survival (freeze on) | ppmc-o4 | 0.982 | 0.946 | 0.981 | 0.941 | **loses** by 0.04 |
| 6 Confusion | energy order | – | – | ordered | – | ordered on all seeds | passes |
| 7 Thinking | diff (quiet − none) | – | 0 | −0.000 | 0 | +0.0002 | no effect |

Per seed, m003: bpc_full 0.757 / 0.769 / 0.766. verb_bpc 0.844 / 0.831 / 0.804. topic_bpc_boundary 1.023 / 1.019 / 1.068. bpc_10 2.378 / 2.463 / 2.309. survival 0.946 / 0.930 / 0.949.

### 1. Prediction
0.764 mean vs wb-o5 0.746. In the final 20%, 0.699 vs 0.645 (wb-o6), so the gap widens as counts grow. Sharing and heat cost prediction (see the ablation table). On seed 1, the same model without sharing (0.738) beats wb-o5 slightly.

### 2. Composition: the main result
- Held-out verb characters: **0.826** vs best baseline 1.863 (ppmc-o2). Every higher-order counter is worse (wb-o5 4.55, wb-o6 5.51).
- Verb first character, where the counter has never seen this noun followed by this verb: **2.81** vs best baseline 4.16 (wb-o1). wb-o5 pays 18.5 bits.
- Whole held-out sentences: **0.808** vs best baseline 1.073 (ppmc-o3).
- Cost: on *seen* pairs (control), verb bpc is 0.420 vs 0.315 for wb-o5. verb_gap (held-out − control) is 0.41, against 0.56 to 6.6 for the counters.

The shared cells it learned (seed 1, top by membership) are the grammar's noun groups, found online:
`{cat, cow, dog, bird, pigeon, fish}` → s/e/r/h (sleeps, eats, runs, hides).
`{bus, car, clock, ship, tractor, lamp}` → s/b/t (stops, breaks, turns, shines).
`{boy, man, girl, sailor, farmer, baker}` → l/w/r/s (laughs, waits, reads, sings).
Others group sentence ends and prepositions (`". "`, `" by "`, `" on "` → t/a/m, the determiners).

### 3. Persistence
Loses. topic_drop is smaller (0.031 vs 0.060 for wb-o6), but only because m003 is worse later in the block too. m003 holds no topic state: its context reaches 6 characters back. This test is untested by this design.

### 4. Noise
A tie with the best counter (2.383 vs 2.389). bpc_5 is 1.635 vs 1.641 (ppmc-o5). Heat is what earns it: without heat scaling and the floor, bpc_10 is 4.86 (seed 1), the same collapse as interpolated Witten–Bell (4.99). When a corruption makes the region hot, the model stops trusting its specific cells. That is the README's "heat loosens structure" applied to prediction. The mechanism is still a smoothing device (declared above).

### 5. Forgetting: freezing on vs off
Capacity 2,000 cells, with real melting (seed 1: about 8k melts during A and 20k during B).

| | a_before | a_after | **survival** | b_final20 |
|---|---|---|---|---|
| freeze on, mean | 0.848 | 1.083 | **0.941** | 1.025 |
| freeze off, mean | 0.947 | 3.033 | **0.467** | 0.870 |
| ppmc-o4 (best baseline) | 0.770 | 0.847 | 0.981 | 0.926 |

**Freezing earns its place:** survival is 0.94 with it on vs 0.47 off, on every seed (0.946/0.930/0.949 vs 0.470/0.477/0.453). With freezing off, B overwrites A almost entirely (3.03 bpc, close to order-0). The price is plasticity: with freezing off, B is learnt better (0.870 vs 1.025). Freezing off is also worse on A before B arrives, because unrestricted melting churns A's own structure.

m003 still loses to ppmc-o4. That baseline never melts anything: at capacity it refuses new contexts, so A is safe by construction and B is learnt worse. An automaton that melts has to beat that, and m003 does not yet.

Ablation (seed 1): with output-connection melting turned off (`melt_rate=0`), survival is 0.951 on and 0.596 off. Most of the forgetting comes from cell reuse, and the rest from hot output connections weakening.

### 6. Confusion
Mean energy: familiar 0.18 < held-out pairs 0.39 < word salad 1.28 < unseen words 2.62 < random 4.64. The order is the same on all seeds. Because energy is misfit beyond each cell's own entropy, familiar text is far calmer than its bpc (0.71) would suggest. Held-out pairs are only mildly warmer than familiar text: the shared cells partly expected them.

### 7. Thinking without data
No effect (+0.0002 bpc mean; −0.00003 on seed 1). The quiet period makes about 25 new memberships (seed 1), but they come from cells that would soon have found partners anyway. The cells most in need had already joined during reading. Contradicted for this design: there was no unresolved internal disagreement left for quiet time to settle.

### 8. Cost
About 1.5 s per seed for all tests (0.3 s for the 60k training read, about 5 µs per character) vs about 0.1 s for a baseline. Peak units are 6,178 (wb-o6 uses 5,615 contexts). Of these, 112 are shared cells and 477 are shared successors.

## Ablations (all three seeds, `examples/sweep`)

| variant | bpc_full s1/s2/s3 | held-out verb_bpc s1/s2/s3 | bpc_10 s1/s2/s3 |
|---|---|---|---|
| **m003 (default)** | 0.757 / 0.769 / 0.766 | **0.844 / 0.831 / 0.804** | 2.38 / 2.46 / 2.31 |
| no sharing (`theta_join=5`) | 0.738 / 0.744 / 0.742 | 2.71 / 2.67 / 2.82 | 2.36 / 2.46 / 2.31 |
| no heat in prediction (`gamma=0,ufloor=0,kesc=1`) | 0.747 / 0.763 / 0.755 | 0.90 / 0.82 / 0.81 | 4.86 / 4.99 / 4.56 |
| no sharing, no heat (≈ interpolated WB-o6) | 0.744 / 0.754 / 0.750 | 5.13 / 5.46 / 5.73 | 4.79 / 4.99 / 4.58 |
| generalist always on (`kent=0`) | 0.803 / 0.829 / 0.828 | 0.70 / 0.84 / 0.74 | 2.38 / 2.50 / 2.33 |
| generalist below specialists (`top=0`) | 0.740 / 0.753 / 0.749 | 1.14 / 0.95 / 1.11 | 2.37 / 2.46 / 2.31 |

Sharing costs about 0.02 bpc on the stream and buys a 3× reduction on held-out verbs. Heat costs about 0.01 bpc and buys the noise result. The entropy gate on generalists is what keeps the prediction cost small.

## What worked, what didn't

**Worked**
- Shared cells formed by local heat spreading and two-step successor likeness rediscovered the grammar's word classes online and composed on unseen pairs. The README's composition claim is supported here, and counting cannot match it on this test.
- Freezing on connections under real melting: survival 0.94 vs 0.47. This is the first time in the project that freezing changed an outcome.
- Misfit measured beyond a cell's own entropy separates resolvable from irreducible heat well enough for a clean energy ordering. It also drives the noise behaviour.

**Didn't**
- Plain prediction is still 0.018 behind wb-o5, and the gap grows with data.
- No held state, so no persistence gain. Quiet time does nothing.
- Under scarcity, survival is still below a counter that simply stops growing.

**Tried and dropped** (seed 1): longer shared chains (3–7 steps; worse composition, 1.1 to 2.6); placing generalists below specialists; letting a generalist add only the continuations its member lacks ("novel" mass); escape scaled by incompleteness or tension; gating by fit; merging redundant context cells; a sharper heat threshold on the floor. Each either lost composition or lost prediction more than the final design.

## Theory claims

- **Supported:** composition from shared assemblies (part three). Freezing protects what was learnt when hot structure really melts (part two, "Growing, not overwriting"), at a measurable cost in plasticity. Energy rises with unfamiliarity (rung 6). Heat as loosening helps in noise.
- **Needs its own mechanism:** "whichever fits the situation most specifically responds" was not enough. A generalist consulted wherever it is active costs 0.05–0.06 bpc on the stream (0.046–0.062 across seeds). It has to be woken by the specialist's uncertainty. This answers one of the README's open questions: the specialist/generalist competition did need its own mechanism here, though a simple local one.
- **Contradicted here:** thinking without data (no effect).
- **Untested:** held states / persistence, curiosity, acting.

## Surprises
- The best composition came from the shortest shared machine: a shared cell plus one successor step. Longer shared chains replay a blur over the specialist's sharp knowledge.
- The model found the classes without ever being told where words end. Some shared cells group suffix fragments ('rd ', 'ow ', 'geon ') with the whole words, because they predict the same things.
- Freezing off was worse even *before* the second stream: unrestricted melting churns the model's own fresh learning.

## Next steps
1. Melting that beats "refuse to grow": melt by low *use* × low freeze (not recency). Let frozen cells survive B's whole stream while unfrozen B cells recycle among themselves.
2. Give shared cells their own longer, sharper machines by binding on longer successor likeness (the verb's whole spelling), not one blurred step.
3. Replace the Witten–Bell confidence with something that comes from the states, for example confidence = frozen fraction of a cell's output connections, and measure what is lost.
4. Held state for topics: shared cells whose activation decays slowly across sentences.
