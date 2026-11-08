//! m006-state-with-assemblies: held state (from m004) plus shared assemblies
//! (from m003), with alternative readings that come from the automaton's own
//! structure, held word traces whose links to later misfit are learnt, and
//! fast switching of slow machines when a change is resolvable.
//!
//! Machines, each holding a state:
//! * fast context nodes ("the last d characters"), optionally keyed by the held
//!   topic state, or by a held word trace (links); blended Witten–Bell style;
//! * shared assemblies (m003): nodes bound to many context nodes by membership
//!   connections, with one-step successors and topic-keyed twins; they speak in
//!   proportion to the specific prediction's uncertainty, and a successor
//!   speaks with the gate its branch point had one step earlier;
//! * a slow topic machine whose belief also moves at character rate when the
//!   fast nodes keyed to another state fit better (resolvable misfit);
//! * held word traces (rarity-weighted, fading) that links hang from;
//! * alternative readings from the automaton's own structure: the input did not
//!   move the state (held glitch), the state moved by its own anticipation and
//!   then took the input, or the state moved by anticipation without the input.
//!
//! Freezing lives on each node's outgoing connections and on membership
//! connections. Under full capacity only states with residual heat recruit;
//! the least recently used unfrozen node melts; frozen nodes thaw when idle and
//! little used. Parameters: `par()`; the M006 environment variable overrides
//! them (tuning on seed 1 only). See FINDINGS.md, including the declared
//! counting-equivalent parts.

use hsm_core::{sym, Automaton, FastMap, Rng, A};

const D: usize = 6;
const HL: usize = 8;
const NH: usize = 6;
const KMAX: usize = 8;
const TMAX: usize = 16;
const MAXC: usize = 2;
const RING: usize = 48;
const SKIP_K: usize = 3;

const PLAIN: u8 = 0;
const TOPIC: u8 = 1;
const LINK: u8 = 2;
const SHARED: u8 = 3;
const CHAIN: u8 = 4;

// ---- parameters (tuned on seed 1 only; M006="NAME=v,..." overrides for tuning) ----
fn par(name: &str, default: f64) -> f64 {
    thread_local!(static P: Vec<(String, f64)> = std::env::var("M006").ok().map(|v| v.split(',').filter_map(|kv| {
        let mut it = kv.split('='); Some((it.next()?.to_string(), it.next()?.parse().ok()?)) }).collect()).unwrap_or_default());
    P.with(|p| p.iter().find(|(k, _)| k == name).map(|x| x.1).unwrap_or(default))
}
macro_rules! p {
    ($f:ident, $n:expr, $d:expr) => {
        #[inline]
        fn $f() -> f64 {
            thread_local!(static V: f64 = par($n, $d));
            V.with(|v| *v)
        }
    };
}
// fast machines, freezing, melting
p!(activate_bits, "ACTIVATE_BITS", 0.0);
p!(spawn_bits, "SPAWN_BITS", 0.0);
p!(freeze_heat, "FREEZE_HEAT", 0.4);
p!(freeze_min_visits, "FREEZE_MIN_VISITS", 12.0);
p!(heat_rate, "HEAT_RATE", 0.3);
p!(freeze_mode, "FREEZE_MODE", 0.0); // 0: a cooled node freezes all its outgoing connections; 1: only those it has used
p!(thaw_idle, "THAW_IDLE", 10000.0);
p!(grow_full, "GROW_FULL", 0.0);
p!(thaw_vis, "THAW_VIS", 20.0);
p!(full_bits, "FULL_BITS", 1.5);
p!(value_mode, "VALUE_MODE", 0.0);
p!(max_depth, "MAX_DEPTH", 6.0);
// topic machine
p!(topic_k, "TOPIC_K", 4.0);
p!(topic_soft, "TOPIC_SOFT", 0.05);
p!(topic_share, "TOPIC_SHARE", 0.05);
p!(topic_maxd, "TOPIC_MAXD", 6.0);
p!(topic_off, "TOPIC_OFF", 0.0);
p!(topic_activate_bits, "TOPIC_ACTIVATE_BITS", 5.0);
p!(topic_leak, "TOPIC_LEAK", 0.75);
p!(topic_switch_bits, "TOPIC_SWITCH_BITS", 4.0);
p!(topic_new_bits, "TOPIC_NEW_BITS", 14.0);
p!(topic_vocab, "TOPIC_VOCAB", 150.0);
p!(topic_backoff, "TOPIC_BACKOFF", 20.0);
p!(topic_avg_rate, "TOPIC_AVG_RATE", 0.02);
p!(char_switch, "CHAR_SWITCH", 1.0);
p!(sharp_bits, "SHARP_BITS", 1e9);
p!(sharp_min, "SHARP_MIN", 10.0);
p!(char_leak, "CHAR_LEAK", 0.97);
p!(char_switch_bits, "CHAR_SWITCH_BITS", 10.0);
p!(char_belief, "CHAR_BELIEF", 0.5);
// alternative readings
p!(hyps_off, "HYPS_OFF", 0.0);
p!(noise_tau, "NOISE_TAU", 200.0);
p!(eps_min, "EPS_MIN", 2e-4);
p!(eps_max, "EPS_MAX", 0.04);
p!(glitch_root, "GLITCH_ROOT", 0.0);
p!(subst_off, "SUBST_OFF", 0.0);
// shared assemblies
p!(shared_off, "SHARED_OFF", 0.0);
p!(beta, "BETA", 0.8);
p!(beta_chain, "BETA_CHAIN", 0.8);
p!(kent, "KENT", 1.5);
p!(gate_deep, "GATE_DEEP", 0.0);
p!(chain_gate, "CHAIN_GATE", 2.0);
p!(kesc, "KESC", 1.3);
p!(theta_join, "THETA_JOIN", 0.55);
p!(theta_leave, "THETA_LEAVE", 0.35);
p!(search_bits, "SEARCH_BITS", 1.0);
p!(min_obs, "MIN_OBS", 6.0);
p!(min_depth, "MIN_DEPTH", 2.0);
p!(mfreeze_rate, "MFREEZE_RATE", 0.02);
// held traces and links
p!(links_off, "LINKS_OFF", 0.0);
p!(trace_decay, "TRACE_DECAY", 0.97);
p!(link_min_d, "LINK_MIN_D", 3.0);
p!(link_h, "LINK_H", 0.2);
p!(link_spawn_bits, "LINK_SPAWN_BITS", 0.5);
p!(link_activate_bits, "LINK_ACTIVATE_BITS", 4.0);
p!(link_kent, "LINK_KENT", 1.0);
p!(deact, "DEACT", 1.0);
p!(link_last, "LINK_LAST", 0.0);
p!(gain_cap, "GAIN_CAP", 1e9);
p!(tmax, "TMAX", 12.0);
p!(link_top, "LINK_TOP", 16.0);
p!(shared_topic, "SHARED_TOPIC", 1.0);
p!(trust_rate, "TRUST_RATE", 0.05);
p!(trust_chain, "TRUST_CHAIN", 1.0);
// quiet
p!(quiet_min_total, "QUIET_MIN_TOTAL", 4.0);
p!(quiet_off, "QUIET_OFF", 0.0);
p!(quiet_kinds, "QUIET_KINDS", 0.0);
p!(quiet_search, "QUIET_SEARCH", 1.0);

