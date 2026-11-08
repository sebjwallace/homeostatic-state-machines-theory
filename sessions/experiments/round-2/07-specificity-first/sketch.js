// Sketch 07: specificity-first prediction on sketch 06's stress test (VOTE=spec default, VOTE=sum = sketch 06).
// Sketch 06: stress test. Many people, places, weathers and days in one continuous stream; new people
// and places appear halfway. Automaton copied unchanged from sketch 05 (variant `time`).
// `node sketch.js` (~1 min). CAPDAYS=50,200,1000 adds the 1,000-day capacity point.
'use strict';
function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
// ---------- settings, fixed before the first run ----------
const SEEDS = [1, 2, 3];
const DAYS = [50, 200];
const N = 3200, K = 8, HARD = 3;
const melt = (h) => 0.5 + 0.4 * h;
const plast = (heat, h) => Math.min(1, Math.max(0, (heat - melt(h)) / 0.5));
const PEOPLE0 = ['Alice', 'David', 'Bob', 'Carol', 'Eve', 'Frank', 'Grace', 'Heidi'], PEOPLE1 = ['Ivan', 'Judy'];
const PLACES0 = ['beach', 'forest', 'park', 'lake', 'market', 'hill'], PLACES1 = ['cliff', 'meadow'];
const WEATHERS = ['sunny', 'rainy', 'misty', 'windy'];
const PEOPLE = [...PEOPLE0, ...PEOPLE1], PLACES = [...PLACES0, ...PLACES1];
const RULES = [{ at: 'beach', w: 'rainy', to: 'forest' }, { at: 'hill', w: 'windy', to: 'park' }];
// person rule: when it turns misty and Bob is in the pair, Bob goes home (ends the pair phase)
const TIMES = ['morning', 'midday', 'afternoon', 'evening'], TICK = 5;
const pairTok = (a, b) => 'who:' + [a, b].sort().join('+');

