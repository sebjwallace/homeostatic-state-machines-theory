'use strict';
// Seeded PRNG (mulberry32). State is a single uint32 so it can live inside
// cloneable plain data. All randomness in the experiment comes from here.

function nextU32(state) {
  let t = (state + 0x6d2b79f5) >>> 0;
  let r = Math.imul(t ^ (t >>> 15), 1 | t);
  r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
  return { state: t, value: ((r ^ (r >>> 14)) >>> 0) };
}

// A tiny object-style RNG for code that does not need cloning.
function makeRng(seed) {
  let state = seed >>> 0;
  const rand = () => {
    const o = nextU32(state);
    state = o.state;
    return o.value / 4294967296;
  };
  return {
    rand,
    int: (n) => Math.floor(rand() * n),
    pick: (arr) => arr[Math.floor(rand() * arr.length)],
    shuffle(arr) {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
      }
      return arr;
    },
  };
}

// RNG whose state lives in a plain object field (holder.rng), so that a
// structuredClone of the holder continues the exact same random sequence.
function randIn(holder) {
  const o = nextU32(holder.rng);
  holder.rng = o.state;
  return o.value / 4294967296;
}

module.exports = { makeRng, randIn };
