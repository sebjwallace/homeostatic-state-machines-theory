//! m004-held-state: held state and resolvable heat.
//!
//! The automaton is an estate of state machines that each *hold* a state:
//!
//! * **Fast machines** (character rate). A state is a context node: "the last
//!   d characters were ...", d = 0..=D, optionally keyed also by the held state
//!   of the slow topic machine. A state's outgoing transitions carry counts.
//!   The prediction is read off the chain of active states, each blended over
//!   the one below it. **This blending is Witten–Bell interpolation over
//!   transition counts: it is counting-equivalent, and declared as such.**
//! * **Slow topic machine** (word rate). K held states. It transitions only when
//!   evidence (leaky accumulated pressure from completed words) has built up
//!   past a threshold; otherwise it keeps its state indefinitely. Its held
//!   state is an input to fast machines (topic-keyed context nodes).
//! * **Slow noise machine**. Holds an estimate of how corrupted the input is.
//! * **Held fast hypotheses**. The fast machine does not collapse on a misfit
//!   character: it holds a few alternative states (the char was inserted, a
//!   char was dropped, two chars were swapped) and rejoins whichever fits.
//!
//! Resolvable vs irreducible heat: a new node is first a *shadow* (a young
//! connection that learns but is not used for prediction). It is switched on
//! only when the misfit it would have removed (accumulated prequential bits
//! saved over its parent) passes a threshold. With the tuned values this gate
//! is 0 bits for plain context nodes and 5 bits for nodes keyed by the topic
//! machine's held state, so in practice the gate guards the held-state-keyed
//! structure: misfit that the held state does not explain never switches on.
//!
//! Freezing lives on nodes (a node is the bundle of one state's outgoing
//! connections). A node's heat is a running mean of its excess misfit
//! (surprisal minus its own entropy). When that has cooled below a threshold
//! after enough visits, the node freezes: its counts stop changing and it can
//! no longer be melted. Capacity is a hard limit on nodes; when full, an
//! unfrozen node (shadows first, then least recently used) melts, i.e. is
//! evicted and its slot reused. With freezing off nothing is ever frozen.
//!
//! Counting-equivalent parts (declared): (1) blending a chain of context nodes
//! is Witten–Bell interpolation over transition counts; (2) the topic machine's
//! word fit is additive smoothing backed off to a global word count; (3) the
//! corruption channel mixes in eps/A uniform mass, which acts as a smoothing
//! floor. See FINDINGS.md.
//!
//! Parameters are fixed constants; `par()` lets an environment variable
//! override them, used only for tuning on seed 1.

use hsm_core::{sym, Automaton, FastMap, Rng, A};

/// Maximum context depth of fast machines.
const D: usize = 6;
/// History kept per hypothesis.
const HL: usize = 8;
/// Maximum number of held fast hypotheses.
const NH: usize = 6;
/// Slow topic machine: maximum number of states.
const KMAX: usize = 8;
const NONE: u8 = 255;

