// Sketch 12 diagnostic: at each content-cue hop where cur = C of a full chain and subj = K, which candidate did replay pick?
'use strict';
const fs = require('fs');
let s = fs.readFileSync(__dirname + '/sketch.js', 'utf8'); s = s.slice(0, s.lastIndexOf('// ---------- main ----------')).replace(/^'use strict';/m, '');
s = s.replace('function step(net, st, prev, cur, next) {', 'let LOG = null, HOPS = null;\nfunction step(net, st, prev, cur, next) { if (LOG) LOG.push([st.subj, prev, cur, next]);');
s = s.replace("return contentChain(net, W, ledger, from, to, sel, mode, r);", "return contentChain(net, W, ledger, from, to, sel, mode, r, HOPS);");
s = s.replace("const next = toks[nx]; step(", "if (HOPS && isContent(cur)) HOPS.hops.push([st.subj, cur, nx, p]); const next = toks[nx]; step(");
s = s.replace("if (cond.when === 'after') replayed", "LOG = cond.log ? [] : null; HOPS = cond.log ? Object.assign([], { hops: [] }) : null; if (cond.when === 'after') replayed");
s = s.replace("W.net = net; return {", "const log = LOG, hops = HOPS && HOPS.hops; LOG = null; HOPS = null; W.net = net; return { log, hops,");
const M = new Function('require', '__dirname', s + '\nreturn { run, scores, Q, ROOMT, rankStats, mean };')(require, __dirname);
for (const [mode, sel, sm] of (process.env.M ? [[process.env.M, 'hot', process.env.SM]] : [['cchain', 'hot'], ['cchain', 'all'], ['echain', 'hot'], ['echain', 'all'], ['echainP', 'hot'], ['echain', 'hot', 'noisy'], ['cchain', 'hot', 'noisy'], ['echainX', 'hot'], ['echainX', 'all'], ['echainX', 'hot', 'noisy'], ['echainX', 'hot', 'last'], ['cchain', 'hot', 'last']])) {
  const cnt = { rightHop: 0, roomSlot: 0, sameDayNext: 0, sameDayPlus2: 0, otherRow: 0, noHopUnderK: 0 }; let learned = 0, learnedRight = 0, falseRoom = 0, trueRoom = 0, whoObj = 0, steps = 0;
  for (const seed of [1, 2, 3, 4, 5]) {
    const R = M.run(seed, { subj: 1, sm, when: 'after', sel, mode, log: 1 }), W = R.W, toks = W.toks; steps += R.log.length;
    for (const c of W.chains.filter(c => c.full)) {
      const f2in = toks.findIndex((t, i) => t === 'ev:in' && toks[i - 1] === c.cont && i > toks.indexOf(c.obj) + 2); // p of the ev:in row of fact 2
      const hs = R.hops.filter(([sj, cur]) => sj === c.obj && cur === c.cont);
      let k = 'noHopUnderK';
      if (hs.some(h => h[2] === f2in)) k = 'rightHop'; else if (hs.some(h => h[2] === f2in + 1)) k = 'roomSlot'; else if (hs.some(h => h[2] === h[3] + 1)) k = 'sameDayNext'; else if (hs.some(h => h[2] === h[3] + 2)) k = 'sameDayPlus2'; else if (hs.length) k = 'otherRow';
      cnt[k]++;
      const good = R.log.some(([sj, , cur, nx]) => sj === c.obj && cur === 'ev:in' && nx === c.room); const rs = M.rankStats(M.scores(R.net, M.Q(c.obj), c.obj, 'ev:in', M.ROOMT).tot, M.ROOMT.indexOf(c.room));
      if (good) { learned++; if (rs.right === 1) learnedRight++; } }
    const byObj = new Map(W.chains.map(c => [c.obj, c]));
    for (const [sj, , cur, nx] of R.log) { const c = byObj.get(sj); if (sj && sj.startsWith('who:') && nx.startsWith('obj:')) whoObj++; if (!c || !nx.startsWith('where:')) continue; if (c.full && nx === c.room) trueRoom++; else falseRoom++; }
  }
  console.log(`${(sm || 'first').padEnd(5)} ${mode.padEnd(7)} ${sel} | hop from C under subj=K (60 chains):`, cnt, `| subjK·in→R learned ${learned}, of which answered right ${learnedRight} | replay steps ${steps}: subjK→trueRoom ${trueRoom}, subjK→otherRoom ${falseRoom}, whoSubj→obj ${whoObj}`);
}
