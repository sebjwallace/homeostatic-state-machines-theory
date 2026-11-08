// Sketch 03: three greens. A homeostat that learns, from heat alone, which
// buttons bring three lights back to green. `node sketch.js`
'use strict';

// ---------- seeded rng ----------
function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// ---------- one small state machine, used by world and automaton alike ----------
// states: list of names; table[state][trigger] = next state.
// A reconfigurable machine may rewrite its own table entries; a world machine never does.
class SM {
  constructor(states, table, state, reconfigurable = false) {
    this.states = states; this.table = table; this.state = state; this.reconfigurable = reconfigurable;
  }
  fire(trigger) { const n = this.table[this.state]?.[trigger]; if (n !== undefined) this.state = n; return this.state; }
  rewire(state, trigger, next) { if (!this.reconfigurable) throw new Error('world cannot rewire'); this.table[state][trigger] = next; }
}

const SIDE = +(process.env.SIDE ?? 1);
const COL = ['R', 'A', 'G']; const GREEN = 2; const NB = 4; // colours, buttons
// A light: R->A->G->R on 'fwd', reverse on 'back'.
const makeLight = (s) => new SM(COL, COL.map((_, c) => ({ fwd: (c + 1) % 3, back: (c + 2) % 3 })), s);

// Button wiring: which light gets which trigger. Not one-to-one, one dud each.
const MAP_A = [[[0, 'fwd'], [1, 'fwd']], [[1, 'back']], [[2, 'fwd']], []];
const MAP_B = [[[2, 'back']], [[0, 'fwd'], [2, 'fwd']], [], [[1, 'fwd']]];

// ---------- oracle: BFS over the 27 joint states with the true wiring ----------
function oracleTable(map) {
  const key = (a) => a[0] * 9 + a[1] * 3 + a[2]; const first = new Array(27).fill(-1); const dist = new Array(27).fill(-1);
  // BFS backwards is fiddly; just BFS forward from each state (27*small)
  for (let s0 = 0; s0 < 27; s0++) {
    const start = [Math.floor(s0 / 9), Math.floor(s0 / 3) % 3, s0 % 3];
    const seen = new Map([[s0, [0, -1]]]); const q = [[start, -1]];
    while (q.length) {
      const [st, fb] = q.shift(); const k = key(st);
      if (st.every((c) => c === GREEN)) { first[s0] = seen.get(k)[1]; dist[s0] = seen.get(k)[0]; break; }
      for (let b = 0; b < NB; b++) {
        const n = st.slice(); for (const [l, t] of map[b]) n[l] = t === 'fwd' ? (n[l] + 1) % 3 : (n[l] + 2) % 3;
        const nk = key(n); if (!seen.has(nk)) { seen.set(nk, [seen.get(k)[0] + 1, fb < 0 ? b : fb]); q.push([n, fb < 0 ? b : fb]); }
      }
    }
  }
  return { first, dist };
}
const ORA = { A: oracleTable(MAP_A), B: oracleTable(MAP_B) };

// ---------- the automaton ----------
// Sensors: one SM per light, mirroring it (boundary in).
// Drivers: one reconfigurable SM per light. Its state = the button it currently "holds" for
// each sensor colour: table[colour].sense = button. Firing it presses that button (boundary out).
// Per (light, colour) junction we keep heat and per-button hardness.
// Heat: boundary misfit (light not green) accumulates on the light and does NOT drain until
// resolved; internal misfit (pressed and own light did not move: +1; my press knocked another
// light off green: +0.3) sits on the junction and decays.
function makeAutomaton(kind, rand) {
  const drivers = [0, 1, 2].map(() => new SM(COL, COL.map(() => ({ sense: Math.floor(rand() * NB) })), 0, true));
  const J = [0, 1, 2].map(() => COL.map(() => ({ heat: 0, hard: new Array(NB).fill(0), frozen: false, fired: false })));
  const lightHeat = [0, 0, 0];
  return { kind, drivers, J, lightHeat, sensors: [0, 1, 2].map(() => new SM(COL, null, GREEN)) };
}
const melt = (kind, j, b) => (kind === 'frozen' ? (j.frozen ? Infinity : 1) : 1 + 2 * Math.sqrt(j.hard[b]));