// ---- parameters (tuned on seed 1 only) ----
/// Bits a shadow node must save before it is switched on.
fn activate_bits() -> f32 { par("ACTIVATE_BITS", 0.0) as f32 }
/// Local surprisal (bits) needed at a parent before a child shadow is recruited.
fn spawn_bits() -> f64 { par("SPAWN_BITS", 0.0) as f64 }
/// Heat (excess surprisal, running mean) below which a node freezes / above which it melts.
fn freeze_heat() -> f32 { par("FREEZE_HEAT", 0.4) as f32 }
fn melt_heat() -> f32 { par("MELT_HEAT", 1000.0) as f32 }
fn freeze_min_visits() -> u32 { par("FREEZE_MIN_VISITS", 12.0) as u32 }
fn heat_rate() -> f32 { par("HEAT_RATE", 0.3) as f32 }
/// Slow topic machine.
fn topic_k() -> usize { par("TOPIC_K", 4.0) as usize }
fn topic_soft() -> f64 { par("TOPIC_SOFT", 0.05) }
fn topic_share() -> f64 { par("TOPIC_SHARE", 0.05) }
fn frozen_fixed() -> bool { par("FROZEN_FIXED", 1.0) > 0.0 }
fn topic_maxd() -> usize { par("TOPIC_MAXD", 6.0) as usize }
fn topic_off() -> bool { par("TOPIC_OFF", 0.0) > 0.0 }
fn topic_activate_bits() -> f32 { par("TOPIC_ACTIVATE_BITS", 5.0) as f32 }
fn max_depth() -> usize { par("MAX_DEPTH", 6.0) as usize }
fn hyps_off() -> bool { par("HYPS_OFF", 0.0) > 0.0 }
fn topic_leak() -> f64 { par("TOPIC_LEAK", 0.75) as f64 }
fn topic_switch_bits() -> f64 { par("TOPIC_SWITCH_BITS", 4.0) as f64 }
fn topic_new_bits() -> f64 { par("TOPIC_NEW_BITS", 14.0) as f64 }
fn topic_vocab() -> f64 { par("TOPIC_VOCAB", 150.0) as f64 }
fn topic_backoff() -> f64 { par("TOPIC_BACKOFF", 20.0) as f64 }
fn topic_avg_rate() -> f64 { par("TOPIC_AVG_RATE", 0.02) as f64 }
/// Noise machine: time constant (chars) and bounds of the per-type corruption rate.
fn noise_tau() -> f64 { par("NOISE_TAU", 200.0) as f64 }
fn eps_min() -> f64 { par("EPS_MIN", 2e-4) as f64 }
fn eps_max() -> f64 { par("EPS_MAX", 0.04) as f64 }
/// Number of candidate dropped/swapped characters considered.
const SKIP_K: usize = 3;

/// Parameter lookup. Values are fixed; the environment override exists only for
/// tuning on seed 1 (M004="NAME=v,NAME=v").
fn par(name: &str, default: f64) -> f64 {
    thread_local!(static P: Vec<(String, f64)> = std::env::var("M004").ok().map(|v| v.split(',').filter_map(|kv| {
        let mut it = kv.split('='); Some((it.next()?.to_string(), it.next()?.parse().ok()?)) }).collect()).unwrap_or_default());
    P.with(|p| p.iter().find(|(k, _)| k == name).map(|x| x.1).unwrap_or(default))
}