#[inline]
fn mix(h: u64, x: u64) -> u64 {
    let mut z = (h ^ x.wrapping_mul(0x9E37_79B9_7F4A_7C15)).wrapping_add(0x632B_E59B_D9B4_E019);
    z = (z ^ (z >> 30)).wrapping_mul(0xBF58_476D_1CE4_E5B9);
    z = (z ^ (z >> 27)).wrapping_mul(0x94D0_49BB_1331_11EB);
    z ^ (z >> 31)
}

fn root_key() -> u64 {
    mix(0x5EED, 0)
}
fn ctx_key(ctx: &[u8]) -> u64 {
    let mut k = root_key();
    for &b in ctx {
        k = mix(k, b as u64 + 1);
    }
    k
}
#[inline]
fn tkey(k: u64, t: usize) -> u64 {
    mix(k, 0x7070 + t as u64)
}
#[inline]
fn lkey(k: u64, w: u64) -> u64 {
    mix(mix(k, 0x1111), w)
}
#[inline]
fn chkey(g: u64, c: u8) -> u64 {
    mix(g, 0xC0 + c as u64)
}

fn entropy(p: &[f64; A]) -> f64 {
    p.iter().map(|&q| if q > 0.0 { -q * q.log2() } else { 0.0 }).sum()
}

#[derive(Clone)]
struct Node {
    key: u64,
    pkey: u64,
    counts: [u32; A],
    total: u32,
    distinct: u32,
    /// Frozen outgoing connections, one bit per symbol.
    fmask: u32,
    kind: u8,
    depth: u8,
    ctx: [u8; D],
    active: bool,
    pinned: bool,
    gain: f32,
    heat: f32,
    last: u32,
    visits: u32,
    last_search: u32,
    ncls: u8,
    /// Membership connections: (shared node key, weight, freeze).
    cls: [(u64, f32, f32); MAXC],
    /// Trust of each membership connection: does the shared node remove this member's misfit?
    trust: [f32; MAXC],
    members: u32,
}

impl Node {
    fn frozen(&self) -> bool {
        self.fmask != 0
    }
    fn norm(&self) -> [f32; A] {
        let mut v = [0.0; A];
        if self.total > 0 {
            let t = self.total as f32;
            for i in 0..A {
                v[i] = self.counts[i] as f32 / t;
            }
        }
        v
    }
}

#[derive(Clone, Copy)]
struct Hyp {
    hist: [u8; HL],
    len: u8,
    w: f64,
    /// Generalist gate at the branch point one step back (wakes shared successors).
    gp: f32,
    /// Reading that produced this hypothesis at the last step: 0 literal, 1 held glitch, 2 anticipated.
    how: u8,
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
        self.len == o.len && self.hist[..self.len as usize] == o.hist[..o.len as usize]
    }
}

struct Topic {
    k: usize,
    cur: usize,
    words: FastMap<(u8, u64), u32>,
    totals: [u32; KMAX],
    pressure: [f64; KMAX + 1],
    cpress: [f64; KMAX],
    last_held: [u64; KMAX],
    global: FastMap<u64, u32>,
    gtotal: u32,
    avg: [f64; KMAX],
    belief: [f64; KMAX],
    switches: u64,
    char_switches: u64,
    recruits: u64,
}

impl Topic {
    fn pglobal(&self, w: u64) -> f64 {
        let ng = *self.global.get(&w).unwrap_or(&0) as f64;
        (ng + 0.5) / (self.gtotal as f64 + 0.5 * topic_vocab())
    }
    fn fit(&self, s: usize, w: u64) -> f64 {
        let pg = self.pglobal(w);
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
    ready: bool,
    hd: Vec<[f64; A]>,
    hg: Vec<f32>,
    skipd: Vec<(u8, f64, [f64; A])>,
    gl: [f64; A],
    mixp: [f64; A],
    pt: Vec<[f64; A]>,
    rate_h: f64,
    rate_s: f64,
    rate_a: f64,
    resid: f64,
    topic: Topic,
    word: u64,
    word_len: usize,
    traces: Vec<(u64, f32)>,
    ring: Vec<Vec<u64>>,
    ring_pos: Vec<usize>,
    next_gid: u64,
    energy: f64,
    evictions: u64,
    thawed: u64,
    refused: u64,
    joins: u64,
    leaves: u64,
    quiet_on: u64,
    quiet_joins: u64,
}

impl Model {
    pub fn new(seed: u64, capacity: usize) -> Self {
        let mut m = Model {
            nodes: Vec::new(),
            index: FastMap::default(),
            capacity: capacity.max(1),
            learning: true,
            freezing: true,
            rng: Rng::derived(seed, "m006"),
            now: 0,
            hyps: vec![Hyp { hist: [0; HL], len: 0, w: 1.0, gp: 0.0, how: 0 }],
            ready: false,
            hd: Vec::new(),
            hg: Vec::new(),
            skipd: Vec::new(),
            gl: [1.0 / A as f64; A],
            mixp: [0.0; A],
            pt: Vec::new(),
            rate_h: eps_min(),
            rate_s: eps_min(),
            rate_a: eps_min(),
            resid: 0.0,
            topic: Topic {
                k: 0,
                cur: 0,
                words: FastMap::default(),
                totals: [0; KMAX],
                pressure: [0.0; KMAX + 1],
                cpress: [0.0; KMAX],
                last_held: [0; KMAX],
                global: FastMap::default(),
                gtotal: 0,
                avg: [0.0; KMAX],
                belief: [0.0; KMAX],
                switches: 0,
                char_switches: 0,
                recruits: 0,
            },
            word: 0,
            word_len: 0,
            traces: Vec::new(),
            ring: vec![Vec::new(); A],
            ring_pos: vec![0; A],
            next_gid: 0,
            energy: 0.0,
            evictions: 0,
            thawed: 0,
            refused: 0,
            joins: 0,
            leaves: 0,
            quiet_on: 0,
            quiet_joins: 0,
        };
        m.create(root_key(), PLAIN, 0, true);
        m.nodes[0].pinned = true;
        m
    }

    fn keys(hist: &[u8], len: usize) -> ([u64; D + 1], usize) {
        let mut k = [0u64; D + 1];
        k[0] = root_key();
        let n = len.min(D).min(max_depth() as usize);
        for d in 1..=n {
            k[d] = mix(k[d - 1], hist[d - 1] as u64 + 1);
        }
        (k, n)
    }

    fn topic_state(&self) -> Option<usize> {
        if self.topic.k > 0 && topic_off() == 0.0 {
            Some(self.topic.cur)
        } else {
            None
        }
    }

