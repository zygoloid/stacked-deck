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
// Split the Difference (casino differences, one digit). As Casino Numbers,
// but player B's lookup keeps the spade and the clubs instead of the hearts:
// 14 - b cards. With A's count (a cards) that is n = 14 + (a - b) cards on
// the ruler, and Deal pays card 26, ruler[12 - (a - b)]: the spade for the
// difference, or a diamond when the cards are the same rank, which Suits
// drops by the desk.
function diffDeck() {
  const ruler = Array.from({ length: 25 }, (_, i) => (i === 12 ? '2D' : `${RANKS[Math.abs(12 - i) - 1]}S`));
  const table = [];
  for (let r = 1; r <= 13; r++) for (let i = 0; i < 12; i++) table.push(RANKS[r - 1] + (i < r - 1 ? 'H' : 'C'));
  const order = ['?', ...ruler, ...table];
  while (order.length % 13) order.push('$');
  const chunks = [];
  for (let i = 0; i < order.length; i += 13) chunks.push(order.slice(i, i + 13));
  return chunks.reverse().flat();
}
export function casinoDiffs() {
  const { nodes, links } = casinoSums();
  nodes.SH = shoe(nodes.SH.at, diffDeck(), { once: true });
  nodes.DL = c([-1, 1], 'deal', { out: { to: Array(27).fill(SE) } });
  nodes.SU = c([-1, 0], 'suits');
  const swap = (from, ports, to) => {
    const i = links.findIndex(([f, , t]) => f === from && t === to);
    links[i] = [from, ports, to];
  };
  swap('UB', ['S', 'C'], 'G3');
  const sp = links.findIndex(([f, p]) => f === 'SP' && p === 'S');
  links[sp] = ['SP', ['S', 'D'], 'PR'];
  links.pop();
  links.push(['DL', [26], 'SU'], ['SU', 'S', 'desk']);
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

// Carry the One (two-digit casino sums): each player plays two cards, the
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
    SpA: [4, -1], SpB: [3, 1],
    GA2: [-4, 0], DA2: [-3, 0], BA2: [-2, 0], TA2: [-3, 1], UA2: [-4, 2],
    GA1: [2, -1], DA1: [2, 0], BA1: [2, 1], TA1: [1, 1], UA1: [0, 1],
    GB1: [2, 2], DB1: [1, 3], BB1: [0, 4], TB1: [0, 3], UB1: [0, 2],
    GB2: [-2, 5], DB2: [-3, 6], BB2: [-4, 7], TB2: [-4, 6], UB2: [-4, 5],
    SH: [3, -3], H13: [2, -3], ST: [1, -3], TW: [0, -3], AC: [0, -2], BK: [1, -4], SEED: [2, -5], BJ: [-1, -2],
    MP: [-1, -1], SR1: [-1, 0], HR1: [-2, 1], SR2: [-1, 4], HR2: [-1, 3],
    GU: [-4, 3], GT1: [-1, 2], GR1: [-3, 2], DL1: [-2, 2], GT2: [-2, 3], GF: [-3, 3], GR2: [-2, 4], DL2: [-3, 4],
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
    DL1: c(at.DL1, 'deal', { out: { to: Array(52).fill(NE) } }),
    DL2: c(at.DL2, 'deal', { out: { to: Array(56).fill(SE) } }),
  };
  for (const d of ['A2', 'A1', 'B1', 'B2']) {
    Object.assign(nodes, {
      [`G${d}`]: c(at[`G${d}`], 'gather'), [`D${d}`]: c(at[`D${d}`], 'duplicate'), [`B${d}`]: c(at[`B${d}`], 'burn'),
      [`T${d}`]: c(at[`T${d}`], 'set'), [`U${d}`]: c(at[`U${d}`], 'suits'),
    });
  }
  for (const n of Object.values(nodes)) if (n.fn === 'pass') n.out = {};
  // (Each player's leading digit, the top card, goes to A1/B1 and the units to
  // A2/B2; the store; the ring A2, A1, B1, B2 and its lookups; the counts;
  // the units column; the leading column. Listed in the order that routes
  // best, found by the annealer.)
  const links = [
    ['ST', 'out', 'TW'], ['BA1', 'rest', 'GB1', 'under'], ['GB1', 'out', 'DB1'], ['DB1', 'a', 'TB1'],
    ['SEED', null, 'BK'], ['GR1', 'out', 'DL1'], ['UB1', 'H', 'GT1'], ['DB2', 'b', 'BB2'], ['DL1', [0, 38], 'GT2'],
    ['AC', null, 'TW', 'dealer'], ['GF', 'out', 'desk'], ['BK', 'out', 'ST', 'under'], ['MP', 'out', 'GA1', 'under'],
    ['DA2', 'a', 'TA2'], ['DA2', 'b', 'BA2'], ['SpA', 'rest', 'GA2'], ['HR2', 'out', 'GR2', 'under'],
    ['TW', 'win', 'BJ'], ['GT1', 'out', 'GT2'], ['UA2', 'H', 'GU'], ['DB1', 'b', 'BB1'], ['UA1', 'H', 'GT1'],
    ['TB1', 'set', 'UB1'], ['GB2', 'out', 'DB2'], ['BA2', 'rest', 'MP'], ['BB1', 'rest', 'GB2', 'under'],
    ['TB2', 'set', 'UB2'], ['SR2', null, 'HR2'], ['TA1', 'set', 'UA1'], ['SpA', 'burn', 'GA1'],
    ['HR1', 'out', 'GR1', 'under'], ['GU', 'out', 'GR1'], ['DB2', 'a', 'TB2'], ['SH', null, 'H13'],
    ['GA1', 'out', 'DA1'], ['SpB', 'rest', 'GB2'], ['SR1', null, 'HR1'], ['BJ', 'rest', 'MP'], ['UB2', 'H', 'GU'],
    ['H13', 'out', 'ST'], ['GT2', 'out', 'GR2'], ['GR2', 'out', 'DL2'], ['TA2', 'set', 'UA2'], ['GA2', 'out', 'DA2'],
    ['BB2', 'rest', 'GA2', 'under'], ['DA1', 'a', 'TA1'], ['DL2', [28, 54], 'GF'], ['DL1', [26], 'GF', 'under'],
    ['TW', 'lose', 'BK'], ['SpB', 'burn', 'GB1'], ['DA1', 'b', 'BA1'],
  ];
  return { nodes, links };
}

// Off Suit: Red Flush with no Suits croupier (pass, straight, shoe, gather,
// cut, flush). An ace of hearts under the hand makes a four-card flush only
// of a heart flush. A hand that isn't one has the ace stripped again (Cut:
// [c0 c1] and [c2 A♥]; Cut again: [c2] and the ace; Gather the hand back)
// and tries an ace of diamonds the same way. Either flush has its ace
// stripped by the same three croupiers on the way to the desk.
export function offSuit() {
  const at = {
    SH: [-2, 1], FL1: [0, -1], C1n: [-1, -1], C2n: [-2, -1], GRn: [-1, -2], G2: [0, -2], SD: [0, -3], FL2: [1, -2],
    MY: [1, -1], C1y: [1, 0], C2y: [0, 1], GRy: [1, 1],
  };
  const nodes = {
    // (the hand comes from the player straight into G1)
    G1: c([-1, 0], 'gather'), SH: shoe(at.SH, 'AH'), FL1: c(at.FL1, 'flush'),
    C1n: c(at.C1n, 'cut'), C2n: c(at.C2n, 'cut'), GRn: c(at.GRn, 'gather'), G2: c(at.G2, 'gather'), SD: shoe(at.SD, 'AD'),
    FL2: c(at.FL2, 'flush'), MY: c(at.MY, 'pass'), C1y: c(at.C1y, 'cut'), C2y: c(at.C2y, 'cut'), GRy: c(at.GRy, 'gather'),
  };
  nodes.MY.out = {};
  const links = [
    // an ace of hearts under the hand: a flush only for a heart flush
    ['SH', null, 'G1', 'under'], ['G1', 'out', 'FL1'], ['FL1', 'yes', 'MY'],
    // otherwise strip the ace and try an ace of diamonds
    ['FL1', 'no', 'C1n'], ['C1n', 'top', 'GRn'], ['C1n', 'bottom', 'C2n'], ['C2n', 'top', 'GRn', 'under'],
    ['GRn', 'out', 'G2'], ['SD', null, 'G2', 'under'], ['G2', 'out', 'FL2'], ['FL2', 'yes', 'MY'],
    // either flush: strip its ace the same way, and pay
    ['MY', 'out', 'C1y'], ['C1y', 'top', 'GRy'], ['C1y', 'bottom', 'C2y'], ['C2y', 'top', 'GRy', 'under'], ['GRy', 'out', 'desk'],
  ];
  return { nodes, links };
}

