// Sketch 13 world changes: rooms/containers/objects are neutral 'n:' tokens (no machine, no label); subject rule = first content
// token since the last clock token; WORLD=rev gives 'ev:in C ev:is K' word order. Sketch 12 header follows.
// Sketch 12: settling retrieval. Same as sketch 11 except the 'echain' mode (energy choice among ledger candidates)
// and the SUBJ_MODE variants of the subject rule. Sketch 11 below.
// Sketch 11: subject state + content-following (chained) replay. Built on sketch 10 (world, queries, seeds, scoring unchanged).
// Sketch 10: earned joins. Can the ordinary learning rule, fed ledger rows in a quiet period,
// join "the key is in the tin" (one day) with "the tin is in the kitchen" (a later day)?
// sketch06.js is sketch 06 unchanged (automaton). `node sketch.js` (a few seconds).
'use strict';
const fs = require('fs');
const src = fs.readFileSync(__dirname + '/sketch06.js', 'utf8').split('// ---------- main ----------')[0];
// Only change to the automaton: a variant 'subj' whose held machines are sketch 06's five plus `subj` (same kind as `who`).
const src2 = src.replace("(v === 'time' ? MACHINES_T : MACHINES)", "(v === 'subj' ? [...MACHINES, 'subj'] : MACHINES)").replace('joint: 0x101A', 'joint: 0x101A, subj: 0x5B1E');
if (src2 === src) throw new Error('patch failed');
const L = new Function('require', src2 + '\nreturn { rng, makeNet, context, inp, kwta, decode, overlap, learn, K, HARD, mean };')(require);
const { rng, makeNet, context, inp, kwta, decode, overlap, learn, K, mean } = L;

// ---------- settings, fixed before the first run ----------
const SEEDS = [1, 2, 3, 4, 5];
const SMALL = ['key', 'coin', 'ring', 'pin', 'stamp', 'bead', 'seed', 'shell', 'badge', 'chip', 'dice', 'marble', 'button', 'token', 'gem', 'nail'];
const CONT = ['tin', 'box', 'bag', 'jar', 'pot', 'cup', 'case', 'sack', 'crate', 'drawer', 'pouch', 'basket', 'bowl', 'vase', 'chest', 'purse'];
const ROOMS = ['kitchen', 'attic', 'cellar', 'hall', 'study', 'garage'];
const PEOPLE = ['Alice', 'Bob', 'Carol', 'David', 'Eve', 'Frank'];
const WEATHERS = ['sunny', 'rainy', 'misty', 'windy'], TIMES = ['morning', 'midday', 'afternoon', 'evening'];
const NCH = 16, NFULL = 12; // 12 full chains, 4 half chains (container's room never shown) as controls
const MACH = ['day', 'time', 'who', 'where', 'weather'];
const CAP = 12; // chain length cap (rows), fixed before the first run
// Subject rule, fixed before the first run: a token is a clock token if it is day:/time:/weather: (they set clock machines),
// an event if ev:, otherwise content. The subject is set by a content token that directly follows a clock token
// (the first content token of a sentence) and held until the next one. Nothing else sets or clears it.
const isClock = (t) => /^(day|time|weather):/.test(t), isContent = (t) => !!t && !isClock(t) && !t.startsWith('ev:');
// Sketch 12 subject-rule variants (env SUBJ): 'first' = sketch 11; 'noisy' = the rule fails to fire 40% of the time
// (subject stays stale); 'last' = every content token sets the subject (so in 'K in C' the subject ends as C).
let SUBJ_MODE = 'first', SUBJ_R = Math.random;
const setSubj = (st, prev, tok) => { if (isClock(tok)) { st.open = 1; return; } if (!isContent(tok)) return;
  if (SUBJ_MODE === 'last') { st.subj = tok; return; }
  if (st.open) { st.open = 0; if (SUBJ_MODE === 'noisy' && SUBJ_R() < 0.4) return; st.subj = tok; } };
