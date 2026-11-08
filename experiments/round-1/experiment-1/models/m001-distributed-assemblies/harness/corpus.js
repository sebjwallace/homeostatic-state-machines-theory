'use strict';
// Deterministic toy-English corpus: a small grammar plus a few fixed longer
// sentences that recur occasionally. Everything comes from the seeded PRNG.

const { makeRng } = require('../src/prng');

const LEX = {
  det: ['the', 'a', 'my', 'her', 'his'],
  adj: ['big', 'small', 'red', 'old', 'happy', 'little', 'black'],
  noun: ['cat', 'dog', 'mat', 'bird', 'man', 'girl', 'boy', 'hat', 'tree', 'house', 'fish', 'ball', 'car', 'cake'],
  pron: ['she', 'he', 'they', 'we'],
  vtrans: ['saw', 'had', 'liked', 'found', 'ate', 'took', 'wanted', 'made'],
  vintr: ['sat', 'ran', 'slept', 'sang', 'walked', 'jumped'],
  prep: ['on', 'in', 'under', 'near', 'by', 'with'],
  adv: ['today', 'again', 'there', 'slowly'],
};

const FIXED = [
  'the quick brown fox jumps over the lazy dog.',
  'she sells sea shells by the sea shore.',
  'once upon a time there was a little old house in the woods.',
  'the rain in spain stays mainly in the plain.',
];

// Made-up words that never appear in the training stream (for "novel" probes).
const NOVEL_WORDS = ['zorp', 'kwib', 'flunx', 'vrem', 'gnoth', 'plix', 'yuzd', 'qwal'];

function makeGrammar(rng) {
  const p = rng.pick;
  const np = () => (rng.rand() < 0.35 ? `${p(LEX.det)} ${p(LEX.adj)} ${p(LEX.noun)}` : `${p(LEX.det)} ${p(LEX.noun)}`);
  const subj = () => (rng.rand() < 0.4 ? p(LEX.pron) : np());
  const templates = [
    () => `${subj()} ${p(LEX.vintr)} ${p(LEX.prep)} ${np()}.`,
    () => `${subj()} ${p(LEX.vtrans)} ${np()}.`,
    () => `${subj()} ${p(LEX.vintr)} ${p(LEX.adv)}.`,
    () => `${subj()} ${p(LEX.vtrans)} ${np()} ${p(LEX.prep)} ${np()}.`,
  ];
  return () => p(templates)();
}

// Returns { text, sentences, fixedOffsets } with total length ~ targetLen.
function makeCorpus(seed, targetLen = 40000, fixedRate = 0.06) {
  const rng = makeRng(seed);
  const sentence = makeGrammar(rng);
  const parts = [];
  let len = 0;
  while (len < targetLen) {
    const s = rng.rand() < fixedRate ? rng.pick(FIXED) : sentence();
    parts.push(s);
    len += s.length + 1;
  }
  return { text: parts.join(' ') + ' ', sentences: parts };
}

// Fresh grammar sentences from a different stream (for probes).
function makeSentences(seed, n) {
  const rng = makeRng(seed);
  const sentence = makeGrammar(rng);
  const out = [];
  for (let i = 0; i < n; i++) out.push(sentence());
  return out;
}

function makeNovelSentences(seed, n) {
  const rng = makeRng(seed);
  const out = [];
  for (let i = 0; i < n; i++) {
    const k = 3 + rng.int(3);
    const ws = [];
    for (let j = 0; j < k; j++) ws.push(rng.pick(NOVEL_WORDS));
    out.push(ws.join(' ') + '.');
  }
  return out;
}

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz .';

module.exports = { makeCorpus, makeSentences, makeNovelSentences, FIXED, LEX, ALPHABET };
