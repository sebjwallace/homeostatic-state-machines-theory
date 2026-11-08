//! Counting baselines: PPM-C with exclusion, and interpolated Witten–Bell.
//!
//! Both are online and single pass: predict, then count the character.
//! Both are given every advantage the harness can offer:
//!
//! * Contexts are exact (no hashing collisions): the last `k` symbols are
//!   packed 5 bits each into a `u64` key, with order in the top bits.
//!   The start of a stream is padded with a "nothing" symbol, so every order
//!   always has a context.
//! * PPM-C uses update exclusion (only orders from the one that coded the
//!   character upward are updated), as in Moffat's PPMC. Full updating was
//!   also tried on seed 1 (`cargo run --release -p harness --example ppm_update`):
//!   update exclusion was better for orders 1–6 (best single PPM-C: order 4,
//!   0.815 vs 0.820 bpc) and marginally worse at 7–8, so it is the default.
//!   Witten–Bell always updates every order (that is what interpolation needs).
//!
//! `capacity` caps the number of context nodes. When the cap is reached no new
//! contexts are created; existing ones keep counting. `usize::MAX` = unlimited.
//!
//! Energy for a counting model is the surprisal (bits) of the last character.

use hsm_core::{sym, Automaton, FastMap, A};

const BITS: u32 = 5;
const MAX_ORDER: usize = 8;

#[derive(Clone)]
struct Node {
    c: [u32; A],
    n: u32,
    d: u32,
}

impl Node {
    fn new() -> Self {
        Node { c: [0; A], n: 0, d: 0 }
    }
}

/// Context store shared by both baselines: orders 0..=order.
struct Contexts {
    order: usize,
    map: FastMap<u64, u32>,
    nodes: Vec<Node>,
    hist: u64,
    capacity: usize,
}

impl Contexts {
    fn new(order: usize, capacity: usize) -> Self {
        assert!(order <= MAX_ORDER);
        Contexts { order, map: FastMap::default(), nodes: Vec::new(), hist: 0, capacity }
    }

    #[inline]
    fn key(&self, k: usize) -> u64 {
        let mask = if k == 0 { 0 } else { (1u64 << (BITS as usize * k)) - 1 };
        ((k as u64) << 48) | (self.hist & mask)
    }

    /// Node index for each order 0..=order (None if the context was never seen).
    fn lookup(&self) -> [Option<u32>; MAX_ORDER + 1] {
        let mut out = [None; MAX_ORDER + 1];
        for k in 0..=self.order {
            out[k] = self.map.get(&self.key(k)).copied();
        }
        out
    }

    /// Count symbol `s` in the contexts of orders `lo..=order`.
    fn update(&mut self, s: usize, lo: usize) {
        for k in lo..=self.order {
            let key = self.key(k);
            let idx = match self.map.get(&key) {
                Some(&i) => i,
                None => {
                    if self.nodes.len() >= self.capacity {
                        continue;
                    }
                    let i = self.nodes.len() as u32;
                    self.nodes.push(Node::new());
                    self.map.insert(key, i);
                    i
                }
            };
            let node = &mut self.nodes[idx as usize];
            if node.c[s] == 0 {
                node.d += 1;
            }
            node.c[s] += 1;
            node.n += 1;
        }
    }