// Skeleton Crew: heart flushes, with Calling Card's croupiers but neither
// Flush nor Suits. Sort is the only croupier that sees suits, and in new deck
// order the ace of clubs is the last card before the hearts. Sort the hand
// with three aces of clubs: a heart flush comes out as [A♣ A♣ A♣, its three
// hearts, highest first], so card 3 is a heart and never an ace (A♥ sorts
// last). Any other hand has at most three cards before the aces of clubs and
// at least one card (or its own A♣) ahead of the hearts, so card 3 is always
// an ace of clubs. Cut, and the bottom half plays a king in a top-card War:
// only an ace beats it, so the hands that lose are the heart flushes.
// (Diamonds can't be done this way: K♦ and K♣ are next to each other in new
// deck order, and every croupier left treats them alike.)
export function skeletonCrew() {
  const nodes = {
    G1: c([-1, 0], 'gather'), SA1: shoe([-1, 1], 'AC'),
    G2: c([0, -1], 'gather'), SA2: shoe([-1, -1], 'AC'),
    G3: c([1, -2], 'gather'), SA3: shoe([0, -2], 'AC'),
    SO: c([2, -2], 'sort'), CU: c([2, -1], 'cut'),
    WR: twar([3, -1]), SK: shoe([3, -2], 'KS'),
  };
  const links = [
    ['SA1', null, 'G1', 'under'], ['G1', 'out', 'G2'], ['SA2', null, 'G2', 'under'], ['G2', 'out', 'G3'],
    ['SA3', null, 'G3', 'under'], ['G3', 'out', 'SO'], ['SO', 'out', 'CU'],
    ['SK', null, 'WR', 'dealer'], ['CU', 'bottom', 'WR'], ['WR', 'lose', 'desk'],
  ];
  return { nodes, links };
}

// No Kings: red flushes, with Calling Card's croupiers but neither Flush
// nor Suits, and no kings in the players' hands. Kings are then markers
// that no hand card can be mistaken for, and they sort into the gaps
// between the suits (K♠ after the spades, K♦ after the diamonds, K♥ before
// the hearts). Eight of them, [K♠ K♦ K♥ K♥] copied twice (a Duplicate with
// both copies to one side stacks them), are sorted with the hand, and Deal
// splits the 11 cards: cards 1-5 hold a diamond flush between two kings,
// cards 6-10 a heart flush after two kings. Any other hand leaves at least
// three kings in each window (a search over every king-free hand finds
// this pair of windows; no single window or smaller set of markers serves
// both suits), so Kind(3) says no only for the flush's window, and Set takes
// its two kings off on the way to the desk.
export function noKings() {
  const at = {
    SKH: [-1, 3], DH: [-1, 2], SKS: [1, 2], SKD: [2, 1], GSD: [1, 1], GM: [0, 1], DM: [0, 0],
    SO: [0, -1], DL: [1, -1], MP: [1, -2], KI: [2, -2], ST: [2, -1],
  };
  const nodes = {
    // (the hand comes from the player straight into G0)
    G0: c([-1, 0], 'gather'),
    SKH: shoe(at.SKH, 'KH'), DH: c(at.DH, 'duplicate'), SKS: shoe(at.SKS, 'KS'), SKD: shoe(at.SKD, 'KD'),
    GSD: c(at.GSD, 'gather'), GM: c(at.GM, 'gather'), DM: c(at.DM, 'duplicate'),
    SO: c(at.SO, 'sort'), MP: c(at.MP, 'pass'), KI: c(at.KI, 'kind', { n: 3 }), ST: c(at.ST, 'set'),
    // card 0 (always a king or a spade) goes to a free side, onto the floor
    DL: c(at.DL, 'deal', { out: { to: Array(11).fill(SE) } }),
  };
  nodes.MP.out = {};
  const links = [
    // eight kings: [K♠ K♦ K♥ K♥], twice
    ['SKH', null, 'DH'], ['DH', ['a', 'b'], 'GM', 'under'], ['SKS', null, 'GSD'], ['SKD', null, 'GSD', 'under'],
    ['GSD', 'out', 'GM'], ['GM', 'out', 'DM'], ['DM', ['a', 'b'], 'G0', 'under'],
    // with the hand, sorted; one window for each red suit
    ['G0', 'out', 'SO'], ['SO', 'out', 'DL'],
    ['DL', [1, 2, 3, 4, 5], 'KI'], ['DL', [6, 7, 8, 9, 10], 'MP'], ['MP', 'out', 'KI'],
    // only a flush's window has just two kings; Set takes them off
    ['KI', 'no', 'ST'], ['ST', 'rest', 'desk'],
  ];
  return { nodes, links };
}

// Night Off: Red Flush with no Flush croupier (pass, suits, straight, shoe,
// gather, cut). Suits splits each hand into its hearts and its diamonds
// (to different sides, so they stay separate piles); each red pile P of n
// cards (1 to 3) then goes through one filter, one pile at a time:
//  * Three house cards on top, 2♣ 3♠ 9♠, and Cut: the top half is house
//    cards only, 2♣ 3♠ for n = 1 or 2 and 2♣ 3♠ 9♠ for n = 3; the bottom is
//    the whole pile (with the 9♠ on top of it for n = 1 or 2).
//  * Straight tells them apart (2 3 is a run, 2 3 9 isn't). A run is cut
//    down to its top card, 2♣; otherwise a Q♠ is gathered underneath: one
//    card or four.
//  * K♠, the bottom half, then those one or four cards, and Cut again: the
//    pile is all in the top half for n = 3 ([K♠, P, 4 cards]: 8 cards, cut
//    after 4) and all in the bottom half otherwise ([K♠, 9♠, P, 2♣]).
//    Suits pays the top half's red cards.
//  (With one Cut and fixed house cards, one more card in the pile moves the
//  cut only half a card, so it is the small piles that land on one side;
//  Straight amplifies the difference here, but Cuts alone can do it too.)
//  * The 2♣ is a token: it is always the only club in the last bottom half,
//    and it goes back to make the next pile's house cards (a once shoe
//    deals the first), so piles can't overtake one another on the two
//    branches.
export function nightOff() {
  const at = {
    SU1: [-1, 0], MP: [-1, -1], MD: [0, -1],
    TK: [-4, 2], TP: [-3, 1], SY2: [-4, 0], SY3: [-2, -2], GH1: [-3, 0], GH2: [-2, -1], G1: [-1, -2], CUT1: [1, -3],
    ST: [3, -4], CY: [2, -3], GN: [3, -3], SP: [4, -3], MF: [2, -2],
    SF: [0, -2], G2: [1, -2], G3: [1, -1], CUT2: [0, 0], SU2: [1, 0], SB: [-2, 1],
  };
  const nodes = {
    SU1: c(at.SU1, 'suits'), MP: c(at.MP, 'pass'), MD: c(at.MD, 'pass'),
    TK: shoe(at.TK, '2C', { once: true }), TP: c(at.TP, 'pass'), SY2: shoe(at.SY2, '3S'), SY3: shoe(at.SY3, '9S'),
    GH1: c(at.GH1, 'gather'), GH2: c(at.GH2, 'gather'), G1: c(at.G1, 'gather'), CUT1: c(at.CUT1, 'cut'),
    ST: c(at.ST, 'straight'), CY: c(at.CY, 'cut'), GN: c(at.GN, 'gather'), SP: shoe(at.SP, 'QS'), MF: c(at.MF, 'pass'),
    SF: shoe(at.SF, 'KS'), G2: c(at.G2, 'gather'), G3: c(at.G3, 'gather'), CUT2: c(at.CUT2, 'cut'),
    SU2: c(at.SU2, 'suits'), SB: c(at.SB, 'suits'),
  };
  for (const n of Object.values(nodes)) if (n.fn === 'pass') n.out = {};
  const links = [
    // the hand's hearts and diamonds, as separate piles, into one line
    ['SU1', 'H', 'MP'], ['SU1', 'D', 'MD'], ['MD', 'out', 'MP'],
    // 2♣ (the token) 3♠ 9♠ on top of the pile, and cut
    ['TK', null, 'TP'], ['TP', 'out', 'GH1'], ['SY2', null, 'GH1', 'under'], ['GH1', 'out', 'GH2'],
    ['SY3', null, 'GH2', 'under'], ['GH2', 'out', 'G1'], ['MP', 'out', 'G1', 'under'], ['G1', 'out', 'CUT1'],
    // the top half: a run (n < 3) gives one card, otherwise four
    ['CUT1', 'top', 'ST'], ['ST', 'yes', 'CY'], ['CY', 'top', 'MF'], ['SP', null, 'GN', 'under'], ['ST', 'no', 'GN'],
    ['GN', 'out', 'MF'],
    // K♠, the pile, those cards; cut, and pay the top half's red cards
    ['SF', null, 'G2'], ['CUT1', 'bottom', 'G2', 'under'], ['G2', 'out', 'G3'], ['MF', 'out', 'G3', 'under'],
    ['G3', 'out', 'CUT2'], ['CUT2', 'top', 'SU2'], ['SU2', ['H', 'D'], 'desk'],
    // the token back for the next pile
    ['CUT2', 'bottom', 'SB'], ['SB', 'C', 'TP'],
  ];
  return { nodes, links };
}

