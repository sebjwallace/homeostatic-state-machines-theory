// Sketch 04: episodes and knowledge. Is episodic vs semantic memory one structure
// at different hardnesses? `node sketch.js`  (plain Node, seeded, a few seconds)
'use strict';

function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const SEEDS = (process.env.SEEDS ?? '1,2,3').split(',').map(Number);
const N = 400;            // cells in the symbol pool and in the context pool
let LAMBDA_ = +(process.env.LAMBDA ?? 0.85);      // context drift: x_t = LAMBDA*x_{t-1} + proj(symbol_t)
const HARD = 3;           // "hard" = hardness >= HARD (episodes it was used in)
const melt = (h) => 0.5 + 0.4 * h;   // earned hardness (sketch 01/03)
const plast = (heat, h) => Math.min(1, Math.max(0, (heat - melt(h)) / 0.5));

// ---------- vocabulary: a template "U A went to P ate F" ----------
// U: unique to one episode. A: 5 agents. P: 5 places. F: food, fixed by place (F_p).
const NA = 5, NP = 5;
const fixed = ['went', 'to', 'ate'];
for (let i = 0; i < NA; i++) fixed.push('A' + i);
for (let i = 0; i < NP; i++) fixed.push('P' + i, 'F' + i);
fixed.push('X', 'Y', 'Z'); // for the joining test

function makeNet(seed, k, nEp) {
  const r = rng(seed);
  const sample = () => { const a = new Set(); while (a.size < k) a.add(Math.floor(r() * N)); return [...a]; };
  const names = fixed.slice(); for (let i = 0; i < nEp + 4; i++) names.push('U' + i);
  const code = {}, proj = {};
  // fixed random projection symbol cells -> context cells (pattern separation by kWTA)
  const R = new Float32Array(N * N); for (let i = 0; i < R.length; i++) R[i] = r() * 2 - 1;
  for (const n of names) {
    code[n] = sample();
    const p = new Float32Array(N);
    for (const i of code[n]) for (let j = 0; j < N; j++) p[j] += R[i * N + j];
    proj[n] = p;
  }
  return { r, k, names, code, proj,
    Wss: new Float32Array(N * N), Hss: new Uint16Array(N * N),   // symbol -> next symbol
    Wcs: new Float32Array(N * N), Hcs: new Uint16Array(N * N),   // context -> next symbol
    heat: {} };
}

function kwta(v, k, r) {
  const idx = []; for (let i = 0; i < N; i++) if (v[i] > 1e-6) { v[i] += r() * 1e-4; idx.push(i); }
  if (idx.length <= k) return idx;
  idx.sort((a, b) => v[b] - v[a]); return idx.slice(0, k);
}
const overlap = (a, b) => { const s = new Set(b); let n = 0; for (const x of a) if (s.has(x)) n++; return n; };

// Sparse adjacency per (matrix, mask), rebuilt when weights change (net.ver).
function adj(net, W, H, mask) {
  net.cache = net.cache || new Map(); const key = [W, mask]; 
  let m = net.cache.get(W); if (!m || m.ver !== net.ver) { m = { ver: net.ver, byMask: new Map() }; net.cache.set(W, m); }
  let a = m.byMask.get(mask); if (a) return a;
  a = []; for (let i = 0; i < N; i++) { const js = [], ws = []; const o = i * N;
    for (let j = 0; j < N; j++) { const w = W[o + j]; if (w > 0 && (!mask || mask(H[o + j]))) { js.push(j); ws.push(w); } } a.push([js, ws]); }
  m.byMask.set(mask, a); return a;
}
function input(net, s, c, mask) {
  const v = new Float32Array(N);
  if (!mask) { const addD = (W, pre) => { for (const i of pre) { const o = i * N; for (let j = 0; j < N; j++) { const w = W[o + j]; if (w > 0) v[j] += w; } } };
    if (s) addD(net.Wss, s); if (c) addD(net.Wcs, c); return v; }
  const add = (A, pre) => { for (const i of pre) { const [js, ws] = A[i]; for (let q = 0; q < js.length; q++) v[js[q]] += ws[q]; } };
  if (s) add(adj(net, net.Wss, net.Hss, mask), s);
  if (c) add(adj(net, net.Wcs, net.Hcs, mask), c);
  return v;
}
function decode(net, pat) {
  if (!net.idx) { net.idx = Array.from({ length: N }, () => []); for (const n of net.names) for (const i of net.code[n]) net.idx[i].push(n); }
  const cnt = new Map(); for (const i of pat) for (const n of net.idx[i]) cnt.set(n, (cnt.get(n) || 0) + 1);
  let best = null, bo = 0, second = 0;
  for (const [n, o] of cnt) { if (o > bo) { second = bo; bo = o; best = n; } else if (o > second) second = o; }
  return { sym: best, ov: bo, second };
}

// Learn one transition. heat = prediction misfit. Connections into the actual next
// state: strengthened a little (familiar) or laid down fully (hot, soft).
// Connections into wrongly predicted cells: weakened only if hot enough to melt.
function learn(net, W, H, pre, actual, wrong, heat, used) {
  net.ver = (net.ver || 0) + 1;
  for (const i of pre) { const o = i * N;
    for (const j of actual) { const p = plast(heat, H[o + j]); W[o + j] += (0.05 + p) * (1 - W[o + j]); used[W === net.Wss ? 0 : 1][o + j] = 1; }
    for (const j of wrong) { if (W[o + j] > 0) W[o + j] -= 0.5 * plast(heat, H[o + j]) * W[o + j]; }
  }
}

