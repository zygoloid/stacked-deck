// Chapter 2 (diamonds): Stacking the Deck. War, from a single card against
// a shoe to a rigged game on the pieces of a hand, and Flush, brought in
// after War. See docs/campaign.md for the plan.
import {
  hexRange, hexRect, makeTests, makeMixedTests, dealtTests, floorOf, source, desk, E, SE, NE,
  hv, isRed, one, suitRun, countOf, paletteThrough, finishChapter,
} from './shared.js';
import { RANKS, rankOf, isFlush, shuffled } from '../cards.js';

const seat = (at, out, n) => ({ ...source(at, out), seat: n });
const labelled = (at, n) => ({ ...desk(at), desk: n });
const between = (h) => Math.min(hv(h[0]), hv(h[2])) < hv(h[1]) && hv(h[1]) < Math.max(hv(h[0]), hv(h[2]));

// Natural (blackjack): an ace with a ten-card; deals with about a third
// blackjacks and many near misses.
const TENS = 'TJQK';
const natural = (h) => h.some((c) => rankOf(c) === 'A') && h.some((c) => TENS.includes(rankOf(c)));
const drawCard = (rand, ranks = RANKS.join('')) => ranks[Math.floor(rand() * ranks.length)] + 'SDCH'[Math.floor(rand() * 4)];
const NATURAL_SHAPES = [['A', TENS], ['A', TENS], ['A', TENS], ['A', '23456789'], ['A', '9'], ['A', 'A'],
  [TENS, TENS], [TENS, '6789'], [RANKS.join(''), RANKS.join('')]];
function blackjackDeals(rand, nTests, per) {
  return Array.from({ length: nTests }, () => Array.from({ length: per }, () => {
    const shape = NATURAL_SHAPES[Math.floor(rand() * NATURAL_SHAPES.length)];
    let h;
    do h = shuffled(shape.map((ranks) => drawCard(rand, ranks)), rand); while (h[0] === h[1]);
    return h;
  }));
}

// Crossed Wires: every hand at the desk opposite its player.
const crossed = (inputs) => inputs.flatMap((h, i) => (h ? [{ desk: 2 - (i % 3), hand: h }] : []));

// Pecking Order: three-card hands, each from a single suit (three hands of
// each suit a test, from one deck).
function suitedDeals(rand, n) {
  return Array.from({ length: n }, () => {
    const hands = [];
    for (const s of 'SHDC') {
      const cards = shuffled(RANKS.map((r) => r + s), rand);
      for (let i = 0; i < 3; i++) hands.push(cards.slice(3 * i, 3 * i + 3));
    }
    return shuffled(hands, rand);
  });
}

const F1 = [source([-2, 0], E), desk([0, 0])];
const F2 = [source([-2, 0], E), desk([0, -1])];
const F3 = [seat([-2, 0], E, 0), seat([-1, -1], SE, 1), desk([3, 0])];
const F4 = [source([-2, 0], E), desk([2, 0])];
const F5 = [source([-3, 0], E), desk([1, 0])];
const F6 = [source([-2, 0], E), desk([2, 0])];
const F7 = [source([-4, 0], E), desk([-1, 1])];
const F8 = [source([-2, 0], E), desk([0, 1])];
const F9 = [
  seat([-2, -2], E, 0), seat([-3, 0], E, 1), seat([-4, 2], E, 2),
  labelled([3, -2], 0), labelled([2, 0], 1), labelled([1, 2], 2),
];
const F10 = [source([-2, 0], E), desk([2, 0])];
const F11 = [source([-2, 0], E), desk([2, -1])];
const F12 = [source([-4, 0], E), desk([4, 0])];
const F13 = [source([-4, 0], E), desk([1, 0])];

