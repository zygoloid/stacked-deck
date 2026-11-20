// Solitaire's reference machine (tools/level-specs/bonus.js uses its cells).
// It is too big to lay out by hand, so it is built from modules placed in
// local coordinates and routed by a negotiated-congestion router (below):
// every link is a run of passes, and the passes and sides each link uses
// grow dearer while two links share one, until none do. Everything here is
// deterministic: the same cells every time.
//
// The deck is held as a 56-card "cycle hand": the 54 cards in deck order,
// turned round to start anywhere, with a marker pair [?? $] (a colour joker
// and a front advertising card) where the deck's top meets its bottom. One
// trip round the main loop is one step of the keystream:
//
//  MOVES (the top band, flowing west). A rotation (ROT) brings the first
//    joker to the top: reverse the hand, then six levels (32, 16, 8, 4, 2, 1)
//    of Deal (the bottom k cards to a War's dealer side, the rest to the
//    player) and a high War with all four ports one way, so the half with
//    the first joker comes out on top; a Deal reverses the hand between
//    levels. DISP1 reads the top card (Suits: ? to misc, ?? to S) and sends
//    the hand on if it is A, else (turned on by one) into a second lane,
//    which always finds A: a step starts with the marker at the end of the
//    hand, so the first joker is A or B, and A comes before the marker.
//    STEP_A moves A down one: Burn it off, turn the rest on by one (a Burn
//    with both ports one way), A gathered under (A is never just above the
//    marker). ROT again (two lanes: past the marker, by two, to B); DISP2
//    reads the second card ($ means the marker), and STEP_B moves B down two:
//    PASS1' twice (the top card under the rest, and if that bares the
//    marker's $, the pair under too), B gathered back on top.
//  SCAN (bottom band, flowing east). The hand (with [? $$] under it, 58
//    cards) is reversed and dealt into its odd and even cards; two Hand(1)s
//    deal them as dealers to two Wars that hand a pile to each other. The
//    pile always starts with a joker: it beats a natural or an ad (the card
//    goes under it) and ties a joker, which releases the pile (the Wars'
//    lose ports meet in one pass) and starts the next. A Gather puts a $$
//    under each release.
//  TRIPLE. The releases, in order, are B's hand, then A's and the marker's
//    in either order. Sequence shoes on three Wars drop the first release
//    and pick out the rest; a copy of the third is sorted ($ first only for
//    the marker's) and a top-card War against a $ gives the verdict ($, or
//    $ and ? for the marker), which gates the third and fourth releases. A
//    buffer War holds the latest joker hand until the marker's hand
//    (stripped to $ and its tail) arrives; the pieces are gathered as
//    [tail(X), Y, X's joker, the marker's tail] and Set drops the $$s and
//    the $: the deck after the triple cut, D' (54 cards, top first).
//  COUNT. D' less its bottom card b, reversed by a Deal, is copied twice,
//    and fillers go above (F1) and below (F2): [F1, S, S, F2] is 260 cards
//    with F1 = 51 + v(b), F2 = 103 - v. Hand(52) cuts it in five; the third
//    hand and the top card of the fourth are S cut at v; a Deal turns it
//    back over and b goes under. F1 and F2 come from 99 cards of S (a Deal
//    of [S, S] keeps 50 and 49), b's lookup on the ring (r clubs, 14 - r
//    hearts, r its rank) and a dispenser for b's suit s (1 + 13s clubs, 40 -
//    13s hearts); Suits splits the clubs (F1) from the hearts (F2). A joker
//    b ties S at a War against [$ ?] instead of [$], and D' passes uncut.
//  The cut deck D'' is copied: one copy gets the marker pair under it and
//    goes round again; the other (EAST) reads the output. Its top card t is
//    burned off and looked up (14 - r hearts) with a dispenser for 40 - 13s
//    cards: 54 - v(t) cards over the rest, and Deal's place 53 is the output
//    card o (a joker t gives one card: place 53 is the bottom card). o is
//    looked up for its letter k: 29 - k cards (14 - r hearts, and 15 for
//    clubs and hearts or 2 for diamonds and spades, a ? in each); the cipher
//    card c for c + 1 (r clubs, and 14 or 1). [c + 1, 29 - k, $, ruler],
//    dealt, pays place 56: ruler[25 - c + k], the letter c - k. A joker o
//    (its War against an ace wins) sends no letter: a joker query releases
//    the c-station's master without a cipher card.
//  The lookups share one table: 182 cards, r clubs and 14 - r hearts of
//    each rank r, which goes round a ring through four stations (b, t, o,
//    c) and is filled once by a store (13-card chunks from a once shoe). At a
//    station the query waits on a Gather; the table arrives under it and is
//    copied: the master (the query burned off) goes on, and Set on the copy
//    keeps [query, its 14] (a joker query is dropped by a top-card War
//    against an ace first). The dispensers are piles held as a top-card
//    War's dealer, a $ on top: any natural beats it, and the pile is copied
//    out and back round to the War.
//  The key comes in through a Straight (one card is a straight, 52 aren't),
//    gathered on [? ?? ?? $] from a once shoe: the first cycle hand.

const E = 0, SE = 1, SW = 2, W = 3, NW = 4, NE = 5;
const DIRS = [[1, 0], [0, 1], [-1, 1], [-1, 0], [0, -1], [1, -1]];
const c = (at, fn, extra = {}) => ({ at, kind: 'croupier', fn, ...extra });
const shoe = (at, card, extra = {}) => ({ at, kind: 'shoe', deck: [].concat(card), ...extra });
const step = ([q, r], d, n = 1) => [q + n * DIRS[d][0], r + n * DIRS[d][1]];
const range = (a, b) => Array.from({ length: b - a }, (_, i) => a + i);
const WAR4 = ['win', 'lose', 'dwin', 'dlose'];

// Placement: offset, and mirror 'h' (east <-> west, keeping rows) or 'v'
// (north <-> south, keeping screen columns). Applied to every node of a module.
function place(mod, { at = [0, 0], mirror } = {}) {
  const tf = ([q, r]) => {
    let p = [q, r];
    if (mirror === 'h') p = [-q - r, r];
    if (mirror === 'v') p = [q + r, -r];
    if (mirror === 'hv') p = [-q, -r];
    return [p[0] + at[0], p[1] + at[1]];
  };
  for (const n of Object.values(mod.nodes)) n.at = tf(n.at);
  return mod;
}
function merge(target, ...mods) {
  for (const m of mods) { Object.assign(target.nodes, m.nodes); target.links.push(...m.links); }
  return target;
}

// A stack of n cards dealt from a shoe (deck repeating), held by Hand(n);
// n = 1: the shoe alone. Returns the port the stack leaves by.
function stack(nodes, links, name, shoeAt, handAt, deck) {
  if (deck.length === 1) { nodes[name] = shoe(shoeAt, deck); return [name, null]; }
  nodes[`${name}s`] = shoe(shoeAt, deck); nodes[name] = c(handAt, 'hand', { n: deck.length });
  links.push([`${name}s`, null, name]);
  return [name, 'out'];
}