function experience(net, ep) {
  const { k, r } = net; const used = [new Uint8Array(N * N), new Uint8Array(N * N)];
  let x = Float32Array.from(net.proj[ep[0]]); let s = net.code[ep[0]]; let c = kwta(x, k, r);
  let heatSum = 0;
  for (let t = 0; t + 1 < ep.length; t++) {
    const pred = kwta(input(net, s, c), k, r), actual = net.code[ep[t + 1]];
    const heat = 1 - overlap(pred, actual) / k; heatSum += heat;
    const wrong = pred.filter(j => !actual.includes(j));
    for (const n of [ep[t], ep[t + 1]]) net.heat[n] = (net.heat[n] || 0) + heat;
    learn(net, net.Wss, net.Hss, s, actual, wrong, heat, used);
    learn(net, net.Wcs, net.Hcs, c, actual, wrong, heat, used);
    s = actual; for (let j = 0; j < N; j++) x[j] = LAMBDA_ * x[j] + net.proj[ep[t + 1]][j]; c = kwta(x, k, r);
  }
  // Episode over, the gap is closed: everything used in it cools and hardens by 1.
  for (const [m, W, H] of [[0, net.Wss, net.Hss], [1, net.Wcs, net.Hcs]]) { const u = used[m];
    for (let kk = 0; kk < N * N; kk++) if (u[kk] && W[kk] > 0.5) H[kk]++; }
  for (const n in net.heat) net.heat[n] *= 0.97;
  return heatSum;
}

// Replay from a cue (learning off). Clean-up to the nearest known assembly each step.
// force: list of symbols to teacher-force first (cue prefix).
function replay(net, force, steps, pool, mask, useSym = true) {
  const { k, r } = net; const out = [], mix = [];
  let x = Float32Array.from(net.proj[force[0]]); let s = net.code[force[0]]; let c = kwta(x, k, r);
  for (let t = 1; t < force.length + steps; t++) {
    const pred = kwta(input(net, useSym ? s : null, c, mask), k, r);
    const d = decode(net, pred, pool);
    const sym = t < force.length ? force[t] : d.sym;
    if (t >= force.length) { out.push(pred.length ? d.sym : '-'); mix.push(d.ov ? d.second / d.ov : 0); }
    if (!sym) break;
    s = net.code[sym]; for (let j = 0; j < N; j++) x[j] = LAMBDA_ * x[j] + net.proj[sym][j]; c = kwta(x, k, r);
  }
  return { out, mix };
}

function stream(seed, nEp) {
  const r = rng(seed * 101 + 7), eps = [];
  for (let i = 0; i < nEp; i++) {
    let a, p; do { a = Math.floor(r() * NA); p = Math.floor(r() * NP); } while (a === p); // a==p held out
    eps.push(['U' + i, 'A' + a, 'went', 'to', 'P' + p, 'ate', 'F' + p]);
  }
  return eps;
}

const pct = (a) => a.length ? (100 * a.reduce((x, y) => x + y, 0) / a.length).toFixed(0).padStart(4) : '   -';
const mean = (a) => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);
const masks = { all: null, hard: (h) => h >= HARD, soft: (h) => h < HARD };

function run(seed, k, nEp) {
  const net = makeNet(seed, k, nEp), eps = stream(seed, nEp);
  const heats = eps.map(e => experience(net, e));
  const pool = net.names;
  const res = { heatFirst: mean(heats.slice(0, 10)), heatLast: mean(heats.slice(-10)) };
  // Q1 episodic recall from the unique cue, per mask; scored on agent + place
  for (const m in masks) {
    res['epi_' + m] = eps.map((e, i) => { const o = replay(net, [e[0]], 6, pool, masks[m]).out;
      const sib = new Set(eps.filter((f, j) => j !== i && f[1] === e[1]).map(f => f[4]));
      return { age: nEp - 1 - i, agent: o[0] === e[1], place: o[3] === e[4], intr: o[3] !== e[4] && sib.has(o[3]), sem: o[1] === 'went' && o[2] === 'to' && o[4] === 'ate' }; });
  }
  // Q4 blur: mixture index at the place step for full recall
  res.mix = mean(eps.map(e => replay(net, [e[0]], 6, pool, null).mix[3]));
  // Context overlap at the place step for same-agent pairs (pattern separation)
  const ctxAt = (e) => { let x = new Float32Array(N); for (const n of e.slice(0, 4)) for (let j = 0; j < N; j++) x[j] = LAMBDA_ * x[j] + net.proj[n][j]; return kwta(x, k, net.r); };
  const ov = [], ovd = []; const cx = eps.slice(0, 60).map(ctxAt);
  for (let i = 0; i < cx.length; i++) for (let j = i + 1; j < cx.length; j++) {
    const o = overlap(cx[i], cx[j]) / k; (eps[i][1] === eps[j][1] ? ov : ovd).push(o); }
  res.ctxSame = mean(ov); res.ctxDiff = mean(ovd);
  // Q3 generalisation: held-out pairs A_i with P_i, cue prefix, predict 'ate' then F_i
  for (const m in masks) {
    const g = [];
    for (let i = 0; i < NA; i++) { const o = replay(net, ['A' + i, 'went', 'to', 'P' + i], 2, pool, masks[m]).out;
      g.push(o[0] === 'ate' && o[1] === 'F' + i ? 1 : 0); }
    // free run from an agent cue: went, to, <some place>, ate, food matching that place
    const fr = [];
    for (let i = 0; i < NA; i++) { const o = replay(net, ['A' + i], 5, pool, masks[m]).out;
      fr.push(o[0] === 'went' && o[1] === 'to' && /^P/.test(o[2]) && o[3] === 'ate' && o[4] === 'F' + o[2].slice(1) ? 1 : 0); }
    res['gen_' + m] = g; res['free_' + m] = fr;
  }
  res.net = net; res.eps = eps;
  return res;
}

