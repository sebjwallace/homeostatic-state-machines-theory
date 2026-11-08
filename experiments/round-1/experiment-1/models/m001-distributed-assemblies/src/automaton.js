'use strict';
// m001: a fully distributed homeostatic automaton.
//
// ONE shared population of N cells. Each character owns a field of cells (a
// disjoint, randomly scattered subset of the population). When a character
// arrives, an assembly of `a` cells inside its field becomes the current
// STATE. WHICH cells are chosen depends on what came before, so the same
// character in different contexts is carried by different cells. Context
// lives in the identity of the active cells, not in a history buffer.
//
// State machines live in the connections. out[i] maps target cell j to a
// synapse {w, fz}: w is a Hebbian count of "i active at t-1, j active at t",
// fz in [0,1] is how frozen the synapse is. A transition is the bundle of
// synapses from one assembly to the next. All state machines share the same
// population and the same synapses: a cell can belong to several assemblies
// (once fresh cells run out, recruitment reuses the least-used cells).
// lat[i] holds lateral synapses between cells that formed an assembly
// together (content-addressable completion, rung 1).
//
// Per step (see FINDINGS.md for the mapping to the README):
//  1. priming: a cell is primed if at least theta of the active cells
//     synapse onto it (coincidence detection keeps superimposed machines apart)
//  2. energy = misfit: per active cell, the share of its primed synaptic mass
//     that pointed at characters that did not arrive
//  3. the next state is the most primed assembly in the arriving field; if
//     nothing specific primed it, the previous field "bursts" (broad context);
//     if still nothing, the character's base assembly fires
//  4. heat: each active cell's heat follows its own misfit (EMA), plus an
//     optional share of the heat of the state it handed activity to
//  5. residual heat recruits fresh capacity: if the reached state is hot, the
//     incoming context gets a young copy of it from fresh cells
//  6. cooling freezes: a young copy is judged after a few uses. If it carries
//     less heat than its parent did, its transition freezes. If not, it is
//     dissolved back into the parent and the parent transition freezes, so the
//     same context is not split again (satisficing). Transitions that fit
//     while cool also freeze gradually.
//
// All state is one plain object, cloneable with structuredClone.

const { randIn } = require('./prng');

const DEFAULTS = {
  N: 4096,          // cells in the shared population
  a: 4,             // cells per assembly
  theta: 0.75,      // fraction of active cells that must drive a cell to prime it
  kappa: 0.3,       // heat EMA rate
  sigma: 0,         // share of successor heat that spreads back along a transition
  hSplit: 0.25,     // heat above which a reached state gets a fresh copy for this context
  minUses: 1,       // a state must have been used this often before its heat is trusted
  nEval: 12,        // uses of a young state before it is judged
  tau: 2.0,         // young state survives if its mean heat < tau * parent heat
  phi: 0.05,        // gradual freezing rate of transitions that fit while cool
  split: true,      // ablation: false = never recruit context-specific states
  freezeOnFail: true, // a dissolved young state freezes the parent transition
  burstFallback: true, // unexpected char: field-level priming before the base state
};

function createAutomaton(alphabet, seed, opts = {}) {
  const p = Object.assign({}, DEFAULTS, opts);
  const A = alphabet.length;
  const N = p.N;
  const K = Math.floor(N / A);
  const s = {
    p, A, N, K, a: p.a, alphabet, rng: (seed ^ 0x9e3779b9) >>> 0,
    fieldOf: new Int16Array(N).fill(-1),
    fieldCells: [],
    base: [],
    out: Array.from({ length: N }, () => new Map()), // i -> Map(j -> {w, fz})
    lat: Array.from({ length: N }, () => new Set()), // lateral (co-assembly) synapses
    rowSum: new Float64Array(N),   // total outgoing weight of each cell
    inSum: new Float64Array(N),    // total incoming weight of each cell
    M: new Float64Array(A * A),    // field-to-field sums of w (the broad view)
    uni: new Float64Array(A),
    heat: new Float32Array(N),
    usage: new Int32Array(N),      // assemblies each cell has been recruited into
    uses: new Int32Array(N),       // times each cell has been active
    born: new Int32Array(N).fill(-1), // step at which the cell was first recruited
    young: {},                     // key: first cell of a young state
    prevW: [], prevChar: -1,
    t: 0,
    stats: { steps: 0, reuse: 0, burst: 0, base: 0, split: 0, splitOk: 0, splitFail: 0, recruitedCells: 0, assemblies: 0, synapses: 0 },
    lastEnergy: 0,
  };
  const perm = Array.from({ length: N }, (_, i) => i);
  for (let i = N - 1; i > 0; i--) {
    const j = Math.floor(randIn(s) * (i + 1));
    const t = perm[i]; perm[i] = perm[j]; perm[j] = t;
  }
  for (let c = 0; c < A; c++) {
    const cells = perm.slice(c * K, (c + 1) * K).sort((x, y) => x - y);
    s.fieldCells.push(Int32Array.from(cells));
    for (const j of cells) s.fieldOf[j] = c;
    s.base.push(null);
  }
  return s;
}

