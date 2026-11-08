# Experiment catalogue

*Every experiment so far: the question, the key numbers and the lesson. Full details are in each folder's notes.*

How to read the numbers:
- All results are seeded and reproducible. Settings were fixed before running unless marked **post hoc**.
- Text-stream results are **prequential bits per character (bpc)**: each character is predicted before it is learnt from. Lower is better.
- "Chance" is given where it matters. Samples are small, so treat differences of a few points as noise.

---

## Harness rounds (text stream)

| round | models | where | key result | lesson |
|---|---|---|---|---|
| 1 | **m001** (distributed assemblies), **m002** (columnar, a column per character) | `EXPERIMENT-01.md`, `models/` | m002: 0.854 bpc against 0.990 for its order-3 counter, but tied with order-6. Neither beats good counting. m002 resolves shared middles of 6–8 characters. | Residual heat recruiting fresh capacity works as a local rule (without it, m001 falls to 2.615 bpc). Local heat can't tell resolvable misfit from noise. |
| 2 | **m003** (shared assemblies), **m004** (held state) | `EXPERIMENT-02.md`, `exp02/` | m003: **56% fewer bits** than the best counter on verbs in unseen combinations. m004: big noise win. Freezing off: survival 0.94 → 0.47. | Composition through shared cells is the first thing counting can't match. Freezing finally protects something. Specialists and generalists need a referee. |
| 3 | **m005** (assemblies + releasable state), **m006** (state + assemblies) | `EXPERIMENT-03.md`, `exp03/` | m006 beats the best counter on composition (49% fewer bits), persistence, noise and unseen noise at once. m005: context-conflict bpc 0.36 → 0.28 once held state can be released. | Wins combine when each part is conditioned on the other. **A held state is only useful if it can be released.** Quiet periods still do nothing. |
| 4 | **go-m006** (bit-identical Go port), **go-m007** (episodes + replay) | `exp04/`, `exp04/external/` | go-m007: prediction 0.742 against 0.746 for the best counter. **Context conflict 0.197**, the first to beat order-8 counting (0.200). **Test 11 (join after quiet): 0.150** against 1.002 with no quiet period, 0.709 for go-m006 and 0.726 for the best counter. Right place ranked top 97% (14% without quiet). | Episodes as ordinary nodes in one substrate. Hardness separates semantic from episodic. Quiet-period replay of warm structure forms the join. |

Round 3, three-seed means (lower is better except survival):

| test | best counter | m003 | m004 | m005 | m006 |
|---|---|---|---|---|---|
| 1 prediction | **0.746** | 0.764 | 0.779 | 0.767 | 0.756 |
| 2 composition | 1.863 | 0.826 | 4.079 | **0.778** | 0.948 |
| 3 persistence | 1.004 | 1.036 | 0.987 | 1.039 | **0.983** |
| 4 noise 10% | 2.389 | 2.383 | **1.617** | 2.381 | 1.779 |
| 9 unseen noise 10% | 2.414 | 2.410 | **1.927** | 2.407 | 2.054 |
| 10 context conflict | **0.200** | 0.364 | 0.479 | 0.278 | 0.276 |

## Gridworld (acting)

`gridworld/`. There are five environments, each with its own source of unease and its own disturbances:
- **restore**: faded plinths;
- **fire**: spreading fire;
- **litter**: a closed world in which only a bin resolves litter;
- **maze**: a path of marks joining entrance to exit;
- **wells**: springs that silt up, which tests memory.

| model | result | lesson |
|---|---|---|
| **m008** (`gridworld/models/m008/`) | No reward, value function or optimiser. **Beats Q-learning in all 10 environment × feel cells.** Final-quarter scaled energy (0 = oracle, 1 = idle) under local feel: restore 0.00, fire 0.03, litter 0.00, maze 0.04, wells 0.39 (the mapper wins wells with 0.10). First maze settle at step 1,106, against 7,612 for Q-learning. With learning off it is roughly a reactive agent, so the gains are learnt. | Cooling that remembers, plus held states for credit, plus earned hardness and curiosity as incompleteness, makes a working acting automaton. Memory over long absences (wells) is the weak spot. |

## Sketches

Each sketch lives in `sketches/NN-name/` with its code and `NOTE.md`. Most run in seconds to a minute with `node sketch.js`.

### Mechanics of heat and hardness

