'use strict';
// Rung tests. Every test builds fresh automata/baselines from a seed.
const { makeRng } = require('../src/rng');
const { Automaton } = require('../src/automaton');
const { CountingModel } = require('./baseline');
const { makeCorpus, ALPHABET, W } = require('./corpus');

const LOG2 = Math.log(2);
const LETTERS = 'abcdefghijklmnopqrstuvwxyz';
const r4 = (x) => Math.round(x * 10000) / 10000;

// ---------------- rung 5: prequential prediction ----------------
function prequential(model, text, onStep) {
  const n = text.length, cut = Math.floor(n * 0.8);
  let all = 0, last = 0;
  for (let i = 0; i < n; i++) {
    const r = model.step(text[i]);
    const bits = typeof r === 'number' ? -Math.log(r) / LOG2 : r.surprise;
    all += bits; if (i >= cut) last += bits;
    if (onStep) onStep(i, bits, r);
  }
  return { full: all / n, final20: last / (n - cut) };
}

function rungPrediction(seed, cfg, corpusLen) {
  const { text } = makeCorpus(seed, corpusLen);
  const out = { seed, chars: text.length, baseline: {} };
  for (const k of [2, 3, 4, 5, 6, 8]) {
    const t0 = Date.now();
    const b = prequential(new CountingModel(k, ALPHABET), text);
    out.baseline['order' + k] = { full: r4(b.full), final20: r4(b.final20), ms: Date.now() - t0 };
  }
  const a = new Automaton(ALPHABET, cfg);
  const windows = [];
  let wb = 0, wh = 0, wr = 0, wn = 0;
  const W_ = 1000;
  const t0 = Date.now();
  const m = prequential(a, text, (i, bits, info) => {
    wb += bits; wh += info.heatSum / Math.max(1, info.chainLen); wn++;
    if (info.recruited >= 0) wr++;
    if (wn === W_ || i === text.length - 1) {
      windows.push({ t: i + 1, bpc: r4(wb / wn), heat: r4(wh / wn), recruits: wr, cells: a.liveCells().length });
      wb = wh = wr = wn = 0;
    }
  });
  out.model = { full: r4(m.full), final20: r4(m.final20), ms: Date.now() - t0, snapshot: a.snapshot() };
  out.windows = windows;
  // best of order-2 / order-3, as the spec defines the baseline
  const k2 = out.baseline.order2, k3 = out.baseline.order3;
  out.baselineChosen = k3.full <= k2.full ? 'order3' : 'order2';
  return { out, automaton: a, text };
}

// autocompletions from half sentences on a trained automaton and baseline
function autocomplete(a, base, prompts) {
  const res = [];
  for (const p of prompts) {
    a.resetState();
    for (const ch of '. ' + p) a.observe(ch);
    const am = a.generate(40, '.');
    let hist = '. ' + p, bm = '';
    for (let i = 0; i < 40; i++) {
      const ch = base.argmax(hist);
      bm += ch; hist += ch;
      if (ch === '.') break;
    }
    res.push({ prompt: p, model: am, baseline: bm });
  }
  return res;
}

