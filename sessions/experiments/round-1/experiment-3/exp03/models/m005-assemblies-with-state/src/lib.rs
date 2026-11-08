//! m005-assemblies-with-state: m003's shared assemblies plus held state.
//! See FINDINGS.md. Additions over m003: a chunker and a slow held-chunk
//! machine; conflict traces on uncertain context cells; held-context
//! bindings ("twins") formed when a held chunk would compress a cell's
//! traces; release of a held state when its binding misfits; quiet-period
//! binding and pruning; value-weighted melting with idle thaw; an optional
//! topic machine (off by default). The m003 description follows.
//!
//! m003-shared-assemblies: shared assemblies, with real melting.
//!
//! The automaton is one population of cells under a hard capacity.
//!
//! * **Context cells** form a state machine driven by the input: on each
//!   character the active context cell of depth d hands activity to its
//!   successor of depth d+1 for that character (a transition connection). The
//!   active context cells at any moment are the suffixes of the recent input
//!   up to depth `D`.
//! * **Shared cells.** When a hot context cell cannot settle on its own, its
//!   heat spreads to other cells that recently took the same input, and it
//!   binds (a membership connection) to a *shared cell* if what follows them is
//!   alike over two steps. A shared cell belongs to many state machines at
//!   once: it is activated by every member, learns from what follows every
//!   member, and grows a one-step successor per character. So "the
//!   dog" and "the cow" come to share part of their representation, and what
//!   "the cow" taught the shared cells (that "runs" can follow) is available to
//!   "the dog".
//! * **Freezing lives on connections.** Transition connections, a cell's output
//!   connections and membership connections each carry a freeze level that
//!   rises as the episode they served cools (the cell's misfit falls). Cells
//!   themselves never freeze.
//! * **Real melting under fixed capacity.** When a cell is hot, its unfrozen
//!   output connections weaken before the new experience is added. When a new
//!   cell is needed and the population is full, an existing leaf cell is melted
//!   and reused: its incoming transition is cut and rewired elsewhere. Frozen
//!   connections resist both. `set_freezing(false)` makes every connection
//!   plastic (victims are then chosen by recency alone).
//!
//! * **Heat.** A cell's misfit is the surprise of what arrived beyond the
//!   uncertainty the cell already holds (its own entropy), so irreducible
//!   variation does not heat it. The region's temperature is a running mean of
//!   the active cells' misfit. Heat loosens prediction: a hot region trusts its
//!   specific cells less and holds a small uniform floor.
//! * **Quiet.** With no input, the hottest uncertain context cells keep
//!   searching for shared partners among every cell that took the same input.
//!
//! Prediction comes from the active cells' own output connections, combined
//! in order: shared cells (and their one-step successors) first, gated so that
//! they speak at branch points (activation ∝ the entropy of the most specific
//! active context cell), then context cells from deepest to shallowest. Each
//! takes a share of the remaining mass equal to activation × confidence, and
//! whatever is left is spread uniformly. Confidence is n / (n + k·u·e^(γT)):
//! the Witten–Bell escape weight, scaled by heat. That part is equivalent to a
//! counting model's smoothing and is declared as such in FINDINGS.md.

use hsm_core::{sym, Automaton, Rng, A};

const NONE: u32 = u32::MAX;

/// Maximum depth of the context state machine (characters of history).
const D: usize = 6;
/// Most shared cells a context cell can belong to.
const MAX_CLASSES: usize = 2;
/// Recent-input rings used to find candidate partners (heat spreading via the input).
const RING: usize = 48;
const FNV0: u32 = 0x811c_9dc5;
/// Longest chunk before the chunker closes it regardless.
const MAX_CHUNK: u16 = 32;

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
enum Kind {
    Context,
    Shared,
    Chain,
    /// A held-context binding: a context cell's outputs keyed on a held word.
    Twin,
}

/// One remembered episode at a conflicted cell: what arrived, and which words
/// the slow context machine held at that moment.
#[derive(Clone)]
struct Trace {
    out: u8,
    held: Vec<u32>,
}

/// The slow topic machine: a few held states, each a count of the chunks
/// that were closed while it held.
#[derive(Clone, Default)]
struct Topic {
    counts: hsm_core::FastMap<u32, f32>,
    n: f32,
}

/// Token for "the topic machine holds state k" in the held set.
const TOPIC_TOKEN: u32 = 0x7ff0_0000;

/// A held chunk: the slow machine's state element. `word` identifies the
/// chunk (the chunker's state when it closed), `at` when it was last held.
#[derive(Clone, Copy)]
struct Held {
    word: u32,
    at: u32,
}

#[derive(Clone)]
struct Cell {
    out: [f32; A],
    n: f32,
    next: Vec<(u8, u32)>,
    parent: u32,
    sym: u8,
    depth: u8,
    kind: Kind,
    alive: bool,
    /// Freeze of the incoming transition connection.
    f_in: f32,
    /// Freeze of the output connections.
    f_out: f32,
    /// Local heat: recent misfit beyond what the cell itself expects.
    heat: f32,
    last: u32,
    last_search: u32,
    obs: u32,
    /// Membership connections (context cells): (shared cell, weight, freeze).
    classes: Vec<(u32, f32, f32)>,
    /// Members (shared cells).
    members: Vec<u32>,
    /// Conflict traces (context cells that stay uncertain).
    traces: Vec<Trace>,
    trace_pos: u16,
    /// Held-context bindings of this context cell: (held word, twin cell).
    twins: Vec<(u32, u32)>,
    /// Traces gathered since the last binding search.
    since_bind: u16,
    /// Twin cells: the held word they are keyed on, and their running gain
    /// (bits saved over their parent cell).
    word: u32,
    gain: f32,
}

impl Cell {
    fn new(kind: Kind, parent: u32, sym: u8, depth: u8, now: u32) -> Self {
        Cell {
            out: [0.0; A],
            n: 0.0,
            next: Vec::new(),
            parent,
            sym,
            depth,
            kind,
            alive: true,
            f_in: 0.0,
            f_out: 0.0,
            heat: 0.0,
            last: now,
            last_search: 0,
            obs: 0,
            classes: Vec::new(),
            members: Vec::new(),
            traces: Vec::new(),
            trace_pos: 0,
            twins: Vec::new(),
            since_bind: 0,
            word: 0,
            gain: 0.0,
        }
    }
    #[inline]
    fn child(&self, s: u8) -> u32 {
        for &(k, c) in &self.next {
            if k == s {
                return c;
            }
        }
        NONE
    }
    fn distinct(&self) -> f32 {
        self.out.iter().filter(|&&x| x >= 0.5).count() as f32
    }
    fn entropy(&self) -> f32 {
        if self.n <= 0.0 {
            return 0.0;
        }
        let mut h = 0.0;
        for &x in &self.out {
            if x > 0.0 {
                let p = x / self.n;
                h -= p * p.log2();
            }
        }
        h
    }
}

/// An active entry: a cell, its activation, its place in the specificity
/// order, and (for shared chains) how far along the chain it is.
#[derive(Clone, Copy)]
struct Active {
    cell: u32,
    a: f32,
    pos: f32,
    len: u8,
}

#[derive(Clone)]
pub struct Params {
    pub beta_root: f32,
    pub beta_chain: f32,
    pub theta_join: f32,
    pub theta_leave: f32,
    pub search_bits: f32,
    pub min_obs: u32,
    pub melt_rate: f32,
    pub freeze_rate: f32,
    pub resist: f32,
    pub redundant: f32,
    pub kesc: f32,
    pub kent: f32,
    pub ufloor: f32,
    pub uhalf: f32,
    pub grow: u32,
    pub quiet_h: f32,
    pub min_depth: u8,
    pub gamma: f32,
    pub temp_decay: f32,
    pub chain: u8,
    /// Held chunks: boundary entropy (bits), how many chunks the slow machine holds.
    pub hb: f32,
    pub held_k: usize,
    /// Conflict: entropy above which a cell keeps traces; traces kept per cell.
    pub h_conf: f32,
    pub traces: usize,
    /// Binding: bits a held chunk must save on the cell's traces; traces between searches.
    pub bind_bits: f32,
    pub bind_every: u16,
    pub max_twins: usize,
    /// Off switch for held state (ablation).
    pub held_on: f32,
    pub held_mode: f32,
    pub held_depth: f32,
    /// Twins speak only while their running gain stays above this.
    pub twin_gate: f32,
    pub rival_on: f32,
    pub conf_span: f32,
    pub gate_n: f32,
    pub min_chunk: f32,
    pub gate_d: f32,
    pub share_d: u8,
    pub proof_from: f32,
    pub proof_bits: f32,
    pub proof_cap: f32,
    pub twin_top: f32,
    pub bind_heat: f32,
    pub quiet_from: f32,
    pub same: f32,
    pub held_max: f32,
    pub release_bits: f32,
    pub bound_k: usize,
    pub twin_min_obs: u32,
    pub twin_melt: f32,
    pub rival_gain: f32,
    pub rival_sim: f32,
    pub bound_on: f32,
    pub coinc: f32,
    pub select: f32,
    pub value_on: f32,
    pub keep_gain: f32,
    pub quiet_bind: f32,
    pub wide_cost: f32,
    pub quiet_prune: f32,
    pub use_w: f32,
    pub thaw: f32,
    pub rec_w: f32,
    pub young_w: f32,
    pub young_obs: f32,
    pub full_at: f32,
    pub recruit_heat: f32,
    pub depth_w: f32,
    pub info_w: f32,
    pub topic_on: f32,
    pub t_alpha: f32,
    pub switch_bits: f32,
    pub press_bits: f32,
    pub press_decay: f32,
    pub recruit_bits: f32,
    pub topic_k: usize,
    pub topic_min_n: f32,
    pub ex_margin: f32,
    pub ex_floor: f32,
    pub ex_decay: f32,
    pub fast_min_g: f32,
    pub t_maxfreq: f32,
    pub t_recent: f32,
}

