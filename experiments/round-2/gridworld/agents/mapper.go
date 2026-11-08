package agents

import (
	"hsm/gridworld/automaton"
	"hsm/gridworld/world"
)

// Mapper is the reactive agent plus an internal map: a hand-written reference
// for what memory alone buys, with no learning of values or policy.
//
// It tracks its own position by dead reckoning (moves that had an effect), so
// it needs no coordinates from the world. It remembers which cells were walls
// and where it has felt heat, and when nothing in view is hotter than 0.3 it walks (BFS
// over its own map, unknown cells assumed open) to the remembered hot place
// it has not seen for the longest, weighted by distance. In a world where
// trouble recurs in the same places (wells, fire hotspots) that is
// anticipation from memory. If no remembered place has gone unseen for 120
// steps it explores with the reactive agent's momentum walk.
//
// It is not a baseline for learning; it shows the headroom memory gives, so
// an environment that claims to test memory can be checked to reward it.
type Mapper struct {
	Reactive
	x, y   int
	wall   map[[2]int]bool
	hot    map[[2]int]int // place -> step last seen (felt heat there at least once)
	seen   map[[2]int]int // place -> step last in view
	step   int
	target [2]int
	hasT   bool
	lastMv world.Action
}

func NewMapper(seed uint64) automaton.Automaton {
	return &Mapper{Reactive: *NewReactive(seed).(*Reactive)}
}

func (*Mapper) Name() string { return "mapper" }

func (m *Mapper) Enter(s automaton.Spec) {
	m.Reactive.Enter(s)
	m.x, m.y, m.step = 0, 0, 0
	m.wall = map[[2]int]bool{}
	m.hot = map[[2]int]int{}
	m.seen = map[[2]int]int{}
	m.hasT = false
	m.lastMv = world.Stay
}

func (m *Mapper) Act(p *automaton.Perception) world.Action {
	m.step++
	if m.lastMv.IsMove() && p.Moved {
		switch m.lastMv {
		case world.North:
			m.y--
		case world.South:
			m.y++
		case world.East:
			m.x++
		case world.West:
			m.x--
		}
	}
	R := m.spec.Radius
	k := 0
	maxHeat := 0.0
	for dy := -R; dy <= R; dy++ {
		for dx := -R; dx <= R; dx++ {
			c := [2]int{m.x + dx, m.y + dy}
			m.wall[c] = p.View[k] == world.Wall
			m.seen[c] = m.step
			if p.Heat != nil && p.Heat[k] > 0 {
				m.hot[c] = m.step
				if p.Heat[k] > maxHeat {
					maxHeat = p.Heat[k]
				}
			}
			k++
		}
	}
	var a world.Action
	// heat worth acting on here; a trickle is left for later and the
	// remembered places are visited instead
	if maxHeat >= 0.3 || p.Heat == nil || len(m.hot) == 0 {
		m.hasT = false
		a = m.Reactive.Act(p)
	} else {
		a = m.goRemembered(p)
	}
	m.lastMv = a
	return a
}

func (m *Mapper) goRemembered(p *automaton.Perception) world.Action {
	here := [2]int{m.x, m.y}
	if !m.hasT || here == m.target {
		best, bs, stale := [2]int{}, -1.0, 0
		for c := range m.hot {
			if c == here {
				continue
			}
			d := iabs(c[0]-m.x) + iabs(c[1]-m.y)
			if d <= m.spec.Radius {
				continue // in view right now and not hot
			}
			s := float64(m.step-m.seen[c]) / float64(d+8)
			// ties broken by position so map iteration order cannot matter
			if s > bs || (s == bs && (c[1] < best[1] || (c[1] == best[1] && c[0] < best[0]))) {
				best, bs, stale = c, s, m.step-m.seen[c]
			}
		}
		// nothing remembered is overdue: explore (momentum walk) instead
		if bs < 0 || stale < 120 {
			m.Reactive.lastAct = world.Stay
			return m.Reactive.wander(p)
		}
		m.target, m.hasT = best, true
	}
	a := m.bfs(here, m.target)
	if a == world.Stay {
		m.hasT = false
		return m.Reactive.wander(p)
	}
	return a
}

// bfs over the internal map; unknown cells count as open. Bounded.
func (m *Mapper) bfs(from, to [2]int) world.Action {
	type node struct {
		c     [2]int
		first world.Action
	}
	seen := map[[2]int]bool{from: true}
	q := []node{{from, world.Stay}}
	moves := []struct {
		a      world.Action
		dx, dy int
	}{{world.North, 0, -1}, {world.East, 1, 0}, {world.South, 0, 1}, {world.West, -1, 0}}
	for len(q) > 0 && len(seen) < 4000 {
		n := q[0]
		q = q[1:]
		for _, mv := range moves {
			c := [2]int{n.c[0] + mv.dx, n.c[1] + mv.dy}
			if seen[c] || m.wall[c] {
				continue
			}
			f := n.first
			if f == world.Stay {
				f = mv.a
			}
			if c == to {
				return f
			}
			seen[c] = true
			q = append(q, node{c, f})
		}
	}
	return world.Stay
}

func (m *Mapper) Stats() map[string]float64 {
	return map[string]float64{"map_cells": float64(len(m.seen)), "hot_places": float64(len(m.hot))}
}
