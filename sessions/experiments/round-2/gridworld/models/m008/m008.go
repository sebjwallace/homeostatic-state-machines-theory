// Package m008 is the first acting homeostatic automaton (round four).
//
// No reward, no value function, no optimiser. Its only drive is to lower
// energy, and its only learning is what cooling freezes in place. See
// FINDINGS.md for the design mapped to the project README.
//
// Parts, in the README's terms:
//
//   - Held state (a place map). The automaton tracks its own position by dead
//     reckoning and holds, for every place it has seen, the last heat it felt
//     there. Its internal environment energy is the sum of that held heat. A
//     place that leaves the view keeps its heat: looking away does not cool the
//     automaton, only seeing a place settle does ("states persist").
//   - Connections. Two levels, one state machine: context connections
//     (local pattern -> action, shared across places and layouts: the
//     generalists) and place connections (this cell -> action: the
//     specialists). Their sum decides; the more specific one wins by magnitude.
//   - Heat. Local heat sets temperature (how freely actions are chosen) and
//     accumulates at a junction that keeps failing. An own action that raises
//     energy heats the connection that did it; above its melting point the
//     connection loosens.
//   - Cooling remembers what worked. When an own action lowers internal energy
//     (and the drop is real settling, not the repair of heat the automaton made
//     itself), every connection in the current episode freezes a little:
//     weight up and hardness +1. The episode is held by persistence (a take
//     stays involved while the carried thing is held), not by a reward trace.
//   - Earned hardness: melting point = M0 + MK*sqrt(hardness). All-or-nothing:
//     anything that hardened once never changes again.
//   - Anticipation and sinks: places where cooling happened become recurring
//     attractors (keyed by what was carried), with their own hardness; a place
//     that no longer delivers heat melts.
//   - Curiosity: cells seen from two vantage points but never reached pull the
//     automaton when nothing hotter does. Symbols engaged often without ever
//     settling anything become boring.
package m008

import (
	"fmt"
	"math"

	"hsm/gridworld/automaton"
	"hsm/gridworld/world"
)

const (
	mapN   = 64
	origin = 32
	nA     = int(world.NumActions)
	nS     = int(world.NumSyms)
)

// Params are the automaton's knobs (tuned on seeds 101-102 only).
type Params struct {
	W0, WMax     float64 // default weight of an untried connection; ceiling
	Alpha        float64 // how far one cooling moves a weight towards WMax
	Tau0, TauH   float64 // temperature: base, and per unit of junction heat
	TraceDecay   float64 // per-step fading of an episode entry not held by state
	M0, MK       float64 // melting point = M0 + MK*sqrt(hardness)
	HeatHalf     float64 // half-life (steps) of structural heat
	Eps          float64 // smallest energy change that counts
	KHeat        float64 // pull of held heat
	KRecur       float64 // pull of a place where cooling happened
	KSym         float64 // pull of a symbol that took part in settling
	KCur         float64 // pull of incompleteness (seen from two places, not reached)
	D0           float64 // distance softening
	RecurT       float64 // steps for an anticipated place to "refill"
	PruneAge     int     // unused young context connections are pruned after this
	Boring       int     // engagements with a symbol that never settled anything before it is boring
	WorkMin      float64 // smallest felt heat that draws work (satisficing)
	NbWork       bool    // work also when only a neighbour is hot
	AccumJam     bool    // unresolved place heat accumulates instead of decaying
	StaleT       float64 // a held place unseen this long is incomplete again
	KTry         float64 // global feel: pull of places not tried lately (x KCur)
	FlatJam      float64 // jam added to a place by a write that moved no energy
	NoHold       bool    // ablation: internal energy = current felt energy (no held map heat)
	CoolMoves    bool    // ablation: moves made while working can be credited by cooling
	DueFrac      float64 // fraction of RecurT before an anticipated place pulls at all
	StaleK       float64 // pull of long-unchecked held knowledge (x KCur)
	NoFreeze     bool    // control: freezing off (melting point fixed at M0)
	MisfitMin    float64 // smallest unmet expectation that counts as misfit at a place
	NoLearn      bool    // control: learning off from the start (what is built in)
	AllOrNothing bool
}

var Default = Params{
	W0: 1, WMax: 4, Alpha: 0.4, Tau0: 0.35, TauH: 0.4,
	TraceDecay: 0.95, M0: 0.5, MK: 0.6, HeatHalf: 400,
	Eps: 0.1, KHeat: 1, KRecur: 0.6, KSym: 0.8, KCur: 0.25, D0: 4, RecurT: 400,
	PruneAge: 3000, Boring: 30, WorkMin: 0.25, AccumJam: true, KTry: 0.5, MisfitMin: 0.5, DueFrac: 0, StaleK: 0.1, FlatJam: 0.25, StaleT: 2000,
}

