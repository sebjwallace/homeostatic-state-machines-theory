# m006-state-with-assemblies: findings

Lineage: descends from **m004-held-state** (code copied, then largely rewritten), with **m003-shared-assemblies** grafted in.
Brief: (1) remove m004's built-in corruption shapes, (2) add shared assemblies so composition works, and let shared structure explain novelty before noise does, (3) context conflict through held state, (4) shrink the persistence lag, (5) remember versus learn.

All tuning was done on seed 1. Seeds 2 and 3 were used only for the final report and for the ablation table, which was run after tuning stopped.
Final run: `cargo run --release -p harness --bin run -- --model m006` (16 baselines + m006, 3 seeds): **24.4 s wall on 2 threads**, about 8.9 s per seed for m006 (m004 takes about 1.9 s). The determinism check passes on every seed.

## What was built, mapped to the README

| README idea | m006 mechanism |
|---|---|
| An estate of state machines holding states | **Fast context nodes** ("the last *d* chars", d ≤ 6), as in m004. **Topic-keyed twins** of context nodes and of shared nodes ("…while the topic machine holds state k"). **Link nodes** ("the last *d* chars, while word trace *w* is held"). A **slow topic machine** (4 states). **Held word traces**: the last 12 distinct words, each held with a strength equal to its rarity (−log₂ of its global frequency) that fades by 0.97 per word. No cue words are given; every word becomes a trace. |
| One assembly belongs to many state machines (part three) | **Shared nodes** (from m003). A context node binds through up to 2 membership connections to shared nodes. They form when heat spreads through the input to nodes followed by alike things over two steps. A shared node learns from every member and grows one-step successor nodes. **New:** each shared node has a topic-keyed twin (the generalist under the held context), and each membership connection learns a **trust**: whether the shared node actually removes this member's misfit. |
| Specialists vs generalists | A generalist speaks in proportion to the entropy of the specific prediction (as in m003). **New:** a shared node's *successor* speaks with the gate that its branch point had one step earlier. The gate is held on the reading for one step. (After a novel branch the specific state is confidently wrong, so its own entropy silenced the successor. Holding the gate fixed this: on seed 1, bits at verb position 1 went from 1.62 to 0.36.) |
| Keep the thread through noise, without designed-in shapes | m004's insert / drop / swap moves (and its pending-swap state) are removed. When the leading state cannot continue, three readings come from the automaton's own structure. **(a) Held glitch:** the input did not move the state, and the state carries the glitch over. **(b) Anticipation reached:** the state moves to one of its own 3 most-expected successors, then takes the input. **(c) Self-advance:** the state moves to an expected successor, and the input did not move it. Each reading's rate is a separately held slow state, learnt from how much weight that reading wins. |
| Novelty explained by shared structure before noise | Every reading's prediction already includes the shared assemblies. A novel verb that fits the word group is well predicted by the literal reading, so it gives no evidence to the noise readings. Ablation: removing all readings now *raises* composition bpc slightly (+0.018); in m004 it lowered it by 1.48. |
| Context ("nothing is wrong, only out of context"); held state as the route | Link nodes hang from the deepest active context node (depth ≥ 3) and are keyed by a held word trace. They start as **shadows** (m004's resolvable-heat gate). They are recruited only where the specific state is uncertain (entropy > 0.2 bits) and the character was a misfit (> 0.5 bits). They switch on after removing 4 bits of misfit, and switch off again if their cumulative gain goes negative. A link speaks in proportion to its state's uncertainty. |
| Persistence: switch fast when resolvable, resist noise | The topic machine keeps m004's word-rate rule. **New:** at every character it compares how the fast nodes keyed to each topic state would have predicted that character. This updates (a) its held belief (likelihood^0.5) and (b) a leaky pressure that switches the held state at 10 bits. A change that some state's *structure* resolves builds pressure quickly. Noise fits no state better, so it builds none. |
| Freezing on connections | When a node has cooled (heat < 0.4 after ≥ 12 counts), its outgoing connections freeze. Membership connections freeze as the node cools (as in m003); frozen ones resist leaving and resist trust changes. A frozen node cannot be melted. `set_freezing(false)` means nothing freezes. |
| Remember vs learn: recruit free capacity first, melt the least valuable, thaw | While capacity is free, structure is recruited on demand. Once it is full, new structure costs a melt, so only a character carrying ≥ 1.5 bits of **residual heat** may recruit. The victim is the least recently used unfrozen node in a sample of 16, shadows first. **Frozen nodes thaw** when they have been idle ≥ 10,000 characters and visited < 20 times. |
| Thinking without data | `quiet()`: shadow nodes (context, topic-keyed and link) are re-judged by the leave-one-out bits their own connections would remove from their parent's expectation, and switch on if that passes their gate. Then the hottest uncertain context nodes search *all* nodes that took the same input for shared partners. |
| Energy | Surprisal of the arriving character under the mixed prediction (as in m004). |

### Counting-equivalent parts (declared)

1. **Fast prediction is interpolated Witten–Bell.** Each active node blends its counts over the prediction below it with weight distinct/(total+distinct). Topic-keyed twins and link nodes extend the chain with extra conditioning variables (held topic state, held word trace). That is still counting, over a richer and *selectively grown* context. Which nodes exist and are used (resolvable-heat gate, deactivation, residual-heat recruitment) is not counting.
2. **Shared nodes are count tables over the union of their members' experience.** Their weight is the Witten–Bell confidence n/(n + 1.3·u). As predictors they are a class-based backoff (Brown-cluster style), as m003 declared. Their topic twins blend in Witten–Bell form. Class formation (heat spreading, two-step likeness), membership trust and the held branch gate are not counting.
3. **The topic machine's word fit** is additive smoothing over word counts, backed off to global counts (inherited from m004).
4. **Trace strength** is −log₂ of a global word frequency (a count).
5. **The held-glitch reading mixes uniform mass into every prediction** (each reading's rate is held between 2·10⁻⁴ and 0.04). This acts as a smoothing floor.
6. **Built-in knowledge:** space, full stop and newline segment words for the topic machine and the traces (inherited from m004).
7. **The three readings are, mathematically, an edit channel:** insertion (a), deletion (b) and substitution (c). They are generic: what a state machine and its input can do when they fall out of step, and they are not matched to the harness's kinds. m004's adjacent-swap reading is gone. Their rates are learnt; their forms are given.

## Results (three-seed means; lower is better except survival)

| test | headline | best baseline | m003 | m004 | **m006** | m006 vs best |
|---|---|---|---|---|---|---|
| 1 Prediction | bpc_full | **0.746** (wb-o5) | 0.764 | 0.779 | 0.756 | loses by 0.010 (all seeds; seed 1 0.746 vs 0.740) |
| 2 Composition | verb_bpc | 1.863 (ppmc-o2) | **0.826** | 4.079 | 0.948 | **wins**, 49% lower |
| 3 Persistence | topic_bpc_boundary | 1.004 (wb-o6) | 1.036 | 0.987 | **0.983** | **wins on all 3 seeds** |
| 4 Noise | bpc_10 | 2.389 (ppmc-o6) | 2.383 | **1.617** | 1.779 | **wins** (all seeds) |
| 5 Forgetting | survival (freeze on) | **0.981** (ppmc-o4) | 0.941 | 0.979 | 0.955 | loses by 0.026 |
| 6 Confusion | energy order | – | ordered | ordered | ordered: familiar 0.74 < held-out pairs 0.81 < word salad 3.0 < unseen 5.2 < random 7.3 | – |
| 7 Thinking | diff (quiet − none) | – | +0.000 | 0.000 | +0.007 | quiet slightly *hurts* |
| 9 Unseen noise | bpc_10 | 2.414 (ppmc-o6) | 2.410 | **1.927** | 2.054 | **wins** (all seeds) |
| 10 Context conflict | conflict_bpc | **0.200** (wb-o8) | 0.364 | 0.479 | 0.276 | loses by 0.076 |

Per seed, m006: bpc_full 0.746 / 0.770 / 0.753 (wb-o5 0.740 / 0.751 / 0.747). verb_bpc 1.009 / 0.924 / 0.911. topic_bpc_boundary 0.950 / 0.988 / 1.012 (best 0.985 / 0.997 / 1.031). bpc_10 1.729 / 1.866 / 1.742. survival 0.970 / 0.941 / 0.955. unseen bpc_10 2.126 / 2.014 / 2.021. conflict_bpc 0.240 / 0.263 / 0.327 (wb-o8 0.181 / 0.206 / 0.212).

Detail (three-seed means):
- **Prediction:** the final 20% is **0.636**, better than every baseline (wb-o6 0.645, wb-o5 0.658) and than m004 (0.650). The first 20% is 1.161 against wb-o5's 1.044, because gated structure is slow to start. The remaining loss is entirely this early cost.
- **Composition:** verb first character 3.45 bits (m003 2.81, ppmc-o2 5.49). Whole held-out sentences 0.829 (best baseline 1.073). Control (seen pairs) 0.365. verb_gap 0.58.
- **Persistence:** later-in-block topic words **0.848** (wb-o6 0.944, m004 0.916). The boundary *drop* (0.136) is larger than the counter's (0.060). As with m004, the win comes from being much better inside a block, not from losing less at the return.
- **Noise (test 4):** clean 0.645, bpc_5 1.282, after_bpc_10 2.00 (ppmc-o6 2.84). Worse than m004 (1.617), which was given the harness's exact swap shape.
- **Unseen noise (test 9), after-corruption bpc by kind:** double 1.75 (ppmc-o6 2.20, m004 1.66). transpose-2 **2.45** (ppmc-o6 2.84, m004 2.87). burst 2.31 (2.78, m004 2.06). boundary 2.52 (3.06, m004 1.81). m006 beats the best counter on every kind but beats m004 only on transpose-2. m004's designed adjacent swap fits a moved word boundary (" c" ↔ "c ") very well.
- **Context conflict:** first completion character **0.877** vs wb-o8 1.060 (m003 1.28, m004 1.85). m006 is the only model that predicts the divergent character better than the best counter, so the held cue does reach the completion. It loses on the rest of the completion: once the first character is seen, wb-o8 is nearly deterministic, while m006's blending leaks some probability mass.

### Test 5: freezing on/off (capacity 2,000)

| | a_before | a_after | survival | b_final20 (learning B) |
|---|---|---|---|---|
| m006 freezing **on** | 0.819 | 0.999 | **0.955** | **1.277** |
| m006 freezing **off** | 0.776 | 1.683 | 0.778 | 0.807 |
| m004 freezing on | 0.941 | 1.023 | 0.979 | 2.129 |
| m004 freezing off | 0.879 | 2.357 | 0.629 | 0.827 |
| m003 freezing on | 0.848 | 1.083 | 0.941 | 1.025 |
| ppmc-o4 (best baseline) | 0.770 | 0.847 | 0.981 | 0.926 |

Freezing still does its job (survival 0.955 on vs 0.778 off). Compared with m004, B is learnt far better under freezing (1.28 vs 2.13) for 0.024 less survival. Freezing-off survival also rose, from 0.63 to 0.78, because the residual-heat gate on recruitment protects A even without freezing. Honest reading: m006 sits at a better point than m004 but on roughly the same trade-off curve. m004's seed-1 sweep reached survival 0.958 with B at 1.10; m006 on seed 1 has 0.970 with B at 1.14. ppmc-o4, which simply stops growing, still beats both models on both axes.

### Quiet period effect (tests 7 and 10)

| | none | quiet | diff | per seed |
|---|---|---|---|---|
| Test 7, bpc on second half | 0.640 | 0.647 | **+0.007** (worse) | +0.001 / +0.019 / +0.001 |
| Test 10, conflict_bpc | 0.276 | 0.268 | **−0.008** (better) | +0.003 / +0.009 / −0.038 |
| Test 10, learn_conflict_bpc | 0.435 | 0.430 | −0.005 | |

The quiet period now *does* something. On seed 1's conflict stream it switched on 395 shadow nodes and made 36 shared joins. But the effect is small and its sign is inconsistent across seeds. On the main stream it slightly hurts: shadows switched on from their own counts had not proven themselves on new input. With quiet off, both diffs are exactly 0. **This is not a reliable thinking effect.**

### Persistence lag (seed 1, `examples/diag`)

| | median lag (chars) | mean | p90 | purity |
|---|---|---|---|---|
| m004 held state (round two) | 31 | 38 | 74 | 0.85 |
| m006 held state (word rule + char-rate pressure) | 28 | 35 | 66 | 0.86 |
| m006 **held belief** (what prediction uses), char-rate evidence off | 18 | 25 | 51 | 0.85 |
| m006 **held belief**, final | **11** | **17** | **34** | **0.89** |

The belief that prediction actually uses now follows a real change in a median of 11 characters, and purity *rose*. The rule is to move when the fast structure keyed to another state fits the characters better: resolvable misfit, not raw misfit. It gets faster without switching on noise. Two rules that tried to speed switching on word evidence alone failed. A "sharp single word" switch cut the held-state lag to 9–13 characters, but purity fell to 0.58–0.61 and test 3 got worse. Char-rate switching at a 6-bit threshold also lowered purity (0.72).

## Ablations (three seeds, run after tuning stopped)

| variant | bpc | verb | topic ret. | noise10 | unseen10 | survival | B final20 | survival off | conflict | t10 quiet |
|---|---|---|---|---|---|---|---|---|---|---|
| **m006 final** | 0.756 | 0.948 | **0.983** | 1.779 | 2.054 | 0.955 | 1.277 | 0.778 | 0.276 | −0.008 |
| no shared assemblies | 0.786 | 4.303 | 1.025 | 1.791 | 2.113 | 0.939 | 1.109 | 0.852 | 0.249 | −0.012 |
| no topic twins of shared nodes | 0.784 | 0.950 | 1.015 | 1.751 | 2.101 | 0.957 | 1.280 | 0.803 | 0.281 | −0.011 |
| no links (held traces unused) | 0.758 | 0.959 | 0.979 | 1.777 | 2.065 | 0.960 | 1.279 | 0.738 | 0.508 | −0.043 |
| no char-rate topic evidence | 0.765 | 0.955 | 1.011 | 1.762 | 2.081 | 0.960 | 1.400 | 0.798 | 0.282 | +0.031 |
| no alternative readings | 0.755 | 0.966 | 0.997 | 3.761 | 3.801 | 0.957 | 1.173 | 0.790 | 0.272 | −0.012 |
| no self-advance reading (c) | 0.762 | 0.967 | 0.995 | 1.774 | 2.272 | 0.960 | 1.362 | 0.769 | 0.276 | −0.010 |
| no residual-heat gate when full | 0.756 | 0.948 | 0.983 | 1.779 | 2.054 | 0.981 | 2.266 | 0.637 | 0.276 | −0.008 |
| no thaw | 0.756 | 0.948 | 0.983 | 1.779 | 2.054 | 0.962 | 1.382 | 0.778 | 0.276 | −0.008 |
| freeze only used connections | 0.756 | 0.929 | 1.019 | 1.795 | 2.066 | 0.925 | 0.984 | 0.778 | 0.305 | +0.004 |
| no quiet | 0.756 | 0.948 | 0.983 | 1.779 | 2.054 | 0.955 | 1.277 | 0.778 | 0.276 | 0.000 |

What each part buys:
- **Shared assemblies:** composition 4.30 → 0.95. They also improve prediction (0.786 → 0.756) and persistence, but only together with their topic twins.
- **Topic twins of shared nodes:** the largest single gain on tests 1 and 3 (bpc 0.784 → 0.756, topic return 1.015 → 0.983). A generalist keyed by the held context beats both the plain generalist and the specialist.
- **Links:** conflict 0.508 → 0.276, at almost no cost elsewhere (+0.004 on topic return).
- **Char-rate topic evidence:** topic return 1.011 → 0.983, bpc 0.765 → 0.756.
- **Alternative readings:** noise 3.76 → 1.78, unseen noise 3.80 → 2.05. They now *help* composition slightly (0.966 → 0.948); m004's readings cost it 1.48 bits.
- **Residual-heat gate when full:** B 2.27 → 1.28 at a cost of 0.026 survival. This is the main remember-versus-learn lever. Thawing adds a little (B 1.38 → 1.28, survival −0.007).

## What worked

- **The two round-two wins now coexist, and they help each other.** Composition (0.95, 49% below the best counter) and persistence (wins on all seeds) live in one automaton. Prediction is 0.756, better than both parents and within 0.010 of wb-o5. In the final 20% it is the best of any model or baseline.
- **Alternative readings from the automaton's own structure no longer explain novelty away.** Shared structure sits *inside* each reading's prediction, so a novel but well-formed verb is a good literal reading. Every unseen corruption kind in test 9 is beaten.
- **The held cue reaches the completion:** test 10's divergent first character is predicted better than by any counter (0.88 vs 1.06).
- **Resolvable-misfit switching** cut the effective topic lag (median 18 → 11, p90 51 → 34) while raising purity.
- **Holding a gate:** when a generalist speaks is decided at the branch point and held for the next step. This small, local use of held state closed most of the composition gap that the merge first opened.

## What didn't

- **Context conflict still loses to wb-o8** (0.276 vs 0.200). The cue is found, but the rest of the completion is not as sharp as an order-8 counter's. Most links never prove themselves: on seed 1, 444 of 27,330 link nodes are active and the rest are shadows.
- **Noise lost ground to m004** (1.78 vs 1.62 on test 4; 2.05 vs 1.93 on test 9). That is the price of dropping the designed swap. Moved word boundaries are the weakest kind (2.52).
- **Forgetting:** the trade-off moved to a better point but did not get past the curve. The best counter still dominates.
- **Thinking without data:** quiet periods now change structure, but the effect is small and inconsistent in sign.
- **Cost:** about 4.5× m004's runtime and 50k peak units. Most of these are shadow links and topic twins that never switch on.
- **Composition is 0.12 bits behind m003.** The verb's first character costs 3.45 bits against m003's 2.81. Topic- and link-keyed structure makes the specific prediction sharper at the branch point, so the generalist speaks less there.

## Theory claims

- **Supported:**
  - Composition through shared assemblies survives being combined with held state (part three).
  - A held state can carry a cue that decides a later completion (test 10, first character).
  - Slow states can change quickly when a change is resolvable: misfit that some held state's structure would remove moves the state, and noise does not.
  - Recruiting free capacity first, and under scarcity growing only where residual heat is real, gives much better new learning for a small loss in survival.
- **Contradicted or unresolved:**
  - Thinking without data is still not shown.
  - "Nothing is wrong, only out of context" is only partly supported. Links resolve the conflict at the divergent character, but the model then pays at characters a counter gets for free. No patch → context → drop-the-patch sequence was observed.
- **Untested:** curiosity, acting, over-regularisation.

## Surprises

- One step after a novel branch, the specific state is *confidently wrong*. A generalist gated by the current state's own uncertainty is therefore silenced exactly where it is needed. The fix was to hold the gate from the branch point.
- Freezing every outgoing connection of a cooled node beats freezing only the connections it has used. Partial freezing lets cold nodes keep absorbing B's counts: survival falls to 0.925, though B is learnt better (0.98).
- Rarity alone was enough to make held word traces useful for test 10. No cue words were named. I did not check which traces the active links hang from.

## Single most important finding

**Shared assemblies and held state are not two features to put side by side. They work when each keys the other.** Two such links gave the largest gains of the round: a shared assembly with a twin keyed by the held topic state, and a generalist whose say is held from the branch point. Without topic twins, persistence loses again (1.015) and prediction worsens by 0.028. Without the held gate, composition goes back to 1.16 or worse. Adding the two parents side by side at first cost both of their wins. Letting state condition the assemblies, and assemblies feed the state, kept both wins and improved plain prediction over each parent.

## Files

- `src/lib.rs`: the model. Parameters are `p!` constants. `M006="NAME=v,..."` overrides them; it was used for tuning on seed 1 only.
- `examples/diag.rs`: topic purity and switch lag (`DIAG_BELIEF=1` scores the held belief instead of the held state), and forgetting.
- `examples/verbs.rs`: bits by position on held-out verbs (a second argument adds m003 for comparison).
- `examples/conflict.rs`: bits by position on test-10 completions, with or without the quiet period.
