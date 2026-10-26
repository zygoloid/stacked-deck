// Chapter 2 (diamonds): Stacking the Deck. Flushes, n of a kind, reference
// stacks (and a loop that builds them), then War: against a shoe, against
// the hand's own pieces, and rigged. See docs/campaign.md for the plan.
import {
  hexRange, hexRect, makeTests, floorOf, source, desk, E, SE, NE,
  hv, high, isRed, one, suitRun, countOf, paletteThrough, finishChapter,
} from './shared.js';
import { rankOf, largestSet, isFlush, isStraight } from '../cards.js';

const F1 = [source([-2, 0], E), desk([2, 0])];
const F2 = [source([-3, 0], E), desk([1, 0])];
const F3 = [source([-2, 0], E), desk([2, 0])];
const F4 = [source([-3, 1], NE), desk([2, -1])];
const F5 = [source([-3, 0], E), desk([0, 1])];
const F6 = [source([-4, 0], E), desk([0, 1])];
const F7 = [source([-2, 0], E), desk([2, -1])];
const F8 = [source([-2, 0], E), desk([2, 0])];
const F9 = [source([-3, 0], E), desk([1, 0])];
const F10 = [source([-2, 0], E), desk([2, 0])];
const F11 = [source([-3, 0], E), desk([1, 0])];
const F12 = [source([-4, 0], E), desk([4, 0])];
const F13 = [source([-4, 0], E), desk([1, 0])];

const suited = (h) => isFlush(h);
const connected = (h) => isStraight(h);
const between = (h) => Math.min(hv(h[0]), hv(h[2])) < hv(h[1]) && hv(h[1]) < Math.max(hv(h[0]), hv(h[2]));

