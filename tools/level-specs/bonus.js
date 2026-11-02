// Reference-solution recipes for the bonus deck. Regenerate with
// `node tools/write-solutions.js bonus [--par]`.
import { E, SE, SW, W, NW, NE, c, pass, war, twar, shoe } from './shared.js';
import { RANKS } from '../../src/cards.js';

const SUITED = ['S', 'D', 'C', 'H'];

// Casino Numbers (base 13: digits and players' cards ace to king). A
// shoe's cards are stacked (in chunks of 13, released by a joker, as in the
// store of Last In, First Out) and split by suit into a table (hearts and
// clubs) and a ruler (spades).
//  * The table holds twelve cards of each rank r, r - 1 of them hearts. Set
//    on a player's spade and a copy of the table keeps the thirteen cards of
//    its rank, and Suits keeps the spade and the hearts: r cards. The
//    players' cards are looked up separately (on a pair, Set would keep one
//    group).
//  * Both counts are stacked on a copy of the ruler, so the ruler sits one
//    card lower for every unit of the sum, and Deal pays the cards at two
//    fixed places: card 26, the units card for the sum (ruler[26 - s]), and
//    card L + 13, which is there only when the sum is 14 or more (one of the
//    ruler's last thirteen cards, the leading aces), dealt on top.
// `base` is the number base (digits ace to its value, no zero) and `top`
// the highest card a player holds. (In base 10 with cards ace to nine, the
// machine is the same, with a 104-card shoe instead of 208. With an
// advertising card for zero instead it is the same size too, but the zero
// shares Suits' misc with the store's padding. In base 13 up to seven copies
// of the 156-card table are on the floor at once, about 1250 cards; gating
// the table's loop with the players' cards, a War per player whose dealer
// is the card, would keep it to about three copies for two more croupiers.)
function casinoDeck({ base = 13, top = 13 } = {}) {
  const max = 2 * top;
  const units = (s) => `${RANKS[(s - 1) % base]}S`;
  // The table: for each rank r, top - 1 cards of rank r, r - 1 of them hearts.
  const table = [];
  for (let r = 1; r <= top; r++) for (let i = 0; i < top - 1; i++) table.push(RANKS[r - 1] + (i < r - 1 ? 'H' : 'C'));
  // The ruler: the units card of the sum s at max - s, then the leading aces.
  const L = (max - 1) + (max - base);
  const ruler = Array.from({ length: L }, (_, i) => (i <= max - 2 ? units(max - i) : 'AS'));
  const order = ['?', ...ruler, ...table];
  while (order.length % 13) order.push('$');
  // Chunks of 13 are stacked as they come, so the last chunk dealt is on top.
  const chunks = [];
  for (let i = 0; i < order.length; i += 13) chunks.push(order.slice(i, i + 13));
  return { deck: chunks.reverse().flat(), at: [max, L + base] };
}
export function casinoSums(digits) {
  const k = casinoDeck(digits);
  const nodes = {
    SH: shoe([6, -3], k.deck, { once: true }), H13: c([5, -3], 'hand', { n: 13 }),
    ST: c([4, -3], 'gather'), TW: war([3, -3]), AC: shoe([3, -4], 'AC'),
    BK: pass([4, -4]), SEED: shoe([5, -5], '$', { once: true }),
    SP: c([3, -2], 'suits'),
    DT1: c([3, 0], 'duplicate'), DT2: c([4, 0], 'duplicate'),
    GA: c([4, -1], 'gather'), SA: c([3, -1], 'set'), UA: c([2, -1], 'suits'),
    GB: c([3, 1], 'gather'), SB: c([2, 1], 'set'), UB: c([1, 1], 'suits'),
    G3: c([1, 0], 'gather'), G4: c([0, 0], 'gather'),
    DR: c([0, -1], 'duplicate'), PR: pass([1, -2]),
    // Deal: every card but the two paid goes SE, onto the floor.
    DL: c([-1, 0], 'deal', { out: { to: Array(k.at[1] + 1).fill(SE) } }),
  };
  for (const n of [nodes.BK, nodes.PR]) delete n.out.out;
  const links = [
    ['SH', null, 'H13'], ['H13', 'out', 'ST'], ['BK', 'out', 'ST', 'under'], ['SEED', null, 'BK'],
    ['AC', null, 'TW', 'dealer'], ['ST', 'out', 'TW'], ['TW', 'lose', 'BK'], ['TW', 'win', 'SP'],
    ['SP', ['H', 'C'], 'DT2'], ['DT1', 'a', 'DT2'], ['DT2', 'a', 'DT1'],
    ['DT1', 'b', 'GA', 'under'], ['DT2', 'b', 'GB', 'under'],
    ['GA', 'out', 'SA'], ['SA', 'set', 'UA'], ['UA', ['S', 'H'], 'G3'],
    ['GB', 'out', 'SB'], ['SB', 'set', 'UB'], ['UB', ['S', 'H'], 'G3'],
    ['SP', 'S', 'PR'], ['DR', 'a', 'PR'], ['PR', 'out', 'DR'], ['DR', 'b', 'G4', 'under'],
    ['G3', 'out', 'G4'], ['G4', 'out', 'DL'], ['DL', k.at, 'desk'],
  ];
  return { nodes, links };
}
const at = ([q, r], [dq, dr]) => [q + dq, r + dr];

