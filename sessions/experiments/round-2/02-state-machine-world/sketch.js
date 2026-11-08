// Sketch 02: an automaton and a world made of the same state machines.
// node sketch.js   (plain Node, seeded, a few seconds)
'use strict';

// ---------- seeded rng ----------
function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// ---------- the one state machine ----------
// A machine has a state and a table (state|input) -> entry {to}. That's all a world machine is.
// A learnable machine's entries also carry heat and hardness, and it may rewrite an entry's `to`.
class SM {
  constructor(name, start, table, opts = {}) {
    this.name = name; this.state = start; this.table = table;          // Map key -> {to, heat, hard, disturbed}
    this.learnable = !!opts.learnable; this.targets = opts.targets || []; this.rand = opts.rand;
    this.last = null;                                                   // entry that put us in the current state
    this.lastInput = null;
  }
  key(input) { return this.state + '|' + input; }
  step(input) {
    // states persist: a learnable machine only fires when its input changes (world machines fire every tick)
    if (this.learnable && input === this.lastInput) return this.state;
    this.lastInput = input;
    const k = this.key(input);
    let e = this.table.get(k);
    if (!e) {
      if (!this.learnable) return this.state;                          // no entry: stay
      e = { to: this.targets[Math.floor(this.rand() * this.targets.length)], heat: 0, hard: 0, disturbed: false };
      this.table.set(k, e);                                             // new connections are soft
    }
    this.state = e.to; this.last = e; this.fired = true;
    return this.state;
  }
}

// ---------- world: traffic junction ----------
const GLEN = 12;
const SAFE = (process.env.SAFE || '1') === '1'; // SAFE=1: a button on a red light does nothing (button can only end a green)
function lightTable(tiebreakGo) {
  const t = new Map(), others = ['done', 'wait', 'go'];
  for (const o of others) for (const b of [0, 1]) {
    const inp = o + ',' + b;
    for (let k = 0; k < GLEN; k++) t.set(`G${k}|${inp}`, { to: b ? 'A0' : (k < GLEN - 1 ? `G${k + 1}` : 'A0') });
    t.set(`A0|${inp}`, { to: 'A1' }); t.set(`A1|${inp}`, { to: 'Rd' });
    t.set(`Rd|${inp}`, { to: 'Rw' });                                   // 'done' for one tick, then waiting
    t.set(`Rw|${inp}`, { to: ((b && !SAFE) || o === 'done' || (o === 'wait' && tiebreakGo)) ? 'RA' : 'Rw' });
    t.set(`RA|${inp}`, { to: 'G0' });
  }
  return t;
}
const coarse = s => s === 'Rd' ? 'done' : s === 'Rw' ? 'wait' : 'go';
const isGreen = s => s[0] === 'G';

// traffic pattern: deterministic, with a slow wave so it is not trivially periodic per cycle
const HEAVY = 0.30, LIGHT = 0.08;
const SCHED = [ // [until, label, rateA, rateB]
  [6000, 'P1 A-heavy', HEAVY, LIGHT],
  [10000, 'P2 B-heavy', LIGHT, HEAVY],
  [13000, 'P1 back', HEAVY, LIGHT],
  [15000, 'quiet', 0, 0],
  [18000, 'P1 after quiet', HEAVY, LIGHT],
];
const T = SCHED[SCHED.length - 1][0];
function rates(t) {
  const seg = SCHED.find(s => t < s[0]);
  const w1 = 1 + 0.5 * Math.sin(2 * Math.PI * t / 290), w2 = 1 + 0.5 * Math.sin(2 * Math.PI * t / 410 + 1.3);
  return [seg[2] * w1, seg[3] * w2];
}

const lvl = q => q === 0 ? 0 : q <= 3 ? 1 : q <= 9 ? 2 : 3;

