//! The shared corpus, generated deterministically from the seed.
//!
//! A small grammar of simple sentences:
//!
//! ```text
//! sentence := det [adj] noun verb [prep det [adj] location] "."
//! ```
//!
//! * **Groups.** Nouns and verbs fall into three groups (creatures, people,
//!   machines). A noun only ever takes verbs from its own group.
//! * **Held-out pairs.** Within each group, a quarter of the noun–verb pairs
//!   (a Latin-square pattern, rotated per seed) never appear in training. Every
//!   noun keeps three of its group's four verbs, and every verb keeps most of
//!   its group's nouns, so each word is seen many times in other pairs.
//! * **Topics.** Three topics (farm, sea, town), each with its own nouns,
//!   adjectives and locations. The training stream is a sequence of blocks of
//!   300–600 characters, one topic per block, ending in a newline; consecutive
//!   blocks always change topic, so topics are left and returned to.
//! * **Fixed sentences.** Three longer sentences recur occasionally (3%).
//!
//! Test 5 uses a second lexicon (B): the same grammar shape and function words
//! (determiners, prepositions) with entirely new content words.

use hsm_core::{Rng, ALPHABET};
use std::collections::BTreeMap;

pub const TRAIN_LEN: usize = 60_000;
pub const BLOCK_MIN: usize = 300;
pub const BLOCK_MAX: usize = 600;
pub const FIXED_PROB: f64 = 0.03;
pub const FORGET_A_LEN: usize = 20_000;
pub const FORGET_B_LEN: usize = 20_000;
pub const FORGET_A_TEST_LEN: usize = 3_000;
pub const EVAL_SENTENCES: usize = 120;
pub const NOISE_SENTENCES: usize = 100;
pub const CONFUSION_SENTENCES: usize = 30;

/// Per-character annotation flags.
pub const F_VERB: u8 = 1;
pub const F_VERB_FIRST: u8 = 2;
pub const F_TOPIC_WORD: u8 = 4;
pub const F_NOUN: u8 = 8;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Role {
    Det,
    Adj,
    TopicAdj,
    Noun,
    TopicNoun,
    Verb,
    Prep,
    Loc,
    TopicLoc,
    Fixed,
    Other,
}

#[derive(Clone, Debug)]
pub struct Noun {
    pub word: &'static str,
    pub group: usize,
    pub topic: Option<usize>,
}

#[derive(Clone, Debug)]
pub struct Verb {
    pub word: &'static str,
    pub group: usize,
}

#[derive(Clone, Debug)]
pub struct Lexicon {
    pub name: &'static str,
    pub dets: Vec<&'static str>,
    pub preps: Vec<&'static str>,
    pub adjs: Vec<&'static str>,
    pub topic_names: Vec<&'static str>,
    pub topic_adjs: Vec<Vec<&'static str>>,
    pub nouns: Vec<Noun>,
    pub verbs: Vec<Verb>,
    pub locs: Vec<(&'static str, Option<usize>)>,
    pub fixed: Vec<&'static str>,
    pub groups: Vec<&'static str>,
}

impl Lexicon {
    /// Every distinct word the grammar can produce (excluding fixed sentences).
    pub fn words(&self) -> Vec<&'static str> {
        let mut w: Vec<&'static str> = Vec::new();
        w.extend(&self.dets);
        w.extend(&self.preps);
        w.extend(&self.adjs);
        for t in &self.topic_adjs {
            w.extend(t);
        }
        w.extend(self.nouns.iter().map(|n| n.word));
        w.extend(self.verbs.iter().map(|v| v.word));
        w.extend(self.locs.iter().map(|l| l.0));
        w.sort();
        w.dedup();
        w
    }
}

fn noun(word: &'static str, group: usize, topic: Option<usize>) -> Noun {
    Noun { word, group, topic }
}
fn verb(word: &'static str, group: usize) -> Verb {
    Verb { word, group }
}

/// The main lexicon (59 words).
pub fn lexicon_a() -> Lexicon {
    const FARM: Option<usize> = Some(0);
    const SEA: Option<usize> = Some(1);
    const TOWN: Option<usize> = Some(2);
    Lexicon {
        name: "A",
        dets: vec!["the", "a", "my"],
        preps: vec!["in", "on", "near", "by", "under"],
        adjs: vec!["big", "small", "red", "quiet", "happy", "tall"],
        topic_names: vec!["farm", "sea", "town"],
        topic_adjs: vec![vec!["muddy", "brown"], vec!["salty", "blue"], vec!["busy", "grey"]],
        nouns: vec![
            // group 0: creatures
            noun("dog", 0, None),
            noun("cat", 0, None),
            noun("bird", 0, None),
            noun("cow", 0, FARM),
            noun("fish", 0, SEA),
            noun("pigeon", 0, TOWN),
            // group 1: people
            noun("girl", 1, None),
            noun("boy", 1, None),
            noun("man", 1, None),
            noun("farmer", 1, FARM),
            noun("sailor", 1, SEA),
            noun("baker", 1, TOWN),
            // group 2: machines
            noun("car", 2, None),
            noun("clock", 2, None),
            noun("lamp", 2, None),
            noun("tractor", 2, FARM),
            noun("ship", 2, SEA),
            noun("bus", 2, TOWN),
        ],
        verbs: vec![
            verb("runs", 0),
            verb("sleeps", 0),
            verb("eats", 0),
            verb("hides", 0),
            verb("sings", 1),
            verb("reads", 1),
            verb("laughs", 1),
            verb("waits", 1),
            verb("stops", 2),
            verb("breaks", 2),
            verb("turns", 2),
            verb("shines", 2),
        ],
        locs: vec![
            ("house", None),
            ("garden", None),
            ("park", None),
            ("field", FARM),
            ("barn", FARM),
            ("shore", SEA),
            ("harbour", SEA),
            ("street", TOWN),
            ("market", TOWN),
        ],
        fixed: vec![
            "once upon a time there was a little house near the green hill.",
            "the quick brown fox jumps over the lazy dog.",
            "every morning the old man walks to the river and back again.",
        ],
        groups: vec!["creatures", "people", "machines"],
    }
}

