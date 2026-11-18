// Chapter 1 (hearts): Opening Night. One new croupier a floor, each met
// first on a gentle floor or with a twist: pass (with the tutorial), suits,
// straight, gather, cut, shoe, then reference cards and n of a kind.
// See docs/campaign.md for the plan.
import {
  hexRange, hexRect, makeTests, dealtTests, floorOf, source, desk, E, SE, NE,
  hv, isRed, one, suitRun, countOf, paletteThrough, finishChapter,
} from './shared.js';
import { rankOf, suitOf, isStraight, isFlush, shuffled, fullDeck, RANKS } from '../cards.js';

const ranks = (s) => (h) => s.split(' ').includes(rankOf(h[0]));
const seat = (at, out, n) => ({ ...source(at, out), seat: n });
const labelled = (at, n) => ({ ...desk(at), desk: n });

// Three seated players, one card each per deal: about two deals in five
// make a run (any order, ace high or low), the rest are random.
function threeRunDeals(rand, n, deals = 10) {
  const tests = [];
  for (let t = 0; t < n; t++) {
    let deck = shuffled(fullDeck(), rand);
    const hands = [];
    for (let d = 0; d < deals; d++) {
      let three = null;
      if (rand() < 0.4) {
        const start = Math.floor(rand() * 12); // A23 .. QKA
        const want = [0, 1, 2].map((i) => RANKS[(start + i) % 13]);
        const cards = want.map((r) => deck.find((c) => rankOf(c) === r));
        if (cards.every(Boolean)) three = shuffled(cards, rand);
      }
      three ??= deck.slice(0, 3);
      deck = deck.filter((c) => !three.includes(c));
      hands.push(...three.map((c) => [c]));
    }
    tests.push(hands);
  }
  return tests;
}

// One card at a time, suits in turn (spade, heart, club, diamond). The black
// cards (a spade, then a club, then a spade, ...) come in planned runs of 2
// to 5 cards, in an order where no shorter start of a run is already a run,
// so each pays only when it is complete; the night ends on a pile that
// never makes a run. Red cards fill the other turns.
function blackRunDeals(rand, n) {
  const tests = [];
  for (let t = 0; t < n; t++) {
    const used = new Set(), black = [];
    let suit = 'S';
    for (let tries = 0; tries < 400 && black.length < 11; tries++) {
      const len = 2 + Math.floor(rand() * 4), start = Math.floor(rand() * (14 - len));
      const run = RANKS.concat('A').slice(start, start + len);
      let order = null;
      for (let k = 0; k < 20 && !order; k++) {
        const o = shuffled(run, rand);
        if (o.every((_, i) => i < 1 || i === len - 1 || !isStraight(o.slice(0, i + 1).map((r) => `${r}S`)))) order = o;
      }
      if (!order) continue;
      let s = suit;
      const cards = order.map((r) => { const c = r + s; s = s === 'S' ? 'C' : 'S'; return c; });
      if (cards.some((c) => used.has(c))) continue;
      cards.forEach((c) => used.add(c));
      black.push(...cards);
      suit = s;
    }
    // A last pile that never pays: two black cards that aren't a run.
    for (let tries = 0; tries < 100; tries++) {
      const s2 = suit === 'S' ? 'C' : 'S';
      const a = RANKS[Math.floor(rand() * 13)] + suit, b = RANKS[Math.floor(rand() * 13)] + s2;
      if (used.has(a) || used.has(b) || isStraight([a, b])) continue;
      black.push(a, b);
      break;
    }
    const red = { H: shuffled(RANKS.map((r) => `${r}H`), rand), D: shuffled(RANKS.map((r) => `${r}D`), rand) };
    const hands = [];
    for (const b of black) hands.push([b], [red[suitOf(b) === 'S' ? 'H' : 'D'].pop()]);
    tests.push(hands);
  }
  return tests;
}

