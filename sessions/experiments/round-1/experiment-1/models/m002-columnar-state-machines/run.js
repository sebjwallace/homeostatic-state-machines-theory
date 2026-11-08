'use strict';
// node run.js  -> runs every rung, writes results/results.json and viewer.html
const fs = require('fs');
const path = require('path');
const { Automaton } = require('./src/automaton');
const { CountingModel } = require('./harness/baseline');
const { makeCorpus, ALPHABET } = require('./harness/corpus');
const T = require('./harness/tests');

const SEED = 1;
const CORPUS_LEN = 40000;
const CFG = { capacity: 512, recruitBits: 0.5, hotSplit: 0.4 };
const T0 = Date.now();
const log = (...a) => console.log(`[${((Date.now() - T0) / 1000).toFixed(1)}s]`, ...a);

const results = { model: 'm002-columnar-state-machines', seed: SEED, corpusLen: CORPUS_LEN, config: CFG };

// ---- rung 5 first: it also produces the trained automaton used by rungs 3, 6
log('rung 5: prequential prediction');
const pred = T.rungPrediction(SEED, CFG, CORPUS_LEN);
results.prediction = pred.out;
const seeds = [2, 3, 4];
results.predictionOtherSeeds = seeds.map((s) => {
  const o = T.rungPrediction(s, CFG, CORPUS_LEN).out;
  return { seed: s, model: { full: o.model.full, final20: o.model.final20 }, order2: o.baseline.order2, order3: o.baseline.order3, order5: o.baseline.order5, order6: o.baseline.order6, order8: o.baseline.order8 };
});
const base3 = new CountingModel(3, ALPHABET);
for (const ch of pred.text) base3.step(ch);
results.autocomplete = T.autocomplete(pred.automaton, base3, [
  'the cat sat ', 'she ate ', 'the quick brown ', 'once upon a ', 'all the birds sang ', 'tom ran to ', 'she sells sea ',
]);

log('rung 1: completion');
results.completion = T.rungCompletion(SEED, CFG);
log('rung 2: sequences with shared middle');
results.sequences = T.rungSequences(SEED, CFG);
log('rung 3: noise');
results.noise = T.rungNoise(pred.automaton, base3, SEED);
log('rung 4: words');
results.words = T.rungWords(SEED, CFG, CORPUS_LEN);
log('rung 6: visible confusion');
results.confusion = T.rungConfusion(pred.automaton);
log('rung 7: thinking without data (quiet period)');
results.quiet = T.rungQuiet(SEED, CFG, CORPUS_LEN);
log('ablations');
results.ablations = T.ablations(SEED, CFG, CORPUS_LEN);

// ---- viewer trace: a stretch of a fresh run, recorded step by step
log('recording viewer trace');
{
  const { text } = makeCorpus(SEED, CORPUS_LEN);
  const a = new Automaton(ALPHABET, CFG);
  const START = 6000, LEN = 400;
  const frames = [];
  const prevCols = [];
  for (let i = 0; i < START + LEN; i++) {
    const rec = i >= START;
    const p = rec ? Array.from(a.predict()) : null;
    const chainBefore = rec ? a.chain.slice() : null;
    const info = a.step(text[i]);
    if (!rec) continue;
    const top = p.map((v, j) => [ALPHABET[j], v]).sort((x, y) => y[1] - x[1]).slice(0, 4).map(([c, v]) => [c, Math.round(v * 100) / 100]);
    // Delta-encoded cell picture: only columns/cells that changed are stored
    // (a column whose cell list changed is stored whole).
    const colDelta = [];
    for (let c = 0; c < ALPHABET.length; c++) {
      const ids = a.colCells[c];
      const q = ids.map((id) => { const x = a.cells[id]; return [Math.round(Math.min(2, x.h) * 25), Math.round(x.F * 10)]; });
      const pv = prevCols[c];
      if (!pv || pv.ids.length !== ids.length || pv.ids.some((id, k) => id !== ids[k])) {
        colDelta.push([c, 'all', q.flat()]);
      } else {
        const ch = [];
        q.forEach(([h, F], k) => { if (pv.q[k][0] !== h || pv.q[k][1] !== F) ch.push(k, h, F); });
        if (ch.length) colDelta.push([c, 'chg', ch]);
      }
      prevCols[c] = { ids: ids.slice(), q };
    }
    const held = Array.from(a.colState, (id, c) => (id >= 0 ? a.colCells[c].indexOf(id) : -1));
    frames.push({
      t: i, ch: text[i], bits: Math.round(info.surprise * 100) / 100,
      heat: Math.round((info.heatSum / Math.max(1, info.chainLen)) * 100) / 100,
      top, recruited: info.recruited >= 0 ? a.label(info.recruited) : null,
      active: a.chain.filter((id) => a.cells[id].col >= 0).map((id) => {
        const x = a.cells[id]; return { col: x.col, k: a.colCells[x.col].indexOf(id), label: a.label(id), h: Math.round(x.h * 100) / 100, F: Math.round(x.F * 100) / 100 };
      }),
      prevDepth: chainBefore.length - 1,
      d: colDelta, held,
    });
  }
  const trace = { alphabet: ALPHABET, start: START, text: text.slice(START, START + LEN), frames, windows: pred.out.windows, baselineWindows: null };
  const tpl = fs.readFileSync(path.join(__dirname, 'harness', 'viewer.template.html'), 'utf8');
  fs.writeFileSync(path.join(__dirname, 'viewer.html'), tpl.replace('/*__TRACE__*/null', JSON.stringify(trace)));
}

results.runtimeSeconds = Math.round((Date.now() - T0) / 100) / 10;
fs.mkdirSync(path.join(__dirname, 'results'), { recursive: true });
fs.writeFileSync(path.join(__dirname, 'results', 'results.json'), JSON.stringify(results, null, 2));

// ---- console summary
const P = results.prediction;
const bc = P.baseline[P.baselineChosen];
log(`bpc model full=${P.model.full} final20=${P.model.final20} | baseline(${P.baselineChosen}) full=${bc.full} final20=${bc.final20} | order5 full=${P.baseline.order5.full} final20=${P.baseline.order5.final20}`);
log('done; wrote results/results.json and viewer.html');
