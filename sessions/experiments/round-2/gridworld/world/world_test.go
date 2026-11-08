package world

import "testing"

// Every environment: deterministic from seeds, Field sums to Total, Clone is
// independent, and the oracle keeps energy far below doing nothing.
func TestEnvs(t *testing.T) {
	for _, e := range Registry {
		run := func(act func(Env) Action) (float64, []float64) {
			env := Prepare(e.Make, 3, 4)
			var series []float64
			r := NewRng(9)
			for k := 0; k < 3000; k++ {
				a := act(env)
				if a == NumActions {
					a = Action(r.Intn(int(NumActions)))
				}
				env.Apply(a)
				env.Evolve()
				f := env.Field()
				s := 0.0
				for _, v := range f {
					s += v
				}
				if d := s - env.Total(); d > 1e-6 || d < -1e-6 {
					t.Fatalf("%s: field sum %v != total %v", e.Name, s, env.Total())
				}
				series = append(series, env.Total())
			}
			m := 0.0
			for _, v := range series {
				m += v
			}
			return m / float64(len(series)), series
		}
		rnd := func(Env) Action { return NumActions }
		_, a := run(rnd)
		_, b := run(rnd)
		for i := range a {
			if a[i] != b[i] {
				t.Fatalf("%s: not deterministic at step %d", e.Name, i)
			}
		}
		idle, _ := run(func(Env) Action { return Stay })
		oracle, _ := run(func(env Env) Action { return env.Oracle() })
		if oracle > 0.2*idle {
			t.Errorf("%s: oracle %.2f vs idle %.2f", e.Name, oracle, idle)
		}
		// clone independence
		env := Prepare(e.Make, 5, 6)
		c := env.Clone()
		before := c.Total()
		for k := 0; k < 500; k++ {
			env.Apply(env.Oracle())
			env.Evolve()
		}
		if c.Total() != before {
			t.Errorf("%s: clone changed when original stepped", e.Name)
		}
	}
}