type node struct {
	w     [nA]float64
	hard  [nA]float64
	set   [nA]bool
	heat  float64 // junction heat (unresolved misfit here), decays
	heatT int
	used  int
}

type entry struct {
	ctx        uint64
	cell       int
	a          world.Action
	inv        float64
	carry, sym world.Sym
	after      world.Sym // the cell after the action
	eff        bool
	holding    bool
}

// M is the automaton.
type M struct {
	P        Params
	name     string
	rng      *world.Rng
	spec     automaton.Spec
	acts     []world.Action
	learning bool
	freezing bool
	decay    float64

	// structure that persists across layouts
	conns   map[uint64]*node
	assoc   [nS][nS]float64 // [carry][symbol]: symbol took part in settling
	engaged [nS][nS]int

	// held state for this layout: the place map
	x, y          int
	sym           []world.Sym
	known         []bool
	visited       []bool
	heat          []float64
	seenT, visitT []int
	vant          []uint8
	lastVant      []int32
	pw            map[uint64]float64 // place connections: (cell, carried, cell symbol, action)
	recur         [nS][]float64
	rhard         [nS][]float64
	rheat         [nS][]float64
	rheatT        [nS][]int
	coolSym       []world.Sym
	workT         []int
	jam           []float64
	jamT          []int
	minX, maxX    int
	minY, maxY    int
	held          float64 // sum of held heat

	// episode
	trace []entry
	debt  float64

	// last step
	t          int
	t0         int
	lastA      world.Action
	lastCell   int
	lastCarry  world.Sym
	lastSym    world.Sym
	lastCtx    uint64
	lastInConn bool
	lastEffect int
	prevI      float64
	prevFelt   float64
	heading    world.Action
	target     int
	istruct    float64

	// bfs scratch
	dist  []int32
	first []world.Action
	stamp []int32
	gen   int32
	queue []int32

	st map[string]float64
}

// New is the earned-hardness automaton.
func New(seed uint64) automaton.Automaton { return newM(seed, Default, "m008") }

// NewAON is the same automaton with all-or-nothing freezing.
func NewAON(seed uint64) automaton.Automaton {
	p := Default
	p.AllOrNothing = true
	return newM(seed, p, "m008-aon")
}

func newM(seed uint64, p Params, name string) *M {
	m := &M{P: p, name: name, rng: world.NewRng(seed ^ 0x8008), learning: !p.NoLearn, freezing: !p.NoFreeze,
		conns: map[uint64]*node{}, st: map[string]float64{}}
	m.decay = math.Pow(0.5, 1/p.HeatHalf)
	n := mapN * mapN
	m.dist = make([]int32, n)
	m.first = make([]world.Action, n)
	m.stamp = make([]int32, n)
	return m
}

func (m *M) Name() string        { return m.name }
func (m *M) SetLearning(on bool) { m.learning = on }
func (m *M) SetFreezing(on bool) { m.freezing = on }
func (m *M) Energy() float64     { return m.prevI + m.istruct }
func (m *M) cellAt(x, y int) int { return y*mapN + x }
func (m *M) own() int            { return m.cellAt(m.x, m.y) }
func salient(s world.Sym) bool   { return s != world.Empty && s != world.Wall }
func clamp(x, lo, hi float64) float64 {
	if x < lo {
		return lo
	}
	if x > hi {
		return hi
	}
	return x
}

// Enter: a new layout. The place map is held state for one world and starts
// empty; connections, symbol associations and their hardness persist.
func (m *M) Enter(s automaton.Spec) {
	m.spec = s
	m.acts = m.acts[:0]
	for a := world.Action(0); a < world.NumActions; a++ {
		if s.Allowed[a] {
			m.acts = append(m.acts, a)
		}
	}
	n := mapN * mapN
	m.x, m.y = origin, origin
	m.sym = make([]world.Sym, n)
	m.known = make([]bool, n)
	m.visited = make([]bool, n)
	m.heat = make([]float64, n)
	m.seenT = make([]int, n)
	m.visitT = make([]int, n)
	m.vant = make([]uint8, n)
	m.lastVant = make([]int32, n)
	for i := range m.lastVant {
		m.lastVant[i] = -1
	}
	m.pw = map[uint64]float64{}
	for k := range m.recur {
		m.recur[k], m.rhard[k], m.rheat[k], m.rheatT[k] = nil, nil, nil, nil
	}
	m.coolSym = make([]world.Sym, n)
	m.workT = make([]int, n)
	m.jam = make([]float64, n)
	m.jamT = make([]int, n)
	for i := range m.workT {
		m.workT[i] = -1 << 30
	}
	m.minX, m.maxX, m.minY, m.maxY = origin, origin, origin, origin
	m.held = 0
	m.trace = m.trace[:0]
	m.debt = 0
	m.lastA = world.Stay
	m.lastInConn = false
	m.lastEffect = 0
	m.prevI = 0
	m.heading = world.North
	m.target = -1
	m.t0 = m.t
}

