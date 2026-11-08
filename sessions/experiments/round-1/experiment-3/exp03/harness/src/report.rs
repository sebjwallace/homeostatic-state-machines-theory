//! results.json and RESULTS.md.

use crate::corpus::CorpusStats;
use crate::json::Json;
use crate::tests::{Kind, SeedResult, TestResult};
use std::fmt::Write;

/// All seeds for one model or baseline.
pub struct EntityResult {
    pub name: String,
    pub kind: Kind,
    pub seeds: Vec<SeedResult>,
}

/// How to read each test: headline metric, direction, and what it means.
pub struct TestSpec {
    pub key: &'static str,
    pub title: &'static str,
    /// Candidate headline metrics, first one present wins.
    pub headline: &'static [&'static str],
    /// true = lower is better, false = higher is better, None = descriptive.
    pub lower_better: Option<bool>,
    pub about: &'static str,
}

pub const TESTS: &[TestSpec] = &[
    TestSpec {
        key: "prediction",
        title: "1. Prediction",
        headline: &["bpc_full"],
        lower_better: Some(true),
        about: "Prequential bits per character over the 60k training stream (predict, then learn). \
                `bpc_final20` is the final 20% of the stream.",
    },
    TestSpec {
        key: "composition",
        title: "2. Composition (held-out noun–verb pairs)",
        headline: &["verb_bpc"],
        lower_better: Some(true),
        about: "After the stream, learning off, score sentences whose noun–verb pair never appeared in training. \
                `verb_bpc` = bpc on the verb's characters; `verb_first_bpc` = its first character only; \
                `sentence_bpc` = whole sentences. `control_*` = same construction with pairs seen in training. \
                `verb_gap` = verb_bpc − control_verb_bpc (how much the novel pairing costs).",
    },
    TestSpec {
        key: "persistence",
        title: "3. Persistence (topic return)",
        headline: &["topic_bpc_boundary"],
        lower_better: Some(true),
        about: "From the prequential run of test 1. For each block that returns to a topic seen before \
                (blocks starting after the first 20% of the stream), bpc on topic-specific words in the block's \
                first 100 characters (`topic_bpc_boundary`) versus the rest of the block (`topic_bpc_later`). \
                `topic_drop` = boundary − later: how much worse the model is just after the return. \
                `all_*` = the same over every character. The headline is `topic_bpc_boundary`, so the best \
                baseline is the one that predicts best at the return, not a weak one that is equally bad everywhere \
                (low orders have tiny drops for that reason). A model holding topic state should beat it there \
                and show a smaller `topic_drop`.",
    },
    TestSpec {
        key: "noise",
        title: "4. Noise recovery",
        headline: &["bpc_10"],
        lower_better: Some(true),
        about: "Learning off. Held-out text from the training distribution, clean and corrupted at 5% and 10% \
                (insert, drop, swap). `bpc_N` = bpc over the whole corrupted text; `after_bpc_N` = bpc on the \
                10 characters following each corruption (recovery). The headline is `bpc_10`; `after_bpc_10` alone \
                would crown order-1 models, which recover \"well\" only because they never predicted well.",
    },
    TestSpec {
        key: "forgetting",
        title: "5. Forgetting (scarce capacity)",
        headline: &["survival", "freeze_on_survival"],
        lower_better: Some(false),
        about: "Capacity is scarce (`capacity`). Train on stream A (20k), score A's test text (learning off) = \
                `a_before`; train on stream B (20k, new content words, same grammar and function words), \
                score A again = `a_after`. `survival` = (log2 29 − a_after) / (log2 29 − a_before): \
                1 = nothing forgotten. Models that implement `set_freezing` are run with freezing on and off.",
    },
    TestSpec {
        key: "confusion",
        title: "6. Confusion (energy)",
        headline: &["energy_familiar"],
        lower_better: None,
        about: "Learning off. Mean `energy()` (read after each character) on: familiar training sentences, \
                novel combinations (held-out pairs), word salad (known words shuffled), unseen (nonce) words in \
                grammatical frames, random letters. For counting baselines energy = surprisal of the last \
                character. `familiar_lowest` = 1 if familiar < held-out < unseen and familiar < random.",
    },
    TestSpec {
        key: "thinking",
        title: "7. Thinking without data",
        headline: &["diff"],
        lower_better: None,
        about: "Two runs, same seed: read the first half of the stream, then a quiet period of 5,000 steps or none, \
                then read the second half (learning on). `diff` = bpc_quiet − bpc_none: negative means the quiet \
                period helped. `early_*` = first 2,000 characters after the pause. Baselines do nothing when quiet, \
                so their `diff` is 0 by construction and there is no best baseline; compare a model's `bpc_none` \
                with the baselines' for context.",
    },
    TestSpec {
        key: "noise_unseen",
        title: "9. Unseen noise shapes",
        headline: &["bpc_10"],
        lower_better: Some(true),
        about: "Learning off, after the main run (structure as in test 4). Test 4's clean held-out text, corrupted \
                at 5% and 10% with kinds no model was told about: a character doubled (`double`), a character \
                exchanged with the one two places on (`transpose2`), a burst of 2–3 random characters (`burst`), \
                and a word boundary moved one place left or right (`boundary`), chosen uniformly (doubling stands \
                in where the others cannot apply). `bpc_N` = bpc over the corrupted text; `after_bpc_N` = bpc on \
                the 10 characters following each corruption; `after_<kind>_10` = the same per kind at 10%; \
                `excess_10` = bpc_10 − clean_bpc. Same scoring as test 4; headline `bpc_10`.",
    },
    TestSpec {
        key: "conflict",
        title: "10. Context conflict",
        headline: &["conflict_bpc"],
        lower_better: Some(true),
        about: "A separate stream. Each paragraph opens with one cue of a context pair (\"in the morning\" / \
                \"in the evening\", \"at the shop\" / \"at the farm\", summer / winter, won / lost, boat / train), \
                then neutral grammar sentences, and one or two frames whose completion depends on the cue \
                (\"the sky was blue\" / \"red\"). At least one filler sentence separates cue and frame, so the cue \
                is always more than 8 characters back. Fresh instance: about 20k characters with learning on \
                (prequential), then a 6k held-out stream with learning off. `conflict_bpc` = bpc on the \
                context-dependent completion characters of the held-out stream (headline); `conflict_first_bpc` = \
                their first character, where the two completions diverge; `stream_bpc` = whole held-out stream; \
                `learn_conflict_bpc` = prequential bpc on completions in the second half of the learning stream. \
                `quiet_*` = the same, same seed, with a 5,000-step quiet period inserted at the paragraph \
                boundary halfway through the learning stream; `quiet_diff` = quiet_conflict_bpc − conflict_bpc \
                (negative means the quiet period helped). A model that only counts recent characters pays about \
                1 bit at `conflict_first`; one that finds the context pays nearly 0.",
    },
];