function makeStream(seed, nDays) {
  const r = rng(seed * 977 + 13), pick = (a) => a[Math.floor(r() * a.length)];
  const toks = [], meta = [];
  const S = { day: null, time: null, who: null, where: null, weather: null };
  let nToday = 0, ti = 0;
  const push = (t, info) => { const [m] = t.split(':'); if (m in S) S[m] = t; toks.push(t); meta.push({ ...info, state: { ...S }, day: S.day }); };
  const emit = (t, info = {}) => { push(t, info);
    if (t.startsWith('day:')) { nToday = 0; ti = 0; push('time:morning', {}); }
    else if (++nToday % TICK === 0 && ti < 3) push('time:' + TIMES[++ti], {}); };
  const dayInfo = [];
  for (let d = 0; d < nDays; d++) {
    const late = d >= nDays / 2, ppl = late ? PEOPLE : PEOPLE0, pls = late ? PLACES : PLACES0;
    const caller = pick(ppl); let callee; do callee = pick(ppl); while (callee === caller);
    const info = { people: [caller, callee], places: [] };
    emit('day:' + d); emit('who:' + caller); emit('where:home'); emit('weather:' + pick(WEATHERS));
    emit('ev:called'); emit('ev:yes'); emit('ev:met');
    let here = pick(pls); emit('where:' + here, { q: 'meet' }); info.places.push(here); emit(pairTok(caller, callee));
    let bobLeft = false;
    const weatherChange = (pair) => {
      const cur = S.weather.split(':')[1]; const w = pick(WEATHERS.filter(x => x !== cur)); emit('weather:' + w);
      const rule = RULES.find(R => R.at === here && R.w === w);
      if (rule) { here = rule.to; emit('where:' + here, { q: 'rule' }); info.places.push(here); return; }
      if (pair && w === 'misty' && (caller === 'Bob' || callee === 'Bob')) bobLeft = true;
    };
    const move = () => { const to = pick(pls.filter(p => p !== here)); emit('ev:went'); here = to; emit('where:' + here, { q: 'move', from: meta[meta.length - 1].state.where }); info.places.push(here); };
    const nSeg = 3 + Math.floor(r() * 4);
    for (let s = 0; s < nSeg && !bobLeft; s++) (r() < 0.4 ? () => weatherChange(true) : move)();
    const stays = bobLeft ? (caller === 'Bob' ? callee : caller) : caller;
    emit('ev:home', bobLeft ? { q: 'bob' } : {}); emit('who:' + stays);
    (r() < 0.5 ? move : () => weatherChange(false))();
    emit('ev:home'); here = 'home'; emit('where:home');
    info.novel = info.people.some(p => PEOPLE1.includes(p)) || info.places.some(p => PLACES1.includes(p));
    dayInfo.push(info);
  }
  return { toks, meta, dayInfo };
}
// ---------- the automaton (C2 design, continuous) ----------
// Symbol cells: every token has a random K-of-N code. Machine states use the code of the token
// that set them. Context = union of sparse conjunctive codes (pairs hashed into a 2^24 pool, kept 1/8):
//   seq   : (previous token × current token)          shared sequence machine
//   m×cur : (state of machine m × current token)      for each context machine m (day, who, where, weather)
//   joint : (code of the joint combination of context states × current token)   "the stretch"
// Variants: full; noday (day machine removed everywhere); pairs (no joint code).
const POOL = 1 << 24;
const SALT = { time: 0x71BE, seq: 0x5EED, day: 0x0D41, who: 0x0A40, where: 0x3E7E, weather: 0x7EA7, joint: 0x101A };
function makeNet(seed, variant, names, NN = N, pool = POOL) {
  const r = rng(seed), N_ = NN;
  const code = {}; for (const n of names) { const a = new Set(); while (a.size < K) a.add(Math.floor(r() * N_)); code[n] = [...a]; }
  const idx = Array.from({ length: N_ }, () => []); for (const n of names) for (const i of code[n]) idx[i].push(n);
  return { r, variant, N: N_, pool, code, idx, ss: new Map(), cs: new Map(), kind: new Map(), jointCode: new Map(), hashSeed: (seed * 2654435761) | 0 };
}
function conj(net, A, B, salt, out, kind) {
  for (const a of A) for (const b of B) {
    let h = Math.imul(a + 1, 0x9E3779B1) ^ Math.imul(b + 7, 0x85EBCA77) ^ net.hashSeed ^ Math.imul(salt, 0x27D4EB2F);
    h = Math.imul(h ^ (h >>> 15), 0x2C1B3C6D); h ^= h >>> 13; h = h >>> 0;
    if ((h & 7) === 0) { const c = (h >>> 3) % net.pool; out.add(c); if (!net.kind.has(c)) net.kind.set(c, kind); }
  }
}
function jointCodeOf(net, key) {
  let c = net.jointCode.get(key); if (c) return c;
  let h = 2166136261; for (const ch of key) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  const r = rng((h ^ net.hashSeed) >>> 0); const a = new Set(); while (a.size < K) a.add(Math.floor(r() * net.N));
  c = [...a]; net.jointCode.set(key, c); return c;
}
const MACHINES = ['day', 'time', 'who', 'where', 'weather'], MACHINES_T = MACHINES;
function context(net, state, prev, cur) {
  const v = net.variant, ms = (v === 'time' ? MACHINES_T : MACHINES).filter(m => !(v === 'noday' && m === 'day'));
  const out = new Set(), cc = net.code[cur];
  if (prev) conj(net, net.code[prev], cc, SALT.seq, out, 'seq');
  for (const m of ms) if (state[m]) conj(net, net.code[state[m]], cc, SALT[m], out, m);
  if (v !== 'pairs') conj(net, jointCodeOf(net, ms.map(m => state[m]).join('|')), cc, SALT.joint, out, 'joint');
  return [...out];
}
const rowOf = (M, i, make) => { let p = M.get(i); if (!p && make) { p = { j: [], w: [], h: [], m: new Map() }; M.set(i, p); } return p; };
function kwta(v, k, r) {
  const idx = []; for (let i = 0; i < v.length; i++) if (v[i] > 1e-6) { v[i] += r() * 1e-4; idx.push(i); }
  if (idx.length <= k) return idx; idx.sort((a, b) => v[b] - v[a]); return idx.slice(0, k);
}
const overlap = (a, b) => { const s = new Set(b); let n = 0; for (const x of a) if (s.has(x)) n++; return n; };
function inp(net, s, c, mask) {
  const v = new Float32Array(net.N);
  const add = (M, pre) => { for (const i of pre) { const p = M.get(i); if (!p) continue; for (let q = 0; q < p.j.length; q++) { const w = p.w[q]; if (w > 0 && (!mask || mask(p.h[q]))) v[p.j[q]] += w; } } };
  add(net.ss, s); add(net.cs, c); return v;
}
function decode(net, pat) {
  const cnt = new Map(); for (const i of pat) for (const n of net.idx[i]) cnt.set(n, (cnt.get(n) || 0) + 1);
  let best = null, bo = 0; for (const [n, o] of cnt) if (o > bo) { bo = o; best = n; } return best;
}
function learn(M, pre, actual, wrong, heat, used) {
  for (const i of pre) { const p = rowOf(M, i, true);
    for (const j of actual) { let q = p.m.get(j); if (q === undefined) { q = p.j.length; p.j.push(j); p.w.push(0); p.h.push(0); p.m.set(j, q); }
      p.w[q] += (0.05 + plast(heat, p.h[q])) * (1 - p.w[q]); used.push([p, q]); }
    for (const j of wrong) { const q = p.m.get(j); if (q !== undefined && p.w[q] > 0) p.w[q] -= 0.5 * plast(heat, p.h[q]) * p.w[q]; }
  }
}
// One continuous pass. No boundaries: after each step, the connections that carried it
// (w > 0.5) cool and harden by 1. So hardness = number of times a connection was used.
function live(net, stream) {
  const { toks, meta } = stream;
  for (let t = 0; t + 1 < toks.length; t++) {
    const s = net.code[toks[t]], c = context(net, meta[t].state, t ? toks[t - 1] : null, toks[t]);
    const pred = predict(net, s, c), actual = net.code[toks[t + 1]];
    const heat = 1 - overlap(pred, actual) / K, wrong = pred.filter(j => !actual.includes(j));
    const used = []; learn(net.ss, s, actual, wrong, heat, used); learn(net.cs, c, actual, wrong, heat, used);
    // each connection hardens at most once per step (a cell can enter context via two codes)
    const seen = new Map(); for (const [p, q] of used) { let s = seen.get(p); if (!s) seen.set(p, s = new Set()); if (!s.has(q) && p.w[q] > 0.5) { s.add(q); p.h[q]++; } }
  }
}
// Free run (learning off): driver sets the opening states and the first token; each predicted
// token is fed back and, if it is a machine token, sets that machine. Compare with the true day.
function freeRun(net, state, prev, cur, len) {
  const st = { ...state }, out = [];
  for (let i = 0; i < len; i++) {
    const nx = ask(net, st, prev, cur); if (!nx) break; out.push(nx);
    const m = nx.split(':')[0]; if (m in st) st[m] = nx; prev = cur; cur = nx;
  }
  return out;
}
// Query: learning off. The driver sets the machine states and the last two tokens, asks what comes next.
function ask(net, state, prev, cur, mask) {
  return decode(net, predict(net, net.code[cur], context(net, state, prev, cur), mask));
}

