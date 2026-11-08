//! Per-position bits on test-10 completions (seed 1, held-out stream): `--example conflict -- DIR`
use hsm_core::{sym, Automaton};
const COMPS: &[&str] = &["blue","red","singing","quiet","bought bread","fed the cows","paying","digging","warm","frozen","shorts","gloves","cheered","wept","proud","angry","waves","tracks","wet","dusty"];
const FRAMES: &[&str] = &["the sky was ","the birds were ","she ","the man was ","the lake was ","the children wore ","the fans ","the coach was ","he looked at the ","the floor was "];
fn main() {
    let dir = std::env::args().nth(1).unwrap();
    let quiet = std::env::args().nth(2).is_some();
    let learn = std::fs::read(format!("{}/seed1-conflict-learn.txt", dir)).unwrap();
    let eval = std::fs::read(format!("{}/seed1-conflict-eval.txt", dir)).unwrap();
    let mut m = m006_state_with_assemblies::Model::new(1, 1_000_000);
    let half = learn.len() / 2;
    let half = half + learn[half..].iter().position(|&c| c == b'\n').unwrap() + 1;
    for (i, &c) in learn.iter().enumerate() { if quiet && i == half { m.quiet(5000); } m.predict(); m.observe(c); }
    m.set_learning(false);
    let mut bits = Vec::new();
    for &c in &eval { let p = m.predict(); bits.push(-p[sym(c)].log2()); m.observe(c); }
    let s = std::str::from_utf8(&eval).unwrap();
    let mut pos = [0.0f64; 12]; let mut cnt = [0usize; 12];
    for f in FRAMES { for (i, _) in s.match_indices(f) { let st = i + f.len();
        for c in COMPS { if s[st..].starts_with(c) && s[st + c.len()..].starts_with('.') { for k in 0..c.len().min(12) { pos[k] += bits[st + k]; cnt[k] += 1; } } } } }
    let n: usize = cnt.iter().sum();
    println!("conflict bpc {:.3} n {} | {:?}", pos.iter().sum::<f64>() / n as f64, n, (0..8).map(|k| format!("{:.2}", pos[k] / cnt[k].max(1) as f64)).collect::<Vec<_>>());
    println!("{:?}", m.stats().iter().filter(|x| ["links","links_on","rate_hold","rate_anticipate","rate_self","quiet_on","quiet_joins"].contains(&x.0.as_str())).collect::<Vec<_>>());
}
