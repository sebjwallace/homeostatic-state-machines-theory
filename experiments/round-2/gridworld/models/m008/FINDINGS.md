# m008: the first acting automaton

m008 settles a grid world without a reward signal, a value function or an optimiser. It acts to lower its energy, and it learns only through what cooling freezes in place. It was tuned on the judge's tuning seeds 101–102 only and is reported on seeds 1–5 (20,000 steps, same judge, same perception as the baselines).

Files:
- `m008.go` is the automaton (about 1,100 lines, std only, deterministic from its seed).
- `tune/` is the tuning harness (seeds 101–102; `-s0/-ns` was also used once for a 20-seed check on seeds 201–220, and `-js` for the ablations on seeds 1–5).
- `xfer/` is diagnostics: the revert test and the persisting-parts ablation.
- `results/` holds the judge output for this run: `RESULTS.md`, `results.json`, and `traces/maze-m008-local-1.jsonl` for the replay page.

Two entries are registered in `agents/registry.go`: `m008` (earned hardness) and `m008-aon` (all-or-nothing freezing, otherwise identical).

Reproduce: `go run ./cmd/judge -agents idle,random,reactive,mapper,qlearn,qlearn-felt,oracle,m008,m008-aon -out models/m008/results -trace maze:m008:local:1 -no-protocol-check` (58 s on 2 cores; m008 alone with all its branches, transfer and memory tests takes 16 s).

## Design, mapped to the README

| README idea | in m008 |
|---|---|
| **States persist** | A held place map. The automaton tracks its own position by dead reckoning from `Moved`, as the mapper does. It keeps, for every cell it has seen, the symbol and **the last heat it felt there**. Under local feel, its internal environment energy is the sum of held heat. A hot place that leaves the view keeps its heat, so only *seeing it settle* lowers internal energy. Under global feel, internal energy is the felt total. |
| **Assemblies / state machine** | Two levels of connection from situation to action. *Context* connections are generalists: local pattern (own cell, 4-neighbours, carried, last outcome, heat bucket and direction) → action. They persist across layouts. *Place* connections are specialists: cell × carried × symbol → action, held per layout. The two weights are summed, so the more specific one wins by magnitude. |
| **Heat from misfit, local** | An own action that raises internal energy heats the connection that did it, and the heat spreads back to the previous step of the episode. An action with no effect, or standing still while there is work, adds heat at the connection and *jam* heat at the place. A write that takes effect but moves no energy adds a little jam at the place. Junction heat sets temperature (softmax τ = τ0 + τH·heat). |
| **Cooling remembers what worked** | When an own write lowers internal energy, the episode's involved connections strengthen and gain hardness +1. The place becomes an anticipated sink, and the cell's symbol gets an association ("this kind of thing settles that kind of heat"). There is no reward trace: an episode entry fades unless a **held state** (something carried) keeps it involved, so *take* is credited when the litter reaches the bin many steps later. Moves are never frozen: they only carried the automaton there. |
| **Which states count as involved** | The last write, plus anything a persisting state still holds. A wider rule (every write in the episode whose effect still persists) made coincidental marks freeze and was dropped. |
| **Earned hardness** | melting point = M0 + MK·√hardness. Above it, a jammed connection loosens (weight and hardness fall). Unresolved jam heat at an anticipated place *accumulates* rather than decays, as sketch 01 suggests, so a hard place can still reach its melting point. Only real settling earns hardness: cooling that only repays heat the automaton created itself (the "debt") is a *repair* and earns nothing. Young, never-hardened context connections unused for 3,000 steps are pruned. |
| **All-or-nothing** (`m008-aon`, also `SetFreezing`) | Anything that hardened once never changes again: no weight change, no melting. |
| **The gap / satisficing** | Felt heat below 0.25 draws no work. A trickle is left for later. |
| **Curiosity as incompleteness** | When nothing hotter pulls, the automaton is drawn to cells seen from ≥2 vantage points but never reached: salient ones fully, the open edge of its map in proportion to vantage count. Held knowledge unchecked for 2,000+ steps becomes faintly incomplete again. A symbol engaged 30 times without ever settling anything becomes boring (noise is boring). Under global feel, where the gap is felt but not located, places not tried lately are the missing piece. |
| **Anticipation** | Places where cooling happened pull again once they have had time to refill (400 steps). An anticipated place seen again with nothing to settle is a misfit at that place, and it melts if it keeps failing. |
| **Don't export heat** | Nothing in the drive rewards moving heat. Repaying self-made heat earns no hardness, so a wipe-and-restore loop has nothing to grow from. |
| **Thinking without data** | `Quiet` only cools structural heat and prunes. No offline reorganisation was attempted. |

