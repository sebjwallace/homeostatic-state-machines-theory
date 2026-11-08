// tune: grid search for the Q-learning baseline on tuning seeds 101-102
// (never used for reporting). Score per env = Q4 energy / idle Q4 energy;
// a variant's score is the mean over envs and both feel modes.
package main

import (
	"flag"
	"fmt"
	"sort"
	"sync"

	"hsm/gridworld/agents"
	"hsm/gridworld/automaton"
	"hsm/gridworld/judge"
	"hsm/gridworld/world"
)

func q4(e world.Maker, f automaton.Factory, feel automaton.Feel, steps int) float64 {
	t := 0.0
	for s := uint64(101); s <= 102; s++ {
		r := judge.NewRunner(world.Prepare(e, s, s*31+1), f.New(s), 2, feel)
		r.Step(steps)
		n := len(r.Series)
		m := 0.0
		for _, v := range r.Series[n-n/4:] {
			m += float64(v)
		}
		t += m / float64(n/4) / 2
	}
	return t
}

func main() {
	steps := flag.Int("steps", 20000, "steps")
	flag.Parse()
	idle := map[string]float64{}
	for _, e := range world.Registry {
		idle[e.Name] = q4(e.Make, agents.Registry[0], automaton.FeelLocal, *steps)
	}
	var ps []agents.QParams
	for _, rw := range []string{"felt", "same"} {
		for _, g := range []float64{0.8, 0.9, 0.97} {
			for _, l := range []float64{0, 0.8} {
				for _, a := range []float64{0.1, 0.3} {
					for _, o := range []float64{0, 1} {
						for _, v := range []string{"3x3", "plus"} {
							for _, ek := range []float64{0.3, 1} {
								ps = append(ps, agents.QParams{Alpha: a, Gamma: g, Lambda: l, Optim: o, EpsMin: 0.02, EpsK: ek, Reward: rw, View: v})
							}
						}
					}
				}
			}
		}
	}
	type res struct {
		p     agents.QParams
		score float64
		per   string
	}
	out := make([]res, len(ps))
	var wg sync.WaitGroup
	sem := make(chan bool, 2)
	for i, p := range ps {
		wg.Add(1)
		go func(i int, p agents.QParams) {
			defer wg.Done()
			sem <- true
			defer func() { <-sem }()
			f := automaton.Factory{New: agents.NewQ(p, "q")}
			sc, per := 0.0, ""
			for _, e := range world.Registry {
				for _, fe := range []automaton.Feel{automaton.FeelLocal, automaton.FeelGlobal} {
					v := q4(e.Make, f, fe, *steps) / idle[e.Name]
					sc += v / 10
					per += fmt.Sprintf(" %s/%s=%.2f", e.Name[:4], fe.String()[:1], v)
				}
			}
			out[i] = res{p, sc, per}
		}(i, p)
	}
	wg.Wait()
	sort.Slice(out, func(i, j int) bool { return out[i].score < out[j].score })
	for _, r := range out[:12] {
		fmt.Printf("%.3f %+v %s\n", r.score, r.p, r.per)
	}
	fmt.Println("worst:")
	for _, r := range out[len(out)-3:] {
		fmt.Printf("%.3f %+v %s\n", r.score, r.p, r.per)
	}
}
