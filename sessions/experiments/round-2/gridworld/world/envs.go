package world

import "math"

// ---------------------------------------------------------------------------
// 1. Restore: simple homeostasis.
//
// A room with a few plinths. A settled plinth holds a mark. Now and then a
// plinth's mark fades (the cell shows a faded mark). A faded plinth is uneasy,
// and its unease grows the longer it stays faded. Writing a mark on it
// restores it. Every other cell is locked, so writing anywhere else does
// nothing. This is the easy rung: the drift is visible and local.
// ---------------------------------------------------------------------------

type Restore struct {
	base
	plinths []int
	faded   map[int]int // plinth cell -> step it faded
	epOf    map[int]int // plinth cell -> episode index
	pFade   float64
}

func NewRestore(layoutSeed, runSeed uint64) Env {
	lr := NewRng(layoutSeed ^ 0x5157)
	g := NewGrid(12, 12)
	g.Room()
	scatterWalls(g, lr, 3)
	for i := range g.Locked {
		g.Locked[i] = true
	}
	e := &Restore{faded: map[int]int{}, epOf: map[int]int{}, pFade: 1.0 / 90}
	var chosen []int
	for k := 0; k < 4; k++ {
		c := pickFloor(g, lr, chosen, 5)
		chosen = append(chosen, c)
		g.Cells[c] = Mark
		g.Locked[c] = false
	}
	e.plinths = chosen
	g.AX, g.AY = pickXY(g, lr)
	e.base = base{g: g, rng: NewRng(runSeed ^ 0xA11), counts: map[string]float64{}, dirty: true,
		info: Info{Name: "restore", Desc: "plinths fade; write a mark to restore them",
			Allowed: allow(Stay, North, East, South, West, WriteMark, Clear), SettleLevel: 0.0, EpisodeCap: 600, Warmup: 1000}}
	return e
}

func pickXY(g *Grid, r *Rng) (int, int) {
	f := g.FloorCells()
	c := f[r.Intn(len(f))]
	return c % g.W, c / g.W
}

func (e *Restore) Clone() Env {
	c := *e
	c.base = e.cloneBase()
	c.faded = map[int]int{}
	for k, v := range e.faded {
		c.faded[k] = v
	}
	c.epOf = map[int]int{}
	for k, v := range e.epOf {
		c.epOf[k] = v
	}
	return &c
}

func (e *Restore) Apply(a Action) bool {
	g := e.g
	e.dirty = true
	if !e.info.Allowed[a] {
		return false
	}
	switch a {
	case WriteMark, Clear:
		i := g.Agent()
		if g.Locked[i] {
			return false
		}
		if a == WriteMark && g.Cells[i] == Faded {
			g.Cells[i] = Mark
			if _, ok := e.faded[i]; ok {
				delete(e.faded, i)
				closeEpisode(e.eps, e.epOf[i], g.T, true)
				e.counts["restored"]++
			}
			return true
		}
		if a == Clear && g.Cells[i] == Mark {
			// wiping a settled plinth: the agent causes a disturbance
			g.Cells[i] = Faded
			e.faded[i] = g.T
			e.epOf[i] = e.open(g.T)
			e.counts["wiped_by_agent"]++
			return true
		}
		return false
	}
	return e.applyMove(a)
}

func (e *Restore) Evolve() {
	g := e.g
	g.T++
	e.dirty = true
	if e.rng.Chance(e.pFade) {
		var settled []int
		for _, p := range e.plinths {
			if g.Cells[p] == Mark {
				settled = append(settled, p)
			}
		}
		if len(settled) > 0 {
			p := settled[e.rng.Intn(len(settled))]
			g.Set(p, Faded)
			e.faded[p] = g.T
			e.epOf[p] = e.open(g.T)
			e.counts["faded"]++
		}
	}
}

func (e *Restore) Field() []float64 {
	if !e.dirty {
		return e.field
	}
	g := e.g
	if e.field == nil {
		e.field = make([]float64, g.W*g.H)
	}
	for i := range e.field {
		e.field[i] = 0
	}
	for p, t0 := range e.faded {
		e.field[p] = math.Min(3, 1+float64(g.T-t0)/150)
	}
	e.total = sum(e.field)
	e.dirty = false
	return e.field
}
func (e *Restore) Total() float64 { e.Field(); return e.total }