// ---------- hardness by connection kind (Q2) ----------
function hardnessTable(net, eps) {
  const kinds = {}; const cellsOf = (n) => net.code[n];
  const add = (kind, a, b, W, H) => { for (const i of cellsOf(a)) for (const j of cellsOf(b)) { const w = W[i * N + j]; if (w > 0.5) (kinds[kind] = kinds[kind] || []).push(H[i * N + j]); } };
  for (const e of eps.slice(0, 40)) add('U->A   (one-off)', e[0], e[1], net.Wss, net.Hss);
  for (let a = 0; a < NA; a++) add('A->went (shared)', 'A' + a, 'went', net.Wss, net.Hss);
  add('went->to (shared)', 'went', 'to', net.Wss, net.Hss);
  for (let p = 0; p < NP; p++) add('to->P   (shared)', 'to', 'P' + p, net.Wss, net.Hss);
  for (let p = 0; p < NP; p++) add('P->ate  (shared)', 'P' + p, 'ate', net.Wss, net.Hss);
  for (let p = 0; p < NP; p++) add('ate->F  (shared)', 'ate', 'F' + p, net.Wss, net.Hss);
  // context -> place connections that carried episode-specific info
  const k = net.k;
  for (const e of eps.slice(0, 40)) { let x = new Float32Array(N); for (const n of e.slice(0, 4)) for (let j = 0; j < N; j++) x[j] = LAMBDA_ * x[j] + net.proj[n][j];
    const c = kwta(x, k, net.r); for (const i of c) for (const j of net.code[e[4]]) { const w = net.Wcs[i * N + j]; if (w > 0.5) (kinds['ctx->P  (episode)'] = kinds['ctx->P  (episode)'] || []).push(net.Hcs[i * N + j]); } }
  return kinds;
}

// ---------- Q5 joining during quiet ----------
function quiet(net, nReplay, log) {
  const { k, r } = net; const pool = net.names;
  for (let q = 0; q < nReplay; q++) {
    const syms = Object.keys(net.heat); const ws = syms.map(n => net.heat[n] ** 2); const tot = ws.reduce((a, b) => a + b, 0);
    let u = r() * tot, start = syms[0]; for (let i = 0; i < syms.length; i++) { u -= ws[i]; if (u <= 0) { start = syms[i]; break; } }
    log.push(start); net.heat[start] *= 0.5;
    let x = Float32Array.from(net.proj[start]); let s = net.code[start]; let c = kwta(x, k, r); const used = [new Uint8Array(N * N), new Uint8Array(N * N)];
    for (let t = 0; t < 4; t++) {
      const pred = kwta(input(net, s, c), k, r); if (!pred.length) break;
      const d = decode(net, pred, pool); if (d.ov < k / 2) break;
      const ctxPred = kwta(input(net, null, c), k, r);
      const heat = 1 - overlap(ctxPred, net.code[d.sym]) / k;   // routes disagree = internal misfit
      net.heat[d.sym] = (net.heat[d.sym] || 0) + 0.5 * heat;
      learn(net, net.Wcs, net.Hcs, c, net.code[d.sym], [], heat, used);
      s = net.code[d.sym]; for (let j = 0; j < N; j++) x[j] = LAMBDA_ * x[j] + net.proj[d.sym][j]; c = kwta(x, k, r);
    }
  }
}
function joinTest(seed, k) {
  const out = {};
  for (const cond of ['none', 'quiet', 'quiet-before']) {
    const res = run(seed, k, 60); const net = res.net; const log = [];
    const E1 = ['U60', 'X', 'Y'], E2 = ['U61', 'Y', 'Z'];
    experience(net, E1); if (cond === 'quiet-before') quiet(net, 40, log);
    experience(net, E2); if (cond === 'quiet') quiet(net, 40, log);
    // context route alone, after X,Y: does it predict Z? (symbol route Y->Z is trivially there)
    const o = replay(net, ['X', 'Y'], 1, net.names, null, false);
    let x = new Float32Array(N); for (const n of ['X', 'Y']) for (let j = 0; j < N; j++) x[j] = LAMBDA_ * x[j] + net.proj[n][j];
    const c = kwta(x, k, net.r); const p = kwta(input(net, null, c), k, net.r);
    out[cond] = { hit: o.out[0] === 'Z' ? 1 : 0, ov: overlap(p, net.code['Z']) / k, startsX: log.filter(s => s === 'X').length, n: log.length };
  }
  return out;
}

