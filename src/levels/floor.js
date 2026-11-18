// The floor: floors that have left the campaign (cut or replaced), kept so
// their ids, saves, solutions and scores carry on. They keep the card they
// had in the campaign (so the floor can hold two A♥s), and lie on the floor
// tab in no particular order. Each opens like a bonus floor, once its
// `unlockAfter` floors are solved (see docs/campaign.md, "The floor").
// Their palettes are exactly what they had in the campaign (paletteOf), so
// no saved machine loses a croupier.
import {
  hexRange, hexRing, hexRect, makeTests, floorOf, source, desk, E, SE, NE,
  hv, high, isRed, one, suitRun, countOf, paletteOf, finishChapter,
} from './shared.js';
import { rankOf, suitOf, isStraight, isFlush, largestSet } from '../cards.js';

const ranks = (s) => (h) => s.split(' ').includes(rankOf(h[0]));
const suited = (h) => isFlush(h);
const connected = (h) => isStraight(h);

// Chapter 1's first floors (replaced in the campaign's new introduction).
const H1 = [source([-2, 0], E), desk([2, 0])];
const H2 = [source([-3, 0], E), desk([3, 0])];
const H3 = [source([-2, 0], E), source([-2, 2], NE), desk([2, 0])];
const H4 = [source([-2, 0], E), desk([2, -1])];
const H5 = [source([-3, 1], E), desk([2, -2])];
const H6 = [source([-2, -2], E), source([-3, 0], E), source([-4, 2], E), desk([3, 0])];
const H7 = [source([-3, -1], SE), source([-3, 2], NE), desk([3, -1])];
const H8 = [source([-4, 0], E), source([-5, 2], E), desk([4, 0])];
const H9 = [source([-4, 0], E), desk([3, -1])];
const H11 = [source([-3, 0], E), desk([1, 1])];
const H12 = [source([-4, 0], E), desk([-1, 1])];

// Chapter 2's floors replaced when Flush moved after War.
const D2 = [source([-3, 0], E), desk([1, 0])];
const D3 = [source([-2, 0], E), desk([2, 0])];
const D4 = [source([-3, 1], NE), desk([2, -1])];
const D7 = [source([-2, 0], E), desk([2, -1])];
const D8 = [source([-2, 0], E), desk([2, 0])];
const D9 = [source([-3, 0], E), desk([1, 0])];
const D11 = [source([-3, 0], E), desk([1, 0])];

