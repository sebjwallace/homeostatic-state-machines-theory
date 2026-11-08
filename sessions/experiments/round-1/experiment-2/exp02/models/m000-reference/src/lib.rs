//! m000-reference: a trivial order-2 table with add-1/2 (Krichevsky–Trofimov)
//! smoothing. It exists so the harness can be run and checked before any real
//! model exists. It is plainly a counting model and is not part of the comparison.
//!
//! It also shows the minimum a model crate needs: a struct, a
//! `pub fn new(seed: u64, capacity: usize) -> Self`, and an `Automaton` impl.

use hsm_core::{sym, Automaton, FastMap, A};

pub struct Model {
    table: FastMap<(u8, u8), [u32; A]>,
    prev: (u8, u8),
    learning: bool,
    capacity: usize,
    last_p: Vec<f64>,
    energy: f64,
}

impl Model {
    /// `capacity` caps the number of order-2 contexts (the "units").
    pub fn new(_seed: u64, capacity: usize) -> Self {
        Model {
            table: FastMap::default(),
            prev: (255, 255),
            learning: true,
            capacity,
            last_p: Vec::new(),
            energy: 0.0,
        }
    }

    fn dist(&self) -> Vec<f64> {
        match self.table.get(&self.prev) {
            None => vec![1.0 / A as f64; A],
            Some(c) => {
                let n: u32 = c.iter().sum();
                let denom = n as f64 + 0.5 * A as f64;
                c.iter().map(|&k| (k as f64 + 0.5) / denom).collect()
            }
        }
    }
}

impl Automaton for Model {
    fn name(&self) -> &str {
        "m000-reference"
    }
    fn predict(&mut self) -> Vec<f64> {
        self.last_p = self.dist();
        self.last_p.clone()
    }
    fn observe(&mut self, ch: u8) {
        let s = sym(ch);
        if self.last_p.len() != A {
            self.last_p = self.dist();
        }
        // Energy: surprisal of the character that arrived.
        self.energy = -self.last_p[s].log2();
        if self.learning {
            let full = self.table.len() >= self.capacity;
            if let Some(c) = self.table.get_mut(&self.prev) {
                c[s] += 1;
            } else if !full {
                let mut c = [0u32; A];
                c[s] = 1;
                self.table.insert(self.prev, c);
            }
        }
        self.prev = (self.prev.1, s as u8);
        self.last_p.clear();
    }
    fn set_learning(&mut self, on: bool) {
        self.learning = on;
    }
    fn quiet(&mut self, _steps: usize) {}
    fn energy(&self) -> f64 {
        self.energy
    }
    fn stats(&self) -> Vec<(String, f64)> {
        vec![("units".to_string(), self.table.len() as f64)]
    }
}
