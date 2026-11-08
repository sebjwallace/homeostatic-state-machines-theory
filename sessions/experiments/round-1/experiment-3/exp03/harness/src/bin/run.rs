//! Runs every registered model and every baseline on every test, on three
//! seeds, and writes results/results.json and results/RESULTS.md.
//!
//! ```text
//! cargo run --release -p harness --bin run                      # everything
//! cargo run --release -p harness --bin run -- --model m003      # one model + baselines
//! cargo run --release -p harness --bin run -- --model m003 --no-baselines --seeds 1
//! cargo run --release -p harness --bin run -- --corpus          # corpus stats only
//! cargo run --release -p harness --bin run -- --help
//! ```

use harness::corpus::{self, Corpus};
use harness::report::{self, EntityResult, RunInfo};
use harness::tests::{self, Factory, Kind, SeedResult};
use harness::{baselines, model};
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::Instant;

/// The model registry. To add a model, add one line here (and one dependency
/// line in harness/Cargo.toml). See models/README.md.
fn models() -> Vec<Factory> {
    vec![
        reference(model!("m000-reference", m000_reference::Model)),
        model!("m003-shared-assemblies", m003_shared_assemblies::Model),
        model!("m004-held-state", m004_held_state::Model),
        model!("m005-assemblies-with-state", m005_assemblies_with_state::Model),
        model!("m006-state-with-assemblies", m006_state_with_assemblies::Model),
    ]
}

fn reference(mut f: Factory) -> Factory {
    f.kind = Kind::Reference;
    f
}

struct Args {
    models: Vec<String>,
    seeds: Vec<u64>,
    baselines: bool,
    jobs: usize,
    out: Option<PathBuf>,
    corpus_only: bool,
    dump_corpus: Option<PathBuf>,
}

const HELP: &str = "\
run: experiment 03 harness

Options:
  --model NAME        Run only models whose name contains NAME (repeatable, or comma-separated).
                      Results go to results/runs/<names>/ unless --out is given, so the full
                      results/results.json is not overwritten.
  --no-baselines      Skip the 16 baselines (faster iteration; the report then has no best baseline).
  --seeds 1,2,3       Seeds to run (default 1,2,3).
  --jobs N            Worker threads (default: available cores).
  --out DIR           Output directory (default: results/, or results/runs/<names>/ with --model).
  --corpus            Print corpus statistics and verification for each seed, then exit.
  --dump-corpus DIR   Write each seed's training stream and evaluation texts to DIR, then exit.
  --help              This message.
";

fn parse_args() -> Args {
    let mut a = Args {
        models: Vec::new(),
        seeds: vec![1, 2, 3],
        baselines: true,
        jobs: std::thread::available_parallelism().map(|n| n.get()).unwrap_or(1),
        out: None,
        corpus_only: false,
        dump_corpus: None,
    };
    let mut it = std::env::args().skip(1);
    while let Some(x) = it.next() {
        let mut val = |name: &str| it.next().unwrap_or_else(|| die(&format!("{} needs a value", name)));
        match x.as_str() {
            "--model" | "-m" => {
                a.models.extend(val("--model").split(',').map(|s| s.trim().to_string()))
            }
            "--no-baselines" => a.baselines = false,
            "--seeds" => {
                a.seeds = val("--seeds")
                    .split(',')
                    .map(|s| s.trim().parse().unwrap_or_else(|_| die("bad --seeds")))
                    .collect()
            }
            "--jobs" | "-j" => a.jobs = val("--jobs").parse().unwrap_or_else(|_| die("bad --jobs")),
            "--out" => a.out = Some(PathBuf::from(val("--out"))),
            "--corpus" => a.corpus_only = true,
            "--dump-corpus" => a.dump_corpus = Some(PathBuf::from(val("--dump-corpus"))),
            "--help" | "-h" => {
                print!("{}", HELP);
                std::process::exit(0);
            }
            _ => die(&format!("unknown argument {:?}\n\n{}", x, HELP)),
        }
    }
    a.jobs = a.jobs.max(1);
    a
}

fn die(msg: &str) -> ! {
    eprintln!("error: {}", msg);
    std::process::exit(2)
}

fn root_dir() -> PathBuf {
    // harness/ -> workspace root
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).parent().unwrap().to_path_buf()
}