func (m *M) recurArr(carry world.Sym) {
	if m.recur[carry] == nil {
		n := mapN * mapN
		m.recur[carry] = make([]float64, n)
		m.rhard[carry] = make([]float64, n)
		m.rheat[carry] = make([]float64, n)
		m.rheatT[carry] = make([]int, n)
	}
}

// ---------------------------------------------------------------------------

func (m *M) Act(p *automaton.Perception) world.Action {
	m.t++
	if m.lastA.IsMove() && p.Moved {
		dx, dy := delta(m.lastA)
		nx, ny := m.x+dx, m.y+dy
		if nx >= 2 && ny >= 2 && nx < mapN-2 && ny < mapN-2 {
			m.x, m.y = nx, ny
		}
	}
	m.perceive(p)
	I := m.held
	if m.spec.Feel == automaton.FeelGlobal || m.P.NoHold {
		// NoHold (ablation): internal energy is just what is felt now; a
		// place that leaves the view stops counting
		I = p.Felt
	}
	if m.t > m.t0+1 {
		m.consequences(p, I)
	}
	m.prevI = I
	m.prevFelt = p.Felt
	m.istruct *= m.decay
	m.debt *= 0.999

	a := m.choose(p)
	c := m.own()
	m.lastA, m.lastCell, m.lastCarry, m.lastSym = a, c, p.Carry, m.sym[c]
	if m.learning && m.t%1000 == 0 {
		m.prune()
	}
	return a
}

func delta(a world.Action) (int, int) {
	switch a {
	case world.North:
		return 0, -1
	case world.South:
		return 0, 1
	case world.East:
		return 1, 0
	case world.West:
		return -1, 0
	}
	return 0, 0
}

// perceive writes the view into the held place map.
func (m *M) perceive(p *automaton.Perception) {
	R := m.spec.Radius
	local := m.spec.Feel == automaton.FeelLocal
	own := m.own()
	k := 0
	for dy := -R; dy <= R; dy++ {
		for dx := -R; dx <= R; dx++ {
			x, y := m.x+dx, m.y+dy
			if x < 0 || y < 0 || x >= mapN || y >= mapN {
				k++
				continue
			}
			c := m.cellAt(x, y)
			s := p.View[k]
			// an anticipated place, unseen for a while, now seen with nothing
			// to settle: the expectation misfits (heat on that place node)
			if r := m.recur[world.Empty]; r != nil && r[c] > 0 && m.learning {
				exp := math.Min(1, float64(m.t-m.seenT[c])/m.P.RecurT)
				var nothing bool
				if local {
					nothing = p.Heat[k] <= 1e-9
				} else {
					nothing = s != m.coolSym[c]
				}
				if exp > m.P.MisfitMin && nothing {
					m.misfitRecur(world.Empty, c, exp)
				}
			}
			m.sym[c] = s
			if !m.known[c] {
				m.known[c] = true
				if x < m.minX {
					m.minX = x
				}
				if x > m.maxX {
					m.maxX = x
				}
				if y < m.minY {
					m.minY = y
				}
				if y > m.maxY {
					m.maxY = y
				}
			}
			m.seenT[c] = m.t
			if m.lastVant[c] != int32(own) && m.vant[c] < 3 {
				m.vant[c]++
				m.lastVant[c] = int32(own)
			}
			if local {
				h := p.Heat[k]
				m.held += h - m.heat[c]
				m.heat[c] = h
			}
			k++
		}
	}
	m.visited[own] = true
	m.visitT[own] = m.t
}

