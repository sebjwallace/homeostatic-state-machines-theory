//! hsm-core: the pieces shared by the harness and every model.
//!
//! * [`Automaton`], the trait every model and baseline implements.
//! * The alphabet ([`ALPHABET`], [`A`], [`sym`], [`chr`]).
//! * [`Rng`], a seeded deterministic PRNG (xoshiro256**).
//! * [`FastMap`] / [`FastSet`], `HashMap`/`HashSet` with a fixed, deterministic hasher.
//!   `std`'s default `RandomState` is seeded randomly per process, so iterating a
//!   default `HashMap` makes a model non-deterministic. Use these instead.
//!
//! The harness depends on this crate, and so does every model. Models must not
//! depend on the harness (the harness depends on them, to register them).

use std::collections::{HashMap, HashSet};
use std::hash::{BuildHasherDefault, Hasher};

/// The alphabet, in index order: `a`..`z`, space, full stop, newline.
/// `predict()` returns one probability per entry, in this order.
pub const ALPHABET: &[u8; 29] = b"abcdefghijklmnopqrstuvwxyz .\n";

/// Alphabet size.
pub const A: usize = 29;

/// Index of a character in [`ALPHABET`]. Panics on a character outside it.
#[inline]
pub fn sym(ch: u8) -> usize {
    match ch {
        b'a'..=b'z' => (ch - b'a') as usize,
        b' ' => 26,
        b'.' => 27,
        b'\n' => 28,
        _ => panic!("character {:?} is not in the alphabet", ch as char),
    }
}

/// Character for an alphabet index.
#[inline]
pub fn chr(i: usize) -> u8 {
    ALPHABET[i]
}

/// The uniform distribution over the alphabet.
pub fn uniform() -> Vec<f64> {
    vec![1.0 / A as f64; A]
}

/// The interface between the harness and a model (or baseline).
///
/// Protocol: the harness calls `predict()` and then `observe(ch)` once per
/// character. It may also call `observe` without a preceding `predict`
/// (models should cope, though the harness currently always predicts first).
///
/// Every model crate also provides a constructor
/// `pub fn new(seed: u64, capacity: usize) -> Self`, where `capacity` is a hard
/// limit on the model's main units (cells, states, whatever it uses).
pub trait Automaton {
    fn name(&self) -> &str;

    /// Probability distribution over the alphabet for the next character,
    /// indexed as [`ALPHABET`]. Must have length [`A`], sum to 1 (within 1e-6),
    /// and give every symbol a strictly positive, finite probability.
    /// The harness checks this on every step and fails the test if violated.
    fn predict(&mut self) -> Vec<f64>;

    /// The character arrives (an ASCII byte from [`ALPHABET`]).
    /// Advance state; learn if learning is on.
    fn observe(&mut self, ch: u8);

    /// Learning on or off. When off, structure must not change; states may
    /// still transition (the model keeps reading).
    fn set_learning(&mut self, on: bool);

    /// A quiet period of `steps` with no input (internal settling allowed).
    fn quiet(&mut self, steps: usize);

    /// Current internal energy (misfit), for the confusion test.
    fn energy(&self) -> f64;

    /// Free-form key/value stats for the report. If the model reports a key
    /// `"units"` (main units currently in use), the harness tracks its peak.
    fn stats(&self) -> Vec<(String, f64)>;

    /// Optional (test 5): switch the model's freezing mechanism on or off.
    /// Return `true` if the model supports this. The default is "unsupported",
    /// in which case test 5 reports only the model's normal behaviour.
    /// The harness calls this right after construction, before any input.
    fn set_freezing(&mut self, _on: bool) -> bool {
        false
    }
}

// ---------------------------------------------------------------------------
// PRNG
// ---------------------------------------------------------------------------

/// xoshiro256** seeded through splitmix64. Deterministic across platforms.
#[derive(Clone, Debug)]
pub struct Rng {
    s: [u64; 4],
}

