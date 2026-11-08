use harness::baselines::*;
use harness::corpus::Corpus;
fn main() {
    let c = Corpus::new(1);
    for o in 1..=8 {
        let mut a = PpmC::with_update(o, usize::MAX, PpmUpdate::Full);
        let mut b = PpmC::with_update(o, usize::MAX, PpmUpdate::Exclusion);
        let fa = prequential_bpc(&mut a, &c.train.text.bytes);
        let fb = prequential_bpc(&mut b, &c.train.text.bytes);
        println!("o{} full {:.4} update-exclusion {:.4}", o, fa, fb);
    }
}
