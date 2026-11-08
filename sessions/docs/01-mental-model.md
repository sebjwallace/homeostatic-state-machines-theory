# The mental model

*What Homeostatic State Machines is, as it stands now: the philosophy, the mechanics, and the concrete picture the experiments have pushed us towards.*

The full first-principles essay is the [README](../README.md). This document is the compressed, current version. It also folds in what the experiments taught, which the README predates in places. Where an idea has been tested, that is said. Where it is still only a claim, that is said too.

---

## 1. The one idea

**Systems settle into states of low energy, and energy is misfit.**

Everything else follows from that. There is no teacher, no right answer, no loss function, no optimiser and no training phase. There is only tension between parts that don't fit, and a tendency for that tension to ease. Learning is what is left behind when it eases.

The aim is learning that is:
- **online**: it learns while it runs, from the first input, in one pass;
- **unsupervised**: the world simply happens to it;
- **local**: each change depends only on what is nearby;
- **sparse and cheap**: CPU only, and only what changes does any work.

## 2. Energy, heat and hardness

| term | meaning |
|---|---|
| **Energy** | Misfit: how badly connected parts agree. An input that wasn't expected, or two assemblies that contradict each other. |
| **Heat / temperature** | Plasticity. It comes from the misfit itself, locally, and spreads along connections, not across the whole automaton. Hot parts can change; cold parts are frozen and cost nothing. |
| **Cooling** | When an arrangement eases the tension, heat falls, and the arrangement freezes in place. *What froze is what was learnt.* |
| **Hardness** | Freezing is earned, not all-or-nothing. Each time a connection takes part in settling something, it hardens a little, which raises its melting point. What has worked many times is kept. What worked once stays open to revision. |
| **Accumulating heat** | Heat at a jam that never resolves keeps building, so even hard structure eventually melts if it is genuinely wrong. Without this, hard mistakes can never be repaired, only patched around (sketches 01 and 03). |
| **Residual heat** | Familiar input is handled by existing frozen structure, and nothing is learnt. Only the heat that is left over drives learning. The automaton learns exactly what it couldn't already handle. |
| **Growing, not overwriting** | Residual heat recruits fresh, unused capacity rather than melting old structure. Melting is for soft structure that jams; growing is for when existing structure is hard and still right for its own cases. |

The machine metaphor that anchors it: **a jammed gear.** Energy that should flow can't, so it builds up as heat at the jam. Heat makes that spot malleable, the parts loosen and reconfigure, and once energy flows again the heat drains away and the new arrangement sets. The automaton never diagnoses the fault. It responds to the symptom, and the symptom appears exactly where the fault is.

## 3. States persist, and everything is state machines

This is the biggest shift in how the theory is held, and it was arrived at during the project rather than at the start.

- **An assembly is a state.** It is a group of cells wired together, so activating part of it completes the rest. It is three things at once: a state the system can be in, a memory (a valley in the energy landscape), and a frozen response to one kind of disturbance.
- **A state machine** is a set of states plus the learnt transitions between them.
- **States persist.** A machine stays in its state until something makes it transition, whether that takes one step or a week. So the automaton is a large estate of machines, almost all of them unchanged at any moment. Visible activity is just the surface where something changed.
- **It is cheap for the same reason.** Only what changes needs computation. Everything else simply stays as it is.
- **Everything is state machines.** The world is made of them too: a traffic light, a door, a cell in a grid. The only difference is that the automaton's machines can reconfigure and the world's can't. Perception is world states propagating in. Action is automaton states propagating out. There is no separate interface, and no clock that has to tick: things change when they change.
- **Credit assignment falls out of persistence.** When the automaton finally cools, the states that brought the cooling about are *still in place*, because states persist. Cooling freezes them. "The cooling itself does the remembering." No reward signal, and nothing to trace back. The gridworld automaton m008 used exactly this to credit "take" when the litter reached the bin many steps later.

## 4. The substrate, as the experiments have shaped it

The README left open where state machines live. The sketches have converged on a fairly concrete picture. Each item says where it was shown.

### Columns carry meaning, cells carry identity
*(sketches 17–20, [finding 02](../findings/02-columns-meaning-and-identity.md))*

