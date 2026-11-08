'use strict';
// Deterministic corpus: a small grammar of simple English sentences with
// selectional preferences (verbs prefer certain objects), plus a few fixed
// longer sentences repeated occasionally.
const { makeRng } = require('../src/rng');

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz .,';

const W = {
  det: ['the', 'a'],
  adj: ['big', 'small', 'red', 'old', 'happy', 'little', 'brown'],
  animal: ['cat', 'dog', 'bird', 'fox', 'cow', 'mouse', 'horse'],
  thing: ['mat', 'box', 'hat', 'log', 'bed', 'rug', 'ball', 'cup'],
  food: ['fish', 'cake', 'bread', 'apple'],
  place: ['tree', 'house', 'garden', 'barn'],
  name: ['tom', 'ann', 'max', 'sue'],
  pron: ['she', 'he'],
  vSit: ['sat', 'slept', 'stood'],
  vMove: ['ran', 'jumped', 'walked'],
  vSee: ['saw', 'liked', 'chased', 'found'],
  vEat: ['ate', 'wanted'],
  prepRest: ['on', 'under', 'near'],
  prepMove: ['to', 'into', 'past'],
  adv: ['quickly', 'slowly', 'today', 'again'],
};

const FIXED = [
  'the quick brown fox jumps over the lazy dog.',
  'once upon a time there was a little old house by the sea.',
  'all the birds sang in the trees at dawn, and then they slept.',
  'she sells sea shells by the sea shore.',
];

function makeCorpus(seed, targetLen = 40000) {
  const r = makeRng(seed);
  const np = (cls) => {
    const parts = [r.pick(W.det)];
    if (r.chance(0.3)) parts.push(r.pick(W.adj));
    parts.push(r.pick(W[cls]));
    return parts.join(' ');
  };
  const subj = () => {
    const x = r.next();
    if (x < 0.25) return r.pick(W.pron);
    if (x < 0.4) return r.pick(W.name);
    return np('animal');
  };
  const templates = [
    () => `${subj()} ${r.pick(W.vSit)} ${r.pick(W.prepRest)} ${np('thing')}.`,
    () => `${subj()} ${r.pick(W.vSee)} ${np('animal')}.`,
    () => `${subj()} ${r.pick(W.vEat)} ${np('food')}.`,
    () => `${subj()} ${r.pick(W.vMove)} ${r.pick(W.prepMove)} ${np('place')}.`,
    () => `${subj()} ${r.pick(W.vMove)} ${r.pick(W.adv)}.`,
    () => `${subj()} ${r.pick(W.vSee)} ${np('animal')} ${r.pick(W.prepRest)} ${np('thing')}.`,
  ];
  const sentences = [];
  let len = 0;
  while (len < targetLen) {
    const s = r.chance(0.06) ? r.pick(FIXED) : r.pick(templates)();
    sentences.push(s);
    len += s.length + 1;
  }
  const text = sentences.join(' ') + ' ';
  return { text, sentences, vocab: W, fixed: FIXED };
}

module.exports = { makeCorpus, ALPHABET, W, FIXED };