Fairness: m008 reads only `View`, `Heat` (local feel), `Felt`, `Carry` and `Moved`, the same perception the baselines get. It ignores `Spec.Env`. It never sees the map, the true total under local feel, or environment internals. Its built-in priors are disclosed here: dead-reckoning map and BFS over it (unknown cells assumed open), as in the mapper baseline; the split between *working* (on felt heat) and *navigating* (towards held pulls); and the rule that only world-changing actions can be frozen.

## Results (seeds 1–5, mean)

### Overview: final-quarter energy scaled (idle = 1, oracle = 0), with learning gain in brackets

| env | reactive (l) | mapper (l) | qlearn (l) | qlearn (g) | **m008 (l)** | **m008 (g)** | m008-aon (l) | m008-aon (g) |
|---|---|---|---|---|---|---|---|---|
| restore | 0.06 | 0.05 | 0.28 (+0.09) | 0.22 (+0.23) | **0.00** (+0.01) | **0.03** (+0.10) | 0.00 (+0.01) | 0.04 (+0.10) |
| fire | 0.44 | 0.28 | 0.72 (+0.18) | 0.86 (+0.06) | **0.03** (+0.18) | **0.30** (+0.10) | 0.03 (+0.19) | 0.28 (+0.16) |
| litter | 1.00 | 1.00 | 0.34 (+0.50) | 0.50 (+0.45) | **0.00** (+0.07) | **0.00** (+0.10) | 0.00 (+0.07) | 0.00 (+0.09) |
| maze | 1.21 | 1.26 | 0.12 (+0.55) | 0.29 (+0.30) | **0.04** (+0.08) | **0.04** (+0.63) | 0.03 (+0.08) | 0.08 (+0.52) |
| wells | 0.33 | 0.10 | 0.80 (+0.05) | 0.88 (+0.01) | 0.39 (−0.17) | 0.39 (−0.18) | 0.18 (+0.08) | 0.15 (+0.05) |

m008 beats Q-learning in all ten environment × feel cells. It also beats every hand-written baseline everywhere except wells, where the mapper (0.10) wins clearly. The small learning gains under local feel are not a lack of learning. m008 learns most of what it needs within the first quarter: restore is first settled at step 80, litter at 348, maze at 1,106 (qlearn at 7,612).

**Is it learnt or built in?** As a control, the same automaton was run with learning off from step 0 (same seeds, `NoLearn`). It scored restore 0.07 / 0.75, fire 0.60 / 0.86, litter 0.95 / 1.00, maze 1.00 / 1.61, wells 0.69 / 0.94 (local / global). The navigation priors alone are roughly a reactive agent. Everything below that is learnt from cooling.

### Per environment