impl Params {
    /// Set a parameter by name (for sweeps on seed 1).
    pub fn set(&mut self, k: &str, v: f64) {
        match k {
            "beta_root" => self.beta_root = v as f32,
            "beta_chain" => self.beta_chain = v as f32,
            "theta_join" => self.theta_join = v as f32,
            "theta_leave" => self.theta_leave = v as f32,
            "search_bits" => self.search_bits = v as f32,
            "min_obs" => self.min_obs = v as u32,
            "melt_rate" => self.melt_rate = v as f32,
            "freeze_rate" => self.freeze_rate = v as f32,
            "resist" => self.resist = v as f32,
            "redundant" => self.redundant = v as f32,
            "chain" => self.chain = v as u8,
            "kesc" => self.kesc = v as f32,
            "kent" => self.kent = v as f32,
            "ufloor" => self.ufloor = v as f32,
            "uhalf" => self.uhalf = v as f32,
            "grow" => self.grow = v as u32,
            "quiet_h" => self.quiet_h = v as f32,
            "min_depth" => self.min_depth = v as u8,
            "gamma" => self.gamma = v as f32,
            "temp_decay" => self.temp_decay = v as f32,
            "hb" => self.hb = v as f32,
            "held_k" => self.held_k = v as usize,
            "h_conf" => self.h_conf = v as f32,
            "traces" => self.traces = v as usize,
            "bind_bits" => self.bind_bits = v as f32,
            "bind_every" => self.bind_every = v as u16,
            "max_twins" => self.max_twins = v as usize,
            "held_on" => self.held_on = v as f32,
            "held_mode" => self.held_mode = v as f32,
            "held_depth" => self.held_depth = v as f32,
            "twin_gate" => self.twin_gate = v as f32,
            "rival_on" => self.rival_on = v as f32,
            "conf_span" => self.conf_span = v as f32,
            "gate_n" => self.gate_n = v as f32,
            "min_chunk" => self.min_chunk = v as f32,
            "gate_d" => self.gate_d = v as f32,
            "share_d" => self.share_d = v as u8,
            "proof_from" => self.proof_from = v as f32,
            "proof_bits" => self.proof_bits = v as f32,
            "proof_cap" => self.proof_cap = v as f32,
            "twin_top" => self.twin_top = v as f32,
            "bind_heat" => self.bind_heat = v as f32,
            "quiet_from" => self.quiet_from = v as f32,
            "same" => self.same = v as f32,
            "held_max" => self.held_max = v as f32,
            "release_bits" => self.release_bits = v as f32,
            "bound_k" => self.bound_k = v as usize,
            "twin_min_obs" => self.twin_min_obs = v as u32,
            "twin_melt" => self.twin_melt = v as f32,
            "rival_gain" => self.rival_gain = v as f32,
            "rival_sim" => self.rival_sim = v as f32,
            "bound_on" => self.bound_on = v as f32,
            "coinc" => self.coinc = v as f32,
            "select" => self.select = v as f32,
            "value_on" => self.value_on = v as f32,
            "keep_gain" => self.keep_gain = v as f32,
            "quiet_bind" => self.quiet_bind = v as f32,
            "wide_cost" => self.wide_cost = v as f32,
            "quiet_prune" => self.quiet_prune = v as f32,
            "use_w" => self.use_w = v as f32,
            "thaw" => self.thaw = v as f32,
            "rec_w" => self.rec_w = v as f32,
            "young_w" => self.young_w = v as f32,
            "young_obs" => self.young_obs = v as f32,
            "full_at" => self.full_at = v as f32,
            "recruit_heat" => self.recruit_heat = v as f32,
            "depth_w" => self.depth_w = v as f32,
            "info_w" => self.info_w = v as f32,
            "topic_on" => self.topic_on = v as f32,
            "t_alpha" => self.t_alpha = v as f32,
            "switch_bits" => self.switch_bits = v as f32,
            "press_bits" => self.press_bits = v as f32,
            "press_decay" => self.press_decay = v as f32,
            "recruit_bits" => self.recruit_bits = v as f32,
            "topic_k" => self.topic_k = v as usize,
            "topic_min_n" => self.topic_min_n = v as f32,
            "ex_margin" => self.ex_margin = v as f32,
            "ex_floor" => self.ex_floor = v as f32,
            "ex_decay" => self.ex_decay = v as f32,
            "fast_min_g" => self.fast_min_g = v as f32,
            "t_maxfreq" => self.t_maxfreq = v as f32,
            "t_recent" => self.t_recent = v as f32,
            _ => panic!("unknown param {}", k),
        }
    }
}

impl Default for Params {
    fn default() -> Self {
        let mut p = Params {
            beta_root: 0.8,
            beta_chain: 0.8,
            theta_join: 0.55,
            theta_leave: 0.35,
            search_bits: 1.0,
            min_obs: 6,
            melt_rate: 0.05,
            freeze_rate: 0.02,
            resist: 0.2,
            redundant: 0.9,
            kesc: 1.3,
            kent: 1.5,
            ufloor: 0.1,
            uhalf: 2.0,
            grow: 3,
            quiet_h: 1.0,
            min_depth: 2,
            gamma: 1.0,
            temp_decay: 0.7,
            chain: 1,
            hb: 1.0,
            held_k: 24,
            h_conf: 0.5,
            traces: 48,
            bind_bits: 0.0,
            bind_every: 8,
            max_twins: 8,
            held_on: 1.0,
            held_mode: 1.0,
            held_depth: 3.0,
            twin_gate: -0.02,
            rival_on: 0.0,
            conf_span: 1.0,
            gate_n: 4.0,
            min_chunk: 1.0,
            gate_d: 99.0,
            share_d: 6,
            proof_from: 99.0,
            proof_bits: 4.0,
            proof_cap: 16.0,
            twin_top: 0.0,
            bind_heat: 1.0,
            quiet_from: 99.0,
            same: 0.95,
            held_max: 6.0,
            release_bits: 1.0,
            bound_k: 4,
            twin_min_obs: 8,
            twin_melt: -0.1,
            rival_gain: 0.0,
            rival_sim: 0.5,
            bound_on: 0.0,
            coinc: 0.0,
            select: 1.0,
            value_on: 1.0,
            keep_gain: 0.02,
            quiet_bind: 1.0,
            wide_cost: 8.0,
            quiet_prune: 1.0,
            use_w: 0.0,
            thaw: 30000.0,
            rec_w: 0.3,
            young_w: 0.0,
            young_obs: 3.0,
            full_at: 1.0,
            recruit_heat: 0.0,
            depth_w: 1.0,
            info_w: 1.0,
            topic_on: 0.0,
            t_alpha: 20.0,
            switch_bits: 3.0,
            press_bits: 4.0,
            press_decay: 0.9,
            recruit_bits: 14.0,
            topic_k: 4,
            topic_min_n: 40.0,
            ex_margin: 0.5,
            ex_floor: 2.0,
            ex_decay: 0.97,
            fast_min_g: 10.0,
            t_maxfreq: 0.0,
            t_recent: 20.0,
        };
        // Tuning override (seed 1 only): M005="name=v,name=v".
        if let Ok(v) = std::env::var("M005") {
            for kv in v.split(',').filter(|s| !s.is_empty()) {
                let (k, x) = kv.split_once('=').expect("M005 entries are name=value");
                p.set(k, x.parse().expect("M005 value"));
            }
        }
        p
    }
}

pub struct Model {
    p: Params,
    cells: Vec<Cell>,
    free: Vec<u32>,
    live: usize,
    capacity: usize,
    main: [u32; D + 1],
    shared: Vec<Active>,
    learning: bool,
    freezing: bool,
    rng: Rng,
    now: u32,
    ring: Vec<Vec<u32>>,
    ring_pos: Vec<usize>,
    last_p: Vec<f64>,
    energy: f64,
    /// Held temperature of the active region: recent misfit.
    temp: f32,
    /// The chunker: a state machine that walks the characters since the last
    /// branch point (its state is identified by a hash of that path).
    chunk: u32,
    chunk_len: u16,
    /// The slow context machine's held state: recently closed chunks.
    held: Vec<Held>,
    /// Slow state machines: chunks bound at the same context cell are rival
    /// states of one machine. word -> its rivals.
    rivals: hsm_core::FastMap<u32, Vec<(u32, u32, u32)>>,
    /// How many twins are keyed on each word (bound words persist).
    bound: hsm_core::FastMap<u32, u32>,
    /// Twins keyed on each held word.
    keyed: hsm_core::FastMap<u32, Vec<u32>>,
    /// How often each chunk has been held (its base rate), and chunks closed.
    seen: hsm_core::FastMap<u32, u32>,
    n_closed: u64,
    topics: Vec<Topic>,
    topic: usize,
    pressure: Vec<f32>,
    excess: f32,
    usual: f32,
    recent: Vec<u32>,
    n_topic_switch_fast: u64,
    n_topic_switch_slow: u64,
    n_topic_recruit: u64,
    /// Twin entries active for the current prediction: (context depth, twin).
    twin_act: Vec<(usize, u32)>,
    n_twins: u64,
    n_thawed: u64,
    n_prune: u64,
    n_switch: u64,
    n_release: u64,
    /// Debug only (never read by the model): text of each chunk identity.
    dbg_txt: Option<hsm_core::FastMap<u32, Vec<u8>>>,
    dbg_cur: Vec<u8>,
    n_bind_quiet: u64,
    n_twin_melt: u64,
    // stats
    n_melted: u64,
    n_refused: u64,
    n_joins: u64,
    n_leaves: u64,
    n_quiet: u64,
}

