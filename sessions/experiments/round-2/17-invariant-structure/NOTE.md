# Sketch 17: invariant structure

Can the core mechanics learn that "X in Y" stays the same while X and Y change? And can they learn a rule over that structure (transitivity of "in")?

Run with `node sketch.js`, which takes about 15 s for seeds 1–5. The output of the last run is in `run.txt`.

## Set-up

The mechanics are sketch 04's C2, reused as they were.
- **Codes and routes.** Sparse codes are random 8-of-3200. There are two routes: symbol → next symbol, and context → next symbol.
- **Learning.** Heat comes from the automaton's own prediction misfit. Earned hardness uses `melt = 0.5 + 0.4h`, and cooling adds +1 hardness to each used strong link per sentence.
- **Held states.**
  - The sequence machine holds the pair (previous symbol, current symbol).
  - In place of sketch 04's episode machine there is a **subject** held state, built the same way. It is set by the noun after `. the`, held through the sentence and released at `.`. Its pairing code (subject × current symbol) is the same hashed conjunctive code as before.
- **Quiet periods.**
  - Replay starts at a symbol chosen with probability ∝ heat².
  - The automaton then runs on its own predictions. The "actual" next state is the assembly the prediction settles into.
  - It uses the same learning and cooling rules as when awake. This is a slight change from sketch 04, which learnt only the context route during quiet.
  - The main stream has 10 replays every 100 sentences. There are 40 more at the end in the quiet conditions.
- **The world.** There are 800 sentences, plus chain and evidence sentences. Six relation types:
  - `the O is in the C`
  - `the C is in the R`
  - `the O is on the S`
  - `the P has a O`
  - `the P sat on the S`
  - `the P opened the C`
- **Fillers and kinds.** There are 24+20 objects, 12 containers, 4 rooms, 6 surfaces and 8 people. Kinds appear only in how words are used. Every container has one fixed room.
- **Held out for level 1.**
  - 4 objects are never the subject of "in". They appear only in on/has sentences.
  - 3 containers are never the subject of "C in R". They appear in object-in-container and "opened" sentences.
- **Level 2.**
  - Each of 20 chain objects X gets `X in Y` once, plus usage evidence (on/has).
  - Y is in Z, and Z is shown many times.
  - For 10 training chains, `X in Z` appears later. The 10 test chains never show it.
- **Fixed settings.** All settings were fixed before running, with HARD=3 as before. One change was made after the first run: a `.` now ends each sentence, so the end → next-sentence transition is learnt. The numbers barely moved, except that replay stopped looping inside one relation.

## Results (5 seeds pooled)

### Hardness by link kind

Strong links only (w > 0.5).

| link kind | n | % hard (h ≥ 3) | median h | h=1 / 2 / 3–9 / 10+ (%) |
|---|---|---|---|---|
| template, symbol route (`is→in`, `in→the`, `has→a`…) | 2,560 | **100** | 265 | 0 / 0 / 0 / 100 |
| template, sequence machine (`(is,in)→the`…) | 992 | **100** | 178 | 0 / 0 / 0 / 100 |
| specific pairing (subject × slot → filler, e.g. `key`×`the` → `tin`) | 154,377 | **14** | 1 | 63 / 23 / 13 / 1 |
| slot → particular filler word (`the→o7`) | ~35–44k | 74–78 | 7–8 | 15 / 9 / 30 / 46 |
| particular filler word → relation (`o7→is`) | ~22k | 88 | 13 | 1 / 11 / 26 / 62 |

### Level 1: filling a slot with the right kind

The prompt is `. the W is in the ___`. Learning is off.

| probe | all links | hard links only |
|---|---|---|
| seen object (subject of "in" in training) → container | 100% | 70% |
| **held-out object** → container | **40%** (rooms 20%, surfaces 40%) | 70% (rooms 25%) |
| **held-out container** → room (correct) | **33%** (containers 67%) | 33% |
| held-out container `is →` "in" | 67% | 60% |
| positional controls (`P sat on the` → surface, `P has a` → object, `heldO is on the` → surface) | 95–100% | 95–100% |

The baseline is training frequency after `(in, the)`, which is about 62% containers and 38% rooms. Held-out objects scoring 70% containers on hard links is that baseline. Held-out containers getting a container (67%) is the wrong kind.

### Breaking a template

The break is five `the O is in the P` sentences, with a person in the container slot. Values are means over seeds.