// The black cards since the last payout, paid together once there are two
// or more and they make a run.
function blackRuns(inputs) {
  const out = [];
  let pile = [];
  for (const [c] of inputs) {
    if (isRed(c)) continue;
    pile.push(c);
    if (pile.length >= 2 && isStraight(pile)) { out.push(pile); pile = []; }
  }
  return out;
}

const F1 = [source([-1, -1], E), source([-1, 1], NE), desk([2, -1]), desk([1, 1])];
const F2 = [source([-3, 0], E), labelled([0, -1], 0), labelled([-1, 1], 1)];
const F3 = [source([-1, 0], E), source([-2, 1], E), desk([1, 0])];
const F4 = [source([-3, 0], E), desk([-2, -1]), desk([1, 0])];
const F5 = [seat([-2, 0], E, 0), seat([-1, -1], SE, 1), seat([-1, 1], NE, 2), desk([2, 0])];
const F6 = [source([-2, 1], E), desk([2, 0])];
const F7 = [source([-2, 0], E), desk([1, 0])];
const F8 = [source([-2, 0], E), desk([2, 0])];
const F9 = [source([-3, 0], E), desk([1, 0])];
const F10 = [seat([-2, 0], E, 0), seat([-2, 1], E, 1), desk([2, 0])];
const F11 = [source([-3, 0], E), desk([0, 1])];
const F12 = [source([-2, -1], E), desk([-1, 0])];
const F13 = [source([-4, 0], E), desk([0, 1])];

