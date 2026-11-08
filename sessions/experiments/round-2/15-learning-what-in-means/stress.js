// Sketch 14: stress test of sketch 13's post-hoc method (whole-sentence trial, optional skip-empty) under
// (1) distractor sentences mentioning the object and intermediate containers, (2) longer chains (2..4 links).
// Loads sketch.js (sketch 13 snapshot) without its main; replaces only makeWorld/names (the world) and drops the
// sketch 11/12 `measure` call. Automaton, learning rule, ledger, frame, gap heat: unchanged. `node stress.js`.
'use strict';
const fs = require('fs');
let s = fs.readFileSync(__dirname + '/sketch.js', 'utf8'); s = s.slice(0, s.lastIndexOf('// ---------- main ----------')).replace(/^'use strict';/m, '');
s = s.replace("W.net = net; return {", "W.net = net; W.ledger = ledger; return {").replace("{ ...measure(net, W), replayed", "{ replayed");

// ---------- world (replaces makeWorld/names; set by CFG before each run) ----------
const WORLD = `
var CFG = { L: 2, D: 0, mix: 'A', rev: false };
const OBJS = SMALL.map(x => 'n:' + x), CONTS = Array.from({ length: 48 }, (_, i) => 'n:c' + i), ROOMS_N = ROOMS.map(x => 'n:' + x);
const COLS = ['red', 'blue', 'green', 'old', 'small', 'heavy'].map(x => 'n:' + x);
function makeWorld(seed) {
  const r = rng(seed * 977 + 13 + CFG.L * 101 + CFG.D * 7), pick = (a) => a[Math.floor(r() * a.length)];
  const shuf = (a) => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const L = CFG.L, rev = CFG.rev, ct = shuf(CONTS), sm = shuf(OBJS);
  // chain: obj -> c1 -> ... -> c(L-1) -> room. L links. Half chains: one link (random position) never stated.
  const chains = sm.map((o, i) => { const path = [o, ...ct.slice(i * (L - 1), (i + 1) * (L - 1))], room = pick(ROOMS_N);
    return { obj: o, path, last: path[path.length - 1], room, full: i < NFULL, miss: i < NFULL ? -1 : Math.floor(r() * L) }; });
  const S = [];  // sentences (token lists)
  const inS = (a, b) => rev ? ['ev:in', b, 'ev:is', a] : [a, 'ev:in', b];
  for (const c of chains) { const nodes = [...c.path, c.room]; for (let k = 0; k < L; k++) if (k !== c.miss) S.push(inS(nodes[k], nodes[k + 1])); }
  // distractors: D sentences per object and per intermediate container. Mix A: no room in the sentence.
  // Mix B adds 'P went R with X' (a room co-occurring with X in a sentence that is not a location fact).
  const others = [...OBJS, ...ct.slice(0, NCH * (L - 1))];
  const kinds = CFG.mix === 'B' ? ['prop', 'took', 'near', 'with'] : CFG.mix === 'P' ? ['prop'] : CFG.mix === 'T' ? ['prop', 'took'] : CFG.mix === 'N' ? ['prop', 'near'] : ['prop', 'took', 'near'];
  for (const c of chains) for (const x of c.path) for (let d = 0; d < CFG.D; d++) { const k = pick(kinds), P = 'who:' + pick(PEOPLE);
    if (k === 'prop') S.push(rev ? ['ev:is', pick(COLS), x] : [x, 'ev:is', pick(COLS)]);
    else if (k === 'took') S.push(rev ? ['ev:took', x, P] : [P, 'ev:took', x]);
    else if (k === 'near') { let y; do y = pick(others); while (c.path.includes(y)); S.push(rev ? ['ev:near', y, 'ev:is', x] : [x, 'ev:near', y]); }
    else S.push(rev ? ['ev:with', x, 'ev:went', pick(ROOMS_N), P] : [P, 'ev:went', pick(ROOMS_N), 'ev:with', x]); }
  for (let i = 0; i < 100; i++) S.push(r() < 0.5 ? (rev ? ['ev:went', pick(ROOMS_N), 'who:' + pick(PEOPLE)] : ['who:' + pick(PEOPLE), 'ev:went', pick(ROOMS_N)]) : ['WEATHER']);
  const sents = shuf(S);
  const toks = [], meta = [], St = { day: null, time: null, who: null, where: null, weather: null, subj: null };
  const push = (t) => { const m = t.split(':')[0]; if (m in St && m !== 'subj') St[m] = t; setSubj(St, toks[toks.length - 1], t); toks.push(t); meta.push({ state: { ...St } }); };
  let d = 0;
  for (let i = 0; i < sents.length; i += 4, d++) {
    push('day:' + d); push('time:morning'); push('weather:' + pick(WEATHERS));
    for (let sl = 0; sl < 4 && i + sl < sents.length; sl++) { if (sl) push('time:' + TIMES[sl]); const sn = sents[i + sl];
      if (sn[0] === 'WEATHER') { const cur = St.weather; let w; do w = 'weather:' + pick(WEATHERS); while (w === cur); push(w);
        if (w === 'weather:rainy') { push('ev:took'); push('obj:umbrella'); } else if (w === 'weather:sunny') { push('ev:took'); push('obj:hat'); } else push('ev:stayed'); }
      else sn.forEach(push); }
  }
  CFG.days = d; return { toks, meta, chains, boundary: -1 };
}
function names() {
  const n = ['ev:in', 'ev:is', 'ev:went', 'ev:took', 'ev:stayed', 'ev:near', 'ev:with', 'obj:umbrella', 'obj:hat', ...OBJS, ...CONTS, ...ROOMS_N, ...COLS];
  for (const x of PEOPLE) n.push('who:' + x); for (const x of WEATHERS) n.push('weather:' + x); for (const x of TIMES) n.push('time:' + x);
  for (let d = 0; d < 400; d++) n.push('day:' + d); return n;
}
`;
const M = new Function('require', '__dirname', s + WORLD + '\nreturn { run, ROOMT, isClock, isContent, inp, context, K, rng, mean, NULLST, CFG };')(require, __dirname);
const { run, isClock, isContent, inp, context, K, rng, mean, NULLST, CFG } = M;

