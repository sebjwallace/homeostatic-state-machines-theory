// Sketch 09: a ledger beside the automaton. sketch06.js is sketch 06 unchanged (world + automaton);
// this file loads everything above its `main` and adds a dead-simple, non-learning ledger.
// `node sketch.js` (~1-2 min).
'use strict';
const fs = require('fs');
const src = fs.readFileSync(__dirname + '/sketch06.js', 'utf8').split('// ---------- main ----------')[0];
const L = new Function('require', src + '\nreturn { rng, makeStream, makeNet, names, context, inp, kwta, decode, overlap, learn, ask, freeRun, masks, HARD, K, N, POOL, RULES, PEOPLE0, PEOPLE1, PLACES, PLACES0, PLACES1, WEATHERS, TIMES, pairTok, mean, run };')(require);
const { rng, makeStream, makeNet, names, context, inp, kwta, decode, overlap, learn, ask, masks, HARD, K, RULES, PEOPLE0, PEOPLE1, PLACES, WEATHERS, TIMES, pairTok, mean } = L;

const SEEDS = [1, 2, 3], DAYS = [50, 200];
const FIELDS = ['day', 'time', 'who', 'where', 'weather', 'last2', 'last'];
// A row = the situation an input arrived in (all held states + the last two tokens) plus the input (ev).
const rowAt = (S, p) => ({ p, day: S.meta[p - 1].state.day, time: S.meta[p - 1].state.time, who: S.meta[p - 1].state.who, where: S.meta[p - 1].state.where, weather: S.meta[p - 1].state.weather, last2: p >= 2 ? S.toks[p - 2] : null, last: S.toks[p - 1], ev: S.toks[p] });
const sitKey = (st, prev, cur) => [st.day, st.time, st.who, st.where, st.weather, prev, cur].join('|');

// one learning step, exactly as sketch 06's live() body. Returns what was decided at the time.
function step(net, st, prev, cur, next) {
  const s = net.code[cur], c = context(net, st, prev, cur);
  const v = inp(net, s, c), pred = kwta(v, K, net.r), actual = net.code[next];
  const hardPred = decode(net, kwta(inp(net, s, c, masks.hard), K, net.r));
  const heat = 1 - overlap(pred, actual) / K, wrong = pred.filter(j => !actual.includes(j));
  const used = []; learn(net.ss, s, actual, wrong, heat, used); learn(net.cs, c, actual, wrong, heat, used);
  const seen = new Map(); for (const [p, q] of used) { let z = seen.get(p); if (!z) seen.set(p, z = new Set()); if (!z.has(q) && p.w[q] > 0.5) { z.add(q); p.h[q]++; } }
  return { allOk: decode(net, pred) === next, hardOk: hardPred === next, heat };
}
// Live through the stream. Writing policies are decided at the time of each input.
// consolidate: null | 'all' | 'soft' -> at the end of each day, replay that day's rows (that policy) once, learning on.
function live(net, S, consolidate, rr) {
  const { toks, meta } = S, W = { all: new Set(), fail: new Set(), soft: new Set(), predSoft: new Set(), pred: new Set(), heat: new Set(), surprise: new Set() };
  let dayStart = 1;
  const replay = (a, b) => { const set = W[consolidate]; for (let p = a; p < b; p++) if (set.has(p)) step(net, meta[p - 1].state, p >= 2 ? toks[p - 2] : null, toks[p - 1], toks[p]); };
  for (let t = 0; t + 1 < toks.length; t++) {
    const p = t + 1;
    if (consolidate && toks[p].startsWith('day:') && p > 1) { replay(dayStart, p); dayStart = p; }
    const d = step(net, meta[t].state, t ? toks[t - 1] : null, toks[t], toks[p]);
    W.all.add(p); if (!d.allOk) W.fail.add(p); if (!d.allOk || !d.hardOk) W.soft.add(p); if (d.allOk && !d.hardOk) W.predSoft.add(p); if (d.allOk) W.pred.add(p);
    if (d.heat > 0) W.heat.add(p); if (d.heat > 0.5) W.surprise.add(p);
  }
  if (consolidate) replay(dayStart, toks.length);
  // control: random rows at the 'soft' rate
  const rate = W.soft.size / W.all.size; W.random = new Set([...W.all].filter(() => rr() < rate));
  const rate2 = W.pred.size / W.all.size; W.randomPred = new Set([...W.all].filter(() => rr() < rate2));
  return W;
}
const ledgerOf = (S, set) => { const m = new Map(); for (const p of set) { const r = rowAt(S, p); m.set(sitKey(r, r.last2, r.last), r.ev); } return m; };