func (e *Restore) Oracle() Action {
	g := e.g
	if _, ok := e.faded[g.Agent()]; ok {
		return WriteMark
	}
	a, _ := g.BFSStep(func(i int) bool { _, ok := e.faded[i]; return ok })
	return a
}

// ---------------------------------------------------------------------------
// 2. Maze: uneasy until a trail of marks joins entrance to exit.
//
// A perfect maze (one route). Energy = number of unmarked cells on the route
// (the gap) + 1 per stray mark (a mark off the route: noise the agent
// added). The gap's energy is felt at the two tips: the last cell of the
// unbroken marked chain growing from the entrance, and the one growing from
// the exit. So the agent can feel where the work is, not which way to go.
// Once joined, the trail erodes: now and then a short run of route marks
// washes out, and the maze is uneasy again.
// ---------------------------------------------------------------------------

type Maze struct {
	base
	ent, exit int
	route     []int // entrance..exit inclusive
	onRoute   []bool
	gapOpen   int // episode index while gap > 0, else -1
	pErode    float64
	gap       int
	stray     int
}

func NewMaze(layoutSeed, runSeed uint64) Env {
	lr := NewRng(layoutSeed ^ 0x3A2E)
	const cw, ch = 7, 7 // maze cells; grid is 2*c+1
	g := NewGrid(2*cw+1, 2*ch+1)
	for i := range g.Cells {
		g.Cells[i] = Wall
		g.Locked[i] = true
	}
	// iterative DFS carve
	vis := make([]bool, cw*ch)
	stack := []int{0}
	vis[0] = true
	open := func(cx, cy int) { i := g.I(2*cx+1, 2*cy+1); g.Cells[i] = Empty; g.Locked[i] = false }
	open(0, 0)
	for len(stack) > 0 {
		c := stack[len(stack)-1]
		cx, cy := c%cw, c/cw
		var nb []int
		for a := North; a <= West; a++ {
			nx, ny := cx+dx[a], cy+dy[a]
			if nx >= 0 && ny >= 0 && nx < cw && ny < ch && !vis[ny*cw+nx] {
				nb = append(nb, int(a))
			}
		}
		if len(nb) == 0 {
			stack = stack[:len(stack)-1]
			continue
		}
		a := nb[lr.Intn(len(nb))]
		nx, ny := cx+dx[a], cy+dy[a]
		w := g.I(2*cx+1+dx[a], 2*cy+1+dy[a])
		g.Cells[w] = Empty
		g.Locked[w] = false
		open(nx, ny)
		vis[ny*cw+nx] = true
		stack = append(stack, ny*cw+nx)
	}
	// a few extra openings would create loops; keep it perfect so the route is unique.
	// entrance and exit on opposite corners, chosen per layout
	corners := [][2]int{{1, 1}, {g.W - 2, 1}, {1, g.H - 2}, {g.W - 2, g.H - 2}}
	k := lr.Intn(4)
	e := &Maze{gapOpen: -1, pErode: 1.0 / 120}
	e.ent = g.I(corners[k][0], corners[k][1])
	e.exit = g.I(corners[3-k][0], corners[3-k][1])
	g.Cells[e.ent] = Entrance
	g.Cells[e.exit] = Exit
	g.Locked[e.ent] = true
	g.Locked[e.exit] = true
	g.AX, g.AY = e.ent%g.W, e.ent/g.W
	e.route = mazeRoute(g, e.ent, e.exit)
	e.onRoute = make([]bool, g.W*g.H)
	for _, c := range e.route {
		e.onRoute[c] = true
	}
	e.base = base{g: g, rng: NewRng(runSeed ^ 0xBEE), counts: map[string]float64{}, dirty: true,
		info: Info{Name: "maze", Desc: "join entrance to exit with a trail of marks; the trail erodes",
			Allowed: allow(Stay, North, East, South, West, WriteMark, Clear), SettleLevel: 0.0, EpisodeCap: 1500}}
	e.gapOpen = e.open(0)
	return e
}