// ---------- specificity-first prediction (sketch 07) ----------
// Fixed before the first run. Specificity of a link = number of held states in its key:
//   level 2: joint code (all context machines at once)            -> most specific
//   level 1: one held state x current token (day, time, who, where, weather, or the sequence
//            machine's previous token)
//   level 0: symbol route (current token only)                       -> most general
// The most specific level whose cells have any (mask-passing) links speaks alone, provided it is
// certain: at least CONF of the K winning cells decode to one symbol. Otherwise the next level
// speaks. If no level is certain, fall back to the old summed vote over everything.
// VOTE=sum restores summed voting (sketches 05/06) exactly. VOTE=spec-seen: see below.
const VOTE = process.env.VOTE ?? 'spec';
const LEVEL = { joint: 2, day: 1, time: 1, who: 1, where: 1, weather: 1, seq: 1 };
const CONF = 6;
const topCount = (net, pat) => { const cnt = new Map(); let b = 0; for (const i of pat) for (const n of net.idx[i]) { const x = (cnt.get(n) || 0) + 1; cnt.set(n, x); if (x > b) b = x; } return b; };
function predict(net, s, c, mask) {
  if (VOTE === 'sum') return kwta(inp(net, s, c, mask), K, net.r);
  for (const L of [2, 1]) {
    const cl = c.filter(x => LEVEL[net.kind.get(x)] === L); if (!cl.length) continue;
    // spec-seen (added after the first run): the key counts as seen only if a majority of this
    // level's cells have outgoing links (passing the mask); a few hash-collided cells don't count
    // spec-strong (added after the second run): a level counts as having seen this situation only if a
    // majority of its cells have a strong link (w > 0.5, the same "strong" used for hardening)
    if (VOTE === 'spec-strong') { let has = 0; for (const x of cl) { const p = net.cs.get(x); if (p && p.w.some((w, q) => w > 0.5 && (!mask || mask(p.h[q])))) has++; } if (has * 2 <= cl.length) continue; }
    if (VOTE === 'spec-seen') { let has = 0; for (const x of cl) { const p = net.cs.get(x); if (p && p.w.some((w, q) => w > 0 && (!mask || mask(p.h[q])))) has++; } if (has * 2 <= cl.length) continue; }
    const pat = kwta(inp(net, [], cl, mask), K, net.r);
    if (pat.length && topCount(net, pat) >= CONF) { net.lastLevel = L; return pat; }
  }
  const p0 = kwta(inp(net, s, [], mask), K, net.r);
  if (p0.length && topCount(net, p0) >= CONF) { net.lastLevel = 0; return p0; }
  net.lastLevel = -1; return kwta(inp(net, s, c, mask), K, net.r);
}
const masks = { all: null, hard: (h) => h >= HARD, soft: (h) => h < HARD };

