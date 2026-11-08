# Sketch 13: question-driven retrieval (the open gap drives the hop)

The question: sketches 11 and 12 tried to join "key in tin" + "tin in kitchen" during aimless replay. Does it work better to join at **question time**? Here an open question is heat. Retrieval hops to whichever ledger row cools it most, and it stops when the heat drops or reports "unresolved" when it doesn't.

Run: `node qa.js` (env `WORLD=rev`, `TRIAL=fwd|sit|seg`, `SKIPEMPTY=1`). All variants and the sketch 11/12 comparison are in `out.txt`. Hop traces: `node trace13.js`.

## Set-up

- **World.** Sketch 12's world with two changes. (1) Objects, containers and rooms are all neutral `n:` tokens. Rooms no longer arrive through the `where:` machine, and no label separates them. A room differs only in usage: it follows `ev:went` in the "who went where" stories, and it ends a second fact. (2) `WORLD=rev` reverses the word order: `ev:in C ev:is K`, `ev:in R ev:is C`, `ev:went R who:P`.
- **Subject rule.** The first content token since the last clock token (generalised from "directly after a clock token" so it fires in the reversed world). In `rev` the subject is therefore C or R, not K.
- **Automaton.** It lives the stream once with the ordinary rule (`S 1 none`). There is no replay.
- **Question.** subject = X (K for joins, C for direct questions), frame = `ev:went`, meaning "which place-that-one-goes-to?".
  - The frame's support F is the automaton's own learned expectation after `ev:went` from empty held states: cells receiving more than 10% of the maximum input.
  - fit(y) = |code(y) ∩ F| / K.
  - Gap heat = 1 − max fit over the tokens surfaced so far. This is the same overlap-misfit measure as everywhere else.
  - Learned frame fit: rooms 1.00, containers 0.03–0.04. So the room/container distinction is learned from usage.
- **Hop.**
  1. The ledger returns all rows that have a key (situation tokens) equal to a not-yet-used surfaced token. It does no scoring.
  2. For each candidate, a trial surfaces content tokens, and the automaton computes the gap heat that would result.
  3. The lowest heat wins; ties are broken at random. `rand` is the ablation: a random candidate.
  4. HOPS = 4, COOL = 0.5, TRIAL = 3 rows (stopping at a clock token). All three were fixed before the first run.
  5. The answer is the best-fitting surfaced token if heat < COOL. Otherwise the answer is "unresolved".
- **Writes.** Question answering is **read-only**. No weight changes and no ledger rows are written. Damage is therefore zero by construction; nothing is learned from answering.

## Results (5 seeds; 60 join, 20 half-chain, 60 direct questions)