const REV = process.env.WORLD === 'rev';
const HOT = 0.5; // a row is "hot" if heat > 0.5 when it arrived (sketch 09's `surprise`)

// ---------- world ----------
// Phase 1 (16 days): each day holds one first fact `obj:K ev:in obj:C` among 3 distractor stories.
// Phase 2 (16 days): 12 days hold a second fact `obj:C ev:in where:R`, 4 are distractors only.
// Distractors: `who:P ev:went where:R` (day-specific), or a weather change with a general rule:
// rainy -> ev:took obj:umbrella, sunny -> ev:took obj:hat, else ev:stayed.
function makeWorld(seed) {
  const r = rng(seed * 977 + 13), pick = (a) => a[Math.floor(r() * a.length)];
  const shuf = (a) => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const sm = shuf(SMALL), ct = shuf(CONT);
  const chains = sm.map((o, i) => ({ obj: 'n:' + o, cont: 'n:' + ct[i], room: 'n:' + pick(ROOMS), full: i < NFULL }));
  const p1 = shuf(chains.map(c => ['f1', c])), p2 = shuf([...chains.filter(c => c.full).map(c => ['f2', c]), ...Array(NCH - NFULL).fill(['none'])]);
  const toks = [], meta = [], S = { day: null, time: null, who: null, where: null, weather: null, subj: null };
  const push = (t, info = {}) => { const m = t.split(':')[0]; if (m in S && m !== 'subj') S[m] = t; setSubj(S, toks[toks.length - 1], t); toks.push(t); meta.push({ state: { ...S }, ...info }); };
  const plan = [...p1, ...p2];
  plan.forEach(([kind, c], d) => {
    push('day:' + d); push('time:morning'); push('weather:' + pick(WEATHERS));
    const slot = Math.floor(r() * 4);
    for (let s = 0; s < 4; s++) {
      if (s) push('time:' + TIMES[s]);
      if (s === slot && kind === 'f1') { c.day1 = 'day:' + d; if (REV) { push('ev:in'); push(c.cont); push('ev:is'); push(c.obj, { q: 'f1', c }); } else { push(c.obj); push('ev:in'); push(c.cont, { q: 'f1', c }); } }
      else if (s === slot && kind === 'f2') { if (REV) { push('ev:in'); push(c.room); push('ev:is'); push(c.cont, { q: 'f2', c }); } else { push(c.cont); push('ev:in'); push(c.room, { q: 'f2', c }); } }
      else if (r() < 0.5) { if (REV) { push('ev:went'); push('n:' + pick(ROOMS)); push('who:' + pick(PEOPLE), { q: 'went' }); } else { push('who:' + pick(PEOPLE)); push('ev:went'); push('n:' + pick(ROOMS), { q: 'went' }); } }
      else { const cur = S.weather; let w; do w = 'weather:' + pick(WEATHERS); while (w === cur); push(w);
        if (w === 'weather:rainy') { push('ev:took'); push('obj:umbrella', { q: 'rule' }); } else if (w === 'weather:sunny') { push('ev:took'); push('obj:hat', { q: 'rule' }); } else push('ev:stayed'); }
    }
  });
  return { toks, meta, chains, boundary: meta.findIndex(m => m.state.day === 'day:' + p1.length) };
}
function names() {
  const n = ['ev:in', 'ev:is', 'ev:went', 'ev:took', 'ev:stayed', 'obj:umbrella', 'obj:hat'];
  for (const x of SMALL) n.push('n:' + x); for (const x of CONT) n.push('n:' + x); for (const x of ROOMS) n.push('n:' + x);
  for (const x of PEOPLE) n.push('who:' + x); for (const x of WEATHERS) n.push('weather:' + x); for (const x of TIMES) n.push('time:' + x);
  for (let d = 0; d < 2 * NCH; d++) n.push('day:' + d); return n;
}

