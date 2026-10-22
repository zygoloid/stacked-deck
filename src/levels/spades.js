// Chapter 4 (spades): The House Always Wins. See docs/campaign.md for the plan.
//
// PLACEHOLDER: these are the surviving levels from the 25-level campaign,
// in their planned order, with cards AS.. assigned consecutively. The
// chapter-4 builder replaces this file's contents per docs/campaign.md.
import {
  hexRange, hexRect, makeTests, floorOf, source, desk, E, NW, hv, high, one, spadesOf, paletteThrough, finishChapter,
} from './shared.js';
import { largestSet, rankCounts } from '../cards.js';

const L1 = [source([-2, 0], E), desk([1, 0])];
const L2 = [source([0, 0], E), desk([3, 0])];
const L3 = [source([0, 0], E), desk([1, -1])];
const L4 = [source([0, 0], E), desk([1, -1])];
const L5 = [source([0, 0], NW), desk([-1, -2])];

export const LEVELS = [
  {
    id: 'hot-streak',
    chapter: 4,
    card: 'AS',
    title: 'Hot Streak',
    story: [
      'The rival casino closed last week; its owner now deals for you on Tuesdays. The Owner\'s note says only: "The house remembers." The regulation is gone; both kinds of War are allowed again.',
      'Single cards. A card wins if it beats the card before it. The first card has nothing to beat, so it never wins.',
    ],
    brief: 'Pay out every card that beats the card played just before it.',
    handSize: 1,
    floor: floorOf(hexRange(2, [-1, 0]), L1),
    fixed: L1,
    croupiers: paletteThrough('deal'),
    warRules: ['high', 'top'],
    pays: (h, before) => before.length > 0 && hv(h[0]) > hv(before[before.length - 1][0]),
    tests: makeTests({
      handSize: 1, handsPerTest: 16,
      fixed: [one('AS KS AD 2C 3C 3D 4H 2H AH KH'), one('2S 3S 4S 5S 6S 7S 8S 9S TS JS QS KS AS'), one('KD')],
      nRandom: 3, seed: 121,
    }),
  },
  {
    id: 'high-roller',
    chapter: 4,
    card: '2S',
    title: 'High Roller',
    story: [
      'The mayor has started playing at your tables. He likes records: a five-card hand wins if its high card ties or beats the high card of every hand before it tonight.',
      'He keeps his own tally on a napkin. The house had better keep one too.',
    ],
    brief: 'Five-card hands. Pay out every hand whose high card ties or beats every earlier hand\'s high card.',
    handSize: 5,
    floor: floorOf(hexRange(2, [1, 0]), L2),
    fixed: L2,
    croupiers: paletteThrough('deal'),
    warRules: ['high', 'top'],
    pays: (h, before) => before.every((b) => high(h) >= high(b)),
    tests: makeTests({
      handSize: 5, handsPerTest: 10,
      fixed: [['2S 3S 4S 5S 7S', '8D 3D 4C 5C 6C', '2D 3H 4H 5H 6H', '8S 2C 3C 4D 5D',
        'KS 2H 3D 6D 7D', 'QS JS TS 9S 8H', 'KH 9D TD JD 7C', 'AS 9C TC JC QC', 'AH 2S 3S 4S 5S', 'KC QC JC TC 8C']],
      nRandom: 4, seed: 122,
    }),
  },
  {
    id: 'full-house',
    chapter: 4,
    card: '3S',
    title: 'Full House',
    story: [
      'The city council now meets in the back room, between the bar and the string quartet. To celebrate, the house pays a full house: three of a kind plus a pair.',
      'Sal\'s uncle swears there is a full house in every deck. The house intends to pay out exactly as many as there are.',
    ],
    brief: 'Five-card hands. Pay out every full house (three of a kind plus a pair).',
    handSize: 5,
    floor: floorOf(hexRect(-3, 1, -1, 12), L3),
    fixed: L3,
    croupiers: paletteThrough('deal'),
    warRules: ['high', 'top'],
    pays: (h) => [...rankCounts(h).values()].sort().join() === '2,3',
    tests: makeTests({
      handSize: 5, handsPerTest: 10,
      fixed: [
        ['2S 2D 2C 3S 3D', 'KS KD KC KH QS', '4S 4D 4C 5S 6D', '7S 7D 8S 8D 9C',
          'TS TD JS QS KD', 'AS AD AC 9H 9S', '2H 3H 4H 5H 6H', 'JC JD JH QC QD'],
        // back-to-back trips, to catch verdicts overtaking each other
        ['2S 2D 2C 3S 3D', '4S 4D 4C 5S 6D', '7S 7D 7C 8S 8D', '9S 9D 9C TS JD',
          'QS QD QC KS KD', 'AS AD AC 3C 4C', '5D 5C 5H 6S 6C', 'JS JC JH 8C 9H',
          'TD TC TH KC KH', '2H 4H 6H 8H TH'],
        // full houses each followed by a hand that fails fast
        ['2S 2D 2C 3S 3D', '4H 5H 6C 7D 9S', 'KS KD KC QS QD', '8S 8D 9H TC JC',
          '5S 5D 5C 6S 6D', 'AH 3H 7C 9D JS', '9S 9D 9C 4S 4D', '2H 2C TH JD QC',
          'JS JD JH 7S 7D', 'AC KH 3C 6H 8D'],
      ],
      nRandom: 4, seed: 123,
    }),
  },
  {
    id: 'calling-card',
    chapter: 4,
    card: '4S',
    title: 'Calling Card',
    story: [
      'The Vellanis and the Kesslers have stopped fighting each other. Both now work for the house, and both carry a spade in their hatband. Pay any hand that holds a spade.',
      'One last croupier: she sorts a hand into new deck order, spades first.',
    ],
    brief: 'Five-card hands. Pay out every hand that holds at least one spade.',
    handSize: 5,
    floor: floorOf(hexRect(-5, 1, 0, 11), L4),
    fixed: L4,
    croupiers: paletteThrough('sort'),
    warRules: ['high', 'top'],
    pays: (h) => spadesOf(h).length > 0,
    tests: makeTests({
      handSize: 5, handsPerTest: 10,
      fixed: [
        ['KS 2H 3D 4C 5H', '2H 3H 4D 5C 6C', 'AH KD QC JH TD', '9D 9C 9H 2S 3D', 'AS KS QS JS TS',
          '2D 3D 4D 5D 6D', 'KC QC JC TC 9C', '6H 7H 8H 9H 2S'],
        // back-to-back spades and no-spades, to catch overtaking verdicts
        ['AS 2H 3D 4C 5H', '2H 3H 4D 5C 6C', '3S 4H 5D 6C 7H', '4H 5H 6D 7C 8C',
          '5S 6H 7D 8C 9H', '6H 7H 8D 9C TC', '7S 8S 9S TS JS', '8H 9H TD JC QC'],
      ],
      nRandom: 4, seed: 124,
    }),
  },
  {
    id: 'house-record',
    chapter: 4,
    card: '5S',
    title: 'House Record',
    story: [
      'Tonight the city belongs to The Stacked Deck. The mayor, the commissioner and both families are at one table, and there is one game left: a hand wins if its largest set ties or beats the largest set of every hand before it.',
      'When it\'s over, there will be an envelope under the cash tray with your name on it, sealed with an ace of spades.',
    ],
    brief: 'Five-card hands. Pay out every hand whose largest set ties or beats every earlier hand\'s.',
    handSize: 5,
    floor: floorOf(hexRect(-8, 0, -6, 9), L5),
    fixed: L5,
    croupiers: paletteThrough('sort'),
    warRules: ['high', 'top'],
    pays: (h, before) => before.every((b) => largestSet(h) >= largestSet(b)),
    tests: makeTests({
      handSize: 5, handsPerTest: 10,
      fixed: [
        ['2S 3S 4S 5S 7S', 'AS AD 3C 4C 5C', '9S 8S 7S 6S 4D', 'KS KD QS QD 2H',
          'TS TD TC 2C 3C', 'JS JD 4H 5H 6H', '8D 8C 8H 9C 9H', 'QC QH 6D 6C 7D'],
        ['3D 4D 5D 6D 8C', 'KS KD KC KH QS', 'AS AD AC 3C 4C', '7S 7D 7C 7H 2D',
          '9S 9D TS TD JS', 'QD QC QH JD JC'],
      ],
      nRandom: 4, seed: 125,
    }),
  },
];

// Par, from the reference solutions in solutions/levels/; see clubs.js.
// BEGIN PAR
const PAR = {
  'hot-streak': { croupiers: 4, rounds: 13 },
  'high-roller': { croupiers: 4, rounds: 18 },
  'full-house': { croupiers: 13, rounds: 58 },
  'calling-card': { croupiers: 14, rounds: 89 },
  'house-record': { croupiers: 31, rounds: 105 },
};
// END PAR
finishChapter(LEVELS, PAR);