const PART = process.env.PART ?? 'all';   // 'old' | 'sep' | 'all'
// ================= main =================
if (PART !== 'sep') {
console.log('Sketch 04: episodes and knowledge. Template "U A went to P ate F", U unique per episode.');
console.log(`N=${N} cells per pool, LAMBDA=${LAMBDA_}, hard = hardness>=${HARD}, seeds ${SEEDS.join(',')}\n`);

const configs = [['sparse', 8], ['mid', 32], ['dense', 80]];
const sizes = [25, 100, 300];
const R = {};
// 300-episode runs only for the sparse code, to keep the run short
for (const [name, k] of configs) for (const nEp of sizes) if (nEp < 300 || name === 'sparse') R[name + nEp] = SEEDS.map(s => run(s, k, nEp));

console.log('Q1/Q4  Episodic recall from the unique cue (agent and place correct, %, all seeds pooled)');
console.log('code    k   eps | agent place both | by age (both%): newest10  mid  oldest10 | wrong place = sibling% | mix@place | ctx ovl same-agent / diff / chance | heat/ep first10 last10');
for (const [name, k] of configs) for (const nEp of sizes) {
  const rs = R[name + nEp]; if (!rs) continue; const all = rs.flatMap(r => r.epi_all);
  const both = all.map(e => e.agent && e.place ? 1 : 0);
  const byAge = (f) => all.filter(f).map(e => e.agent && e.place ? 1 : 0);
  console.log(`${name.padEnd(7)}${String(k).padStart(3)} ${String(nEp).padStart(5)} |${pct(all.map(e => +e.agent))}  ${pct(all.map(e => +e.place))} ${pct(both)} |              ${pct(byAge(e => e.age < 10))} ${pct(byAge(e => e.age >= nEp / 2 - 5 && e.age < nEp / 2 + 5))}   ${pct(byAge(e => e.age >= nEp - 10))}    |         ${pct(all.filter(e => e.agent && !e.place).map(e => +e.intr))}           |   ${mean(rs.map(r => r.mix)).toFixed(2)}    |      ${mean(rs.map(r => r.ctxSame)).toFixed(2)}   /  ${mean(rs.map(r => r.ctxDiff)).toFixed(2)} / ${(k / N).toFixed(2)}     |   ${mean(rs.map(r => r.heatFirst)).toFixed(2)}  ${mean(rs.map(r => r.heatLast)).toFixed(2)}`);
}

console.log('\nQ1b  Context drift sweep (sparse k=8, 100 episodes): how much of the unique cue survives to the place step');
console.log('LAMBDA | both% | ctx ovl same-agent / diff | held-out gen%');
for (const L of [0.3, 0.6, 0.85, 0.95]) { const save = LAMBDA_; LAMBDA_ = L;
  const rs = SEEDS.map(s => run(s, 8, 100)); LAMBDA_ = save; const all = rs.flatMap(r => r.epi_all);
  console.log(`  ${L.toFixed(2)} |  ${pct(all.map(e => e.agent && e.place ? 1 : 0))} |      ${mean(rs.map(r => r.ctxSame)).toFixed(2)}   /  ${mean(rs.map(r => r.ctxDiff)).toFixed(2)}     |   ${pct(rs.flatMap(r => r.gen_all))}`); }

console.log('\nQ2  Hardness of connections by kind (sparse, 100 episodes, seed 1). Hardness ~ number of episodes that used it.');
{ const r = R.sparse100[0]; const kinds = hardnessTable(r.net, r.eps);
  console.log('kind                 n    median  p10  p90   %hard(>=' + HARD + ')');
  for (const kd in kinds) { const v = kinds[kd].slice().sort((a, b) => a - b); const q = (f) => v[Math.floor(f * (v.length - 1))];
    console.log(`${kd.padEnd(19)}${String(v.length).padStart(5)}  ${String(q(0.5)).padStart(6)} ${String(q(0.1)).padStart(4)} ${String(q(0.9)).padStart(4)}   ${pct(v.map(h => h >= HARD ? 1 : 0))}`); }
  // overall distribution of hardness among strong connections
  const hist = new Array(8).fill(0); const edges = [0, 1, 2, 3, 5, 10, 30, 100];
  for (const [W, H] of [[r.net.Wss, r.net.Hss], [r.net.Wcs, r.net.Hcs]]) for (let i = 0; i < N * N; i++) if (W[i] > 0.5) { let b = 0; while (b + 1 < edges.length && H[i] >= edges[b + 1]) b++; hist[b]++; }
  console.log('all strong connections (w>0.5), hardness histogram:');
  console.log('  ' + edges.map((e, i) => `${e}${i + 1 < edges.length ? '-' + (edges[i + 1] - 1) : '+'}: ${hist[i]}`).join('  '));
}

console.log('\nQ1+Q3  Lesion by hardness (sparse/mid/dense, 100 episodes, all seeds). Recall uses only connections in the mask.');
console.log('code   mask | episodic both% | template went/to/ate% | held-out pair -> ate,F_p % | free run from agent consistent %');
for (const [name] of configs) for (const m in masks) {
  const rs = R[name + 100]; const all = rs.flatMap(r => r['epi_' + m]);
  console.log(`${name.padEnd(7)}${m.padEnd(5)}|      ${pct(all.map(e => e.agent && e.place ? 1 : 0))}      |       ${pct(all.map(e => +e.sem))}          |          ${pct(rs.flatMap(r => r['gen_' + m]))}            |     ${pct(rs.flatMap(r => r['free_' + m]))}`);
}

console.log('\nQ5  Joining X->Y (episode 1) and Y->Z (episode 2) during quiet. Context route alone after X,Y: predicts Z?');
console.log('code   condition     | ctx-route says Z % | ctx overlap with Z | replays starting at X (of 40)');
for (const [name, k] of [['sparse', 8], ['mid', 32]]) {
  const js = SEEDS.map(s => joinTest(s, k));
  for (const cond of ['none', 'quiet', 'quiet-before'])
    console.log(`${name.padEnd(7)}${cond.padEnd(14)}|        ${pct(js.map(j => j[cond].hit))}        |       ${mean(js.map(j => j[cond].ov)).toFixed(2)}         |   ${mean(js.map(j => j[cond].startsX)).toFixed(1)}`);
}
} // end PART old

