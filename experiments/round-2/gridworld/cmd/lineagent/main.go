// lineagent serves any registered Go agent over the line protocol on
// stdin/stdout. It is the reference implementation of the automaton side of
// the protocol, and lets the judge check that an agent run through the
// protocol behaves exactly as it does in-process.
//
//	go run ./cmd/lineagent qlearn
package main

import (
	"bufio"
	"fmt"
	"os"
	"sort"
	"strconv"
	"strings"

	"hsm/gridworld/agents"
	"hsm/gridworld/automaton"
	"hsm/gridworld/world"
)

func main() {
	if len(os.Args) < 2 {
		fmt.Fprintln(os.Stderr, "usage: lineagent <agent name>")
		os.Exit(2)
	}
	var fac *automaton.Factory
	for i := range agents.Registry {
		if agents.Registry[i].Name == os.Args[1] {
			fac = &agents.Registry[i]
		}
	}
	if fac == nil {
		fmt.Fprintln(os.Stderr, "unknown agent", os.Args[1])
		os.Exit(2)
	}
	in := bufio.NewScanner(os.Stdin)
	in.Buffer(make([]byte, 1<<20), 1<<20)
	out := bufio.NewWriter(os.Stdout)
	reply := func(s string) { out.WriteString(s); out.WriteByte('\n'); out.Flush() }
	var ag automaton.Automaton = fac.New(0)
	var spec automaton.Spec
	symIdx := map[byte]world.Sym{}
	for i := 0; i < len(world.SymChars); i++ {
		symIdx[world.SymChars[i]] = world.Sym(i)
	}
	p := &automaton.Perception{}
	for in.Scan() {
		w := strings.Fields(in.Text())
		if len(w) == 0 {
			continue
		}
		switch w[0] {
		case "seed":
			s, _ := strconv.ParseUint(w[1], 10, 64)
			ag = fac.New(s)
			reply("ok")
		case "enter":
			r, _ := strconv.Atoi(w[2])
			spec = automaton.Spec{Env: w[1], Radius: r, NumSyms: len(w[5])}
			if w[3] == "global" {
				spec.Feel = automaton.FeelGlobal
			}
			for i, c := range w[4] {
				spec.Allowed[i] = c == '1'
			}
			ag.Enter(spec)
			reply("ok")
		case "act":
			p.Step, _ = strconv.Atoi(w[1])
			p.Felt, _ = strconv.ParseFloat(w[2], 64)
			p.Carry = symIdx[w[3][0]]
			p.Moved = w[4] == "1"
			p.View = p.View[:0]
			for i := 0; i < len(w[5]); i++ {
				p.View = append(p.View, symIdx[w[5][i]])
			}
			p.Heat = nil
			if len(w) > 6 {
				for _, h := range strings.Split(w[6], ",") {
					v, _ := strconv.ParseFloat(h, 64)
					p.Heat = append(p.Heat, v)
				}
			}
			a := ag.Act(p)
			reply(strconv.Itoa(int(a)) + " " + strconv.FormatFloat(ag.Energy(), 'g', 6, 64))
		case "quiet":
			n, _ := strconv.Atoi(w[1])
			ag.Quiet(n)
			reply("ok")
		case "learning":
			ag.SetLearning(w[1] == "1")
			reply("ok")
		case "freezing":
			ag.SetFreezing(w[1] == "1")
			reply("ok")
		case "stats":
			st := ag.Stats()
			var ks []string
			for k := range st {
				ks = append(ks, k)
			}
			sort.Strings(ks)
			var parts []string
			for _, k := range ks {
				parts = append(parts, k+"="+strconv.FormatFloat(st[k], 'g', -1, 64))
			}
			reply(strings.Join(parts, " "))
		case "quit":
			return
		default:
			reply("ok")
		}
	}
}
