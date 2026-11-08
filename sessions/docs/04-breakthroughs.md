# Breakthroughs

*The results that changed what the theory can claim. Each comes with its evidence, why it matters, and its honest limits.*

None of these is a proof. They are small, seeded experiments in toy worlds. But each one either showed a theory idea working when it could have failed, or pointed the theory somewhere it hadn't expected to go.

---

## 1. Columns: meaning in columns, identity in cells

**The claim.** Organise the population as columns of cells. Which columns are active carries *what kind* of thing something is. Which cell fires within each column carries *which* thing it is. A new pattern claims the least-used cell in each of its columns.

**Why it is a breakthrough.** It dissolved a trade-off that had blocked progress for several sketches.
- Shared codes give generalisation but blur memories.
- Separate codes keep memories distinct but generalise nothing.

| | random codes | learnt shared codes | **columns, cell per assembly** |
|---|---|---|---|
| new containers get a room | 33% | 80% | **100%** |
| specific episodes recalled | 98% | 50% | **88%** |
| memorised facts recalled | 88% | 56% | **98%** |

The same structure later carried over unchanged to entities: two cats share about 6.8 columns ("cat") and **zero cells**.

**What it means.** An assembly becomes concrete: a particular cell in each of a set of columns. And hardness can separate general from specific, because the two live on different connections. Column-level structure is reused by a whole kind and hardens; cell-level links belong to one thing and stay soft.

**Limits.** Small columns cause accidental sharing and blends. Ambiguous words get one meaning. Slot-specific transfer needs combinations (an AND), not sums. → [finding 02](../findings/02-columns-meaning-and-identity.md), sketches 17–20.

## 2. Coordinated state machines: states that hold

**The claim.** Don't carry context as one fading, blended trace. Use several state machines that each *hold* their state until something moves them. An episode machine, set by a cue, holds through a shared middle. A sequence machine walks the shared path. Prediction comes from the combination.

**Evidence (sketch 04).**

| | recall at 25 / 100 / 300 episodes | generalisation | quiet joining |
|---|---|---|---|
| one fading trace | 73 / 53 / 30% | 87% | – |
| best separation of the trace | 93 / 82 / 61% | 87–100% | – |
| **coordinated machines (C2)** | **97 / 95 / 90%** | **100%** | **clean (0 / 100 / 0 controls)** |

**Why it is a breakthrough.** It turned "states persist" from a slogan into a mechanism. It also made the episodic/semantic split fall out of hardness with no tuned threshold: 99.94% of one-off links stayed at hardness 1–2, and the shared template was all hard. Later held states (day, time of day, subject, topic) all came from this.

**Limits.** At scale, failures become interference: one soft specific link outvoted by many shared ones. → [finding 01](../findings/01-coordinated-state-machines-for-sequence-memory.md).

## 3. Learning to act without reward

**The claim.** An automaton can settle a world by acting, with no reward, value function or optimiser. It acts to lower energy and learns only through what cooling freezes in place.

**Evidence (gridworld, m008).** It beat Q-learning in all ten environment × feel combinations. It settled the maze at step 1,106, against Q-learning's 7,612. Run with learning off, it is roughly a reactive agent, so the gains are learnt.

**Why it is a breakthrough.** It is the first time the full set of ideas worked together in one acting system:
- held states as the answer to credit assignment ("take" credited when litter reaches the bin many steps later, because carrying it is a held state);
- local heat from misfit;
- cooling as remembering;
- earned hardness with accumulating unresolved heat;
- curiosity as incompleteness;
- the gap's satisficing threshold.

**Limits.** The world is small, perception is given, and wells (memory over long absences) is a loss to a hand-written mapper.

## 4. Composition, and beating counting where it matters

**The claim.** Assemblies shared across contexts let the automaton compose: what it learnt about "the cat sat" applies to "the dog sat".

**Evidence (text harness).**
- m003 predicted verbs in never-seen combinations with **56% fewer bits** than the best counter. Its shared cells formed the grammar's word groups by themselves.
- m006 beat the best counter on composition, persistence, noise and unseen noise at once.
- go-m007 beat the best counter on plain prediction (0.742 against 0.746), and became the first model to beat order-8 counting on hidden-context conflict (0.197 against 0.200).

**Why it matters.** Counting is the honest baseline: an automaton that can't beat it is only counting in a more complicated way. Composition is the first thing counting structurally cannot do.