impl Model {
    pub fn new(seed: u64, capacity: usize) -> Self {
        Self::with_params(seed, capacity, Params::default())
    }

    pub fn with_params(seed: u64, capacity: usize, p: Params) -> Self {
        let mut cells = Vec::with_capacity(4096);
        cells.push(Cell::new(Kind::Context, NONE, 0, 0, 0));
        let mut main = [NONE; D + 1];
        main[0] = 0;
        Model {
            p,
            cells,
            free: Vec::new(),
            live: 1,
            capacity: capacity.max(2),
            main,
            shared: Vec::new(),
            learning: true,
            freezing: true,
            rng: Rng::derived(seed, "m003"),
            now: 0,
            ring: vec![Vec::with_capacity(RING); A],
            ring_pos: vec![0; A],
            last_p: Vec::new(),
            energy: 0.0,
            temp: 0.0,
            chunk: FNV0,
            chunk_len: 0,
            held: Vec::new(),
            rivals: Default::default(),
            bound: Default::default(),
            keyed: Default::default(),
            seen: Default::default(),
            n_closed: 0,
            topics: vec![Topic::default()],
            topic: 0,
            pressure: vec![0.0],
            excess: 0.0,
            usual: 8.0,
            recent: Vec::new(),
            n_topic_switch_fast: 0,
            n_topic_switch_slow: 0,
            n_topic_recruit: 0,
            twin_act: Vec::new(),
            n_twins: 0,
            n_thawed: 0,
            n_prune: 0,
            n_switch: 0,
            n_release: 0,
            dbg_txt: if std::env::var("M005_DEBUG").is_ok() { Some(Default::default()) } else { None },
            dbg_cur: Vec::new(),
            n_bind_quiet: 0,
            n_twin_melt: 0,
            n_melted: 0,
            n_refused: 0,
            n_joins: 0,
            n_leaves: 0,
            n_quiet: 0,
        }
    }

    /// How much of the remaining probability mass a cell takes. Declared in
    /// FINDINGS.md: this is the Witten–Bell escape weight n/(n+u), a counting
    /// model's smoothing.
    #[inline]
    fn confidence(&self, c: &Cell) -> f32 {
        if c.n <= 0.0 {
            return 0.0;
        }
        let u = c.distinct().max(1.0) * self.p.kesc * (self.p.gamma * self.temp).exp();
        c.n / (c.n + u)
    }

    fn entries(&self) -> Vec<Active> {
        let mut v: Vec<Active> = Vec::with_capacity(D + 1 + self.shared.len());
        for d in 0..=D {
            let c = self.main[d];
            if c != NONE {
                // A deep context cell speaks only once it has proved that it
                // removes misfit its shorter parent cannot (resolvable heat).
                if d > self.p.proof_from as usize && self.cells[c as usize].gain < self.p.proof_bits {
                    continue;
                }
                // A state that says nothing its parent does not already say
                // stays silent (it would only sharpen the parent's guess).
                if d > self.p.quiet_from as usize && d >= 1 && self.main[d - 1] != NONE
                    && self.sim1(c, self.main[d - 1]) >= self.p.same
                {
                    continue;
                }
                v.push(Active { cell: c, a: 1.0, pos: d as f32, len: 0 });
            }
        }
        v.extend(self.shared.iter().copied());
        for &(d, t) in &self.twin_act {
            if self.cells[t as usize].gain >= self.p.twin_gate {
                // A held-context binding is the most specific state there is:
                // it knows the context cell's suffix and what is held.
                let pos = if self.p.twin_top > 0.0 { 200.0 + d as f32 } else { d as f32 + 0.5 };
                v.push(Active { cell: t, a: 1.0, pos, len: 0 });
            }
        }
        v.sort_by(|x, y| y.pos.partial_cmp(&x.pos).unwrap());
        v
    }

    fn dist(&self) -> Vec<f64> {
        let mut p = [0.0f64; A];
        let mut rem = 1.0f64;
        for e in self.entries() {
            let c = &self.cells[e.cell as usize];
            if c.n <= 0.0 {
                continue;
            }
            let conf = self.confidence(c);
            let w = rem * (e.a * conf) as f64;
            if w <= 0.0 {
                continue;
            }
            let inv = 1.0 / c.n as f64;
            for i in 0..A {
                p[i] += w * c.out[i] as f64 * inv;
            }
            rem -= w;
        }
        // Heat opens the floor: a hot region holds its expectations loosely.
        let t = self.temp as f64;
        let eps = self.p.ufloor as f64 * t / (t + self.p.uhalf as f64);
        if eps > 0.0 {
            for x in p.iter_mut() {
                *x *= 1.0 - eps;
            }
            rem = rem * (1.0 - eps) + eps;
        }
        let u = rem / A as f64;
        let mut v: Vec<f64> = p.iter().map(|&x| x + u).collect();
        // Guarantee strictly positive (rem can underflow to ~0).
        let mut sum = 0.0;
        for x in v.iter_mut() {
            if *x < 1e-12 {
                *x = 1e-12;
            }
            sum += *x;
        }
        for x in v.iter_mut() {
            *x /= sum;
        }
        v
    }

    // ---------------------------------------------------------------- capacity

    fn alloc(&mut self, kind: Kind, parent: u32, s: u8, depth: u8) -> u32 {
        if self.live >= self.capacity {
            if !self.melt_one() {
                return NONE;
            }
        }
        let cell = Cell::new(kind, parent, s, depth, self.now);
        self.live += 1;
        let id = if let Some(id) = self.free.pop() {
            self.cells[id as usize] = cell;
            id
        } else {
            self.cells.push(cell);
            (self.cells.len() - 1) as u32
        };
        if parent != NONE {
            self.cells[parent as usize].next.push((s, id));
        }
        id
    }

    fn is_active(&self, id: u32) -> bool {
        self.main.contains(&id) || self.shared.iter().any(|e| e.cell == id) || self.twin_act.iter().any(|e| e.1 == id)
    }

    /// Melt one leaf cell and free it. Returns false if every candidate resisted.
    fn melt_one(&mut self) -> bool {
        let n = self.cells.len();
        let mut best = NONE;
        let mut best_hold = f32::INFINITY;
        let mut tries = 0;
        let mut found = 0;
        while tries < 64 && found < 12 {
            tries += 1;
            let id = self.rng.below(n) as u32;
            if id == 0 {
                continue;
            }
            let c = &self.cells[id as usize];
            if !c.alive || !c.next.is_empty() || c.depth <= 1 && c.kind == Kind::Context {
                continue;
            }
            if c.kind == Kind::Shared && !c.members.is_empty() {
                continue;
            }
            if self.is_active(id) {
                continue;
            }
            found += 1;
            let age = (self.now - c.last) as f32;
            let recency = (-age / 2000.0).exp();
            // Value: how much the structure has been used (log visits), so
            // melting takes the least valuable first.
            let mut used = self.p.use_w * (1.0 + c.obs as f32).ln() / 8.0 - self.p.depth_w * c.depth as f32 / D as f32;
            // What the structure knows beyond its parent: visits × how much
            // its expectation differs from the shorter context's.
            if self.p.info_w > 0.0 && c.kind == Kind::Context && c.parent != NONE {
                let diff = 1.0 - self.sim1(id, c.parent);
                used += self.p.info_w * (1.0 + c.n * diff).ln() / 4.0;
            }
            // Young structure that has not yet earned anything (few visits)
            // is the cheapest to recycle: new learning reuses its own scratch
            // space before it reaches older settled structure.
            let young = if self.p.young_w > 0.0 && (c.obs as f32) < self.p.young_obs { -self.p.young_w } else { 0.0 };
            let hold = if self.freezing { self.f_eff(id) + self.p.rec_w * recency + used + young } else { recency + used };
            if hold < best_hold {
                best_hold = hold;
                best = id;
            }
        }
        if best == NONE {
            self.n_refused += 1;
            return false;
        }
        if self.freezing && self.f_eff(best) > self.p.resist {
            self.n_refused += 1;
            return false;
        }
        if self.freezing && self.cells[best as usize].f_in > self.p.resist {
            self.n_thawed += 1;
        }
        self.kill(best);
        self.n_melted += 1;
        true
    }

    /// Effective freeze of a cell's incoming connection: frozen structure
    /// that has been idle a long time thaws (half-life `thaw` characters).
    #[inline]
    fn f_eff(&self, id: u32) -> f32 {
        let c = &self.cells[id as usize];
        if self.p.thaw <= 0.0 {
            return c.f_in;
        }
        let idle = (self.now - c.last) as f32;
        c.f_in * (-idle * std::f32::consts::LN_2 / self.p.thaw).exp()
    }

