package agents

import (
	"math"

	"hsm/gridworld/automaton"
	"hsm/gridworld/world"
)

// QParams are the Q-learner's knobs. Defaults were tuned on a tuning seed that
// is never used for reporting (see cmd/tune).
type QParams struct {
	Alpha  float64 // learning rate
	Gamma  float64 // discount
	EpsMin float64 // exploration floor
	EpsK   float64 // epsilon = max(EpsMin, EpsK/sqrt(visits of state))
	Optim  float64 // initial Q value for unseen (state, action): optimism
	Lambda float64 // eligibility trace decay (Watkins Q(lambda)); 0 = one-step
	// Reward selects what the reward is:
	//   "felt":  drop in felt energy (prev felt - this felt), as the brief asks
	//   "level": minus felt energy each step (minimise energy over time)
	//   "same":  drop in felt energy measured on the same world cells before and
	//            after the action (the agent shifts its previous heat map by the
	//            move it made), so heat leaving the view is not counted as relief
	Reward string
	// View selects the symbol part of the state: "3x3" (all nine cells) or
	// "plus" (own cell and the four neighbours: fewer states, faster learning).
	View string
}

var DefaultQ = QParams{Alpha: 0.3, Gamma: 0.9, EpsMin: 0.02, EpsK: 0.3, Optim: 1.0, Lambda: 0.8, Reward: "same", View: "plus"}

// FeltQ is the same learner with the literal reward the brief names: the drop
// in total felt energy between steps. Under local feel this also rewards
// walking away from heat (it leaves the view), which is why it does worse.
var FeltQ = func() QParams { p := DefaultQ; p.Reward = "felt"; return p }()

// QLearner is tabular Q-learning over a compact encoding of the local
// perception. It is standard reinforcement learning: an explicit scalar
// reward (the drop in felt energy) and value updates. It is the fair
// comparison for an automaton that claims to need no reward signal.
//
// State: the 3x3 symbols around the agent, what it carries, whether the
// previous action had an effect, and a heat summary. Under local feel the heat
// summary is the quantised heat of the centre cell and the direction (N/E/S/W)
// of the hottest cell in the 5x5 view. Under global feel there is no heat
// map, so the summary is the felt total in log buckets and whether it fell
// on the last step.
type QLearner struct {
	base
	P      QParams
	q      map[uint64]*[world.NumActions]float64
	visits map[uint64]int32
	trace  []traceEntry
	prevS  uint64
	prevA  world.Action
	prevF  float64
	has    bool
	lastTD float64
	steps  int
	name   string
	prevH  []float64
}

type traceEntry struct {
	s uint64
	a world.Action
	e float64
}

func NewQ(p QParams, name string) func(seed uint64) automaton.Automaton {
	return func(seed uint64) automaton.Automaton {
		return &QLearner{base: base{rng: world.NewRng(seed ^ 0x9E1), learning: true, freezing: true}, P: p,
			q: map[uint64]*[world.NumActions]float64{}, visits: map[uint64]int32{}, name: name}
	}
}

func (l *QLearner) Name() string { return l.name }

func (l *QLearner) Enter(s automaton.Spec) {
	l.base.Enter(s)
	l.has = false
	l.trace = l.trace[:0]
}

func bucket(x float64) uint64 {
	if x <= 1e-9 {
		return 0
	}
	b := int(math.Floor(math.Log2(x))) + 4 // 1/8 -> 1, 1 -> 4, 16 -> 8
	if b < 1 {
		b = 1
	}
	if b > 12 {
		b = 12
	}
	return uint64(b)
}

func (l *QLearner) encode(p *automaton.Perception) uint64 {
	side := l.spec.Side()
	c := p.Centre(l.spec)
	var h uint64 = 1469598103934665603
	mix := func(v uint64) { h ^= v + 0x9E3779B97F4A7C15 + (h << 6) + (h >> 2); h *= 1099511628211 }
	for dy := -1; dy <= 1; dy++ {
		for dx := -1; dx <= 1; dx++ {
			if l.P.View == "plus" && dx != 0 && dy != 0 {
				continue
			}
			mix(uint64(p.View[c+dy*side+dx]))
		}
	}
	mix(uint64(p.Carry) + 100)
	// nearest salient symbol (not empty, not wall) in the view, and its direction
	ns, nd, nb := world.Empty, uint64(0), 1<<30
	k0 := 0
	for y := -l.spec.Radius; y <= l.spec.Radius; y++ {
		for x := -l.spec.Radius; x <= l.spec.Radius; x++ {
			sy := p.View[k0]
			k0++
			if (x == 0 && y == 0) || sy == world.Empty || sy == world.Wall {
				continue
			}
			if d := iabs(x) + iabs(y); d < nb {
				nb, ns, nd = d, sy, dir4(x, y)
			}
		}
	}
	mix(700 + uint64(ns)*8 + nd)
	if p.Moved {
		mix(201)
	} else {
		mix(202)
	}
	if l.spec.Feel == automaton.FeelGlobal || p.Heat == nil {
		mix(300 + bucket(p.Felt))
		if p.Felt < l.prevF-1e-9 {
			mix(401)
		} else if p.Felt > l.prevF+1e-9 {
			mix(402)
		}
		return h
	}
	// centre heat, quantised
	mix(500 + bucket(p.Heat[c]))
	// direction of hottest other cell in view
	best, bx, by := 0.0, 0, 0
	k := 0
	for y := -l.spec.Radius; y <= l.spec.Radius; y++ {
		for x := -l.spec.Radius; x <= l.spec.Radius; x++ {
			if (x != 0 || y != 0) && p.Heat[k] > best+1e-9 {
				best, bx, by = p.Heat[k], x, y
			}
			k++
		}
	}
	dir := uint64(0)
	if best > 0 {
		dir = dir4(bx, by)
	}
	mix(600 + dir)
	return h
}