/// The second lexicon for test 5: same grammar shape and function words,
/// new content words. No word overlaps lexicon A's content words.
pub fn lexicon_b() -> Lexicon {
    const FOREST: Option<usize> = Some(0);
    const DESERT: Option<usize> = Some(1);
    const SCHOOL: Option<usize> = Some(2);
    Lexicon {
        name: "B",
        dets: vec!["the", "a", "my"],
        preps: vec!["in", "on", "near", "by", "under"],
        adjs: vec!["soft", "wild", "cold", "dry", "pale", "loud"],
        topic_names: vec!["forest", "desert", "school"],
        topic_adjs: vec![vec!["dense", "mossy"], vec!["dusty", "hot"], vec!["strict", "new"]],
        nouns: vec![
            noun("wolf", 0, None),
            noun("boar", 0, None),
            noun("goat", 0, None),
            noun("deer", 0, FOREST),
            noun("camel", 0, DESERT),
            noun("hamster", 0, SCHOOL),
            noun("king", 1, None),
            noun("queen", 1, None),
            noun("monk", 1, None),
            noun("hunter", 1, FOREST),
            noun("nomad", 1, DESERT),
            noun("teacher", 1, SCHOOL),
            noun("radio", 2, None),
            noun("kettle", 2, None),
            noun("wagon", 2, None),
            noun("saw", 2, FOREST),
            noun("jeep", 2, DESERT),
            noun("bell", 2, SCHOOL),
        ],
        verbs: vec![
            verb("howls", 0),
            verb("digs", 0),
            verb("bites", 0),
            verb("climbs", 0),
            verb("speaks", 1),
            verb("prays", 1),
            verb("cooks", 1),
            verb("smiles", 1),
            verb("rings", 2),
            verb("rattles", 2),
            verb("glows", 2),
            verb("rolls", 2),
        ],
        locs: vec![
            ("hall", None),
            ("road", None),
            ("yard", None),
            ("wood", FOREST),
            ("cave", FOREST),
            ("dune", DESERT),
            ("oasis", DESERT),
            ("classroom", SCHOOL),
            ("library", SCHOOL),
        ],
        fixed: vec![],
        groups: vec!["creatures", "people", "machines"],
    }
}

/// A lexicon plus its held-out pairs.
#[derive(Clone, Debug)]
pub struct Grammar {
    pub lex: Lexicon,
    /// (noun index, verb index) pairs that never appear in training.
    pub heldout: Vec<(usize, usize)>,
    /// Verbs a noun may take in training (its group's verbs minus held-out).
    pub allowed: Vec<Vec<usize>>,
    /// All within-group pairs that are *not* held out.
    pub seen: Vec<(usize, usize)>,
}

impl Grammar {
    /// Held-out pairs follow a Latin-square pattern over a per-seed random
    /// ordering of each group's nouns and verbs: every noun loses exactly one
    /// of its group's four verbs, and every verb loses one or two of its
    /// group's six nouns.
    pub fn new(lex: Lexicon, rng: &mut Rng) -> Self {
        let mut heldout = Vec::new();
        let mut seen = Vec::new();
        let mut allowed = vec![Vec::new(); lex.nouns.len()];
        for g in 0..lex.groups.len() {
            let mut ns: Vec<usize> = (0..lex.nouns.len()).filter(|&n| lex.nouns[n].group == g).collect();
            let mut vs: Vec<usize> = (0..lex.verbs.len()).filter(|&v| lex.verbs[v].group == g).collect();
            rng.shuffle(&mut ns);
            rng.shuffle(&mut vs);
            let k = vs.len();
            for (i, &n) in ns.iter().enumerate() {
                for (j, &v) in vs.iter().enumerate() {
                    if (i + j) % k == 0 {
                        heldout.push((n, v));
                    } else {
                        seen.push((n, v));
                        allowed[n].push(v);
                    }
                }
            }
        }
        heldout.sort();
        seen.sort();
        for a in allowed.iter_mut() {
            a.sort();
        }
        Grammar { lex, heldout, allowed, seen }
    }
    pub fn is_heldout(&self, n: usize, v: usize) -> bool {
        self.heldout.contains(&(n, v))
    }
}

/// A text with one annotation byte per character (see `F_*`).
#[derive(Clone, Debug, Default)]
pub struct Text {
    pub bytes: Vec<u8>,
    pub flags: Vec<u8>,
}

impl Text {
    pub fn len(&self) -> usize {
        self.bytes.len()
    }
    pub fn is_empty(&self) -> bool {
        self.bytes.is_empty()
    }
    fn push_str(&mut self, s: &str, flag: u8) {
        for b in s.bytes() {
            self.bytes.push(b);
            self.flags.push(flag);
        }
    }
    fn push_word(&mut self, w: &str, role: Role) {
        let topic = matches!(role, Role::TopicAdj | Role::TopicNoun | Role::TopicLoc);
        let is_noun = matches!(role, Role::Noun | Role::TopicNoun);
        for (i, b) in w.bytes().enumerate() {
            let mut f = 0;
            if role == Role::Verb {
                f |= F_VERB;
                if i == 0 {
                    f |= F_VERB_FIRST;
                }
            }
            if topic {
                f |= F_TOPIC_WORD;
            }
            if is_noun {
                f |= F_NOUN;
            }
            self.bytes.push(b);
            self.flags.push(f);
        }
    }
    fn append(&mut self, other: &Text) {
        self.bytes.extend_from_slice(&other.bytes);
        self.flags.extend_from_slice(&other.flags);
    }
    pub fn as_str(&self) -> &str {
        std::str::from_utf8(&self.bytes).unwrap()
    }
}

/// One generated sentence.
#[derive(Clone, Debug)]
pub struct Sentence {
    pub text: Text,
    pub pair: Option<(usize, usize)>,
}

pub struct Gen<'a> {
    pub g: &'a Grammar,
    pub rng: Rng,
}

impl<'a> Gen<'a> {
    pub fn new(g: &'a Grammar, rng: Rng) -> Self {
        Gen { g, rng }
    }

