// The bonus deck: floors outside the 56-card campaign. Each opens once its
// `unlockAfter` campaign floor is solved, and has its own card in the bonus
// deck: A..K of spades, then of hearts, of a second deck, in this list's order (which follows
// the unlockAfter floors' order in the campaign). Some are floors cut from
// the campaign to make room (their ids are unchanged, since saves are keyed
// by id); the others are extra floors, from 6♠ on for players who have
// everything (every croupier, both War rules, every special card), roughly
// easiest first. Crossed Wires and Uneven Tables seat three players (and
// label three desks); Mirror Image, Showdown and Twice Shy seat two. See
// docs/campaign.md.
import {
  hexRange, hexRect, makeTests, makeMixedTests, dealtTests, floorOf, source, desk, E, SE, NE,
  hv, high, one, paletteThrough, finishChapter,
} from './shared.js';
import {
  RANKS, rankOf, suitOf, rankValue, highValue, largestSet, rankCounts, fullDeck, shuffled,
} from '../cards.js';

const B1 = [source([-3, 0], E), desk([1, 0])];
const B2 = [source([-3, 0], E), desk([0, 0])];
const B3 = [source([-2, 0], E), desk([2, 0])];
const B4 = [source([-3, 0], E), desk([-1, 0])];
const B5 = [source([-3, 0], E), desk([0, 0])];
const B6 = [source([-3, 0], E), desk([1, 0])];
const B7 = [source([-3, 0], E), desk([-2, 2])];
const B8 = [source([-3, 0], E), desk([-2, 2])];
const B9 = [source([-4, 0], E), desk([-2, 1])];
const B10 = [source([-4, 0], E), desk([-3, 2])];
const B11 = [source([-5, 0], E), desk([-4, 2])];
// Two seated players: hand i of a test is player A's for even i, B's for odd.
const seated = (at, out, seat) => ({ ...source(at, out), seat });
const B12 = [seated([-5, 0], E, 0), seated([-5, 1], NE, 1), desk([-4, 2])];
const B13 = [seated([-6, -4], E, 0), seated([-6, -3], NE, 1), desk([-7, -1])];
const H1 = [source([-3, 0], E), desk([-3, 2])];
const H2 = [source([-2, 1], E), desk([-2, 3])];
// Three seated players down the left of a 6 x 9 floor, a row apart, and
// three labelled desks (X, Y, Z from the top) down the right.
const H4 = [source([-4, 0], E), desk([1, 2])];
const H5 = [seated([-6, 4], E, 0), seated([-5, 3], SE, 1), desk([-4, 7])];
const labelled = (at, n) => ({ ...desk(at), desk: n });
const H3 = [
  seated([-2, -2], E, 0), seated([-3, 0], E, 1), seated([-4, 2], E, 2),
  labelled([3, -2], 0), labelled([2, 0], 1), labelled([1, 2], 2),
];