// Rank and File. Five spades of one rank gathered on top of the hand make
// that rank the hand's only biggest set (5 or more cards against at most
// 4), so Set, with its set pile stacked back on top of the rest, moves
// that rank's cards to the top and keeps the order of everything else;
// the ten cards cut in half drop the five spades again. Doing that for
// each rank in turn, king first and ace last, leaves the hand in rank
// order, aces low, with each rank's cards still in the order they started
// in: so the hand is sorted first, which puts each rank's cards spade,
// diamond, club, heart.
const RANK_SPADES = [...RANKS].reverse().flatMap((r) => Array(5).fill(`${r}S`));
// A hand goes round the loop thirteen times: the gate's War loses to an
// ace twelve times, then beats a 2.
const RANK_GATE = [...Array(12).fill('AS'), '2S'];
// Every Twenty-One and Hit Me: a card counted as that many cards.
//  * A lookup table (for each rank r, `size` cards of rank r, `count(r)` of
//    them hearts and the rest clubs, with a joker on top and `jokers` more
//    underneath) is stacked once by a store, as in Casino Numbers: a once
//    shoe deals it in chunks of 13, last chunk first, gathered on top of a
//    `$` until the joker on top beats an ace in a top-card War.
//  * The table goes round a ring (as in Times Tables): it waits at a Gather
//    for a card, which goes on top; a Duplicate copies both, and Burn takes
//    the card off the table again on its way back.
//  * On the copy, Set keeps the card, its rank's group and the jokers; Burn
//    splits off the card, and Suits keeps the group's hearts and the jokers:
//    [?, count(r) hearts, the other jokers]. Gathered with the card (under
//    it or on top) and dealt from a fixed place on, that leaves the card
//    and as many jokers as the group had hearts beyond a fixed number.
function lookupDeck({ count, size, jokers }) {
  const table = [];
  for (let r = 1; r <= 13; r++) for (let i = 0; i < size; i++) table.push(RANKS[r - 1] + (i < count(r) ? 'H' : 'C'));
  const order = ['?', ...table, ...Array(jokers).fill('?')];
  while (order.length % 13) order.push('$');
  const chunks = [];
  for (let i = 0; i < order.length; i += 13) chunks.push(order.slice(i, i + 13));
  return chunks.reverse().flat();
}
// The store and the ring, the same on both floors: the card arrives at GL
// from the west, and the copy leaves D south-west.
function lookupRing(deck) {
  const nodes = {
    SH: shoe([5, -3], deck, { once: true }), H13: c([4, -3], 'hand', { n: 13 }), ST: c([3, -3], 'gather'),
    TW: twar([2, -2]), AC: shoe([1, -2], 'AC'), BK: c([2, -3], 'pass'), SEED: shoe([1, -3], '$', { once: true }),
    MP: c([1, -1], 'pass'), GL: c([0, 0], 'gather'), D: c([0, 1], 'duplicate'), B: c([1, 0], 'burn'),
  };
  for (const n of [nodes.BK, nodes.MP]) n.out = {};
  const links = [
    ['SH', null, 'H13'], ['H13', 'out', 'ST'], ['BK', 'out', 'ST', 'under'], ['SEED', null, 'BK'],
    ['AC', null, 'TW', 'dealer'], ['ST', 'out', 'TW'], ['TW', 'lose', 'BK'], ['TW', 'win', 'MP'],
    ['B', 'rest', 'MP'], ['MP', 'out', 'GL', 'under'], ['GL', 'out', 'D'], ['D', 'b', 'B'],
  ];
  return { nodes, links };
}
// Every Twenty-One. Each card c worth v (its rank, picture cards 10) becomes
// [c, v - 1 jokers]: v cards, the card on top, so Hand(21) holds the night's
// running total (less the 21s it has dealt) and deals a group of 21 each
// time the total reaches another multiple of 21. The card that got it there
// is the one whose cards include the group's last place, the last natural
// card in the group (every group has one: no card is worth more than 10).
// Suits drops the jokers, Deal turns the rest over, and Burn pays its top
// card.
//  * The lookup: twelve cards of each rank, v - 1 of them hearts, and
//    twelve jokers under the table: [?, v - 1 hearts, 12 jokers] with the
//    card underneath is 13 + v cards, and Deal from place 13 on leaves v - 1
//    jokers and the card, dealt last, so on top.
export function everyTwentyOne() {
  const { nodes, links } = lookupRing(lookupDeck({ count: (r) => Math.min(r, 10) - 1, size: 12, jokers: 12 }));
  Object.assign(nodes, {
    SET: c([-1, 1], 'set'), B2: c([-1, 2], 'burn'), SU: c([-2, 2], 'suits', { out: { C: NW } }), GC: c([-2, 3], 'gather'),
    // places 0-12 go to a free side, onto the floor
    DL: c([-3, 3], 'deal', { out: { to: Array(26).fill(SE) } }),
    H21: c([-3, 2], 'hand', { n: 21 }), SU2: c([-3, 1], 'suits'), DL2: c([-3, 0], 'deal', { out: { to: [] } }),
    B3: c([-2, -1], 'burn'),
  });
  links.push(
    ['D', 'a', 'SET'], ['SET', 'set', 'B2'], ['B2', 'burn', 'GC', 'under'], ['B2', 'rest', 'SU'],
    ['SU', ['H', 'misc'], 'GC'], ['GC', 'out', 'DL'], ['DL', Array.from({ length: 13 }, (_, i) => 13 + i), 'H21'],
    ['H21', 'out', 'SU2'], ['SU2', ['S', 'H', 'D', 'C'], 'DL2'], ['DL2', [0], 'B3'], ['B3', 'burn', 'desk'],
  );
  return { nodes, links };
}
// Hit Me. Each hand goes round a loop with 20 back advertising cards
// underneath. A top-card War against a `$` lets it in while its top card is
// a natural one: Burn sends that card to the lookup, which gives it back
// with as many jokers as it counts less one ([v - 1 jokers, the card]:
// v cards), and they are gathered under the rest of the hand. When the `$$`
// come up, the hand is [20 `$$`, a group of v cards for each of its cards]
// (it carries its own cards, so hands may overtake one another in the loop):
// 20 + t cards, t its total. Cut puts only `$$` in the top half when t is
// 21 or less, and otherwise also the start of the first group, which is a
// joker or an ace (an ace's group is just the ace). A copy's top half is
// the dealer in a War against the hand's own cards (Suits keeps them):
// they beat a top half of `$$`, but never a joker or an ace they hold
// themselves.
//  * The lookup: ten cards of each rank, min(r, 10) of them hearts, and nine
//    jokers under the table: the card on top of [?, v hearts, 9 jokers],
//    dealt from place 0 and places 12 on, leaves v - 1 jokers on the card.
export function hitMe() {
  const { nodes, links } = lookupRing(lookupDeck({ count: (r) => Math.min(r, 10), size: 10, jokers: 9 }));
  Object.assign(nodes, {
    SM: shoe([0, -3], '$$'), HM: c([-1, -2], 'hand', { n: 20 }), G0: c([-2, -1], 'gather'),
    LT: twar([-2, 0]), SD: shoe([-1, -1], '$'), B1: c([-1, 0], 'burn'), GB: c([-2, 1], 'gather'),
    SET: c([-1, 2], 'set'), B2: c([-1, 3], 'burn'), SU: c([-2, 4], 'suits', { out: { C: SE } }), GC: c([-2, 3], 'gather'),
    // places 1-11 go to a free side, onto the floor
    DL: c([-2, 2], 'deal', { out: { to: Array(21).fill(NE) } }),
    DX: c([-3, 1], 'duplicate'), SU3: c([-4, 2], 'suits'), CUT: c([-3, 2], 'cut', { out: { bottom: SE } }), WX: war([-4, 3]),
  });
  links.push(
    // 20 `$$` under each hand
    ['SM', null, 'HM'], ['HM', 'out', 'G0', 'under'], ['G0', 'out', 'LT'],
    // the loop: a natural card on top goes to the lookup and back underneath
    ['SD', null, 'LT', 'dealer'], ['LT', 'win', 'B1'], ['B1', 'burn', 'GL'], ['B1', 'rest', 'GB'], ['GB', 'out', 'LT'],
    ['D', 'a', 'SET'], ['SET', 'set', 'B2'], ['B2', 'burn', 'GC'], ['B2', 'rest', 'SU'], ['SU', ['H', 'misc'], 'GC', 'under'],
    ['GC', 'out', 'DL'], ['DL', [0, 12, 13, 14, 15, 16, 17, 18, 19, 20], 'GB', 'under'],
    // the `$$` on top: the hand's cards against a copy's top half
    ['LT', 'lose', 'DX'], ['DX', 'a', 'SU3'], ['DX', 'b', 'CUT'], ['CUT', 'top', 'WX', 'dealer'],
    ['SU3', ['S', 'H', 'D', 'C'], 'WX'], ['WX', 'win', 'desk'],
  );
  return { nodes, links };
}