    fn adj(&mut self, topic: Option<usize>, t: &mut Text) {
        let lex = &self.g.lex;
        match topic {
            Some(tp) if self.rng.chance(0.5) => {
                let w = *self.rng.pick(&lex.topic_adjs[tp]);
                t.push_word(w, Role::TopicAdj);
            }
            _ => {
                let w = *self.rng.pick(&lex.adjs);
                t.push_word(w, Role::Adj);
            }
        }
        t.push_str(" ", 0);
    }

    pub fn pick_noun(&mut self, topic: Option<usize>) -> usize {
        let lex = &self.g.lex;
        let cands: Vec<usize> = match topic {
            Some(tp) => {
                if self.rng.chance(0.6) {
                    (0..lex.nouns.len()).filter(|&n| lex.nouns[n].topic == Some(tp)).collect()
                } else {
                    (0..lex.nouns.len()).filter(|&n| lex.nouns[n].topic.is_none()).collect()
                }
            }
            None => (0..lex.nouns.len()).collect(),
        };
        *self.rng.pick(&cands)
    }

    /// A grammatical sentence. If `pair` is given, that noun–verb pair is used.
    pub fn sentence(&mut self, topic: Option<usize>, pair: Option<(usize, usize)>) -> Sentence {
        let g = self.g;
        let lex = &g.lex;
        let mut t = Text::default();
        let det = *self.rng.pick(&lex.dets);
        t.push_word(det, Role::Det);
        t.push_str(" ", 0);
        if self.rng.chance(0.4) {
            self.adj(topic, &mut t);
        }
        let (n, v) = match pair {
            Some(p) => p,
            None => {
                let n = self.pick_noun(topic);
                let v = *self.rng.pick(&g.allowed[n]);
                (n, v)
            }
        };
        let nrole = if lex.nouns[n].topic.is_some() { Role::TopicNoun } else { Role::Noun };
        t.push_word(lex.nouns[n].word, nrole);
        t.push_str(" ", 0);
        t.push_word(lex.verbs[v].word, Role::Verb);
        if self.rng.chance(0.5) {
            t.push_str(" ", 0);
            let p = *self.rng.pick(&lex.preps);
            t.push_word(p, Role::Prep);
            t.push_str(" ", 0);
            let d = *self.rng.pick(&lex.dets);
            t.push_word(d, Role::Det);
            t.push_str(" ", 0);
            if self.rng.chance(0.25) {
                self.adj(topic, &mut t);
            }
            let locs: Vec<usize> = match topic {
                Some(tp) if self.rng.chance(0.7) => {
                    (0..lex.locs.len()).filter(|&l| lex.locs[l].1 == Some(tp)).collect()
                }
                Some(_) => (0..lex.locs.len()).filter(|&l| lex.locs[l].1.is_none()).collect(),
                None => (0..lex.locs.len()).collect(),
            };
            let l = *self.rng.pick(&locs);
            let role = if lex.locs[l].1.is_some() { Role::TopicLoc } else { Role::Loc };
            t.push_word(lex.locs[l].0, role);
        }
        t.push_str(".", 0);
        Sentence { text: t, pair: Some((n, v)) }
    }

    pub fn fixed(&mut self) -> Sentence {
        let s = *self.rng.pick(&self.g.lex.fixed);
        let mut t = Text::default();
        t.push_str(s, 0);
        Sentence { text: t, pair: None }
    }
}

/// A topic block in the training stream.
#[derive(Clone, Debug)]
pub struct Block {
    pub start: usize,
    pub len: usize,
    pub topic: usize,
}

/// A stream of topic blocks, as used for training.
pub struct Stream {
    pub text: Text,
    pub blocks: Vec<Block>,
    /// (start, len) of every sentence, with whether it is a fixed sentence.
    pub sentences: Vec<(usize, usize, bool)>,
    pub fixed_count: usize,
}

pub fn stream(g: &Grammar, rng: Rng, target_len: usize) -> Stream {
    let mut gen = Gen::new(g, rng);
    let ntopics = g.lex.topic_names.len();
    let mut text = Text::default();
    let mut blocks = Vec::new();
    let mut sentences = Vec::new();
    let mut fixed_count = 0;
    let mut topic = gen.rng.below(ntopics);
    while text.len() < target_len {
        let start = text.len();
        let target = BLOCK_MIN + gen.rng.below(BLOCK_MAX - BLOCK_MIN + 1);
        let mut first = true;
        while text.len() - start < target {
            if !first {
                text.push_str(" ", 0);
            }
            first = false;
            let fixed = !g.lex.fixed.is_empty() && gen.rng.chance(FIXED_PROB);
            let s = if fixed { gen.fixed() } else { gen.sentence(Some(topic), None) };
            if fixed {
                fixed_count += 1;
            }
            sentences.push((text.len(), s.text.len(), fixed));
            text.append(&s.text);
        }
        text.push_str("\n", 0);
        blocks.push(Block { start, len: text.len() - start, topic });
        // Always change topic between blocks.
        let next = gen.rng.below(ntopics - 1);
        topic = if next >= topic { next + 1 } else { next };
    }
    Stream { text, blocks, sentences, fixed_count }
}

/// Sentences joined by spaces, topic per sentence chosen by `topic_of`.
fn sentence_text(
    gen: &mut Gen,
    n: usize,
    mut make: impl FnMut(&mut Gen) -> Sentence,
) -> Text {
    let mut t = Text::default();
    for i in 0..n {
        if i > 0 {
            t.push_str(" ", 0);
        }
        let s = make(gen);
        t.append(&s.text);
    }
    t.push_str("\n", 0);
    t
}

/// A corrupted text and the positions to score as "following a corruption".
#[derive(Clone, Debug)]
pub struct Noisy {
    pub rate: f64,
    pub text: Text,
    /// true for the 10 characters following each corruption site.
    pub after: Vec<bool>,
    pub corruptions: usize,
}

pub const NOISE_WINDOW: usize = 10;