    #[inline]
    fn get(&self, key: u64) -> Option<u32> {
        self.index.get(&key).copied()
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

    fn chain_t(&self, keys: &[u64; D + 1], n: usize, topic: Option<usize>) -> [f64; A] {
        let mut p = [1.0 / A as f64; A];
        for d in 0..=n {
            if let Some(i) = self.get(keys[d]) {
                let nd = &self.nodes[i as usize];
                if nd.active && nd.total > 0 {
                    p = Self::blend(nd, &p);
                }
            }
            if let (Some(t), true) = (topic, d <= topic_maxd() as usize) {
                if let Some(i) = self.get(tkey(keys[d], t)) {
                    let nd = &self.nodes[i as usize];
                    if nd.active && nd.total > 0 {
                        p = Self::blend(nd, &p);
                    }
                }
            }
        }
        p
    }

    fn chain(&self, keys: &[u64; D + 1], n: usize) -> [f64; A] {
        let t = &self.topic;
        if t.k == 0 || topic_soft() == 0.0 || topic_off() > 0.0 {
            return self.chain_t(keys, n, self.topic_state());
        }
        let mut out = [0.0; A];
        let mut z = 0.0;
        for s in 0..t.k {
            let w = t.belief[s];
            if w < topic_soft() && s != t.cur {
                continue;
            }
            let d = self.chain_t(keys, n, Some(s));
            for i in 0..A {
                out[i] += w * d[i];
            }
            z += w;
        }
        if z <= 0.0 {
            return self.chain_t(keys, n, self.topic_state());
        }
        for v in out.iter_mut() {
            *v /= z;
        }
        out
    }

    /// The deepest active plain context state, from which links to held traces hang.
    fn link_depth(&self, keys: &[u64; D + 1], n: usize) -> Option<usize> {
        let lo = link_min_d() as usize;
        for d in (lo..=n).rev() {
            if let Some(i) = self.get(keys[d]) {
                if self.nodes[i as usize].active {
                    return Some(d);
                }
            }
        }
        None
    }

    /// Held traces in blending order (weakest first, so the strongest speaks last).
    fn trace_order(&self) -> Vec<u64> {
        let mut t = self.traces.clone();
        t.sort_by(|a, b| a.1.partial_cmp(&b.1).unwrap().then(a.0.cmp(&b.0)));
        t.into_iter().map(|x| x.0).collect()
    }

    fn apply_links(&self, keys: &[u64; D + 1], n: usize, mut p: [f64; A], order: &[u64]) -> [f64; A] {
        if links_off() > 0.0 {
            return p;
        }
        if let Some(dl) = self.link_depth(keys, n) {
            // A link speaks in proportion to the uncertainty of the state it hangs from.
            let g = if link_kent() > 0.0 { (entropy(&p) / link_kent()).min(1.0) } else { 1.0 };
            if g <= 0.0 {
                return p;
            }
            let mut sel: Vec<u32> = Vec::new();
            for &w in order {
                if let Some(i) = self.get(lkey(keys[dl], w)) {
                    let nd = &self.nodes[i as usize];
                    if nd.active && nd.total > 0 {
                        sel.push(i);
                    }
                }
            }
            let k = link_top() as usize;
            if sel.len() > k {
                sel.drain(..sel.len() - k);
            }
            for i in sel {
                {
                    let nd = &self.nodes[i as usize];
                    {
                        let b = Self::blend(nd, &p);
                        for c in 0..A {
                            p[c] = g * b[c] + (1.0 - g) * p[c];
                        }
                    }
                }
            }
        }
        p
    }

    /// Shared assemblies woken by a history: (node key, activation).
    fn shared_acts(&self, hist: &[u8], len: usize, g: f64, gprev: f64, out: &mut Vec<(u64, f32)>) {
        let md = (min_depth() as usize).max(1);
        let (keys, n) = Self::keys(hist, len);
        for d in md..=n {
            if let Some(i) = self.get(keys[d]) {
                let nd = &self.nodes[i as usize];
                for j in 0..nd.ncls as usize {
                    let (z, w, _) = nd.cls[j];
                    push_max(out, z, (beta() * (w * nd.trust[j]) as f64 * g) as f32);
                }
            }
        }
        // One-step successors of the shared cells that were woken a step ago.
        if len >= 2 {
            let (pk, pn) = Self::keys(&hist[1..], len - 1);
            for d in md..=pn {
                if let Some(i) = self.get(pk[d]) {
                    let nd = &self.nodes[i as usize];
                    for j in 0..nd.ncls as usize {
                        let (z, w, _) = nd.cls[j];
                        let w = w * if trust_chain() > 0.0 { nd.trust[j] } else { 1.0 };
                        let gc = match chain_gate() as u32 { 0 => 1.0, 1 => g, _ => gprev };
                        push_max(out, chkey(z, hist[0]), (beta_chain() * w as f64 * gc) as f32);
                    }
                }
            }
        }
    }

    /// Returns the prediction and the generalist gate at this state.
    fn apply_shared(&self, hist: &[u8], len: usize, p: [f64; A], gprev: f64) -> ([f64; A], f64) {
        if shared_off() > 0.0 {
            return (p, 0.0);
        }
        // A generalist speaks in proportion to the specific state's uncertainty.
        let h = if gate_deep() > 0.0 {
            let (keys, n) = Self::keys(hist, len);
            let mut h = 0.0;
            for d in 0..=n {
                if let Some(i) = self.get(keys[d]) {
                    let nd = &self.nodes[i as usize];
                    if nd.total > 0 {
                        let v = nd.norm();
                        h = v.iter().map(|&q| if q > 0.0 { -(q as f64) * (q as f64).log2() } else { 0.0 }).sum();
                    }
                }
            }
            h
        } else {
            entropy(&p)
        };
        let g = (h / kent()).min(1.0);
        let mut acts = Vec::new();
        self.shared_acts(hist, len, g, gprev, &mut acts);
        if acts.is_empty() {
            return (p, g);
        }
        acts.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap().then(a.0.cmp(&b.0)));
        let mut out = [0.0; A];
        let mut rem = 1.0f64;
        let mut chains: Vec<(u32, f32)> = Vec::new();
        let mut shared: Vec<(u32, f32)> = Vec::new();
        for (k, a) in acts {
            if let Some(i) = self.get(k) {
                let nd = &self.nodes[i as usize];
                if nd.total == 0 {
                    continue;
                }
                if nd.kind == CHAIN {
                    chains.push((i, a));
                } else {
                    shared.push((i, a));
                }
            }
        }
        let tcur = self.topic_state();
        for (i, a) in chains.into_iter().chain(shared) {
            let nd = &self.nodes[i as usize];
            let u = nd.distinct.max(1) as f64 * kesc();
            let conf = nd.total as f64 / (nd.total as f64 + u);
            let w = rem * a as f64 * conf;
            let q = self.shared_q(nd, tcur);
            for c in 0..A {
                out[c] += w * q[c];
            }
            rem -= w;
        }
        for c in 0..A {
            out[c] += rem * p[c];
        }
        (out, g)
    }

    /// What a shared node expects, refined by its twin keyed to the held topic state.
    fn shared_q(&self, nd: &Node, t: Option<usize>) -> [f64; A] {
        let inv = 1.0 / nd.total as f64;
        let mut q = [0.0; A];
        for c in 0..A {
            q[c] = nd.counts[c] as f64 * inv;
        }
        if let (Some(t), true) = (t, shared_topic() > 0.0) {
            if let Some(j) = self.get(tkey(nd.key, t)) {
                let tw = &self.nodes[j as usize];
                if tw.active && tw.total > 0 {
                    q = Self::blend(tw, &q);
                }
            }
        }
        q
    }

    fn dist(&self, hist: &[u8; HL], len: u8, order: &[u64], gprev: f32) -> ([f64; A], f32) {
        let (keys, n) = Self::keys(hist, len as usize);
        let p = self.chain(&keys, n);
        if link_last() > 0.0 {
            let (p, g) = self.apply_shared(hist, len as usize, p, gprev as f64);
            return (self.apply_links(&keys, n, p, order), g as f32);
        }
        let p = self.apply_links(&keys, n, p, order);
        let (p, g) = self.apply_shared(hist, len as usize, p, gprev as f64);
        (p, g as f32)
    }

