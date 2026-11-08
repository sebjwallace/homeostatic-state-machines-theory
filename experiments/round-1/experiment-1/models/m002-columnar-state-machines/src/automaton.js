'use strict';
// Columnar homeostatic state machines (m002).
//
// One column per alphabet character. Each column owns a pool of cells (fixed
// capacity, recruited on demand). Cell 0 of each column is the column's
// "generalist": the character in any context. Every other cell is a context
// cell: "this character, when it followed context cell P". Context cells thus
// form, per column, a tree of ever more specific contexts (a suffix structure)
// that grows only where residual heat demands it.
//
// State: at each step the active cells are the chain of cells in the current
// input column that match the recent past, from the generalist up to the most
// specific context cell that exists (sparse: <= maxDepth cells out of
// thousands). Each column also *holds* its last state (its deepest active
// cell) until the column fires again: a state persists until something makes
// it transition.
//
// Transitions: every active cell has Hebbian transition weights to the next
// column (co-activity of "this cell now" and "that column next"). The primed
// columns (transition weights of the active chain, blended from general to
// specific, each cell passing on to its more general neighbour the share of
// mass it is unsure about) are the prediction.
//
// Energy: misfit between what was primed and what arrived (surprise, bits),
// measured locally at each active cell against its own expectation (excess
// surprise over its own predicted entropy). Heat = running misfit per cell,
// spreads along the context connection to the predecessor cell.
// Cooling freezes: a cell whose heat stays low while active gains frozenness F;
// frozen cells don't melt (forget) and are never recycled.
// Residual heat recruits: if, after the existing (memory) cells responded, the
// step was still surprising beyond a threshold, one fresh cell is recruited in
// the input column, one context level deeper than the deepest that matched.

const LOG2 = Math.log(2);

const DEFAULTS = {
  capacity: 256,       // cells per column (spare capacity for recruitment)
  maxDepth: 12,        // longest context a cell may represent
  recruitBits: 1.0,    // residual heat (bits) needed to recruit a fresh cell
  heatRate: 0.2,       // EMA rate for a cell's heat
  spread: 0.3,         // fraction of a cell's excess misfit passed to its predecessor
  freezeBelow: 0.15,   // heat below which an active cell cools/freezes
  freezeRate: 0.15,    // freeze increment per cool activation
  meltAbove: 1.5,      // heat above which a cell melts
  melt: 0.0,           // forgetting factor for hot, unfrozen cells (0 = off)
  minUses: 3,          // a cell needs this many uses before it can freeze
  protectF: 0.5,       // cells frozen beyond this are never recycled or merged
  mergeKL: 0.05,       // quiet-period: a leaf this close (bits) to its parent is redundant
  freezing: true,      // ablation switch
  heatGate: true,      // ablation switch: false = recruit on every miss, ignoring heat
  split: true,         // misfit splits the predicting cell into a deeper-context twin
  extend: true,        // misfit also recruits a deeper cell for the arriving char
  hotSplit: 0,         // a cell this hot (heated by successors) also splits when active
};

class Automaton {
  constructor(alphabet, opts = {}) {
    this.o = { ...DEFAULTS, ...opts };
    this.alphabet = alphabet;
    this.A = alphabet.length;
    this.idx = new Map([...alphabet].map((c, i) => [c, i]));
    this.cells = [];
    this.colCells = Array.from({ length: this.A }, () => []);
    // root: the "nothing yet" state (order 0). Not in any column.
    this.root = this._newCell(-1, -1, -1, 0);
    this.gen = [];
    for (let c = 0; c < this.A; c++) {
      const g = this._newCell(c, this.root, this.root, 1);
      this.cells[this.root].kids.set(c, g);
      this.gen.push(g);
    }
    this.chain = [this.root];     // active cells, deepest first
    this.prevChain = null;
    this.colState = new Int32Array(this.A).fill(-1); // persistent state per column
    this.colStateT = new Int32Array(this.A).fill(-1);
    this.t = 0;
    this.stats = { recruits: 0, refused: 0, recycled: 0, merged: 0 };
    this.lastPred = null;
    this.lastLevels = null;
  }

  _newCell(col, ctx, parent, depth) {
    const id = this.cells.length;
    this.cells.push({
      id, col, ctx, parent, depth,
      c: new Float64Array(this.A), n: 0, u: 0,
      kids: new Map(), sub: 0,
      h: 1.0, F: 0, uses: 0, born: this.t || 0,
    });
    if (col >= 0) this.colCells[col].push(id);
    if (parent >= 0) this.cells[parent].sub++;
    return id;
  }

  // ---- prediction: blend primed transitions along the active chain ----
  // returns {p, levels: [{id, p}...]} levels from root (general) to deepest
  predictFrom(chain) {
    const A = this.A;
    let p = new Float64Array(A).fill(1 / A);
    const levels = [];
    for (let k = chain.length - 1; k >= 0; k--) {
      const cell = this.cells[chain[k]];
      if (cell.n > 0) {
        const d = cell.n + cell.u;
        const q = new Float64Array(A);
        for (let i = 0; i < A; i++) q[i] = (cell.c[i] + cell.u * p[i]) / d;
        p = q;
      }
      levels.push({ id: cell.id, p });
    }
    return { p, levels };
  }