func mazeRoute(g *Grid, from, to int) []int {
	prev := make([]int, g.W*g.H)
	for i := range prev {
		prev[i] = -2
	}
	prev[from] = -1
	q := []int{from}
	for len(q) > 0 {
		c := q[0]
		q = q[1:]
		if c == to {
			break
		}
		neighbours4(g, c, func(j int) {
			if prev[j] == -2 && g.Cells[j] != Wall {
				prev[j] = c
				q = append(q, j)
			}
		})
	}
	var r []int
	for c := to; c >= 0; c = prev[c] {
		r = append([]int{c}, r...)
	}
	return r
}

func (e *Maze) Clone() Env {
	c := *e
	c.base = e.cloneBase()
	return &c
}

func (e *Maze) Apply(a Action) bool {
	g := e.g
	e.dirty = true
	if !e.info.Allowed[a] {
		return false
	}
	switch a {
	case WriteMark:
		i := g.Agent()
		if g.Locked[i] || g.Cells[i] != Empty {
			return false
		}
		g.AgentWrite(Mark)
		return true
	case Clear:
		i := g.Agent()
		if g.Locked[i] || g.Cells[i] != Mark {
			return false
		}
		g.AgentWrite(Empty)
		return true
	}
	return e.applyMove(a)
}

func (e *Maze) Evolve() {
	g := e.g
	g.T++
	e.dirty = true
	e.Field()
	if e.gap == 0 {
		if e.gapOpen >= 0 {
			closeEpisode(e.eps, e.gapOpen, g.T, true)
			e.gapOpen = -1
			e.counts["joined"]++
		}
		if e.rng.Chance(e.pErode) {
			// wash out a run of 2-5 route marks somewhere along the inner route
			n := 2 + e.rng.Intn(4)
			inner := e.route[1 : len(e.route)-1]
			s := e.rng.Intn(len(inner))
			for j := s; j < s+n && j < len(inner); j++ {
				if g.Cells[inner[j]] == Mark {
					g.Set(inner[j], Empty)
				}
			}
			e.counts["washouts"]++
			e.dirty = true
			e.Field()
		}
	}
	if e.gap > 0 && e.gapOpen < 0 {
		e.gapOpen = e.open(g.T)
	}
}

func (e *Maze) marked(i int) bool {
	s := e.g.Cells[i]
	return s == Mark || s == Entrance || s == Exit
}

func (e *Maze) Field() []float64 {
	if !e.dirty {
		return e.field
	}
	g := e.g
	if e.field == nil {
		e.field = make([]float64, g.W*g.H)
	}
	for i := range e.field {
		e.field[i] = 0
	}
	gap, stray := 0, 0
	for _, c := range e.route {
		if !e.marked(c) {
			gap++
		}
	}
	for i, s := range g.Cells {
		if s == Mark && !e.onRoute[i] {
			stray++
			e.field[i] = 1
		}
	}
	if gap > 0 {
		// tips: last marked cell of the unbroken chain from each end
		tipA := e.route[0]
		for _, c := range e.route {
			if !e.marked(c) {
				break
			}
			tipA = c
		}
		tipB := e.route[len(e.route)-1]
		for j := len(e.route) - 1; j >= 0; j-- {
			if !e.marked(e.route[j]) {
				break
			}
			tipB = e.route[j]
		}
		e.field[tipA] += float64(gap) / 2
		e.field[tipB] += float64(gap) / 2
	}
	e.gap, e.stray = gap, stray
	e.total = sum(e.field)
	e.dirty = false
	return e.field
}
func (e *Maze) Total() float64 { e.Field(); return e.total }

func (e *Maze) Oracle() Action {
	g := e.g
	i := g.Agent()
	if e.onRoute[i] && g.Cells[i] == Empty {
		return WriteMark
	}
	if g.Cells[i] == Mark && !e.onRoute[i] {
		return Clear
	}
	a, _ := g.BFSStep(func(j int) bool { return e.onRoute[j] && g.Cells[j] == Empty })
	return a
}

func (e *Maze) Counters() map[string]float64 {
	e.Field()
	e.counts["final_gap"] = float64(e.gap)
	e.counts["final_stray"] = float64(e.stray)
	e.counts["route_len"] = float64(len(e.route))
	return e.counts
}

