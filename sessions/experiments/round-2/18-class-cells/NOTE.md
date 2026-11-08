# Sketch 18: class cells (m003's shared cells in sketch 17's world)

Run with `node sketch.js` (seeds 1–5, about 75 s). Output is in `run.txt`. `CLASS=0 node sketch.js` turns the class cells off and reproduces sketch 17's `run.txt` line for line (`run-noclass.txt`). `sketch17.js` is the untouched original.

## Part 1: how m003's shared cells formed and what they captured

(From `exp04/models/m003-shared-assemblies/src/lib.rs`.)

- **Trigger.** It happens when the input surprises the model: the character that arrives costs more than 1 bit. Each context cell active at that moment checks three things. It has been visited at least 6 times. It belongs to fewer than 2 shared cells. It has not searched in the last 16 steps. If all three hold, it searches.
- **Where it searches (heat spreads through the input).** The candidates are the up to 48 context cells that recently took the same character. In quiet periods, the hottest uncertain cells search among every cell that ever took that character.
- **What decides a partner.** The partner is the candidate with the highest `sim2`, if that is above 0.55. `sim2` is the overlap of the two cells' next-character histograms, with each shared continuation weighted by the overlap of what follows *that* (two-step likeness). Cells that are suffixes of each other are excluded. Once a partner is found:
  - x joins the partner's shared cell if x's histogram overlaps that cell's output above 0.55;
  - otherwise the partner joins x's shared cell under the same test;
  - otherwise a new shared cell is made, with its counts seeded from both partners.

  Membership weight is that overlap. Every 16 visits, memberships are re-weighed. Those below 0.35 that have not frozen melt away.
- **What it learns from.** A shared cell is a count table. Whenever any of its members is active, it counts the next character. So it pools what follows all its members. It also grows a one-step successor per character, which predicts the character after next.
- **When it speaks.** Members wake it with activation `0.8 · weight · min(1, H/1.5)`, where H is the entropy of the most specific active context cell. So it speaks at branch points, where the specialist is unsure, and stays quiet where the specialist is sure. In the mixture it takes its share of probability first.
- **What kind of grouping results.** A context cell holds at most 2 memberships, each weighted, and a shared cell's predictions are a graded pooled histogram. So the groups are **overlapping soft clusters of contexts, not a partition of words**. What gets grouped is contexts that are followed alike. In m003 these came out as noun classes (`{cat, cow, dog, bird…}` → s/e/r/h), but also as suffix fragments (`rd `, `geon `) and as prepositions or determiners. It is distributional clustering by *what follows*. What precedes a word plays no part.

## Part 2: the port

**Mapping.**
- **Context cells.** These are sketch 17's existing states: the symbol (`w:a`), the sequence pair (`p:a|b`) and the subject pair (`s:S|b`).
- **A cell's "histogram".** This is its current link readout, decoded onto words and normalised.
- **Search.** The trigger is a step heat of at least 0.5. That is the token stand-in for "more than 1 bit": heat is the misfit fraction, and the slot baseline is about 0.8. Everything else is as in m003: the 48-entry ring per arriving word, `sim2` through each cell's child state, the 0.55/0.35 thresholds, at most 2 memberships, min 6 visits, a 16-step search gap, and the same join rules and freezing rate.
- **A class cell.**
  - It is a new random 8-of-3200 code. Its outgoing links are seeded from both partners' readouts, and after that it learns with sketch 17's own rule (heat, hardness, cooling).
  - Its one-step successor is the conjunctive code (class × current word).
  - Activation is `0.8 · w · min(1, H/1.5)`, with H the readout entropy of the most specific active state. It is added into the same kWTA input as the other routes.
- **Quiet periods.** These also run m003's search: the hottest uncertain states search among all states with the same last word.

Nothing else changed.

**Not faithful.**
- m003's per-cell heat is "misfit beyond the cell's own entropy". Here the trigger uses the step's global misfit.
- Histograms are link readouts, not counts.
- Mixing is additive in the kWTA input, not mass-first.
- There is no capacity or cell melting, because sketch 17 has none.

### Results (5 seeds pooled, same settings, seeds and scoring as sketch 17)

