# Experiment spec: first rungs

Read `README.md` in this folder first. It is the theory. This spec turns its first rungs into something you can build and run. Where the README states a hypothesis, treat it as a direction to explore, not a rule. Where this spec states a constraint, it is fixed.

## Fixed constraints

- **Node.js only, no npm dependencies.** Plain JavaScript (ES modules or CommonJS), Node built-ins only. CPU only.
- **No backpropagation, gradients, loss functions, fitness functions or optimisers.** No global error signal.
- **Local rules only.** A connection or cell changes based on what it can see locally, plus local energy/heat.
- **Online, single pass.** The automaton sees the stream once, one character at a time, and learns as it goes. No training phase, no epochs, no replaying the corpus (internal settling during a quiet period, with no input, is allowed and is part of the theory).
- **Sparse representations.** At any step only a small fraction of cells are active.
- **Deterministic.** All randomness from a seeded PRNG you write. Same seed, same result.
- **Honest measurement.** The harness and baseline must be fair. Never tune the baseline down or the test to suit the model. Failure is a valid, useful result. Report it plainly.

## What to build

In your assigned folder:

```
src/            the automaton and its pieces
harness/        corpus generation, baseline, test runners
run.js          `node run.js` runs everything and writes results/
results/
  results.json  all metrics
  FINDINGS.md   your write-up (see below)
viewer.html     a single self-contained page (no external files) with a
                recorded trace embedded, so a person can SEE it work
```

### The automaton

Implement the core ideas of the README as you interpret them for your assigned design:

- sparse assemblies of cells, formed by co-activity (Hebbian-style), content-addressable
- states that persist until something causes a transition; state machines as assemblies plus transitions
- **energy as misfit**: mismatch between what the automaton predicts/expects and what arrives, and between connected parts that disagree
- **heat from misfit sets local plasticity**; heat is local and spreads along connections
- **cooling freezes**: structure involved while heat falls becomes more permanent (hard to change later)
- **residual heat recruits fresh capacity** rather than overwriting frozen structure
- prediction of the next character comes out of the automaton's own dynamics (e.g. which states/transitions are primed), not from a bolted-on counter

You decide the mechanisms. Keep them as simple as you can. Note every design choice and why in FINDINGS.md.

### The environment

A text stream, one character at a time. Generate the corpus yourself, deterministically from the seed (no network access). Suggested: a small grammar of simple English sentences ("the cat sat on the mat.", "she saw a dog.", etc.) with a vocabulary of roughly 30–80 words, plus a few fixed longer sentences repeated occasionally. Total stream around 20,000–60,000 characters; keep runtime under a few minutes.

### Baseline

An adaptive order-k character model (k = 2 or 3, choose the better of the two and report both) with simple escape/backoff and Laplace smoothing, also online and single pass. This is "counting".

### Tests (rungs from the README)

Run as many as you can, in order. Skipping later ones is fine; say so.

1. **Completion.** Store some patterns, cue with partial/noisy versions, measure recall accuracy. Show how recall degrades as more patterns are stored.
2. **Sequences.** Learn sequences that share a middle section (e.g. "xabcdy" and "zabcdw"), then check whether the automaton predicts the right ending from the start. This is the high-order test.
3. **Noise.** Measure prediction on clean text vs text with inserted/dropped/swapped characters.
4. **Words.** Track how many exposures it takes for common words to form stable (frozen) assemblies.
5. **Prediction.** Prequential bits per character over the whole stream (predict each char before learning from it, as a probability distribution over the alphabet; bpc = mean −log2 p(actual)). Compare with the baseline, both over the full stream and in the final 20%. Also show a few autocompletions from half sentences.
6. **Visible confusion.** Energy on familiar vs novel input (e.g. a seen sentence vs a sentence of unseen words). Plot or tabulate energy over time.
7. **Thinking without data.** If you can: insert a quiet period with no input, let the automaton settle internally, and measure whether bpc on the following text improves compared with a control run without the quiet period (same seed).

### The viewer

`viewer.html`: one file, inline JS/CSS, data embedded. Show a short recorded stretch (a few hundred steps) of the run: the incoming text, heat over time (internal energy line), and a picture of the automaton's state (cells or assemblies coloured by temperature: frozen = cool/solid, hot = warm/flickering). Play/pause and step controls. It must open by double-clicking. Keep it modest; clarity over polish.

### FINDINGS.md

Write for a person, plainly:

- **What I built**: the mechanisms, in a few paragraphs, mapped to the README's ideas
- **Results**: a table per rung, with the baseline alongside where relevant
- **What worked, what didn't**: honestly. Where it lost to counting, say so and say why you think
- **What the theory got right or wrong**: which README hypotheses the run supported, contradicted, or couldn't test
- **Surprises**
- **What I'd try next**

Keep scope tight. A simple design that runs and is honestly measured is worth far more than an ambitious one that doesn't. When finished, make sure `node run.js` runs cleanly from a fresh start.
