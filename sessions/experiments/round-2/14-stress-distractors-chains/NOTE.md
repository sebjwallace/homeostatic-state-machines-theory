# Sketch 14: stress test of sketch 13 (distractors, longer chains)

The question: sketch 13's post-hoc method (whole-sentence trial, gap-heat choice, "unresolved" when the gap stays hot) reached 98% on 2-link joins in a sparse world. Does it hold up when (1) the object and the containers turn up in many other sentences, and (2) chains have 3 or 4 links? And does choosing by gap heat beat random choice once there are real distractors?

Run: `node stress.js` (about 45 s) writes the main grid (`out.txt`). `ONLY=diag node stress.js` gives the distractor-kind diagnostic (`diag.txt`). `node trace14.js` traces the confabulated half-chains (`trace.txt`).

## Set-up

- **Code.** It is sketch 13's code, unchanged except for the world. `stress.js` loads the snapshot `sketch.js` and replaces only `makeWorld`/`names`. `ask()` is sketch 13's, with TRIAL=seg; skip-empty and HOPS are passed in as arguments. Automaton, learning rule, ledger, frame (`ev:went`, SUPP 0.1), COOL 0.5, read-only answering: all unchanged.
- **World.** 16 chains per seed: 12 full, 4 half. A chain is obj → c1 → … → room with L = 2, 3 or 4 links (`X ev:in Y`). A half chain has one link, at a random position, never stated. Containers are 48 neutral `n:c*` tokens, and there are 6 rooms (chance 17%). Sentences are shuffled into days (4 slots/day, clock tokens between them as before), plus 100 filler sentences (sketch 13's "P went R" and weather stories).
- **Distractors (mix A).** D sentences per chain token (object and every intermediate container) for D = 0, 2, 5, 10. Each is one of three kinds: `X ev:is <colour>` (6 shared colour/property tokens), `who:P ev:took X`, or `X ev:near Y` (Y = another chain's object/container). None of them contains a room. **Mix B** adds a fourth kind, `P went R ev:with X`, in which a room co-occurs with X without being X's location.
- **Fixed before running.** HOPS = L + 2 (sketch 13 had 4 for L = 2). 8 seeds. Methods: gap and rand, each with and without skip-empty. Questions: join (subject = obj), half-chain (subject = obj), direct (subject = last container). Reversed world (`ev:in Y ev:is X`, etc.) at L 3 / D 5.
- **Post hoc.** The diagnostic mixes P/T/N and the trace were added after seeing the grid.

## Results (8 seeds; per cell 96 joins, 32 half-chains, 96 direct)

Main grid, mix A. **gap = choice by gap heat; rand = random candidate; +skip = skip candidates that surface nothing new.**

| links / D | join right% gap / rand / gap+skip / rand+skip | join wrong-confident% gap / rand+skip | half-chain confab% gap / rand+skip | hops gap | cands @ hop 1 | direct right% gap / rand / rand+skip |
|---|---|---|---|---|---|---|
| 2 / 0 | 96 / 66 / 96 / 96 | 4 / 4 | 0 / 0 | 1.93 | 3 | 98 / 61 / 65 |
| 2 / 2 | 29 / 16 / 31 / 13 | 61 / 48 | 94 / 75 | 2.11 | 9 | 88 / 24 / 26 |
| 2 / 5 | 25 / 7 / 22 / 9 | 59 / 38 | 84 / 50 | 2.17 | 18 | 80 / 11 / 29 |
| 2 / 10 | 16 / 2 / 19 / 5 | 73 / 35 | 72 / 28 | 2.32 | 33 | 82 / 10 / 5 |
| 3 / 0 | 79 / 53 / **100** / 100 | 0 / 0 | 0 / 0 | 2.79 | 3 | 100 / 70 / 71 |
| 3 / 2 | 16 / 6 / 22 / 10 | 56 / 49 | 63 / 53 | 2.78 | 9 | 89 / 27 / 28 |
| 3 / 5 | 3 / 4 / 14 / 8 | 72 / 28 | 75 / 53 | 3.01 | 19 | 90 / 18 / 20 |
| 3 / 10 | 11 / 5 / 16 / 1 | 58 / 34 | 84 / 34 | 2.81 | 29 | 77 / 15 / 10 |
| 4 / 0 | 72 / 48 / **99** / 99 | 1 / 1 | 0 / 0 | 3.55 | 3 | 100 / 67 / 68 |
| 4 / 2 | 10 / 5 / 14 / 9 | 70 / 49 | 75 / 53 | 2.79 | 9 | 91 / 34 / 30 |
| 4 / 5 | 8 / 1 / 8 / 4 | 74 / 45 | 94 / 41 | 2.88 | 17 | 83 / 21 / 21 |
| 4 / 10 | 9 / 3 / 19 / 1 | 77 / 32 | 91 / 31 | 2.68 | 30 | 82 / 6 / 16 |
| **rev** 3 / 5 | 5 / 3 / 2 / 6 | 89 / 61 | 100 / 44 | 1.58 | 13 | 53 / 6 / 5 |
| mix B 2 / 5 | 14 / 9 / 14 / 5 | 84 / 61 | 100 / 75 | 1.11 | 15 | 63 / 23 / 21 |
| mix B 3 / 5 | 11 / 11 / 11 / 8 | 89 / 64 | 97 / 78 | 1.13 | 15 | 64 / 14 / 23 |

End heat for gap joins is 0.0–0.25 in every distractor cell: it *believes* it has answered. Full per-method rows (end heat, half end heat) are in `out.txt`.

Diagnostic (post hoc, D = 5, gap): with **colour facts only** (`X is old`, dead ends with no room in them), the result is join 28% (L 2) / 9% (L 4), half-chain confabulation 66 / 59%, and direct 98 / 95%. Colour + `took` and colour + `near` mixes look the same. So no single distractor kind is to blame.

Trace (`trace.txt`, seed 1, L 2, D 5, colour only). All four half-chains answer `n:attic` by the same path:
`coin is old` (heat 0.88) → `c10 is old` (0.75) → `c10 in attic` (0.00).
The shared property token `n:old` is a hub, and it leads to a different chain's container, which has a room.

## What happened

- **Longer chains alone are fine.** With no distractors, 3 and 4 links reach 100 / 99% with skip-empty. Half-chains are never answered, and hops ≈ links. Without skip-empty, gap drops to 79 / 72% from sketch 13's empty-row ties (a cue whose only row surfaces nothing still gets "used"). This is the same failure as before; it just happens more often per chain.
- **Distractors break it, immediately and hard.** At just 2 distractors per token, joins fall to 16–31% (chance 17%), and **61–94% of half-chains get a confident wrong room** at end heat around 0.05. The trace shows why. The search treats every co-occurring content token as a cue, and the gap only asks "has *some* room-like token surfaced?". With distractors the sentence graph is connected through hubs (shared properties, people, "near" partners), so a room is almost always reachable within the hop cap. Usually it is someone else's container's room. The honest "unresolved" that sketch 13 showed was a property of a sparse world, not of the method.
- **Gap-heat choice versus random.** For **direct questions** (one hop, the right room is in one of C's sentences), choosing by gap heat clearly wins: 77–91% vs 5–34% random at every D and L. For **joins**, gap beats random only slightly and stays near chance (e.g. 2 / 5: 22–25 vs 7–9; 4 / 5: 8 vs 1–4). The gap gives a signal only once a room is *one sentence away*. Before that, every candidate is equally hot (0.88–1.00), or it is cooled by partial random-code overlap (colour tokens 0.88, an unrelated container 0.75). That is a misleading gradient: it pulls the search toward whatever happens to overlap the frame, not toward the answer.
- **Gap choice confabulates *more* than random.** Its wrong-confident rate is 56–89%, against 28–64% for rand+skip. This is because gap is better at finding *a* room fast, while random wanders and runs out of hops still hot. Being "better" here means being more efficiently wrong.
- **Reversed word order at L 3 / D 5.** Joins are at chance in both orders (5 vs 3–14%). Direct questions fall from 90 to 53%. Confabulation is 100%. In `rev`, the subject rule makes the *container* the first content token of "ev:in Y ev:is X"; I did not dig into why direct questions drop further. Mix B (rooms co-occurring with X in "went … with X") is worst: about 1 hop, 84–89% confident wrong. A room in the same sentence is enough to close the gap.

## Ways it could be fooling us

- My distractors are harsher than "other facts about X" might be in a natural world. There are 6 shared colour tokens and cross-chain "near" links, so the sentence graph is densely connected. But even colour-only dead-end facts break it, because the colour token itself becomes a cue. That is how sketch 13's method is written (every surfaced content token is a cue), not an artefact of my choices.
- Partial frame fits (0.75, 0.88) come from random code overlap (K = 8 of 3200, and the frame support has many cells). The "gradient" that misleads gap choice is noise. With a cleaner frame, gap would be closer to random on joins, not better.
- The hop cap of L + 2 was fixed before running. A tighter cap would cut confabulation, but it would also cut right answers. Nothing in the method knows the chain length.
- 8 seeds × 96 joins per cell. Cell-to-cell noise is around ±5–8 points, so small gap-vs-rand join differences (e.g. 3 / 5: 3 vs 4) are not meaningful. The direct-question gap is large and consistent.
- The world builder is new code. I checked that L 2 / D 0 reproduces sketch 13 (96 / 98% vs 98 / 98%), but I did not inspect a raw stream at D > 0 beyond the trace.

## Verdict

- **Gap heat is a good *stop/accept* test when one sentence separates the cue from the answer, and a good *chooser* there** (direct questions: 80–90% vs 10–30%).
- **It is not a search heuristic for multi-hop joins.** Before the answer is adjacent, it gives no signal (or a noise signal). So with real distractors, joins collapse to chance and the system confidently names the nearest reachable room. The honesty seen in sketch 13 (0% confabulation) does not survive distractors: 60–100% confident wrong answers on half-chains.
- What is missing is something that says *which relation* to follow. "X in Y" and "X is old" look the same to a sentence-wide trial, and the frame checks only the answer's type, not that it was reached through `ev:in` links. Candidates for a next sketch: restrict cues to tokens in the same slot/relation as the question's event (learned, not hard-coded), or make the trial's heat include a relation-fit term, not just a type-fit term.