// A dispenser: a War (top) holds a pile with a $ on top as its dealer; any
// natural (the trigger) beats the $ and the pile goes out (dlose), copied:
// one copy back round to the dealer side, one out. Filled once from a once
// shoe through Hand(n). Layout: W at `at`, U east, M north-east, H and the
// shoe further north-east (mirror with `flip`). Returns { war, out }.
function dispenser(nodes, links, name, at, deck, { flip = false } = {}) {
  const [q, r] = at;
  const P = (dq, dr) => (flip ? [q + dq + dr, r - dr] : [q + dq, r + dr]);
  nodes[name] = c(at, 'war', { rule: 'top' });
  if (deck.length === 1) { nodes[`${name}K`] = shoe(P(1, -1), deck); links.push([`${name}K`, null, name, 'dealer']); return { war: name, out: [name, 'dlose'] }; }
  nodes[`${name}U`] = c(P(1, 0), 'duplicate');
  nodes[`${name}M`] = c(P(1, -1), 'pass');
  nodes[`${name}H`] = c(P(2, -2), 'hand', { n: deck.length });
  nodes[`${name}S`] = shoe(P(3, -3), deck, { once: true });
  links.push([name, 'dlose', `${name}U`], [`${name}U`, 'a', `${name}M`], [`${name}M`, 'out', name, 'dealer'],
    [`${name}H`, 'out', `${name}M`], [`${name}S`, null, `${name}H`]);
  return { war: name, out: [`${name}U`, 'b'] };
}

// ROT: rotate an n-card hand (holding both jokers) so its first joker is on
// top. Reverse, then six levels of Deal (bottom k of the reversed hand to the
// War's dealer side, the rest to its player side) and a War with all four
// ports one way (winner on top), and a reversal between levels.
// Laid out along a row going east from `at`. Returns { nodes, links, entry, exit }.
function rot(p, at, { n = 55, ks = [32, 16, 8, 4, 2, 1], dir = E, side = 'up' } = {}) {
  const nodes = {}, links = [];
  let pos = at;
  const next = () => { const q = pos; pos = step(pos, dir); return q; };
  nodes[`${p}R0`] = c(next(), 'deal', { out: { to: [] } });
  let prev = `${p}R0`;
  // the window's pass: above or below the Deal's next hex
  const pd = dir === E ? (side === 'up' ? NE : SE) : (side === 'up' ? NW : SW);
  ks.forEach((k, i) => {
    const D = `${p}D${i}`, Wn = `${p}W${i}`, R = `${p}R${i + 1}`, X = `${p}X${i}`;
    nodes[D] = c(next(), 'deal', { out: { to: [] } });
    nodes[X] = c(step(nodes[D].at, pd), 'pass');
    nodes[Wn] = c(next(), 'war', { rule: 'high' });
    links.push(nodes[prev].fn === 'deal' ? [prev, [0], D] : [prev, WAR4, D]);
    links.push([D, range(n - k, n), X], [X, 'out', Wn, 'dealer']);
    links.push([D, range(0, n - k), Wn]);
    prev = Wn;
    if (i < ks.length - 1) {
      nodes[R] = c(next(), 'deal', { out: { to: [] } });
      links.push([Wn, WAR4, R]);
      prev = R;
    }
  });
  return { nodes, links, entry: `${p}R0`, exit: prev, exitPorts: WAR4 };
}

// PASS1' (marker pair [?? $]): the top card goes to the bottom; if the new
// top is '$' (so that card was the marker's head), two more go. In at BR0,
// out of TW (win) or BR2: two lines, merged by whatever takes the hand next.
function pass1m(p, at, { up = NW } = {}) {
  const nodes = {
    [`${p}BR0`]: c(at, 'burn'),
    [`${p}TW`]: c(step(at, E), 'war', { rule: 'top' }),
    [`${p}SD`]: shoe(step(step(at, E), up), '$'),
    [`${p}BR1`]: c(step(step(at, E), up === NW ? SE : NE), 'burn'),
    [`${p}BR2`]: c(step(step(step(at, E), up === NW ? SE : NE), E), 'burn'),
  };
  const links = [
    [`${p}BR0`, ['rest', 'burn'], `${p}TW`],
    [`${p}SD`, null, `${p}TW`, 'dealer'],
    [`${p}TW`, 'lose', `${p}BR1`], [`${p}BR1`, ['rest', 'burn'], `${p}BR2`],
  ];
  return { nodes, links, entry: `${p}BR0`, exits: [[`${p}TW`, 'win'], [`${p}BR2`, ['rest', 'burn']]] };
}

// The lookup table: for each rank r (ace 1 .. king 13), r clubs and 14 - r
// hearts of that rank. A query card on top makes its rank the only one with
// 15 cards, so Set keeps [query, its 14]; Burn takes the query off and Suits
// gives r clubs and 14 - r hearts.
function tableCards() {
  const t = [];
  for (let r = 1; r <= 13; r++) for (let i = 0; i < 14; i++) t.push(RANKS[r - 1] + (i < r ? 'C' : 'H'));
  return t;
}

// The store's shoe: the table in 13-card chunks, a ? first so that the last
// chunk dealt holds it; chunks are stacked as they come (the last on top), so
// they are dealt in reverse.
function storeDeck() {
  const order = ['?', ...tableCards()];
  while (order.length % 13) order.push('$');
  const chunks = [];
  for (let i = 0; i < order.length; i += 13) chunks.push(order.slice(i, i + 13));
  return chunks.reverse().flat();
}

// SCAN + TRIPLE (local: flow east along row 0; the triple cut's cluster
// north, south once placed).

