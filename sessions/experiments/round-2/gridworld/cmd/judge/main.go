// judge runs every agent in every environment and writes results/.
//
//	go run ./cmd/judge                       full run (all agents, all envs)
//	go run ./cmd/judge -quick                fewer steps and seeds
//	go run ./cmd/judge -agents qlearn,random -envs maze
//	go run ./cmd/judge -ext "name=command"   add an external (line protocol) automaton
//	go run ./cmd/judge -trace maze:qlearn:local:1 -trace-steps 20000
package main

import (
	"flag"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	"hsm/gridworld/agents"
	"hsm/gridworld/automaton"
	"hsm/gridworld/judge"
	"hsm/gridworld/world"
)

func main() {
	quick := flag.Bool("quick", false, "fewer steps and seeds")
	steps := flag.Int("steps", 0, "override steps per run")
	agentList := flag.String("agents", "", "comma-separated agent names (default all)")
	envList := flag.String("envs", "", "comma-separated env names (default all)")
	ext := flag.String("ext", "", "external automata: name=command[;name=command]")
	out := flag.String("out", "results", "output directory")
	traces := flag.String("trace", "default", "traces to write: env:agent:feel:seed[,...], 'default', or 'none'")
	traceSteps := flag.Int("trace-steps", 20000, "steps per trace")
	workers := flag.Int("workers", 2, "parallel runs")
	noProto := flag.Bool("no-protocol-check", false, "skip the line protocol equivalence check")
	flag.Parse()

	cfg := judge.DefaultConfig
	cfg.Workers = *workers
	if *quick {
		cfg.Steps, cfg.Seeds, cfg.TransferSteps, cfg.MemorySteps = 6000, []uint64{1, 2}, 2000, 2000
	}
	if *steps > 0 {
		cfg.Steps = *steps
	}
	facs := pick(agents.Registry, *agentList)
	all := append([]automaton.Factory{}, agents.Registry...)
	if *ext != "" {
		for _, kv := range strings.Split(*ext, ";") {
			n, c, ok := strings.Cut(kv, "=")
			if !ok {
				fmt.Fprintln(os.Stderr, "bad -ext, want name=command")
				os.Exit(2)
			}
			facs = append(facs, automaton.NewExternalFactory(n, c))
			all = append(all, automaton.NewExternalFactory(n, c))
		}
	}
	var envs []struct {
		Name string
		Make world.Maker
	}
	for _, e := range world.Registry {
		if *envList == "" || contains(*envList, e.Name) {
			envs = append(envs, e)
		}
	}
	os.MkdirAll(*out, 0o755)
	t0 := time.Now()
	aggs := judge.RunAll(cfg, envs, facs)
	secs := time.Since(t0).Seconds()
	fmt.Printf("ran %d groups in %.1fs\n", len(aggs), secs)

	res := judge.Results{Config: cfg, Aggs: aggs, Seconds: secs}
	for _, e := range envs {
		info := e.Make(1, 1).Info()
		var al []string
		for a := world.Action(0); a < world.NumActions; a++ {
			if info.Allowed[a] {
				al = append(al, world.ActionNames[a])
			}
		}
		res.Envs = append(res.Envs, judge.EnvDesc{Name: info.Name, Desc: info.Desc, SettleLevel: info.SettleLevel, EpisodeCap: info.EpisodeCap, Allowed: al})
	}
	if !*noProto {
		res.Protocol = protocolCheck()
		fmt.Println("protocol:", res.Protocol)
	}
	res.Seconds = time.Since(t0).Seconds()
	if err := judge.WriteJSON(filepath.Join(*out, "results.json"), res); err != nil {
		fmt.Fprintln(os.Stderr, err)
	}
	if err := judge.WriteMarkdown(filepath.Join(*out, "RESULTS.md"), res, commentary, summary); err != nil {
		fmt.Fprintln(os.Stderr, err)
	}
	// traces
	if *traces != "none" {
		spec := *traces
		if spec == "default" {
			spec = "restore:qlearn:local:1,fire:reactive:local:1,litter:qlearn:local:1,maze:qlearn:local:1,maze:qlearn-felt:local:1,wells:mapper:local:1"
		}
		os.MkdirAll(filepath.Join(*out, "traces"), 0o755)
		for _, t := range strings.Split(spec, ",") {
			if p, err := writeTrace(t, *traceSteps, cfg.Radius, all, filepath.Join(*out, "traces")); err != nil {
				fmt.Fprintln(os.Stderr, "trace", t, err)
			} else {
				fmt.Println("trace", p)
			}
		}
	}
	for _, a := range aggs {
		fmt.Printf("%-8s %-20s Q1 %7.2f  Q4 %7.2f  res %6.0f -> %6.0f\n", a.Env, a.Agent+"/"+a.Feel, a.Q1, a.Q4, a.EarlyRes, a.LateRes)
	}
	fmt.Printf("total %.1fs\n", time.Since(t0).Seconds())
}

