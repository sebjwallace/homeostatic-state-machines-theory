'use strict';
// "Counting" baseline: adaptive order-k character model, online, single pass.
// Interpolated escape (Witten-Bell style: escape mass = distinct/(n+distinct))
// backing off down to order 0, which is Laplace-smoothed over the alphabet.
// This is a standard, reasonably strong counting model; it is not weakened.

class CountingModel {
  constructor(k, alphabet) {
    this.k = k;
    this.alphabet = alphabet;
    this.A = alphabet.length;
    this.idx = new Map([...alphabet].map((c, i) => [c, i]));
    this.ctx = new Map(); // context string -> {c: Float64Array, n, u}
    this.uni = new Float64Array(this.A);
    this.uniN = 0;
    this.hist = '';
  }
  predict(hist = this.hist) {
    const A = this.A;
    const p = new Float64Array(A);
    for (let i = 0; i < A; i++) p[i] = (this.uni[i] + 1) / (this.uniN + A);
    for (let o = 1; o <= this.k; o++) {
      if (hist.length < o) break;
      const e = this.ctx.get(hist.slice(-o));
      if (!e || e.n === 0) continue;
      const d = e.n + e.u;
      for (let i = 0; i < A; i++) p[i] = (e.c[i] + e.u * p[i]) / d;
    }
    return p;
  }
  update(ch, hist = this.hist) {
    const i = this.idx.get(ch);
    this.uni[i]++; this.uniN++;
    for (let o = 1; o <= this.k; o++) {
      if (hist.length < o) break;
      const key = hist.slice(-o);
      let e = this.ctx.get(key);
      if (!e) { e = { c: new Float64Array(this.A), n: 0, u: 0 }; this.ctx.set(key, e); }
      if (e.c[i] === 0) e.u++;
      e.c[i]++; e.n++;
    }
  }
  // Prequential step: returns p(actual) then learns.
  step(ch, learn = true) {
    const p = this.predict();
    const pa = p[this.idx.get(ch)];
    if (learn) this.update(ch);
    this.hist = (this.hist + ch).slice(-Math.max(this.k, 1));
    return pa;
  }
  argmax(hist = this.hist) {
    const p = this.predict(hist);
    let b = 0;
    for (let i = 1; i < this.A; i++) if (p[i] > p[b]) b = i;
    return this.alphabet[b];
  }
}

module.exports = { CountingModel };
