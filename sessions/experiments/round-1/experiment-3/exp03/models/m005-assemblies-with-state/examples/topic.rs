//! Topic-machine probe: per block (line) of the training stream, the topic
//! states held, and how many characters into the block the final one took.
use hsm_core::Automaton;
use m005_assemblies_with_state::Model;
fn main() {
    let dir = std::env::args().nth(1).unwrap();
    let t = std::fs::read(format!("{}/seed1-train.txt", dir)).unwrap();
    let mut m = Model::new(1, 1_000_000);
    let mut line: Vec<usize> = Vec::new();
    let mut lags = Vec::new();
    let mut prev_maj = 99usize;
    let (mut diff, mut pur, mut nb) = (0usize, 0.0f64, 0usize);
    let mut nblock = 0;
    let mut txt = Vec::new();
    for &c in &t {
        m.predict();
        m.observe(c);
        line.push(m.debug_topic());
        txt.push(c);
        if c == b'\n' {
            nblock += 1;
            let fin = *line.last().unwrap();
            let lag = line.iter().position(|&x| x == fin).unwrap();
            // count chars at end not equal to majority
            let mut cnt = [0usize; 8];
            for &x in &line { cnt[x.min(7)] += 1; }
            let maj = (0..8).max_by_key(|&k| cnt[k]).unwrap();
            let first_maj = line.iter().position(|&x| x == maj).unwrap();
            lags.push(first_maj);
            if nblock > 20 { nb += 1; pur += cnt[maj] as f64 / line.len() as f64; if maj != prev_maj { diff += 1; } }
            prev_maj = maj;
            if std::env::var("V").is_ok() && (nblock % 10 == 0 || nblock < 6) {
                let words: String = String::from_utf8_lossy(&txt[..txt.len().min(50)]).to_string();
                println!("block {:3} len {:3} maj {} purity {:.2} lag {:3} fin {} | {}", nblock, line.len(), maj, cnt[maj] as f64 / line.len() as f64, first_maj, fin, words);
            }
            let _ = lag;
            line.clear();
            txt.clear();
        }
    }
    println!("blocks after 20: consecutive-different {:.2} purity {:.2}", diff as f64 / nb as f64, pur / nb as f64);
    lags.sort();
    println!("median lag {} p90 {}", lags[lags.len() / 2], lags[lags.len() * 9 / 10]);
    for (k, v) in m.stats() { print!("{}={} ", k, v); }
    println!();
}
