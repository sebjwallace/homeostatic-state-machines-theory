//! Diagnostics on the dumped seed-1 corpus: `cargo run --release -p m006-state-with-assemblies --example diag -- DIR`
use hsm_core::{sym, Automaton};
use m006_state_with_assemblies::Model;

fn main() {
    let dir = std::env::args().nth(1).expect("corpus dir");
    if std::env::args().nth(2).as_deref() == Some("forget") {
        let cap: usize = std::env::args().nth(3).map(|x| x.parse().unwrap()).unwrap_or(2000);
        for f in [true, false] { println!("freeze {}", f); forget(&dir, f, cap); }
        return;
    }
    let train = std::fs::read(format!("{}/seed1-train.txt", dir)).unwrap();
    let mut m = Model::new(1, 1_000_000);
    let mut bits = 0.0;
    let mut n = 0usize;
    let kw: [&[&str]; 3] = [&["cow","farmer","tractor","field","barn","muddy","brown"], &["fish","sailor","ship","shore","harbour","salty","blue"], &["pigeon","baker","bus","street","market","busy","grey"]];
    // true topic per block by keyword vote
    let mut truth = vec![0usize; train.len()];
    let mut start = 0;
    for i in 0..train.len() { if train[i] == b'\n' || i + 1 == train.len() {
        let blk = std::str::from_utf8(&train[start..=i]).unwrap();
        let mut v = [0; 3];
        for w in blk.split(|c: char| !c.is_alphabetic()) { for t in 0..3 { if kw[t].contains(&w) { v[t] += 1; } } }
        let t = (0..3).max_by_key(|&t| v[t]).unwrap();
        for j in start..=i { truth[j] = t; }
        start = i + 1; } }
    let mut conf = vec![[0usize; 3]; 8];
    let mut held: Vec<usize> = Vec::new();
    for (i, &ch) in train.iter().enumerate() {
        let p = m.predict();
        bits -= p[sym(ch)].log2();
        n += 1;
        m.observe(ch);
        if i > 12000 { conf[m.held_topic()][truth[i]] += 1; }
        held.push(m.held_topic());
        if (i + 1) % 10_000 == 0 {
            let s: Vec<String> = m.stats().iter().map(|(k, v)| format!("{}={:.3}", k, v)).collect();
            println!("{:6} bpc {:.3} | {}", i + 1, bits / n as f64, s.join(" "));
            bits = 0.0;
            n = 0;
        }
    }
    // switch lag: chars after each block start until held state = block's majority-mapped state
    let mut map = [0usize; 8];
    for k in 0..8 { map[k] = (0..3).max_by_key(|&t| conf[k][t]).unwrap(); }
    let _ = &map;
    let mut pure = 0; let mut tot = 0;
    for (k, r) in conf.iter().enumerate() { let s: usize = r.iter().sum(); if s > 0 { println!("held {} -> {:?}", k, r); pure += r.iter().max().unwrap(); tot += s; } }
    println!("purity {:.3}", pure as f64 / tot as f64);
    let mut lags = Vec::new();
    let mut st = 0;
    for i in 0..train.len() { if train[i] == b'\n' { let b0 = i + 1; if b0 > 12000 && b0 < train.len() {
        let t = truth[b0]; let mut l = 0; while b0 + l < train.len() && map[held[b0 + l]] != t && l < 400 { l += 1; } lags.push(l); } st = i; } }
    let _ = st;
    lags.sort();
    println!("switch lag chars: median {} mean {:.1} p90 {}", lags[lags.len()/2], lags.iter().sum::<usize>() as f64 / lags.len() as f64, lags[lags.len()*9/10]);
    if std::env::args().nth(2).as_deref() == Some("trace") {
        m.set_learning(false);
        for name in ["noise-clean", "noise-10"] {
            let t = std::fs::read(format!("{}/seed1-{}.txt", dir, name)).unwrap();
            let mut b = 0.0;
            for &ch in &t { let p = m.predict(); b -= p[sym(ch)].log2(); m.observe(ch); }
            println!("{} bpc {:.3} {:?}", name, b / t.len() as f64, m.stats().iter().find(|x| x.0=="noise_rate"));
        }
    }
}

#[allow(dead_code)]
pub fn forget(dir: &str, freeze: bool, cap: usize) {
    let rd = |n: &str| std::fs::read(format!("{}/seed1-{}.txt", dir, n)).unwrap();
    let (a, b, at) = (rd("forget-a"), rd("forget-b"), rd("forget-a-test"));
    let mut m = Model::new(1, cap);
    m.set_freezing(freeze);
    let score = |m: &mut Model, t: &[u8]| { let mut s = 0.0; for &c in t { s -= m.predict()[sym(c)].log2(); m.observe(c);} s / t.len() as f64 };
    let st = |m: &Model| m.stats().iter().map(|(k, v)| format!("{}={:.0}", k, v)).collect::<Vec<_>>().join(" ");
    score(&mut m, &a); m.set_learning(false); let b0 = score(&mut m, &at); println!("after A: {} | {}", b0, st(&m));
    m.set_learning(true); score(&mut m, &b); m.set_learning(false); let b1 = score(&mut m, &at);
    println!("after B: {} | {}", b1, st(&m));
}