// Counterfeit: a memory loop per suit (within one suit, a pair of ranks is
// a pair of identical cards). Gather (the memory underneath, from Kind), Kind
// and Burn in a line from `g`: a new card on top of its suit's memory; a
// pair burns it to the desk (`burnSide`), and the rest goes back to Kind,
// which finds no pair in it and returns it to the gather; no pair, and the
// bigger stack goes back as the memory. The memory is seeded through Kind
// with an advertising card (`seedAt`, dealing `seedOut`).
const memoryLoop = (g, burnSide, seedAt, seedOut) => [
  c(g, 'gather', { under: E, out: { out: E } }),
  c(at(g, [1, 0]), 'kind', { n: 2, out: { yes: E, no: W } }),
  c(at(g, [2, 0]), 'burn', { out: { burn: burnSide, rest: W } }),
  shoe(seedAt, '$$', { out: seedOut, once: true }),
];
// Pot Luck and Follow Suit. A Deal's `to` list of n places: the places in
// `picked` to side `to`, every other place to side `rest`.
const dealList = (n, picked, to, rest) => Array.from({ length: n }, (_, i) => (picked.includes(i) ? to : rest));
// A Deal's `to` list of n places from { side: [places] }, every other place
// to side `rest`.
const dealSides = (n, sides, rest) => Array.from({ length: n }, (_, i) => {
  const side = Object.keys(sides).find((s) => sides[s].includes(i));
  return side === undefined ? rest : Number(side);
});

// Follow Suit. The trick is gathered in seat order and copied: one copy
// (the trick itself) goes to the router, and the other, four times over,
// is dealt out as the players' entries: one copy of A's card (the
// champion), one of C's, two of B's, four of D's. A champion only ever
// holds cards of the suit led, so copies keep a Flush honest.
//  * Each challenger plays the champion at a War (the champion as player,
//    so a tie goes to the challenger, and the Flush settles it). A lower
//    challenger is dropped. Otherwise the two are stacked, challenger on
//    top: a Flush means it followed suit (and is higher), and the stack
//    carries on as the champion; no Flush, and a Deal drops the
//    challenger's copies. The champion is the copies of every card that
//    led the trick so far, the latest on top: 1 card if A won, 2 if C, 3
//    or 4 if B, 5 to 8 if D.
//  * The champion goes on top of a ruler of ten jokers and advertising
//    cards, and a Deal takes cards 8 and 10: two verdict cards that depend
//    only on the champion's size (ruler card 8 - n and 10 - n).
//  * A top-card War of the verdicts against the trick splits A and B
//    (advertising card on top) from C and D (joker on top); a high-card War
//    (A's and B's) or a Burn and a War (C's and D's) reads the second
//    card, and sends the trick to its desk.
//  * The ruler (a shoe and Hand(10)) is the door's dealer on its way to
//    the lookup, so a trick goes in every ten rounds at most and none can
//    overtake another between the stages.
function followSuitSpec() {
  const RULER = '? ? ? ? ? ? $ $ ? $'.split(' ');
  return {
    cells: [
      // the trick, in seat order: [a, b, c, d]
      c([-5, -1], 'gather', { under: SW, out: { out: SE } }),
      c([-6, 1], 'gather', { under: SW, out: { out: NE } }),
      c([-5, 0], 'gather', { under: SW, out: { out: E } }),
      // the trick to the router, and its copy four times over
      c([-4, 0], 'duplicate', { out: { a: SE, b: E } }),
      c([-3, 0], 'duplicate', { out: { a: E, b: E } }),
      c([-2, 0], 'duplicate', { out: { a: E, b: E } }),
      // the door: one trick in per ruler
      war([-1, 0], { dealer: NW, out: { lose: E, dwin: SW } }),
      c([-1, -1], 'hand', { n: 10, out: { out: SE } }), shoe([0, -2], RULER, { out: SW }),
      pass([-2, 1], SE), pass([-2, 2], E),
      // the entries: card i of the 16 is seat i % 4's; the rest drop SW
      c([0, 0], 'deal', { out: { to: dealSides(16, { [NW]: [0], [NE]: [2], [E]: [1, 5], [SE]: [3, 7, 11, 15] }, SW) } }),
      pass([0, -1], NE), pass([1, -1], NW), pass([1, 0], NE), pass([0, 1], E),
      // C's challenge
      war([1, -2], { dealer: SE, out: { win: E, dwin: E, lose: E } }),
      c([2, -2], 'flush', { out: { yes: SE, no: E } }),
      c([3, -2], 'deal', { out: { to: dealList(8, [0], NE, SW) } }),
      // B's
      war([2, -1], { dealer: SW, out: { win: SE, dwin: SE, lose: SE } }),
      c([2, 0], 'flush', { out: { yes: SW, no: SE } }),
      c([2, 1], 'deal', { out: { to: dealList(8, [0, 1], SE, W) } }),
      // D's
      war([1, 1], { dealer: W, out: { win: SW, dwin: SW, lose: SW } }),
      c([0, 2], 'flush', { out: { yes: W, no: SW } }),
      c([-1, 3], 'deal', { out: { to: dealList(8, [0, 1, 2, 3], SE, NW) } }),
      // the lookup
      c([-1, 2], 'gather', { under: W, out: { out: SW } }),
      c([-2, 3], 'deal', { out: { to: dealList(18, [8, 10], SW, SE) } }), pass([-3, 4], SW),
      // the trick's way to the router
      pass([-4, 1], SE), pass([-4, 2], SE), pass([-4, 3], SE), pass([-4, 4], SE),
      // the router
      twar([-4, 5], { dealer: NW, out: { win: E, dlose: SE, dwin: SW, lose: W } }),
      c([-3, 5], 'burn', { out: { rest: SE } }), pass([-4, 6], E),
      war([-3, 6], { dealer: W, out: { dwin: SW, dlose: SE } }),
      pass([-5, 5], SE),
      war([-5, 6], { dealer: NE, out: { dwin: SW, dlose: SE } }),
    ],
  };
}

