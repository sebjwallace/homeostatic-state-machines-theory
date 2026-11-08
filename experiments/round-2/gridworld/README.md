# Grid world: environments and judge (round four)

Until round three every experiment was passive prediction of a text stream. Here an automaton **acts** in a world whose **energy lives in the environment**, as the project README describes: an environment is defined by what makes it uneasy and by what an automaton may do in it. This folder holds the world, the judge, the baselines and a replay page. It does not hold an automaton; those plug in through the interface below.

Go 1.24, standard library only. Everything is deterministic from seeds; two full runs give byte-identical `results.json` apart from the timing field.

```
go run ./cmd/judge            # everything: about 40 s on 2 cores; writes results/
go run ./cmd/judge -quick     # 6,000 steps, 2 seeds: a few seconds
go test ./...                 # environment invariants
```

Open `replay.html` in a browser and drop in any file from `results/traces/`.

## The world

A grid of cells. Each cell holds one symbol from a single vocabulary shared by every environment, so one automaton can live in all of them:

| sym | char | meaning |
|---|---|---|
| empty | `.` | floor, grass |
| wall | `#` | impassable, never writable |
| mark | `m` | a mark (written by the agent, or a settled plinth) |
| object | `o` | litter |
| fire | `f` | burning |
| ash | `a` | burnt ground, regrows |
| spring | `w` | a spring |
| bin | `b` | where litter belongs |
| entrance / exit | `E` / `X` | maze ends |
| faded | `d` | a plinth whose mark has faded |

The agent stands on a cell. Actions (index, name): `0 stay, 1 north, 2 east, 3 south, 4 west, 5 mark, 6 clear, 7 take, 8 put`. Writes act on the cell the agent stands on. **Locked** cells ignore writes. Each environment says which actions it allows; a disallowed action counts as `stay`.

Each step: the agent perceives, acts, then the world evolves (drift, spread, new disturbances). Before the agent arrives, each environment runs a warm-up with nobody in it, so the agent enters a world that is already disturbed.

## The environments

Ordered by intended difficulty. Each is a different source of unease, and each has disturbances: nothing is ever permanently solved.

| env | size | what makes it uneasy (energy) | disturbance | allowed |
|---|---|---|---|---|
| **restore** | 12x12 | a faded plinth: 1, growing to 3 the longer it stays faded | a random settled plinth fades about every 90 steps | move, mark, clear |
| **fire** | 14x14 | 1 per burning cell, 0.2 per ash cell | grass ignites (75% at three hotspots); fire spreads to grass, burns 60 steps, ash regrows after 300 | move, clear |
| **litter** | 10x10 | 1 per piece of litter, **wherever it is, including in the agent's hands** | a piece appears about every 250 steps, mostly near two sources | move, take, put |
| **maze** | 15x15 | unmarked cells on the entrance–exit route (felt at the two tips of the marked trail), plus 1 per stray mark | once joined, a run of 2–5 trail marks washes out about every 120 steps | move, mark, clear |
| **wells** | 20x20 | silt on each of four springs, rising steadily to 3 | springs silt continuously; about every 3,000 steps one dries up and a new one wells up elsewhere | move, mark, clear |

What each is for:

- **restore**: simple homeostasis. Something drifts from its settled value and one action restores it. Clear on a settled plinth wipes it, so an agent can also *create* disturbances.
- **fire**: a spreading disturbance. Doing nothing is costly and the world keeps changing. Marks are not allowed (a world of firebreaks would be a cheat).
- **litter**: the **closed-world** test. Carrying litter moves its energy, it does not remove it; only a bin resolves it. An agent feeling only its local view can lower what it feels by carrying litter out of sight, or simply by walking away from it. The accounting shows which.
- **maze**: settled by a **path of marks** joining entrance and exit, not by the agent reaching the exit. A path is structure written into the environment: it persists after the agent leaves, can be eroded, and must be maintained. Reaching the exit is a one-off with no disturbance afterwards. The gap is felt at the two tips of the trail, so the agent can feel where the work is but not which way the route goes. A perfect maze, so the route is unique.
- **wells**: **memory**. Springs are far apart and out of each other's sight, and only felt from close by. Keeping them all clear means remembering where they are and coming back before they get bad. Relocation means the map must be revised. Marks are free, so an agent may use them as signposts; the judge checks whether it does.

