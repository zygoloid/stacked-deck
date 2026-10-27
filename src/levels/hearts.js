// Chapter 1 (hearts): Opening Night. Routing, merging, the suit splitter,
// straights, and reference cards (shoe + gather + straight + cut).
// See docs/campaign.md for the plan.
import {
  hexRange, hexRing, hexRect, makeTests, floorOf, source, desk, E, SE, W, NE,
  hv, isRed, one, suitRun, paletteThrough, finishChapter,
} from './shared.js';
import { rankOf, suitOf, isStraight } from '../cards.js';

const ranks = (s) => (h) => s.split(' ').includes(rankOf(h[0]));

const F1 = [source([-2, 0], E), desk([2, 0])];
const F2 = [source([-3, 0], E), desk([3, 0])];
const F3 = [source([-2, 0], E), source([-2, 2], NE), desk([2, 0])];
const F4 = [source([-2, 0], E), desk([2, -1])];
const F5 = [source([-3, 1], E), desk([2, -2])];
const F6 = [source([-2, -2], E), source([-3, 0], E), source([-4, 2], E), desk([3, 0])];
const F7 = [source([-3, -1], SE), source([-3, 2], NE), desk([3, -1])];
const F8 = [source([-4, 0], E), source([-5, 2], E), desk([4, 0])];
const F9 = [source([-4, 0], E), desk([3, -1])];
const F10 = [source([-3, 0], E), desk([1, 0])];
const F11 = [source([-3, 0], E), desk([1, 1])];
const F12 = [source([-4, 0], E), desk([-1, 1])];
const F13 = [source([-2, -1], E), desk([-1, 0])];

