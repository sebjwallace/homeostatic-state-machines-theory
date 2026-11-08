package judge

import (
	"hsm/gridworld/agents"
	"math"
	"sort"
	"sync"

	"hsm/gridworld/automaton"
	"hsm/gridworld/world"
)

// Config sets the size of the evaluation.
type Config struct {
	Steps         int // online steps per run
	Seeds         []uint64
	Radius        int // view radius (2 = 5x5)
	Bins          int // curve resolution
	TransferSteps int // steps measured after moving to a new layout
	MemorySteps   int // steps measured after the memory and branch interventions
	QuietSteps    int // length of the quiet period in the quiet branch
	Workers       int
}

var DefaultConfig = Config{Steps: 20000, Seeds: []uint64{1, 2, 3, 4, 5}, Radius: 2, Bins: 20, TransferSteps: 5000, MemorySteps: 5000, QuietSteps: 2000, Workers: 2}

// RunResult is one (env, agent, feel, seed) run.
type RunResult struct {
	Env, Agent, Feel string
	Seed             uint64
	Mean, Q1, Q4     float64
	Curve            []float64
	FirstSettle      int     // first step the world returns to its settle level after being disturbed; -1 never
	SettledFrac      float64 // fraction of steps at or below settle level
	EarlyRes         float64 // mean resolution time of disturbances starting in the first quarter (capped)
	LateRes          float64 // same for the last quarter
	EarlyN, LateN    int
	ByAgentFrac      float64 // fraction of resolved disturbances resolved by the agent
	Ledger           Ledger
	Counters         map[string]float64
	Stats            map[string]float64
	TransferFresh    float64 // mean energy, fresh agent, new layout (first TransferSteps)
	TransferMoved    float64 // same, agent carried over from the old layout
	Memory           *MemoryResult
	Branch           *BranchResult
}

// BranchResult: futures branched after the run for learning agents.
// Each is the mean energy over the next MemorySteps.
type BranchResult struct {
	Continue    float64 // learning on, nothing changed
	LearningOff float64 // SetLearning(false): does what was learnt hold without further change?
	AfterQuiet  float64 // Quiet(QuietSteps) first, then continue (thinking without data)
}

// MemoryResult: external memory (rung 15) on environments that ask for it.
type MemoryResult struct {
	MarksWritten  int
	MarksSeenFrac float64 // fraction of steps with a self-written mark >= 50 steps old in view
	Continue      float64 // mean energy over the next MemorySteps, nothing changed
	MarksErased   float64 // the agent's marks erased, agent kept
	AgentWiped    float64 // fresh agent, the old agent's marks kept
	BothWiped     float64 // fresh agent, marks erased
}

// Agg is the cross-seed summary for one (env, agent, feel).
type Agg struct {
	Env, Agent, Feel                   string
	Mean, Q1, Q4, Q4sd                 float64
	Curve                              []float64
	FirstSettle                        float64 // median over seeds; -1 if most never settled
	SettledFrac                        float64
	EarlyRes, LateRes                  float64
	ByAgentFrac                        float64
	Resolved, Created, WorldAdded      float64
	WorldRemoved, FeltRelief, LookAway float64
	Displaced                          float64
	TransferFresh, TransferMoved       float64
	Memory                             *MemoryResult
	Branch                             *BranchResult
	Counters                           map[string]float64
	Stats                              map[string]float64
	Runs                               []RunResult `json:"-"`
}

type job struct {
	env struct {
		Name string
		Make world.Maker
	}
	fac  automaton.Factory
	feel automaton.Feel
	seed uint64
}