  predict() {
    const r = this.predictFrom(this.chain);
    this.lastPred = r.p;
    this.lastLevels = r.levels;
    return r.p;
  }

  // Find the active chain for char x given the current chain.
  // Returns {chain, matchedFrom} where matchedFrom = index into old chain of
  // the deepest cell that had a kid for x.
  nextChain(chain, x) {
    for (let k = 0; k < chain.length; k++) {
      const kid = this.cells[chain[k]].kids.get(x);
      if (kid !== undefined) {
        const nc = [];
        let id = kid;
        while (id !== -1) { nc.push(id); id = this.cells[id].parent; }
        return { chain: nc, matchedFrom: k };
      }
    }
    throw new Error('root must have a kid for every column');
  }

  // ---- one step: predict, then learn from what arrived ----
  step(ch, learn = true) {
    const x = this.idx.get(ch);
    const p = this.predict();
    const surprise = -Math.log(p[x]) / LOG2;
    const info = { t: this.t, ch, surprise, recruited: -1, heatSum: 0, chainLen: this.chain.length };

    if (learn) {
      // Residual heat at the state that made the prediction: the deepest active
      // cell predicted badly, so its context was not specific enough. Heat
      // flows back along its context connection, and fresh capacity is
      // recruited: a twin of that cell in the same column, but bound to a
      // deeper predecessor (taken from the previous chain, which still holds).
      // The twin takes over as the active state and learns what arrived.
      const c0 = this.cells[this.chain[0]];
      if (this.o.split && this.prevChain && c0.col >= 0 &&
          (surprise > this.o.recruitBits || (this.o.hotSplit > 0 && c0.h > this.o.hotSplit))) {
        const c = c0;
        const i = c.col >= 0 ? this.prevChain.indexOf(c.ctx) : -1;
        if (i > 0) {
          const ctxNew = this.prevChain[i - 1];
          const depth = this.cells[ctxNew].depth + 1;
          if (depth <= this.o.maxDepth && !this.cells[ctxNew].kids.has(c.col)) {
            const id = this._recruit(c.col, ctxNew, c.id, depth, this.chain);
            if (id >= 0) {
              // the twin starts from the parent's prediction (it inherits nothing
              // but the blend gives it the parent's distribution as its prior)
              this.chain = [id, ...this.chain];
              this.lastLevels = this.predictFrom(this.chain).levels;
              info.split = id;
            }
          }
        }
      }
      // local misfit at each active cell, against its own expectation
      for (const lv of this.lastLevels) {
        const cell = this.cells[lv.id];
        const s = -Math.log(lv.p[x]) / LOG2;
        let H = 0;
        for (let i = 0; i < this.A; i++) if (lv.p[i] > 0) H -= lv.p[i] * Math.log(lv.p[i]) / LOG2;
        const excess = s - H;
        const hPrev = cell.h;
        cell.h += (Math.max(0, excess) - cell.h) * this.o.heatRate;
        // heat spreads along the context connection to the predecessor
        if (cell.ctx >= 0 && excess > 0) {
          const pc = this.cells[cell.ctx];
          pc.h += excess * this.o.spread * this.o.heatRate;
        }
        cell.uses++;
        // cooling freezes; strong heat melts (frozen cells resist: melting point rises with F)
        if (this.o.freezing && cell.uses >= this.o.minUses && cell.h < this.o.freezeBelow && cell.h <= hPrev) {
          cell.F += this.o.freezeRate * (1 - cell.F);
        } else if (cell.h > this.o.meltAbove * (1 + 2 * cell.F)) {
          cell.F *= 0.8;
        }
        // plasticity: hot, unfrozen cells loosen (old counts fade)
        if (this.o.melt > 0 && cell.h > this.o.meltAbove) {
          const m = 1 - this.o.melt * (1 - cell.F);
          for (let i = 0; i < this.A; i++) cell.c[i] *= m;
          cell.n *= m;
        }
        // Hebbian: active cell now -> column next
        if (cell.c[x] === 0) cell.u++;
        cell.c[x] += 1;
        cell.n += 1;
        info.heatSum += cell.h;
      }

      // transition: find the cells of column x matching the context
      const { chain: nc, matchedFrom } = this.nextChain(this.chain, x);
      // residual heat: memory responded with p[x]; if still surprising, recruit
      // one fresh context cell one level deeper than the deepest match.
      if (this.o.extend && matchedFrom > 0 && (!this.o.heatGate || surprise > this.o.recruitBits)) {
        const ctxCell = this.chain[matchedFrom - 1];
        const depth = this.cells[ctxCell].depth + 1;
        if (depth <= this.o.maxDepth) {
          const id = this._recruit(x, ctxCell, nc[0], depth, nc);
          if (id >= 0) { nc.unshift(id); info.recruited = id; }
        }
      }
      this.prevChain = this.chain;
      this.chain = nc;
    } else {
      this.prevChain = this.chain;
      this.chain = this.nextChain(this.chain, x).chain;
    }
    // the column holds its state until it fires again
    this.colState[x] = this.chain[0];
    this.colStateT[x] = this.t;
    this.t++;
    return info;
  }