export const LEVELS = [
  {
    id: 'red-flush',
    chapter: 2,
    card: 'AD',
    title: 'Red Flush',
    story: [
      'Sal Vellani is back with an uncle. The uncle would like three-card hands, and he would like the house to pay any hand that is all hearts or all diamonds.',
      'Your new croupier checks for a flush: every card in the hand the same suit. "A heart and two diamonds is not a flush," you remind the uncle. He smiles in a way that suggests he knew.',
    ],
    brief: 'Three-card hands. Pay out every flush in hearts or diamonds.',
    handSize: 3,
    floor: floorOf(hexRange(2), F1),
    fixed: F1,
    croupiers: paletteThrough('flush'),
    pays: (h) => isFlush(h) && isRed(h[0]),
    tests: makeTests({
      handSize: 3, handsPerTest: 10,
      fixed: [['2H 7H KH', '3D 9D QD', '4S 8S JS', '5C TC AC', 'AH 2D 3H', 'KD QD JH', '6H 6D 6S', 'AD KD 2D', '9S 9H 4C', 'TH JH QH']],
      nRandom: 4, seed: 110,
    }),
  },
  {
    id: 'either-or',
    chapter: 2,
    card: '2D',
    title: 'Either Or',
    story: [
      'The uncle has a second game, and opinions about it. A two-card hand wins if it is suited or if it is a run. Both at once is greedy, and greed pays nothing.',
      'Sal says his uncle is very strict about greed. Sal is wearing three gold watches.',
    ],
    brief: 'Two-card hands. Pay out every hand that is suited or consecutive, but not both.',
    handSize: 2,
    floor: floorOf(hexRect(-2, 2, -5, 4), F2, [[0, 1]]),
    fixed: F2,
    croupiers: paletteThrough('flush'),
    pays: (h) => suited(h) !== connected(h),
    tests: makeTests({
      handSize: 2, handsPerTest: 14,
      fixed: [['7S 8S', '7S 9S', '7S 8D', '7S 9D', 'AS 2S', 'KH AH', 'KH AD', 'AH 3H', '5C 5D', 'QC KC', 'TD 2D', '9H TS', 'KS 2S', 'KD 2C']],
      nRandom: 4, seed: 131,
    }),
  },
  {
    id: 'pair-night',
    chapter: 2,
    card: '3D',
    title: 'Pair Night',
    story: [
      'Five-card hands tonight: the regulars like to hold something. Thursday is Pair Night, which pays a pair or two pair. Your new croupier spots n of a kind: you choose the n.',
      'Three of a kind is too much of a good thing and pays nothing on Pair Night. Nor does a full house, nor four of a kind. The regulars think this is very funny.',
    ],
    brief: 'Five-card hands. Pay out every hand whose largest set is a pair (one pair or two pair).',
    handSize: 5,
    floor: floorOf(hexRange(2), F3),
    fixed: F3,
    croupiers: paletteThrough('kind'),
    pays: (h) => largestSet(h) === 2,
    tests: makeTests({
      handSize: 5, handsPerTest: 10,
      fixed: [['2S 2D 5C 9H KS', '3S 3D 7C 7H JS', '4S 4D 4C 8H QS', '5S 5D 5C TH TS', '6S 6D 6C 6H AS',
        'AS KD QC JH 9S', 'AH AD KH KD QC', '8S 9D TC JH QS', 'KS KD KC KH QD', '2H 3H 4H 5H 7H']],
      nRandom: 4, seed: 111,
    }),
  },
  {
    id: 'inside-seven',
    chapter: 2,
    card: '4D',
    title: 'Inside Seven',
    story: [
      'The Owner\'s note this week: "Pay any two cards that would make a run with a seven." So 5-6, 6-8 and 8-9 win.',
      'Sal asks whether a seven in his own hand counts double. It does not: a pair is never a run.',
    ],
    brief: 'Two-card hands. Pay out every hand that makes a three-card run with a 7 (5-6, 6-8, 8-9).',
    handSize: 2,
    floor: floorOf(hexRect(-2, 1, -6, 4), F4, [[0, -1]]),
    fixed: F4,
    croupiers: paletteThrough('kind'),
    pays: (h) => isStraight([...h, '7C']) && !h.some((c) => rankOf(c) === '7'),
    tests: makeTests({
      handSize: 2, handsPerTest: 16,
      fixed: [['5S 6D', '6S 8D', '8S 9D', '6S 7D', '7S 8D', '4S 5D', '9S TD', '5S 8D', '6S 6D', '8H 6C', '9C 8C', '6H 5H', '7H 7D', 'AS 2D']],
      nRandom: 4, seed: 132,
    }),
  },
  {
    id: 'seven-up',
    chapter: 2,
    card: '5D',
    title: 'Seven Up',
    story: [
      'Sal has discovered Seven Up. Two cards each, and any hand holding a seven wins. A pair of sevens wins too, but not twice.',
      'The uncle points out that the house deals from a very large shoe, and the house pretends not to hear.',
    ],
    brief: 'Two-card hands. Pay out every hand that holds at least one 7.',
    handSize: 2,
    floor: floorOf(hexRect(-2, 2, -6, 4), F5, [[-1, 0], [1, -1]]),
    fixed: F5,
    croupiers: paletteThrough('kind'),
    pays: (h) => countOf(h, '7') > 0,
    tests: makeTests({
      handSize: 2, handsPerTest: 16,
      fixed: [['7S 2D', '2D 7S', '7S 7D', '6S 8D', 'KS QS', '7H 8H', 'AS 7C', '2S 2D', '6C 6D', '8C 8D', '7C 6H', '5D 9D']],
      nRandom: 4, seed: 133,
    }),
  },
  {
    id: 'lucky-number',
    chapter: 2,
    card: '6D',
    title: 'Lucky Number',
    story: [
      'Dmitri has worked it out. A five-card hand with exactly one seven is lucky; two sevens are unlucky, and no sevens at all is merely Tuesday.',
      'He would like the house to pay the lucky ones. He has brought a spreadsheet.',
    ],
    brief: 'Five-card hands. Pay out every hand with exactly one 7.',
    handSize: 5,
    floor: floorOf(hexRect(-3, 2, -7, 3), F6, [[0, 0], [-2, 1]]),
    fixed: F6,
    croupiers: paletteThrough('kind'),
    pays: (h) => countOf(h, '7') === 1,
    tests: makeTests({
      handSize: 5, handsPerTest: 10,
      fixed: [['7S 2D 3C 4H 5S', '7S 7D 3C 4H 5S', 'KS KD KC KH 7S', 'KS KD KC KH QS', '7S 7D 7C 7H 2S',
        '2S 3S 4S 5S 6S', '7H 2D 2C 2H 9S', '8S 8D 7C 9H 9S', '7C 7H 7D 8S 8D', '6S 8D 9C TH 7D']],
      nRandom: 4, seed: 134,
    }),
  },
  {
    id: 'beat-the-dealer',
    chapter: 2,
    card: '7D',
    title: 'Beat the Dealer',
    story: [
      'A new croupier joins: she plays War. Your card against the dealer\'s card, high card wins, aces high, and ties go to the house. Both cards come out of her ports, so you choose where the winner and loser go.',
      'Back to single cards for her first night. The dealer always plays a 9.',
    ],
    brief: 'Pay out every card that beats a 9 (10, J, Q, K, A).',
    handSize: 1,
    floor: floorOf(hexRange(2), F7),
    fixed: F7,
    croupiers: paletteThrough('war'),
    pays: (h) => hv(h[0]) > 9,
    tests: makeTests({
      handSize: 1, handsPerTest: 13,
      fixed: [suitRun('H'), one('9S 9D TS AS 2S')],
      nRandom: 3, seed: 112,
    }),
  },
  {
    id: 'ace-in-the-hole',
    chapter: 2,
    card: '8D',
    title: 'Ace in the Hole',
    story: [
      'The Kessler crew claims the house never deals aces. To settle it, the Owner\'s note says: pay any five-card hand with an ace in it.',
      'War compares a whole hand by its highest card.',
    ],
    brief: 'Five-card hands. Pay out every hand containing an ace.',
    handSize: 5,
    floor: floorOf(hexRange(2), F8),
    fixed: F8,
    croupiers: paletteThrough('war'),
    pays: (h) => h.some((c) => rankOf(c) === 'A'),
    tests: makeTests({
      handSize: 5, handsPerTest: 10,
      fixed: [['2S 3S AS 4S 5S', 'KS KD KC KH QS', 'KH QH JH TH AH', '2C AH AD AC AS', '2D 3D 4D 5D 7C', 'QD JD TD 9D 8D']],
      nRandom: 4, seed: 113,
    }),
  },
  {
    id: 'inside-bet',
    chapter: 2,
    card: '9D',
    title: 'Inside Bet',
    story: [
      'Sal\'s uncle bets the middle of the deck. A five-card hand wins if its high card is a 9, 10, jack or queen: nothing too small, nothing too grand.',
      'A king, he says, attracts attention. An ace attracts the police.',
    ],
    brief: 'Five-card hands. Pay out every hand whose high card is 9, 10, J or Q.',
    handSize: 5,
    floor: floorOf(hexRect(-2, 2, -5, 4), F9, [[0, 1]]),
    fixed: F9,
    croupiers: paletteThrough('war'),
    pays: (h) => high(h) >= 9 && high(h) <= 12,
    tests: makeTests({
      handSize: 5, handsPerTest: 10,
      fixed: [['2S 3D 4C 5H 8S', '2S 3D 4C 5H 9S', '2S 3D 4C 5H TS', 'QS 3D 4C 5H 2S', '2S KD 4C 5H 8S',
        '2S 3D AC 5H 8S', 'QS QD QC 2H 3S', 'JS TD 9C 8H 7S', 'KS QD JC TH 9S', '9S 9D 9C 9H 2S']],
      nRandom: 4, seed: 135,
    }),
  },
  {
    id: 'top-dog',
    chapter: 2,
    card: 'TD',
    title: 'Top Dog',
    story: [
      'Two-card hands, and a game the doormen invented on their break: you win if your top card beats your bottom card. Aces high, and a tie is a loss, as always.',
      'Pay out the whole hand, both cards. The doormen are very particular about that.',
    ],
    brief: 'Two-card hands. Pay out every hand whose top card beats its bottom card.',
    handSize: 2,
    floor: floorOf(hexRange(2, [1, 0]), F10),
    fixed: F10,
    croupiers: paletteThrough('war'),
    pays: (h) => hv(h[0]) > hv(h[1]),
    tests: makeTests({
      handSize: 2, handsPerTest: 10,
      fixed: [['KS 2D', '2D KS', '7S 7H', 'AS KD', 'KD AS', '3C 2C', 'AH 2S', '2S AH', 'TD 9D', 'JC QC']],
      nRandom: 4, seed: 114,
    }),
  },
  {
    id: 'top-of-the-heap',
    chapter: 2,
    card: 'JD',
    title: 'Top of the Heap',
    story: [
      'The doormen\'s game has gone to their heads. Now it is five cards, and the top card has to beat every other card in the hand. A tie with any of them is a loss.',
      'The head doorman has started calling himself the top dog. Nobody has the heart to stop him.',
    ],
    brief: 'Five-card hands. Pay out every hand whose top card beats each of the other four.',
    handSize: 5,
    floor: floorOf(hexRect(-2, 1, -5, 4), F11, [[-1, 1]]),
    fixed: F11,
    croupiers: paletteThrough('war'),
    pays: (h) => h.slice(1).every((c) => hv(h[0]) > hv(c)),
    tests: makeTests({
      handSize: 5, handsPerTest: 10,
      fixed: [['AS KD 2C 3H 4S', 'KS AD 2C 3H 4S', 'KS KD 2C 3H 4S', '2S 3D 4C 5H 6S', '6S 2D 3C 4H 5S',
        '9S 2D 3C 4H 9H', 'TS 9D 8C 7H 6S', 'TS 9D 8C 7H JS', 'AH AD 2C 3C 4C', '3D 2S 2D 2C 2H']],
      nRandom: 4, seed: 136,
    }),
  },
  {
    id: 'royal-flush',
    chapter: 2,
    card: 'QD',
    title: 'Royal Flush',
    story: [
      'Sal\'s uncle has waited forty years to see a royal flush dealt: ten, jack, queen, king and ace, all one suit. Tonight the house will pay one, if it comes.',
      'He is very clear that the ace-to-five straight flush, however pretty, is not royal. Neither is nine to king.',
    ],
    brief: 'Five-card hands. Pay out every royal flush: 10, J, Q, K and A of one suit.',
    handSize: 5,
    floor: floorOf(hexRect(-2, 2, -7, 7), F12, [[0, -1], [-1, 1], [2, 1]]),
    fixed: F12,
    croupiers: paletteThrough('war'),
    pays: (h) => isFlush(h) && 'TJQKA'.split('').every((r) => countOf(h, r) === 1),
    tests: makeTests({
      handSize: 5, handsPerTest: 10,
      fixed: [
        ['TS JS QS KS AS', 'AH 2H 3H 4H 5H', '9D TD JD QD KD', 'TC JC QC KC AD', 'AC KC QC JC TC',
          '4S 5S 6S 7S 8S', '2D 7D 9D JD KD', 'KH AH QH TH JH', 'TH JD QC KS AH', 'AS KS QS JS 9S'],
        ['2S 3S 4S 5S 6S', 'TH JH QH KH AH', '3C 4C 5C 6C 7C', 'TS JS QS KS AS', '8D 9D TD JD QD',
          'AC 2C 3C 4C 5C', '9S TS JS QS KS', 'QD KD AD JD TD', 'AD KD QD JD 2D', 'TC JC QC KC AC'],
      ],
      nRandom: 3, seed: 137,
    }),
  },
  {
    id: 'acey-deucey',
    chapter: 2,
    card: 'KD',
    title: 'Acey-Deucey',
    story: [
      'The Vellanis have asked for the whole floor for one night of their family game. Three cards: the player wins if the middle card falls strictly between the top card and the bottom card, whichever way round they are.',
      'A middle card that ties either end loses, and so does any hand whose ends are a pair. Aces are high. Two blocks away, the builders have finished something with a lot of neon on it.',
    ],
    brief: 'Three-card hands. Pay out every hand whose middle card is strictly between its top and bottom cards.',
    handSize: 3,
    floor: floorOf(hexRect(-4, 4, -9, 9), F13),
    fixed: F13,
    croupiers: paletteThrough('war'),
    pays: between,
    tests: makeTests({
      handSize: 3, handsPerTest: 16,
      fixed: [
        ['2S 5D 9C', '9S 5D 2C', '5S 2D 9C', '5S 9D 2C', '7S 7D 7C', '7S 8D 7C', '7S 6D 7C', '3S 4D 5C',
          'AS KD 2C', '2S KD AC', 'KS AD 2C', 'QS QD KC', 'QS KD QC', 'TS JD JC', 'JS TD QC', '2D AC KH'],
        // winners back to back, then losers back to back, to catch pieces of
        // one hand meeting pieces of another
        ['2S 5D 9C', '3S 6D TC', '4S 7D JC', '5S 8D QC', '6S 9D KC', '7S TD AC', '8S 9D TC', '9S TD JC',
          '2H 2D 9H', '3H 3D TH', '4H 4D JH', '5H 5D QH', '6H 6D KH', '7H 7D AH', '8H 9C 9H', 'TH JS JH'],
        // winners alternating with hands that fail at either end
        ['2S 5D 9C', '5S 2D 9C', '9S 5D 2C', '5H 9D 2H', '3S 3D 8C', '8S 8D 3C', '4S 7D JC', 'JS 7H 4C',
          '6S 2H TC', '7S 2C 3H', 'QS KD 5C', '5H AD QH', 'TS JD QC', 'KS 3D 9C', '2D AC KH', '6D 9S AS'],
        // runs: middle too high, winners, middle too low, winners
        ['2S KD 9C', '3S QD 8C', '4S JD 7C', '9H AD 9C', 'TS TD 5C', '5S 8D JC', 'QH 7D 3C', '2H 3D 4C',
          '9S 2D QC', 'KH 4D 6C', '8H 8D JC', '7H 7D 7C', 'AS 2C AD', 'AH KH 2S', '3H 6S TH', 'JH 9S 8C'],
      ],
      nRandom: 4, seed: 138,
    }),
  },
];

// Par, from the reference solutions in solutions/levels/ (croupiers including
// shoes; rounds totalled over the level's tests). test/levels.js
// checks these exactly; `node tools/write-solutions.js diamonds --par`
// rewrites this table from the recipes in tools/level-specs/diamonds.js.
// BEGIN PAR
const PAR = {
  'red-flush': { croupiers: 3, rounds: 53 },
  'either-or': { croupiers: 5, rounds: 84 },
  'pair-night': { croupiers: 3, rounds: 60 },
  'inside-seven': { croupiers: 5, rounds: 82 },
  'seven-up': { croupiers: 6, rounds: 89 },
  'lucky-number': { croupiers: 11, rounds: 80 },
  'beat-the-dealer': { croupiers: 4, rounds: 69 },
  'ace-in-the-hole': { croupiers: 4, rounds: 52 },
  'inside-bet': { croupiers: 5, rounds: 60 },
  'top-dog': { croupiers: 5, rounds: 78 },
  'top-of-the-heap': { croupiers: 6, rounds: 74 },
  'royal-flush': { croupiers: 11, rounds: 66 },
  'acey-deucey': { croupiers: 21, rounds: 244 },
};
// END PAR
finishChapter(LEVELS, PAR);