| env / feel | agent | final-quarter E | first settle | resolve early → late | transfer fresh → carried (ratio) | learning off / after quiet (vs carry on) |
|---|---|---|---|---|---|---|
| restore l | qlearn | 3.42 | 2,356 | 97 → 97 | 4.53 → 5.93 (1.31) | 9.65 / 3.88 (3.88) |
| restore l | **m008** | **0.12** | 80 | 10 → 10 | 0.23 → 0.26 (1.12) | 0.12 / 0.12 (0.12) |
| restore g | qlearn | 2.73 | 3,932 | 112 → 62 | 6.42 → 4.98 (0.78) | 9.90 / 3.11 (3.11) |
| restore g | **m008** | **0.41** | 977 | 54 → 32 | 1.37 → 0.82 (0.60) | 0.40 / 0.44 (0.41) |
| fire l | mapper | 4.04 | 648 | 107 → 126 | 4.23 → 4.56 (1.08) | – |
| fire l | qlearn | 9.96 | 3,518 | 401 → 305 | 10.92 → 9.11 (0.83) | 9.80 / 8.67 (8.67) |
| fire l | **m008** | **0.50** | 1,884 | 65 → 26 | 2.20 → 1.96 (0.89) | 0.53 / 0.55 (0.55) |
| fire g | qlearn | 11.91 | never | 403 → 371 | 11.45 → 11.30 (0.99) | 10.14 / 10.13 (10.13) |
| fire g | **m008** | **4.25** | 3,198 | 162 → 121 | 5.66 → 3.39 (0.60) | 4.23 / 4.01 (3.94) |
| litter l | qlearn | 10.10 | never | 937 → 806 | 7.68 → 5.89 (0.77) | 13.03 / 7.82 (7.82) |
| litter l | **m008** | **0.10** | 348 | 78 → 34 | 0.15 → 0.20 (1.31) | 0.13 / 0.12 (0.15) |
| litter g | qlearn | 14.97 | never | 986 → 817 | 7.60 → 7.77 (1.02) | 19.32 / 11.36 (11.36) |
| litter g | **m008** | **0.12** | 1,122 | 173 → 40 | 1.38 → 0.29 (0.21) | 0.13 / 0.16 (0.13) |
| maze l | qlearn | 5.52 | 7,612 | 1500 → 523 | 32.06 → 35.51 (1.11) | 5.16 / 4.78 (4.78) |
| maze l | **m008** | **2.06** | 1,106 | 191 → 699 | 6.40 → 5.62 (0.88) | 2.73 / 2.21 (2.03) |
| maze g | qlearn | 13.39 | never | 1500 → 392 | 27.39 → 27.44 (1.00) | 12.90 / 9.34 (9.34) |
| maze g | **m008** | **2.34** | 4,768 | 1456 → 1500 | 33.16 → 23.79 (0.72) | 2.40 / 2.69 (2.46) |
| wells l | mapper | **1.62** | 459 | 101 → 110 | 2.30 → 1.96 (0.85) | – |
| wells l | qlearn | 9.28 | never | 1057 → 712 | 10.49 → 9.95 (0.95) | 10.84 / 9.70 (9.70) |
| wells l | m008 | 4.89 | 207 | 1385 → 1500 | 2.23 → 4.50 (2.02) | 3.94 / 3.31 (4.35) |
| wells g | qlearn | 10.21 | never | 1099 → 915 | 10.89 → 10.17 (0.93) | 11.26 / 9.84 (9.84) |
| wells g | m008 | 4.89 | 924 | 223 → 242 | 3.03 → 3.57 (1.18) | 5.16 / 4.87 (4.84) |

Notes:
- **What was learnt holds without further change.** With learning switched off after the run, m008 stays where it was (e.g. restore global 0.40 vs 0.41). Q-learning collapses towards idle once its exploration stops (9.90 vs 3.11).
- **Transfer is good under global feel** (litter 0.21, restore 0.60, fire 0.60, maze 0.72). It is neutral or slightly worse under local feel, where a fresh m008 is already near the floor (litter 0.15 → 0.20 is a few hundredths of a unit). Wells is the exception (below).
- **Maze resolve time rises under local feel (191 → 699)** even though final-quarter energy is low and the trail is re-joined after each of about 39 washouts per run. I did not isolate why late repairs got slower; treat it as unexplained.