/// Round-two tests (1–7), reported before the cost section exactly as before.
const ROUND_TWO: usize = 7;

fn seed_test<'a>(s: &'a SeedResult, key: &str) -> Option<&'a TestResult> {
    s.tests.iter().find(|(k, _)| *k == key).map(|(_, t)| t)
}

fn metric_keys(ents: &[EntityResult], test: &str) -> Vec<&'static str> {
    let mut keys: Vec<&'static str> = Vec::new();
    for e in ents {
        for s in &e.seeds {
            if let Some(t) = seed_test(s, test) {
                for m in &t.metrics {
                    if !keys.contains(&m.key) {
                        keys.push(m.key);
                    }
                }
            }
        }
    }
    keys
}

/// Per-seed values of one metric (NaN where missing or errored).
fn values(e: &EntityResult, test: &str, key: &str) -> Vec<f64> {
    e.seeds
        .iter()
        .map(|s| seed_test(s, test).and_then(|t| t.get(key)).unwrap_or(f64::NAN))
        .collect()
}

fn mean_of(xs: &[f64]) -> f64 {
    let v: Vec<f64> = xs.iter().copied().filter(|x| x.is_finite()).collect();
    if v.is_empty() || v.len() != xs.len() {
        f64::NAN
    } else {
        v.iter().sum::<f64>() / v.len() as f64
    }
}