function names(nDays) {
  const n = ['where:home', 'ev:called', 'ev:yes', 'ev:met', 'ev:went', 'ev:home'];
  for (const p of PEOPLE) n.push('who:' + p); for (let i = 0; i < PEOPLE.length; i++) for (let j = i + 1; j < PEOPLE.length; j++) n.push(pairTok(PEOPLE[i], PEOPLE[j]));
  for (const p of PLACES) n.push('where:' + p); for (const w of WEATHERS) n.push('weather:' + w);
  for (const t of TIMES) n.push('time:' + t);
  for (let d = 0; d < nDays; d++) n.push('day:' + d); return n;
}
// Classify a reconstruction failure at its first wrong token. The automaton was in situation
// (all machine states, prev, cur), which is the true one since everything before was right.
//  'same situation, same day'   : that exact situation recurs that day with a different next token -> missing context
//  'same situation, other day'  : recurs on another day with a different next token -> missing context (only without day)
//  'unique: X differ'           : the situation is unique, so the context did distinguish it; the automaton still
//                                 gave a continuation seen elsewhere after (prev,cur); X = the machines that differ
//                                 in the closest such stretch (fewest differing machines). 'unique: novel' if none.
function classify(stream, st, prev, cur, want, got, day) {
  const { toks, meta } = stream, key = JSON.stringify(st);
  let best = null, bestN = 99;
  for (let t = 1; t + 1 < toks.length; t++) {
    if (toks[t] !== cur || toks[t - 1] !== prev) continue;
    const s2 = meta[t].state;
    if (JSON.stringify(s2) === key && toks[t + 1] !== want) return meta[t].day === day ? 'same situation, same day' : 'same situation, other day';
    if (toks[t + 1] === got) { const diff = Object.keys(st).filter(m => s2[m] !== st[m]); if (diff.length < bestN) { bestN = diff.length; best = diff; } }
  }
  return best ? 'unique: ' + (best.join('+') || 'none') + ' differ' : 'unique: novel continuation';
}


