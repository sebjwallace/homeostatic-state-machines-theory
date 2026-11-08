// Sketch 17: invariant structure. Can sketch 04's C2 mechanics (held states + sequence
// machine + earned hardness + heat from own prediction failure + quiet replay with the
// same rule) learn relation templates with variable fillers, and rules over them?
// `node sketch.js`   (seeds 1-5, settings fixed before running)
'use strict';
function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s;
  t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const ENDDOT = process.env.ENDDOT !== '0';  // each sentence is followed by '.', so the end->'.' transition is learnt (fix after run 1)
const SEEDS = (process.env.SEEDS ?? '1,2,3,4,5').split(',').map(Number);
// ---- fixed settings (chosen before the first run) ----
const N = 3200, K = 8, HARD = 3, NSENT = 800, NQ = 40, QSTEPS = 10, QPERIOD = 100, QPER = 10;
const melt = (h) => 0.5 + 0.4 * h, plast = (heat, h) => Math.min(1, Math.max(0, (heat - melt(h)) / 0.5));
// ---- vocabulary: kinds are only in how words are used ----
const mk = (p, n) => Array.from({ length: n }, (_, i) => p + i);
const OBJ = mk('o', 24), XOBJ = mk('x', 20), CON = mk('c', 12), ROOM = mk('r', 4), SURF = mk('s', 6), PPL = mk('p', 8);
const FIXED = ['.', 'the', 'a', 'is', 'in', 'on', 'has', 'sat', 'opened'];
const NOUN = new Set([...OBJ, ...XOBJ, ...CON, ...ROOM, ...SURF, ...PPL]);
const kindOf = (w) => !w ? '-' : w[0] === 'x' ? 'o' : NOUN.has(w) ? w[0] : 'fixed';
const ALL = [...FIXED, ...NOUN];
const S = { inOC: (o, c) => ['.', 'the', o, 'is', 'in', 'the', c], inCR: (c, r) => ['.', 'the', c, 'is', 'in', 'the', r],
  onOS: (o, s) => ['.', 'the', o, 'is', 'on', 'the', s], has: (p, o) => ['.', 'the', p, 'has', 'a', o],
  sat: (p, s) => ['.', 'the', p, 'sat', 'on', 'the', s], opened: (p, c) => ['.', 'the', p, 'opened', 'the', c] };

function world(seed) {
  const r = rng(seed * 101 + 7), pick = (a) => a[Math.floor(r() * a.length)];
  const roomOf = {}; for (const c of CON) roomOf[c] = pick(ROOM);
  const heldO = OBJ.slice(0, 4);        // never subject of "in": seen only in on/has
  const heldC = CON.slice(0, 3);        // never subject of "C in R": seen only as "in" slot-2 and in "opened"
  const chainC = CON.slice(3);
  const chains = XOBJ.map((x) => ({ x, y: pick(chainC) })); chains.forEach((ch, i) => { ch.z = roomOf[ch.y]; ch.train = i < 10; });
  const sents = [];
  for (let i = 0; i < NSENT; i++) {
    const u = r();
    if (u < 0.25) sents.push(S.inOC(pick(OBJ.slice(4)), pick(CON)));
    else if (u < 0.40) { const c = pick(CON.slice(3)); sents.push(S.inCR(c, roomOf[c])); }
    else if (u < 0.60) sents.push(S.onOS(pick(OBJ), pick(SURF)));
    else if (u < 0.78) sents.push(S.has(pick(PPL), pick(OBJ)));
    else if (u < 0.89) sents.push(S.sat(pick(PPL), pick(SURF)));
    else sents.push(S.opened(pick(PPL), pick(CON)));
  }
  // chain objects: kind evidence (on/has), one "X in Y" each in the first 60%, consequence "X in Z" for train chains later
  const ins = (at, s) => sents.splice(Math.min(sents.length, Math.max(0, at)), 0, s);
  for (const ch of chains) { ins(Math.floor(r() * NSENT), S.onOS(ch.x, pick(SURF))); ins(Math.floor(r() * NSENT), S.has(pick(PPL), ch.x)); }
  for (const ch of chains) ins(Math.floor(r() * 0.6 * NSENT), S.inOC(ch.x, ch.y));
  for (const ch of chains) if (ch.train) { const i = sents.findIndex(s => s[2] === ch.x && s[4] === 'in'); ins(i + 20 + Math.floor(r() * 200), S.inOC(ch.x, ch.z)); }
  return { r, pick, roomOf, heldO, heldC, chains, sents };
}

