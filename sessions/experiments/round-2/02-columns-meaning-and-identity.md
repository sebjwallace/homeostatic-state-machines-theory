# Columns: meaning and identity in one population

*A finding from sketches 17 to 20 of the Homeostatic State Machines project, November 2026.*

## The problem: generalise or remember, but not both

An automaton needs two things from its representations that pull against each other.

- **Generalisation** needs things of the same kind to share structure. If "spoon" and "key" are used alike, what is learnt about one should carry over to the other. With fixed random codes they share nothing, so it can't: sketch 17's automaton never learnt what kind of word belongs in a slot, and new containers got a room only 33% of the time.
- **Remembering particular episodes** needs things to stay distinct. If "spoon" and "key" share cells, a memory about one bleeds into the other.

Sketch 19 showed the tension directly. Learnt, overlapping codes, in which words used alike come to share cells, produced real kinds: new containers got a room 80% of the time. But recall of specific episodes roughly halved, from 98% to 50%, because shared cells blurred them.

## The idea: columns for meaning, cells for identity

Replace each cell with a small population: a **column** of cells.

- **Which columns are active carries meaning.** Words of the same kind share columns. That shared part is the kind: what makes them "a container" or "an animal".
- **Which cell within each column fires carries identity.** When a word's pattern first forms, it claims one little-used cell in each of its columns, and those particular cells are wired to each other. That set of cells is the word's **assembly**. Two words of the same kind share columns but almost never share cells.

So "key" and "cup" overlap at the column level, which lets knowledge about one transfer to the other, but stay separate at the cell level, which keeps memories of each distinct. Two assemblies that share columns can even be active at the same time without blurring, because they occupy different cells.

How often two patterns collide by accident depends on how many cells a column has. With a few cells, collisions are common; with many, they are rare. A column can also grow cells on demand, starting small and adding capacity as new patterns need it.

## How an assembly is found: projection and casting

Recalling an assembly from a partial cue is a settling process.

1. **Projection.** Each active cell sends activity along its connections. Each target cell adds up what arrives. A cell that belongs to the same assembly as many active cells receives a lot; an unrelated cell receives little.
2. **Casting.** Only the strongest cells survive: here, one winning cell per active column and a fixed number of columns overall. Everything else is switched off.
3. **Repeat.** The survivors project again, until the pattern stops changing.

The connections inside an assembly are learnt by plain Hebbian learning: cells of an assembly that are active together strengthen their links to each other. Competition in the casting step is what keeps activity sparse and lets one assembly win over others.

## Evidence

All sketches use the same world: sentences such as "the key is in the tin", with objects, containers, rooms, surfaces and people, whose kinds show only in how the words are used. Five seeds, settings fixed before running.

| | random codes (17) | learnt codes (19) | columns, cell chosen by context (20, first) | **columns, cell per assembly (20)** | **same, learnt settling (20)** |
|---|---|---|---|---|---|
| new containers get a room | 33% | 80% | 100% | **100%** | **87%** (100% on hard links) |
| new objects get a container | 40% | 55% | 75% | **90%** | **90%** |
| specific episodes recalled | 98% | 50% | 52% | **88%** | **84%** |
| memorised facts recalled | 88% | 56% | 46% | **98%** | **92%** |
| cells shared between words of a kind in the same frame | – | – | 1.47 per pair | **0.09** | **0.09** |

What the comparison shows:

- **Choosing the cell by context fails.** In the first column version, the cell within a column was picked by the surrounding sentence frame. Every word in the same frame then fired the same cell, so columns separated frames, not individual words, and recall stayed blurred.
- **Choosing the cell per assembly works.** Words of a kind still share about 1.5 columns but almost no cells. Generalisation by kind holds and episode recall largely recovers, at the same total number of cells.
- **Each level does its own job.** With random codes in the same machinery, recall stays high but kinds don't generalise at all. With learnt columns but only the cell level read, recall stays high but kinds collapse. Kind comes from the columns and identity from the cells, and both levels have to be used.
- **No hand-written rule is needed.** Replacing a written completion rule with learnt Hebbian wiring and settling kept almost all of the result.

## Limits

- **Blending from shared cells.** With 8 cells per column, about a fifth of assembly cells ended up shared between words, and those produced mixtures about a third of the time. Growing columns on demand removed the sharing, so larger capacity should reduce this.
- **Filling in, but not cleaning up.** Given part of an assembly, settling restored the whole of it most of the time (65–86%). Given wrong cells mixed in, it never removed them. The held states add their input every round, and that constant input can outweigh an assembly's own internal pull.
- **One meaning per word.** An ambiguous word, used as both an object and a container, still settled into one kind. A second meaning would need a second assembly, or a code rule that allows graded membership.
- **Joining facts is not addressed.** Combining "X in Y" and "Y in Z" into "X in Z" stayed at 0%; that needs something else.
- **Small samples:** 15 held-out containers and 20 held-out objects, so differences of a few points are noise.

## What it means for the theory

- **An assembly is a state, and now a concrete one:** a particular cell in each of a set of columns.
- **Hardness can separate general from specific** because the two live on different connections: column-level structure is reused by a whole kind and hardens; cell-level links belong to one word or episode and stay soft.
- **Sparsity comes from competition.** Projection and casting keep only the strongest cells, which is what lets assemblies stay distinct and lets one win.

## Reproduce

```
cd sketches/20-columns
node sketch-asm.js      # columns, cell per assembly, completion rule
node sketch-settle.js   # columns, cell per assembly, learnt settling
```

Learnt codes are on by default. Useful flags: `CELLS=1600` for the smaller budget, `GROW=1` to let columns grow cells on demand, `TWO=0` to read cells only (no column level), `TOPIC=1` for the slow topic state. Full notes are in `NOTE.md`.
