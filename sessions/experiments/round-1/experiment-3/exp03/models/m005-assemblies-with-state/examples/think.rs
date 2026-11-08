use hsm_core::{sym, Automaton};
use m005_assemblies_with_state::{Model, Params};
fn main() {
    let a: Vec<String> = std::env::args().collect();
    let t = std::fs::read(format!("{}/seed1-train.txt", a[1])).unwrap();
    let mut p = Params::default();
    for kv in a.get(2).map(|s| s.as_str()).unwrap_or("").split(',').filter(|s| !s.is_empty()) { let (k, v) = kv.split_once('=').unwrap(); p.set(k, v.parse().unwrap()); }
    let h = t.len() / 2;
    for q in [false, true] {
        let mut m = Model::with_params(1, 1_000_000, p.clone());
        for &c in &t[..h] { m.predict(); m.observe(c); }
        let j0 = m.stats().iter().find(|x| x.0 == "joins").unwrap().1;
        if q { m.quiet(5000); }
        let j1 = m.stats().iter().find(|x| x.0 == "joins").unwrap().1;
        let mut b = 0.0; let mut e = 0.0;
        for (i, &c) in t[h..].iter().enumerate() { let x = -m.predict()[sym(c)].log2(); b += x; if i < 2000 { e += x; } m.observe(c); }
        println!("quiet {} joins {} -> {}  bpc {:.6} early {:.6}", q, j0, j1, b / (t.len() - h) as f64, e / 2000.0);
    }
}