    // ------------------------------------------------------------- capacity

    fn create(&mut self, key: u64, kind: u8, pkey: u64, active: bool) -> Option<u32> {
        let node = Node {
            key,
            pkey,
            counts: [0; A],
            total: 0,
            distinct: 0,
            fmask: 0,
            kind,
            depth: 0,
            ctx: [0; D],
            active,
            pinned: false,
            gain: 0.0,
            heat: 1.0,
            last: self.now,
            visits: 0,
            last_search: 0,
            ncls: 0,
            cls: [(0, 0.0, 0.0); MAXC],
            trust: [1.0; MAXC],
            members: 0,
        };
        let idx = if self.nodes.len() < self.capacity {
            self.nodes.push(node);
            self.nodes.len() - 1
        } else {
            let i = self.victim()?;
            self.release(i);
            self.nodes[i] = node;
            self.evictions += 1;
            i
        };
        self.index.insert(key, idx as u32);
        Some(idx as u32)
    }

    /// The least valuable meltable node among a sample. Frozen connections pin
    /// a node, unless it has been idle long enough to thaw.
    fn victim(&mut self) -> Option<usize> {
        let mut best: Option<(f64, usize)> = None;
        let now = self.now;
        for _ in 0..16 {
            let i = self.rng.below(self.nodes.len());
            let n = &self.nodes[i];
            if n.pinned || (n.kind == SHARED && n.members > 0) {
                continue;
            }
            let idle = now.wrapping_sub(n.last) as f64;
            if n.frozen() && self.freezing && (idle < thaw_idle() || n.visits as f64 >= thaw_vis()) {
                continue;
            }
            let score = match value_mode() as u32 {
                0 => n.last as f64 + if n.active { (1u64 << 20) as f64 } else { 0.0 },
                _ => {
                    let use_ = (n.visits as f64 + 1.0).ln() + if n.active { 2.0 } else { 0.0 } + (n.gain.max(0.0) as f64).min(4.0);
                    use_ - idle / 2000.0
                }
            };
            if best.map_or(true, |b| score < b.0) {
                best = Some((score, i));
            }
        }
        if best.is_none() {
            self.refused += 1;
        }
        let (_, i) = best?;
        if self.nodes[i].frozen() {
            self.thawed += 1;
        }
        Some(i)
    }

    fn release(&mut self, i: usize) {
        let old = self.nodes[i].key;
        self.index.remove(&old);
        let n = self.nodes[i].ncls as usize;
        for j in 0..n {
            let z = self.nodes[i].cls[j].0;
            if let Some(zi) = self.get(z) {
                let zn = &mut self.nodes[zi as usize];
                zn.members = zn.members.saturating_sub(1);
            }
        }
    }

    // ------------------------------------------------------------- learning

    fn add_count(n: &mut Node, c: usize, freezing: bool) {
        if freezing && n.fmask & (1 << c) != 0 {
            return;
        }
        if freeze_mode() == 0.0 && freezing && n.frozen() {
            return;
        }
        if n.counts[c] == 0 {
            n.distinct += 1;
        }
        n.counts[c] += 1;
        n.total += 1;
    }

    fn cool(n: &mut Node, excess: f32, freezing: bool) {
        n.heat += heat_rate() as f32 * (excess - n.heat);
        if freezing && n.heat < freeze_heat() as f32 && n.total as f64 >= freeze_min_visits() {
            let mut m = 0u32;
            for i in 0..A {
                if n.counts[i] > 0 {
                    m |= 1 << i;
                }
            }
            n.fmask |= m;
        }
        let cool = (-n.heat).exp();
        let r = mfreeze_rate() as f32;
        for j in 0..n.ncls as usize {
            n.cls[j].2 += r * (1.0 - n.cls[j].2) * cool;
        }
    }

    fn touch(&mut self, i: u32, p: &[f64; A], c: usize, fresh: bool, gate: f64) -> [f64; A] {
        let freezing = self.freezing;
        let now = self.now;
        let n = &mut self.nodes[i as usize];
        n.last = now;
        n.visits += 1;
        let mut out = *p;
        if n.total > 0 && !fresh {
            let pw = Self::blend(n, p);
            let s_with = -pw[c].log2();
            if n.active {
                out = pw;
                let excess = (s_with - entropy(&pw)).max(0.0) as f32;
                Self::cool(n, excess, freezing);
                if deact() > 0.0 && (n.kind == LINK || deact() > 1.0) && n.kind != PLAIN {
                    // Structure that stops removing misfit goes quiet again.
                    let s_wo = -p[c].log2();
                    n.gain = (n.gain + (s_wo - s_with) as f32).min(gain_cap() as f32);
                    if n.gain < 0.0 {
                        n.active = false;
                    }
                }
            } else {
                let s_wo = -p[c].log2();
                n.gain += (s_wo - s_with) as f32;
                if n.gain as f64 > gate {
                    n.active = true;
                    out = pw;
                }
            }
        }
        Self::add_count(n, c, freezing);
        out
    }

    /// Free capacity is recruited first. Once it is used up, new structure
    /// costs a melt, so only well-visited states with real residual heat recruit.
    fn may_grow(&self, parent_visits: u32) -> bool {
        self.nodes.len() < self.capacity || (parent_visits as f64 >= grow_full() && self.resid >= full_bits())
    }

    fn learn(&mut self, hist: &[u8; HL], len: u8, c: usize, surprise: f64, order: &[u64]) {
        let (keys, n) = Self::keys(hist, len as usize);
        let topic = self.topic_state();
        let dl = self.link_depth(&keys, n);
        let mut p = [1.0 / A as f64; A];
        let mut parent_ok = true;
        let mut parent_vis = u32::MAX;
        for d in 0..=n {
            let warm = -p[c].log2() > spawn_bits();
            let mut plain_ok = false;
            let mut vis = 0;
            match self.get(keys[d]) {
                Some(i) => {
                    p = self.touch(i, &p, c, false, activate_bits());
                    plain_ok = self.nodes[i as usize].active;
                    vis = self.nodes[i as usize].visits;
                }
                None => {
                    if parent_ok && warm && self.may_grow(parent_vis) {
                        let pk = if d > 0 { keys[d - 1] } else { 0 };
                        if let Some(i) = self.create(keys[d], PLAIN, pk, false) {
                            let nd = &mut self.nodes[i as usize];
                            nd.depth = d as u8;
                            nd.ctx[..d].copy_from_slice(&hist[..d]);
                            self.touch(i, &p, c, true, activate_bits());
                        }
                    }
                }
            }
            if let (Some(t), true) = (topic, d <= topic_maxd() as usize) {
                let tk = tkey(keys[d], t);
                match self.get(tk) {
                    Some(i) => {
                        p = self.touch(i, &p, c, false, topic_activate_bits());
                    }
                    None => {
                        let warm_here = -p[c].log2() > spawn_bits();
                        if plain_ok && warm_here && self.may_grow(vis) {
                            if let Some(i) = self.create(tk, TOPIC, keys[d], false) {
                                self.touch(i, &p, c, true, topic_activate_bits());
                            }
                        }
                    }
                }
            }
            parent_ok = plain_ok;
            parent_vis = vis;
        }
        // Links from the deepest state to held traces: misfit where the fast
        // state is uncertain grows shadow links; those that remove it switch on.
        if link_last() > 0.0 {
            // Links are judged against what the shared structure already explains.
            let gp = self.hyps[0].gp as f64;
            p = self.apply_shared(hist, len as usize, p, gp).0;
        }
        if let (Some(dl), true) = (dl, links_off() == 0.0) {
            let uncertain = entropy(&p) > link_h();
            let pvis = self.get(keys[dl]).map(|i| self.nodes[i as usize].visits).unwrap_or(0);
            for &w in order {
                let k = lkey(keys[dl], w);
                match self.get(k) {
                    Some(i) => {
                        p = self.touch(i, &p, c, false, link_activate_bits());
                    }
                    None => {
                        if uncertain && -p[c].log2() > link_spawn_bits() && self.may_grow(pvis) {
                            if let Some(i) = self.create(k, LINK, keys[dl], false) {
                                self.touch(i, &p, c, true, link_activate_bits());
                            }
                        }
                    }
                }
            }
        }
        if shared_off() == 0.0 && trust_rate() > 0.0 {
            self.learn_trust(&keys, n, &p, c);
        }
        if shared_off() == 0.0 {
            self.learn_shared(hist, len as usize, c);
            self.search_step(&keys, n, c, surprise);
        }
    }

