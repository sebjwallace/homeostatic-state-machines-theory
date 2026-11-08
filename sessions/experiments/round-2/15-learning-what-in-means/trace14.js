// POST HOC: trace a few confabulated half-chain answers (mix P = colour-only distractors, 2 links, D 5) to see the path.
process.env.ONLY = 'none';
const fs = require('fs');
let s = fs.readFileSync(__dirname + '/stress.js', 'utf8');
s = s.replace("function ask(R, subj, F, pick, skip, HOPS, r) {", "function ask(R, subj, F, pick, skip, HOPS, r, log) {")
     .replace("h = heatOf(net, F, surfaced);\n  }", "h = heatOf(net, F, surfaced); if (log) log.push({ nties: ties.length, sent: ((a,b)=>toks.slice(a,b+1))(...segOf(toks, q)).join(' '), h: h.toFixed(2) });\n  }");
s += "\nObject.assign(CFG,{L:2,D:5,mix:'P',rev:false}); const R=run(1,{subj:1}), F=frameOf(R.net,'ev:went'), r=rng(9); let n=0;\nfor (const c of R.W.chains) if (!c.full) { const log=[]; const a=ask(R,c.obj,F,'gap',0,4,r,log); console.log(c.path.join('>'),'missing link',c.miss,'-> ans',a.ans); log.forEach(x=>console.log('   ties',x.nties,'|',x.sent,'| heat',x.h)); }\n";
eval(s);
