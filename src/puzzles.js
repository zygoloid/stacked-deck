import { fullDeck, shuffled, rng, rankOf, largestSet, rankValue } from './cards.js';

// A test is a list of input hands dealt from one shuffled deck.
function dealTests(handSize, handsPerTest, fixed, nRandom, seed) {
  const rand = rng(seed);
  const tests = fixed.map((t) => t.map((h) => h.split(' ')));
  for (let i = 0; i < nRandom; i++) {
    const deck = shuffled(fullDeck(), rand);
    const t = [];
    for (let j = 0; j < handsPerTest; j++) t.push(deck.slice(j * handSize, (j + 1) * handSize));
    tests.push(t);
  }
  return tests;
}

export const PUZZLES = {
  even: {
    title: 'Even money',
    brief: 'Single cards. Pay out every even card (2 4 6 8 10 Q); scratch the rest.',
    pays: (h) => rankValue(h[0]) % 2 === 0,
    tests: dealTests(1, 26, [
      ['AS', '2S', '3S', '4S', '5S', '6S', '7S', '8S', '9S', 'TS', 'JS', 'QS', 'KS'],
      ['2H', '2D', 'AH', '3H', '4H', '5H', '6H', '7H', '8H', '9H', 'TH', 'JH', 'QH', 'KH'],
    ].map((t) => t.map((c) => c)), 6, 1),
  },
  ace: {
    title: 'Ace in the hole',
    brief: 'Five-card hands. Pay out every hand containing an ace.',
    pays: (h) => h.some((c) => rankOf(c) === 'A'),
    tests: dealTests(5, 10, [
      ['AS 2S 3S 4S 5S', 'KS KD KC KH QS', 'AH KH QH JH TH', 'AH AD AC AS 2C', '2D 3D 4D 5D 7C'],
    ], 6, 2),
  },
  record: {
    title: 'House record',
    brief: 'Five-card hands. Pay out every hand whose largest set ties or beats every earlier hand.',
    pays: (h, before) => before.every((b) => largestSet(h) >= largestSet(b)),
    tests: dealTests(5, 10, [
      ['2S 3S 4S 5S 7S', 'AS AD 3C 4C 5C', '9S 8S 7S 6S 4D', 'KS KD QS QD 2H',
        'TS TD TC 2C 3C', 'JS JD 4H 5H 6H', '8D 8C 8H 9C 9H', 'QC QH 6D 6C 7D'],
    ], 6, 3),
  },
};
