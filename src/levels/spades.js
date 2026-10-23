// Chapter 4 (spades): The House Always Wins. Memory (a shoe that deals once,
// the champion loop), shoe decks as sequences, the ticket door, burn, sort
// and hand, flushes regrouped across hands and house hearts paid for spades,
// windows, then the big machines: Jacks or Better and the house record. See docs/campaign.md for the plan.
import {
  hexRange, hexRect, makeTests, floorOf, source, desk, E, NW, NE,
  hv, high, one, spadesOf, countOf, paletteThrough, finishChapter,
} from './shared.js';
import { rankOf, suitOf, largestSet, rankCounts, isFlush, isStraight } from '../cards.js';

const L1 = [source([-2, 0], E), desk([1, 0])];
const L2 = [source([0, 0], E), desk([3, 0])];
const L3 = [source([-2, 0], E), desk([1, 0])];
const L4 = [source([-2, 0], E), desk([0, 0])];
const L5 = [source([0, 0], E), desk([1, -1])];
const L6 = [source([-3, 0], E), desk([2, 0])];
const L7 = [source([1, 1], NE), desk([1, -1])];
const L8 = [source([-3, 0], E), desk([1, 0])];
const L9 = [source([-3, 0], E), desk([0, -1])];
const L10 = [source([-3, 0], E), desk([1, 0])];
const L11 = [source([-3, 0], E), desk([2, 0])];
const L12 = [source([-4, 0], E), desk([-2, 0])];
const L13 = [source([0, 0], NW), desk([-1, -2])];

const ALL = ['high', 'top'];
const last = (before) => before[before.length - 1];
const shape = (h) => [...rankCounts(h).values()].sort().join();
const wheel = (h) => 'A2345'.split('').every((r) => countOf(h, r) === 1);
// Every five cards of one suit, in the order played (top card first), as
// one hand; leftovers are never paid.
function flushesOf(inputs) {
  const piles = {}, out = [];
  for (const c of inputs.flat()) {
    const pile = (piles[suitOf(c)] ??= []);
    pile.push(c);
    if (pile.length === 5) out.push(pile.splice(0));
  }
  return out;
}
const jacksOrBetter = (h) => isStraight(h) || isFlush(h) || largestSet(h) >= 3 || shape(h) === '1,2,2' ||
  (shape(h) === '1,1,1,2' && h.some((c) => countOf(h, rankOf(c)) === 2 && hv(c) >= 11));