function scanTriple() {
  const nodes = {
    // SCAN: [?, $$] go under the hand (58 cards, even); it is reversed and
    // dealt into two piles, the odd and the even cards, which Hand(1)s deal
    // as dealers to two Wars handing the pile to each other. The pile
    // (always led by a joker) wins against a natural (or an ad) and the two
    // go on stacked, the card under; against a joker it ties: the pile is
    // released (lose, both Wars into one pass) and the joker goes on.
    GE: c([-3, 0], 'gather'), RV: c([-2, 0], 'deal', { out: { to: [] } }), SP: c([-1, 0], 'deal', { out: { to: [] } }),
    H1: c([0, 0], 'hand', { n: 1 }), H2: c([3, -1], 'hand', { n: 1 }),
    W: c([1, 0], 'war', { rule: 'high' }), W2: c([2, 0], 'war', { rule: 'high' }), LP: c([1, 1], 'pass'),
    SEED: shoe([1, -1], '?', { once: true }),
    GZ: c([3, 0], 'gather'), SZ: shoe([3, 1], '$$'),
    Q1: c([4, 0], 'war', { rule: 'high' }), SQ1: shoe([4, 1], ['?', '$', '$', '$']),
    Q2: c([5, 0], 'war', { rule: 'high' }), SQ2: shoe([5, 1], ['?', '$', '$']),
    Q3: c([6, 0], 'war', { rule: 'high' }), SQ3: shoe([6, 1], ['?', '$']),
    // TRIPLE: a copy of the third release (R3) is sorted: '$' first only for
    // the marker's hand. Its verdict ($, or $ with a ? for the marker) gates
    // R3 (G3), then R4 (G4); BW holds the latest joker hand and is released
    // to X by the marker's hand (P').
    DUPT: c([7, -1], 'duplicate'), SRT: c([8, -1], 'sort'), TWT: c([9, -1], 'war', { rule: 'top' }), SDT: shoe([10, -1], '$'),
    GVT: c([9, 0], 'gather'), SJT: shoe([10, 0], '?'), MVT: c([8, 0], 'pass'),
    G3: c([8, -2], 'war', { rule: 'high' }),
    G4: c([12, 0], 'war', { rule: 'high' }),
    SM: c([11, -2], 'pass'), BS: c([11, -3], 'burn'),
    BWM: c([7, -4], 'pass'), BW: c([7, -5], 'war', { rule: 'high' }), LPB: c([6, -5], 'pass'),
    DUM: shoe([5, -5], '$', { once: true }),
    YF: c([9, -5], 'war', { rule: 'high' }), YFA: shoe([9, -4], 'AS'), YM: c([13, -4], 'pass'),
    BX: c([9, -6], 'burn'), PD: c([8, -7], 'duplicate'),
    GA1: c([14, -5], 'gather'), GA2: c([15, -6], 'gather'), GA3: c([16, -6], 'gather'), SETT: c([17, -5], 'set'),
  };
  const links = [
    ['GE', 'out', 'RV'], ['RV', [0], 'SP'], ['SP', [1], 'H1'], ['SP', [0], 'H2'],
    ['H1', 'out', 'W', 'dealer'], ['H2', 'out', 'W2', 'dealer'], ['SEED', null, 'W'],
    ['W', ['win', 'dlose', 'dwin'], 'W2'], ['W2', ['win', 'dlose', 'dwin'], 'W'],
    ['W', 'lose', 'LP'], ['W2', 'lose', 'LP'], ['LP', 'out', 'GZ'], ['SZ', null, 'GZ', 'under'],
    ['SQ1', null, 'Q1', 'dealer'], ['GZ', 'out', 'Q1'], ['SQ2', null, 'Q2', 'dealer'], ['Q1', 'win', 'Q2'],
    ['SQ3', null, 'Q3', 'dealer'], ['Q2', 'win', 'Q3'],
    // R3: test and gate
    ['Q3', 'lose', 'DUPT'], ['DUPT', 'b', 'SRT'], ['SRT', 'out', 'TWT'], ['SDT', null, 'TWT', 'dealer'],
    ['TWT', 'dlose', 'MVT'], ['TWT', 'dwin', 'GVT'], ['SJT', null, 'GVT', 'under'], ['GVT', 'out', 'MVT'],
    ['MVT', 'out', 'G3', 'dealer'], ['DUPT', 'a', 'G3'],
    ['G3', ['dwin', 'dlose'], 'G4', 'dealer'], ['Q3', 'win', 'G4'],
    ['G3', 'lose', 'SM'], ['G4', 'win', 'SM'], ['SM', 'out', 'BS'],
    // the buffer
    ['Q2', 'lose', 'BWM'], ['G3', 'win', 'BWM'], ['BS', 'rest', 'BWM'], ['BWM', 'out', 'BW', 'dealer'],
    ['DUM', null, 'LPB'], ['LPB', 'out', 'BW'], ['BW', 'dwin', 'LPB'],
    ['YFA', null, 'YF', 'dealer'], ['BW', 'lose', 'YF'], ['YF', 'win', 'YM'], ['G4', 'lose', 'YM'],
    ['BW', 'win', 'BX'], ['BW', 'dlose', 'PD'], ['PD', 'b', 'LPB'],
    // [tail(X), Y, sep(X), P'], then Set strips the Z's and the '$'
    ['YM', 'out', 'GA1'], ['BX', 'burn', 'GA1', 'under'],
    ['BX', 'rest', 'GA2'], ['GA1', 'out', 'GA2', 'under'],
    ['GA2', 'out', 'GA3'], ['PD', 'a', 'GA3', 'under'],
    ['GA3', 'out', 'SETT'],
  ];
  stack(nodes, links, 'SE', [-3, 2], [-3, 1], ['?', '$$']);
  links.push(['SE', 'out', 'GE', 'under']);
  return { nodes, links, entry: 'GE', exit: ['SETT', 'set'] };
}

// The triple cut's cluster, as placed by an annealer (scan coordinates).
const ST_POS = {"GZ": [3, 0], "SZ": [3, 1], "Q1": [4, 0], "SQ1": [4, 1], "Q2": [5, 0], "SQ2": [5, 1], "Q3": [6, 0], "SQ3": [6, 1], "DUPT": [7, -1], "SRT": [8, -1], "TWT": [9, 2], "SDT": [9, 3], "GVT": [14, 2], "SJT": [21, -1], "MVT": [11, -1], "G3": [12, -2], "G4": [19, -3], "SM": [13, 0], "BS": [15, -1], "BWM": [6, -2], "BW": [5, -4], "LPB": [4, -11], "DUM": [7, -11], "YF": [12, -7], "YFA": [8, -7], "YM": [13, -5], "BX": [11, -10], "PD": [5, -5], "GA1": [14, -9], "GA2": [15, -7], "GA3": [16, -6], "SETT": [16, -5]};

// COUNT (local: main line along row 0 flowing east; the b-station and the
// dispensers north, the joker test south; mirrored north-south once placed).

// A lookup station on the ring (G, DP, BQ along a row, west to east; the
// copy's cluster hangs south). The query arrives at G from the south-west.
// Ports: next (the master, east), q (any query, BQ's burn), qn (natural
// queries only), group (r clubs and 14 - r hearts of qn's rank).
function stationNodes(p, at) {
  const P = (dx, dy) => [at[0] + dx, at[1] + dy];
  const nodes = {
    [`${p}G`]: c(P(0, 0), 'gather'), [`${p}DP`]: c(P(1, 0), 'duplicate'), [`${p}BQ`]: c(P(2, 0), 'burn'),
    [`${p}WJ`]: c(P(1, 1), 'war', { rule: 'top' }), [`${p}AJ`]: shoe(P(0, 2), 'AC'),
    [`${p}SET`]: c(P(2, 1), 'set'), [`${p}BS`]: c(P(2, 2), 'burn'),
  };
  const links = [
    [`${p}G`, 'out', `${p}DP`], [`${p}DP`, 'a', `${p}BQ`], [`${p}DP`, 'b', `${p}WJ`],
    [`${p}AJ`, null, `${p}WJ`, 'dealer'], [`${p}WJ`, 'lose', `${p}SET`], [`${p}SET`, 'set', `${p}BS`],
  ];
  return { nodes, links, qIn: `${p}G`, tIn: `${p}G`, next: [`${p}BQ`, 'rest'], q: [`${p}BQ`, 'burn'], qn: [`${p}BS`, 'burn'], group: [`${p}BS`, 'rest'] };
}

