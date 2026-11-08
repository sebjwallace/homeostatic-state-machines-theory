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

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
enum Kind {
    Context,
    Shared,
    Chain,
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
            _ => panic!("unknown param {}", k),
        }
    }
}

impl Default for Params {
    fn default() -> Self {
        Params {
            beta_root: 0.8,
            beta_chain: 0.8,
            theta_join: 0.55,
            theta_leave: 0.35,
            search_bits: 1.0,
            min_obs: 6,
            melt_rate: 0.05,
            freeze_rate: 0.02,
            resist: 0.3,
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
        }
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
                v.push(Active { cell: c, a: 1.0, pos: d as f32, len: 0 });
            }
        }
        v.extend(self.shared.iter().copied());
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
        self.main.contains(&id) || self.shared.iter().any(|e| e.cell == id)
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
            let hold = if self.freezing { c.f_in + 0.3 * recency } else { recency };
            if hold < best_hold {
                best_hold = hold;
                best = id;
            }
        }
        if best == NONE {
            self.n_refused += 1;
            return false;
        }
        if self.freezing && self.cells[best as usize].f_in > self.p.resist {
            self.n_refused += 1;
            return false;
        }
        self.kill(best);
        self.n_melted += 1;
        true
    }

    fn kill(&mut self, id: u32) {
        let (parent, s, classes) = {
            let c = &mut self.cells[id as usize];
            c.alive = false;
            (c.parent, c.sym, std::mem::take(&mut c.classes))
        };
        if parent != NONE {
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
        c.alive && c.kind == Kind::Context && c.depth >= self.p.min_depth && c.obs >= self.p.min_obs
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
            if c == NONE && self.learning && (d <= 1 || self.live < self.capacity || self.cells[par as usize].obs >= self.p.grow) {
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
        for d in 0..=D {
            if new[d] != NONE && self.cells[new[d] as usize].n > 0.0 {
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
    }
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
        "m003-shared-assemblies"
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
            for &id in &ids {
                self.learn_cell(id, s);
            }
            // Residual heat: hot context cells look for shared material.
            for d in (self.p.min_depth as usize).max(1)..=D {
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
            if c.alive && c.kind == Kind::Context && c.depth >= self.p.min_depth && c.obs >= self.p.min_obs
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
            if c.alive && c.kind == Kind::Context && c.depth >= self.p.min_depth && c.obs >= self.p.min_obs {
                by_sym[c.sym as usize].push(i as u32);
            }
        }
        for &(_, x) in hot.iter().take(steps) {
            let s = self.cells[x as usize].sym as usize;
            self.search_in(x, &by_sym[s]);
            self.n_quiet += 1;
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