| method / world | join right% (chance 17) | join resolved% | join hops | join end heat | half-chain: confabulated% (end heat) | direct right% (1-hop%) |
|---|---|---|---|---|---|---|
| **pre-registered** gap, trial=fwd, fwd world | 65 | 67 | 1.65 | 0.33 | 0 (0.94) | 98 (98) |
| same, rand pick | 32 | 33 | 1.63 | 0.65 | 0 | 50 |
| **pre-registered** gap, trial=fwd, **rev world** | **0** | 0 | 1.00 | 0.98 | 0 | **0** |
| post hoc: trial=sit (row's situation), fwd | 32 | 100 | 1.97 | 0.00 | **90** (0.00) | 90 |
| post hoc: trial=seg (whole sentence), fwd | **98** | 100 | 1.98 | 0.00 | 0 (0.94) | 98 (98) |
| same, rand pick | 82 | 83 | 1.98 | 0.16 | 0 | 60 |
| post hoc: trial=seg, **rev world** | **97** | 97 | 2.00 | 0.03 | 0 (0.94) | 97 (97) |
| same, rand pick | 33 | 33 | 2.00 | 0.64 | 0 | 30 |
| seg + skip-empty, rand pick, fwd / rev | 98 / 97 | | | | 0 | 65 / 27 |
| sketch 11 tie-break hop (S+C), fwd / rev | 37 / 8 | (learned weights) | | | 15 / 43 (lure, base 15/45) | 98 / 2 |
| sketch 12 settling (S+E), fwd / rev | 15 / 8 | | | | 15 / 45 | 98 / 5 |
| sketch 12 EX, fwd / rev | 32 / 10 | | | | 20 / 35 | 98 / 3 |

Sketch 11/12 rows were run on the same neutral-token world (bottom of `out.txt`). Their questions are scored as learned one-step recall from the forward form "K in ?". In `rev`, the stream never shows that form, so even their direct facts fail. The comparison in `rev` is therefore partly about query form, not only about retrieval.

## What happened

- **Pre-registered result: 65% forward, 0% reversed.** The traces show that every forward failure is the same event. The cue C matches the row *after* C, and that row is a clock token, so a forward trial surfaces nothing. All candidates tie at heat 1, a random empty one is taken, the cue C counts as used, and the search ends. The gap stays honestly hot (resolved 67%, wrong 2%). In the reversed world the room sits *before* C in "ev:in R ev:is C", so a forward-only trial can never reach it. That is the same word-order dependence as sketches 11/12, moved into the trial direction.
- **Post hoc fix 1, `sit`: the trial surfaces the row's recorded situation.** This confabulates. The situation of a row just after a sentence includes the previous sentence's last tokens and `who`. Rooms from unrelated "went" stories surface, cool the gap, and get reported (90% of half-chains answered confidently and wrongly). This is a useful negative: **cooling on any room is not the same as answering.**
- **Post hoc fix 2, `seg`: the trial surfaces the whole sentence (the segment between clock tokens) containing the candidate row.** I also fixed a bug: a clock row was assigned to the next segment rather than the one it closes. Joins then reach 98% (fwd) and 97% (rev). The gap closes in two hops. Half-chains stay hot (0.94) and are reported unresolved in 20/20. Direct questions take one hop.
- **What the gap-driven choice adds.** For direct questions it matters a lot: 98 vs 60 (fwd) and 97 vs 30 (rev). C occurs in two sentences, and only the gap can tell that the one containing a room is the answer. For joins, a random pick that skips candidates surfacing nothing does just as well (98/97). In this world the cue graph from K is tiny: K appears in one sentence, and C in two. So the join comes from *continuing while hot*, and the *choice* barely matters there. The world is too sparse to test choice under real ambiguity (many sentences mentioning C).
- **Word order.** The gap-driven method with a sentence-wide trial survives the reversal (97%), where sketches 11 and 12 collapse (8–10%). The reason is not clever. Nothing in the hop or the frame depends on position within the sentence. The subject rule is irrelevant here, because the question sets the subject directly and the subject is only the first cue.

## Does the set-up encode the answer?

- **Not the transitivity, and not the room/container distinction.** The frame comes from what followed `ev:went` in experience. Its 1.00 vs 0.03 separation is learned. Swap which tokens people "go to" and the frame would follow.
- **I chose the frame token.** "A room" is posed as `ev:went`'s slot. That is the question's content, which the brief allows, but it is a choice made by me.
- **The real structural assumption is the segment boundary.** Clock tokens mark sentence edges in this world, by construction. With `seg`, the procedure is breadth-first search over a sentence co-occurrence graph, with a learned type check as the stop test. That is a sensible thing for the theory to do, but most of the joining work is done by "tokens in the same sentence are associated" plus the ledger lookup. Very little of it comes from the automaton's weights. The automaton contributes the goal (the frame), the stop/report decision (the heat), and the choice when a cue has several sentences.
- **Post hoc caveat.** `seg` and skip-empty were added after seeing the first run, and so was the clock-row bug fix. The pre-registered method (trial=fwd) gave 65% / 0%.

## Verdict

**The idea holds in part, and the part that holds is the important one.**
- Making the open gap the heat gives the right *control*. It keeps going while unresolved, stops when cooled, and says "don't know" honestly on half-chains (0% confabulation, heat stays about 0.94), as long as the trial surfaces only the candidate's own sentence.
- The pre-registered forward trial was order-dependent, and it failed (65% / 0%). The fix that works (whole-sentence trial) relies on sentence boundaries being visible.
- On joins, the gap's candidate *choice* is not distinguishable from random in this sparse world. Its value showed on direct questions.
- Next test: a world where C (and K) appear in several distractor sentences, plus boundaries that are not marked by a clock token, to see whether choice by gap heat carries the join and how segments could be learned.

## Ways it could be fooling us

- 60/20/60 questions per row, but the traces are consistent (every forward-trial failure is the empty-row tie).
- The frame threshold (10%) was fixed before the run. Frame fit is near-binary because codes are random, so the gap heat is close to "has a room surfaced or not".
- One wrong confident join (2%) in the fwd runs. I did not inspect it.