// consequences: what the last action did to internal energy.
func (m *M) consequences(p *automaton.Perception, I float64) {
	dI := I - m.prevI
	nonMove := !m.lastA.IsMove() && m.lastA != world.Stay
	if m.P.CoolMoves && m.lastInConn && m.lastA.IsMove() {
		// ablation: a move made while working counts like any other action
		nonMove = true
	}
	if m.lastInConn && len(m.trace) > 0 {
		m.trace[len(m.trace)-1].eff = p.Moved && m.lastA != world.Stay
		m.trace[len(m.trace)-1].after = m.sym[m.lastCell]
	}
	switch {
	case nonMove && p.Moved && dI <= -m.P.Eps:
		m.cool(-dI)
	case nonMove && p.Moved && dI >= m.P.Eps:
		m.heatEvent(dI)
	case !p.Moved && m.lastA != world.Stay:
		m.noEffect()
	case m.lastA == world.Stay && m.lastInConn:
		m.noEffect()
	case nonMove && p.Moved && m.lastInConn:
		// the write took effect but no energy flowed: the place jams a little
		// (felt as heat on the place, not on the connection)
		m.addJam(m.lastCell, m.P.FlatJam)
	case m.lastA.IsMove():
		m.lastEffect = 0
	}
	if p.Carry != m.lastCarry {
		if p.Carry != world.Empty && m.lastInConn && len(m.trace) > 0 {
			m.trace[len(m.trace)-1].holding = true
		} else if p.Carry == world.Empty {
			for i := range m.trace {
				m.trace[i].holding = false
			}
		}
	}
	if m.lastA.IsMove() && p.Moved {
		if d := m.prevFelt - p.Felt; d > 0 {
			m.st["felt_relief_on_moves"] += d
		}
		if -dI > 0 {
			m.st["internal_relief_on_moves"] += -dI
		}
	}
	// the episode fades unless held by a persisting state
	keep := m.trace[:0]
	for _, e := range m.trace {
		if !e.holding {
			e.inv *= m.P.TraceDecay
		}
		if e.inv >= 0.05 {
			keep = append(keep, e)
		}
	}
	m.trace = keep
	if len(m.trace) > 64 {
		m.trace = m.trace[len(m.trace)-64:]
	}
}

func (m *M) nodeHeat(n *node) float64 {
	if n.heatT != m.t {
		n.heat *= math.Pow(m.decay, float64(m.t-n.heatT))
		n.heatT = m.t
	}
	return n.heat
}

func (m *M) addHeat(n *node, d float64) {
	m.nodeHeat(n)
	n.heat += d
	m.istruct += d
}

// persists: the change entry i made still holds now (the cell shows what the
// action left, and that differs from how the episode found the cell). A mark
// written and wiped again within the episode is not involved.
func (m *M) persists(i int) bool {
	e := m.trace[i]
	before := e.sym
	for _, f := range m.trace[:i] {
		if f.cell == e.cell {
			before = f.sym
			break
		}
	}
	return m.sym[e.cell] == e.after && e.after != before
}

// cool: an own action lowered internal energy.
func (m *M) cool(d float64) {
	real := d - m.debt
	m.debt = math.Max(0, m.debt-d)
	m.lastEffect = -1
	m.st["coolings"]++
	if !m.learning {
		m.trace = m.trace[:0]
		return
	}
	if real > m.P.Eps {
		m.st["settlings"]++
		m.st["settled_energy"] += real
		// involved = what changed the world in this episode (writes that took
		// effect, and anything a held state still carries). Moves only carried
		// the automaton there; they are not frozen.
		for i, e := range m.trace {
			last := i == len(m.trace)-1
			if e.eff && (!e.a.IsMove() || m.P.CoolMoves) && e.a != world.Stay && (last || e.holding) {
				m.harden(e, last)
			}
		}
		// the place where it cooled becomes a sink for this kind of heat
		m.hardenRecur(m.lastCarry, m.lastCell, m.lastSym)
	} else if m.lastInConn {
		// repaying heat it made itself: the repair is kept, nothing else is
		// credited (no hardness: mending own damage is not settling)
		m.st["repairs"]++
		if n := m.conns[m.lastCtx]; n != nil {
			m.bump(n, m.lastA, 0.3)
		}
	}
	for _, e := range m.trace {
		if n := m.conns[e.ctx]; n != nil {
			m.nodeHeat(n)
			m.istruct -= n.heat * 0.7
			n.heat *= 0.3
		}
	}
	m.trace = m.trace[:0]
}

func (m *M) bump(n *node, a world.Action, f float64) {
	if !n.set[a] {
		n.w[a], n.set[a] = m.P.W0, true
	}
	if m.P.AllOrNothing && m.freezing && n.hard[a] > 0 {
		return
	}
	n.w[a] += f * m.P.Alpha * (m.P.WMax - n.w[a])
}

func (m *M) harden(e entry, last bool) {
	n := m.conns[e.ctx]
	if n == nil {
		return
	}
	frozen := m.P.AllOrNothing && m.freezing && n.hard[e.a] > 0
	if !frozen {
		m.bump(n, e.a, e.inv)
	}
	if e.inv > 0.3 {
		n.hard[e.a]++
		m.st["hardenings"]++
	}
	i := pkey(e.cell, e.carry, e.sym, e.a)
	m.pw[i] += 0.5 * m.P.Alpha * e.inv * (m.P.WMax - m.pw[i])
	if (e.holding || last) && salient(e.sym) {
		m.assoc[e.carry][e.sym] += m.P.Alpha * e.inv * (m.P.WMax - m.assoc[e.carry][e.sym])
	}
}