// ---------------------------------------------------------------------------
// 3. Fire: a spreading disturbance. Doing nothing is costly.
//
// Grass (empty floor) ignites now and then, mostly at a few lightning-prone
// hotspots. Fire spreads to neighbouring grass, burns out to ash after a
// while, and ash regrows to grass slowly. Energy: 1 per burning cell, 0.2 per
// ash cell (damage that persists). Clear on a burning cell puts it out
// (it becomes grass). Marks are not allowed here: a world of firebreaks
// would be a trivial cheat.
// ---------------------------------------------------------------------------

type FireEnv struct {
	base
	burn     []int // steps burning (fire) or steps since burnt (ash)
	hotspots []int
	pIgnite  float64
	pSpread  float64
	burnTime int
	regrow   int
	fireOpen int
}

func NewFire(layoutSeed, runSeed uint64) Env {
	lr := NewRng(layoutSeed ^ 0xF17E)
	g := NewGrid(14, 14)
	g.Room()
	scatterWalls(g, lr, 5)
	e := &FireEnv{pIgnite: 1.0 / 80, pSpread: 0.012, burnTime: 60, regrow: 300, fireOpen: -1}
	var hs []int
	for k := 0; k < 3; k++ {
		c := pickFloor(g, lr, hs, 6)
		hs = append(hs, c)
	}
	e.hotspots = hs
	e.burn = make([]int, g.W*g.H)
	g.AX, g.AY = pickXY(g, lr)
	e.base = base{g: g, rng: NewRng(runSeed ^ 0xF1), counts: map[string]float64{}, dirty: true,
		info: Info{Name: "fire", Desc: "grass ignites (mostly at hotspots) and fire spreads; clear burning cells",
			Allowed: allow(Stay, North, East, South, West, Clear), SettleLevel: 0.0, EpisodeCap: 600, Warmup: 3000}}
	return e
}

func (e *FireEnv) Clone() Env {
	c := *e
	c.base = e.cloneBase()
	c.burn = append([]int(nil), e.burn...)
	return &c
}

func (e *FireEnv) Apply(a Action) bool {
	g := e.g
	e.dirty = true
	if !e.info.Allowed[a] {
		return false
	}
	if a == Clear {
		i := g.Agent()
		if g.Cells[i] == Fire {
			g.Cells[i] = Empty
			e.burn[i] = 0
			e.counts["extinguished"]++
			if e.fireOpen >= 0 && e.countFire() == 0 {
				closeEpisode(e.eps, e.fireOpen, g.T, true)
				e.fireOpen = -1
			}
			return true
		}
		return false
	}
	return e.applyMove(a)
}

func (e *FireEnv) countFire() int {
	n := 0
	for _, s := range e.g.Cells {
		if s == Fire {
			n++
		}
	}
	return n
}

func (e *FireEnv) Evolve() {
	g := e.g
	g.T++
	e.dirty = true
	n := g.W * g.H
	var ignite []int
	for i := 0; i < n; i++ {
		switch g.Cells[i] {
		case Fire:
			e.burn[i]++
			neighbours4(g, i, func(j int) {
				if g.Cells[j] == Empty && e.rng.Chance(e.pSpread) {
					ignite = append(ignite, j)
				}
			})
		case Ash:
			e.burn[i]++
		}
	}
	for i := 0; i < n; i++ {
		if g.Cells[i] == Fire && e.burn[i] > e.burnTime {
			g.Set(i, Ash)
			e.burn[i] = 0
			e.counts["burnt"]++
		} else if g.Cells[i] == Ash && e.burn[i] > e.regrow {
			g.Set(i, Empty)
			e.burn[i] = 0
		}
	}
	for _, j := range ignite {
		if g.Cells[j] == Empty {
			g.Set(j, Fire)
			e.burn[j] = 0
		}
	}
	if e.rng.Chance(e.pIgnite) {
		var c int
		if e.rng.Chance(0.75) {
			c = e.hotspots[e.rng.Intn(len(e.hotspots))]
		} else {
			f := g.FloorCells()
			if len(f) > 0 {
				c = f[e.rng.Intn(len(f))]
			}
		}
		if g.Cells[c] == Empty {
			g.Set(c, Fire)
			e.burn[c] = 0
			e.counts["ignitions"]++
		}
	}
	nf := e.countFire()
	if nf > 0 && e.fireOpen < 0 {
		e.fireOpen = e.open(g.T)
	} else if nf == 0 && e.fireOpen >= 0 {
		closeEpisode(e.eps, e.fireOpen, g.T, false) // burnt out on its own
		e.fireOpen = -1
	}
}

