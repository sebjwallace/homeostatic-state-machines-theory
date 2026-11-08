// Sketch 07 copy of sketch 05 with specificity-first prediction (VOTE=spec default, VOTE=sum = sketch 05). VARS=time picks variants.
// Sketch 05: days and stories. No explicit episode boundaries: the world sets states
// (day, who, where, weather, events) in one continuous stream; context machines hold
// what the world set. Does a held combination keep days apart, while shared regularities
// generalise and harden?   `node sketch.js`  (plain Node, seeded, no deps, ~15 s)
// CAPDAYS=5,50,200,1000 node sketch.js adds the 1,000-day capacity point (~2 min more).
'use strict';

function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
// ---------- settings, fixed before the first run ----------
const SEEDS = [1, 2, 3, 4, 5];
const DAYS = [5, 20, 50];
const N = 3200, K = 8;            // symbol pool, active cells per symbol (as sketch 04 C2)
const HARD = 3;
const melt = (h) => 0.5 + 0.4 * h;
const plast = (heat, h) => Math.min(1, Math.max(0, (heat - melt(h)) / 0.5));
const PLACES = ['beach', 'forest', 'park'];
const WEATHERS = ['sunny', 'rainy', 'misty'];
// Regularities that hold on every day: weather change at a place forces a move.
const RULES = [{ at: 'beach', w: 'rainy', to: 'forest' }, { at: 'forest', w: 'misty', to: 'beach' }];

