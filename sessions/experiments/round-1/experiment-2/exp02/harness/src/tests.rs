//! The eight tests. Each test constructs fresh automata through a [`Factory`]
//! and returns named metrics. All scoring goes through [`Scorer`], which checks
//! every distribution a model returns.

use crate::corpus::{self, Corpus, Text, F_TOPIC_WORD, F_VERB, F_VERB_FIRST};
use hsm_core::{sym, Automaton, A};
use std::time::Instant;

/// Capacity given to every model in tests 1–4 and 6–7 (effectively unlimited).
pub const DEFAULT_CAPACITY: usize = 1_000_000;
/// Capacity for test 5 (forgetting), unless the registry entry overrides it.
pub const SCARCE_CAPACITY: usize = 2_000;
/// Length of the quiet period in test 7.
pub const QUIET_STEPS: usize = 5_000;
/// Window at the start of a returning topic block (test 3).
pub const BOUNDARY_WINDOW: usize = 100;
/// Topic blocks starting before this fraction of the stream are not scored in test 3.
pub const PERSISTENCE_WARMUP: f64 = 0.2;
/// How often (in characters) the harness samples `stats()` for peak units.
pub const UNITS_SAMPLE_EVERY: usize = 1_000;

pub type MakeFn = fn(u64, usize) -> Box<dyn Automaton>;

#[derive(Clone)]
pub struct Factory {
    pub name: String,
    pub make: MakeFn,
    pub kind: Kind,
    pub scarce_capacity: usize,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Kind {
    Model,
    Reference,
    Baseline,
}

impl Kind {
    pub fn label(&self) -> &'static str {
        match self {
            Kind::Model => "model",
            Kind::Reference => "reference",
            Kind::Baseline => "baseline",
        }
    }
}

/// One metric of one test. `lower_is_better` = None for descriptive metrics.
#[derive(Clone, Debug)]
pub struct Metric {
    pub key: &'static str,
    pub value: f64,
}

#[derive(Clone, Debug, Default)]
pub struct TestResult {
    pub metrics: Vec<Metric>,
    pub seconds: f64,
    pub peak_units: f64,
    pub error: Option<String>,
    pub notes: Vec<String>,
}

impl TestResult {
    fn push(&mut self, key: &'static str, value: f64) {
        self.metrics.push(Metric { key, value });
    }
    pub fn get(&self, key: &str) -> Option<f64> {
        self.metrics.iter().find(|m| m.key == key).map(|m| m.value)
    }
}

/// Wraps an automaton: predicts, validates, scores, observes; tracks peak units.
pub struct Scorer {
    pub m: Box<dyn Automaton>,
    pub peak_units: f64,
    steps: usize,
}

impl Scorer {
    pub fn new(m: Box<dyn Automaton>) -> Self {
        let mut s = Scorer { m, peak_units: 0.0, steps: 0 };
        s.sample_units();
        s
    }

    fn sample_units(&mut self) {
        for (k, v) in self.m.stats() {
            if k == "units" && v > self.peak_units {
                self.peak_units = v;
            }
        }
    }

    /// Predict, check, observe. Returns bits for `ch`.
    #[inline]
    pub fn step(&mut self, ch: u8) -> Result<f64, String> {
        let p = self.m.predict();
        if p.len() != A {
            return Err(format!("predict() returned {} entries, expected {}", p.len(), A));
        }
        let mut sum = 0.0;
        for (i, &x) in p.iter().enumerate() {
            if !(x > 0.0 && x.is_finite()) {
                return Err(format!(
                    "predict() gave symbol {:?} probability {} at step {}",
                    hsm_core::chr(i) as char,
                    x,
                    self.steps
                ));
            }
            sum += x;
        }
        if (sum - 1.0).abs() > 1e-6 {
            return Err(format!("predict() sums to {} at step {}", sum, self.steps));
        }
        let bits = -(p[sym(ch)] / sum).log2();
        self.m.observe(ch);
        self.steps += 1;
        if self.steps % UNITS_SAMPLE_EVERY == 0 {
            self.sample_units();
        }
        Ok(bits)
    }

    /// Bits for each character of `text`.
    pub fn run(&mut self, text: &[u8]) -> Result<Vec<f64>, String> {
        let mut out = Vec::with_capacity(text.len());
        for &ch in text {
            out.push(self.step(ch)?);
        }
        self.sample_units();
        Ok(out)
    }

