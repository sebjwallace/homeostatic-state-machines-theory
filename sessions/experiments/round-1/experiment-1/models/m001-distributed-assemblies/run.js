'use strict';
// node run.js  -> runs every rung, writes results/results.json and viewer.html
const fs = require('fs');
const path = require('path');
const R = require('./harness/rungs');
const { DEFAULTS } = require('./src/automaton');

const T0 = Date.now();
const cfg = {
  seed: 1,
  length: 40000,
  model: {},                                  // DEFAULTS from src/automaton.js
  // variant with backward heat spreading: needed for the high-order rung
  heatSpread: { sigma: 1, nEval: 8, tau: 1.5 },
  window: 1000,
  trackWords: ['the', 'she', 'cat', 'dog', 'saw', 'sat', 'on', 'a', 'quick', 'lazy', 'shells', 'house'],
  traceStart: 30000, traceLen: 400,
  thinkLen: 3000, quietSteps: 20,
};

const log = (...a) => console.log(...a);
const results = { config: { ...cfg, modelParams: { ...DEFAULTS, ...cfg.model } } };

log('rung 5: main stream (prequential bpc) ...');
const main = R.mainStream(cfg);
results.prediction = { chars: main.n, bpc: main.bpc, curve: main.curve, stats: main.s.stats, ms: main.ms };
results.prediction.autocompletions = R.autocompletions(main.s, main.bases);
log('  bpc', JSON.stringify(main.bpc), `(${main.ms} ms)`);

log('rung 5 ablations ...');
const ablations = {};
for (const [name, opts] of [['noSplit (no residual-heat recruitment)', { split: false }], ['heatSpread (sigma=1)', cfg.heatSpread], ['noFreezeOnFail', { freezeOnFail: false }], ['N=16384', { N: 16384 }]]) {
  const r = R.mainStream({ ...cfg, model: { ...cfg.model, ...opts }, traceStart: -1, trackWords: [] });
  ablations[name] = { bpc: r.bpc.model, assemblies: r.s.stats.assemblies, splits: r.s.stats.split, ms: r.ms };
  log('  ', name, JSON.stringify(r.bpc.model));
}
results.prediction.ablations = ablations;

log('rung 5: other seeds (robustness) ...');
results.prediction.otherSeeds = {};
for (const seed of [2, 3]) {
  const r = R.mainStream({ ...cfg, seed, traceStart: -1, trackWords: [] });
  results.prediction.otherSeeds['seed' + seed] = r.bpc;
  log('   seed', seed, JSON.stringify({ model: r.bpc.model, order3: r.bpc.order3 }));
}

log('rung 1: completion ...');
results.completion = R.completion(cfg, main.s);

log('rung 2: sequences ...');
results.sequences = { default: R.sequences(cfg, cfg.model, 'default (sigma=0)'), heatSpread: R.sequences(cfg, { ...cfg.model, ...cfg.heatSpread }, 'heat spreads back (sigma=1)') };

log('rung 3: noise ...');
results.noise = R.noise(cfg, main.s, main.bases);

log('rung 4: words ...');
results.words = main.words;

log('rung 6: visible confusion ...');
results.confusion = R.confusion(cfg, main.s, main.text);
results.confusion.energyCurve = main.curve.map((c) => ({ t: c.t, energy: c.energy, newAssemblies: c.newAssemblies }));

log('rung 7: thinking without data ...');
const cut = Math.floor(main.n * 0.8);
results.thinking = R.thinking(cfg, main.snapshots.at80, main.text, cut);

results.runtimeMs = Date.now() - T0;
fs.mkdirSync(path.join(__dirname, 'results'), { recursive: true });
fs.writeFileSync(path.join(__dirname, 'results', 'results.json'), JSON.stringify(results, null, 1));

// viewer: embed the trace into the template
const tpl = fs.readFileSync(path.join(__dirname, 'src', 'viewer.template.html'), 'utf8');
const data = { N: main.s.N, a: main.s.a, alphabet: main.s.alphabet, fieldOf: Array.from(main.s.fieldOf), trace: main.trace, curve: main.curve, bpc: main.bpc };
fs.writeFileSync(path.join(__dirname, 'viewer.html'), tpl.replace('/*__DATA__*/null', JSON.stringify(data)));

log(`done in ${(results.runtimeMs / 1000).toFixed(1)} s -> results/results.json, viewer.html`);