// RunAll runs every environment x agent x feel x seed.
func RunAll(cfg Config, envs []struct {
	Name string
	Make world.Maker
}, facs []automaton.Factory) []Agg {
	var jobs []job
	for _, e := range envs {
		for _, f := range facs {
			feels := []automaton.Feel{automaton.FeelLocal, automaton.FeelGlobal}
			if f.FeelIndependent || f.LocalOnly {
				feels = feels[:1]
			}
			for _, fe := range feels {
				for _, s := range cfg.Seeds {
					jobs = append(jobs, job{e, f, fe, s})
				}
			}
		}
	}
	results := make([]RunResult, len(jobs))
	var wg sync.WaitGroup
	ch := make(chan int)
	for w := 0; w < cfg.Workers; w++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for i := range ch {
				results[i] = runOne(cfg, jobs[i])
			}
		}()
	}
	for i := range jobs {
		ch <- i
	}
	close(ch)
	wg.Wait()
	return aggregate(results)
}

// layout and run seeds: layout A = seed, layout B (transfer) = seed+1000.
func runOne(cfg Config, j job) RunResult {
	env := world.Prepare(j.env.Make, j.seed, j.seed*7919+13)
	ag := j.fac.New(j.seed*104729 + 7)
	r := NewRunner(env, ag, cfg.Radius, j.feel)
	r.Step(cfg.Steps)
	feel := j.feel.String()
	if j.fac.FeelIndependent {
		feel = "-"
	}
	res := measure(cfg, r, j.env.Name, j.fac.Name, feel, j.seed)
	info := env.Info()

	if info.Memory {
		res.Memory = memoryTest(cfg, r, j)
	}
	if j.fac.Learns {
		res.Branch = &BranchResult{
			Continue:    branch(cfg, j, nil),
			LearningOff: branch(cfg, j, func(rr *Runner) { rr.Agent.SetLearning(false) }),
			AfterQuiet:  branch(cfg, j, func(rr *Runner) { rr.Agent.Quiet(cfg.QuietSteps) }),
		}
	}
	if j.fac.Name != "idle" && j.fac.Name != "oracle" {
		res.TransferFresh, res.TransferMoved = transferTest(cfg, r, j)
	}
	closeAgent(r.Agent)
	return res
}

func closeAgent(a automaton.Automaton) {
	if c, ok := a.(automaton.Closer); ok {
		c.Close()
	}
}

func transferTest(cfg Config, r *Runner, j job) (fresh, moved float64) {
	lay := j.seed + 1000
	run := j.seed*7919 + 77
	// fresh agent on layout B
	fr := NewRunner(world.Prepare(j.env.Make, lay, run), j.fac.New(j.seed*104729+99), cfg.Radius, j.feel)
	fr.Step(cfg.TransferSteps)
	fresh = mean32(fr.Series)
	closeAgent(fr.Agent)
	// the experienced agent moved to layout B (same world dynamics seed)
	r.Transfer(world.Prepare(j.env.Make, lay, run))
	r.Step(cfg.TransferSteps)
	moved = mean32(r.Series)
	return
}

func memoryTest(cfg Config, r *Runner, j job) *MemoryResult {
	m := &MemoryResult{MarksWritten: r.Ledger.MarksWritten}
	if r.Ledger.Steps > 0 {
		m.MarksSeenFrac = float64(r.Ledger.MarksSeenOld) / float64(r.Ledger.Steps)
	}
	erase := func(rr *Runner) { rr.EraseMarks() }
	wipe := func(rr *Runner) {
		// same body, same world, new mind
		closeAgent(rr.Agent)
		rr.Agent = j.fac.New(j.seed*104729 + 555)
		if b, ok := rr.Agent.(agents.Binder); ok {
			b.Bind(rr.Env)
		}
		rr.Agent.Enter(rr.Spec)
	}
	m.Continue = branch(cfg, j, nil)
	m.MarksErased = branch(cfg, j, erase)
	m.AgentWiped = branch(cfg, j, wipe)
	m.BothWiped = branch(cfg, j, func(rr *Runner) { erase(rr); wipe(rr) })
	return m
}