func (e *FireEnv) Field() []float64 {
	if !e.dirty {
		return e.field
	}
	g := e.g
	if e.field == nil {
		e.field = make([]float64, g.W*g.H)
	}
	for i, s := range g.Cells {
		switch s {
		case Fire:
			e.field[i] = 1
		case Ash:
			e.field[i] = 0.2
		default:
			e.field[i] = 0
		}
	}
	e.total = sum(e.field)
	e.dirty = false
	return e.field
}
func (e *FireEnv) Total() float64 { e.Field(); return e.total }

func (e *FireEnv) Oracle() Action {
	g := e.g
	if g.Cells[g.Agent()] == Fire {
		return Clear
	}
	a, d := g.BFSStep(func(i int) bool { return g.Cells[i] == Fire })
	if d < 0 {
		// no fire: wait at the nearest hotspot (anticipation)
		a, _ = g.BFSStep(func(i int) bool { return i == e.hotspots[0] })
	}
	return a
}

// ---------------------------------------------------------------------------
// 4. Litter: the closed-world test.
//
// Litter appears on the floor, mostly near a couple of sources. Each piece is
// uneasy (1) wherever it is, including in the agent's hands: carrying litter
// moves its energy, it doesn't remove it. Putting litter into a bin resolves
// it. Putting it down anywhere else just moves the problem. An agent that
// feels only its local view can lower what it feels by carrying litter out of
// sight and dropping it; the true total doesn't fall.
// ---------------------------------------------------------------------------

type Litter struct {
	base
	bins    []int
	sources []int
	pSpawn  float64
	born    map[int]int // cell (or -1 when carried) -> episode index
	carried int         // episode index of carried piece, -1 if none
}

func NewLitter(layoutSeed, runSeed uint64) Env {
	lr := NewRng(layoutSeed ^ 0x1177)
	g := NewGrid(10, 10)
	g.Room()
	scatterWalls(g, lr, 2)
	e := &Litter{pSpawn: 1.0 / 250, born: map[int]int{}, carried: -1}
	var used []int
	for k := 0; k < 2; k++ {
		c := pickFloor(g, lr, used, 5)
		used = append(used, c)
		g.Cells[c] = Bin
		g.Locked[c] = true
		e.bins = append(e.bins, c)
	}
	for k := 0; k < 2; k++ {
		c := pickFloor(g, lr, used, 4)
		used = append(used, c)
		e.sources = append(e.sources, c)
	}
	g.AX, g.AY = pickXY(g, lr)
	e.base = base{g: g, rng: NewRng(runSeed ^ 0x117), counts: map[string]float64{}, dirty: true,
		info: Info{Name: "litter", Desc: "litter appears; take it and put it in a bin (dropping it elsewhere only moves it)",
			Allowed: allow(Stay, North, East, South, West, Take, Put), SettleLevel: 0.0, EpisodeCap: 1000, Warmup: 1500}}
	return e
}

func (e *Litter) Clone() Env {
	c := *e
	c.base = e.cloneBase()
	c.born = map[int]int{}
	for k, v := range e.born {
		c.born[k] = v
	}
	return &c
}

func (e *Litter) Apply(a Action) bool {
	g := e.g
	e.dirty = true
	if !e.info.Allowed[a] {
		return false
	}
	i := g.Agent()
	switch a {
	case Take:
		if g.Carry != Empty || g.Cells[i] != Object {
			return false
		}
		g.Cells[i] = Empty
		g.Carry = Object
		e.carried = e.born[i]
		delete(e.born, i)
		e.counts["taken"]++
		return true
	case Put:
		if g.Carry == Empty {
			return false
		}
		if g.Cells[i] == Bin {
			g.Carry = Empty
			closeEpisode(e.eps, e.carried, g.T, true)
			e.carried = -1
			e.counts["binned"]++
			return true
		}
		if g.Cells[i] == Empty {
			g.Cells[i] = Object
			g.AgentW[i] = false
			g.Carry = Empty
			e.born[i] = e.carried
			e.carried = -1
			e.counts["dropped_elsewhere"]++
			return true
		}
		return false
	}
	return e.applyMove(a)
}