export const LEVELS = [
  {
    id: 'opening-night',
    unlockAfter: 'first-night',
    card: 'AH',
    title: 'Opening Night',
    difficulty: 1,
    story: [
      'Congratulations on your new job as floor manager of The Stacked Deck. The pay is good, the carpet is loud, and every croupier on staff knows exactly one move.',
      'Tonight\'s game is generous: every card a player lays down wins. Have your croupiers carry each card from the player to the cashier\'s desk.',
    ],
    brief: 'Pay out every card.',
    handSize: 1,
    floor: floorOf(hexRange(2), H1),
    fixed: H1,
    croupiers: paletteOf('pass'),
    pays: () => true,
    tests: makeTests({ handSize: 1, handsPerTest: 8, nRandom: 3, seed: 101 }),
  },
  {
    id: 'around-the-bar',
    unlockAfter: 'first-night',
    card: '2H',
    title: 'Around the Bar',
    difficulty: 1,
    story: [
      'The Owner, whom nobody has met, had a bar installed overnight. It sits squarely between the card table and the cashier.',
      'A note under the cash tray reads: "Do not move the bar." It is signed with a single ace of spades.',
    ],
    brief: 'Pay out every card. The bar is in the way.',
    handSize: 1,
    floor: floorOf(hexRing(2), H2),
    fixed: H2,
    croupiers: paletteOf('pass'),
    pays: () => true,
    tests: makeTests({ handSize: 1, handsPerTest: 8, nRandom: 3, seed: 102 }),
  },
  {
    id: 'two-tables',
    unlockAfter: 'first-night',
    card: '3H',
    title: 'Two Tables',
    difficulty: 2,
    story: [
      'The Marchetti twins insist on sitting at separate tables and insist even harder on being paid at the same desk.',
      'Cards can merge: any croupier takes cards from any side. But a croupier handles only one card a round, and the twins do not like to wait.',
    ],
    brief: 'Pay out every card from both tables.',
    handSize: 1,
    floor: floorOf(hexRange(2), H3),
    fixed: H3,
    croupiers: paletteOf('pass'),
    pays: () => true,
    tests: makeTests({ handSize: 1, handsPerTest: 16, nRandom: 3, seed: 103 }),
  },
  {
    id: 'hearts-only',
    unlockAfter: 'red-and-black',
    card: '4H',
    title: 'Hearts Only',
    difficulty: 2,
    story: [
      'Old Thursday, a retired stage magician, has bet on hearts every night for forty years. Tonight the house finally agrees to pay him for them.',
      'Your new croupier splits cards by suit. Any suit you don\'t give a direction to is dropped on the carpet, and cards on the carpet are gone for good.',
    ],
    brief: 'Pay out every heart. Drop everything else.',
    handSize: 1,
    floor: floorOf(hexRange(2), H4),
    fixed: H4,
    croupiers: paletteOf('pass', 'suits'),
    pays: (h) => suitOf(h[0]) === 'H',
    tests: makeTests({
      handSize: 1, handsPerTest: 13,
      fixed: [one('AH 2S KH QD 3C 4H JH 5D 6S TH')],
      nRandom: 3, seed: 104,
    }),
  },
  {
    id: 'seeing-red',
    unlockAfter: 'red-and-black',
    card: '5H',
    title: 'Seeing Red',
    difficulty: 2,
    story: [
      'The Vellani family runs the diamond trade across the river. Their nephew Sal is here to "see how the place works" and wants red cards paid: hearts and diamonds both.',
      'Suits that share a side leave the splitter together. Mind the roulette wheel in the middle of the floor; the Owner says it stays.',
    ],
    brief: 'Pay out every red card (hearts and diamonds).',
    handSize: 1,
    floor: floorOf(hexRange(2), H5, [[0, 0], [1, 0]]),
    fixed: H5,
    croupiers: paletteOf('pass', 'suits'),
    pays: (h) => isRed(h[0]),
    tests: makeTests({
      handSize: 1, handsPerTest: 16,
      fixed: [one('AH AD AS AC KD KH 2C 2S 7D 7H')],
      nRandom: 3, seed: 105,
    }),
  },
  {
    id: 'standing-room',
    unlockAfter: 'red-and-black',
    card: '6H',
    title: 'Standing Room',
    difficulty: 3,
    story: [
      'Word has got around. Old Thursday has talked the Marchetti twins into a third table, and all three want paying in hearts and spades: hearts for luck, spades to be polite to the house.',
      'The Owner has had potted palms put on the floor. They are not to be moved.',
    ],
    brief: 'Pay out every heart and every spade from all three tables.',
    handSize: 1,
    floor: floorOf(hexRect(-2, 2, -5, 5), H6, [[0, 0], [-1, -1], [0, 1]]),
    fixed: H6,
    croupiers: paletteOf('pass', 'suits'),
    pays: (h) => 'HS'.includes(suitOf(h[0])),
    tests: makeTests({
      handSize: 1, handsPerTest: 24,
      fixed: [one('AH AS AD AC KH KS KD KC 2H 3S 4D 5C')],
      nRandom: 3, seed: 131,
    }),
  },
  {
    id: 'black-tie',
    unlockAfter: 'red-and-black',
    card: '7H',
    title: 'Black Tie',
    difficulty: 4,
    story: [
      'Not to be outdone, the Kessler crew from the coal yards books both tables for a black-tie evening. Spades and clubs only, please; the red cards can stay on the carpet.',
      'The floor is cramped tonight: the Owner has rented half of it to a string quartet.',
    ],
    brief: 'Pay out every black card (spades and clubs) from both tables.',
    handSize: 1,
    floor: floorOf(hexRect(-1, 1, -7, 4), H7),
    fixed: H7,
    croupiers: paletteOf('pass', 'suits'),
    pays: (h) => !isRed(h[0]),
    tests: makeTests({
      handSize: 1, handsPerTest: 16,
      fixed: [one('AS AC AH AD KS KC 2H 2D QS 3C')],
      nRandom: 3, seed: 106,
    }),
  },
  {
    id: 'back-to-back',
    unlockAfter: 'two-at-a-time',
    card: '8H',
    title: 'Back to Back',
    difficulty: 3,
    story: [
      'Business is good, so the house now deals two cards at a time, and the Marchetti twins have taken the two tables by the door. A two-card hand wins if its ranks are next to each other, like 7 and 8.',
      'Aces play high or low (A-2 and K-A both count), but a run does not wrap around the corner: K-2 is no good. A pair is not a run either.',
    ],
    brief: 'Two-card hands from both tables. Pay out every hand whose ranks are consecutive.',
    handSize: 2,
    floor: floorOf(hexRect(-2, 2, -6, 6), H8, [[0, 0], [1, -2], [-1, 2]]),
    fixed: H8,
    croupiers: paletteOf('pass', 'suits', 'straight'),
    pays: (h) => isStraight(h),
    tests: makeTests({
      handSize: 2, handsPerTest: 14,
      fixed: [['7S 8D', 'AS 2D', 'KC AH', 'KH 2C', '5S 5D', '9C TC', 'TD 8H', 'QS JD', '3H 3C', '4D 6S']],
      nRandom: 4, seed: 107,
    }),
  },
  {
    id: 'next-door',
    unlockAfter: 'neighbours',
    card: '9H',
    title: 'Next Door',
    difficulty: 4,
    story: [
      'The Owner\'s next note: "The house lucky number is 7. Pay the neighbours." Back to single cards: a 6 or an 8 wins.',
      'Your new croupiers: a shoe deals the same stacked card over and over; a gatherer stacks two hands into one; a cutter splits a hand into its top half and the rest.',
      'Tonight\'s game is in the service corridor, so mind the walls.',
    ],
    brief: 'Pay out every 6 and every 8.',
    handSize: 1,
    floor: floorOf(hexRect(-1, 0, -7, 5), H9),
    fixed: H9,
    croupiers: paletteOf('pass', 'suits', 'straight', 'gather', 'cut', 'shoe'),
    pays: ranks('6 8'),
    tests: makeTests({
      handSize: 1, handsPerTest: 13,
      fixed: [suitRun('S'), one('7H 6D 8C 7C 6H 8S 5D 9H')],
      nRandom: 3, seed: 108,
    }),
  },
  {
    id: 'penny-ante',
    unlockAfter: 'lucky-seven',
    card: 'JH',
    title: 'Penny Ante',
    difficulty: 5,
    story: [
      'Old Thursday\'s pension has run out before the end of the month again, so tonight he plays penny ante: any card from the ace to the 4 wins.',
      'At this table the ace counts low. The Owner\'s note says the house can afford it.',
    ],
    brief: 'Pay out every ace, 2, 3 and 4.',
    handSize: 1,
    floor: floorOf(hexRange(2, [-1, 0]), H11, [[1, 0]]),
    fixed: H11,
    croupiers: paletteOf('pass', 'suits', 'straight', 'gather', 'cut', 'shoe'),
    pays: ranks('A 2 3 4'),
    tests: makeTests({
      handSize: 1, handsPerTest: 20,
      fixed: [suitRun('C'), one('AH KH QH 2D 5D 4S 3S 6S 5H AS')],
      nRandom: 3, seed: 133,
    }),
  },
  {
    id: 'royalty',
    unlockAfter: 'lucky-seven',
    card: 'QH',
    title: 'Royalty',
    difficulty: 6,
    story: [
      'A minor royal from somewhere small and mountainous has booked the whole room. She will only be paid in court cards: every jack, queen and king.',
      'Her bodyguards stand very still in the middle of the floor and do not care for small talk.',
    ],
    brief: 'Pay out every jack, queen and king.',
    handSize: 1,
    floor: floorOf(hexRect(-3, 2, -7, 3), H12, [[0, 0], [-3, 2]]),
    fixed: H12,
    croupiers: paletteOf('pass', 'suits', 'straight', 'gather', 'cut', 'shoe'),
    pays: ranks('J Q K'),
    tests: makeTests({
      handSize: 1, handsPerTest: 20,
      fixed: [suitRun('D'), one('QS QH TS AS JC KC 9C QC KS JH')],
      nRandom: 3, seed: 134,
    }),
  },
  {
    id: 'either-or',
    unlockAfter: 'red-flush',
    card: '2D',
    title: 'Either Or',
    difficulty: 3,
    story: [
      'The uncle has a second game, and opinions about it. A two-card hand wins if it is suited or if it is a run. Both at once is greedy, and greed pays nothing.',
      'Sal says his uncle is very strict about greed. Sal is wearing three gold watches.',
    ],
    brief: 'Two-card hands. Pay out every hand that is suited or consecutive, but not both.',
    handSize: 2,
    floor: floorOf(hexRect(-2, 2, -5, 4), D2, [[0, 1]]),
    fixed: D2,
    croupiers: paletteOf('pass', 'suits', 'straight', 'gather', 'cut', 'shoe', 'flush'),
    pays: (h) => suited(h) !== connected(h),
    tests: makeTests({
      handSize: 2, handsPerTest: 14,
      fixed: [['7S 8S', '7S 9S', '7S 8D', '7S 9D', 'AS 2S', 'KH AH', 'KH AD', 'AH 3H', '5C 5D', 'QC KC', 'TD 2D', '9H TS', 'KS 2S', 'KD 2C']],
      nRandom: 4, seed: 131,
    }),
  },
  {
    id: 'pair-night',
    unlockAfter: 'red-flush',
    card: '3D',
    title: 'Pair Night',
    difficulty: 3,
    story: [
      'Five-card hands tonight: the regulars like to hold something. Thursday is Pair Night, which pays a pair or two pair. Your new croupier spots n of a kind: you choose the n.',
      'Three of a kind is too much of a good thing and pays nothing on Pair Night. Nor does a full house, nor four of a kind. The regulars think this is very funny.',
    ],
    brief: 'Five-card hands. Pay out every hand whose largest set is a pair (one pair or two pair).',
    handSize: 5,
    floor: floorOf(hexRange(2), D3),
    fixed: D3,
    croupiers: paletteOf('pass', 'suits', 'straight', 'gather', 'cut', 'shoe', 'kind', 'flush'),
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
    unlockAfter: 'red-flush',
    card: '4D',
    title: 'Inside Seven',
    difficulty: 4,
    story: [
      'The Owner\'s note this week: "Pay any two cards that would make a run with a seven." So 5-6, 6-8 and 8-9 win.',
      'Sal asks whether a seven in his own hand counts double. It does not: a pair is never a run.',
    ],
    brief: 'Two-card hands. Pay out every hand that makes a three-card run with a 7 (5-6, 6-8, 8-9).',
    handSize: 2,
    floor: floorOf(hexRect(-2, 1, -6, 4), D4, [[0, -1]]),
    fixed: D4,
    croupiers: paletteOf('pass', 'suits', 'straight', 'gather', 'cut', 'shoe', 'kind', 'flush'),
    pays: (h) => isStraight([...h, '7C']) && !h.some((c) => rankOf(c) === '7'),
    tests: makeTests({
      handSize: 2, handsPerTest: 16,
      fixed: [['5S 6D', '6S 8D', '8S 9D', '6S 7D', '7S 8D', '4S 5D', '9S TD', '5S 8D', '6S 6D', '8H 6C', '9C 8C', '6H 5H', '7H 7D', 'AS 2D']],
      nRandom: 4, seed: 132,
    }),
  },
  {
    id: 'beat-the-dealer',
    unlockAfter: 'red-flush',
    card: '7D',
    title: 'Beat the Dealer',
    difficulty: 4,
    story: [
      'A new croupier joins: she plays War. Your card against the dealer\'s card, high card wins, aces high, and ties go to the house. Both cards come out of her ports, so you choose where the winner and loser go.',
      'Back to single cards for her first night. The dealer always plays a 9.',
    ],
    brief: 'Pay out every card that beats a 9 (10, J, Q, K, A).',
    handSize: 1,
    floor: floorOf(hexRange(2), D7),
    fixed: D7,
    croupiers: paletteOf('pass', 'suits', 'straight', 'gather', 'cut', 'shoe', 'kind', 'war', 'flush'),
    pays: (h) => hv(h[0]) > 9,
    tests: makeTests({
      handSize: 1, handsPerTest: 13,
      fixed: [suitRun('H'), one('9S 9D TS AS 2S')],
      nRandom: 3, seed: 112,
    }),
  },
  {
    id: 'ace-in-the-hole',
    unlockAfter: 'natural',
    card: '8D',
    title: 'Ace in the Hole',
    difficulty: 3,
    story: [
      'The Kessler crew claims the house never deals aces. To settle it, the Owner\'s note says: pay any five-card hand with an ace in it.',
      'War compares a whole hand by its highest card.',
    ],
    brief: 'Five-card hands. Pay out every hand containing an ace.',
    handSize: 5,
    floor: floorOf(hexRange(2), D8),
    fixed: D8,
    croupiers: paletteOf('pass', 'suits', 'straight', 'gather', 'cut', 'shoe', 'kind', 'war', 'flush'),
    pays: (h) => h.some((c) => rankOf(c) === 'A'),
    tests: makeTests({
      handSize: 5, handsPerTest: 10,
      fixed: [['2S 3S AS 4S 5S', 'KS KD KC KH QS', 'KH QH JH TH AH', '2C AH AD AC AS', '2D 3D 4D 5D 7C', 'QD JD TD 9D 8D']],
      nRandom: 4, seed: 113,
    }),
  },
  {
    id: 'inside-bet',
    unlockAfter: 'low-kicker',
    card: '9D',
    title: 'Inside Bet',
    difficulty: 4,
    story: [
      'Sal\'s uncle bets the middle of the deck. A five-card hand wins if its high card is a 9, 10, jack or queen: nothing too small, nothing too grand.',
      'A king, he says, attracts attention. An ace attracts the police.',
    ],
    brief: 'Five-card hands. Pay out every hand whose high card is 9, 10, J or Q.',
    handSize: 5,
    floor: floorOf(hexRect(-2, 2, -5, 4), D9, [[0, 1]]),
    fixed: D9,
    croupiers: paletteOf('pass', 'suits', 'straight', 'gather', 'cut', 'shoe', 'kind', 'war', 'flush'),
    pays: (h) => high(h) >= 9 && high(h) <= 12,
    tests: makeTests({
      handSize: 5, handsPerTest: 10,
      fixed: [['2S 3D 4C 5H 8S', '2S 3D 4C 5H 9S', '2S 3D 4C 5H TS', 'QS 3D 4C 5H 2S', '2S KD 4C 5H 8S',
        '2S 3D AC 5H 8S', 'QS QD QC 2H 3S', 'JS TD 9C 8H 7S', 'KS QD JC TH 9S', '9S 9D 9C 9H 2S']],
      nRandom: 4, seed: 135,
    }),
  },
  {
    id: 'top-of-the-heap',
    unlockAfter: 'top-dog',
    card: 'JD',
    title: 'Top of the Heap',
    difficulty: 5,
    story: [
      'The doormen\'s game has gone to their heads. Now it is five cards, and the top card has to beat every other card in the hand. A tie with any of them is a loss.',
      'The head doorman has started calling himself the top dog. Nobody has the heart to stop him.',
    ],
    brief: 'Five-card hands. Pay out every hand whose top card beats each of the other four.',
    handSize: 5,
    floor: floorOf(hexRect(-2, 1, -5, 4), D11, [[-1, 1]]),
    fixed: D11,
    croupiers: paletteOf('pass', 'suits', 'straight', 'gather', 'cut', 'shoe', 'kind', 'war', 'flush'),
    pays: (h) => h.slice(1).every((c) => hv(h[0]) > hv(c)),
    tests: makeTests({
      handSize: 5, handsPerTest: 10,
      fixed: [['AS KD 2C 3H 4S', 'KS AD 2C 3H 4S', 'KS KD 2C 3H 4S', '2S 3D 4C 5H 6S', '6S 2D 3C 4H 5S',
        '9S 2D 3C 4H 9H', 'TS 9D 8C 7H 6S', 'TS 9D 8C 7H JS', 'AH AD 2C 3C 4C', '3D 2S 2D 2C 2H']],
      nRandom: 4, seed: 136,
    }),
  },
];