// ---------- settings, fixed before the first run ----------
const TRIAL = 'seg', COOL = 0.5, SUPP = 0.1;   // sketch 13 post-hoc method, unchanged
const HOPSFOR = (L) => L + 2;                   // sketch 13 had HOPS 4 for 2 links: same slack (+2) for longer chains
const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];
const DS = [0, 2, 5, 10], LS = [2, 3, 4];

function frameOf(net, ev) { const v = inp(net, net.code[ev], context(net, { ...NULLST }, null, ev)); let mx = 0; for (const x of v) if (x > mx) mx = x;
  const S = new Set(); v.forEach((x, i) => { if (x > SUPP * mx) S.add(i); }); return S; }
const fit = (net, F, y) => net.code[y].filter(i => F.has(i)).length / K;
const heatOf = (net, F, Y) => Math.min(1, ...[...Y].map(y => 1 - fit(net, F, y)));
function segOf(toks, p) { if (isClock(toks[p])) p--; let a = p;
  while (a > 0 && !isClock(toks[a - 1])) a--; let b = p; while (b + 1 < toks.length && !isClock(toks[b + 1])) b++; return [a, b]; }

// sketch 13's ask() with TRIAL=seg, SKIPEMPTY and HOPS as arguments (logic unchanged)
function ask(R, subj, F, pick, skip, HOPS, r) {
  const { W, net } = R, { toks, meta, ledger } = W, rows = ledger.map(x => x.p);
  const keysOf = (q) => { const st = meta[q - 1].state; return [toks[q - 1], q >= 2 ? toks[q - 2] : null, st.day, st.time, st.who, st.where, st.weather, st.subj]; };
  const surfaced = new Set([subj]), cued = new Set(), visited = new Set(); let h = heatOf(net, F, surfaced), hops = 0, ncand = [];
  const h0 = h;
  while (h >= COOL && hops < HOPS) {
    const cues = [...surfaced].filter(y => !cued.has(y)); if (!cues.length) break; cues.forEach(y => cued.add(y));
    const cands = rows.filter(q => !visited.has(q) && cues.some(c => keysOf(q).includes(c)));
    let best = Infinity, ties = [], n = 0;
    for (const q of cands) {
      const [a, b] = segOf(toks, q), cue = cues.find(c => keysOf(q).includes(c));
      if (!toks.slice(a, b + 1).includes(cue)) continue;
      const got = []; for (let i = a; i <= b; i++) if (isContent(toks[i])) got.push(toks[i]);
      if (skip && !got.some(y => !surfaced.has(y))) continue;
      n++; const ht = heatOf(net, F, new Set([...surfaced, ...got]));
      if (pick === 'rand') ties.push([q, got]); else if (ht < best - 1e-9) { best = ht; ties = [[q, got]]; } else if (Math.abs(ht - best) <= 1e-9) ties.push([q, got]);
    }
    ncand.push(n);
    if (!ties.length) break;
    const [q, got] = ties[Math.floor(r() * ties.length)]; visited.add(q); got.forEach(y => surfaced.add(y)); hops++;
    h = heatOf(net, F, surfaced);
  }
  const ans = h < COOL ? [...surfaced].sort((x, y) => fit(net, F, y) - fit(net, F, x))[0] : null;
  return { ans, h, h0, hops, ncand: ncand[0] || 0 };
}