// heatEvent: an own action raised internal energy.
func (m *M) heatEvent(d float64) {
	m.debt += d
	m.lastEffect = 1
	m.addJam(m.lastCell, d)
	m.st["heat_events"]++
	m.st["heat_created"] += d
	if !m.learning || !m.lastInConn {
		return
	}
	if n := m.conns[m.lastCtx]; n != nil {
		m.addHeat(n, d)
		m.melt(n, m.lastA)
	}
	i := pkey(m.lastCell, m.lastCarry, m.lastSym, m.lastA)
	m.pw[i] = math.Max(-m.P.WMax, m.pw[i]-2*d)
	// heat spreads back along the episode: the step that led here warms too
	if len(m.trace) >= 2 {
		e := m.trace[len(m.trace)-2]
		j := pkey(e.cell, e.carry, e.sym, e.a)
		m.pw[j] = math.Max(-m.P.WMax, m.pw[j]-0.5*d*e.inv)
	}
	if len(m.trace) > 0 {
		m.trace = m.trace[:len(m.trace)-1]
	}
}

func (m *M) noEffect() {
	m.lastEffect = 0
	if !m.learning || !m.lastInConn {
		return
	}
	m.addJam(m.lastCell, 0.5)
	i := pkey(m.lastCell, m.lastCarry, m.lastSym, m.lastA)
	m.pw[i] = math.Max(-m.P.WMax, m.pw[i]-0.5)
	if n := m.conns[m.lastCtx]; n != nil {
		m.addHeat(n, 0.2)
		m.melt(n, m.lastA)
	}
}

// melt: a connection at a hot junction loosens if the heat there exceeds its
// melting point. All-or-nothing: hardened once, never again.
func (m *M) melt(n *node, a world.Action) {
	if !n.set[a] {
		n.w[a], n.set[a] = m.P.W0, true
	}
	if m.P.AllOrNothing && m.freezing && n.hard[a] > 0 {
		m.st["frozen_refusals"]++
		return
	}
	mp := m.P.M0
	if m.freezing {
		mp += m.P.MK * math.Sqrt(n.hard[a])
	}
	pl := clamp((m.nodeHeat(n)-mp)/2, 0, 1)
	if pl > 0 {
		n.w[a] -= pl * n.w[a]
		n.hard[a] *= 1 - 0.5*pl
		m.st["melts"]++
	}
}

func (m *M) hardenRecur(carry world.Sym, c int, s world.Sym) {
	m.recurArr(carry)
	r := m.recur[carry]
	frozen := m.P.AllOrNothing && m.freezing && m.rhard[carry][c] > 0
	if !frozen {
		r[c] += m.P.Alpha * (m.P.WMax - r[c])
	}
	m.rhard[carry][c]++
	m.rheat[carry][c] = 0
	m.coolSym[c] = s
}

func (m *M) misfitRecur(carry world.Sym, c int, d float64) {
	// unresolved heat accumulates: it drains only when this place settles
	// something again (hardenRecur), so a jam at a hard place can reach its
	// melting point (sketch 01: a decaying jam plateaus below it)
	h := m.rheat[carry][c]
	if !m.P.AccumJam {
		h *= math.Pow(m.decay, float64(m.t-m.rheatT[carry][c]))
	}
	h += d
	m.rheat[carry][c], m.rheatT[carry][c] = h, m.t
	m.st["place_misfits"]++
	if m.P.AllOrNothing && m.freezing && m.rhard[carry][c] > 0 {
		return
	}
	mp := m.P.M0
	if m.freezing {
		mp += m.P.MK * math.Sqrt(m.rhard[carry][c])
	}
	pl := clamp((h-mp)/2, 0, 1)
	if pl > 0 {
		m.recur[carry][c] -= pl * m.recur[carry][c]
		m.rhard[carry][c] *= 1 - 0.5*pl
		m.st["place_melts"]++
	}
}

// ---------------------------------------------------------------------------
// choosing

func (m *M) interesting(carry, s world.Sym) bool {
	if !salient(s) {
		return false
	}
	return m.assoc[carry][s] > 0.05 || m.engaged[carry][s] < m.P.Boring
}

