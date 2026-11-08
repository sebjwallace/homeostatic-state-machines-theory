fn main() {
    for (n, c, r, u) in harness::baselines::sanity() {
        println!("{:<10} cyc {:.4} rep {:.4} rnd {:.4}", n, c, r, u);
    }
}