fn print_corpus(s: &corpus::CorpusStats) {
    println!("seed {}:", s.seed);
    println!("  training stream      {} chars, {} sentences ({} fixed), {} topic blocks (mean {:.0} chars)",
        s.train_len, s.sentences, s.fixed_sentences, s.blocks, s.mean_block_len);
    println!("  topic blocks         {}", s.topic_blocks.iter().map(|(k, v)| format!("{} {}", k, v)).collect::<Vec<_>>().join(", "));
    println!("  alphabet used        {} of {}", s.alphabet_used, hsm_core::A);
    println!("  vocabulary           {} words in training ({} in lexicon A); {} nouns, {} verbs",
        s.vocabulary_in_train, s.lexicon_words, s.nouns, s.verbs);
    println!("  noun–verb pairs      {} within-group, {} held out: {}", s.noun_verb_pairs, s.heldout_pairs, s.heldout_list.join(", "));
    println!("  held-out in training {} occurrences (must be 0); in test-5 A streams {}", s.heldout_in_train, s.heldout_in_forget_a);
    println!("  word counts          min noun {}, min verb {}; held-out nouns ≥ {}, held-out verbs ≥ {}",
        s.min_noun_count, s.min_verb_count, s.min_heldout_noun_count, s.min_heldout_verb_count);
    println!("  seen pair counts     {}–{}", s.min_seen_pair_count, s.max_seen_pair_count);
    println!("  eval sets            held-out set only held-out pairs: {}; control only seen pairs: {}",
        s.heldout_eval_ok, s.control_eval_ok);
    println!("  composition eval     {} chars, {} verb chars", s.heldout_eval_len, s.heldout_verb_chars);
    println!("  noise                {}", s.noise.iter().map(|(r, l, k)| format!("{:.0}%: {} chars, {} corruptions", r * 100.0, l, k)).collect::<Vec<_>>().join("; "));
    println!("  forgetting           A {} chars, B {} chars, A test {} chars; A/B share only {:?}",
        s.forget_lens.0, s.forget_lens.1, s.forget_lens.2, s.forget_ab_shared_words);
    println!("  unseen noise         {}", s.noise_unseen.iter().map(|(r, l, k)| format!("{:.0}%: {} chars, double {} transpose2 {} burst {} boundary {}", r * 100.0, l, k[0], k[1], k[2], k[3])).collect::<Vec<_>>().join("; "));
    for x in &s.conflict {
        println!("  conflict {:<11} {} chars, {} paragraphs, {} frames, {} completion chars, min cue distance {}, order-8 side entropy {:.3}",
            x.0, x.1, x.2, x.3, x.4, x.5, x.6);
    }
    println!("  checks               {}", if s.all_checks_pass() { "PASS" } else { "FAIL" });
}

fn dump(c: &Corpus, dir: &PathBuf) -> std::io::Result<()> {
    std::fs::create_dir_all(dir)?;
    let w = |name: &str, bytes: &[u8]| std::fs::write(dir.join(format!("seed{}-{}.txt", c.seed, name)), bytes);
    w("train", &c.train.text.bytes)?;
    w("heldout", &c.heldout_eval.bytes)?;
    w("control", &c.control_eval.bytes)?;
    w("noise-clean", &c.noise_clean.bytes)?;
    for n in &c.noisy {
        w(&format!("noise-{:.0}", n.rate * 100.0), &n.text.bytes)?;
    }
    for (k, t) in &c.confusion {
        w(&format!("confusion-{}", k), &t.bytes)?;
    }
    w("forget-a", &c.forget_a.bytes)?;
    w("forget-b", &c.forget_b.bytes)?;
    w("forget-a-test", &c.forget_a_test.bytes)?;
    for n in &c.noisy_unseen {
        w(&format!("noise-unseen-{:.0}", n.rate * 100.0), &n.text.bytes)?;
    }
    w("conflict-learn", &c.conflict_learn.text.bytes)?;
    w("conflict-eval", &c.conflict_eval.text.bytes)?;
    Ok(())
}