// ---------- controllers ----------
// each returns {act(world) -> [pressA, pressB], feel(dE), heat()}
function none() { return { act: () => [0, 0], feel() {}, heat: () => 0 }; }
function random(seed) { const r = rng(seed); return { act: () => [r() < 0.1 ? 1 : 0, r() < 0.1 ? 1 : 0], feel() {}, heat: () => 0 }; }
function rule() {
  // skip a green when its road is empty and the other road is waiting; never force a red
  return { act: w => [0, 1].map(i => (isGreen(w.L[i].state) && w.q[i] === 0 && w.q[1 - i] > 0) ? 1 : 0), feel() {}, heat: () => 0 };
}
const ctxOf = (w, i) => { const s = w.L[i].state; const ph = isGreen(s) ? 'G' : s === 'Rw' ? 'W' : 'x'; return `${ph}${lvl(w.q[i])}${lvl(w.q[1 - i])}`; };

function learner(seed, { hardness = true } = {}) {
  const r = rng(seed);
  // two reconfigurable button machines; same SM class as the lights
  const M = [0, 1].map(i => new SM('button' + i, 'idle', new Map(), { learnable: true, targets: ['idle', 'press'], rand: r }));
  const TRAIL = +(process.env.TRAIL || 3); M.forEach(m => m.trail = []);
  const GAPCAP = +(process.env.GAPCAP || 1e9), JIG = +(process.env.JIG || 0.1);
  const HEAT = process.env.HEAT || 'rise'; // gap: whole world unease; local: own road only; rise: increases in unease
  const DECAY = 0.95, K_GAP = +(process.env.KGAP || 0.01), OP = 0.05;
  const melt = e => hardness ? 0.5 + 0.4 * e.hard : 0.5;
  let pressedCount = 0;
  return {
    M,
    act(w) {
      // a button is pressed only on the tick the machine transitions into 'press' (an event, not a held state)
      return M.map((m, i) => { const was = m.state; m.step(ctxOf(w, i)); const p = m.state === 'press' && (was !== 'press' || m.fired); m.fired = false; if (p) { m.last.heat += OP; pressedCount++; } return p ? 1 : 0; });
    },
    feel(dE, w) {
      // felt world energy at the boundary: the gap (current unease) heats whatever entry is holding each button's state.
      // States persist, so the entry that set the state keeps receiving the heat until something changes it.
      // Heat also spreads back along the chain of recently fired entries (TRAIL), halving each step back.
      for (const m of M) { if (m.last && m.trail[0] !== m.last) { m.trail.unshift(m.last); m.trail.length = Math.min(m.trail.length, TRAIL); }
        const i = M.indexOf(m), felt = HEAT === 'rise' ? 30 * Math.max(0, dE) : HEAT === 'local' ? w.q[i] + 0.02 * w.q[i] ** 2 + (w.conflict ? 15 : 0) : w.E;
        m.trail.forEach((e, j) => { e.heat += K_GAP * Math.min(GAPCAP, felt) * 0.5 ** j; }); }
      for (const m of M) {
        for (const e of m.table.values()) {
          e.heat *= DECAY;
          if (e.heat > 0.5) e.disturbed = true;
          if (e.disturbed && e.heat < 0.1) { e.disturbed = false; e.hard += 1; } // earned hardness: settled a disturbance
        }
        const e = m.last; if (!e) continue;
        const p = Math.min(1, Math.max(0, (e.heat - melt(e)) / 2));
        if (p > 0 && r() < JIG * p) {                                        // jiggle: rewire the jammed entry, softly
          e.to = e.to === 'idle' ? 'press' : 'idle'; e.hard = 0;
          m.state = e.to;
        }
      }
    },
    heat: () => M.reduce((s, m) => s + [...m.table.values()].reduce((a, e) => a + e.heat, 0), 0),
    stats: () => ({ entries: M.reduce((s, m) => s + m.table.size, 0), hard: M.reduce((s, m) => s + [...m.table.values()].filter(e => e.hard >= 3).length, 0) }),
  };
}