// =====================================================================
// Part 2 (follow-up): does pattern separation keep episode detail soft?
// Same mechanics as above, re-implemented with sparse weight storage so the
// pools can be large. Settings fixed before running (no tuning on the measure):
//   base : N=400  symbol cells, k=8, context = kWTA_8(trace) in the same 400 cells (as part 1)
//   A    : N=3200 symbol cells, k=8, context = kWTA_8(trace) in 3200 cells
//   B    : N=400, k=8, context = kWTA_8( E·trace ), E fixed random, 4000 cells, fan-in 16
//   A+B  : N=3200, k=8, context = kWTA_8( E·trace ), 16000 cells, fan-in 16
// The trace already contains the current symbol (x <- 0.85·x + R·code(sym)).
// =====================================================================
const VARIANTS = [
  { name: 'base', N: 400, k: 8, Mc: 0 },
  { name: 'A', N: 3200, k: 8, Mc: 0 },
  { name: 'B', N: 400, k: 8, Mc: 4000, kc: 8, fan: 16 },
  { name: 'A+B', N: 3200, k: 8, Mc: 16000, kc: 8, fan: 16 },
  // C (follow-up 2): no drifting trace. Episode machine holds the cue, undecayed; sequence
  // machine = current symbol. Context = conjunctive code of (sequence cell, episode cell) pairs,
  // each pair hashed into an implicit pool of 2^24 cells and kept with prob 1/8 (~8 of 64 pairs).
  { name: 'C-400', N: 400, k: 8, conj: true },
  { name: 'C', N: 3200, k: 8, conj: true },
  // C2 (added after C failed generalisation): the sequence machine's state is the pair
  // (previous symbol, current symbol), shared across episodes, as its own conjunctive code.
  // Context = sequence-machine code  ∪  (current symbol × episode) code.
  { name: 'C2-400', N: 400, k: 8, conj: true, seq2: true },
  { name: 'C2', N: 3200, k: 8, conj: true, seq2: true },
];
const ONLY = process.env.VARIANTS ? process.env.VARIANTS.split(',') : null;
const CONJ_POOL = 1 << 24;
function conjCode(net, symCells, epCells, salt = 0) {
  const out = new Set();
  for (const a of symCells) for (const b of epCells) {
    let h = Math.imul(a + 1, 0x9E3779B1) ^ Math.imul(b + 7, 0x85EBCA77) ^ net.hashSeed ^ salt;
    h = Math.imul(h ^ (h >>> 15), 0x2C1B3C6D); h ^= h >>> 13; h = h >>> 0;
    if ((h & 7) === 0) out.add((h >>> 3) % CONJ_POOL);
  }
  return [...out];
}
const rowOf = (M, i, make) => { if (!(M instanceof Map)) return M[i]; let p = M.get(i); if (!p && make) { p = { j: [], w: [], h: [], m: new Map() }; M.set(i, p); } return p; };
function kwtaV(v, k, r) {
  const idx = []; for (let i = 0; i < v.length; i++) if (v[i] > 1e-6) { v[i] += r() * 1e-4; idx.push(i); }
  if (idx.length <= k) return idx;
  idx.sort((a, b) => v[b] - v[a]); return idx.slice(0, k);
}
const mat = (n) => Array.from({ length: n }, () => ({ j: [], w: [], h: [], m: new Map() }));
function makeNet2(seed, cfg, nEp) {
  const { N, k } = cfg, D = N, r = rng(seed);
  const names = fixed.slice(); for (let i = 0; i < nEp + 4; i++) names.push('U' + i);
  const code = {}; for (const n of names) { const a = new Set(); while (a.size < k) a.add(Math.floor(r() * N)); code[n] = [...a]; }
  const rows = new Map(); const row = (i) => { let v = rows.get(i); if (!v) { const rr = rng(seed * 7919 + i * 31 + 1); v = new Float32Array(D); for (let j = 0; j < D; j++) v[j] = rr() * 2 - 1; rows.set(i, v); } return v; };
  const proj = {}; for (const n of names) { const p = new Float32Array(D); for (const i of code[n]) { const v = row(i); for (let j = 0; j < D; j++) p[j] += v[j]; } proj[n] = p; }
  let E = null; if (cfg.Mc) { E = { src: new Int32Array(cfg.Mc * cfg.fan), w: new Float32Array(cfg.Mc * cfg.fan) };
    for (let q = 0; q < E.src.length; q++) { E.src[q] = Math.floor(r() * D); E.w[q] = r() * 2 - 1; } }
  const ctxN = cfg.conj ? CONJ_POOL : (cfg.Mc || D);
  if (cfg.conj) { const idx = Array.from({ length: N }, () => []); for (const n of names) for (const i of code[n]) idx[i].push(n);
    return { r, cfg, k, names, code, proj: null, E: null, D: 1, ctxN, kc: 8, ss: mat(N), cs: new Map(), heat: {}, idx, hashSeed: (seed * 2654435761) | 0 }; }
  const idx = Array.from({ length: N }, () => []); for (const n of names) for (const i of code[n]) idx[i].push(n);
  return { r, cfg, k, names, code, proj, E, D, ctxN, kc: cfg.Mc ? cfg.kc : k, ss: mat(N), cs: mat(ctxN), heat: {}, idx };
}
function ctx2(net, x) {
  if (!net.E) return kwtaV(Float32Array.from(x), net.k, net.r);
  const { Mc, fan } = net.cfg, y = new Float32Array(Mc), { src, w } = net.E;
  for (let m = 0, q = 0; m < Mc; m++) { let a = 0; for (let f = 0; f < fan; f++, q++) a += w[q] * x[src[q]]; y[m] = a; }
  return kwtaV(y, net.kc, net.r);
}
const step2 = (net, x, sym) => { if (net.cfg.conj) { if (x.ep === undefined) x.ep = sym;
    const epPart = conjCode(net, net.code[sym], net.code[x.ep]); x.epPart = epPart;
    let out = epPart;
    if (net.cfg.seq2 && x.prev !== undefined) out = [...new Set([...epPart, ...conjCode(net, net.code[x.prev], net.code[sym], 0x5EED)])];
    x.prev = sym; return out; }
  const p = net.proj[sym]; for (let j = 0; j < net.D; j++) x[j] = LAMBDA_ * x[j] + p[j]; return ctx2(net, x); };
