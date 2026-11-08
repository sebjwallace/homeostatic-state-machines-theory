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

const fitN = (net, F, y) => net.code[y].filter(i => F.has(i)).length / K;
// ===================== Sketch 16: notes + reheating. Rules fixed before the first run. =====================
const COOL = 0.5, SUPP = 0.1, HOPSFOR = (L) => L + 2, SEEDS = [1, 2, 3, 4, 5, 6];
const LS = (process.env.LS || "2,3").split(",").map(Number), DS = (process.env.DS || "0,2,5").split(",").map(Number), NTRS = (process.env.NTRS || "0,4,12,24").split(",").map(Number);
const kindOf = (sn) => sn.toks.filter(t => !isContent(t) && !isClock(t)).join(' ');
// Per link kind: hardness hd >= 0 and heat ht >= 0 (start 0/0).
//  confirm (a note's place turns up with its subject in an EXPERIENCED row): for each distinct kind on the note's path: hd += 1, ht = max(0, ht - 1)
//  contradict (subject turns up with a different place in an experienced row):  for each distinct kind:  ht += 1, hd = max(0, hd - 1)  (melts)
//  symmetric +-1. Heat dissipates: ht *= HDECAY at the end of each quiet period (after attention has used it).
// trust(k) = (hd+1)/(max hd + 1) as in sketch 15. Pending notes never resolved change nothing.
const HDECAY = 0.8;
// POST HOC (after the grid, env DEDUP=1): when a subject resolves, identical pending notes (same place + same set of kinds) cool/reheat once, not once per copy.
const DEDUP = !!process.env.DEDUP;
// Attention: in each quiet period, the hottest kind (if ht > 0) draws attention: every pending note whose path used it is
// re-derived with that kind barred from the walk; a reached place is written as a new inferred note (tag 'rederived').
const trustFn = (K) => { let mx = 0; for (const v of K.values()) mx = Math.max(mx, v.hd); return (k) => ((K.get(k) || { hd: 0 }).hd + 1) / (mx + 1); };
function frameOf(net, ev) { const v = inp(net, net.code[ev], context(net, { ...NULLST }, null, ev)); let mx = 0; for (const x of v) if (x > mx) mx = x;
  const S = new Set(); v.forEach((x, i) => { if (x > SUPP * mx) S.add(i); }); return S; }

// Same path walk as sketch 15, plus: 'bar' = a kind that may not be followed; at question time ties in trust are broken by lower heat.
// The walk only reads rows with src 'exp' (the index holds experienced sentences only; notes live in a separate part of the ledger).
function walk(idx, subj, fitOf, trust, heat, choice, HOPS, r, upto, bar) {
  let cur = subj; const seenT = new Set([subj]), used = new Set(), kinds = []; let hops = 0;
  while (hops < HOPS) {
    const cands = []; for (const si of idx.by.get(cur) || []) { if (si >= upto || used.has(si)) continue; const sn = idx.S[si]; if (bar && kindOf(sn) === bar) continue;
      const nx = sn.toks.filter(t => isContent(t) && !seenT.has(t)); if (nx.length) cands.push([si, nx]); }
    if (!cands.length) break;
    let ch;
    if (choice === 'rand') ch = cands[Math.floor(r() * cands.length)];
    else if (choice === 'explore') { const w = cands.map(c => trust(kindOf(idx.S[c[0]]))), tot = w.reduce((a, b) => a + b, 0); let x = r() * tot, k = 0; while (k < w.length - 1 && (x -= w[k]) > 0) k++; ch = cands[k]; }
    else { let best = -Infinity, ties = [];
      for (const c of cands) { const kd = kindOf(idx.S[c[0]]), tr = trust(kd), g = Math.max(...c[1].map(fitOf)), sc = tr * 100 - Math.min(heat(kd), 9) + g * 0.1; // hard first, cool second, gap third
        if (sc > best + 1e-9) { best = sc; ties = [c]; } else if (Math.abs(sc - best) <= 1e-9) ties.push(c); }
      ch = ties[Math.floor(r() * ties.length)]; }
    const [si, nx] = ch; used.add(si); kinds.push(kindOf(idx.S[si])); hops++;
    const place = nx.reduce((a, b) => fitOf(b) > fitOf(a) ? b : a);
    if (fitOf(place) >= 0.5) { const h = 1 - fitOf(place) * Math.min(...kinds.map(trust)); return { ans: h < COOL ? place : null, reached: place, h, hops, kinds }; }
    cur = nx[Math.floor(r() * nx.length)]; seenT.add(cur);
  }
  return { ans: null, h: 1, hops, kinds };
}

