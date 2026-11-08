package world

// Layout helpers shared by environments.

// scatterWalls drops n short wall segments inside a room as landmarks. They
// give the local view something to recognise, and break up open floor.
// It keeps the floor connected.
func scatterWalls(g *Grid, r *Rng, n int) {
	for k := 0; k < n; k++ {
		for try := 0; try < 20; try++ {
			x, y := 2+r.Intn(g.W-4), 2+r.Intn(g.H-4)
			length := 2 + r.Intn(3)
			horiz := r.Chance(0.5)
			var cells []int
			ok := true
			for j := 0; j < length; j++ {
				cx, cy := x, y
				if horiz {
					cx += j
				} else {
					cy += j
				}
				if cx < 2 || cy < 2 || cx > g.W-3 || cy > g.H-3 || g.At(cx, cy) != Empty {
					ok = false
					break
				}
				cells = append(cells, g.I(cx, cy))
			}
			if !ok {
				continue
			}
			for _, i := range cells {
				g.Cells[i] = Wall
				g.Locked[i] = true
			}
			if !floorConnected(g) {
				for _, i := range cells {
					g.Cells[i] = Empty
					g.Locked[i] = false
				}
				continue
			}
			break
		}
	}
}

func floorConnected(g *Grid) bool {
	start := -1
	total := 0
	for i, s := range g.Cells {
		if s != Wall {
			total++
			if start < 0 {
				start = i
			}
		}
	}
	if start < 0 {
		return true
	}
	seen := make([]bool, len(g.Cells))
	seen[start] = true
	q := []int{start}
	n := 1
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
			if !seen[ni] && g.Cells[ni] != Wall {
				seen[ni] = true
				n++
				q = append(q, ni)
			}
		}
	}
	return n == total
}

// pickFloor returns a random empty cell not in avoid, at least minDist
// (Manhattan) from every cell in far.
func pickFloor(g *Grid, r *Rng, far []int, minDist int) int {
	floor := g.FloorCells()
	for try := 0; try < 500; try++ {
		c := floor[r.Intn(len(floor))]
		ok := true
		for _, f := range far {
			if manhattan(g, c, f) < minDist {
				ok = false
				break
			}
		}
		if ok {
			return c
		}
	}
	return floor[r.Intn(len(floor))]
}

func manhattan(g *Grid, a, b int) int {
	ax, ay, bx, by := a%g.W, a/g.W, b%g.W, b/g.W
	d := ax - bx
	if d < 0 {
		d = -d
	}
	e := ay - by
	if e < 0 {
		e = -e
	}
	return d + e
}

func neighbours4(g *Grid, i int, f func(j int)) {
	x, y := i%g.W, i/g.W
	for a := North; a <= West; a++ {
		nx, ny := x+dx[a], y+dy[a]
		if g.In(nx, ny) {
			f(g.I(nx, ny))
		}
	}
}

// base carries the bits every environment shares.
type base struct {
	g      *Grid
	info   Info
	eps    []Episode
	rng    *Rng // world dynamics (run seed)
	field  []float64
	total  float64
	dirty  bool
	counts map[string]float64
}

func (b *base) Grid() *Grid                  { return b.g }
func (b *base) Info() Info                   { return b.info }
func (b *base) Name() string                 { return b.info.Name }
func (b *base) Episodes() []Episode          { return b.eps }
func (b *base) Counters() map[string]float64 { return b.counts }
func (b *base) EraseAgentMarks()             { eraseAgentMarks(b.g); b.dirty = true }

func (b *base) cloneBase() base {
	c := *b
	c.g = b.g.Clone()
	c.eps = append([]Episode(nil), b.eps...)
	r := *b.rng
	c.rng = &r
	c.field = append([]float64(nil), b.field...)
	c.counts = map[string]float64{}
	for k, v := range b.counts {
		c.counts[k] = v
	}
	return c
}

func (b *base) open(t int) int {
	b.eps = append(b.eps, Episode{Start: t, End: -1})
	return len(b.eps) - 1
}

// moveOrStay applies a move; returns whether it had an effect.
func (b *base) applyMove(a Action) bool {
	if a.IsMove() {
		return b.g.Move(a)
	}
	return a == Stay
}