// ---------- the one learning rule (sketch 06/09 live() body, unchanged) ----------
function step(net, st, prev, cur, next) {
  const s = net.code[cur], c = context(net, st, prev, cur);
  const pred = kwta(inp(net, s, c), K, net.r), actual = net.code[next];
  const heat = 1 - overlap(pred, actual) / K, wrong = pred.filter(j => !actual.includes(j));
  const used = []; learn(net.ss, s, actual, wrong, heat, used); learn(net.cs, c, actual, wrong, heat, used);
  const seen = new Map(); for (const [p, q] of used) { let z = seen.get(p); if (!z) seen.set(p, z = new Set()); if (!z.has(q) && p.w[q] > 0.5) { z.add(q); p.h[q]++; } }
  return heat;
}
// Ledger: one row per input p (the input toks[p] and the situation it arrived in). Never learns.
// Quiet period replays rows written since the last quiet period. Selections and modes, fixed in advance:
//   all/restore : every row, time order, row's recorded situation restored (= living those days again)
//   hot/restore : rows with heat > HOT at the time, time order, situation restored
//   hot/stream  : inputs of hot rows fed as one stream; the automaton's machines are set by the tokens, as awake
//   hot/shuffle : as hot/stream, rows in shuffled order
function quiet(net, W, ledger, from, to, sel, mode, r) {
  let rows = ledger.filter(x => x.p >= from && x.p < to && (sel === 'all' || x.heat > HOT)).map(x => x.p);
  if (mode === 'shuffle') for (let i = rows.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [rows[i], rows[j]] = [rows[j], rows[i]]; }
  const { toks, meta } = W;
  if (mode === 'restore') { for (const p of rows) step(net, meta[p - 1].state, p >= 2 ? toks[p - 2] : null, toks[p - 1], toks[p]); return rows.length; }
  if (mode === 'chain') { // next row = unused selected row whose (last2,last) best matches the two inputs just replayed (>=1 key), else next in time
    const used = new Set(), out = []; let a = null, b = null;
    for (const p0 of rows) { if (used.has(p0)) continue; let p = p0;
      while (p !== undefined) { used.add(p); out.push(p); a = b; b = toks[p]; let best = 0, nx;
        for (const q of rows) if (!used.has(q)) { const sc = (toks[q - 1] === b ? 1 : 0) + (q >= 2 && toks[q - 2] === a ? 1 : 0); if (toks[q - 1] === b && sc > best) { best = sc; nx = q; } }
        p = nx; } }
    rows = out; }
  if (mode === 'cchain' || mode === 'rchain' || mode.startsWith('echain')) return contentChain(net, W, ledger, from, to, sel, mode, r);
  const st = { day: null, time: null, who: null, where: null, weather: null, subj: null }; let prev = null;
  for (let i = 0; i + 1 < rows.length; i++) { const cur = toks[rows[i]], m = cur.split(':')[0]; if (m in st && m !== 'subj') st[m] = cur; setSubj(st, prev, cur);
    step(net, st, prev, cur, toks[rows[i + 1]]); prev = cur; }
  return rows.length;
}
// Content-following replay (sketch 11). Start rows: the selected rows (hot or all) in time order, each not yet replayed.
// A chain: restore the start row's recorded situation and replay it (one ordinary step). Then, while length < CAP:
//   if the input just replayed is a content token x: content-addressable lookup over the unused rows of the window
//     (rows written since the last quiet period), score = number of the row's KEYS equal to x, where the keys are the
//     row's situation: its held states and its last two tokens (not its input). Best score >= 1 wins, ties at random.
//     (rchain: a random unused row instead, the shuffled-chaining control.)
//   else (or no match): the next row in time, if unused. Otherwise the chain ends.
//   The chosen row's input is fed as the next input of a stream: one ordinary step from the current held states,
//   which persist (set only by tokens, as awake, including the subject rule). Held states reset only between chains.
const KEYS = ['day', 'time', 'who', 'where', 'weather', 'subj'];
function contentChain(net, W, ledger, from, to, sel, mode, r, log) {
  const { toks, meta } = W, win = ledger.filter(x => x.p >= from && x.p < to), used = new Set(), useSubj = net.variant === 'subj';
  const keysOf = (q) => { const s = meta[q - 1].state, k = [toks[q - 1], q >= 2 ? toks[q - 2] : null]; for (const m of KEYS) if (m !== 'subj' || useSubj) k.push(s[m]); return k; };
  const starts = win.filter(x => sel === 'all' || x.heat > HOT).map(x => x.p); let n = 0;
  for (const p0 of starts) { if (used.has(p0)) continue;
    const st = { ...meta[p0 - 1].state }; if (!useSubj) st.subj = null;
    let prev = toks[p0 - 1], cur = toks[p0]; step(net, st, p0 >= 2 ? toks[p0 - 2] : null, prev, cur); used.add(p0); n++;
    const m0 = cur.split(':')[0]; if (m0 in st && m0 !== 'subj') st[m0] = cur; setSubj(st, prev, cur);
    let p = p0, len = 1, trace = log ? [cur] : null;
    while (len < CAP) { let nx;
      if (isContent(cur)) {
        const cand = win.map(x => x.p).filter(q => !used.has(q));
        if (mode === 'rchain') { if (cand.length) nx = cand[Math.floor(r() * cand.length)]; }
        else if (mode.startsWith('echain')) {
          // Sketch 12: the ledger returns every unused row with >=1 key equal to the cue (no scoring). The automaton settles:
          // E(row) = prediction heat + situation misfit, fixed before the run:
          //   prediction heat = 1 - overlap(current prediction, code[row input]) / K   (same measure as learning's heat)
          //   situation misfit = mean over slots {last, last2, day, time, who, where, weather, subj} set in both the
          //     automaton's current situation (cur, prev, held states) and the row's, of 1 - overlap(codes)/K
          // lowest E wins, exact ties at random. (echainS: situation term only; echainP: prediction term only; ablations.)
          const cands = cand.filter(q => keysOf(q).includes(cur) && !(mode.endsWith('X') && q === p + 1)); // echain*X (POST-HOC): the time-next row is not a jump candidate
          if (cands.length) { const pred = kwta(inp(net, net.code[cur], context(net, st, prev, cur)), K, net.r);
            const now = { last: cur, last2: prev, ...st }; if (!useSubj) now.subj = null;
            let bestE = Infinity, ties = [];
            for (const q of cands) { const rs = { last: toks[q - 1], last2: q >= 2 ? toks[q - 2] : null, ...meta[q - 1].state }; if (!useSubj) rs.subj = null;
              let mis = 0, nm = 0; for (const k of ['last', 'last2', ...KEYS]) if (now[k] && rs[k]) { mis += 1 - overlap(net.code[now[k]], net.code[rs[k]]) / K; nm++; }
              const ph = 1 - overlap(pred, net.code[toks[q]]) / K, sm = nm ? mis / nm : 0;
              const E = mode.startsWith('echainS') ? sm : mode.startsWith('echainP') ? ph : ph + sm;
              if (E < bestE - 1e-9) { bestE = E; ties = [q]; } else if (Math.abs(E - bestE) <= 1e-9) ties.push(q); }
            nx = ties[Math.floor(r() * ties.length)]; if (log && log.hops) log.hops.push([cur, nx, cands]); } }
        else { let best = 0, ties = []; for (const q of cand) { const sc = keysOf(q).filter(k => k === cur).length;
            if (sc > best) { best = sc; ties = [q]; } else if (sc === best && sc > 0) ties.push(q); }
          if (ties.length) nx = ties[Math.floor(r() * ties.length)]; } }
      if (nx === undefined && p + 1 < to && !used.has(p + 1)) nx = p + 1;
      if (nx === undefined) break;
      const next = toks[nx]; step(net, st, prev, cur, next); used.add(nx); n++; len++;
      if (trace) trace.push((nx !== p + 1 ? '| ' : '') + next);
      const m = next.split(':')[0]; if (m in st && m !== 'subj') st[m] = next; setSubj(st, cur, next);
      prev = cur; cur = next; p = nx; }
    if (log) log.push(trace.join(' '));
  }
  return n;
}
function run(seed, cond) {
  SUBJ_MODE = cond.sm || 'first'; SUBJ_R = rng(seed * 31 + 5);
  const W = makeWorld(seed), net = makeNet(seed, cond.subj ? 'subj' : 'time', names()), r = rng(seed * 7 + 3), { toks, meta } = W, ledger = [];
  let lastQuiet = 1, replayed = 0;
  for (let t = 0; t + 1 < toks.length; t++) {
    const p = t + 1;
    if (cond.when === 'before' && p === W.boundary) { replayed += quiet(net, W, ledger, lastQuiet, p, cond.sel, cond.mode, r); lastQuiet = p; }
    ledger.push({ p, heat: step(net, meta[t].state, t ? toks[t - 1] : null, toks[t], toks[p]) });
  }
  if (cond.when === 'after') replayed += quiet(net, W, ledger, lastQuiet, toks.length, cond.sel, cond.mode, r);
  W.net = net; return { ...measure(net, W), replayed, W, net, hotFrac: ledger.filter(x => x.heat > HOT).length / ledger.length };
}