    /// Bits and energy (read after each observe) for each character.
    pub fn run_energy(&mut self, text: &[u8]) -> Result<(Vec<f64>, Vec<f64>), String> {
        let mut bits = Vec::with_capacity(text.len());
        let mut energy = Vec::with_capacity(text.len());
        for &ch in text {
            bits.push(self.step(ch)?);
            let e = self.m.energy();
            if !e.is_finite() {
                return Err(format!("energy() returned {}", e));
            }
            energy.push(e);
        }
        self.sample_units();
        Ok((bits, energy))
    }

    pub fn learning(&mut self, on: bool) {
        self.m.set_learning(on);
    }

    pub fn stats(&self) -> Vec<(String, f64)> {
        self.m.stats()
    }
}

fn mean(xs: &[f64]) -> f64 {
    if xs.is_empty() {
        f64::NAN
    } else {
        xs.iter().sum::<f64>() / xs.len() as f64
    }
}

/// Mean of `bits[i]` where `mask(i)`.
fn masked_mean(bits: &[f64], mask: impl Fn(usize) -> bool) -> (f64, usize) {
    let mut s = 0.0;
    let mut n = 0;
    for (i, &b) in bits.iter().enumerate() {
        if mask(i) {
            s += b;
            n += 1;
        }
    }
    (if n == 0 { f64::NAN } else { s / n as f64 }, n)
}

/// Run a test body, catching panics and timing it.
pub fn timed(f: impl FnOnce(&mut TestResult) -> Result<(), String>) -> TestResult {
    let mut r = TestResult::default();
    let t0 = Instant::now();
    let out = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| f(&mut r)));
    r.seconds = t0.elapsed().as_secs_f64();
    match out {
        Ok(Ok(())) => {}
        Ok(Err(e)) => r.error = Some(e),
        Err(p) => {
            let msg = if let Some(s) = p.downcast_ref::<&str>() {
                s.to_string()
            } else if let Some(s) = p.downcast_ref::<String>() {
                s.clone()
            } else {
                "panic".to_string()
            };
            r.error = Some(format!("panicked: {}", msg));
        }
    }
    r
}

/// Results of the main training run, shared by tests 1, 2, 3, 4 and 6.
pub struct MainRun {
    pub prediction: TestResult,
    pub composition: TestResult,
    pub persistence: TestResult,
    pub noise: TestResult,
    pub confusion: TestResult,
    pub final_stats: Vec<(String, f64)>,
}