    fn kill(&mut self, id: u32) {
        let (parent, s, classes, kind, twins) = {
            let c = &mut self.cells[id as usize];
            c.alive = false;
            c.traces = Vec::new();
            (c.parent, c.sym, std::mem::take(&mut c.classes), c.kind, std::mem::take(&mut c.twins))
        };
        for (w, t) in twins {
            if let Some(b) = self.bound.get_mut(&w) {
                *b = b.saturating_sub(1);
            }
            if self.cells[t as usize].alive {
                self.cells[t as usize].alive = false;
                self.live -= 1;
                self.free.push(t);
            }
        }
        if kind == Kind::Twin {
            let w = self.cells[id as usize].word;
            if let Some(b) = self.bound.get_mut(&w) {
                *b = b.saturating_sub(1);
            }
            let tw = &mut self.cells[parent as usize].twins;
            if let Some(i) = tw.iter().position(|&(_, c)| c == id) {
                tw.swap_remove(i);
            }
        } else if parent != NONE {
            let pn = &mut self.cells[parent as usize].next;
            if let Some(i) = pn.iter().position(|&(k, c)| k == s && c == id) {
                pn.swap_remove(i);
            }
        }
        for (z, _, _) in classes {
            let m = &mut self.cells[z as usize].members;
            if let Some(i) = m.iter().position(|&x| x == id) {
                m.swap_remove(i);
            }
        }
        self.live -= 1;
        self.free.push(id);
    }

    // ---------------------------------------------------------------- learning

    /// The cell takes the character: heat, melting, Hebbian strengthening, freezing.
    fn learn_cell(&mut self, id: u32, s: usize) {
        let freezing = self.freezing;
        let (melt_rate, freeze_rate) = (self.p.melt_rate, self.p.freeze_rate);
        let now = self.now;
        let c = &mut self.cells[id as usize];
        c.last = now;
        c.obs += 1;
        // Misfit beyond what the cell itself expected (irreducible part removed).
        let m = if c.n > 0.0 {
            let ps = (c.out[s] / c.n).max(1.0 / 1024.0);
            (-ps.log2() - c.entropy()).max(0.0)
        } else {
            0.0
        };
        c.heat = 0.9 * c.heat + 0.1 * m;
        // Melting: hot, unfrozen output connections weaken.
        let f = if freezing { c.f_out } else { 0.0 };
        let decay = melt_rate * (c.heat / 4.0).min(1.0) * (1.0 - f);
        if decay > 0.0 && c.n > 0.0 {
            for x in c.out.iter_mut() {
                *x *= 1.0 - decay;
            }
            c.n *= 1.0 - decay;
        }
        c.out[s] += 1.0;
        c.n += 1.0;
        // Freezing: connections set as the cell cools.
        let cool = (-c.heat).exp();
        c.f_out += freeze_rate * (1.0 - c.f_out) * cool;
        c.f_in += freeze_rate * (1.0 - c.f_in) * cool;
        for k in c.classes.iter_mut() {
            k.2 += freeze_rate * (1.0 - k.2) * cool;
        }
    }

    fn ring_push(&mut self, s: usize, id: u32) {
        let r = &mut self.ring[s];
        if r.contains(&id) {
            return;
        }
        if r.len() < RING {
            r.push(id);
        } else {
            r[self.ring_pos[s]] = id;
            self.ring_pos[s] = (self.ring_pos[s] + 1) % RING;
        }
    }

    fn norm(&self, id: u32) -> [f32; A] {
        let c = &self.cells[id as usize];
        let mut v = [0.0; A];
        if c.n > 0.0 {
            for i in 0..A {
                v[i] = c.out[i] / c.n;
            }
        }
        v
    }

    fn sim1(&self, x: u32, y: u32) -> f32 {
        let (a, b) = (self.norm(x), self.norm(y));
        (0..A).map(|i| a[i].min(b[i])).sum()
    }

    /// Two-step likeness: are x and y followed by the same characters, and
    /// then by the same characters again?
    fn sim2(&self, x: u32, y: u32) -> f32 {
        let (a, b) = (self.norm(x), self.norm(y));
        let (cx, cy) = (&self.cells[x as usize], &self.cells[y as usize]);
        let mut s = 0.0;
        for i in 0..A {
            let m = a[i].min(b[i]);
            if m <= 0.0 {
                continue;
            }
            let (kx, ky) = (cx.child(i as u8), cy.child(i as u8));
            let k = if kx != NONE && ky != NONE && self.cells[kx as usize].n >= 1.0 && self.cells[ky as usize].n >= 1.0 {
                self.sim1(kx, ky)
            } else {
                0.5
            };
            s += m * k;
        }
        s
    }

    fn string_of(&self, id: u32) -> Vec<u8> {
        let mut v = Vec::new();
        let mut c = id;
        while c != NONE && c != 0 {
            let cell = &self.cells[c as usize];
            v.push(cell.sym);
            c = cell.parent;
        }
        v // reversed: most recent character first
    }

    fn suffix_related(&self, x: u32, y: u32) -> bool {
        let (a, b) = (self.string_of(x), self.string_of(y));
        let k = a.len().min(b.len());
        a[..k] == b[..k]
    }

    fn eligible_partner(&self, y: u32) -> bool {
        let c = &self.cells[y as usize];
        c.alive && c.kind == Kind::Context && c.depth >= self.p.min_depth && c.depth <= self.p.share_d && c.obs >= self.p.min_obs
    }

    /// Heat spreads from a hot context cell, through the input it just took, to
    /// other cells that recently took it; it binds to a shared cell with the
    /// one that is followed by the most similar things.
    fn search(&mut self, x: u32, s: usize) {
        let cands = self.ring[s].clone();
        self.search_in(x, &cands);
    }

    fn search_in(&mut self, x: u32, cands: &[u32]) {
        self.cells[x as usize].last_search = self.now;
        if self.cells[x as usize].classes.len() >= MAX_CLASSES {
            return;
        }
        let cands = cands.to_vec();
        let mut best = NONE;
        let mut best_sim = self.p.theta_join;
        for y in cands {
            if y == x || !self.eligible_partner(y) {
                continue;
            }
            if self.cells[x as usize].classes.iter().any(|k| self.cells[y as usize].classes.iter().any(|j| j.0 == k.0)) {
                continue; // already share a cell
            }
            let sm = self.sim2(x, y);
            if sm > best_sim && !self.suffix_related(x, y) {
                best_sim = sm;
                best = y;
            }
        }
        if best == NONE {
            return;
        }
        let y = best;
        // Join y's shared cell if x fits it.
        let yz: Vec<(u32, f32, f32)> = self.cells[y as usize].classes.clone();
        for (z, _, _) in yz {
            let sm = self.sim1(x, z);
            if sm > self.p.theta_join {
                self.join(x, z, sm);
                return;
            }
        }
        let xz: Vec<(u32, f32, f32)> = self.cells[x as usize].classes.clone();
        for (z, _, _) in xz {
            let sm = self.sim1(y, z);
            if sm > self.p.theta_join && self.cells[y as usize].classes.len() < MAX_CLASSES {
                self.join(y, z, sm);
                return;
            }
        }
        if self.cells[y as usize].classes.len() >= MAX_CLASSES {
            return;
        }
        // A new shared cell, its output connections seeded from both.
        let z = self.alloc(Kind::Shared, NONE, 0, 0);
        if z == NONE {
            return;
        }
        let (a, b) = (self.norm(x), self.norm(y));
        let zc = &mut self.cells[z as usize];
        for i in 0..A {
            zc.out[i] = a[i] + b[i];
        }
        zc.n = 2.0;
        self.join(x, z, best_sim);
        self.join(y, z, best_sim);
    }

    fn join(&mut self, x: u32, z: u32, w: f32) {
        self.cells[x as usize].classes.push((z, w, 0.0));
        self.cells[z as usize].members.push(x);
        self.n_joins += 1;
    }

    /// Re-weigh x's membership connections; unfrozen ones that no longer fit melt away.
    fn reweigh(&mut self, x: u32) {
        let ks: Vec<(u32, f32, f32)> = self.cells[x as usize].classes.clone();
        let mut keep = Vec::with_capacity(ks.len());
        for (z, _, f) in ks {
            let sm = self.sim1(x, z);
            let fe = if self.freezing { f } else { 0.0 };
            if sm < self.p.theta_leave && fe < 0.5 {
                let m = &mut self.cells[z as usize].members;
                if let Some(i) = m.iter().position(|&q| q == x) {
                    m.swap_remove(i);
                }
                self.n_leaves += 1;
            } else {
                keep.push((z, sm, f));
            }
        }
        self.cells[x as usize].classes = keep;
    }

    // ---------------------------------------------------------------- state

    // ---------------------------------------------------------------- held state

    /// Fraction of recent time a chunk has been held (its base rate).
    fn held_freq(&self, w: u32) -> f32 {
        let c = self.seen.get(&w).copied().unwrap_or(0) as f32;
        c / (self.n_closed.max(1) as f32) * self.p.held_k as f32
    }

    /// What holding w is worth: the best running gain of the live bindings
    /// keyed on it that have been tried enough.
    fn value(&self, w: u32) -> f32 {
        let mut v = f32::NEG_INFINITY;
        if let Some(ts) = self.keyed.get(&w) {
            for &t in ts {
                let c = &self.cells[t as usize];
                if c.alive && c.kind == Kind::Twin && c.word == w && c.obs >= self.p.twin_min_obs {
                    v = v.max(c.gain);
                }
            }
        }
        v
    }

    #[inline]
    fn is_bound(&self, w: u32) -> bool {
        self.p.bound_on > 0.0 && self.bound.get(&w).copied().unwrap_or(0) > 0
    }

    #[inline]
    fn held_at(&self, w: u32) -> Option<u32> {
        self.held.iter().find(|h| h.word == w).map(|h| h.at)
    }