function automatonStep(A, lights, rand) {
  const L = lights.map((l) => l.state);
  A.sensors.forEach((s, i) => (s.state = L[i])); // boundary in
  const hot = [0, 1, 2].filter((i) => L[i] !== GREEN);
  if (!hot.length) return -1;
  // the hottest misfit drives the next press (ties random)
  hot.sort((a, b) => A.lightHeat[b] - A.lightHeat[a] || rand() - 0.5);
  const i = hot[0], c = L[i], j = A.J[i][c], drv = A.drivers[i];
  let b = drv.table[c].sense;
  if (A.kind === 'ashby') {
    // Ashby: when a light's heat passes a fixed threshold, re-randomise all its junctions, then reset its heat.
    if (A.lightHeat[i] > 4) { for (let cc = 0; cc < 3; cc++) drv.rewire(cc, 'sense', Math.floor(rand() * NB)); A.lightHeat[i] = 0; b = drv.table[c].sense; }
  } else {
    const h = A.lightHeat[i] + j.heat, p = Math.max(0, Math.min(1, (h - melt(A.kind, j, b)) / 2));
    if (rand() < 0.5 * p) { // malleable: the connection lets go and lands somewhere else
      const w = []; for (let k = 0; k < NB; k++) w.push(k === b ? 0 : (A.kind === 'earned+mem' ? 1 + j.hard[k] : 1));
      let r = rand() * w.reduce((x, y) => x + y), k = 0; while ((r -= w[k]) > 0) k++;
      b = k; drv.rewire(c, 'sense', b); j.heat *= 0.5;
    }
  }
  j.fired = true; j.lastB = b;
  return { i, c, b };
}

function automatonAfter(A, before, after, act) {
  // internal misfit from the press just made: my light didn't move, or I knocked a green light off
  if (act && act !== -1) {
    const j = A.J[act.i][act.c];
    if (after[act.i] === before[act.i]) j.heat += 1;
    for (let k = 0; k < 3; k++) if (k !== act.i && before[k] === GREEN && after[k] !== GREEN) j.heat += SIDE;
  }
  for (let i = 0; i < 3; i++) {
    if (after[i] !== GREEN) A.lightHeat[i] += 1; // unresolved boundary heat piles up
    else A.lightHeat[i] *= 0.6;
    for (let c = 0; c < 3; c++) A.J[i][c].heat *= 0.85;
  }
  // cooling: the whole boundary is back at setpoint -> whatever took part freezes a little
  if (after.every((c) => c === GREEN) && before.some((c) => c !== GREEN)) {
    for (let i = 0; i < 3; i++) for (let c = 0; c < 3; c++) { const j = A.J[i][c]; if (j.fired) {
      if (A.kind !== 'ashby') { j.hard[A.drivers[i].table[c].sense] += 1; if (A.kind === 'frozen') j.frozen = true; }
      j.fired = false; } }
  }
}
const autoHeat = (A) => A.lightHeat.reduce((x, y) => x + y) + A.J.flat().reduce((x, j) => x + j.heat, 0);

// ---------- run ----------
const PHASE = 4000, T = 3 * PHASE;
const phaseOf = (t) => (t < PHASE ? 0 : t < 2 * PHASE ? 1 : 2);
const mapAt = (t) => (phaseOf(t) === 1 ? MAP_B : MAP_A);

function run(kind, seed, traceFrom = -1) {
  const rand = rng(seed * 7919 + 13), drand = rng(seed); // disturbances identical across kinds
  const lights = [0, 1, 2].map(() => makeLight(GREEN));
  const A = ['earned+mem', 'earned', 'frozen', 'ashby'].includes(kind) ? makeAutomaton(kind, rand) : null;
  const eps = []; let ep = null, green = 0, heatByPhase = [0, 0, 0]; const trace = [];
  for (let t = 0; t < T; t++) {
    const map = mapAt(t);
    // disturbance (same stream for every kind)
    const dr = drand(), dl = Math.floor(drand() * 3), dc = Math.floor(drand() * 3);
    if (dr < 0.04) lights[dl].state = dc;
    let L = lights.map((l) => l.state);
    const allG = () => lights.every((l) => l.state === GREEN);
    if (!ep && !allG()) ep = { t0: t, presses: 0, phase: phaseOf(t), opt: ORA[phaseOf(t) === 1 ? 'B' : 'A'].dist[L[0] * 9 + L[1] * 3 + L[2]] };
    // act
    let act = -1, b = -1;
    if (!allG()) {
      if (kind === 'random') b = Math.floor(rand() * NB);
      else if (kind === 'oracle') b = ORA[phaseOf(t) === 1 ? 'B' : 'A'].first[L[0] * 9 + L[1] * 3 + L[2]];
      else if (A) { act = automatonStep(A, lights, rand); b = act === -1 ? -1 : act.b; }
    }
    if (b >= 0) { for (const [l, trig] of map[b]) lights[l].fire(trig); if (ep) ep.presses++; }
    const after = lights.map((l) => l.state);
    if (A) { automatonAfter(A, L, after, act); heatByPhase[phaseOf(t)] += autoHeat(A); }
    if (allG()) { green++; if (ep) { ep.steps = t + 1 - ep.t0; eps.push(ep); ep = null; } }
    if (traceFrom >= 0 && t >= traceFrom && t < traceFrom + 400)
      trace.push({ t, L: L.map((c) => COL[c]).join(''), b, h: A ? autoHeat(A) : 0, rew: act && act !== -1 ? act : null, dist: dr < 0.04 });
  }
  if (ep) { ep.steps = T - ep.t0; ep.open = true; eps.push(ep); }
  return { eps, green: green / T, heat: heatByPhase.map((h) => h / PHASE), trace, A };
}

