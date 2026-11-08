# Coordinated state machines for sequence memory

*A finding from sketch 04 of the Homeostatic State Machines project, November 2026.*

## The problem

Two sequences share a middle:

```
A B C D
X B C Y
```

Having seen both, a memory should continue `A B C` with `D` and `X B C` with `Y`. The difficulty is the shared middle. By the time the memory reaches `C`, the only thing that distinguishes the two sequences is something seen several steps earlier.

The same problem appears with episodes. Two experiences, each seen once:

```
cue1  Alice went to the park
cue3  Alice went to the beach
```

Asked where Alice went in episode 1, a memory has to carry "episode 1" through the shared "Alice went to the" and use it at the fork. If it can't, the episodes fold into each other: recall returns a mixture, usually a place Alice visited in some other episode.

## What fails

**A single fading context.** The first version of the sketch carried one blended trace of recent inputs, decaying over time. By the fork, the unique cue had faded and the shared part dominated, so episodes with the same agent had heavily overlapping contexts (0.49 overlap, against 0.02 by chance). Recall at 100 stored episodes was 50%.

This also fooled the theory's hardness rule. Hardness grows with reuse, and the overlapping connections were reused by every similar episode, so episode-specific detail hardened as though it were general knowledge.

**Separation alone.** More cells, sparser codes and a randomly expanded context code reduced the overlap and lifted recall to 82%. But expansion separates random overlap, not genuine similarity: the shared part of the context was still really shared. Detail still hardened too often.

## The idea

Use several state machines that each hold their own state, instead of one blended trace. In this theory, a state persists until something causes a transition. So:

- A **sequence machine** walks the shared path: `Alice`, `went`, `to`, `the`. Every episode uses it, so its transitions harden. This is general knowledge.
- An **episode machine** is set by the cue and then holds its state, undecayed, through the shared middle, because nothing has told it to change.
- At each step, the prediction comes from the **combination** of the machines' current states. At the fork, the sequence machine says "a place comes next" and the episode machine says which episode this is.

The pairing of a particular episode state with a particular point in the sequence happens once. So the connection it uses is touched once and stays soft: episodic detail. The sequence machine's transitions are touched by every episode and harden: semantic knowledge. The decomposition puts general and specific on different connections, and hardness separates them without any special threshold.

One refinement was needed. With an episode machine alone (variant C), recall was excellent but generalisation failed, because nothing shared carried information forward, such as the place, to predict what came two steps later (the food that goes with each place). Giving the sequence machine its own small held state, the pair of the previous and current symbols, fixed it (variant C2). So both machines hold states, and both are needed.

## Evidence

Sketch 04. Each episode is `cue agent went to place ate food`, seen once, with the food determined by the place. Some agent–place pairs are never shown, to test generalisation. Sparse codes, 8 active cells. Three seeds; no settings tuned for these variants; hardness threshold fixed at 3 in advance.

| variant | recall at 25 / 100 / 300 episodes | generalisation (all links / hard only / soft only) | episodic links soft / template links hard | quiet-period joining (none / after / before) |
|---|---|---|---|---|
| single fading context | 75 / 50 / 24 | 87 / 87 / 0 | 64% / 100% | 0 / 67 / 0 |
| more cells + expanded context | 93 / 82 / 61 | 93 / 100 / 0 | 80% / 100% | 0 / 100 / 0 |
| episode machine only (C) | 97 / 95 / 91 | 13 / 20 / 0 | 100% / 100% | 0 / 0 / 0 |
| **episode + sequence machines (C2)** | **97 / 95 / 90** | **100 / 100 / 0** | **100% / 100%** | **0 / 100 / 0** |

What C2 shows:

- **Episodes stay distinct under load.** Recall is still 90% with 300 episodes stored.
- **Hardness splits cleanly.** 99.94% of one-off links stay at hardness 1–2. Shared template links never fall below 8. The fixed threshold of 3 falls between the two groups without being moved.
- **General knowledge lives in the hard links.** With soft links removed, generalisation is untouched (100%). With hard links removed, it vanishes (0%).
- **Episodes need both.** Recall from hard links alone is 0%, from soft alone 12%. An episode is a few soft links hung on a hard shared scaffold.
- **Quiet periods join episodes, with clean controls.** Two episodes that share a state and were never experienced together get joined by replay during a quiet period after both (100%), but not without a quiet period, and not when the quiet period comes before the second episode (0% each). The shared sequence state that supports generalisation is also what lets episodes meet.

## What it means for the theory

- **"States persist" solves the shared-middle problem.** Context doesn't need to be carried by an ever-longer window or a decaying trace. It's carried by a machine that simply hasn't changed state.
- **Episodic and semantic memory are one structure at different hardnesses,** provided general and specific information sit on different connections. Coordinated state machines arrange that naturally.
- **Composition and episodes come from the same place.** Shared machines carry what generalises; their combinations with held states carry what is specific.

## Limits

- **The episode machine was told when to switch.** The cue was always the first symbol of an episode. In a real stream, what sets and releases a held state is the open problem.
- **The pairing code was engineered:** a sparse code over a large hashed pool of cells, not learnt.
- **The template is simple:** it only needs the last two symbols, which the sequence machine covers exactly.
- **Three seeds:** large differences are reliable; differences of a few points are not.

## Next question

What moves the held states? One proposal: episodes have no explicit boundaries at all. Several context machines (who is present, where, what the weather is) each hold their state and change at their own rate. An episode is simply a stretch during which a particular combination holds, and a boundary is wherever one of them changes.

## Reproduce

```
cd sketches/04-episodes-and-knowledge
PART=sep VARIANTS=base,C-400,C,C2-400,C2 node sketch.js
```

About 8 seconds. `node sketch.js` runs every variant in about 2.5 minutes. Full notes are in `NOTE.md`.
