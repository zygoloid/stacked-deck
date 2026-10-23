// The bonus deck: floors outside the 56-card campaign. Each opens once its
// `unlockAfter` campaign floor is solved, and has its own card in the bonus
// deck: A..K of spades of a second deck, in this list's order (which follows
// the unlockAfter floors' order in the campaign). Some are floors cut from
// the campaign to make room (their ids are unchanged, since saves are keyed
// by id); the others are extra floors whose payouts are not simply the hands
// dealt. See docs/campaign.md.
import {
  hexRange, hexRect, makeTests, floorOf, source, desk, E,
  hv, high, one, paletteThrough, finishChapter,
} from './shared.js';
import { rankOf, largestSet, rankCounts } from '../cards.js';

const B1 = [source([-3, 0], E), desk([1, 0])];
const B2 = [source([-3, 0], E), desk([0, 0])];
const B3 = [source([-2, 0], E), desk([2, 0])];
const B4 = [source([-3, 0], E), desk([-1, 0])];
const B5 = [source([-3, 0], E), desk([0, 0])];
const B6 = [source([-3, 0], E), desk([1, 0])];

const ALL = ['high', 'top'];
const last = (before) => before[before.length - 1];
// The cards of the most common rank(s), and the rest.
function splitSet(h) {
  const counts = rankCounts(h);
  const max = Math.max(...counts.values());
  return [h.filter((c) => counts.get(rankOf(c)) === max), h.filter((c) => counts.get(rankOf(c)) !== max)];
}
// Every time the fourth unpaid card of a rank is played, those four.
function quadsOf(inputs) {
  const piles = {}, out = [];
  for (const [c] of inputs) {
    const pile = (piles[rankOf(c)] ??= []);
    pile.push(c);
    if (pile.length === 4) out.push(pile.splice(0));
  }
  return out;
}