Layouts come from a layout seed; world dynamics from a separate run seed. The transfer test uses a different layout seed.

## How the agent feels energy

- **local**: the per-cell energy of the cells in view (`Heat`), and their sum (`Felt`).
- **global**: one number, the environment's true total (`Felt`), and no heat map.

Perception is the 5x5 view around the agent (radius 2; cells off the grid read as wall), what it carries, and whether its last action had an effect. The judge always records the true total, whatever the agent feels. Whatever computes energy sits outside the automaton's reach: it gets numbers, never the environment.

## The interface

```go
// package automaton
type Automaton interface {
    Name() string
    Enter(spec Spec)                 // placed into an environment (again on transfer); structure persists
    Act(p *Perception) world.Action  // one step
    Quiet(steps int)                 // a period with no input and no action
    SetLearning(on bool)
    SetFreezing(on bool)
    Stats() map[string]float64       // free-form, reported
    Energy() float64                 // internal energy, recorded in traces beside the environment's
}

type Spec struct {
    Env     string                   // a label, e.g. "maze"; automata may ignore it
    Radius  int                      // view is (2R+1)x(2R+1)
    Feel    Feel                     // FeelLocal or FeelGlobal
    Allowed [world.NumActions]bool
    NumSyms int
}

type Perception struct {
    Step  int
    View  []world.Sym  // side*side, row-major, agent at the centre
    Heat  []float64    // local feel: energy per viewed cell; global: nil
    Felt  float64      // local: sum of Heat; global: the true total
    Carry world.Sym
    Moved bool         // whether the previous action had an effect
}
```

The `Perception` buffer is reused between steps; copy anything you keep.

### Adding a Go automaton

1. Create a package, e.g. `models/m007/` inside this module (`hsm/gridworld/models/m007`), with a constructor `func New(seed uint64) automaton.Automaton`. Import `hsm/gridworld/automaton` and `hsm/gridworld/world` only; do not import `judge` or reach into an `Env`. Use your own seeded PRNG (`world.NewRng` is available).
2. Add one line to `agents/registry.go`:
   ```go
   {Name: "m007", New: m007.New, Learns: true},
   ```
   `Learns: true` turns on the learning checks (learning off, quiet period). Leave `FeelIndependent` and `LocalOnly` unset so it runs under both feel modes.
3. `go run ./cmd/judge -agents m007,qlearn,reactive,mapper,idle,oracle` for a focused run (keep `idle` and `oracle`: the overview table scales by them), or `go run ./cmd/judge` for everything. Traces: `-trace maze:m007:local:1`.

`agents/simple.go` (random, reactive) is the smallest complete example to copy.

### Adding an automaton in another language: the line protocol

The judge starts your program and talks to it over stdin/stdout. Every message is one line; your program answers every message with exactly one line (flush after each).

| judge sends | you answer |
|---|---|
| `seed <n>` | `ok` |
| `enter <env> <radius> <local\|global> <allowed> <syms>` | `ok` |
| `act <step> <felt> <carry> <moved> <view> [<heat>]` | `<action> [<internal energy>]` |
| `quiet <steps>` | `ok` |
| `learning <0\|1>` | `ok` |
| `freezing <0\|1>` | `ok` |
| `stats` | `key=value key=value ...` (may be empty) |
| `quit` | (exit) |

- `<allowed>`: 9 digits, one per action index, `1` = allowed. Example: `111110100`.
- `<syms>`: the alphabet, `.#mofawbEXd`; a symbol's number is its position.
- `<view>`: side×side characters from `<syms>`, row-major, agent at the centre (index `R*side+R`).
- `<carry>`: one character from `<syms>` (`.` when empty-handed). `<moved>`: `1` or `0`.
- `<heat>`: only under local feel, side×side comma-separated numbers in the same order as `<view>`.
- `<action>`: an index `0..8` or a name (`north`, `mark`, ...). Anything else is `stay`.

Example exchange (maze, local feel), captured from a real run of `qlearn` through `cmd/lineagent`:

```
> seed 104736
< ok
> enter maze 2 local 111111100 .#mofawbEXd
< ok
> act 0 35.5 . 1 ############E#.##.#.##... 0,0,0,0,0,0,0,0,0,0,0,0,35.5,0,0,0,0,0,0,0,0,0,0,0,0
< 1 0
> act 1 35.5 . 0 ############E#.##.#.##... 0,0,0,0,0,0,0,0,0,0,0,0,35.5,0,0,0,0,0,0,0,0,0,0,0,0
< 0 0.1
```

(The agent starts on the entrance in the top-left corner, so most of its view is wall; it tried north, bumped, `moved` came back `0`.)

Run it: `go run ./cmd/judge -ext "myagent=python3 path/to/agent.py"` (several: separate with `;`). `examples/random_agent.py` is a minimal working example. The protocol is checked on every full run: `cmd/lineagent` serves any registered Go agent over the protocol, and the judge confirms Q-learning gives an identical energy series in-process and through the protocol.

## Baselines

| agent | what it is |
|---|---|
| **idle** | never acts: what the world does on its own |
| **random** | uniform over allowed actions |
| **reactive** | hand-written, no learning, knows nothing about any environment: moves towards the hottest felt cell, tries each non-move action there, keeps one that lowers felt energy, wanders with momentum when nothing is hot. Under global feel it has no gradient and wanders. |
| **mapper** | the reactive agent plus an internal map (dead reckoning; remembers walls and where it felt heat; when nothing in view is hot it walks back to the remembered hot place it has not seen for longest). No learning of values. A reference for what memory alone buys, so the memory environment can be checked to reward memory. Local feel only. |
| **qlearn** | tabular Watkins Q(λ). State: the 4-neighbourhood symbols plus own cell, what it carries, whether its last action had an effect, the nearest salient symbol in view and its direction, and a heat summary (local: centre heat bucket and direction of the hottest cell; global: felt total in log buckets and whether it rose or fell). Reward: the drop in felt energy **on the same cells** (under local feel the agent shifts its previous heat map by the move it made, so heat leaving the view is not relief). ε-greedy with ε = max(0.02, 0.3/√visits(state)), optimistic initial values. |
| **qlearn-felt** | the identical learner with the literal reward: drop in total felt energy between steps. Local feel only (under global feel it is the same as qlearn). |
| **oracle** | not a baseline: sees the whole map and follows a scripted policy. A floor to read the others against. |

**Tuning, honestly.** Q-learning's hyperparameters and state encoding were chosen by `go run ./cmd/tune`, a grid of 192 settings (reward, γ, λ, α, optimism, ε scale, view) scored on tuning seeds 101–102 across all environments and both feel modes. Reported seeds are 1–5 and were never used for tuning. The search moved Q-learning from roughly no better than random to the numbers in RESULTS.md; the single largest effect was the reward (same-cells over raw felt drop), the second the smaller 4-neighbourhood state. Environment difficulty was also adjusted on seeds 101–102 (see below). The reactive agent and the mapper were written once and not tuned per environment.

## The judge

For each environment × agent × feel × seed (5 seeds, 20,000 online steps; agents learn as they go, no training phase) it records the true total energy after every step and reports:

- **mean energy**, **first-quarter** and **final-quarter** mean energy (with sd across seeds), and a 20-bin curve.
- **first settle**: the first step at which the world returns to its settle level after being disturbed (median over seeds), and the fraction of time settled.
- **resolve early → late**: mean time to resolve a disturbance that began in the first quarter vs one that began in the last quarter (capped per environment; unresolved counts as the cap). A falling number means it learns to resolve faster.
- **closed-world accounting** per run: energy *resolved* and *created* by the agent's own actions; energy *displaced* (moved from cell to cell by the agent without changing the total, e.g. carrying litter); energy *added* and *removed* by the world's own dynamics; total *felt relief*; and *look-away relief*, the part of felt relief that came from moves alone while the true total did not change. An agent that only moves the disturbance around, or only stops looking at it, shows up here.
- **transfer**: a fresh agent vs the same agent carried over from 20,000 steps in layout A, both for 5,000 steps in a new layout B of the same kind.
- **learning checks** (learners): three futures of 5,000 steps branched after the run: carry on; learning off; a quiet period of 2,000 steps first.
- **external memory** (wells): four futures of 5,000 steps: carry on; erase every mark the agent wrote; replace the agent with a fresh one but keep its marks; both. Plus how many marks it wrote and how often an own mark at least 50 steps old was in view.
- An **overview** table: final-quarter energy scaled so idle = 1 and oracle = 0, and each learner's within-run gain.