export const LEVELS = [
  {
    id: 'high-card',
    chapter: 2,
    card: 'AD',
    title: 'High Card',
    difficulty: 2,
    story: [
      'A new croupier joins: she plays War. Your card against the dealer\'s card, high card wins, aces high, and ties go to the house. Both cards come out of her ports, so you choose where the winner and loser go.',
      'Single cards for her first night. The dealer always plays a 9.',
    ],
    brief: 'Pay out every card that beats a 9 (aces high; a tie doesn\'t beat it).',
    handSize: 1,
    floor: floorOf(hexRange(2, [-1, 0]), F1),
    fixed: F1,
    croupiers: paletteThrough('war'),
    pays: (h) => hv(h[0]) > 9,
    tests: makeTests({
      handSize: 1, handsPerTest: 13,
      fixed: [suitRun('H'), one('9S 9D TS AS 2S')],
      nRandom: 3, seed: 151,
    }),
  },
  {
    id: 'small-stakes',
    chapter: 2,
    card: '2D',
    title: 'Small Stakes',
    difficulty: 3,
    story: [
      'Old Thursday\'s pension has run out before the end of the month again, so tonight he plays for small stakes: any card from the ace to the 4 wins.',
      'At his table the ace counts low. The War croupier, as ever, counts it high.',
    ],
    brief: 'Pay out every ace, 2, 3 and 4.',
    handSize: 1,
    floor: floorOf(hexRange(2, [-1, 0]), F2),
    fixed: F2,
    croupiers: paletteThrough('war'),
    pays: (h) => 'A234'.includes(rankOf(h[0])),
    tests: makeTests({
      handSize: 1, handsPerTest: 20,
      fixed: [suitRun('C'), one('AH KH QH 2D 5D 4S 3S 6S 5H AS')],
      nRandom: 3, seed: 152,
    }),
  },
  {
    id: 'face-off',
    chapter: 2,
    card: '3D',
    title: 'Face Off',
    difficulty: 4,
    story: [
      'The Marchetti twins have stopped asking to be paid at the same desk. Now they want to beat each other. Each lays down one card a deal, and the house pays the higher card, on its own. Aces high.',
      'If the two cards are the same rank, nobody wins and nothing is paid. The twins take that badly.',
    ],
    brief: 'Two players, one card each a deal. Pay out the higher of the two cards (aces high), on its own; a tie pays nothing.',
    handSize: 1,
    floor: floorOf(hexRange(3), F3),
    fixed: F3,
    croupiers: paletteThrough('war'),
    expected: (inputs) => {
      const out = [];
      for (let i = 0; i + 1 < inputs.length; i += 2) {
        const [a] = inputs[i], [b] = inputs[i + 1];
        if (hv(a) !== hv(b)) out.push([hv(a) > hv(b) ? a : b]);
      }
      return out;
    },
    tests: makeTests({
      handSize: 1, handsPerTest: 26,
      fixed: [one('KS 2D 2S KD 7H 7C AS KH KC AD 9S 9H TD 3C'), one('5S 5H 5D 5C QS JS JD QD')],
      nRandom: 3, seed: 153,
    }),
  },
  {
    id: 'red-flush',
    chapter: 2,
    card: '4D',
    title: 'Red Flush',
    difficulty: 3,
    story: [
      'Sal\'s uncle is back from across the river with a game of his own. He would like three-card hands, and he would like the house to pay any hand that is all hearts or all diamonds.',
      'Your new croupier checks for a flush: every card in the hand the same suit. "A heart and two diamonds is not a flush," you remind the uncle. He smiles in a way that suggests he knew.',
    ],
    brief: 'Three-card hands. Pay out every flush in hearts or diamonds.',
    handSize: 3,
    floor: floorOf(hexRange(4), F4),
    fixed: F4,
    croupiers: paletteThrough('flush'),
    pays: (h) => isFlush(h) && isRed(h[0]),
    tests: makeTests({
      handSize: 3, handsPerTest: 10,
      fixed: [['2H 7H KH', '3D 9D QD', '4S 8S JS', '5C TC AC', 'AH 2D 3H', 'KD QD JH', '6H 6D 6S', 'AD KD 2D', '9S 9H 4C', 'TH JH QH']],
      nRandom: 4, seed: 110,
    }),
  },
  {
    id: 'small-change',
    chapter: 2,
    card: '5D',
    title: 'Small Change',
    difficulty: 2,
    story: [
      'Sal Vellani has a rule about kings: a king is too much money to leave on the table. Tonight, for every king played, the house hands over the ace of spades from its own cards, and keeps the king.',
      'Queens, aces and everything else are just cards, and pay nothing.',
    ],
    brief: 'Single cards. For every king played, pay out the ace of spades (a house card). Nothing else is paid.',
    handSize: 1,
    floor: floorOf(hexRect(-2, 2, -7, 4), F5),
    fixed: F5,
    croupiers: paletteThrough('flush'),
    expected: (inputs) => inputs.filter(([c]) => rankOf(c) === 'K').map(() => ['AS']),
    tests: makeTests({
      handSize: 1, handsPerTest: 26,
      fixed: [one('KS QS AS KD 2C KH JD AH KC'), one('KH KD KC KS'), one('QS AD JC 2H')],
      nRandom: 4, seed: 161,
    }),
  },
  {
    id: 'high-suit',
    chapter: 2,
    card: '6D',
    title: 'High Suit',
    difficulty: 4,
    story: [
      'Sal\'s uncle has a second game. Two-card hands: when both cards are the same suit, the house pays the higher of the two, on its own, and keeps the other. Aces high.',
      'A hand of two suits pays nothing at all. The uncle considers this only fair.',
    ],
    brief: 'Two-card hands. For every hand whose two cards are the same suit, pay out its higher card (aces high), on its own.',
    handSize: 2,
    floor: floorOf(hexRange(2), F6),
    fixed: F6,
    croupiers: paletteThrough('flush'),
    expected: (inputs) => inputs.filter((h) => isFlush(h)).map((h) => [hv(h[0]) > hv(h[1]) ? h[0] : h[1]]),
    tests: makeTests({
      handSize: 2, handsPerTest: 20,
      fixed: [['KS 2S', '2S KS', 'AH KH', 'KH AH', '7D 8D', '8D 7D', '7C 7D', 'AS KD', 'JC TC', 'QH QD']],
      nRandom: 3, seed: 154,
    }),
  },
  {
    id: 'natural',
    chapter: 2,
    card: '7D',
    title: 'Natural',
    difficulty: 4,
    story: [
      'Sal Vellani has been to a casino out of town and come back talking about nothing but blackjack. The Owner will not have a game at the tables that counts to twenty-one, but agrees to pay the one hand Sal cares about: a two-card hand that is an ace with a 10, a jack, a queen or a king.',
      'Two aces are a pair of aces, not a natural, and pay nothing. Sal says the casino out of town also gave him free drinks, and he has not decided which he misses more.',
    ],
    brief: 'Two-card hands. Pay out every blackjack: an ace with a 10, J, Q or K (two aces don\'t count).',
    handSize: 2,
    floor: floorOf(hexRect(-2, 2, -9, 5), F7),
    fixed: F7,
    croupiers: paletteThrough('flush'),
    pays: natural,
    tests: dealtTests({
      deal: (rand, n) => blackjackDeals(rand, n, 20),
      fixed: [
        ['AS TD', 'JC AH', 'AD QS', 'KH AC', 'AS AD', 'AH 9C', '2D AS', 'KS QD', 'TC TH', 'KD 9S', 'AC 5H', '7S 8D',
          'JH JS', 'QC AD'],
        // winners back to back, then losers that fail in different ways
        ['TS AS', 'AH TH', 'AC KC', 'QD AD', 'JS AH', 'AH AC', 'KD QH', 'AS 9D', '3C 4H', 'AD 2S', 'JD TC'],
      ],
      nRandom: 4, seed: 202,
    }),
  },
  {
    id: 'low-kicker',
    chapter: 2,
    card: '8D',
    title: 'Low Kicker',
    difficulty: 4,
    story: [
      'The Kesslers have a two-card game of their own. When the top card beats a 7 and the bottom card does not, the house pays the bottom card, on its own; the top card stays on the table for luck.',
      'Aces high, and a 7 does not beat a 7.',
    ],
    brief: 'Two-card hands. When the top card beats a 7 and the bottom card doesn\'t (aces high), pay out the bottom card on its own.',
    handSize: 2,
    floor: floorOf(hexRange(2, [-1, 0]), F8),
    fixed: F8,
    croupiers: paletteThrough('flush'),
    expected: (inputs) => inputs.filter(([t, b]) => hv(t) > 7 && hv(b) <= 7).map(([, b]) => [b]),
    tests: makeTests({
      handSize: 2, handsPerTest: 20,
      fixed: [['8S 7D', '7D 8S', '7S 7D', 'AS 2D', '2D AS', 'KH QH', '3C 4C', '8H 8C', 'TD 7C', '9C AD', 'AC 7H']],
      nRandom: 3, seed: 155,
    }),
  },
  {
    id: 'crossed-wires',
    chapter: 2,
    card: '9D',
    title: 'Crossed Wires',
    difficulty: 4,
    story: [
      'The Owner has had the floor rewired: three card tables down one wall, three cash desks down the other, and a note under the tray. Every player is to be paid at the desk diametrically opposite their seat, so that the money is seen to cross the room.',
      'Player A, at the top, is paid at desk Z, at the bottom; player B, in the middle, at desk Y; player C, at the bottom, at desk X. The Marchetti twins have brought a cousin, and all three are already arguing about the view.',
    ],
    brief: 'Three players, hands of 1 to 3 cards. Pay out every hand at the desk diametrically opposite its player: A\'s at Z, B\'s at Y, C\'s at X.',
    handSize: [1, 3],
    floor: floorOf(hexRect(-4, 4, -6, 5), F9),
    fixed: F9,
    croupiers: paletteThrough('flush'),
    expected: crossed,
    tests: makeMixedTests({
      minSize: 1, maxSize: 3, handsPerTest: 15,
      fixed: [
        ['AS', '2S', '3S', 'AH 2H', 'KH QH', 'JH TH', '4D 5D 6D', '7C', '8C 9C'],
        // the same hand from every player
        ['KS QS', 'KS QS', 'KS QS', '2D', '2D', '2D'],
        ['7H 8H 9H', 'JS', '5C 4C'],
      ],
      nRandom: 4, seed: 180,
    }),
  },
  {
    id: 'top-dog',
    chapter: 2,
    card: 'TD',
    title: 'Top Dog',
    difficulty: 5,
    story: [
      'Two-card hands, and a game the doormen invented on their break: you win if your top card beats your bottom card. Aces high, and a tie is a loss, as always.',
      'Pay out the whole hand, both cards. The doormen are very particular about that.',
    ],
    brief: 'Two-card hands. Pay out every hand whose top card beats its bottom card.',
    handSize: 2,
    floor: floorOf(hexRange(2, [1, 0]), F10),
    fixed: F10,
    croupiers: paletteThrough('flush'),
    pays: (h) => hv(h[0]) > hv(h[1]),
    tests: makeTests({
      handSize: 2, handsPerTest: 10,
      fixed: [['KS 2D', '2D KS', '7S 7H', 'AS KD', 'KD AS', '3C 2C', 'AH 2S', '2S AH', 'TD 9D', 'JC QC']],
      nRandom: 4, seed: 114,
    }),
  },
  {
    id: 'pecking-order',
    chapter: 2,
    card: 'JD',
    title: 'Pecking Order',
    difficulty: 6,
    story: [
      'The doormen have taken up a game the Owner can\'t follow, and want each three-card hand paid back in order: the highest card on top, then the middle one, then the lowest. Aces high.',
      'Every hand is dealt from a single suit, so no two cards are ever the same rank. The doormen check the order card by card.',
    ],
    brief: 'Three-card hands, each all one suit. Pay out every hand with its cards in order, highest on top (aces high; card order checked).',
    handSize: 3,
    floor: floorOf(hexRange(3), F11),
    fixed: F11,
    croupiers: paletteThrough('flush'),
    ordered: true,
    expected: (inputs) => inputs.map((h) => [...h].sort((a, b) => hv(b) - hv(a))),
    tests: dealtTests({
      deal: suitedDeals,
      fixed: [['AS KS QS', 'QS KS AS', 'KH AH QH', '2D 3D 4D', '4D 2D 3D', '3C 4C 2C', 'TH 2H 7H', '7H TH 2H', '2S 7S TS', 'JC AC 5C']],
      nRandom: 4, seed: 156,
    }),
  },
  {
    id: 'royal-flush',
    chapter: 2,
    card: 'QD',
    title: 'Royal Flush',
    difficulty: 7,
    story: [
      'Sal\'s uncle has waited forty years to see a royal flush dealt: ten, jack, queen, king and ace, all one suit. Tonight the house will pay one, if it comes.',
      'He is very clear that the ace-to-five straight flush, however pretty, is not royal. Neither is nine to king.',
    ],
    brief: 'Five-card hands. Pay out every royal flush: 10, J, Q, K and A of one suit.',
    handSize: 5,
    floor: floorOf(hexRect(-2, 2, -7, 7), F12, [[0, -1], [-1, 1], [2, 1]]),
    fixed: F12,
    croupiers: paletteThrough('flush'),
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
    difficulty: 8,
    story: [
      'The Vellanis have asked for the whole floor for one night of their family game. Three cards: the player wins if the middle card falls strictly between the top card and the bottom card, whichever way round they are.',
      'A middle card that ties either end loses, and so does any hand whose ends are a pair. Aces are high. Two blocks away, the builders have finished something with a lot of neon on it.',
    ],
    brief: 'Three-card hands. Pay out every hand whose middle card is strictly between its top and bottom cards.',
    handSize: 3,
    floor: floorOf(hexRect(-4, 4, -9, 9), F13),
    fixed: F13,
    croupiers: paletteThrough('flush'),
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
// checks these exactly; `node tools/write-solutions.js diamonds --par` rewrites
// this table from the recipes in tools/level-specs/diamonds.js.
// BEGIN PAR
const PAR = {
  'high-card': { croupiers: 2, rounds: 58 },
  'small-stakes': { croupiers: 4, rounds: 87 },
  'face-off': { croupiers: 5, rounds: 83 },
  'red-flush': { croupiers: 3, rounds: 53 },
  'small-change': { croupiers: 6, rounds: 130 },
  'high-suit': { croupiers: 4, rounds: 80 },
  'natural': { croupiers: 12, rounds: 134 },
  'low-kicker': { croupiers: 5, rounds: 76 },
  'crossed-wires': { croupiers: 14, rounds: 68 },
  'top-dog': { croupiers: 5, rounds: 78 },
  'pecking-order': { croupiers: 7, rounds: 142 },
  'royal-flush': { croupiers: 11, rounds: 66 },
  'acey-deucey': { croupiers: 21, rounds: 244 },
};
// END PAR
finishChapter(LEVELS, PAR);
