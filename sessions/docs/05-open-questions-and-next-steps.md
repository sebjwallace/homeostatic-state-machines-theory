# Open questions and next steps

*Where the work stopped, what was planned next, and the backlog, roughly in order of priority.*

---

## Where it stopped

The latest line of work is **entities as super-assemblies** (sketches 24–28):
- Identity is learnt from co-presence.
- Quiet periods consolidate duplicates.
- Current state is answered correctly about 87–91% of the time, with roughly one stored entity per true entity.

Two weaknesses were left explicitly open at the end of sketch 28.

1. **Early consolidation merges wrongly.** 30% of quiet merges joined two different entities, all in the first two quiet periods, before identity had firmed up. Options:
   - start consolidating later;
   - only merge once identity parts have stopped changing;
   - only merge on strong evidence. Merges made when a question's cue matched two copies at once were wrong 0 times in 110.
2. **States are rebuilt, not found again.** Every snapshot frees the old state's cells and recruits new ones, even for a state the entity has been in before. Recruitment never settles (about 5.5 cells per step). "Sleeping" should be an existing sub-assembly that is reactivated. That fits "states persist" and is a prerequisite for the next step.

There is also a known gap: **in sketches 24–28, entity selection is a symbolic loop**, not settling. It scores every stored entity, sorts and picks. The ideas are tested, but the selection is designed in. See [the mental model](01-mental-model.md#6-entities).

## The planned next sketch: entity interactions

The example: "ginger cat sleeping" and "grey cat eating" → "ginger cat meowing". One entity's state change is caused by another's.

The plan, in order:

1. **Selection by settling.** Cue "grey cat" and let stored entities' cells compete by projection and casting, with no code comparing entities. Checks:
   - an entity that shares only "grey" loses to one matching both words;
   - a stale copy loses to the current one, because its links are weaker.
2. **States as stable, re-found assemblies.** "eating" and "meowing" each become one assembly that is reactivated, not rebuilt.
3. **Interactions as learnt combinations.** A transition in the ginger cat's state is a learnt AND over the grey cat's state and its own. Test:
   - prediction of the ginger cat's next state;
   - **kind-level generalisation**: does "black cat eating" also make the ginger cat meow, through shared "cat" columns?

## Backlog

### Core mechanics
- **A learnt AND (branches or segments).** Replace hashed conjunctions with learnt dendrite-like segments: a small set of presynaptic cells that must be active together. Slot-specific kind transfer needs it (sketch 20d), and so do interactions.
- **Re-entry.** Let the output of one settling become the cue of the next. Sketch 21 suggested transitivity is a route through Y's identity, so it needs two steps of settling, not one link.
- **Cascades that die out.** Sketch 23 flooded with a branching factor of about 2. Find a local rule (a cap per wave or per region, inhibition, or a threshold that rises with activity) that keeps the branching ratio below 1 without hand-assigning roles.
- **Earned persistence and emergent roles.** In sketch 23, slow machines were slow because they were rarely reached, not because they held context. What makes a machine become a context holder on its own? Held states emerging from the cells themselves was parked by the owner, but this is where it goes.
- **Resolvable versus irreducible heat.** Local heat can't tell misfit that more context would fix from noise. This was first seen in round 1 and is still unsolved. Curiosity's "noise is boring" is the same distinction.
- **The ambiguous word.** One word used as two kinds ("j0", object and container) settles into one kind. It needs a second assembly, or graded membership.

### Thinking and memory
- **Relation meaning.** Something must say *which relation* to follow ("in" against "near" against "took"). Sketches 15–16 showed that learning it from confirmations loops on itself. It needs contrast: single-relation paths, or credit for the last hop only.
- **Joins as rules, not per-chain links.** go-m007 made specific joins. A kind-level "take the second step" has not been shown.
- **Choosing to write.** What makes an automaton decide to write something down, and where? Sketch 09 says what is *worth* writing, which is what was predicted, but not how the automaton would come to do it.

### Future experiments already written up
- [Phase changes and task switching](../future-experiments/01-phase-changes-and-task-switching.md): a task as a collective configuration of many machines, with switching as a phase change.
- [Many assemblies per machine](../future-experiments/02-many-assemblies-per-machine.md): a machine as a small computer running several threads, each assembly moved only by its own transitions.

### End to end
- **One automaton, memory and action together.** The text automata and the gridworld automaton are separate. An end-to-end sketch would put entity memory, held states and acting in one loop, for example the gridworld with entities to track.
- **Ladder rungs not yet attempted:** over-regularisation ("went" → "goed" → "went"), invariance (counting), shared worlds, closed worlds with several automata, structure into heat, "settled first", and memory outside (wipe the automaton and keep its notes).

## Questions from the README still open

From [README](../README.md#open-questions), with the current status of each.

| question | status |
|---|---|
| What does it mean for two assemblies to fit? | Working answer: prediction misfit at transitions; co-presence contradiction for identity. Not unified. |
| How sparse must representations be for one-off experiences to stay distinct? | Partly answered: columns with enough cells per column, and a cell per assembly (finding 02). |
| How should hardness be earned? | Working answer: by settling, with unresolved heat accumulating. Earned hardness beat all-or-nothing freezing in 01, 03 and m008. |
| Where do state machines live? | Partly answered: assemblies on columns; transitions as learnt ANDs (sketch 22). Self-organisation at scale is open (sketch 23). |
| How is a state held, and what makes it transition? | Held until a learnt combination matches (sketch 22). Release on misfit (m005). |
| Which states count as involved in an episode? | m008: the last write plus whatever a persisting state still holds. A wider rule froze coincidences. |
| Does specialist–generalist competition need its own mechanism? | Round 2: yes, a simple local one (uncertainty decides who speaks). Sketch 07: "most specific wins" hurts at scale. |
| What makes an automaton choose to write? | Open. Sketch 09 says what is worth writing. |
| Where, in the end, does the heat go? | Theory: circulate, encapsulate or resolve. Litter tested the closed-world accounting. Multi-automaton closed worlds are untested. |