// ---------------- rung 1: completion ----------------
// Store N random letter patterns (length L), each shown R times within a stream
// of separators. Cue: (a) first half, (b) full first half with one char
// substituted. Recall: greedy generate the second half. Accuracy = fraction
// of second-half chars correct.
function rungCompletion(seed, cfg) {
  const L = 10, R = 3;
  const rows = [];
  for (const N of [5, 20, 50, 100, 200, 400]) {
    const rng = makeRng(seed * 1000 + N);
    const pats = [];
    for (let i = 0; i < N; i++) { let s = ''; for (let j = 0; j < L; j++) s += rng.pick(LETTERS); pats.push(s); }
    const order = [];
    for (let r = 0; r < R; r++) for (let i = 0; i < N; i++) order.push(i);
    for (let i = order.length - 1; i > 0; i--) { const j = rng.int(i + 1); [order[i], order[j]] = [order[j], order[i]]; }
    const a = new Automaton(ALPHABET, cfg);
    const b = new CountingModel(3, ALPHABET);
    for (const i of order) for (const ch of ' ' + pats[i] + '.') { a.step(ch); b.step(ch); }
    const half = L / 2;
    const score = (cueFn) => {
      let ca = 0, cb = 0, tot = 0;
      for (const p of pats) {
        const cue = ' ' + cueFn(p.slice(0, half));
        a.resetState(); for (const ch of cue) a.observe(ch);
        const ga = a.generate(L - half);
        let hist = cue, gb = '';
        for (let i = 0; i < L - half; i++) { const ch = b.argmax(hist); gb += ch; hist += ch; }
        for (let i = 0; i < L - half; i++) { tot++; if (ga[i] === p[half + i]) ca++; if (gb[i] === p[half + i]) cb++; }
      }
      return { model: r4(ca / tot), baseline3: r4(cb / tot) };
    };
    const clean = score((h) => h);
    const noisy = score((h) => {
      const k = rng.int(half - 1); // corrupt one char, not the last of the cue
      let c; do { c = rng.pick(LETTERS); } while (c === h[k]);
      return h.slice(0, k) + c + h.slice(k + 1);
    });
    rows.push({ patterns: N, cueHalf: clean, cueHalfOneCharCorrupted: noisy, cells: a.liveCells().length });
  }
  return { L, exposures: R, rows };
}

// ---------------- rung 2: sequences sharing a middle ----------------
// Two sequences X+M+Y and Z+M+W share a middle M of length m. After E
// exposures each, cue X+M (and Z+M) and check the predicted next char.
function rungSequences(seed, cfg) {
  const rows = [];
  for (const m of [2, 4, 6, 8]) {
    for (const E of [1, 2, 3, 5, 8, 12]) {
      const rng = makeRng(seed * 7 + m * 100 + E);
      let ok = 0, okB = 0, okB5 = 0, trials = 0;
      for (let trial = 0; trial < 20; trial++) {
        let M = ''; for (let i = 0; i < m; i++) M += rng.pick(LETTERS);
        const letters = LETTERS.split('').filter((c) => !M.includes(c));
        const [x, y, z, w] = [0, 1, 2, 3].map(() => letters.splice(rng.int(letters.length), 1)[0]);
        const s1 = x + M + y, s2 = z + M + w;
        const a = new Automaton(ALPHABET, cfg);
        const b = new CountingModel(3, ALPHABET), b5 = new CountingModel(5, ALPHABET);
        for (let e = 0; e < E; e++) {
          for (const s of rng.chance(0.5) ? [s1, s2] : [s2, s1]) {
            // a little filler so the two sequences are separate episodes
            let f = ' '; for (let i = 0; i < 3; i++) f += rng.pick(LETTERS); f += ' ';
            for (const ch of f + s + '.') { a.step(ch); b.step(ch); b5.step(ch); }
          }
        }
        for (const [s, end] of [[x + M, y], [z + M, w]]) {
          trials++;
          a.resetState(); for (const ch of ' ' + s) a.observe(ch);
          if (a.argmax() === end) ok++;
          if (b.argmax(' ' + s) === end) okB++;
          if (b5.argmax(' ' + s) === end) okB5++;
        }
      }
      rows.push({ middleLen: m, exposures: E, model: r4(ok / trials), baseline3: r4(okB / trials), baseline5: r4(okB5 / trials) });
    }
  }
  return rows;
}