// Whole-day reconstruction from the opening cue (as sketch 06). At each step: if the ledger has a row for
// this exact situation, read it; otherwise the automaton predicts. ledger=null -> automaton alone.
function recon(net, S, nDays, ledger, dayFilter) {
  const { toks, meta } = S, starts = []; for (let t = 0; t < toks.length; t++) if (toks[t].startsWith('day:')) starts.push(t); starts.push(toks.length);
  const P = [], E = []; let reads = 0, steps = 0;
  for (let d = 0; d < nDays; d++) { if (dayFilter && !dayFilter(d)) continue;
    const a = starts[d], b = starts[d + 1]; let i0 = a; for (let t = a + 1; t < b; t++) if (toks[t].startsWith('weather:')) { i0 = t; break; }
    const st = { ...meta[i0].state }, truth = toks.slice(i0 + 1, b); let prev = toks[i0 - 1], cur = toks[i0], ok = 0, perfect = 1;
    for (let i = 0; i < truth.length; i++) {
      const hit = ledger && ledger.get(sitKey(st, prev, cur)); steps++; if (hit) reads++;
      const nx = hit || ask(net, st, prev, cur); if (nx === truth[i]) ok++; else perfect = 0;
      const m = nx.split(':')[0]; if (m in st) st[m] = nx; prev = cur; cur = nx;
    }
    P.push(perfect); E.push(ok / truth.length);
  }
  return { perf: mean(P), ev: mean(E), reads: reads / Math.max(1, steps) };
}
// Content-addressable lookup over the full ledger: best number of matching given keys, ties broken at random.
function lookup(rows, keys, r) {
  let best = -1, cands = [];
  for (const row of rows) { let s = 0; for (const k in keys) if (row[k] === keys[k]) s++;
    if (s > best) { best = s; cands = [row]; } else if (s === best) cands.push(row); }
  return { row: cands[Math.floor(r() * cands.length)], ties: cands.length };
}
function cueTests(S, nDays, seed) {
  const r = rng(seed * 101 + 7), rows = []; for (let p = 1; p < S.toks.length; p++) rows.push(rowAt(S, p));
  const byDay = {}; for (const row of rows) if (!/^(day|time):/.test(row.ev) && row.day) (byDay[row.day] = byDay[row.day] || []).push(row);
  const vals = { day: [...new Set(rows.map(x => x.day))], time: TIMES.map(t => 'time:' + t), who: [...new Set(rows.map(x => x.who))], where: [...new Set(rows.map(x => x.where))], weather: WEATHERS.map(w => 'weather:' + w), last: [...new Set(rows.map(x => x.last))] };
  vals.last2 = vals.last;
  const other = (k, v) => { let x; do x = vals[k][Math.floor(r() * vals[k].length)]; while (x === v); return x; };
  const cues = {
    'weather+who+time': (T) => ({ weather: T.weather, who: T.who, time: T.time }),
    'weather+who+time+/-1': (T) => { const i = TIMES.indexOf(T.time.split(':')[1]); const j = Math.max(0, Math.min(3, i + (r() < 0.5 ? -1 : 1))); return { weather: T.weather, who: T.who, time: 'time:' + TIMES[j] }; },
    'who+where+weather+time': (T) => ({ who: T.who, where: T.where, weather: T.weather, time: T.time }),
    'all 7, one wrong': (T) => { const k = FIELDS[Math.floor(r() * FIELDS.length)], o = {}; for (const f of FIELDS) o[f] = T[f]; o[k] = other(k, T[k]); return o; },
    'all 7, day wrong': (T) => { const o = {}; for (const f of FIELDS) o[f] = T[f]; o.day = other('day', T.day); return o; },
    'day+where (clean)': (T) => ({ day: T.day, where: T.where }),
  };
  const out = {};
  for (const name in cues) { const o = out[name] = { row: [], dayPlace: [], day: [], ties: [], miss: {} };
    for (let d = 0; d < nDays; d++) { const pool = byDay['day:' + d]; if (!pool) continue;
      for (let k = 0; k < 3; k++) { const T = pool[Math.floor(r() * pool.length)], { row, ties } = lookup(rows, cues[name](T), r);
        o.row.push(row.p === T.p ? 1 : 0); o.ties.push(ties); const dp = row.day === T.day && row.where === T.where; o.dayPlace.push(dp ? 1 : 0); o.day.push(row.day === T.day ? 1 : 0);
        if (!dp) { const c = row.day === T.day ? 'same day, other place' : row.who === T.who && row.where === T.where ? 'other day, same who+where' : row.who === T.who ? 'other day, same who' : row.where === T.where ? 'other day, same where' : 'other day, other who+where'; o.miss[c] = (o.miss[c] || 0) + 1; } } } }
  return out;
}
// place-rule generalisation to never-seen (who, where, weather), as sketch 06 (all / hard-only)
function gen(net, S, nDays, seed) {
  const seenTriple = new Set(S.meta.map(x => [x.state.who, x.state.where, x.state.weather].join('|'))), r = rng(seed * 31 + 5), o = { all: [], hard: [] };
  for (let d = Math.ceil(nDays / 2); d < nDays; d++) { const old = PEOPLE0[Math.floor(r() * PEOPLE0.length)], nw = PEOPLE1[Math.floor(r() * 2)]; let o2; do o2 = PEOPLE0[Math.floor(r() * PEOPLE0.length)]; while (o2 === old);
    for (const R of RULES) for (const who of [pairTok(old, nw), pairTok(old, o2)]) { const st = { day: 'day:' + d, time: 'time:afternoon', who, where: 'where:' + R.at, weather: 'weather:' + R.w };
      if (seenTriple.has([who, st.where, st.weather].join('|'))) continue;
      for (const m of ['all', 'hard']) o[m].push(ask(net, st, st.where, st.weather, masks[m]) === 'where:' + R.to ? 1 : 0); } }
  return o;
}
// one-step recall from true context of specific (meet/move) vs general (rule) tokens, automaton alone, optional day filter
function recall(net, S, dayFilter) {
  const o = { specific: [], rule: [], all: [] }, { toks, meta } = S;
  for (let t = 1; t + 1 < toks.length; t++) { const dn = +meta[t].state.day.split(':')[1]; if (dayFilter && !dayFilter(dn)) continue;
    const ok = ask(net, meta[t].state, toks[t - 1], toks[t]) === toks[t + 1] ? 1 : 0; o.all.push(ok); const q = meta[t + 1].q;
    if (q === 'meet' || q === 'move') o.specific.push(ok); if (q === 'rule') o.rule.push(ok); }
  return o;
}
const hardShare = (net, kind) => { let n = 0, h = 0; for (const [i, p] of net.cs) if (net.kind.get(i) === kind) for (let q = 0; q < p.j.length; q++) if (p.w[q] > 0.5) { n++; if (p.h[q] >= HARD) h++; } return n ? h / n : 0; };