    /// Each membership connection learns whether its shared node removes misfit
    /// for this member, relative to the member's own specific expectation.
    fn learn_trust(&mut self, keys: &[u64; D + 1], n: usize, p: &[f64; A], c: usize) {
        let g = (entropy(p) / kent()).min(1.0);
        if g <= 0.0 {
            return;
        }
        let md = (min_depth() as usize).max(1);
        let freezing = self.freezing;
        for d in md..=n {
            let x = match self.get(keys[d]) {
                Some(x) => x,
                None => continue,
            };
            let nc = self.nodes[x as usize].ncls as usize;
            for j in 0..nc {
                let (z, w, f) = self.nodes[x as usize].cls[j];
                let zi = match self.get(z) {
                    Some(zi) => zi,
                    None => continue,
                };
                let zn = &self.nodes[zi as usize];
                if zn.total == 0 {
                    continue;
                }
                let u = zn.distinct.max(1) as f64 * kesc();
                let conf = zn.total as f64 / (zn.total as f64 + u);
                let a = (beta() * w as f64 * g * conf).min(1.0);
                let q = zn.counts[c] as f64 / zn.total as f64;
                let gain = ((1.0 - a) * p[c] + a * q).log2() - p[c].log2();
                let fe = if freezing { f } else { 0.0 };
                let t = &mut self.nodes[x as usize].trust[j];
                *t = (*t + (trust_rate() * gain) as f32 * (1.0 - fe)).clamp(0.0, 1.0);
            }
        }
    }

