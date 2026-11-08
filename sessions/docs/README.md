# Homeostatic State Machines: start here

*A guide to the project as it stands in November 2026: what the idea is, what has been tried, what was learnt, and where to go next.*

The [main README](../README.md) sets out the theory from first principles. This folder is the companion: the experiments, the results, the lessons, and the mental model they have built up. It is written for three readers:
- me, coming back to it later;
- an agent or collaborator picking up the work cold;
- anyone reading the repository on GitHub.

## The idea in a paragraph

Learning without an optimiser. **Energy is misfit**: how badly connected parts agree. Misfit makes the parts involved hot, and **heat is plasticity**, so what doesn't fit is exactly what is free to change. When something comes to fit, the heat falls and the arrangement **freezes**; what froze is what was learnt. Freezing is **earned**: structure that has settled things many times becomes hard to melt, and new structure stays soft. The automaton is a large population of **state machines whose states persist** until something moves them. So only what changes costs anything, and when things finally cool, the states that brought it about are still there to be frozen. No reward, no labels, no training phase, CPU only.

## What we learnt, in brief

1. **Columns carry meaning, cells carry identity.** This dissolved the trade-off between generalising and remembering ([finding 02](../findings/02-columns-meaning-and-identity.md)).
2. **Coordinated state machines that *hold* their states** keep episodes distinct through shared middles. Hardness then separates episodes from knowledge by itself ([finding 01](../findings/01-coordinated-state-machines-for-sequence-memory.md)).
3. **An automaton can learn to act without reward.** m008 beat Q-learning in every gridworld test, using held states for credit and cooling as memory.
4. **Shared assemblies compose**, beating counting on unseen combinations by about half the bits. A quiet period can form a join ("key in tin" + "tin in kitchen" → "key in kitchen").
5. **Good-enough memory is real.** Surprises are kept and predictable detail is lost. So what is worth writing down is what the automaton got right.
6. **An open question is heat.** That gives honest "don't know" answers, but heat alone is not a search strategy.
7. **Identity comes from co-presence:** two things seen together are different. Repaired by consolidation in quiet periods, entity memory reaches about 90% correct current state.

And some lessons that came back again and again:
- learning from your own decisions locks in mistakes;
- settling completes, it doesn't hop;
- a join needs something to hold X while Z arrives;
- cascades must die out;
- anything designed in proves nothing.

## Reading order

| doc | what it is | read it if |
|---|---|---|
| [01 the mental model](01-mental-model.md) | The philosophy and the concrete picture, with a glossary. | You want to think in the project's terms. **Start here.** |
| [02 the journey](02-the-journey.md) | The story, phase by phase, with the wrong turns and the steers that corrected them. | You want to know why things are the way they are. |
| [03 experiment catalogue](03-experiments.md) | Every experiment: question, numbers, lesson. | You need a specific result. |
| [04 breakthroughs](04-breakthroughs.md) | The results that changed what the theory can claim, with evidence and limits. | You want the highlights. |
| [05 open questions and next steps](05-open-questions-and-next-steps.md) | Where it stopped, the planned next sketch, the backlog. | You are going to continue the work. |
| [06 working on this](06-working-on-this.md) | Ground rules, conventions, repository map, how to run things. | You are going to write code. |

Then, for depth:
- [the README](../README.md), the theory essay;
- [`findings/`](../findings/), the two solid results;
- [`future-experiments/`](../future-experiments/), two proposals;
- each `sketches/NN-*/NOTE.md`.

## Status

Nothing here is proven. These are small, seeded experiments in toy worlds, built by AI coding agents from briefs, with settings fixed before running. Each report says how it could be fooling us. The theory is a set of ideas to test, and the experiments are the first tests.