// ------------------------------------------------------------ synapses
function getW(s, i, j) { const e = s.out[i].get(j); return e ? e.w : 0; }
function addW(s, i, j, dw) {
  let e = s.out[i].get(j);
  if (!e) { e = { w: 0, fz: 0 }; s.out[i].set(j, e); s.stats.synapses++; }
  e.w += dw;
  if (e.w <= 1e-9) { dw -= e.w; s.out[i].delete(j); s.stats.synapses--; }
  s.rowSum[i] += dw; s.inSum[j] += dw;
  s.M[s.fieldOf[i] * s.A + s.fieldOf[j]] += dw;
}
function setFz(s, i, j, v) { const e = s.out[i].get(j); if (e) e.fz = v; }

// ------------------------------------------------------------ priming
function prime(s, cells, need) {
  const u = new Map(); const k = new Map();
  for (const i of cells) for (const [j, e] of s.out[i]) { u.set(j, (u.get(j) || 0) + e.w); k.set(j, (k.get(j) || 0) + 1); }
  if (need === undefined) need = Math.max(1, Math.ceil(s.p.theta * cells.length));
  const primed = [];
  for (const [j, n] of k) if (n >= need) primed.push(j);
  return { u, primed };
}

function blend(S, fallback) {
  let n = 0, t = 0;
  for (let c = 0; c < S.length; c++) { n += S[c]; if (S[c] > 0) t += 1; }
  if (n <= 0) return fallback;
  const p = new Float64Array(S.length);
  for (let c = 0; c < S.length; c++) p[c] = (S[c] + t * fallback[c]) / (n + t);
  return p;
}

// ------------------------------------------------------------ prediction
// The expectation is read from which cells are primed: specifically by the
// current state, broadly by the previous character's whole field, and finally
// by how often each field has fired. A young state's few counts are blended
// with the broader expectation (Witten-Bell weights), so it defers to it
// until it has experience.
function predict(s, pr) {
  const { A } = s;
  const a2 = s.a * s.a;
  let n0 = 0, t0 = 0;
  for (let c = 0; c < A; c++) { n0 += s.uni[c]; if (s.uni[c] > 0) t0++; }
  const p0 = new Float64Array(A);
  for (let c = 0; c < A; c++) p0[c] = n0 > 0 ? (s.uni[c] + t0 / A) / (n0 + t0) : 1 / A;
  if (s.prevChar < 0) return { p: p0, S: null, pr: null };
  const G = new Float64Array(A);
  for (let c = 0; c < A; c++) G[c] = s.M[s.prevChar * A + c] / a2;
  const pg = blend(G, p0);
  pr = pr || prime(s, s.prevW);
  const S = new Float64Array(A);
  for (const j of pr.primed) S[s.fieldOf[j]] += pr.u.get(j);
  for (let c = 0; c < A; c++) S[c] /= a2;
  return { p: blend(S, pg), S, pr };
}

// ------------------------------------------------------------ helpers
function meanHeat(s, cells) { let h = 0; for (const j of cells) h += s.heat[j]; return cells.length ? h / cells.length : 0; }
function minUses(s, cells) { let m = Infinity; for (const j of cells) m = Math.min(m, s.uses[j]); return m; }
function meanFrozen(s, from, to) {
  if (!from.length || !to.length) return 0;
  let f = 0;
  for (const i of from) for (const j of to) { const e = s.out[i].get(j); if (e) f += e.fz; }
  return f / (from.length * to.length);
}

// Fresh capacity: the least-used cells of the field (ties broken by the PRNG).
function recruit(s, c) {
  const scored = [];
  for (const j of s.fieldCells[c]) scored.push([s.usage[j] + randIn(s) * 0.5, j]);
  scored.sort((x, y) => x[0] - y[0]);
  const out = [];
  for (let k = 0; k < s.a; k++) {
    const j = scored[k][1]; out.push(j); s.usage[j]++; s.heat[j] = 0;
    if (s.born[j] < 0) s.born[j] = s.t;
  }
  s.stats.recruitedCells += s.a; s.stats.assemblies++;
  out.sort((x, y) => x - y);
  for (const i of out) for (const j of out) if (i !== j) s.lat[i].add(j); // fire together, wire together
  return out;
}

function baseOf(s, c) {
  if (!s.base[c]) s.base[c] = recruit(s, c);
  return s.base[c];
}

function topInField(s, pr, c) {
  const cand = [];
  for (const j of pr.primed) if (s.fieldOf[j] === c) cand.push(j);
  cand.sort((x, y) => pr.u.get(y) - pr.u.get(x) || x - y);
  return cand.slice(0, s.a).sort((x, y) => x - y);
}