export const LEVELS = [
  {
    id: 'small-change',
    card: 'AS',
    unlockAfter: 'beat-the-dealer',
    title: 'Small Change',
    story: [
      'Sal Vellani has a rule about kings: a king is too much money to leave on the table. Tonight, for every king played, the house hands over the ace of spades from its own cards, and keeps the king.',
      'Queens, aces and everything else are just cards, and pay nothing.',
    ],
    brief: 'Single cards. For every king played, pay out the ace of spades (a house card). Nothing else is paid.',
    handSize: 1,
    floor: floorOf(hexRect(-2, 2, -7, 4), B1),
    fixed: B1,
    croupiers: paletteThrough('war'),
    expected: (inputs) => inputs.filter(([c]) => rankOf(c) === 'K').map(() => ['AS']),
    tests: makeTests({
      handSize: 1, handsPerTest: 26,
      fixed: [one('KS QS AS KD 2C KH JD AH KC'), one('KH KD KC KS'), one('QS AD JC 2H')],
      nRandom: 4, seed: 161,
    }),
  },
  {
    id: 'split-pot',
    card: '2S',
    unlockAfter: 'top-pair',
    title: 'Split Pot',
    story: [
      'The rival casino has started splitting its pots, and the Owner will not be outdone. Any five-card hand with a pair or better is paid out in two parts: first its biggest set, then everything else, each part as a hand of its own.',
      'Two pair is one set of four cards; in a full house the set is the three of a kind and the pair goes with the rest. Hands without a pair pay nothing.',
    ],
    brief: 'Five-card hands. For every hand with a pair or better, pay out its largest set and the rest of the hand as two separate hands.',
    handSize: 5,
    floor: floorOf(hexRect(-2, 2, -7, 3), B2),
    fixed: B2,
    croupiers: paletteThrough('set'),
    expected: (inputs) => inputs.filter((h) => largestSet(h) >= 2).flatMap(splitSet),
    tests: makeTests({
      handSize: 5, handsPerTest: 10,
      fixed: [['KS KD 2C 3H 4S', '2S 5D 2C 9H 2H', 'AS AD KC KH 2S', 'QS QD QC 9H 9S', '7S 7D 7C 7H KS',
        'AS KD QC JH 9S', '2H 4H 6H 8H TH', '3S 3D 4C 4H 4S']],
      nRandom: 4, seed: 162,
    }),
  },
  {
    id: 'every-other',
    card: '3S',
    unlockAfter: 'ace-count',
    title: 'Every Other',
    story: [
      'Commissioner Pryce has taken his regulation home and framed it. With War played any way you like again, the string quartet has a game for the bar: a five-card hand wins if its highest card is its first or its third card. The first violin says those are the beats that matter.',
      'If the highest rank turns up twice, one of them in either place is enough. The second violin says this is no better than last time.',
    ],
    brief: 'Five-card hands. Pay out every hand whose highest card is its 1st or 3rd card (ties count).',
    handSize: 5,
    floor: floorOf(hexRange(2), B3),
    fixed: B3,
    croupiers: paletteThrough('deal'),
    warRules: ['high', 'top'],
    pays: (h) => Math.max(hv(h[0]), hv(h[2])) >= high(h),
    tests: makeTests({
      handSize: 5, handsPerTest: 10,
      fixed: [
        ['AS 2D 3C 4H 5S', '2S AD 3C 4H 5S', '2S 3D AC 4H 5S', '2S 3D 4C AH 5S', '2S 3D 4C 5H AS',
          'KS 2D 3C KH 4S', '2S KD 3C 4H KS', '2S 3D KC 4H KH', 'QS KD 2C 3H 4S', 'KS 2D 3C AH 4S'],
        // winners back to back, then losers back to back
        ['AS 2D 3C 4H 5S', '2S 3D AC 4H 5S', 'KS QD 2C 3H 4S', '7S 2D 7C 3H 4S', '9S TD JC 2H 3S',
          '2S AD 3C 4H 5S', '2S 3D 4C KH 5S', '2S 3D 4C 5H QS', 'JS QD 2C 3H 4S', '4S 5D 3C 6H 2S'],
      ],
      nRandom: 4, seed: 146,
    }),
  },
  {
    id: 'after-a-pair',
    card: '4S',
    unlockAfter: 'suit-yourself',
    title: 'After a Pair',
    story: [
      'Dmitri has a theory about streaks. A pair, he says, warms the table, so the hand after any hand holding a pair or better should win, whatever it holds itself.',
      'Two pair, three of a kind and the rest all count as a pair or better. The first hand of the night follows nothing and never wins. Dmitri has a spreadsheet for this as well.',
    ],
    brief: 'Five-card hands. Pay out every hand that comes straight after a hand holding a pair or better.',
    handSize: 5,
    floor: floorOf(hexRect(-3, 3, -7, 5), B4),
    fixed: B4,
    croupiers: paletteThrough('hand'),
    warRules: ALL,
    pays: (h, before) => before.length > 0 && largestSet(last(before)) >= 2,
    tests: makeTests({
      handSize: 5, handsPerTest: 10,
      fixed: [
        ['2S 2D 5C 9H KS', 'AS KD QC JH 9S', '3S 3D 3C 7H JS', 'KS KD QS QD 2H', '2H 4H 6H 8H TH',
          '4S 5D 6C 7H 8S', '9S 9D 4C 4H 9C', 'AH 3S 5D 7C JD', '6S 6D 6C 6H 2S', 'TS JD QC KH AS'],
        // pairs back to back, then no pairs back to back
        ['2S 2D 5C 9H KS', '3S 3D 6C TH QS', '4S 4D 7C JH KD', '5S 5D 8C QH AS', '6S 6D 9C KH AD',
          'AH KD QC JH 9S', '2H 4D 6C 8S TD', '3H 5D 7C 9S JD', '4H 6D 8C TS QD', '5H 7D 9C JS KD'],
        // alternating
        ['AH KD QC JH 9S', '2S 2D 5C 9H KS', '2H 4D 6C 8S TD', '3S 3D 6C TH QS', '3H 5D 7C 9S JD',
          '4S 4D 7C JH KD', '4H 6D 8C TS QD', '5S 5D 8C QH AS', '5H 7D 9C JS KD', '6S 6D 9C KH AD'],
      ],
      nRandom: 4, seed: 145,
    }),
  },
  {
    id: 'bookends',
    card: '5S',
    unlockAfter: 'change-of-heart',
    title: 'Bookends',
    story: [
      'The doormen\'s game has outlived the doormen\'s break. Two-card hands again, but now each hand is played against the one before it: a hand wins if its top card beats the bottom card of the previous hand.',
      'Aces are high and a tie loses, as ever. The first hand of the night has nothing to lean on and never wins. The Kesslers\' bottom dealer says he has always known the bottom card was the important one.',
    ],
    brief: 'Two-card hands. Pay out every hand whose top card beats the bottom card of the hand before it.',
    handSize: 2,
    floor: floorOf(hexRect(-2, 2, -7, 3), B5, [[-2, -1]]),
    fixed: B5,
    croupiers: paletteThrough('hand'),
    warRules: ALL,
    pays: (h, before) => before.length > 0 && hv(h[0]) > hv(last(before)[1]),
    tests: makeTests({
      handSize: 2, handsPerTest: 20,
      fixed: [
        ['KS 2D', '3C KH', 'AS 2H', '2D AC', 'AH 7S', '7D 9C', '9H 9S', 'TD 4C', '5S QD', '4H 3S', 'KD KC', 'AD 2S'],
        // the top card, not the higher card, must beat the bottom card before
        ['2S AD', 'AS 2D', '3C KH', 'KS 3D', 'QH QC', 'JS 5H', '6D JD', '5C 4D', '4S TH'],
      ],
      nRandom: 4, seed: 146,
    }),
  
  },
  {
    id: 'four-of-a-kind',
    card: '6S',
    unlockAfter: 'deja-vu',
    title: 'Four of a Kind',
    story: [
      'The city has learned your game, and asks for one more: single cards all night, and every time the fourth card of a rank turns up, the house pays out all four of them together, as one four of a kind, however long ago the first was played.',
      'Then that rank starts again from nothing. Cards still waiting for their fourth at closing time stay with the house.',
    ],
    brief: 'Single cards. Every time four cards of one rank have been played (since that rank last paid), pay out those four as one hand.',
    handSize: 1,
    floor: floorOf(hexRect(-3, 2, -7, 4), B6, [[-1, 1]]),
    fixed: B6,
    croupiers: paletteThrough('hand'),
    warRules: ALL,
    specialCards: ['?', '??', '$', '$$'],
    expected: quadsOf,
    tests: makeTests({
      handSize: 1, handsPerTest: 26,
      fixed: [
        one('7S 7D 2C 7H 2S KD 7C 2H AS 2D KH'),
        one('AS 2S 3S 4S 5S 6S 7S 8S 9S TS JS QS KS AD 2D 3D 4D 5D 6D 7D 8D 9D TD JD QD KD ' +
          'AC 2C 3C 4C 5C 6C 7C 8C 9C TC JC QC KC AH 2H 3H 4H 5H 6H 7H 8H 9H TH JH QH KH'),
        one('QH QS QD QC QH QS QD QC QH'),
        one('5C 9D 5H'),
      ],
      nRandom: 4, seed: 166,
    }),
  },
];

// Par, from the reference solutions in solutions/levels/ (croupiers including
// shoes; rounds averaged over the level's tests and rounded). test/levels.js
// checks these exactly; `node tools/write-solutions.js bonus --par` rewrites
// this table from the recipes in tools/level-specs/bonus.js.
// BEGIN PAR
const PAR = {
  'small-change': { croupiers: 6, rounds: 19 },
  'split-pot': { croupiers: 3, rounds: 11 },
  'every-other': { croupiers: 4, rounds: 15 },
  'after-a-pair': { croupiers: 13, rounds: 24 },
  'bookends': { croupiers: 5, rounds: 22 },
  'four-of-a-kind': { croupiers: 6, rounds: 67 },
};
// END PAR
finishChapter(LEVELS, PAR);