### Closed-world accounting (totals per run)

| env / feel | agent | resolved | created | displaced | felt relief | **look-away relief** |
|---|---|---|---|---|---|---|
| restore l | qlearn | 409 | 70 | 0 | 529 | 122 |
| restore l | m008 | 235 | 0 | 0 | 236 | **2** |
| restore g | qlearn | 485 | **138** | 0 | 479 | – |
| restore g | m008 | 273 | **4** | 0 | 271 | – |
| fire l | qlearn | 220 | 0 | 0 | 2,529 | 2,180 |
| fire l | m008 | 482 | 0 | 0 | 714 | **235** |
| litter l | qlearn | 48 | 0 | 2,306 | 3,551 | 3,504 |
| litter l | qlearn-felt | 1 | 0 | 460 | 646 | 646 |
| litter l | m008 | 67 | 0 | 768 | 83 | **16** |
| litter g | m008 | 66 | 0 | 825 | 66 | – |
| maze l | qlearn | 949 | 901 | 4,876 | 2,582 | 1,544 |
| maze l | m008 | 270 | 99 | 1,850 | 1,408 | **1,203** |
| maze g | qlearn | 1,051 | 1,014 | 3,286 | 1,051 | – |
| maze g | m008 | 184 | 132 | 247 | 184 | – |
| wells l | qlearn | 113 | 0 | 0 | 881 | 768 |
| wells l | m008 | 277 | 0 | 0 | 300 | **28** |

- **Litter, the closed-world test.** m008 bins every piece that appears (67 spawned, 67 taken, 67 binned, 0 dropped elsewhere). Its felt relief (83) is almost exactly what it resolved (67) plus a little look-away (16). Q-learning feels 3,551 units of relief for 48 resolved. Displacement for m008 (768) is litter carried to the bin: the ledger counts one unit per step while a piece is held.
- **It does not create work for itself.** Under global feel on restore, Q-learning learns to wipe settled plinths and restore them (138 created). m008 wiped 4. Repaying its own heat earns no hardness, so the loop never forms.
- **Maze.** m008 churns far less than Q-learning: it created 99 against 270 resolved, so net 171. Q-learning created 901 against 949 resolved, net 48. The created part is stray marks and trail it cleared itself.
- **Maze look-away (1,203)** is the ledger counting felt drops when the agent steps away from a tip it has just extended. The automaton does not learn from these drops: its internal relief on moves was 4.5 per run, because held heat stays put.
- **Export.** m008 exports nothing in restore, fire, litter or wells (created = 0 or 4). Its only created energy is in the maze, and it is its own trail.

### Does holding state stop it faking the reading?

The judge found that a learner rewarded by a drop in felt energy learns to walk away. Two ablations test whether held state is what prevents this. Both were run on the reported seeds with the judge's seeding, local feel, no other change.
- `NoHold`: internal energy is just what is felt now.
- `CoolMoves`: a move made while working can be frozen by cooling, like any write.

| local feel: scaled E / look-away | default | NoHold | CoolMoves (held state, moves creditable) | NoHold + CoolMoves |
|---|---|---|---|---|
| litter | 0.00 / 16 | 0.00 / 16 | 0.00 / 86 | **0.40 / 9,102** |
| maze | 0.04 / 1,203 | 0.04 / 1,203 | 0.03 / 526 | **0.19 / 14,954** |
| fire | 0.03 / 235 | 0.03 / 235 | 0.04 / 444 | **0.24 / 2,905** |
| restore | 0.00 / 2 | 0.00 / 2 | 0.00 / 1 | 0.00 / 1 |

- In the default design, `NoHold` changes nothing. The protection there comes from a blunter rule: moves are never frozen, so walking away can't be learnt at all.
- Once moves *can* be learnt, the theory's distinction is exactly what separates the outcomes. With the held state, look-away stays small (86 on litter) and the world is still settled. Without it, the automaton learns to look away and drifts towards qlearn-felt's failure: litter goes from 0.00 to 0.40 of idle, and look-away grows a hundredfold.
- A felt drop that comes from a hot place leaving the view is faking the reading. A held energy that only falls when the place is seen to settle can only be lowered by resolving it.