// The doubled-window count cut. [F1, S, S, F2] (S the deck less its bottom
// card b, reversed by the Deal) is 260 cards; F1 = 51 + v(b) cards, F2 =
// 103 - v. Hand(52) cuts it in five; the third and the top card of the fourth
// are S cut by v, reversed back by Deal DR, and b goes under. F1 is made of
// r clubs from the lookup, 1 + 13s from a dispenser (s the suit) and 50 cards
// of S; F2 likewise of 14 - r hearts, 40 - 13s and 49 cards of S.
function countMod() {
  const nodes = {
    DD: c([0, 0], 'duplicate'), DB: c([1, 0], 'deal', { out: { to: [] } }),
    SG: c([3, 0], 'war', { rule: 'high' }),
    DSS: c([4, 0], 'duplicate'), DS2: c([5, 0], 'duplicate'), GX: c([6, 0], 'gather'), GY: c([7, 0], 'gather'),
    DL: c([6, -1], 'deal', { out: { to: [] }, dealLen: 60, needsDrop: true }), DLP: c([7, -1], 'pass'),
    G1: c([8, 0], 'gather'), G2: c([9, 0], 'gather'),
    H52: c([10, 0], 'hand', { n: 52 }),
    Q1: c([11, 0], 'war', { rule: 'high' }), SQ1: shoe([11, 1], ['?', '?', '$', '$', '?']),
    Q2: c([12, 0], 'war', { rule: 'high' }), SQ2: shoe([12, -1], ['?', '$']),
    B3: c([13, 1], 'burn'), GR: c([13, 0], 'gather'),
    MR: c([15, 0], 'pass'), DR: c([16, 0], 'deal', { out: { to: [] } }), GB: c([17, 0], 'gather'),
    // south: b again (from the copy), tested against an ace: a natural
    // sends the ace (SG cuts), a joker the ace and a ? (SG passes the deck).
    DBc: c([0, 1], 'deal', { out: { to: [] }, dealLen: 54, needsDrop: true }), DUPb: c([0, 2], 'duplicate'),
    TB: c([1, 2], 'war', { rule: 'high' }), TBA: shoe([1, 3], 'AS'),
    GVJ: c([2, 2], 'gather'), SVJ: shoe([3, 2], '?'), VM: c([2, 1], 'pass'),
    // north
    SUB: c([4, -8], 'suits'), DM: c([11, -9], 'pass'), GM: c([11, -5], 'gather'), SPL: c([8, -2], 'suits'),
  };
  const links = [
    ['DD', 'a', 'DB'], ['DD', 'b', 'DBc'], ['DBc', [53], 'DUPb'], ['DUPb', 'a', 'GB', 'under'], ['DUPb', 'b', 'TB'],
    ['TBA', null, 'TB', 'dealer'], ['TB', 'dwin', 'VM'], ['TB', 'dlose', 'GVJ'], ['SVJ', null, 'GVJ', 'under'],
    ['GVJ', 'out', 'VM'], ['VM', 'out', 'SG', 'dealer'],
    ['DB', range(0, 53), 'SG'],
    ['SG', 'win', 'DSS'], ['SG', 'lose', 'MR'],
    ['DSS', ['a', 'b'], 'DS2'], ['DS2', 'a', 'GX', 'under'], ['DS2', 'b', 'DL'],
    ['DL', range(0, 25), 'GX'], ['DL', range(25, 53), 'DLP'], ['DLP', 'out', 'GY', 'under'],
    ['GX', 'out', 'GY'], ['GY', 'out', 'G1', 'under'], ['G1', 'out', 'G2'], ['G2', 'out', 'H52'], ['H52', 'out', 'Q1'],
    ['SQ1', null, 'Q1', 'dealer'], ['Q1', 'win', 'Q2'], ['SQ2', null, 'Q2', 'dealer'],
    ['Q2', 'lose', 'GR'], ['Q2', 'win', 'B3'], ['B3', 'burn', 'GR', 'under'],
    ['GR', 'out', 'MR'], ['MR', 'out', 'DR'], ['DR', [0], 'GB'],
    ['GM', 'out', 'SPL'], ['SPL', 'C', 'G1'], ['SPL', 'H', 'G2', 'under'],
  ];
  const st = stationNodes('ST', [0, -9]);
  Object.assign(nodes, st.nodes);
  links.push(...st.links, ['DB', [53], st.qIn], [...st.qn, 'SUB'], [...st.group, 'GM'], ['DM', 'out', 'GM', 'under']);
  ['C', 'D', 'H', 'S'].forEach((s, i) => {
    const d = dispenser(nodes, links, `DW${s}`, [6, -13 + 3 * i], ['$', ...Array(1 + 13 * i).fill('2C'), ...Array(40 - 13 * i).fill('2H')]);
    links.push(['SUB', s, d.war], [...d.out, 'DM']);
  });
  return { nodes, links, entry: 'DD', exit: ['GB', 'out'], tIn: st.tIn, tOut: st.next };
}

// EAST: the end of the bottom band and the stations beside it. D'' (the
// deck after the count cut) is copied: one copy gets the marker pair and
// goes round again; from the other the output card is read (t-station), its
// letter looked up (o-station), and the cipher card's (c-station); the
// difference is read off a ruler. Also the player's Straight (one card:
// the cipher gate; the key: out to the main loop) and the table's store.
// Local coordinates: the band along row 0 flowing east, the rest north
// (south once placed), the ring (t, o, c stations) along row -18.

const RANKS = 'A23456789TJQK';
const card = (p) => RANKS[(p - 1) % 13] + (p <= 13 ? 'C' : 'D');
// Decryption ruler: [C(c+1), K(29-k), $, ruler] is dealt; place 56 is
// ruler[25 - c + k], the plaintext letter c - k.
const RULER = Array.from({ length: 51 }, (_, i) => card((((24 - i) % 26) + 26) % 26 + 1));

