//! Where do two parameter settings differ on the training stream? Groups the
//! bit difference by the word being predicted (and first char vs rest).
use hsm_core::{sym, Automaton};
use m003_shared_assemblies::{Model, Params};
fn mk(spec: &str) -> Params { let mut p = Params::default(); for kv in spec.split(',').filter(|s| !s.is_empty()) { let (k, v) = kv.split_once('=').unwrap(); p.set(k, v.parse().unwrap()); } p }
fn main() {
    let a: Vec<String> = std::env::args().collect();
    let t = std::fs::read(format!("{}/seed1-train.txt", a[1])).unwrap();
    let mut m1 = Model::with_params(1, 1_000_000, mk(&a[2]));
    let mut m2 = Model::with_params(1, 1_000_000, mk(&a[3]));
    let mut agg: std::collections::BTreeMap<String, (f64, usize)> = Default::default();
    let mut ws = 0;
    for i in 0..t.len() {
        if i > 0 && (t[i-1] == b' ' || t[i-1] == b'\n') { ws = i; }
        let b1 = -m1.predict()[sym(t[i])].log2();
        let b2 = -m2.predict()[sym(t[i])].log2();
        m1.observe(t[i]); m2.observe(t[i]);
        let mut we = ws; while we < t.len() && t[we].is_ascii_lowercase() { we += 1; }
        let w = String::from_utf8_lossy(&t[ws..we]).to_string();
        let key = format!("{}{}", if i == ws { "^" } else { " " }, if t[i].is_ascii_lowercase() { w } else { format!("<{}>", t[i] as char) });
        let e = agg.entry(key).or_default(); e.0 += b2 - b1; e.1 += 1;
    }
    let mut v: Vec<_> = agg.into_iter().collect();
    v.sort_by(|x, y| y.1.0.partial_cmp(&x.1.0).unwrap());
    let tot: f64 = v.iter().map(|x| x.1.0).sum();
    println!("total diff {:.1} bits ({:.4} bpc)", tot, tot / t.len() as f64);
    for (k, (d, n)) in v.iter().take(25) { println!("{:14} {:8.1} bits over {:5} ({:+.3}/char)", k, d, n, d / *n as f64); }
    println!("...");
    for (k, (d, n)) in v.iter().rev().take(8) { println!("{:14} {:8.1} bits over {:5} ({:+.3}/char)", k, d, n, d / *n as f64); }
}