function qlearn(seed) {
  const r = rng(seed), Q = [new Map(), new Map()], A = 0.1, G = 0.9, EPS = 0.05;
  const get = (i, s) => { if (!Q[i].has(s)) Q[i].set(s, [0, 0]); return Q[i].get(s); };
  let prev = null;
  return {
    act(w) {
      const s = [0, 1].map(i => ctxOf(w, i));
      const a = s.map((si, i) => { const q = get(i, si); return r() < EPS ? (r() < 0.5 ? 1 : 0) : (q[1] > q[0] ? 1 : 0); });
      prev = { s, a, w }; return a;
    },
    feel(dE, w) {
      if (!prev) return; const rew = -dE;
      for (let i = 0; i < 2; i++) { const q = get(i, prev.s[i]), n = get(i, ctxOf(w, i)); q[prev.a[i]] += A * (rew + G * Math.max(...n) - q[prev.a[i]]); }
    },
    heat: () => 0,
  };
}

// ---------- run ----------
function energy(w) { const c = w.conflict ? 30 : 0; return w.q[0] + w.q[1] + 0.02 * (w.q[0] ** 2 + w.q[1] ** 2) + c; }

function run(ctrl) {
  const w = { L: [new SM('lightA', 'G0', lightTable(true)), new SM('lightB', 'Rw', lightTable(false))], q: [0, 0], acc: [0, 0], conflict: false };
  let E = 0; const Es = new Float64Array(T), Hs = new Float64Array(T);
  let conflicts = 0; const maxQ = [0, 0], redRun = [0, 0], maxRed = [0, 0], served = [0, 0], arrived = [0, 0];
  for (let t = 0; t < T; t++) {
    const press = ctrl.act(w);                       // automaton states propagate out: buttons
    const prevStates = w.L.map(l => l.state);
    w.L.forEach((l, i) => l.step(coarse(prevStates[1 - i]) + ',' + press[i]));   // lights read each other's states
    const rt = rates(t);
    for (let i = 0; i < 2; i++) {
      w.acc[i] += rt[i]; while (w.acc[i] >= 1) { w.q[i]++; w.acc[i]--; arrived[i]++; }
      if (isGreen(w.L[i].state) && w.q[i] > 0) { w.q[i]--; served[i]++; }
      maxQ[i] = Math.max(maxQ[i], w.q[i]);
      redRun[i] = isGreen(w.L[i].state) ? 0 : redRun[i] + 1; maxRed[i] = Math.max(maxRed[i], redRun[i]);
    }
    w.conflict = coarse(w.L[0].state) === 'go' && coarse(w.L[1].state) === 'go';
    if (w.conflict) conflicts++;
    const E2 = energy(w); w.E = E2; ctrl.feel(E2 - E, w); E = E2;   // world states propagate in: felt unease
    Es[t] = E; Hs[t] = ctrl.heat();
  }
  return { Es, Hs, conflicts, maxQ, maxRed, served, arrived, stats: ctrl.stats && ctrl.stats() };
}

const mean = (a, s, e) => { let x = 0; for (let i = s; i < e; i++) x += a[i]; return x / (e - s); };
const sd = (a, s, e) => { const m = mean(a, s, e); let x = 0; for (let i = s; i < e; i++) x += (a[i] - m) ** 2; return Math.sqrt(x / (e - s)); };
const med = xs => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };

const WIN = [ // [label, start, end]
  ['P1 early', 0, 1000], ['P1 late', 5000, 6000], ['P2 early', 6000, 7000], ['P2 late', 9000, 10000],
  ['P1 back', 10000, 11000], ['quiet', 13000, 15000], ['P1 postQ', 15000, 16000],
];
const SEEDS = [1, 2, 3, 4, 5, 6, 7];
const CTRLS = [
  ['timer', () => none()], ['random', s => random(s)], ['rule', () => rule()],
  ['learner', s => learner(s)], ['learn-nohard', s => learner(s, { hardness: false })], ['Q-learn', s => qlearn(s)],
];

