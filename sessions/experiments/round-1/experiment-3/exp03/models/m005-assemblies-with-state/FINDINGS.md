# m005-assemblies-with-state: findings

m003's shared assemblies, plus held state, conflict-driven binding and value-aware melting. Rust, std only, online and single pass, local rules. The harness determinism check passes on every seed. All tuning was done on seed 1. Seeds 2 and 3 were used only for the final run and for the ablations, which were run after the defaults were fixed.

Reproduce: `cargo run --release -p harness --bin run -- --model m005` (three seeds, all 16 baselines, about 15 s wall on 2 threads; m005 takes about 3.2 s per seed). Parameters can be overridden with `M005="name=v,..."`; this was used for seed-1 tuning and for the ablations. The debug tools in `examples/` (`conflict`, `topic`, `forget`, `probe`) read texts written by `--dump-corpus`. The `conflict` probe lists frame words for its own scoring only; the model never sees them.

## What was added to m003, mapped to the README

| README idea | m005 mechanism |
|---|---|
| States persist; a slow machine's state shapes fast ones | **Held chunks.** A chunker closes a chunk whenever the automaton's own most specific state is uncertain about what comes next (entropy > 1 bit): a branch point of its own structure. The slow machine then holds the fast machine's state at that point (its deepest context cell, 3 to 6 characters). Held chunks never decay. An unproven chunk lets go only when it is displaced from a 24-slot scratch memory. |
| Internal conflict between assemblies | **Conflict traces.** The deepest established context cell, while uncertain (entropy > 0.5 bits), keeps traces of the character that arrived together with the chunks held at that moment (the last 48). Disagreeing traces are internal conflict. |
| "Nothing is wrong, only out of context" | **Held-context bindings ("twins").** Every 8 traces, or at once on surprise (> 1 bit), the cell asks whether splitting its traces on one currently held chunk would compress them. This is measured as the drop in sequential code length, net of log2 of the number of candidates. If so, a twin cell is recruited from free capacity: the cell's outputs keyed on that held chunk, seeded from the traces. When the chunk is held again, the twin speaks just above its cell. Twins keep a running gain over their parent. A twin that does not pay stops speaking, and melts. |
| Slow machine that changes fast when the change is resolvable | **Release on resolvable misfit.** When a speaking twin misfits by more than 1 bit relative to its parent, the slow machine drops the held state that twin is keyed on, at once, and the twin does not learn from it. Misfit that a binding can attribute is traced to its source. Scattered misfit at unbound cells changes nothing. |
| Quiet periods settle internal conflict | `quiet()`: m003's partner search, then each conflicted cell (a) melts patches, meaning bindings whose chunk no longer compresses its traces; (b) tries to bind to any chunk its traces remember, at a naming cost of 8 bits. |
| Residual heat recruits free capacity first; melting takes the least valuable unfrozen structure; idle frozen structure thaws | Twins and cells are recruited from free capacity. Under scarcity, the melt victim is the lowest-value sampled leaf. Value = effective freeze + 0.3·recency + log(1 + visits × (1 − overlap with the parent's expectation))/4 − depth/D. Effective freeze decays with idle time (half-life 30,000 characters). `resist` is 0.2 (m003: 0.3). |
| Specialist/generalist referee | As m003, but shared cells are gated by the entropy of the deepest context cell with at least 4 observations (m003 used >0). |

Freezing lives on connections only (incoming transition, outputs, memberships). `set_freezing` is kept. Nothing in the model knows corruption shapes, cue words, frames or topics.

### Built but off by default
- **Topic machine** (`topic_on=1`): up to 4 states over closed chunks, with fast switching on a familiar chunk that another state explains 6+ bits better, leaky pressure, and recruitment on excess surprise. Its state enters the held set, so twins can bind to it. On seed 1 it either never recruited a second state, or it recruited 4 and switched hundreds to thousands of times (purity 0.4–0.6). In a narrow window it made 2–3 states with purity above 0.93 that did not follow the corpus topics. Three seeds with it on: test 3 1.0389 vs 1.0390, test 10 0.269 vs 0.278. Off.
- **Rival states** (`rival_on`, `bound_on`): a chunk whose binding competes at some cell with another held chunk drops the other. Worse on seed 1 (0.33 vs 0.26). Off.
- **Deeper context D = 7–8**: tests 1, 3 and 10 improved (seed 1, D=8: 0.746 / 0.98 / 0.188) but **composition got worse** (0.836 → 0.904): longer specialists are confident about seen nouns and shadow the shared cells. Proof gates on deep cells recovered composition only by giving the gains back. D = 6 was kept.

## Results (three-seed means; lower is better except survival)

| test | headline | best baseline | m003 | m004 | **m005** |
|---|---|---|---|---|---|
| 1 Prediction | bpc_full | 0.746 (wb-o5) | 0.764 | 0.779 | **0.767** (loses by 0.021) |
| 2 Composition | verb_bpc | 1.863 (ppmc-o2) | 0.826 | 4.079 | **0.778** (wins, 58% lower) |
| 3 Persistence | topic_bpc_boundary | 1.004 (wb-o6) | 1.036 | 0.987 | **1.039** (loses) |
| 4 Noise | bpc_10 | 2.389 (ppmc-o6) | 2.383 | 1.617 | **2.381** (tie) |
| 5 Forgetting | survival, freeze on | 0.981 (ppmc-o4) | 0.941 | 0.979 | **0.948** (loses) |
| 6 Confusion | energy order | – | ordered | ordered | **ordered, all seeds** |
| 7 Thinking | diff | – | +0.0002 | 0.000 | **+0.0004** (none) |
| 9 Unseen noise | bpc_10 | 2.414 (ppmc-o6) | 2.410 | 1.927 | **2.407** (tie) |
| 10 Context conflict | conflict_bpc | 0.200 (wb-o8) | 0.364 | 0.479 | **0.278** (loses; 24% better than m003) |

Per seed, m005: bpc_full 0.758/0.772/0.769. verb_bpc 0.838/0.769/0.728. topic boundary 1.025/1.021/1.071. bpc_10 2.375/2.461/2.307. survival 0.958/0.932/0.953. unseen bpc_10 2.476/2.332/2.412. conflict_bpc 0.223/0.289/0.321.

**Test 2.** 0.778 vs m003 0.826; verb_first 2.62 vs 2.81. The gain comes from the `gate_n=4` change; with m003's gate it is 0.828. Held state off: 0.777. So **held state did not hurt composition**. Control verbs: 0.424 vs m003 0.420.

**Test 10.** First completion character 0.898 vs wb-o8 1.060 and m003 1.277: **m005 beats every counter on the character the context decides.** It loses overall because the later characters ("she fed the c" → "ows") are free for an 8-character counter and not for a 6-character context. Ablations: held state off 0.363; release-on-misfit off 0.360. Release carries the whole gain. On seed 1, a first character cost 0.23–0.44 bits when a binding was active and 1.2–1.5 bits when none was. About a third of frames had no binding active.

**Test 3.** No gain. Held chunks span a few hundred characters, and nothing holds topic. The topic machine did not work (see above).

**Test 5, freezing on vs off:**

| | a_before | a_after | survival | b_final20 |
|---|---|---|---|---|
| m005 on | 0.783 | 0.996 | **0.948** | 0.952 |
| m005 off | 0.810 | 1.562 | **0.814** | 0.813 |
| m003 on | 0.848 | 1.083 | 0.941 | 1.025 |
| m003 off | 0.947 | 3.033 | 0.467 | 0.870 |
| ppmc-o4 | 0.770 | 0.847 | 0.981 | 0.926 |

Value-aware melting shifts the whole trade-off. With freezing on, A is learnt better, survives slightly better, and B is learnt better. With freezing off, survival goes from 0.467 to 0.814: melting the least informative structure first protects most of A on its own. Freezing adds +0.13 survival at a cost of 0.14 bpc on B. Ablation without value melting and thaw: on 0.940 / B 1.040, off 0.464. Thaw alone: survival +0.005 without it, B 0.04 worse. At these stream lengths thaw is a minor lever.

**Tests 4, 6, 9.** As m003. Heat-loosening ties the best counter on both seen and unseen corruption shapes; nothing is built in. Energy: familiar 0.21 < held-out pairs 0.42 < unseen words < random on every seed.

**Test 7 / quiet in test 10.** Test 7 diff +0.0004. Test 10 quiet_diff −0.003 (+0.003 with quiet binding and pruning off, so about −0.006 attributable to quiet). That is within noise: seed 1 alone was +0.005. A low naming cost made hundreds of quiet bindings, and they hurt (0.30 vs 0.22 on seed 1). No reliable thinking effect. Conflicts that held context can resolve get resolved while reading, because surprise triggers the search at once. What remains is a coverage failure at prediction time, which settling structure does not fix.

**Cost.** About 3.2 s per seed (m003 about 1.5 s). Peak 7,208 units (m003 6,178), of which about 1,100 are twins.

## Declared counting-equivalent parts
1–5 as m003:
1. Outputs are counts.
2. A depth-6 suffix trie, about interpolated WB-6.
3. Witten–Bell escape confidence, heat-scaled.
4. Shared cells are class-based backoff count tables.
5. The heat-scaled uniform floor is smoothing.

New:

6. **Twins are count tables over (context suffix, held chunk)**, with the same WB confidence: counting with one extra conditioning variable. What is not counting is which pairs exist: a pair is created only when the cell's own conflict traces compress on that chunk, and it survives only while it pays.
7. **The binding and release tests are MDL / log-ratio statistics over counts** (KT sequential code length).
8. **A held chunk is a context cell at an earlier branch point**, so holding it is a skip-context over recent branch points. A counter with such skip-grams would be close. What is not counting is selection by the automaton's own branch points and its local conflict.
9. The topic machine (off) uses additive smoothing over chunk counts.

## Theory claims
- **Supported:** "nothing is wrong, only out of context". A cell's contradictory experiences find the held context that resolves them, by local compression, with no cues given. "Melt the least valuable first" protects memory even without freezing.
- **Supported, refined:** slow state needs a fast exit. The same local quantity that decides when structure grows (misfit beyond what the parent explains) decides when a held state lets go.
- **Not supported:** thinking without data (no reliable effect).
- **Cost the theory doesn't mention:** a deeper fast context and composition fight.

## Single most important finding
**A held state is useful only if it can be released by the misfit of the structure that depends on it.** Bindings to held context without release were worth nothing (test 10: 0.360 vs 0.363 with no held state). With release, they cut conflict bpc by 24% and beat every counter on the deciding character. The slow machine moves at once when a dependent binding fails (a resolvable change, traced to its source) and holds otherwise.

## Next steps
1. Coverage: let an unbound conflicted cell query its traces against the held chunks at prediction time.
2. Give twins a one-step successor so held context carries into later completion characters.
3. Topic as a held distribution built from bound chunks only.
4. Gate deep specialists by their gain over the shared cell, to reconcile depth with composition.
