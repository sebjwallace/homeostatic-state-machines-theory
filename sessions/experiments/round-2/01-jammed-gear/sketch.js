// Sketch 01: the jammed gear.
// A chain of 5 small state machines hands energy along. One hand-off is made
// wrong by the world (a jam); heat builds there and lets things move until the
// energy flows again. Three freezing rules are compared. No dependencies.
// Run: node sketch.js

// ---------- seeded randomness ----------
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- parameters (kept few and visible) ----------
const P = 4;          // inputs in the repeating pattern
const STAGES = 5;     // machines M0..M4; hand-offs between stage i and i+1
const NS = 6;         // states per machine (4 used, 2 spare)
const COOL = 0.05;    // heat lost per step everywhere: h *= 1 - COOL
const SPREAD = 0.3;   // fraction of a misfit's heat that leaks to neighbouring junctions
const T0 = 0.02, KT = 0.3; // choice temperature = T0 + KT * heat
const MELT0 = 0.5, WIDTH = 2; // plasticity = clamp((heat - melt) / WIDTH, 0, 1)
const HK = 0.4;       // earned hardness: melt = MELT0 + HK * hardness
const JIGGLE = 0.5;   // chance per misfit that a fully plastic failing edge resets
const GROW = 0.3;     // chance per misfit to grow a new edge, scaled by (1 - plasticity)
const LR = 0.3, WMAX = 3, WNEW = 0.3;
const NOISE = 0.02;   // per-step chance of a one-step world blip during the happy run
const HD = 0.5, HS = 0.1; // disturbed above HD; settled when back below HS
const JAM_STEPS = 800, REVERT_STEPS = 800, WINDOW = 30;

// ---------- world ----------
function makeWorld(r) {
  // path[x][i] = the state machine i should be in for input x (distinct per input)
  const path = [];
  const cols = [];
  for (let i = 0; i < STAGES; i++) {
    const perm = [...Array(NS).keys()];
    for (let j = NS - 1; j > 0; j--) { const k = Math.floor(r() * (j + 1)); [perm[j], perm[k]] = [perm[k], perm[j]]; }
    cols.push(perm.slice(0, P));
  }
  for (let x = 0; x < P; x++) path.push(cols.map(c => c[x]));
  return path;
}
// The jam: for input 0, hand-off from stage JS to JS+1 now leads where input 1's does,
// and the rest of input 0's path follows input 1's. Exactly one connection becomes wrong.
const JS = 2;
function jammedWorld(path) {
  const p = path.map(a => a.slice());
  for (let i = JS + 1; i < STAGES; i++) p[0][i] = path[1][i];
  return p;
}

// ---------- automaton ----------
// node (i, s): junction leaving machine i in state s. Holds heat and a list of edges.
// edge: { to, w, hard, orig } — orig marks pre-configured edges.
function makeAutomaton(path) {
  const nodes = [];
  for (let i = 0; i < STAGES - 1; i++) {
    nodes.push([]);
    for (let s = 0; s < NS; s++) nodes[i].push({ h: 0, edges: [], disturbed: false, last: null });
    for (let x = 0; x < P; x++)
      nodes[i][path[x][i]].edges.push({ to: path[x][i + 1], w: 1, hard: 1, orig: true });
  }
  return nodes;
}

function plasticity(rule, e, h) {
  let melt;
  if (rule === 'none') melt = MELT0;
  else if (rule === 'earned') melt = MELT0 + HK * e.hard;
  else melt = e.hard > 0 ? Infinity : MELT0; // permanent: frozen once settled
  return Math.max(0, Math.min(1, (h - melt) / WIDTH));
}

function step(A, world, x, rule, r, stats) {
  let s = world[x][0];
  const fired = [];
  for (let i = 0; i < STAGES - 1; i++) {
    const n = A[i][s];
    fired.push(n);
    if (n.edges.length === 0) { misfit(A, i, s, null, fired, rule, r, stats); return false; }
    // choose an edge: softmax of weights at local temperature (hot = exploratory)
    const T = T0 + KT * n.h;
    const mx = Math.max(...n.edges.map(f => f.w));
    const ws = n.edges.map(e => Math.exp((e.w - mx) / T));
    let u = r() * ws.reduce((a, b) => a + b, 0), k = 0;
    while (u > ws[k] && k < ws.length - 1) { u -= ws[k]; k++; }
    const e = n.edges[k];
    const p = plasticity(rule, e, n.h);
    const target = world[x][i + 1];
    if (e.to === target) {
      e.w += LR * p * (WMAX - e.w);   // a used, fitting edge strengthens only while warm
      n.last = e;
      s = target;
    } else {
      e.w = Math.max(0, e.w - LR * p * e.w);
      misfit(A, i, s, e, fired, rule, r, stats);
      return false;
    }
  }
  return true;
}