    /// The chunker takes the character. When the automaton's most specific
    /// state is uncertain about what comes next (a branch point of its own
    /// structure), the chunk closes and the slow machine holds it.
    fn chunk_step(&mut self, s: usize) {
        self.chunk = (self.chunk ^ s as u32).wrapping_mul(0x0100_0193);
        self.chunk_len += 1;
        if self.dbg_txt.is_some() {
            self.dbg_cur.push(hsm_core::chr(s));
        }
        let mut h = 0.0;
        for d in (0..=D).rev() {
            let c = self.main[d];
            if c != NONE && self.cells[c as usize].n >= 1.0 {
                h = self.cells[c as usize].entropy();
                break;
            }
        }
        if (h > self.p.hb && self.chunk_len as f32 >= self.p.min_chunk) || self.chunk_len >= MAX_CHUNK {
            let mut w = self.chunk ^ (self.chunk_len as u32).wrapping_mul(0x9e37_79b9);
            if self.p.held_mode >= 1.0 {
                // Hold the fast machine's own state at the branch point: its
                // deepest context cell (at least `held_depth` characters).
                w = 0;
                for d in (self.p.held_depth as usize..=D.min(self.p.held_max as usize)).rev() {
                    if self.main[d] != NONE {
                        w = self.main[d] | 0x8000_0000;
                        break;
                    }
                }
                if w == 0 {
                    self.chunk = FNV0;
                    self.chunk_len = 0;
                    self.dbg_cur.clear();
                    return;
                }
            }
            if let Some(m) = self.dbg_txt.as_mut() {
                m.insert(w, std::mem::take(&mut self.dbg_cur));
            }
            if self.p.topic_on > 0.0 {
                self.topic_step(w);
            }
            *self.seen.entry(w).or_insert(0) += 1;
            self.n_closed += 1;
            let now = self.now;
            // A resolvable change: a known rival state arrives, and the slow
            // machine moves to it at once (its old state lets go).
            if self.p.rival_on > 0.0 {
                if let Some(rv) = self.rivals.get(&w) {
                    // (other word, my binding, its binding) at one cell. They
                    // are rivals only while both bindings remove misfit there
                    // and predict differently.
                    let mut gone: Vec<u32> = Vec::new();
                    for &(o, ta, tb) in rv {
                        let (a, b) = (&self.cells[ta as usize], &self.cells[tb as usize]);
                        if a.alive && b.alive && a.kind == Kind::Twin && b.kind == Kind::Twin
                            && a.gain >= self.p.rival_gain && b.gain >= self.p.rival_gain
                            && self.sim1(ta, tb) < self.p.rival_sim
                        {
                            gone.push(o);
                        }
                    }
                    if !gone.is_empty() {
                        self.held.retain(|h| !gone.contains(&h.word));
                        self.n_switch += 1;
                    }
                }
            }
            if let Some(x) = self.held.iter_mut().find(|x| x.word == w) {
                x.at = now;
            } else {
                // Unbound chunks are a short scratch memory: the oldest lets go.
                // Bound chunks (states of a slow machine) hold until a rival
                // displaces them.
                if self.p.value_on > 0.0 {
                    // Held chunks whose bindings have proved they remove
                    // misfit persist; the rest are a short scratch memory.
                    let valued = |m: &Self, x: u32| m.value(x) > m.p.keep_gain;
                    let scratch: Vec<usize> = (0..self.held.len()).filter(|&i| !valued(self, self.held[i].word)).collect();
                    if valued(self, w) {
                        let vals: Vec<usize> = (0..self.held.len()).filter(|&i| valued(self, self.held[i].word)).collect();
                        if vals.len() >= self.p.bound_k {
                            let i = *vals.iter().min_by_key(|&&i| self.held[i].at).unwrap();
                            self.held.swap_remove(i);
                        }
                    } else if scratch.len() >= self.p.held_k {
                        let i = *scratch.iter().min_by_key(|&&i| self.held[i].at).unwrap();
                        self.held.swap_remove(i);
                    }
                } else {
                    let bound = self.is_bound(w);
                    let same: Vec<usize> = (0..self.held.len()).filter(|&i| self.is_bound(self.held[i].word) == bound).collect();
                    let cap = if bound { self.p.bound_k } else { self.p.held_k };
                    if same.len() >= cap {
                        let i = *same.iter().min_by_key(|&&i| self.held[i].at).unwrap();
                        self.held.swap_remove(i);
                    }
                }
                self.held.push(Held { word: w, at: now });
            }
            self.chunk = FNV0;
            self.chunk_len = 0;
        }
    }

    /// The topic machine takes a closed chunk.
    ///
    /// Misfit is the chunk's surprise under the held state. Its transitions
    /// separate resolvable from irreducible misfit:
    /// * a chunk that another known state explains much better (by
    ///   `switch_bits` in one step) is a resolvable change: the machine moves
    ///   at once;
    /// * a chunk no state explains (all near the background) is noise or
    ///   novelty: it builds no pressure toward any state;
    /// * weaker evidence accumulates as leaky pressure (sustained change);
    /// * excess misfit that no state resolves accumulates until a new state
    ///   is recruited.
    fn topic_step(&mut self, w: u32) {
        // Optionally ignore chunks that are almost always present (function
        // words): their base rate says they carry no topic.
        if self.p.t_maxfreq > 0.0 {
            let g = self.seen.get(&w).copied().unwrap_or(0) as f32;
            if g > self.p.t_maxfreq * self.n_closed.max(1) as f32 {
                return self.topic_hold();
            }
        }
        let g = self.seen.get(&w).copied().unwrap_or(0) as f32;
        let gn = self.n_closed as f32;
        let bg = (g + 0.5) / (gn + 0.5 * (self.seen.len() as f32 + 1.0));
        let a = self.p.t_alpha;
        let lp = |t: &Topic| (((t.counts.get(&w).copied().unwrap_or(0.0)) + a * bg) / (t.n + a)).log2();
        let lps: Vec<f32> = self.topics.iter().map(|t| lp(t)).collect();
        let cur = self.topic;
        let (mut best, mut best_lp) = (cur, lps[cur]);
        for (k, &l) in lps.iter().enumerate() {
            if l > best_lp {
                best = k;
                best_lp = l;
            }
        }
        let gain = best_lp - lps[cur];
        let mut switched = false;
        if self.learning || true {
            // Pressure: leaky evidence for each rival state.
            for k in 0..self.topics.len() {
                self.pressure[k] = self.p.press_decay * self.pressure[k] + (lps[k] - lps[cur]);
                if self.pressure[k] < 0.0 {
                    self.pressure[k] = 0.0;
                }
            }
            // Resolvable: the chunk is familiar (seen often enough that its
            // fit is known, so it is not noise or novelty) and a known state
            // explains it decisively better.
            if best != cur && gain >= self.p.switch_bits && g >= self.p.fast_min_g {
                self.topic = best;
                self.n_topic_switch_fast += 1;
                switched = true;
            } else {
                let mut bk = cur;
                for k in 0..self.topics.len() {
                    if k != cur && self.pressure[k] >= self.p.press_bits && (bk == cur || self.pressure[k] > self.pressure[bk]) {
                        bk = k;
                    }
                }
                if bk != cur {
                    self.topic = bk;
                    self.n_topic_switch_slow += 1;
                    switched = true;
                }
            }
            if switched {
                for x in self.pressure.iter_mut() {
                    *x = 0.0;
                }
                self.excess = 0.0;
            }
        }
        if self.learning {
            let t = self.topic;
            // Excess misfit: how much worse the held state fits than the
            // background does. Only chunks the background knows count (novel
            // chunks are irreducible here).
            if !switched && g >= 2.0 {
                // Surprise beyond the state's usual level.
                let sur = -lps[t];
                let ex = (sur - self.usual - self.p.ex_margin).max(-self.p.ex_floor);
                self.usual = 0.98 * self.usual + 0.02 * sur;
                self.excess = (self.p.ex_decay * self.excess + ex).max(0.0);
                if self.excess >= self.p.recruit_bits && self.topics.len() < self.p.topic_k && self.topics[t].n >= self.p.topic_min_n {
                    // The new state is seeded with the recent chunks whose
                    // misfit recruited it (and they leave the old state).
                    let mut nt = Topic::default();
                    for &r in &self.recent {
                        *nt.counts.entry(r).or_insert(0.0) += 1.0;
                        nt.n += 1.0;
                        if let Some(c) = self.topics[t].counts.get_mut(&r) {
                            if *c >= 1.0 { *c -= 1.0; self.topics[t].n -= 1.0; }
                        }
                    }
                    self.topics.push(nt);
                    self.pressure.push(0.0);
                    self.topic = self.topics.len() - 1;
                    self.excess = 0.0;
                    self.n_topic_recruit += 1;
                }
            }
            let t = self.topic;
            *self.topics[t].counts.entry(w).or_insert(0.0) += 1.0;
            self.topics[t].n += 1.0;
            if switched {
                self.recent.clear();
            }
            self.recent.push(w);
            if self.recent.len() > self.p.t_recent as usize {
                self.recent.remove(0);
            }
        }
        self.topic_hold();
    }

    /// The held set always carries the topic machine's current state.
    fn topic_hold(&mut self) {
        let tok = TOPIC_TOKEN + self.topic as u32;
        self.held.retain(|h| h.word & 0xfff0_0000 != TOPIC_TOKEN || h.word == tok);
        let now = self.now;
        if let Some(h) = self.held.iter_mut().find(|h| h.word == tok) {
            h.at = now;
        } else {
            self.held.push(Held { word: tok, at: now });
        }
    }

