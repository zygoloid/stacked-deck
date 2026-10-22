// Chapter 3 (clubs): House Rules. See docs/campaign.md for the plan.
//
// PLACEHOLDER: these are the surviving levels from the 25-level campaign,
// in their planned order, with cards AC.. assigned consecutively. The
// chapter-3 builder replaces this file's contents per docs/campaign.md.
import {
  hexRange, hexRect, makeTests, floorOf, source, desk, E, hv, high, spadesOf, paletteThrough, finishChapter,
} from './shared.js';
import { rankOf, rankCounts } from '../cards.js';

const L1 = [source([-3, 0], E), desk([2, 0])];
const L2 = [source([-3, 0], E), desk([2, 0])];
const L3 = [source([-2, 0], E), desk([2, 0])];
const L4 = [source([-3, 0], E), desk([3, 0])];
const L5 = [source([-1, 0], E), desk([-2, -1])];
const L6 = [source([-1, 0], E), desk([-2, -1])];

export const LEVELS = [
  {
    id: 'high-spade',
    chapter: 3,
    card: 'AC',
    title: 'High Spade',
    story: [
      'The Owner\'s calling card is the ace of spades, and on the Owner\'s birthday any hand whose best card is a spade wins. If the best rank is shared, a spade holding it is enough.',
      'A new croupier makes perfect copies of a hand.',
    ],
    brief: 'Five-card hands. Pay out every hand where no card outranks its best spade.',
    handSize: 5,
    floor: floorOf(hexRect(-2, 2, -6, 4), L1),
    fixed: L1,
    croupiers: paletteThrough('duplicate'),
    warRules: ['high'],
    pays: (h) => spadesOf(h).length > 0 && high(spadesOf(h)) >= high(h),
    tests: makeTests({
      handSize: 5, handsPerTest: 10,
      fixed: [
        ['AS 2H 3D 4C 5H', 'KH KS 2D 3C 4D', 'KH QS 2D 3C 4D', '2H 3H 4D 5C 6C', '2S 2H 2D 2C 3H',
          '2S 3H 4D 5C 6S', 'AH AS KS QS JS', 'AD KS QS JS TS', '7S 3H 4D 5C 6D', '9H 8D 7C 6H 5S'],
      ],
      nRandom: 4, seed: 115,
    }),
  },
  {
    id: 'top-pair',
    chapter: 3,
    card: '2C',
    title: 'Top Pair',
    story: [
      'A rival casino has opened two blocks away, and the regulars are wavering. The Owner\'s answer is Top Pair: a hand wins if it holds a pair or better and the highest card is part of its biggest set.',
      'Two pair counts both pairs as the set. A full house counts only the three of a kind. A new croupier pulls out exactly that set.',
    ],
    brief: 'Five-card hands. Pay out every hand with a pair or better whose highest card is part of its largest set.',
    handSize: 5,
    floor: floorOf(hexRect(-2, 2, -6, 4), L2),
    fixed: L2,
    croupiers: paletteThrough('set'),
    warRules: ['high'],
    pays: (h) => {
      const counts = rankCounts(h);
      const max = Math.max(...counts.values());
      return max >= 2 && high(h.filter((c) => counts.get(rankOf(c)) === max)) === high(h);
    },
    tests: makeTests({
      handSize: 5, handsPerTest: 10,
      fixed: [
        ['KS KD 2C 3H 4S', '2S 2D KC 3H 4S', 'AS AD KC KH 2S', 'KS KD AC 2H 2S', 'QS QD 9C 9H KS',
          '9S 9D 9C KH KS', 'KS KD KC 9H 9S', '5S 5D 5C 5H KS', 'AS KD QC JH 9S', 'AS AD AC 4H 2D'],
      ],
      nRandom: 4, seed: 116,
    }),
  },
  {
    id: 'new-rules',
    chapter: 3,
    card: '3C',
    title: 'New Rules',
    story: [
      'The city Gaming Commission has visited. Commissioner Pryce left with a fruit basket, an envelope, and a new regulation: until further notice, War is played by the top card only.',
      'Your War croupiers can still play, but they look only at the first card of each hand.',
    ],
    brief: 'Five-card hands. Pay out every hand whose top card beats a 10. (Top-card War only.)',
    handSize: 5,
    floor: floorOf(hexRange(2), L3),
    fixed: L3,
    croupiers: paletteThrough('set'),
    warRules: ['top'],
    pays: (h) => hv(h[0]) > 10,
    tests: makeTests({
      handSize: 5, handsPerTest: 10,
      fixed: [['TS AS AD AC AH', 'JS 2S 3S 4S 5S', 'AH 2H 3H 4H 5H', '9D KD KC KH KS', 'QC 2C 3C 4C 5C', 'TD JD QD KD AD']],
      nRandom: 4, seed: 117,
    }),
  },
  {
    id: 'bottom-dealer',
    chapter: 3,
    card: '4C',
    title: 'Bottom Dealer',
    story: [
      'The Kessler crew\'s new dealer deals from the bottom of the deck. Rather than fire him, the Owner wants the bottom card paid: a hand wins if its bottom card beats a 10.',
      'Two new croupiers riffle a hand perfectly. An out-shuffle keeps the top card on top; an in-shuffle doesn\'t. Top-card War is still the law.',
    ],
    brief: 'Five-card hands. Pay out every hand whose bottom card beats a 10. (Top-card War only.)',
    handSize: 5,
    floor: floorOf(hexRect(-2, 1, -6, 6), L4),
    fixed: L4,
    croupiers: paletteThrough('inshuffle'),
    warRules: ['top'],
    pays: (h) => hv(h[h.length - 1]) > 10,
    tests: makeTests({
      handSize: 5, handsPerTest: 10,
      fixed: [['AS AD AC AH TS', '2S 3S 4S 5S JS', '2H 3H 4H 5H AH', 'KD KC KH KS 9D', '2C 3C AC 4C 5C', 'AD KD QD JD TD']],
      nRandom: 4, seed: 118,
    }),
  },
  {
    id: 'knockout',
    chapter: 3,
    card: '5C',
    title: 'Knockout',
    story: [
      'The Kesslers are still sure the house is hiding aces. With top-card War, an ace in the middle of a hand is invisible, so pay any hand with an ace in it, wherever it hides.',
      'A new croupier deals a hand out one card at a time, round the table.',
    ],
    brief: 'Five-card hands. Pay out every hand containing an ace. (Top-card War only.)',
    handSize: 5,
    floor: floorOf(hexRect(-3, 2, -6, 5), L5),
    fixed: L5,
    croupiers: paletteThrough('deal'),
    warRules: ['top'],
    pays: (h) => h.some((c) => rankOf(c) === 'A'),
    tests: makeTests({
      handSize: 5, handsPerTest: 10,
      fixed: [['2S 3S AS 4S 5S', 'KS KD KC KH QS', 'KH QH JH TH AH', '2C AH AD AC AS', '2D 3D 4D 5D 7C',
        'QD JD TD 9D 8D', '3C 4C 5C 6C AD', 'AC 2H 3H 4H 5H']],
      nRandom: 4, seed: 119,
    }),
  },
  {
    id: 'low-ball',
    chapter: 3,
    card: '6C',
    title: 'Low Ball',
    story: [
      'Commissioner Pryce plays a quiet game every Tuesday, and he prefers it when he wins. His game: a hand wins only if every one of its cards beats a 5. Aces are high.',
      'Nobody has told him that the house always wins.',
    ],
    brief: 'Five-card hands. Pay out every hand in which every card beats a 5. (Top-card War only.)',
    handSize: 5,
    floor: floorOf(hexRect(-3, 2, -6, 5), L6),
    fixed: L6,
    croupiers: paletteThrough('deal'),
    warRules: ['top'],
    pays: (h) => h.every((c) => hv(c) > 5),
    tests: makeTests({
      handSize: 5, handsPerTest: 10,
      fixed: [['6S 7S 8S 9S TS', '5S 6D 7D 8D 9D', '6H 7H 8H 9H 5C', 'AS KS QS JS TS', 'AD 2D KD QD JD',
        '6C 6D 6H 6S AH', 'KC QC JC TC 4C', 'JH 3H QH KH AC', '9C 8C 7C 6C 5D', 'AH 7D 8C 9H TH']],
      nRandom: 4, seed: 120,
    }),
  },
];

// Par, from the reference solutions in solutions/levels/ (croupiers including
// shoes; rounds averaged over the level's tests and rounded). test/levels.js
// checks these exactly; `node tools/write-solutions.js clubs --par` rewrites
// this table from the recipes in tools/level-specs/clubs.js.
// BEGIN PAR
const PAR = {
  'high-spade': { croupiers: 8, rounds: 13 },
  'top-pair': { croupiers: 6, rounds: 13 },
  'new-rules': { croupiers: 4, rounds: 11 },
  'bottom-dealer': { croupiers: 6, rounds: 13 },
  'knockout': { croupiers: 16, rounds: 42 },
  'low-ball': { croupiers: 16, rounds: 48 },
};
// END PAR
finishChapter(LEVELS, PAR);