| # | question | key result | lesson |
|---|---|---|---|
| 01 jammed gear | How does each freezing rule repair one wrong connection, and recover when the world reverts? | Soft jams reset in place in 33–41 steps. Hard ones get patched, taking 2–4× longer. Permanent freezing kept the old edge in 60/60 runs but was slowest to recover (217–369 steps); earned hardness recovered in 33–57. | Hard old structure plus soft new patches both keeps and recovers. Keeping a memory ≠ being able to reach it. |
| 02 state-machine world | Do the automaton and a world of traffic lights, both as state machines, settle together? | The framing works. The learner ends worse than doing nothing (16 against 5.5), and Q-learning gets 2.5. | Delayed credit is where heat alone breaks. Which state change counts as an action needs defining. |
| 03 three greens | Can a homeostat learn which buttons restore three lights, re-adapt and remember? | Earned hardness recovers in about 2.0 steps (the oracle also takes 2.0) and keeps all-green 94% of the time (oracle 97%). All-or-nothing freezing never adapts. | Accumulating unresolved heat lets any hardness melt eventually. Memory of an old mapping is weak and anchors adaptation. |

### Episodes, memory and the ledger

| # | question | key result | lesson |
|---|---|---|---|
| 04 episodes and knowledge | Are episodic and semantic memory one structure at different hardnesses? | Fading trace: recall 73/53/30% at 25/100/300 episodes. **C2 (coordinated machines): 97/95/90%**, generalisation 100%, quiet joining clean. | [Finding 01](../findings/01-coordinated-state-machines-for-sequence-memory.md). Held states, not fading traces. Hardness splits cleanly once episode codes stop overlapping. |
| 05 days and stories | Without episode boundaries, just held world states, do days stay distinct? | One-step recall 92–100%. With a time-of-day state the ceiling reaches 99–100%. Whole-day reconstruction stays weak (34% perfect at 50 days). | Context can be sufficient and replay still fail: the remaining failures are interference. |
| 06 stress test | Does it hold up at scale? | Perfect days 43 → 35 → 14% at 50 → 200 → 1,000 days. Place rules transfer at 62–82%. | Soft single-use links lose to the summed vote of many shared links. |
| 07 specificity first | Does letting the most specific link answer fix it? | Better at 5–20 days, worse by 200 (32 against 35%) and at 1,000 (5 against 14%). Generalisation drops from 62–72% to 20%. | Over-specific links pre-empt general knowledge. |
| 08 what is remembered | Is forgetting principled? | Surprising events kept at 99–100%. Events predicted at the time but wrong by general knowledge: 69–71%. | Good-enough memory holds for surprises. *Predicted at the time ≠ predictable from knowledge.* |
| 09 ledger | How small can a dumb store be while reconstruction stays near-perfect? | Writing rows the automaton **got right**, about 40% of rows: 94–96% perfect days. A random ledger of the same size: 56–76%. Writing surprises adds 0–2 points. | Write what the automaton will lose, which is what it predicted, not what surprised it. |

### Joins and retrieval

| # | question | key result | lesson |
|---|---|---|---|
| 10 earned joins | Does replaying ledger rows form "key in kitchen"? | No: 22–24% in every condition, which is the commonest-room bias. | Structural: nothing holds "key" when "kitchen" arrives. |
| 11 subject + chained replay | Do a held subject and content-following replay help? | 35% (from 23%). | First movement. The subject rule was hand-written. |
| 12 settling retrieval | Can the automaton choose the next row by settling? | Worse: 7–10%. | **Settling completes the current pattern; it doesn't hop.** |
| 13 question-driven | Is an open question heat that drives retrieval? | Pre-registered trial: 65% joins, and 0% in a reversed world. Whole-sentence trial (**post hoc**): **98% joins** (forward), 97% (reversed), **0% confabulation** on half-chains. Has a browser viewer. | Gap heat gives honest stop/accept control. Choosing by heat ≈ random for joins in a sparse world. |
| 14 stress: distractors and chains | Does it survive distractors and 3–4 links? | Joins collapse to about 3–30% with distractors; 60–100% confident wrong answers. Direct questions stay at 80–90%. | Gap heat is a stop test, not a search heuristic. Something must say *which relation* to follow. |
| 15 learning what "in" means | Can trust in a relation be learnt from confirmations? | 100% joins with ≤2 distractors after about 12 chains, but the trust per kind is at chance. | Self-reinforcing loop: it tracks traffic, not meaning. |
| 16 notes and reheating | Does reheating on contradiction break the lock-in? | It stops lock-in only by melting everything. | Credit on mixed paths can't separate relations. Needs contrast. |