    fn advance(&mut self, s: usize) {
        let mask = (1u64 << (BITS as usize * MAX_ORDER)) - 1;
        self.hist = ((self.hist << BITS) | (s as u64 + 1)) & mask;
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum PpmUpdate {
    /// Every order counts every character.
    Full,
    /// Only orders from the one that coded the character upward are updated.
    Exclusion,
}

/// PPM with escape method C and symbol exclusion (Moffat 1990).
pub struct PpmC {
    name: String,
    ctx: Contexts,
    learning: bool,
    update: PpmUpdate,
    last_surprisal: f64,
    last_p: Vec<f64>,
    /// Lowest order whose context (after exclusion) gave the symbol positive
    /// count in the most recent prediction, per symbol (for update exclusion).
    coded_at: [usize; A],
}

impl PpmC {
    pub fn new(order: usize, capacity: usize) -> Self {
        Self::with_update(order, capacity, PpmUpdate::Exclusion)
    }
    pub fn with_update(order: usize, capacity: usize, update: PpmUpdate) -> Self {
        let name = match update {
            PpmUpdate::Exclusion => format!("ppmc-o{}", order),
            PpmUpdate::Full => format!("ppmc-full-o{}", order),
        };
        PpmC {
            name,
            ctx: Contexts::new(order, capacity),
            learning: true,
            update,
            last_surprisal: 0.0,
            last_p: Vec::new(),
            coded_at: [0; A],
        }
    }

    fn distribution(&mut self) -> Vec<f64> {
        let nodes = self.ctx.lookup();
        let mut p = vec![0.0; A];
        let mut excluded = [false; A];
        let mut mass = 1.0; // probability of having escaped down to this order
        self.coded_at = [0; A];
        for k in (0..=self.ctx.order).rev() {
            let Some(i) = nodes[k] else { continue };
            let node = &self.ctx.nodes[i as usize];
            // Counts over non-excluded symbols only.
            let mut n = 0u64;
            let mut d = 0u64;
            for s in 0..A {
                if !excluded[s] && node.c[s] > 0 {
                    n += node.c[s] as u64;
                    d += 1;
                }
            }
            if n == 0 {
                continue; // nothing new here: no escape cost
            }
            let denom = (n + d) as f64;
            for s in 0..A {
                if !excluded[s] && node.c[s] > 0 {
                    p[s] = mass * node.c[s] as f64 / denom;
                    excluded[s] = true;
                    self.coded_at[s] = k;
                }
            }
            mass *= d as f64 / denom;
        }
        // Order -1: uniform over whatever is left.
        let left = excluded.iter().filter(|&&e| !e).count();
        if left > 0 {
            let q = mass / left as f64;
            for s in 0..A {
                if !excluded[s] {
                    p[s] = q;
                }
            }
        } else {
            // Every symbol was coded by some context; the final escape mass is
            // spread proportionally so the distribution still sums to 1.
            let tot: f64 = p.iter().sum();
            for x in p.iter_mut() {
                *x /= tot;
            }
        }
        p
    }
}

impl Automaton for PpmC {
    fn name(&self) -> &str {
        &self.name
    }
    fn predict(&mut self) -> Vec<f64> {
        let p = self.distribution();
        self.last_p = p.clone();
        p
    }
    fn observe(&mut self, ch: u8) {
        let s = sym(ch);
        if self.last_p.len() != A {
            self.distribution();
            self.last_p = vec![1.0 / A as f64; A];
        }
        self.last_surprisal = -self.last_p[s].log2();
        if self.learning {
            let lo = match self.update {
                PpmUpdate::Full => 0,
                PpmUpdate::Exclusion => self.coded_at[s],
            };
            self.ctx.update(s, lo);
        }
        self.ctx.advance(s);
        self.last_p.clear();
    }
    fn set_learning(&mut self, on: bool) {
        self.learning = on;
    }
    fn quiet(&mut self, _steps: usize) {}
    fn energy(&self) -> f64 {
        self.last_surprisal
    }
    fn stats(&self) -> Vec<(String, f64)> {
        vec![("units".into(), self.ctx.nodes.len() as f64)]
    }
}

/// Interpolated Witten–Bell (Witten & Bell 1991; Chen & Goodman 1998):
/// `P_k(s) = (c_k(s) + d_k * P_{k-1}(s)) / (n_k + d_k)`, with `P_{-1}` uniform
/// and unseen contexts passing the lower-order estimate through unchanged.
pub struct WittenBell {
    name: String,
    ctx: Contexts,
    learning: bool,
    last_surprisal: f64,
    last_p: Vec<f64>,
}

impl WittenBell {
    pub fn new(order: usize, capacity: usize) -> Self {
        WittenBell {
            name: format!("wb-o{}", order),
            ctx: Contexts::new(order, capacity),
            learning: true,
            last_surprisal: 0.0,
            last_p: Vec::new(),
        }
    }

    fn distribution(&self) -> Vec<f64> {
        let nodes = self.ctx.lookup();
        let mut p = vec![1.0 / A as f64; A];
        for k in 0..=self.ctx.order {
            let Some(i) = nodes[k] else { continue };
            let node = &self.ctx.nodes[i as usize];
            if node.n == 0 {
                continue;
            }
            let n = node.n as f64;
            let d = node.d as f64;
            let denom = n + d;
            for s in 0..A {
                p[s] = (node.c[s] as f64 + d * p[s]) / denom;
            }
        }
        p
    }
}

impl Automaton for WittenBell {
    fn name(&self) -> &str {
        &self.name
    }
    fn predict(&mut self) -> Vec<f64> {
        let p = self.distribution();
        self.last_p = p.clone();
        p
    }
    fn observe(&mut self, ch: u8) {
        let s = sym(ch);
        if self.last_p.len() != A {
            self.last_p = self.distribution();
        }
        self.last_surprisal = -self.last_p[s].log2();
        if self.learning {
            self.ctx.update(s, 0);
        }
        self.ctx.advance(s);
        self.last_p.clear();
    }
    fn set_learning(&mut self, on: bool) {
        self.learning = on;
    }
    fn quiet(&mut self, _steps: usize) {}
    fn energy(&self) -> f64 {
        self.last_surprisal
    }
    fn stats(&self) -> Vec<(String, f64)> {
        vec![("units".into(), self.ctx.nodes.len() as f64)]
    }
}

/// Prequential bits per character of a fresh model on `text`.
pub fn prequential_bpc(m: &mut dyn Automaton, text: &[u8]) -> f64 {
    let mut bits = 0.0;
    for &ch in text {
        let p = m.predict();
        bits -= p[sym(ch)].log2();
        m.observe(ch);
    }
    bits / text.len() as f64
}

/// Sanity checks. Returns, per baseline: (name, bpc on the second half of
/// a 20k cycled alphabet [deterministic at order 1], bpc on the second half of
/// a 20k repeated sentence [deterministic from order 5], bpc on the second
/// half of 200k uniform random characters). The first two should approach 0
/// (the sentence only for orders >= 5). The last should approach
/// log2(29) = 4.858 for low orders; high orders stay above it because their
/// 29^k contexts are each seen only a few times, and each new or sparse context
/// pays an escape cost. That is genuine PPM/WB behaviour on incompressible data.
pub fn sanity() -> Vec<(String, f64, f64, f64)> {
    use hsm_core::{Rng, ALPHABET};
    let cyc: Vec<u8> = ALPHABET.iter().cycle().take(20_000).copied().collect();
    let unit = b"the cat sat on the mat.\n";
    let rep: Vec<u8> = unit.iter().cycle().take(20_000).copied().collect();
    let mut rng = Rng::new(12345);
    let rnd: Vec<u8> = (0..200_000).map(|_| ALPHABET[rng.below(A)]).collect();
    let mut out = Vec::new();
    let second_half = |mk: &dyn Fn() -> Box<dyn Automaton>, t: &[u8]| {
        let mut m = mk();
        prequential_bpc(m.as_mut(), &t[..t.len() / 2]);
        prequential_bpc(m.as_mut(), &t[t.len() / 2..])
    };
    for kind in 0..2 {
        for order in 1..=MAX_ORDER {
            let mk = move || -> Box<dyn Automaton> {
                if kind == 0 {
                    Box::new(PpmC::new(order, usize::MAX))
                } else {
                    Box::new(WittenBell::new(order, usize::MAX))
                }
            };
            let c = second_half(&mk, &cyc);
            let r = second_half(&mk, &rep);
            let u = second_half(&mk, &rnd);
            out.push((mk().name().to_string(), c, r, u));
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn check_dist(p: &[f64]) {
        assert_eq!(p.len(), A);
        let s: f64 = p.iter().sum();
        assert!((s - 1.0).abs() < 1e-9, "sum {}", s);
        assert!(p.iter().all(|&x| x > 0.0 && x.is_finite()));
    }

    #[test]
    fn distributions_are_valid() {
        let text = b"the cat sat on the mat. a dog ran by the barn.\nzzz qqq the end.\n";
        for order in 1..=8 {
            let mut ms: Vec<Box<dyn Automaton>> = vec![
                Box::new(PpmC::new(order, usize::MAX)),
                Box::new(PpmC::with_update(order, usize::MAX, PpmUpdate::Full)),
                Box::new(WittenBell::new(order, usize::MAX)),
                Box::new(PpmC::new(order, 10)),
                Box::new(WittenBell::new(order, 10)),
            ];
            for m in ms.iter_mut() {
                for _ in 0..20 {
                    for &ch in text.iter() {
                        let p = m.predict();
                        check_dist(&p);
                        m.observe(ch);
                    }
                }
            }
        }
    }

    #[test]
    fn sanity_limits() {
        let uni = (A as f64).log2();
        for (name, cyc, rep, rnd) in sanity() {
            let order: usize = name.rsplit('o').next().unwrap().parse().unwrap();
            assert!(cyc < 0.01, "{} cycled-alphabet bpc {}", name, cyc);
            if order >= 5 {
                assert!(rep < 0.01, "{} repeated-sentence bpc {}", name, rep);
            }
            // Random text: never below log2(29) (no model can compress it);
            // order 1 has few enough contexts (29) to converge close to it.
            assert!(rnd > uni - 0.01, "{} random bpc {} vs {}", name, rnd, uni);
            if order == 1 {
                assert!(rnd < uni + 0.02, "{} random bpc {} vs {}", name, rnd, uni);
            } else if order == 2 {
                assert!(rnd < uni + 0.2, "{} random bpc {} vs {}", name, rnd, uni);
            } else {
                assert!(rnd < uni + 1.0, "{} random bpc {} vs {}", name, rnd, uni);
            }
        }
    }

    /// Hand-computed PPM-C example (full updates). After "abab" the order-1
    /// context "b" has seen 'a' once; order-2 "ab" has seen 'a' once.
    #[test]
    fn ppmc_hand_example() {
        let mut m = PpmC::with_update(2, usize::MAX, PpmUpdate::Full);
        for &ch in b"abab" {
            m.predict();
            m.observe(ch);
        }
        // Context order 2 = "ab": counts {a:1}, n=1, d=1 -> P(a)=1/2, esc=1/2.
        // Order 1 = "b": counts {a:1}; a excluded -> nothing new, skip.
        // Order 0: counts {a:2, b:2}; a excluded -> {b:2}, n=2, d=1:
        //   P(b) = 1/2 * 2/3 = 1/3, esc = 1/2 * 1/3 = 1/6.
        // Order -1: 27 symbols left, each 1/6/27.
        let p = m.predict();
        assert!((p[0] - 0.5).abs() < 1e-12);
        assert!((p[1] - 1.0 / 3.0).abs() < 1e-12);
        assert!((p[2] - 1.0 / 6.0 / 27.0).abs() < 1e-12);
    }

    /// Update exclusion: after "abab", order 0 has counted only the two novel
    /// symbols' first occurrences ({a:1, b:1}), since later ones were coded at
    /// order 1 or 2. Order 2 "ab": {a:1} -> P(a)=1/2, esc 1/2. Order 1 "b":
    /// {a:1}, a excluded -> skip. Order 0: {b:1}, n=1, d=1 -> P(b) = 1/4,
    /// esc 1/4. Order -1: 27 left, each 1/4/27.
    #[test]
    fn ppmc_update_exclusion_hand_example() {
        let mut m = PpmC::new(2, usize::MAX);
        for &ch in b"abab" {
            m.predict();
            m.observe(ch);
        }
        let p = m.predict();
        assert!((p[0] - 0.5).abs() < 1e-12, "{}", p[0]);
        assert!((p[1] - 0.25).abs() < 1e-12, "{}", p[1]);
        assert!((p[2] - 0.25 / 27.0).abs() < 1e-12);
    }

    /// Hand-computed interpolated Witten–Bell example.
    #[test]
    fn wb_hand_example() {
        let mut m = WittenBell::new(1, usize::MAX);
        for &ch in b"abab" {
            m.predict();
            m.observe(ch);
        }
        // Order -1: 1/29 each. Order 0: {a:2,b:2}, n=4, d=2:
        //   P0(a) = (2 + 2/29)/6. Order 1 "b": {a:1}, n=1, d=1:
        //   P1(a) = (1 + P0(a))/2, P1(c) = (0 + (2/29)/6)/2.
        let p = m.predict();
        let p0a = (2.0 + 2.0 / 29.0) / 6.0;
        assert!((p[0] - (1.0 + p0a) / 2.0).abs() < 1e-12);
        assert!((p[2] - (2.0 / 29.0 / 6.0) / 2.0).abs() < 1e-12);
    }
}
