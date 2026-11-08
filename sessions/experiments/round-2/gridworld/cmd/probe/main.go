// probe: quick calibration runs on the tuning seed (101), never used for
// reporting. Prints Q1 / Q4 mean energy per env x agent x feel.
package main

import (
	"flag"
	"fmt"
	"strings"
	"time"

	"hsm/gridworld/agents"
	"hsm/gridworld/automaton"
	"hsm/gridworld/judge"
	"hsm/gridworld/world"
)

func main() {
	steps := flag.Int("steps", 20000, "steps")
	only := flag.String("env", "", "only this env")
	ag := flag.String("agent", "", "only agents containing this")
	seed := flag.Uint64("seed", 101, "tuning seed")
	flag.Parse()
	t0 := time.Now()
	facs := append([]automaton.Factory{}, agents.Registry...)
	for _, v := range variants {
		p := agents.DefaultQ
		p.Reward, p.Gamma, p.Lambda, p.Alpha = v.r, v.g, v.l, v.a
		facs = append(facs, automaton.Factory{Name: v.n, New: agents.NewQ(p, v.n), Learns: true})
	}
	for _, e := range world.Registry {
		if *only != "" && e.Name != *only {
			continue
		}
		for _, f := range facs {
			if *ag != "" && !strings.Contains(f.Name, *ag) {
				continue
			}
			feels := []automaton.Feel{automaton.FeelLocal, automaton.FeelGlobal}
			if f.FeelIndependent {
				feels = feels[:1]
			}
			for _, fe := range feels {
				var q1, q4 float64
				for s := *seed; s < *seed+2; s++ {
					env := world.Prepare(e.Make, s, s*31+1)
					r := judge.NewRunner(env, f.New(s), 2, fe)
					r.Step(*steps)
					n := len(r.Series)
					q1 += mean(r.Series[:n/4]) / 2
					q4 += mean(r.Series[n-n/4:]) / 2
				}
				fmt.Printf("%-8s %-10s %-6s Q1 %7.3f  Q4 %7.3f\n", e.Name, f.Name, fe, q1, q4)
			}
		}
	}
	fmt.Println(time.Since(t0))
}

var variants = []struct {
	n       string
	r       string
	g, l, a float64
}{}

func mean(x []float32) float64 {
	s := 0.0
	for _, v := range x {
		s += float64(v)
	}
	return s / float64(len(x))
}