func iabs(x int) int {
	if x < 0 {
		return -x
	}
	return x
}

// dir4 maps an offset to 1..4 (N,E,S,W) by its dominant axis.
func dir4(x, y int) uint64 {
	if iabs(y) >= iabs(x) {
		if y < 0 {
			return 1
		}
		return 3
	}
	if x > 0 {
		return 2
	}
	return 4
}

func (l *QLearner) row(s uint64) *[world.NumActions]float64 {
	r, ok := l.q[s]
	if !ok {
		r = new([world.NumActions]float64)
		for a := range r {
			r[a] = l.P.Optim
		}
		l.q[s] = r
	}
	return r
}

func (l *QLearner) greedy(r *[world.NumActions]float64) (world.Action, float64) {
	best := math.Inf(-1)
	var ties []world.Action
	for _, a := range l.acts {
		v := r[a]
		if v > best+1e-12 {
			best = v
			ties = ties[:0]
			ties = append(ties, a)
		} else if math.Abs(v-best) <= 1e-12 {
			ties = append(ties, a)
		}
	}
	return ties[l.rng.Intn(len(ties))], best
}

func (l *QLearner) Act(p *automaton.Perception) world.Action {
	l.steps++
	s := l.encode(p)
	r := l.row(s)
	ga, gv := l.greedy(r)
	if l.has && l.learning {
		rew := l.prevF - p.Felt
		switch {
		case l.P.Reward == "same" && p.Heat != nil:
			rew = l.sameCells(p)
		case l.P.Reward == "level":
			rew = -p.Felt
		}
		pr := l.row(l.prevS)
		td := rew + l.P.Gamma*gv - pr[l.prevA]
		l.lastTD = td
		// Watkins Q(lambda): accumulate on the trace, replace for the current pair
		l.trace = append(l.trace, traceEntry{l.prevS, l.prevA, 1})
		keep := l.trace[:0]
		for _, t := range l.trace {
			row := l.row(t.s)
			row[t.a] += l.P.Alpha * td * t.e
			t.e *= l.P.Gamma * l.P.Lambda
			if t.e > 0.01 {
				keep = append(keep, t)
			}
		}
		l.trace = keep
	}
	// epsilon-greedy with per-state decaying exploration
	a := ga
	l.visits[s]++
	eps := math.Max(l.P.EpsMin, l.P.EpsK/math.Sqrt(float64(l.visits[s])))
	if !l.learning {
		eps = 0
	}
	if l.rng.Chance(eps) {
		a = l.acts[l.rng.Intn(len(l.acts))]
		if a != ga {
			l.trace = l.trace[:0] // Watkins: cut traces on exploratory actions
		}
	}
	l.prevS, l.prevA, l.prevF, l.has = s, a, p.Felt, true
	l.prevH = append(l.prevH[:0], p.Heat...)
	return a
}

// sameCells: previous heat minus current heat over the cells seen both times.
func (l *QLearner) sameCells(p *automaton.Perception) float64 {
	sx, sy := 0, 0
	if l.prevA.IsMove() && p.Moved {
		switch l.prevA {
		case world.North:
			sy = -1
		case world.South:
			sy = 1
		case world.East:
			sx = 1
		case world.West:
			sx = -1
		}
	}
	side := l.spec.Side()
	d := 0.0
	for y := 0; y < side; y++ {
		for x := 0; x < side; x++ {
			// cell (x,y) in the new view was (x+sx, y+sy) in the old view
			ox, oy := x+sx, y+sy
			if ox < 0 || oy < 0 || ox >= side || oy >= side {
				continue
			}
			d += l.prevH[oy*side+ox] - p.Heat[y*side+x]
		}
	}
	return d
}

func (l *QLearner) Stats() map[string]float64 {
	return map[string]float64{"states": float64(len(l.q)), "steps": float64(l.steps)}
}
func (l *QLearner) Energy() float64 { return math.Abs(l.lastTD) }

// Quiet: no input, no learning to do for a model-free learner.
func (l *QLearner) Quiet(int) {}
