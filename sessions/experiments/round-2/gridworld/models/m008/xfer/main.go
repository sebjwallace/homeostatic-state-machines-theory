// xfer: diagnostics on tuning seeds 101-102 only.
//
//	-mode parts : which persisting part of m008 affects transfer
//	-mode revert: layout A (20k) -> B (5k) -> A again (5k), per freezing rule
package main

import (
	"flag"
	"fmt"

	"hsm/gridworld/automaton"
	"hsm/gridworld/judge"
	"hsm/gridworld/models/m008"
	"hsm/gridworld/world"
)

func mean(x []float32) float64 {
	s := 0.0
	for _, v := range x {
		s += float64(v)
	}
	return s / float64(len(x))
}

var envs = []struct {
	n string
	m world.Maker
}{{"restore", world.NewRestore}, {"fire", world.NewFire}, {"litter", world.NewLitter}, {"maze", world.NewMaze}, {"wells", world.NewWells}}

func main() {
	mode := flag.String("mode", "revert", "parts or revert")
	js := flag.Uint64("judgeseed", 0, "parts mode on one reported seed with the judge's seeding (diagnosis only, never tuning)")
	flag.Parse()
	if *mode == "parts" {
		for _, e := range envs {
			for _, part := range []string{"fresh", "none", "assoc", "engaged", "conns"} {
				t := 0.0
				seeds := []uint64{101, 102}
				if *js > 0 {
					seeds = []uint64{*js}
				}
				for _, s := range seeds {
					ag := m008.NewWith(s, m008.Default, "m008").(*m008.M)
					runA, runB := s*31+1, s*31+77
					if *js > 0 {
						ag = m008.NewWith(s*104729+7, m008.Default, "m008").(*m008.M)
						runA, runB = s*7919+13, s*7919+77
					}
					if part != "fresh" {
						r := judge.NewRunner(world.Prepare(e.m, s, runA), ag, 2, automaton.FeelLocal)
						r.Step(20000)
						ag.Forget(part)
					}
					r := judge.NewRunner(world.Prepare(e.m, s+1000, runB), ag, 2, automaton.FeelLocal)
					r.Step(5000)
					t += mean(r.Series) / float64(len(seeds))
				}
				fmt.Printf("%-8s forget %-8s %.2f\n", e.n, part, t)
			}
		}
		return
	}
	for _, e := range envs {
		for _, fe := range []automaton.Feel{automaton.FeelLocal, automaton.FeelGlobal} {
			for _, rule := range []string{"earned", "all-or-nothing", "none"} {
				p := m008.Default
				p.AllOrNothing = rule == "all-or-nothing"
				p.NoFreeze = rule == "none"
				var a1, b, a2 float64
				for s := uint64(101); s <= 102; s++ {
					ag := m008.NewWith(s, p, "m008")
					r := judge.NewRunner(world.Prepare(e.m, s, s*31+1), ag, 2, fe)
					r.Step(20000)
					a1 += mean(r.Series[15000:]) / 2
					r.Transfer(world.Prepare(e.m, s+1000, s*31+77))
					r.Step(5000)
					b += mean(r.Series) / 2
					r.Transfer(world.Prepare(e.m, s, s*31+5))
					r.Step(5000)
					a2 += mean(r.Series) / 2
				}
				fmt.Printf("%-8s %-6s %-15s A(last5k) %6.2f  B %6.2f  back to A %6.2f\n", e.n, fe, rule, a1, b, a2)
			}
		}
	}
}