function eastMod() {
  const nodes = {
    DUPD: c([0, 0], 'duplicate'), GMP: c([2, 0], 'gather'),
    // output read: t off the top; 54 - v(t) cards over the rest, place 53
    BT: c([1, -1], 'burn'), OT: c([1, -2], 'war', { rule: 'high' }), OTA: shoe([0, -2], 'AS'),
    PM: c([12, -2], 'pass'), GR2: c([13, -2], 'gather'), DLR: c([14, -2], 'deal', { out: { to: [] }, dealLen: 60, needsDrop: true }),
    SUT: c([4, -14], 'suits'), SUH: c([0, -12], 'suits'),
    TM1: c([7, -8], 'pass'), TM2: c([11, -8], 'pass'), TM3: c([15, -8], 'pass'), TM: c([19, -8], 'pass'), GP: c([19, -7], 'gather'),
    // key letter
    OT2: c([14, -1], 'war', { rule: 'high' }), OTA2: shoe([13, -1], 'AS'),
    SUO: c([26, -14], 'suits'), SUH2: c([25, -13], 'suits'), KM: c([33, -9], 'pass'), GK: c([33, -8], 'gather'),
    JF: c([27, -18], 'war', { rule: 'high' }), JFA: shoe([27, -17], 'AS'),
    // cipher
    SRC: { at: [33, -5], kind: 'source', out: 5 }, RT: c([34, -6], 'straight'),
    XG: c([34, -8], 'war', { rule: 'high' }), QC: c([38, -16], 'pass'),
    SUC: c([43, -14], 'suits'), SUC2: c([42, -13], 'suits'), CM: c([51, -9], 'pass'), GC: c([51, -8], 'gather'),
    // decryption
    GD1: c([51, -6], 'gather'), GD2: c([53, -5], 'gather'),
    DLD: c([54, -5], 'deal', { out: { to: [] }, dealLen: 60, needsDrop: true }), DESK: { at: [55, -5], kind: 'payout' },
  };
  const links = [];
  const mp = stack(nodes, links, 'MP', [2, 2], [2, 1], ['??', '$']);
  links.push(
    ['DUPD', 'a', 'GMP'], [...mp, 'GMP', 'under'], 
    ['DUPD', 'b', 'BT'], ['BT', 'rest', 'GR2', 'under'], ['BT', 'burn', 'OT'], ['OTA', null, 'OT', 'dealer'],
    ['OT', 'dlose', 'PM'],
    ['SUH', 'H', 'GP'], ['TM1', 'out', 'TM2'], ['TM2', 'out', 'TM3'], ['TM3', 'out', 'TM'], ['TM', 'out', 'GP', 'under'],
    ['GP', 'out', 'PM'], ['PM', 'out', 'GR2'], ['GR2', 'out', 'DLR'],
    ['DLR', [53], 'OT2'], ['OTA2', null, 'OT2', 'dealer'],
    ['SUH2', 'H', 'GK'], ['KM', 'out', 'GK', 'under'], ['GK', 'out', 'XG', 'dealer'],
    ['JFA', null, 'JF', 'dealer'], ['JF', 'win', 'QC'],
    ['SRC', null, 'RT'], ['RT', 'yes', 'XG'], ['XG', 'lose', 'QC'], ['XG', 'dwin', 'GD1', 'under'],
    ['SUC2', 'C', 'GC'], ['CM', 'out', 'GC', 'under'], ['GC', 'out', 'GD1'],
    ['DLD', [56], 'DESK'],
  );
  // the ruler: a dispenser triggered by the count pile
  const rl = dispenser(nodes, links, 'RW', [52, -6], ['$', ...RULER]);
  links.push(['GD1', 'out', 'RW'], ['RW', 'win', 'GD2'], [...rl.out, 'GD2', 'under'], ['GD2', 'out', 'DLD']);
  // stations t, o, c on the ring
  const st = stationNodes('T', [0, -18]), so = stationNodes('O', [23, -18]), sc = stationNodes('C', [40, -18]);
  for (const s of [st, so, sc]) { Object.assign(nodes, s.nodes); links.push(...s.links); }
  links.push(
    ['OT', ['win', 'lose'], st.qIn], [...st.qn, 'SUT'], [...st.group, 'SUH'],
    ['OT2', ['win', 'lose'], so.qIn], [...so.qn, 'SUO'], [...so.group, 'SUH2'], [...so.q, 'JF'],
    ['QC', 'out', sc.qIn], [...sc.qn, 'SUC'], [...sc.group, 'SUC2'],
    [...st.next, so.tIn, 'under'], [...so.next, sc.tIn, 'under'],
  );
  // t: 14 - r hearts and 40 - 13s
  const bus = ['TM1', 'TM2', 'TM3', 'TM'];
  ['C', 'D', 'H', 'S'].forEach((s, i) => {
    const d = dispenser(nodes, links, `TW${s}`, [4 + 4 * i, -9], ['$', ...Array(39 - 13 * i).fill('2S')]);
    links.push(['SUT', s, d.war], [...d.out, bus[i]]);
  });
  // o: 29 - k cards (with a ? in each): 14 - r hearts, and 15 for clubs
  // and hearts, 2 for diamonds and spades; c: c + 1 cards: r clubs, and 13
  // more for diamonds and spades, 1 for clubs and hearts.
  for (const [pre, su, mm, big, small, x, extra] of [['O', 'SUO', 'KM', ['C', 'H'], ['D', 'S'], 27, ['?']], ['C', 'SUC', 'CM', ['D', 'S'], ['C', 'H'], 44, []]]) {
    const d14 = dispenser(nodes, links, `${pre}W14`, [x, -10], ['$', ...extra, ...Array(13).fill('2S')]);
    const d1 = dispenser(nodes, links, `${pre}W1`, [x + 4, -10], ['$', ...extra]);
    links.push([su, big, d14.war], [su, small, d1.war]);
    links.push([...d14.out, mm], [...d1.out, mm]);
  }
  // the store, merged into the ring after the c-station
  Object.assign(nodes, {
    SSH: shoe([46, -23], storeDeck(), { once: true }), SH13: c([47, -23], 'hand', { n: 13 }),
    SST: c([48, -23], 'gather'), STW: c([49, -23], 'war', { rule: 'high' }), SAC: shoe([49, -24], 'AC'),
    SBK: c([48, -22], 'pass'), SSEED: shoe([47, -21], '$', { once: true }), SSU: c([50, -23], 'suits'),
    RM: c([45, -19], 'pass'),
  });
  links.push(
    ['SSH', null, 'SH13'], ['SH13', 'out', 'SST'], ['SBK', 'out', 'SST', 'under'], ['SSEED', null, 'SBK'],
    ['SAC', null, 'STW', 'dealer'], ['SST', 'out', 'STW'], ['STW', 'lose', 'SBK'], ['STW', 'win', 'SSU'],
    ['SSU', ['C', 'H'], 'RM'], [...sc.next, 'RM'],
  );
  return {
    nodes, links, entry: 'DUPD', exit: ['GMP', 'out'], key: ['RT', 'no'],
    ringOut: ['RM', 'out'], ringIn: st.tIn, // ringOut -> the b-station's G (under); its next -> ringIn (under)
  };
}

// MOVES with unrolled searches: the rotation to A in two lanes (a on the
// band, b west-flowing above it), the rotation to B in two (a, b). The
// hand's first lane is checked at its end; a wrong joker on top sends it
// (turned on by one, or two past the marker) into the second lane, which
// always finds the joker wanted: the marker pair is at the end of the hand
// as a step begins, so A comes before it, and the first joker is A or B;
// after STEP_A, A is last and B is first or second. Local coordinates: the
// band along row 0 flowing east, the lanes north (outside).