const KSHOW = ['ev:in', 'ev:moved', 'ev:is', 'ev:near', 'ev:took', 'ev:went'];
function live(W, fitOf, L, seed) {
  const S = W.sents, by = new Map(); S.forEach((sn, i) => { for (const t of sn.toks) if (isContent(t)) { if (!by.has(t)) by.set(t, []); by.get(t).push(i); } });
  const idx = { S, by }, K = new Map(), notes = [], pend = new Map(), seen = new Set(), r = rng(seed * 53 + 1);
  const st = { written: 0, rederived: 0, conf: 0, contra: 0, confRe: 0, contraRe: 0, wouldSelf: 0, srcErr: 0 }, hist = [];
  const kv = (k) => { if (!K.has(k)) K.set(k, { hd: 0, ht: 0 }); return K.get(k); };
  const apply = (kinds, ok) => { for (const k of new Set(kinds)) { const v = kv(k); v.u = (v.u || 0) + 1; if (ok) v.c = (v.c || 0) + 1; if (ok) { v.hd += 1; v.ht = Math.max(0, v.ht - 1); } else { v.ht += 1; v.hd = Math.max(0, v.hd - 1); } } };
  const write = (x, a, tag) => { const n = { src: 'inferred', subj: x, place: a.reached, kinds: a.kinds, tag, status: 'pending' }; notes.push(n); if (!pend.has(x)) pend.set(x, []); pend.get(x).push(n); st[tag === 're' ? 'rederived' : 'written']++; };
  let i = 0;
  for (let d = 0; d < W.days; d++) {
    // living: experienced rows resolve pending notes
    for (; i < S.length && S[i].day === d; i++) { const row = { src: 'exp', ...S[i] }; if (row.src !== 'exp') { st.srcErr++; continue; }
      const ct = row.toks.filter(isContent), places = ct.filter(t => fitOf(t) >= 0.5);
      for (const x of ct) { seen.add(x); const ps = pend.get(x); if (!ps || !places.some(p => p !== x)) continue;
        const dd = new Set(); for (const n of ps) { const ok = places.includes(n.place); n.status = ok ? 'confirmed' : 'contradicted'; const key = n.place + '|' + [...new Set(n.kinds)].sort().join(','); if (!DEDUP || !dd.has(key)) apply(n.kinds, ok); dd.add(key);
          if (ok) { st.conf++; if (n.tag === 're') st.confRe++; } else { st.contra++; if (n.tag === 're') st.contraRe++; } }
        pend.delete(x); } }
    // quiet period 1: write notes (as sketch 15's living walks)
    const trust = trustFn(K);
    for (const x of seen) if (fitOf(x) < 0.5) { const a = walk(idx, x, fitOf, trust, () => 0, 'explore', HOPSFOR(L), r, i); if (a.reached) write(x, a, 'note'); }
    // quiet period 2: attention follows heat
    let hot = null, hmax = 0; for (const [k, v] of K) if (v.ht > hmax) { hmax = v.ht; hot = k; }
    if (hot) for (const [x, ps] of [...pend]) if (ps.some(n => n.tag === 'note' && n.kinds.includes(hot))) {
      const a = walk(idx, x, fitOf, trust, () => 0, 'explore', HOPSFOR(L), r, i, hot); if (a.reached) write(x, a, 're'); }
    // source check: would any inferred note "confirm" another if notes were read as facts? (counted, never applied)
    const byPlace = new Map(); for (const ps of pend.values()) for (const n of ps) { const key = n.subj + '|' + n.place; byPlace.set(key, (byPlace.get(key) || 0) + 1); }
    for (const c of byPlace.values()) if (c > 1) st.wouldSelf += c - 1;
    for (const v of K.values()) v.ht *= HDECAY;
    hist.push(Object.fromEntries(KSHOW.map(k => [k, [trust(k), (K.get(k) || { ht: 0 }).ht]])));
  }
  return { idx, K, st, hist, notes };
}

// sketch 15's learned walk (count + rate scoring), re-implemented minimally for comparison on the same world.
function live15(W, fitOf, L, seed, ratio) {
  const S = W.sents, by = new Map(); S.forEach((sn, i) => { for (const t of sn.toks) if (isContent(t)) { if (!by.has(t)) by.set(t, []); by.get(t).push(i); } });
  const idx = { S, by }, H = new Map(), hyp = new Map(), seen = new Set(), r = rng(seed * 53 + 1);
  const sc = (k) => { const h = H.get(k) || { c: 0, u: 0 }; return ratio ? (h.c + 1) / (h.u + 2) : h.c + 1; };
  const tf = () => { let mx = 1; for (const k of H.keys()) mx = Math.max(mx, sc(k)); return (k) => sc(k) / mx; };
  let i = 0;
  for (let d = 0; d < W.days; d++) {
    for (; i < S.length && S[i].day === d; i++) { const ct = S[i].toks.filter(isContent), places = ct.filter(t => fitOf(t) >= 0.5);
      for (const x of ct) { seen.add(x); const hy = hyp.get(x); if (!hy || !places.some(p => p !== x)) continue;
        for (const hh of hy) { const ok = places.includes(hh.ans); for (const k of hh.kinds) { const h = H.get(k) || { c: 0, u: 0 }; h.u++; if (ok) h.c++; H.set(k, h); } } hyp.delete(x); } }
    const trust = tf();
    for (const x of seen) if (fitOf(x) < 0.5) { const a = walk(idx, x, fitOf, trust, () => 0, 'explore', HOPSFOR(L), r, i); if (a.reached) { if (!hyp.has(x)) hyp.set(x, []); hyp.get(x).push({ ans: a.reached, kinds: a.kinds }); } }
  }
  return { idx, trust: tf() };
}