fn main() {
    let args = parse_args();
    let t0 = Instant::now();

    // Corpora (deterministic per seed) and their verification.
    let corpora: Vec<Arc<Corpus>> = args.seeds.iter().map(|&s| Arc::new(Corpus::new(s))).collect();
    let cstats: Vec<corpus::CorpusStats> = corpora.iter().map(|c| corpus::stats(c)).collect();
    for s in &cstats {
        if !s.all_checks_pass() {
            print_corpus(s);
            die("corpus verification failed");
        }
    }
    if args.corpus_only {
        for s in &cstats {
            print_corpus(s);
        }
        return;
    }
    if let Some(dir) = &args.dump_corpus {
        for c in &corpora {
            dump(c, dir).unwrap_or_else(|e| die(&format!("dump failed: {}", e)));
        }
        println!("wrote corpus texts to {}", dir.display());
        return;
    }

    // Select entities.
    let all_models = models();
    let selected: Vec<Factory> = if args.models.is_empty() {
        all_models
    } else {
        let sel: Vec<Factory> = all_models
            .into_iter()
            .filter(|f| args.models.iter().any(|m| f.name.contains(m.as_str())))
            .collect();
        if sel.is_empty() {
            die(&format!(
                "no registered model matches {:?}; registered: {:?}",
                args.models,
                models().iter().map(|f| f.name.clone()).collect::<Vec<_>>()
            ));
        }
        sel
    };
    let mut entities: Vec<Factory> = Vec::new();
    if args.baselines {
        entities.extend(harness::baseline_factories());
    }
    entities.extend(selected);

    let sanity = if args.baselines { baselines::sanity() } else { Vec::new() };

    // Jobs: (entity, seed). Run the slowest-looking first (models before baselines).
    let mut jobs: Vec<(usize, usize)> = Vec::new();
    for (ei, e) in entities.iter().enumerate().rev() {
        let _ = e;
        for si in 0..corpora.len() {
            jobs.push((ei, si));
        }
    }
    let njobs = jobs.len();
    let queue = Arc::new(Mutex::new(jobs));
    let results: Arc<Mutex<Vec<Option<SeedResult>>>> =
        Arc::new(Mutex::new((0..entities.len() * corpora.len()).map(|_| None).collect()));
    let done = Arc::new(Mutex::new(0usize));
    let entities = Arc::new(entities);
    let corpora_arc = Arc::new(corpora);

    eprintln!(
        "running {} entities x {} seeds = {} jobs on {} threads",
        entities.len(),
        corpora_arc.len(),
        njobs,
        args.jobs
    );
    let mut handles = Vec::new();
    for _ in 0..args.jobs.min(njobs) {
        let queue = queue.clone();
        let results = results.clone();
        let entities = entities.clone();
        let corpora = corpora_arc.clone();
        let done = done.clone();
        let nseeds = corpora.len();
        handles.push(std::thread::spawn(move || loop {
            let job = queue.lock().unwrap().pop();
            let Some((ei, si)) = job else { break };
            let f = &entities[ei];
            let t = Instant::now();
            let r = tests::run_all(f, &corpora[si]);
            let errs: Vec<String> = r
                .tests
                .iter()
                .filter_map(|(k, t)| t.error.as_ref().map(|e| format!("{}: {}", k, e)))
                .collect();
            let bpc = r.tests[0].1.get("bpc_full").unwrap_or(f64::NAN);
            results.lock().unwrap()[ei * nseeds + si] = Some(r);
            let mut d = done.lock().unwrap();
            *d += 1;
            eprintln!(
                "[{:>3}/{}] {:<16} seed {}  {:>6.2}s  bpc {:.4}{}",
                *d,
                njobs,
                f.name,
                corpora[si].seed,
                t.elapsed().as_secs_f64(),
                bpc,
                if errs.is_empty() { String::new() } else { format!("  ERRORS: {}", errs.join("; ")) }
            );
        }));
    }
    for h in handles {
        h.join().expect("worker thread panicked");
    }

    let nseeds = corpora_arc.len();
    let mut res = Arc::try_unwrap(results).ok().unwrap().into_inner().unwrap();
    let ents: Vec<EntityResult> = entities
        .iter()
        .enumerate()
        .map(|(ei, f)| EntityResult {
            name: f.name.clone(),
            kind: f.kind,
            seeds: (0..nseeds).map(|si| res[ei * nseeds + si].take().unwrap()).collect(),
        })
        .collect();

    let total = t0.elapsed().as_secs_f64();
    let command = {
        let a: Vec<String> = std::env::args().skip(1).collect();
        if a.is_empty() {
            "cargo run --release -p harness --bin run".to_string()
        } else {
            format!("cargo run --release -p harness --bin run -- {}", a.join(" "))
        }
    };
    let info = RunInfo { seeds: args.seeds.clone(), total_seconds: total, jobs: args.jobs, command };

    let out = match &args.out {
        Some(p) => p.clone(),
        None if args.models.is_empty() => root_dir().join("results"),
        None => root_dir().join("results").join("runs").join(args.models.join("+")),
    };
    std::fs::create_dir_all(&out).unwrap_or_else(|e| die(&format!("cannot create {}: {}", out.display(), e)));
    let md = report::markdown(&ents, &cstats, &sanity, &info);
    let js = report::json(&ents, &cstats, &sanity, &info).to_string_pretty();
    std::fs::write(out.join("RESULTS.md"), md).expect("write RESULTS.md");
    std::fs::write(out.join("results.json"), js).expect("write results.json");

    // Console summary.
    println!("\nSummary (mean over seeds {:?}):", args.seeds);
    for spec in report::TESTS {
        let bb = report::best_baseline(&ents, spec);
        let mut line = format!("  {:<44}", spec.title);
        if let Some(b) = bb {
            let k = spec.headline.iter().find(|k| b.seeds[0].tests.iter().any(|(t, r)| *t == spec.key && r.get(k).is_some())).unwrap();
            let v: Vec<f64> = b.seeds.iter().map(|s| s.tests.iter().find(|(t, _)| *t == spec.key).unwrap().1.get(k).unwrap_or(f64::NAN)).collect();
            line.push_str(&format!(" best baseline {:<9} {}={:.4}", b.name, k, v.iter().sum::<f64>() / v.len() as f64));
        }
        for e in ents.iter().filter(|e| e.kind != Kind::Baseline) {
            let k = spec.headline.iter().find(|k| e.seeds.iter().any(|s| s.tests.iter().any(|(t, r)| *t == spec.key && r.get(k).is_some())));
            if let Some(k) = k {
                let v: Vec<f64> = e.seeds.iter().map(|s| s.tests.iter().find(|(t, _)| *t == spec.key).unwrap().1.get(k).unwrap_or(f64::NAN)).collect();
                line.push_str(&format!(" | {} {:.4}", e.name, v.iter().sum::<f64>() / v.len() as f64));
            }
        }
        println!("{}", line);
    }
    println!("\nwrote {} and {} ({:.1} s)", out.join("results.json").display(), out.join("RESULTS.md").display(), total);
}
