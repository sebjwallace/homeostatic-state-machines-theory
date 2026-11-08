// Package automaton is the boundary between an automaton and its world.
//
// An automaton receives a Perception each step and returns an Action. It
// never sees the environment's state, the true total energy (unless the feel
// mode is global), or the judge. Whatever reports the environment's energy
// sits outside its reach, as the README requires.
package automaton

import "hsm/gridworld/world"

// Feel says how the automaton feels its environment's energy.
type Feel int

const (
	// FeelLocal: per-cell energy of the cells in view; Felt is their sum.
	FeelLocal Feel = iota
	// FeelGlobal: one number, the environment's true total; no per-cell heat.
	FeelGlobal
)

func (f Feel) String() string {
	if f == FeelGlobal {
		return "global"
	}
	return "local"
}

// Spec is what an automaton is told when it enters an environment.
type Spec struct {
	Env     string                 // environment kind, e.g. "maze" (a label; automata may ignore it)
	Radius  int                    // view radius: the view is (2R+1)x(2R+1), centred on the agent
	Feel    Feel                   // local or global
	Allowed [world.NumActions]bool // which actions this environment permits
	NumSyms int                    // size of the symbol alphabet (world.NumSyms)
}

// Side is the width of the view.
func (s Spec) Side() int { return 2*s.Radius + 1 }

// Perception is everything the automaton receives in one step.
type Perception struct {
	Step  int
	View  []world.Sym // Side*Side, row-major, agent at the centre; outside the grid reads as Wall
	Heat  []float64   // FeelLocal: energy of each viewed cell; FeelGlobal: nil
	Felt  float64     // FeelLocal: sum of Heat; FeelGlobal: the environment's total energy
	Carry world.Sym   // what the agent holds (world.Empty if nothing)
	Moved bool        // whether the previous action had an effect (false: bumped a wall, write refused...)
}

// Centre returns the index of the agent's own cell in View/Heat.
func (p *Perception) Centre(s Spec) int { side := s.Side(); return s.Radius*side + s.Radius }

// Automaton is what acts in a world. The judge calls Enter once when the
// automaton is placed into an environment (again on transfer to a new
// layout), then Act once per step. Learning is online: there is no separate
// training phase.
type Automaton interface {
	Name() string
	// Enter places the automaton into an environment. Its structure persists
	// across Enter calls (that is what the transfer test measures).
	Enter(spec Spec)
	// Act receives this step's perception and returns an action. Any action
	// the environment does not allow is treated as Stay.
	Act(p *Perception) world.Action
	// Quiet is a period of n steps with no input and no action.
	Quiet(steps int)
	// SetLearning turns all structural change on or off.
	SetLearning(on bool)
	// SetFreezing turns freezing (structure becoming permanent) on or off.
	SetFreezing(on bool)
	// Stats are free-form numbers for the report (units, frozen, etc.).
	Stats() map[string]float64
	// Energy is the automaton's own internal energy (misfit), recorded in
	// traces beside the environment's energy.
	Energy() float64
}

// Factory builds a fresh automaton from a seed.
type Factory struct {
	Name string
	New  func(seed uint64) Automaton
	// FeelIndependent: the agent ignores felt energy, so it runs once, not
	// once per feel mode (random, idle, oracle).
	FeelIndependent bool
	// Learns: the agent changes with experience (transfer and memory tests
	// are only run for learners).
	Learns bool
	// LocalOnly: run under local feel only (used for qlearn-felt, which is
	// identical to qlearn under global feel).
	LocalOnly bool
}

// Perceive builds a Perception from the world. The judge calls it; automata
// never do.
func Perceive(env world.Env, spec Spec, step int, moved bool, buf *Perception) *Perception {
	g := env.Grid()
	side := spec.Side()
	n := side * side
	if buf == nil {
		buf = &Perception{}
	}
	if cap(buf.View) < n {
		buf.View = make([]world.Sym, n)
	}
	buf.View = buf.View[:n]
	field := env.Field()
	if spec.Feel == FeelLocal {
		if cap(buf.Heat) < n {
			buf.Heat = make([]float64, n)
		}
		buf.Heat = buf.Heat[:n]
	} else {
		buf.Heat = nil
	}
	felt := 0.0
	k := 0
	for y := g.AY - spec.Radius; y <= g.AY+spec.Radius; y++ {
		for x := g.AX - spec.Radius; x <= g.AX+spec.Radius; x++ {
			buf.View[k] = g.At(x, y)
			if spec.Feel == FeelLocal {
				h := 0.0
				if g.In(x, y) {
					h = field[g.I(x, y)]
				}
				buf.Heat[k] = h
				felt += h
			}
			k++
		}
	}
	if spec.Feel == FeelGlobal {
		felt = env.Total()
	}
	buf.Step = step
	buf.Felt = felt
	buf.Carry = g.Carry
	buf.Moved = moved
	return buf
}