function reconstruct(net, stream, nDays) {
  const { toks, meta, dayInfo } = stream, out = { perfect: {}, evc: {}, err: {}, byDay: {} };
  const starts = []; for (let t = 0; t < toks.length; t++) if (toks[t].startsWith('day:')) starts.push(t); starts.push(toks.length);
  for (const cue of ['dayOnly', 'opening']) { const P = [], E = [], err = { n: 0, cls: {}, otherDay: 0 };
    for (let d = 0; d < nDays; d++) {
      const a = starts[d], b = starts[d + 1];
      let i0 = a; if (cue === 'opening') for (let t = a + 1; t < b; t++) if (toks[t].startsWith('weather:')) { i0 = t; break; }
      const st = { ...meta[i0].state };
      const truth = toks.slice(i0 + 1, b), gen = freeRun(net, st, i0 ? toks[i0 - 1] : null, toks[i0], truth.length);
      let ok = 0, first = -1; for (let i = 0; i < truth.length; i++) { if (gen[i] === truth[i]) ok++; else if (first < 0) first = i; }
      P.push(first < 0 ? 1 : 0); E.push(ok / truth.length);
      if (first >= 0) { const st2 = { ...st }; let pv = i0 ? toks[i0 - 1] : null, cu = toks[i0];
        for (const x of gen.slice(0, first)) { const m = x.split(':')[0]; if (m in st2) st2[m] = x; pv = cu; cu = x; }
        const c = classify(stream, st2, pv, cu, truth[first], gen[first], 'day:' + d); err.cls[c] = (err.cls[c] || 0) + 1; err.n++; }
    }
    out.perfect[cue] = P; out.evc[cue] = E; out.err[cue] = err; }
  // split opening-cue perfect by first half / second half familiar / second half with new people or places
  out.split = { first: [], lateOld: [], lateNew: [] };
  for (let d = 0; d < nDays; d++) (d < nDays / 2 ? out.split.first : dayInfo[d].novel ? out.split.lateNew : out.split.lateOld).push(out.perfect.opening[d]);
  let ok = 0, n = 0; for (let t = 1; t + 1 < toks.length; t++) { n++; if (ask(net, meta[t].state, toks[t - 1], toks[t]) === toks[t + 1]) ok++; }
  out.tf = ok / n; out.ceil = [];
  for (let d = 0; d < nDays; d++) { const seen = new Map(); let amb = 0;
    for (let t = starts[d] + 1; t + 1 < starts[d + 1]; t++) { const k = JSON.stringify([meta[t].state, toks[t - 1], toks[t]]);
      if (seen.has(k) && seen.get(k) !== toks[t + 1]) amb = 1; seen.set(k, toks[t + 1]); }
    out.ceil.push(1 - amb); }
  out.len = mean(starts.slice(1).map((b, i) => b - starts[i]));
  return out;
}
const mean = (a) => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);