// ---------------- rung 3: noise ----------------
// Train on the corpus (prequential), then freeze learning and score held-out
// sentences clean vs corrupted. Bits are measured on the *original* characters
// only for chars after the corruption point that were not themselves altered,
// so we measure "losing the thread", plus raw bpc over the corrupted stream.
function corrupt(text, rate, rng) {
  let out = '', mask = [];
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (rng.chance(rate)) {
      const kind = rng.int(3);
      if (kind === 0) { out += rng.pick(LETTERS) + c; mask.push(1, 0); }       // insert
      else if (kind === 1) { /* drop */ }
      else { out += rng.pick(LETTERS); mask.push(1); }                          // swap/substitute
    } else { out += c; mask.push(0); }
  }
  return { out, mask };
}
function rungNoise(a, base, seed) {
  const { text } = makeCorpus(seed + 999, 4000); // held-out sentences, same grammar
  const res = [];
  for (const rate of [0, 0.03, 0.06, 0.12]) {
    const rng = makeRng(seed * 31 + Math.round(rate * 1000));
    const { out, mask } = corrupt(text, rate, rng);
    const scoreModel = () => {
      a.resetState();
      let all = 0, clean = 0, nClean = 0;
      for (let i = 0; i < out.length; i++) {
        const p = a.predict(); const bits = -Math.log(p[a.idx.get(out[i])]) / LOG2;
        all += bits; if (!mask[i]) { clean += bits; nClean++; }
        a.observe(out[i]);
      }
      return { bpc: r4(all / out.length), bpcOnUncorruptedChars: r4(clean / nClean) };
    };
    const scoreBase = () => {
      let all = 0, clean = 0, nClean = 0, hist = '';
      for (let i = 0; i < out.length; i++) {
        const p = base.predict(hist); const bits = -Math.log(p[base.idx.get(out[i])]) / LOG2;
        all += bits; if (!mask[i]) { clean += bits; nClean++; }
        hist = (hist + out[i]).slice(-8);
      }
      return { bpc: r4(all / out.length), bpcOnUncorruptedChars: r4(clean / nClean) };
    };
    res.push({ noiseRate: rate, model: scoreModel(), baseline: scoreBase() });
  }
  return res;
}

// ---------------- rung 4: words ----------------
// A word's assembly here is the chain of context cells spelling " word":
// column ' ' (generalist) -> column w[0] in context ' ' -> ... -> column w[L-1]
// in context ' ' + w[0..L-2]. Cells exist only where residual heat recruited
// them, so we record, in exposures of " word" (followed by a non-letter):
//   formedAt     = first exposure at which the whole chain exists
//   frozenAt     = first exposure at which every cell of that chain has F > 0.8
//   completedAt  = first exposure at which " " + first half of the word
//                  (rounded up) is completed correctly by greedy generation
//   ambiguous    = another vocabulary word shares that cue, so completion
//                  cannot be reliably right (e.g. "sa" -> saw / sat)
function rungWords(seed, cfg, corpusLen) {
  const { text, vocab } = makeCorpus(seed, corpusLen);
  const all = [...new Set(Object.values(vocab).flat())];
  const words = ['the', 'she', 'he', 'cat', 'dog', 'saw', 'sat', 'mat', 'ran', 'garden', 'quickly', 'horse', 'shells'];
  const a = new Automaton(ALPHABET, cfg);
  const cue = (w) => w.slice(0, Math.ceil(w.length / 2));
  const track = Object.fromEntries(words.map((w) => [w, {
    exposures: 0, formedAt: null, frozenAt: null, completedAt: null,
    ambiguous: all.some((v) => v !== w && v.startsWith(cue(w))),
  }]));
  const chainFor = (w) => {
    let id = a.gen[a.idx.get(' ')];
    const ids = [id];
    for (const ch of w) {
      const k = a.cells[id].kids.get(a.idx.get(ch));
      if (k === undefined) return null;
      id = k; ids.push(id);
    }
    return ids;
  };
  const completes = (w) => {
    const saved = a.chain, savedPrev = a.prevChain;
    a.resetState(); a.observe('.'); a.observe(' ');
    for (const ch of cue(w)) a.observe(ch);
    const g = a.generate(w.length - cue(w).length + 1);
    a.chain = saved; a.prevChain = savedPrev;
    return g.slice(0, -1) === w.slice(cue(w).length) && !(g.slice(-1) >= 'a' && g.slice(-1) <= 'z');
  };
  const isLetter = (c) => c >= 'a' && c <= 'z';
  for (let i = 0; i < text.length; i++) {
    a.step(text[i]);
    for (const w of words) {
      const L = w.length;
      if (i >= L && text.slice(i - L, i + 1) === ' ' + w && !isLetter(text[i + 1] || '.')) {
        const tr = track[w]; tr.exposures++;
        const ch = chainFor(w);
        if (ch && tr.formedAt === null) tr.formedAt = tr.exposures;
        if (ch && tr.frozenAt === null && ch.slice(1).every((id) => a.cells[id].F > 0.8)) tr.frozenAt = tr.exposures;
        if (tr.completedAt === null && completes(w)) tr.completedAt = tr.exposures;
      }
    }
  }
  return words.map((w) => ({ word: w, cue: ' ' + cue(w), ...track[w] }));
}