const ALL = ['high', 'top'];
const last = (before) => before[before.length - 1];
// The cards of the most common rank(s), and the rest.
function splitSet(h) {
  const counts = rankCounts(h);
  const max = Math.max(...counts.values());
  return [h.filter((c) => counts.get(rankOf(c)) === max), h.filter((c) => counts.get(rankOf(c)) !== max)];
}
// The rank gaps between two cards, with the ace played low and high.
const gaps = ([a, b]) => new Set([Math.abs(rankValue(a) - rankValue(b)), Math.abs(highValue(a) - highValue(b))]);
// Pay the first hand holding a 2, then the first after it holding a 3, and
// so on up to the ace, then a 2 again.
function countingUp(h, before) {
  let want = 1;
  for (const b of before) if (b.some((c) => rankOf(c) === RANKS[want])) want = (want + 1) % 13;
  return h.some((c) => rankOf(c) === RANKS[want]);
}
// One Up: the next card up in the same suit (the king's is the ace).
const oneUp = (c) => RANKS[(RANKS.indexOf(rankOf(c)) + 1) % 13] + suitOf(c);
// Two players' hands, as [player A's, player B's] for each deal.
const deals = (inputs) => Array.from({ length: Math.floor(inputs.length / 2) }, (_, i) => [inputs[2 * i], inputs[2 * i + 1]]);
const same = (a, b) => [...a].sort().join() === [...b].sort().join();
// Showdown: the higher hand of a deal, comparing the highest cards, then
// the middle ones, then the lowest (aces high); 0 on a tie.
const ranked = (h) => h.map(hv).sort((x, y) => y - x);
function showdown(a, b) {
  const x = ranked(a), y = ranked(b);
  const i = x.findIndex((v, j) => v !== y[j]);
  return i < 0 ? 0 : x[i] > y[i] ? 1 : -1;
}
// Mirror Image tests: each player deals from their own deck; player B's
// hand is often player A's cards reordered, or one card off.
function mirrorDeals(rand, nTests, nDeals) {
  const tests = [];
  for (let t = 0; t < nTests; t++) {
    const d1 = shuffled(fullDeck(), rand), d2 = shuffled(fullDeck(), rand);
    const test = [];
    for (let i = 0; i < nDeals; i++) {
      const a = d1.splice(0, 5);
      const x = rand();
      let b;
      if (x < 0.45) b = shuffled(a, rand);
      else if (x < 0.7) {
        // one card swapped for another of the same rank or the same suit
        b = shuffled(a, rand);
        const k = Math.floor(rand() * 5), c = b[k];
        const alts = fullDeck().filter((y) => !a.includes(y) && (rankOf(y) === rankOf(c) || suitOf(y) === suitOf(c)));
        b[k] = alts[Math.floor(rand() * alts.length)];
      } else b = d2.splice(0, 5);
      test.push(a, b);
    }
    tests.push(test);
  }
  return tests;
}
// Crossed Wires: each player's hands go to the desk diametrically opposite
// (player A's, the top seat, to desk Z, the bottom desk). A missing hand
// (a player with fewer hands) is null.
const crossed = (inputs) => inputs.flatMap((h, i) => (h ? [{ desk: 2 - (i % 3), hand: h }] : []));
// Three players with different numbers of hands (0 to 6 each), 1 to 3
// cards each, from one deck: the deals in turn, null where a player has
// run out.
function unevenDeals(rand, nTests) {
  const tests = [];
  for (let t = 0; t < nTests; t++) {
    const counts = shuffled([0, 1, 2, 3, 4, 5, 6], rand).slice(0, 3);
    const deck = shuffled(fullDeck(), rand);
    const test = [];
    for (let i = 0; i < 3 * Math.max(...counts); i++) {
      test.push(Math.floor(i / 3) < counts[i % 3] ? deck.splice(0, 1 + Math.floor(rand() * 3)) : null);
    }
    tests.push(test);
  }
  return tests;
}
// Fixed tests for Uneven Tables: each player's hands as a list, interleaved.
const seats3 = (...players) => Array.from({ length: 3 * Math.max(...players.map((p) => p.length)) },
  (_, i) => players[i % 3][Math.floor(i / 3)] ?? null);

// Twice Shy: every hand, less the cards played more than once tonight (by
// either player; a hand left with no cards pays nothing).
function onceOnly(inputs) {
  const n = new Map();
  for (const c of inputs.flat()) n.set(c, (n.get(c) ?? 0) + 1);
  return inputs.map((h) => h.filter((c) => n.get(c) === 1)).filter((h) => h.length);
}
// Two players, each with a deck of their own: `nDeals` five-card hands each.
function twoDeckDeals(rand, nTests, nDeals) {
  const tests = [];
  for (let t = 0; t < nTests; t++) {
    const a = shuffled(fullDeck(), rand), b = shuffled(fullDeck(), rand);
    tests.push(Array.from({ length: 2 * nDeals }, (_, i) => (i % 2 ? b : a).splice(0, 5)));
  }
  return tests;
}

