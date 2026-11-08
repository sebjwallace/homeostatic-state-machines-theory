// Sketch 15: learning which link kinds are worth following, from confirmation heat. `node learn.js` (writes to stdout).
// Loads sketch.js (sketch 13 snapshot) as stress.js does; the automaton lives the stream once and supplies only the
// frame (what a "place" is). World: sketch 14's mix A + training chains whose conclusions the world later states.
'use strict';
const fs = require('fs');
let s = fs.readFileSync(__dirname + '/sketch.js', 'utf8'); s = s.slice(0, s.lastIndexOf('// ---------- main ----------')).replace(/^'use strict';/m, '');
s = s.replace("W.net = net; return {", "W.net = net; W.ledger = ledger; return {").replace("{ ...measure(net, W), replayed", "{ replayed");

const WORLD = `
var CFG = { L: 2, D: 0, NTR: 0 };
const NOBJ = 40, OBJS = Array.from({ length: NOBJ }, (_, i) => 'n:o' + i), CONTS = Array.from({ length: 96 }, (_, i) => 'n:c' + i), ROOMS_N = ROOMS.map(x => 'n:' + x);
const COLS = ['red', 'blue', 'green', 'old', 'small', 'heavy'].map(x => 'n:' + x);
function makeWorld(seed) {
  const r = rng(seed * 977 + 13 + CFG.L * 101 + CFG.D * 7 + CFG.NTR * 3), pick = (a) => a[Math.floor(r() * a.length)];
  const shuf = (a) => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const L = CFG.L, ct = shuf(CONTS), ob = shuf(OBJS), NT = NCH + CFG.NTR;
  // chains 0..15 = test (12 full, 4 half); 16.. = training (full, later confirmed)
  const chains = Array.from({ length: NT }, (_, i) => { const path = [ob[i], ...ct.slice(i * (L - 1), (i + 1) * (L - 1))], room = pick(ROOMS_N);
    const test = i < NCH; return { obj: ob[i], path, last: path[path.length - 1], room, test, full: !test || i < NFULL, miss: (!test || i < NFULL) ? -1 : Math.floor(r() * L) }; });
  const S = [];
  for (const c of chains) { const nodes = [...c.path, c.room]; c.links = []; for (let k = 0; k < L; k++) if (k !== c.miss) { const sn = [nodes[k], 'ev:in', nodes[k + 1]]; c.links.push(sn); S.push(sn); } }
  const others = chains.flatMap(c => c.path);
  for (const c of chains) for (const x of c.path) for (let d = 0; d < CFG.D; d++) { const k = pick(['prop', 'took', 'near']), P = 'who:' + pick(PEOPLE);
    if (k === 'prop') S.push([x, 'ev:is', pick(COLS)]);
    else if (k === 'took') S.push([P, 'ev:took', x]);
    else { let y; do y = pick(others); while (c.path.includes(y)); S.push([x, 'ev:near', y]); } }
  for (let i = 0; i < 100; i++) S.push(r() < 0.5 ? ['who:' + pick(PEOPLE), 'ev:went', pick(ROOMS_N)] : ['WEATHER']);
  const order = shuf(S);
  // training chains: after the last link, either "obj in room" (confirmation) or "last moved to W" then "obj in W".
  const after = (sn, gap) => { const i = order.indexOf(sn), lo = i + gap; const j = lo >= order.length ? order.length : lo + Math.floor(r() * (order.length - lo + 1)); return j; };
  for (const c of chains) if (!c.test) { const lastLink = c.links.reduce((a, b) => order.indexOf(a) > order.indexOf(b) ? a : b);
    if (r() < 0.5) { const cf = [c.obj, 'ev:in', c.room]; order.splice(after(lastLink, 5), 0, cf); }
    else { let W; do W = pick(ROOMS_N); while (W === c.room); const mv = [c.last, 'ev:moved', W]; order.splice(after(lastLink, 5), 0, mv);
      const cf = [c.obj, 'ev:in', W]; order.splice(after(mv, 5), 0, cf); c.room = W; } }
  const toks = [], meta = [], St = { day: null, time: null, who: null, where: null, weather: null, subj: null }, sents = [];
  const push = (t) => { const m = t.split(':')[0]; if (m in St && m !== 'subj') St[m] = t; setSubj(St, toks[toks.length - 1], t); toks.push(t); meta.push({ state: { ...St } }); };
  let d = 0;
  for (let i = 0; i < order.length; i += 4, d++) {
    push('day:' + d); push('time:morning'); push('weather:' + pick(WEATHERS));
    for (let sl = 0; sl < 4 && i + sl < order.length; sl++) { if (sl) push('time:' + TIMES[sl]); const sn = order[i + sl];
      if (sn[0] === 'WEATHER') { const cur = St.weather; let w; do w = 'weather:' + pick(WEATHERS); while (w === cur); push(w);
        const rest = w === 'weather:rainy' ? ['ev:took', 'obj:umbrella'] : w === 'weather:sunny' ? ['ev:took', 'obj:hat'] : ['ev:stayed']; rest.forEach(push); sents.push({ day: d, toks: rest }); }
      else { sn.forEach(push); sents.push({ day: d, toks: sn }); } }
  }
  return { toks, meta, chains, sents, days: d, boundary: -1 };
}
function names() {
  const n = ['ev:in', 'ev:is', 'ev:went', 'ev:took', 'ev:stayed', 'ev:near', 'ev:moved', 'obj:umbrella', 'obj:hat', ...OBJS, ...CONTS, ...ROOMS_N, ...COLS];
  for (const x of PEOPLE) n.push('who:' + x); for (const x of WEATHERS) n.push('weather:' + x); for (const x of TIMES) n.push('time:' + x);
  for (let d = 0; d < 600; d++) n.push('day:' + d); return n;
}
`;
const M = new Function('require', '__dirname', s + WORLD + '\nreturn { run, isClock, isContent, inp, context, K, rng, mean, NULLST, CFG };')(require, __dirname);
const { run, isClock, isContent, inp, context, K, rng, mean, NULLST, CFG } = M;