// DISP1: is the top card A? GT's lose: yes (on), win: no (BRB turns it on by one).
function disp1(p, at, flip) {
  const [q, r] = at;
  const P = (dq, dr) => (flip ? [q - dq - dr, r + dr] : [q + dq, r + dr]);
  const nodes = {
    [`${p}DUP`]: c(P(0, 0), 'duplicate'), [`${p}BT`]: c(P(1, 1), 'burn'), [`${p}SU`]: c(P(2, 1), 'suits'),
    [`${p}WD`]: c(P(2, 2), 'war', { rule: 'high' }), [`${p}SDW`]: shoe(P(3, 2), '$'), [`${p}MV`]: c(P(3, 1), 'pass'),
    [`${p}GT`]: c(P(3, 0), 'war', { rule: 'high' }), [`${p}BRB`]: c(P(3, -1), 'burn'),
  };
  const links = [
    [`${p}DUP`, 'b', `${p}BT`], [`${p}BT`, 'burn', `${p}SU`], [`${p}SDW`, null, `${p}WD`, 'dealer'], [`${p}SU`, 'S', `${p}WD`],
    [`${p}SU`, 'misc', `${p}MV`], [`${p}WD`, 'dlose', `${p}MV`], [`${p}MV`, 'out', `${p}GT`, 'dealer'],
    [`${p}DUP`, 'a', `${p}GT`], [`${p}GT`, 'win', `${p}BRB`],
  ];
  return { nodes, links, entry: `${p}DUP`, yes: [`${p}GT`, 'lose'], no: [`${p}BRB`, ['rest', 'burn']] };
}
// DISP2: is the second card '$' (the top is the marker's head)? G2's win:
// no (on: B is on top); lose: yes (BM1, BM2 turn it on by two).
function disp2(p, at, flip) {
  const [q, r] = at;
  const P = (dq, dr) => (flip ? [q - dq - dr, r + dr] : [q + dq, r + dr]);
  const nodes = {
    [`${p}DUP2`]: c(P(0, 0), 'duplicate'), [`${p}DL2`]: c(P(1, 1), 'deal', { out: { to: [] }, dealLen: 60, needsDrop: true }),
    [`${p}TW2`]: c(P(2, 1), 'war', { rule: 'top' }), [`${p}SD2`]: shoe(P(2, 2), '$'),
    [`${p}GV`]: c(P(3, 2), 'gather'), [`${p}SJ2`]: shoe(P(4, 2), '?'), [`${p}MV2`]: c(P(3, 1), 'pass'),
    [`${p}G2`]: c(P(3, 0), 'war', { rule: 'high' }), [`${p}BM1`]: c(P(3, -1), 'burn'), [`${p}BM2`]: c(P(2, -1), 'burn'),
  };
  const links = [
    [`${p}DUP2`, 'b', `${p}DL2`], [`${p}DL2`, [1], `${p}TW2`], [`${p}SD2`, null, `${p}TW2`, 'dealer'],
    [`${p}TW2`, 'dlose', `${p}MV2`], [`${p}TW2`, 'dwin', `${p}GV`], [`${p}SJ2`, null, `${p}GV`, 'under'], [`${p}GV`, 'out', `${p}MV2`],
    [`${p}MV2`, 'out', `${p}G2`, 'dealer'], [`${p}DUP2`, 'a', `${p}G2`],
    [`${p}G2`, 'lose', `${p}BM1`], [`${p}BM1`, ['rest', 'burn'], `${p}BM2`],
  ];
  return { nodes, links, entry: `${p}DUP2`, yes: [`${p}BM2`, ['rest', 'burn']], no: [`${p}G2`, 'win'] };
}

function movesStage3() {
  const nodes = {}, links = [];
  const add = (m) => { Object.assign(nodes, m.nodes); links.push(...m.links); return m; };
  // ROT1: lanes a (row 0, east), b (row -4, west)
  const r1a = add(rot('A', [0, 0], { n: 56 }));
  const d1a = add(disp1('PA', [18, 0], false));
  const r1b = add(rot('B', [19, -4], { n: 56, dir: W }));
  nodes.MA = c([23, 0], 'pass');
  links.push(
    [r1a.exit, r1a.exitPorts, d1a.entry], [...d1a.no, r1b.entry], [...d1a.yes, 'MA'],
    [r1b.exit, r1b.exitPorts, 'MA'],
  );
  // STEP_A: [A, rest] -> [rest turned on by one, A]. (A is never just above
  // the marker, so moving it never skips the marker: the marker is above the
  // deck's top card, and A is never the deck's bottom card when it moves. It
  // can only be there after a triple cut whose upper joker was on top, which
  // leaves the lower joker at the bottom; and if A is on top then, B has just
  // moved past it, so the lower joker is B.)
  Object.assign(nodes, { BA: c([24, 0], 'burn'), BA1: c([26, 0], 'burn'), GA: c([30, 0], 'gather') });
  links.push(['MA', 'out', 'BA'], ['BA', 'rest', 'BA1'], ['BA1', ['rest', 'burn'], 'GA'], ['BA', 'burn', 'GA', 'under']);
  // ROT2: lanes a (row 0, east), b (row -4, west)
  const r2a = add(rot('D', [31, 0], { n: 56 }));
  const d2a = add(disp2('PD', [49, 0], false));
  const r2b = add(rot('F', [51, -4], { n: 56, dir: W }));
  nodes.MB = c([55, 0], 'pass');
  links.push(
    ['GA', 'out', r2a.entry], [r2a.exit, r2a.exitPorts, d2a.entry], [...d2a.yes, r2b.entry], [...d2a.no, 'MB'],
    [r2b.exit, r2b.exitPorts, 'MB'],
  );
  // STEP_B: [B, rest] -> [B, PASS1'(PASS1'(rest))]
  const pb1 = add(pass1m('SB', [57, 0])), pb2 = add(pass1m('SC', [61, 0]));
  Object.assign(nodes, { BB: c([56, 0], 'burn'), GB: c([66, 0], 'gather'), MGB: c([65, 1], 'pass') });
  links.push(
    ['MB', 'out', 'BB'], ['BB', 'rest', pb1.entry], ...pb1.exits.map(([f, p]) => [f, p, pb2.entry]),
    ...pb2.exits.map(([f, p]) => [f, p, 'MGB']), ['MGB', 'out', 'GB', 'under'], ['BB', 'burn', 'GB'],
  );
  for (const n of Object.values(nodes)) if (n.fn === 'pass') n.out = {};
  return { nodes, links, entry: r1a.entry, exit: 'GB', exitPorts: 'out' };
}

// Negotiated-congestion router (PathFinder style) for big machines.
//
//   route({ nodes, links, floor?, blocked?, iterations? }) -> { cells, passes }
//
// nodes: { name: cell } with `at` (hand-placed croupiers, shoes, and fixed
// cells: sources and payouts). links: [from, ports, to, role] as for
// src/layout.js: ports is a port name or list sharing one route (Deal: place
// indices), null for a shoe or source; role 'dealer' (War) or 'under'
// (Gather) sets that side of `to` to the side the route arrives on.
// floor: hexes passes may use (default: anything not blocked, within a
// margin of the nodes). Every pass cell and every side of a node is used by
// one link at most; congested resources get dearer each round until no two
// links share one.
const key = (q, r) => `${q},${r}`;