// Times Tables (casino products). The players' cards are counted as in
// Carry the One (a master table round a ring of two lookups: each gathers
// a card on top of the table, copies it and burns the card off; Set and
// Suits on the copy give the card as that many hearts), and the product is
// read off a ruler of 13 rows, one per card a of player A:
//  * The ruler's row for a is every thirteenth card from 13 - a (mod 13).
//    A's count goes on top of a copy of the ruler (stacked by the store
//    with the table, and split from it by suit: spades and diamonds), so
//    Deal round 13 piles puts row a on pile 0, its last card on top.
//  * Row a holds, from the top, the units digit of a × b at 13 - b and its
//    leading digit at 26 - b (a diamond when the product is one digit). B's
//    count goes on top of the row, and Deal pays cards 13 and 26: the units
//    digit, and the leading digit on top of it; Suits drops the diamond.
//  * The ruler goes round a ring of its own (Suits drops the count, Gather
//    and Duplicate), which waits for A's counts, so one copy is out at once.
function productDecks() {
  const S = (v) => `${RANKS[v - 1]}S`;
  const ruler = Array(338);
  for (let a = 1; a <= 13; a++) for (let b = 1; b <= 13; b++) {
    const n = a * b, place = (t) => ((13 - a) % 13) + 13 * (25 - t);
    ruler[place(13 - b)] = S(((n - 1) % 13) + 1);
    const lead = Math.floor((n - 1) / 13);
    ruler[place(26 - b)] = lead ? S(lead) : '2D';
  }
  const table = [];
  for (let r = 1; r <= 13; r++) for (let i = 0; i < 13; i++) table.push(RANKS[r - 1] + (i < r ? 'H' : 'C'));
  const order = ['?', ...ruler, ...table];
  while (order.length % 52) order.push('$');
  const chunks = [];
  for (let i = 0; i < order.length; i += 52) chunks.push(order.slice(i, i + 52));
  return chunks.reverse().flat();
}
export function casinoProducts() {
  const at = {
    GA: [1, -1], DA: [1, 0], BA: [1, 1], TA: [0, 1], UA: [-1, 1], MP: [1, -2],
    GB: [2, 0], DB: [3, 0], BB: [4, 0], TB: [3, 1], UB: [2, 2],
    SH: [-1, -5], HS: [-1, -4], ST: [-1, -3], TW: [-1, -2], AC: [0, -3], BK: [-2, -2], SEED: [-3, -2], SP: [0, -2],
    RS: [-1, -1], G4: [-1, 0], DR: [-2, 1], DL13: [-2, 2], G5: [0, 2], DL: [0, 3], SU: [0, 4],
  };
  const nodes = {
    SH: shoe(at.SH, productDecks(), { once: true }), HS: c(at.HS, 'hand', { n: 52 }), ST: c(at.ST, 'gather'),
    TW: twar(at.TW), AC: shoe(at.AC, 'AC'), BK: c(at.BK, 'pass'), SEED: shoe(at.SEED, '$', { once: true }),
    SP: c(at.SP, 'suits'), MP: c(at.MP, 'pass'),
    RS: c(at.RS, 'suits'), G4: c(at.G4, 'gather'), DR: c(at.DR, 'duplicate'),
    // unpaid cards go to a free side, onto the floor
    DL13: c(at.DL13, 'deal', { out: { to: Array(13).fill(SE) } }),
    G5: c(at.G5, 'gather'), DL: c(at.DL, 'deal', { out: { to: Array(28).fill(E) } }), SU: c(at.SU, 'suits'),
  };
  for (const d of ['A', 'B']) {
    Object.assign(nodes, {
      [`G${d}`]: c(at[`G${d}`], 'gather'), [`D${d}`]: c(at[`D${d}`], 'duplicate'), [`B${d}`]: c(at[`B${d}`], 'burn'),
      [`T${d}`]: c(at[`T${d}`], 'set'), [`U${d}`]: c(at[`U${d}`], 'suits'),
    });
  }
  for (const n of Object.values(nodes)) if (n.fn === 'pass') n.out = {};
  const links = [
    // the store
    ['SH', null, 'HS'], ['HS', 'out', 'ST'], ['BK', 'out', 'ST', 'under'], ['SEED', null, 'BK'],
    ['AC', null, 'TW', 'dealer'], ['ST', 'out', 'TW'], ['TW', 'lose', 'BK'], ['TW', 'win', 'SP'],
    // the table round the two lookups
    ['SP', ['H', 'C'], 'MP'], ['BB', 'rest', 'MP'], ['MP', 'out', 'GA', 'under'], ['BA', 'rest', 'GB', 'under'],
    ...['A', 'B'].flatMap((d) => [[`G${d}`, 'out', `D${d}`], [`D${d}`, 'b', `B${d}`], [`D${d}`, 'a', `T${d}`], [`T${d}`, 'set', `U${d}`]]),
    // the ruler round its ring; A's count picks the row, B's the product
    ['SP', ['S', 'D'], 'RS'], ['RS', ['S', 'D'], 'G4', 'under'], ['UA', 'H', 'G4'], ['G4', 'out', 'DR'], ['DR', 'b', 'RS'],
    ['DR', 'a', 'DL13'], ['DL13', [0], 'G5', 'under'], ['UB', 'H', 'G5'], ['G5', 'out', 'DL'], ['DL', [13, 26], 'SU'],
    ['SU', 'S', 'desk'],
  ];
  return { nodes, links };
}