// Punto Banco: the stack a card is counted under, and the ruler the counts
// are read from (R[1] and R[2] are the naturals: see the recipe).
const BAC_STACK = ['9C', '8C', '7C', '6C', '5C', '4C', '3C', '2C', 'AC'];
const BAC_RULER = ['?', '$', '$', '?', '?', '?', '?', '?', '?', '?'];

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
  'two-by-two': {
    // Two Pair's reference, unchanged: nothing bigger than pairs; the copy's
    // set loses its first card to the floor, and what's left still holds a
    // pair only if there were two. The verdict (2 or ace) comes by routes of
    // equal length to a high-card gate.
    cells: [
      c([-2, -1], 'kind', { n: 3, out: { no: E } }),
      c([-1, -1], 'duplicate', { out: { a: NE, b: SE } }), pass([0, -2], E), pass([1, -2], E),
      c([-1, 0], 'set', { out: { set: SE } }),
      c([-1, 1], 'deal', { out: { to: [W, NE, NE, NE] } }),
      c([0, 0], 'kind', { n: 2, out: { yes: NE, no: E } }),
      shoe([0, -1], '2C', { out: E }), war([1, -1], { dealer: W, out: { dwin: E, dlose: E } }),
      shoe([1, 1], 'AC', { out: NW }), war([1, 0], { dealer: SE, out: { dwin: NE, dlose: NE } }),
      pass([2, -1], NW), war([2, -2], { dealer: SE, out: { win: E } }),
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
  'split-the-difference': casinoDiffs(),
  'times-tables': casinoProducts(),
  'carry-the-one': casinoLongSums(),
  'off-suit': offSuit(),
  'night-off': nightOff(),
  'skeleton-crew': skeletonCrew(),
  'no-kings': noKings(),
  'every-twenty-one': everyTwentyOne(),
  'hit-me': hitMe(),

  ceasefire: {
    // Windows [previous, current]: each card is doubled (Duplicate, both
    // copies one way) into Hand(2), seeded by a K♠ that deals once (nothing
    // beats a king, aces low, so the first card can't pay). Within one suit
    // Sort puts the cards in rank order, so a copy of the window is sorted
    // and stacked under it: [p c min max]. Deal sends c and min to Kind(2):
    // a pair means c is the lower (or, against the seed, the same king), and
    // otherwise Burn drops min and pays c. (Four copies of each card, two
    // Duplicates each with both ports one way, make windows [p c c c] in
    // Hand(4); sorted, a Cut's top half is [c c] unless c beats p, when it
    // is [p c]: 8.)
    cells: [
      c([-2, 0], 'duplicate', { out: { a: E, b: E } }),
      shoe([-1, -1], 'KS', { out: SE, once: true }),
      c([-1, 0], 'hand', { n: 2, out: { out: E } }),
      c([0, 0], 'duplicate', { out: { a: E, b: SE } }),
      c([0, 1], 'sort', { out: { out: NE } }),
      c([1, 0], 'gather', { under: SW, out: { out: E } }),
      c([2, 0], 'deal', { out: { to: [NE, SE, SE, NE] } }),
      c([2, 1], 'kind', { n: 2, out: { no: SW } }),
      c([1, 2], 'burn', { out: { rest: W } }),
    ],
  },
  'three-in-a-row': {
    // Windows of windows. Each card doubled into Hand(2) (seeded with an
    // advertising card) makes windows [p c]; each window doubled into
    // Hand(4) (seeded with two advertising cards) makes [a b b c], the card
    // and the two before it. Deal drops the repeated b (reversing the rest,
    // so c is on top), Straight tests the three, and Burn pays the top card.
    // The advertising cards are never part of a run, so the first two cards
    // can't pay. (A memory of the last two cards, as in Déjà Vu: a Gather
    // puts [p2 p1] on the new card, a copy goes to Straight and Deal pays its
    // third card, and Burn drops p2 from the other copy for the next card;
    // the memory starts as [$ $], a Hand(2) on a `once` shoe: 7, slower.)
    cells: [
      c([-2, 0], 'duplicate', { out: { a: E, b: E } }),
      shoe([-1, -1], '$', { out: SE, once: true }),
      c([-1, 0], 'hand', { n: 2, out: { out: E } }),
      c([0, 0], 'duplicate', { out: { a: E, b: E } }),
      shoe([1, -1], ['$', '$'], { out: SE, once: true }),
      c([1, 0], 'hand', { n: 4, out: { out: E } }),
      c([2, 0], 'deal', { out: { to: [SW, SW, E, SW] } }),
      c([1, 1], 'straight', { out: { yes: SW } }),
      c([0, 2], 'burn', { out: { burn: W } }),
    ],
  },
  'odds-and-evens': {
    // Test a copy. A colour joker goes under it, and Suits keeps the hearts
    // and diamonds in one pile (the joker joins the hearts, the first suit
    // with a port, last), so the pile has r + 1 cards for r red cards. Deal
    // to two sides leaves the last card dealt on top of its pile: the joker
    // tops pile X exactly when r is even. Pile X plays an ace by its top
    // card, and only a joker wins: a win plays a 2 (always beaten) to
    // release it, a loss releases the ace by a pass, so both routes take
    // the same time, and the original is gated by high card against the
    // verdict. (Gathering the pile onto an advertising card puts
    // the joker or the advertising card on top of pile X, so pile X itself
    // is the gate's dealer by top card, paying on a loss: 8.)
    cells: [
      c([1, -1], 'duplicate', { out: { a: SE, b: NW } }),
      c([1, -2], 'gather', { under: W, out: { out: NE } }), shoe([0, -2], '??', { out: E }),
      c([2, -3], 'suits', { out: { H: E, D: E } }),
      c([3, -3], 'deal', { out: { to: [SE, NE] } }),
      twar([3, -2], { dealer: E, out: { win: SE, dwin: W } }), shoe([4, -2], 'AC', { out: W }),
      pass([2, -2], SE),
      war([3, -1], { dealer: E, out: { dwin: W, dlose: W } }), shoe([4, -1], '2C', { out: W }),
      pass([2, -1], SW),
      war([1, 0], { dealer: NE, out: { win: SE } }),
    ],
  },
  'twenty-one-card-trick': {
    // B's card is gathered onto A's 21, so the hand holds the chosen card
    // twice, and Suits splits it by suit: one deck has no two cards of the
    // same suit and rank, so the chosen card's pile is the only one with a
    // pair (K2). Set takes the pair out of it, and Burn keeps one copy. The
    // other piles, and the rest of the chosen pile, go to Hand(20); a cut
    // splits the 20 into two tens and two gathers put the chosen card
    // between them. Every pile of a deal has to reach Hand(20) before the
    // next deal's, and K2 and Hand(20) pick up from several sides, so a
    // War lets one deal in at a time: the burned copy is the next deal's
    // ticket (a `once` shoe deals the first). A suit missing from A's hand
    // makes no pile, which Hand(20) doesn't mind.
    // (Beat par with a completed cut: Hand(20) gathers onto the chosen
    // card, [20, card], and a cut with both halves to the desk puts the
    // card 11th: 13.)
    cells: [
      c([-4, 0], 'gather', { out: { out: E } }),
      war([-3, 0], { dealer: W, out: { dwin: NE, dlose: NE } }),
      shoe([-4, 1], 'AS', { out: NE, once: true }),
      c([-2, -1], 'suits', { out: { S: E, H: NE, D: NW, C: W } }),
      pass([-3, -1], NE), pass([-2, -2], E), pass([-1, -2], SE),
      c([-1, -1], 'kind', { n: 2, out: { yes: SW, no: SE } }),
      c([-2, 0], 'set', { out: { set: SW, rest: E } }),
      c([-3, 1], 'burn', { out: { burn: NW, rest: E } }),
      c([-1, 0], 'hand', { n: 20, out: { out: SE } }),
      c([-1, 1], 'cut', { out: { top: W, bottom: SW } }),
      c([-2, 1], 'gather', { under: W, out: { out: SE } }),
      c([-2, 2], 'gather', { under: NE, out: { out: SE } }),
    ],
  },
  'rank-and-file': {
    // One hand at a time goes through a ticket door (the hand plays a 2 as
    // the dealer and always wins; a `once` shoe deals the first 2), is
    // sorted, and goes round a loop thirteen times: Hand(5) on a shoe of
    // five kings of spades, five queens, ... five aces gathers the next
    // rank's five spades on top of the hand; Set's set pile is gathered
    // back on top of the rest, and the cut drops the spades. The gate's War
    // (shoe: twelve aces, then a 2) sends the hand round again until the
    // thirteenth time, then pays it, and its 2 goes back to the door as the
    // next ticket. (Stacking Set's piles on one side instead of gathering
    // them, and a loop of four (the hand entering at the gate's War, whose
    // shoe then deals thirteen aces and a 2), make 10.)
    cells: [
      war([-2, 1], { dealer: W, out: { dwin: E } }), shoe([-2, 0], '2C', { out: SE, once: true }),
      c([-1, 1], 'sort', { out: { out: SE } }),
      pass([-1, 2], E),
      c([0, 2], 'gather', { under: W, out: { out: SE } }),
      c([1, 1], 'hand', { n: 5, out: { out: SW } }), shoe([1, 0], RANK_SPADES, { out: SE }),
      c([0, 3], 'set', { out: { set: W, rest: SW } }), pass([-1, 4], NW),
      c([-1, 3], 'gather', { under: SE, out: { out: W } }),
      c([-2, 3], 'cut', { out: { bottom: NW } }),
      war([-2, 2], { dealer: W, out: { win: SW, lose: E, dlose: NW } }), shoe([-3, 2], RANK_GATE, { out: E }),
    ],
  },

  'one-deck': {
    // Seven Heaven's machine, with its four sevens taken from the one deck.
    // Hand(13) splits the deck into its suits, and in new deck order the 7
    // is the seventh card of every suit (A..K for spades and diamonds, K..A
    // for clubs and hearts), so Deal keeps card 7 of each and drops the
    // rest; Hand(4) stacks the four sevens. On top of a hand, seven of a kind
    // means three sevens in the hand; either way a cut takes the four off
    // again and they go back round to the gather for the next hand. (Hand(52)
    // and one Deal picking out the four places make the stack in two
    // croupiers instead of three.)
    cells: [
      c([0, -2], 'hand', { n: 13, out: { out: W } }),
      c([-1, -2], 'deal', { out: { to: Array.from({ length: 13 }, (_, i) => (i === 6 ? W : NW)) } }),
      c([-2, -2], 'hand', { n: 4, out: { out: SE } }), pass([-2, -1], SW),
      c([-3, 0], 'gather', { under: W, out: { out: E } }),
      c([-2, 0], 'kind', { n: 7, out: { yes: E, no: SE } }),
      c([-1, 0], 'cut', { out: { bottom: E, top: NW } }), pass([-1, -1], W),
      c([-2, 1], 'cut', { out: { top: W } }), pass([-3, 1], NW),
    ],
  },
  'one-war': {
    // Two comparisons through the one War: beat an 8 (the hand as player),
    // then fail to hold a king (the hand as dealer against a king, which
    // wins only if the hand's high card is a queen or lower). Its ports are
    // distinct, so each carries hands from one pass and reference cards from
    // the other: win has the first pass's winners (on to the second) and the
    // kings that beat a hand; dealer-lose has the eights a hand beat and the
    // hands to pay. The references are five of a kind (a shoe into Hand(5)),
    // so Kind(5) tells them from a hand, which never holds five of a rank.
    // Player and dealer travel as one stack, [hand, 8 8 8 8 8] or
    // [K K K K K, hand], and one cut splits every stack, top half to the
    // player's side and bottom half to the dealer's: the War's two queues
    // then stay in step, whichever hands are in flight. Lose and dealer-win
    // only ever carry what is dropped. (Either pass can be the one with the
    // hand as dealer: five 9s that fail to beat the hand, then the hand as
    // player against five queens, works the same way, but the hands that go
    // on leave by the War's south-west side, and the route back to the cut
    // makes it 20.)
    cells: [
      shoe([-1, -3], '8C', { out: SE }), c([-1, -2], 'hand', { n: 5, out: { out: SE } }),
      c([-1, -1], 'gather', { under: NW, out: { out: E } }),
      c([0, -1], 'cut', { out: { top: SE, bottom: SW } }), pass([-1, 0], E),
      c([1, -1], 'kind', { n: 5, out: { no: NW } }),
      shoe([3, -4], 'KC', { out: SW }), c([2, -3], 'hand', { n: 5, out: { out: SW } }),
      c([1, -2], 'gather', { under: SE, out: { out: SW } }),
      c([1, 0], 'kind', { n: 5, out: { no: E } }),
    ],
  },
  dumbwaiter: {
    // The dumbwaiter loses where one hand ends and the next begins, so the
    // players' room pads every hand to exactly five cards: four `$` (a shoe
    // into Hand(4)) under the hand, and Deal keeps the first five cards (in
    // reverse) and drops the rest. The desk's room collects them again with
    // Hand(5), turns them the right way up with a second Deal, and Suits
    // drops the `$`s, keeping the order.
    nodes: {
      S: shoe([-3, -2], '$'), H4: c([-3, -1], 'hand', { n: 4 }),
      G: c([-3, 0], 'gather'),
      DL: c([-2, 0], 'deal', { out: { to: [, , , , , NE, NE, NE, NE] } }),
      H5: c([1, 0], 'hand', { n: 5 }), D2: c([2, 0], 'deal'), SU: c([3, 0], 'suits'),
    },
    links: [
      ['S', null, 'H4'], ['H4', 'out', 'G', 'under'], ['G', 'out', 'DL'], ['DL', [0, 1, 2, 3, 4], 'fix'],
      ['H5', 'out', 'D2'], ['D2', [0], 'SU'], ['SU', ['S', 'H', 'D', 'C'], 'desk'],
    ],
  },
  'checkerboard': {
    // Suits sends the red cards one way and the black cards another, each
    // pile in the order dealt; a gather stacks the reds on top of the
    // blacks, and an out-shuffle (which keeps the top card on top)
    // interleaves the two halves: red, black, red, black, red, black.
    // (Blacks on top and an in-shuffle does the same.)
    cells: [
      c([-2, 0], 'suits', { out: { H: E, D: E, S: SE, C: SE } }),
      pass([-2, 1], NE),
      c([-1, 0], 'gather', { under: SW, out: { out: E } }),
      c([0, 0], 'outshuffle', { out: { out: E } }),
    ],
  },
  'natural': {
    // Pairs are dropped (two aces), and the hand must beat a king (it holds
    // an ace). Then a jack, a queen and a king are gathered underneath:
    // [ace, x, J, Q, K] is a straight only when x is a 10, and holds a pair
    // only when x is a J, Q or K. A cut takes the three cards off the bottom.
    // (The War's king, stacked under the winning hand with both ports one
    // way, can be one of the three: 10.)
    cells: [
      c([-3, 0], 'kind', { n: 2, out: { no: E } }),
      war([-2, 0], { dealer: NW, out: { win: E } }), shoe([-2, -1], 'KC', { out: SE }),
      c([-1, 0], 'gather', { under: NW, out: { out: E } }), shoe([-1, -1], 'JC', { out: SE }),
      c([0, 0], 'gather', { under: NW, out: { out: E } }), shoe([0, -1], 'QC', { out: SE }),
      c([1, 0], 'gather', { under: NW, out: { out: SE } }), shoe([1, -1], 'KD', { out: SE }),
      c([1, 1], 'straight', { out: { yes: W, no: SW } }),
      c([0, 2], 'kind', { n: 2, out: { yes: NW } }),
      c([0, 1], 'cut', { out: { top: W } }),
    ],
  },
  'snap': {
    // Next in Line's windows: each card is duplicated, one copy straight to
    // a gather and the other round a pass to its under side, where it waits
    // as the card before (a shoe that deals once seeds a 7). Kind 2 on
    // [current, previous], and the cut's top half, the current card, is
    // paid. (Duplicate with both copies one way into Hand(2) makes the same
    // windows in 5.)
    cells: [
      c([-2, 0], 'duplicate', { out: { a: E, b: SE } }),
      pass([-2, 1], NE), shoe([-3, 2], '7C', { out: NE, once: true }),
      c([-1, 0], 'gather', { under: SW, out: { out: E } }),
      c([0, 0], 'kind', { n: 2, out: { yes: E } }),
      c([1, 0], 'cut', { out: { top: NE } }),
    ],
  },
  'crazy-eights': {
    // High Roller's champion loop, with the champion (the last card paid)
    // replaced only on a payout. A gather stacks the card on the champion
    // ([card, champion]); the card is an 8 if it beats a 7 by its top card
    // but not an 8; otherwise Flush or Kind 2 on the pair decides. On a
    // payout a cut sends the card to a duplicate (one copy to the desk, the
    // other back as the champion); on a miss another cut sends the champion
    // back and drops the card. That cut also takes the paid card's copy
    // back to the gather (a one-card hand is all bottom half). The first
    // champion is a pair from a shoe that deals once, so the first card
    // always pays; it reaches the gather from a third side after the first
    // card, so the card still goes on top.
    cells: [
      c([-1, 0], 'gather', { under: SE, out: { out: NE } }),
      twar([0, -1], { dealer: NW, out: { win: E, lose: SE } }), shoe([0, -2], '7C', { out: SE }),
      twar([1, -1], { dealer: NW, out: { win: SW, lose: SE } }), shoe([1, -2], '8C', { out: SE }),
      c([0, 0], 'flush', { out: { yes: E, no: SE } }),
      c([0, 1], 'kind', { n: 2, out: { yes: NE, no: W } }),
      c([1, 0], 'cut', { out: { top: SE } }),
      c([1, 1], 'duplicate', { out: { a: E, b: SW } }),
      pass([0, 2], W), pass([-1, 2], NW),
      c([-1, 1], 'cut', { out: { bottom: NW } }),
      shoe([-3, 2], '2S', { out: NE, once: true }),
      c([-2, 1], 'duplicate', { out: { a: NE, b: NE } }),
    ],
  },

  'perfect-pair': {
    // Within one suit, two cards of a rank are two identical cards. A copy
    // is split by suit, and one Kind(2) tests every pile (the clubs pile
    // shares the hearts pile's pass). A pile with a pair loses its top card
    // and gains a joker, so the piles, gathered again by Hand(5), make a
    // hand that holds a joker exactly when the hand had a perfect pair. At
    // the gate the original is the dealer: the joker beats it, and it is
    // paid on dlose; without one the rebuilt copy only ties it (the house
    // wins). A hand gives one to four piles, so the piles of the next hand
    // would overtake one another at the shared Kind(2) and Hand(5): the
    // rebuilt hand goes back to the door as its ticket, so only one hand
    // is in the machine at a time.
    cells: [
      war([-2, 1], { dealer: W, out: { dwin: NE, dlose: NE } }), shoe([-2, 2], '$', { out: NW, once: true }),
      c([-1, 0], 'duplicate', { out: { a: SE, b: NE } }),
      war([-1, 1], { dealer: NW, out: { win: W, lose: W, dlose: SE } }),
      c([0, -1], 'suits', { out: { S: E, H: NE, D: SE, C: NW } }),
      pass([1, -2], SE), pass([0, 0], NE), pass([0, -2], E),
      c([1, -1], 'kind', { n: 2, out: { yes: E, no: SE } }),
      c([2, -1], 'burn', { out: { rest: SE } }), c([2, 0], 'gather', { out: { out: W } }), shoe([3, -1], '?', { out: SW }),
      c([1, 0], 'hand', { n: 5, out: { out: SW } }), pass([0, 1], W),
    ],
  },
  counterfeit: {
    // Suits sends each card to its suit's memory loop (memoryLoop above):
    // four loops in rows two apart, the middle two fed by Suits and paying
    // the desk directly, the outer two by two passes each way.
    cells: [
      c([-1, 1], 'suits', { out: { S: NE, H: SE, D: NW, C: SW } }),
      pass([-1, 0], NE), pass([0, -1], NE), pass([-2, 2], SE), pass([-2, 3], SE),
      ...memoryLoop([1, -2], SE, [2, -1], NW), pass([3, -1], SE), pass([3, 0], SW),
      ...memoryLoop([0, 0], SE, [1, 1], NW),
      ...memoryLoop([-1, 2], NE, [0, 1], SE),
      ...memoryLoop([-2, 4], NE, [0, 3], SW), pass([1, 3], NE), pass([2, 2], NW),
    ],
  },

  'missing-card': {
    // A whole house deck (a shoe into Hand(52)) is gathered with the hand,
    // so every card is there twice but the missing one, once. Suits splits
    // that into four piles: a complete suit holds every rank twice, so Set
    // keeps all of it and its rest is empty (dropped); the short suit's
    // rest is the missing card. (Set on the whole stack first keeps the
    // missing rank, seven cards against eight; Suits splits those into
    // piles of one and two cards and a single Kind 2 finds the one: 9
    // croupiers.)
    cells: [
      shoe([-1, -2], [...SUITED.flatMap((s) => RANKS.map((r) => r + s))], { out: SW }),
      c([-2, -1], 'hand', { n: 52, out: { out: SE } }),
      c([-2, 0], 'gather', { out: { out: E } }),
      c([-1, 0], 'suits', { out: { S: E, H: NE, D: SE, C: SW } }),
      c([0, 0], 'set', { out: { rest: SE } }), pass([0, 1], SW),
      c([0, -1], 'set', { out: { rest: E } }), pass([1, -1], SE), pass([1, 0], SW),
      c([-1, 1], 'set', { out: { rest: SE } }),
      c([-2, 1], 'set', { out: { rest: SE } }), pass([-2, 2], E),
    ],
  },
  'running-count': {
    // The count is a memory M of 6s and 9s, one card at a time: M is the
    // first War's dealer, so the next card waits until M is back. M's top
    // card is always a 6 and it always holds a 9 (new cards go underneath),
    // so a top-card War against M is a War against a 6 and a high-card War
    // against M is one against a 9. A low card (it loses to the 6) puts a 9
    // under M, a high card (it beats the 9) a 6, anything else nothing: M
    // holds more 9s than 6s exactly when the count is above zero. Set on a
    // copy of M keeps the 9s alone then; on a tie or more 6s it keeps the
    // 6s too, and the top 6 with them. So the set's top card is 9 exactly
    // when the card pays, and the card, under an 8, plays it in a top-card
    // War. The 9 shoe gives the first 6 its 9, so the first M is copied
    // too: its set (a 6 on top) meets a king that a once shoe sends down
    // the card line first, and drops it.
    cells: [
      // the count
      twar([0, 0], { dealer: NE, out: { win: E, dlose: SE, dwin: NW, lose: SW } }),
      pass([0, 1], NE),
      war([1, 0], { dealer: SW, out: { dwin: NW, dlose: NE, win: SE, lose: SE } }),
      c([0, -1], 'gather', { under: W, out: { out: E } }), shoe([-1, -1], '9S', { out: E }),
      shoe([0, -2], '6S', { out: SE, once: true }),
      c([2, -1], 'gather', { under: SE, out: { out: W } }), shoe([2, 0], '6S', { out: NW }),
      c([1, -1], 'duplicate', { out: { a: NE, b: SW } }),
      c([2, -2], 'set', { out: { set: E } }), pass([3, -2], SE), pass([3, -1], SE), pass([3, 0], SW),
      // the cards
      pass([-1, 1], SE), pass([-1, 2], E), shoe([-2, 2], 'KS', { out: E, once: true }),
      pass([1, 1], SW), pass([0, 2], E),
      c([1, 2], 'gather', { under: W, out: { out: NE } }), shoe([1, 3], '8S', { out: NW }),
      twar([2, 1], { dealer: NE, out: { lose: E } }),
      c([3, 1], 'cut', { out: { bottom: SE } }),
    ],
  },
  'round-the-clock': {
    // As in Deja Vu, the memory is one card of each rank seen (since the
    // last payout here), on an advertising card that pairs with nothing. A
    // card gathered on top that pairs (K2) is burned off; a new one stays,
    // and a copy of the memory goes under a house A..K (Hand(13) on a
    // shoe). Every rank of the memory is a pair then, so Set's rest is the
    // house cards of the ranks still missing and the advertising card:
    // only the advertising card when the clock is complete. A top-card War
    // against a `$` tells that apart (only an advertising card fails to beat
    // it); complete releases the `$`, otherwise it is turned into an ace (a
    // War it loses). The memory beats the `$` at a high-card gate and goes
    // to the desk (Set strips its advertising card), and the `$` starts the
    // next memory; it doesn't beat the ace and goes round again.
    cells: [
      // the memory
      c([0, 0], 'gather', { under: NW, out: { out: E } }),
      pass([0, -1], SE), shoe([-1, -1], '$$', { out: E, once: true }),
      c([1, 0], 'kind', { n: 2, out: { yes: NW, no: E } }),
      c([1, -1], 'burn', { out: { rest: W } }),
      c([2, 0], 'duplicate', { out: { a: NW, b: E } }),
      // the test
      c([3, 0], 'gather', { under: W, out: { out: E } }),
      c([3, 1], 'hand', { n: 13, out: { out: NW } }), shoe([3, 2], RANKS.map((r) => r + 'C'), { out: NW }),
      c([4, 0], 'set', { out: { rest: NE } }),
      twar([5, -1], { dealer: E, out: { dwin: W, dlose: NW } }), shoe([6, -1], '$', { out: W }),
      war([5, -2], { dealer: E, out: { dwin: SW } }), shoe([6, -2], 'AC', { out: W }),
      pass([4, -1], W), pass([3, -1], W),
      // the gate
      war([2, -1], { dealer: E, out: { win: NE, lose: NW, dlose: NW } }),
      pass([2, -2], W), pass([1, -2], SW),
      c([3, -2], 'set', { out: { set: NE } }),
    ],
  },
  'pot-luck': {
    // The pot rides under player A's card: a Gather puts A's card on top of
    // the pot, a marker card (a `once` shoe deals the first) on top of
    // whatever cards are in it, so [a, marker, pot...]. Two top-card Wars
    // see only a and b: A's beats B's; else B's beats A's; else a tie.
    // Winners are stacked into one hand ([a, marker, pot..., b] or
    // [b, a, marker, pot...]) and a Deal sends the marker back round the
    // loop (the empty pot for the next deal) and everything else to the
    // desk. A tie's stack is [a, marker, pot..., b]: a Deal splits the
    // marker off and a Gather puts it back on top, the new pot. The loop
    // has to pass the far side of one desk (A's): with both desks and
    // both players on the same side of it, the three ways back to the pot
    // would cross.
    cells: [
      c([-2, 0], 'gather', { under: NW, out: { out: E } }), pass([-2, 1], NE),
      twar([-1, 0], { dealer: SW, out: { win: NW, dlose: NW, dwin: E, lose: SE } }), pass([-1, 1], NE),
      twar([0, 0], { dealer: SW, out: { win: E, dlose: E, dwin: NE, lose: NE } }),
      c([-1, -1], 'deal', { out: { to: dealList(60, [1], W, NE) } }),
      c([1, 0], 'deal', { out: { to: dealList(60, [2], NE, E) } }),
      c([1, -1], 'deal', { out: { to: dealList(60, [1], NW, W) } }), pass([0, -1], NE),
      c([1, -2], 'gather', { under: SW, out: { out: E } }),
      pass([2, -1], NW), pass([2, -2], NW), pass([2, -3], W), pass([1, -3], W), pass([0, -3], SW),
      pass([-1, -2], SW), pass([-2, -1], SE), shoe([-2, -2], '2C', { out: SE, once: true }),
    ],
  },
  'follow-suit': followSuitSpec(),
  'cut-to-the-ace': {
    // A loop: each time round, a Duplicate copies the hand, and the copy's
    // top card X is burned off and turned into a dealer for a top-card gate:
    // Suits sends a spade to a War against a K that hands on the K (the
    // dealer's ports both one way, X dropped), and any other suit passes on
    // as X itself (the pass keeps both routes the same length, so copies
    // never overtake one another). The hand plays it by its top card, X:
    // only the A♠ beats a K, and a card never beats itself. A winner goes
    // to the desk; a loser is rotated by Burn with both ports one way (top
    // card to the bottom) and goes round again. Every route is first in,
    // first out, so several hands can be in the loop at once (11/810).
    // Packed tighter (the gate next to the Duplicate, no pass round the
    // loop), it is 10.
    cells: [
      c([-2, 0], 'duplicate', { out: { a: E, b: NW } }),
      pass([-1, 0], E),
      twar([0, 0], { dealer: NW, out: { win: E, lose: SW } }),
      c([-1, 1], 'burn', { out: { burn: W, rest: W } }),
      pass([-2, 1], NW),
      c([-2, -1], 'burn', { out: { burn: NE } }),
      c([-1, -2], 'suits', { out: { S: E, misc: SE } }),
      war([0, -2], { dealer: NE, out: { dwin: SE, dlose: SE } }), shoe([1, -3], 'KC', { out: SW }),
      pass([-1, -1], E),
      pass([0, -1], SE),
    ],
  },
  'punto-banco': {
    // Each card becomes a count: under a stack of 9 down to A (house clubs,
    // from a shoe and Hand(9)), Kind(2) and Burn in a loop burn the top card
    // until the stack holds no pair, which leaves r cards for a card of rank
    // r up to 9 ([r-1 .. A, the card]) and ten for a 10 or a picture card
    // (no pair, so nothing is burned): its points, modulo 10. A copy of the
    // hand is split by Burn and each card counted in a loop of its own; the
    // two counts (t cards in all) are gathered onto a ten-card ruler, and
    // Deal round ten places leaves on top of pile 0 the ruler card at
    // 9 - (t - 1) % 10: `$` for a total ending in 8 or 9, `?` otherwise. The
    // hand plays that pile at a top-card gate: it beats a `$` and loses to a
    // joker. A count takes longer the lower the card, so a later hand's
    // count could overtake: the gate's pile goes back to the door as the
    // next hand's ticket (a `once` `$` for the first), and only one hand is
    // in the machine at a time (24/2626, 4 passes).
    cells: [
      war([-2, -1], { dealer: W, out: { dwin: E, dlose: E } }), shoe([-1, -2], '$', { out: SW, once: true }),
      c([-1, -1], 'duplicate', { out: { a: SW, b: E } }),
      twar([-2, 0], { dealer: SE, out: { win: SW, dwin: NW, dlose: NW } }),
      c([0, -1], 'burn', { out: { burn: E, rest: NE } }),
      // the first card's count
      c([1, -1], 'gather', { under: W, out: { out: SE } }),
      c([0, 0], 'hand', { n: 9, out: { out: NE } }), shoe([-1, 1], BAC_STACK, { out: NE }),
      c([1, 0], 'kind', { n: 2, out: { yes: SW, no: E } }), c([0, 1], 'burn', { out: { rest: NE } }),
      // the second card's count
      c([1, -2], 'gather', { under: SW, out: { out: E } }),
      c([1, -3], 'hand', { n: 9, out: { out: SE } }), shoe([2, -3], BAC_STACK, { out: W }),
      c([2, -2], 'kind', { n: 2, out: { yes: NE, no: SE } }), c([3, -3], 'burn', { out: { rest: SW } }),
      pass([2, -1], SE),
      // both counts on the ruler, read by Deal
      c([2, 0], 'gather', { out: { out: SW } }), pass([1, 1], SW),
      c([0, 2], 'gather', { under: E, out: { out: W } }),
      c([1, 2], 'hand', { n: 10, out: { out: W } }), shoe([0, 3], BAC_RULER, { out: NE }),
      c([-1, 2], 'deal', { out: { to: [W, ...Array(9).fill(SE)] } }),
      pass([-2, 2], NW), pass([-2, 1], NW),
    ],
  },
  'first-sighting': {
    // A memory of every hand so far, two cards each, and a probe of the new
    // hand's ranks that is tested against each stored hand in turn.
    //  * The door (a War on the player's hex, dealer the hand) lets one hand
    //    in per scan: the ticket is the decision War's player hand, so the
    //    next hand comes in when this one has been decided (a `once` shoe
    //    has the first ticket). Copies of the hand: one waits as the
    //    decision War's dealer, one goes into the memory (it is tested only
    //    from the next hand on), and four copies, by two Duplicates with
    //    both copies one way, are the probe.
    //  * Hand(2) deals the memory out a stored hand at a time; a Duplicate
    //    sends one copy back into the memory (a Gather loop, items stacked
    //    underneath) and one to the probe's Gather. The memory ends with an
    //    end marker, [$$ ?]: the joker lets a War against an ace (only a
    //    joker beats one) release the rebuilt memory to Hand(2), with the
    //    new hand first and the marker last. (A `once` shoe deals the first
    //    marker.)
    //  * Each stored hand goes on top of the probe; a top-card War against
    //    `$` (only an advertising card ties it) sends the marker to the end
    //    of the scan. A copy of [stored, probe, `$`] goes to Set: it leaves
    //    only advertising cards in its rest exactly when the stored hand
    //    has the probe's two ranks (four copies of the probe outnumber any
    //    other rank; checked on every pair of rank pairs). A high War of the
    //    rest against `$$` (a tie only on advertising cards) releases its
    //    `$$` one way or the other: a match picks up a joker. Deal strips
    //    the stored hand off the probe, and the token is gathered on.
    //  * At the marker, Deal drops the marker and the probe plays the
    //    waiting copy of the hand: it wins only with a joker (a match);
    //    otherwise the tie goes to the house and the dealer's copy is paid.
    // Every hand is stored, repeats included, so a scan is as long as the
    // night so far.
    cells: [
      // the door, the hand's copies
      war([-4, 2], { dealer: W, out: { dwin: E, dlose: E } }), shoe([-4, 3], '$', { out: NW, once: true }),
      c([-3, 2], 'duplicate', { out: { a: NW, b: SE } }),
      c([-3, 3], 'duplicate', { out: { a: E, b: NE } }),
      c([-2, 2], 'duplicate', { out: { a: NW, b: NW } }),
      c([-2, 1], 'duplicate', { out: { a: E, b: E } }),
      // the memory
      c([-1, 3], 'hand', { n: 2, out: { out: NW } }), shoe([-1, 4], ['$$', '?'], { out: NW, once: true }),
      c([-1, 2], 'duplicate', { out: { a: SW, b: NW } }),
      c([-2, 3], 'gather', { under: NE, out: { out: SE } }),
      war([-2, 4], { dealer: SW, out: { lose: NW, win: NE } }), shoe([-3, 5], 'AS', { out: NE }),
      // the probe's loop
      c([-1, 1], 'gather', { under: W, out: { out: NW } }), pass([-1, 0], NE),
      twar([0, -1], { dealer: NE, out: { win: E, lose: W } }), shoe([1, -2], '$', { out: SW }),
      c([1, -1], 'duplicate', { out: { a: E, b: SW } }),
      c([0, 0], 'deal', { out: { to: [E, E, ...Array(58).fill(SE)] } }),
      c([0, 1], 'gather', { out: { out: W } }),
      // the test
      c([2, -1], 'gather', { under: NE, out: { out: SE } }), shoe([3, -2], '$', { out: SW }),
      c([2, 0], 'set', { out: { rest: SW } }),
      war([1, 1], { dealer: E, out: { dlose: W, dwin: SW } }), shoe([2, 1], '$$', { out: W }),
      c([0, 2], 'gather', { out: { out: NW } }), shoe([1, 2], '?', { out: W }),
      // the end of a scan: the decision
      c([-1, -1], 'deal', { out: { to: [W, W, ...Array(58).fill(SW)] } }), pass([-2, 0], SW),
      war([-3, 1], { dealer: SE, out: { dwin: W, win: SW, lose: SW } }),
    ],
  },
};
