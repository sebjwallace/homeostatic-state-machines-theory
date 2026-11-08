// Package judge runs automata in environments and measures them. It is the
// only thing that reads the environment's true energy; automata only get
// their perception.
package judge

import (
	"hsm/gridworld/agents"
	"hsm/gridworld/automaton"
	"hsm/gridworld/world"
)

// Runner holds one automaton in one environment and steps them together.
type Runner struct {
	Env   world.Env
	Agent automaton.Automaton
	Spec  automaton.Spec
	T     int // steps taken in this environment
	T0    int // world time when the agent arrived (after warm-up)

	perc   automaton.Perception
	moved  bool
	Series []float32 // true total energy after each step
	Felt   []float32 // what the agent felt each step
	Ledger Ledger
	Trace  *TraceWriter
	snap   []float64
}

// Ledger is the closed-world accounting: where energy came from and went.
type Ledger struct {
	AgentResolved float64 // true energy removed by the agent's own actions
	AgentCreated  float64 // true energy added by the agent's own actions
	WorldAdded    float64 // energy added by the world's dynamics (disturbances, spread, drift)
	WorldRemoved  float64 // energy removed by the world on its own (burn-out, regrowth, relocation)
	FeltRelief    float64 // sum of drops in felt energy between perceptions
	LookAway      float64 // felt relief from moves alone: problems leaving view, not resolved
	Displaced     float64 // energy the agent's actions moved from cell to cell without changing the total
	Integral      float64 // sum over steps of total energy (energy x time)
	MarksWritten  int
	MarksSeenOld  int // steps on which a self-written mark >= 50 steps old was in view
	Steps         int
}

func NewRunner(env world.Env, ag automaton.Automaton, radius int, feel automaton.Feel) *Runner {
	r := &Runner{}
	r.Agent = ag
	if b, ok := ag.(agents.Binder); ok {
		b.Bind(env)
	}
	r.enter(env, radius, feel)
	return r
}

func (r *Runner) enter(env world.Env, radius int, feel automaton.Feel) {
	r.Env = env
	info := env.Info()
	r.Spec = automaton.Spec{Env: info.Name, Radius: radius, Feel: feel, Allowed: info.Allowed, NumSyms: int(world.NumSyms)}
	r.moved = true
	r.T = 0
	r.T0 = env.Grid().T
	r.Agent.Enter(r.Spec)
	if r.Trace != nil {
		r.Trace.Header(r)
	}
}

// Transfer moves the same automaton into a new environment (a new layout).
// Its structure is kept; measurements restart.
func (r *Runner) Transfer(env world.Env) {
	if b, ok := r.Agent.(agents.Binder); ok {
		b.Bind(env)
	}
	r.Series = nil
	r.Felt = nil
	r.Ledger = Ledger{}
	r.enter(env, r.Spec.Radius, r.Spec.Feel)
}

func (r *Runner) feltNow() float64 {
	if r.Spec.Feel == automaton.FeelLocal {
		g := r.Env.Grid()
		f := r.Env.Field()
		s := 0.0
		for y := g.AY - r.Spec.Radius; y <= g.AY+r.Spec.Radius; y++ {
			for x := g.AX - r.Spec.Radius; x <= g.AX+r.Spec.Radius; x++ {
				if g.In(x, y) {
					s += f[g.I(x, y)]
				}
			}
		}
		return s
	}
	return r.Env.Total()
}

// Step runs n steps.
func (r *Runner) Step(n int) {
	g := r.Env.Grid()
	for k := 0; k < n; k++ {
		p := automaton.Perceive(r.Env, r.Spec, r.T, r.moved, &r.perc)
		if len(r.Felt) > 0 {
			if d := float64(r.Felt[len(r.Felt)-1]) - p.Felt; d > 0 {
				r.Ledger.FeltRelief += d
			}
		}
		r.countOldMarks(p)
		a := r.Agent.Act(p)
		if a >= world.NumActions || !r.Spec.Allowed[a] {
			a = world.Stay
		}
		before := r.Env.Total()
		feltBefore := p.Felt
		r.snap = append(r.snap[:0], r.Env.Field()...)
		wasMark := g.Cells[g.Agent()] == world.Mark
		r.moved = r.Env.Apply(a)
		mid := r.Env.Total()
		if a == world.WriteMark && r.moved && !wasMark && g.Cells[g.Agent()] == world.Mark {
			r.Ledger.MarksWritten++
		}
		if f := r.Env.Field(); len(f) == len(r.snap) {
			moved := 0.0
			for i, v := range f {
				d := v - r.snap[i]
				if d < 0 {
					d = -d
				}
				moved += d
			}
			dt := mid - before
			if dt < 0 {
				dt = -dt
			}
			if x := (moved - dt) / 2; x > 1e-9 {
				r.Ledger.Displaced += x
			}
		}
		if d := mid - before; d < 0 {
			r.Ledger.AgentResolved -= d
		} else {
			r.Ledger.AgentCreated += d
		}
		if a.IsMove() && r.moved && r.Spec.Feel == automaton.FeelLocal {
			if d := feltBefore - r.feltNow(); d > 0 && mid == before {
				r.Ledger.LookAway += d
			}
		}
		r.Env.Evolve()
		after := r.Env.Total()
		if d := after - mid; d > 0 {
			r.Ledger.WorldAdded += d
		} else {
			r.Ledger.WorldRemoved -= d
		}
		r.Ledger.Integral += after
		r.Ledger.Steps++
		r.Series = append(r.Series, float32(after))
		r.Felt = append(r.Felt, float32(p.Felt))
		if r.Trace != nil {
			r.Trace.Step(r, a, p.Felt)
		}
		r.T++
	}
}

func (r *Runner) countOldMarks(p *automaton.Perception) {
	g := r.Env.Grid()
	for y := g.AY - r.Spec.Radius; y <= g.AY+r.Spec.Radius; y++ {
		for x := g.AX - r.Spec.Radius; x <= g.AX+r.Spec.Radius; x++ {
			if g.In(x, y) {
				i := g.I(x, y)
				if g.Cells[i] == world.Mark && g.AgentW[i] && g.T-g.MarkT[i] >= 50 {
					r.Ledger.MarksSeenOld++
					return
				}
			}
		}
	}
}

// EraseMarks removes every mark the agent wrote (external memory test).
func (r *Runner) EraseMarks() {
	r.Env.EraseAgentMarks()
	if r.Trace != nil {
		r.Trace.Event(r, "erase agent marks")
	}
}

// NewRunnerTraced is NewRunner with a trace writer attached from step 0.
func NewRunnerTraced(env world.Env, ag automaton.Automaton, radius int, feel automaton.Feel, tw *TraceWriter) *Runner {
	r := &Runner{Agent: ag, Trace: tw}
	if b, ok := ag.(agents.Binder); ok {
		b.Bind(env)
	}
	r.enter(env, radius, feel)
	return r
}
