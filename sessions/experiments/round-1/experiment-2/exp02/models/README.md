# Adding a model

Each model is one crate in `models/`. To add one you create the crate, add one dependency line to `harness/Cargo.toml`, and add one registry line to `harness/src/bin/run.rs`. `models/m000-reference/` is a complete working example to copy.

## 1. Create the crate

```
models/m003-your-name/
  Cargo.toml
  src/lib.rs
  FINDINGS.md          (written at the end, see ../SPEC.md)
```

`models/m003-your-name/Cargo.toml`:

```toml
[package]
name = "m003-your-name"
version = "0.1.0"
edition.workspace = true
license.workspace = true

[dependencies]
hsm-core = { path = "../../core" }
```

The workspace picks the crate up automatically (`members = ["core", "harness", "models/*"]`). Depend only on `hsm-core`: no external crates, and not on `harness` (the harness depends on you).

## 2. Implement the trait and the constructor

`src/lib.rs` must export a type with this constructor and an `Automaton` impl:

```rust
use hsm_core::{sym, Automaton, Rng, FastMap, A};

pub struct Model { /* ... */ }

impl Model {
    /// `capacity` is a hard limit on your main units (cells, states, ...).
    /// Tests 1-4, 6, 7 pass 1_000_000; test 5 (forgetting) passes a scarce value.
    pub fn new(seed: u64, capacity: usize) -> Self { /* ... */ }
}

impl Automaton for Model {
    fn name(&self) -> &str;
    /// Distribution over the next character, indexed like hsm_core::ALPHABET
    /// ("abcdefghijklmnopqrstuvwxyz .\n", A = 29 entries).
    /// Must sum to 1 (within 1e-6) and every entry must be > 0 and finite.
    fn predict(&mut self) -> Vec<f64>;
    /// The character arrives (an ASCII byte; hsm_core::sym(ch) gives its index).
    /// Advance state; learn if learning is on.
    fn observe(&mut self, ch: u8);
    /// When off, structure must not change; states may still transition.
    fn set_learning(&mut self, on: bool);
    /// A quiet period of `steps` with no input.
    fn quiet(&mut self, steps: usize);
    /// Current internal energy (misfit). Read after each observe() in test 6.
    fn energy(&self) -> f64;
    /// Free-form stats. Report a key "units" (main units in use) and the
    /// harness tracks its peak for the cost table.
    fn stats(&self) -> Vec<(String, f64)>;
    /// Optional, for test 5. Return true if your model can switch freezing
    /// on/off; the harness then runs test 5 both ways. Default: unsupported.
    fn set_freezing(&mut self, on: bool) -> bool { false }
}
```

The trait is defined in `core/src/lib.rs`, which also provides:

- `ALPHABET`, `A`, `sym(ch)`, `chr(i)`, `uniform()`.
- `Rng`: a seeded xoshiro256** PRNG (`Rng::new(seed)`, `Rng::derived(seed, "name")`, `f64()`, `below(n)`, `chance(p)`, `pick`, `shuffle`).
- `FastMap` / `FastSet`: `HashMap` / `HashSet` with a deterministic hasher. **Do not use `std::collections::HashMap` with its default hasher**: it is randomly seeded per process, so iterating it makes a model non-deterministic. The harness checks determinism (two instances, same seed, 5,000 characters, bit-identical predictions) and reports a failure as an error on test 1.

How the harness drives a model: `predict()` then `observe(ch)` for every character. Tests 1–4 and 6 share one instance: it reads the 60k training stream with learning on, then `set_learning(false)` and reads the evaluation texts. Tests 5 and 7 build fresh instances. If `predict()` returns an invalid distribution, or the model panics, that test is recorded as an error and the run carries on.

## 3. Register it (two lines)

In `harness/Cargo.toml`, under `[dependencies]`:

```toml
m003-your-name = { path = "../models/m003-your-name" }
```

In `harness/src/bin/run.rs`, inside `fn models()`:

```rust
model!("m003-your-name", m003_your_name::Model),
// or, to choose the scarce capacity used by test 5 (default 2_000):
model!("m003-your-name", m003_your_name::Model, scarce = 500),
```

(The crate name's hyphens become underscores in Rust paths.)

## 4. Run

```sh
cd /home/claude/hsm/exp02
# Fast iteration: your model only, seed 1, no baselines.
cargo run --release -p harness --bin run -- --model m003 --no-baselines --seeds 1
# Your model against all 16 baselines, three seeds.
cargo run --release -p harness --bin run -- --model m003
# Everything (writes results/results.json and results/RESULTS.md).
cargo run --release -p harness --bin run
```

`--model` matches by substring and can be repeated or comma-separated. With `--model`, output goes to `results/runs/<name>/` so the full `results/` report is not overwritten; use `--out DIR` to choose. Other options: `--jobs N`, `--corpus` (print corpus statistics and verification), `--dump-corpus DIR` (write every text the tests use, to read them), `--help`.

Tune on seed 1 only. Seeds 2 and 3 are for reporting.
