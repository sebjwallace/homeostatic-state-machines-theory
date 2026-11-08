'use strict';
// Test runners for the first rungs of the ladder. Every prediction is made
// before the automaton (or the baseline) learns from the character.

const A_ = require('../src/automaton');
const { makeRng } = require('../src/prng');
const { OrderKBaseline, WittenBellReference } = require('./baseline');
const { makeCorpus, makeSentences, makeNovelSentences, FIXED, ALPHABET } = require('./corpus');

const A = ALPHABET.length;
const cid = (ch) => ALPHABET.indexOf(ch);
const log2 = (x) => Math.log(x) / Math.LN2;
const r3 = (x) => Math.round(x * 1000) / 1000;

// ------------------------------------------------------------ rung 5 (main stream)
// Runs the automaton and the baselines side by side over the whole stream.
// Also tracks word stability (rung 4), energy over time (rung 6), and records
// a trace for the viewer.
function mainStream(cfg) {
  const { text } = makeCorpus(cfg.seed, cfg.length);
  const n = text.length, cut = Math.floor(n * 0.8);
  const s = A_.createAutomaton(ALPHABET, cfg.seed, cfg.model);
  const bases = { order2: new OrderKBaseline(2, A), order3: new OrderKBaseline(3, A), wittenBell5_reference: new WittenBellReference(5, A) };
  const loss = { model: [0, 0] }; for (const k in bases) loss[k] = [0, 0];
  const win = cfg.window, curve = [];
  let wAcc = null;
  const resetW = () => { wAcc = { model: 0, order2: 0, order3: 0, wittenBell5_reference: 0, energy: 0, splits: 0, newAssemblies: 0, n: 0 }; };
  resetW();
  const words = wordTrackerInit(cfg.trackWords);
  const trace = { start: cfg.traceStart, steps: [] };
  let snapshots = {};
  const t0 = Date.now();
  let asmBefore = 0;
  for (let t = 0; t < n; t++) {
    const ch = text[t], c = cid(ch);
    if (t === cfg.traceStart) trace.init = snapshotCells(s);
    if (t === cut) snapshots.at80 = structuredClone(s);
    const P = A_.predict(s);
    const lm = -log2(P.p[c]);
    loss.model[0] += lm; if (t >= cut) loss.model[1] += lm;
    wAcc.model += lm;
    for (const k in bases) {
      const q = bases[k].predict(); const l = -log2(q[c]);
      loss[k][0] += l; if (t >= cut) loss[k][1] += l; wAcc[k] += l;
      bases[k].learn(c, ch);
    }
    asmBefore = s.stats.assemblies;
    const info = A_.step(s, c, true, P.pr);
    wAcc.energy += info.energy; wAcc.splits += info.split ? 1 : 0; wAcc.newAssemblies += s.stats.assemblies - asmBefore; wAcc.n++;
    wordTrackerStep(words, s, text, t, info);
    if (t >= cfg.traceStart && t < cfg.traceStart + cfg.traceLen) {
      const touched = new Set([...(info.winners || []), ...((info.judgedCells) || [])]);
      for (const j of trace.prevW || []) touched.add(j);
      const cells = [];
      for (const j of touched) cells.push([j, q9(s.heat[j]), q9(A_.cellFrozenOne(s, j)), s.usage[j] > 0 ? 1 : 0]);
      let top = -1, tp = 0; for (let x = 0; x < A; x++) if (P.p[x] > tp) { tp = P.p[x]; top = x; }
      trace.steps.push({ ch, e: r3(info.energy), m: info.mode[0], w: info.winners, sp: info.split ? 1 : 0, j: info.judged ? info.judged[0] : 0, pc: r3(P.p[c]), top: ALPHABET[top], cells });
      trace.prevW = info.winners;
    }
    if (wAcc.n === win || t === n - 1) {
      curve.push({ t: t + 1, model: r3(wAcc.model / wAcc.n), order2: r3(wAcc.order2 / wAcc.n), order3: r3(wAcc.order3 / wAcc.n), wittenBell5_reference: r3(wAcc.wittenBell5_reference / wAcc.n), energy: r3(wAcc.energy / wAcc.n), splits: wAcc.splits, newAssemblies: wAcc.newAssemblies });
      resetW();
    }
  }
  delete trace.prevW;
  const ms = Date.now() - t0;
  const bpc = {};
  for (const k in loss) bpc[k] = { full: r3(loss[k][0] / n), final20: r3(loss[k][1] / (n - cut)) };
  return { s, bases, text, bpc, curve, words: wordTrackerReport(words), trace, ms, n, snapshots };
}