// ---------- measures ----------
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);
const median = (a) => { const s = a.filter((x) => !isNaN(x)).sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : NaN; };
function adaptTime(eps, phase) { // steps from phase start until 5 consecutive episodes each <= opt+2
  const e = eps.filter((x) => x.phase === phase); let run = 0;
  for (const x of e) { run = x.steps <= x.opt + 2 ? run + 1 : 0; if (run === 5) return x.t0 + x.steps - phase * PHASE; }
  return PHASE;
}
function summarise(r) {
  const P = (ph, lo, hi) => r.eps.filter((e) => e.phase === ph && e.t0 - ph * PHASE >= lo && e.t0 - ph * PHASE < hi);
  const early = (ph) => mean(P(ph, 0, 500).map((e) => e.steps)), late = (ph) => mean(P(ph, PHASE - 1500, PHASE).map((e) => e.steps));
  const all = r.eps; const opt = mean(all.map((e) => e.opt));
  return { eA: early(0), lA: late(0), eB: early(1), lB: late(1), eA2: early(2), lA2: late(2),
    adA: adaptTime(r.eps, 0), adB: adaptTime(r.eps, 1), adA2: adaptTime(r.eps, 2),
    green: r.green, pressRatio: mean(all.filter((e) => !e.open).map((e) => e.presses)) / opt, heat: r.heat };
}

const KINDS = ['none', 'random', 'oracle', 'earned+mem', 'earned', 'frozen', 'ashby'];
const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const f = (x, w = 6, d = 1) => (isNaN(x) ? '-' : x >= 1000 ? Math.round(x).toString() : x.toFixed(d)).padStart(w);
console.log(`3 phases x ${PHASE} steps: A | B (rewired) | A again. Disturbance p=0.04/step. Medians over ${SEEDS.length} seeds.`);
console.log('recovery = mean steps to all-green per episode; early = first 500 steps of phase, late = last 1500');
console.log('adapt = steps into phase until 5 episodes in a row within optimal+2 (4000 = never)');
console.log('kind        | A:early  late |  B:early  late | A2:early  late | adaptA adaptB adaptA2 | green% | presses/opt | heat A/B/A2');
const results = {};
for (const k of KINDS) {
  const S = SEEDS.map((s) => summarise(run(k, s))); results[k] = S;
  const m = (key) => median(S.map((x) => x[key]));
  const hm = (i) => median(S.map((x) => x.heat[i]));
  console.log(`${k.padEnd(11)} |${f(m('eA'), 8)}${f(m('lA'))} |${f(m('eB'), 9)}${f(m('lB'))} |${f(m('eA2'), 9)}${f(m('lA2'))} |${f(m('adA'), 7, 0)}${f(m('adB'), 7, 0)}${f(m('adA2'), 8, 0)} |${f(100 * m('green'), 7)} |${f(m('pressRatio'), 12, 2)} | ${A_heat(k, hm)}`);
}
function A_heat(k, hm) { return ['none', 'random', 'oracle'].includes(k) ? '-' : [0, 1, 2].map((i) => hm(i).toFixed(1)).join('/'); }

// adapt-back faster than first learning? per seed
for (const k of ['earned+mem', 'earned', 'frozen', 'ashby']) {
  const S = results[k]; const faster = S.filter((x) => x.adA2 < x.adA).length;
  console.log(`${k.padEnd(11)} adaptA2 < adaptA in ${faster}/${S.length} seeds; adaptA2 < adaptB in ${S.filter((x) => x.adA2 < x.adB).length}/${S.length}`);
}

// ---------- ASCII trace around the rewiring (earned+mem, seed 1) ----------
const tr = run('earned+mem', 1, PHASE - 40).trace;
console.log('\nTrace, earned+mem seed 1, around the rewire at t=4000 (only steps where something happens).');
console.log('  t    lights press  junction           auto-heat');
let shown = 0, lastRewire = null;
for (const x of tr) {
  if (x.L === 'GGG' && x.b < 0 && !x.dist) continue;
  if (shown++ > 34) break;
  const bar = '#'.repeat(Math.min(40, Math.round(x.h)));
  const j = x.rew ? `L${x.rew.i}${COL[x.rew.c]}->B${x.rew.b}` : '';
  console.log(`${String(x.t).padStart(5)}${x.t === PHASE ? '*' : ' '} ${x.L}  ${x.b >= 0 ? 'B' + x.b : '  '}${x.dist ? ' !' : '  '}  ${j.padEnd(12)} ${x.h.toFixed(1).padStart(5)} ${bar}`);
}
// final learned wiring
const A1 = run('earned+mem', 1).A;
console.log('\nFinal driver tables (earned+mem, seed 1), colour->button [hardness per button]:');
A1.drivers.forEach((d, i) => console.log(`  L${i}: ` + COL.slice(0, 2).map((c, ci) => `${c}->B${d.table[ci].sense} [${A1.J[i][ci].hard.join(',')}]`).join('  ')));
