// The machine on the title screen (title.js): a floor of its own, not one
// of the game's, built from the croupiers players will meet, to show what
// the game is: card players at the edges, croupiers in between cutting,
// sorting, testing and playing War, and every line ending at one chip desk
// at the bottom of the screen, under the logo (which the start animation
// zooms into). It runs on the real engine, so it is a working machine: the
// players' hands never run out (`titleInputs` deals more), and
// test/title.js checks that it keeps paying out and never jams or floods.
//
// Laid out by (x, r): r is the hex row (axial r) and x the column in hex
// widths from the middle (half-integers on odd rows), so the picture below
// is the floor as drawn. Sides: 0 E, 1 SE, 2 SW, 3 W, 4 NW, 5 NE.
import { fullDeck, shuffled, rng } from '../cards.js';

const E = 0, SE = 1, SW = 2, W = 3, NW = 4, NE = 5;
const at = (x, r) => [x - r / 2, r];

// The desk everything ends at (the start animation zooms into it), under
// a carousel in the middle of the screen; the name goes above the carousel,
// between the two wings, and the Start button under the desk.
export const TITLE_DESK = at(0, 2);

const fixed = [
  { at: at(-9, -4), kind: 'source', out: E },
  { at: at(9, -4), kind: 'source', out: W },
  { at: TITLE_DESK, kind: 'payout' },
];

const pass = (x, r, out) => ({ at: at(x, r), kind: 'croupier', fn: 'pass', out: { out } });
const line = (out, ...xrs) => xrs.map(([x, r]) => pass(x, r, out));
const cells = [
  // Left wing: the player's hands are cut. The top half picks up a card
  // from a shoe and is tested for a pair; the bottom half is sorted into
  // suits (diamonds and clubs go on the carpet).
  { at: at(-8, -4), kind: 'croupier', fn: 'cut', out: { top: E, bottom: SE } },
  pass(-7, -4, E),
  { at: at(-5.5, -5), kind: 'shoe', out: SW, deck: ['7H', 'AS', 'QD', '7S', 'KH', '2D'] },
  { at: at(-6, -4), kind: 'croupier', fn: 'gather', out: { out: SE }, under: NE },
  { at: at(-7.5, -3), kind: 'croupier', fn: 'suits', out: { H: E, S: SE } },
  pass(-6.5, -3, E),
  pass(-5.5, -3, SE),
  { at: at(-5, -2), kind: 'croupier', fn: 'kind', n: 2, out: { yes: SE, no: E } },
  ...line(SE, [-4, -2], [-3.5, -1]), ...line(E, [-3, 0], [-2, 0]),
  ...line(SE, [-4.5, -1], [-4, 0], [-3.5, 1]), ...line(E, [-3, 2], [-2, 2], [-1, 2]),
  pass(-7, -2, SE),
  { at: at(-6.5, -1), kind: 'croupier', fn: 'sort', out: { out: SE } },
  pass(-6, 0, SE), ...line(E, [-5.5, 1], [-4.5, 1]),

  // Right wing: the hands are copied. One copy plays War against a shoe
  // (the house wins ties) and the winners are tested for a flush (flushes
  // go to the carousel); the other is cut, and the bottom half has its top
  // card burnt.
  { at: at(8, -4), kind: 'croupier', fn: 'duplicate', out: { a: W, b: SW } },
  pass(7, -4, W),
  { at: at(5.5, -5), kind: 'shoe', out: SE, deck: ['9C', '4H', 'JS', '6D', 'TC', '8H', '3S'] },
  { at: at(6, -4), kind: 'croupier', fn: 'war', dealer: NW, out: { win: SW } },
  { at: at(7.5, -3), kind: 'croupier', fn: 'cut', out: { top: W, bottom: SW } },
  pass(6.5, -3, W),
  pass(5.5, -3, SW),
  { at: at(5, -2), kind: 'croupier', fn: 'flush', out: { yes: W, no: SW } },
  ...line(SW, [4, -2], [3.5, -1]), ...line(W, [3, 0], [2, 0]),
  ...line(SW, [4.5, -1], [4, 0], [3.5, 1]), ...line(W, [3, 2], [2, 2], [1, 2]),
  pass(7, -2, SW),
  { at: at(6.5, -1), kind: 'croupier', fn: 'burn', out: { rest: SW } },
  pass(6, 0, SW), ...line(W, [5.5, 1], [4.5, 1]),

  // The carousel: both wings feed hands into a ring of tables (the ring
  // goes first), where they go round and round, losing a card on the way
  // up (onto the carpet) and paying one out on the way down to the desk,
  // until there is nothing left. (Two Burns, so it keeps up.)
  pass(1, 0, SW),
  { at: at(0.5, 1), kind: 'croupier', fn: 'burn', out: { burn: SW, rest: W } },
  pass(-0.5, 1, NW),
  pass(-1, 0, NE),
  pass(-0.5, -1, E),
  { at: at(0.5, -1), kind: 'croupier', fn: 'burn', out: { rest: SE } },
];

// Felt for a wide screen: hexes from x -15 to 15 and rows -9 to 9.
const floor = [];
for (let r = -9; r <= 9; r++) {
  for (let x = -15 - (r & 1 ? 0.5 : 0); x <= 15; x++) floor.push(at(x, r));
}

// What the Board draws (a level's floor and fixed cells) and the croupiers.
export const TITLE_LEVEL = { id: 'title', floor, fixed };
export const TITLE_CELLS = cells;
export const TITLE_SPEC = { cells: [...fixed, ...cells] };

// The screen's layout, in columns (x) and rows (r): the whole picture, the
// name over the carousel (above `head`, as wide as `gap` columns at most),
// and Start under the desk (below `go`). (title.js frames it.)
export const TITLE_FRAME = { x0: -9.5, x1: 9.5, r0: -6.2, r1: 4.4, head: -2.35, go: 2.75, gap: 9.5 };

// `n` hands of 2 to 5 cards, each run of hands dealt from a shuffled deck.
export function titleInputs(seed, n = 2000) {
  const rand = rng(seed);
  const hands = [];
  let deck = [];
  while (hands.length < n) {
    const size = 2 + Math.floor(rand() * 4);
    if (deck.length < size) deck = shuffled(fullDeck(), rand);
    hands.push(deck.splice(0, size));
  }
  return hands;
}