    /// Choose the twins that speak: for each active context cell, the twin
    /// whose held chunk was held most recently.
    fn select_twins(&mut self) {
        self.twin_act.clear();
        if self.p.held_on <= 0.0 {
            return;
        }
        for d in 1..=D {
            let c = self.main[d];
            if c == NONE || self.cells[c as usize].twins.is_empty() {
                continue;
            }
            // Every binding whose held state is held now is a candidate; the
            // one with the best record of removing misfit here speaks (with
            // recency breaking ties when select=0).
            let mut best = NONE;
            let mut best_key = f32::NEG_INFINITY;
            for &(w, t) in &self.cells[c as usize].twins {
                if let Some(at) = self.held_at(w) {
                    let key = if self.p.select > 0.0 {
                        self.cells[t as usize].gain - 1e-6 * (self.now - at) as f32
                    } else {
                        at as f32
                    };
                    if best == NONE || key > best_key {
                        best = t;
                        best_key = key;
                    }
                }
            }
            if best != NONE {
                self.twin_act.push((d, best));
            }
        }
    }

    /// Bits saved on x's traces by splitting them on whether w was held.
    fn trace_gain(&self, x: u32, w: u32) -> f32 {
        let c = &self.cells[x as usize];
        let mut seen = [false; A];
        for t in &c.traces {
            seen[t.out as usize] = true;
        }
        let k = seen.iter().filter(|&&b| b).count().max(2) as f32;
        let all = code_len(c.traces.iter().map(|t| t.out), k);
        let lw = code_len(c.traces.iter().filter(|t| t.held.contains(&w)).map(|t| t.out), k);
        let ln = code_len(c.traces.iter().filter(|t| !t.held.contains(&w)).map(|t| t.out), k);
        all - lw - ln
    }

    /// A conflicted context cell records what arrived with what was held.
    fn record_trace(&mut self, x: u32, s: usize) {
        let held: Vec<u32> = self.held.iter().map(|h| h.word).collect();
        let cap = self.p.traces;
        let c = &mut self.cells[x as usize];
        let t = Trace { out: s as u8, held };
        if c.traces.len() < cap {
            c.traces.push(t);
        } else {
            c.traces[c.trace_pos as usize % cap] = t;
            c.trace_pos = ((c.trace_pos as usize + 1) % cap) as u16;
        }
        c.since_bind += 1;
    }

    /// Internal conflict at x: its traces disagree. Look for a held chunk that
    /// would resolve the disagreement (the bits saved by keying x's outputs on
    /// it). `wide` (quiet periods) considers every chunk that appears in the
    /// traces; while reading, heat only reaches the chunks held now.
    fn bind(&mut self, x: u32, wide: bool) -> bool {
        let c = &self.cells[x as usize];
        if c.traces.len() < 8 || c.twins.len() >= self.p.max_twins {
            return false;
        }
        let mut cands: Vec<u32> = if wide {
            let mut v: Vec<u32> = c.traces.iter().flat_map(|t| t.held.iter().copied()).collect();
            v.sort_unstable();
            v.dedup();
            v
        } else {
            self.held.iter().map(|h| h.word).collect()
        };
        cands.retain(|w| !c.twins.iter().any(|t| t.0 == *w));
        let mut seen = [false; A];
        for t in &c.traces {
            seen[t.out as usize] = true;
        }
        let k = seen.iter().filter(|&&b| b).count() as f32;
        if k < 2.0 {
            return false;
        }
        let all = code_len(c.traces.iter().map(|t| t.out), k);
        // Only held states whose chunk is itself a stable state count: a held
        // chunk must have been held at least `min_seen` times before (a
        // recurrent configuration, not a one-off).
        // A binding must compress: it has to save more than it costs to name
        // the held state it binds to, plus a fixed cost for the new structure.
        let ncost = if wide { self.p.wide_cost } else { (cands.len().max(1) as f32).log2() };
        let thr = self.p.bind_bits + ncost;
        let mut best = (thr, 0u32);
        for &w in &cands {
            let nw = c.traces.iter().filter(|t| t.held.contains(&w)).count();
            if nw < 3 || nw == c.traces.len() {
                continue;
            }
            // Coincidence check: a chunk that is held almost everywhere (like
            // ". the ") explains nothing about this cell's conflict.
            if self.p.coinc > 0.0 {
                let f = self.held_freq(w);
                if f > self.p.coinc {
                    continue;
                }
            }
            let lw = code_len(c.traces.iter().filter(|t| t.held.contains(&w)).map(|t| t.out), k);
            let ln = code_len(c.traces.iter().filter(|t| !t.held.contains(&w)).map(|t| t.out), k);
            let g = all - lw - ln;
            if g > best.0 {
                best = (g, w);
            }
        }
        if best.1 == 0 {
            return false;
        }
        let w = best.1;
        let mut out = [0.0f32; A];
        let mut n = 0.0;
        for t in &self.cells[x as usize].traces {
            if t.held.contains(&w) {
                out[t.out as usize] += 1.0;
                n += 1.0;
            }
        }
        let depth = self.cells[x as usize].depth;
        let t = self.alloc(Kind::Twin, NONE, 0, depth);
        if t == NONE {
            return false;
        }
        {
            let tc = &mut self.cells[t as usize];
            tc.out = out;
            tc.n = n;
            tc.parent = x;
            tc.word = w;
        }
        let others: Vec<(u32, u32)> = self.cells[x as usize].twins.clone();
        self.cells[x as usize].twins.push((w, t));
        *self.bound.entry(w).or_insert(0) += 1;
        self.keyed.entry(w).or_default().push(t);
        for (o, to) in others {
            let r = self.rivals.entry(w).or_default();
            if r.len() < 64 {
                r.push((o, t, to));
            }
            let r = self.rivals.entry(o).or_default();
            if r.len() < 64 {
                r.push((w, to, t));
            }
        }
        self.n_twins += 1;
        true
    }

    fn advance(&mut self, s: usize) {
        let s8 = s as u8;
        let old = self.main;
        let mut new = [NONE; D + 1];
        new[0] = 0;
        for d in 1..=D {
            let par = old[d - 1];
            if par == NONE {
                break;
            }
            let mut c = self.cells[par as usize].child(s8);
            // When the population is full, recruiting means melting something,
            // so a successor is recruited only where the parent has been visited
            // enough to show it needs one.
            let full = self.live as f32 >= self.p.full_at * self.capacity as f32;
            if c == NONE && self.learning
                && (d <= 1 || !full || (self.cells[par as usize].obs >= self.p.grow && self.cells[par as usize].heat >= self.p.recruit_heat))
            {
                c = self.alloc(Kind::Context, par, s8, d as u8);
            }
            if c == NONE {
                break;
            }
            new[d] = c;
        }
        // Shared chains move on.
        let mut sh: Vec<Active> = Vec::new();
        let old_sh = std::mem::take(&mut self.shared);
        for e in old_sh {
            if e.len >= self.p.chain || !self.cells[e.cell as usize].alive {
                continue;
            }
            let mut c = self.cells[e.cell as usize].child(s8);
            if c == NONE && self.learning {
                c = self.alloc(Kind::Chain, e.cell, s8, e.len + 1);
            }
            if c != NONE {
                let a = if e.len == 0 { e.a / self.p.beta_root * self.p.beta_chain } else { e.a };
                push_max(&mut sh, Active { cell: c, a, pos: e.pos + 1.0, len: e.len + 1 });
            }
        }
        self.main = new;
        // Shared cells woken by the new context cells.
        let mut deepest = 0;
        for d in 0..=D.min(self.p.gate_d as usize) {
            if new[d] != NONE && self.cells[new[d] as usize].n >= self.p.gate_n {
                deepest = new[d];
            }
        }
        for d in 1..=D {
            let c = new[d];
            if c == NONE {
                continue;
            }
            let ks = self.cells[c as usize].classes.clone();
            if ks.is_empty() {
                continue;
            }
            // The shared cell sits above every deeper active cell that only
            // repeats its member (adds no specificity of its own).
            let mut top = d;
            for d2 in d + 1..=D {
                let c2 = new[d2];
                if c2 == NONE || self.sim1(c2, c) < self.p.redundant {
                    break;
                }
                top = d2;
            }
            for (z, w, _) in ks {
                if self.cells[z as usize].alive {
                    // A generalist speaks at branch points: it wakes in
                    // proportion to the uncertainty the most specific active
                    // state holds about what follows.
                    let h = self.cells[deepest as usize].entropy();
                    let a = self.p.beta_root * w * (h / self.p.kent).min(1.0);
                    push_max(&mut sh, Active { cell: z, a, pos: 100.0 + top as f32 * 0.01, len: 0 });
                }
            }
        }
        self.shared = sh;
        self.chunk_step(s);
        self.select_twins();
    }
}

/// Sequential (Krichevsky–Trofimov) code length, in bits, of a sequence of
/// symbols over `k` possible symbols: the misfit a single cell would feel
/// reading it.
fn code_len(seq: impl Iterator<Item = u8>, k: f32) -> f32 {
    let mut c = [0.0f32; A];
    let mut n = 0.0f32;
    let mut bits = 0.0f32;
    for s in seq {
        bits -= ((c[s as usize] + 0.5) / (n + 0.5 * k)).log2();
        c[s as usize] += 1.0;
        n += 1.0;
    }
    bits
}