export const LEVELS = [
  {
    id: 'hot-streak',
    chapter: 4,
    card: 'AS',
    title: 'Hot Streak',
    story: [
      'Two blocks away the neon has gone dark. The rival casino closed last week, and its owner now deals for you on Tuesdays; he says he never saw it coming. The Owner\'s note says only: "The house remembers."',
      'Single cards. A card wins if it beats the card played just before it: aces high, and a tie is no good. The first card of the night has nothing to beat, so it never wins.',
    ],
    brief: 'Pay out every card that beats the card played just before it.',
    handSize: 1,
    floor: floorOf(hexRange(2, [-1, 0]), L1),
    fixed: L1,
    croupiers: paletteThrough('deal'),
    warRules: ALL,
    pays: (h, before) => before.length > 0 && hv(h[0]) > hv(last(before)[0]),
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
    warRules: ALL,
    pays: (h, before) => before.every((b) => high(h) >= high(b)),
    tests: makeTests({
      handSize: 5, handsPerTest: 10,
      fixed: [['2S 3S 4S 5S 7S', '8D 3D 4C 5C 6C', '2D 3H 4H 5H 6H', '8S 2C 3C 4D 5D',
        'KS 2H 3D 6D 7D', 'QS JS TS 9S 8H', 'KH 9D TD JD 7C', 'AS 9C TC JC QC', 'AH 2S 3S 4S 5S', 'KC QC JC TC 8C']],
      nRandom: 4, seed: 122,
    }),
  },
  {
    id: 'burn-card',
    chapter: 4,
    card: '3S',
    title: 'Burn Card',
    story: [
      'The rival\'s old owner brought a habit with him from across the street: before every deal he burns a card, sliding it off the top of the deck where nobody can see it. The Owner approves of anything that looks like tradition.',
      'Your new croupier burns: the top card to one port, the rest of the hand to the other. Tonight a five-card hand wins if its second card beats a 10. Aces are high, and a tie is a loss.',
    ],
    brief: 'Five-card hands. Pay out every hand whose second card (from the top) beats a 10.',
    handSize: 5,
    floor: floorOf(hexRect(-2, 2, -5, 4), L3),
    fixed: L3,
    croupiers: paletteThrough('burn'),
    warRules: ALL,
    pays: (h) => hv(h[1]) > 10,
    tests: makeTests({
      handSize: 5, handsPerTest: 10,
      fixed: [['2S JD 3C 4H 5S', 'JS 2D 3C 4H 5S', '2S TD JC QH KS', '9S AD 2C 3H 4S', 'AS 9D KC QH JS',
        'KS QD 2C 3H 4S', '3S KD AC AH AS', 'QS TS 9S 8S 7S', 'TD JS 2H 2D 2C', '5H 4H 3H 2H AH']],
      nRandom: 4, seed: 141,
    }),
  },
  {
    id: 'third-time-lucky',
    chapter: 4,
    card: '4S',
    title: 'Third Time Lucky',
    story: [
      'The mayor is superstitious about threes. Tonight every third hand at his table wins, whatever it holds: the third, the sixth, the ninth, and so on through the night.',
      'The council calls it a lottery. The mayor calls it a tradition, and the Owner, for once, calls it cheap.',
    ],
    brief: 'Five-card hands. Pay out the 3rd, 6th, 9th, ... hand, whatever it holds.',
    handSize: 5,
    floor: floorOf(hexRange(2, [-1, 0]), L4),
    fixed: L4,
    croupiers: paletteThrough('burn'),
    warRules: ALL,
    pays: (h, before) => before.length % 3 === 2,
    tests: makeTests({
      handSize: 5, handsPerTest: 10,
      fixed: [
        ['2S 3D 4C 5H 7S', 'AS AD AC AH KS', '2D 3C 4H 5S 7D', 'KD QD JD TD 9D', '2C 3H 4S 5D 7C', 'AS KS QS JS TS', '2H 3S 4D 5C 7H'],
        ['AH KH QH JH TH', 'AS KD QC JH 9S'],
      ],
      nRandom: 4, seed: 142,
    }),
  },
  {
    id: 'full-house',
    chapter: 4,
    card: '5S',
    title: 'Full House',
    story: [
      'The city council now meets in the back room, between the bar and the string quartet. To celebrate, the house pays a full house: three of a kind plus a pair. Four of a kind is not a full house, and neither is two pair.',
      'Sal\'s uncle swears there is a full house in every deck. The house intends to pay out exactly as many as there are.',
    ],
    brief: 'Five-card hands. Pay out every full house (three of a kind plus a pair).',
    handSize: 5,
    floor: floorOf(hexRect(-3, 1, -1, 12), L5),
    fixed: L5,
    croupiers: paletteThrough('burn'),
    warRules: ALL,
    pays: (h) => shape(h) === '2,3',
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
    id: 'the-wheel',
    chapter: 4,
    card: '6S',
    title: 'The Wheel',
    story: [
      'Old Thursday has a new favourite hand: the wheel, the straight from the ace up to the five. A 2 3 4 5, any suits, and the ace plays low.',
      'Ten to ace is a fine straight, he says, but it is not a wheel. Neither is two to six. Thursday has been waiting for one since the casino opened.',
    ],
    brief: 'Five-card hands. Pay out every ace-to-five straight (A 2 3 4 5, any suits).',
    handSize: 5,
    floor: floorOf(hexRect(-2, 1, -7, 5), L6, [[0, 1]]),
    fixed: L6,
    croupiers: paletteThrough('burn'),
    warRules: ALL,
    pays: wheel,
    tests: makeTests({
      handSize: 5, handsPerTest: 10,
      fixed: [
        ['AS 2D 3C 4H 5S', '2S 3D 4C 5H 6S', 'TS JD QC KH AS', '3H 5D AC 2H 4C', '7S 8D 9C TH JS',
          'AH 2H 3H 4H 5H', 'AS AD 2C 3H 4S', '2S 3D 4C 5H 7S', '5D 4D 3S 2S AC', '4S 5D 6C 7H 8S'],
        ['9S TD JC QH KS', '6S 5D 4C 3H 2S', 'AC 2C 3C 4C 6C', '3S 4D 5C 6H 7S', 'AD 3D 4S 5H 6C',
          '2H AH 4D 3S 5C', '5S 6D 7C 8H 9S', 'AS KD QC JH TS', '8D 9C TH JS QD', 'AH 2S 3D 4C KH'],
      ],
      nRandom: 4, seed: 143,
    }),
  },
  {
    id: 'calling-card',
    chapter: 4,
    card: '7S',
    title: 'Calling Card',
    story: [
      'The Vellanis and the Kesslers have stopped fighting each other. Both now work for the house, and both carry a spade in their hatband. Pay any hand that holds a spade.',
      'A new croupier sorts a hand into new deck order, the way a fresh pack comes out of the box: spades ace to king, then diamonds ace to king, then clubs and hearts from king down to ace.',
    ],
    brief: 'Five-card hands. Pay out every hand that holds at least one spade.',
    handSize: 5,
    floor: floorOf(hexRect(-4, 2, -1, 9), L7),
    fixed: L7,
    croupiers: paletteThrough('sort'),
    warRules: ALL,
    pays: (h) => spadesOf(h).length > 0,
    tests: makeTests({
      handSize: 5, handsPerTest: 10,
      fixed: [
        ['KS 2H 3D 4C 5H', '2H 3H 4D 5C 6C', 'AH KD QC JH TD', '9D 9C 9H 2S 3D', 'AS KS QS JS TS',
          '2D 3D 4D 5D 6D', 'KC QC JC TC 9C', '6H 7H 8H 9H 2S'],
        // back-to-back spades and no-spades, to catch overtaking verdicts
        ['AS 2H 3D 4C 5H', '2H 3H 4D 5C 6C', '3S 4H 5D 6C 7H', '4H 5H 6D 7C 8C',
          '5S 6H 7D 8C 9H', '6H 7H 8D 9C TC', '7S 8S 9S TS JS', '8H 9H TD JC QC'],
        ['AS 2H 3D 4C 5H', '3S 4H 5D 6C 7H', '5S 6H 7D 8C 9H', '7S 8S 9S TS JS',
          '2H 3H 4D 5C 6C', '4H 5H 6D 7C 8C', '6H 7H 8D 9C TC', '8H 9H TD JC QC'],
      ],
      nRandom: 4, seed: 124,
    }),
  },
  {
    id: 'seven-heaven',
    chapter: 4,
    card: '8S',
    title: 'Seven Heaven',
    story: [
      'The Owner\'s note this week is three sevens long. A five-card hand with three or more sevens wins, and the note adds that the house is not superstitious.',
      'Your newest croupier collects cards until she holds as many as you tell her, then deals the first of them out as one hand and keeps the rest for the next.',
    ],
    brief: 'Five-card hands. Pay out every hand with three or four 7s.',
    handSize: 5,
    floor: floorOf(hexRect(-3, 2, -7, 4), L8, [[-1, 1]]),
    fixed: L8,
    croupiers: paletteThrough('hand'),
    warRules: ALL,
    pays: (h) => countOf(h, '7') >= 3,
    tests: makeTests({
      handSize: 5, handsPerTest: 10,
      fixed: [['7S 7D 7C 2H 3S', '7S 7D 2C 3H 4S', '7S 7D 7C 7H 2S', 'KS KD KC 2H 3S', '2S 7D 3C 7H 7S',
        '8S 8D 8C 8H 7S', '6S 6D 7C 8H 8S', '7H 7C 2D 2S 2C', 'AS 7H 7D KC 7C', '7D 6D 5D 4D 3D']],
      nRandom: 4, seed: 144,
    }),
  },
  {
    id: 'suit-yourself',
    chapter: 4,
    card: '9S',
    title: 'Suit Yourself',
    story: [
      'Dmitri has a new spreadsheet, with one column for each suit. Every card played tonight goes into its suit\'s column, in the order it was played, top card first, and every time a column reaches five cards, those five are a flush and the house pays them out as one hand, however many hands they came from.',
      'Then the column starts again. Cards left in a column at closing time stay with the house. Dmitri calls this fair; the Owner calls it accounting.',
    ],
    brief: 'Five-card hands. Every time five cards of one suit have been played (since that suit last paid), pay out those five as one hand. Cards count in the order played, top card first.',
    handSize: 5,
    floor: floorOf(hexRect(-3, 3, -7, 5), L9),
    fixed: L9,
    croupiers: paletteThrough('hand'),
    warRules: ALL,
    expected: flushesOf,
    tests: makeTests({
      handSize: 5, handsPerTest: 10,
      fixed: [
        // flushes as dealt, and flushes that take several hands to build
        ['2S 3S 4S 5S 6S', 'AH 2D 3C 4H 5D', '7H 8H 9H TH 6D', 'JS QS KS AS 7D', '8D 9D 2C 3C 4C',
          'TD 5C 6C 7C 8C', 'AC TS JD QD KD', '9C 2H 3H 4D 5H'],
        // one suit only, then nothing completes
        ['AS 2S 3S 4S 5S', '6S 7S 8S 9S TS', 'JS QS KS AH 2H', '3H 4D 5C 6H 7D'],
        ['AH KD QC JS 2H'],
      ],
      nRandom: 4, seed: 155,
    }),
  },
  {
    id: 'change-of-heart',
    chapter: 4,
    card: 'TS',
    title: 'Change of Heart',
    story: [
      'It is Old Thursday\'s birthday, and the families have had a whip-round. Every spade played tonight is changed at the chip desk for the heart of the same rank, out of the house\'s own cards: a 7 of hearts for the 7 of spades, an ace for an ace. The hearts all go to Thursday.',
      'The spades stay with the house, and every other card is just a card. Thursday says it is the best birthday he has had in forty years of betting on hearts.',
    ],
    brief: 'Single cards. For every spade played, pay out the heart of the same rank (a house card). Nothing else is paid.',
    handSize: 1,
    floor: floorOf(hexRect(-3, 2, -7, 5), L10),
    fixed: L10,
    croupiers: paletteThrough('hand'),
    warRules: ALL,
    expected: (inputs) => inputs.filter((h) => suitOf(h[0]) === 'S').map((h) => [`${rankOf(h[0])}H`]),
    tests: makeTests({
      handSize: 1, handsPerTest: 26,
      fixed: [
        one('AS KS 7S 2H 7H 2S QD TS 3C'),
        one('AH 2D 3C 4H 5D'),
        one('KS QS JS TS 9S 8S 7S 6S 5S 4S 3S 2S AS'),
        one('7S 7S 7D 7S'),
      ],
      nRandom: 4, seed: 156,
    }),
  },
  {
    id: 'next-in-line',
    chapter: 4,
    card: 'JS',
    title: 'Next in Line',
    story: [
      'The mayor\'s napkin has grown a new column. A single card wins if it is next in rank to the card played just before it, one up or one down: a 9 after an 8 or a 10.',
      'The ace sits next to both the 2 and the king, but the king and the 2 are not neighbours, and a card is never next to itself. The first card of the night is compared with a 7, because the Owner says so.',
    ],
    brief: 'Pay out every card one rank above or below the card before it (the first card is compared with a 7).',
    handSize: 1,
    floor: floorOf(hexRect(-2, 2, -7, 5), L11, [[0, 1]]),
    fixed: L11,
    croupiers: paletteThrough('hand'),
    warRules: ALL,
    pays: (h, before) => isStraight([h[0], before.length ? last(before)[0] : '7C']),
    tests: makeTests({
      handSize: 1, handsPerTest: 20,
      fixed: [
        one('8S 9S TD JC QH KS AS 2D 3C 3H 2S KD AH QS QD JD 2H'),
        one('7S 7D 6C 5H 5S AS KH 2C AD 2H'),
        one('6D'), one('KC'),
      ],
      nRandom: 4, seed: 147,
    }),
  },
  {
    id: 'jacks-or-better',
    chapter: 4,
    card: 'QS',
    title: 'Jacks or Better',
    story: [
      'The rival\'s old owner has one last thing to sell: a video poker machine. The Owner had it put in by the bar, then replaced it overnight with a croupier, on principle.',
      'Jacks or Better: a five-card hand wins with a pair of jacks or better (jacks, queens, kings or aces), two pair, three of a kind, a straight (aces high or low), a flush, a full house, four of a kind or a straight flush. A pair of tens wins nothing.',
    ],
    brief: 'Five-card hands. Pay out a pair of jacks or better, two pair, trips, a straight, a flush, a full house, quads or a straight flush.',
    handSize: 5,
    floor: floorOf(hexRect(-3, 2, -8, 7), L12),
    fixed: L12,
    croupiers: paletteThrough('hand'),
    warRules: ALL,
    pays: jacksOrBetter,
    tests: makeTests({
      handSize: 5, handsPerTest: 10,
      fixed: [
        ['JS JD 2C 5H 9S', 'TS TD 2C 5H 9S', 'AS AD 3C 6H 8S', '2S 2D 3C 3H 9S', '4S 4D 4C 8H KS',
          'AS 2D 3C 4H 5S', 'TS JD QC KH AS', '2H 6H 9H JH KH', 'QS QD QC 7H 7S', '9S 9D 9C 9H 2S'],
        ['5D 6D 7D 8D 9D', '2S 5D 9C JH KS', 'KS KD 3C 6H 8S', '3S 3D 7C 7H QS', '9S TD JC QH 2S',
          'QH QC 4D 8S AS', 'AC KC QC JC TC', '7S 7D 4C 2H 9S', '2C 3D 4H 5S 7C', 'JH JC TD TS 3H'],
        // pairs that need a closer look, back to back: high pairs and two pair, then low pairs
        ['JS JD 2C 5H 9S', 'QS QD 2C 5H 9S', '2S 2D 3C 3H 9S', 'KS KD 3C 6H 8S', 'AS AD 3C 6H 8S',
          '4S 4D 9C 9H KS', '2H 2C 5D 9S KD', '3H 3C 6D TS QD', '9H 9C 4D 7S KD', 'TH TC 3D 6S 8D'],
        // alternating with hands that fail fast or pay at once
        ['JS JD 2C 5H 9S', '2S 5D 9C JH KS', 'TH TC 3D 6S 8D', '2H 6H 9H JH KH', 'QS QD 2C 5H 9S',
          '4S 4D 4C 8H KS', '9H 9C 4D 7S KD', '3S 7D 9C JH KD', '2S 2D 3C 3H 9S', 'AS 2D 3C 4H 5S'],
      ],
      nRandom: 4, seed: 148,
    }),
  },
  {
    id: 'house-record',
    chapter: 4,
    card: 'KS',
    title: 'House Record',
    story: [
      'Tonight the city belongs to The Stacked Deck. The mayor, the commissioner, the council and both families are at one table, and there is one game left: a hand wins if its largest set ties or beats the largest set of every hand before it.',
      'When it\'s over, there will be an envelope under the cash tray with your name on it, sealed with an ace of spades.',
    ],
    brief: 'Five-card hands. Pay out every hand whose largest set ties or beats every earlier hand\'s.',
    handSize: 5,
    floor: floorOf(hexRect(-8, 0, -6, 9), L13),
    fixed: L13,
    croupiers: paletteThrough('hand'),
    warRules: ALL,
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

// Par, from the reference solutions in solutions/levels/ (croupiers including
// shoes; rounds averaged over the level's tests and rounded). test/levels.js
// checks these exactly; `node tools/write-solutions.js spades --par` rewrites
// this table from the recipes in tools/level-specs/spades.js.
// BEGIN PAR
const PAR = {
  'hot-streak': { croupiers: 4, rounds: 13 },
  'high-roller': { croupiers: 4, rounds: 18 },
  'burn-card': { croupiers: 3, rounds: 11 },
  'third-time-lucky': { croupiers: 2, rounds: 8 },
  'full-house': { croupiers: 13, rounds: 58 },
  'the-wheel': { croupiers: 6, rounds: 11 },
  'calling-card': { croupiers: 11, rounds: 30 },
  'seven-heaven': { croupiers: 5, rounds: 34 },
  'suit-yourself': { croupiers: 9, rounds: 9 },
  'change-of-heart': { croupiers: 6, rounds: 87 },
  'next-in-line': { croupiers: 5, rounds: 17 },
  'jacks-or-better': { croupiers: 19, rounds: 18 },
  'house-record': { croupiers: 31, rounds: 105 },
};
// END PAR
finishChapter(LEVELS, PAR);