// A failed hand-off: heat here, a little heat to neighbours, and then the failing
// edge either melts and resets (prob = its plasticity) or, if it is too hard to
// move, the junction may grow a new young edge beside it (patchwork).
function misfit(A, i, s, e, fired, rule, r, stats) {
  const n = A[i][s];
  n.h += 1;
  if (i > 0) fired[i - 1].h += SPREAD;                    // back along the chain
  if (e && i + 1 < STAGES - 1) A[i + 1][e.to].h += SPREAD; // forward to where it wrongly went
  const p = e ? plasticity(rule, e, n.h) : 0;
  const key = i + ':' + s;
  if (e && r() < JIGGLE * p) {
    const old = e.to;
    e.to = Math.floor(r() * NS);
    if (e.to !== old) {
      stats.resets++; stats.touched.add(key);
      if (e.orig) stats.origResets++;
      e.orig = false; e.hard = 0; e.w = WNEW;  // a reset connection is a new, unhardened one
    }
  } else if (n.edges.length < 2 * NS && r() < GROW * (1 - p)) {
    n.edges.push({ to: Math.floor(r() * NS), w: WNEW, hard: 0, orig: false, young: true });
    stats.grown++; stats.touched.add(key);
  }
}

function coolAndSettle(A, rule) {
  for (const row of A) for (const n of row) {
    n.h *= 1 - COOL;
    if (n.h > HD) n.disturbed = true;
    if (n.disturbed && n.h < HS) {
      n.disturbed = false;
      if (n.last) n.last.hard += 1; // the edge that carried the flow while it calmed
    }
    // prune young edges that have withered
    n.edges = n.edges.filter(e => e.hard > 0 || e.w > 0.05 || e === n.last);
  }
}

const totalHeat = A => A.flat().reduce((a, n) => a + n.h, 0);
const winner = n => n.edges.length ? n.edges.reduce((a, b) => (b.w > a.w ? b : a)).to : -1;

function phase(A, world, rule, r, steps, t0, jamNode, trace) {
  const stats = { resets: 0, origResets: 0, grown: 0, touched: new Set() };
  const before = A.map(row => row.map(winner));
  let peak = 0, peakElse = 0, total = 0, recovered = -1, run = 0;
  for (let t = 0; t < steps; t++) {
    const ok = step(A, world, (t0 + t) % P, rule, r, stats);
    coolAndSettle(A, rule);
    run = ok ? run + 1 : 0;
    if (recovered < 0 && run >= WINDOW) recovered = t - WINDOW + 1;
    const th = totalHeat(A);
    total += th;
    for (let i = 0; i < A.length; i++) for (let s = 0; s < NS; s++) {
      const h = A[i][s].h;
      if (i === jamNode[0] && s === jamNode[1]) peak = Math.max(peak, h);
      else peakElse = Math.max(peakElse, h);
    }
    if (trace && t % 8 === 0 && t < 160) trace.push(heatRow(A, jamNode, t));
  }
  const after = A.map(row => row.map(winner));
  let changedElse = 0;
  for (let i = 0; i < A.length; i++) for (let s = 0; s < NS; s++)
    if (before[i][s] !== after[i][s] && !(i === jamNode[0] && s === jamNode[1])) changedElse++;
  const touchedElse = [...stats.touched].filter(k => k !== jamNode.join(':')).length;
  return { recovered, peak, peakElse, total, ...stats, touchedElse, changedElse };
}

// ASCII heat around the jam: the jammed junction (J), the one feeding it (up),
// and the one it should hand to (down), plus the hottest anywhere else.
const SHADES = ' .:-=+*#%@';
function heatRow(A, [i, s], t) {
  const bar = h => SHADES[Math.min(9, Math.floor(h * 1.5))];
  const cell = h => (bar(h).repeat(3) + ' ' + h.toFixed(1).padStart(4));
  return `t=${String(t).padStart(3)}  up ${cell(A[i - 1].reduce((m, n) => Math.max(m, n.h), 0))} | J ${cell(A[i][s].h)} | down ${cell(A[i + 1].reduce((m, n) => Math.max(m, n.h), 0))}`;
}

