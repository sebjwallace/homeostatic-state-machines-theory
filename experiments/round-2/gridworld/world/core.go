// Package world is the grid world: cells, symbols, the agent's body, and the
// environments that live on the grid. An environment is defined by what makes
// it uneasy (its energy) and by what an automaton is allowed to do in it.
//
// Everything is deterministic from seeds. The automaton never touches this
// package's state directly: it receives a Perception and returns an Action.
package world

// Sym is what a cell holds. The vocabulary is shared by every environment so
// that one automaton can live in all of them.
type Sym uint8

const (
	Empty    Sym = iota // '.' floor, grass
	Wall                // '#' impassable, never writable
	Mark                // 'm' a mark (written by the agent, or a settled plinth)
	Object              // 'o' something out of place: debris, litter
	Fire                // 'f' burning
	Ash                 // 'a' burnt ground, regrows
	Spring              // 'w' a spring welling up
	Bin                 // 'b' where litter belongs
	Entrance            // 'E' maze entrance
	Exit                // 'X' maze exit
	Faded               // 'd' a faded mark: a plinth that has drifted from its settled value
	NumSyms
)

// SymChars maps each symbol to one printable character (used by the line
// protocol and traces). Index by Sym.
const SymChars = ".#mofawbEXd"

// SymNames are human-readable names, index by Sym.
var SymNames = [NumSyms]string{"empty", "wall", "mark", "object", "fire", "ash", "spring", "bin", "entrance", "exit", "faded"}

// Action is what the agent can do in one step. Writes act on the cell the
// agent stands on. Each environment says which actions are allowed.
type Action uint8

const (
	Stay      Action = iota
	North            // y-1
	East             // x+1
	South            // y+1
	West             // x-1
	WriteMark        // write a mark on this cell
	Clear            // write empty on this cell
	Take             // pick up the object on this cell (hands must be empty)
	Put              // put down what is carried on this cell
	NumActions
)

var ActionNames = [NumActions]string{"stay", "north", "east", "south", "west", "mark", "clear", "take", "put"}

// IsMove reports whether a is one of the four moves.
func (a Action) IsMove() bool { return a >= North && a <= West }

var dx = [5]int{0, 0, 1, 0, -1}
var dy = [5]int{0, -1, 0, 1, 0}

// Rng is splitmix64. Small, fast, and deterministic.
type Rng struct{ s uint64 }

func NewRng(seed uint64) *Rng { return &Rng{s: seed*0x9E3779B97F4A7C15 + 0x632BE59BD9B4E019} }

func (r *Rng) U64() uint64 {
	r.s += 0x9E3779B97F4A7C15
	z := r.s
	z = (z ^ (z >> 30)) * 0xBF58476D1CE4E5B9
	z = (z ^ (z >> 27)) * 0x94D049BB133111EB
	return z ^ (z >> 31)
}
func (r *Rng) Intn(n int) int        { return int(r.U64() % uint64(n)) }
func (r *Rng) Float() float64        { return float64(r.U64()>>11) / (1 << 53) }
func (r *Rng) Chance(p float64) bool { return r.Float() < p }