// ---------- settings, fixed before the first run ----------
const COOL = 0.5, SUPP = 0.1, HOPSFOR = (L) => L + 2;
const SEEDS = [1, 2, 3, 4, 5, 6];
const LS = (process.env.LS || "2,3").split(",").map(Number), DS = (process.env.DS || "0,2,5").split(",").map(Number), NTRS = (process.env.NTRS || "0,4,12,24").split(",").map(Number);
// Link kind of a sentence = its non-content, non-clock tokens (the ev: tokens), joined. No token is named anywhere below.
const kindOf = (sn) => sn.toks.filter(t => !isContent(t) && !isClock(t)).join(' ');
// Hardness per kind: c = hops of that kind in searches whose answer the world later confirmed (cooled),
// u = hops of that kind in searches whose answer the world later resolved (confirmed or contradicted).
// score = (c+1)/(u+2) (untried kinds start at 0.5); trust = score / max score.
// SMOKE-TEST FIX 3 (brief, literally): contradiction hardens nothing, so hardness = c only; trust = (c+1)/(max c + 1).
// The first version used the ratio c/u, which punished "in" because nearly every wrong path ends with someone else's in-link.
// POST HOC (after the full grid, env SCORE=ratio): confirmation rate (c+1)/(u+2) with the explore + list living of the grid.
const scoreOf = process.env.SCORE === 'ratio' ? (H, k) => { const h = H.get(k) || { c: 0, u: 0 }; return (h.c + 1) / (h.u + 2); }
  : (H, k) => { const h = H.get(k) || { c: 0, u: 0 }; return h.c + 1; };
const trustFn = (H) => { let mx = 1; for (const k of H.keys()) mx = Math.max(mx, scoreOf(H, k)); return (k) => scoreOf(H, k) / mx; };

function frameOf(net, ev) { const v = inp(net, net.code[ev], context(net, { ...NULLST }, null, ev)); let mx = 0; for (const x of v) if (x > mx) mx = x;
  const S = new Set(); v.forEach((x, i) => { if (x > SUPP * mx) S.add(i); }); return S; }