func (e *Litter) Evolve() {
	g := e.g
	g.T++
	e.dirty = true
	if e.rng.Chance(e.pSpawn) && e.pieces() < 30 {
		var c int
		if e.rng.Chance(0.6) {
			s := e.sources[e.rng.Intn(len(e.sources))]
			// near the source: the source or a neighbour
			cand := []int{s}
			neighbours4(g, s, func(j int) { cand = append(cand, j) })
			c = cand[e.rng.Intn(len(cand))]
		} else {
			f := g.FloorCells()
			if len(f) == 0 {
				return
			}
			c = f[e.rng.Intn(len(f))]
		}
		if g.Cells[c] == Empty && c != g.Agent() {
			g.Set(c, Object)
			e.born[c] = e.open(g.T)
			e.counts["spawned"]++
		}
	}
}

func (e *Litter) pieces() int {
	n := 0
	for _, s := range e.g.Cells {
		if s == Object {
			n++
		}
	}
	if e.g.Carry == Object {
		n++
	}
	return n
}

func (e *Litter) Field() []float64 {
	if !e.dirty {
		return e.field
	}
	g := e.g
	if e.field == nil {
		e.field = make([]float64, g.W*g.H)
	}
	for i, s := range g.Cells {
		if s == Object {
			e.field[i] = 1
		} else {
			e.field[i] = 0
		}
	}
	if g.Carry == Object {
		e.field[g.Agent()] += 1
	}
	e.total = sum(e.field)
	e.dirty = false
	return e.field
}
func (e *Litter) Total() float64 { e.Field(); return e.total }

func (e *Litter) Oracle() Action {
	g := e.g
	i := g.Agent()
	if g.Carry == Object {
		if g.Cells[i] == Bin {
			return Put
		}
		a, _ := g.BFSStep(func(j int) bool { return g.Cells[j] == Bin })
		return a
	}
	if g.Cells[i] == Object {
		return Take
	}
	a, _ := g.BFSStep(func(j int) bool { return g.Cells[j] == Object })
	return a
}

// ---------------------------------------------------------------------------
// 5. Wells: memory.
//
// A large room with a few springs, far apart, out of sight of one another.
// Each spring silts up steadily; its unease is how silted it is (up to a
// cap). Clear on a spring clears it. Springs can only be felt from close by,
// so keeping them all clear needs remembering where they are and coming back
// before they get bad. Now and then a spring dries up and a new one wells up
// somewhere else (a relocation the agent has to notice and relearn).
// Marks are allowed and cost nothing: the agent may use them as signposts.
// The judge's mark test checks whether erasing them, or wiping the agent's
// memory while keeping them, changes anything.
// ---------------------------------------------------------------------------

type Wells struct {
	base
	wells   []int
	cleared map[int]int // well -> step last cleared
	epOf    map[int]int // well -> open episode (silt above threshold), -1 none
	rate    float64
	cap     float64
	thresh  float64
	pMove   float64
}

func NewWells(layoutSeed, runSeed uint64) Env {
	lr := NewRng(layoutSeed ^ 0x3E11)
	g := NewGrid(20, 20)
	g.Room()
	scatterWalls(g, lr, 10)
	e := &Wells{cleared: map[int]int{}, epOf: map[int]int{}, rate: 1.0 / 200, cap: 3, thresh: 1, pMove: 1.0 / 3000}
	for k := 0; k < 4; k++ {
		c := pickFloor(g, lr, e.wells, 8)
		e.wells = append(e.wells, c)
		g.Cells[c] = Spring
		g.Locked[c] = true
		e.cleared[c] = 0
		e.epOf[c] = -1
	}
	g.AX, g.AY = pickXY(g, lr)
	e.base = base{g: g, rng: NewRng(runSeed ^ 0x3E), counts: map[string]float64{}, dirty: true,
		info: Info{Name: "wells", Desc: "springs far apart silt up; clear them before they get bad; springs sometimes move",
			Allowed: allow(Stay, North, East, South, West, WriteMark, Clear), SettleLevel: 1.0, EpisodeCap: 1500, Memory: true, Warmup: 600}}
	return e
}

