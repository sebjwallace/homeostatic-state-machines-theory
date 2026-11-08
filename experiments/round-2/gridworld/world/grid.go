package world

// Grid is the shared substrate of every environment: cells, which cells are
// locked (unwritable), and the agent's body (position and what it carries).
type Grid struct {
	W, H   int
	Cells  []Sym
	Locked []bool // true: the agent's write actions have no effect here
	AgentW []bool // true: the mark on this cell was written by the agent
	MarkT  []int  // step at which the agent wrote the mark on this cell
	AX, AY int
	Carry  Sym // Empty when hands are empty
	T      int // world time (steps elapsed)
}

func NewGrid(w, h int) *Grid {
	g := &Grid{W: w, H: h, Cells: make([]Sym, w*h), Locked: make([]bool, w*h), AgentW: make([]bool, w*h), MarkT: make([]int, w*h)}
	return g
}

func (g *Grid) Clone() *Grid {
	c := *g
	c.Cells = append([]Sym(nil), g.Cells...)
	c.Locked = append([]bool(nil), g.Locked...)
	c.AgentW = append([]bool(nil), g.AgentW...)
	c.MarkT = append([]int(nil), g.MarkT...)
	return &c
}

func (g *Grid) In(x, y int) bool { return x >= 0 && y >= 0 && x < g.W && y < g.H }
func (g *Grid) I(x, y int) int   { return y*g.W + x }
func (g *Grid) At(x, y int) Sym {
	if !g.In(x, y) {
		return Wall
	}
	return g.Cells[g.I(x, y)]
}
func (g *Grid) Agent() int { return g.I(g.AX, g.AY) }

// Set changes a cell's symbol from the world's side (not the agent's).
func (g *Grid) Set(i int, s Sym) {
	g.Cells[i] = s
	g.AgentW[i] = false
}

// Passable: everything but walls can be stood on.
func (g *Grid) Passable(i int) bool { return g.Cells[i] != Wall }

// Move tries to move the agent; returns false if blocked.
func (g *Grid) Move(a Action) bool {
	nx, ny := g.AX+dx[a], g.AY+dy[a]
	if !g.In(nx, ny) || !g.Passable(g.I(nx, ny)) {
		return false
	}
	g.AX, g.AY = nx, ny
	return true
}

// AgentWrite writes s on the agent's cell if the cell is not locked.
func (g *Grid) AgentWrite(s Sym) bool {
	i := g.Agent()
	if g.Locked[i] {
		return false
	}
	g.Cells[i] = s
	g.AgentW[i] = s == Mark
	if s == Mark {
		g.MarkT[i] = g.T
	}
	return true
}

// FloorCells lists passable empty cells (used for placing things).
func (g *Grid) FloorCells() []int {
	var out []int
	for i, s := range g.Cells {
		if s == Empty {
			out = append(out, i)
		}
	}
	return out
}

// Room fills the border with walls and the inside with empty floor.
func (g *Grid) Room() {
	for y := 0; y < g.H; y++ {
		for x := 0; x < g.W; x++ {
			i := g.I(x, y)
			if x == 0 || y == 0 || x == g.W-1 || y == g.H-1 {
				g.Cells[i] = Wall
				g.Locked[i] = true
			} else {
				g.Cells[i] = Empty
			}
		}
	}
}

// BFSStep returns the first move on a shortest path from the agent to any
// cell where goal(i) is true, and the distance. Stay and -1 if unreachable;
// Stay and 0 if the agent is already on a goal cell. Used by oracles only.
func (g *Grid) BFSStep(goal func(i int) bool) (Action, int) {
	start := g.Agent()
	if goal(start) {
		return Stay, 0
	}
	n := g.W * g.H
	first := make([]Action, n)
	dist := make([]int, n)
	for i := range dist {
		dist[i] = -1
	}
	dist[start] = 0
	q := []int{start}
	for len(q) > 0 {
		c := q[0]
		q = q[1:]
		cx, cy := c%g.W, c/g.W
		for a := North; a <= West; a++ {
			nx, ny := cx+dx[a], cy+dy[a]
			if !g.In(nx, ny) {
				continue
			}
			ni := g.I(nx, ny)
			if dist[ni] >= 0 || !g.Passable(ni) {
				continue
			}
			dist[ni] = dist[c] + 1
			if c == start {
				first[ni] = a
			} else {
				first[ni] = first[c]
			}
			if goal(ni) {
				return first[ni], dist[ni]
			}
			q = append(q, ni)
		}
	}
	return Stay, -1
}

// Env is one environment. It owns a grid and decides what is uneasy.
//
// The judge drives each step as: Apply(agent's action), then Evolve() (the
// world's own dynamics and disturbances). Energy is read through Field/Total.
type Env interface {
	Name() string
	Info() Info
	Grid() *Grid
	// Apply performs the agent's action. Returns false if it had no effect
	// (blocked move, locked cell, disallowed action, nothing to take...).
	Apply(a Action) bool
	// Evolve advances the world one step: drift, spread, new disturbances.
	Evolve()
	// Field is the energy (unease) of every cell; Total is its sum.
	// Energy the agent carries is attributed to the agent's cell.
	Field() []float64
	Total() float64
	// Episodes lists every disturbance so far, resolved or not.
	Episodes() []Episode
	// Oracle is a scripted full-information reference policy (not a baseline:
	// it sees the whole map and knows the rules).
	Oracle() Action
	Clone() Env
	// EraseAgentMarks removes every mark the agent wrote (memory test).
	EraseAgentMarks()
	// Counters are environment-specific tallies for the report.
	Counters() map[string]float64
}

// Info describes an environment to the judge and to automata.
type Info struct {
	Name        string
	Desc        string
	Allowed     [NumActions]bool
	SettleLevel float64 // total energy at or below which the world counts as settled
	EpisodeCap  int     // resolution times are capped here for early/late comparison
	Memory      bool    // run the external-memory (mark) test on this env
	Warmup      int     // world steps evolved before the agent arrives, so it enters a disturbed world
}

// Episode is one disturbance: when it arose and when it was resolved.
type Episode struct {
	Start, End int  // End = -1 while unresolved
	ByAgent    bool // resolved by an agent action (vs the world, e.g. burnt out)
}

// Layout seeds and run seeds are separate: Make(layoutSeed, runSeed).
type Maker func(layoutSeed, runSeed uint64) Env

func allow(as ...Action) (out [NumActions]bool) {
	for _, a := range as {
		out[a] = true
	}
	return
}

func sum(xs []float64) float64 {
	s := 0.0
	for _, x := range xs {
		s += x
	}
	return s
}

// eraseAgentMarks is the shared implementation of EraseAgentMarks.
func eraseAgentMarks(g *Grid) {
	for i := range g.Cells {
		if g.AgentW[i] && g.Cells[i] == Mark {
			g.Cells[i] = Empty
			g.AgentW[i] = false
		}
	}
}

// closeEpisode ends the oldest open episode matching pred.
func closeEpisode(eps []Episode, idx int, t int, byAgent bool) {
	if idx >= 0 && idx < len(eps) && eps[idx].End < 0 {
		eps[idx].End = t
		eps[idx].ByAgent = byAgent
	}
}