function run(seed, nDays, opt = {}) {
  const stream = makeStream(seed, nDays), net = makeNet(seed, 'time', names(nDays), opt.N ?? N, opt.pool ?? POOL);
  live(net, stream);
  const { toks, meta } = stream, res = { recon: reconstruct(net, stream, nDays) };
  if (opt.reconOnly) return res;
  // specific one-step recall vs most-common answer in the same (where, cur) ignoring day/time
  const common = new Map();
  for (let t = 1; t < toks.length; t++) if (meta[t].q === 'meet' || meta[t].q === 'move') { const key = meta[t - 1].state.where + '|' + toks[t - 1]; const m = common.get(key) || new Map(); common.set(key, m); m.set(toks[t], (m.get(toks[t]) || 0) + 1); }
  const mostCommon = (key) => { let b = null, bn = -1; for (const [a, n] of common.get(key)) if (n > bn) { bn = n; b = a; } return b; };
  for (const m in masks) for (const qt of ['meet', 'move']) { const sc = [], base = [];
    for (let t = 1; t < toks.length; t++) if (meta[t].q === qt) { const st = meta[t - 1].state;
      sc.push(ask(net, st, toks[t - 2], toks[t - 1], masks[m]) === toks[t] ? 1 : 0); base.push(mostCommon(st.where + '|' + toks[t - 1]) === toks[t] ? 1 : 0); }
    res[`rec_${qt}_${m}`] = sc; res[`base_${qt}`] = base; }
  // generalisation to never-seen combinations. Seen (who, where, weather) triples in the stream:
  const seenTriple = new Set(meta.map(x => [x.state.who, x.state.where, x.state.weather].join('|')));
  const r = rng(seed * 31 + 5); const late = []; for (let d = Math.ceil(nDays / 2); d < nDays; d++) late.push(d);
  const g = { ruleNewPair: [], ruleOldPair: [], bobOldPairNewPlace: [], bobNewPair: [], bobCtrl: [] };
  for (const d of late) {
    const old = PEOPLE0[Math.floor(r() * PEOPLE0.length)], nw = PEOPLE1[Math.floor(r() * 2)];
    let o2; do o2 = PEOPLE0[Math.floor(r() * PEOPLE0.length)]; while (o2 === old);
    const base = { day: 'day:' + d, time: 'time:afternoon' };
    for (const R of RULES) for (const [who, key] of [[pairTok(old, nw), 'ruleNewPair'], [pairTok(old, o2), 'ruleOldPair']]) {
      const st = { ...base, who, where: 'where:' + R.at, weather: 'weather:' + R.w };
      if (seenTriple.has([who, st.where, st.weather].join('|'))) continue;
      for (const m in masks) (g[key + '_' + m] = g[key + '_' + m] || []).push(ask(net, st, st.where, st.weather, masks[m]) === 'where:' + R.to ? 1 : 0); }
    // Bob rule. Familiar Bob pair (one that occurred) at a new place; Bob with a new person; control: non-Bob pair
    const bobPairs = [...new Set(meta.map(x => x.state.who).filter(w => w && w.includes('Bob') && w.includes('+') && !PEOPLE1.some(p => w.includes(p))))];
    const place = 'where:' + PLACES1[Math.floor(r() * 2)];
    const cases = [[bobPairs.length ? bobPairs[Math.floor(r() * bobPairs.length)] : null, 'bobOldPairNewPlace', 'ev:home'], [pairTok('Bob', nw), 'bobNewPair', 'ev:home'], [pairTok(old === 'Bob' ? o2 : old, nw), 'bobCtrl', 'ev:home']];
    for (const [who, key, want] of cases) { if (!who) continue; const st = { ...base, who, where: place, weather: 'weather:misty' };
      if (seenTriple.has([who, place, st.weather].join('|'))) continue;
      for (const m in masks) (g[key + '_' + m] = g[key + '_' + m] || []).push(ask(net, st, place, 'weather:misty', masks[m]) === want ? 1 : 0); }
  }
  res.gen = g;
  // order within a day
  const deps = new Map(); res.ord = []; res.ordSame = [];
  for (let t = 1; t < toks.length; t++) if (meta[t].q === 'move') { const key = meta[t].day + '|' + meta[t].from; (deps.get(key) || deps.set(key, []).get(key)).push(t); }
  for (const ts of deps.values()) { if (ts.length < 2 || new Set(ts.map(t => toks[t])).size < 2) continue;
    const identical = new Set(ts.map(t => JSON.stringify([meta[t - 1].state, toks[t - 2]]))).size < ts.length;
    for (const t of ts) (identical ? res.ordSame : res.ord).push(ask(net, meta[t - 1].state, toks[t - 2], toks[t - 1]) === toks[t] ? 1 : 0); }
  // hardness
  res.hk = {}; const addH = (k, h) => (res.hk[k] = res.hk[k] || []).push(h);
  for (const [i, p] of net.cs) for (let q = 0; q < p.j.length; q++) if (p.w[q] > 0.5) addH(net.kind.get(i), p.h[q]);
  const hOf = (pre, post, into) => { for (const i of pre) { const p = net.cs.get(i); if (!p) continue; for (const j of post) { const q = p.m.get(j); if (q !== undefined && p.w[q] > 0.5) addH(into, p.h[q]); } } };
  const kc = (cells, kd) => cells.filter(c => net.kind.get(c) === kd);
  for (let t = 1; t < toks.length; t++) if (meta[t].q) { const c = context(net, meta[t - 1].state, toks[t - 2], toks[t - 1]);
    if (meta[t].q === 'meet') { hOf(kc(c, 'day'), net.code[toks[t]], 'day->meet place'); hOf(kc(c, 'joint'), net.code[toks[t]], 'joint->meet place'); }
    if (meta[t].q === 'rule') { hOf(kc(c, 'where'), net.code[toks[t]], 'where->rule place'); }
    if (meta[t].q === 'bob') { hOf(kc(c, 'who'), net.code[toks[t]], 'who(Bob pair)->ev:home'); } }
  return res;
}

