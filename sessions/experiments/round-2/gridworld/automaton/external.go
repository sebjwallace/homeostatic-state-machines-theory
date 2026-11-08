package automaton

import (
	"bufio"
	"fmt"
	"io"
	"os"
	"os/exec"
	"strconv"
	"strings"

	"hsm/gridworld/world"
)

// External runs an automaton in another process and speaks the line
// protocol with it over stdin/stdout. See PROTOCOL in README.md.
//
// Every message from the judge is one line; the automaton answers every
// message with exactly one line. Words are separated by single spaces.
//
//	judge -> automaton                          automaton -> judge
//	seed <n>                                    ok
//	enter <env> <radius> <local|global> <allowed> <syms>
//	                                            ok
//	act <step> <felt> <carry> <moved> <view> [<h1,h2,...>]
//	                                            <action> [<internal energy>]
//	quiet <steps>                               ok
//	learning <0|1>                              ok
//	freezing <0|1>                              ok
//	stats                                       [<key>=<value> ...]
//	quit                                        (process exits)
//
// <allowed> is 9 digits, one per action index (1 = allowed). <syms> is the
// symbol alphabet as characters (".#mofawbEXd"), index = symbol number.
// <view> is side*side characters from <syms>, row-major, agent at centre.
// <carry> is one character from <syms>. Heat is present only for local feel.
// <action> is an integer 0..8 or an action name ("north", "mark", ...).
type External struct {
	name   string
	cmd    *exec.Cmd
	in     *bufio.Writer
	out    *bufio.Reader
	energy float64
	buf    []byte
}

// NewExternalFactory makes a Factory that starts `command` (run through
// sh -c) once per automaton.
func NewExternalFactory(name, command string) Factory {
	return Factory{Name: name, Learns: true, New: func(seed uint64) Automaton {
		e, err := StartExternal(name, command, seed)
		if err != nil {
			fmt.Fprintln(os.Stderr, "external automaton:", err)
			os.Exit(1)
		}
		return e
	}}
}

func StartExternal(name, command string, seed uint64) (*External, error) {
	cmd := exec.Command("sh", "-c", command)
	stdin, err := cmd.StdinPipe()
	if err != nil {
		return nil, err
	}
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return nil, err
	}
	cmd.Stderr = os.Stderr
	if err := cmd.Start(); err != nil {
		return nil, err
	}
	e := &External{name: name, cmd: cmd, in: bufio.NewWriter(stdin), out: bufio.NewReader(stdout)}
	e.call("seed " + strconv.FormatUint(seed, 10))
	return e, nil
}

func (e *External) call(line string) string {
	e.in.WriteString(line)
	e.in.WriteByte('\n')
	if err := e.in.Flush(); err != nil {
		panic(fmt.Sprintf("external %s: write: %v", e.name, err))
	}
	resp, err := e.out.ReadString('\n')
	if err != nil && err != io.EOF {
		panic(fmt.Sprintf("external %s: read: %v", e.name, err))
	}
	return strings.TrimSpace(resp)
}

func (e *External) Name() string { return e.name }

func (e *External) Enter(s Spec) {
	var al [world.NumActions]byte
	for i := range al {
		al[i] = '0'
		if s.Allowed[i] {
			al[i] = '1'
		}
	}
	e.call(fmt.Sprintf("enter %s %d %s %s %s", s.Env, s.Radius, s.Feel, al[:], world.SymChars))
}

func (e *External) Act(p *Perception) world.Action {
	b := e.buf[:0]
	b = append(b, "act "...)
	b = strconv.AppendInt(b, int64(p.Step), 10)
	b = append(b, ' ')
	b = strconv.AppendFloat(b, p.Felt, 'g', -1, 64)
	b = append(b, ' ', world.SymChars[p.Carry], ' ')
	if p.Moved {
		b = append(b, '1')
	} else {
		b = append(b, '0')
	}
	b = append(b, ' ')
	for _, s := range p.View {
		b = append(b, world.SymChars[s])
	}
	if p.Heat != nil {
		b = append(b, ' ')
		for i, h := range p.Heat {
			if i > 0 {
				b = append(b, ',')
			}
			b = strconv.AppendFloat(b, h, 'g', -1, 64)
		}
	}
	e.buf = b
	resp := e.call(string(b))
	f := strings.Fields(resp)
	if len(f) == 0 {
		return world.Stay
	}
	if len(f) > 1 {
		e.energy, _ = strconv.ParseFloat(f[1], 64)
	}
	return ParseAction(f[0])
}

// ParseAction reads an action as an index or a name; unknown -> Stay.
func ParseAction(s string) world.Action {
	if n, err := strconv.Atoi(s); err == nil && n >= 0 && n < int(world.NumActions) {
		return world.Action(n)
	}
	for i, nm := range world.ActionNames {
		if nm == s {
			return world.Action(i)
		}
	}
	return world.Stay
}

func (e *External) Quiet(steps int) { e.call("quiet " + strconv.Itoa(steps)) }
func (e *External) SetLearning(on bool) {
	e.call("learning " + b01(on))
}
func (e *External) SetFreezing(on bool) {
	e.call("freezing " + b01(on))
}
func (e *External) Stats() map[string]float64 {
	out := map[string]float64{}
	for _, kv := range strings.Fields(e.call("stats")) {
		if k, v, ok := strings.Cut(kv, "="); ok {
			if x, err := strconv.ParseFloat(v, 64); err == nil {
				out[k] = x
			}
		}
	}
	return out
}
func (e *External) Energy() float64 { return e.energy }

// Close ends the process.
func (e *External) Close() {
	e.in.WriteString("quit\n")
	e.in.Flush()
	e.cmd.Wait()
}

func b01(on bool) string {
	if on {
		return "1"
	}
	return "0"
}

// Closer is implemented by automata holding resources (External).
type Closer interface{ Close() }