func (m *M) choose(p *automaton.Perception) world.Action {
	R := m.spec.Radius
	side := m.spec.Side()
	cIdx := R*side + R
	local := m.spec.Feel == automaton.FeelLocal
	carrying := p.Carry != world.Empty
	ownSym := p.View[cIdx]
	nb := [4]int{cIdx - side, cIdx + 1, cIdx + side, cIdx - 1}
	work := false
	own := m.own()
	switch {
	case carrying:
		work = m.interesting(p.Carry, ownSym) && m.jamAt(own) < 1
	case !local && m.jamAt(own) >= 1:
		// a jammed place releases the work there: move on
	case !local && m.t-m.workT[own] > int(m.P.RecurT) && m.prevI > 0:
		// global feel: the whole world is warm; an untried place is worth a try
		work = true
	case local:
		// a trickle is left for later (good enough): only a gap worth closing
		// draws work
		if p.Heat[cIdx] >= m.P.WorkMin {
			work = true
		}
		// a hot neighbour draws work only when its own heat is jammed: work
		// there failed, so the heat spreads to the cells around it
		for d, j := range nb {
			if p.Heat[j] >= m.P.WorkMin && (m.P.NbWork || m.jamAt(m.nbCell(d)) >= 1) {
				work = true
			}
		}
	default:
		if m.interesting(p.Carry, ownSym) {
			work = true
		}
		for _, j := range nb {
			if m.interesting(p.Carry, p.View[j]) {
				work = true
			}
		}
	}
	if work {
		m.workT[own] = m.t
		m.st["work"]++
		return m.selectConn(p, cIdx, nb)
	}
	m.lastInConn = false
	if a, ok := m.navigate(p, cIdx, nb); ok {
		m.st["nav"]++
		return a
	}
	m.st["wander"]++
	return m.wander(p)
}

func (m *M) context(p *automaton.Perception, cIdx int, nb [4]int) (uint64, float64) {
	var h uint64 = 1469598103934665603
	mix := func(v uint64) { h ^= v + 0x9E3779B97F4A7C15 + (h << 6) + (h >> 2); h *= 1099511628211 }
	mix(uint64(p.Carry) + 100)
	mix(uint64(p.View[cIdx]) + 200)
	for _, j := range nb {
		mix(uint64(p.View[j]) + 300)
	}
	mix(uint64(m.lastEffect+1) + 400)
	lh := 0.0
	if p.Heat != nil {
		ch := p.Heat[cIdx]
		lh = ch
		b := uint64(0)
		switch {
		case ch <= 1e-9:
		case ch < 1:
			b = 1
		case ch < 3:
			b = 2
		default:
			b = 3
		}
		mix(500 + b)
		best, dir := 0.0, uint64(0)
		for d, j := range nb {
			if p.Heat[j] > best+1e-9 {
				best, dir = p.Heat[j], uint64(d+1)
			}
		}
		mix(600 + dir)
		lh = math.Max(lh, best)
	}
	return h, lh
}

func (m *M) selectConn(p *automaton.Perception, cIdx int, nb [4]int) world.Action {
	ctx, lh := m.context(p, cIdx, nb)
	n := m.conns[ctx]
	if n == nil {
		n = &node{heatT: m.t}
		m.conns[ctx] = n
	}
	n.used = m.t
	c := m.own()
	tau := m.P.Tau0 + m.P.TauH*math.Min(m.nodeHeat(n), 4)
	var sc [nA]float64
	mx := math.Inf(-1)
	for _, a := range m.acts {
		w := m.P.W0
		if n.set[a] {
			w = n.w[a]
		}
		sc[a] = w + m.pw[pkey(c, p.Carry, p.View[cIdx], a)]
		if sc[a] > mx {
			mx = sc[a]
		}
	}
	tot := 0.0
	for _, a := range m.acts {
		sc[a] = math.Exp((sc[a] - mx) / tau)
		tot += sc[a]
	}
	r := m.rng.Float() * tot
	a := m.acts[len(m.acts)-1]
	for _, b := range m.acts {
		r -= sc[b]
		if r <= 0 {
			a = b
			break
		}
	}
	// unresolved heat accumulates at a junction while work goes on there
	if m.learning {
		m.addHeat(n, 0.01*math.Min(lh, 3))
		m.engaged[p.Carry][p.View[cIdx]]++
		m.trace = append(m.trace, entry{ctx: ctx, cell: c, a: a, inv: 1, carry: p.Carry, sym: p.View[cIdx]})
	}
	m.lastCtx, m.lastInConn = ctx, true
	return a
}