// Carry the One (two-digit casino sums): each player plays two spades, the
// leading digit on top. The machine works in unary, a digit at a time.
//  * A master table (thirteen cards of each rank r, r of them hearts; stacked
//    by a store as in Casino Numbers) goes round a ring of four lookups, one
//    per digit: each gathers its digit on top of the table, copies it, and
//    burns the digit off again (so the ring waits for each digit, and only
//    one table and a copy or two are on the floor). Set on the copy keeps
//    the digit's rank and Suits its hearts: the digit as that many cards.
//  * The units counts (s = 2 to 26 cards) go on a 25-card ruler; Deal pays
//    card 26 (the units digit of s) and cards 0 and 38 (a carry pile: two
//    cards for s >= 14, one otherwise).
//  * The carry pile and the leading counts (t + 1 cards, t = the leading
//    digits plus the carry, 2 to 27) go on a 40-card ruler; Deal pays card
//    28 (the units digit of t) and card 54 (there only for t >= 14: its
//    leading digit), the higher on top, and the units digit is gathered
//    underneath.
// Laid out by simulated annealing (block positions; routes by the router).
function longSumsDecks() {
  const units = (n) => `${RANKS[(n - 1) % 13]}S`;
  const r1 = Array.from({ length: 25 }, (_, i) => units(26 - i));
  const r2 = Array.from({ length: 40 }, (_, i) => (i <= 25 ? units(27 - i) : i === 26 ? '2S' : 'AS'));
  const table = [];
  for (let r = 1; r <= 13; r++) for (let i = 0; i < 13; i++) table.push(RANKS[r - 1] + (i < r ? 'H' : 'C'));
  const order = ['?', ...table];
  while (order.length % 13) order.push('$');
  const chunks = [];
  for (let i = 0; i < order.length; i += 13) chunks.push(order.slice(i, i + 13));
  return { r1, r2, deck: chunks.reverse().flat() };
}
export function casinoLongSums() {
  const k = longSumsDecks();
  const at = {
    SpA: [-1, -3], SpB: [8, -1],
    GA2: [-2, 3], DA2: [-1, 2], BA2: [0, 1], TA2: [0, 2], UA2: [0, 3],
    GA1: [3, -3], DA1: [4, -3], BA1: [5, -3], TA1: [4, -2], UA1: [3, -1],
    GB1: [8, -2], DB1: [7, -1], BB1: [6, 0], TB1: [6, -1], UB1: [6, -2],
    GB2: [5, 1], DB2: [5, 2], BB2: [5, 3], TB2: [4, 3], UB2: [3, 3],
    SH: [-3, 0], H13: [-2, 0], ST: [-1, 0], TW: [0, 0], AC: [0, -1], BK: [-1, 1], SEED: [-2, 2], BJ: [1, -1],
    MP: [2, -2], SR1: [1, 1], HR1: [1, 2], SR2: [5, 0], HR2: [5, -1],
    GU: [2, 3], GT1: [4, -1], GR1: [2, 2], DL1: [2, 1], GT2: [3, 0], GF: [3, 1], GR2: [4, 0], DL2: [4, 1],
  };
  const nodes = {
    SpA: c(at.SpA, 'burn'), SpB: c(at.SpB, 'burn'),
    SH: shoe(at.SH, k.deck, { once: true }), H13: c(at.H13, 'hand', { n: 13 }), ST: c(at.ST, 'gather'),
    TW: twar(at.TW), AC: shoe(at.AC, 'AC'), BK: c(at.BK, 'pass'), SEED: shoe(at.SEED, '$', { once: true }),
    BJ: c(at.BJ, 'burn'), MP: c(at.MP, 'pass'),
    SR1: shoe(at.SR1, k.r1), HR1: c(at.HR1, 'hand', { n: 25 }), SR2: shoe(at.SR2, k.r2), HR2: c(at.HR2, 'hand', { n: 40 }),
    GU: c(at.GU, 'gather'), GT1: c(at.GT1, 'gather'), GR1: c(at.GR1, 'gather'), GT2: c(at.GT2, 'gather'),
    GF: c(at.GF, 'gather'), GR2: c(at.GR2, 'gather'),
    // unpaid cards go to a free side, onto the floor
    DL1: c(at.DL1, 'deal', { out: { to: Array(52).fill(NW) } }),
    DL2: c(at.DL2, 'deal', { out: { to: Array(56).fill(SE) } }),
  };
  for (const d of ['A2', 'A1', 'B1', 'B2']) {
    Object.assign(nodes, {
      [`G${d}`]: c(at[`G${d}`], 'gather'), [`D${d}`]: c(at[`D${d}`], 'duplicate'), [`B${d}`]: c(at[`B${d}`], 'burn'),
      [`T${d}`]: c(at[`T${d}`], 'set'), [`U${d}`]: c(at[`U${d}`], 'suits'),
    });
  }
  for (const n of Object.values(nodes)) if (n.fn === 'pass') n.out = {};
  const links = [
    // each player's leading digit (the top card) to A1/B1, the units to A2/B2
    ['SpA', 'rest', 'GA2'], ['SpA', 'burn', 'GA1'], ['SpB', 'rest', 'GB2'], ['SpB', 'burn', 'GB1'],
    // the store
    ['SH', null, 'H13'], ['H13', 'out', 'ST'], ['BK', 'out', 'ST', 'under'], ['SEED', null, 'BK'],
    ['AC', null, 'TW', 'dealer'], ['ST', 'out', 'TW'], ['TW', 'lose', 'BK'], ['TW', 'win', 'BJ'], ['BJ', 'rest', 'MP'],
    // the ring: A2, A1, B1, B2
    ['BA2', 'rest', 'MP'], ['MP', 'out', 'GA1', 'under'], ['BA1', 'rest', 'GB1', 'under'],
    ['BB1', 'rest', 'GB2', 'under'], ['BB2', 'rest', 'GA2', 'under'],
    ...['A1', 'A2', 'B1', 'B2'].flatMap((d) => [[`G${d}`, 'out', `D${d}`], [`D${d}`, 'b', `B${d}`],
      [`D${d}`, 'a', `T${d}`], [`T${d}`, 'set', `U${d}`]]),
    // the counts: units, and leading digits
    ['UA2', 'H', 'GU'], ['UB2', 'H', 'GU'], ['UA1', 'H', 'GT1'], ['UB1', 'H', 'GT1'],
    // the units column
    ['SR1', null, 'HR1'], ['HR1', 'out', 'GR1', 'under'], ['GU', 'out', 'GR1'], ['GR1', 'out', 'DL1'],
    ['DL1', [0, 38], 'GT2'], ['DL1', [26], 'GF', 'under'], ['GT1', 'out', 'GT2'],
    // the leading column
    ['SR2', null, 'HR2'], ['HR2', 'out', 'GR2', 'under'], ['GT2', 'out', 'GR2'], ['GR2', 'out', 'DL2'],
    ['DL2', [28, 54], 'GF'], ['GF', 'out', 'desk'],
  ];
  return { nodes, links };
}


