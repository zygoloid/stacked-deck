// Chapter 5 (the finale): The Envelope. Four floors, one per special card:
// '?', '??', '$', '$$'. Jokers as wild reference cards, advertising cards as
// markers and seeds that nothing can pair with. See docs/campaign.md.
import {
  hexRect, makeTests, floorOf, source, desk, E, NE,
  hv, isRed, one, paletteThrough, finishChapter,
} from './shared.js';
import { rankOf, rankValue, largestSet, isFlush, isStraight } from '../cards.js';

const F1 = [source([-3, 0], E), desk([2, 0])];
const F2 = [source([-3, 0], E), desk([2, 0])];
const F3 = [source([1, 1], NE), desk([1, -1])];
const F4 = [source([-3, 0], E), desk([1, 0])];

const ALL = ['high', 'top'];
// Ranks exactly two apart, aces high or low, no wrapping.
const gap = (h) => [rankValue, hv].some((v) => Math.abs(v(h[0]) - v(h[1])) === 2);
// One wild card would make a five-card straight flush.
const draw = (h) => isFlush(h) && isStraight([...h, '?']);

export const LEVELS = [
  {
    id: 'mind-the-gap',
    chapter: 5,
    card: '?',
    title: 'Mind the Gap',
    story: [
      'The envelope holds the deeds to The Stacked Deck, the key to the cash tray, and a note in handwriting very like your own: you are the Owner now. The house deck has been back to the printers, and the new edition has extras nobody ordered.',
      'The first is a joker, printed in plain black. It never reaches a player, but a shoe can deal it. A joker is wild: in a set or a run it stands in for whatever card is wanted, and at War it beats everything, even an ace.',
      'Tonight\'s game is in its honour: two-card hands whose ranks are exactly two apart, like 5 and 7. Aces play high or low, so Q-A and A-3 both count, but nothing wraps past the ace: K-2 is no good.',
    ],
    brief: 'Two-card hands. Pay out every hand whose ranks are exactly two apart (aces high or low, no wrapping).',
    handSize: 2,
    floor: floorOf(hexRect(-2, 2, -7, 5), F1, [[0, 1]]),
    fixed: F1,
    croupiers: paletteThrough('hand'),
    warRules: ALL,
    specialCards: ['?'],
    pays: gap,
    tests: makeTests({
      handSize: 2, handsPerTest: 26,
      fixed: [['5S 7D', '7D 5S', 'QS AD', 'AS 3D', 'KS 2D', 'AS 2D', '5S 5D', '5S 6D', '5S 8D', '2S 4D',
        'JS KD', 'TC QH', 'KS AD', '3S AD', 'AH KH', '9C JC', '8H 6H', '4C 7C', '2H AC', 'KC JD']],
      nRandom: 4, seed: 151,
    }),
  },
  {
    id: 'straight-flush-draw',
    chapter: 5,
    card: '??',
    title: 'One Card Short',
    story: [
      'Under the black joker in the box is a second one, printed in every colour at once. It is just as wild, and it counts as every suit, so it never spoils a flush. The plain joker has no suit at all and spoils any flush it joins.',
      'Sal\'s uncle, still waiting on his royal flush, has a game for the new Owner: four-card hands that are one card short. A hand wins if one wild card would make it a straight flush: four cards of one suit inside a run of five. Aces high or low.',
    ],
    brief: 'Four-card hands. Pay out every hand that one wild card would turn into a five-card straight flush.',
    handSize: 4,
    floor: floorOf(hexRect(-2, 2, -7, 5), F2, [[0, 1]]),
    fixed: F2,
    croupiers: paletteThrough('hand'),
    warRules: ALL,
    specialCards: ['?', '??'],
    pays: draw,
    tests: makeTests({
      handSize: 4, handsPerTest: 13,
      fixed: [
        ['5S 6S 7S 8S', '5S 6S 8S 9S', '5S 7S 9S JS', '5S 6S 7S 8D', 'JH QH KH AH', 'AH 2H 3H 4H', 'AH 2H 3H 5H',
          'QH KH AH 2H', 'AD 2D 4D 5D', 'AD 3D 5D 6D', '9C TC JC KC', '9C JC QC KC', '8C 9C JC QC'],
        ['2S 3S 4S 6S', '2S 4S 6S 8S', 'TD JD QD AD', 'TD JD QD KD', '3C 4C 5C 6H', '6H 7H 8H TH', '6H 7H 9H TH',
          '4D 6D 7D 9D', 'AS KS QS 9S', '7C 8D 9C TC', '2C 3C 4C 5C', 'KD QD JD 9D', '3H 5H 6H 7H'],
      ],
      nRandom: 4, seed: 152,
    }),
  },
  {
    id: 'red-carpet',
    chapter: 5,
    card: '$',
    title: 'Red Carpet',
    story: [
      'The printers have also put an advertising card at each end of the box. The front one shows the casino\'s opening hours and comes first in new deck order, before the ace of spades. Advertising cards are worth nothing: they lose to everything at War, and they are never part of a set, a run or a flush.',
      'The Vellanis are throwing a party for the new Owner and have rolled out the red carpet. A five-card hand wins if its red cards alone hold a pair or better. Black cards don\'t count tonight, even when they pair.',
    ],
    brief: 'Five-card hands. Pay out every hand whose red cards (hearts and diamonds) include a pair or better.',
    handSize: 5,
    floor: floorOf(hexRect(-5, 2, -1, 9), F3),
    fixed: F3,
    croupiers: paletteThrough('hand'),
    warRules: ALL,
    specialCards: ['?', '??', '$'],
    pays: (h) => largestSet(h.filter(isRed)) >= 2,
    tests: makeTests({
      handSize: 5, handsPerTest: 10,
      fixed: [
        ['7H 7D 2S 5C 9S', '7H 7S 2D 5C 9S', '2S 2C 5S 5C 9S', 'AS KS QC JC 9S', 'AH KH QD JD 9H',
          '3H 3D 3S 8C 8S', 'KH KD QH QD 2S', '4S 4C 4H 9D 9C', 'JH JD JC JS 2H', '6D 6H 9D 9H 9S'],
        // red pairs back to back, then hands without one back to back
        ['7H 7D 2S 5C 9S', 'KH KD QS 3C 4S', '2H 2D 2C 7S 8S', '9D 9H TD TH JS', 'AH AD 3S 4S 5C',
          '7H 7S 2D 5C 9S', '2S 2C 5S 5C 9S', 'AS KS QC JC 9S', '8H 8C 8S 3D 4D', 'QD JD TH 9H 8C'],
        // alternating, with all-black and all-red hands
        ['7H 7D 2S 5C 9S', 'AS KS QC JC 9S', 'KH KD QS 3C 4S', '2S 2C 5S 5C 9S', '2H 2D 2C 7S 8S',
          'AH KH QD JD 9H', '9D 9H TD TH JS', '7H 7S 2D 5C 9S', 'AH AD 3S 4S 5C', '3C 4C 5C 6C 7C'],
      ],
      nRandom: 4, seed: 153,
    }),
  },
  {
    id: 'deja-vu',
    chapter: 5,
    card: '$$',
    title: 'Déjà Vu',
    story: [
      'The last card in the box is the back advertising card, which comes after everything in new deck order, jokers included. Taped to its back is a note sealed with an ace of spades, and the note is signed with your name.',
      'It describes a game the whole city has been playing since opening night without knowing it. Single cards: a card wins if a card of the same rank has already been played tonight. The first card of the night never wins. The house, as the Owner always said, remembers.',
    ],
    brief: 'Pay out every card whose rank has already been played tonight.',
    handSize: 1,
    floor: floorOf(hexRect(-3, 2, -7, 4), F4, [[-1, 1]]),
    fixed: F4,
    croupiers: paletteThrough('hand'),
    warRules: ALL,
    specialCards: ['?', '??', '$', '$$'],
    pays: (h, before) => before.some((b) => rankOf(b[0]) === rankOf(h[0])),
    tests: makeTests({
      handSize: 1, handsPerTest: 26,
      fixed: [
        one('7S 7D 2C 3H 2S 7C KD AS KH AD 3S 7H 9C'),
        one('AS 2S 3S 4S 5S 6S 7S 8S 9S TS JS QS KS AD 2D 3D 4D 5D 6D 7D 8D 9D TD JD QD KD'),
        one('5C'), one('QH QS QD QC'),
      ],
      nRandom: 4, seed: 154,
    }),
  },
];

// Par, from the reference solutions in solutions/levels/ (croupiers including
// shoes; rounds totalled over the level's tests). test/levels.js
// checks these exactly; `node tools/write-solutions.js finale --par` rewrites
// this table from the recipes in tools/level-specs/finale.js.
// BEGIN PAR
const PAR = {
  'mind-the-gap': { croupiers: 5, rounds: 129 },
  'straight-flush-draw': { croupiers: 5, rounds: 86 },
  'red-carpet': { croupiers: 12, rounds: 114 },
  'deja-vu': { croupiers: 6, rounds: 595 },
};
// END PAR
finishChapter(LEVELS, PAR);