const trace2 = (net, syms) => { const x = new Float32Array(net.D); let c; for (const n of syms) c = step2(net, x, n); return c; };
const epTrace2 = (net, syms) => { if (!net.cfg.conj) return trace2(net, syms); const x = new Float32Array(1); for (const n of syms) step2(net, x, n); return x.epPart; };
function inp2(net, s, c, mask) {
  const v = new Float32Array(net.cfg.N);
  const add = (M, pre) => { for (const i of pre) { const p = rowOf(M, i, false); if (!p) continue; for (let q = 0; q < p.j.length; q++) { const w = p.w[q]; if (w > 0 && (!mask || mask(p.h[q]))) v[p.j[q]] += w; } } };
  if (s) add(net.ss, s); if (c) add(net.cs, c); return v;
}
function dec2(net, pat) {
  const cnt = new Map(); for (const i of pat) for (const n of net.idx[i]) cnt.set(n, (cnt.get(n) || 0) + 1);
  let best = null, bo = 0; for (const [n, o] of cnt) if (o > bo) { bo = o; best = n; } return { sym: best, ov: bo };
}
function learn2(M, pre, actual, wrong, heat, used) {
  for (const i of pre) { const p = rowOf(M, i, true);
    for (const j of actual) { let q = p.m.get(j); if (q === undefined) { q = p.j.length; p.j.push(j); p.w.push(0); p.h.push(0); p.m.set(j, q); }
      p.w[q] += (0.05 + plast(heat, p.h[q])) * (1 - p.w[q]); let u = used.get(p); if (!u) used.set(p, u = new Set()); u.add(q); }
    for (const j of wrong) { const q = p.m.get(j); if (q !== undefined && p.w[q] > 0) p.w[q] -= 0.5 * plast(heat, p.h[q]) * p.w[q]; }
  }
}
function experience2(net, ep) {
  const { k, r } = net, used = new Map(); const x = new Float32Array(net.D);
  let s = net.code[ep[0]], c = step2(net, x, ep[0]);
  for (let t = 0; t + 1 < ep.length; t++) {
    const pred = kwtaV(inp2(net, s, c), k, r), actual = net.code[ep[t + 1]];
    const heat = 1 - overlap(pred, actual) / k; const wrong = pred.filter(j => !actual.includes(j));
    for (const n of [ep[t], ep[t + 1]]) net.heat[n] = (net.heat[n] || 0) + heat;
    learn2(net.ss, s, actual, wrong, heat, used); learn2(net.cs, c, actual, wrong, heat, used);
    s = actual; c = step2(net, x, ep[t + 1]);
  }
  for (const [p, qs] of used) for (const q of qs) if (p.w[q] > 0.5) p.h[q]++;
  for (const n in net.heat) net.heat[n] *= 0.97;
}
function replay2(net, force, steps, mask, useSym = true) {
  const { k, r } = net, out = []; const x = new Float32Array(net.D);
  let s = net.code[force[0]], c = step2(net, x, force[0]);
  for (let t = 1; t < force.length + steps; t++) {
    const pred = kwtaV(inp2(net, useSym ? s : null, c, mask), k, r); const d = dec2(net, pred);
    const sym = t < force.length ? force[t] : d.sym; if (t >= force.length) out.push(d.sym || '-');
    if (!sym) break; s = net.code[sym]; c = step2(net, x, sym);
  }
  return out;
}
function run2(seed, cfg, nEp, full) {
  const net = makeNet2(seed, cfg, nEp), eps = stream(seed, nEp);
  for (const e of eps) experience2(net, e);
  const res = { eps, net };
  const ms = full ? Object.keys(masks) : ['all'];
  for (const m of ms) res['epi_' + m] = eps.map(e => { const o = replay2(net, [e[0]], 6, masks[m]); return o[0] === e[1] && o[3] === e[4] ? 1 : 0; });
  if (!full) return res;
  // overlap normalised by geometric mean of code sizes (conjunctive codes vary in size)
  const nov = (a, b) => a.length && b.length ? overlap(a, b) / Math.sqrt(a.length * b.length) : 0;
  const cx = eps.slice(0, 60).map(e => trace2(net, e.slice(0, 4))); const ov = [], ovd = [];
  for (let i = 0; i < cx.length; i++) for (let j = i + 1; j < cx.length; j++) (eps[i][1] === eps[j][1] ? ov : ovd).push(nov(cx[i], cx[j]));
  res.ctxSame = mean(ov); res.ctxDiff = mean(ovd);
  const ex = eps.slice(0, 60).map(e => epTrace2(net, e.slice(0, 4))); const eo = [];
  for (let i = 0; i < ex.length; i++) for (let j = i + 1; j < ex.length; j++) if (eps[i][1] === eps[j][1]) eo.push(nov(ex[i], ex[j]));
  res.epOv = mean(eo);
  for (const m in masks) {
    const g = []; for (let i = 0; i < NA; i++) { const o = replay2(net, ['A' + i, 'went', 'to', 'P' + i], 2, masks[m]); g.push(o[0] === 'ate' && o[1] === 'F' + i ? 1 : 0); }
    res['gen_' + m] = g;
  }
  // hardness by kind
  const kinds = { 'U->A one-off': [], 'template shared': [], 'ctx->P episode': [], 'ctx->A episode': [] };
  const hOf = (M, pre, post, into) => { for (const i of pre) { const p = rowOf(M, i, false); if (!p) continue; for (const j of post) { const q = p.m.get(j); if (q !== undefined && p.w[q] > 0.5) into.push(p.h[q]); } } };
  for (const e of eps) {
    hOf(net.ss, net.code[e[0]], net.code[e[1]], kinds['U->A one-off']);
    hOf(net.cs, epTrace2(net, e.slice(0, 4)), net.code[e[4]], kinds['ctx->P episode']);
    hOf(net.cs, epTrace2(net, e.slice(0, 1)), net.code[e[1]], kinds['ctx->A episode']);
  }
  const pairs = [['went', 'to']]; for (let a = 0; a < NA; a++) pairs.push(['A' + a, 'went']);
  for (let p = 0; p < NP; p++) pairs.push(['to', 'P' + p], ['P' + p, 'ate'], ['ate', 'F' + p]);
  for (const [a, b] of pairs) hOf(net.ss, net.code[a], net.code[b], kinds['template shared']);
  res.kinds = kinds;
  return res;
}
function quiet2(net, nReplay, log = []) {
  const { k, r } = net;
  for (let q = 0; q < nReplay; q++) {
    const syms = Object.keys(net.heat), ws = syms.map(n => net.heat[n] ** 2), tot = ws.reduce((a, b) => a + b, 0);
    let u = r() * tot, start = syms[0]; for (let i = 0; i < syms.length; i++) { u -= ws[i]; if (u <= 0) { start = syms[i]; break; } }
    log.push(start); net.heat[start] *= 0.5; const used = new Map(); const x = new Float32Array(net.D);
    let s = net.code[start], c = step2(net, x, start);
    for (let t = 0; t < 4; t++) {
      const pred = kwtaV(inp2(net, s, c), k, r); if (!pred.length) break; const d = dec2(net, pred); if (d.ov < k / 2) break;
      const heat = 1 - overlap(kwtaV(inp2(net, null, c), k, r), net.code[d.sym]) / k;
      net.heat[d.sym] = (net.heat[d.sym] || 0) + 0.5 * heat;
      learn2(net.cs, c, net.code[d.sym], [], heat, used);
      s = net.code[d.sym]; c = step2(net, x, d.sym);
    }
  }
}
function join2(seed, cfg, cue = ['X', 'Y']) {
  const out = {};
  for (const cond of ['none', 'quiet', 'quiet-before']) {
    const net = makeNet2(seed, cfg, 60); for (const e of stream(seed, 60)) experience2(net, e);
    experience2(net, ['U60', 'X', 'Y']); if (cond === 'quiet-before') quiet2(net, 40);
    experience2(net, ['U61', 'Y', 'Z']); if (cond === 'quiet') quiet2(net, 40);
    out[cond] = replay2(net, cue, 1, null, false)[0] === 'Z' ? 1 : 0;
  }
  return out;
}