fn headline_key(e: &EntityResult, spec: &TestSpec) -> Option<&'static str> {
    for &k in spec.headline {
        if values(e, spec.key, k).iter().any(|x| x.is_finite()) {
            return Some(k);
        }
    }
    None
}

fn headline_mean(e: &EntityResult, spec: &TestSpec) -> f64 {
    match headline_key(e, spec) {
        Some(k) => mean_of(&values(e, spec.key, k)),
        None => f64::NAN,
    }
}

/// Best baseline for a test by mean headline metric.
pub fn best_baseline<'a>(ents: &'a [EntityResult], spec: &TestSpec) -> Option<&'a EntityResult> {
    let lower = spec.lower_better?;
    let mut best: Option<(&EntityResult, f64)> = None;
    for e in ents.iter().filter(|e| e.kind == Kind::Baseline) {
        let v = headline_mean(e, spec);
        if !v.is_finite() {
            continue;
        }
        let better = match best {
            None => true,
            Some((_, b)) => {
                if lower {
                    v < b - 1e-12
                } else {
                    v > b + 1e-12
                }
            }
        };
        if better {
            best = Some((e, v));
        }
    }
    best.map(|b| b.0)
}

/// Best baseline for one test on one seed (by that seed's headline value).
pub fn best_baseline_seed<'a>(
    ents: &'a [EntityResult],
    spec: &TestSpec,
    seed_idx: usize,
) -> Option<(&'a EntityResult, f64)> {
    let lower = spec.lower_better?;
    let mut best: Option<(&EntityResult, f64)> = None;
    for e in ents.iter().filter(|e| e.kind == Kind::Baseline) {
        let Some(k) = headline_key(e, spec) else { continue };
        let v = values(e, spec.key, k).get(seed_idx).copied().unwrap_or(f64::NAN);
        if !v.is_finite() {
            continue;
        }
        let better = match best {
            None => true,
            Some((_, b)) => {
                if lower {
                    v < b
                } else {
                    v > b
                }
            }
        };
        if better {
            best = Some((e, v));
        }
    }
    best
}

fn fmt(x: f64) -> String {
    if !x.is_finite() {
        "–".to_string()
    } else if x.abs() >= 1000.0 {
        format!("{:.0}", x)
    } else if x.abs() >= 100.0 {
        format!("{:.1}", x)
    } else {
        format!("{:.3}", x)
    }
}

pub struct RunInfo {
    pub seeds: Vec<u64>,
    pub total_seconds: f64,
    pub jobs: usize,
    pub command: String,
}