// ---------- main ----------
const f0 = (x) => (100 * x).toFixed(0).padStart(4), t0 = Date.now();
const POL = ['all', 'fail', 'soft', 'heat', 'surprise', 'random', 'predSoft', 'pred', 'randomPred'];
const KEEP = 0.2; // forgetting: keep only the last 20% of days' rows
for (const nD of DAYS) {
  const acc = {};
  const put = (k, v) => (acc[k] = acc[k] || []).push(v);
  for (const seed of SEEDS) {
    const S = makeStream(seed, nD), rr = rng(seed * 7 + 3);
    if (nD === DAYS[0] || true) { const ct = cueTests(S, nD, seed); for (const k in ct) put('cue:' + k, ct[k]); }
    for (const cons of [null, 'all', 'soft']) {
      const net = makeNet(seed, 'time', names(nD)), W = live(net, S, cons, rr), tag = cons || 'none', nAll = W.all.size;
      put(tag + ':alone', recon(net, S, nD, null));
      for (const pol of POL) { const r = recon(net, S, nD, ledgerOf(S, W[pol])); r.size = W[pol].size / nAll; put(tag + ':' + pol, r); }
      // oracle (not causal): rows the final automaton gets wrong one-step from true context
      { const set = new Set(); for (let p = 2; p < S.toks.length; p++) if (ask(net, S.meta[p - 1].state, S.toks[p - 2], S.toks[p - 1]) !== S.toks[p]) set.add(p);
        const r = recon(net, S, nD, ledgerOf(S, set)); r.size = set.size / nAll; put(tag + ':oracle', r); }
      // forgetting: prune rows of days older than the last KEEP of the stream (pred ledger)
      const cut = Math.floor(nD * (1 - KEEP)), dayOfP = (p) => +S.meta[p - 1].state.day.split(':')[1];
      const pruned = new Set([...W.pred].filter(p => dayOfP(p) >= cut)), oldF = (d) => d < cut, newF = (d) => d >= cut;
      const rp = recon(net, S, nD, ledgerOf(S, pruned)); rp.size = pruned.size / nAll; put(tag + ':softPruned', rp);
      put(tag + ':softPrunedOld', recon(net, S, nD, ledgerOf(S, pruned), oldF));
      put(tag + ':aloneOld', recon(net, S, nD, null, oldF)); put(tag + ':aloneNew', recon(net, S, nD, null, newF));
      put(tag + ':gen', gen(net, S, nD, seed)); put(tag + ':recOld', recall(net, S, oldF)); put(tag + ':recAll', recall(net, S));
      put(tag + ':hard', { day: hardShare(net, 'day'), joint: hardShare(net, 'joint'), where: hardShare(net, 'where') });
    }
  }
  const m = (k, f) => mean(acc[k].map(f)), cat = (k, f) => acc[k].flatMap(f);
  console.log(`\n===== ${nD} days, seeds ${SEEDS.join(',')} =====`);
  console.log('\n(1+3) Whole-day reconstruction from the opening cue: ledger read where a row matches the exact situation, automaton otherwise');
  console.log('consolidation | ledger           | rows % | perfect% events% | steps read from ledger %');
  for (const tag of ['none', 'all', 'soft']) for (const pol of ['alone', ...POL, 'oracle', 'softPruned']) { const k = tag + ':' + pol;
    console.log(`${tag.padEnd(13)} | ${(pol === 'alone' ? 'none (automaton)' : pol === 'softPruned' ? `pred, last ${KEEP * 100}% d` : pol).padEnd(16)} | ${pol === 'alone' ? '   0' : f0(m(k, r => r.size))}   | ${f0(m(k, r => r.perf))}    ${f0(m(k, r => r.ev))}   | ${f0(m(k, r => r.reads))}`); }
  console.log('\n(2) Content-addressable lookup on the full ledger (3 targets per day, any non-clock row)');
  console.log('cue                       | exact row% | right day+place% | right day% | mean ties | misses land on');
  for (const k of Object.keys(acc).filter(k => k.startsWith('cue:'))) { const o = acc[k], miss = {}; let nm = 0; for (const x of o) for (const c in x.miss) { miss[c] = (miss[c] || 0) + x.miss[c]; nm += x.miss[c]; }
    console.log(`${k.slice(4).padEnd(25)} |    ${f0(mean(o.flatMap(x => x.row)))}    |      ${f0(mean(o.flatMap(x => x.dayPlace)))}        |    ${f0(mean(o.flatMap(x => x.day)))}    | ${mean(o.flatMap(x => x.ties)).toFixed(1).padStart(8)}  | ` + Object.entries(miss).sort((a, b) => b[1] - a[1]).map(([c, v]) => `${c} ${(100 * v / nm).toFixed(0)}%`).join(', ')); }
  console.log('\n(4+5) Automaton after nightly replay of that day\'s ledger rows (learning on). old = first 80% of days (their rows pruned)');
  console.log('consolidation | gen place-rule all/hard | one-step all | old days: specific(meet/move) rule | alone perf: old/new | pred ledger pruned: old-day perf | %hard day/joint/where');
  for (const tag of ['none', 'all', 'soft']) { const g = acc[tag + ':gen'], ro = acc[tag + ':recOld'], h = acc[tag + ':hard'];
    console.log(`${tag.padEnd(13)} |       ${f0(mean(g.flatMap(x => x.all)))} / ${f0(mean(g.flatMap(x => x.hard)))}       |     ${f0(mean(acc[tag + ':recAll'].flatMap(x => x.all)))}     |        ${f0(mean(ro.flatMap(x => x.specific)))}          ${f0(mean(ro.flatMap(x => x.rule)))}    |   ${f0(m(tag + ':aloneOld', r => r.perf))} /${f0(m(tag + ':aloneNew', r => r.perf))}    |      ${f0(m(tag + ':softPrunedOld', r => r.perf))}  (n gen=${g.flatMap(x => x.all).length})  | ${f0(mean(h.map(x => x.day)))} ${f0(mean(h.map(x => x.joint)))} ${f0(mean(h.map(x => x.where)))}`); }
}
console.log(`\n[${((Date.now() - t0) / 1000).toFixed(1)} s]`);