### Earned hardness vs all-or-nothing

- **Reported seeds.** The two rules are indistinguishable in four environments (overview table). On wells, all-or-nothing looks much better (0.18 / 0.15 vs 0.39 / 0.39), but per-seed spread there is huge (all-or-nothing local final-quarter E ranges 0.6–6.6).
- **Seeds 201–220.** These are neither tuning nor reporting seeds, used once as a check with no parameter changed. Wells: earned 0.37 / 0.27, all-or-nothing 0.42 / 0.19, **no freezing at all** 0.37 / 0.32. Fire and maze were the same to two decimals under all three rules.
- **The sketch's question** (`xfer -mode revert`, tuning seeds): run layout A, then B, then back to A. All three rules come back to A about equally. The largest gaps go both ways: all-or-nothing was better on fire local (0.96 vs 2.07) and wells local (1.58 vs 3.04), and worse on restore global (0.78 vs 0.57).

**Verdict: in these worlds the freezing rule does not matter.**
- Jams are rare. Heat events per run are about 0 in restore, fire, litter and wells, and about 100 only in the maze. All-or-nothing refused a melt only 13 (maze local) to 72 (maze global) times per run.
- New situations are mostly met by **growth, not melting**: a new local context makes a new young connection.
- Hardness concentrates on a handful of connections that settle the same thing hundreds of times (restore: 6 connections, mean hardness 36; wells: 8, mean 127). For those, melting is never in question.
- Sketch 01 warned that the useful hardness range is set by how hot a jam can get. Here jams rarely get hot at all, so rung 20 is still waiting for an environment where one learnt connection becomes wrong.

### Does it use its own marks?

**No.**
- **Wells, local feel:** it writes about 3 marks per run, by accident while working, and doesn't read them (an old own mark is in view 6% of the time). Erasing them or keeping them for a fresh agent changes nothing beyond noise (carry on 4.35, erased 4.21, fresh + marks 4.74, fresh − marks 4.74).
- **Wells, global feel:** it writes 906 marks, but as a side effect. With the gap felt but not located, it tries writes at untried places. Those marks then become clutter: a fresh agent does *worse* with them kept (4.21) than erased (2.89), probably because a salient symbol it has not yet found boring pulls it.
- **Maze:** the trail of marks is the work product, not a memory it consults. Its memory is the held map, as the mapper's is.

So the external-memory rung still has no taker. Nothing in m008 makes writing a mark *for later* an act that cools anything now. The theory would need a write to resolve an incompleteness, such as a place it expects to have to find again, and m008 has no such expectation.

### Wells: the clear failure

m008 finds and clears springs early (first settle at step 207), but it gets *worse* within a run (learning gain −0.17) and after transfer (ratio 2.02). The mapper, with no learning, reaches 0.10.

A diagnosis was done on reported seeds 3 and 4 *after* the run, with no change made. On seed 3, forgetting the context connections before transfer restores fresh-level performance (5.90 → 1.11). On seed 4 it does not (4.97 → 4.99). Watching tuning seeds, anticipated sinks keep pulling it to springs that have relocated, while curiosity and anticipation compete for the same quiet time. I did not isolate the cause, and tuning on 101–102 never fixed it.

## What the theory got right, and what it didn't

