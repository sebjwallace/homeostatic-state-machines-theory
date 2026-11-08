//! Debug probe: train on a dumped corpus, then print what the model predicts at
//! the first character of each verb in the held-out text.
//! cargo run --release -p m003-shared-assemblies --example probe -- DIR SEED
use hsm_core::{sym, Automaton};
use m003_shared_assemblies::Model;

fn main() {
    let a: Vec<String> = std::env::args().collect();
    let dir = &a[1];
    let seed: u64 = a.get(2).map(|s| s.parse().unwrap()).unwrap_or(1);
    let train = std::fs::read(format!("{}/seed{}-train.txt", dir, seed)).unwrap();
    let held = std::fs::read(format!("{}/seed{}-heldout.txt", dir, seed)).unwrap();
    let mut m = Model::new(seed, 1_000_000);
    let mut bits = 0.0;
    for &c in &train {
        let p = m.predict();
        bits -= p[sym(c)].log2();
        m.observe(c);
    }
    println!("train bpc {:.4}", bits / train.len() as f64);
    for (k, v) in m.stats() {
        println!("  {} = {}", k, v);
    }
    println!("{}", m.debug_shared(120));
    m.set_learning(false);
    let verbs = ["runs", "sleeps", "eats", "hides", "sings", "reads", "laughs", "waits", "stops", "breaks", "turns", "shines"];
    let mut shown = 0;
    let mut tot = 0.0;
    let mut n = 0;
    for i in 0..held.len() {
        let is_vf = i > 0 && held[i - 1] == b' ' && verbs.iter().any(|v| held[i..].starts_with(v.as_bytes()));
        if is_vf {
            let p = m.predict();
            let b = -p[sym(held[i])].log2();
            tot += b;
            n += 1;
            if shown < 8 {
                shown += 1;
                let ctx = String::from_utf8_lossy(&held[i.saturating_sub(12)..i]).to_string();
                println!("[{}] -> {} : {:.2} bits", ctx, held[i] as char, b);
                println!("{}", m.debug_active());
            }
        }
        m.predict();
        m.observe(held[i]);
    }
    println!("held-out verb-first mean {:.3} over {}", tot / n as f64, n);
}
