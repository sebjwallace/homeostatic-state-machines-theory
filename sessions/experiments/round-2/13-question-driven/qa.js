// Sketch 13: question-driven retrieval. Loads sketch.js (sketch 12 + sketch 13 world patch) without its main.
// The automaton lives the stream once (no replay; 'S 1 none'), then answers questions by hopping through the ledger.
// Question answering is READ-ONLY: no weights change, no ledger rows are written. `node qa.js` (WORLD=rev for the reversed world).
'use strict';
const fs = require('fs');
let s = fs.readFileSync(__dirname + '/sketch.js', 'utf8'); s = s.slice(0, s.lastIndexOf('// ---------- main ----------')).replace(/^'use strict';/m, '');
s = s.replace("W.net = net; return {", "W.net = net; W.ledger = ledger; return {");
const M = new Function('require', '__dirname', s + '\nreturn { run, ROOMT, CONTT, isClock, isContent, kwta, inp, context, overlap, K, rng, mean, NULLST };')(require, __dirname);
const { run, ROOMT, CONTT, isClock, isContent, kwta, inp, context, K, rng, mean, NULLST } = M;

// ---------- settings, fixed before the first run ----------
const TRIAL = 3;      // rows replayed per trial (stops early at a clock token: the trial stays in the cue's segment)
const HOPS = 4;       // hop cap
const COOL = 0.5;     // gap counts as closed when its heat < COOL
const SUPP = 0.1;     // frame support: cells receiving > SUPP * max input
const SEEDS = [1, 2, 3, 4, 5];
// POST HOC (after the first run, TRIAL=sit): a trial also surfaces the content tokens of the replayed row's recorded situation
// (its last two tokens and held states), not only the inputs that follow it. Pre-registered default: 'fwd'.
const TRIALMODE = process.env.TRIAL || 'fwd';

// The question frame, learned: the automaton's own expectation after the event token that the question asks about
// (here 'ev:went': "where does one go?"), from empty held states. Its support is the shared assembly of whatever has
// filled that slot in experience. No labels: rooms and containers are all 'n:' tokens.
function frameOf(net, ev) { const v = inp(net, net.code[ev], context(net, { ...NULLST }, null, ev)); let mx = 0; for (const x of v) if (x > mx) mx = x;
  const S = new Set(); v.forEach((x, i) => { if (x > SUPP * mx) S.add(i); }); return S; }
const fit = (net, F, y) => net.code[y].filter(i => F.has(i)).length / K;
const heatOf = (net, F, Y) => Math.min(1, ...[...Y].map(y => 1 - fit(net, F, y)));

// segment = the tokens between two clock tokens (the same boundary the subject rule uses).
function segOf(toks, p) { if (isClock(toks[p])) p--; let a = p;  // bug fix after first seg run: a clock row belongs to the segment it closes
  while (a > 0 && !isClock(toks[a - 1])) a--; let b = p; while (b + 1 < toks.length && !isClock(toks[b + 1])) b++; return [a, b]; }

// pick: 'gap' (lowest post-trial heat, ties at random) or 'rand' (ablation: a random candidate, same trials/stop rule)
function ask(R, subj, F, pick, r) {
  const { W, net } = R, { toks, meta, ledger } = W, rows = ledger.map(x => x.p);
  const keysOf = (q) => { const st = meta[q - 1].state; return [toks[q - 1], q >= 2 ? toks[q - 2] : null, st.day, st.time, st.who, st.where, st.weather, st.subj]; };
  const surfaced = new Set([subj]), cued = new Set(), visited = new Set(); let h = heatOf(net, F, surfaced), hops = 0;
  const h0 = h;
  while (h >= COOL && hops < HOPS) {
    const cues = [...surfaced].filter(y => !cued.has(y)); if (!cues.length) break; cues.forEach(y => cued.add(y));
    // ledger: every row with a key equal to a cue (no scoring)
    const cands = rows.filter(q => !visited.has(q) && cues.some(c => keysOf(q).includes(c)));
    let best = Infinity, ties = [];
    for (const q of cands) {
      const [a, b] = segOf(toks, q), cue = cues.find(c => keysOf(q).includes(c));
      if (!toks.slice(a, b + 1).includes(cue)) { continue; } // the row must share a segment with the cue token
      const got = TRIALMODE === 'sit' ? keysOf(q).filter(isContent) : []; for (let i = q; i < q + TRIAL && i < toks.length && !isClock(toks[i]); i++) if (isContent(toks[i])) got.push(toks[i]);
      if (TRIALMODE === 'seg') { got.length = 0; for (let i = a; i <= b; i++) if (isContent(toks[i])) got.push(toks[i]); }
      if (process.env.SKIPEMPTY && !got.some(y => !surfaced.has(y))) continue;
      const ht = heatOf(net, F, new Set([...surfaced, ...got]));
      if (pick === 'rand') ties.push([q, got]); else if (ht < best - 1e-9) { best = ht; ties = [[q, got]]; } else if (Math.abs(ht - best) <= 1e-9) ties.push([q, got]);
    }
    if (!ties.length) break;
    const [q, got] = ties[Math.floor(r() * ties.length)]; visited.add(q); got.forEach(y => surfaced.add(y)); hops++;
    h = heatOf(net, F, surfaced);
  }
  const ans = h < COOL ? [...surfaced].sort((x, y) => fit(net, F, y) - fit(net, F, x))[0] : null;
  return { ans, h, h0, hops };
}

const f0 = (x) => (100 * x).toFixed(0).padStart(4), f2 = (x) => x.toFixed(2).padStart(5);
console.log(`Sketch 13 question-driven retrieval, world=${process.env.WORLD || 'fwd'}, trial=${TRIALMODE}; TRIAL ${TRIAL}, HOPS ${HOPS}, COOL ${COOL}; chance 17%`);
for (const pick of ['gap', 'rand']) {
  const acc = { join: [], half: [], direct: [], cont: [] }, sep = [];
  for (const seed of SEEDS) {
    const R = run(seed, { subj: 1 }), net = R.net, F = frameOf(net, 'ev:went'), r = rng(seed * 101 + 7);
    sep.push([mean(ROOMT.map(y => fit(net, F, y))), mean(CONTT.map(y => fit(net, F, y)))]);
    for (const c of R.W.chains) {
      const a = ask(R, c.obj, F, pick, r); (c.full ? acc.join : acc.half).push({ ...a, right: a.ans === c.room });
      if (c.full) { const d = ask(R, c.cont, F, pick, r); acc.direct.push({ ...d, right: d.ans === c.room }); }
    }
  }
  console.log(`frame fit (mean over seeds): rooms ${f2(mean(sep.map(x => x[0])))}  containers ${f2(mean(sep.map(x => x[1])))}`);
  for (const k of ['join', 'half', 'direct']) { const a = acc[k];
    console.log(`${pick.padEnd(4)} ${k.padEnd(6)} n=${String(a.length).padStart(3)} | right% ${f0(mean(a.map(x => x.right ? 1 : 0)))} | resolved% ${f0(mean(a.map(x => x.ans ? 1 : 0)))} | wrong-confident% ${f0(mean(a.map(x => x.ans && !x.right ? 1 : 0)))} | hops ${mean(a.map(x => x.hops)).toFixed(2)} (1-hop ${f0(mean(a.map(x => x.hops === 1 ? 1 : 0)))}%) | gap heat start ${f2(mean(a.map(x => x.h0)))} end ${f2(mean(a.map(x => x.h)))}`); }
}