// Path walk. From the current token, candidates = visible sentences containing it (not yet used) that hold an unvisited content token.
// choice: 'learn' = highest trust of the sentence's kind, then lowest gap heat, then random; 'rand' = random.
// Moving on: the next current token is the sentence's other content token. When a place-fitting token is reached the walk
// stops; gap heat = 1 - fit(place) * min trust over the kinds followed. Answer iff heat < COOL. Read-only.
function walk(idx, subj, fitOf, trust, choice, HOPS, r, upto) {
  let cur = subj; const seenT = new Set([subj]), used = new Set(), kinds = []; let hops = 0;
  while (hops < HOPS) {
    const cands = []; for (const si of idx.by.get(cur) || []) { if (si >= upto || used.has(si)) continue; const sn = idx.S[si];
      const nx = sn.toks.filter(t => isContent(t) && !seenT.has(t)); if (nx.length) cands.push([si, nx]); }
    if (!cands.length) break;
    let ch;
    if (choice === 'rand') ch = cands[Math.floor(r() * cands.length)];
    else if (choice === 'explore') { const w = cands.map(c => trust(kindOf(idx.S[c[0]]))), tot = w.reduce((a, b) => a + b, 0); let x = r() * tot, k = 0; while (k < w.length - 1 && (x -= w[k]) > 0) k++; ch = cands[k]; }
    else { let best = -1, ties = [];
      for (const c of cands) { const tr = trust(kindOf(idx.S[c[0]])), g = Math.max(...c[1].map(fitOf)), sc = tr * 10 + g; // trust first, gap second
        if (sc > best + 1e-9) { best = sc; ties = [c]; } else if (Math.abs(sc - best) <= 1e-9) ties.push(c); }
      ch = ties[Math.floor(r() * ties.length)]; }
    const [si, nx] = ch; used.add(si); kinds.push(kindOf(idx.S[si])); hops++;
    const place = nx.reduce((a, b) => fitOf(b) > fitOf(a) ? b : a);
    if (fitOf(place) >= 0.5) { const h = 1 - fitOf(place) * Math.min(...kinds.map(trust)); return { ans: h < COOL ? place : null, reached: place, h, hops, kinds }; }
    cur = nx[Math.floor(r() * nx.length)]; seenT.add(cur);
  }
  return { ans: null, h: 1, hops, kinds };
}

// SMOKE-TEST FIX (after one cell, before the grid): during living the walk samples a sentence with probability proportional
// to its kind's trust ('explore'), and the hypothesis is whatever place it reached, confident or not. First version used greedy
// choice + only confident answers: contradictions lowered trust, answers stopped, learning stopped (7 resolutions/seed).
// SMOKE-TEST FIX 2: every day's walk for X stays pending (a list), and all are resolved together at X's next place co-occurrence.
// Living with searches: at the end of each day, every non-place content token seen so far is asked "where is it?" (walk,
// choice 'learn', current hardness, only sentences seen so far); the latest answer is kept as a pending hypothesis.
// When a sentence arrives holding X and a place token P (P != X): if X's pending answer == P, every hop kind on its path
// cools (c++, u++); otherwise (contradicted) u++ only. Hypothesis then cleared. Unanswered questions change nothing.
function live(W, fitOf, L, seed) {
  const S = W.sents, by = new Map(); S.forEach((sn, i) => { for (const t of sn.toks) if (isContent(t)) { if (!by.has(t)) by.set(t, []); by.get(t).push(i); } });
  const idx = { S, by }, H = new Map(), hyp = new Map(), seen = new Set(), r = rng(seed * 53 + 1); let nconf = 0, ncontra = 0;
  const bump = (kinds, ok) => { for (const k of kinds) { const h = H.get(k) || { c: 0, u: 0 }; h.u++; if (ok) h.c++; H.set(k, h); } };
  let i = 0;
  for (let d = 0; d < W.days; d++) {
    for (; i < S.length && S[i].day === d; i++) { const ct = S[i].toks.filter(isContent), places = ct.filter(t => fitOf(t) >= 0.5);
      for (const x of ct) { seen.add(x); const hy = hyp.get(x); if (!hy || !places.some(p => p !== x)) continue;
        for (const hh of hy) { const ok = places.includes(hh.ans); bump(hh.kinds, ok); ok ? nconf++ : ncontra++; } hyp.delete(x); } }
    const trust = trustFn(H);
    for (const x of seen) if (fitOf(x) < 0.5) { const a = walk(idx, x, fitOf, trust, 'explore', HOPSFOR(L), r, i); if (a.reached) { if (!hyp.has(x)) hyp.set(x, []); hyp.get(x).push({ ans: a.reached, kinds: a.kinds }); } }
  }
  return { idx, H, nconf, ncontra };
}