/// Tests 1, 2, 3, 4 and 6 share one model: it reads the training stream
/// prequentially (learning on), then learning is switched off and it reads
/// the evaluation texts in this order: held-out pairs, control pairs, clean
/// noise text, 5% noise, 10% noise, confusion sets. With learning off its
/// structure cannot change, so the order only affects held state.
pub fn main_run(f: &Factory, c: &Corpus) -> MainRun {
    let mut scorer: Option<Scorer> = None;
    let mut train_bits: Vec<f64> = Vec::new();

    // ---- Test 1: prediction -------------------------------------------------
    let prediction = timed(|r| {
        let mut s = Scorer::new((f.make)(c.seed, DEFAULT_CAPACITY));
        s.learning(true);
        let bits = s.run(&c.train.text.bytes)?;
        let n = bits.len();
        let cut = n - n / 5;
        r.push("bpc_full", mean(&bits));
        r.push("bpc_final20", mean(&bits[cut..]));
        r.push("bpc_first20", mean(&bits[..n / 5]));
        r.peak_units = s.peak_units;
        train_bits = bits;
        scorer = Some(s);
        Ok(())
    });

    // ---- Test 3: persistence (from the prequential bits) --------------------
    let persistence = timed(|r| {
        if train_bits.is_empty() {
            return Err("prediction run failed".into());
        }
        let flags = &c.train.text.flags;
        let warm = (c.train.text.len() as f64 * PERSISTENCE_WARMUP) as usize;
        let mut seen = vec![false; c.grammar.lex.topic_names.len()];
        let (mut bt, mut nbt, mut lt, mut nlt) = (0.0, 0usize, 0.0, 0usize);
        let (mut ba, mut nba, mut la, mut nla) = (0.0, 0usize, 0.0, 0usize);
        let mut returns = 0;
        for b in &c.train.blocks {
            let is_return = seen[b.topic];
            seen[b.topic] = true;
            if !is_return || b.start < warm || b.len <= 2 * BOUNDARY_WINDOW {
                continue;
            }
            returns += 1;
            for i in b.start..b.start + b.len {
                let boundary = i < b.start + BOUNDARY_WINDOW;
                let x = train_bits[i];
                let topical = flags[i] & F_TOPIC_WORD != 0;
                if boundary {
                    ba += x;
                    nba += 1;
                    if topical {
                        bt += x;
                        nbt += 1;
                    }
                } else {
                    la += x;
                    nla += 1;
                    if topical {
                        lt += x;
                        nlt += 1;
                    }
                }
            }
        }
        let d = |s: f64, n: usize| if n == 0 { f64::NAN } else { s / n as f64 };
        r.push("topic_bpc_boundary", d(bt, nbt));
        r.push("topic_bpc_later", d(lt, nlt));
        r.push("topic_drop", d(bt, nbt) - d(lt, nlt));
        r.push("all_bpc_boundary", d(ba, nba));
        r.push("all_bpc_later", d(la, nla));
        r.push("all_drop", d(ba, nba) - d(la, nla));
        r.push("returns_scored", returns as f64);
        r.push("topic_chars_boundary", nbt as f64);
        r.push("topic_chars_later", nlt as f64);
        Ok(())
    });

    // ---- Test 2: composition (held-out pairs) -------------------------------
    let composition = timed(|r| {
        let s = scorer.as_mut().ok_or("prediction run failed")?;
        s.learning(false);
        for (prefix, text) in [("heldout", &c.heldout_eval), ("control", &c.control_eval)] {
            let bits = s.run(&text.bytes)?;
            let fl = &text.flags;
            let (v, _) = masked_mean(&bits, |i| fl[i] & F_VERB != 0);
            let (vf, _) = masked_mean(&bits, |i| fl[i] & F_VERB_FIRST != 0);
            let (rest, _) = masked_mean(&bits, |i| fl[i] & F_VERB == 0);
            let all = mean(&bits);
            match prefix {
                "heldout" => {
                    r.push("verb_bpc", v);
                    r.push("verb_first_bpc", vf);
                    r.push("sentence_bpc", all);
                    r.push("nonverb_bpc", rest);
                }
                _ => {
                    r.push("control_verb_bpc", v);
                    r.push("control_verb_first_bpc", vf);
                    r.push("control_sentence_bpc", all);
                }
            }
        }
        let h = r.get("verb_bpc").unwrap();
        let cv = r.get("control_verb_bpc").unwrap();
        r.push("verb_gap", h - cv);
        r.peak_units = s.peak_units;
        Ok(())
    });

    // ---- Test 4: noise recovery ---------------------------------------------
    let noise = timed(|r| {
        let s = scorer.as_mut().ok_or("prediction run failed")?;
        s.learning(false);
        let clean = s.run(&c.noise_clean.bytes)?;
        r.push("clean_bpc", mean(&clean));
        for nz in &c.noisy {
            let bits = s.run(&nz.text.bytes)?;
            let (after, _) = masked_mean(&bits, |i| nz.after[i]);
            if (nz.rate - 0.05).abs() < 1e-9 {
                r.push("bpc_5", mean(&bits));
                r.push("after_bpc_5", after);
            } else {
                r.push("bpc_10", mean(&bits));
                r.push("after_bpc_10", after);
            }
        }
        r.peak_units = s.peak_units;
        Ok(())
    });

    // ---- Test 6: confusion --------------------------------------------------
    let confusion = timed(|r| {
        let s = scorer.as_mut().ok_or("prediction run failed")?;
        s.learning(false);
        for (name, text) in &c.confusion {
            let (bits, energy) = s.run_energy(&text.bytes)?;
            let (ek, bk): (&'static str, &'static str) = match *name {
                "familiar" => ("energy_familiar", "bpc_familiar"),
                "heldout_pairs" => ("energy_heldout_pairs", "bpc_heldout_pairs"),
                "word_salad" => ("energy_word_salad", "bpc_word_salad"),
                "unseen_words" => ("energy_unseen_words", "bpc_unseen_words"),
                _ => ("energy_random_letters", "bpc_random_letters"),
            };
            r.push(ek, mean(&energy));
            r.push(bk, mean(&bits));
        }
        // Does energy order the sets the way the theory predicts?
        let e = |k: &str| r.get(k).unwrap();
        let ordered = e("energy_familiar") < e("energy_heldout_pairs")
            && e("energy_heldout_pairs") < e("energy_unseen_words")
            && e("energy_familiar") < e("energy_random_letters");
        r.push("familiar_lowest", ordered as u8 as f64);
        r.peak_units = s.peak_units;
        Ok(())
    });

    let final_stats = scorer.as_ref().map(|s| s.stats()).unwrap_or_default();
    MainRun { prediction, composition, persistence, noise, confusion, final_stats }
}