// A young copy Xn of state X for context Y starts with X's expectations in
// proportion to the share of X's incoming flow that came from Y. The share is
// moved (not copied), so total experience is conserved.
function inherit(s, Y, X, Xn) {
  let inY = 0, inAll = 0;
  for (const j of X) { inAll += s.inSum[j]; for (const i of Y) inY += getW(s, i, j); }
  const frac = inAll > 0 ? Math.min(1, inY / inAll) : 0;
  if (frac <= 0) return;
  for (let k = 0; k < X.length; k++) {
    const from = X[k], to = Xn[k];
    for (const [j, e] of [...s.out[from]]) { const dw = e.w * frac; addW(s, from, j, -dw); addW(s, to, j, dw); }
  }
}

// Move the incoming transition (from -> X) onto Xn. Frozen synapses stay.
function moveTransition(s, from, X, Xn) {
  for (const i of from) {
    let moved = 0;
    for (const j of X) {
      const e = s.out[i].get(j);
      if (!e || e.fz >= 0.5) continue;
      const w = e.w; addW(s, i, j, -w); moved += w;
    }
    if (moved > 0) for (const j of Xn) addW(s, i, j, moved / Xn.length);
  }
}

// ------------------------------------------------------------ one step
// Perceive character c (and learn from it if learn=true). Pass the `pr` from
// predict() to avoid recomputing the priming.
function step(s, c, learn = true, pr = null) {
  const { a, p } = s;
  const prevW = s.prevW;
  const info = { c, mode: 'base', winners: null, energy: 1, split: false, judged: null };

  // ---- 1-2. priming and misfit
  if (prevW.length) pr = pr || prime(s, prevW);
  let energy = 1;
  const misfit = new Float64Array(prevW.length).fill(1);
  if (pr && pr.primed.length) {
    let wsum = 0, msum = 0;
    for (let k = 0; k < prevW.length; k++) {
      const i = prevW[k];
      let hit = 0, tot = 0;
      for (const j of pr.primed) { const w = getW(s, i, j); tot += w; if (s.fieldOf[j] === c) hit += w; }
      misfit[k] = tot > 0 ? 1 - hit / tot : 1;
      msum += misfit[k] * tot; wsum += tot;
    }
    energy = wsum > 0 ? msum / wsum : 1;
  } else if (s.prevChar >= 0) {
    let row = 0; const base = s.prevChar * s.A;
    for (let x = 0; x < s.A; x++) row += s.M[base + x];
    energy = row > 0 ? 1 - s.M[base + c] / row : 1;
  }
  info.energy = energy;

  // ---- 3. the next state
  let winners = pr ? topInField(s, pr, c) : [];
  let mode = 'reuse';
  if (winners.length < Math.ceil(a / 2) && p.burstFallback && s.prevChar >= 0) {
    winners = topInField(s, prime(s, s.fieldCells[s.prevChar], 1), c);
    mode = 'burst';
  }
  if (winners.length < Math.ceil(a / 2)) {
    winners = learn ? baseOf(s, c) : (s.base[c] || []);
    mode = 'base';
  } else if (mode === 'reuse' && learn && p.split && prevW.length) {
    // ---- 5. residual heat recruits fresh capacity
    const hX = meanHeat(s, winners);
    if (hX > p.hSplit && !s.young[winners[0]] && minUses(s, winners) >= p.minUses && meanFrozen(s, prevW, winners) < 0.5) {
      const Xn = recruit(s, c);
      inherit(s, prevW, winners, Xn);
      moveTransition(s, prevW, winners, Xn);
      s.young[Xn[0]] = { X: winners, Xn, Y: prevW.slice(), hParent: hX, hSum: 0, n: 0, t: s.t };
      winners = Xn; mode = 'split'; info.split = true;
    }
  }
  info.mode = mode; info.winners = winners;

  if (learn) {
    // Hebbian transition learning (state t-1 -> state t)
    if (prevW.length && winners.length) for (const i of prevW) for (const j of winners) addW(s, i, j, 1);
    s.uni[c] += 1;
    for (const j of winners) s.uses[j]++;
    if (prevW.length) {
      // ---- 4. heat
      const hNext = mode === 'reuse' ? meanHeat(s, winners) : 0;
      let tgtSum = 0;
      for (let k = 0; k < prevW.length; k++) {
        const i = prevW[k];
        const target = Math.min(1, misfit[k] + p.sigma * hNext);
        tgtSum += target;
        s.heat[i] = (1 - p.kappa) * s.heat[i] + p.kappa * target;
      }
      // ---- 6. young states are judged on the heat they carry
      const yr = s.young[prevW[0]];
      if (yr && sameSet(yr.Xn, prevW)) {
        yr.hSum += tgtSum / prevW.length; yr.n++;
        if (yr.n >= p.nEval) { info.judged = judge(s, yr); info.judgedCells = yr.Y.concat(yr.X, yr.Xn); }
      }
      // gradual freezing of transitions that fit while cool
      if (mode === 'reuse') {
        for (let k = 0; k < prevW.length; k++) {
          const i = prevW[k];
          const cool = 1 - Math.max(misfit[k], s.heat[i]);
          if (cool <= 0) continue;
          for (const j of winners) { const e = s.out[i].get(j); if (e) e.fz += p.phi * cool * (1 - e.fz); }
        }
      }
    }
    s.stats[mode]++; s.stats.steps++;
  }

  s.prevW = winners; s.prevChar = c;
  s.lastEnergy = energy;
  s.t++;
  return info;
}

