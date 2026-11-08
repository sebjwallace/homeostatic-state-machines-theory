//! Parameter sweep on seed 1 only: train prequentially, then score held-out verbs.
//! cargo run --release -p m003-shared-assemblies --example sweep -- DIR
use hsm_core::{sym, Automaton};
use m003_shared_assemblies::{Model, Params};

fn score(dir: &str, p: Params) -> (f64, f64, f64, f64, f64, f64) {
    let train = std::fs::read(format!("{}/seed{}-train.txt", dir, seed())).unwrap();
    let held = std::fs::read(format!("{}/seed{}-heldout.txt", dir, seed())).unwrap();
    let ctrl = std::fs::read(format!("{}/seed{}-control.txt", dir, seed())).unwrap();
    let mut m = Model::with_params(seed(), 1_000_000, p);
    let mut bits = 0.0;
    for &c in &train { let q = m.predict(); bits -= q[sym(c)].log2(); m.observe(c); }
    m.set_learning(false);
    let verbs = ["runs","sleeps","eats","hides","sings","reads","laughs","waits","stops","breaks","turns","shines"];
    let mut ev = |t: &[u8]| {
        let (mut vb, mut vn, mut ab, mut fb, mut fnn) = (0.0, 0, 0.0, 0.0, 0);
        let mut inverb = 0usize;
        for i in 0..t.len() {
            if inverb == 0 && i > 0 && t[i-1] == b' ' { if let Some(v) = verbs.iter().find(|v| t[i..].starts_with(v.as_bytes())) { inverb = v.len(); } }
            let q = m.predict(); let b = -q[sym(t[i])].log2(); ab += b;
            if inverb > 0 { vb += b; vn += 1; inverb -= 1; }
            if i > 0 && t[i-1] == b' ' && inverb + 1 >= 4 && verbs.iter().any(|v| t[i..].starts_with(v.as_bytes())) { fb += b; fnn += 1; }
            m.observe(t[i]);
        }
        (vb / vn as f64, ab / t.len() as f64, fb / fnn as f64)
    };
    let (hv, hs, hf) = ev(&held);
    let (cv, _, _) = ev(&ctrl);
    let _ = ev(&std::fs::read(format!("{}/seed{}-noise-clean.txt", dir, seed())).unwrap());
    let _ = ev(&std::fs::read(format!("{}/seed{}-noise-5.txt", dir, seed())).unwrap());
    let (_, n10, _) = ev(&std::fs::read(format!("{}/seed{}-noise-10.txt", dir, seed())).unwrap());
    (bits / train.len() as f64, hv, hs, cv, n10, hf)
}

fn main() {
    let dir = std::env::args().nth(1).unwrap();
    let spec = std::env::args().nth(2).unwrap_or_default();
    let mut runs: Vec<(String, Params)> = vec![("default".into(), Params::default())];
    for kv in spec.split(';').filter(|s| !s.is_empty()) {
        let mut p = Params::default();
        for a in kv.split(',') {
            let (k, v) = a.split_once('=').unwrap();
            p.set(k, v.parse().unwrap());
        }
        runs.push((kv.to_string(), p));
    }
    for (n, p) in runs {
        let (b, hv, hs, cv, n10, hf) = score(&dir, p);
        println!("{:36} train {:.4}  heldout verb {:.3} (first {:.2}) sent {:.3}  control verb {:.3}  noise10 {:.3}", n, b, hv, hf, hs, cv, n10);
    }
}
fn seed() -> u64 { std::env::var("SEED").ok().and_then(|s| s.parse().ok()).unwrap_or(1) }