// ---------- measures (learning off) ----------
const NULLST = { day: null, time: null, who: null, where: null, weather: null, subj: null };
const Q = (x) => ({ ...NULLST, subj: x }); // query states: empty, except the subject the rule sets from the query's first token
const KINDS = ['sym', 'seq', 'day', 'time', 'who', 'where', 'weather', 'subj', 'joint'];
// Summed input into each candidate's code cells; also split by source route.
function scores(net, st, prev, cur, cands) {
  const c = context(net, st, prev, cur), src = [['sym', net.code[cur], net.ss], ...c.map(i => [net.kind.get(i), [i], net.cs])];
  const tot = cands.map(() => 0), byKind = cands.map(() => ({}));
  for (const [kind, pre, M] of src) for (const i of pre) { const p = M.get(i); if (!p) continue;
    cands.forEach((cd, ci) => { for (const j of net.code[cd]) { const q = p.m.get(j); if (q !== undefined && p.w[q] > 0) { tot[ci] += p.w[q]; byKind[ci][kind] = (byKind[ci][kind] || 0) + p.w[q]; } } }); }
  return { tot, byKind };
}
const ROOMT = ROOMS.map(x => 'n:' + x), CONTT = CONT.map(x => 'n:' + x);
function rankStats(sc, ri) {
  const n = sc.length, mx = Math.max(...sc), top = sc.filter(x => x === mx).length;
  const right = sc[ri] === mx ? 1 / top : 0, sum = sc.reduce((a, b) => a + b, 0);
  const pR = (sc[ri] + 0.1) / (sum + 0.1 * n); // smoothed share of input on the right candidate
  return { right, bits: Math.log2(n * pR) };
}
function freeRun(net, prev, cur, len) { const st = Q(prev), out = [];
  for (let i = 0; i < len; i++) { const nx = decode(net, kwta(inp(net, net.code[cur], context(net, st, prev, cur)), K, net.r)); if (!nx) break; out.push(nx); const m = nx.split(':')[0]; if (m in st) st[m] = nx; prev = cur; cur = nx; } return out; }