// ---------- the world: one story per day, one continuous stream ----------
// Each token is a world state change "machine:value". Context machines: day, who, where, weather.
// Variant `time` (follow-up): the world also has a time-of-day clock. 'time:morning' is set right
// after 'day:d'; then after every TICK world tokens of the day the clock advances one step
// (midday, afternoon, evening) and holds at evening. Settings fixed before the first `time` run.
const TIMES = ['morning', 'midday', 'afternoon', 'evening'], TICK = 5;
function makeStream(seed, nDays, withTime = false) {
  const r = rng(seed * 977 + 13), pick = (a) => a[Math.floor(r() * a.length)];
  const toks = [], meta = [];   // meta[i]: info about token i (for building queries)
  const S = { day: null, who: null, where: null, weather: null }; if (withTime) S.time = null;
  let nToday = 0, ti = 0;
  const push = (t, info) => { const [m] = t.split(':'); if (m in S) S[m] = t; toks.push(t); meta.push({ ...info, state: { ...S }, day: S.day }); };
  const emit = (t, info = {}) => { push(t, info);
    if (withTime) { if (t.startsWith('day:')) { nToday = 0; ti = 0; push('time:morning', {}); }
      else if (++nToday % TICK === 0 && ti < 3) push('time:' + TIMES[++ti], {}); } };
  for (let d = 0; d < nDays; d++) {
    const caller = pick(['Alice', 'David']);
    emit('day:' + d); emit('who:' + caller); emit('where:home'); emit('weather:' + pick(WEATHERS));
    emit('ev:called'); emit('ev:yes'); emit('ev:met');
    let here = pick(PLACES); emit('where:' + here, { q: 'meet' }); emit('who:both');
    const visits = [here];
    const weatherChange = () => {
      const cur = S.weather.split(':')[1]; const w = pick(WEATHERS.filter(x => x !== cur)); emit('weather:' + w);
      const rule = RULES.find(R => R.at === here && R.w === w);
      if (rule) { here = rule.to; emit('where:' + here, { q: 'rule' }); visits.push(here); }
    };
    const move = () => { const to = pick(PLACES.filter(p => p !== here)); emit('ev:went'); here = to; emit('where:' + here, { q: 'move', from: meta[meta.length - 1].state.where }); visits.push(here); };
    const nSeg = 3 + Math.floor(r() * 3);
    for (let s = 0; s < nSeg; s++) (r() < 0.4 ? weatherChange : move)();
    emit('ev:home'); emit('who:' + caller);            // the other one goes home
    (r() < 0.5 ? move : weatherChange)();               // the caller carries on alone
    emit('ev:home'); here = 'home'; emit('where:home');
  }
  return { toks, meta };
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
const MACHINES = ['day', 'who', 'where', 'weather'], MACHINES_T = [...MACHINES, 'time'];
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
  const n = ['who:Alice', 'who:David', 'who:both', 'where:home', 'ev:called', 'ev:yes', 'ev:met', 'ev:went', 'ev:home'];
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

// Full reconstruction of each day's story from a cue. Cues:
//  dayOnly : at the 'day:d' token, with the other machines as the world left them (yesterday's end)
//  opening : after the opening states (day, who, where:home, weather) are set
//  dayWho  : day + who only (weather machine unset), at the 'where:home' opening token
function reconstruct(net, stream, nDays) {
  const { toks, meta } = stream, out = { perfect: {}, evc: {}, err: {} };
  const starts = []; for (let t = 0; t < toks.length; t++) if (toks[t].startsWith('day:')) starts.push(t); starts.push(toks.length);
  // what follows (prev,cur) anywhere in the stream, by day
  const follow = new Map(); for (let t = 2; t < toks.length; t++) { const k = toks[t - 2] + '>' + toks[t - 1]; (follow.get(k) || follow.set(k, new Map()).get(k)).set(toks[t], 1); }
  for (const cue of ['dayOnly', 'dayWho', 'opening']) { const P = [], E = [], err = { otherDay: 0, novel: 0, early: 0, n: 0 };
    for (let d = 0; d < nDays; d++) {
      const a = starts[d], b = starts[d + 1];
      const find = (pre) => { for (let t = a + 1; t < b; t++) if (toks[t].startsWith(pre)) return t; };
      const i0 = cue === 'dayOnly' ? a : cue === 'dayWho' ? find('where:home') : find('weather:');
      let st = { ...meta[i0].state }; if (cue === 'dayWho') st.weather = null;
      const truth = toks.slice(i0 + 1, b), gen = freeRun(net, st, i0 ? toks[i0 - 1] : null, toks[i0], truth.length);
      let ok = 0, first = -1; for (let i = 0; i < truth.length; i++) { if (gen[i] === truth[i]) ok++; else if (first < 0) first = i; }
      P.push(first < 0 ? 1 : 0); E.push(ok / truth.length);
      if (first >= 0) { const g = first ? gen.slice(0, first) : [];   // all correct up to the error
        const st2 = { ...st }; let pv2 = i0 ? toks[i0 - 1] : null, cu2 = toks[i0];
        for (const x of g) { const m = x.split(':')[0]; if (m in st2) st2[m] = x; pv2 = cu2; cu2 = x; }
        const cls = classify(stream, st2, pv2, cu2, truth[first], gen[first], 'day:' + d);
        err.cls = err.cls || {}; err.cls[cls] = (err.cls[cls] || 0) + 1;
        err.n++; const pv = first >= 1 ? truth[first - 1] : toks[i0], pp = first >= 2 ? truth[first - 2] : first === 1 ? toks[i0] : toks[i0 - 1];
        const f = follow.get(pp + '>' + pv); if (f && f.has(gen[first])) err.otherDay++; else err.novel++; if (first < 3) err.early++; }
    }
    out.perfect[cue] = P; out.evc[cue] = E; out.err[cue] = err; }
  // diagnostics: teacher-forced one-step accuracy over the stream; and the ceiling = days in which
  // no (all machine states, prev, cur) situation recurs with a different next token (the context
  // cannot, even in principle, tell those apart)
  let ok = 0, n = 0; for (let t = 1; t + 1 < toks.length; t++) { n++; if (ask(net, meta[t].state, toks[t - 1], toks[t]) === toks[t + 1]) ok++; }
  out.tf = ok / n; out.ceil = [];
  for (let d = 0; d < nDays; d++) { const seen = new Map(); let amb = 0;
    for (let t = starts[d] + 1; t + 1 < starts[d + 1]; t++) { const k = JSON.stringify([meta[t].state, toks[t - 1], toks[t]]);
      if (seen.has(k) && seen.get(k) !== toks[t + 1]) amb = 1; seen.set(k, toks[t + 1]); }
    out.ceil.push(1 - amb); }
  return out;
}

function run(seed, variant, nDays, opt = {}) {
  const stream = makeStream(seed, nDays, variant === 'time'), net = makeNet(seed, variant, names(nDays), opt.N ?? N, opt.pool ?? POOL);
  live(net, stream);
  const { toks, meta } = stream, res = {};
  res.recon = reconstruct(net, stream, nDays);
  if (opt.reconOnly) { res.nTok = toks.length; return res; }
  // Baselines from the stream itself: most common answer for the same (where-state, cur) without the day.
  const common = new Map();
  for (let t = 1; t < toks.length; t++) if (meta[t].q) { const key = meta[t - 1].state.where + '|' + toks[t - 1]; const m = common.get(key) || new Map(); common.set(key, m); m.set(toks[t], (m.get(toks[t]) || 0) + 1); }
  const mostCommon = (key) => { let b = null, bn = -1; for (const [a, n] of common.get(key)) if (n > bn) { bn = n; b = a; } return b; };
  // 1. specific recall: meet place and move destinations (day-specific: random each day)
  for (const m in masks) for (const qt of ['meet', 'move']) {
    const sc = [], base = [], ch = [];
    for (let t = 1; t < toks.length; t++) if (meta[t].q === qt) {
      const st = meta[t - 1].state, ans = ask(net, st, toks[t - 2], toks[t - 1], masks[m]);
      sc.push(ans === toks[t] ? 1 : 0); base.push(mostCommon(st.where + '|' + toks[t - 1]) === toks[t] ? 1 : 0);
      ch.push(qt === 'meet' ? 1 / 3 : 1 / 2);
    }
    res[`rec_${qt}_${m}`] = sc; res[`base_${qt}`] = base; res[`chance_${qt}`] = ch;
  }
  // 2. generalisation: on every day, set (day, who=both, where=R.at, weather=R.w), prev = arrival at R.at,
  //    cur = weather change to R.w. Split by whether that day ever had that situation.
  for (const m in masks) { const seenDay = [], novelDay = [];
    for (let d = 0; d < nDays; d++) for (const R of RULES) {
      const had = toks.some((x, t) => meta[t].day === 'day:' + d && x === 'weather:' + R.w && meta[t - 1].state.where === 'where:' + R.at);
      const st = { day: 'day:' + d, who: 'who:both', where: 'where:' + R.at, weather: 'weather:' + R.w }; if (variant === 'time') st.time = 'time:afternoon';
      const ans = ask(net, st, 'where:' + R.at, 'weather:' + R.w, masks[m]);
      (had ? seenDay : novelDay).push(ans === 'where:' + R.to ? 1 : 0);
    }
    res['gen_seen_' + m] = seenDay; res['gen_novel_' + m] = novelDay; }
  // 6. order within a day: departures (ev:went) from the same place on the same day, to different places.
  const deps = new Map();
  for (let t = 1; t < toks.length; t++) if (meta[t].q === 'move') { const key = meta[t].day + '|' + meta[t].from; (deps.get(key) || deps.set(key, []).get(key)).push(t); }
  res.ord = []; res.ordSame = [];
  for (const ts of deps.values()) { if (ts.length < 2 || new Set(ts.map(t => toks[t])).size < 2) continue;
    const sig = (t) => JSON.stringify([meta[t - 1].state, toks[t - 2]]);
    const identical = new Set(ts.map(sig)).size < ts.length;
    for (const t of ts) { const ans = ask(net, meta[t - 1].state, toks[t - 2], toks[t - 1]); (identical ? res.ordSame : res.ord).push(ans === toks[t] ? 1 : 0); }
  }
  // 5. hardness of strong connections by the kind of context cell they come from
  res.hk = {}; const addH = (k, h) => (res.hk[k] = res.hk[k] || []).push(h);
  for (const [i, p] of net.cs) for (let q = 0; q < p.j.length; q++) if (p.w[q] > 0.5) addH(net.kind.get(i), p.h[q]);
  for (const [, p] of net.ss) for (let q = 0; q < p.j.length; q++) if (p.w[q] > 0.5) addH('sym', p.h[q]);
  // targeted: day-specific answer links vs rule links
  const hOf = (pre, post, into) => { for (const i of pre) { const p = net.cs.get(i); if (!p) continue; for (const j of post) { const q = p.m.get(j); if (q !== undefined && p.w[q] > 0.5) addH(into, p.h[q]); } } };
  const kindCells = (cells, kd) => cells.filter(c => net.kind.get(c) === kd);
  for (let t = 1; t < toks.length; t++) if (meta[t].q) {
    const c = context(net, meta[t - 1].state, toks[t - 2], toks[t - 1]);
    if (meta[t].q === 'meet') { hOf(kindCells(c, 'day'), net.code[toks[t]], 'day->meet place'); hOf(kindCells(c, 'joint'), net.code[toks[t]], 'joint->meet place'); }
    if (meta[t].q === 'rule') { hOf(kindCells(c, 'where'), net.code[toks[t]], 'where-pair->rule place'); hOf(kindCells(c, 'seq'), net.code[toks[t]], 'seq->rule place'); }
  }
  res.nTok = toks.length;
  return res;
}

// ---------- main ----------
const pct = (a) => a.length ? (100 * a.reduce((x, y) => x + y, 0) / a.length).toFixed(0).padStart(4) : '   -';
const t0 = Date.now();
const R = {};
const VARS = (process.env.VARS ?? 'full,time').split(',');
for (const v of VARS) for (const d of DAYS) R[v + d] = SEEDS.map(s => run(s, v, d));
const all = (v, d, key) => R[v + d].flatMap(r => r[key]);
console.log(`VOTE=${VOTE}. Sketch 05: days and stories. One continuous stream, no boundaries. N=${N}, k=${K}, hard>=${HARD}, seeds ${SEEDS.join(',')}`);
console.log(`stream length (tokens, seed 1): ${DAYS.map(d => d + ' days=' + R['full' + d][0].nTok).join(', ')}\n`);
console.log('1-4. Specific recall, generalisation, ablation, scale (%; all seeds pooled)');
console.log('variant days | meet place: auto  common chance | move dest: auto  common chance | rule gen: day had it / never on that day | order in day: states differ (n) / identical (n)');
for (const v of VARS) for (const d of DAYS) {
  const o1 = all(v, d, 'ord'), o2 = all(v, d, 'ordSame');
  console.log(`${v.padEnd(7)} ${String(d).padStart(4)} |        ${pct(all(v, d, 'rec_meet_all'))}   ${pct(all(v, d, 'base_meet'))}   ${pct(all(v, d, 'chance_meet').map(x => x))} |       ${pct(all(v, d, 'rec_move_all'))}   ${pct(all(v, d, 'base_move'))}   ${pct(all(v, d, 'chance_move'))} |        ${pct(all(v, d, 'gen_seen_all'))} (${String(all(v, d, 'gen_seen_all').length).padStart(3)})   / ${pct(all(v, d, 'gen_novel_all'))} (${String(all(v, d, 'gen_novel_all').length).padStart(3)})   |   ${pct(o1)} (${String(o1.length).padStart(3)}) / ${pct(o2)} (${String(o2.length).padStart(3)})`);
}
console.log('\nLesion by hardness (full variant): meet / move recall and novel-day rule generalisation, using only connections in the mask');
console.log('days | mask | meet  move  rule-gen(novel days)');
for (const d of DAYS) for (const m of ['all', 'hard', 'soft'])
  console.log(`${String(d).padStart(4)} | ${m.padEnd(4)} | ${pct(all('full', d, 'rec_meet_' + m))}  ${pct(all('full', d, 'rec_move_' + m))}  ${pct(all('full', d, 'gen_novel_' + m))}`);
console.log('\n5. Hardness of strong connections (w>0.5), full variant, by source. %hard (h>=3), median h, n');
const kinds = ['day->meet place', 'joint->meet place', 'where-pair->rule place', 'seq->rule place', 'day', 'joint', 'who', 'where', 'weather', 'seq', 'sym'];
console.log('kind                     | ' + DAYS.map(d => `${d} days: %hard  med     n`).join(' | '));
for (const k of kinds) {
  const cols = DAYS.map(d => { const a = R['full' + d].flatMap(r => r.hk[k] || []).sort((x, y) => x - y);
    return `     ${pct(a.map(h => h >= HARD ? 1 : 0))}  ${String(a.length ? a[a.length >> 1] : '-').padStart(4)} ${String(a.length).padStart(6)}`; });
  console.log(`${k.padEnd(24)} | ${cols.join(' | ')}`);
}
const recLine = (rs, label) => { const cells = ['dayOnly', 'dayWho', 'opening'].map(c => { const e = rs.map(r => r.recon.err[c]); const n = e.reduce((x, y) => x + y.n, 0);
    return `${pct(rs.flatMap(r => r.recon.perfect[c]))} ${pct(rs.flatMap(r => r.recon.evc[c]))}  ${n ? pct([e.reduce((x, y) => x + y.otherDay, 0) / n]) : '   -'}`; });
  console.log(`${label} | ${cells.join('  | ')}  | ${pct(rs.flatMap(r => r.recon.ceil))}   ${pct(rs.map(r => r.recon.tf))}`); };
console.log('\nH. Full reconstruction by free run (learning off). perfect% = whole day exact; ev% = events correct in place;');
console.log('   oth% = of failed days, first error is a continuation seen elsewhere in the stream (i.e. a jump into another stretch)');
console.log('cues: dayOnly = set day:d (other machines as yesterday left them); dayWho = day + who, at where:home; opening = day, who, where:home, weather set');
console.log('variant days | dayOnly perf  ev%  oth% | dayWho perf  ev%  oth% | opening perf  ev%  oth% | ceil%  step%');
for (const v of VARS) for (const d of DAYS) recLine(R[v + d], `${v.padEnd(7)} ${String(d).padStart(4)}`);
console.log('\nFailure classes at the first wrong token (all seeds, all cues pooled): share of failed reconstructions');
const clsLine = (rs, label) => { const c = {}; let n = 0; for (const r of rs) for (const cue in r.recon.err) { const e = r.recon.err[cue]; n += e.n; for (const k in e.cls || {}) c[k] = (c[k] || 0) + e.cls[k]; }
  console.log(`${label} (n=${n}): ` + Object.entries(c).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${(100 * v / n).toFixed(0)}%`).join(' | ')); };
for (const v of VARS) for (const d of DAYS) clsLine(R[v + d], `${v.padEnd(6)} ${String(d).padStart(3)}`);
const CAP = { N: 1600, pool: 1 << 18 };   // fixed before running: modest pools
const CAPDAYS = (process.env.CAPDAYS ?? '5,50,200').split(',').map(Number);
const CAPVARS = (process.env.CAPVARS ?? 'time').split(',');
console.log(`\nCapacity: full and time variants, ${CAP.N} symbol cells (k=${K}), context pool ${CAP.pool} cells, seeds 1-3. Perfect reconstruction vs stories stored.`);
console.log('var  days | dayOnly perf  ev%  oth% | dayWho perf  ev%  oth% | opening perf  ev%  oth% | ceil%  step% | time');
const CAPR = {};
for (const cv of CAPVARS) for (const d of CAPDAYS) { const t1 = Date.now(); const rs = [1, 2, 3].map(s => run(s, cv, d, { ...CAP, reconOnly: true })); CAPR[cv + d] = rs;
  const cells = ['dayOnly', 'dayWho', 'opening'].map(c => { const e = rs.map(r => r.recon.err[c]); const n = e.reduce((x, y) => x + y.n, 0);
    return `${pct(rs.flatMap(r => r.recon.perfect[c]))} ${pct(rs.flatMap(r => r.recon.evc[c]))}  ${n ? pct([e.reduce((x, y) => x + y.otherDay, 0) / n]) : '   -'}`; });
  console.log(`${cv.padEnd(4)} ${String(d).padStart(4)} | ${cells.join('  | ')}  | ${pct(rs.flatMap(r => r.recon.ceil))}   ${pct(rs.map(r => r.recon.tf))} | ${((Date.now() - t1) / 1000).toFixed(1)}s`); }
console.log('capacity failure classes:'); for (const k in CAPR) clsLine(CAPR[k], k);
console.log(`\n[${((Date.now() - t0) / 1000).toFixed(1)} s]`);