const METHODS = [['gap', 0], ['rand', 0], ['gap', 1], ['rand', 1]];
function cell(L, D, mix, rev) {
  Object.assign(CFG, { L, D, mix, rev });
  const acc = METHODS.map(() => ({ join: [], half: [], direct: [] }));
  for (const seed of SEEDS) {
    const R = run(seed, { subj: 1 }), net = R.net, F = frameOf(net, 'ev:went');
    METHODS.forEach(([pick, skip], mi) => { const r = rng(seed * 101 + 7 + mi);
      for (const c of R.W.chains) {
        const a = ask(R, c.obj, F, pick, skip, HOPSFOR(L), r); (c.full ? acc[mi].join : acc[mi].half).push({ ...a, right: a.ans === c.room });
        if (c.full) { const d = ask(R, c.last, F, pick, skip, HOPSFOR(L), r); acc[mi].direct.push({ ...d, right: d.ans === c.room }); }
      } });
  }
  return acc;
}
const P = (a, f) => (100 * mean(a.map(f))).toFixed(0).padStart(3);
const row = (tag, acc) => METHODS.map(([p, sk], mi) => { const { join: j, half: h, direct: d } = acc[mi];
  return `| ${tag} | ${p}${sk ? '+skip' : ''} | ${P(j, x => x.right)} | ${P(j, x => x.ans && !x.right)} | ${mean(j.map(x => x.hops)).toFixed(2)} | ${mean(j.map(x => x.h)).toFixed(2)} | ${mean(j.map(x => x.ncand)).toFixed(1)} | ${P(h, x => !!x.ans)} | ${mean(h.map(x => x.h)).toFixed(2)} | ${P(d, x => x.right)} |`; }).join('\n');

console.log(`Sketch 14 stress. trial=seg, COOL ${COOL}, HOPS = links+2, seeds ${SEEDS.length}; 12 full + 4 half chains per seed; chance 17%`);
console.log('| links / D | pick | join right% | join wrong-conf% | hops | end heat | cands@hop1 | half confab% | half end heat | direct right% |');
console.log('|---|---|---|---|---|---|---|---|---|---|');
const only = process.env.ONLY;
if (!only || only === 'grid') for (const L of LS) for (const D of DS) console.log(row(`${L} / ${D}`, cell(L, D, 'A', false)));
if (!only || only === 'rev') { console.log(row('rev 3 / 5', cell(3, 5, 'A', true))); console.log(row('fwd 3 / 5 (same)', cell(3, 5, 'A', false))); }
if (!only || only === 'mixB') for (const L of [2, 3]) for (const D of [2, 5]) console.log(row(`mixB ${L} / ${D}`, cell(L, D, 'B', false)));
// POST HOC diagnostic (after seeing the grid): which distractor kind breaks it. P = colour facts only (dead ends),
// T = colour + 'P took X', N = colour + 'X near Y' (Y another chain's object/container).
if (only === 'diag') for (const mix of ['P', 'T', 'N']) for (const L of [2, 4]) console.log(row(`diag ${mix} ${L} / 5`, cell(L, 5, mix, false)));