// ---- automaton (sketch 04 C2): symbol route + context route; context = seq-machine (prev x cur) ∪ (subject x cur) ----
const POOL = 1 << 24;
function conj(net, A, B, salt) { const out = new Set();
  for (const a of A) for (const b of B) { let h = Math.imul(a + 1, 0x9E3779B1) ^ Math.imul(b + 7, 0x85EBCA77) ^ net.hs ^ salt;
    h = Math.imul(h ^ (h >>> 15), 0x2C1B3C6D); h ^= h >>> 13; h >>>= 0; if ((h & 7) === 0) out.add((h >>> 3) % POOL); }
  return [...out]; }
function makeNet(seed) { const r = rng(seed), code = {}, idx = Array.from({ length: N }, () => []);
  for (const n of ALL) { const a = new Set(); while (a.size < K) a.add(Math.floor(r() * N)); code[n] = [...a]; for (const i of a) idx[i].push(n); }
  return { r, code, idx, hs: (seed * 2654435761) | 0, ss: new Map(), cs: new Map(), heat: {} }; }
// held states: prev symbol (sequence machine), subject (role-like: set by the word after ". the", held until the next ".")
function step(net, x, sym) {
  if (sym === '.') { x.subj = undefined; x.pos = 0; } else x.pos++;
  if (x.pos === 2 && x.prev === 'the' && NOUN.has(sym)) x.subj = sym;
  let c = x.prev !== undefined ? conj(net, net.code[x.prev], net.code[sym], 0x5EED) : [];
  x.seqPart = c; x.subjPart = [];
  if (x.subj !== undefined && sym !== x.subj) { x.subjPart = conj(net, net.code[x.subj], net.code[sym], 0); c = [...new Set([...c, ...x.subjPart])]; }
  x.prev = sym; return c; }
const row = (M, i, make) => { let p = M.get(i); if (!p && make) M.set(i, p = { j: [], w: [], h: [], m: new Map() }); return p; };
function inp(net, s, c, mask) { const v = new Float32Array(N);
  const add = (M, pre) => { for (const i of pre) { const p = row(M, i); if (!p) continue; for (let q = 0; q < p.j.length; q++) if (p.w[q] > 0 && (!mask || mask(p.h[q]))) v[p.j[q]] += p.w[q]; } };
  if (s) add(net.ss, s); if (c) add(net.cs, c); return v; }
function kwta(v, r) { const idx = []; for (let i = 0; i < v.length; i++) if (v[i] > 1e-6) { v[i] += r() * 1e-4; idx.push(i); }
  idx.sort((a, b) => v[b] - v[a]); return idx.slice(0, K); }
const ovl = (a, b) => { const s = new Set(b); let n = 0; for (const x of a) if (s.has(x)) n++; return n; };
function dec(net, pat) { const cnt = new Map(); for (const i of pat) for (const n of net.idx[i]) cnt.set(n, (cnt.get(n) || 0) + 1);
  let best = null, bo = 0; for (const [n, o] of cnt) if (o > bo) { bo = o; best = n; } return { sym: best, ov: bo }; }