// navigate: walk (BFS over the held map, unknown cells assumed open) towards
// the strongest pull: held heat, a place or symbol where cooling happened, or
// incompleteness.
func (m *M) navigate(p *automaton.Perception, cIdx int, nb [4]int) (world.Action, bool) {
	m.bfs()
	local := m.spec.Feel == automaton.FeelLocal
	carry := p.Carry
	own := m.own()
	rc := m.recur[carry]
	best, bs, tsc := -1, 0.0, 0.0
	for y := m.minY; y <= m.maxY; y++ {
		for x := m.minX; x <= m.maxX; x++ {
			c := m.cellAt(x, y)
			if !m.known[c] || m.stamp[c] != m.gen || c == own {
				continue
			}
			s := 0.0
			if local && carry == world.Empty {
				s += m.P.KHeat * m.heat[c]
			}
			st := float64(m.t - m.visitT[c])
			if local {
				st = float64(m.t - m.seenT[c])
			}
			// anticipation: a place is not due until it has had time to refill;
			// before that it is calm and leaves room for curiosity
			stale := clamp((st/m.P.RecurT-m.P.DueFrac)/(1-m.P.DueFrac), 0, 1)
			if carry != world.Empty {
				stale = 1
			}
			if rc != nil && rc[c] > 0 {
				s += m.P.KRecur * rc[c] * stale
			}
			sy := m.sym[c]
			if carry != world.Empty && salient(sy) && m.assoc[carry][sy] <= 0.05 && m.engaged[carry][sy] < m.P.Boring {
				// held heat with nowhere known to sink: an untried kind of thing
				s += m.P.KCur
			}
			if salient(sy) && m.assoc[carry][sy] > 0.05 {
				vt := m.visitT[c]
				if local {
					vt = m.seenT[c]
				}
				vs := math.Min(1, float64(m.t-vt)/m.P.RecurT)
				if carry != world.Empty || !m.visited[c] {
					vs = 1
				}
				s += m.P.KSym * m.assoc[carry][sy] * vs
			}
			// incompleteness: partly known structure, not reached. A salient
			// thing seen from two places pulls fully; the open edge of the held
			// map pulls in proportion to how many places it was seen from
			if m.P.StaleT > 0 && sy != world.Wall && carry == world.Empty {
				// held knowledge that has not been checked for long is partly
				// known again: a faint pull, weaker than any real one
				if st := float64(m.t - m.seenT[c]); st > m.P.StaleT {
					s += m.P.StaleK * m.P.KCur * math.Min(1, st/(4*m.P.StaleT))
				}
			}
			if !local && m.prevI > 0 && sy != world.Wall && m.t-m.workT[c] > int(m.P.RecurT) {
				// global feel: the gap is felt but not located. A place whose
				// response is unknown (not tried lately) is the missing piece
				s += m.P.KTry * m.P.KCur
			}
			if !m.visited[c] {
				if m.vant[c] >= 2 && m.interesting(carry, sy) {
					s += m.P.KCur
				} else if sy != world.Wall && m.frontier(x, y) {
					s += m.P.KCur * float64(m.vant[c]) / 3
				}
			}
			if s <= 0 {
				continue
			}
			sc := s / (float64(m.dist[c]) + m.P.D0)
			if c == m.target {
				tsc = sc
			}
			if sc > bs {
				best, bs = c, sc
			}
		}
	}
	if best < 0 {
		m.target = -1
		return world.Stay, false
	}
	// the current intention is a held state: it persists until it misfits
	// (its pull is gone) or something much stronger appears
	// (felt heat is not an expectation: it always overrides one)
	if m.target >= 0 && m.target != own && tsc > 0 && bs < 2*tsc && m.heat[m.target] >= m.heat[best] {
		best = m.target
	}
	m.target = best
	return m.first[best], true
}

func (m *M) frontier(x, y int) bool {
	if m.sym[m.cellAt(x, y)] == world.Wall {
		return false
	}
	for _, d := range [4][2]int{{0, -1}, {1, 0}, {0, 1}, {-1, 0}} {
		nx, ny := x+d[0], y+d[1]
		if nx < 0 || ny < 0 || nx >= mapN || ny >= mapN {
			continue
		}
		if !m.known[m.cellAt(nx, ny)] {
			return true
		}
	}
	return false
}

func (m *M) bfs() {
	m.gen++
	own := m.own()
	m.queue = append(m.queue[:0], int32(own))
	m.stamp[own] = m.gen
	m.dist[own] = 0
	m.first[own] = world.Stay
	x0, x1, y0, y1 := m.minX-1, m.maxX+1, m.minY-1, m.maxY+1
	for h := 0; h < len(m.queue); h++ {
		c := int(m.queue[h])
		cx, cy := c%mapN, c/mapN
		for a := world.North; a <= world.West; a++ {
			dx, dy := delta(a)
			nx, ny := cx+dx, cy+dy
			if nx < x0 || nx > x1 || ny < y0 || ny > y1 || nx < 0 || ny < 0 || nx >= mapN || ny >= mapN {
				continue
			}
			j := m.cellAt(nx, ny)
			if m.stamp[j] == m.gen || (m.known[j] && m.sym[j] == world.Wall) {
				continue
			}
			m.stamp[j] = m.gen
			m.dist[j] = m.dist[c] + 1
			if c == own {
				m.first[j] = a
			} else {
				m.first[j] = m.first[c]
			}
			m.queue = append(m.queue, int32(j))
		}
	}
}