| | sketch 17 | **sketch 18** |
|---|---|---|
| hardness: template sym / seq | 100 / 100% hard | 100 / 100% (unchanged) |
| hardness: subj × slot → filler pairings | 14% hard, median 1 | 14%, median 1 (unchanged) |
| L1 held-out object → container (all links) | 40% (room 20, surface 40) | **55%** (room 20, surface 20) |
| L1 held-out object → container (hard links) | 70% | **95%** |
| L1 held-out container → **room** (all / hard) | 33% / 33% | **7% / 7%** (container 87 / 93%) |
| L1 held-out container `is →` in (all / hard) | 67 / 60% | 60 / 60% |
| L1 seen object → container (all / hard) | 100 / 70% | 100 / 100% |
| L1 positional controls | 95–100% | 100% |
| heat at slot: normal / novel right-kind / break #1 / #5 | 0.80 / 0.68 / 1.00 / 1.00 | 0.78 / 0.82 / 1.00 / 1.00 |
| person in slot: before / after break / after quiet | 0 / 0.22 / 0.22 (quiet), 0.22 (no quiet) | 0 / 0.23 / 0.23 (both) |
| `(in,the)` → container hardness, min / mean | 13.8 / 19.4, unchanged | 13.8 / 19.4, unchanged |
| L2 training chains → Z | 90% | 84% (no quiet) / 92% (quiet) |
| **L2 test chains → Z** (plain / premises in context / quiet) | 0 / 0 / 0% | **0 / 0 / 0%** (→ Y 96 / 96 / 94%) |
| L2 control `Y in ___` → Z | 100% | 100 / 98% |
| replays running X…Y…Z | 2 of 600 | 2 of 600 |

On average there are 33 class cells, 199 memberships and 124 states with at least one class per seed.

### Which groups formed

Seed by seed (`run.txt`), the larger groups are the same every time:
- **people**: `{p0…p7, (the,p0)…(the,p7)}`, a clean class on every seed. It predicts has / sat / opened.
- **containers as subject words + some objects**: `{c…, (the,c)…, a few o}`, which predicts `.` / `is`. These are words that end a sentence *or* start "is". Objects that appear mostly at sentence end land in it too.
- **"object + is"**: `{(o,is)…, (S=o, is)…}`, which predicts in / on. This is an object class, but it is made of (object, is) states, not object words. It is the largest group on every seed (30–46 members). Occasionally (c, is) states join it.
- **"subject × the"**: `{(S=o, the), (S=p, the), sometimes (on, the)}`, which predicts container / surface. Many small copies form, and they mix object and person subjects.
- **slot**: `{(opened,the), (in,the)}`, which predicts containers 0.6 and rooms 0.2.

No room class or surface class forms. Rooms and surfaces only ever end a sentence, so the step after them is never hot, and they never search. No *object-word* class forms either. Held-out words' own states joined a class 5% (objects) and 0% (containers) of the time. They are too rarely surprising at the right moment.

So the classes are partly kind-like (people, the "object is" class) and partly positional, of the form "things before `.`". They overlap, but they are effectively discrete sets. None separates objects from containers as *subjects of "in"*, which is the distinction level 1 needs.

### What it suggests

- **The level 1 gain on held-out objects is not "right kind".** At `the heldO is in the ___`, the class cell that is awake is the slot class `{(in,the), (opened,the)}`, woken by the `(in,the)` state on 15 of 20 probes. The rest also have a (subject × the) class. Both push toward containers whoever the subject is. Held-out containers go the same way: rooms fall from 33% to 7%. The class cells sharpen the slot's prior toward its most common kind. A sharper prior helps whichever held-out set matches it and hurts the other. **Net: no transfer of kind from subject to filler.**
- **Why no fix.** m003's mechanism groups states by *what follows them*. The kind distinction that matters here (an object goes in a container, a container goes in a room) shows up only two words after the subject, and only in `in` sentences, which held-out words never take part in. To share a class with `key`, a held-out object's state must be hot and must sit in the ring next to `key`'s state with a similar readout. Its only uses are on/has sentences, where it ends the sentence and isn't hot. So it never joins.
- **The join (level 2) is untouched.** The class cells add no state spanning the `.`, and no X-specific link to Z. 0% everywhere, as predicted.
- **Reheating is unchanged.** The break is again only added beside the template. Quiet periods do nothing, and the hard template doesn't melt. Heat for "novel right-kind" now reaches 0.82, near the break's 1.0. Kind is still not the unit heat is measured against.

### Ways it could be fooling us

- **The port is approximate.** In particular, the search trigger uses the step's global heat, and the histograms are link readouts. A per-state "misfit beyond own entropy" trigger would let low-entropy final words search more. It might then form room or surface classes, but those would not reach held-out subjects either.
- **The held-out sets are small.** That is 20 objects and 15 containers. Still, the 33% → 7% fall on held-out containers is consistent with the probe diagnostic and goes the wrong way for "kind".
- **There is no tuning.** All of m003's thresholds were carried over unchanged.

### Verdict

The mechanism ports and forms classes in this world: a clean person class, an "object + is" class, and slot classes. The classes are distributional groups of *states*, grouped by what follows them. They fix neither "right kind of filler" nor the join. The held-out-object gain (40 → 55%, hard 70 → 95%) is a sharpened slot prior, paid for by held-out containers (room 33 → 7%).

## Files
- `sketch.js`: sketch 17 plus class cells (`CLASS=0` turns them off).
- `run.txt`: the run with class cells.
- `run-noclass.txt`: the run without them, identical to sketch 17.
- `sketch17.js`: the untouched original.
