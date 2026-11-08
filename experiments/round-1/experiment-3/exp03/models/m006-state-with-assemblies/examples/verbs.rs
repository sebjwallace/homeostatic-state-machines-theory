//! Per-position bits on held-out verbs (seed 1): `cargo run --release -p m006-state-with-assemblies --example verbs -- DIR`
use hsm_core::{sym, Automaton};

fn run(m: &mut dyn Automaton, dir: &str, label: &str) {
    let train = std::fs::read(format!("{}/seed1-train.txt", dir)).unwrap();
    for &c in &train { m.predict(); m.observe(c); }
    m.set_learning(false);
    let held = std::fs::read(format!("{}/seed1-heldout.txt", dir)).unwrap();
    let verbs = ["sleeps","eats","runs","hides","stops","breaks","turns","shines","laughs","waits","reads","sings"];
    let mut bits = Vec::new();
    for &c in &held { let p = m.predict(); bits.push(-p[sym(c)].log2()); m.observe(c); }
    let s = std::str::from_utf8(&held).unwrap();
    let mut pos = [0.0f64; 8]; let mut cnt = [0usize; 8];
    let words: Vec<(usize, &str)> = s.match_indices(|c: char| c.is_alphabetic()).map(|x| x.0).fold(Vec::new(), |mut v: Vec<(usize,&str)>, i| { if v.last().map_or(true, |&(st, w)| st + w.len() != i) { let e = s[i..].find(|c: char| !c.is_alphabetic()).map(|e| i + e).unwrap_or(s.len()); v.push((i, &s[i..e])); } v });
    for &(st, w) in &words { if verbs.contains(&w) { for k in 0..w.len().min(8) { pos[k] += bits[st + k]; cnt[k] += 1; } } }
    let tot: f64 = pos.iter().sum::<f64>(); let n: usize = cnt.iter().sum();
    println!("{} verb bpc {:.3} | by pos {:?}", label, tot / n as f64, (0..7).map(|k| format!("{:.2}", pos[k] / cnt[k].max(1) as f64)).collect::<Vec<_>>());
}

fn main() {
    let dir = std::env::args().nth(1).expect("dir");
    let mut a = m006_state_with_assemblies::Model::new(1, 1_000_000);
    run(&mut a, &dir, "m006");
    if std::env::args().nth(2).is_some() {
        let mut b = m003_shared_assemblies::Model::new(1, 1_000_000);
        run(&mut b, &dir, "m003");
    }
}