export const SPECS = {
  'small-change': {
    // A king beats a queen but not a king; the ace of spades then beats it,
    // and goes to the desk while the king drops (by the desk, so the ace is
    // paid in the same round as the last king leaves the floor).
    cells: [
      war([-2, 0], { dealer: NW, out: { win: E } }), shoe([-2, -1], 'QC', { out: SE }),
      war([-1, 0], { dealer: NW, out: { lose: E } }), shoe([-1, -1], 'KC', { out: SE }),
      war([0, 0], { dealer: NW, out: { dwin: E } }), shoe([0, -1], 'AS', { out: SE }),
    ],
  },
  'split-pot': {
    // Set's two piles go to the desk by different sides, so they arrive as
    // two hands rather than stacked into one.
    cells: [
      c([-2, 0], 'kind', { n: 2, out: { yes: E } }),
      c([-1, 0], 'set', { out: { set: E, rest: SE } }), pass([-1, 1], NE),
    ],
  },
  'every-other': {
    // Deal the copy's 1st and 3rd cards to the gate and the others onto the
    // floor (an in-shuffle and a cut also isolate them).
    cells: [
      c([-1, 0], 'duplicate', { out: { a: E, b: NE } }),
      c([0, -1], 'deal', { out: { to: [SE, NE, SE, NE, NE] } }),
      war([0, 0], { dealer: NW, out: { lose: E } }), pass([1, 0], E),
    ],
  },
  'after-a-pair': {
    // Test a copy: a pair releases a 2, anything else an ace, into the
    // gate's dealer line, which a shoe seeds with an ace for the first hand;
    // so each original meets the verdict on the hand before it. One decision
    // and equal routes afterwards, so no door.
    cells: [
      c([-2, 0], 'duplicate', { out: { a: NE, b: NW } }),
      c([-2, -1], 'kind', { n: 2, out: { yes: NE, no: NW } }),
      war([-1, -2], { dealer: E, out: { dwin: NW, dlose: NW } }), shoe([0, -2], '2C', { out: W }),
      war([-2, -2], { dealer: SW, out: { dwin: NE, dlose: NE } }), shoe([-3, -1], 'AC', { out: NE }),
      pass([-1, -3], E), pass([0, -3], E), pass([1, -3], SE), pass([1, -2], SW), pass([0, -1], W),
      shoe([1, -1], 'AD', { out: W, once: true }),
      war([-1, -1], { dealer: E, out: { win: SE } }),
    ],
  },
  bookends: {
    // A copy of each hand loses its top card; its bottom card waits in the
    // gate's dealer line for the next hand, behind an ace for the first.
    cells: [
      c([-2, 0], 'duplicate', { out: { a: E, b: SE } }),
      c([-2, 1], 'burn', { out: { rest: E } }), pass([-1, 1], NW), shoe([-1, 2], 'AC', { out: NW, once: true }),
      twar([-1, 0], { dealer: SE, out: { win: E } }),
    ],
  },
  'four-of-a-kind': {
    // As in Deja Vu, the memory is a stack of the cards played so far, seeded
    // with an advertising card (which Set never counts). A new card goes on
    // top; four of a kind goes to Set, whose set is the four to pay, and
    // whose rest is the new memory.
    cells: [
      c([-2, 0], 'gather', { under: NE, out: { out: E } }),
      c([-1, 0], 'kind', { n: 4, out: { yes: E, no: NW } }),
      c([0, 0], 'set', { out: { set: E, rest: NW } }),
      pass([0, -1], W), pass([-1, -1], SW), shoe([0, -2], '$$', { out: SW, once: true }),
    ],
  },
  'two-apart': {
    // Not a run of two, but a run once a joker fills the gap (or an end:
    // one apart is already out); Suits then drops the joker on the way out.
    cells: [
      c([-2, 0], 'straight', { out: { no: E } }),
      c([-1, 0], 'gather', { under: NW, out: { out: SE } }), shoe([-1, -1], '?', { out: SE }),
      c([-1, 1], 'straight', { out: { yes: W } }),
      c([-2, 1], 'suits', { out: { S: SE, H: SE, D: SE, C: SE } }),
    ],
  },
  'three-apart': {
    // As Two Apart, one joker further: not a run with one joker, a run with two.
    cells: [
      c([-2, 0], 'gather', { under: NW, out: { out: E } }), shoe([-2, -1], '?', { out: SE }),
      c([-1, 0], 'straight', { out: { no: E } }),
      c([0, 0], 'gather', { under: NW, out: { out: SE } }), shoe([0, -1], '?', { out: SE }),
      c([0, 1], 'straight', { out: { yes: W } }),
      c([-1, 1], 'suits', { out: { S: SW, H: SW, D: SW, C: SW } }),
    ],
  },
  'counting-up': {
    // The rank waited for is four cards of it, gathered on top of each hand:
    // five of a kind means the hand holds one. A cut then splits the four
    // from the hand. A paid hand's four go to a War that releases the next
    // four (a Hand(4) on a shoe stacked 2222 3333 ... AAAA) and drops the
    // old; an advertising card in a `once` shoe lets the first four through.
    cells: [
      c([-3, 0], 'gather', { under: W, out: { out: E } }),
      c([-2, 0], 'kind', { n: 5, out: { yes: E, no: SW } }),
      c([-1, 0], 'cut', { out: { bottom: SW, top: NW } }),
      c([-3, 1], 'cut', { out: { top: NW } }),
      pass([-1, -1], W), shoe([0, -1], '$', { out: W, once: true }),
      war([-2, -1], { dealer: E, out: { win: SW, lose: SW } }),
      c([-1, -2], 'hand', { n: 4, out: { out: SW } }),
      shoe([0, -2], RANKS.flatMap((r) => 'SHDC'.split('').map((s) => r + s)).slice(4).concat(['AS', 'AH', 'AD', 'AC']), { out: W }),
    ],
  },
  rising: {
    // Each hand goes round a loop as [hand, joker, hand]: Burn takes the top
    // card off and a top-card War checks it doesn't beat the next one (a
    // tie goes to the house, so equal ranks pass). When the joker comes up
    // it beats the ace in the second War, and a last Burn drops it, leaving
    // the hand's copy to pay.
    cells: [
      c([-3, 0], 'duplicate', { out: { a: E, b: NE } }),
      c([-2, 0], 'gather', { under: SW, out: { out: E } }), shoe([-3, 1], '?', { out: NE }),
      pass([-2, -1], E), pass([-1, -1], SE),
      c([-1, 0], 'gather', { under: NW, out: { out: E } }),
      c([0, 0], 'burn', { out: { burn: E, rest: SE } }), pass([1, 0], SW),
      twar([0, 1], { dealer: NW, out: { dwin: W } }),
      twar([-1, 1], { dealer: SE, out: { win: W, lose: NE } }), shoe([-1, 2], 'AC', { out: NW }),
      c([-2, 1], 'burn', { out: { rest: SW } }),
    ],
  },
  'head-count': {
    // A copy of the hand is doubled and laid on a ruler 6 5 4 3 2 A and six
    // advertising cards: cutting that in half puts the ruler card naming the
    // hand's size on top of the bottom half, and the hand's top card on top
    // of the top half. Two top-card Wars check they tie; if so the bottom
    // half's advertising cards (Suits' misc) go to the gate's dealer and the
    // hand beats them; otherwise the top half goes, and the hand can't beat
    // a stack that holds it.
    cells: [
      c([-4, 0], 'duplicate', { out: { a: SE, b: NE } }),
      c([-3, -1], 'duplicate', { out: { a: E, b: NE } }), pass([-2, -2], SE),
      c([-2, -1], 'gather', { under: NW, out: { out: E } }),
      c([-1, -2], 'hand', { n: 12, out: { out: SE } }),
      shoe([0, -3], ['6S', '5S', '4S', '3S', '2S', 'AS', '$', '$', '$', '$', '$', '$'], { out: SW }),
      c([-1, -1], 'gather', { under: NW, out: { out: E } }),
      c([0, -1], 'cut', { out: { bottom: E, top: NE } }), pass([1, -2], SE),
      twar([1, -1], { dealer: W, out: { dwin: E, lose: NE, win: SE } }), pass([2, -2], SE),
      twar([2, -1], { dealer: NW, out: { dlose: SW, lose: SE } }),
      c([2, 0], 'suits', { out: { misc: W, S: E, H: E, D: E, C: E } }),
      pass([1, 0], SW), pass([0, 1], W), pass([-1, 1], W), pass([-2, 1], W), pass([-3, 1], W),
      war([-4, 1], { dealer: E, out: { win: SE } }),
    ],
  },
  'mirror-image': {
    // The two hands are stacked and the stack copied. Sorted into new deck
    // order, the copy of a matching deal is ten cards in identical pairs;
    // Hand(2) splits it into five pairs, and each becomes one verdict card:
    // a pair of identical cards (K2 then Flush) loses one card, any other
    // pair is swapped for a joker. Hand(5) collects the five verdicts to
    // play the stack (as dealer, so ties go its way): it can't lose to its
    // own cards, but loses to a joker. A cut splits a winning stack back
    // into the two hands. Every verdict takes the same number of rounds to
    // reach Hand(5), so the deals' verdicts never overtake each other.
    cells: [
      c([-4, 0], 'gather', { under: SW, out: { out: E } }),
      c([-3, 0], 'duplicate', { out: { a: NE, b: SE } }),
      c([-2, -1], 'sort', { out: { out: E } }),
      c([-1, -1], 'hand', { n: 2, out: { out: E } }),
      c([0, -1], 'kind', { n: 2, out: { yes: NE, no: SE } }), pass([0, 0], NE),
      c([1, -2], 'flush', { out: { yes: E, no: SE } }),
      pass([1, -1], E),
      c([2, -1], 'gather', { under: W, out: { out: E } }), shoe([2, 0], '?', { out: NW }),
      c([3, -1], 'burn', { out: { burn: E } }),
      c([2, -2], 'burn', { out: { rest: E } }), pass([3, -2], E), pass([4, -2], SE),
      c([4, -1], 'hand', { n: 5, out: { out: SE } }),
      pass([4, 0], SW), pass([3, 1], W), pass([2, 1], W), pass([1, 1], W), pass([0, 1], W), pass([-1, 1], W),
      pass([-2, 1], W),
      war([-3, 1], { dealer: NW, out: { dwin: SE } }),
      c([-3, 2], 'cut', { out: { top: W, bottom: SW } }), pass([-4, 3], NW),
    ],
  },
  showdown: {
    // The players' hands are stacked and dealt out again one at a time
    // (Hand(3)), so one sorter serves both. It deals a hand into three
    // cards and sorts them high to low with three Wars wired as
    // compare-and-swap (both wins to one side, both losses to the other),
    // then gathers them back up. Hand(6) and a cut pair each deal's sorted
    // hands up again, and three stages of top-card Wars compare them: each
    // stage plays the hands both ways round (ties go to the house, so a win
    // either way is a strict win), pays a winner, and on a tie moves both
    // top cards to the bottom (Burn with both piles to one side) for the
    // next stage. Ties in the last stage are dropped.
    cells: [
      // the sorter, along the top
      c([-5, -4], 'gather', { under: SW, out: { out: E } }),
      c([-4, -4], 'hand', { n: 3, out: { out: E } }),
      c([-3, -4], 'deal', { out: { to: [E, NE, SE] } }), pass([-2, -5], SE), pass([-3, -3], E),
      war([-2, -4], { dealer: NW, out: { win: E, dwin: E, lose: SE, dlose: SE } }),
      war([-2, -3], { dealer: W, out: { win: NE, dwin: NE, lose: SE, dlose: SE } }),
      war([-1, -4], { dealer: SW, out: { win: E, dwin: E, lose: SE, dlose: SE } }), pass([-1, -3], NE),
      c([0, -4], 'gather', { under: SW, out: { out: E } }),
      pass([-2, -2], E), pass([-1, -2], E), pass([0, -2], NE), pass([1, -3], NW),
      c([1, -4], 'gather', { under: SE, out: { out: E } }),
      c([2, -4], 'hand', { n: 6, out: { out: SE } }),
      pass([2, -3], SE), pass([2, -2], SW), pass([1, -1], SE),
      c([1, 0], 'cut', { out: { top: W, bottom: SW } }), pass([0, 1], NW),
      // stage 1
      twar([0, 0], { dealer: SE, out: { win: NW, dwin: W, lose: SW } }), pass([-1, 1], NW),
      twar([-1, 0], { dealer: SE, out: { win: NW, dwin: W, lose: SW } }),
      c([-2, 0], 'burn', { out: { burn: SW, rest: SW } }), c([-2, 1], 'burn', { out: { burn: W, rest: W } }),
      // stage 2
      twar([-3, 1], { dealer: E, out: { win: NW, dwin: W, lose: SW } }), pass([-4, 2], NW),
      twar([-4, 1], { dealer: SE, out: { win: NW, dwin: W, lose: SW } }),
      c([-5, 1], 'burn', { out: { burn: SW, rest: SW } }), c([-5, 2], 'burn', { out: { burn: W, rest: W } }),
      // stage 3
      twar([-6, 2], { dealer: E, out: { win: NW, dwin: W, lose: SW } }), pass([-7, 3], NW),
      twar([-7, 2], { dealer: SE, out: { win: NW } }),
      // to the desk
      pass([0, -1], W), pass([-1, -1], W), pass([-2, -1], SW), pass([-3, 0], W), pass([-4, 0], W),
      pass([-5, 0], SW), pass([-6, 1], W), pass([-7, 1], NW), pass([-7, 0], NW),
    ],
  },
  'last-in-first-out': {
    // A pass prefers the player's side to a `once` joker's, so the joker
    // only gets through after the last hand. Each hand is gathered onto a
    // `$` marker and pushed onto a stack (seeded with a `$`); a top-card War
    // against an ace sends the stack round again until the joker is on top.
    // Then the joker is burned and the stack is dealt off a card at a time
    // (Burn in a loop) onto a growing hand; when a marker comes up (a
    // top-card War against `$$` only ties on an advertising card), Burn
    // takes it off to start the next hand, and Suits drops the old marker
    // on the way to the desk.
    cells: [
      pass([-2, 0], E), shoe([-2, -1], '?', { out: SE, once: true }),
      c([-1, 0], 'gather', { under: NW, out: { out: E } }), shoe([-1, -1], '$', { out: SE }),
      c([0, 0], 'gather', { under: SE, out: { out: E } }),
      twar([1, 0], { dealer: NW, out: { lose: SW, win: E } }), shoe([1, -1], 'AC', { out: SE }),
      pass([0, 1], NW), shoe([-1, 1], '$', { out: E, once: true }),
      c([2, 0], 'burn', { out: { rest: SE } }),
      c([2, 1], 'burn', { out: { burn: SW, rest: E } }), pass([3, 1], W),
      c([1, 2], 'gather', { under: SW, out: { out: W } }),
      twar([0, 2], { dealer: NE, out: { win: SE, lose: W } }), shoe([1, 1], '$$', { out: SW }),
      pass([0, 3], NE), shoe([1, 3], '$', { out: W, once: true }),
      c([-1, 2], 'burn', { out: { burn: SE, rest: W } }), pass([-1, 3], E),
      c([-2, 2], 'suits', { out: { S: W, H: W, D: W, C: W } }),
    ],
  },
  'one-up': {
    // Two shoes in step deal each card and the next one up in its suit
    // (A..K and 2..A, suit by suit); a gather pairs them, and the card
    // waiting in the loop takes the next pair on top of it. N of a kind and
    // Flush keep [card, x, y] only if the card is x or y; a Deal sets x
    // aside and a second K2 tells x (pay y: Burn) from y (go round again).
    // Everything else burns the waiting card back into the loop (Burn's
    // rest keeps the player's own card when it matched y). One card at a
    // time: a War lets the next card in when the last one is paid.
    cells: [
      war([-1, 1], { dealer: SE, out: { win: E, lose: E } }),
      pass([-1, 2], NW), shoe([-2, 2], '$', { out: E, once: true }),
      c([0, 1], 'pass', { out: { out: NW } }),
      c([0, 0], 'gather', { under: NE, out: { out: E } }),
      c([1, -1], 'gather', { under: NE, out: { out: SW } }),
      shoe([1, -2], SUITED.flatMap((s) => RANKS.map((r) => r + s)), { out: SE }),
      shoe([2, -2], SUITED.flatMap((s) => RANKS.map((r, i) => RANKS[(i + 1) % 13] + s)), { out: SW }),
      c([1, 0], 'kind', { n: 2, out: { yes: E, no: SE } }),
      c([2, 0], 'flush', { out: { yes: SE, no: SW } }),
      c([2, 1], 'deal', { out: { to: [SW, E, SW] } }),
      c([1, 2], 'kind', { n: 2, out: { no: SW, yes: W } }),
      c([1, 1], 'burn', { out: { burn: W } }),
      c([0, 2], 'burn', { out: { rest: NW } }),
      pass([0, 3], W),
      c([-1, 3], 'burn', { out: { burn: W, rest: NW } }),
    ],
  },

  'crossed-wires': {
    // A crossover network: each pair of streams crosses at a War with the
    // player's hand sent one way and the dealer's the other, win or lose.
    // A crosses B, then C, then B and C cross; every War pairs one hand of
    // each, which works because the players have the same number of hands.
    cells: [
      pass([-1, -2], SE), pass([-2, 0], NE),
      war([-1, -1], { dealer: SW, out: { win: SE, lose: SE, dwin: E, dlose: E } }),
      pass([-3, 2], NE), pass([-2, 1], NE),
      war([-1, 0], { dealer: SW, out: { win: SE, lose: SE, dwin: E, dlose: E } }),
      pass([-1, 1], SE), pass([-1, 2], E), pass([0, 2], E),
      pass([0, -1], SE),
      war([0, 0], { dealer: W, out: { win: E, lose: E, dwin: NE, dlose: NE } }),
      pass([1, 0], E), pass([1, -1], NE), pass([2, -2], E),
    ],
  },
  'uneven-tables': {
    // Tag A's hands with a joker on top and C's with an advertising card,
    // merge the three streams, and sort them out with two top-card Wars:
    // only the joker beats an ace, and only the advertising card fails to
    // beat another. Burn takes the tags off again.
    cells: [
      c([-1, -2], 'gather', { under: W, out: { out: SE } }), shoe([-1, -3], '?', { out: SE }),
      c([-3, 2], 'gather', { under: W, out: { out: NE } }), shoe([-3, 3], '$', { out: NW }),
      pass([-2, 0], E), pass([-1, -1], SE), pass([-2, 1], NE),
      twar([-1, 0], { dealer: SE, out: { win: E, lose: NE } }), shoe([-1, 1], 'AS', { out: NW }),
      c([0, 0], 'burn', { out: { rest: SE } }), pass([0, 1], SE), pass([0, 2], E),
      twar([0, -1], { dealer: NW, out: { win: E, lose: NE } }), shoe([0, -2], '$', { out: SE }),
      pass([1, -1], SE), pass([1, 0], E),
      c([1, -2], 'burn', { out: { rest: E } }), pass([2, -2], E),
    ],
  },

  'rest-of-the-deck': {
    // A shoe deals the whole deck and then a joker, but a pass prefers the
    // player's side, so the deck follows the last hand and the joker comes
    // last of all. Everything is stacked (on a `$` seed) until the joker is
    // on top: then each suit of the stack holds the cards played twice and
    // the others once. Split by suit, a suit with a pair (K2) loses its
    // played cards to Set (whose rest is the unplayed cards); a suit
    // without one was never played and is paid whole. Hand(1) pays them
    // one card at a time.
    cells: [
      pass([-3, 0], E), shoe([-3, -1], [...SUITED.flatMap((s) => RANKS.map((r) => r + s)), '?'], { out: SE, once: true }),
      c([-2, 0], 'gather', { under: SE, out: { out: E } }),
      twar([-1, 0], { dealer: NW, out: { win: E, lose: SW } }), shoe([-1, -1], 'AC', { out: SE }),
      pass([-2, 1], NW), shoe([-3, 1], '$', { out: E, once: true }),
      c([0, 0], 'suits', { out: { S: E, H: NE, D: SE, C: NW } }),
      pass([1, -1], SE), pass([0, 1], NE), pass([0, -1], E),
      c([1, 0], 'kind', { n: 2, out: { yes: E, no: SE } }),
      c([2, 0], 'set', { out: { rest: SW } }),
      c([1, 1], 'hand', { n: 1, out: { out: SE } }),
    ],
  },

  'twice-shy': {
    // The night is stacked (as in Last In, First Out, a joker after the last
    // hand lets the stack out) and copied: one copy is dealt out again five
    // cards at a time, the other is kept and copied once per hand. Each
    // hand is doubled and gathered onto a copy of the whole night, so a card
    // of the hand played once tonight appears three times, one played twice
    // four times, and any other card at most twice. Suits splits that by
    // suit (within a suit a rank is a card) and the piles go one at a time
    // down one line, the advertising card from the bottom of the night last:
    // K4 and Set drop the hand's repeated cards, K3 and Set keep the three
    // copies of each card to pay, and the rest is dropped; the advertising
    // card goes on (Suits' misc) to end the hand. A hand's piles are
    // gathered onto a growing hand until it ends; Sort then puts each card's
    // three copies together and Deal pays one in three. The advertising
    // card that ended a hand lets the next copy of the night out (a War
    // gate in its copying loop), so only one hand is in flight at a time,
    // and then starts the next hand's pile.
    cells: [
      // the store
      pass([-5, 4], E), shoe([-4, 3], '?', { out: SW, once: true }),
      c([-4, 4], 'gather', { under: SE, out: { out: E } }),
      twar([-3, 4], { dealer: NW, out: { win: E, lose: SW } }), shoe([-3, 3], 'AC', { out: SE }),
      pass([-4, 5], NW), shoe([-5, 6], '$', { out: NE, once: true }),
      c([-2, 4], 'burn', { out: { rest: NE } }),
      c([-1, 3], 'duplicate', { out: { a: W, b: E } }),
      // a hand, doubled, on a copy of the night
      c([-2, 3], 'hand', { n: 5, out: { out: NE } }),
      c([-1, 2], 'duplicate', { out: { a: E, b: E } }),
      c([0, 2], 'gather', { under: SE, out: { out: NE } }),
      c([0, 3], 'duplicate', { out: { a: SW, b: NW } }),
      war([-1, 4], { dealer: SE, out: { win: NE, lose: NE, dwin: E, dlose: E } }),
      // by suit, one pile at a time, the advertising card last
      c([1, 1], 'suits', { out: { S: E, H: NE, D: SE, C: NW, misc: W } }),
      pass([0, 1], NE), pass([1, 0], E), pass([2, 0], SE), pass([1, 2], NE), pass([2, 1], SE),
      c([2, 2], 'kind', { n: 4, out: { yes: SE, no: E } }),
      c([2, 3], 'set', { out: { rest: NE } }),
      c([3, 2], 'kind', { n: 3, out: { yes: SE, no: E } }),
      c([3, 3], 'set', { out: { set: SW } }),
      c([4, 2], 'suits', { out: { misc: SE, S: NE, H: NE, D: NE, C: NE } }),
      pass([4, 3], SW), pass([3, 4], W), pass([2, 4], W),
      // collect a hand, then one card in three to the desk
      c([1, 4], 'gather', { under: W, out: { out: SW } }),
      twar([0, 5], { dealer: E, out: { win: NW, lose: W } }), shoe([1, 5], '$$', { out: W }),
      pass([0, 4], E), shoe([1, 3], '$', { out: SW, once: true }),
      c([-1, 5], 'burn', { out: { burn: NW, rest: SW } }),
      c([-2, 6], 'sort', { out: { out: SW } }),
      c([-3, 7], 'deal', { out: { to: Array.from({ length: 16 }, (_, i) => (i % 3 === 1 ? W : SE)) } }),
    ],
  },

  'casino-numbers': casinoSums(),
  'times-tables': casinoProducts(),
  'carry-the-one': casinoLongSums(),

};