if (PART !== 'old') {
  console.log('\n=== Part 2: pattern separation (follow-up). LAMBDA=' + LAMBDA_ + ', seeds ' + SEEDS.join(','));
  console.log('variant | symbol N/k | context cells/k | ctx ovl same-agent / diff / chance | ctx->P %hard (median h) | ctx->A %hard | U->A %hard | template %hard');
  const R2 = {};
  for (const v of VARIANTS) { if (ONLY && !ONLY.includes(v.name)) continue;
    const t0 = Date.now();
    R2[v.name] = { full: SEEDS.map(s => run2(s, v, 100, true)), e25: SEEDS.map(s => run2(s, v, 25, false)), e300: SEEDS.map(s => run2(s, v, 300, false)), join: SEEDS.map(s => join2(s, v)), joinU: SEEDS.map(s => join2(s, v, ['U60', 'X', 'Y'])) };
    const rs = R2[v.name].full; const K = (kd) => rs.flatMap(r => r.kinds[kd]); const hp = (a) => pct(a.map(h => h >= HARD ? 1 : 0));
    const med = (a) => { const b = a.slice().sort((x, y) => x - y); return b.length ? b[b.length >> 1] : '-'; };
    const net = rs[0].net;
    console.log(`${v.name.padEnd(7)} | ${String(v.N).padStart(4)}/${v.k}     | ${String(net.ctxN).padStart(5)}/${net.kc}         |      ${mean(rs.map(r => r.ctxSame)).toFixed(2)}   /  ${mean(rs.map(r => r.ctxDiff)).toFixed(2)} / ${(net.kc / net.ctxN).toFixed(3)} (episode part same-agent ${mean(rs.map(r => r.epOv)).toFixed(2)}) |   ${hp(K('ctx->P episode'))} (${med(K('ctx->P episode'))})  n=${String(K('ctx->P episode').length).padStart(4)} |  ${hp(K('ctx->A episode'))}        | ${hp(K('U->A one-off'))}       | ${hp(K('template shared'))}   [${((Date.now() - t0) / 1000).toFixed(1)}s]`);
  }
  console.log('\nhardness histogram of strong ctx->P connections (100 eps, all seeds): h = 1 | 2 | 3-4 | 5-9 | 10+');
  for (const v of VARIANTS) { if (!R2[v.name]) continue; const a = R2[v.name].full.flatMap(r => r.kinds['ctx->P episode']); const b = [0, 0, 0, 0, 0];
    for (const h of a) b[h <= 1 ? 0 : h === 2 ? 1 : h < 5 ? 2 : h < 10 ? 3 : 4]++;
    console.log(`  ${v.name.padEnd(5)} ` + b.map(x => pct([x / Math.max(1, a.length)]).trim() + '%').map(s => s.padStart(5)).join(' ')); }
  console.log('\nvariant | episodic both% at 25 / 100 / 300 eps | 100 eps: episodic hard-only / soft-only | held-out gen all / hard / soft | quiet join: none / quiet / quiet-before');
  for (const v of VARIANTS) { const R = R2[v.name]; if (!R) continue; const f = R.full;
    console.log(`${v.name.padEnd(7)} |        ${pct(R.e25.flatMap(r => r.epi_all))} / ${pct(f.flatMap(r => r.epi_all))} / ${pct(R.e300.flatMap(r => r.epi_all))}           |        ${pct(f.flatMap(r => r.epi_hard))} / ${pct(f.flatMap(r => r.epi_soft))}                   |     ${pct(f.flatMap(r => r.gen_all))} / ${pct(f.flatMap(r => r.gen_hard))} / ${pct(f.flatMap(r => r.gen_soft))}        |   ${pct(R.join.map(j => j.none))} / ${pct(R.join.map(j => j.quiet))} / ${pct(R.join.map(j => j['quiet-before']))}   | cue U60,X,Y: ${pct(R.joinU.map(j => j.none))} / ${pct(R.joinU.map(j => j.quiet))} / ${pct(R.joinU.map(j => j['quiet-before']))}`); }
  console.log('\nclean split at threshold ' + HARD + '? % of one-off/episodic strong links (U->A, ctx->A, ctx->P) at h<' + HARD + ' vs % of template links at h>=' + HARD);
  for (const v of VARIANTS) { const R = R2[v.name]; if (!R) continue; const f = R.full;
    const epi = f.flatMap(r => [...r.kinds['U->A one-off'], ...r.kinds['ctx->A episode'], ...r.kinds['ctx->P episode']]), tem = f.flatMap(r => r.kinds['template shared']);
    const tmin = Math.min(...tem), emax = Math.max(...epi);
    console.log(`  ${v.name.padEnd(6)} episodic soft ${pct(epi.map(h => h < HARD ? 1 : 0))}%  template hard ${pct(tem.map(h => h >= HARD ? 1 : 0))}%   (episodic max h ${emax}, template min h ${tmin})`); }
}