function learn(M, pre, actual, wrong, heat, used) {
  for (const i of pre) { const p = row(M, i, true);
    for (const j of actual) { let q = p.m.get(j); if (q === undefined) { q = p.j.length; p.j.push(j); p.w.push(0); p.h.push(0); p.m.set(j, q); }
      p.w[q] += (0.05 + plast(heat, p.h[q])) * (1 - p.w[q]); let u = used.get(p); if (!u) used.set(p, u = new Set()); u.add(q); }
    for (const j of wrong) { const q = p.m.get(j); if (q !== undefined && p.w[q] > 0) p.w[q] -= 0.5 * plast(heat, p.h[q]) * p.w[q]; } } }
const cool = (used) => { for (const [p, qs] of used) for (const q of qs) if (p.w[q] > 0.5) p.h[q]++; };
// one experienced sentence. returns heat per step
function experience(net, sent) {
  if (ENDDOT) sent = sent.concat('.');
  const used = new Map(), x = {}, heats = []; let s = net.code[sent[0]], c = step(net, x, sent[0]);
  for (let t = 0; t + 1 < sent.length; t++) {
    const pred = kwta(inp(net, s, c), net.r), actual = net.code[sent[t + 1]];
    const heat = 1 - ovl(pred, actual) / K; heats.push(heat);
    net.heat[sent[t + 1]] = (net.heat[sent[t + 1]] || 0) + heat;
    const wrong = pred.filter(j => !actual.includes(j));
    learn(net.ss, s, actual, wrong, heat, used); learn(net.cs, c, actual, wrong, heat, used);
    s = actual; c = step(net, x, sent[t + 1]);
  }
  cool(used); for (const n in net.heat) net.heat[n] *= 0.97; return heats;
}
// quiet: no input. start at a symbol chosen ∝ heat², run on its own predictions; "actual" = the assembly the
// prediction settles into (clean-up); heat = misfit between raw prediction and that assembly; same learn + cool.
function quiet(net, nRep, log) {
  for (let q = 0; q < nRep; q++) {
    const syms = Object.keys(net.heat), ws = syms.map(n => net.heat[n] ** 2), tot = ws.reduce((a, b) => a + b, 0);
    let u = net.r() * tot, start = syms[0]; for (let i = 0; i < syms.length; i++) { u -= ws[i]; if (u <= 0) { start = syms[i]; break; } }
    net.heat[start] *= 0.5; const used = new Map(), x = {}, path = [start];
    let s = net.code[start], c = step(net, x, start);
    for (let t = 0; t < QSTEPS; t++) {
      const pred = kwta(inp(net, s, c), net.r); if (!pred.length) break; const d = dec(net, pred); if (d.ov < K / 2) break;
      const actual = net.code[d.sym], heat = 1 - ovl(pred, actual) / K, wrong = pred.filter(j => !actual.includes(j));
      net.heat[d.sym] = (net.heat[d.sym] || 0) + 0.5 * heat;
      learn(net.ss, s, actual, wrong, heat, used); learn(net.cs, c, actual, wrong, heat, used);
      s = actual; c = step(net, x, d.sym); path.push(d.sym);
    }
    cool(used); if (log) log.push(path.join(' '));
  }
}
function predict(net, prefix, mask) { const x = {}; let s, c; for (const w of prefix) { s = net.code[w]; c = step(net, x, w); }
  return dec(net, kwta(inp(net, s, c, mask), net.r)).sym; }
function train(seed, W, quietDuring) { const net = makeNet(seed);
  W.sents.forEach((s, i) => { experience(net, s); if (quietDuring && (i + 1) % QPERIOD === 0) quiet(net, QPER); }); return net; }