const results = {};
for (const [name, mk] of CTRLS) {
  const runs = SEEDS.map(s => run(mk(s)));
  results[name] = runs;
}
const f = x => x >= 1000 ? x.toExponential(1) : x >= 100 ? x.toFixed(0) : x.toFixed(1);
console.log('Mean world energy per window (median over ' + SEEDS.length + ' seeds); sd = within-window std of energy in P1 late');
console.log('ctrl          ' + WIN.map(w => w[0].padStart(9)).join('') + '   sdLate  confl  maxQ(A/B)   maxRed(A/B)  heat P1e/P1l/P2e/P2l/back/quiet/postQ');
for (const [name] of CTRLS) {
  const runs = results[name];
  const cells = WIN.map(([, s, e]) => f(med(runs.map(r => mean(r.Es, s, e)))).padStart(9)).join('');
  const sdl = f(med(runs.map(r => sd(r.Es, 5000, 6000)))).padStart(8);
  const cf = String(med(runs.map(r => r.conflicts))).padStart(6);
  const mq = (med(runs.map(r => r.maxQ[0])) + '/' + med(runs.map(r => r.maxQ[1]))).padStart(10);
  const mr = (med(runs.map(r => r.maxRed[0])) + '/' + med(runs.map(r => r.maxRed[1]))).padStart(13);
  const ht = name.startsWith('learn') ? '  ' + WIN.map(([, s, e]) => med(runs.map(r => mean(r.Hs, s, e))).toFixed(1)).join('/') : '';
  console.log(name.padEnd(14) + cells + sdl + cf + mq + mr + ht);
}
console.log('backlog at end of P1 late (t=6000) is not tracked; served/arrived over whole run, A/B (median):');
for (const [name] of CTRLS) { const rs = results[name]; console.log('  ' + name.padEnd(13) + [0, 1].map(i => (med(rs.map(r => r.served[i] / r.arrived[i])) * 100).toFixed(1) + '%').join(' / ') + '   P1-late energy per seed: ' + rs.map(r => mean(r.Es, 5000, 6000).toFixed(0)).join(' ')); }
console.log(`world: ${SAFE ? 'SAFE (button only ends a green)' : 'UNSAFE (button also flips a waiting red to go)'}; heat source: ${process.env.HEAT || 'rise'}`);
// what did the learner's machines end up wired to? fraction of green-context entries leading to 'press'
for (const nm of ['learner', 'learn-nohard']) {
  const agg = { useful: [0, 0], harmful: [0, 0] };
  SEEDS.forEach(sd => { const L = CTRLS.find(c => c[0] === nm)[1](sd); run(L); for (const m of L.M) for (const [k, e] of m.table) {
    const ctx = k.split('|')[1]; if (ctx[0] !== 'G') continue; const kind = ctx[1] === '0' && ctx[2] !== '0' ? 'useful' : ctx[1] !== '0' ? 'harmful' : null;
    if (kind) { agg[kind][1]++; if (e.to === 'press') agg[kind][0]++; } } });
  console.log(`${nm}: green & own road empty & other waiting -> press ${agg.useful[0]}/${agg.useful[1]};  green & own road has cars -> press ${agg.harmful[0]}/${agg.harmful[1]}`);
}
const ls = results.learner.map(r => r.stats);
console.log(`learner end: entries ${med(ls.map(s => s.entries))}, entries with hardness>=3: ${med(ls.map(s => s.hard))}`);

// ASCII trace, seed 1: mean energy per 500 ticks, log-ish bars
console.log('\nEnergy trace, seed 1, mean per 500 ticks (one char each; " .:-=+*#%@" ~ log scale, @ >= 300)');
const ramp = ' .:-=+*#%@';
const ch = v => ramp[Math.min(9, Math.max(0, Math.floor(Math.log2(1 + v) * 9 / Math.log2(301))))];
let axis = ''; for (let t = 0; t < T; t += 500) axis += (SCHED.findIndex(s => t < s[0])).toString();
console.log('segment       ' + axis + '   (0=P1 1=P2 2=P1 3=quiet 4=P1)');
for (const [name] of CTRLS) {
  const r = results[name][0]; let s = '';
  for (let t = 0; t < T; t += 500) s += ch(mean(r.Es, t, t + 500));
  console.log(name.padEnd(14) + s);
}
const r1 = results.learner[0]; let hs = '';
for (let t = 0; t < T; t += 500) hs += ramp[Math.min(9, Math.floor(mean(r1.Hs, t, t + 500) * 3))];
console.log('learner heat  ' + hs + '   (heat x3 per char)');