// ---------------- rung 6: visible confusion ----------------
function energyOf(a, s) {
  a.resetState(); a.observe('.'); a.observe(' ');
  let bits = 0, misfit = 0;
  for (const ch of s) {
    const p = a.predict();
    const x = a.idx.get(ch);
    bits += -Math.log(p[x]) / LOG2;
    // internal misfit: disagreement between the deepest active cell's
    // prediction and the general column's prediction for what arrived
    const lv = a.lastLevels;
    const deep = lv[lv.length - 1].p[x], gen = lv[Math.min(1, lv.length - 1)].p[x];
    misfit += Math.abs(Math.log(deep / gen)) / LOG2;
    a.observe(ch);
  }
  return { energyBitsPerChar: r4(bits / s.length), internalMisfitPerChar: r4(misfit / s.length) };
}
function rungConfusion(a) {
  const cases = [
    ['seen grammar sentence', 'the cat sat on the mat.'],
    ['fixed sentence', 'she sells sea shells by the sea shore.'],
    ['novel combination of known words', 'the mat ate a happy tree.'],
    ['unseen words', 'zorb quix flem vot grun.'],
    ['random letters', 'xqzjv kwpmy bnfgt.'],
  ];
  return cases.map(([name, s]) => ({ case: name, text: s, ...energyOf(a, s) }));
}

// ---------------- rung 7: thinking without data ----------------
// Run first half of stream; then either (a) a quiet period of internal settling
// or (b) nothing (control). Continue on the second half with learning, and
// compare bpc on the second half. Repeated under a tight capacity, where the
// quiet period's freed capacity could matter.
function rungQuiet(seed, cfg, corpusLen) {
  const { text } = makeCorpus(seed, corpusLen);
  const half = Math.floor(text.length / 2);
  const rows = [];
  for (const capacity of [cfg.capacity || 256, 32]) {
    const res = {};
    for (const quiet of [0, 20]) {
      const a = new Automaton(ALPHABET, { ...cfg, capacity });
      for (let i = 0; i < half; i++) a.step(text[i]);
      const before = a.liveCells().length;
      const s = quiet ? a.settle(quiet) : { merged: 0 };
      let bits = 0, first = 0;
      for (let i = half; i < text.length; i++) {
        const b = a.step(text[i]).surprise; bits += b; if (i < half + 2000) first += b;
      }
      res[quiet ? 'quiet' : 'control'] = { bpcSecondHalf: r4(bits / (text.length - half)), bpcFirst2000After: r4(first / 2000), cellsBefore: before, cellsMerged: s.merged };
    }
    rows.push({ capacity, ...res, improvement: r4(res.control.bpcSecondHalf - res.quiet.bpcSecondHalf) });
  }
  return rows;
}

// ---------------- ablations ----------------
function ablations(seed, cfg, corpusLen) {
  const { text } = makeCorpus(seed, corpusLen);
  const variants = [
    ['default', {}],
    ['no freezing', { freezing: false }],
    ['no heat gate (recruit on every miss)', { heatGate: false }],
    ['no hot-predecessor split (hotSplit 0)', { hotSplit: 0 }],
    ['no splitting at all (extend only)', { split: false }],
    ['recruit threshold 1.0 bit', { recruitBits: 1.0 }],
    ['recruit threshold 2.0 bits', { recruitBits: 2.0 }],
    ['capacity 256/column', { capacity: 256 }],
    ['capacity 32/column', { capacity: 32 }],
    ['capacity 32/column, no freezing', { capacity: 32, freezing: false }],
    ['maxDepth 3 (= order-3 limit)', { maxDepth: 3 }],
  ];
  return variants.map(([name, o]) => {
    const a = new Automaton(ALPHABET, { ...cfg, ...o });
    const m = prequential(a, text);
    return { variant: name, full: r4(m.full), final20: r4(m.final20), cells: a.liveCells().length };
  });
}

module.exports = {
  prequential, rungPrediction, autocomplete, rungCompletion, rungSequences,
  rungNoise, rungWords, rungConfusion, rungQuiet, ablations, W,
};
