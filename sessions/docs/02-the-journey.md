# The journey

*How the project got from a theory to where it is, phase by phase, including the wrong turns and the steers that corrected them.*

The work happened in one long, intense run in November 2026. The theory was developed by me, in long conversations with Claude. The experiments were built and run by AI coding agents (Claude) from short briefs, with settings fixed before running and every report including a "ways it could be fooling us" section. Each phase below gives the question, what happened, and what it changed in the thinking. The numbers are in [the experiment catalogue](03-experiments.md).

---

## Phase 0: the theory

It started from an old interest in associative memory and Hebbian learning, and a question: could learning be driven by an internal error signal that behaves like energy, rather than by an optimiser?

Ideas arrived roughly in this order, each one pulling the next:

1. **An internal error signal as energy or coherence.** Surprising and painful experiences are remembered strongly. Local optima are escaped by something like annealing.
2. **Temperature as plasticity**, with the heat coming from the misfit itself, not from a schedule.
3. **Wrong learnings kept as residue.** Residual heat demands resolution. A juvenile automaton starts hot.
4. **The name: Homeostatic State Machines.** Every frozen assembly is a little thermostat the automaton grew for itself.
5. **The environment shares the same energy.** Safety: an automaton with a "done". Heat dissipation and where heat ultimately goes. Civilisation as external memory.
6. **The gap and its three closures** (act, fake the reading, accept). Ashby's essential variables. Curiosity as incompleteness: the island and the lake.
7. **Circulate, encapsulate, resolve.** Misfit can be destroyed, and that became the anchor of Part six of the README. Then the reverse direction: structure turns back into heat.

The README went through five archived versions (`readme-history/`):
- v1, total energy;
- v2, operational heat (patches run warm; elegance is fewest CPU cycles);
- v3, everything is state machines;
- v4, episodes and knowledge;
- v5, good-enough memory, writing as sharing, and the notebook.

## Phase 1: the first automata (round 1, Node)

Two automata were built independently from the README: m001 (one distributed population) and m002 (a column per character). They were tested on a text stream against counting baselines, on the first seven rungs of the README's ladder.

**What happened.** Residual heat recruiting fresh capacity worked as a purely local learning rule, and energy visibly rose on novel input. But neither automaton beat good counting. m002 had essentially reinvented a growing context tree, which is smart counting. Freezing had nothing to protect, because nothing ever melted. Quiet periods did nothing.

**What it changed.** It found the first real gap in the theory: local heat can't tell misfit that more context would fix from misfit that is just noise.

## Phase 2: a harness, and the first wins (rounds 2–3, Rust)

Node was slow and the browser view slower, so the harness moved to Rust. A frozen test suite (tests 1–10), seeded, with PPM-C and Witten–Bell counting baselines, prequential bits per character.

- **Round 2.** m003 (shared assemblies) gave the first result counting can't match: 56% fewer bits on verbs in unseen word combinations. Shared cells formed word groups by themselves. m004 (held state) won on noise and topic return. Freezing finally had a job: with it off, memory collapsed (survival 0.94 → 0.47).
- **Round 3.** The wins combined. m006 beat the best counter on composition, persistence, noise and unseen noise at once. m005 found that **a held state is only useful if it can be released.** Thinking without data still did nothing: whatever held context could resolve was already resolved while reading.

**Honest caveat at the time:** both models were still mostly counting underneath. What was new was *which* structure exists and *when it speaks*, decided by local heat.

## Phase 3: Go, a world to act in, and the first join (round 4, gridworld)