fn push_max(v: &mut Vec<Active>, e: Active) {
    for x in v.iter_mut() {
        if x.cell == e.cell {
            if e.a > x.a {
                *x = e;
            }
            return;
        }
    }
    v.push(e);
}

impl Automaton for Model {
    fn name(&self) -> &str {
        "m005-assemblies-with-state"
    }

    fn predict(&mut self) -> Vec<f64> {
        self.last_p = self.dist();
        self.last_p.clone()
    }

    fn observe(&mut self, ch: u8) {
        let s = sym(ch);
        if self.last_p.len() != A {
            self.last_p = self.dist();
        }
        let surprise = -(self.last_p[s].log2()) as f32;
        self.now += 1;
        // Energy: activation-weighted misfit of the active cells beyond what each expected.
        let mut e = 0.0f64;
        let mut wsum = 0.0f64;
        for en in self.entries() {
            let c = &self.cells[en.cell as usize];
            if c.n <= 0.0 {
                continue;
            }
            let ps = (c.out[s] / c.n).max(1.0 / 1024.0);
            let m = (-ps.log2() - c.entropy()).max(0.0) as f64;
            e += en.a as f64 * m;
            wsum += en.a as f64;
        }
        self.energy = if wsum > 0.0 { e / wsum } else { surprise as f64 };
        self.temp = self.p.temp_decay * self.temp + (1.0 - self.p.temp_decay) * self.energy as f32;

        if self.learning {
            let mut ids: Vec<u32> = Vec::with_capacity(D + 1 + self.shared.len());
            for d in 0..=D {
                if self.main[d] != NONE {
                    ids.push(self.main[d]);
                }
            }
            for en in &self.shared {
                if !ids.contains(&en.cell) {
                    ids.push(en.cell);
                }
            }
            // Deep context cells account for the misfit they remove relative
            // to their parent (the next-shorter context).
            for d in (self.p.proof_from as usize + 1)..=D {
                let (x, par) = (self.main[d], self.main[d - 1]);
                if x == NONE || par == NONE {
                    break;
                }
                let k = 0.5 * A as f32;
                let (a, b) = (&self.cells[x as usize], &self.cells[par as usize]);
                let g = ((a.out[s] + 0.5) / (a.n + k)).log2() - ((b.out[s] + 0.5) / (b.n + k)).log2();
                let c = &mut self.cells[x as usize];
                c.gain = (c.gain + g).clamp(-self.p.proof_cap, self.p.proof_cap);
            }
            for &id in &ids {
                self.learn_cell(id, s);
            }
            // Held-context bindings learn too, and keep a running account of
            // the misfit they remove relative to their parent cell.
            let tw = self.twin_act.clone();
            for &(_, t) in &tw {
                let par = self.cells[t as usize].parent;
                let (pt, pp) = {
                    // What the binding adds where it speaks: its own
                    // expectation blended over its parent's (as in prediction).
                    let (a, b) = (&self.cells[t as usize], &self.cells[par as usize]);
                    let pp = (b.out[s] + 0.5) / (b.n + 0.5 * A as f32);
                    let ca = if a.n > 0.0 { a.n / (a.n + a.distinct().max(1.0) * self.p.kesc) } else { 0.0 };
                    let pa = if a.n > 0.0 { a.out[s] / a.n } else { 0.0 };
                    (ca * pa + (1.0 - ca) * pp, pp)
                };
                let lr = (pt / pp).log2();
                // The binding was wrong here: the held state it is keyed on
                // is the source of the misfit, and lets go (a resolvable
                // change: the slow machine moves at once, not on sustained
                // evidence). The binding does not learn from a state it no
                // longer holds.
                if lr < -self.p.release_bits {
                    let w = self.cells[t as usize].word;
                    self.held.retain(|h| h.word != w);
                    self.n_release += 1;
                    let g = &mut self.cells[t as usize].gain;
                    *g = 0.95 * *g + 0.05 * lr;
                    continue;
                }
                self.learn_cell(t, s);
                let g = &mut self.cells[t as usize].gain;
                *g = 0.95 * *g + 0.05 * lr;
            }
            // Bindings that keep failing to remove misfit melt (unless frozen).
            for &(_, t) in &tw {
                let c = &self.cells[t as usize];
                if c.alive && c.obs >= self.p.twin_min_obs && c.gain < self.p.twin_melt
                    && (!self.freezing || c.f_out < self.p.resist)
                {
                    self.kill(t);
                    self.n_twin_melt += 1;
                }
            }
            // Internal conflict: context cells that stay uncertain keep traces
            // of what held when they were visited, and try to bind.
            if self.p.held_on > 0.0 {
                // Only the most specific state(s) feel the conflict: shallower
                // cells' uncertainty is explained by what the deeper ones know.
                let mut top = 0;
                for d in 1..=D {
                    if self.main[d] != NONE && self.cells[self.main[d] as usize].obs >= self.p.min_obs {
                        top = d;
                    }
                }
                let lo = (top + 1).saturating_sub(self.p.conf_span as usize).max((self.p.min_depth as usize).max(1));
                for d in lo..=top {
                    let x = self.main[d];
                    if x == NONE {
                        continue;
                    }
                    let (obs, h) = {
                        let c = &self.cells[x as usize];
                        (c.obs, c.entropy())
                    };
                    if obs >= self.p.min_obs && h > self.p.h_conf {
                        self.record_trace(x, s);
                        // Heat triggers the search: a surprised conflicted
                        // cell looks at once; otherwise every `bind_every`.
                        if surprise > self.p.bind_heat {
                            self.cells[x as usize].since_bind = self.p.bind_every;
                        }
                        if self.cells[x as usize].since_bind >= self.p.bind_every {
                            self.cells[x as usize].since_bind = 0;
                            self.bind(x, false);
                        }
                    }
                }
            }
            // Residual heat: hot context cells look for shared material.
            for d in (self.p.min_depth as usize).max(1)..=D.min(self.p.share_d as usize) {
                let x = self.main[d];
                if x == NONE {
                    continue;
                }
                let (obs, ls, nk) = {
                    let c = &self.cells[x as usize];
                    (c.obs, c.last_search, c.classes.len())
                };
                if obs >= self.p.min_obs {
                    if obs % 16 == 0 && nk > 0 {
                        self.reweigh(x);
                    }
                    if surprise > self.p.search_bits && nk < MAX_CLASSES && self.now - ls >= 16 {
                        self.search(x, s);
                    }
                    self.ring_push(s, x);
                }
            }
        }
        self.advance(s);
        self.last_p.clear();
    }

    fn set_learning(&mut self, on: bool) {
        self.learning = on;
    }

    /// Thinking without data: leftover heat keeps driving the search for
    /// shared material. Each quiet step, the hottest eligible context cell not
    /// yet settled looks for a partner among cells that took the same input.
    fn quiet(&mut self, steps: usize) {
        if !self.learning {
            return;
        }
        let mut hot: Vec<(f32, u32)> = Vec::new();
        for (i, c) in self.cells.iter().enumerate() {
            if c.alive && c.kind == Kind::Context && c.depth >= self.p.min_depth && c.depth <= self.p.share_d && c.obs >= self.p.min_obs
                && c.classes.len() < MAX_CLASSES && c.entropy() >= self.p.quiet_h
            {
                hot.push((c.heat + c.entropy(), i as u32));
            }
        }
        hot.sort_by(|a, b| b.0.partial_cmp(&a.0).unwrap().then(a.1.cmp(&b.1)));
        // With no input arriving, heat can spread to every cell that ever took
        // the same input, not only the recent ones.
        let mut by_sym: Vec<Vec<u32>> = vec![Vec::new(); A];
        for (i, c) in self.cells.iter().enumerate() {
            if c.alive && c.kind == Kind::Context && c.depth >= self.p.min_depth && c.depth <= self.p.share_d && c.obs >= self.p.min_obs {
                by_sym[c.sym as usize].push(i as u32);
            }
        }
        let mut budget = steps;
        for &(_, x) in hot.iter().take(budget / 2) {
            let s = self.cells[x as usize].sym as usize;
            self.search_in(x, &by_sym[s]);
            self.n_quiet += 1;
        }
        budget -= budget.min(hot.len()).min(steps / 2);
        // Internal conflict: context cells whose traces still disagree. With
        // no input, each tries to resolve its disagreement by binding to any
        // held state its traces remember (not only those held right now).
        // Settling one conflict can leave the cell still in conflict, so it
        // stays in the queue while it keeps finding bindings.
        if self.p.held_on > 0.0 && self.p.quiet_bind > 0.0 {
            let mut conf: Vec<(f32, u32)> = Vec::new();
            for (i, c) in self.cells.iter().enumerate() {
                if c.alive && c.kind == Kind::Context && c.traces.len() >= 8 && c.twins.len() < self.p.max_twins {
                    conf.push((c.entropy() * c.traces.len() as f32, i as u32));
                }
            }
            conf.sort_by(|a, b| b.0.partial_cmp(&a.0).unwrap().then(a.1.cmp(&b.1)));
            // First, let go of patches: bindings whose held state no longer
            // explains the cell's remembered conflict (re-measured on its
            // traces) melt, unless frozen.
            if self.p.quiet_prune > 0.0 {
                for &(_, x) in &conf {
                    let tw = self.cells[x as usize].twins.clone();
                    for (w, t) in tw {
                        let g = self.trace_gain(x, w);
                        let c = &self.cells[t as usize];
                        if g < 0.0 && (!self.freezing || c.f_out < self.p.resist) {
                            self.kill(t);
                            self.n_twin_melt += 1;
                            self.n_prune += 1;
                        }
                    }
                }
            }
            let mut q: std::collections::VecDeque<u32> = conf.into_iter().map(|x| x.1).collect();
            while budget > 0 {
                let Some(x) = q.pop_front() else { break };
                budget -= 1;
                if self.bind(x, true) {
                    self.n_bind_quiet += 1;
                    q.push_back(x);
                }
            }
        }
    }