func (e *Wells) Clone() Env {
	c := *e
	c.base = e.cloneBase()
	c.wells = append([]int(nil), e.wells...)
	c.cleared = map[int]int{}
	c.epOf = map[int]int{}
	for k, v := range e.cleared {
		c.cleared[k] = v
	}
	for k, v := range e.epOf {
		c.epOf[k] = v
	}
	return &c
}

func (e *Wells) silt(w int) float64 {
	return math.Min(e.cap, float64(e.g.T-e.cleared[w])*e.rate)
}

func (e *Wells) Apply(a Action) bool {
	g := e.g
	e.dirty = true
	if !e.info.Allowed[a] {
		return false
	}
	i := g.Agent()
	switch a {
	case Clear:
		if g.Cells[i] == Spring {
			if e.silt(i) > 0.05 {
				e.counts["cleared"]++
			}
			e.cleared[i] = g.T
			if e.epOf[i] >= 0 {
				closeEpisode(e.eps, e.epOf[i], g.T, true)
				e.epOf[i] = -1
			}
			return true
		}
		if g.Cells[i] == Mark {
			g.AgentWrite(Empty)
			return true
		}
		return false
	case WriteMark:
		if g.Locked[i] || g.Cells[i] != Empty {
			return false
		}
		g.AgentWrite(Mark)
		e.counts["marks_written"]++
		return true
	}
	return e.applyMove(a)
}

func (e *Wells) Evolve() {
	g := e.g
	g.T++
	e.dirty = true
	for _, w := range e.wells {
		if e.epOf[w] < 0 && e.silt(w) >= e.thresh {
			e.epOf[w] = e.open(g.T)
		}
	}
	if e.rng.Chance(e.pMove) {
		k := e.rng.Intn(len(e.wells))
		old := e.wells[k]
		var far []int
		for _, w := range e.wells {
			far = append(far, w)
		}
		far = append(far, g.Agent())
		c := pickFloor(g, e.rng, far, 7)
		if g.Cells[c] == Empty && c != g.Agent() {
			if e.epOf[old] >= 0 {
				closeEpisode(e.eps, e.epOf[old], g.T, false)
			}
			delete(e.cleared, old)
			delete(e.epOf, old)
			g.Set(old, Empty)
			g.Locked[old] = false
			g.Set(c, Spring)
			g.Locked[c] = true
			e.wells[k] = c
			e.cleared[c] = g.T
			e.epOf[c] = -1
			e.counts["relocations"]++
		}
	}
}

func (e *Wells) Field() []float64 {
	if !e.dirty {
		return e.field
	}
	g := e.g
	if e.field == nil {
		e.field = make([]float64, g.W*g.H)
	}
	for i := range e.field {
		e.field[i] = 0
	}
	for _, w := range e.wells {
		e.field[w] = e.silt(w)
	}
	e.total = sum(e.field)
	e.dirty = false
	return e.field
}
func (e *Wells) Total() float64 { e.Field(); return e.total }

func (e *Wells) Oracle() Action {
	g := e.g
	i := g.Agent()
	if g.Cells[i] == Spring && e.silt(i) > 0.2 {
		return Clear
	}
	// go to the spring with the most silt at arrival, discounted by distance
	best, bestScore := -1, -1.0
	for _, w := range e.wells {
		_, d := g.BFSStep(func(j int) bool { return j == w })
		if d < 0 {
			continue
		}
		s := math.Min(e.cap, e.silt(w)+float64(d)*e.rate) / float64(d+8)
		if s > bestScore {
			best, bestScore = w, s
		}
	}
	if best < 0 || best == i {
		return Stay
	}
	a, _ := g.BFSStep(func(j int) bool { return j == best })
	return a
}

// Prepare builds an environment and runs its warm-up (the world evolving
// with nobody in it), so the agent arrives in a world that is already
// disturbed. The judge measures from the agent's arrival: world time at
// arrival is Grid().T, and episodes that began before it are warm-up.
func Prepare(mk Maker, layoutSeed, runSeed uint64) Env {
	e := mk(layoutSeed, runSeed)
	for k := 0; k < e.Info().Warmup; k++ {
		e.Evolve()
	}
	return e
}

// Registry lists every environment in order of difficulty.
var Registry = []struct {
	Name string
	Make Maker
}{
	{"restore", NewRestore},
	{"fire", NewFire},
	{"litter", NewLitter},
	{"maze", NewMaze},
	{"wells", NewWells},
}
