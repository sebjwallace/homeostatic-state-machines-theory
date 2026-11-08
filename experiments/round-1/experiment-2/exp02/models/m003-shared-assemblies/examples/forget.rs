//! Test-5 probe on seed 1: stats after A and after B, freezing on and off.
use hsm_core::{sym, Automaton};
use m003_shared_assemblies::{Model, Params};
fn run(m: &mut Model, t: &[u8]) -> f64 { let mut b = 0.0; for &c in t { let q = m.predict(); b -= q[sym(c)].log2(); m.observe(c); } b / t.len() as f64 }
fn main() {
    let dir = std::env::args().nth(1).unwrap();
    let spec = std::env::args().nth(2).unwrap_or_default();
    let cap: usize = std::env::args().nth(3).map(|s| s.parse().unwrap()).unwrap_or(2000);
    let rd = |n: &str| std::fs::read(format!("{}/seed1-{}.txt", dir, n)).unwrap();
    let (a, b, at) = (rd("forget-a"), rd("forget-b"), rd("forget-a-test"));
    for fr in [true, false] {
        let mut p = Params::default();
        for kv in spec.split(',').filter(|s| !s.is_empty()) { let (k, v) = kv.split_once('=').unwrap(); p.set(k, v.parse().unwrap()); }
        let mut m = Model::with_params(1, cap, p);
        m.set_freezing(fr);
        run(&mut m, &a);
        m.set_learning(false); let before = run(&mut m, &at); m.set_learning(true);
        let sa: Vec<String> = m.stats().iter().map(|(k, v)| format!("{}={}", k, v)).collect();
        let bb = run(&mut m, &b);
        m.set_learning(false); let after = run(&mut m, &at);
        let sb: Vec<String> = m.stats().iter().map(|(k, v)| format!("{}={}", k, v)).collect();
        let u = (29f64).log2();
        println!("freeze {} before {:.3} after {:.3} survival {:.3} b {:.3}\n  A: {}\n  B: {}", fr, before, after, (u - after) / (u - before), bb, sa.join(" "), sb.join(" "));
    }
}
