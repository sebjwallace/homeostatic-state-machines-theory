// tune: m008 calibration on the judge's tuning seeds 101-102 only. Prints
// final-quarter energy scaled by idle (1) and oracle (0) from the same seeds,
// and the closed-world ledger.
package main

import (
	"flag"
	"fmt"
	"strings"
	"sync"
	"time"

	"hsm/gridworld/agents"
	"hsm/gridworld/automaton"
	"hsm/gridworld/judge"
	"hsm/gridworld/models/m008"
	"hsm/gridworld/world"
)

type out struct {
	q1, q4               float64
	res, cre, look, felt float64
	disp                 float64
	stats                map[string]float64
}

var judgeSeeds bool

func run(mk world.Maker, f func(uint64) automaton.Automaton, feel automaton.Feel, steps int, seed uint64, bind bool) out {
	env := world.Prepare(mk, seed, seed*31+1)
	ag := f(seed)
	if judgeSeeds {
		env = world.Prepare(mk, seed, seed*7919+13)
		ag = f(seed*104729 + 7)
	}
	r := judge.NewRunner(env, ag, 2, feel)
	r.Step(steps)
	n := len(r.Series)
	o := out{stats: ag.Stats()}
	for _, v := range r.Series[:n/4] {
		o.q1 += float64(v) / float64(n/4)
	}
	for _, v := range r.Series[n-n/4:] {
		o.q4 += float64(v) / float64(n/4)
	}
	o.res, o.cre, o.look, o.felt, o.disp = r.Ledger.AgentResolved, r.Ledger.AgentCreated, r.Ledger.LookAway, r.Ledger.FeltRelief, r.Ledger.Displaced
	return o
}

func main() {
	steps := flag.Int("steps", 20000, "steps")
	envs := flag.String("envs", "", "envs")
	feels := flag.String("feel", "local,global", "feels")
	aon := flag.Bool("aon", false, "all-or-nothing variant")
	q := flag.Bool("q", false, "also qlearn")
	set := flag.String("set", "", "param overrides k=v,...")
	s0 := flag.Uint64("s0", 101, "first seed")
	ns := flag.Uint64("ns", 2, "number of seeds")
	js := flag.Bool("js", false, "use the judge's seeding (env run seed s*7919+13, agent seed s*104729+7)")
	flag.Parse()
	judgeSeeds = *js
	t0 := time.Now()
	p := m008.Default
	p.AllOrNothing = *aon
	for _, kv := range strings.Split(*set, ",") {
		if kv == "" {
			continue
		}
		k, v, _ := strings.Cut(kv, "=")
		m008.SetParam(&p, k, v)
	}
	mf := func(s uint64) automaton.Automaton { return m008.NewWith(s, p, "m008") }
	var idleF, orF, qF func(uint64) automaton.Automaton
	for _, f := range agents.Registry {
		switch f.Name {
		case "idle":
			idleF = f.New
		case "oracle":
			orF = f.New
		case "qlearn":
			qF = f.New
		}
	}
	type job struct {
		env  string
		mk   world.Maker
		feel automaton.Feel
	}
	var jobs []job
	for _, e := range world.Registry {
		if *envs != "" && !strings.Contains(*envs, e.Name) {
			continue
		}
		for _, fs := range strings.Split(*feels, ",") {
			fe := automaton.FeelLocal
			if fs == "global" {
				fe = automaton.FeelGlobal
			}
			jobs = append(jobs, job{e.Name, e.Make, fe})
		}
	}
	lines := make([]string, len(jobs))
	var wg sync.WaitGroup
	sem := make(chan bool, 2)
	for i, j := range jobs {
		wg.Add(1)
		go func(i int, j job) {
			defer wg.Done()
			sem <- true
			defer func() { <-sem }()
			var idle, or, m, ql out
			ag := func(dst *out, f func(uint64) automaton.Automaton) {
				k := float64(*ns)
				for s := *s0; s < *s0+*ns; s++ {
					o := run(j.mk, f, j.feel, *steps, s, false)
					dst.q1 += o.q1 / k
					dst.q4 += o.q4 / k
					dst.res += o.res / k
					dst.cre += o.cre / k
					dst.look += o.look / k
					dst.felt += o.felt / k
					dst.disp += o.disp / k
					if dst.stats == nil {
						dst.stats = map[string]float64{}
					}
					for kk, v := range o.stats {
						dst.stats[kk] += v / k
					}
				}
			}
			ag(&idle, idleF)
			ag(&or, func(s uint64) automaton.Automaton {
				a := orF(s)
				return a
			})
			// oracle needs Bind; judge.NewRunner does it
			ag(&m, mf)
			sc := func(x float64) float64 { return (x - or.q4) / (idle.q4 - or.q4) }
			s := fmt.Sprintf("%-8s %-6s m008 Q1 %6.2f Q4 %6.2f sc %.2f | res %5.0f cre %5.0f disp %5.0f look %5.0f felt %5.0f", j.env, j.feel, m.q1, m.q4, sc(m.q4), m.res, m.cre, m.disp, m.look, m.felt)
			if *q {
				ag(&ql, qF)
				s += fmt.Sprintf(" || qlearn sc %.2f res %5.0f look %5.0f", sc(ql.q4), ql.res, ql.look)
			}
			s += "\n     "
			for _, k := range []string{"settlings", "repairs", "heat_events", "melts", "place_melts", "hardenings", "contexts", "hard_connections", "mean_hardness", "pruned", "frozen_refusals"} {
				s += fmt.Sprintf(" %s=%.0f", k, m.stats[k])
			}
			lines[i] = s
		}(i, j)
	}
	wg.Wait()
	for _, l := range lines {
		fmt.Println(l)
	}
	fmt.Println(time.Since(t0))
}