func writeTrace(spec string, steps, radius int, facs []automaton.Factory, dir string) (string, error) {
	p := strings.Split(spec, ":")
	if len(p) != 4 {
		return "", fmt.Errorf("want env:agent:feel:seed")
	}
	var mk world.Maker
	for _, e := range world.Registry {
		if e.Name == p[0] {
			mk = e.Make
		}
	}
	var fac *automaton.Factory
	for i := range facs {
		if facs[i].Name == p[1] {
			fac = &facs[i]
		}
	}
	if mk == nil || fac == nil {
		return "", fmt.Errorf("unknown env or agent")
	}
	feel := automaton.FeelLocal
	if p[2] == "global" {
		feel = automaton.FeelGlobal
	}
	var seed uint64
	fmt.Sscan(p[3], &seed)
	path := filepath.Join(dir, fmt.Sprintf("%s-%s-%s-%d.jsonl", p[0], p[1], p[2], seed))
	tw, err := judge.NewTrace(path)
	if err != nil {
		return "", err
	}
	defer tw.Close()
	env := world.Prepare(mk, seed, seed*7919+13)
	r := judge.NewRunnerTraced(env, fac.New(seed*104729+7), radius, feel, tw)
	r.Step(steps)
	return path, nil
}

// protocolCheck runs qlearn in-process and through cmd/lineagent over the
// line protocol, same seeds, and compares the energy series step for step.
func protocolCheck() string {
	bin := filepath.Join(os.TempDir(), "hsm-lineagent")
	if out, err := exec.Command("go", "build", "-o", bin, "./cmd/lineagent").CombinedOutput(); err != nil {
		return "skipped (could not build cmd/lineagent: " + strings.TrimSpace(string(out)) + ")"
	}
	const n = 3000
	var mk world.Maker
	for _, e := range world.Registry {
		if e.Name == "litter" {
			mk = e.Make
		}
	}
	fac := agents.Registry[0]
	for _, f := range agents.Registry {
		if f.Name == "qlearn" {
			fac = f
		}
	}
	diffs := 0
	for _, feel := range []automaton.Feel{automaton.FeelLocal, automaton.FeelGlobal} {
		a := judge.NewRunner(world.Prepare(mk, 1, 2), fac.New(42), 2, feel)
		a.Step(n)
		extF := automaton.NewExternalFactory("qlearn-ext", bin+" qlearn")
		ea := extF.New(42)
		b := judge.NewRunner(world.Prepare(mk, 1, 2), ea, 2, feel)
		b.Step(n)
		ea.(*automaton.External).Close()
		for i := range a.Series {
			if a.Series[i] != b.Series[i] {
				diffs++
			}
		}
	}
	if diffs == 0 {
		return fmt.Sprintf("qlearn run in-process and through the line protocol (cmd/lineagent) gave identical energy series on litter, %d steps, local and global feel.", n)
	}
	return fmt.Sprintf("MISMATCH: %d differing steps between in-process and line-protocol qlearn", diffs)
}

func pick(all []automaton.Factory, list string) []automaton.Factory {
	if list == "" {
		return all
	}
	var out []automaton.Factory
	for _, f := range all {
		if contains(list, f.Name) {
			out = append(out, f)
		}
	}
	return out
}

func contains(list, name string) bool {
	for _, x := range strings.Split(list, ",") {
		if strings.TrimSpace(x) == name {
			return true
		}
	}
	return false
}

// Commentary written against the committed run (seeds 1-5, 20,000 steps).
// The tables are regenerated on every run; if you change an environment or
// a baseline, re-read the tables and update this text.
var summary = `**Reading guide.** The overview below is the short answer. In one line: *maze* and *litter* separate learning from non-learning most clearly (tabular Q-learning ends at 0.12 and 0.34 of idle; the best non-learner at 0.88 and 0.89); *restore* separates them only under global feel (local feel makes it easy enough for a hand-written agent to solve); *fire* and *wells* are won by hand-written agents, and *wells* in particular separates agents with memory from agents without (the mapper, a reactive agent plus an internal map, ends at 0.10; memoryless Q-learning at 0.80). The literal reward "drop in felt energy" fails under local feel in every environment: the learner is paid for walking away from trouble, so it learns to walk away (see qlearn-felt and the look-away column).`