// ---------- main ----------
const pct = (a) => a && a.length ? (100 * a.reduce((x, y) => x + y, 0) / a.length).toFixed(0).padStart(4) : '   -';
const nn = (a) => String(a ? a.length : 0);
const t0 = Date.now(); const R = {};
for (const d of DAYS) R[d] = SEEDS.map(s => run(s, d));
const all = (d, f) => R[d].flatMap(f);
console.log(`VOTE=${VOTE}. Sketch 06 stress test. ${PEOPLE0.length}+${PEOPLE1.length} people, ${PLACES0.length}+${PLACES1.length} places (new ones from halfway), ${WEATHERS.length} weathers, time ticks every ${TICK} tokens. N=${N}, k=${K}, seeds ${SEEDS.join(',')}`);
console.log('\nReconstruction (free run). perfect% / events% ; ceil% = days with no ambiguous situation ; step% = one-step accuracy');
console.log('days | tokens/day | dayOnly perf ev% | opening perf ev% | ceil step | opening perfect: first half / 2nd half familiar (n) / 2nd half with new person or place (n)');
for (const d of DAYS) { const s = (k) => all(d, r => r.recon.split[k]);
  console.log(`${String(d).padStart(4)} |    ${mean(R[d].map(r => r.recon.len)).toFixed(1)}    |   ${pct(all(d, r => r.recon.perfect.dayOnly))} ${pct(all(d, r => r.recon.evc.dayOnly))}    |   ${pct(all(d, r => r.recon.perfect.opening))} ${pct(all(d, r => r.recon.evc.opening))}    | ${pct(all(d, r => r.recon.ceil))} ${pct(R[d].map(r => r.recon.tf))} | ${pct(s('first'))} / ${pct(s('lateOld'))} (${nn(s('lateOld'))}) / ${pct(s('lateNew'))} (${nn(s('lateNew'))})`); }