// The Rest of the Deck: every card of the deck nobody played, one at a time.
const unplayed = (inputs) => {
  const played = new Set(inputs.flat());
  return fullDeck().filter((c) => !played.has(c)).map((c) => [c]);
};

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
    id: 'two-apart',
    card: '6S',
    unlockAfter: 'deja-vu',
    title: 'Two Apart',
    story: [
      'The doormen are back on their break, and they have a new game for it. A two-card hand wins if its cards are exactly two ranks apart: a 5 with a 7, a 10 with a queen.',
      'The ace plays high or low, so an ace with a 3 wins, and so does a queen with an ace. A king with a 2 is not two apart, however you count it.',
    ],
    brief: 'Two-card hands. Pay out every hand whose cards are exactly two ranks apart (ace high or low).',
    handSize: 2,
    floor: floorOf(hexRect(-2, 2, -7, 5), B7),
    fixed: B7,
    croupiers: paletteThrough('hand'),
    warRules: ALL,
    specialCards: ['?', '??', '$', '$$'],
    pays: (h) => gaps(h).has(2),
    tests: makeTests({
      handSize: 2, handsPerTest: 20,
      fixed: [
        ['AS 3D', '3C AH', 'QS AD', 'AC QH', 'KS 2D', '5S 7D', '7C 5H', '5D 6S', '9S 9D', '2S 5D',
          'TS QD', 'KD JC', '2C 4H', 'AH 2H', 'KH AS', '8S TS'],
        // two apart back to back, then not
        ['3S 5D', '6C 4H', 'JS 9D', 'KC JH', 'AD 3C', '3H 4S', 'KS AC', '7D 7C', '2D 6H', '8C JD'],
      ],
      nRandom: 4, seed: 171,
    }),
  },
  {
    id: 'three-apart',
    card: '7S',
    unlockAfter: 'deja-vu',
    title: 'Three Apart',
    story: [
      'The doormen have told the cloakroom, and the cloakroom plays it one better: a two-card hand wins if its cards are exactly three ranks apart, a 4 with a 7 or a 10 with a king.',
      'The ace still plays high or low: an ace with a 4 wins, and so does a jack with an ace.',
    ],
    brief: 'Two-card hands. Pay out every hand whose cards are exactly three ranks apart (ace high or low).',
    handSize: 2,
    floor: floorOf(hexRect(-2, 2, -7, 5), B8),
    fixed: B8,
    croupiers: paletteThrough('hand'),
    warRules: ALL,
    specialCards: ['?', '??', '$', '$$'],
    pays: (h) => gaps(h).has(3),
    tests: makeTests({
      handSize: 2, handsPerTest: 20,
      fixed: [
        ['AS 4D', '4C AH', 'JS AD', 'AC JH', 'KS 3D', '2S 5D', '9C 6H', '7S 9D', '7S TD', 'TC KD',
          '6S 7H', '8D 8C', 'AD 3S', 'QS AC', '2H 6C', '5H 8S'],
        // three apart back to back, then not
        ['3S 6D', '9C 6H', 'QS 9D', 'KC TH', 'AD 4C', '3H 5S', 'KS AC', '7D 7C', '2D 7H', '8C 9D'],
      ],
      nRandom: 4, seed: 172,
    }),
  },
  {
    id: 'crossed-wires',
    card: '8S',
    unlockAfter: 'deja-vu',
    title: 'Crossed Wires',
    story: [
      'The Owner has had the floor rewired: three card tables down one wall, three cash desks down the other, and a note under the tray. Every player is to be paid at the desk diametrically opposite their seat, so that the money is seen to cross the room.',
      'Player A, at the top, is paid at desk Z, at the bottom; player B, in the middle, at desk Y; player C, at the bottom, at desk X. The Marchetti twins have brought a cousin, and all three are already arguing about the view.',
    ],
    brief: 'Three players, hands of 1 to 3 cards. Pay out every hand at the desk diametrically opposite its player: A\'s at Z, B\'s at Y, C\'s at X.',
    handSize: [1, 3],
    floor: floorOf(hexRect(-4, 4, -6, 5), H3),
    fixed: H3,
    croupiers: paletteThrough('hand'),
    warRules: ALL,
    specialCards: ['?', '??', '$', '$$'],
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
    id: 'uneven-tables',
    card: '9S',
    unlockAfter: 'deja-vu',
    title: 'Uneven Tables',
    story: [
      'The wiring stays, and so does the rule: every player is paid at the desk diametrically opposite their seat. But the cousins have stopped playing in step. Tonight each of the three plays as many hands as they like, from none at all to six.',
      'Each player still plays their own hands in their own order. The cousin at table B says he is only here for the view.',
    ],
    brief: 'Three players, hands of 1 to 3 cards, each playing a different number of hands (perhaps none). Pay out every hand at the desk diametrically opposite its player: A\'s at Z, B\'s at Y, C\'s at X.',
    handSize: [1, 3],
    floor: floorOf(hexRect(-4, 4, -6, 5), H3),
    fixed: H3,
    croupiers: paletteThrough('hand'),
    warRules: ALL,
    specialCards: ['?', '??', '$', '$$'],
    expected: crossed,
    tests: dealtTests({
      deal: unevenDeals,
      fixed: [
        seats3(['AS', '2S 3S', '4S 5S 6S', '7S'], ['AH 2H'], ['KD', 'QD JD', 'TD', '9D 8D', '7D', '6D 5D 4D']),
        // a player with no hands, then one with all of them
        seats3([], ['KS QS', 'JS', 'TS 9S'], ['AC']),
        seats3(['2C 3C', '4C', '5C 6C 7C', '8C', '9C', 'TC'], [], []),
      ],
      nRandom: 4, seed: 181,
    }),
  },
  {
    id: 'four-of-a-kind',
    card: 'TS',
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
  {
    id: 'counting-up',
    card: 'JS',
    unlockAfter: 'deja-vu',
    title: 'Counting Up',
    story: [
      'Old Thursday is counting his way through the deck tonight. He pays the first five-card hand that holds a 2, then the first hand after that which holds a 3, then a 4, and so on up through the king to the ace.',
      'After the ace he starts again at 2. A hand only ever counts for the rank he is waiting for, however many others it holds.',
    ],
    brief: 'Five-card hands. Pay out the first hand holding a 2, then the next hand holding a 3, and so on up to the ace, then 2 again.',
    handSize: 5,
    floor: floorOf(hexRect(-3, 3, -9, 5), B9),
    fixed: B9,
    croupiers: paletteThrough('hand'),
    warRules: ALL,
    specialCards: ['?', '??', '$', '$$'],
    pays: countingUp,
    tests: makeTests({
      handSize: 5, handsPerTest: 10,
      fixed: [
        // one rank per hand, all the way round and on to 2 again
        ['2S 9D 9C 9H 9S', '3S TD TC TH TS', '4S 4D JC JH JS', '5S QD QC QH QS', '6S KD KC KH KS',
          '7S 8D 8C 8H 8S', '8S 9D 9C 9H 9S', '9S 2D 2C 2H 2S', 'TS 3D 3C 3H 3S', 'JS 4D 4C 4H 4S',
          'QS 5D 5C 5H 5S', 'KS 6D 6C 6H 6S', 'AS 7D 7C 7H 7S', '3D 4D 5D 6D 7D', '2D 3H 4H 5H 6H'],
        // the next rank is often in the hand just paid; several in one hand count once
        ['2S 3S 4S 5S 6S', '3D 4D 5D 6D 7D', 'KS KD KC KH QS', '4C 5C 6C 7C 8C', '2H 3H 4H 5H 6H',
          '5D 6D 7D 8D 9D', 'AS AD AC AH 2S', '6S 6D 7S 7D 8S'],
        ['3S 4S 5S 6S 7S', '9S 9D 9C 9H TS', '2S 2D 2C 2H 3D', '2S 2D 4C 4H 5D', '3C 3H 4S 5S 6S'],
      ],
      nRandom: 4, seed: 173,
    }),
  },
  {
    id: 'rising',
    card: 'QS',
    unlockAfter: 'deja-vu',
    title: 'Rising',
    story: [
      'The string quartet has given up on beats and taken up scales. Hands of any size from one card to six win if they climb: every card at least as high as the card above it, aces high.',
      'A card may repeat the rank above it, so 3 7 7 J climbs. A single card climbs on its own, the second violin points out, and nobody argues.',
    ],
    brief: 'Hands of 1 to 6 cards. Pay out every hand whose cards never go down from top to bottom (aces high; equal ranks are fine).',
    handSize: [1, 6],
    floor: floorOf(hexRect(-3, 3, -9, 9), B10),
    fixed: B10,
    croupiers: paletteThrough('hand'),
    warRules: ALL,
    specialCards: ['?', '??', '$', '$$'],
    pays: (h) => h.every((c, i) => i === 0 || hv(c) >= hv(h[i - 1])),
    tests: makeMixedTests({
      minSize: 1, maxSize: 6, handsPerTest: 12,
      fixed: [
        ['2S 5D 5C KH AS', 'AS 2D', 'KS AD', '7H', '3S 4D 5C 6H 7S 8D', '8D 7S 6H 5C 4D 3S', 'QS QD QC',
          '2S 3D 4C 6H 5S', 'AS', '9S 9D 8C', 'JS QD', 'TD 2H'],
        // climbing hands back to back, then not, with a long one in each
        ['2S 3S 4S 5S 6S 7S', '5D 9D', 'AC', '3H 3S 3D 3C 4H', 'KS AS', '6D 6C',
          '7S 6S 5S 4S 3S 2S', '9D 5D', '2C AC 3C', 'AH KH', '4S 3S 4D 5D', 'JD TD JC'],
      ],
      nRandom: 4, seed: 174,
    }),
  },
  {
    id: 'rest-of-the-deck',
    card: 'KS',
    unlockAfter: 'deja-vu',
    title: 'The Rest of the Deck',
    story: [
      'Commissioner Pryce is auditing the house deck. Tonight one deck is played, in hands of one to five cards, and at closing time the house must hand him every card that was not played, one card at a time, so that he can count them.',
      'The cards played are the guests\' business and leave the floor as usual. The Commissioner counts slowly, and he has brought his own pencil.',
    ],
    brief: 'Hands of 1 to 5 cards, from one deck. After the last hand, pay out every card of the deck that was not played, as one-card hands (house cards).',
    handSize: [1, 5],
    floor: floorOf(hexRect(-2, 3, -9, 5), H4),
    fixed: H4,
    croupiers: paletteThrough('hand'),
    warRules: ALL,
    specialCards: ['?', '??', '$', '$$'],
    expected: unplayed,
    // The unplayed cards may be paid long after the last player card has
    // gone (51 of them, one a round, after a one-card night).
    grace: 100,
    tests: makeMixedTests({
      minSize: 1, maxSize: 5, handsPerTest: 6,
      fixed: [
        ['AS'],
        // every spade and every heart played; no diamonds or clubs
        ['AS 2S 3S 4S 5S', '6S 7S 8S 9S TS', 'JS QS KS', 'AH 2H 3H 4H 5H', '6H 7H 8H 9H TH', 'JH QH KH'],
        // pairs of every rank, and the last card of each suit
        ['AD AC', '2D 2C', 'KS', 'KH 3D 3C', '4D 4C 5D 5C', 'AS'],
      ],
      nRandom: 4, seed: 183,
    }),
  },
  {
    id: 'one-up',
    card: 'AH',
    unlockAfter: 'deja-vu',
    title: 'One Up',
    story: [
      'Old Thursday has one trick left, and he insists it is the best one. You show him a card, and he produces the next card up in the same suit: a 7 of clubs for a 6 of clubs, the ace for the king.',
      'The house pays out his card and keeps yours. He says he has a whole deck up his sleeve, and the house would be wise to keep one too.',
    ],
    brief: 'Single cards. For every card, pay out the next card up in the same suit (a house card; after the king comes the ace).',
    handSize: 1,
    floor: floorOf(hexRect(-3, 5, -7, 9), H2),
    fixed: H2,
    croupiers: paletteThrough('hand'),
    warRules: ALL,
    specialCards: ['?', '??', '$', '$$'],
    expected: (inputs) => inputs.map(([c]) => [oneUp(c)]),
    tests: makeTests({
      handSize: 1, handsPerTest: 6,
      fixed: [one('KS AS KH AH QD KD'), one('AD 2D KC AC QC JC'), one('7H'), one('2S 3S 4S 5S')],
      nRandom: 4, seed: 179,
    }),
  },
  {
    id: 'head-count',
    card: '2H',
    unlockAfter: 'deja-vu',
    title: 'Head Count',
    story: [
      'Commissioner Pryce has a new regulation, and this one he wrote himself. A hand of one to six cards wins if its top card says how many cards it holds: an ace on a hand of one, a 4 on a hand of four.',
      'He calls it honest labelling. A king on top never wins, since nobody holds thirteen cards, and nor does an ace on anything but a single card.',
    ],
    brief: 'Hands of 1 to 6 cards. Pay out every hand whose top card\'s rank is the number of cards in it (ace = 1).',
    handSize: [1, 6],
    floor: floorOf(hexRect(-5, 4, -11, 9), B11),
    fixed: B11,
    croupiers: paletteThrough('hand'),
    warRules: ALL,
    specialCards: ['?', '??', '$', '$$'],
    pays: (h) => rankValue(h[0]) === h.length,
    tests: makeMixedTests({
      minSize: 1, maxSize: 6, handsPerTest: 12,
      fixed: [
        ['AS', '2D 9C', '3H KS 4D', '4S 2D 7C 9H', '5D AS 2C 3H 4S', '6C 7D 8S 9H TC JD',
          '2S', 'AH 3S', '3C 4D', '5S 6D 7C 8H', '4H 2C 3D 5S 6H', 'KD QD JD TD 9D 8D'],
        // winners back to back, then losers of every size
        ['3S 9D 9C', '2H 7S', 'AD', '6S 2D 3C 4H 5S 7D', '4C 5D 6H 7S', '5H 8S 8D 8C 8H',
          'KS', '7D 8S', '2C 2D 2H', 'AH 2H 3H 4H', '3D 4D 5D 6D 7D', '5C 6C 7C 8C 9C TC'],
      ],
      nRandom: 4, seed: 175,
    }),
  },
  {
    id: 'mirror-image',
    card: '3H',
    unlockAfter: 'deja-vu',
    title: 'Mirror Image',
    story: [
      'The Marchetti twins are back, at two tables again, and each has brought a deck of their own. They play five-card hands side by side, one each per deal, and the house pays both hands when the twins hold exactly the same five cards.',
      'The order the cards come in doesn\'t matter, but the suits do: a pair of sevens is not the same as a pair of sevens.',
    ],
    brief: 'Two players, five-card hands, one each per deal. When both hold the same five cards (in any order), pay out both hands.',
    handSize: 5,
    floor: floorOf(hexRect(-4, 4, -11, 13), B12),
    fixed: B12,
    croupiers: paletteThrough('hand'),
    warRules: ALL,
    specialCards: ['?', '??', '$', '$$'],
    expected: (inputs) => deals(inputs).filter(([a, b]) => same(a, b)).flat(),
    tests: dealtTests({
      deal: (rand, n) => mirrorDeals(rand, n, 8),
      fixed: [
        ['AS 2S 3S 4S 5S', '5S 4S 3S 2S AS', 'KD QD JD TD 9D', 'KD QD JD TD 9C', '7S 7D 7C 7H 2S', '7S 7D 7C 7H 2D',
          '3C 8H JS 2D 6C', '6C 2D JS 8H 3C', '5H 9S KC 4D TH', '5H 9S KC 4D TH', 'AH KS 2C 3D 4H', 'AH KS 2C 3D 5H'],
        // matches back to back, then near misses back to back
        ['2C 4D 6H 8S TC', '8S TC 2C 6H 4D', 'JH QH KH AH 2H', '2H JH AH KH QH', '3S 5S 9D 9C QH', 'QH 9C 9D 5S 3S',
          'AD 3D 5D 7D 9D', 'AD 3D 5D 7D 9H', '4C 6C 8C TC QC', '4C 6C 8C TC KC', 'KS QS JS TS 9S', 'KS QS JS TS 8S'],
      ],
      nRandom: 4, seed: 176,
    }),
  },
  {
    id: 'last-in-first-out',
    card: '4H',
    unlockAfter: 'deja-vu',
    title: 'Last In, First Out',
    story: [
      'The cloakroom has a new attendant, and a new rule: tickets are for amateurs. Guests hand over hands of one to five cards on the way in, and at the end of the night the house pays every one of them back, the last hand handed in first, then the one before it, and so on back to the first.',
      'The cards of a hand may come back in any order, but the hands must come back in exactly that order. The attendant knows the night is over when the guests stop arriving.',
    ],
    brief: 'Hands of 1 to 5 cards. Pay out every hand, in the reverse of the order they were played: the last hand first.',
    handSize: [1, 5],
    floor: floorOf(hexRect(-3, 5, -9, 9), H1),
    fixed: H1,
    croupiers: paletteThrough('hand'),
    warRules: ALL,
    specialCards: ['?', '??', '$', '$$'],
    expected: (inputs) => [...inputs].reverse(),
    inOrder: true,
    tests: makeMixedTests({
      minSize: 1, maxSize: 5, handsPerTest: 8,
      fixed: [
        ['AS', '2D 3C', '4H 5S 6D', '7C 8H 9S TD', 'JC QH KS AD 2C'],
        // the same cards twice, single cards back to back, and one hand alone
        ['KS QS', '3H', '3D', '9D 9C 9H 9S', 'KS QS', '5C 6C 7C 8C TC', 'AH', '2S 4S'],
        ['7D 8D 9D'],
      ],
      nRandom: 4, seed: 178,
    }),
  },
  {
    id: 'showdown',
    card: '5H',
    unlockAfter: 'deja-vu',
    title: 'Showdown',
    story: [
      'Sal Vellani and Dmitri have agreed to settle things at the table, three cards each, one hand each per deal. The house pays the better hand: highest card against highest card, and if those match, middle against middle, then lowest against lowest.',
      'Aces are high. Suits don\'t count, and if all three ranks match the house pays neither of them, which both agree is the only fair result.',
    ],
    brief: 'Two players, three-card hands, one each per deal. Pay out the higher hand, comparing highest cards, then middle, then lowest (aces high); on a tie pay neither.',
    handSize: 3,
    floor: floorOf(hexRect(-7, 5, -19, 9), B13),
    fixed: B13,
    croupiers: paletteThrough('hand'),
    warRules: ALL,
    specialCards: ['?', '??', '$', '$$'],
    expected: (inputs) => deals(inputs).flatMap(([a, b]) => {
      const w = showdown(a, b);
      return w > 0 ? [a] : w < 0 ? [b] : [];
    }),
    tests: makeTests({
      handSize: 3, handsPerTest: 16,
      fixed: [
        ['AS 2D 3C', 'KS QD JC', '2S 9D 5C', '9H 3S 4D', 'QS 7D 7C', '7H QD 8S', '4S 4D 2C', '4C 4H 3S',
          'JS 6D 2C', '2D JC 6S', 'TS 9D 8C', '8D TC 9S', '5S 5D 5C', 'KD 2H 3H', 'AD AC 2S', 'AH AS 3D'],
        // the first or second cards tie, back to back
        ['KS 9D 2C', '2S 9C KH', 'KD 9S 3C', '3D KC 9H', 'QS JD 5C', 'JS 5D QC', '8S 7D 6C', '8D 6S 7C',
          'AS 2D 2C', '2S AD 3C', '6S 6D 6C', '6H 6S 5D'],
      ],
      nRandom: 4, seed: 177,
    }),
  },
  {
    id: 'twice-shy',
    card: '6H',
    unlockAfter: 'deja-vu',
    title: 'Twice Shy',
    story: [
      'The Marchetti twins have each brought a deck of their own again, and the Owner is tired of paying twice for the same card. Tonight the twins play five-card hands side by side, one each per deal, and every hand is paid out, less any card that turns up more than once over the whole night.',
      'Both copies of such a card go to the house, whichever twin played them and however many deals apart. A hand that loses all five pays nothing. The twins call it double jeopardy; the Owner calls it bookkeeping.',
    ],
    brief: 'Two players, five-card hands, one each per deal, each from their own deck. Pay out every hand without the cards played more than once tonight (by either player, in any hand); a hand with nothing left pays nothing.',
    handSize: 5,
    floor: floorOf(hexRect(0, 8, -8, 11), H5),
    fixed: H5,
    croupiers: paletteThrough('hand'),
    warRules: ALL,
    specialCards: ['?', '??', '$', '$$'],
    expected: onceOnly,
    tests: dealtTests({
      deal: (rand, n) => twoDeckDeals(rand, n, 4),
      fixed: [
        ['AS 2S 3S 4S 5S', '5S 4S 3S 2S AS', 'KD QD JD TD 9D', 'KD QH 7C 2D 9D', '7S 7D 7C 7H 8S', '3C 4H 5D 6S 2C'],
        // cards played again deals later
        ['2H 3H 4H 5H 6H', 'JS QS KS AC 2C', '7H 8H 9H TH JH', '9C TC JC QC KC', 'AD 2D 3D 4D 5D', '6H 2H AD 6D 7D',
          '6C 7C 8C 9S TS', 'JH 8D 5C 4C 3C'],
        // nothing in common: every hand is paid whole
        ['AS KH 2D QC 3S', 'JH 4D TC 5S 9H'],
      ],
      nRandom: 4, seed: 182,
    }),
  },
];

