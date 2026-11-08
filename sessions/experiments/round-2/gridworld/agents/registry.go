package agents

import (
	"hsm/gridworld/automaton"
	"hsm/gridworld/models/m008"
)

// Registry is every agent the judge runs. To add an automaton, append one
// line here (see README.md).
var Registry = []automaton.Factory{
	{Name: "idle", New: NewIdle, FeelIndependent: true},
	{Name: "random", New: NewRandom, FeelIndependent: true},
	{Name: "reactive", New: NewReactive},
	{Name: "qlearn", New: NewQ(DefaultQ, "qlearn"), Learns: true},
	{Name: "qlearn-felt", New: NewQ(FeltQ, "qlearn-felt"), Learns: true, LocalOnly: true},
	{Name: "mapper", New: NewMapper, LocalOnly: true},
	{Name: "m008", New: m008.New, Learns: true},
	{Name: "m008-aon", New: m008.NewAON, Learns: true},
	{Name: "oracle", New: NewOracle, FeelIndependent: true},
}