export const LEVELS = [
  {
    id: 'opening-night',
    chapter: 1,
    card: 'AH',
    title: 'Opening Night',
    story: [
      'Congratulations on your new job as floor manager of The Stacked Deck. The pay is good, the carpet is loud, and every croupier on staff knows exactly one move.',
      'Tonight\'s game is generous: every card a player lays down wins. Have your croupiers carry each card from the player to the cashier\'s desk.',
    ],
    brief: 'Pay out every card.',
    handSize: 1,
    floor: floorOf(hexRange(2), F1),
    fixed: F1,
    croupiers: paletteThrough('pass'),
    pays: () => true,
    tests: makeTests({ handSize: 1, handsPerTest: 8, nRandom: 3, seed: 101 }),
  },
  {
    id: 'around-the-bar',
    chapter: 1,
    card: '2H',
    title: 'Around the Bar',
    story: [
      'The Owner, whom nobody has met, had a bar installed overnight. It sits squarely between the card table and the cashier.',
      'A note under the cash tray reads: "Do not move the bar." It is signed with a single ace of spades.',
    ],
    brief: 'Pay out every card. The bar is in the way.',
    handSize: 1,
    floor: floorOf(hexRing(2), F2),
    fixed: F2,
    croupiers: paletteThrough('pass'),
    pays: () => true,
    tests: makeTests({ handSize: 1, handsPerTest: 8, nRandom: 3, seed: 102 }),
  },
  {
    id: 'two-tables',
    chapter: 1,
    card: '3H',
    title: 'Two Tables',
    story: [
      'The Marchetti twins insist on sitting at separate tables and insist even harder on being paid at the same desk.',
      'Cards can merge: any croupier takes cards from any side. But a croupier handles only one card a round, and the twins do not like to wait.',
    ],
    brief: 'Pay out every card from both tables.',
    handSize: 1,
    floor: floorOf(hexRange(2), F3),
    fixed: F3,
    croupiers: paletteThrough('pass'),
    pays: () => true,
    tests: makeTests({ handSize: 1, handsPerTest: 16, nRandom: 3, seed: 103 }),
  },
  {
    id: 'hearts-only',
    chapter: 1,
    card: '4H',
    title: 'Hearts Only',
    story: [
      'Old Thursday, a retired stage magician, has bet on hearts every night for forty years. Tonight the house finally agrees to pay him for them.',
      'Your new croupier splits cards by suit. Any suit you don\'t give a direction to is dropped on the carpet, and cards on the carpet are gone for good.',
    ],
    brief: 'Pay out every heart. Drop everything else.',
    handSize: 1,
    floor: floorOf(hexRange(2), F4),
    fixed: F4,
    croupiers: paletteThrough('suits'),
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
    card: '5H',
    title: 'Seeing Red',
    story: [
      'The Vellani family runs the diamond trade across the river. Their nephew Sal is here to "see how the place works" and wants red cards paid: hearts and diamonds both.',
      'Suits that share a side leave the splitter together. Mind the roulette wheel in the middle of the floor; the Owner says it stays.',
    ],
    brief: 'Pay out every red card (hearts and diamonds).',
    handSize: 1,
    floor: floorOf(hexRange(2), F5, [[0, 0], [1, 0]]),
    fixed: F5,
    croupiers: paletteThrough('suits'),
    pays: (h) => isRed(h[0]),
    tests: makeTests({
      handSize: 1, handsPerTest: 16,
      fixed: [one('AH AD AS AC KD KH 2C 2S 7D 7H')],
      nRandom: 3, seed: 105,
    }),
  },
  {
    id: 'standing-room',
    chapter: 1,
    card: '6H',
    title: 'Standing Room',
    story: [
      'Word has got around. Old Thursday has talked the Marchetti twins into a third table, and all three want paying in hearts and spades: hearts for luck, spades to be polite to the house.',
      'The Owner has had potted palms put on the floor. They are not to be moved.',
    ],
    brief: 'Pay out every heart and every spade from all three tables.',
    handSize: 1,
    floor: floorOf(hexRect(-2, 2, -5, 5), F6, [[0, 0], [-1, -1], [0, 1]]),
    fixed: F6,
    croupiers: paletteThrough('suits'),
    pays: (h) => 'HS'.includes(suitOf(h[0])),
    tests: makeTests({
      handSize: 1, handsPerTest: 24,
      fixed: [one('AH AS AD AC KH KS KD KC 2H 3S 4D 5C')],
      nRandom: 3, seed: 131,
    }),
  },
  {
    id: 'black-tie',
    chapter: 1,
    card: '7H',
    title: 'Black Tie',
    story: [
      'Not to be outdone, the Kessler crew from the coal yards books both tables for a black-tie evening. Spades and clubs only, please; the red cards can stay on the carpet.',
      'The floor is cramped tonight: the Owner has rented half of it to a string quartet.',
    ],
    brief: 'Pay out every black card (spades and clubs) from both tables.',
    handSize: 1,
    floor: floorOf(hexRect(-1, 1, -7, 4), F7),
    fixed: F7,
    croupiers: paletteThrough('suits'),
    pays: (h) => !isRed(h[0]),
    tests: makeTests({
      handSize: 1, handsPerTest: 16,
      fixed: [one('AS AC AH AD KS KC 2H 2D QS 3C')],
      nRandom: 3, seed: 106,
    }),
  },
  {
    id: 'back-to-back',
    chapter: 1,
    card: '8H',
    title: 'Back to Back',
    story: [
      'Business is good, so the house now deals two cards at a time, and the Marchetti twins have taken the two tables by the door. A two-card hand wins if its ranks are next to each other, like 7 and 8.',
      'Aces play high or low (A-2 and K-A both count), but a run does not wrap around the corner: K-2 is no good. A pair is not a run either.',
    ],
    brief: 'Two-card hands from both tables. Pay out every hand whose ranks are consecutive.',
    handSize: 2,
    floor: floorOf(hexRect(-2, 2, -6, 6), F8, [[0, 0], [1, -2], [-1, 2]]),
    fixed: F8,
    croupiers: paletteThrough('straight'),
    pays: (h) => isStraight(h),
    tests: makeTests({
      handSize: 2, handsPerTest: 14,
      fixed: [['7S 8D', 'AS 2D', 'KC AH', 'KH 2C', '5S 5D', '9C TC', 'TD 8H', 'QS JD', '3H 3C', '4D 6S']],
      nRandom: 4, seed: 107,
    }),
  },
  {
    id: 'next-door',
    chapter: 1,
    card: '9H',
    title: 'Next Door',
    story: [
      'The Owner\'s next note: "The house lucky number is 7. Pay the neighbours." Back to single cards: a 6 or an 8 wins.',
      'Your new croupiers: a shoe deals the same stacked card over and over; a gatherer stacks two hands into one; a cutter splits a hand into its top half and the rest.',
      'Tonight\'s game is in the service corridor, so mind the walls.',
    ],
    brief: 'Pay out every 6 and every 8.',
    handSize: 1,
    floor: floorOf(hexRect(-1, 0, -7, 5), F9),
    fixed: F9,
    croupiers: paletteThrough('cut'),
    pays: ranks('6 8'),
    tests: makeTests({
      handSize: 1, handsPerTest: 13,
      fixed: [suitRun('S'), one('7H 6D 8C 7C 6H 8S 5D 9H')],
      nRandom: 3, seed: 108,
    }),
  },
  {
    id: 'lucky-seven',
    chapter: 1,
    card: 'TH',
    title: 'Lucky Seven',
    story: [
      'The neighbours were a success, and the Owner is warming to the theme. Tonight\'s note says: "Pay the sevens. All four suits. Nothing else."',
      'Old Thursday claims he once pulled a seven out of a mayor\'s ear. He has brought a pocketful of them, just in case.',
    ],
    brief: 'Pay out every 7.',
    handSize: 1,
    floor: floorOf(hexRange(2, [-1, 0]), F10, [[0, 1]]),
    fixed: F10,
    croupiers: paletteThrough('cut'),
    pays: ranks('7'),
    tests: makeTests({
      handSize: 1, handsPerTest: 16,
      fixed: [suitRun('H'), one('7S 6S 8S 7D 5C 9C 7C 6D 8D 7H')],
      nRandom: 3, seed: 132,
    }),
  },
  {
    id: 'penny-ante',
    chapter: 1,
    card: 'JH',
    title: 'Penny Ante',
    story: [
      'Old Thursday\'s pension has run out before the end of the month again, so tonight he plays penny ante: any card from the ace to the 4 wins.',
      'At this table the ace counts low. The Owner\'s note says the house can afford it.',
    ],
    brief: 'Pay out every ace, 2, 3 and 4.',
    handSize: 1,
    floor: floorOf(hexRange(2, [-1, 0]), F11, [[1, 0]]),
    fixed: F11,
    croupiers: paletteThrough('cut'),
    pays: ranks('A 2 3 4'),
    tests: makeTests({
      handSize: 1, handsPerTest: 20,
      fixed: [suitRun('C'), one('AH KH QH 2D 5D 4S 3S 6S 5H AS')],
      nRandom: 3, seed: 133,
    }),
  },
  {
    id: 'royalty',
    chapter: 1,
    card: 'QH',
    title: 'Royalty',
    story: [
      'A minor royal from somewhere small and mountainous has booked the whole room. She will only be paid in court cards: every jack, queen and king.',
      'Her bodyguards stand very still in the middle of the floor and do not care for small talk.',
    ],
    brief: 'Pay out every jack, queen and king.',
    handSize: 1,
    floor: floorOf(hexRect(-3, 2, -7, 3), F12, [[0, 0], [-3, 2]]),
    fixed: F12,
    croupiers: paletteThrough('cut'),
    pays: ranks('J Q K'),
    tests: makeTests({
      handSize: 1, handsPerTest: 20,
      fixed: [suitRun('D'), one('QS QH TS AS JC KC 9C QC KS JH')],
      nRandom: 3, seed: 134,
    }),
  },
  {
    id: 'even-money',
    chapter: 1,
    card: 'KH',
    title: 'Even Money',
    story: [
      'Dmitri, an accountant who plays exactly one hour a night, wants to bet on even cards: 2, 4, 6, 8, 10 and Q.',
      'Management says yes, if you can tell them apart. Across the river, the Vellanis have started asking who Dmitri is.',
    ],
    brief: 'Pay out every even card (2 4 6 8 10 Q).',
    handSize: 1,
    floor: floorOf(hexRect(-2, 2, -4, 5), F13),
    fixed: F13,
    croupiers: paletteThrough('cut'),
    pays: (h) => (hv(h[0]) % 2 === 0 && rankOf(h[0]) !== 'A'),
    tests: makeTests({
      handSize: 1, handsPerTest: 26,
      fixed: [suitRun('S'), one('2H 2D AH 3H 4H 5H 6H 7H 8H 9H TH JH QH KH')],
      nRandom: 4, seed: 109,
    }),
  },
];

// Par, from the reference solutions in solutions/levels/ (croupiers including
// shoes; rounds totalled over the level's tests). test/levels.js
// checks these exactly; `node tools/write-solutions.js hearts --par` rewrites
// this table from the recipes in tools/level-specs/hearts.js.
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
  'lucky-seven': { croupiers: 8, rounds: 77 },
  'penny-ante': { croupiers: 10, rounds: 103 },
  'royalty': { croupiers: 13, rounds: 114 },
  'even-money': { croupiers: 14, rounds: 169 },
};
// END PAR
finishChapter(LEVELS, PAR);