function route({ nodes, links, floor, iterations = 60, margin = 2, quiet = false, blocked = [], softFail = false }) {
  const byName = new Map(Object.entries(nodes));
  const nodeAt = new Map();
  for (const [name, n] of byName) {
    const k = key(...n.at);
    if (nodeAt.has(k)) throw new Error(`two nodes at ${k}: ${nodeAt.get(k)} and ${name}`);
    nodeAt.set(k, name);
  }
  let allowed;
  if (floor) allowed = new Set(floor.map(([q, r]) => key(q, r)));
  else {
    const qs = [...byName.values()].map((n) => n.at[0]), rs = [...byName.values()].map((n) => n.at[1]);
    allowed = new Set();
    for (let q = Math.min(...qs) - margin; q <= Math.max(...qs) + margin; q++)
      for (let r = Math.min(...rs) - margin; r <= Math.max(...rs) + margin; r++) allowed.add(key(q, r));
  }
  for (const k of nodeAt.keys()) allowed.delete(k);
  for (const [q, r] of blocked) allowed.delete(key(q, r));
  // a Deal's drop side must stay empty
  for (const [name, n] of byName) if (n.dropSide !== undefined) {
    const [dq, dr] = DIRS[n.dropSide];
    const k = key(n.at[0] + dq, n.at[1] + dr);
    if (nodeAt.has(k)) throw new Error(`drop side of ${name} is taken by ${nodeAt.get(k)}`);
    allowed.delete(k);
  }
  // fixed sides: a source's out is fixed by the level (when given as fixedOut)
  const nets = links.map(([from, ports, to, role], i) => {
    if (!byName.has(from) || !byName.has(to)) throw new Error(`bad link ${from} -> ${to}`);
    return { i, from, ports, to, role, path: null, arrive: null, first: null };
  });
  const hist = new Map(), occ = new Map();
  const use = (r, d) => occ.set(r, (occ.get(r) ?? 0) + d);
  const resOf = (net) => {
    const res = net.path.map((k) => `c${k}`);
    res.push(`s${net.to}:${net.arrive}`);
    res.push(`o${net.from}:${net.first}`);
    return res;
  };
  // A node's output direction may be shared only by links with the same
  // from and to (they would be merged anyway); we forbid sharing outright.
  let pf = 0.5;
  for (let it = 0; it < iterations; it++) {
    for (const net of nets) {
      if (net.path) for (const r of resOf(net)) use(r, -1);
      const found = search(net, byName, nodeAt, allowed, (r) => {
        const o = occ.get(r) ?? 0, h = hist.get(r) ?? 0;
        return (1 + h) * (1 + pf * o);
      }, nets);
      if (!found) { if (softFail) return { over: 1e6, passes: 0 }; throw new Error(`no route ${net.from} -> ${net.to}`); }
      Object.assign(net, found);
      for (const r of resOf(net)) use(r, 1);
    }
    let over = 0;
    for (const [r, o] of occ) if (o > 1) { over++; hist.set(r, (hist.get(r) ?? 0) + (o - 1)); }
    if (!quiet || it === iterations - 1) process.stderr.write(`route it ${it} overused ${over} ${[...occ].filter(([, o]) => o > 1).map(([r]) => r).slice(0, 8).join(" ")}\n`);
    if (!over) { const e = emit(nets, byName); e.over = 0; return e; }
    pf *= 1.6;
    if (softFail && it === iterations - 1) return { over, passes: nets.reduce((a, n) => a + n.path.length, 0) };
  }
  const users = new Map();
  for (const net of nets) for (const r of resOf(net)) { if ((occ.get(r) ?? 0) > 1) { if (!users.has(r)) users.set(r, []); users.get(r).push(`${net.from}->${net.to}`); } }
  for (const [r, u] of users) process.stderr.write(`  ${r}: ${u.join(', ')}\n`);
  for (const net of nets) if (resOf(net).some((r) => (occ.get(r) ?? 0) > 1)) process.stderr.write(`  ${net.from}->${net.to}: first ${net.first} path ${net.path.join(' ')} arrive ${net.arrive}\n`);
  throw new Error('router did not converge');
}

// Dijkstra from net.from to a side of net.to. Cost of a pass hex c: cost(`c`+k);
// of arriving on side s of to: cost(`s${to}:${s}`); of leaving from on d.
function search(net, byName, nodeAt, allowed, cost, nets) {
  const from = byName.get(net.from), to = byName.get(net.to);
  const fixedDealer = to.fn === 'war' ? to.dealerFixed : undefined;
  const toKey = key(...to.at);
  // sides of `to` reserved for roles by other nets are handled by resources;
  // a role link must arrive on a side not used by non-role links (resource
  // too). A non-role link into a War must not arrive on its dealer side,
  // which is whatever side the dealer link arrives on: also a resource
  // conflict, since sides are exclusive.
  const fromFixed = from.fixedOut; // e.g. a level's source
  const dist = new Map(), prev = new Map();
  const heap = [];
  const push = (d, st) => {
    heap.push([d, st]);
    let i = heap.length - 1;
    while (i > 0) { const j = (i - 1) >> 1; if (heap[j][0] <= heap[i][0]) break; [heap[i], heap[j]] = [heap[j], heap[i]]; i = j; }
  };
  const pop = () => {
    const top = heap[0], last = heap.pop();
    if (heap.length) {
      heap[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1; let m = i;
        if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
        if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
        if (m === i) break;
        [heap[i], heap[m]] = [heap[m], heap[i]]; i = m;
      }
    }
    return top;
  };
  // start states: first hex in each allowed direction
  for (let d = 0; d < 6; d++) {
    if (fromFixed !== undefined && d !== fromFixed) continue;
    const [dq, dr] = DIRS[d];
    const q = from.at[0] + dq, r = from.at[1] + dr, k = key(q, r);
    const oc = cost(`o${net.from}:${d}`) - 1;
    if (k === toKey) {
      const side = (d + 3) % 6;
      if (!sideOk(net, to, side)) continue;
      push(oc + cost(`s${net.to}:${side}`) * 0.2, { k, q, r, first: d, end: true, side });
    } else if (allowed.has(k)) {
      push(oc + cost(`c${k}`), { k, q, r, first: d });
    }
  }
  while (heap.length) {
    const [dcur, st] = pop();
    const sk = st.end ? `END${st.side}` : st.k;
    if (dist.has(sk) && dist.get(sk) <= dcur) continue;
    dist.set(sk, dcur); prev.set(sk, st);
    if (st.end) {
      // reconstruct
      const path = [];
      let cur = st.parent;
      while (cur) { path.unshift(cur.k); cur = cur.parent; }
      return { path, arrive: st.side, first: st.first, dirs: dirsOf(from.at, path, to.at) };
    }
    for (let d = 0; d < 6; d++) {
      const [dq, dr] = DIRS[d];
      const q = st.q + dq, r = st.r + dr, k = key(q, r);
      if (k === toKey) {
        const side = (d + 3) % 6;
        if (!sideOk(net, to, side)) continue;
        push(dcur + cost(`s${net.to}:${side}`) * 0.2, { k, q, r, first: st.first, end: true, side, parent: st });
      } else if (allowed.has(k) && !onPath(st, k)) {
        push(dcur + cost(`c${k}`), { k, q, r, first: st.first, parent: st });
      }
    }
  }
  return null;
}
const onPath = (st, k) => { for (let c = st; c; c = c.parent) if (c.k === k) return true; return false; };
function sideOk(net, to, side) {
  if (net.role === 'dealer' && to.dealer !== undefined && to.dealerFixed) return side === to.dealer;
  if (net.role === 'under' && to.under !== undefined && to.underFixed) return side === to.under;
  return true;
}
function dirsOf(fromAt, path, toAt) {
  const pts = [fromAt, ...path.map((k) => k.split(',').map(Number)), toAt];
  const out = [];
  for (let i = 0; i + 1 < pts.length; i++) {
    const dq = pts[i + 1][0] - pts[i][0], dr = pts[i + 1][1] - pts[i][1];
    out.push(DIRS.findIndex(([a, b]) => a === dq && b === dr));
  }
  return out;
}
function emit(nets, byName) {
  const cells = new Map();
  for (const [name, n] of byName) {
    const c = structuredClone(n);
    delete c.fixedOut; delete c.dealerFixed; delete c.underFixed; delete c.label;
    delete c.dropSide; delete c.dealLen; delete c.needsDrop;
    if (c.kind === 'croupier') c.out = c.out ?? {};
    cells.set(name, c);
  }
  const passes = [];
  for (const net of nets) {
    const from = cells.get(net.from), to = cells.get(net.to);
    const d0 = net.dirs[0];
    if (from.kind === 'shoe' || from.kind === 'source') from.out = d0;
    else for (const p of [].concat(net.ports)) {
      if (from.fn === 'deal') { from.out.to ??= []; from.out.to[p] = d0; }
      else from.out[p] = d0;
    }
    net.path.forEach((k, i) => {
      passes.push({ at: k.split(',').map(Number), kind: 'croupier', fn: 'pass', out: { out: net.dirs[i + 1] } });
    });
    if (net.role === 'dealer') to.dealer = net.arrive;
    if (net.role === 'under') to.under = net.arrive;
  }
  // Deals: places with no route go to the drop side (a hex kept free; with
  // needsDrop, any neighbour no table ends up on).
  const taken = new Set([...cells.values()].map((c) => key(...c.at)));
  for (const p of passes) taken.add(key(...p.at));
  for (const [name, n] of byName) {
    if (n.fn !== 'deal' || !n.needsDrop) continue;
    const d = DIRS.findIndex(([dq, dr]) => !taken.has(key(n.at[0] + dq, n.at[1] + dr)));
    if (d < 0) throw new Error(`deal ${name} has no free side to drop onto`);
    n.dropSide = d;
  }
  for (const [name, n] of byName) {
    if (n.fn !== 'deal') continue;
    const c = cells.get(name), to = c.out.to ?? [];
    const len = Math.max(n.dealLen ?? 0, to.length);
    for (let i = 0; i < len; i++) if (to[i] === undefined) {
      if (n.dropSide === undefined) throw new Error(`deal ${name} drops place ${i} but has no dropSide`);
      to[i] = n.dropSide;
    }
    c.out.to = to;
  }
  return { cells: [...cells.values(), ...passes], passes: passes.length };
}