// sketch 14's ask (gap, seg trial, skip-empty), unchanged, on the same world
const fitN = (net, F, y) => net.code[y].filter(i => F.has(i)).length / K;
const heatOf = (net, F, Y) => Math.min(1, ...[...Y].map(y => 1 - fitN(net, F, y)));
function segOf(toks, p) { if (isClock(toks[p])) p--; let a = p; while (a > 0 && !isClock(toks[a - 1])) a--; let b = p; while (b + 1 < toks.length && !isClock(toks[b + 1])) b++; return [a, b]; }
function ask14(R, subj, F, HOPS, r) {
  const { W, net } = R, { toks, meta, ledger } = W, rows = ledger.map(x => x.p);
  const keysOf = (q) => { const st = meta[q - 1].state; return [toks[q - 1], q >= 2 ? toks[q - 2] : null, st.day, st.time, st.who, st.where, st.weather, st.subj]; };
  const surfaced = new Set([subj]), cued = new Set(), visited = new Set(); let h = heatOf(net, F, surfaced), hops = 0;
  while (h >= COOL && hops < HOPS) {
    const cues = [...surfaced].filter(y => !cued.has(y)); if (!cues.length) break; cues.forEach(y => cued.add(y));
    const cands = rows.filter(q => !visited.has(q) && cues.some(c => keysOf(q).includes(c)));
    let best = Infinity, ties = [];
    for (const q of cands) { const [a, b] = segOf(toks, q), cue = cues.find(c => keysOf(q).includes(c));
      if (!toks.slice(a, b + 1).includes(cue)) continue;
      const got = []; for (let i = a; i <= b; i++) if (isContent(toks[i])) got.push(toks[i]);
      if (!got.some(y => !surfaced.has(y))) continue;
      const ht = heatOf(net, F, new Set([...surfaced, ...got])); if (ht < best - 1e-9) { best = ht; ties = [[q, got]]; } else if (Math.abs(ht - best) <= 1e-9) ties.push([q, got]); }
    if (!ties.length) break;
    const [q, got] = ties[Math.floor(r() * ties.length)]; visited.add(q); got.forEach(y => surfaced.add(y)); hops++; h = heatOf(net, F, surfaced);
  }
  return { ans: h < COOL ? [...surfaced].sort((x, y) => fitN(net, F, y) - fitN(net, F, x))[0] : null, hops };
}

const KSHOW = ['ev:in', 'ev:moved', 'ev:is', 'ev:near', 'ev:took', 'ev:went']; // for printing only
const res = [];
for (const L of LS) for (const D of DS) for (const NTR of NTRS) {
  Object.assign(CFG, { L, D, NTR });
  const acc = { learn: [], rand: [], s14: [] }, hard = [], conf = [];
  for (const seed of SEEDS) {
    const R = run(seed, { subj: 1 }), net = R.net, F = frameOf(net, 'ev:went'), fc = new Map(), fitOf = (y) => { if (!fc.has(y)) fc.set(y, net.code[y] ? fitN(net, F, y) : 0); return fc.get(y); };
    const Lv = live(R.W, fitOf, L, seed), trust = trustFn(Lv.H), r = rng(seed * 101 + 7), all = Lv.idx.S.length;
    hard.push(Object.fromEntries(KSHOW.map(k => [k, trust(k)]))); conf.push([Lv.nconf, Lv.ncontra]);
    for (const c of R.W.chains.filter(c => c.test)) for (const [q, subj] of [['join', c.obj], ...(c.full ? [['direct', c.last]] : [])]) {
      const tag = c.full ? q : 'half';
      const a = walk(Lv.idx, subj, fitOf, trust, 'learn', HOPSFOR(L), r, all); acc.learn.push({ tag, ...a, right: a.ans === c.room });
      const b = walk(Lv.idx, subj, fitOf, () => 1, 'rand', HOPSFOR(L), r, all); acc.rand.push({ tag, ...b, right: b.ans === c.room });
      const e = ask14(R, subj, F, HOPSFOR(L), r); acc.s14.push({ tag, ...e, right: e.ans === c.room });
    }
  }
  const P = (a, f) => (100 * mean(a.map(f))).toFixed(0).padStart(3);
  const line = (m) => { const a = acc[m], j = a.filter(x => x.tag === 'join'), h = a.filter(x => x.tag === 'half'), d = a.filter(x => x.tag === 'direct');
    return `${P(j, x => x.right)} ${P(j, x => x.ans && !x.right)} ${P(h, x => !!x.ans)} ${P(d, x => x.right)} ${mean(j.map(x => x.hops)).toFixed(1)}`; };
  const hk = KSHOW.map(k => mean(hard.map(x => x[k])).toFixed(2)).join(' ');
  const out = `| ${L} | ${D} | ${String(NTR).padStart(2)} | ${line('learn')} | ${line('rand')} | ${line('s14')} | ${hk} | ${mean(conf.map(x => x[0])).toFixed(1)}/${mean(conf.map(x => x[1])).toFixed(1)} |`;
  console.log(out); res.push(out);
}
console.log(`cols: L | D | Ntrain | LEARN join right / join wrong-conf / half confab / direct right / join hops | RAND walk (same) | SKETCH14 gap+skip (same) | trust ${KSHOW.join(' ')} | confirmations/contradictions during living`);
