'use strict';
// "Counting" baseline from the spec: adaptive order-k character model with
// simple escape/backoff and Laplace smoothing, online and single pass.
//
// Prediction for context of length k:
//   if the order-k context has been seen, p(c) = (n_k(c) + 1) / (N_k + A)  [Laplace]
//   else back off to order k-1, ..., down to order 0 (unigram, Laplace), and
//   finally uniform. This is the plain "use the longest seen context" backoff.
// It is a fair, standard counting model. It is not tuned to lose.

class OrderKBaseline {
  constructor(k, alphabetSize) {
    this.k = k;
    this.A = alphabetSize;
    this.tables = []; // tables[o] : Map(context -> Float64Array counts, last = total)
    for (let o = 0; o <= k; o++) this.tables.push(new Map());
    this.hist = '';
  }

  predict() {
    const A = this.A;
    for (let o = Math.min(this.k, this.hist.length); o >= 0; o--) {
      const ctx = this.hist.slice(this.hist.length - o);
      const row = this.tables[o].get(ctx);
      if (row) {
        const tot = row[A];
        const p = new Float64Array(A);
        for (let c = 0; c < A; c++) p[c] = (row[c] + 1) / (tot + A);
        return p;
      }
    }
    return new Float64Array(A).fill(1 / A);
  }

  learn(cid, ch) {
    const A = this.A;
    for (let o = 0; o <= Math.min(this.k, this.hist.length); o++) {
      const ctx = this.hist.slice(this.hist.length - o);
      let row = this.tables[o].get(ctx);
      if (!row) { row = new Float64Array(A + 1); this.tables[o].set(ctx, row); }
      row[cid] += 1; row[A] += 1;
    }
    this.hist = (this.hist + ch).slice(-this.k);
  }

  observe(ch) { this.hist = (this.hist + ch).slice(-this.k); } // move context without learning
  clone() { const b = new OrderKBaseline(this.k, this.A); b.tables = this.tables.map((m) => new Map([...m].map(([k, v]) => [k, v.slice()]))); b.hist = this.hist; return b; }
}

// A *stronger* counting reference (not required by the spec): interpolated
// Witten-Bell blending of orders 0..K. Reported so that any win of the
// automaton over the spec baseline can be checked against "just counting
// with a longer context and better smoothing".
class WittenBellReference {
  constructor(K, alphabetSize) {
    this.K = K; this.A = alphabetSize;
    this.tables = [];
    for (let o = 0; o <= K; o++) this.tables.push(new Map());
    this.hist = '';
  }
  predict() {
    const A = this.A;
    let p = new Float64Array(A).fill(1 / A);
    for (let o = 0; o <= Math.min(this.K, this.hist.length); o++) {
      const ctx = this.hist.slice(this.hist.length - o);
      const row = this.tables[o].get(ctx);
      if (!row) break;
      const n = row[A], d = row[A + 1];
      const q = new Float64Array(A);
      for (let c = 0; c < A; c++) q[c] = (row[c] + d * p[c]) / (n + d);
      p = q;
    }
    return p;
  }
  learn(cid, ch) {
    const A = this.A;
    for (let o = 0; o <= Math.min(this.K, this.hist.length); o++) {
      const ctx = this.hist.slice(this.hist.length - o);
      let row = this.tables[o].get(ctx);
      if (!row) { row = new Float64Array(A + 2); this.tables[o].set(ctx, row); }
      if (row[cid] === 0) row[A + 1] += 1; // distinct followers
      row[cid] += 1; row[A] += 1;
    }
    this.hist = (this.hist + ch).slice(-this.K);
  }

  observe(ch) { this.hist = (this.hist + ch).slice(-this.K); }
  clone() { const b = new WittenBellReference(this.K, this.A); b.tables = this.tables.map((m) => new Map([...m].map(([k, v]) => [k, v.slice()]))); b.hist = this.hist; return b; }
}

module.exports = { OrderKBaseline, WittenBellReference };