// The whole machine: the bottom band (row 0, flowing east) holds SCAN and
// TRIPLE, COUNT and EAST's copy of D''; up to the top band (row -8, flowing
// west), the joker moves, and down again to SCAN. The ring, the stations and
// the triple cut's cluster hang south of the bottom band (outside the loop),
// the lanes north of the top band.

function machine() {
  const all = { nodes: {}, links: [] };
  const pre = (p, m) => {
    const rn = (x) => (typeof x === 'string' ? p + x : x);
    const out = { nodes: {}, links: m.links.map(([f, ports, t, role]) => [rn(f), ports, rn(t), role]) };
    for (const [k, v] of Object.entries(m.nodes)) out.nodes[p + k] = v;
    return { out, rn };
  };
  // SCAN + TRIPLE at the origin, mirrored north-south
  const sc = scanTriple();
  const HEAD = new Set(['GE', 'H1', 'W', 'LP', 'SEED', 'SE_']);
  for (const [k, v] of Object.entries(ST_POS)) if (sc.nodes[k] && !HEAD.has(k)) sc.nodes[k].at = v;
  place(sc, { mirror: 'v' });
  const S = pre('s', sc); merge(all, S.out);
  // COUNT, mirrored, from q = 36
  const co = countMod(); place(co, { mirror: 'v', at: [36, 0] });
  const C = pre('k', co); merge(all, C.out);
  // EAST, mirrored, from q = 56
  const ea = eastMod(); place(ea, { mirror: 'v', at: [56, 0] });
  const X = pre('e', ea); merge(all, X.out);
  // MOVES, mirrored east-west, along row -8, entering at q = 62
  const mv = movesStage3(); place(mv, { mirror: 'h', at: [62, -8] });
  const M = pre('m', mv); merge(all, M.out);
  // the key's intake: RT's 'no' -> GK0 (with ? ?? and the marker pair under) -> MK
  Object.assign(all.nodes, { MK: c([61, -3], 'pass'), GK0: c([63, -3], 'gather') });
  const kx = stack(all.nodes, all.links, 'KX', [65, -3], [64, -3], ['?', '??', '??', '$']);
  all.nodes.KXs.once = true;
  const L = all.links;
  L.push(
    [S.rn(sc.exit[0]), sc.exit[1], C.rn(co.entry)],
    [C.rn(co.exit[0]), co.exit[1], X.rn(ea.entry)],
    [X.rn(ea.exit[0]), ea.exit[1], 'MK'],
    [X.rn(ea.key[0]), ea.key[1], 'GK0'], [...kx, 'GK0', 'under'], ['GK0', 'out', 'MK'],
    ['MK', 'out', M.rn(mv.entry)],
    [M.rn(mv.exit), mv.exitPorts, S.rn(sc.entry)],
    // the ring: b (COUNT) -> t, o, c (EAST) -> store merge -> b
    [C.rn(co.tOut[0]), co.tOut[1], X.rn(ea.ringIn), 'under'],
    [X.rn(ea.ringOut[0]), ea.ringOut[1], C.rn(co.tIn), 'under'],
  );
  return all;
}


// The level's fixed cells: the player (whose cards go to the Straight) and
// the desk.
export const SOLITAIRE_SOURCE = { at: [84, 5], out: SE };
export const SOLITAIRE_DESK = [106, 5];

// The player's cells (shoes and croupiers, passes included).
export function solitaireCells() {
  const m = machine();
  const at = (n) => m.nodes[n].at.join(',');
  if (at('eSRC') !== SOLITAIRE_SOURCE.at.join(',') || at('eDESK') !== SOLITAIRE_DESK.join(',')) throw new Error('solitaire: the player or the desk moved');
  m.nodes.eSRC.fixedOut = SOLITAIRE_SOURCE.out;
  const { cells } = route({ nodes: m.nodes, links: m.links, margin: 3, iterations: 250, quiet: true });
  return cells.filter((x) => x.kind !== 'source' && x.kind !== 'payout');
}
