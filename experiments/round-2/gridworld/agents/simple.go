// Package agents holds the baselines: idle, random, reactive, tabular
// Q-learning, and a full-information oracle for reference.
package agents

import (
	"hsm/gridworld/automaton"
	"hsm/gridworld/world"
)

// base gives the no-op parts of the interface.
type base struct {
	spec     automaton.Spec
	learning bool
	freezing bool
	acts     []world.Action // allowed actions
	rng      *world.Rng
}

func (b *base) Enter(s automaton.Spec) {
	b.spec = s
	b.acts = b.acts[:0]
	for a := world.Action(0); a < world.NumActions; a++ {
		if s.Allowed[a] {
			b.acts = append(b.acts, a)
		}
	}
}
func (b *base) Quiet(int)                 {}
func (b *base) SetLearning(on bool)       { b.learning = on }
func (b *base) SetFreezing(on bool)       { b.freezing = on }
func (b *base) Stats() map[string]float64 { return map[string]float64{} }
func (b *base) Energy() float64           { return 0 }

// ---------------------------------------------------------------------------

// Idle never acts. It shows what the world does on its own.
type Idle struct{ base }

func NewIdle(seed uint64) automaton.Automaton        { return &Idle{} }
func (*Idle) Name() string                           { return "idle" }
func (*Idle) Act(*automaton.Perception) world.Action { return world.Stay }

// ---------------------------------------------------------------------------

// Random picks uniformly among allowed actions.
type Random struct{ base }

func NewRandom(seed uint64) automaton.Automaton {
	return &Random{base{rng: world.NewRng(seed ^ 0x7A4D)}}
}
func (*Random) Name() string { return "random" }
func (r *Random) Act(*automaton.Perception) world.Action {
	return r.acts[r.rng.Intn(len(r.acts))]
}

// ---------------------------------------------------------------------------

// Reactive is a hand-written agent with no learning. It moves towards the
// hottest cell it can feel, and when standing on or next to heat it tries the
// non-move actions one by one, keeping to an action while it lowers felt
// energy. With no heat in view it wanders with some momentum. Under global
// feel it has no gradient, so it wanders and tries actions where the felt
// number fell last time it acted (a one-step hill climb).
//
// It knows nothing about any environment: not what a bin, fire or spring is.
type Reactive struct {
	base
	tried    map[world.Action]bool
	lastAct  world.Action
	lastFelt float64
	heading  world.Action
	ignore   int // steps left to ignore heat (after exhausting actions here)
	good     world.Action
}

func NewReactive(seed uint64) automaton.Automaton {
	return &Reactive{base: base{rng: world.NewRng(seed ^ 0x2EAC)}, tried: map[world.Action]bool{}, heading: world.North}
}
func (*Reactive) Name() string { return "reactive" }

func (r *Reactive) Enter(s automaton.Spec) {
	r.base.Enter(s)
	r.tried = map[world.Action]bool{}
	r.lastAct = world.Stay
}

func (r *Reactive) nonMoves() []world.Action {
	var out []world.Action
	for _, a := range r.acts {
		if !a.IsMove() && a != world.Stay {
			out = append(out, a)
		}
	}
	return out
}

func (r *Reactive) wander(p *automaton.Perception) world.Action {
	if !p.Moved || r.rng.Chance(0.2) {
		r.heading = world.Action(1 + r.rng.Intn(4))
	}
	return r.heading
}

func (r *Reactive) Act(p *automaton.Perception) world.Action {
	dropped := p.Felt < r.lastFelt-1e-9
	prev := r.lastAct
	r.lastFelt = p.Felt
	a := r.choose(p, prev, dropped)
	r.lastAct = a
	return a
}

func (r *Reactive) choose(p *automaton.Perception, prev world.Action, dropped bool) world.Action {
	nm := r.nonMoves()
	// keep doing a non-move action that just lowered felt energy
	if !prev.IsMove() && prev != world.Stay && dropped && p.Moved {
		r.good = prev
		r.tried = map[world.Action]bool{prev: true}
		return prev
	}
	if r.spec.Feel == automaton.FeelGlobal {
		// no gradient: wander; after moving, try one untried non-move action
		if prev.IsMove() && len(nm) > 0 && r.rng.Chance(0.5) {
			return nm[r.rng.Intn(len(nm))]
		}
		return r.wander(p)
	}
	if r.ignore > 0 {
		r.ignore--
		return r.wander(p)
	}
	side := r.spec.Side()
	c := p.Centre(r.spec)
	hotHere := p.Heat[c] > 0
	nearHot := hotHere
	for _, d := range [][2]int{{0, -1}, {1, 0}, {0, 1}, {-1, 0}} {
		j := c + d[1]*side + d[0]
		if p.Heat[j] > 0 {
			nearHot = true
		}
	}
	if prev.IsMove() && p.Moved {
		r.tried = map[world.Action]bool{}
	}
	if nearHot {
		for _, a := range nm {
			if !r.tried[a] {
				r.tried[a] = true
				return a
			}
		}
	}
	// move towards the hottest cell in view (not the centre)
	best, bx, by := 0.0, 0, 0
	k := 0
	for y := -r.spec.Radius; y <= r.spec.Radius; y++ {
		for x := -r.spec.Radius; x <= r.spec.Radius; x++ {
			if (x != 0 || y != 0) && p.Heat[k] > best+1e-9 {
				best, bx, by = p.Heat[k], x, y
			} else if (x != 0 || y != 0) && p.Heat[k] > 0 && abs(p.Heat[k]-best) < 1e-9 && r.rng.Chance(0.5) {
				bx, by = x, y
			}
			k++
		}
	}
	if best > 0 && !(hotHere && p.Heat[c] >= best) {
		var cand []world.Action
		if by < 0 {
			cand = append(cand, world.North)
		}
		if by > 0 {
			cand = append(cand, world.South)
		}
		if bx > 0 {
			cand = append(cand, world.East)
		}
		if bx < 0 {
			cand = append(cand, world.West)
		}
		if !p.Moved && r.rng.Chance(0.5) {
			return world.Action(1 + r.rng.Intn(4))
		}
		return cand[r.rng.Intn(len(cand))]
	}
	if nearHot {
		// tried everything here and nothing helped: leave for a few steps
		r.ignore = 3 + r.rng.Intn(4)
		r.tried = map[world.Action]bool{}
	}
	return r.wander(p)
}

func abs(x float64) float64 {
	if x < 0 {
		return -x
	}
	return x
}
