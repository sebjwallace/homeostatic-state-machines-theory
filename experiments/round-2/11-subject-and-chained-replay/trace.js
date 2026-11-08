// diagnostic: which replayed steps had subj=K and next=R; per-chain join result. Loads sketch.js internals.
'use strict';
const fs = require('fs');
let s = fs.readFileSync(__dirname + '/sketch.js', 'utf8'); s = s.slice(0, s.lastIndexOf('// ---------- main ----------')).replace(/^'use strict';/m, '');
// wrap step to log (subj, cur, next) during quiet
s = s.replace('function step(net, st, prev, cur, next) {', 'let LOG = null;\nfunction step(net, st, prev, cur, next) { if (LOG) LOG.push([st.subj, prev, cur, next]);');
s = s.replace("if (cond.when === 'after') replayed", "LOG = cond.log ? [] : null; if (cond.when === 'after') replayed");
s = s.replace("W.net = net; return {", "const log = LOG; LOG = null; W.net = net; return { log,");
const M = new Function('require', '__dirname', s + '\nreturn { run, scores, Q, ROOMT, rankStats, mean };')(require, __dirname);
const mode = process.env.MODE || 'cchain', sel = process.env.SEL || 'hot';
let tot = { learnedJ: 0, learnedJright: 0, n: 0, falseK: 0 };
for (const seed of [1, 2, 3, 4, 5]) {
  const R = M.run(seed, { subj: 1, when: 'after', sel, mode, log: 1 }), W = R.W;
  const line = [];
  for (const c of W.chains) {
    const ri = M.ROOMT.indexOf(c.room), sc = M.scores(R.net, M.Q(c.obj), c.obj, 'ev:in', M.ROOMT), rs = M.rankStats(sc.tot, ri);
    const evs = R.log.filter(([sj, , , nx]) => sj === c.obj && nx.startsWith('where:'));
    const viaIn = evs.filter(([, , cur]) => cur === 'ev:in');
    const good = viaIn.filter(([, , , nx]) => nx === c.room).length, bad = viaIn.length - good;
    if (c.full) { tot.n++; if (good) tot.learnedJ++; if (good && rs.right === 1) tot.learnedJright++; }
    else tot.falseK += viaIn.length;
    line.push(`${c.full ? '' : '(half)'}${c.obj.slice(4)}:${rs.right === 1 ? 'R' : rs.right > 0 ? 't' : '-'} subjK·in→R ${good}/wrongroom ${bad}`);
  }
  console.log('seed', seed, line.join(' | '));
  if (seed === 1) { const sub = R.log.filter(([sj]) => sj && sj.startsWith('obj:')).slice(0, 0); }
}
console.log(tot);
// coverage: per full chain, what followed the replayed first fact's C (with subj=K)
for (const sel2 of ['hot', 'all']) { const cnt = {};
for (const seed of [1, 2, 3, 4, 5]) { const R = M.run(seed, { subj: 1, when: 'after', sel: sel2, mode: 'cchain', log: 1 });
  for (const c of R.W.chains.filter(c => c.full)) {
    const after = R.log.filter(([sj, , cur]) => sj === c.obj && cur === c.cont).map(x => x[3]);
    const k = after.length === 0 ? 'C never replayed under subj=K (chain ended/cap or C row not reached)' : after.includes('ev:in') ? 'jumped to second fact at "in"' : after.includes(c.room) ? 'jumped to second fact at room (wrong slot)' : 'C followed by other: ' + after[0].split(':')[0];
    cnt[k] = (cnt[k] || 0) + 1; } }
console.log(sel2, cnt); }
// false links: replay steps with subj = a small object K whose next input is a room other than K's true room
for (const sel2 of ['hot', 'all']) { let f = 0, t = 0, steps = 0, cross = 0;
for (const seed of [1, 2, 3, 4, 5]) { const R = M.run(seed, { subj: 1, when: 'after', sel: sel2, mode: 'cchain', log: 1 }); steps += R.log.length;
  const byObj = new Map(R.W.chains.map(c => [c.obj, c]));
  for (const [sj, , cur, nx] of R.log) { const c = byObj.get(sj); if (!c || !nx.startsWith('where:')) continue; if (c.full && nx === c.room) t++; else { f++; } }
  for (const [sj, , cur, nx] of R.log) if (sj && sj.startsWith('who:') && nx.startsWith('obj:')) cross++; }
console.log(sel2, { replaySteps: steps, subjK_toTrueRoom: t, subjK_toOtherRoom: f, whoSubj_toObj: cross }); }