- The population is organised in **columns**, each a small set of cells.
- **Which columns are active is what a thing means.** Words used alike come to share columns: the kind. This comes from learnt, overlapping codes, not given labels.
- **Which cell fires within each column is which particular thing it is.** When a pattern first forms, it claims the least-used cell in each of its columns, and those cells wire to each other. That set of cells is its assembly.
- So "key" and "cup" share columns, which lets knowledge transfer, but almost never share cells, which keeps their memories apart. Two assemblies can even be active together in the same columns without blurring.
- **Capacity is the number of cells per column.** Few cells means accidental sharing and blends. Columns can grow cells on demand.
- This resolved a trade-off that killed earlier versions: learnt shared codes gave generalisation (new containers got a room 33% → 80%) but halved episode recall (98% → 50%). Columns with a cell per assembly gave both: kind transfer at 90–100% and episode recall back to 84–88%.

### Finding an assembly: projection and casting
- **Projection:** active cells send activity along their connections, and each cell sums what arrives.
- **Casting:** only the strongest survive, one winner per active column and a fixed number of columns overall.
- **Repeat** until the pattern stops changing.
- Connections inside assemblies are plain Hebbian: cells active together strengthen.
- **Overlap gives generalisation. Competition gives sparsity**, which keeps overlapping patterns from blurring and lets one win. Both are needed; they do different jobs.
- **The cue should push only on the first round.** If the outside cue keeps pushing every round, it pins its own noise in place. Let it go after the first round and the attractor cleans up noisy cues: noisy cues settled to the clean assembly 66–69% of the time, against 0% with a constant push (sketch 20d).

### Held states and combinations
- **Held states are signal, not noise.** A held state is context such as the current topic, subject, episode, day or time of day, held by its own machine.
- **Several coordinated machines beat one blended trace** ([finding 01](../findings/01-coordinated-state-machines-for-sequence-memory.md)). An episode machine set by a cue *holds* its state, undecayed, through a shared middle, while a sequence machine walks the shared path. The pairing of a particular episode state with a point in the sequence happens once and stays soft (episodic). The sequence machine's transitions are reused and harden (semantic). Hardness then separates episodes from knowledge with no special threshold.
- **Some things need a combination (an AND), not a sum.** Slot-specific kind transfer ("what kind of thing goes *here*") needs subject × slot as a conjunction. Additive held states lose it, and several additive held states flood the input (sketch 20d). The likely biological answer is dendritic branches or segments: a learnt AND over a few presynaptic cells. That is open work.
- **A held state is only useful if it can be released.** Structure that depends on a held state must drop it the moment it misfits, or a slow state lags behind real change (m004, m005).

### State machines on columns
*(sketches 22–23)*
- A machine's states are assemblies on the column substrate. A transition is a learnt AND over other machines' current assemblies. Heat reshapes transitions locally.
- **Sharing:** individual machines with private cells and transitions work, and so does the split (kinds canonical, cells and transitions individual). **Full sharing fails**: if one canonical table serves every machine, a fix in one place is a fix everywhere, and nothing can be locally exceptional.
- **Rates can emerge.** A context machine that changes only when its learnt AND matches ends up changing about once per sequence, while others change every step. Nobody set that rate.
- **Cascades must die out.** With random wiring at scale, each change woke about 2 others: a supercritical cascade that flooded 15% of machines per token. Recruitment ran away and roles did not self-organise. Sparsity needs a branching ratio below 1. This is open.

## 5. Episodes, knowledge and good-enough memory

- **Episodic and semantic memory are one structure at different hardnesses.** Shared transitions recruited by many experiences harden into knowledge; one-off detail stays soft (sketches 04, 05, 17). Consolidation is just hardening.
- **Good-enough memory.** An automaton that learns only on residual heat keeps the surprising parts of experience and loses the predictable parts, rebuilding them from general knowledge. Shown in sketch 08: surprising events were recalled at 99–100%.
- **A subtlety that matters:** "predicted at the time" is not the same as "predictable from general knowledge". An event predicted by a soft, specific link learns nothing, and is later lost when other episodes compete that link away (sketch 08).
- **This is why writing exists.** Exact records are cheaper to keep in the world than in the head. The limit that stops an automaton remembering everything is what pushes it to write and to share.
- **The ledger (the notebook, a loose hippocampus).** A dead-simple non-learning store beside the automaton. The counter-intuitive finding: what is worth writing is what the automaton *got right* at the time, not the surprises, which it keeps anyway. About 40% of rows chosen that way gave 94–96% perfect reconstruction (sketch 09).
- **Nothing is wrong, only out of context.** Old specialists stay; newer generalists form alongside; whichever fits most specifically answers. Real resolution is often finding a hidden context (sky blue by day, red at sunset) that makes both true.

