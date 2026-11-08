package agents

import (
	"hsm/gridworld/automaton"
	"hsm/gridworld/world"
)

// Oracle is not a baseline: it reads the whole environment and follows the
// environment's scripted policy. It marks roughly how low energy can go, so
// the other numbers have a floor to be read against. The judge hands it the
// environment through Bind.
type Oracle struct {
	base
	env world.Env
}

func NewOracle(seed uint64) automaton.Automaton { return &Oracle{} }
func (*Oracle) Name() string                    { return "oracle" }
func (o *Oracle) Bind(e world.Env)              { o.env = e }
func (o *Oracle) Act(*automaton.Perception) world.Action {
	if o.env == nil {
		return world.Stay
	}
	return o.env.Oracle()
}

// Binder is implemented by reference agents that need the environment.
type Binder interface{ Bind(world.Env) }