function measure(net, W) {
  const o = { halfSubj: [], fullSubj: [], frs: [], perm: [], dayR: [], chainD: [], chainHalfLure: [], joinR: [], joinB: [], halfR: [], halfB: [], d1: [], d2: [], d2R: [], top1: [], chain: [], margin: {}, went: [], rule: [], ruleGen: [] };
  for (const c of W.chains) {
    const s = scores(net, Q(c.obj), c.obj, 'ev:in', ROOMT), ri = ROOMT.indexOf(c.room), rs = rankStats(s.tot, ri);
    if (c.full) { o.joinR.push(rs.right); o.joinB.push(rs.bits);
      // which routes carry the right room more than the other rooms (mean)
      for (const k of KINDS) { const others = ROOMT.map((_, i) => i).filter(i => i !== ri); const m = (s.byKind[ri][k] || 0) - mean(others.map(i => s.byKind[i][k] || 0)); (o.margin[k] = o.margin[k] || []).push(m); }
      o.top1.push(decode(net, kwta(inp(net, net.code['ev:in'], context(net, Q(c.obj), c.obj, 'ev:in')), K, net.r)));
      const fr = freeRun(net, c.obj, 'ev:in', 4); o.chain.push(fr.includes(c.room) ? 1 : 0); o.frs.push(fr.join(' '));
      const other = W.chains.filter(x => x.full && x.room !== c.room); o.perm.push(rankStats(s.tot, ROOMT.indexOf(other[0].room)).right);
      const stD = { ...Q(c.obj), day: c.day1 }; const sD = scores(net, stD, c.obj, 'ev:in', ROOMT); o.dayR.push(rankStats(sD.tot, ri).right);
      const frD = (() => { const st = { ...stD }, out = []; let prev = c.obj, cur = 'ev:in'; for (let i = 0; i < 4; i++) { const nx = decode(net, kwta(inp(net, net.code[cur], context(net, st, prev, cur)), K, net.r)); if (!nx) break; out.push(nx); const m = nx.split(':')[0]; if (m in st) st[m] = nx; prev = cur; cur = nx; } return out; })();
      o.chainD.push(frD.includes(c.room) ? 1 : 0);
      const s2 = scores(net, Q(c.cont), c.cont, 'ev:in', ROOMT); o.d2R.push(rankStats(s2.tot, ri).right);
      o.d2.push(decode(net, kwta(inp(net, net.code['ev:in'], context(net, Q(c.cont), c.cont, 'ev:in')), K, net.r)) === c.room ? 1 : 0);
    } else { o.halfR.push(rs.right); o.halfB.push(rs.bits); o.halfSubj.push(Math.max(...s.byKind.map(b => b.subj || 0))); const fr = freeRun(net, c.obj, 'ev:in', 4); o.chainHalfLure.push(fr.some(x => ROOMT.includes(x)) ? 1 : 0); }
    if (c.full) o.fullSubj.push(s.byKind[ri].subj || 0);
    o.d1.push(rankStats(scores(net, Q(c.obj), c.obj, 'ev:in', CONTT).tot, CONTT.indexOf(c.cont)).right);
  }
  o.top1Cont = mean(W.chains.filter(c => c.full).map((c, i) => o.top1[i] === c.cont ? 1 : 0));
  const { toks, meta } = W;
  for (let t = 2; t < toks.length; t++) { const q = meta[t].q, a = () => decode(net, kwta(inp(net, net.code[toks[t - 1]], context(net, meta[t - 1].state, toks[t - 2], toks[t - 1])), K, net.r));
    if (q === 'went') o.went.push(a() === toks[t] ? 1 : 0); if (q === 'rule') o.rule.push(a() === toks[t] ? 1 : 0); }
  for (const [w, want] of [['weather:rainy', 'obj:umbrella'], ['weather:sunny', 'obj:hat']]) {
    const st = { ...NULLST, weather: w, time: 'time:afternoon', who: 'who:Alice' };
    o.ruleGen.push(decode(net, kwta(inp(net, net.code['ev:took'], context(net, st, w, 'ev:took')), K, net.r)) === want ? 1 : 0); }
  return o;
}