var commentary = map[string]string{
	"restore": "**What makes it uneasy:** a plinth whose mark has faded (shown as a faded symbol); its unease grows from 1 to 3 the longer it stays faded. Every other cell is locked. **Honest difficulty:** too easy under local feel: the hand-written reactive agent nearly solves it (0.06 of idle) because the heat is visible and the fix is one action. Kept as the first rung. Under global feel it is informative: the reactive agent has no gradient (0.77) while Q-learning learns to find and fix plinths (0.22). Note the *created by agent* column: Q-learning also learns to wipe settled plinths and then restore them (about 140 wipes per run under global feel). The closed-world accounting shows this as energy created by the agent, not resolved: a reward-shaped loop the accounting is there to expose. With learning turned off (and so exploration off) its energy rises to near idle (about 9.7): the purely greedy policy gets stuck.",
	"fire":    "**What makes it uneasy:** burning cells (1 each) and ash (0.2 each, regrows after 300 steps). Grass ignites now and then, mostly at three hotspots, and fire spreads. Doing nothing is costly: idle sits at about 13. **Honest difficulty:** fine for non-learners, hard for tabular learning. Reactive agents put fires out where they feel them (0.44); the mapper also revisits remembered hot places (0.28). Q-learning improves slowly (resolution time 401 to 305 steps; transfer ratio 0.83, so what it learns is not layout-specific) but stays far behind the hand-written agents within 20,000 steps.",
	"litter":  "**What makes it uneasy:** each piece of litter (1), wherever it is, including in the agent's hands. Only putting it in a bin resolves it; putting it down elsewhere moves it. **This is the closed-world test.** Under local feel, the reactive and mapper agents resolve nothing at all, yet feel thousands of units of relief: almost all of it *look-away relief*, litter leaving the 5x5 view. Random and global-feel agents *displace* about 3,000 units per run (pick up, drop elsewhere) while resolving 16 to 22. Q-learning with the same-cells reward learns to carry litter to bins (0.34 local, 0.50 global) but still displaces about 2,300 units on the way. The tables show all three behaviours apart: resolving, moving, and looking away.",
	"maze":    "**What makes it uneasy:** the unmarked cells on the route from entrance to exit (the gap), felt at the two tips of the marked trail, plus 1 per stray mark off the route. Once joined, the trail erodes now and then. *Choice:* the maze is settled by a path of marks, not by the agent reaching the exit. A path is structure written into the environment that persists after the agent leaves, can be eroded, and must be maintained; reaching the exit is a one-off event with no disturbance afterwards. **Honest difficulty:** the strongest separation. Random and reactive agents never join the trail; the reactive and mapper agents make things worse than idle (1.21, 1.26) by marking wherever they feel heat, which strews stray marks (in this environment *displaced* mostly reflects the tips moving as the trail grows or shrinks, not dumping). Q-learning joins it in most runs and maintains it (0.12 local, settled first at a median of step 7,612). But what it learned does not transfer: in a new maze the experienced agent does slightly worse than a fresh one (ratio 1.11), because exploration has decayed in states it believes it knows.",
	"wells":   "**What makes it uneasy:** four springs far apart, out of each other's sight; each silts up steadily (unease up to 3) until cleared. About once every 3,000 steps a spring dries up and a new one wells up elsewhere. Marks are allowed and cost nothing. **Honest difficulty:** a memory test. Agents that only react to what they feel find one spring and stay near it (reactive 0.33). The mapper, the same reactive agent plus an internal map of where it has felt heat, makes rounds and reaches 0.10; replacing its mind with a fresh one costs it (1.66 to 2.55 over the next 5,000 steps). Memoryless Q-learning barely improves (0.80). **External memory:** no baseline uses marks as memory. Random and Q-learning agents write marks everywhere because they are free (so an old mark is almost always in view, which means nothing), and erasing them changes nothing; the reactive and mapper agents write marks only as a side effect of trying every action where they feel heat, never as signposts. This test is in place for automata that might.",
}