// Par, from the reference solutions in solutions/levels/ (croupiers including
// shoes; rounds totalled over the level's tests). test/levels.js checks these
// exactly; `node tools/write-solutions.js floor --par` rewrites this table
// from the recipes in tools/level-specs/floor.js.
// BEGIN PAR
const PAR = {
  'opening-night': { croupiers: 3, rounds: 33 },
  'around-the-bar': { croupiers: 7, rounds: 45 },
  'two-tables': { croupiers: 4, rounds: 57 },
  'hearts-only': { croupiers: 3, rounds: 55 },
  'seeing-red': { croupiers: 4, rounds: 69 },
  'standing-room': { croupiers: 10, rounds: 107 },
  'black-tie': { croupiers: 7, rounds: 74 },
  'back-to-back': { croupiers: 9, rounds: 83 },
  'next-door': { croupiers: 7, rounds: 75 },
  'penny-ante': { croupiers: 10, rounds: 103 },
  'royalty': { croupiers: 13, rounds: 114 },
  'either-or': { croupiers: 5, rounds: 84 },
  'pair-night': { croupiers: 3, rounds: 60 },
  'inside-seven': { croupiers: 5, rounds: 82 },
  'beat-the-dealer': { croupiers: 4, rounds: 69 },
  'ace-in-the-hole': { croupiers: 4, rounds: 52 },
  'inside-bet': { croupiers: 5, rounds: 60 },
  'top-of-the-heap': { croupiers: 6, rounds: 74 },
};
// END PAR
finishChapter(LEVELS, PAR);