**Right**
- **Cooling can do the remembering without a reward trace,** provided involvement is held by state, not by recency. The take → carry → put credit in litter is the clearest case: the carried object *is* the persisting state that keeps the take involved. It solved litter under both feels, where tabular Q(λ) with a shaped reward reaches 0.34 / 0.50.
- **Faking the reading vs resolving it is a real, measurable distinction,** and held state is a mechanism that separates them (ablation above).
- **Heat that is the automaton's own doing is not settling.** Treating repair of self-made heat as earning no hardness removed the wipe-and-restore loop Q-learning falls into. This is "don't export heat", turned inward.
- **Curiosity needs some knowledge first.** Counting the open edge of the held map as incomplete fixed a failure where the automaton never explored past its first area (restore local, tuning seed 102). Plain novelty was not needed.
- **Energy not flowing is misfit.** See the second surprise below.
- **Satisficing matters.** Without a "good enough" threshold the automaton worked forever on trickles (wells silt at 0.005) and never went round.

**Wrong, or not shown**
- **"No reward" is thinner than it sounds here.** Cooling is an event that strengthens what was involved. The size of the drop does not matter (beyond a threshold and the debt), and there is no value or bootstrapping. But functionally it is close to a sign-only reinforcement of the last world-changing act. The real differences from Q-learning are *what* gets credited (persisting states, not a decaying trace of moves) and *when* (only real settling, not repair). That is where the wins come from. Calling it "no reward" is fair only in that narrow sense.
- **Hardness was not tested in any meaningful way** (see above). These environments do not produce jams.
- **Thinking without data:** `Quiet` does nothing useful. The wells "after quiet" improvement (4.35 → 3.31) is most likely a clock effect: two thousand silent steps make every anticipated place due at once. It is not reorganisation.
- **External memory:** not used (see above).
- **Composition / generalisation** is only partly visible. Transfer is good under global feel, but much of m008's competence is the held map, which is per-layout by design.

## Surprises

- **How much of the problem was credit, not search.** Restricting freezing to world-changing actions took fire local from 1.27 to 0.68 of idle, and restore global from 1.00 to 0.01, in one step (tuning seeds).
- **Under global feel, an effective write that moves no energy was invisible.** m008 cleared an already-clear spring 4,000 times in a row. Feeling "nothing flowed" as a mild jam at the place (`FlatJam`) took wells global from 0.72 to 0.11 on tuning seeds. "A machine that repairs itself" says energy not flowing *is* the misfit, and it had to be implemented literally.
- **Place connections keyed by cell alone made it put litter back where it found it.** Keying them by what is carried and what is on the cell fixed it: the same place, in a different state, is a different situation.
- **Freezing matters so little that m008 with freezing off is as good as either rule.**

## Next steps

1. **An environment that jams.** One learnt response must become wrong (e.g. bins that swap roles, or a spring that must be cleared with a different action after a while), then revert. That is what rung 20 needs; here the freezing rule is not exercised.
2. **Fix wells.** Make anticipated places compete with curiosity on the same heat scale, and make a relocated spring's place misfit strong enough to release it. Check against the mapper, which has the same map and no learning.
3. **Give marks a job.** Let an expectation of returning ("I will need to find this again") be an incompleteness that a mark can resolve now. Then test rung 15 again.
4. **Thinking without data.** In quiet periods, replay held-map heat through context connections to resolve conflicts between specialists and generalists, and re-run the quiet branch.
5. **Reduce priors.** The work/navigate split and "only writes freeze" are hand-made. The next model should let held state alone protect against look-away (the `CoolMoves` column suggests it can) and drop the move rule.

## Honesty notes

- All defaults were chosen on seeds 101–102 with `models/m008/tune`. The first and final reported runs gave identical numbers. Between them only debug code was removed and default-off ablation switches were added; no default changed after first seeing seeds 1–5.
- After the reported run, the following were run on seeds 1–5, and nothing was tuned from them:
  - the ablations and the learning-off control;
  - a wells diagnosis on layout seed 1;
  - a transfer diagnosis on seeds 3–4.
- The 20-seed freezing check used seeds 201–220, which are neither tuning nor reporting seeds.
- `results/RESULTS.md` is the judge's standard report. Its built-in overview table has fixed baseline columns, so the m008 rows appear in the per-environment tables there and in the overview above.