#[inline]
fn mix(h: u64, x: u64) -> u64 {
    let mut z = (h ^ x.wrapping_mul(0x9E37_79B9_7F4A_7C15)).wrapping_add(0x632B_E59B_D9B4_E019);
    z = (z ^ (z >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
    z = (z ^ (z >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);
    z ^ (z >> 31)
}

#[derive(Clone)]
struct Node {
    key: u64,
    counts: [u32; A],
    total: u32,
    distinct: u32,
    active: bool,
    frozen: bool,
    pinned: bool,
    gain: f32,
    heat: f32,
    last: u32,
}

#[derive(Clone, Copy)]
struct Hyp {
    hist: [u8; HL],
    len: u8,
    pending: u8,
    w: f64,
    noisy: bool,
}

impl Hyp {
    fn push(&self, c: u8) -> Hyp {
        let mut h = *self;
        for i in (1..HL).rev() {
            h.hist[i] = h.hist[i - 1];
        }
        h.hist[0] = c;
        h.len = (h.len + 1).min(HL as u8);
        h
    }
    fn same(&self, o: &Hyp) -> bool {
        self.len == o.len && self.pending == o.pending && self.hist[..self.len as usize] == o.hist[..o.len as usize]
    }
}

/// Slow topic machine: held state over word-rate evidence.
struct Topic {
    k: usize,
    cur: usize,
    words: FastMap<(u8, u64), u32>,
    totals: [u32; KMAX],
    pressure: [f64; KMAX + 1],
    last_held: [u64; KMAX],
    global: FastMap<u64, u32>,
    gtotal: u32,
    avg: [f64; KMAX],
    belief: [f64; KMAX],
    switches: u64,
    recruits: u64,
}

impl Topic {
    /// Fit (log2 probability) of word `w` under held state `s`: the state's own
    /// word counts, backed off to all states together (the background).
    fn fit(&self, s: usize, w: u64) -> f64 {
        let ng = *self.global.get(&w).unwrap_or(&0) as f64;
        let pg = (ng + 0.5) / (self.gtotal as f64 + 0.5 * topic_vocab());
        let n = *self.words.get(&(s as u8, w)).unwrap_or(&0) as f64;
        let a = topic_backoff();
        ((n + a * pg) / (self.totals[s] as f64 + a)).log2()
    }
}

pub struct Model {
    nodes: Vec<Node>,
    index: FastMap<u64, u32>,
    capacity: usize,
    learning: bool,
    freezing: bool,
    rng: Rng,
    now: u32,
    hyps: Vec<Hyp>,
    // prediction cache
    ready: bool,
    hd: Vec<[f64; A]>,
    skipd: Vec<(u8, f64, [f64; A])>,
    mixp: [f64; A],
    // noise machine
    noise_rate: f64,
    // topic machine
    topic: Topic,
    word: u64,
    word_len: usize,
    energy: f64,
    evictions: u64,
}

impl Model {
    pub fn new(seed: u64, capacity: usize) -> Self {
        let mut m = Model {
            nodes: Vec::new(),
            index: FastMap::default(),
            capacity: capacity.max(1),
            learning: true,
            freezing: true,
            rng: Rng::derived(seed, "m004"),
            now: 0,
            hyps: vec![Hyp { hist: [0; HL], len: 0, pending: NONE, w: 1.0, noisy: false }],
            ready: false,
            hd: Vec::new(),
            skipd: Vec::new(),
            mixp: [0.0; A],
            noise_rate: 3.0 * eps_min(),
            topic: Topic {
                k: 0,
                cur: 0,
                words: FastMap::default(),
                totals: [0; KMAX],
                pressure: [0.0; KMAX + 1],
                last_held: [0; KMAX],
                global: FastMap::default(),
                gtotal: 0,
                avg: [0.0; KMAX],
                belief: [0.0; KMAX],
                switches: 0,
                recruits: 0,
            },
            word: 0,
            word_len: 0,
            energy: 0.0,
            evictions: 0,
        };
        // The root state (order 0) exists from the start.
        m.create(Self::root_key(), true);
        m.nodes[0].pinned = true;
        m
    }

    fn root_key() -> u64 {
        mix(0x5EED, 0)
    }

    /// Keys of the plain context chain for a history.
    fn keys(hist: &[u8; HL], len: u8) -> ([u64; D + 1], usize) {
        let mut k = [0u64; D + 1];
        k[0] = Self::root_key();
        let n = (len as usize).min(D).min(max_depth());
        for d in 1..=n {
            k[d] = mix(k[d - 1], hist[d - 1] as u64 + 1);
        }
        (k, n)
    }

    #[inline]
    fn tkey(k: u64, topic: usize) -> u64 {
        mix(k, 0x7070 + topic as u64)
    }

    fn topic_state(&self) -> Option<usize> {
        if self.topic.k > 0 && !topic_off() {
            Some(self.topic.cur)
        } else {
            None
        }
    }

    #[inline]
    fn blend(n: &Node, p: &[f64; A]) -> [f64; A] {
        let u = n.distinct.max(1) as f64;
        let denom = n.total as f64 + u;
        let mut out = [0.0; A];
        for i in 0..A {
            out[i] = (n.counts[i] as f64 + u * p[i]) / denom;
        }
        out
    }

    /// Prediction of one fast hypothesis: blend over its chain of active states.
    fn dist(&self, hist: &[u8; HL], len: u8) -> [f64; A] {
        if self.topic.k == 0 || topic_soft() == 0.0 || topic_off() {
            return self.dist_t(hist, len, self.topic_state());
        }
        // Mix over held topic states that carry belief.
        let t = &self.topic;
        let mut out = [0.0; A];
        let mut z = 0.0;
        for s in 0..t.k {
            let w = t.belief[s];
            if w < topic_soft() && s != t.cur {
                continue;
            }
            let d = self.dist_t(hist, len, Some(s));
            for i in 0..A {
                out[i] += w * d[i];
            }
            z += w;
        }
        for v in out.iter_mut() {
            *v /= z;
        }
        out
    }

    fn dist_t(&self, hist: &[u8; HL], len: u8, topic: Option<usize>) -> [f64; A] {
        let (keys, n) = Self::keys(hist, len);
        let mut p = [1.0 / A as f64; A];
        for d in 0..=n {
            if let Some(&i) = self.index.get(&keys[d]) {
                let nd = &self.nodes[i as usize];
                if nd.active && nd.total > 0 {
                    p = Self::blend(nd, &p);
                }
            }
            if let (Some(t), true) = (topic, d <= topic_maxd()) {
                if let Some(&i) = self.index.get(&Self::tkey(keys[d], t)) {
                    let nd = &self.nodes[i as usize];
                    if nd.active && nd.total > 0 {
                        p = Self::blend(nd, &p);
                    }
                }
            }
        }
        p
    }

    fn create(&mut self, key: u64, active: bool) -> Option<u32> {
        let node = Node {
            key,
            counts: [0; A],
            total: 0,
            distinct: 0,
            active,
            frozen: false,
            pinned: false,
            gain: 0.0,
            heat: 1.0,
            last: self.now,
        };
        let idx = if self.nodes.len() < self.capacity {
            self.nodes.push(node);
            self.nodes.len() - 1
        } else {
            // Melt an unfrozen node: prefer shadows, then the longest unused.
            let mut best: Option<(u64, usize)> = None;
            for _ in 0..16 {
                let i = self.rng.below(self.nodes.len());
                let n = &self.nodes[i];
                if n.pinned || n.frozen {
                    continue;
                }
                let score = n.last as u64 + if n.active { 1 << 20 } else { 0 };
                if best.map_or(true, |b| score < b.0) {
                    best = Some((score, i));
                }
            }
            let (_, i) = best?;
            let old = self.nodes[i].key;
            self.index.remove(&old);
            self.nodes[i] = node;
            self.evictions += 1;
            i
        };
        self.index.insert(key, idx as u32);
        Some(idx as u32)
    }

    /// One node on the learning path: shadow gain, heat, freezing, counts.
    /// Returns the updated running prediction.
    fn touch(&mut self, i: u32, p: &[f64; A], c: usize, fresh: bool, gate: f32) -> [f64; A] {
        let freezing = self.freezing;
        let now = self.now;
        let n = &mut self.nodes[i as usize];
        n.last = now;
        let mut out = *p;
        if n.total > 0 && !fresh {
            let pw = Self::blend(n, p);
            let s_with = -pw[c].log2();
            if n.active {
                out = pw;
                // Heat = excess misfit: surprisal beyond what the node itself expects.
                let ent: f64 = pw.iter().map(|&q| if q > 0.0 { -q * q.log2() } else { 0.0 }).sum();
                let excess = (s_with - ent).max(0.0) as f32;
                n.heat += heat_rate() * (excess - n.heat);
                if freezing {
                    if !n.frozen && n.heat < freeze_heat() && n.total >= freeze_min_visits() {
                        n.frozen = true;
                    } else if n.frozen && n.heat > melt_heat() {
                        n.frozen = false;
                    }
                }
            } else {
                // Resolvable heat: how much misfit would this context have removed?
                let s_wo = -p[c].log2();
                n.gain += (s_wo - s_with) as f32;
                if n.gain > gate {
                    n.active = true;
                    out = pw;
                }
            }
        }
        // A frozen node's connections are fixed: misfit it meets is left as
        // heat for young structure (deeper or topic-keyed nodes) to resolve.
        if n.frozen && frozen_fixed() {
            return out;
        }
        if n.counts[c] == 0 {
            n.distinct += 1;
        }
        n.counts[c] += 1;
        n.total += 1;
        out
    }

    /// Learn from character `c` arriving after history `hist`.
    fn learn(&mut self, hist: &[u8; HL], len: u8, c: usize) {
        let (keys, n) = Self::keys(hist, len);
        let topic = self.topic_state();
        let mut p = [1.0 / A as f64; A];
        let mut parent_ok = true; // plain parent exists, is active and is warm here
        for d in 0..=n {
            let warm = -p[c].log2() > spawn_bits();
            let mut plain_ok = false;
            match self.index.get(&keys[d]).copied() {
                Some(i) => {
                    p = self.touch(i, &p, c, false, activate_bits());
                    plain_ok = self.nodes[i as usize].active;
                }
                None => {
                    if parent_ok && warm {
                        if let Some(i) = self.create(keys[d], false) {
                            self.touch(i, &p, c, true, activate_bits());
                        }
                    }
                }
            }
            if let (Some(t), true) = (topic, d <= topic_maxd()) {
                let tk = Self::tkey(keys[d], t);
                match self.index.get(&tk).copied() {
                    Some(i) => {
                        p = self.touch(i, &p, c, false, topic_activate_bits());
                    }
                    None => {
                        let warm_here = -p[c].log2() > spawn_bits();
                        if plain_ok && warm_here {
                            if let Some(i) = self.create(tk, false) {
                                self.touch(i, &p, c, true, topic_activate_bits());
                            }
                        }
                    }
                }
            }
            parent_ok = plain_ok;
        }
    }

    fn eps(&self) -> f64 {
        (self.noise_rate / 3.0).clamp(eps_min(), eps_max())
    }

    fn prepare(&mut self) {
        if self.ready {
            return;
        }
        self.hd.clear();
        let mut main = [0.0; A];
        let z: f64 = self.hyps.iter().map(|h| h.w).sum();
        for h in &self.hyps {
            let d = if h.pending != NONE {
                let mut d = [1e-3 / (A - 1) as f64; A];
                d[h.pending as usize] = 1.0 - 1e-3;
                d
            } else {
                self.dist(&h.hist, h.len)
            };
            for i in 0..A {
                main[i] += h.w / z * d[i];
            }
            self.hd.push(d);
        }
        // Skip distribution from the leading hypothesis: what comes after the
        // next character (used if a character was dropped or two were swapped).
        self.skipd.clear();
        let top = self.hyps[0];
        let mut skip = [0.0; A];
        if top.pending == NONE {
            let d0 = self.hd[0];
            let mut order: Vec<usize> = (0..A).collect();
            order.sort_by(|&a, &b| d0[b].partial_cmp(&d0[a]).unwrap().then(a.cmp(&b)));
            let mut zs = 0.0;
            for &x in order.iter().take(SKIP_K) {
                let hx = top.push(x as u8);
                let dx = self.dist(&hx.hist, hx.len);
                for i in 0..A {
                    skip[i] += d0[x] * dx[i];
                }
                zs += d0[x];
                self.skipd.push((x as u8, d0[x], dx));
            }
            for v in skip.iter_mut() {
                *v /= zs;
            }
        } else {
            skip = main;
        }
        let e = self.eps();
        let mut s = 0.0;
        for i in 0..A {
            let v = (1.0 - 3.0 * e) * main[i] + e / A as f64 + 2.0 * e * skip[i];
            self.mixp[i] = v.max(1e-9);
            s += self.mixp[i];
        }
        for v in self.mixp.iter_mut() {
            *v /= s;
        }
        self.ready = true;
    }

    fn update_hyps(&mut self, c: usize) {
        let e = self.eps();
        let mut next: Vec<Hyp> = Vec::with_capacity(4 * NH);
        let add = |h: Hyp, next: &mut Vec<Hyp>| {
            if h.w <= 0.0 {
                return;
            }
            if let Some(o) = next.iter_mut().find(|o| o.same(&h)) {
                o.w += h.w;
                o.noisy &= h.noisy;
            } else {
                next.push(h);
            }
        };
        for (i, h) in self.hyps.iter().enumerate() {
            let d = &self.hd[i];
            if h.pending != NONE {
                let mut g = *h;
                g.pending = NONE;
                g.w = h.w * d[c];
                g.noisy = true;
                add(g, &mut next);
                continue;
            }
            let mut g = h.push(c as u8);
            g.w = h.w * (1.0 - 3.0 * e) * d[c];
            g.noisy = false;
            add(g, &mut next);
            // The character was spurious: hold the state.
            let mut g = *h;
            g.w = h.w * e / A as f64;
            g.noisy = true;
            add(g, &mut next);
            if i == 0 {
                for &(x, px, ref dx) in &self.skipd {
                    // x was dropped.
                    let mut g = h.push(x).push(c as u8);
                    g.w = h.w * e * px * dx[c];
                    g.noisy = true;
                    g.pending = NONE;
                    add(g, &mut next);
                    // x and c were swapped: x is still to come.
                    let mut g2 = g;
                    g2.pending = x;
                    add(g2, &mut next);
                }
            }
        }
        let z: f64 = next.iter().map(|h| h.w).sum();
        let zn: f64 = next.iter().filter(|h| !h.noisy).map(|h| h.w).sum();
        if !(z > 0.0) || !z.is_finite() {
            // Everything died: restart from the plain observed history.
            let h = self.hyps[0].push(c as u8);
            self.hyps = vec![Hyp { w: 1.0, noisy: false, pending: NONE, ..h }];
            return;
        }
        // Noise machine: slowly held estimate of the corruption rate.
        let m = 1.0 - zn / z;
        self.noise_rate += (m - self.noise_rate) / noise_tau();
        if hyps_off() {
            // Ablation: no held alternatives, only the literal reading.
            next.retain(|h| !h.noisy);
        }
        next.sort_by(|a, b| b.w.partial_cmp(&a.w).unwrap());
        next.truncate(NH);
        let z: f64 = next.iter().map(|h| h.w).sum();
        let wmax = next[0].w;
        next.retain(|h| h.w > wmax * 1e-6);
        for h in next.iter_mut() {
            h.w /= z;
        }
        self.hyps = next;
    }

    /// A word completed: the slow topic machine weighs it.
    fn topic_word(&mut self, w: u64) {
        let learning = self.learning;
        let t = &mut self.topic;
        if t.k == 0 {
            if !learning {
                return;
            }
            t.k = 1;
            t.cur = 0;
            t.recruits += 1;
        }
        let fc = t.fit(t.cur, w);
        let mut best = (0.0, usize::MAX);
        for s in 0..t.k {
            let f = t.fit(s, w);
            t.pressure[s] = topic_leak() * t.pressure[s] + (f - fc);
            if s != t.cur && t.pressure[s] > topic_switch_bits() && t.pressure[s] > best.0 {
                best = (t.pressure[s], s);
            }
        }
        // Excess misfit of the held state: surprisal beyond its own usual level.
        let cur = t.cur;
        let excess = -fc - t.avg[cur];
        t.avg[cur] += topic_avg_rate() * (-fc - t.avg[cur]);
        t.pressure[KMAX] = (topic_leak() * t.pressure[KMAX] + excess).max(0.0);
        if best.1 != usize::MAX {
            t.cur = best.1;
            t.switches += 1;
            t.pressure = [0.0; KMAX + 1];
        } else if learning && topic_k() > 1 && t.pressure[KMAX] > topic_new_bits() {
            // Sustained misfit no held state can settle: recruit a new one.
            let s = if t.k < topic_k().min(KMAX) {
                t.k += 1;
                t.k - 1
            } else {
                // Reuse the state held least recently.
                let s = (0..t.k).filter(|&s| s != t.cur).min_by_key(|&s| t.last_held[s]).unwrap();
                t.words.retain(|&(st, _), _| st as usize != s);
                t.totals[s] = 0;
                s
            };
            t.avg[s] = t.avg[cur];
            t.cur = s;
            t.recruits += 1;
            t.switches += 1;
            t.pressure = [0.0; KMAX + 1];
        }
        // Held belief over topic states (a forward filter with a small share).
        let mut z = 0.0;
        for s in 0..t.k {
            t.belief[s] *= t.fit(s, w).exp2();
            z += t.belief[s];
        }
        let sh = topic_share();
        for s in 0..t.k {
            t.belief[s] = if z > 0.0 { (1.0 - sh) * t.belief[s] / z + sh / t.k as f64 } else { 1.0 / t.k as f64 };
        }
        t.belief[t.cur] = t.belief[t.cur].max(1e-6);
        t.last_held[t.cur] = self.now as u64;
        if learning {
            *t.words.entry((t.cur as u8, w)).or_insert(0) += 1;
            t.totals[t.cur] += 1;
            *t.global.entry(w).or_insert(0) += 1;
            t.gtotal += 1;
        }
    }
}

impl Model {
    /// The slow topic machine's held state (for diagnostics).
    pub fn held_topic(&self) -> usize {
        self.topic.cur
    }
}

impl Automaton for Model {
    fn name(&self) -> &str {
        "m004-held-state"
    }

    fn predict(&mut self) -> Vec<f64> {
        self.prepare();
        self.mixp.to_vec()
    }

    fn observe(&mut self, ch: u8) {
        self.prepare();
        let c = sym(ch);
        self.energy = -self.mixp[c].log2();
        self.now = self.now.wrapping_add(1);
        if self.learning {
            let top = self.hyps[0];
            if top.pending == NONE {
                self.learn(&top.hist, top.len, c);
            }
        }
        self.update_hyps(c);
        // Word segmentation for the slow machine.
        if ch == b' ' || ch == b'.' || ch == b'\n' {
            if self.word_len > 0 {
                let w = self.word;
                self.topic_word(w);
            }
            self.word = 0;
            self.word_len = 0;
        } else {
            self.word = mix(self.word, c as u64 + 1);
            self.word_len += 1;
        }
        self.ready = false;
    }

    fn set_learning(&mut self, on: bool) {
        self.learning = on;
    }

    fn quiet(&mut self, _steps: usize) {}

    fn energy(&self) -> f64 {
        self.energy
    }

    fn stats(&self) -> Vec<(String, f64)> {
        let active = self.nodes.iter().filter(|n| n.active).count();
        let frozen = self.nodes.iter().filter(|n| n.frozen).count();
        vec![
            ("units".into(), self.nodes.len() as f64),
            ("active".into(), active as f64),
            ("shadow".into(), (self.nodes.len() - active) as f64),
            ("frozen".into(), frozen as f64),
            ("evictions".into(), self.evictions as f64),
            ("topic_states".into(), self.topic.k as f64),
            ("topic_switches".into(), self.topic.switches as f64),
            ("topic_recruits".into(), self.topic.recruits as f64),
            ("noise_rate".into(), self.noise_rate),
            ("hyps".into(), self.hyps.len() as f64),
        ]
    }

    fn set_freezing(&mut self, on: bool) -> bool {
        self.freezing = on;
        true
    }
}