function run(rule, happySteps, seed, traces) {
  const r = rng(seed);
  const world = makeWorld(r);
  const A = makeAutomaton(world);
  const jamNode = [JS, world[0][JS]];
  // happy run with occasional one-step blips (the world briefly disagrees somewhere)
  let flowedHappy = 0;
  for (let t = 0; t < happySteps; t++) {
    const x = t % P;
    let w = world;
    if (r() < NOISE) {
      w = world.map(a => a.slice());
      const i = 1 + Math.floor(r() * (STAGES - 1));
      w[x][i] = (w[x][i] + 1 + Math.floor(r() * (NS - 1))) % NS;
    }
    if (step(A, w, x, rule, r, { resets: 0, origResets: 0, grown: 0, touched: new Set() })) flowedHappy++;
    coolAndSettle(A, rule);
  }
  const jamEdge = A[jamNode[0]][jamNode[1]].edges.find(e => e.orig);
  const hardAtJam = jamEdge ? jamEdge.hard : 0;
  const healthyBefore = A.every((row, i) => [...Array(P).keys()].every(x => winner(A[i][world[x][i]]) === world[x][i + 1]));
  const jam = phase(A, jammedWorld(world), rule, r, JAM_STEPS, happySteps, jamNode, traces && traces.jam);
  const edgesAtJ = A[jamNode[0]][jamNode[1]].edges.length;
  const back = phase(A, world, rule, r, REVERT_STEPS, happySteps + JAM_STEPS, jamNode, traces && traces.back);
  const origKept = A[jamNode[0]][jamNode[1]].edges.some(e => e.orig && e.to === world[0][JS + 1]);
  const edgesEnd = A.flat().reduce((a, n) => a + n.edges.length, 0);
  return { hardAtJam, healthyBefore, jam, back, edgesAtJ, origKept, edgesEnd };
}

// ---------- the comparison ----------
const RULES = ['permanent', 'earned', 'none'];
const HAPPY = { short: 100, long: 4000, vlong: 20000 };
const SEED = 7;
const NSEEDS = 20;

const fmtRec = v => (v < 0 ? 'never' : String(v));
const med = a => { const b = a.slice().sort((x, y) => x - y); return b[Math.floor(b.length / 2)]; };

console.log(`Jammed gear sketch. seed ${SEED}; medians over ${NSEEDS} seeds in [brackets]. 'never' = no ${WINDOW}-step clean run within ${JAM_STEPS} steps (counted as ${JAM_STEPS} in medians).\n`);
const hdr = ['rule', 'happy', 'okPre', 'hardJ', 'recJam', 'peakJ', 'peakElse', 'heatSum', 'grown', 'resets', 'touchElse', 'recBack', 'heatBack', 'origKept', 'edges'];
console.log(hdr.map(h => h.padEnd(9)).join(' '));
const rows = [];
for (const rule of RULES) for (const [hl, hs] of Object.entries(HAPPY)) {
  const o = run(rule, hs, SEED);
  const many = [...Array(NSEEDS).keys()].map(k => run(rule, hs, 1000 + k));
  const m = f => med(many.map(f));
  const rec = v => (v < 0 ? JAM_STEPS : v);
  const kept = many.filter(z => z.origKept).length;
  const row = [rule, hl, `${o.healthyBefore ? 'y' : 'n'}[${many.filter(z => z.healthyBefore).length}]`, `${o.hardAtJam}[${m(z => z.hardAtJam)}]`,
    `${fmtRec(o.jam.recovered)}[${m(z => rec(z.jam.recovered))}]`,
    `${o.jam.peak.toFixed(1)}`, `${o.jam.peakElse.toFixed(1)}`, `${o.jam.total.toFixed(0)}[${m(z => z.jam.total).toFixed(0)}]`,
    `${o.jam.grown}[${m(z => z.jam.grown)}]`, `${o.jam.origResets}/${o.jam.resets}`,
    `${o.jam.touchedElse}[${m(z => z.jam.touchedElse)}]`,
    `${fmtRec(o.back.recovered)}[${m(z => rec(z.back.recovered))}]`, `${o.back.total.toFixed(0)}[${m(z => z.back.total).toFixed(0)}]`,
    `${o.origKept ? 'y' : 'n'}[${kept}/${NSEEDS}]`, `${o.edgesEnd}[${m(z => z.edgesEnd)}]`];
  rows.push(row);
  console.log(row.map(c => String(c).padEnd(9)).join(' '));
}
console.log(`\nhardJ: hardness of the jammed connection at the moment of the jam (1 = pre-configured, never re-settled)
recJam/recBack: steps until ${WINDOW} clean steps in a row after the jam / after the world reverts
peakJ / peakElse: max heat at the jammed junction / at any other junction (seed ${SEED})
grown: new edges grown; resets: retargets of original edges / all retargets
touchElse: junctions other than J whose structure changed during the jam phase
origKept: the original jammed edge still exists pointing at its old target at the end; edges: total edges at end (16 at start)`);

for (const rule of RULES) {
  const traces = { jam: [], back: [] };
  run(rule, HAPPY.long, SEED, traces);
  console.log(`\nHeat around the jam, rule=${rule}, long happy run, first 160 steps after the jam (every 8th step):`);
  console.log(traces.jam.join('\n'));
}