/// Test 5: forgetting under scarce capacity. Train on stream A, score A's test
/// text (learning off), train on stream B (new vocabulary, same grammar),
/// score A's test text again. Run with freezing on and off if supported.
pub fn forgetting(f: &Factory, c: &Corpus) -> TestResult {
    timed(|r| {
        let uni = (A as f64).log2();
        let mut variants: Vec<(&'static str, Option<bool>)> = vec![("", None)];
        {
            // Probe support on a throwaway instance.
            let mut probe = (f.make)(c.seed, f.scarce_capacity);
            if probe.set_freezing(true) {
                variants = vec![("freeze_on_", Some(true)), ("freeze_off_", Some(false))];
            }
        }
        r.push("capacity", f.scarce_capacity as f64);
        for (prefix, freeze) in variants {
            let mut m = (f.make)(c.seed, f.scarce_capacity);
            if let Some(on) = freeze {
                m.set_freezing(on);
            }
            let mut s = Scorer::new(m);
            s.learning(true);
            s.run(&c.forget_a.bytes)?;
            s.learning(false);
            let before = mean(&s.run(&c.forget_a_test.bytes)?);
            s.learning(true);
            let b_bits = s.run(&c.forget_b.bytes)?;
            s.learning(false);
            let after = mean(&s.run(&c.forget_a_test.bytes)?);
            let survives = (uni - after) / (uni - before);
            let keys: [&'static str; 5] = match prefix {
                "freeze_on_" => [
                    "freeze_on_a_before",
                    "freeze_on_a_after",
                    "freeze_on_survival",
                    "freeze_on_b_final20",
                    "freeze_on_peak_units",
                ],
                "freeze_off_" => [
                    "freeze_off_a_before",
                    "freeze_off_a_after",
                    "freeze_off_survival",
                    "freeze_off_b_final20",
                    "freeze_off_peak_units",
                ],
                _ => ["a_before", "a_after", "survival", "b_final20", "peak_units"],
            };
            let n = b_bits.len();
            r.push(keys[0], before);
            r.push(keys[1], after);
            r.push(keys[2], survives);
            r.push(keys[3], mean(&b_bits[n - n / 5..]));
            r.push(keys[4], s.peak_units);
            r.peak_units = r.peak_units.max(s.peak_units);
        }
        Ok(())
    })
}

/// Test 7: thinking without data. Two fresh models, same seed. Both read the
/// first half of the stream (learning on). One then has a quiet period of
/// `QUIET_STEPS`; the other does not. Both then read the second half with
/// learning on. Difference = quiet − none (negative means quiet helped).
pub fn thinking(f: &Factory, c: &Corpus) -> TestResult {
    timed(|r| {
        let text = &c.train.text.bytes;
        let half = text.len() / 2;
        let mut res = [0.0; 2];
        let mut early = [0.0; 2];
        for (i, quiet) in [false, true].into_iter().enumerate() {
            let mut s = Scorer::new((f.make)(c.seed, DEFAULT_CAPACITY));
            s.learning(true);
            s.run(&text[..half])?;
            if quiet {
                s.m.quiet(QUIET_STEPS);
            }
            let bits = s.run(&text[half..])?;
            res[i] = mean(&bits);
            early[i] = mean(&bits[..2_000.min(bits.len())]);
            r.peak_units = r.peak_units.max(s.peak_units);
        }
        r.push("bpc_none", res[0]);
        r.push("bpc_quiet", res[1]);
        r.push("diff", res[1] - res[0]);
        r.push("early_bpc_none", early[0]);
        r.push("early_bpc_quiet", early[1]);
        r.push("early_diff", early[1] - early[0]);
        Ok(())
    })
}

/// Everything for one model on one seed.
pub struct SeedResult {
    pub seed: u64,
    pub tests: Vec<(&'static str, TestResult)>,
    pub final_stats: Vec<(String, f64)>,
}

/// Characters used by the determinism check.
pub const DETERMINISM_CHARS: usize = 5_000;

/// Two fresh instances, same seed, same input: every probability must match
/// bit for bit. Returns the first mismatch.
pub fn determinism(f: &Factory, c: &Corpus) -> Result<(), String> {
    let text = &c.train.text.bytes[..DETERMINISM_CHARS.min(c.train.text.len())];
    let mut a = (f.make)(c.seed, DEFAULT_CAPACITY);
    let mut b = (f.make)(c.seed, DEFAULT_CAPACITY);
    for (i, &ch) in text.iter().enumerate() {
        let pa = a.predict();
        let pb = b.predict();
        if pa.iter().zip(&pb).any(|(x, y)| x.to_bits() != y.to_bits()) {
            return Err(format!("not deterministic: predictions differ at character {}", i));
        }
        a.observe(ch);
        b.observe(ch);
    }
    Ok(())
}

pub fn run_all(f: &Factory, c: &Corpus) -> SeedResult {
    let mut mr = main_run(f, c);
    if f.kind != Kind::Baseline {
        let ok = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| determinism(f, c)))
            .unwrap_or_else(|_| Err("panicked during determinism check".into()));
        mr.prediction.push("deterministic", ok.is_ok() as u8 as f64);
        if let Err(e) = ok {
            let prev = mr.prediction.error.take();
            mr.prediction.error = Some(match prev {
                Some(p) => format!("{}; {}", p, e),
                None => e,
            });
        }
    }
    let forget = forgetting(f, c);
    let think = thinking(f, c);
    SeedResult {
        seed: c.seed,
        tests: vec![
            ("prediction", mr.prediction),
            ("composition", mr.composition),
            ("persistence", mr.persistence),
            ("noise", mr.noise),
            ("forgetting", forget),
            ("confusion", mr.confusion),
            ("thinking", think),
        ],
        final_stats: mr.final_stats,
    }
}