function q9(x) { return Math.max(0, Math.min(9, Math.round(x * 9))); }
function snapshotCells(s) {
  const f = A_.cellFrozen(s);
  let heat = '', frozen = '', used = '';
  for (let j = 0; j < s.N; j++) { heat += q9(s.heat[j]); frozen += q9(f[j]); used += s.usage[j] > 0 ? 1 : 0; }
  return { heat, frozen, used };
}

// ------------------------------------------------------------ rung 4 (words)
// For each tracked word, every time it occurs (between spaces/full stops) we
// record the chain of assemblies that carried its letters. The word is
// "stable" at the first exposure after which the chain repeats unchanged for 3
// consecutive exposures, and "frozen" at the first exposure where the mean
// frozenness of its internal transitions reaches 0.5.
function wordTrackerInit(list) {
  const w = {};
  for (const word of list) w[word] = { exposures: 0, lastChain: null, sameRun: 0, stableAt: null, frozenAt: null, frozenHistory: [] };
  return { words: w, cur: [], start: 0 };
}
function wordTrackerStep(tr, s, text, t, info) {
  const ch = text[t];
  if (ch === ' ' || ch === '.') {
    const word = text.slice(tr.start, t);
    const rec = tr.words[word];
    if (rec && tr.cur.length === word.length) {
      rec.exposures++;
      const chain = tr.cur.map((x) => x.join(',')).join('|');
      if (chain === rec.lastChain) rec.sameRun++; else rec.sameRun = 0;
      rec.lastChain = chain;
      if (rec.stableAt === null && rec.sameRun >= 3) rec.stableAt = rec.exposures - 3;
      let fz = 0, nT = 0;
      for (let k = 0; k + 1 < tr.cur.length; k++) { fz += A_.meanFrozen(s, tr.cur[k], tr.cur[k + 1]); nT++; }
      const mf = nT ? fz / nT : 0;
      if (rec.exposures <= 40 || rec.exposures % 10 === 0) rec.frozenHistory.push([rec.exposures, r3(mf)]);
      if (rec.frozenAt === null && mf >= 0.5) rec.frozenAt = rec.exposures;
    }
    tr.cur = []; tr.start = t + 1;
  } else tr.cur.push(info.winners);
}
function wordTrackerReport(tr) {
  const out = {};
  for (const [w, r] of Object.entries(tr.words)) out[w] = { exposures: r.exposures, stableAfter: r.stableAt, frozenAfter: r.frozenAt, frozenHistory: r.frozenHistory.slice(0, 20) };
  return out;
}

// ------------------------------------------------------------ rung 1 (completion)
// (a) Patterns of size P stored as assemblies by lateral Hebbian binding in a
//     fresh shared population; cue with a fraction of the cells plus random
//     distractor cells; recall = overlap of the completed pattern with the
//     stored one. Repeated for growing numbers of stored patterns.
// (b) On the trained automaton: cue each formed assembly with half its cells
//     and see whether the lateral synapses restore the rest.
function completion(cfg, trained) {
  const rng = makeRng(cfg.seed + 11);
  const N = cfg.model.N || A_.DEFAULTS.N;
  const P = 40; // pattern size, ~1% of the population
  const rows = [];
  for (const nPat of [100, 1000, 4000, 8000, 16000]) {
    const s = A_.createAutomaton(ALPHABET, cfg.seed, Object.assign({}, cfg.model, { a: P }));
    const pats = [];
    for (let q = 0; q < nPat; q++) {
      const set = new Set(); while (set.size < P) set.add(rng.int(N));
      const cells = [...set].sort((x, y) => x - y);
      for (const i of cells) for (const j of cells) if (i !== j) s.lat[i].add(j);
      pats.push(cells);
    }
    const row = { stored: nPat };
    for (const [label, keep, noise] of [['half', 0.5, 0], ['quarter', 0.25, 0], ['eighth', 0.125, 0], ['half+noise', 0.5, 0.5]]) {
      let acc = 0, exact = 0; const tests = Math.min(nPat, 50);
      for (let q = 0; q < tests; q++) {
        const pat = pats[q];
        const cue = rng.shuffle(pat.slice()).slice(0, Math.round(P * keep));
        for (let z = 0; z < Math.round(P * noise); z++) cue.push(rng.int(N));
        const out = A_.complete(s, cue, -1, 4, P);
        const ps = new Set(pat); let ov = 0; for (const j of out) if (ps.has(j)) ov++;
        acc += ov / P; if (ov === P) exact++;
      }
      row[label] = { meanOverlap: r3(acc / tests), exact: r3(exact / tests) };
    }
    rows.push(row);
  }
  // (b) trained automaton's own assemblies
  const s = trained;
  let tot = 0, ok = 0, amb = 0;
  const seen = new Set();
  const list = [];
  for (const b of s.base) if (b) list.push(b);
  for (const y of Object.values(s.young)) list.push(y.Xn);
  // reconstruct assemblies from the lateral graph: each used cell + its lateral clique in its field
  for (let i = 0; i < s.N && list.length < 400; i++) {
    if (s.usage[i] !== 1 || seen.has(i)) continue; // cells in exactly one assembly identify it
    const cl = [i, ...s.lat[i]].sort((x, y) => x - y);
    if (cl.length !== s.a) continue;
    for (const j of cl) seen.add(j);
    list.push(cl);
  }
  for (const asm of list) {
    const cue = asm.slice(0, Math.ceil(asm.length / 2));
    const out = A_.complete(s, cue, s.fieldOf[asm[0]], 3, asm.length);
    tot++;
    if (out.join(',') === asm.join(',')) ok++;
    else amb++;
  }
  return { synthetic: { patternSize: P, population: N, rows }, trainedAssemblies: { tested: tot, exactlyRecalled: ok, recallRate: r3(ok / Math.max(1, tot)), note: 'cue = half of each identifiable assembly (cells used by exactly one assembly), completion restricted to the assembly field' } };
}