pub fn markdown(
    ents: &[EntityResult],
    corpus: &[CorpusStats],
    sanity: &[(String, f64, f64, f64)],
    info: &RunInfo,
) -> String {
    let mut o = String::new();
    let seeds = &info.seeds;
    let _ = writeln!(o, "# Experiment 03 results\n");
    let _ = writeln!(
        o,
        "Generated by `{}`. Seeds: {}. Total wall time {:.1} s ({} worker threads).\n",
        info.command,
        seeds.iter().map(|s| s.to_string()).collect::<Vec<_>>().join(", "),
        info.total_seconds,
        info.jobs
    );
    let _ = writeln!(
        o,
        "Lower is better unless noted. Every table shows the mean over seeds; the headline metric is also shown \
         per seed. **Bold** marks the best baseline for the test (by mean headline metric); models are compared \
         with it, not with a weak baseline. `m000-reference` is a harness check (an order-2 table), not part of \
         the comparison.\n"
    );

    // Summary table.
    let models: Vec<&EntityResult> = ents.iter().filter(|e| e.kind != Kind::Baseline).collect();
    let _ = writeln!(o, "## Summary: models against the best baseline\n");
    let mut hdr = String::from("| test | headline | best baseline | value |");
    let mut sep = String::from("|---|---|---|---|");
    for m in &models {
        let _ = write!(hdr, " {} |", m.name);
        sep.push_str("---|");
    }
    let _ = writeln!(o, "{}\n{}", hdr, sep);
    for spec in TESTS {
        let bb = best_baseline(ents, spec);
        let hk = bb
            .and_then(|b| headline_key(b, spec))
            .unwrap_or(spec.headline[0]);
        let dir = match spec.lower_better {
            Some(true) => " (lower)",
            Some(false) => " (higher)",
            None => "",
        };
        let _ = write!(
            o,
            "| {} | `{}`{} | {} | {} |",
            spec.title,
            hk,
            dir,
            bb.map(|b| b.name.as_str()).unwrap_or("–"),
            bb.map(|b| fmt(headline_mean(b, spec))).unwrap_or("–".into())
        );
        for m in &models {
            let _ = write!(o, " {} |", fmt(headline_mean(m, spec)));
        }
        let _ = writeln!(o);
    }
    let _ = writeln!(o);

    // Per-test tables: tests 1-7, then cost (8), then tests 9 onwards.
    let section = |o: &mut String, spec: &TestSpec| {
        let _ = writeln!(o, "## {}\n", spec.title);
        let _ = writeln!(o, "{}\n", spec.about);
        let bb = best_baseline(ents, spec);
        if let Some(b) = bb {
            let _ = writeln!(o, "Best baseline: **{}**.\n", b.name);
        }
        let keys = metric_keys(ents, spec.key);
        let _ = write!(o, "| model | kind |");
        for k in &keys {
            let _ = write!(o, " {} |", k);
        }
        let _ = writeln!(o);
        let _ = write!(o, "|---|---|");
        for _ in &keys {
            o.push_str("---|");
        }
        let _ = writeln!(o);
        for e in ents {
            let bold = bb.map(|b| std::ptr::eq(b, e)).unwrap_or(false);
            let name = if bold { format!("**{}**", e.name) } else { e.name.clone() };
            let _ = write!(o, "| {} | {} |", name, e.kind.label());
            for k in &keys {
                let _ = write!(o, " {} |", fmt(mean_of(&values(e, spec.key, k))));
            }
            let _ = writeln!(o);
        }
        let _ = writeln!(o);

        // Headline per seed.
        let _ = write!(o, "Headline `{}` per seed:\n\n| model |", spec.headline.join("` / `"));
        for s in seeds {
            let _ = write!(o, " seed {} |", s);
        }
        let _ = writeln!(o, " mean |");
        let _ = write!(o, "|---|");
        for _ in seeds {
            o.push_str("---|");
        }
        let _ = writeln!(o, "---|");
        for e in ents {
            let Some(k) = headline_key(e, spec) else {
                let _ = writeln!(o, "| {} | (no result) |", e.name);
                continue;
            };
            let v = values(e, spec.key, k);
            let _ = write!(o, "| {} |", e.name);
            for x in &v {
                let _ = write!(o, " {} |", fmt(*x));
            }
            let _ = writeln!(o, " {} |", fmt(mean_of(&v)));
        }
        let _ = writeln!(o);

        // Errors.
        for e in ents {
            for s in &e.seeds {
                if let Some(t) = seed_test(s, spec.key) {
                    if let Some(err) = &t.error {
                        let _ = writeln!(o, "- **error** {} seed {}: {}", e.name, s.seed, err);
                    }
                }
            }
        }
        let _ = writeln!(o);
    };
    for spec in &TESTS[..ROUND_TWO] {
        section(&mut o, spec);
    }

    // Cost.
    let _ = writeln!(o, "## 8. Cost\n");
    let _ = writeln!(
        o,
        "Wall time in seconds per test (mean over seeds; tests 1–4 and 6 share one model, so the prediction \
         column includes training and the others are evaluation only). Runs execute {} at a time, so times \
         include some contention. `peak_units` = the largest `units` value the model reported via `stats()` \
         in the main run.\n",
        info.jobs
    );
    let _ = write!(o, "| model |");
    for spec in TESTS {
        let _ = write!(o, " {} |", spec.key);
    }
    let _ = writeln!(o, " total s | peak_units |");
    let _ = write!(o, "|---|");
    for _ in TESTS {
        o.push_str("---|");
    }
    let _ = writeln!(o, "---|---|");
    for e in ents {
        let _ = write!(o, "| {} |", e.name);
        let mut tot = 0.0;
        for spec in TESTS {
            let v: Vec<f64> = e
                .seeds
                .iter()
                .map(|s| seed_test(s, spec.key).map(|t| t.seconds).unwrap_or(f64::NAN))
                .collect();
            let m = mean_of(&v);
            tot += m;
            let _ = write!(o, " {:.2} |", m);
        }
        let pu: Vec<f64> = e
            .seeds
            .iter()
            .map(|s| seed_test(s, "prediction").map(|t| t.peak_units).unwrap_or(f64::NAN))
            .collect();
        let _ = writeln!(o, " {:.2} | {} |", tot, fmt(pu.iter().cloned().fold(f64::NAN, f64::max)));
    }
    let _ = writeln!(o);

    for spec in &TESTS[ROUND_TWO..] {
        section(&mut o, spec);
    }

    // Model stats.
    let _ = writeln!(o, "## Model stats (end of the main run, seed {})\n", seeds[0]);
    for e in ents.iter().filter(|e| e.kind != Kind::Baseline) {
        if let Some(s) = e.seeds.first() {
            let st: Vec<String> =
                s.final_stats.iter().map(|(k, v)| format!("`{}` = {}", k, fmt(*v))).collect();
            let _ = writeln!(o, "- **{}**: {}", e.name, st.join(", "));
        }
    }
    let _ = writeln!(o);

    // Corpus.
    let _ = writeln!(o, "## Corpus\n");
    let _ = writeln!(
        o,
        "| seed | train chars | alphabet | vocab | held-out pairs | held-out in train | min held-out noun count | \
         min held-out verb count | seen-pair count min–max | blocks (farm/sea/town) | mean block | fixed sentences | checks |"
    );
    let _ = writeln!(o, "|---|---|---|---|---|---|---|---|---|---|---|---|---|");
    for c in corpus {
        let tb: Vec<String> = c.topic_blocks.iter().map(|t| t.1.to_string()).collect();
        let _ = writeln!(
            o,
            "| {} | {} | {} | {} | {} of {} | {} | {} | {} | {}–{} | {} ({}) | {:.0} | {} | {} |",
            c.seed,
            c.train_len,
            c.alphabet_used,
            c.vocabulary_in_train,
            c.heldout_pairs,
            c.noun_verb_pairs,
            c.heldout_in_train,
            c.min_heldout_noun_count,
            c.min_heldout_verb_count,
            c.min_seen_pair_count,
            c.max_seen_pair_count,
            c.blocks,
            tb.join("/"),
            c.mean_block_len,
            c.fixed_sentences,
            if c.all_checks_pass() { "pass" } else { "**FAIL**" }
        );
    }
    let _ = writeln!(o);
    if let Some(c) = corpus.first() {
        let _ = writeln!(o, "Held-out pairs, seed {}: {}.\n", c.seed, c.heldout_list.join(", "));
    }

    let _ = writeln!(o, "Test 9 corruptions (double / transpose2 / burst / boundary) and test 10 streams:\n");
    let _ = writeln!(
        o,
        "| seed | unseen 5% | unseen 10% | conflict learn: chars, paragraphs, frames, completion chars | \
         conflict eval | min cue distance | order-8 side entropy (bits) |"
    );
    let _ = writeln!(o, "|---|---|---|---|---|---|---|");
    for c in corpus {
        let nu: Vec<String> = c
            .noise_unseen
            .iter()
            .map(|(_, l, k)| format!("{} chars, {}/{}/{}/{}", l, k[0], k[1], k[2], k[3]))
            .collect();
        let cf: Vec<String> =
            c.conflict.iter().map(|x| format!("{}, {}, {}, {}", x.1, x.2, x.3, x.4)).collect();
        let _ = writeln!(
            o,
            "| {} | {} | {} | {} | {} | {} | {} |",
            c.seed,
            nu.first().cloned().unwrap_or_default(),
            nu.get(1).cloned().unwrap_or_default(),
            cf.first().cloned().unwrap_or_default(),
            cf.get(1).cloned().unwrap_or_default(),
            c.conflict.iter().map(|x| x.5).min().unwrap_or(0),
            c.conflict.iter().map(|x| format!("{:.3}", x.6)).collect::<Vec<_>>().join(" / ")
        );
    }
    let _ = writeln!(
        o,
        "\nOrder-8 side entropy: for the 8 characters before each completion, how uncertain the context side is \
         (over contexts seen at least 10 times; 1 bit = the cue is invisible at order 8). The checks require it to \
         exceed 0.9 on the learning stream (the held-out stream is too small to estimate it well) and the cue to be more than 8 characters back.\n"
    );

    // Sanity.
    let _ = writeln!(o, "## Baseline sanity checks\n");
    let _ = writeln!(
        o,
        "Cycled alphabet (deterministic at order 1) and a repeated sentence \"the cat sat on the mat.\\n\" \
         (deterministic from order 5): bpc on the second 10k characters should approach 0. Uniform random text \
         over the 29 symbols (bpc on the second 100k of 200k characters) should approach log2 29 = {:.3} for low \
         orders; higher orders stay above it because their many sparse contexts keep paying escape costs, which is \
         genuine PPM / Witten–Bell behaviour on incompressible data.\n",
        (29f64).log2()
    );
    let _ = writeln!(o, "| baseline | cycled alphabet bpc | repeated sentence bpc | random bpc |\n|---|---|---|---|");
    for (n, c, r, u) in sanity {
        let _ = writeln!(o, "| {} | {:.4} | {:.4} | {:.4} |", n, c, r, u);
    }
    let _ = writeln!(o);
    o
}