// ---- hardness by link kind (strong links, w>0.5) ----
function hardness(net, W) {
  const K_ = { 'pairing (subj x slot->filler)': [] };
  const seen = new Set();
  const h = (M, pre, post, into, tag) => { for (const i of pre) { const p = row(M, i); if (!p) continue; for (const j of post) { const q = p.m.get(j);
    if (q === undefined || p.w[q] <= 0.5) continue; const key = tag + ':' + i + ':' + j; if (seen.has(key)) continue; seen.add(key); into.push(p.h[q]); } } };
  for (const sent of W.sents) { const x = {}; let prev;
    for (let t = 0; t + 1 < sent.length; t++) {
      const a = sent[t], b = sent[t + 1]; step(net, x, a);
      const fa = !NOUN.has(a), fb = !NOUN.has(b);
      const pairK = fa && fb ? 'template' : fa ? 'slot->filler' : fb ? 'filler->relation' : null;
      if (pairK) { h(net.ss, net.code[a], net.code[b], (K_['sym: ' + pairK] = K_['sym: ' + pairK] || []), 's');
        if (x.seqPart.length) h(net.cs, x.seqPart, net.code[b], (K_['seq(prev x cur): ' + pairK + (NOUN.has(x.prevPrev) || NOUN.has(a) ? ' [filler in state]' : '')] = K_['seq(prev x cur): ' + pairK + (NOUN.has(x.prevPrev) || NOUN.has(a) ? ' [filler in state]' : '')] || []), 'c'); }
      x.prevPrev = a;
      if (t + 1 === sent.length - 1 && x.subjPart.length) h(net.cs, x.subjPart, net.code[b], K_['pairing (subj x slot->filler)'], 'p');
    } }
  return K_; }