## 6. Entities

*(sketches 24–28, the most recent line of work)*

- **An entity is a super-assembly.** It is an identity part (its "name": "grey" + "cat") plus changeable state parts ("sleeping", "in the kitchen"). Two cats share the "cat" columns but not cells.
- **Semantic memory as snapshots.** An experience such as "grey cat eating" *selects* an entity by content and *sets* its state, replacing the old state. A cue such as "grey cat" *gets* the current state.
- **The core ambiguity.** "black cat sleeping" against a stored "grey cat sleeping" matches 2 of 3 parts. So does "grey cat walking". At the token level, a different entity and a changed state look the same. Something has to say which parts carry identity.
- **What carries identity is learnt from co-presence.** Two entities seen together in the same scene are, by definition, different. The parts that differ between them are identity-bearing. Colour and animal came out identity-bearing (.94/.93); activity did not (.19). The wrong-entity rate fell to about 1% (sketch 27).
- **Quiet-period consolidation.** Early merges, made before identity was learnt, leave duplicate copies. In a quiet period, copies that agree on all identity-bearing parts merge, keeping the newest state and freeing cells. Get accuracy rose to 87–91%, and the entity count converged on the true number (sketch 28).
- **A warning about what is designed in.** In sketches 24–28, entity selection and merging are symbolic loops, standing in for settling. The ideas were tested cheaply, but the selection is not yet earned. Replacing the selection loop with projection and casting is the next step.

## 7. Thinking

- **Thinking is settling that carries on after input stops.** Heat left inside drives reorganisation during quiet periods. A train of thought is heat moving: cooling one place can warm the next.
- **Replay chosen by heat.** In quiet periods, the warm parts reactivate. Two experiences that share a piece, "the key is in the tin" and "the tin is in the kitchen", meet at the shared piece, and the gap between them is heat. Resolving it forms the join "key in kitchen". go-m007 did this in the harness: after a quiet period, the right place was ranked top 97% of the time, against 14% without one.
- **A join needs something to hold X while Z arrives.** This was the hardest-won lesson of sketches 10–21. A link from "key" to "kitchen" can only form if something still carries "key" when "kitchen" turns up. Replaying recorded rows doesn't create that, and nor does a subject state that is released at the full stop.
- **Settling completes; it doesn't hop.** Settling for least misfit with everything held falls into the current episode's valley. Joining needs a jump to a different context that shares one token (sketch 12).
- **An open question is heat.** Make the question itself the gap. Retrieval hops to whatever cools it, stops when it cools, and says "don't know" when it doesn't. That gave honest control: 0% confabulation in a sparse world. But gap heat is a good *stop* test, not a search heuristic. With distractors, multi-hop joins fell to chance, because nothing said *which relation* to follow (sketches 13–14).
- **Writing as thinking.** Recall a piece, write it at an address, recall another, write it beside the first. The page gathers what memory scattered. Following a pointer is just moving, and moving is action.

## 8. Where the heat goes

Misfit, unlike physical energy, **can be destroyed**: when two things come to fit, the tension is simply gone. So heat can do three things:

1. **Circulate:** passed on, inside the automaton, to the environment or to another automaton. Fine if it reaches somewhere it can sink.
2. **Encapsulate:** held in a patch, a mechanism that manages a conflict without removing it. The patch runs warm forever.
3. **Resolve:** things genuinely fit and the tension vanishes. In a closed world, this is the only way the total ever falls.

**Operational heat.** A patch costs something every time it steps in. So structure has a running cost, and patched regions never quite cool, which keeps them malleable until a real resolution lets the patch fall away. *Elegance is the lowest loss.* On a computer that is literal: fewer moving parts means fewer CPU cycles and less electricity. Breadth (structure that covers more of the world) runs cool. Patchwork depth runs warm.

