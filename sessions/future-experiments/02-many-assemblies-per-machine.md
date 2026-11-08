# Future experiment: many assemblies per state machine

*A proposal for the Homeostatic State Machines project. Not yet run.*

## The idea

Think of each state machine as a small computer. Each one specialises in something, they work together, and when there's heat they help reconfigure each other: a community of computers that evolves as it works.

So far, each machine holds exactly one state at a time, so one active assembly. The proposal is that a machine could hold **several assemblies at once**, each its own state, each changing at its own pace.

The column substrate already allows it. Two assemblies that share columns can be active together without blurring, because each uses its own cells within those columns. Inside one machine, then, one assembly might hold steady for a very long time while another changes every step.

What keeps them independent is that **a transition belongs to a particular state**. An input that matches the learnt transition of assembly A moves A, and only A. Assembly B, holding still, has no matching transition for that input, so it stays as it is. Each assembly feeds the context of whichever neighbouring machines are connected to it.

So a single machine could serve several dynamics at once: part of a slow, long-held context, and at the same time part of something fast. Like a small computer running several threads.

## Why it might matter

- **Multitasking within a machine.** A machine needn't be dedicated to one dynamic; it can take part in several, at different rates.
- **Generalisation.** A machine that has specialised in some kind of pattern can apply it to several things at once, rather than one machine per instance.
- **Economy.** Fewer machines may be needed if each can hold several concurrent states, which matters for cost.
- **A natural link to phase changes.** A task configuration could be a set of assemblies across many machines, coexisting with others, rather than the whole population flipping. That gives a finer-grained alternative to the phase-change picture in future experiment 01.

## Risks

- **Sparsity.** Every extra active assembly means more active cells. There will be a practical limit to how many can be held at once. People can hold only about four items in working memory, which may be the same kind of limit.
- **Addressing.** If two assemblies in one machine have similar transitions, an input meant for one could move the other. That is the familiar interference problem, now inside a machine.
- **Binding.** When several assemblies are active across many machines, something has to keep track of which ones belong together. Shared cells and connection patterns may do it; they may not.

## What to test

Built on the self-organising state machines (sketch 23 onwards), once single-assembly machines work at scale.

1. **Can a machine hold two or more assemblies at once** and keep them independent: an input moves one and leaves the others unchanged?
2. **Different rates in one machine:** does a machine end up holding one slow assembly and one fast one, without being told to?
3. **Limit:** how many concurrent assemblies can a machine hold before inputs start moving the wrong one, and how does that depend on columns, cells and sparsity?
4. **Benefit:** with multi-assembly machines, does the automaton need fewer machines for the same competence on the memory and reasoning tests, and does it handle two interleaved tasks better?
5. **Cost:** cells active and computation per step, compared with one assembly per machine.

## Signs of success

- Several independent assemblies coexisting in a machine, each moved only by its own transitions.
- Mixed rates emerging inside single machines.
- Equal or better competence with fewer machines.
- Interleaved tasks handled without one disrupting the other.

## Ways it could fool us

- If the code decides which assembly an input addresses, independence is designed in rather than earned.
- Apparent multitasking could just be two machines' worth of capacity crammed into one; compare at equal total cells.