const clsLine = (rs, label) => { const c = {}; let n = 0; for (const r of rs) for (const cue in r.recon.err) { const e = r.recon.err[cue]; n += e.n; for (const k in e.cls) c[k] = (c[k] || 0) + e.cls[k]; }
  console.log(`${label} (n=${n}): ` + Object.entries(c).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${(100 * v / n).toFixed(0)}%`).join(' | ')); };
console.log('\nFailure classes at the first wrong token (both cues pooled)');
for (const d of DAYS) clsLine(R[d], `${d} days`);
console.log('\nSpecific one-step recall (%): auto / most-common-answer baseline ; lesions hard / soft');
console.log('days | meet: auto common  hard soft | move: auto common  hard soft | order in day: states differ (n) / identical (n)');
for (const d of DAYS) console.log(`${String(d).padStart(4)} |    ${pct(all(d, r => r.rec_meet_all))}  ${pct(all(d, r => r.base_meet))}  ${pct(all(d, r => r.rec_meet_hard))} ${pct(all(d, r => r.rec_meet_soft))} |    ${pct(all(d, r => r.rec_move_all))}  ${pct(all(d, r => r.base_move))}  ${pct(all(d, r => r.rec_move_hard))} ${pct(all(d, r => r.rec_move_soft))} |   ${pct(all(d, r => r.ord))} (${nn(all(d, r => r.ord))}) / ${pct(all(d, r => r.ordSame))} (${nn(all(d, r => r.ordSame))})`);
console.log('\nGeneralisation to never-seen (who, where, weather) combinations, days in the 2nd half (%: all / hard-only / soft-only, n)');
const gk = [['ruleNewPair', 'place rule, pair with a new person'], ['ruleOldPair', 'place rule, unseen familiar pair'], ['bobOldPairNewPlace', 'Bob rule, familiar Bob pair at a new place -> ev:home'], ['bobNewPair', 'Bob rule, Bob + new person -> ev:home'], ['bobCtrl', 'control: non-Bob pair + new person -> ev:home (should be low)']];
for (const d of DAYS) for (const [k, label] of gk) console.log(`${String(d).padStart(4)} | ${label.padEnd(58)} | ${pct(all(d, r => r.gen[k + '_all'] || []))} ${pct(all(d, r => r.gen[k + '_hard'] || []))} ${pct(all(d, r => r.gen[k + '_soft'] || []))}  n=${all(d, r => r.gen[k + '_all'] || []).length}`);
console.log('\nHardness of strong links: %hard (h>=3), median h');
for (const k of ['day->meet place', 'joint->meet place', 'where->rule place', 'who(Bob pair)->ev:home', 'day', 'joint', 'time', 'who', 'where', 'weather', 'seq']) {
  console.log(`${k.padEnd(24)} | ` + DAYS.map(d => { const a = all(d, r => r.hk[k] || []).sort((x, y) => x - y); return `${d} days: ${pct(a.map(h => h >= HARD ? 1 : 0))} ${String(a.length ? a[a.length >> 1] : '-').padStart(4)}`; }).join(' | ')); }
const CAP = { N: 1600, pool: 1 << 18 };
const CAPDAYS = (process.env.CAPDAYS ?? '50,200').split(',').map(Number);
console.log(`\nCapacity: ${CAP.N} symbol cells, context pool ${CAP.pool}, seeds 1-3`);
console.log('days | dayOnly perf ev% | opening perf ev% | ceil step | time');
for (const d of CAPDAYS) { const t1 = Date.now(); const rs = [1, 2, 3].map(s => run(s, d, { ...CAP, reconOnly: true }));
  console.log(`${String(d).padStart(4)} |   ${pct(rs.flatMap(r => r.recon.perfect.dayOnly))} ${pct(rs.flatMap(r => r.recon.evc.dayOnly))}    |   ${pct(rs.flatMap(r => r.recon.perfect.opening))} ${pct(rs.flatMap(r => r.recon.evc.opening))}    | ${pct(rs.flatMap(r => r.recon.ceil))} ${pct(rs.map(r => r.recon.tf))} | ${((Date.now() - t1) / 1000).toFixed(1)}s`);
  clsLine(rs, '     classes'); }
console.log(`\n[${((Date.now() - t0) / 1000).toFixed(1)} s]`);