Branching futures replay the run from the start with the same seeds (an automaton cannot be cloned through the interface, and runs are deterministic), so an automaton must be deterministic given its seed for these checks to mean anything.

Outputs: `results/RESULTS.md`, `results/results.json` (everything, including per-seed runs and curves), `results/traces/*.jsonl`.

Flags: `-quick`, `-steps N`, `-agents a,b`, `-envs a,b`, `-ext "name=cmd"`, `-trace env:agent:feel:seed[,...]` (or `none`), `-trace-steps N`, `-workers N`, `-out DIR`, `-no-protocol-check`.

## Traces and replay

A trace is JSON lines. Line one is a header with the full grid, locked cells, energy field, agent position, symbol and action names. Each later line is one step with only what changed:

```
{"t":12,"a":5,"x":3,"y":4,"m":1,"E":2.5,"F":1,"I":0.1,"k":0,"c":[i,sym,...],"h":[i,energy,...]}
```

`a` action, `x,y` position after the step, `m` whether it had an effect, `E` true total, `F` felt, `I` internal energy, `k` carried symbol, `c` changed cells, `h` changed energy values. A 20,000-step trace is 1–2 MB.

`replay.html` is self-contained (no network). Load a trace with the file picker or by dropping it, or serve the folder and open `replay.html?trace=path`. It shows the grid, the agent with its view square and recent trail, energy as a heat overlay, and lines for true, felt and internal energy over time; play/pause, step, scrub, speed up to 5,000 steps/s, click the chart to jump. Only the canvas is redrawn per frame, from typed arrays with keyframes every 400 steps. Tested in headless Chrome on 50,000-step traces: about 50–90 ms to load, about 0.1 ms per frame (sequential or random seek), a steady 60 fps during playback, a reconstructed field that matches the recorded totals at every checked step, and no horizontal scroll at phone width.

## Difficulty adjustments made

Calibrated on tuning seeds 101–102 before the reported run:

- **fire** was first so aggressive (spread 3.5%, 16x16) that every agent including the oracle-free ones sat at the same level: nothing separated. Spread was lowered to 1.2%, burning lengthened to 60 steps so a fire can be reached, and the room shrunk.
- **litter** first filled to its cap within a quarter of the run for every agent but the oracle. Spawning was slowed to 1/250 and the room shrunk to 10x10 so carrying to a bin is learnable within a run.
- **restore** first showed faded plinths as plain floor; under local feel only heat gave them away, and Q-learning could not learn it. A visible `faded` symbol was added. This made it easy under local feel (the reactive agent solves it); that is left as the easy rung, and global feel keeps it informative.
- **maze** was enlarged from 6x6 to 7x7 maze cells, and stray marks cost 1 (not 0.25) so marking everywhere is not a cheap way to complete the route.
- **wells**: the mapper was added *because* no baseline used memory, to check that the environment rewards it at all. It does (0.10 of idle against 0.33 for the same agent without a map).

## What the baselines show

See `results/RESULTS.md` for every number. In short: *maze* and *litter* best separate learning from non-learning; *wells* separates memory from no memory; *restore* (global feel) is a gentle learning test; *fire* is won by hand-written agents. No baseline uses its own marks as external memory, so that test is waiting for an automaton that does. And the literal reward the brief describes, the drop in felt energy, teaches a local-feel Q-learner to walk away from trouble: in every environment it ends no better than idle. For the theory, that is the "fake the reading" failure from part four, produced by an ordinary reward signal.

## Layout

```
world/       grid, symbols, the five environments, Prepare (warm-up), oracle policies
automaton/   the Automaton interface, Perception, External (line protocol client)
agents/      idle, random, reactive, mapper, qlearn, oracle; registry.go
judge/       runner, closed-world ledger, metrics, branches, traces, report
cmd/judge/   the main entry point
cmd/lineagent/  serves a registered Go agent over the line protocol
cmd/tune/    the Q-learning hyperparameter search (tuning seeds only)
cmd/probe/   quick calibration printout (tuning seeds only)
examples/    random_agent.py, a line-protocol automaton
replay.html  trace viewer
results/     RESULTS.md, results.json, traces/
```