- **Language settled.** The Rust judge was frozen. Models moved to Go, connected by a line protocol. go-m006 was ported bit for bit, including glibc's `log2`, `exp2`, `pow` and `expf`, so Go and Rust results match exactly. That decision kept every later number comparable.
- **go-m007: episodes in the same substrate.** The first draft was a separate store of sentences. My steer, before it was ever run, was **one substrate, not a separate archive.** Word transitions became ordinary nodes with the same heat, freezing and capacity. Quiet-period replay of warm transitions joined "key in tin" and "tin in kitchen": bits on the joined fact fell from 1.002 to 0.150, and the right place was ranked top 97% of the time. It also became the first model to beat the order-8 counter on context conflict, and it beat the best counter on plain prediction on all three seeds.
- **Gridworld and m008.** A Go world with five environments (restore, fire, litter, maze, wells), a judge, Q-learning baselines and a replay page. m008 is the first acting automaton. With no reward, no value function and no optimiser, it beat Q-learning in all ten environment × feel cells. It settled the maze at step 1,106 against Q-learning's 7,612. The design used everything at once: a held place map, generalist and specialist connections, local heat, cooling that remembers, earned hardness, and curiosity as incompleteness.

## Phase 4: sketches instead of rounds (01–09)

Full harness rounds were expensive. The working style changed to **sketches**: small, cheap JavaScript thought experiments that run in seconds and each test one idea. Long-running jobs already in flight were left to finish.

- **01, jammed gear.** Earned hardness picks between melting and patching. And a surprise: *keeping* an old connection is not the same as being able to *get it back*.
- **02, the world is state machines.** The framing is clarifying and costs nothing. The traffic-light learner failed on delayed credit, exactly where the README's open question said it would.
- **03, three greens.** A homeostat learnt which buttons restore three lights from heat alone, near the oracle. Accumulating unresolved heat is what makes earned hardness safe.
- **04, episodes and knowledge.** A fading context blurs episodes, and hardness then mistakes reuse for generality. The fix: **coordinated state machines** (variant C2), with an episode machine that holds and a sequence machine that walks. Recall 97/95/90% at 25/100/300 episodes, generalisation 100%, quiet joining clean. Written up as [finding 01](../findings/01-coordinated-state-machines-for-sequence-memory.md).
- **05–06, days and stories.** No episode boundaries, just held states (day, who, where, weather, time of day). Context became sufficient, and the remaining failures were interference, not missing context.
- **07, specificity first.** Letting the most specific link answer helped at small scale and hurt at scale, at the cost of generalisation.
- **08, what is remembered.** Surprises are kept at 99–100%. What is lost is what was predicted at the time by soft specific links: *predicted at the time ≠ predictable from knowledge.*
- **09, the ledger.** A dumb store beside the automaton. Write what it got *right*, not the surprises: about 40% of rows gave near-perfect reconstruction.

These led to a new section of the README (good-enough memory, writing as sharing, the notebook) and to the idea of the ledger as a hippocampus.

## Phase 5: the long fight for joins (10–16)

The question: can the automaton join "key in tin" and "tin in kitchen" into "key in kitchen", with mechanics rather than rules?

- **10.** Replaying ledger rows into the automaton: no join, structurally. Nothing holds "key" when "kitchen" arrives.
- **11.** A held subject plus replay that follows content: 35%, the first movement.
- **12.** Retrieval by settling: fails. *Settling completes the pattern you're in; it doesn't hop.*
- **13.** An open question as heat: honest stop/accept control, 98% joins in a sparse world, and 0% confabulation on half-chains.
- **14.** Stress with distractors and longer chains: collapses to chance. Gap heat says when to stop, not which relation to follow.
- **15–16.** Learning what "in" means from confirmations: self-reinforcing loops. Reheating on contradiction only melted everything.

**My steers in this phase:**
- "No ad hoc rules. It has to learn for itself."
- Not supervised learning: the world just happens, so nothing is "taught".
- When the probe asked "the X is in the ___", it scored the true answer "tin" as wrong. I spotted that, and the probe was rebuilt.

And then the main steer: **leave the ledger aside and get back to core mechanics.** The joins were failing because the representation was missing something, not the retrieval.

## Phase 6: kinds, columns and identity (17–21)