// branch replays the run up to the branch point and applies an intervention,
// then measures the next MemorySteps. The automaton cannot be cloned through
// the interface, so the run is replayed with the same seeds (runs are
// deterministic). Returns the mean true energy after the branch.
func branch(cfg Config, j job, intervene func(*Runner)) float64 {
	env := world.Prepare(j.env.Make, j.seed, j.seed*7919+13)
	rr := NewRunner(env, j.fac.New(j.seed*104729+7), cfg.Radius, j.feel)
	rr.Step(cfg.Steps)
	if intervene != nil {
		intervene(rr)
	}
	n0 := len(rr.Series)
	rr.Step(cfg.MemorySteps)
	closeAgent(rr.Agent)
	return mean32(rr.Series[n0:])
}

func mean32(xs []float32) float64 {
	if len(xs) == 0 {
		return 0
	}
	s := 0.0
	for _, x := range xs {
		s += float64(x)
	}
	return s / float64(len(xs))
}

func measure(cfg Config, r *Runner, env, agent, feel string, seed uint64) RunResult {
	s := r.Series
	n := len(s)
	q := n / 4
	res := RunResult{Env: env, Agent: agent, Feel: feel, Seed: seed}
	res.Mean = mean32(s)
	res.Q1 = mean32(s[:q])
	res.Q4 = mean32(s[n-q:])
	res.Curve = make([]float64, cfg.Bins)
	for b := 0; b < cfg.Bins; b++ {
		res.Curve[b] = mean32(s[b*n/cfg.Bins : (b+1)*n/cfg.Bins])
	}
	info := r.Env.Info()
	settle := info.SettleLevel + 1e-9
	res.FirstSettle = -1
	disturbed := false
	settled := 0
	for t, v := range s {
		if float64(v) <= settle {
			settled++
			if disturbed && res.FirstSettle < 0 {
				res.FirstSettle = t
			}
		} else {
			disturbed = true
		}
	}
	res.SettledFrac = float64(settled) / float64(n)
	// resolution times of disturbances: early (start in first quarter) vs late (last quarter)
	cap := info.EpisodeCap
	var early, late []float64
	resolved, byAgent := 0, 0
	for _, e := range r.Env.Episodes() {
		e.Start -= r.T0
		if e.End >= 0 {
			e.End -= r.T0
		}
		if e.Start < 0 {
			continue // began during warm-up
		}
		d := float64(cap)
		if e.End >= 0 {
			d = math.Min(float64(e.End-e.Start), float64(cap))
			resolved++
			if e.ByAgent {
				byAgent++
			}
		} else if n-e.Start < cap {
			continue // still open, too recent to judge
		}
		if e.Start < q {
			early = append(early, d)
		} else if e.Start >= n-q {
			late = append(late, d)
		}
	}
	res.EarlyRes, res.EarlyN = meanF(early), len(early)
	res.LateRes, res.LateN = meanF(late), len(late)
	if resolved > 0 {
		res.ByAgentFrac = float64(byAgent) / float64(resolved)
	}
	res.Ledger = r.Ledger
	res.Counters = map[string]float64{}
	for k, v := range r.Env.Counters() {
		res.Counters[k] = v
	}
	res.Stats = r.Agent.Stats()
	return res
}

func meanF(xs []float64) float64 {
	if len(xs) == 0 {
		return math.NaN()
	}
	s := 0.0
	for _, x := range xs {
		s += x
	}
	return s / float64(len(xs))
}

