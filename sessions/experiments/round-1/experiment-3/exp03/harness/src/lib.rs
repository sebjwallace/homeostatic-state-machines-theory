//! Experiment 03 harness (round two tests 1–8 plus tests 9 and 10).
//!
//! * [`corpus`]: the shared, seeded corpus and its verification.
//! * [`baselines`]: PPM-C (with exclusion) and interpolated Witten–Bell, orders 1–8.
//! * [`tests`]: the tests (1–8 from round two, 9 unseen noise shapes, 10 context conflict).
//! * [`report`]: results.json and RESULTS.md.
//!
//! The `Automaton` trait itself lives in the `hsm-core` crate (re-exported
//! here), so that model crates don't depend on the harness.

pub mod baselines;
pub mod corpus;
pub mod json;
pub mod report;
pub mod tests;

pub use hsm_core::{chr, sym, Automaton, FastMap, FastSet, Rng, A, ALPHABET};
pub use tests::{Factory, Kind, MakeFn};

/// Register a model in `run.rs`:
///
/// ```ignore
/// model!("m003-something", m003_something::Model),
/// model!("m003-something", m003_something::Model, scarce = 500),
/// ```
///
/// `scarce` sets the capacity used by test 5 (default
/// [`tests::SCARCE_CAPACITY`]).
#[macro_export]
macro_rules! model {
    ($name:expr, $ty:ty) => {
        $crate::model!($name, $ty, scarce = $crate::tests::SCARCE_CAPACITY)
    };
    ($name:expr, $ty:ty, scarce = $cap:expr) => {
        $crate::Factory {
            name: $name.to_string(),
            make: |seed, capacity| Box::new(<$ty>::new(seed, capacity)),
            kind: $crate::Kind::Model,
            scarce_capacity: $cap,
        }
    };
}

/// All baselines: PPM-C and Witten–Bell, orders 1 to 8.
pub fn baseline_factories() -> Vec<Factory> {
    use baselines::{PpmC, WittenBell};
    // fn pointers can't capture, so one small fn per order.
    macro_rules! b {
        ($ty:ident, $o:expr, $name:expr) => {
            Factory {
                name: $name.to_string(),
                make: |_seed, cap| Box::new($ty::new($o, cap)),
                kind: Kind::Baseline,
                scarce_capacity: tests::SCARCE_CAPACITY,
            }
        };
    }
    vec![
        b!(PpmC, 1, "ppmc-o1"),
        b!(PpmC, 2, "ppmc-o2"),
        b!(PpmC, 3, "ppmc-o3"),
        b!(PpmC, 4, "ppmc-o4"),
        b!(PpmC, 5, "ppmc-o5"),
        b!(PpmC, 6, "ppmc-o6"),
        b!(PpmC, 7, "ppmc-o7"),
        b!(PpmC, 8, "ppmc-o8"),
        b!(WittenBell, 1, "wb-o1"),
        b!(WittenBell, 2, "wb-o2"),
        b!(WittenBell, 3, "wb-o3"),
        b!(WittenBell, 4, "wb-o4"),
        b!(WittenBell, 5, "wb-o5"),
        b!(WittenBell, 6, "wb-o6"),
        b!(WittenBell, 7, "wb-o7"),
        b!(WittenBell, 8, "wb-o8"),
    ]
}