function sameSet(x, y) {
  if (x.length !== y.length) return false;
  for (let k = 0; k < x.length; k++) if (x[k] !== y[k]) return false;
  return true;
}

function judge(s, yr) {
  delete s.young[yr.Xn[0]];
  const hYoung = yr.hSum / Math.max(1, yr.n);
  if (hYoung < s.p.tau * yr.hParent) {
    for (const i of yr.Y) for (const j of yr.Xn) setFz(s, i, j, 1);
    s.stats.splitOk++;
    return 'ok';
  }
  // dissolve back into the parent
  moveTransition(s, yr.Y, yr.Xn, yr.X);
  for (let k = 0; k < yr.Xn.length; k++) {
    const from = yr.Xn[k], to = yr.X[k % yr.X.length];
    for (const [j, e] of [...s.out[from]]) { const w = e.w; addW(s, from, j, -w); addW(s, to, j, w); }
    s.usage[from] = Math.max(0, s.usage[from] - 1);
    s.heat[from] = 0;
  }
  for (const i of yr.Xn) for (const j of yr.Xn) if (i !== j) s.lat[i].delete(j);
  if (s.p.freezeOnFail) for (const i of yr.Y) for (const j of yr.X) setFz(s, i, j, 1);
  s.stats.splitFail++; s.stats.assemblies--;
  return 'fail';
}

// ------------------------------------------------------------ quiet period
// No input. Heat keeps moving: each cell's heat relaxes toward the
// weight-averaged heat of the cells it hands activity to (sigma share), and
// every young state that has been used at least once is judged now, on the
// heat it carries, instead of waiting for more input (cooling without input).
// Returns how many young states were judged and how.
function quiet(s, steps, judgeYoung = true) {
  const { N, p } = s;
  for (let q = 0; q < steps; q++) {
    const next = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      let h = 0;
      if (s.rowSum[i] > 0) { for (const [j, e] of s.out[i]) h += e.w * s.heat[j]; h /= s.rowSum[i]; }
      next[i] = (1 - p.kappa) * s.heat[i] + p.kappa * Math.min(s.heat[i], p.sigma * h);
    }
    s.heat = next;
  }
  const res = { ok: 0, fail: 0 };
  if (!judgeYoung) return res;
  for (const key of Object.keys(s.young)) {
    const yr = s.young[key];
    if (yr.n > 0) res[judge(s, yr)]++;
  }
  return res;
}

function cellFrozenOne(s, i) {
  if (s.rowSum[i] <= 0) return 0;
  let f = 0; for (const [, e] of s.out[i]) f += e.w * e.fz;
  return f / s.rowSum[i];
}

// Weighted mean frozenness of each cell's outgoing synapses.
function cellFrozen(s) {
  const out = new Float32Array(s.N);
  for (let i = 0; i < s.N; i++) {
    if (s.rowSum[i] <= 0) continue;
    let f = 0; for (const [, e] of s.out[i]) f += e.w * e.fz;
    out[i] = f / s.rowSum[i];
  }
  return out;
}

// Content-addressable recall over lateral synapses: iterated k-winners-take-all
// among cells reachable from the cue (optionally restricted to one field).
function complete(s, cue, field = -1, iters = 3, k = s.a) {
  let act = cue.slice();
  for (let it = 0; it < iters; it++) {
    const score = new Map();
    for (const i of act) {
      score.set(i, (score.get(i) || 0) + 1);
      for (const j of s.lat[i]) if (field < 0 || s.fieldOf[j] === field) score.set(j, (score.get(j) || 0) + 1);
    }
    act = [...score.entries()].sort((x, y) => y[1] - x[1] || x[0] - y[0]).slice(0, k).map((e) => e[0]).sort((x, y) => x - y);
  }
  return act;
}

function reset(s) { s.prevW = []; s.prevChar = -1; }

module.exports = { createAutomaton, predict, step, quiet, cellFrozen, cellFrozenOne, complete, reset, prime, recruit, meanFrozen, DEFAULTS };