**Limits.** The early models were mostly counting underneath. What was new was which structure exists and when it speaks.

## 5. Thinking without data: the first join

**The claim.** During a quiet period, warm (still-soft) structure replays. Two experiences that share a piece meet there, and the gap between them is resolved into a join.

**Evidence.** go-m007, test 11: after reading "key in tin." and "tin in kitchen.", a quiet period cut the bits on the place word in "key in kitchen." from **1.002 to 0.150**. The right place was ranked top 97% of the time, against 14% without the quiet period (chance 12.5%). The control, a quiet period before the second fact was read, found nothing to join and changed nothing. On seed 1, all 24 joins landed on the right place, with no spurious ones. For comparison, go-m006 scored 0.709 and the best counter 0.726.

**Why it matters.** Thinking without data had failed in every earlier round. This is the theory's account of thinking actually happening.

**The lesson behind it** (sketches 10–21): **a join needs something to hold X while Z arrives.** Replaying recorded rows doesn't create that, nor does a subject released at the full stop. And settling for least misfit completes the current episode rather than hopping to another one.

## 6. Good-enough memory, and what to write down

**The claim.** If only residual heat drives learning, the surprising parts of experience are kept and the predictable parts are lost.

**Evidence.**
- **Sketch 08:** surprising events were recalled at 99–100%.
- **Sketch 09:** the counter-intuitive consequence. Because surprises are kept anyway, the useful thing to write in a notebook is what the automaton **got right**, which is what it will later lose. About 40% of rows chosen that way gave 94–96% perfect reconstruction, against 56–76% for random rows of the same size. Writing surprises added 0–2 points.

**Why it matters.** It gives writing a principled role: exact records are cheaper in the world than in the head. It also sharpened the theory: *predicted at the time* is not the same as *predictable from general knowledge*.

## 7. An open question as heat

**The claim.** A question is a gap, and a gap is heat. Retrieval moves to whatever cools it, stops when it cools, and reports "unresolved" when it doesn't.

**Evidence (sketch 13).** In a sparse world: 98% correct two-link joins, and **0% confabulation** on half-chains whose answer was never given. Heat stayed high, about 0.94, and the system said it didn't know.

**Why it matters.** Honesty fell out of the mechanism: an unresolved gap stays hot, so a correct "don't know" is the default.

**Limits (sketch 14).** With distractors it collapsed. Gap heat is a good stop/accept test but not a search heuristic. It needs something that says which relation to follow. The working trial also relied on visible sentence boundaries (post hoc).

## 8. Identity from co-presence, repaired by consolidation

**The claim.** What makes two experiences the same entity is learnt from an independent signal: **two entities seen together are different**. The parts that differ between co-present entities are identity-bearing. Quiet periods then merge duplicate copies.

**Evidence.**

| | no scenes | co-presence (27) | **+ quiet consolidation (28)** |
|---|---|---|---|
| single snapshots to the wrong entity | 14.6% | 1.3% | 1.1% |
| current state answered correctly | 72% | 50–62% | **87%** (91% with merging when a question matches two copies) |
| stored entities (true 9) | 17.3 | 14–21 | **9.9** |

**Why it matters.** It broke a pattern seen in sketches 15, 16 and 26: learning from the automaton's own decisions locks in early mistakes. Co-presence is evidence that doesn't come from the decision being judged. That is a general principle: **find an independent signal.**

**Limits.** Selection and merging are still symbolic loops, not settling. 30% of early quiet merges were wrong. States are rebuilt rather than found again.

## 9. Smaller results worth keeping

- **Earned hardness + accumulating heat** (sketches 01, 03): keeps what's proven, stays revisable, and can always melt a hard mistake eventually. Hard old structure plus soft new patches both keeps and recovers.
- **A held state must be releasable** (m005): with release, context-conflict bpc fell from 0.36 to 0.28.
- **The cue should push only once** (sketch 20d): noise clean-up went from 0% to 66–69%.
- **Kinds can be shared, cells and transitions can't** (sketch 22): full sharing makes every fix global.
- **Rates emerge** when a machine moves only when its learnt combination matches (sketch 22). This is a seed of slow context machines.
- **A Go port matching Rust bit for bit**, including ported `log2`, `exp2`, `pow` and `expf`, so all numbers stay comparable across languages.