    fn learn_shared(&mut self, hist: &[u8], len: usize, c: usize) {
        let mut acts = Vec::new();
        self.shared_acts(hist, len, 1.0, 1.0, &mut acts);
        // Successors that should exist: those of live shared nodes woken a step ago.
        let mut succ: Vec<u64> = Vec::new();
        if len >= 2 {
            let mut prev = Vec::new();
            self.shared_acts(&hist[1..], len - 1, 1.0, 1.0, &mut prev);
            for (z, _) in prev {
                if let Some(zi) = self.get(z) {
                    if self.nodes[zi as usize].kind == SHARED {
                        succ.push(chkey(z, hist[0]));
                    }
                }
            }
        }
        let freezing = self.freezing;
        let now = self.now;
        for (k, _) in acts {
            let i = match self.get(k) {
                Some(i) => i,
                None if succ.contains(&k) => match self.create(k, CHAIN, 0, true) {
                    Some(i) => i,
                    None => continue,
                },
                None => continue,
            };
            let n = &mut self.nodes[i as usize];
            n.last = now;
            n.visits += 1;
            if n.total > 0 {
                let q = (n.counts[c] as f64 / n.total as f64).max(1.0 / 1024.0);
                let mut h = 0.0;
                for x in 0..A {
                    if n.counts[x] > 0 {
                        let r = n.counts[x] as f64 / n.total as f64;
                        h -= r * r.log2();
                    }
                }
                let excess = (-q.log2() - h).max(0.0) as f32;
                Self::cool(n, excess, freezing);
            }
            Self::add_count(n, c, freezing);
            if shared_topic() > 0.0 {
                if let Some(t) = self.topic_state() {
                    let nd = &self.nodes[i as usize];
                    if nd.total > 1 {
                        let mut q = [0.0; A];
                        let tot = (nd.total - 1) as f64;
                        for x in 0..A {
                            q[x] = 0.97 * (nd.counts[x] as f64 - if x == c { 1.0 } else { 0.0 }).max(0.0) / tot + 0.03 / A as f64;
                        }
                        let tk = tkey(k, t);
                        match self.get(tk) {
                            Some(j) => {
                                self.touch(j, &q, c, false, topic_activate_bits());
                            }
                            None => {
                                if let Some(j) = self.create(tk, TOPIC, k, false) {
                                    self.touch(j, &q, c, true, topic_activate_bits());
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    fn eligible(&self, i: u32) -> bool {
        let n = &self.nodes[i as usize];
        n.kind == PLAIN && n.depth as f64 >= min_depth() && n.visits as f64 >= min_obs()
    }

    fn search_step(&mut self, keys: &[u64; D + 1], n: usize, c: usize, surprise: f64) {
        let md = (min_depth() as usize).max(1);
        for d in md..=n {
            let x = match self.get(keys[d]) {
                Some(x) => x,
                None => continue,
            };
            if !self.eligible(x) {
                continue;
            }
            let (vis, ls, nk) = {
                let nd = &self.nodes[x as usize];
                (nd.visits, nd.last_search, nd.ncls)
            };
            if vis % 16 == 0 && nk > 0 {
                self.reweigh(x);
            }
            if surprise > search_bits() && (nk as usize) < MAXC && self.now.wrapping_sub(ls) >= 16 {
                let cands = self.ring[c].clone();
                self.search_in(x, &cands);
            }
            self.ring_push(c, keys[d]);
        }
    }

    fn ring_push(&mut self, s: usize, k: u64) {
        let r = &mut self.ring[s];
        if r.contains(&k) {
            return;
        }
        if r.len() < RING {
            r.push(k);
        } else {
            r[self.ring_pos[s]] = k;
            self.ring_pos[s] = (self.ring_pos[s] + 1) % RING;
        }
    }

    fn sim1(&self, x: u32, y: u32) -> f32 {
        let (a, b) = (self.nodes[x as usize].norm(), self.nodes[y as usize].norm());
        (0..A).map(|i| a[i].min(b[i])).sum()
    }

    fn child(&self, x: u32, s: u8) -> Option<u32> {
        let n = &self.nodes[x as usize];
        let d = (n.depth as usize).min(D - 1);
        let mut ctx = [0u8; D];
        ctx[0] = s;
        ctx[1..=d].copy_from_slice(&n.ctx[..d]);
        self.get(ctx_key(&ctx[..=d]))
    }

    /// Two-step likeness: followed by the same characters, then the same again.
    fn sim2(&self, x: u32, y: u32) -> f32 {
        let (a, b) = (self.nodes[x as usize].norm(), self.nodes[y as usize].norm());
        let mut s = 0.0;
        for i in 0..A {
            let m = a[i].min(b[i]);
            if m <= 0.0 {
                continue;
            }
            let k = match (self.child(x, i as u8), self.child(y, i as u8)) {
                (Some(kx), Some(ky)) if self.nodes[kx as usize].total > 0 && self.nodes[ky as usize].total > 0 => self.sim1(kx, ky),
                _ => 0.5,
            };
            s += m * k;
        }
        s
    }

    fn suffix_related(&self, x: u32, y: u32) -> bool {
        let (a, b) = (&self.nodes[x as usize], &self.nodes[y as usize]);
        let k = (a.depth.min(b.depth)) as usize;
        a.ctx[..k] == b.ctx[..k]
    }

    fn has_cls(&self, x: u32, z: u64) -> bool {
        let n = &self.nodes[x as usize];
        n.cls[..n.ncls as usize].iter().any(|k| k.0 == z)
    }

    /// Heat spreads from a hot node, through the input it just took, to nodes
    /// that recently took it; it binds to a shared node with the most alike.
    fn search_in(&mut self, x: u32, cands: &[u64]) -> bool {
        self.nodes[x as usize].last_search = self.now;
        if self.nodes[x as usize].ncls as usize >= MAXC {
            return false;
        }
        let mut best: Option<u32> = None;
        let mut best_sim = theta_join() as f32;
        for &yk in cands {
            let y = match self.get(yk) {
                Some(y) => y,
                None => continue,
            };
            if y == x || !self.eligible(y) {
                continue;
            }
            let xn = &self.nodes[x as usize];
            if xn.cls[..xn.ncls as usize].iter().any(|k| self.has_cls(y, k.0)) {
                continue;
            }
            let sm = self.sim2(x, y);
            if sm > best_sim && !self.suffix_related(x, y) {
                best_sim = sm;
                best = Some(y);
            }
        }
        let y = match best {
            Some(y) => y,
            None => return false,
        };
        let tj = theta_join() as f32;
        let yz: Vec<u64> = { let n = &self.nodes[y as usize]; n.cls[..n.ncls as usize].iter().map(|k| k.0).collect() };
        for z in yz {
            if let Some(zi) = self.get(z) {
                let sm = self.sim1(x, zi);
                if sm > tj {
                    self.join(x, z, sm);
                    return true;
                }
            }
        }
        let xz: Vec<u64> = { let n = &self.nodes[x as usize]; n.cls[..n.ncls as usize].iter().map(|k| k.0).collect() };
        for z in xz {
            if let Some(zi) = self.get(z) {
                let sm = self.sim1(y, zi);
                if sm > tj && (self.nodes[y as usize].ncls as usize) < MAXC {
                    self.join(y, z, sm);
                    return true;
                }
            }
        }
        if self.nodes[y as usize].ncls as usize >= MAXC {
            return false;
        }
        let zk = mix(0x5AA5, self.next_gid);
        self.next_gid += 1;
        let (px, py) = (self.nodes[x as usize].pinned, self.nodes[y as usize].pinned);
        self.nodes[x as usize].pinned = true;
        self.nodes[y as usize].pinned = true;
        let z = self.create(zk, SHARED, 0, true);
        self.nodes[x as usize].pinned = px;
        self.nodes[y as usize].pinned = py;
        let z = match z {
            Some(z) => z,
            None => return false,
        };
        let (a, b) = (self.nodes[x as usize].norm(), self.nodes[y as usize].norm());
        {
            let zn = &mut self.nodes[z as usize];
            for i in 0..A {
                let v = (a[i] + b[i]).round() as u32;
                zn.counts[i] = v;
                zn.total += v;
                if v > 0 {
                    zn.distinct += 1;
                }
            }
            zn.last = self.now;
        }
        self.join(x, zk, best_sim);
        self.join(y, zk, best_sim);
        true
    }

    fn join(&mut self, x: u32, z: u64, w: f32) {
        let n = &mut self.nodes[x as usize];
        let j = n.ncls as usize;
        n.cls[j] = (z, w, 0.0);
        n.trust[j] = 1.0;
        n.ncls += 1;
        if let Some(zi) = self.get(z) {
            self.nodes[zi as usize].members += 1;
        }
        self.joins += 1;
    }

    /// Re-weigh membership connections; unfrozen ones that no longer fit melt.
    fn reweigh(&mut self, x: u32) {
        let n = self.nodes[x as usize].ncls as usize;
        let ks: Vec<(u64, f32, f32)> = self.nodes[x as usize].cls[..n].to_vec();
        let mut keep: Vec<(u64, f32, f32)> = Vec::new();
        for (z, w, f) in ks {
            let zi = match self.get(z) {
                Some(zi) if self.nodes[zi as usize].kind == SHARED => zi,
                _ => {
                    self.leaves += 1;
                    continue;
                }
            };
            let sm = self.sim1(x, zi);
            let fe = if self.freezing { f } else { 0.0 };
            if sm < theta_leave() as f32 && fe < 0.5 {
                let zn = &mut self.nodes[zi as usize];
                zn.members = zn.members.saturating_sub(1);
                self.leaves += 1;
            } else {
                keep.push((z, if sm > 0.0 { sm } else { w }, f));
            }
        }
        let nd = &mut self.nodes[x as usize];
        let old: Vec<(u64, f32)> = (0..nd.ncls as usize).map(|j| (nd.cls[j].0, nd.trust[j])).collect();
        nd.ncls = keep.len() as u8;
        for (j, k) in keep.into_iter().enumerate() {
            nd.trust[j] = old.iter().find(|o| o.0 == k.0).map(|o| o.1).unwrap_or(1.0);
            nd.cls[j] = k;
        }
    }

    // ------------------------------------------------------------- readings

    fn eh(&self) -> f64 {
        if hyps_off() > 0.0 { 0.0 } else { self.rate_h.clamp(eps_min(), eps_max()) }
    }
    fn es(&self) -> f64 {
        if hyps_off() > 0.0 { 0.0 } else { self.rate_s.clamp(eps_min(), eps_max()) }
    }
    fn ea(&self) -> f64 {
        if hyps_off() > 0.0 || subst_off() > 0.0 { 0.0 } else { self.rate_a.clamp(eps_min(), eps_max()) }
    }

    fn prepare(&mut self) {
        if self.ready {
            return;
        }
        let order = self.trace_order();
        self.hd.clear();
        self.hg.clear();
        let mut main = [0.0; A];
        let z: f64 = self.hyps.iter().map(|h| h.w).sum();
        for h in &self.hyps {
            let (d, g) = self.dist(&h.hist, h.len, &order, h.gp);
            self.hg.push(g);
            for i in 0..A {
                main[i] += h.w / z * d[i];
            }
            self.hd.push(d);
        }
        // Per-topic-state predictions of the leading reading (char-rate switching).
        self.pt.clear();
        if self.topic.k > 1 && char_switch() > 0.0 && topic_off() == 0.0 {
            let top = self.hyps[0];
            let (keys, n) = Self::keys(&top.hist, top.len as usize);
            for s in 0..self.topic.k {
                let d = self.chain_t(&keys, n, Some(s));
                self.pt.push(d);
            }
        }
        // Anticipation: the states the leading reading expects to reach next.
        self.skipd.clear();
        let mut skip = main;
        let es = self.es();
        if es > 0.0 {
            let top = self.hyps[0];
            let d0 = self.hd[0];
            let mut ord: Vec<usize> = (0..A).collect();
            ord.sort_by(|&a, &b| d0[b].partial_cmp(&d0[a]).unwrap().then(a.cmp(&b)));
            let mut zs = 0.0;
            skip = [0.0; A];
            for &x in ord.iter().take(SKIP_K) {
                let hx = top.push(x as u8);
                let (dx, _) = self.dist(&hx.hist, hx.len, &order, self.hg[0]);
                for i in 0..A {
                    skip[i] += d0[x] * dx[i];
                }
                zs += d0[x];
                self.skipd.push((x as u8, d0[x], dx));
            }
            for v in skip.iter_mut() {
                *v /= zs;
            }
            for e in self.skipd.iter_mut() {
                e.1 /= zs;
            }
        }
        // What a glitch looks like: uniform, or the root state's own expectation.
        self.gl = if glitch_root() > 0.0 {
            Self::blend(&self.nodes[0], &[1.0 / A as f64; A])
        } else {
            [1.0 / A as f64; A]
        };
        let eh = self.eh() + self.ea();
        let mut s = 0.0;
        for i in 0..A {
            let v = (1.0 - eh - es) * main[i] + eh * self.gl[i] + es * skip[i];
            self.mixp[i] = v.max(1e-9);
            s += self.mixp[i];
        }
        for v in self.mixp.iter_mut() {
            *v /= s;
        }
        self.ready = true;
    }

    fn update_hyps(&mut self, c: usize) {
        let (eh, es, ea) = (self.eh(), self.es(), self.ea());
        let mut next: Vec<Hyp> = Vec::with_capacity(4 * NH);
        let add = |h: Hyp, next: &mut Vec<Hyp>| {
            if !(h.w > 0.0) {
                return;
            }
            if let Some(o) = next.iter_mut().find(|o| o.same(&h)) {
                if h.w > o.w {
                    o.how = h.how;
                }
                o.w += h.w;
            } else {
                next.push(h);
            }
        };
        for (i, h) in self.hyps.iter().enumerate() {
            let d = &self.hd[i];
            let mut g = h.push(c as u8);
            g.gp = self.hg[i];
            g.w = h.w * (1.0 - eh - es - ea) * d[c];
            g.how = 0;
            add(g, &mut next);
            if eh > 0.0 {
                // The held state carries over the glitch: the input did not move it.
                let mut g = *h;
                g.w = h.w * eh * self.gl[c];
                g.how = 1;
                add(g, &mut next);
            }
            if i == 0 {
                for &(x, px, ref dx) in &self.skipd {
                    // The anticipated state was reached; c follows it.
                    let mut g = h.push(x).push(c as u8);
                    g.w = h.w * es * px * dx[c];
                    g.how = 2;
                    add(g, &mut next);
                    if ea > 0.0 {
                        // The state moved on by its own anticipation; the input did not move it.
                        let mut g = h.push(x);
                        g.w = h.w * ea * px * self.gl[c];
                        g.how = 3;
                        add(g, &mut next);
                    }
                }
            }
        }
        let z: f64 = next.iter().map(|h| h.w).sum();
        if !(z > 0.0) || !z.is_finite() {
            let h = self.hyps[0].push(c as u8);
            self.hyps = vec![Hyp { w: 1.0, how: 0, ..h }];
            return;
        }
        let zh: f64 = next.iter().filter(|h| h.how == 1).map(|h| h.w).sum();
        let zs: f64 = next.iter().filter(|h| h.how == 2).map(|h| h.w).sum();
        let za: f64 = next.iter().filter(|h| h.how == 3).map(|h| h.w).sum();
        self.rate_h += (zh / z - self.rate_h) / noise_tau();
        self.rate_s += (zs / z - self.rate_s) / noise_tau();
        self.rate_a += (za / z - self.rate_a) / noise_tau();
        next.sort_by(|a, b| b.w.partial_cmp(&a.w).unwrap());
        next.truncate(NH);
        let wmax = next[0].w;
        next.retain(|h| h.w > wmax * 1e-6);
        let z: f64 = next.iter().map(|h| h.w).sum();
        for h in next.iter_mut() {
            h.w /= z;
        }
        self.hyps = next;
    }

    // ------------------------------------------------------------- slow machines

    /// Char-rate evidence: would the fast nodes keyed to another topic state
    /// have fitted this character better? Pressure builds only where some held
    /// state's structure resolves the misfit; noise fits none of them.
    fn topic_char(&mut self, c: usize) {
        if self.pt.is_empty() {
            return;
        }
        let t = &mut self.topic;
        let cur = t.cur;
        let lc = self.pt[cur][c].log2();
        let mut best = (char_switch_bits(), usize::MAX);
        for s in 0..t.k {
            let l = self.pt[s][c].log2() - lc;
            t.cpress[s] = char_leak() * t.cpress[s] + l;
            if s != cur && t.cpress[s] > best.0 {
                best = (t.cpress[s], s);
            }
        }
        if char_belief() > 0.0 {
            let mut z = 0.0;
            for s in 0..t.k {
                t.belief[s] *= self.pt[s][c].powf(char_belief());
                z += t.belief[s];
            }
            let sh = topic_share() / 5.0;
            for s in 0..t.k {
                t.belief[s] = if z > 0.0 { (1.0 - sh) * t.belief[s] / z + sh / t.k as f64 } else { 1.0 / t.k as f64 };
            }
        }
        if best.1 != usize::MAX {
            t.cur = best.1;
            t.switches += 1;
            t.char_switches += 1;
            t.cpress = [0.0; KMAX];
            t.pressure = [0.0; KMAX + 1];
            t.belief[t.cur] = t.belief[t.cur].max(0.5);
            let z: f64 = t.belief[..t.k].iter().sum();
            for s in 0..t.k {
                t.belief[s] /= z;
            }
        }
    }

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
        // How well the word is known at all: a word no state knows (noise, or new)
        // gives no evidence for a switch; a word one state knows well is resolvable.
        let known = t.global.get(&w).copied().unwrap_or(0) as f64;
        for s in 0..t.k {
            let f = t.fit(s, w);
            t.pressure[s] = topic_leak() * t.pressure[s] + (f - fc);
            let sharp = f - fc > sharp_bits() && known >= sharp_min();
            if s != t.cur && (t.pressure[s] > topic_switch_bits() || sharp) && t.pressure[s].max(f - fc) > best.0 {
                best = (t.pressure[s].max(f - fc), s);
            }
        }
        let cur = t.cur;
        let excess = -fc - t.avg[cur];
        t.avg[cur] += topic_avg_rate() * (-fc - t.avg[cur]);
        t.pressure[KMAX] = (topic_leak() * t.pressure[KMAX] + excess).max(0.0);
        if best.1 != usize::MAX {
            t.cur = best.1;
            t.switches += 1;
            t.pressure = [0.0; KMAX + 1];
            t.cpress = [0.0; KMAX];
        } else if learning && topic_k() > 1.0 && t.pressure[KMAX] > topic_new_bits() {
            let s = if t.k < (topic_k() as usize).min(KMAX) {
                t.k += 1;
                t.k - 1
            } else {
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
            t.cpress = [0.0; KMAX];
        }
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
        // The word becomes a held trace, as strong as it is rare; traces fade as words pass.
        let sal = -t.pglobal(w).log2() as f32;
        for tr in self.traces.iter_mut() {
            tr.1 *= trace_decay() as f32;
        }
        if let Some(tr) = self.traces.iter_mut().find(|x| x.0 == w) {
            tr.1 = tr.1.max(sal);
        } else if self.traces.len() < (tmax() as usize).min(TMAX) {
            self.traces.push((w, sal));
        } else {
            let (j, m) = self.traces.iter().enumerate().map(|(j, x)| (j, x.1)).fold((0, f32::INFINITY), |a, b| if b.1 < a.1 { b } else { a });
            if sal > m {
                self.traces[j] = (w, sal);
            }
        }
        if learning {
            *t.words.entry((t.cur as u8, w)).or_insert(0) += 1;
            t.totals[t.cur] += 1;
            *t.global.entry(w).or_insert(0) += 1;
            t.gtotal += 1;
        }
    }

    // ------------------------------------------------------------- quiet

    /// Leave-one-out bits a shadow's own connections would remove from its parent's expectation.
    fn settle_gain(&self, i: usize) -> Option<f64> {
        let n = &self.nodes[i];
        let pi = self.get(n.pkey)?;
        let pn = &self.nodes[pi as usize];
        if pn.total == 0 || n.total < 2 {
            return None;
        }
        let pu = pn.distinct.max(1) as f64;
        let mut g = 0.0;
        let u = n.distinct.max(1) as f64;
        for c in 0..A {
            let k = n.counts[c] as f64;
            if k == 0.0 {
                continue;
            }
            let q = (pn.counts[c] as f64 + pu / A as f64) / (pn.total as f64 + pu);
            let loo = ((k - 1.0) + u * q) / (n.total as f64 - 1.0 + u);
            g += k * (loo.log2() - q.log2());
        }
        Some(g)
    }
}

fn push_max(v: &mut Vec<(u64, f32)>, k: u64, a: f32) {
    for x in v.iter_mut() {
        if x.0 == k {
            if a > x.1 {
                x.1 = a;
            }
            return;
        }
    }
    v.push((k, a));
}

impl Model {
    pub fn held_topic(&self) -> usize {
        if std::env::var("DIAG_BELIEF").is_ok() {
            let t = &self.topic;
            return (0..t.k.max(1)).max_by(|&a, &b| t.belief[a].partial_cmp(&t.belief[b]).unwrap()).unwrap_or(0);
        }
        self.topic.cur
    }
}

impl Automaton for Model {
    fn name(&self) -> &str {
        "m006-state-with-assemblies"
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
            let order = self.trace_order();
            let e = self.energy;
            self.resid = e;
            self.learn(&top.hist, top.len, c, e, &order);
        }
        self.topic_char(c);
        self.update_hyps(c);
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

    /// Thinking without data. Leftover heat settles where it can: (1) shadow
    /// structure is re-evaluated against what its own connections now hold and
    /// switches on where it would remove its parent's misfit; (2) hot,
    /// uncertain context nodes search every node that took the same input for
    /// shared partners.
    fn quiet(&mut self, steps: usize) {
        if !self.learning || quiet_off() > 0.0 {
            return;
        }
        let mut cands: Vec<(u32, usize)> = Vec::new();
        for (i, n) in self.nodes.iter().enumerate() {
            let kinds = match quiet_kinds() as u32 { 0 => matches!(n.kind, PLAIN | TOPIC | LINK), 1 => n.kind == LINK, _ => matches!(n.kind, TOPIC | LINK) };
            if !n.active && (n.total as f64) >= quiet_min_total() && kinds {
                cands.push((n.total, i));
            }
        }
        cands.sort_by(|a, b| b.0.cmp(&a.0).then(a.1.cmp(&b.1)));
        let mut budget = steps;
        for &(_, i) in &cands {
            if budget == 0 {
                break;
            }
            budget -= 1;
            let gate = match self.nodes[i].kind {
                PLAIN => activate_bits(),
                TOPIC => topic_activate_bits(),
                _ => link_activate_bits(),
            };
            if let Some(g) = self.settle_gain(i) {
                if g > gate {
                    self.nodes[i].active = true;
                    self.quiet_on += 1;
                }
            }
        }
        if shared_off() > 0.0 || quiet_search() == 0.0 {
            return;
        }
        let mut hot: Vec<(f32, u32)> = Vec::new();
        let mut by_sym: Vec<Vec<u64>> = vec![Vec::new(); A];
        for (i, n) in self.nodes.iter().enumerate() {
            if self.eligible(i as u32) {
                by_sym[n.ctx[0] as usize].push(n.key);
                let v = n.norm();
                let mut p = [0.0f64; A];
                for j in 0..A {
                    p[j] = v[j] as f64;
                }
                let h = entropy(&p) as f32;
                if (n.ncls as usize) < MAXC && h >= 1.0 {
                    hot.push((n.heat + h, i as u32));
                }
            }
        }
        hot.sort_by(|a, b| b.0.partial_cmp(&a.0).unwrap().then(a.1.cmp(&b.1)));
        for &(_, x) in hot.iter().take(budget) {
            let s = self.nodes[x as usize].ctx[0] as usize;
            let cands = by_sym[s].clone();
            if self.search_in(x, &cands) {
                self.quiet_joins += 1;
            }
        }
    }

    fn energy(&self) -> f64 {
        self.energy
    }

    fn stats(&self) -> Vec<(String, f64)> {
        let mut st = [0usize; 5];
        let mut active = 0;
        let mut frozen = 0;
        let mut members = 0;
        let mut links_on = 0;
        for n in &self.nodes {
            st[n.kind as usize] += 1;
            if n.active {
                active += 1;
            }
            if n.frozen() {
                frozen += 1;
            }
            members += n.ncls as usize;
            if n.kind == LINK && n.active {
                links_on += 1;
            }
        }
        vec![
            ("units".into(), self.nodes.len() as f64),
            ("active".into(), active as f64),
            ("frozen".into(), frozen as f64),
            ("plain".into(), st[0] as f64),
            ("topic_keyed".into(), st[1] as f64),
            ("links".into(), st[2] as f64),
            ("links_on".into(), links_on as f64),
            ("shared".into(), st[3] as f64),
            ("shared_succ".into(), st[4] as f64),
            ("memberships".into(), members as f64),
            ("joins".into(), self.joins as f64),
            ("leaves".into(), self.leaves as f64),
            ("evictions".into(), self.evictions as f64),
            ("thawed".into(), self.thawed as f64),
            ("refused".into(), self.refused as f64),
            ("topic_states".into(), self.topic.k as f64),
            ("topic_switches".into(), self.topic.switches as f64),
            ("topic_char_switches".into(), self.topic.char_switches as f64),
            ("rate_hold".into(), self.rate_h),
            ("rate_anticipate".into(), self.rate_s),
            ("rate_self".into(), self.rate_a),
            ("hyps".into(), self.hyps.len() as f64),
            ("quiet_on".into(), self.quiet_on as f64),
            ("quiet_joins".into(), self.quiet_joins as f64),
        ]
    }

    fn set_freezing(&mut self, on: bool) -> bool {
        self.freezing = on;
        true
    }
}