fn splitmix64(x: &mut u64) -> u64 {
    *x = x.wrapping_add(0x9E37_79B9_7F4A_7C15);
    let mut z = *x;
    z = (z ^ (z >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
    z = (z ^ (z >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);
    z ^ (z >> 31)
}

impl Rng {
    pub fn new(seed: u64) -> Self {
        let mut x = seed;
        let s = [
            splitmix64(&mut x),
            splitmix64(&mut x),
            splitmix64(&mut x),
            splitmix64(&mut x),
        ];
        Rng { s }
    }

    /// A generator for a named sub-stream of a seed, so independent uses of
    /// one seed don't share random numbers.
    pub fn derived(seed: u64, stream: &str) -> Self {
        let mut h: u64 = 0xcbf2_9ce4_8422_2325;
        for b in stream.bytes() {
            h ^= b as u64;
            h = h.wrapping_mul(0x0000_0100_0000_01B3);
        }
        Rng::new(seed ^ h.rotate_left(17))
    }

    #[inline]
    pub fn next_u64(&mut self) -> u64 {
        let result = self.s[1].wrapping_mul(5).rotate_left(7).wrapping_mul(9);
        let t = self.s[1] << 17;
        self.s[2] ^= self.s[0];
        self.s[3] ^= self.s[1];
        self.s[1] ^= self.s[2];
        self.s[0] ^= self.s[3];
        self.s[2] ^= t;
        self.s[3] = self.s[3].rotate_left(45);
        result
    }

    /// Uniform in [0, 1).
    #[inline]
    pub fn f64(&mut self) -> f64 {
        (self.next_u64() >> 11) as f64 * (1.0 / (1u64 << 53) as f64)
    }

    /// Uniform integer in [0, n). `n` must be > 0.
    #[inline]
    pub fn below(&mut self, n: usize) -> usize {
        assert!(n > 0);
        ((self.next_u64() as u128 * n as u128) >> 64) as usize
    }

    #[inline]
    pub fn chance(&mut self, p: f64) -> bool {
        self.f64() < p
    }

    pub fn pick<'a, T>(&mut self, xs: &'a [T]) -> &'a T {
        &xs[self.below(xs.len())]
    }

    pub fn shuffle<T>(&mut self, xs: &mut [T]) {
        for i in (1..xs.len()).rev() {
            let j = self.below(i + 1);
            xs.swap(i, j);
        }
    }
}

// ---------------------------------------------------------------------------
// Deterministic hashing
// ---------------------------------------------------------------------------

/// A small, fast, deterministic hasher (FxHash-style mixing with a
/// splitmix finaliser so low bits are well distributed).
#[derive(Default, Clone, Copy)]
pub struct FxHasher {
    hash: u64,
}

const FX_K: u64 = 0x51_7c_c1_b7_27_22_0a_95;

impl FxHasher {
    #[inline]
    fn add(&mut self, i: u64) {
        self.hash = (self.hash.rotate_left(5) ^ i).wrapping_mul(FX_K);
    }
}

impl Hasher for FxHasher {
    #[inline]
    fn write(&mut self, bytes: &[u8]) {
        for chunk in bytes.chunks(8) {
            let mut v = 0u64;
            for (i, b) in chunk.iter().enumerate() {
                v |= (*b as u64) << (8 * i);
            }
            self.add(v);
        }
    }
    #[inline]
    fn write_u8(&mut self, i: u8) {
        self.add(i as u64)
    }
    #[inline]
    fn write_u16(&mut self, i: u16) {
        self.add(i as u64)
    }
    #[inline]
    fn write_u32(&mut self, i: u32) {
        self.add(i as u64)
    }
    #[inline]
    fn write_u64(&mut self, i: u64) {
        self.add(i)
    }
    #[inline]
    fn write_usize(&mut self, i: usize) {
        self.add(i as u64)
    }
    #[inline]
    fn finish(&self) -> u64 {
        let mut z = self.hash;
        z = (z ^ (z >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
        z = (z ^ (z >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);
        z ^ (z >> 31)
    }
}

pub type FxBuildHasher = BuildHasherDefault<FxHasher>;
/// `HashMap` with a deterministic hasher. Create with `FastMap::default()`.
pub type FastMap<K, V> = HashMap<K, V, FxBuildHasher>;
/// `HashSet` with a deterministic hasher. Create with `FastSet::default()`.
pub type FastSet<K> = HashSet<K, FxBuildHasher>;

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn alphabet_roundtrip() {
        for i in 0..A {
            assert_eq!(sym(chr(i)), i);
        }
    }
    #[test]
    fn rng_deterministic() {
        let mut a = Rng::new(7);
        let mut b = Rng::new(7);
        for _ in 0..100 {
            assert_eq!(a.next_u64(), b.next_u64());
        }
        let mut c = Rng::new(1);
        let n = 100_000;
        let mut counts = [0usize; 10];
        for _ in 0..n {
            counts[c.below(10)] += 1;
        }
        for k in counts {
            assert!((k as f64 / n as f64 - 0.1).abs() < 0.01);
        }
    }
}