    fn energy(&self) -> f64 {
        self.energy
    }

    fn stats(&self) -> Vec<(String, f64)> {
        let mut shared = 0;
        let mut chain = 0;
        let mut members = 0;
        let mut frozen = 0;
        for c in self.cells.iter().filter(|c| c.alive) {
            match c.kind {
                Kind::Shared => {
                    shared += 1;
                    members += c.members.len();
                }
                Kind::Chain => chain += 1,
                _ => {}
            }
            if c.f_in > 0.8 {
                frozen += 1;
            }
        }
        vec![
            ("units".into(), self.live as f64),
            ("shared_cells".into(), shared as f64),
            ("chain_cells".into(), chain as f64),
            ("memberships".into(), members as f64),
            ("frozen_in_edges".into(), frozen as f64),
            ("melted".into(), self.n_melted as f64),
            ("melt_refused".into(), self.n_refused as f64),
            ("joins".into(), self.n_joins as f64),
            ("leaves".into(), self.n_leaves as f64),
            ("quiet_searches".into(), self.n_quiet as f64),
            ("twins".into(), self.n_twins as f64),
            ("held_switches".into(), self.n_switch as f64),
            ("held_releases".into(), self.n_release as f64),
            ("quiet_binds".into(), self.n_bind_quiet as f64),
            ("twin_melts".into(), self.n_twin_melt as f64),
            ("thawed".into(), self.n_thawed as f64),
            ("topics".into(), self.topics.len() as f64),
            ("topic_switch_fast".into(), self.n_topic_switch_fast as f64),
            ("topic_switch_slow".into(), self.n_topic_switch_slow as f64),
            ("quiet_prunes".into(), self.n_prune as f64),
        ]
    }

    fn set_freezing(&mut self, on: bool) -> bool {
        self.freezing = on;
        true
    }
}

impl Model {
    /// Debug: describe the active entries and their contributions.
    pub fn debug_active(&self) -> String {
        let mut s = String::new();
        for e in self.entries() {
            let c = &self.cells[e.cell as usize];
            let ctx: Vec<u8> = self.string_of(e.cell).into_iter().rev().map(|b| hsm_core::chr(b as usize)).collect();
            let mut top: Vec<(usize, f32)> = (0..A).map(|i| (i, c.out[i])).filter(|x| x.1 > 0.0).collect();
            top.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap());
            let tops: String = top.iter().take(6).map(|(i, x)| format!("{}:{:.0} ", hsm_core::chr(*i) as char, x)).collect();
            let mem: String = if c.kind == Kind::Shared {
                c.members.iter().take(8).map(|&m| format!("'{}' ", String::from_utf8_lossy(&self.string_of(m).into_iter().rev().map(|b| hsm_core::chr(b as usize)).collect::<Vec<u8>>()))).collect()
            } else { String::new() };
            s.push_str(&format!("   {:?} pos {:.1} a {:.2} n {:.0} conf {:.2} '{}' | {} {}\n", c.kind, e.pos, e.a, c.n, self.confidence(c), String::from_utf8_lossy(&ctx), tops, mem));
        }
        s
    }
}

impl Model {
    /// Debug: the context cell for a string, its traces and best binding gains.
    pub fn debug_cell(&self, txt: &str) -> String {
        let mut c = 0u32;
        let syms: Vec<u8> = txt.bytes().map(|b| hsm_core::sym(b) as u8).collect();
        let n = syms.len();
        // Find by string match over all cells (debug, slow).
        for (i, cell) in self.cells.iter().enumerate() {
            if cell.alive && cell.kind == Kind::Context && cell.depth as usize == n {
                let v: Vec<u8> = self.string_of(i as u32).into_iter().rev().collect();
                if v == syms { c = i as u32; break; }
            }
        }
        if c == 0 { return format!("no cell '{}'", txt); }
        let cell = &self.cells[c as usize];
        let mut s = format!("cell '{}' n {} H {:.2} traces {} twins {}\n", txt, cell.n, cell.entropy(), cell.traces.len(), cell.twins.len());
        for &(w, t) in &cell.twins {
            let tc = &self.cells[t as usize];
            let tops: String = (0..A).filter(|&i| tc.out[i] > 0.0).map(|i| format!("{}:{:.0} ", hsm_core::chr(i) as char, tc.out[i])).collect();
            s.push_str(&format!("   twin '{}' gain {:.2} alive {} | {}\n", self.debug_word(w), tc.gain, tc.alive, tops));
        }
        let mut words: Vec<u32> = cell.traces.iter().flat_map(|t| t.held.iter().copied()).collect();
        words.sort_unstable(); words.dedup();
        let mut seen = [false; A];
        for t in &cell.traces { seen[t.out as usize] = true; }
        let k = seen.iter().filter(|&&b| b).count() as f32;
        let all = code_len(cell.traces.iter().map(|t| t.out), k);
        let mut g: Vec<(f32, u32, usize)> = words.iter().map(|&w| {
            let nw = cell.traces.iter().filter(|t| t.held.contains(&w)).count();
            let lw = code_len(cell.traces.iter().filter(|t| t.held.contains(&w)).map(|t| t.out), k);
            let ln = code_len(cell.traces.iter().filter(|t| !t.held.contains(&w)).map(|t| t.out), k);
            (all - lw - ln, w, nw)
        }).collect();
        g.sort_by(|a, b| b.0.partial_cmp(&a.0).unwrap());
        for (x, w, nw) in g.iter().take(6) { s.push_str(&format!("   gain {:.1} '{}' in {}\n", x, self.debug_word(*w), nw)); }
        let outs: String = cell.traces.iter().map(|t| hsm_core::chr(t.out as usize) as char).collect();
        s.push_str(&format!("   outs {}\n", outs));
        s
    }

    pub fn debug_topic(&self) -> usize {
        self.topic
    }

    pub fn debug_word(&self, w: u32) -> String {
        if w & 0xfff0_0000 == TOPIC_TOKEN {
            return format!("TOPIC{}", w - TOPIC_TOKEN);
        }
        if self.p.held_mode >= 1.0 && w & 0x8000_0000 != 0 {
            let id = w & 0x7fff_ffff;
            let v: Vec<u8> = self.string_of(id).into_iter().rev().map(|b| hsm_core::chr(b as usize)).collect();
            return String::from_utf8_lossy(&v).to_string();
        }
        self.dbg_txt.as_ref().and_then(|m| m.get(&w)).map(|v| String::from_utf8_lossy(v).to_string()).unwrap_or(format!("#{:x}", w))
    }
    pub fn debug_held(&self) -> String {
        let mut v = self.held.clone();
        v.sort_by_key(|h| std::cmp::Reverse(h.at));
        v.iter().map(|h| format!("'{}'@{} ", self.debug_word(h.word), self.now - h.at)).collect()
    }
    /// Debug: the twins of every live context cell with the most traces.
    pub fn debug_twins(&self, k: usize) -> String {
        let mut v: Vec<(usize, u32)> = self.cells.iter().enumerate()
            .filter(|(_, c)| c.alive && c.kind == Kind::Twin).map(|(i, c)| (c.n as usize, i as u32)).collect();
        v.sort_by(|a, b| b.cmp(a));
        let mut s = String::new();
        for &(_, t) in v.iter().take(k) {
            let c = &self.cells[t as usize];
            let ctx: Vec<u8> = self.string_of(c.parent).into_iter().rev().map(|b| hsm_core::chr(b as usize)).collect();
            let mut top: Vec<(usize, f32)> = (0..A).map(|i| (i, c.out[i])).filter(|x| x.1 > 0.0).collect();
            top.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap());
            let tops: String = top.iter().take(5).map(|(i, x)| format!("{}:{:.0} ", hsm_core::chr(*i) as char, x)).collect();
            s.push_str(&format!("  '{}' | held '{}' gain {:.2} | {}\n", String::from_utf8_lossy(&ctx), self.debug_word(c.word), c.gain, tops));
        }
        s
    }
    /// Debug: the shared cells with the most members, and who they are.
    pub fn debug_shared(&self, k: usize) -> String {
        let mut v: Vec<(usize, u32)> = self.cells.iter().enumerate()
            .filter(|(_, c)| c.alive && c.kind == Kind::Shared).map(|(i, c)| (c.members.len(), i as u32)).collect();
        v.sort_by(|a, b| b.cmp(a));
        let mut s = String::new();
        for &(_, z) in v.iter().take(k) {
            let c = &self.cells[z as usize];
            let mut ms: Vec<String> = c.members.iter().map(|&m| format!("'{}'", String::from_utf8_lossy(&self.string_of(m).into_iter().rev().map(|b| hsm_core::chr(b as usize)).collect::<Vec<u8>>()))).collect();
            ms.sort();
            let mut top: Vec<(usize, f32)> = (0..A).map(|i| (i, c.out[i])).filter(|x| x.1 > 0.0).collect();
            top.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap());
            let tops: String = top.iter().take(5).map(|(i, x)| format!("{}:{:.0} ", hsm_core::chr(*i) as char, x)).collect();
            s.push_str(&format!("  [{} members] next {}| {}\n", c.members.len(), tops, ms.join(" ")));
        }
        s
    }
}