| | before | after the break | after a quiet period |
|---|---|---|---|
| heat at the slot (normal / novel right-kind / break #1 / break #5) | 0.80 / 0.68 / 1.00 / 1.00 | | |
| probes predicting a person in the slot | 0.00 | 0.22 | 0.22 (with quiet), 0.22 (no quiet) |
| weight `(in,the)` → person cells | 0.03 | 0.51 | 0.51 |
| hardness of `(in,the)` → container links (min / mean) | 13.8 / 19.4 | 13.8 / 19.4 | 13.8 / 19.5 |

### Level 2: transitivity

The prompt is `. the X is in the ___`. Learning is off. The "in context" rows feed `X in Y . Y in Z .` immediately before the prompt.

| | → Z | → Y | → another room |
|---|---|---|---|
| training chains (X in Z was shown) | 90% | 10% | 0% |
| **test chains** | **0%** | **98%** | 0% |
| test chains, premises in context | 0% | 98% | 0% |
| test chains, quiet periods throughout and at the end | 0% | 96% | 0% |
| control: `Y in ___` → Z | 100% | | |

In the quiet runs there were 600 replays in total across seeds. 158 of them passed through a test X, and only 2 ran X…Y…Z.

## What it suggests

- **The template hardens and the pairings stay soft.** Filler-independent links are 100% hard (median h 178–265). Particular subject × slot → filler pairings are 86% soft (63% at h=1). The fixed threshold sits between them. Links tied to a particular filler *word* (`the→o7`, `o7→is`) also harden, because each word recurs. That is arguably right: they are facts about the word, not about the relation.
- **But "the right kind of filler" is not learnt.** Unseen fillers get the slot's frequency prior. Held-out containers are told to go into a container, not a room: 67% wrong kind. The mechanism has no state that stands for a kind. Codes are random, so `spoon` shares nothing with `key` however similarly they are used. The subject held state is the word itself, so (subject × slot) links cannot transfer. Positional controls work only because there the slot alone determines the kind.
- **Breaking a template does not reheat it, and quiet makes no difference.** Heat at the slot is already about 0.8 on ordinary sentences, because the next *word* is unpredictable even when its kind is right. So a wrong-kind filler (heat 1.0) is barely distinguishable from normal. Hard template links (melt about 6) never melt at heat ≤ 1. The break is simply added as new soft links: 22% of probes now predict a person, and the template stays intact beside them ("growing, not overwriting"). Quiet replay didn't touch it: 0.22 → 0.22.
- **Level 2 fails completely, and the failure is specific.**
  - The automaton recalls the stored episode, X → Y (98%), and the world fact Y → Z (100%), but never composes them (0%).
  - For training chains it is memorising the later `X in Z` sentence (90%), not learning a rule.
  - Replay doesn't join them either. The subject state is released at `.`, so in any replay that runs "X is in Y . the Y is in Z" the subject held while Z arrives is Y, not X. No link from X's state to Z can form.
  - Sketch 04's quiet joining worked because the episode state was held across both halves. Here no held state spans the two sentences.

## What the mechanism lacked (described, not built)

1. **Kind states for level 1.** Something must make words with similar usage share cells. In theory terms, that would be an assembly that settles the shared contexts of `key`, `cup`, `spoon` (what brings them on, what they bring on) and becomes part of their state. Nothing in the current rule grows such an assembly, because codes are given and never reshaped. This is a missing *learning* outcome, not a missing held state, and I don't see a minimal fix that adds no new machinery.
2. **One more held state for level 2: a slow "topic" state.** It would be set by the subject like the current one, but would *not* be released at `.`. It would change at its own slower rate: in sketch 04's terms, a context machine that outlasts the sentence. Then `X in Y . Y in Z .` (or a replay that chains through Y) would have X held while Z arrives, and the ordinary rule would lay down (topic X × `in the`) → Z. That is the same join sketch 04 got from its held episode state.
   - This would give "X in Z" only for chains replayed or seen in sequence. It is still a join, not a rule.
   - A true rule ("in" is transitive for any X) would need that join to be made from kind-level states (point 1), so that it hardens across chains instead of staying per-chain and soft.
   - So I expect the topic state to fix the in-context and post-quiet test only, and not general transitivity.

## Ways it could be fooling us

- **The subject state is told when to switch.** It is set by "noun after `. the`" and released at `.`, just as sketch 04's episode machine was told episode boundaries. That boundary rule is exactly what kills level 2, and it was a design choice, not a discovery.
- **Slot heat of about 0.8 at baseline is a property of measuring heat at the word level.** If heat were measured against a kind, a break would stand out. But kind isn't available (point 1), so the reheating test was close to doomed by construction.
- **Replay falls into attractors.** Most replays run to the most common container-in-room sentence and loop on it (see the sample at the end of `run.txt`). Heat-weighted starts don't steer the continuation, so "quiet makes no difference" may partly mean "replay barely visited the relevant pairs" (2 of 600 ran X…Y…Z).
- **Small held-out sets.** There are 4 objects and 3 containers per seed (n = 20 and 15). Level-1 percentages move in 5–7 point steps. The 70% vs 62% "baseline" comparison is within noise.
- **Codes and the conjunctive pool are engineered, as in sketch 04.** Nothing here tests whether the automaton could grow them.
