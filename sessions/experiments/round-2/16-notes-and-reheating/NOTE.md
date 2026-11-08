# Sketch 16: notes and reheating

Run: `TRACE=1 node notes.js` (about 2.5 min) writes `out.txt`. Post hoc: `DEDUP=1 node notes.js` writes `out_dedup.txt`. The env vars `LS`, `DS` and `NTRS` select cells. This uses sketch 15's world, split, distractor levels, seeds (1–6), walk and scoring unchanged. The code is sketch 15's `learn.js` header followed by new code in `notes.js`.

## Rules (fixed before the first run)

- **Notes.** At the end of each day (the quiet period), every non-place content token seen so far gets a walk using sketch 15's trust-weighted 'explore' choice. The place it reached is written as a ledger row `{src:'inferred', subj, place, kinds}`. Notes are kept in a separate list. The walk index holds only experienced rows, so a note can never be walked as a fact.
- **Resolution** happens only through *experienced* rows. When the subject co-occurs with a place: same place = **confirm**, so each distinct kind on the path gets hardness +1 and heat −1 (floored at 0). A different place = **contradict**, so each distinct kind gets heat +1 and hardness −1 (it melts, floored at 0). The rule is symmetric ±1. Heat decays ×0.8 per quiet period. Notes that are never resolved change nothing.
- **Attention.** In each quiet period the single hottest kind draws attention. Every pending note whose path used that kind is re-derived with the kind barred, and the result is written as another inferred note (tag `re`).
- **Question time.** Hardness first, (hd+1)/(max hd+1) as in sketch 15. Lower heat comes second and gap fit third. Gap heat = 1 − fit × min trust along the path, and the walk answers if it is below 0.5.
- **Post hoc** (after the grid): `DEDUP=1`. When a subject resolves, identical pending notes (same place and same set of kinds) count once rather than once per copy. Re-writing every day piles up duplicate notes, and each copy was cooling or reheating on its own.

## Results (6 seeds; 72 joins / 24 half / 72 direct per cell; chance 17%)

Columns: join right / join wrong-confident / half-chain confabulated / direct right. "S15 count" and "S15 rate" are sketch 15's living, re-run on the same index and RNG as this sketch, so a few cells differ from sketch 15's table by about one RNG draw. For example, L2 D5 24 gives 50/0/42/50 here against 54/29/67/57 in sketch 15.

| L | D | tr | **S16 notes+reheat** | S16 dedup (post hoc) | S15 count | S15 rate | rand walk |
|---|---|---|---|---|---|---|---|
| 2 | 0 | 0 | 83 / 0 / 0 / 83 | 83 / 0 / 0 / 83 | 0 / 0 / 0 / 0 | 0 / 0 / 0 / 0 | 100 / 0 / 0 / 60 |
| 2 | 0 | 12 | 33 / 0 / 0 / 33 | 33 / 0 / 0 / 33 | 100 / 0 / 0 / 100 | 50 / 0 / 0 / 50 | 100 / 0 / 0 / 43 |
| 2 | 0 | 24 | 33 / 0 / 0 / 33 | 50 / 0 / 0 / 50 | 100 / 0 / 0 / 100 | 33 / 0 / 0 / 33 | 100 / 0 / 0 / 42 |
| 2 | 2 | 0 | 22 / 19 / 33 / 38 | 6 / 14 / 21 / 14 | 3 / 8 / 8 / 1 | 0 | 18 / 28 / 71 / 22 |
| 2 | 2 | 12 | 17 / 22 / 42 / 35 | 28 / 22 / 50 / 50 | **100 / 0 / 17 / 100** | 0 | 14 / 39 / 46 / 33 |
| 2 | 2 | 24 | 56 / 17 / 33 / 68 | 40 / 29 / 38 / 53 | 85 / 6 / 21 / 89 | 0 | 18 / 40 / 54 / 28 |
| 2 | 5 | 0 | 17 / 8 / 17 / 24 | 0 / 3 / 4 / 0 | 13 / 46 / 54 / 15 | 0 | 4 / 25 / 42 / 13 |
| 2 | 5 | 4 | 25 / 25 / 46 / 57 | 8 / 32 / 46 / 26 | 25 / 36 / 58 / 25 | 0 | 3 / 25 / 46 / 13 |
| 2 | 5 | 12 | 3 / 25 / 25 / 18 | 25 / 38 / 67 / 67 | 26 / 13 / 42 / 19 | 0 | 7 / 24 / 54 / 14 |
| 2 | 5 | 24 | 14 / 29 / 50 / 35 | 22 / 72 / 96 / 86 | 50 / 0 / 42 / 50 | 0 | 6 / 24 / 29 / 10 |
| 3 | 2 | 12 | 36 / 13 / 13 / 50 | 31 / 44 / 63 / 83 | 75 / 19 / 42 / 79 | 0 | 17 / 44 / 67 / 31 |
| 3 | 2 | 24 | 39 / 24 / 42 / 54 | 22 / 42 / 46 / 67 | **100 / 0 / 38 / 100** | 0 | 10 / 32 / 46 / 28 |
| 3 | 5 | 0 | 18 / 10 / 29 / 19 | 35 / 8 / 29 / 39 | 11 / 64 / 79 / 17 | 0 | 4 / 24 / 42 / 25 |
| 3 | 5 | 12 | 19 / 68 / 83 / 100 | 7 / 28 / 42 / 18 | 18 / 15 / 25 / 17 | 0 | 3 / 22 / 50 / 21 |
| 3 | 5 | 24 | 24 / 22 / 33 / 19 | 10 / 47 / 63 / 67 | 0 / 4 / 4 / 8 | 0 | 8 / 25 / 46 / 24 |