export const LEVELS = [
  {
    id: 'first-night',
    chapter: 1,
    card: 'AH',
    title: 'Opening Night',
    difficulty: 1,
    story: [
      'Congratulations on your new job as floor manager of The Stacked Deck. The pay is good, the carpet is loud, and every croupier on staff knows exactly one move.',
      'The Owner, whom nobody has met, had a bar put in overnight, right across the room. A note under the cash tray says "Do not move the bar." It is signed with a single ace of spades. Tonight\'s game is generous: every card a player lays down wins, at either cashier\'s desk.',
    ],
    brief: 'Pay out every card from both tables, at either desk.',
    // The tutorial, part 1 (src/ui/coach.js): the top table's machine, then
    // the player's turn. Nothing here says how to do the bottom table.
    tutorial: [
      { say: 'Welcome to the floor. The players at the tables on the left lay down cards; the chip desks on the right pay out whatever reaches them. Croupiers carry the cards in between, and you place them on the empty hexes.', until: 'next' },
      { say: '{Click} the ringed hex and pick Pass, the one croupier on this floor.', at: [0, -1], until: { cell: { at: [0, -1], fn: 'pass' } } },
      { say: 'A Pass hands each card on through its port (the arrow). With it selected, {click} the ringed edge of its hex to point the port east, at the next hex.', at: [0, -1], side: E, until: { cell: { at: [0, -1], fn: 'pass', out: { out: E } } } },
      { say: 'Now a second Pass on the next hex, pointing east into the chip desk. (Placing a croupier near an edge points it there straight away.)', at: [1, -1], side: E, until: { cell: { at: [1, -1], fn: 'pass', out: { out: E } } } },
      { say: 'That\'s a machine for the top table. Press play to watch a test: the cards move a round at a time, and the panel lists each test\'s hands.', ui: 'play', until: 'ran' },
      { say: 'The other table\'s cards still fall on the carpet. Your turn: get them to a desk too. The floor is cleared when every test passes; play runs the test you are watching, then checks the rest.', until: 'cleared' },
      { say: 'Cleared! Your score is two numbers, croupiers and rounds, and fewer is better on both; they often pull against each other. Par is the house\'s own machine. Come back and beat it on either count whenever you like.', ui: 'stats', until: 'next' },
    ],
    handSize: 1,
    floor: floorOf([[0, -1], [1, -1], [0, 0], [0, 1]], F1),
    fixed: F1,
    croupiers: paletteThrough('pass'),
    pays: () => true,
    tests: makeTests({ handSize: 1, handsPerTest: 10, nRandom: 3, seed: 141 }),
  },
  {
    id: 'red-and-black',
    chapter: 1,
    card: '2H',
    title: 'Red and Black',
    difficulty: 1,
    story: [
      'The Vellani family runs the diamond trade across the river. Their nephew Sal wants the red cards, hearts and diamonds, paid at desk X. The Kessler crew from the coal yards have booked desk Y, and they want the black ones: spades and clubs.',
      'Your new croupier splits cards by suit. A suit you don\'t give a direction drops on the carpet, and cards on the carpet are gone for good.',
    ],
    brief: 'Pay every red card (hearts and diamonds) at desk X, and every black card (spades and clubs) at desk Y.',
    // The tutorial, part 2: croupiers with several ports, and fixing
    // mistakes. Nothing here says how to point Suits.
    tutorial: [
      { say: 'Two desks tonight, and each card must reach the right one, X or Y: the brief at the top says which.', ui: 'brief', until: 'next' },
      { say: 'Place a Pass on the ringed hex, pointing east.', at: [-2, 0], side: E, until: { cell: { at: [-2, 0], fn: 'pass', out: { out: E } } } },
      { say: 'Now the new croupier, Suits, on the ringed hex. The floor panel\'s list of croupiers says what each one does.', at: [-1, 0], until: { cell: { at: [-1, 0], fn: 'suits' } } },
      { say: 'Suits has a port for each suit, and one (misc) for anything else. With it selected, each {click} on an edge points the highlighted port there and moves on to the next; the panel lists its ports, with buttons for the six sides. A port pointing nowhere drops its cards on the carpet.', ui: 'ports', until: 'next' },
      { say: 'Made a mistake? Undo takes back any change, a croupier can be dragged to another hex, and Remove (or the Delete key) takes it away.', ui: 'undo', until: 'next' },
      { say: 'Your turn: get every card to its desk, and clear the floor.', until: 'cleared' },
      { say: 'Once a machine passes the tests, it is also tried on a few random deals of its own, so it has to follow the rule, not just the tests. That\'s the tutorial; ? Help explains every croupier.', until: 'next' },
    ],
    handSize: 1,
    floor: floorOf([[-2, 0], [-1, 0]], F2),
    fixed: F2,
    croupiers: paletteThrough('suits'),
    expected: (inputs) => inputs.map((h) => ({ desk: isRed(h[0]) ? 0 : 1, hand: h })),
    tests: makeTests({
      handSize: 1, handsPerTest: 13,
      fixed: [one('AH AD AS AC KD KH 2C 2S 7D 7H')],
      nRandom: 3, seed: 142,
    }),
  },
  {
    id: 'two-at-a-time',
    chapter: 1,
    card: '3H',
    title: 'Two at a Time',
    difficulty: 1,
    story: [
      'Business is good, so the house now deals two cards at a time, and the Marchetti twins have taken a table each. A two-card hand wins if its ranks are next to each other, like 7 and 8.',
      'Aces play high or low (A-2 and K-A both count), but a run does not wrap around the corner: K-2 is no good. A pair is not a run either. Your new croupier checks for runs.',
    ],
    brief: 'Two-card hands from both tables. Pay out every hand whose ranks are next to each other.',
    handSize: 2,
    floor: floorOf([...hexRange(1), [1, 1], [-1, 2], [0, 2]], F3),
    fixed: F3,
    croupiers: paletteThrough('straight'),
    pays: (h) => isStraight(h),
    tests: makeTests({
      handSize: 2, handsPerTest: 14,
      fixed: [['7S 8D', 'AS 2D', 'KC AH', 'KH 2C', '5S 5D', '9C TC', 'TD 8H', 'QS JD', '3H 3C', '4D 6S']],
      nRandom: 3, seed: 143,
    }),
  },
  {
    id: 'thursdays-game',
    chapter: 1,
    card: '4H',
    title: 'Thursday\'s Game',
    difficulty: 3,
    story: [
      'Old Thursday, a retired stage magician, has played every table in town for forty years and still pulls sevens out of mayors\' ears. His game: a two-card hand wins if its ranks are next to each other, or if both cards are the same suit. A hand that is both, like the 7 and 8 of hearts, is paid once.',
      'Runs work as before: aces high or low, no wrapping round the corner, and a pair is not a run.',
    ],
    brief: 'Two-card hands. Pay out every hand that is a run (ranks next to each other) or whose two cards are the same suit.',
    handSize: 2,
    floor: floorOf(hexRect(-2, 2, -7, 3), F4),
    fixed: F4,
    croupiers: paletteThrough('straight'),
    pays: (h) => isStraight(h) || isFlush(h),
    tests: makeTests({
      handSize: 2, handsPerTest: 13,
      fixed: [['7H 8H', '7H 8S', '7H 2H', '7H 2S', 'AS KS', 'AS 2D', 'KC 2C', 'KD 2C', '5S 5D', 'QD JD', '3C 9C', '9C 3D'],
        ['2S 9S', '2C 9D', '4H 4D', 'TS JC', '6D QD', 'AH AS']],
      nRandom: 3, seed: 144,
    }),
  },
  {
    id: 'threes-company',
    chapter: 1,
    card: '5H',
    title: 'Three\'s Company',
    difficulty: 2,
    story: [
      'Old Thursday and the Marchetti twins share a table at last, and each lays down one card a deal. When the three cards make a run (4, 5 and 6, in any order), the house pays all three together as one hand. Otherwise, nothing.',
      'Your new croupier gathers: it stacks two hands into one.',
    ],
    brief: 'Three players, one card each a deal. Pay out a deal\'s three cards together, as one hand, when they make a run (aces high or low, no wrapping).',
    handSize: 1,
    floor: floorOf(hexRange(2), F5),
    fixed: F5,
    croupiers: paletteThrough('gather'),
    expected: (inputs) => {
      const out = [];
      for (let i = 0; i + 2 < inputs.length; i += 3) {
        const h = [inputs[i][0], inputs[i + 1][0], inputs[i + 2][0]];
        if (isStraight(h)) out.push(h);
      }
      return out;
    },
    tests: dealtTests({
      deal: threeRunDeals,
      fixed: [one('5S 6H 7D 9C 8S TH AS 2H 3D KD QC AH 3H 2D 4C 6C 6D 7S'),
        one('JS QS KS 2C AC 3C 8D 9D 7H 4S 4H 5D KH AS 2D')],
      nRandom: 4, seed: 145,
    }),
  },
  {
    id: 'in-the-black',
    chapter: 1,
    card: '6H',
    title: 'In the Black',
    difficulty: 4,
    story: [
      'The Kesslers deal their own game, one card at a time with the suits in turn: a spade, a heart, a club, a diamond, then round again. The red cards are just for show. Once two or more black cards have been played since the last payout and together they make a run, the house pays them all as one hand.',
      'Runs as always: aces high or low, no wrapping. Black cards still waiting when the night ends are not paid.',
    ],
    brief: 'One card at a time, suits in turn (spade, heart, club, diamond). Pay out all the black cards since the last payout, as one hand, as soon as there are at least two and they make a run.',
    handSize: 1,
    floor: floorOf(hexRange(2), F6),
    fixed: F6,
    croupiers: paletteThrough('gather'),
    expected: blackRuns,
    tests: dealtTests({
      deal: blackRunDeals,
      fixed: [one('5S 2H 6C 3D 9S 4H 7C 5D 8S 6H AC 7D KS 8H QC 9D JS TH TC JD'),
        one('2S 4H 4C 5D 3S 6H JC 7D QS 8H KC 9D AS TH 9C JD')],
      nRandom: 4, seed: 146,
    }),
  },
  {
    id: 'top-and-bottom',
    chapter: 1,
    card: '7H',
    title: 'Top and Bottom',
    difficulty: 3,
    story: [
      'Five-card hands tonight. The Owner\'s note asks for the top card and the bottom card of each hand to be paid together, as one hand, and the three in the middle to go back in the box.',
      'Your new croupier cuts: it splits a hand into its top half and the rest.',
    ],
    brief: 'Five-card hands. Pay out the top card and the bottom card of every hand, together as one hand.',
    handSize: 5,
    floor: floorOf(hexRange(2), F7),
    fixed: F7,
    croupiers: paletteThrough('cut'),
    expected: (inputs) => inputs.map((h) => [h[0], h[4]]),
    tests: makeTests({ handSize: 5, handsPerTest: 10, fixed: [['AS 2S 3S 4S 5S', 'KH QH JH TH 9H', 'AD 9C 2H 8S 3D']], nRandom: 3, seed: 147 }),
  },
  {
    id: 'neighbours',
    chapter: 1,
    card: '8H',
    title: 'The Neighbours',
    difficulty: 3,
    story: [
      'The Owner\'s next note: "The house lucky number is 7. Pay the neighbours." Back to single cards: a 6 or an 8 wins.',
      'Your new croupier is a shoe: it deals the same stacked card over and over.',
    ],
    brief: 'Pay out every 6 and every 8.',
    handSize: 1,
    floor: floorOf(hexRange(2), F8),
    fixed: F8,
    croupiers: paletteThrough('shoe'),
    pays: ranks('6 8'),
    tests: makeTests({
      handSize: 1, handsPerTest: 13,
      fixed: [suitRun('S'), one('7H 6D 8C 7C 6H 8S 5D 9H')],
      nRandom: 3, seed: 148,
    }),
  },
  {
    id: 'lucky-seven',
    chapter: 1,
    card: '9H',
    title: 'Lucky Seven',
    difficulty: 5,
    story: [
      'The neighbours were a success, and the Owner is warming to the theme. Tonight\'s note says: "Pay the sevens. All four suits. Nothing else."',
      'Old Thursday claims he once pulled a seven out of a mayor\'s ear. He has brought a pocketful of them, just in case.',
    ],
    brief: 'Pay out every 7.',
    handSize: 1,
    floor: floorOf(hexRange(2, [-1, 0]), F9, [[0, 1]]),
    fixed: F9,
    croupiers: paletteThrough('shoe'),
    pays: ranks('7'),
    tests: makeTests({
      handSize: 1, handsPerTest: 16,
      fixed: [suitRun('H'), one('7S 6S 8S 7D 5C 9C 7C 6D 8D 7H')],
      nRandom: 3, seed: 132,
    }),
  },
  {
    id: 'sevens-and-eights',
    chapter: 1,
    card: 'TH',
    title: 'Sevens and Eights',
    difficulty: 3,
    story: [
      'Sal and the Kesslers have a table each tonight, and they take turns, a card at a time. Sal is paid for his sevens, the Kesslers for their eights, and neither will hear of being paid for the other\'s.',
      'Your new croupier counts: it says whether some rank turns up at least n times in a hand, for the n you set.',
    ],
    brief: 'Two tables take turns, one card at a time. Pay out every 7 from Sal\'s table (A) and every 8 from the Kesslers\' (B).',
    handSize: 1,
    floor: floorOf(hexRect(-1, 2, -4, 4), F10),
    fixed: F10,
    croupiers: paletteThrough('kind'),
    pays: (h, before) => rankOf(h[0]) === (before.length % 2 ? '8' : '7'),
    tests: makeTests({
      handSize: 1, handsPerTest: 26,
      fixed: [one('7S 8S 8H 7H 7D 8D 2C 3C 7C 8C 8C 7C')],
      nRandom: 3, seed: 149,
    }),
  },
  {
    id: 'seven-up',
    chapter: 1,
    card: 'JH',
    title: 'Seven Up',
    difficulty: 5,
    story: [
      'Sal has discovered Seven Up. Two cards each, and any hand holding a seven wins. A pair of sevens wins too, but not twice.',
      'Sal\'s uncle, over from across the river for the night, points out that the house deals from a very large shoe, and the house pretends not to hear.',
    ],
    brief: 'Two-card hands. Pay out every hand that holds at least one 7.',
    handSize: 2,
    floor: floorOf(hexRect(-2, 2, -6, 4), F11, [[-1, 0], [1, -1]]),
    fixed: F11,
    croupiers: paletteThrough('kind'),
    pays: (h) => countOf(h, '7') > 0,
    tests: makeTests({
      handSize: 2, handsPerTest: 16,
      fixed: [['7S 2D', '2D 7S', '7S 7D', '6S 8D', 'KS QS', '7H 8H', 'AS 7C', '2S 2D', '6C 6D', '8C 8D', '7C 6H', '5D 9D']],
      nRandom: 4, seed: 133,
    }),
  },
  {
    id: 'even-money',
    chapter: 1,
    card: 'QH',
    title: 'Even Money',
    difficulty: 7,
    story: [
      'Dmitri, an accountant who plays exactly one hour a night, wants to bet on even cards: 2, 4, 6, 8, 10 and Q.',
      'Management says yes, if you can tell them apart. Across the river, the Vellanis have started asking who Dmitri is.',
    ],
    brief: 'Pay out every even card (2 4 6 8 10 Q).',
    handSize: 1,
    floor: floorOf(hexRect(-2, 2, -4, 5), F12),
    fixed: F12,
    croupiers: paletteThrough('kind'),
    pays: (h) => (hv(h[0]) % 2 === 0 && rankOf(h[0]) !== 'A'),
    tests: makeTests({
      handSize: 1, handsPerTest: 26,
      fixed: [suitRun('S'), one('2H 2D AH 3H 4H 5H 6H 7H 8H 9H TH JH QH KH')],
      nRandom: 4, seed: 109,
    }),
  },
  {
    id: 'lucky-number',
    chapter: 1,
    card: 'KH',
    title: 'Lucky Number',
    difficulty: 6,
    story: [
      'Dmitri has worked it out. A five-card hand with exactly one seven is lucky; two sevens are unlucky, and no sevens at all is merely Tuesday.',
      'He would like the house to pay the lucky ones. He has brought a spreadsheet.',
    ],
    brief: 'Five-card hands. Pay out every hand with exactly one 7.',
    handSize: 5,
    floor: floorOf(hexRect(-3, 2, -7, 3), F13, [[0, 0], [-2, 1]]),
    fixed: F13,
    croupiers: paletteThrough('kind'),
    pays: (h) => countOf(h, '7') === 1,
    tests: makeTests({
      handSize: 5, handsPerTest: 10,
      fixed: [['7S 2D 3C 4H 5S', '7S 7D 3C 4H 5S', 'KS KD KC KH 7S', 'KS KD KC KH QS', '7S 7D 7C 7H 2S',
        '2S 3S 4S 5S 6S', '7H 2D 2C 2H 9S', '8S 8D 7C 9H 9S', '7C 7H 7D 8S 8D', '6S 8D 9C TH 7D']],
      nRandom: 4, seed: 134,
    }),
  },
];

// Par, from the reference solutions in solutions/levels/ (croupiers including
// shoes; rounds totalled over the level's tests). test/levels.js
// checks these exactly; `node tools/write-solutions.js hearts --par` rewrites
// this table from the recipes in tools/level-specs/hearts.js.
// BEGIN PAR
const PAR = {
  'first-night': { croupiers: 4, rounds: 21 },
  'red-and-black': { croupiers: 2, rounds: 57 },
  'two-at-a-time': { croupiers: 2, rounds: 49 },
  'thursdays-game': { croupiers: 6, rounds: 92 },
  'threes-company': { croupiers: 3, rounds: 61 },
  'in-the-black': { croupiers: 4, rounds: 154 },
  'top-and-bottom': { croupiers: 5, rounds: 52 },
  'neighbours': { croupiers: 4, rounds: 62 },
  'lucky-seven': { croupiers: 8, rounds: 77 },
  'sevens-and-eights': { croupiers: 8, rounds: 51 },
  'seven-up': { croupiers: 6, rounds: 89 },
  'even-money': { croupiers: 14, rounds: 169 },
  'lucky-number': { croupiers: 11, rounds: 80 },
};
// END PAR
finishChapter(LEVELS, PAR);