const res = [], P = (a, f) => a.length ? (100 * mean(a.map(f))).toFixed(0).padStart(3) : '  -';
const TRACE = process.env.TRACE;
for (const L of LS) for (const D of DS) for (const NTR of NTRS) {
  Object.assign(CFG, { L, D, NTR });
  const acc = { s16: [], c15: [], r15: [], rand: [] }, kin = [], sts = [], hists = [];
  for (const seed of SEEDS) {
    const R = run(seed, { subj: 1 }), net = R.net, F = frameOf(net, 'ev:went'), fc = new Map(), fitOf = (y) => { if (!fc.has(y)) fc.set(y, net.code[y] ? fitN(net, F, y) : 0); return fc.get(y); };
    const Lv = live(R.W, fitOf, L, seed), trust = trustFn(Lv.K), heat = (k) => (Lv.K.get(k) || { ht: 0 }).ht;
    const A = live15(R.W, fitOf, L, seed, false), B = live15(R.W, fitOf, L, seed, true);
    kin.push(Object.fromEntries(KSHOW.map(k => [k, [trust(k), heat(k), (Lv.K.get(k) || { hd: 0 }).hd, ((Lv.K.get(k) || {}).c || 0) / Math.max(1, (Lv.K.get(k) || {}).u || 0)]]))); sts.push(Lv.st); hists.push(Lv.hist);
    const r = rng(seed * 101 + 7), all = Lv.idx.S.length;
    for (const c of R.W.chains.filter(c => c.test)) for (const [q, subj] of [['join', c.obj], ...(c.full ? [['direct', c.last]] : [])]) {
      const tag = c.full ? q : 'half';
      const go = (m, a) => acc[m].push({ tag, ...a, right: a.ans === c.room });
      go('s16', walk(Lv.idx, subj, fitOf, trust, heat, 'learn', HOPSFOR(L), r, all));
      go('c15', walk(A.idx, subj, fitOf, A.trust, () => 0, 'learn', HOPSFOR(L), r, all));
      go('r15', walk(B.idx, subj, fitOf, B.trust, () => 0, 'learn', HOPSFOR(L), r, all));
      go('rand', walk(Lv.idx, subj, fitOf, () => 1, () => 0, 'rand', HOPSFOR(L), r, all));
    }
  }
  const line = (m) => { const a = acc[m], j = a.filter(x => x.tag === 'join'), h = a.filter(x => x.tag === 'half'), d = a.filter(x => x.tag === 'direct');
    return `${P(j, x => x.right)} ${P(j, x => x.ans && !x.right)} ${P(h, x => !!x.ans)} ${P(d, x => x.right)}`; };
  const kk = KSHOW.map(k => mean(kin.map(x => x[k][0])).toFixed(2) + '/' + mean(kin.map(x => x[k][1])).toFixed(1)).join(' ');
  const sm = (f) => mean(sts.map(f)).toFixed(0);
  const out = `| ${L} | ${D} | ${String(NTR).padStart(2)} | ${line('s16')} | ${line('c15')} | ${line('r15')} | ${line('rand')} | ${kk} | ${sm(s => s.written)}+${sm(s => s.rederived)} | ${sm(s => s.conf)}/${sm(s => s.contra)} (re ${sm(s => s.confRe)}/${sm(s => s.contraRe)}) | ${sm(s => s.wouldSelf)} ${sm(s => s.srcErr)} |`;
  console.log(out); res.push(out);
  console.log('   hardness hd: ' + KSHOW.map(k => k.slice(3) + ' ' + mean(kin.map(x => x[k][2])).toFixed(1)).join('  '));
  console.log('   per-kind confirm rate c/u: ' + KSHOW.map(k => k.slice(3) + ' ' + (mean(kin.map(x => x[k][3])) * 100).toFixed(0) + '%').join('  '));
  if (TRACE) { const nd = Math.min(...hists.map(h => h.length)); for (const f of [0.1, 0.25, 0.5, 0.75, 1]) { const di = Math.max(0, Math.round(f * nd) - 1);
    console.log(`   day ${di}: ` + KSHOW.map(k => k.slice(3) + ' ' + mean(hists.map(h => h[di][k][0])).toFixed(2) + '/' + mean(hists.map(h => h[di][k][1])).toFixed(1)).join('  ')); } }
}
console.log('cols: L | D | Ntrain | S16 join right / wrong-conf / half confab / direct right | S15 count (same) | S15 rate (same) | RAND | trust/heat per kind ' + KSHOW.join(' ') + ' (end) | notes written + rederived | confirmed/contradicted (of which rederived) | would-be self-confirmations if notes read as facts, source errors');