**Structure turns back into heat**, too. Every expectation is a place the world can disagree with, so the more an automaton knows, the more it can notice. Structures from separate contexts can collide. Writing is structure in transit that can warm whoever reads it.

## 9. The gap, the environment and safety

- **The gap is the energy.** Everything has a level at which it is settled. The difference between where things are and that level is the drive. No reward, just discomfort proportional to the gap.
- **Three ways to close a gap:** change the world (action); fake the reading (corrupted perception, the dangerous one); or change the target (acceptance). Acceptance is legitimate for learnt expectations but not for **essential variables** (Ashby), such as the health of the environment the automaton depends on.
- **Curiosity is incompleteness.** Two partly connected structures, each implying something the other points to, are under tension. The pull to complete them is the same energy as everything else. So curiosity needs some knowledge first, noise is boring, and curiosity shows up when things are calm. The gridworld automaton used this: it was drawn to cells seen from two or more vantage points but never reached.
- **Homeostats have a "done".** When the gap closes, the drive stops. That is the safety catch against runaway automata, and it only works if the automaton can't reach its own essential targets or the instruments that report its environment's energy.
- **Dumping heat** on a neighbour or the shared environment lowers local tension without resolving anything, and it comes back. Any honest measure counts the total.
- **Within and without.** An automaton settled inside has capacity to be a sink for others' heat. One that is hot inside doesn't.

## 10. Recurring traps the theory must avoid

These came up again and again, and any new mechanism should be checked against them.

1. **Self-reinforcing learning.** A statistic fed by the automaton's own decisions locks in its early mistakes (sketches 15, 16, 26). Evidence must come from somewhere independent of the decision, as co-presence does for identity.
2. **Hardness measures reuse, not generality.** If episode codes overlap, episode-specific links get reused and harden as if they were knowledge (sketch 04).
3. **Designed in, not earned.** A hand-written rule that decides what the mechanism was supposed to discover proves nothing. Examples: m004's built-in corruption shapes, sketch 11's subject rule, the entity selection loops.
4. **Supervision by the back door.** Nothing is taught. The world happens. No labels and no "the answer is" signals.
5. **Coping dressed as resolving.** A patch that quietens a symptom (a suppressor, a special case) is encapsulated heat. Check whether it keeps costing.
6. **Interference, not missing context.** Once context is sufficient, failures come from many shared links outvoting one soft specific link (sketches 05–06).
7. **Resolvable versus irreducible heat.** Local heat can't tell misfit that more context would fix from misfit that is just noise. This still needs an answer (round 1, and m004's topic lag).
8. **Supercritical cascades.** If each change wakes more than one other, activity floods and recruitment runs away (sketch 23).

## Glossary

| term | meaning |
|---|---|
| automaton | The whole learning system: all its state machines, their structure and current states. |
| assembly | A set of cells wired together that completes itself from a part. A state. |
| column | A small group of cells. Shared columns are shared meaning (kind). |
| kind | What a group of things used alike has in common, carried by shared columns. |
| held state | A state that persists as context (episode, topic, subject, day, time). |
| combination / conjunction | A learnt AND over several active states. |
| projection / casting | Summing incoming activity, then keeping only the strongest cells. One settling round. |
| heat / temperature | Local plasticity, coming from misfit. |
| hardness / melting point | Earned resistance to change. |
| residual heat | Misfit left after existing structure has done what it can. Drives learning. |
| patch | Structure that manages a conflict without resolving it. Runs warm. |
| operational heat | The cost of running structure. On a computer, literally CPU work. |
| quiet period | A time with no new input, in which internal heat keeps settling, replaying or consolidating. |
| ledger / notebook | An addressable store outside the automaton that it can write to and read from. |
| entity | A super-assembly: identity parts plus changeable state parts. |
| set / get | Updating an entity's state from an experience, and reading it from a cue. |
| co-presence | Two entities in the same scene, which are therefore different. The evidence for identity. |
| join | Forming "X in Z" from "X in Y" and "Y in Z". |
| bpc | Bits per character. Prequential (predict, then learn), so every prediction is a fair test. |