- **17, invariant structure.** The "X in Y" template hardened and pairings stayed soft. But unseen fillers got no sense of kind: random codes share nothing. Transitivity scored 0%.
- **18, class cells.** m003's shared cells were ported into the sketch world.
- **19, learnt overlapping codes** (inspired by semantic sparse codes such as Cortical.io's, where "jaguar" overlaps both animals and cars). Kinds appeared (new containers → room, 33% → 80%), but episode recall halved. A direct trade-off.
- **20, columns.** My idea: a dimensionality expansion, where each code unit becomes a column of cells. The first version chose the cell by context and failed. Then the key correction: **a cell per assembly, claimed when the pattern first forms.** Columns carry kind, cells carry identity, and both generalisation and recall held. Learnt Hebbian settling replaced the completion rule (20c), and stopping the cue's constant push gave noise clean-up (20d). Written up as [finding 02](../findings/02-columns-meaning-and-identity.md).
- **21, rules over kinds.** Transitivity still failed as a rule. The automaton *was* making a specific X→Z link when "key" was held as topic: about 3× chance. A role-agnostic held code answered the subject question (82–87%), but by overwriting episodes.

**Corrections along the way:**
- Capacity is cells per column, not "8 states".
- Held-state input is signal, not noise. The problem was the constant clamp re-injecting the noisy cue.
- When talking about text the automaton processes, quote it: "key".

## Phase 7: back to state machines (22–23)

**The steer:** we had strayed from the premise. Sketches 14–21 had become tests of search and memory, not of *interacting state machines*. Back to state machines and core mechanics.

- **22.** State machines on the column substrate. Private machines and the kinds-shared split both work: local repair, heat-only learning, held episodes. Full sharing fails everything. Rates emerged where the world allowed it.
- **23.** 512 randomly wired machines with no roles. Activity flooded, because the branching factor was about 2. Rates spread across four decades, but roles didn't form, and recruitment ran away. Sparsity needs a branching ratio below 1.

Two ideas were captured as future experiments rather than run:
- phase changes as task switching ([future experiment 01](../future-experiments/01-phase-changes-and-task-switching.md));
- many assemblies per machine, a community of small computers ([future experiment 02](../future-experiments/02-many-assemblies-per-machine.md)).

## Phase 8: entities (24–28)

My idea: **an entity is a super-assembly** in the column volume. An identity part, plus state sub-assemblies that change. Semantic memory as **snapshots**: an experience selects an entity by content and sets its state, and a cue gets its current state.

- **24.** Entities separate cleanly at the cell level (two cats share 6.8 columns and 0 cells). Replacing the old state needed targeted depression (33% → 92%).
- **25.** Snapshot set/get. The bottleneck is selection: "black cat sleeping" against "grey cat sleeping" looks exactly like "grey cat walking" against it.
- **26.** Learning which parts change, from the automaton's own decisions, inverted: colour came out most changeable. Another self-reinforcing loop. Wrong-entity rate 48%, against 12% with no learning.
- **27.** My fix: **co-presence.** Two entities in the same scene are different, which is evidence independent of the automaton's own decisions. Identity-bearing kinds were learnt correctly, the wrong-entity rate fell to about 1%, and a late "ginger cat" was correctly created as new. But early merges left duplicates.
- **28.** Quiet-period consolidation merges duplicates. Correct current state 87–91%, and the entity count converged on the true 9.

**Where it ended.** The entity selection and merging are still symbolic loops standing in for settling. The next planned step was **entity interactions** ("grey cat eating" → "ginger cat meowing"). That needs states to be stable assemblies that are found again, and selection done by projection and casting rather than a loop.

---

## How the way of working evolved

- **From heavy rounds to cheap sketches.** Seconds per run, one idea each, settings fixed before running, honest reporting.
- **From Node to Rust to Go.** Node was a tool for thinking; Rust gave a frozen, fast judge; Go is for models, with a line protocol between them. Sketches went back to plain Node because they are small.
- **From retrieval tricks back to mechanics.** The two steers that mattered most: "it has to learn for itself", and "we've strayed from the premise, back to state machines".
- **Every experiment states how it could be fooling us.** Several of the most useful findings came from those sections, and from spotting bad probes.