The full grid, including the 4-chain rows, is in `out.txt` / `out_dedup.txt`.

**Per kind at the end: trust / heat, and the confirmation rate during living** (train = 24):

| cell | in | moved | is | near | took | went |
|---|---|---|---|---|---|---|
| L2 D2 | .78 / 131, 18% | .56 / 13, 31% | .56 / 31, 18% | .52 / 73, 19% | .52 / 130, 16% | .52 / 121, 14% |
| L2 D5 | .60 / 172, 17% | .74 / 10, 19% | .68 / 44, 18% | .72 / 132, 16% | .71 / 139, 16% | .71 / 114, 16% |
| L3 D2 | .68 / 183, 15% | .64 / 6, 30% | .40 / 61, 18% | .56 / 117, 17% | .60 / 145, 16% | .60 / 125, 16% |
| L3 D5 | .57 / 199, 13% | .75 / 6, 23% | .60 / 77, 16% | .45 / 158, 18% | .68 / 149, 15% | .70 / 127, 13% |

Confirmation rates and hardness come from `out_rates.txt` (the same 4 cells re-run with those printouts added; the main numbers are identical). Raw hardness at the end (L2 D2 24): in 3.7, the rest 0.2–0.5. At L2 D5 every kind is at 0.0–0.5. The trace over time (in `out.txt`) shows trust wandering between 0.3 and 1.0 for every kind without settling. **`in` is the hottest kind, not the coolest**, and heat simply tracks traffic.

**Notes** (L2 D5 24, per seed): 4188 written plus 2322 re-derived. 467 were confirmed and 2366 contradicted (16% confirmed, which is chance at 1/6). Re-derived notes: 164 confirmed and 798 contradicted (17%), so attention did not produce better notes. The rest stayed pending.

**Source check.** Real confusions = 0, but only by construction: notes live outside the walk index. If notes were read as facts, pending notes duplicating another note's (subject, place) would have "confirmed" each other 0.26 M times per seed at L2 D5 24 (0.66 M at L3 D5). So the source tag carries real weight. Without it the notebook would confirm itself.

## What happened

- **Reheating on contradiction does not break the loop. It replaces it with noise.** With 6 rooms, a walk ending at "some room" is contradicted 5 times out of 6, whatever path it took. A symmetric ±1 rule therefore melts every kind's hardness to about 0 (hd ≤ 0.5 at D5). Trust then reflects the last few lucky resolutions, and the walk is little better than random. The traffic loop is gone, but so is the in-preference that sketch 15's loop gave at D ≤ 2. At L2 D2 with 12–24 training chains, S15 count scores 85–100% joins and S16 scores 17–56%.
- **At D5 it is roughly a wash.** S16 has lower wrong-confidence than S15 count in some cells (L2 D5 0: 8% vs 46%; L3 D5 0: 10% vs 64%) and higher in others (L3 D5 12: 68% vs 15%). All of this sits within a seed-noise band (±8–10 points) on top of trust values that wander. No consistent improvement over sketch 15 or over random on joins.
- **The per-kind confirmation rate is at chance for every kind (13–19%)**, as in sketch 15. The exception is `moved`, at 19–31%, on few samples. `in` is *below* the others at L3. The world never shows that walks through `in` are confirmed more often, because almost every walk mixes kinds, and a correct in-in path and a lucky took-in path both end with an `in` hop. Since `in` is on nearly every path, it collects the most contradictions and becomes the hottest kind.
- **Attention follows heat, but heat points at the wrong kind.** The hottest kind is almost always `in` or `went`, the kinds that touch places. Barring that kind and re-deriving gives notes that are confirmed at 17% (chance). So attention keeps re-examining the one kind that is actually useful.
- **Dedup (post hoc) didn't help.** It cut heat about 3× but left joins the same or worse, and in some cells it raised wrong-confidence (L2 D5 24: 72%).

## Ways it could be fooling us

- **The relation token sits in a fixed slot, marked `ev:`.** The link kind is handed over, as in sketch 15. The sketch only had to learn *which* kind is reliable, and it still couldn't.
- The ±1 symmetric rule against a 1/6 base rate is a design choice that guarantees melting. Asymmetric weights (+5/−1) would just be sketch 15's rate score at a different threshold, and the rate score is at chance (S15 rate column: 0 answers everywhere). I didn't tune them, which is deliberate. Still, a different rule could produce different-looking numbers.
- The cells are noisy and non-monotonic (L2 D5: 17 → 25 → 3 → 14). With 6 seeds and trust values that wander day to day, the end-of-run trust is a snapshot of a random walk. Single cells mean little.
- The D0 "83% right with no training" for S16 is an artefact. Every kind's hardness stays at 0 except whatever `went` got, so trust ties and the walk falls through to heat and gap fit. It is not learning.
- My S15 re-run differs from sketch 15's published numbers by about one RNG draw (it shares an RNG with the other methods). The comparison within this table is fair. Comparing across sketches is only approximate.

## Verdict

Reheating on contradiction stops the rich-get-richer lock-in, but only by melting everything. The underlying problem is unchanged and is now clearer. Credit is per path and per kind, every path ends at some room, and the room is right at the base rate whichever kinds were walked, so no rule built on confirm/contradict of mixed paths can tell `in` from `took`. What would carry the information: single-kind paths, or credit only for the hop that reached the place (the last hop), or a contrast between kinds on the *same* subject's alternative paths. The re-derivation step could supply that contrast, but only if a re-derived note that disagrees with the original immediately counts against one of them, not just when the world resolves it.