  _recruit(col, ctxCell, parent, depth, exclude) {
    if (this.colCells[col].length >= this.o.capacity) {
      // spare capacity exhausted: recycle an unfrozen leaf that has hardly
      // been used (it never settled anything). Frozen cells are never recycled.
      const victim = this._findRecyclable(col, exclude);
      if (victim < 0) { this.stats.refused++; return -1; }
      this._dissolve(victim);
      this.stats.recycled++;
    }
    const id = this._newCell(col, ctxCell, parent, depth);
    this.cells[ctxCell].kids.set(col, id);
    this.cells[id].born = this.t;
    this.stats.recruits++;
    return id;
  }

  _findRecyclable(col, exclude) {
    let best = -1, bestScore = Infinity;
    const active = new Set([...this.chain, ...exclude]);
    for (const id of this.colCells[col]) {
      const c = this.cells[id];
      // only leaves: no cell uses it as context (kids) or as general parent (sub)
      if (c.depth <= 1 || c.F > this.o.protectF || c.kids.size > 0 || c.sub > 0 || active.has(id)) continue;
      const score = c.uses + 50 * c.F;
      if (score < bestScore) { bestScore = score; best = id; }
    }
    return best;
  }

  _dissolve(id) {
    const c = this.cells[id];
    this.cells[c.ctx].kids.delete(c.col);
    this.cells[c.parent].sub--;
    const arr = this.colCells[c.col];
    arr.splice(arr.indexOf(id), 1);
    c.dead = true;
    c.kids.clear();
  }

  // ---- quiet period: settle internally, no input ----
  // Internal misfit between connected parts: a context cell vs its more general
  // parent. If a leaf context cell predicts nothing its parent doesn't (low
  // divergence), it is a patch that adds no fit: dissolve it (compression).
  // Cold cells that are consistent finish freezing. Heat decays.
  settle(steps = 1) {
    const out = { merged: 0, frozen: 0 };
    for (let s = 0; s < steps; s++) {
      for (const c of this.cells) {
        if (c.dead || c.col < 0) continue;
        c.h *= 0.9;
        if (c.depth > 1 && c.kids.size === 0 && c.sub === 0 && !this.chain.includes(c.id) && c.n > 0) {
          const par = this.cells[c.parent];
          const kl = this._kl(c, par);
          if (kl < this.o.mergeKL && c.F <= this.o.protectF) { this._dissolve(c.id); out.merged++; continue; }
        }
        if (this.o.freezing && c.h < this.o.freezeBelow && c.uses >= this.o.minUses && c.F < 0.99) {
          c.F += this.o.freezeRate * 0.5 * (1 - c.F); out.frozen++;
        }
      }
    }
    this.stats.merged += out.merged;
    return out;
  }

  _kl(a, b) {
    // KL(a||b) in bits between the two cells' smoothed transition distributions
    const A = this.A;
    let kl = 0;
    for (let i = 0; i < A; i++) {
      const pa = (a.c[i] + 0.5) / (a.n + 0.5 * A);
      const pb = (b.c[i] + 0.5) / (b.n + 0.5 * A);
      kl += pa * Math.log(pa / pb) / LOG2;
    }
    return kl;
  }

  // ---- helpers for tests / viewer ----
  resetState() { this.chain = [this.root]; this.prevChain = null; }
  liveCells() { return this.cells.filter((c) => !c.dead && c.col >= 0); }
  argmax() {
    const p = this.predict();
    let b = 0;
    for (let i = 1; i < this.A; i++) if (p[i] > p[b]) b = i;
    return this.alphabet[b];
  }
  // feed without learning (used to cue)
  observe(ch) { return this.step(ch, false); }
  // generate n chars greedily from current state, feeding back as input (no learning)
  generate(n, stopAt = null) {
    let s = '';
    for (let i = 0; i < n; i++) {
      const ch = this.argmax();
      s += ch;
      this.observe(ch);
      if (stopAt && ch === stopAt) break;
    }
    return s;
  }
  // context string a cell stands for (for display)
  label(id) {
    let s = '';
    let c = this.cells[id];
    // walk ctx links back to root
    while (c && c.col >= 0) { s = this.alphabet[c.col] + s; c = this.cells[c.ctx]; }
    return s;
  }
  snapshot() {
    const live = this.liveCells();
    let frozen = 0, hot = 0, maxD = 0;
    for (const c of live) { if (c.F > 0.8) frozen++; if (c.h > 0.5) hot++; if (c.depth > maxD) maxD = c.depth; }
    return { cells: live.length, frozen, hot, maxDepth: maxD, ...this.stats };
  }
}

module.exports = { Automaton, DEFAULTS };