// ------------------------------------------------------------ rung 2 (sequences)
function sequences(cfg, modelOpts, label) {
  const s = A_.createAutomaton(ALPHABET, cfg.seed, modelOpts);
  const b3 = new OrderKBaseline(3, A);
  const rng = makeRng(cfg.seed + 7);
  const seqs = [['xabcdy', 'y'], ['zabcdw', 'w']];
  const curve = [];
  for (let ep = 1; ep <= 80; ep++) {
    const [w] = rng.pick(seqs);
    for (const ch of w + ' ') { const P = A_.predict(s); A_.step(s, cid(ch), true, P.pr); b3.learn(cid(ch), ch); }
    if (ep % 10 === 0) {
      const row = { exposures: ep };
      for (const [w, end] of seqs) {
        const c = structuredClone(s); A_.reset(c);
        A_.step(c, cid(' '), false);
        for (const ch of w.slice(0, 5)) A_.step(c, cid(ch), false);
        const p = A_.predict(c).p;
        const bb = b3.clone(); bb.hist = w.slice(2, 5);
        const q = bb.predict();
        row[w] = { model_pCorrect: r3(p[cid(end)]), baseline3_pCorrect: r3(q[cid(end)]) };
      }
      curve.push(row);
    }
  }
  // replay: from the first character, greedily generate
  const replay = {};
  for (const [w] of seqs) {
    const c = structuredClone(s); A_.reset(c);
    A_.step(c, cid(' '), false); A_.step(c, cid(w[0]), false);
    let out = w[0];
    for (let k = 0; k < 6; k++) { const p = A_.predict(c).p; let best = 0; for (let x = 1; x < A; x++) if (p[x] > p[best]) best = x; out += ALPHABET[best]; A_.step(c, best, false); }
    replay[w] = out;
  }
  return { label, curve, replay, stats: s.stats };
}

// ------------------------------------------------------------ rung 3 (noise)
// Frozen evaluation (no learning) of the trained automaton and baselines on
// fresh grammar sentences, clean vs corrupted (insert / drop / swap at a given
// rate). Reported: bpc over all chars, and over the 1-4 clean chars that
// follow each corruption (recovery).
function noise(cfg, trained, bases) {
  const sents = makeSentences(cfg.seed + 101, 150);
  const clean = sents.join(' ') + ' ';
  const rng = makeRng(cfg.seed + 202);
  const out = {};
  for (const rate of [0, 0.05, 0.1]) {
    let txt = '', after = [];
    let since = 99;
    for (let i = 0; i < clean.length; i++) {
      const ch = clean[i];
      if (rate > 0 && rng.rand() < rate) {
        const kind = rng.int(3);
        if (kind === 0) { txt += ALPHABET[rng.int(26)]; after.push(-1); txt += ch; after.push(0); since = 0; continue; }
        if (kind === 1) { since = 0; continue; }
        if (kind === 2 && i + 1 < clean.length) { txt += clean[i + 1] + ch; after.push(-1, -1); i++; since = 0; continue; }
      }
      since++; txt += ch; after.push(since);
    }
    const res = { chars: txt.length };
    const evalOne = (predictFn, stepFn) => {
      let all = 0, rec = 0, nrec = 0;
      for (let i = 0; i < txt.length; i++) {
        const c = cid(txt[i]); const l = -log2(predictFn()[c]);
        all += l; if (after[i] >= 1 && after[i] <= 4) { rec += l; nrec++; }
        stepFn(c, txt[i]);
      }
      return { bpc: r3(all / txt.length), recoveryBpc: nrec ? r3(rec / nrec) : null };
    };
    const m = structuredClone(trained); A_.reset(m);
    res.model = evalOne(() => A_.predict(m).p, (c) => A_.step(m, c, false));
    for (const k of ['order2', 'order3', 'wittenBell5_reference']) {
      const b = bases[k].clone(); b.hist = '';
      res[k] = evalOne(() => b.predict(), (c, ch) => b.observe(ch));
    }
    out['rate_' + rate] = res;
  }
  return out;
}