// Par, from the reference solutions in solutions/levels/ (croupiers including
// shoes; rounds totalled over the level's tests). test/levels.js
// checks these exactly; `node tools/write-solutions.js bonus --par` rewrites
// this table from the recipes in tools/level-specs/bonus.js.
// BEGIN PAR
const PAR = {
  'small-change': { croupiers: 6, rounds: 130 },
  'split-pot': { croupiers: 3, rounds: 56 },
  'every-other': { croupiers: 4, rounds: 90 },
  'after-a-pair': { croupiers: 13, rounds: 171 },
  'bookends': { croupiers: 5, rounds: 134 },
  'two-apart': { croupiers: 5, rounds: 120 },
  'three-apart': { croupiers: 7, rounds: 125 },
  'crossed-wires': { croupiers: 14, rounds: 68 },
  'uneven-tables': { croupiers: 18, rounds: 94 },
  'four-of-a-kind': { croupiers: 6, rounds: 533 },
  'counting-up': { croupiers: 9, rounds: 290 },
  'rising': { croupiers: 12, rounds: 214 },
  'rest-of-the-deck': { croupiers: 14, rounds: 1506 },
  'one-up': { croupiers: 16, rounds: 4076 },
  'head-count': { croupiers: 19, rounds: 676 },
  'mirror-image': { croupiers: 25, rounds: 383 },
  'last-in-first-out': { croupiers: 20, rounds: 835 },
  'showdown': { croupiers: 43, rounds: 296 },
  'twice-shy': { croupiers: 36, rounds: 1145 },
};
// END PAR
finishChapter(LEVELS, PAR);