func (m *M) wander(p *automaton.Perception) world.Action {
	if !p.Moved || m.rng.Chance(0.15) {
		m.heading = world.Action(1 + m.rng.Intn(4))
	}
	return m.heading
}

// prune drops young context connections (never hardened) unused for long.
func (m *M) prune() {
	for k, n := range m.conns {
		if m.t-n.used < m.P.PruneAge {
			continue
		}
		young := true
		for _, h := range n.hard {
			if h > 0 {
				young = false
				break
			}
		}
		if young {
			delete(m.conns, k)
			m.st["pruned"]++
		}
	}
}

// Quiet: no input, no action. Structural heat cools and unused young
// structure is pruned; nothing else moves.
func (m *M) Quiet(steps int) {
	m.t += steps
	m.istruct *= math.Pow(m.decay, float64(steps))
	m.trace = m.trace[:0]
	if m.learning {
		m.prune()
	}
}

func (m *M) Stats() map[string]float64 {
	out := map[string]float64{}
	for k, v := range m.st {
		out[k] = v
	}
	hard, hsum := 0.0, 0.0
	for _, n := range m.conns {
		for _, h := range n.hard {
			if h > 0 {
				hard++
				hsum += h
			}
		}
	}
	out["contexts"] = float64(len(m.conns))
	out["hard_connections"] = hard
	if hard > 0 {
		out["mean_hardness"] = hsum / hard
	}
	return out
}

// NewWith builds the automaton with explicit parameters (tuning).
func NewWith(seed uint64, p Params, name string) automaton.Automaton { return newM(seed, p, name) }

// SetParam sets one float parameter by name (tuning only).
func SetParam(p *Params, k, v string) {
	var f float64
	fmt.Sscan(v, &f)
	switch k {
	case "W0":
		p.W0 = f
	case "WMax":
		p.WMax = f
	case "Alpha":
		p.Alpha = f
	case "Tau0":
		p.Tau0 = f
	case "TauH":
		p.TauH = f
	case "TraceDecay":
		p.TraceDecay = f
	case "M0":
		p.M0 = f
	case "MK":
		p.MK = f
	case "HeatHalf":
		p.HeatHalf = f
	case "Eps":
		p.Eps = f
	case "KHeat":
		p.KHeat = f
	case "KRecur":
		p.KRecur = f
	case "KSym":
		p.KSym = f
	case "KCur":
		p.KCur = f
	case "D0":
		p.D0 = f
	case "RecurT":
		p.RecurT = f
	case "PruneAge":
		p.PruneAge = int(f)
	case "WorkMin":
		p.WorkMin = f
	case "NbWork":
		p.NbWork = f > 0
	case "AccumJam":
		p.AccumJam = f > 0
	case "StaleT":
		p.StaleT = f
	case "KTry":
		p.KTry = f
	case "FlatJam":
		p.FlatJam = f
	case "NoHold":
		p.NoHold = f > 0
	case "CoolMoves":
		p.CoolMoves = f > 0
	case "AllOrNothing":
		p.AllOrNothing = f > 0
	case "DueFrac":
		p.DueFrac = f
	case "StaleK":
		p.StaleK = f
	case "NoFreeze":
		p.NoFreeze = f > 0
	case "MisfitMin":
		p.MisfitMin = f
	case "NoLearn":
		p.NoLearn = f > 0
	case "Boring":
		p.Boring = int(f)
	}
}

func (m *M) jamAt(c int) float64 {
	if m.jamT[c] != m.t {
		m.jam[c] *= math.Pow(m.decay, float64(m.t-m.jamT[c]))
		m.jamT[c] = m.t
	}
	return m.jam[c]
}

func (m *M) addJam(c int, d float64) { m.jamAt(c); m.jam[c] += d }

func (m *M) nbCell(d int) int {
	switch d {
	case 0:
		return m.cellAt(m.x, m.y-1)
	case 1:
		return m.cellAt(m.x+1, m.y)
	case 2:
		return m.cellAt(m.x, m.y+1)
	}
	return m.cellAt(m.x-1, m.y)
}

func pkey(cell int, carry, sym world.Sym, a world.Action) uint64 {
	return uint64(cell)<<16 | uint64(carry)<<12 | uint64(sym)<<8 | uint64(a)
}

// Forget clears one persisting part (diagnostics only): "assoc", "engaged", "conns".
func (m *M) Forget(part string) {
	switch part {
	case "assoc":
		m.assoc = [nS][nS]float64{}
	case "engaged":
		m.engaged = [nS][nS]int{}
	case "conns":
		m.conns = map[uint64]*node{}
	}
}