### Kinds, columns and identity

| # | question | key result | lesson |
|---|---|---|---|
| 17 invariant structure | Can "X in Y" be learnt as a template, and transitivity as a rule? | The template hardens (100% hard) and pairings stay soft. Unseen containers go to the wrong kind 67% of the time. Transitivity 0%. | Random codes give no kinds. A broken template isn't reheated. |
| 18 class cells | Do m003's shared cells give kinds here? | Port of the mechanism into the sketch world. | Background for 19–20. |
| 19 learnt overlapping codes | Do learnt shared codes give kinds? | New containers → room 33% → **80%**. Episode recall 98% → **50%**. | Direct trade-off: generalise or remember. |
| 20 columns (a–d) | Columns of cells: meaning in columns, identity in cells? | Cell chosen by context: fails (recall 52%). **Cell per assembly: kind transfer 90–100%, recall 88%, facts 98%.** Learnt settling 87/90/84%. Cue pushing only on round 1: noisy cues clean up 66–69% (against 0%). | [Finding 02](../findings/02-columns-meaning-and-identity.md). Both levels have to be read. Combinations matter for slot-specific kind transfer. |
| 21 rules over kinds | Does transitivity appear on columns? | As a rule, 0%. A specific X→Z link exists: about 3× chance with "key" held as topic. A role-agnostic code answers 82–87%, but overwrites episodes (recall 91 → 26%). | Transitivity is a route through Y's identity, not a link between kinds. Re-entry is needed. |

### State machines on columns

| # | question | key result | lesson |
|---|---|---|---|
| 22 state machines on columns | Can column assemblies be states of learning machines? Which sharing works? | Private machines and the kinds-shared split work: local repair with zero collateral misfit, and fork recall 93–95% (33% without context). Full sharing fails everything (279 collateral misfits). Rates emerged in the memory test. | Kinds can be shared; cells and transitions must stay individual. |
| 23 self-organising machines | Do roles self-organise among 512 randomly wired machines? | Branching factor about 2: floods 15% of machines per token. Rates span four decades, but no roles form. About 36 new states per token. | **Cascades need a branching ratio below 1.** Random wiring plus surprise gives slowness without meaning. |

### Entities

| # | question | key result | lesson |
|---|---|---|---|
| 24 entities | Are entities super-assemblies with an identity part and changeable state parts? | Two cats: 6.8 shared columns, **0 shared cells**. Re-found 100%. Depressing what the entity currently predicts (**post hoc**) brings the new-value recall from 33% to 92%. | Kind in columns and identity in cells carries over to entities. Replacing state needs targeted depression. |
| 25 entity snapshots | Set and get by content? | Set picks the right entity 79% of the time, with 20% wrong merges. Get correct 69%. A strict rule never merges and never updates either. | Selection is the bottleneck. A different entity and a changed state look identical at the token level. |
| 26 learning what changes | Can it learn which kinds change from its own updates? | Inverted: colour is most changeable (.75), activity .24. Wrong-entity rate 48%, against 12% with no learning. | Self-reinforcing loop. Evidence must be independent of the decision. |
| 27 identity from co-presence | Do entities seen together teach identity? | Colour/animal .94/.93, activity .19. Wrong entity 14.6% → **1.3%**. "ginger cat" created new 10/10. Get correct 50% (62% with the post-hoc fix of shared tokens counting against identity), because duplicates from early merges remain. | Co-presence is the independent signal. Repair is still missing. |
| 28 consolidation | Do quiet periods that merge duplicates fix it? | Get correct **87%** (90% late; 91% with merging when a question's cue matches two copies). Entities 9.9 against the true 9. 30% of quiet merges are wrong, all early. Splits never fire. | Consolidation is the missing repair step. Wait for identity to firm up before merging. State cells are re-recruited forever. |

---

## Reproducing

```
# sketches (Node 18+)
cd sketches/20-columns && node sketch-settle.js
cd sketches/28-consolidation && node sketch.js

# text harness (Rust judge, Go models)
cd exp04 && cargo run --release -p harness --bin run

# gridworld (Go)
cd gridworld && go run ./cmd/judge -agents idle,random,reactive,mapper,qlearn,oracle,m008 -out /tmp/gw
# then open gridworld/replay.html with a trace
```

Each `NOTE.md` or `FINDINGS.md` lists its flags and exact commands.
