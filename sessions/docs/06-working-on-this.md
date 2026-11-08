# Working on this project

*For anyone, human or AI agent, picking the work up: the ground rules, the conventions, the repository map and how to run things.*

---

## The ground rules

These are the principles the project is held to. A proposed mechanism that breaks one of them is, at best, a temporary stand-in, and should be labelled as one.

1. **No supervision.** Nothing is taught. There are no labels, no right answers fed back, and no "training". The world simply happens to the automaton, as ordinary experience. Avoid the words "teach" and "train" for what the automaton does.
2. **No optimiser, no backprop, no fitness function, no reward.** The only drive is misfit (energy). Heat from misfit sets local plasticity.
3. **Online and local.** It learns in one pass, from the first input. Every change depends only on what is nearby.
4. **It has to learn for itself. No ad hoc rules.** A hand-written rule that decides what the mechanism was supposed to discover proves nothing. If a stand-in is needed to test something downstream, say so plainly and put replacing it on the list.
5. **Sparse and cheap.** CPU only. Only what changes should cost anything. Report the cost: cells active, links changed and cells recruited per step.
6. **Stay with the premise.** The premise is interacting state machines whose states persist, settling by heat. It is easy to drift into building search, retrieval or bookkeeping machinery. When that happens, step back to the core mechanics.
7. **Find independent evidence.** Learning from the automaton's own decisions locks in its early mistakes (sketches 15, 16, 26). Look for a signal that doesn't come from the decision being judged, as co-presence does for identity.

## How experiments are run

- **Sketches first.** Small, cheap JavaScript thought experiments, plain Node, no dependencies. Each runs in seconds to about a minute and tests one idea. Heavy harness rounds are for when an idea is ready to be measured against baselines.
- **Fix settings before running.** Write the set-up and the tests first, then run once. Anything changed afterwards is marked **post hoc** and reported separately.
- **Pre-register a prediction** when it's cheap to (sketch 06 did).
- **Seeds.** Use several seeds (5–10 for sketches) and report pooled numbers. Tune only on separate tuning seeds, if at all.
- **Controls and ablations.** Turn the new mechanism off and show the difference. Include a "designed-in" control where possible (for example, a version with no cell identity).
- **"Ways it could be fooling us".** Every NOTE ends with this section. It has caught bad probes and hidden rule changes more than once.
- **Check the probe.** Make sure the question asked can actually be answered by the thing being tested. Sketch 21's first probe scored the true answer "tin" as wrong.
- **Don't edit earlier sketches.** Copy the code into the new folder (for example, `sketch27-ref.js`) and build on it there.
- **Each sketch folder holds:** `sketch.js` (or several), `NOTE.md` (question, set-up, results tables, what it suggests, ways it could be fooling us, how to run) and `run-*.txt` outputs.
- **Finding documents** (`findings/`) are written when a sketch produces something solid enough to state as a result.
- **Future-experiment documents** (`future-experiments/`) capture ideas that aren't ready to run.

## Conventions for talking about it

- **Quote text the automaton processes:** "key", "grey cat eating". This keeps it clear what is input and what is a concept.
- **Plain language.** The README is written for people, from first principles, with energy at the centre and temperature as the analogy. Explain new results in plain terms first; the jargon can follow.
- **Capacity is cells per column**, not a number of states.
- **Held states are signal**, not noise.
- **Be honest about stand-ins.** If a loop in the code does what settling is supposed to do, say so.

## Language and tooling

| part | language | why |
|---|---|---|
| sketches | plain Node (v18+, tested on v22) | fast to write, nothing to install |
| text-stream judge | Rust (`exp04/harness`) | frozen, fast, verified; tests 1–11 and counting baselines |
| text-stream models | Go (`exp04/external`), connected over a line protocol | quicker to iterate than Rust; go-m006 matches Rust m006 bit for bit |
| gridworld | Go (`gridworld/`) | world, judge, baselines and models in one module; `replay.html` to watch traces |

Earlier Rust models (m003–m006) live in `exp03/` and `exp04/models/`. The first Node models (m001, m002) are in `models/`.

## Repository map

```
README.md                  the theory, from first principles (start here for the ideas)
docs/                      this set: the mental model, the journey, the catalogue, breakthroughs, next steps
readme-history/            earlier versions of the README (v1–v5)
findings/                  results solid enough to state: 01 coordinated machines, 02 columns
future-experiments/        written-up proposals: 01 phase changes, 02 many assemblies per machine
sketches/01-… 28-…          small experiments, each with NOTE.md
EXPERIMENT-01..03.md       write-ups of harness rounds 1–3
SPEC.md                    the round-1 experiment spec
models/                    round 1 Node models (m001, m002)
exp02/, exp03/             round 2 and 3 Rust workspaces
exp04/                     round 4: frozen Rust harness, external Go models, results
  external/                Go models (go-m000 reference, go-m006 port, go-m007 thinking)
  results/RESULTS.md       full results table
gridworld/                 Go world, judge, baselines, m008, replay.html
work-m003 … work-m006/     agents' private working copies from round 2–3 (historical; safe to drop)
```

## Running things

```
# a sketch
cd sketches/28-consolidation && node sketch.js
QUIET=0 node sketch.js            # flags are listed at the top of each NOTE.md

# text harness, all models and baselines
cd exp04/external && go build -o bin/ ./...
cd .. && cargo run --release -p harness --bin run

# gridworld
cd gridworld && go run ./cmd/judge -agents idle,random,reactive,mapper,qlearn,oracle,m008 -out /tmp/gw
```

## Publishing notes

- **Licence:** text is CC BY 4.0, code is Apache 2.0 (see the README).
- **Suggested `.gitignore`:** `target/`, `exp04/external/bin/`, `*.exe`, `*.test`, `results/runs/` (large raw runs), gridworld traces, `node_modules/`, `*.zip`, OS and editor clutter. Keep `Cargo.lock`, and keep `results.json` and `RESULTS.md`.
- Nothing sensitive is in the repository: no keys, no personal data.

## If you are an agent picking this up

Read in this order:
1. [docs/README.md](README.md)
2. [the mental model](01-mental-model.md)
3. [breakthroughs](04-breakthroughs.md)
4. [open questions and next steps](05-open-questions-and-next-steps.md)
5. this file

Then read `findings/` and the NOTE.md of sketches 20, 22, 27 and 28 before writing code. Skim the [journey](02-the-journey.md) to see which directions have already been tried and why they failed. A lot of ground has been covered, and many obvious next ideas have already been tried.

Before running anything long, check with the owner. Prefer a sketch that answers the question in seconds.
