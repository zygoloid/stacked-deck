// Level definitions. See docs/architecture.md for the format and
// docs/story.md for the campaign outline.
//
// Extra level fields used by this campaign (beyond the documented format):
//   warRules: ['high'] | ['top'] | ['high', 'top']
//     which War rules the player may choose on this level (defaults to
//     ['high']). Chapter 4 ("House Rules") allows top-card War only.
import {
  fullDeck, shuffled, rng, rankOf, suitOf, highValue, largestSet, rankCounts, isFlush, isStraight,
} from './cards.js';

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

// Hexes exactly `radius` away from [cq, cr].
export function hexRing(radius, [cq, cr] = [0, 0]) {
  const dist = ([q, r]) => (Math.abs(q) + Math.abs(r) + Math.abs(q + r)) / 2;
  return hexRange(radius).filter((h) => dist(h) === radius).map(([q, r]) => [cq + q, cr + r]);
}

// A screen rectangle: rows r0..r1, and in each row the hexes whose screen
// column x = 2q + r lies in x0..x1 (rows are offset by half a hex, as drawn).
export function hexRect(r0, r1, x0, x1) {
  const out = [];
  for (let r = r0; r <= r1; r++) {
    for (let x = x0; x <= x1; x++) if (((x - r) % 2 + 2) % 2 === 0) out.push([(x - r) / 2, r]);
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

// Floor helpers: remove hexes (fixed cells, pillars) from a list of hexes.
const k = ([q, r]) => `${q},${r}`;
export function without(hexes, ...remove) {
  const gone = new Set(remove.flat().map((x) => k(Array.isArray(x) ? x : x.at)));
  const seen = new Set();
  return hexes.filter((h) => !gone.has(k(h)) && !seen.has(k(h)) && seen.add(k(h)));
}
const floorOf = (hexes, fixed, ...holes) => without(hexes, fixed, ...holes);

// Fixed cells.
const E = 0, SE = 1, SW = 2, W = 3, NW = 4, NE = 5;
const source = (at, out) => ({ at, kind: 'source', out });
const desk = (at) => ({ at, kind: 'payout' });

// Hand predicates.
const hv = highValue;
const high = (h) => Math.max(...h.map(hv));
const isRed = (c) => suitOf(c) === 'H' || suitOf(c) === 'D';
const one = (s) => s.split(' ');            // '2S 3S' -> ['2S', '3S'] (1-card hands)
const spadesOf = (h) => h.filter((c) => suitOf(c) === 'S');

// Every 1-card hand of one suit, A..K.
const suitRun = (s) => ['A', '2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K'].map((r) => r + s);

// Palettes, unlocked in order.
const P1 = ['pass'];
const P2 = [...P1, 'suits'];
const P3 = [...P2, 'straight'];
const P4 = [...P3, 'shoe', 'gather', 'cut'];
const P5 = [...P4, 'flush'];
const P6 = [...P5, 'kind'];
const P7 = [...P6, 'war'];
const P8 = [...P7, 'duplicate'];
const P9 = [...P8, 'set'];
const P10 = [...P9, 'inshuffle', 'outshuffle'];
const P11 = [...P10, 'deal'];
const P12 = [...P11, 'sort'];

// --- Chapter 1: Opening Night ------------------------------------------------

const L1 = [source([-2, 0], E), desk([2, 0])];
const L2 = [source([-3, 0], E), desk([3, 0])];
const L3 = [source([-2, 0], E), source([-2, 2], NE), desk([2, 0])];
const L4 = [source([-2, 0], E), desk([2, -1])];
const L5 = [source([-3, 1], E), desk([2, -2])];
const L6 = [source([-3, -1], SE), source([-3, 2], NE), desk([3, -1])];

// --- Chapter 2: Stacking the Deck --------------------------------------------

const L7 = [source([-2, 1], NE), desk([2, -1])];
const L8 = [source([-4, 0], E), desk([3, -1])];
const L9 = [source([-2, -1], E), desk([-1, 0])];
const L10 = [source([-2, 0], E), desk([2, 0])];

// --- Chapter 3: The Regulars ---------------------------------------------------

const L11 = [source([-2, 0], E), desk([2, 0])];
const L12 = [source([-2, 0], E), desk([2, -1])];
const L13 = [source([-2, 0], E), desk([2, 0])];
const L14 = [source([-2, 0], E), desk([3, 0])];
const L15 = [source([-3, 0], E), desk([2, 0])];
const L16 = [source([-3, 0], E), desk([2, 0])];

// --- Chapter 4: House Rules ----------------------------------------------------

const L17 = [source([-2, 0], E), desk([2, 0])];
const L18 = [source([-3, 0], E), desk([3, 0])];
const L19 = [source([-1, 0], E), desk([-2, -1])];
const L20 = [source([-1, 0], E), desk([-2, -1])];

// --- Chapter 5: The House Always Wins ----------------------------------------

const L21 = [source([-2, 0], E), desk([1, 0])];
const L22 = [source([0, 0], E), desk([3, 0])];
const L23 = [source([0, 0], E), desk([1, -1])];
const L24 = [source([0, 0], E), desk([1, -1])];
const L25 = [source([0, 0], NW), desk([-1, -2])];

export const CHAPTERS = {
  1: 'Opening Night',
  2: 'Stacking the Deck',
  3: 'The Regulars',
  4: 'House Rules',
  5: 'The House Always Wins',
};

export const LEVELS = [
  // ===== Chapter 1: Opening Night =====
  {
    id: 'opening-night',
    chapter: 1,
    title: 'Opening Night',
    story: [
      'Congratulations on your new job as floor manager of The Stacked Deck. The pay is good, the carpet is loud, and every croupier on staff knows exactly one move.',
      'Tonight\'s game is generous: every card a player lays down wins. Have your croupiers carry each card from the player to the cashier\'s desk.',
    ],
    brief: 'Pay out every card.',
    handSize: 1,
    floor: floorOf(hexRange(2), L1),
    fixed: L1,
    croupiers: P1,
    warRules: ['high'],
    pays: () => true,
    tests: makeTests({ handSize: 1, handsPerTest: 8, nRandom: 3, seed: 101 }),
  },
  {
    id: 'around-the-bar',
    chapter: 1,
    title: 'Around the Bar',
    story: [
      'The Owner, whom nobody has met, had a bar installed overnight. It sits squarely between the card table and the cashier.',
      'A note under the cash tray reads: "Do not move the bar." It is signed with a single ace of spades.',
    ],
    brief: 'Pay out every card. The bar is in the way.',
    handSize: 1,
    floor: floorOf(hexRing(2), L2),
    fixed: L2,
    croupiers: P1,
    warRules: ['high'],
    pays: () => true,
    tests: makeTests({ handSize: 1, handsPerTest: 8, nRandom: 3, seed: 102 }),
  },
  {
    id: 'two-tables',
    chapter: 1,
    title: 'Two Tables',
    story: [
      'The Marchetti twins insist on sitting at separate tables and insist even harder on being paid at the same desk.',
      'Cards can merge: any croupier takes cards from any side.',
    ],
    brief: 'Pay out every card from both tables.',
    handSize: 1,
    floor: floorOf(hexRange(2), L3),
    fixed: L3,
    croupiers: P1,
    warRules: ['high'],
    pays: () => true,
    tests: makeTests({ handSize: 1, handsPerTest: 10, nRandom: 3, seed: 103 }),
  },
  {
    id: 'hearts-only',
    chapter: 1,
    title: 'Hearts Only',
    story: [
      'Old Thursday, a retired stage magician, has bet on hearts every night for forty years. Tonight the house finally agrees to pay him for them.',
      'Your new croupier splits cards by suit. Any suit you don\'t give a direction to is dropped on the carpet, and cards on the carpet are gone for good.',
    ],
    brief: 'Pay out every heart. Drop everything else.',
    handSize: 1,
    floor: floorOf(hexRange(2), L4),
    fixed: L4,
    croupiers: P2,
    warRules: ['high'],
    pays: (h) => suitOf(h[0]) === 'H',
    tests: makeTests({
      handSize: 1, handsPerTest: 13,
      fixed: [one('AH 2S KH QD 3C 4H JH 5D 6S TH')],
      nRandom: 3, seed: 104,
    }),
  },
  {
    id: 'seeing-red',
    chapter: 1,
    title: 'Seeing Red',
    story: [
      'The Vellani family runs the diamond trade across the river. Their nephew Sal is here to "see how the place works" and wants red cards paid: hearts and diamonds both.',
      'Suits that share a side leave the splitter together. Mind the roulette wheel in the middle of the floor; the Owner says it stays.',
    ],
    brief: 'Pay out every red card (hearts and diamonds).',
    handSize: 1,
    floor: floorOf(hexRange(2), L5, [[0, 0], [1, 0]]),
    fixed: L5,
    croupiers: P2,
    warRules: ['high'],
    pays: (h) => isRed(h[0]),
    tests: makeTests({
      handSize: 1, handsPerTest: 16,
      fixed: [one('AH AD AS AC KD KH 2C 2S 7D 7H')],
      nRandom: 3, seed: 105,
    }),
  },
  {
    id: 'black-tie',
    chapter: 1,
    title: 'Black Tie',
    story: [
      'Not to be outdone, the Kessler crew from the coal yards books both tables for a black-tie evening. Spades and clubs only, please; the red cards can stay on the carpet.',
      'The floor is cramped tonight: the Owner has rented half of it to a string quartet.',
    ],
    brief: 'Pay out every black card (spades and clubs) from both tables.',
    handSize: 1,
    floor: floorOf(hexRect(-1, 1, -7, 4), L6),
    fixed: L6,
    croupiers: P2,
    warRules: ['high'],
    pays: (h) => !isRed(h[0]),
    tests: makeTests({
      handSize: 1, handsPerTest: 16,
      fixed: [one('AS AC AH AD KS KC 2H 2D QS 3C')],
      nRandom: 3, seed: 106,
    }),
  },

  // ===== Chapter 2: Stacking the Deck =====
  {
    id: 'back-to-back',
    chapter: 2,
    title: 'Back to Back',
    story: [
      'Business is good, so the house now deals two cards at a time. A two-card hand wins if its ranks are next to each other, like 7 and 8.',
      'Aces play high or low (A-2 and K-A both count), but the run does not wrap around the corner: K-2 is no good. A pair is not a run either.',
    ],
    brief: 'Two-card hands. Pay out every hand whose ranks are consecutive.',
    handSize: 2,
    floor: floorOf(hexRange(2), L7),
    fixed: L7,
    croupiers: P3,
    warRules: ['high'],
    pays: (h) => isStraight(h),
    tests: makeTests({
      handSize: 2, handsPerTest: 10,
      fixed: [['7S 8D', 'AS 2D', 'KC AH', 'KH 2C', '5S 5D', '9C TC', 'TD 8H', 'QS JD', '3H 3C', '4D 6S']],
      nRandom: 4, seed: 107,
    }),
  },
  {
    id: 'next-door',
    chapter: 2,
    title: 'Next Door',
    story: [
      'The Owner\'s second note: "The house lucky number is 7. Pay the neighbours." Back to single cards: a 6 or an 8 wins.',
      'Your new croupiers: a shoe deals the same stacked card over and over; a gatherer stacks two hands into one; a cutter splits a hand into its top half and the rest.',
      'Tonight\'s game is in the service corridor, so mind the walls.',
    ],
    brief: 'Pay out every 6 and every 8.',
    handSize: 1,
    floor: floorOf(hexRect(-1, 0, -7, 5), L8),
    fixed: L8,
    croupiers: P4,
    warRules: ['high'],
    pays: (h) => ['6', '8'].includes(rankOf(h[0])),
    tests: makeTests({
      handSize: 1, handsPerTest: 13,
      fixed: [suitRun('S'), one('7H 6D 8C 7C 6H 8S 5D 9H')],
      nRandom: 3, seed: 108,
    }),
  },
  {
    id: 'red-flush',
    chapter: 2,
    title: 'Red Flush',
    story: [
      'Sal Vellani is back with an uncle. The uncle would like three-card hands, and he would like the house to pay any hand that is all hearts or all diamonds.',
      '"A heart and two diamonds is not a flush," you remind him. He smiles in a way that suggests he knew.',
    ],
    brief: 'Three-card hands. Pay out every flush in hearts or diamonds.',
    handSize: 3,
    floor: floorOf(hexRange(2), L10),
    fixed: L10,
    croupiers: P5,
    warRules: ['high'],
    pays: (h) => isFlush(h) && isRed(h[0]),
    tests: makeTests({
      handSize: 3, handsPerTest: 10,
      fixed: [['2H 7H KH', '3D 9D QD', '4S 8S JS', '5C TC AC', 'AH 2D 3H', 'KD QD JH', '6H 6D 6S', 'AD KD 2D', '9S 9H 4C', 'TH JH QH']],
      nRandom: 4, seed: 110,
    }),
  },

  {
    id: 'even-money',
    chapter: 2,
    title: 'Even Money',
    story: [
      'Dmitri, an accountant who plays exactly one hour a night, wants to bet on even cards: 2, 4, 6, 8, 10 and Q.',
      'Management says yes, if you can tell them apart.',
    ],
    brief: 'Pay out every even card (2 4 6 8 10 Q).',
    handSize: 1,
    floor: floorOf(hexRect(-2, 2, -4, 5), L9),
    fixed: L9,
    croupiers: P5,
    warRules: ['high'],
    pays: (h) => (hv(h[0]) % 2 === 0 && rankOf(h[0]) !== 'A'),
    tests: makeTests({
      handSize: 1, handsPerTest: 26,
      fixed: [suitRun('S'), one('2H 2D AH 3H 4H 5H 6H 7H 8H 9H TH JH QH KH')],
      nRandom: 4, seed: 109,
    }),
  },
  // ===== Chapter 3: The Regulars =====
  {
    id: 'pair-night',
    chapter: 3,
    title: 'Pair Night',
    story: [
      'Five-card hands from now on: the regulars like to hold something. Thursday is Pair Night, which pays a pair or two pair.',
      'Three of a kind is too much of a good thing and pays nothing on Pair Night. Nor does a full house, nor four of a kind. The regulars think this is very funny.',
    ],
    brief: 'Five-card hands. Pay out every hand whose largest set is a pair (one pair or two pair).',
    handSize: 5,
    floor: floorOf(hexRange(2), L11),
    fixed: L11,
    croupiers: P6,
    warRules: ['high'],
    pays: (h) => largestSet(h) === 2,
    tests: makeTests({
      handSize: 5, handsPerTest: 10,
      fixed: [['2S 2D 5C 9H KS', '3S 3D 7C 7H JS', '4S 4D 4C 8H QS', '5S 5D 5C TH TS', '6S 6D 6C 6H AS',
        'AS KD QC JH 9S', 'AH AD KH KD QC', '8S 9D TC JH QS', 'KS KD KC KH QD', '2H 3H 4H 5H 7H']],
      nRandom: 4, seed: 111,
    }),
  },
  {
    id: 'beat-the-dealer',
    chapter: 3,
    title: 'Beat the Dealer',
    story: [
      'A new croupier joins: she plays War. Your card against the dealer\'s card, high card wins, aces high, and ties go to the house. Both cards come out of her ports, so you choose where the winner and loser go.',
      'Back to single cards for her first night. The dealer always plays a 9.',
    ],
    brief: 'Pay out every card that beats a 9 (10, J, Q, K, A).',
    handSize: 1,
    floor: floorOf(hexRange(2), L12),
    fixed: L12,
    croupiers: P7,
    warRules: ['high'],
    pays: (h) => hv(h[0]) > 9,
    tests: makeTests({
      handSize: 1, handsPerTest: 13,
      fixed: [suitRun('H'), one('9S 9D TS AS 2S')],
      nRandom: 3, seed: 112,
    }),
  },
  {
    id: 'ace-in-the-hole',
    chapter: 3,
    title: 'Ace in the Hole',
    story: [
      'The Kessler crew claims the house never deals aces. To settle it, the Owner\'s note says: pay any five-card hand with an ace in it.',
      'War compares a whole hand by its highest card.',
    ],
    brief: 'Five-card hands. Pay out every hand containing an ace.',
    handSize: 5,
    floor: floorOf(hexRange(2), L13),
    fixed: L13,
    croupiers: P7,
    warRules: ['high'],
    pays: (h) => h.some((c) => rankOf(c) === 'A'),
    tests: makeTests({
      handSize: 5, handsPerTest: 10,
      fixed: [['2S 3S AS 4S 5S', 'KS KD KC KH QS', 'KH QH JH TH AH', '2C AH AD AC AS', '2D 3D 4D 5D 7C', 'QD JD TD 9D 8D']],
      nRandom: 4, seed: 113,
    }),
  },
  {
    id: 'top-dog',
    chapter: 3,
    title: 'Top Dog',
    story: [
      'Two-card hands, and a game the doormen invented on their break: you win if your top card beats your bottom card. Aces high, and a tie is a loss, as always.',
      'Pay out the whole hand, both cards.',
    ],
    brief: 'Two-card hands. Pay out every hand whose top card beats its bottom card.',
    handSize: 2,
    floor: floorOf(hexRange(2, [1, 0]), L14),
    fixed: L14,
    croupiers: P7,
    warRules: ['high'],
    pays: (h) => hv(h[0]) > hv(h[1]),
    tests: makeTests({
      handSize: 2, handsPerTest: 10,
      fixed: [['KS 2D', '2D KS', '7S 7H', 'AS KD', 'KD AS', '3C 2C', 'AH 2S', '2S AH', 'TD 9D', 'JC QC']],
      nRandom: 4, seed: 114,
    }),
  },
  {
    id: 'high-spade',
    chapter: 3,
    title: 'High Spade',
    story: [
      'The Owner\'s calling card is the ace of spades, and on the Owner\'s birthday any hand whose best card is a spade wins. If the best rank is shared, a spade holding it is enough.',
      'A new croupier makes perfect copies of a hand.',
    ],
    brief: 'Five-card hands. Pay out every hand where no card outranks its best spade.',
    handSize: 5,
    floor: floorOf(hexRect(-2, 2, -6, 4), L15),
    fixed: L15,
    croupiers: P8,
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
    title: 'Top Pair',
    story: [
      'A rival casino has opened two blocks away, and the regulars are wavering. The Owner\'s answer is Top Pair: a hand wins if it holds a pair or better and the highest card is part of its biggest set.',
      'Two pair counts both pairs as the set. A full house counts only the three of a kind. A new croupier pulls out exactly that set.',
    ],
    brief: 'Five-card hands. Pay out every hand with a pair or better whose highest card is part of its largest set.',
    handSize: 5,
    floor: floorOf(hexRect(-2, 2, -6, 4), L16),
    fixed: L16,
    croupiers: P9,
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

  // ===== Chapter 4: House Rules =====
  {
    id: 'new-rules',
    chapter: 4,
    title: 'New Rules',
    story: [
      'The city Gaming Commission has visited. Commissioner Pryce left with a fruit basket, an envelope, and a new regulation: until further notice, War is played by the top card only.',
      'Your War croupiers can still play, but they look only at the first card of each hand.',
    ],
    brief: 'Five-card hands. Pay out every hand whose top card beats a 10. (Top-card War only.)',
    handSize: 5,
    floor: floorOf(hexRange(2), L17),
    fixed: L17,
    croupiers: P9,
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
    chapter: 4,
    title: 'Bottom Dealer',
    story: [
      'The Kessler crew\'s new dealer deals from the bottom of the deck. Rather than fire him, the Owner wants the bottom card paid: a hand wins if its bottom card beats a 10.',
      'Two new croupiers riffle a hand perfectly. An out-shuffle keeps the top card on top; an in-shuffle doesn\'t. Top-card War is still the law.',
    ],
    brief: 'Five-card hands. Pay out every hand whose bottom card beats a 10. (Top-card War only.)',
    handSize: 5,
    floor: floorOf(hexRect(-2, 1, -6, 6), L18),
    fixed: L18,
    croupiers: P10,
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
    chapter: 4,
    title: 'Knockout',
    story: [
      'The Kesslers are still sure the house is hiding aces. With top-card War, an ace in the middle of a hand is invisible, so pay any hand with an ace in it, wherever it hides.',
      'A new croupier deals a hand out one card at a time, round the table.',
    ],
    brief: 'Five-card hands. Pay out every hand containing an ace. (Top-card War only.)',
    handSize: 5,
    floor: floorOf(hexRect(-3, 2, -6, 5), L19),
    fixed: L19,
    croupiers: P11,
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
    chapter: 4,
    title: 'Low Ball',
    story: [
      'Commissioner Pryce plays a quiet game every Tuesday, and he prefers it when he wins. His game: a hand wins only if every one of its cards beats a 5. Aces are high.',
      'Nobody has told him that the house always wins.',
    ],
    brief: 'Five-card hands. Pay out every hand in which every card beats a 5. (Top-card War only.)',
    handSize: 5,
    floor: floorOf(hexRect(-3, 2, -6, 5), L20),
    fixed: L20,
    croupiers: P11,
    warRules: ['top'],
    pays: (h) => h.every((c) => hv(c) > 5),
    tests: makeTests({
      handSize: 5, handsPerTest: 10,
      fixed: [['6S 7S 8S 9S TS', '5S 6D 7D 8D 9D', '6H 7H 8H 9H 5C', 'AS KS QS JS TS', 'AD 2D KD QD JD',
        '6C 6D 6H 6S AH', 'KC QC JC TC 4C', 'JH 3H QH KH AC', '9C 8C 7C 6C 5D', 'AH 7D 8C 9H TH']],
      nRandom: 4, seed: 120,
    }),
  },

  // ===== Chapter 5: The House Always Wins =====
  {
    id: 'hot-streak',
    chapter: 5,
    title: 'Hot Streak',
    story: [
      'The rival casino closed last week; its owner now deals for you on Tuesdays. The Owner\'s note says only: "The house remembers." The regulation is gone; both kinds of War are allowed again.',
      'Single cards. A card wins if it beats the card before it. The first card has nothing to beat, so it never wins. A shoe can be set to deal its deck once and stop.',
    ],
    brief: 'Pay out every card that beats the card played just before it.',
    handSize: 1,
    floor: floorOf(hexRange(2, [-1, 0]), L21),
    fixed: L21,
    croupiers: P11,
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
    chapter: 5,
    title: 'High Roller',
    story: [
      'The mayor has started playing at your tables. He likes records: a five-card hand wins if its high card ties or beats the high card of every hand before it tonight.',
      'He keeps his own tally on a napkin. The house had better keep one too.',
    ],
    brief: 'Five-card hands. Pay out every hand whose high card ties or beats every earlier hand\'s high card.',
    handSize: 5,
    floor: floorOf(hexRange(2, [1, 0]), L22),
    fixed: L22,
    croupiers: P11,
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
    chapter: 5,
    title: 'Full House',
    story: [
      'The city council now meets in the back room, between the bar and the string quartet. To celebrate, the house pays a full house: three of a kind plus a pair.',
      'Sal\'s uncle swears there is a full house in every deck. The house intends to pay out exactly as many as there are.',
    ],
    brief: 'Five-card hands. Pay out every full house (three of a kind plus a pair).',
    handSize: 5,
    floor: floorOf(hexRect(-3, 1, -1, 12), L23),
    fixed: L23,
    croupiers: P11,
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
    chapter: 5,
    title: 'Calling Card',
    story: [
      'The Vellanis and the Kesslers have stopped fighting each other. Both now work for the house, and both carry a spade in their hatband. Pay any hand that holds a spade.',
      'One last croupier: she sorts a hand into new deck order, spades first.',
    ],
    brief: 'Five-card hands. Pay out every hand that holds at least one spade.',
    handSize: 5,
    floor: floorOf(hexRect(-5, 1, 0, 11), L24),
    fixed: L24,
    croupiers: P12,
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
    chapter: 5,
    title: 'House Record',
    story: [
      'Tonight the city belongs to The Stacked Deck. The mayor, the commissioner and both families are at one table, and there is one game left: a hand wins if its largest set ties or beats the largest set of every hand before it.',
      'When it\'s over, there will be an envelope under the cash tray with your name on it, sealed with an ace of spades.',
    ],
    brief: 'Five-card hands. Pay out every hand whose largest set ties or beats every earlier hand\'s.',
    handSize: 5,
    floor: floorOf(hexRect(-8, 0, -6, 9), L25),
    fixed: L25,
    croupiers: P12,
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

// Par, from the reference solutions in solutions/levels/ (croupiers including
// shoes; rounds averaged over the level's tests and rounded). test/levels.js
// checks these exactly; `node tools/write-solutions.js` prints fresh values.
const PAR = {
  'opening-night': { croupiers: 3, rounds: 11 },
  'around-the-bar': { croupiers: 7, rounds: 15 },
  'two-tables': { croupiers: 4, rounds: 13 },
  'hearts-only': { croupiers: 3, rounds: 14 },
  'seeing-red': { croupiers: 4, rounds: 17 },
  'black-tie': { croupiers: 7, rounds: 19 },
  'back-to-back': { croupiers: 3, rounds: 11 },
  'next-door': { croupiers: 7, rounds: 15 },
  'red-flush': { croupiers: 3, rounds: 11 },
  'even-money': { croupiers: 12, rounds: 28 },
  'pair-night': { croupiers: 3, rounds: 12 },
  'beat-the-dealer': { croupiers: 4, rounds: 14 },
  'ace-in-the-hole': { croupiers: 4, rounds: 10 },
  'top-dog': { croupiers: 6, rounds: 17 },
  'high-spade': { croupiers: 8, rounds: 13 },
  'top-pair': { croupiers: 6, rounds: 13 },
  'new-rules': { croupiers: 4, rounds: 11 },
  'bottom-dealer': { croupiers: 6, rounds: 13 },
  'knockout': { croupiers: 16, rounds: 42 },
  'low-ball': { croupiers: 16, rounds: 48 },
  'hot-streak': { croupiers: 4, rounds: 13 },
  'high-roller': { croupiers: 4, rounds: 18 },
  'full-house': { croupiers: 13, rounds: 58 },
  'calling-card': { croupiers: 14, rounds: 89 },
  'house-record': { croupiers: 31, rounds: 105 },
};
for (const level of LEVELS) level.par = PAR[level.id];