const pct = (a) => a.length ? (100 * a.reduce((x, y) => x + y, 0) / a.length).toFixed(0) : '-';
const out = {}; const push = (k, v) => (out[k] = out[k] || []).push(v);
const hardAll = {};
for (const seed of SEEDS) {
  const W = world(seed);
  // ===== Level 1 =====
  const net = train(seed, W, false);
  const hk = hardness(net, W); for (const k in hk) (hardAll[k] = hardAll[k] || []).push(...hk[k]);
  const hardOnly = (h) => h >= HARD;
  for (const [tag, mask] of [['all', null], ['hard', hardOnly]]) {
    // (a) held-out object as subject of "in": slot-2 should be a container (not a room)
    for (const o of W.heldO) { const k = kindOf(predict(net, ['.', 'the', o, 'is', 'in', 'the'], mask)); push(`L1a ${tag} heldO in -> container`, k === 'c' ? 1 : 0); push(`L1a ${tag} heldO in -> room`, k === 'r' ? 1 : 0); }
    for (const o of OBJ.slice(4, 12)) { const k = kindOf(predict(net, ['.', 'the', o, 'is', 'in', 'the'], mask)); push(`L1a ${tag} seenO in -> container`, k === 'c' ? 1 : 0); }
    // (b) held-out container as subject: slot-2 should be a room
    for (const c of W.heldC) { const k = kindOf(predict(net, ['.', 'the', c, 'is', 'in', 'the'], mask)); push(`L1b ${tag} heldC in -> room`, k === 'r' ? 1 : 0); push(`L1b ${tag} heldC in -> container`, k === 'c' ? 1 : 0); }
    // (c) held-out object after "is": relation word should be in/on (both fine); after "the heldC is": should be "in"
    for (const o of W.heldO) push(`L1a ${tag} heldO in -> kind`, kindOf(predict(net, ['.', 'the', o, 'is', 'in', 'the'], mask)));
    for (const c of W.heldC) push(`L1b ${tag} heldC in -> kind`, kindOf(predict(net, ['.', 'the', c, 'is', 'in', 'the'], mask)));
    for (const c of W.heldC) push(`L1c ${tag} heldC is -> in`, predict(net, ['.', 'the', c, 'is'], mask) === 'in' ? 1 : 0);
    // (d) positional controls: "the p sat on the" -> surface, "the p has a" -> object, "the o is on the" -> surface
    for (const p of PPL) { push(`L1d ${tag} sat on the -> surface`, kindOf(predict(net, ['.', 'the', p, 'sat', 'on', 'the'], mask)) === 's' ? 1 : 0);
      push(`L1d ${tag} has a -> object`, kindOf(predict(net, ['.', 'the', p, 'has', 'a'], mask)) === 'o' ? 1 : 0); }
    for (const o of W.heldO) push(`L1d ${tag} heldO is on the -> surface`, kindOf(predict(net, ['.', 'the', o, 'is', 'on', 'the'], mask)) === 's' ? 1 : 0);
  }
  // heat at slot-2 for normal, novel-but-right-kind, and wrong-kind sentences (measured with learning on a throwaway copy = retrain)
  // (e) break: "the o is in the p" (person in container slot), 5 times, then quiet / no quiet. Branches retrain from scratch (deterministic).
  for (const cond of ['none', 'quiet', 'quiet-nobreak']) {
    const n2 = train(seed, W, false); const r = rng(seed * 13 + 5);
    const probe = (n) => { let bad = 0, cont = 0; for (const o of OBJ.slice(4)) { const k = kindOf(predict(n, ['.', 'the', o, 'is', 'in', 'the'])); bad += k === 'p'; cont += k === 'c'; } return [bad / 20, cont / 20]; };
    const tw = (n) => { // mean weight (in,the)seq-context -> person cells, and min hardness of strong (in,the)->container links
      const x = {}; for (const w of ['.', 'the', 'o5', 'is', 'in', 'the']) step(n, x, w); let ws = [], hs = [];
      for (const i of x.seqPart) { const p = row(n.cs, i); if (!p) continue; for (const pp of PPL) for (const j of n.code[pp]) { const q = p.m.get(j); ws.push(q === undefined ? 0 : p.w[q]); }
        for (const cc of CON) for (const j of n.code[cc]) { const q = p.m.get(j); if (q !== undefined && p.w[q] > 0.5) hs.push(p.h[q]); } }
      return [ws.reduce((a, b) => a + b, 0) / Math.max(1, ws.length), hs.length ? Math.min(...hs) : 0, hs.length ? hs.reduce((a, b) => a + b, 0) / hs.length : 0]; };
    const normalHeat = experience(n2, S.inOC('o4', CON[5]))[5], novelHeat = experience(n2, S.inOC(W.heldO[0], W.heldC[0]))[5];
    if (cond === 'none') { push('E heat slot2 normal', normalHeat); push('E heat slot2 novel right-kind', novelHeat); }
    const [b0] = probe(n2), [w0, hmin0, hmean0] = tw(n2);
    const bh = [];
    if (cond !== 'quiet-nobreak') for (let i = 0; i < 5; i++) bh.push(experience(n2, S.inOC(OBJ[4 + Math.floor(r() * 20)], PPL[Math.floor(r() * 8)]))[5]);
    const [b1, c1] = probe(n2), [w1, hmin1] = tw(n2);
    if (cond !== 'none') quiet(n2, NQ);
    const [b2, c2] = probe(n2), [w2, hmin2, hmean2] = tw(n2);
    if (cond === 'none') { push('E heat slot2 break #1', bh[0]); push('E heat slot2 break #5', bh[4]); }
    push(`E ${cond} person-in-slot before/after-break/after-quiet`, [b0, b1, b2]);
    push(`E ${cond} container-in-slot after-break/after-quiet`, [c1, c2]);
    push(`E ${cond} w((in,the)->person) before/after-break/after-quiet`, [w0, w1, w2]);
    push(`E ${cond} (in,the)->container hardness min/mean before -> after`, [hmin0, hmean0, hmin2, hmean2]);
  }
  // ===== Level 2 =====
  for (const qd of [false, true]) {
    const n3 = makeNet(seed); const qlog = [];
    W.sents.forEach((s, i) => { experience(n3, s); if (qd && (i + 1) % QPERIOD === 0) quiet(n3, QPER, qlog); }); if (qd) quiet(n3, NQ, qlog);
    if (qd) { let xs = 0, xyz = 0; for (const ch of W.chains.filter(c => !c.train)) for (const l of qlog) { const w = l.split(' ');
        const i = w.indexOf(ch.x); if (i < 0) continue; xs++; const j = w.indexOf(ch.y, i); if (j > 0 && w.indexOf(ch.z, j) > 0) xyz++; }
      push('L2 replays (all seeds) total', qlog.length); push('L2 replays containing a test X', xs); push('L2 replays running X..Y..Z', xyz); }
    const tag = qd ? 'quiet' : 'noquiet';
    for (const ch of W.chains) {
      const pr = predict(n3, ['.', 'the', ch.x, 'is', 'in', 'the']), set = ch.train ? 'train' : 'test';
      push(`L2 ${tag} ${set} ->Z`, pr === ch.z ? 1 : 0); push(`L2 ${tag} ${set} ->Y`, pr === ch.y ? 1 : 0);
      const ctxPr = predict(n3, [...S.inOC(ch.x, ch.y), ...S.inCR(ch.y, ch.z), '.', 'the', ch.x, 'is', 'in', 'the']);  // two premises fed just before, learning off
      push(`L2 ${tag} ${set} in-context ->Z`, ctxPr === ch.z ? 1 : 0); push(`L2 ${tag} ${set} in-context ->Y`, ctxPr === ch.y ? 1 : 0);
      push(`L2 ${tag} ${set} ->other room`, kindOf(pr) === 'r' && pr !== ch.z ? 1 : 0);
      // control: does the world fact "Y in Z" itself work?
      if (set === 'test') push(`L2 ${tag} control Y in -> Z`, predict(n3, ['.', 'the', ch.y, 'is', 'in', 'the']) === ch.z ? 1 : 0);
    }
    if (seed === SEEDS[0] && qd) { const log = []; const n4 = train(seed, W, false); quiet(n4, 12, log); push('replay sample', log); }
  }
}
// ---- report ----
console.log('seeds', SEEDS.join(','), ' N', N, 'k', K, 'sentences', NSENT, 'HARD', HARD);
console.log('\nhardness by link kind (strong links, pooled seeds):  n  %hard  median  hist h=1 | 2 | 3-9 | 10+');
for (const k in hardAll) { const v = hardAll[k].slice().sort((a, b) => a - b), n = v.length;
  const f = (lo, hi) => (100 * v.filter(h => h >= lo && h <= hi).length / n).toFixed(0);
  console.log(' ', k.padEnd(32), String(n).padStart(6), pct(v.map(h => h >= HARD ? 1 : 0)).padStart(5), String(v[n >> 1]).padStart(6), '  ', f(1, 1), f(2, 2), f(3, 9), f(10, 1e9)); }
for (const k in out) { const v = out[k];
  if (k === 'replay sample') { console.log('\nreplay sample (seed', SEEDS[0], '):'); v[0].forEach(l => console.log('   ', l)); continue; }
  if (Array.isArray(v[0])) { const m = v[0].map((_, i) => (v.reduce((a, b) => a + b[i], 0) / v.length).toFixed(2)); console.log(k.padEnd(62), m.join(' / ')); }
  else if (typeof v[0] === 'string') { const c = {}; v.forEach(z => c[z] = (c[z] || 0) + 1); console.log(k.padEnd(62), Object.entries(c).map(([a, b]) => a + ':' + b).join(' ')); }
  else if (k.startsWith('L2 replays')) console.log(k.padEnd(62), v.reduce((a, b) => a + b, 0));
  else if (k.startsWith('E heat')) console.log(k.padEnd(62), (v.reduce((a, b) => a + b, 0) / v.length).toFixed(2));
  else console.log(k.padEnd(62), (pct(v) + '%').padStart(5), ` (n=${v.length})`); }