fn test_json(t: &TestResult) -> Json {
    let mut j = Json::obj();
    let mut m = Json::obj();
    for x in &t.metrics {
        m.set(x.key, x.value);
    }
    j.set("metrics", m);
    j.set("seconds", t.seconds);
    j.set("peak_units", t.peak_units);
    j.set("error", t.error.clone());
    j
}

pub fn json(
    ents: &[EntityResult],
    corpus: &[CorpusStats],
    sanity: &[(String, f64, f64, f64)],
    info: &RunInfo,
) -> Json {
    let mut root = Json::obj();
    let mut meta = Json::obj();
    meta.set("experiment", "03");
    meta.set("command", info.command.clone());
    meta.set("seeds", info.seeds.clone());
    meta.set("total_seconds", info.total_seconds);
    meta.set("jobs", info.jobs);
    meta.set("alphabet", String::from_utf8_lossy(hsm_core::ALPHABET).to_string());
    root.set("meta", meta);

    let mut cs = Vec::new();
    for c in corpus {
        let mut j = Json::obj();
        j.set("seed", c.seed);
        j.set("train_len", c.train_len);
        j.set("alphabet_used", c.alphabet_used);
        j.set("vocabulary_in_train", c.vocabulary_in_train);
        j.set("lexicon_words", c.lexicon_words);
        j.set("nouns", c.nouns);
        j.set("verbs", c.verbs);
        j.set("noun_verb_pairs", c.noun_verb_pairs);
        j.set("heldout_pairs", c.heldout_pairs);
        j.set("heldout_list", c.heldout_list.clone());
        j.set("heldout_in_train", c.heldout_in_train);
        j.set("heldout_in_forget_a", c.heldout_in_forget_a);
        j.set("min_noun_count", c.min_noun_count);
        j.set("min_verb_count", c.min_verb_count);
        j.set("min_heldout_noun_count", c.min_heldout_noun_count);
        j.set("min_heldout_verb_count", c.min_heldout_verb_count);
        j.set("min_seen_pair_count", c.min_seen_pair_count);
        j.set("max_seen_pair_count", c.max_seen_pair_count);
        j.set("heldout_eval_ok", c.heldout_eval_ok);
        j.set("control_eval_ok", c.control_eval_ok);
        j.set("blocks", c.blocks);
        let mut tb = Json::obj();
        for (k, v) in &c.topic_blocks {
            tb.set(k, *v);
        }
        j.set("topic_blocks", tb);
        j.set("mean_block_len", c.mean_block_len);
        j.set("sentences", c.sentences);
        j.set("fixed_sentences", c.fixed_sentences);
        j.set("topic_word_chars", c.topic_word_chars);
        j.set("heldout_eval_len", c.heldout_eval_len);
        j.set("heldout_verb_chars", c.heldout_verb_chars);
        j.set(
            "noise",
            Json::Arr(
                c.noise
                    .iter()
                    .map(|(r, l, k)| {
                        let mut x = Json::obj();
                        x.set("rate", *r).set("len", *l).set("corruptions", *k);
                        x
                    })
                    .collect(),
            ),
        );
        j.set("forget_a_len", c.forget_lens.0);
        j.set("forget_b_len", c.forget_lens.1);
        j.set("forget_a_test_len", c.forget_lens.2);
        j.set("forget_ab_shared_words", c.forget_ab_shared_words.clone());
        j.set(
            "noise_unseen",
            Json::Arr(
                c.noise_unseen
                    .iter()
                    .map(|(r, l, k)| {
                        let mut x = Json::obj();
                        x.set("rate", *r).set("len", *l);
                        for (i, name) in crate::corpus::UNSEEN_KINDS.iter().enumerate() {
                            x.set(name, k[i]);
                        }
                        x
                    })
                    .collect(),
            ),
        );
        let mut cj = Json::obj();
        for x in &c.conflict {
            let mut y = Json::obj();
            y.set("len", x.1)
                .set("paragraphs", x.2)
                .set("frames", x.3)
                .set("completion_chars", x.4)
                .set("min_cue_distance", x.5)
                .set("ctx8_side_entropy", x.6);
            cj.set(x.0, y);
        }
        j.set("conflict", cj);
        j.set("all_checks_pass", c.all_checks_pass());
        cs.push(j);
    }
    root.set("corpus", Json::Arr(cs));

    root.set(
        "sanity",
        Json::Arr(
            sanity
                .iter()
                .map(|(n, c, r, u)| {
                    let mut x = Json::obj();
                    x.set("baseline", n.clone())
                        .set("cycled_alphabet_bpc", *c)
                        .set("repeated_sentence_bpc", *r)
                        .set("random_bpc", *u);
                    x
                })
                .collect(),
        ),
    );

    let mut best = Json::obj();
    for spec in TESTS {
        if let Some(b) = best_baseline(ents, spec) {
            let mut x = Json::obj();
            let hk = headline_key(b, spec).unwrap_or(spec.headline[0]);
            x.set("baseline", b.name.clone()).set("metric", hk).set("mean", headline_mean(b, spec));
            let per: Vec<Json> = (0..info.seeds.len())
                .map(|i| match best_baseline_seed(ents, spec, i) {
                    Some((e, v)) => {
                        let mut y = Json::obj();
                        y.set("seed", info.seeds[i]).set("baseline", e.name.clone()).set("value", v);
                        y
                    }
                    None => Json::Null,
                })
                .collect();
            x.set("best_per_seed", Json::Arr(per));
            best.set(spec.key, x);
        }
    }
    root.set("best_baseline", best);

    let mut es = Vec::new();
    for e in ents {
        let mut j = Json::obj();
        j.set("name", e.name.clone());
        j.set("kind", e.kind.label());
        let mut seeds = Vec::new();
        for s in &e.seeds {
            let mut sj = Json::obj();
            sj.set("seed", s.seed);
            let mut tj = Json::obj();
            for (k, t) in &s.tests {
                tj.set(k, test_json(t));
            }
            sj.set("tests", tj);
            let mut st = Json::obj();
            for (k, v) in &s.final_stats {
                st.set(k, *v);
            }
            sj.set("final_stats", st);
            seeds.push(sj);
        }
        j.set("seeds", Json::Arr(seeds));
        let mut mj = Json::obj();
        for spec in TESTS {
            let mut tm = Json::obj();
            for k in metric_keys(std::slice::from_ref(e), spec.key) {
                tm.set(k, mean_of(&values(e, spec.key, k)));
            }
            mj.set(spec.key, tm);
        }
        j.set("mean", mj);
        es.push(j);
    }
    root.set("results", Json::Arr(es));
    root
}
