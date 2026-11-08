//! Test-10 probe (diagnostic only; the model itself knows nothing of frames).
//! Reads the dumped conflict texts, trains, then reports bits at completion
//! characters, found by the frame prefixes listed here for the probe's use.
//! cargo run --release -p m005-assemblies-with-state --example conflict -- DIR [quiet] [verbose]
use hsm_core::{sym, Automaton};
use m005_assemblies_with_state::Model;

const PREFIXES: &[&str] = &[
    "the sky was ", "the birds were ", "she ", "the man was ", "the lake was ", "the children wore ",
    "the fans ", "the coach was ", "he looked at the ", "the floor was ",
];
const COMPS: &[&str] = &[
    "blue", "red", "singing", "quiet", "bought bread", "fed the cows", "paying", "digging", "warm", "frozen",
    "shorts", "gloves", "cheered", "wept", "proud", "angry", "waves", "tracks", "wet", "dusty",
];

fn marks(t: &[u8]) -> Vec<u8> {
    // 1 = completion char, 2 = first completion char
    let mut m = vec![0u8; t.len()];
    for i in 0..t.len() {
        for p in PREFIXES {
            let pb = p.as_bytes();
            if i >= pb.len() && &t[i - pb.len()..i] == pb && (i == pb.len() || t[i - pb.len() - 1] == b' ') {
                for c in COMPS {
                    if t[i..].starts_with(c.as_bytes()) && t.get(i + c.len()) == Some(&b'.') {
                        for k in 0..c.len() {
                            m[i + k] = 1;
                        }
                        m[i] = 2;
                    }
                }
            }
        }
    }
    m
}

fn main() {
    let a: Vec<String> = std::env::args().collect();
    let dir = &a[1];
    let quiet = a.get(2).map(|s| s == "1").unwrap_or(false);
    let verbose = a.get(3).map(|s| s == "1").unwrap_or(false);
    let learn = std::fs::read(format!("{}/seed1-conflict-learn.txt", dir)).unwrap();
    let eval = std::fs::read(format!("{}/seed1-conflict-eval.txt", dir)).unwrap();
    let mut m = Model::new(1, 1_000_000);
    let ml = marks(&learn);
    // halfway paragraph boundary
    let mut half = learn.len() / 2;
    while learn[half - 1] != b'\n' {
        half += 1;
    }
    let (mut lb, mut ln) = (0.0, 0);
    for (i, &c) in learn.iter().enumerate() {
        if i == half && quiet {
            m.quiet(5000);
        }
        let b = -m.predict()[sym(c)].log2();
        if i >= half && ml[i] > 0 {
            lb += b;
            ln += 1;
        }
        m.observe(c);
    }
    println!("learn 2nd half conflict bpc {:.3}", lb / ln as f64);
    for (k, v) in m.stats() {
        print!("{}={} ", k, v);
    }
    println!();
    print!("{}", m.debug_twins(10));
    for c in [" was w", " was d", " wore s", "e fed t", "ooked a", "s were "] { print!("{}", m.debug_cell(c)); }
    m.set_learning(false);
    let me = marks(&eval);
    let (mut b1, mut n1, mut bf, mut nf, mut ball) = (0.0, 0, 0.0, 0, 0.0);
    let mut shown = 0;
    let mut bypos = [(0.0f64, 0usize); 8];
    let mut pos = 0usize;
    for (i, &c) in eval.iter().enumerate() {
        let b = -m.predict()[sym(c)].log2();
        ball += b;
        if me[i] == 2 { pos = 0; } else if me[i] == 1 { pos += 1; }
        if me[i] > 0 { let k = pos.min(7); bypos[k].0 += b; bypos[k].1 += 1; }
        if me[i] == 1 && b > 1.0 && std::env::var("SHOWLATE").is_ok() {
            println!("late [{}] -> {} : {:.2}", String::from_utf8_lossy(&eval[i.saturating_sub(24)..i]), c as char, b);
        }
        if me[i] > 0 {
            b1 += b;
            n1 += 1;
        }
        if me[i] == 2 {
            bf += b;
            nf += 1;
            if verbose && shown < 200 {
                shown += 1;
                let st = eval[..i].iter().rposition(|&x| x == b'\n').map(|x| x + 1).unwrap_or(0);
                println!("[{}] -> {} : {:.2}", String::from_utf8_lossy(&eval[st..i]), c as char, b);
                print!("{}", m.debug_active());
                println!("   held: {}", m.debug_held());
            }
        }
        m.observe(c);
    }
    for (k, (b, n)) in bypos.iter().enumerate() { print!("pos{} {:.3}/{}  ", k, b / *n as f64, n); }
    println!();
    println!(
        "eval conflict bpc {:.3} (n {}), first {:.3} (n {}), stream {:.3}",
        b1 / n1 as f64,
        n1,
        bf / nf as f64,
        nf,
        ball / eval.len() as f64
    );
}