// ------------------------------------------------------------ rung 5 extras
function greedyComplete(trained, prefix, maxLen = 40) {
  const c = structuredClone(trained); A_.reset(c);
  for (const ch of ' ' + prefix) A_.step(c, cid(ch), false);
  let out = '';
  for (let k = 0; k < maxLen; k++) {
    const p = A_.predict(c).p; let best = 0; for (let x = 1; x < A; x++) if (p[x] > p[best]) best = x;
    out += ALPHABET[best]; A_.step(c, best, false);
    if (ALPHABET[best] === '.') break;
  }
  return out;
}
function greedyBaseline(b0, prefix, maxLen = 40) {
  const b = b0.clone(); b.hist = '';
  for (const ch of ' ' + prefix) b.observe(ch);
  let out = '';
  for (let k = 0; k < maxLen; k++) {
    const p = b.predict(); let best = 0; for (let x = 1; x < A; x++) if (p[x] > p[best]) best = x;
    out += ALPHABET[best]; b.observe(ALPHABET[best]);
    if (ALPHABET[best] === '.') break;
  }
  return out;
}
function autocompletions(trained, bases) {
  const prefixes = ['the quick brown f', 'she sells sea sh', 'once upon a ti', 'the rain in sp', 'the cat sat o', 'she saw a d', 'the little old h'];
  return prefixes.map((p) => ({ prefix: p, model: greedyComplete(trained, p), order3: greedyBaseline(bases.order3, p) }));
}

// ------------------------------------------------------------ rung 6 (visible confusion)
function confusion(cfg, trained, text) {
  const familiar = FIXED.slice();
  const seenGrammar = text.split(/(?<=\.) /).slice(100, 140);
  const novel = makeNovelSentences(cfg.seed + 303, 30);
  const meanEnergy = (sents) => {
    const c = structuredClone(trained); A_.reset(c); A_.step(c, cid(' '), false);
    let e = 0, n = 0;
    for (const snt of sents) for (const ch of snt + ' ') { const P = A_.predict(c); e += A_.step(c, cid(ch), false, P.pr).energy; n++; }
    return r3(e / n);
  };
  // learning a novel sentence by repetition: energy per repetition
  const c = structuredClone(trained); A_.reset(c);
  const rep = [];
  const ns = novel[0];
  for (let r = 0; r < 12; r++) {
    let e = 0, n = 0;
    for (const ch of ' ' + ns) { const P = A_.predict(c); e += A_.step(c, cid(ch), true, P.pr).energy; n++; }
    rep.push(r3(e / n));
  }
  return { familiarFixed: meanEnergy(familiar), seenGrammar: meanEnergy(seenGrammar), novelWords: meanEnergy(novel), novelSentence: ns, energyPerRepetitionOfNovelSentence: rep };
}

// ------------------------------------------------------------ rung 7 (thinking without data)
// Take the automaton at a point in the stream; continue it two ways from the
// same state: (control) straight on, (quiet) after Q quiet steps with no
// input. Compare bpc on the next chars. Same seed, same text.
function meanHeatAll(s) { let h = 0, n = 0; for (let j = 0; j < s.N; j++) if (s.usage[j] > 0) { h += s.heat[j]; n++; } return n ? h / n : 0; }
function thinking(cfg, snapshot, text, from) {
  const L = cfg.thinkLen;
  const seg = text.slice(from, from + L);
  const runOn = (s) => {
    let l = 0;
    for (const ch of seg) { const c = cid(ch); const P = A_.predict(s); l += -log2(P.p[c]); A_.step(s, c, true, P.pr); }
    return r3(l / seg.length);
  };
  const ctrl = structuredClone(snapshot);
  const qu = structuredClone(snapshot);
  const qh = structuredClone(snapshot);
  const pending = Object.keys(qu.young).length;
  const heatBefore = meanHeatAll(qu);
  const judged = A_.quiet(qu, cfg.quietSteps, true);
  A_.quiet(qh, cfg.quietSteps, false);
  return {
    from, chars: seg.length, quietSteps: cfg.quietSteps, pendingYoungStates: pending, judgedDuringQuiet: judged,
    meanHeatBefore: r3(heatBefore), meanHeatAfter: r3(meanHeatAll(qh)),
    bpcControl: runOn(ctrl), bpcAfterQuiet_judgeYoung: runOn(qu), bpcAfterQuiet_heatOnly: runOn(qh),
  };
}

module.exports = { mainStream, completion, sequences, noise, autocompletions, confusion, thinking };
