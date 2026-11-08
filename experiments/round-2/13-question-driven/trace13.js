// Sketch 13 diagnostic: why do forward-world, forward-trial join questions fail? Prints hop paths for failures (seed 1).
'use strict';
const fs = require('fs');
let s = fs.readFileSync(__dirname + '/qa.js', 'utf8'); s = s.slice(0, s.indexOf("const f0 =")).replace(/^'use strict';/m, '');
s = s.replace("visited.add(q); got.forEach", "if (LOG) LOG.push([q, toks.slice(Math.max(0,q-2), q+TRIAL).join(' '), got.join(','), ties.length, cands.length]); visited.add(q); got.forEach");
const T = new Function('require', '__dirname', 'let LOG=null;\n' + s + '\nreturn { run, frameOf, ask, rng, setLog: (x) => { LOG = x; } };')(require, __dirname);
for (const seed of [1, 2]) { const R = T.run(seed, { subj: 1 }), F = T.frameOf(R.net, 'ev:went'), r = T.rng(seed * 101 + 7), toks = R.W.toks;
  for (const c of R.W.chains.filter(c => c.full)) { const log = []; T.setLog(log); const a = T.ask(R, c.obj, F, 'gap', r); T.setLog(null);
    const f2 = toks.findIndex((t, i) => t === c.cont && toks[i + 1] === 'ev:in' && toks[i + 2] === c.room);
    console.log(a.ans === c.room ? 'OK  ' : 'FAIL', c.obj, c.cont, c.room, 'f2 at', f2, 'h', a.h.toFixed(2), '\n    ' + log.map(l => JSON.stringify(l)).join('\n    ')); } }