// ---------- main ----------
const CONDS0 = [
  ['1 none', {}],
  ['2 after, all/restore', { when: 'after', sel: 'all', mode: 'restore' }],
  ['2 after, hot/restore', { when: 'after', sel: 'hot', mode: 'restore' }],
  ['2 after, hot/stream', { when: 'after', sel: 'hot', mode: 'stream' }],
  ['3 before, all/restore', { when: 'before', sel: 'all', mode: 'restore' }],
  ['3 before, hot/restore', { when: 'before', sel: 'hot', mode: 'restore' }],
  ['3 before, hot/stream', { when: 'before', sel: 'hot', mode: 'stream' }],
  ['4 after, hot/shuffle', { when: 'after', sel: 'hot', mode: 'shuffle' }],
  ['5 after, hot/chain', { when: 'after', sel: 'hot', mode: 'chain' }],
  ['5 before, hot/chain', { when: 'before', sel: 'hot', mode: 'chain' }],
  ['5 after, all/chain', { when: 'after', sel: 'all', mode: 'chain' }],
  // sketch 11. S = subject state on; C = content-following chained replay
  ['S 1 none', { subj: 1 }],
  ['S 2 after, all/restore', { subj: 1, when: 'after', sel: 'all', mode: 'restore' }],
  ['S 2 after, hot/stream', { subj: 1, when: 'after', sel: 'hot', mode: 'stream' }],
  ['C 2 after, hot (no S)', { when: 'after', sel: 'hot', mode: 'cchain' }],
  ['C 2 after, all (no S)', { when: 'after', sel: 'all', mode: 'cchain' }],
  ['S+C 2 after, hot', { subj: 1, when: 'after', sel: 'hot', mode: 'cchain' }],
  ['S+C 2 after, all', { subj: 1, when: 'after', sel: 'all', mode: 'cchain' }],
  ['S+C 3 before, hot', { subj: 1, when: 'before', sel: 'hot', mode: 'cchain' }],
  ['S+C 3 before, all', { subj: 1, when: 'before', sel: 'all', mode: 'cchain' }],
  ['S+rC 4 after, hot', { subj: 1, when: 'after', sel: 'hot', mode: 'rchain' }],
];
// Sketch 12: sketch 11's rows (sketch 10 rows dropped from the default run, ALL=1 to include them) + settling (E) rows.
const E_ROWS = [
  ['S+E 2 after, hot', { subj: 1, when: 'after', sel: 'hot', mode: 'echain' }],
  ['S+E 2 after, all', { subj: 1, when: 'after', sel: 'all', mode: 'echain' }],
  ['S+E 3 before, hot', { subj: 1, when: 'before', sel: 'hot', mode: 'echain' }],
  ['S+E 3 before, all', { subj: 1, when: 'before', sel: 'all', mode: 'echain' }],
  ['E 2 after, hot (no S)', { when: 'after', sel: 'hot', mode: 'echain' }],
  ['E 2 after, all (no S)', { when: 'after', sel: 'all', mode: 'echain' }],
  ['S+Esit after, hot', { subj: 1, when: 'after', sel: 'hot', mode: 'echainS' }],
  ['S+Epred after, hot', { subj: 1, when: 'after', sel: 'hot', mode: 'echainP' }],
  // POST-HOC (added after seeing the first run): the time-next row excluded from the jump candidates
  ['S+EX after, hot', { subj: 1, when: 'after', sel: 'hot', mode: 'echainX' }],
  ['S+EX after, all', { subj: 1, when: 'after', sel: 'all', mode: 'echainX' }],
  ['S+EX before, hot', { subj: 1, when: 'before', sel: 'hot', mode: 'echainX' }],
  ['EX after, hot (no S)', { when: 'after', sel: 'hot', mode: 'echainX' }],
  ['noisyS+EX after, hot', { subj: 1, sm: 'noisy', when: 'after', sel: 'hot', mode: 'echainX' }],
  ['lastS+EX after, hot', { subj: 1, sm: 'last', when: 'after', sel: 'hot', mode: 'echainX' }],
  ['noisyS 1 none', { subj: 1, sm: 'noisy' }],
  ['noisyS+C after, hot', { subj: 1, sm: 'noisy', when: 'after', sel: 'hot', mode: 'cchain' }],
  ['noisyS+E after, hot', { subj: 1, sm: 'noisy', when: 'after', sel: 'hot', mode: 'echain' }],
  ['noisyS+E after, all', { subj: 1, sm: 'noisy', when: 'after', sel: 'all', mode: 'echain' }],
  ['lastS 1 none', { subj: 1, sm: 'last' }],
  ['lastS+C after, hot', { subj: 1, sm: 'last', when: 'after', sel: 'hot', mode: 'cchain' }],
  ['lastS+E after, hot', { subj: 1, sm: 'last', when: 'after', sel: 'hot', mode: 'echain' }],
];
const CONDS = [...(process.env.ALL ? CONDS0 : CONDS0.filter(([n]) => !/^\d/.test(n))), ...E_ROWS];
const ONLY = process.env.ONLY ? new RegExp(process.env.ONLY) : null;
const f0 = (x) => (100 * x).toFixed(0).padStart(4), f2 = (x) => x.toFixed(2).padStart(6), t0 = Date.now();
console.log(`Sketch 12 (settling retrieval), on sketch 10/11: ${NCH} chains (${NFULL} full, ${NCH - NFULL} half), ${ROOMS.length} rooms (chance ${(100 / ROOMS.length).toFixed(0)}%), seeds ${SEEDS.join(',')}. Queries with all machine states empty.`);
console.log('condition              | join: right% bits perm% day-state% | half-chain ctrl: right% bits | free-run reaches room: empty / day-state / half-chain any room | direct: K in->C(rank)% C in->R decode/rank% | went% rule% ruleGen% | rows replayed');
const margins = {};
for (const [name, cond] of CONDS) { if (ONLY && !ONLY.test(name)) continue;
  const rs = SEEDS.map(s => run(s, cond)), cat = (k) => rs.flatMap(x => x[k]);
  if (process.env.SHOW) console.log('   free runs seed 1:', rs[0].frs.slice(0, 4).join(' || '));
  margins[name] = {}; for (const k of KINDS) margins[name][k] = mean(rs.flatMap(x => x.margin[k]));
  console.log(`${name.padEnd(22)} | subj-route: right room ${f2(mean(cat('fullSubj')))} half-chain max ${f2(mean(cat('halfSubj')))}`);
  console.log(`${name.padEnd(22)} |   ${f0(mean(cat('joinR')))} ${f2(mean(cat('joinB')))} ${f0(mean(cat('perm')))} ${f0(mean(cat('dayR')))} |        ${f0(mean(cat('halfR')))} ${f2(mean(cat('halfB')))}         |    ${f0(mean(cat('chain')))} ${f0(mean(cat('chainD')))} ${f0(mean(cat('chainHalfLure')))}  |      ${f0(mean(cat('d1')))}             ${f0(mean(cat('d2')))} /${f0(mean(cat('d2R')))}        | ${f0(mean(cat('went')))} ${f0(mean(cat('rule')))} ${f0(mean(cat('ruleGen')))}    | top-1 after (K,in) is C: ${f0(mean(rs.map(x => x.top1Cont)))} | ${mean(rs.map(x => x.replayed)).toFixed(0)} (hot ${f0(mean(rs.map(x => x.hotFrac)))}% of rows)`);
}
console.log('\nJoin queries: input to right room minus mean input to other rooms, by source route (summed weights)');
console.log('condition              | ' + KINDS.map(k => k.padStart(7)).join(''));
for (const [name] of CONDS) if (margins[name]) console.log(`${name.padEnd(22)} | ` + KINDS.map(k => margins[name][k].toFixed(2).padStart(7)).join(''));
console.log(`\n[${((Date.now() - t0) / 1000).toFixed(1)} s]`);