/// Corrupt `clean` at `rate`: at each character, with probability `rate`,
/// insert a random character before it, drop it, or swap it with the next.
pub fn corrupt(clean: &Text, rate: f64, rng: &mut Rng) -> Noisy {
    let src = &clean.bytes;
    let mut out: Vec<u8> = Vec::with_capacity(src.len() + 16);
    let mut ends: Vec<usize> = Vec::new(); // last output index touched by each corruption
    let mut i = 0;
    let mut corruptions = 0;
    let noise_chars = &ALPHABET[..27]; // letters and space
    while i < src.len() {
        let last = i + 1 == src.len();
        if !last && src[i] != b'\n' && rng.chance(rate) {
            corruptions += 1;
            match rng.below(3) {
                0 => {
                    out.push(*rng.pick(noise_chars));
                    ends.push(out.len() - 1);
                    out.push(src[i]);
                    i += 1;
                }
                1 => {
                    // drop src[i]; the corruption "ends" at the previous output char
                    ends.push(out.len().wrapping_sub(1));
                    i += 1;
                }
                _ => {
                    if src[i + 1] == b'\n' {
                        out.push(src[i]);
                        ends.push(out.len() - 1);
                        i += 1;
                    } else {
                        out.push(src[i + 1]);
                        out.push(src[i]);
                        ends.push(out.len() - 1);
                        i += 2;
                    }
                }
            }
        } else {
            out.push(src[i]);
            i += 1;
        }
    }
    let mut after = vec![false; out.len()];
    for e in ends {
        let s = e.wrapping_add(1);
        for k in s..(s + NOISE_WINDOW).min(out.len()) {
            after[k] = true;
        }
    }
    let flags = vec![0; out.len()];
    Noisy { rate, text: Text { bytes: out, flags }, after, corruptions }
}

// ---------------------------------------------------------------------------
// Test 9: corruption shapes no model was told about
// ---------------------------------------------------------------------------

/// The corruption kinds of test 9. None of them is test 4's insert / drop /
/// adjacent swap.
pub const UNSEEN_KINDS: [&str; 4] = ["double", "transpose2", "burst", "boundary"];

/// A text corrupted with the unseen kinds.
#[derive(Clone, Debug)]
pub struct NoisyUnseen {
    pub rate: f64,
    pub text: Text,
    /// 0 = not scored as recovery; k + 1 = within the 10 characters after a
    /// corruption of kind `UNSEEN_KINDS[k]`.
    pub after_kind: Vec<u8>,
    /// Corruptions applied, per kind.
    pub counts: [usize; 4],
}

/// Corrupt `clean` at `rate`: at each character (not a newline, not the last),
/// with probability `rate`, apply one of four kinds chosen uniformly:
///
/// * **double**: the character is written twice (`cat` → `caat`).
/// * **transpose2**: the character and the one two places on are exchanged
///   (`abc` → `cba`).
/// * **burst**: 2–3 random letters or spaces are inserted before it.
/// * **boundary**: the next word boundary (a space between two letters, within
///   12 characters) moves one place left or right (`the cat` → `th ecat` /
///   `thec at`).
///
/// Where transpose2 or boundary cannot apply (end of line, no change, no
/// boundary near), the character is doubled instead.
pub fn corrupt_unseen(clean: &Text, rate: f64, rng: &mut Rng) -> NoisyUnseen {
    let src = &clean.bytes;
    let n = src.len();
    let letter = |b: u8| b.is_ascii_lowercase();
    let mut out: Vec<u8> = Vec::with_capacity(n + 64);
    let mut ends: Vec<(usize, u8)> = Vec::new();
    let mut counts = [0usize; 4];
    let noise_chars = &ALPHABET[..27];
    let mut i = 0;
    while i < n {
        let last = i + 1 == n;
        if last || src[i] == b'\n' || !rng.chance(rate) {
            out.push(src[i]);
            i += 1;
            continue;
        }
        let mut kind = rng.below(4);
        let boundary_at = if kind == 3 {
            // A space with letters on both sides, at least one character on.
            (i + 1..(i + 12).min(n - 1))
                .take_while(|&j| src[j] != b'\n')
                .find(|&j| src[j] == b' ' && letter(src[j - 1]) && letter(src[j + 1]))
        } else {
            None
        };
        if kind == 1 && !(i + 2 < n && src[i + 1] != b'\n' && src[i + 2] != b'\n' && src[i] != src[i + 2]) {
            kind = 0;
        }
        if kind == 3 && boundary_at.is_none() {
            kind = 0;
        }
        match kind {
            0 => {
                out.push(src[i]);
                out.push(src[i]);
                i += 1;
            }
            1 => {
                out.push(src[i + 2]);
                out.push(src[i + 1]);
                out.push(src[i]);
                i += 3;
            }
            2 => {
                for _ in 0..2 + rng.below(2) {
                    out.push(*rng.pick(noise_chars));
                }
                // The original character follows; it is the first "after" one.
                ends.push((out.len() - 1, 2));
                counts[2] += 1;
                out.push(src[i]);
                i += 1;
                continue;
            }
            _ => {
                let j = boundary_at.unwrap();
                out.extend_from_slice(&src[i..j - 1]);
                if rng.chance(0.5) {
                    // left: "the cat" -> "th ecat"
                    out.push(b' ');
                    out.push(src[j - 1]);
                    i = j + 1;
                } else {
                    // right: "the cat" -> "thec at"
                    out.push(src[j - 1]);
                    out.push(src[j + 1]);
                    out.push(b' ');
                    i = j + 2;
                }
            }
        }
        ends.push((out.len() - 1, kind as u8));
        counts[kind] += 1;
    }
    let mut after_kind = vec![0u8; out.len()];
    for (e, k) in ends {
        for x in e + 1..(e + 1 + NOISE_WINDOW).min(out.len()) {
            after_kind[x] = k + 1;
        }
    }
    let flags = vec![0; out.len()];
    NoisyUnseen { rate, text: Text { bytes: out, flags }, after_kind, counts }
}

// ---------------------------------------------------------------------------
// Test 10: context conflict
// ---------------------------------------------------------------------------