/// Mask helper exposed for reports.
pub fn text_chars_with(t: &Text, flag: u8) -> usize {
    t.flags.iter().filter(|&&f| f & flag != 0).count()
}

#[allow(dead_code)]
fn _uses(_: &corpus::Noisy) {}

#[cfg(test)]
mod harness_tests {
    use super::*;

    /// Gives one symbol zero probability after 100 characters.
    struct Broken(usize);
    impl Automaton for Broken {
        fn name(&self) -> &str {
            "broken"
        }
        fn predict(&mut self) -> Vec<f64> {
            let mut p = vec![1.0 / (A - 1) as f64; A];
            p[0] = if self.0 > 100 { 0.0 } else { 1.0 / A as f64 };
            if self.0 <= 100 {
                p = vec![1.0 / A as f64; A];
            }
            p
        }
        fn observe(&mut self, _ch: u8) {
            self.0 += 1;
        }
        fn set_learning(&mut self, _on: bool) {}
        fn quiet(&mut self, _steps: usize) {
            panic!("quiet panics");
        }
        fn energy(&self) -> f64 {
            0.0
        }
        fn stats(&self) -> Vec<(String, f64)> {
            vec![]
        }
    }

    #[test]
    fn bad_models_are_reported_not_fatal() {
        let c = Corpus::new(1);
        let f = Factory {
            name: "broken".into(),
            make: |_, _| Box::new(Broken(0)),
            kind: Kind::Model,
            scarce_capacity: 10,
        };
        let r = run_all(&f, &c);
        let pred = &r.tests[0].1;
        assert!(pred.error.as_ref().unwrap().contains("probability 0"), "{:?}", pred.error);
        let think = &r.tests.iter().find(|t| t.0 == "thinking").unwrap().1;
        assert!(think.error.is_some());
        // A panic inside a model is caught and reported, not fatal.
        let r = timed(|_| {
            Broken(0).quiet(1);
            Ok(())
        });
        assert!(r.error.unwrap().contains("quiet panics"));
    }
}