func aggregate(rs []RunResult) []Agg {
	type key struct{ e, a, f string }
	groups := map[key][]RunResult{}
	var order []key
	for _, r := range rs {
		k := key{r.Env, r.Agent, r.Feel}
		if _, ok := groups[k]; !ok {
			order = append(order, k)
		}
		groups[k] = append(groups[k], r)
	}
	var out []Agg
	for _, k := range order {
		g := groups[k]
		a := Agg{Env: k.e, Agent: k.a, Feel: k.f, Runs: g, Counters: map[string]float64{}, Stats: map[string]float64{}}
		nb := len(g[0].Curve)
		a.Curve = make([]float64, nb)
		var q4s, settles []float64
		var er, lr []float64
		hasMem, hasBr := false, false
		var mem MemoryResult
		var br BranchResult
		for _, r := range g {
			a.Mean += r.Mean
			a.Q1 += r.Q1
			a.Q4 += r.Q4
			q4s = append(q4s, r.Q4)
			for b := range a.Curve {
				a.Curve[b] += r.Curve[b]
			}
			settles = append(settles, float64(r.FirstSettle))
			a.SettledFrac += r.SettledFrac
			if !math.IsNaN(r.EarlyRes) {
				er = append(er, r.EarlyRes)
			}
			if !math.IsNaN(r.LateRes) {
				lr = append(lr, r.LateRes)
			}
			a.ByAgentFrac += r.ByAgentFrac
			a.Resolved += r.Ledger.AgentResolved
			a.Created += r.Ledger.AgentCreated
			a.WorldAdded += r.Ledger.WorldAdded
			a.WorldRemoved += r.Ledger.WorldRemoved
			a.FeltRelief += r.Ledger.FeltRelief
			a.LookAway += r.Ledger.LookAway
			a.Displaced += r.Ledger.Displaced
			a.TransferFresh += r.TransferFresh
			a.TransferMoved += r.TransferMoved
			for kk, v := range r.Counters {
				a.Counters[kk] += v
			}
			for kk, v := range r.Stats {
				a.Stats[kk] += v
			}
			if r.Branch != nil {
				hasBr = true
				br.Continue += r.Branch.Continue
				br.LearningOff += r.Branch.LearningOff
				br.AfterQuiet += r.Branch.AfterQuiet
			}
			if r.Memory != nil {
				hasMem = true
				mem.MarksWritten += r.Memory.MarksWritten
				mem.MarksSeenFrac += r.Memory.MarksSeenFrac
				mem.Continue += r.Memory.Continue
				mem.MarksErased += r.Memory.MarksErased
				mem.AgentWiped += r.Memory.AgentWiped
				mem.BothWiped += r.Memory.BothWiped
			}
		}
		n := float64(len(g))
		a.Mean /= n
		a.Q1 /= n
		a.Q4 /= n
		a.Q4sd = sd(q4s, a.Q4)
		for b := range a.Curve {
			a.Curve[b] /= n
		}
		sort.Float64s(settles)
		a.FirstSettle = settles[len(settles)/2]
		a.SettledFrac /= n
		a.EarlyRes, a.LateRes = meanF(er), meanF(lr)
		a.ByAgentFrac /= n
		a.Resolved /= n
		a.Created /= n
		a.WorldAdded /= n
		a.WorldRemoved /= n
		a.FeltRelief /= n
		a.LookAway /= n
		a.Displaced /= n
		a.TransferFresh /= n
		a.TransferMoved /= n
		for kk := range a.Counters {
			a.Counters[kk] /= n
		}
		for kk := range a.Stats {
			a.Stats[kk] /= n
		}
		if hasBr {
			br.Continue /= n
			br.LearningOff /= n
			br.AfterQuiet /= n
			a.Branch = &br
		}
		if hasMem {
			mem.MarksWritten = int(float64(mem.MarksWritten) / n)
			mem.MarksSeenFrac /= n
			mem.Continue /= n
			mem.MarksErased /= n
			mem.AgentWiped /= n
			mem.BothWiped /= n
			a.Memory = &mem
		}
		out = append(out, a)
	}
	return out
}

func sd(xs []float64, m float64) float64 {
	if len(xs) < 2 {
		return 0
	}
	s := 0.0
	for _, x := range xs {
		s += (x - m) * (x - m)
	}
	return math.Sqrt(s / float64(len(xs)-1))
}