pub const CONFLICT_LEARN_LEN: usize = 20_000;
pub const CONFLICT_EVAL_LEN: usize = 6_000;
/// Characters of a context cue.
pub const F_CUE: u8 = 16;
/// Characters of a context-dependent completion.
pub const F_CONFLICT: u8 = 32;
/// First character of a context-dependent completion.
pub const F_CONFLICT_FIRST: u8 = 64;

/// A context pair: two cues, and sentence frames whose completion depends on
/// which cue opened the paragraph. Completions of a frame differ from their
/// first character.
pub struct ConflictFamily {
    pub cues: [&'static str; 2],
    pub frames: &'static [(&'static str, [&'static str; 2])],
}

pub const CONFLICT_FAMILIES: &[ConflictFamily] = &[
    ConflictFamily {
        cues: ["in the morning", "in the evening"],
        frames: &[("the sky was ", ["blue", "red"]), ("the birds were ", ["singing", "quiet"])],
    },
    ConflictFamily {
        cues: ["at the shop", "at the farm"],
        frames: &[("she ", ["bought bread", "fed the cows"]), ("the man was ", ["paying", "digging"])],
    },
    ConflictFamily {
        cues: ["in the summer", "in the winter"],
        frames: &[("the lake was ", ["warm", "frozen"]), ("the children wore ", ["shorts", "gloves"])],
    },
    ConflictFamily {
        cues: ["the team won", "the team lost"],
        frames: &[("the fans ", ["cheered", "wept"]), ("the coach was ", ["proud", "angry"])],
    },
    ConflictFamily {
        cues: ["on the boat", "on the train"],
        frames: &[("he looked at the ", ["waves", "tracks"]), ("the floor was ", ["wet", "dusty"])],
    },
];

pub struct ConflictStream {
    pub text: Text,
    /// Split point for the quiet period: just after the first paragraph that
    /// ends at or after the midpoint.
    pub half: usize,
    pub paragraphs: usize,
    pub conflicts: usize,
    /// Smallest distance from the last cue character to a conflict character.
    pub min_cue_distance: usize,
    /// Weighted mean entropy (bits) of the context side given the 8 characters
    /// before each conflict, over 8-character contexts seen at least 10 times.
    /// About 1 means order-8 counting cannot see the cue.
    pub ctx8_side_entropy: f64,
}

/// Paragraphs, each opened by one cue of one family and containing one or both
/// of that family's frames, completed according to the cue. Every frame is
/// preceded by at least one neutral filler sentence from the main grammar, so
/// nothing within 8 characters of a completion depends on the cue.
pub fn conflict_stream(g: &Grammar, rng: Rng, target_len: usize) -> ConflictStream {
    let mut gen = Gen::new(g, rng);
    let mut text = Text::default();
    let mut paragraphs = 0;
    let mut conflicts = 0;
    let mut min_cue_distance = usize::MAX;
    let mut half = 0;
    // (8-char context, side) for every conflict.
    let mut ctx: BTreeMap<Vec<u8>, [usize; 2]> = BTreeMap::new();
    while text.len() < target_len {
        let fam = &CONFLICT_FAMILIES[gen.rng.below(CONFLICT_FAMILIES.len())];
        let side = gen.rng.below(2);
        text.push_str(fam.cues[side], F_CUE);
        text.push_str(".", 0);
        let cue_end = text.len() - 2;
        let mut order: Vec<usize> = (0..fam.frames.len()).collect();
        gen.rng.shuffle(&mut order);
        let mut used = 0;
        for (k, &fi) in order.iter().enumerate() {
            if k > 0 && !gen.rng.chance(0.7) {
                continue;
            }
            for _ in 0..1 + gen.rng.below(2) {
                text.push_str(" ", 0);
                let s = gen.sentence(None, None);
                text.append(&s.text);
            }
            let (prefix, comps) = fam.frames[fi];
            text.push_str(" ", 0);
            text.push_str(prefix, 0);
            let at = text.len();
            min_cue_distance = min_cue_distance.min(at - cue_end);
            let c0 = text.bytes[at - 8..at].to_vec();
            ctx.entry(c0).or_insert([0, 0])[side] += 1;
            for (j, b) in comps[side].bytes().enumerate() {
                text.bytes.push(b);
                text.flags.push(F_CONFLICT | if j == 0 { F_CONFLICT_FIRST } else { 0 });
            }
            text.push_str(".", 0);
            used += 1;
        }
        conflicts += used;
        if gen.rng.chance(0.5) {
            text.push_str(" ", 0);
            let s = gen.sentence(None, None);
            text.append(&s.text);
        }
        text.push_str("\n", 0);
        paragraphs += 1;
        if half == 0 && text.len() >= target_len / 2 {
            half = text.len();
        }
    }
    let (mut hs, mut hn) = (0.0, 0usize);
    for c in ctx.values() {
        let n = c[0] + c[1];
        if n >= 10 {
            let h = |p: f64| if p <= 0.0 { 0.0 } else { -p * p.log2() };
            let p = c[0] as f64 / n as f64;
            hs += n as f64 * (h(p) + h(1.0 - p));
            hn += n;
        }
    }
    let ctx8_side_entropy = if hn == 0 { f64::NAN } else { hs / hn as f64 };
    ConflictStream { text, half, paragraphs, conflicts, min_cue_distance, ctx8_side_entropy }
}

/// A pronounceable nonce word that is not in the lexicon.
fn nonce(rng: &mut Rng, known: &[&str]) -> String {
    const C: &[u8] = b"bdfgklmnprstvz";
    const V: &[u8] = b"aeiou";
    loop {
        let syll = 1 + rng.below(2);
        let mut w = String::new();
        for _ in 0..syll {
            w.push(*rng.pick(C) as char);
            w.push(*rng.pick(V) as char);
            if rng.chance(0.5) {
                w.push(*rng.pick(C) as char);
            }
        }
        if w.len() >= 3 && !known.contains(&w.as_str()) {
            return w;
        }
    }
}

/// Everything the tests need for one seed.
pub struct Corpus {
    pub seed: u64,
    pub grammar: Grammar,
    pub train: Stream,
    /// Test 2: sentences whose noun–verb pair is held out.
    pub heldout_eval: Text,
    /// Test 2 control: same construction, pairs seen in training.
    pub control_eval: Text,
    /// Test 4.
    pub noise_clean: Text,
    pub noisy: Vec<Noisy>,
    /// Test 6: (set name, text).
    pub confusion: Vec<(&'static str, Text)>,
    /// Test 5.
    pub grammar_b: Grammar,
    pub forget_a: Text,
    pub forget_b: Text,
    pub forget_a_test: Text,
    /// Test 9: the test-4 clean text corrupted with unseen kinds at 5% and 10%.
    pub noisy_unseen: Vec<NoisyUnseen>,
    /// Test 10: learning stream and held-out scoring stream.
    pub conflict_learn: ConflictStream,
    pub conflict_eval: ConflictStream,
}

impl Corpus {
    pub fn new(seed: u64) -> Self {
        let grammar = Grammar::new(lexicon_a(), &mut Rng::derived(seed, "heldout"));
        let train = stream(&grammar, Rng::derived(seed, "train"), TRAIN_LEN);
        let ntopics = grammar.lex.topic_names.len();

        // Test 2: held-out pairs and matched control, topic = noun's topic or random.
        let mut gen = Gen::new(&grammar, Rng::derived(seed, "composition"));
        let heldout = grammar.heldout.clone();
        let heldout_eval = sentence_text(&mut gen, EVAL_SENTENCES, |gn| {
            let p = *gn.rng.pick(&heldout);
            let t = gn.g.lex.nouns[p.0].topic.unwrap_or_else(|| gn.rng.below(ntopics));
            gn.sentence(Some(t), Some(p))
        });
        let seen = grammar.seen.clone();
        let control_eval = sentence_text(&mut gen, EVAL_SENTENCES, |gn| {
            let p = *gn.rng.pick(&seen);
            let t = gn.g.lex.nouns[p.0].topic.unwrap_or_else(|| gn.rng.below(ntopics));
            gn.sentence(Some(t), Some(p))
        });

        // Test 4: fresh training-distribution text, in short topic runs.
        let mut gen = Gen::new(&grammar, Rng::derived(seed, "noise"));
        let mut topic = 0;
        let mut k = 0;
        let noise_clean = sentence_text(&mut gen, NOISE_SENTENCES, |gn| {
            if k % 10 == 0 {
                topic = gn.rng.below(ntopics);
            }
            k += 1;
            gn.sentence(Some(topic), None)
        });
        let mut nrng = Rng::derived(seed, "corrupt");
        let noisy = vec![corrupt(&noise_clean, 0.05, &mut nrng), corrupt(&noise_clean, 0.10, &mut nrng)];

        // Test 6: confusion sets.
        let confusion = confusion_sets(seed, &grammar, &train);

        // Test 5: forgetting.
        let grammar_b = Grammar::new(lexicon_b(), &mut Rng::derived(seed, "heldout-b"));
        let forget_a = stream(&grammar, Rng::derived(seed, "forget-a"), FORGET_A_LEN).text;
        let forget_b = stream(&grammar_b, Rng::derived(seed, "forget-b"), FORGET_B_LEN).text;
        let forget_a_test = stream(&grammar, Rng::derived(seed, "forget-a-test"), FORGET_A_TEST_LEN).text;

        // Test 9: unseen corruption shapes on test 4's clean text. A separate
        // derived stream, so nothing above changes.
        let mut urng = Rng::derived(seed, "corrupt-unseen");
        let noisy_unseen =
            vec![corrupt_unseen(&noise_clean, 0.05, &mut urng), corrupt_unseen(&noise_clean, 0.10, &mut urng)];

        // Test 10: context conflict.
        let conflict_learn = conflict_stream(&grammar, Rng::derived(seed, "conflict-learn"), CONFLICT_LEARN_LEN);
        let conflict_eval = conflict_stream(&grammar, Rng::derived(seed, "conflict-eval"), CONFLICT_EVAL_LEN);

        Corpus {
            seed,
            grammar,
            train,
            heldout_eval,
            control_eval,
            noise_clean,
            noisy,
            confusion,
            grammar_b,
            forget_a,
            forget_b,
            forget_a_test,
            noisy_unseen,
            conflict_learn,
            conflict_eval,
        }
    }
}

fn confusion_sets(seed: u64, g: &Grammar, train: &Stream) -> Vec<(&'static str, Text)> {
    let mut rng = Rng::derived(seed, "confusion");
    let n = CONFUSION_SENTENCES;
    let join = |sents: Vec<String>| -> Text {
        let mut t = Text::default();
        t.push_str(&sents.join(" "), 0);
        t.push_str("\n", 0);
        t
    };

    // Familiar: sentences taken verbatim from the training stream.
    let tb = &train.text.bytes;
    let fam: Vec<String> = (0..n)
        .map(|_| {
            let (s, l, _) = *rng.pick(&train.sentences);
            String::from_utf8(tb[s..s + l].to_vec()).unwrap()
        })
        .collect();

    // Held-out pairs: grammatical, novel noun-verb combinations of known words.
    let mut gen = Gen::new(g, Rng::derived(seed, "confusion-heldout"));
    let ntopics = g.lex.topic_names.len();
    let held: Vec<String> = (0..n)
        .map(|_| {
            let p = *gen.rng.pick(&g.heldout);
            let t = g.lex.nouns[p.0].topic.unwrap_or_else(|| gen.rng.below(ntopics));
            gen.sentence(Some(t), Some(p)).text.as_str().to_string()
        })
        .collect();

    // Word salad: known words in random order (a training sentence, shuffled).
    let salad: Vec<String> = (0..n)
        .map(|_| {
            let (s, l, _) = *rng.pick(&train.sentences);
            let sent = std::str::from_utf8(&tb[s..s + l - 1]).unwrap();
            let mut words: Vec<&str> = sent.split(' ').collect();
            rng.shuffle(&mut words);
            format!("{}.", words.join(" "))
        })
        .collect();

    // Unseen words: grammatical shape, nonce content words.
    let known = g.lex.words();
    let unseen: Vec<String> = (0..n)
        .map(|_| {
            let det = *rng.pick(&g.lex.dets);
            let mut s = format!("{} ", det);
            if rng.chance(0.4) {
                s.push_str(&nonce(&mut rng, &known));
                s.push(' ');
            }
            s.push_str(&nonce(&mut rng, &known));
            s.push(' ');
            s.push_str(&nonce(&mut rng, &known));
            if rng.chance(0.5) {
                s.push_str(&format!(" {} {} ", rng.pick(&g.lex.preps), rng.pick(&g.lex.dets)));
                s.push_str(&nonce(&mut rng, &known));
            }
            s.push('.');
            s
        })
        .collect();

    // Random letters: same total length as the familiar set, letters and spaces.
    let fam_text = join(fam.clone());
    let mut rnd = Text::default();
    for _ in 0..fam_text.len() - 1 {
        rnd.bytes.push(*rng.pick(&ALPHABET[..27]));
        rnd.flags.push(0);
    }
    rnd.push_str("\n", 0);

    vec![
        ("familiar", fam_text),
        ("heldout_pairs", join(held)),
        ("word_salad", join(salad)),
        ("unseen_words", join(unseen)),
        ("random_letters", rnd),
    ]
}

// ---------------------------------------------------------------------------
// Statistics and verification
// ---------------------------------------------------------------------------

fn words_of(bytes: &[u8]) -> Vec<&str> {
    std::str::from_utf8(bytes)
        .unwrap()
        .split(|c: char| c == ' ' || c == '.' || c == '\n')
        .filter(|w| !w.is_empty())
        .collect()
}

/// Count every adjacent (word, next word) pair in a text.
fn bigram_counts(bytes: &[u8]) -> BTreeMap<(String, String), usize> {
    let w = words_of(bytes);
    let mut m = BTreeMap::new();
    for i in 1..w.len() {
        *m.entry((w[i - 1].to_string(), w[i].to_string())).or_insert(0) += 1;
    }
    m
}

#[derive(Clone, Debug)]
pub struct CorpusStats {
    pub seed: u64,
    pub train_len: usize,
    pub alphabet_used: usize,
    pub vocabulary_in_train: usize,
    pub lexicon_words: usize,
    pub nouns: usize,
    pub verbs: usize,
    pub noun_verb_pairs: usize,
    pub heldout_pairs: usize,
    pub heldout_list: Vec<String>,
    /// Occurrences of held-out pairs in the training stream (must be 0).
    pub heldout_in_train: usize,
    /// Occurrences of held-out pairs in the test-5 A streams (must be 0).
    pub heldout_in_forget_a: usize,
    pub min_noun_count: usize,
    pub min_verb_count: usize,
    pub min_seen_pair_count: usize,
    pub max_seen_pair_count: usize,
    pub min_heldout_noun_count: usize,
    pub min_heldout_verb_count: usize,
    pub heldout_eval_ok: bool,
    pub control_eval_ok: bool,
    pub blocks: usize,
    pub topic_blocks: Vec<(String, usize)>,
    pub mean_block_len: f64,
    pub fixed_sentences: usize,
    pub sentences: usize,
    pub topic_word_chars: usize,
    pub heldout_eval_len: usize,
    pub heldout_verb_chars: usize,
    pub noise: Vec<(f64, usize, usize)>,
    pub forget_lens: (usize, usize, usize),
    pub forget_ab_shared_words: Vec<String>,
    /// Test 9: (rate, len, corruptions per kind).
    pub noise_unseen: Vec<(f64, usize, [usize; 4])>,
    /// Test 10: (stream, chars, paragraphs, conflicts, conflict chars,
    /// min cue distance, order-8 side entropy).
    pub conflict: Vec<(&'static str, usize, usize, usize, usize, usize, f64)>,
}

impl CorpusStats {
    pub fn all_checks_pass(&self) -> bool {
        self.heldout_in_train == 0
            && self.heldout_in_forget_a == 0
            && self.heldout_eval_ok
            && self.control_eval_ok
            && self.min_heldout_noun_count >= 20
            && self.min_heldout_verb_count >= 20
            && self.conflict.iter().all(|c| c.5 > 8)
            && self.conflict.iter().filter(|c| c.0 == "learn").all(|c| c.6 > 0.9)
    }
}

pub fn stats(c: &Corpus) -> CorpusStats {
    let g = &c.grammar;
    let lex = &g.lex;
    let tb = &c.train.text.bytes;
    let mut used = [false; 256];
    for &b in tb {
        used[b as usize] = true;
    }
    let words = words_of(tb);
    let mut vocab: Vec<&str> = words.clone();
    vocab.sort();
    vocab.dedup();
    let mut wc: BTreeMap<&str, usize> = BTreeMap::new();
    for w in &words {
        *wc.entry(w).or_insert(0) += 1;
    }
    let bg = bigram_counts(tb);
    let pair_count = |n: usize, v: usize, m: &BTreeMap<(String, String), usize>| -> usize {
        *m.get(&(lex.nouns[n].word.to_string(), lex.verbs[v].word.to_string())).unwrap_or(&0)
    };
    // Every noun–verb pair the lexicon allows (within or across groups).
    let all_pairs: Vec<(usize, usize)> =
        (0..lex.nouns.len()).flat_map(|n| (0..lex.verbs.len()).map(move |v| (n, v))).collect();
    let heldout_in_train: usize = g.heldout.iter().map(|&(n, v)| pair_count(n, v, &bg)).sum();
    let bga = bigram_counts(&c.forget_a.bytes);
    let bgat = bigram_counts(&c.forget_a_test.bytes);
    let heldout_in_forget_a: usize = g
        .heldout
        .iter()
        .map(|&(n, v)| pair_count(n, v, &bga) + pair_count(n, v, &bgat))
        .sum();
    let seen_counts: Vec<usize> = g.seen.iter().map(|&(n, v)| pair_count(n, v, &bg)).collect();
    let cross_group: usize = all_pairs
        .iter()
        .filter(|&&(n, v)| lex.nouns[n].group != lex.verbs[v].group)
        .map(|&(n, v)| pair_count(n, v, &bg))
        .sum();
    assert_eq!(cross_group, 0, "a noun appeared with another group's verb");
    let cnt = |w: &str| *wc.get(w).unwrap_or(&0);
    let ho_nouns: Vec<usize> = g.heldout.iter().map(|p| p.0).collect();
    let ho_verbs: Vec<usize> = g.heldout.iter().map(|p| p.1).collect();

    // Eval sets: held-out set must contain only held-out pairs, control only seen.
    let check = |t: &Text, want_heldout: bool| -> bool {
        let m = bigram_counts(&t.bytes);
        let mut any = false;
        for &(n, v) in &all_pairs {
            let k = pair_count(n, v, &m);
            if k > 0 {
                any = true;
                if g.is_heldout(n, v) != want_heldout {
                    return false;
                }
            }
        }
        any
    };

    let ntopics = lex.topic_names.len();
    let topic_blocks = (0..ntopics)
        .map(|t| {
            (lex.topic_names[t].to_string(), c.train.blocks.iter().filter(|b| b.topic == t).count())
        })
        .collect();
    let a_words = lex.words();
    let b_words = c.grammar_b.lex.words();
    let shared: Vec<String> =
        a_words.iter().filter(|w| b_words.contains(w)).map(|w| w.to_string()).collect();

    CorpusStats {
        seed: c.seed,
        train_len: tb.len(),
        alphabet_used: used.iter().filter(|&&u| u).count(),
        vocabulary_in_train: vocab.len(),
        lexicon_words: a_words.len(),
        nouns: lex.nouns.len(),
        verbs: lex.verbs.len(),
        noun_verb_pairs: g.heldout.len() + g.seen.len(),
        heldout_pairs: g.heldout.len(),
        heldout_list: g
            .heldout
            .iter()
            .map(|&(n, v)| format!("{} {}", lex.nouns[n].word, lex.verbs[v].word))
            .collect(),
        heldout_in_train,
        heldout_in_forget_a,
        min_noun_count: lex.nouns.iter().map(|n| cnt(n.word)).min().unwrap(),
        min_verb_count: lex.verbs.iter().map(|v| cnt(v.word)).min().unwrap(),
        min_seen_pair_count: *seen_counts.iter().min().unwrap(),
        max_seen_pair_count: *seen_counts.iter().max().unwrap(),
        min_heldout_noun_count: ho_nouns.iter().map(|&n| cnt(lex.nouns[n].word)).min().unwrap(),
        min_heldout_verb_count: ho_verbs.iter().map(|&v| cnt(lex.verbs[v].word)).min().unwrap(),
        heldout_eval_ok: check(&c.heldout_eval, true),
        control_eval_ok: check(&c.control_eval, false),
        blocks: c.train.blocks.len(),
        topic_blocks,
        mean_block_len: c.train.blocks.iter().map(|b| b.len).sum::<usize>() as f64
            / c.train.blocks.len() as f64,
        fixed_sentences: c.train.fixed_count,
        sentences: c.train.sentences.len(),
        topic_word_chars: c.train.text.flags.iter().filter(|&&f| f & F_TOPIC_WORD != 0).count(),
        heldout_eval_len: c.heldout_eval.len(),
        heldout_verb_chars: c.heldout_eval.flags.iter().filter(|&&f| f & F_VERB != 0).count(),
        noise: c.noisy.iter().map(|n| (n.rate, n.text.len(), n.corruptions)).collect(),
        forget_lens: (c.forget_a.len(), c.forget_b.len(), c.forget_a_test.len()),
        forget_ab_shared_words: shared,
        noise_unseen: c.noisy_unseen.iter().map(|n| (n.rate, n.text.len(), n.counts)).collect(),
        conflict: [("learn", &c.conflict_learn), ("eval", &c.conflict_eval)]
            .iter()
            .map(|(k, s)| {
                (
                    *k,
                    s.text.len(),
                    s.paragraphs,
                    s.conflicts,
                    s.text.flags.iter().filter(|&&f| f & F_CONFLICT != 0).count(),
                    s.min_cue_distance,
                    s.ctx8_side_entropy,
                )
            })
            .collect(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn corpus_is_deterministic_and_verified() {
        for seed in 1..=3 {
            let a = Corpus::new(seed);
            let b = Corpus::new(seed);
            assert_eq!(a.train.text.bytes, b.train.text.bytes);
            let s = stats(&a);
            assert!(s.all_checks_pass(), "{:?}", s);
            assert_eq!(s.heldout_pairs * 4, s.noun_verb_pairs);
            for &ch in &a.train.text.bytes {
                hsm_core::sym(ch);
            }
        }
    }

    #[test]
    fn unseen_noise_and_conflict_streams() {
        for seed in 1..=3 {
            let c = Corpus::new(seed);
            for nz in &c.noisy_unseen {
                assert!(nz.counts.iter().all(|&k| k > 10), "{:?}", nz.counts);
                assert_eq!(nz.text.len(), nz.after_kind.len());
                // Newlines are never moved or removed.
                let nl = |b: &[u8]| b.iter().filter(|&&x| x == b'\n').count();
                assert_eq!(nl(&nz.text.bytes), nl(&c.noise_clean.bytes));
            }
            for s in [&c.conflict_learn, &c.conflict_eval] {
                assert!(s.min_cue_distance > 8);
                assert!(s.half > 0 && s.text.bytes[s.half - 1] == b'\n');
                for &b in &s.text.bytes {
                    hsm_core::sym(b);
                }
            }
        }
    }

    #[test]
    fn lexicons_disjoint_content() {
        let a = lexicon_a().words();
        let b = lexicon_b().words();
        let shared: Vec<_> = a.iter().filter(|w| b.contains(w)).collect();
        // only function words are shared
        for w in shared {
            assert!(["the", "a", "my", "in", "on", "near", "by", "under"].contains(w), "{}", w);
        }
    }
}
