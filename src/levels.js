// Level definitions. See docs/architecture.md for the format.
// (Seed content: the content pass replaces and extends this list.)
import { fullDeck, shuffled, rng, rankValue, rankOf } from './cards.js';

// All hexes within `radius` of [cq, cr].
export function hexRange(radius, [cq, cr] = [0, 0]) {
  const out = [];
  for (let q = -radius; q <= radius; q++) {
    for (let r = Math.max(-radius, -q - radius); r <= Math.min(radius, -q + radius); r++) {
      out.push([cq + q, cr + r]);
    }
  }
  return out;
}

// Fixed hands (strings like 'AS 2S'), then `nRandom` tests of `handsPerTest`
// hands dealt from one shuffled deck each.
export function makeTests({ handSize, handsPerTest, fixed = [], nRandom = 4, seed = 1 }) {
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

const without = (cells, fixed) => cells.filter(([q, r]) => !fixed.some((f) => f.at[0] === q && f.at[1] === r));

const L1fixed = [{ at: [-2, 0], kind: 'source', out: 0 }, { at: [2, 0], kind: 'payout' }];
const L2fixed = [{ at: [-2, 1], kind: 'source', out: 0 }, { at: [2, -1], kind: 'payout' }];

export const LEVELS = [
  {
    id: 'opening-night',
    chapter: 1,
    title: 'Opening Night',
    story: [
      'The Stacked Deck has a license, a carpet, and exactly one rule: the house never touches a card twice.',
      'Your first croupier just has to carry every card from the player to the cashier.',
    ],
    brief: 'Pay out every card.',
    handSize: 1,
    floor: without(hexRange(2), L1fixed),
    fixed: L1fixed,
    croupiers: ['pass'],
    pays: () => true,
    tests: makeTests({ handSize: 1, handsPerTest: 8, nRandom: 2, seed: 11 }),
  },
  {
    id: 'house-edge',
    chapter: 1,
    title: 'House Edge',
    story: ['Not everyone wins. Cards that hit the carpet are gone for good.'],
    brief: 'Pay out every 2 and 4. Drop everything else on the floor.',
    handSize: 1,
    floor: without(hexRange(2), L2fixed),
    fixed: L2fixed,
    croupiers: ['pass', 'shoe', 'gather', 'straight', 'cut'],
    pays: (h) => ['2', '4'].includes(rankOf(h[0])),
    tests: makeTests({
      handSize: 1, handsPerTest: 13,
      fixed: [['AS', '2S', '3S', '4S', '5S', '6S', '7S', '8S', '9S', 'TS', 'JS', 'QS', 'KS']],
      nRandom: 3, seed: 12,
    }),
  },
  {
    id: 'even-money',
    chapter: 1,
    title: 'Even Money',
    story: ['A regular wants to bet on evens. Management says yes, if you can tell them apart.'],
    brief: 'Pay out every even card (2 4 6 8 10 Q).',
    handSize: 1,
    floor: without(hexRange(3), [{ at: [-3, 0] }, { at: [3, 0] }]),
    fixed: [{ at: [-3, 0], kind: 'source', out: 0 }, { at: [3, 0], kind: 'payout' }],
    croupiers: ['pass', 'shoe', 'gather', 'straight', 'cut'],
    pays: (h) => rankValue(h[0]) % 2 === 0,
    tests: makeTests({
      handSize: 1, handsPerTest: 26,
      fixed: [['AS', '2S', '3S', '4S', '5S', '6S', '7S', '8S', '9S', 'TS', 'JS', 'QS', 'KS']],
      nRandom: 4, seed: 13,
    }),
  },
];
