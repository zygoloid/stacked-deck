// Reference-solution recipes for chapter 1 (hearts). Regenerate with
// `node tools/write-solutions.js hearts [--par]`.
import { E, SE, SW, W, NW, NE, c, pass, shoe } from './shared.js';

export const SPECS = {
  // A pass line per table. Sending the bottom table up into the top line
  // through the gap in the bar saves a croupier, and is slower.
  'first-night': { cells: [pass([-1, -1], E), pass([0, -1], E), pass([1, -1], E), pass([-2, 1], E), pass([-1, 1], E), pass([0, 1], E)] },
  'red-and-black': {
    cells: [pass([-2, 0], E), c([-1, 0], 'suits', { out: { H: NE, D: NE, S: SE, C: SE } })],
  },
  // One straight for both tables (the twins merge into it); a straight per
  // table is a croupier more, and faster.
  'two-at-a-time': { cells: [pass([-1, 1], NE), c([0, 0], 'straight', { out: { yes: E } })] },
  'thursdays-game': {
    // A run is paid at once. Otherwise Suits splits the hand, each suit to a
    // side of its own: a suited hand stays one pile of two, which is not a
    // run (it just failed), while any other hand becomes two single cards,
    // each a run. The second straight pays its "no".
    cells: [
      c([-2, 0], 'straight', { out: { yes: NW, no: E } }),
      c([-1, 0], 'suits', { out: { S: E, H: NE, D: SE, C: SW } }),
      pass([0, -1], SE), pass([-1, 1], NE), pass([-2, 1], E),
      c([0, 0], 'straight', { out: { no: E } }),
    ],
  },
  'threes-company': {
    // Each gather puts the later player's card underneath: B's under A's,
    // then C's under both.
    cells: [c([-1, 0], 'gather', { under: NW, out: { out: E } }), c([0, 0], 'gather', { under: SW, out: { out: E } }), c([1, 0], 'straight', { out: { yes: E } })],
  },
  'in-the-black': {
    // Spades and clubs reach the gather from different sides, so the first
    // two black cards after a payout start a pile; the pile goes round the
    // gather and the straight, picking up one black card a lap. Black cards
    // come every other turn, as fast as the pile gets round.
    cells: [
      c([-1, 1], 'suits', { out: { S: E, C: NE } }), pass([0, 1], NW),
      c([0, 0], 'gather', { out: { out: E } }), c([1, 0], 'straight', { out: { yes: E, no: W } }),
    ],
  },
  'top-and-bottom': {
    // Cut into pieces and gather the top and bottom cards. Two completed cuts
    // (both halves to one side, which turns the hand) and a cut keeping the
    // top half do it with three croupiers.
    cells: [
      c([-1, 0], 'cut', { out: { top: NE, bottom: SE } }), c([0, -1], 'cut', { out: { top: SE } }),
      c([-1, 1], 'cut', { out: { bottom: E } }), c([0, 1], 'cut', { out: { bottom: NW } }),
      c([0, 0], 'gather', { out: { out: E } }),
    ],
  },
  'neighbours': {
    cells: [
      shoe([-1, -1], '7C', { out: SE }), c([-1, 0], 'gather', { under: NW, out: { out: E } }),
      c([0, 0], 'straight', { out: { yes: E } }), c([1, 0], 'cut', { out: { top: E } }),
    ],
  },
  'lucky-seven': {
    // Two neighbour tests in a row, each with its own reference and cut:
    // [X, 6] catches 5 and 7, then [X, 8] keeps the 7. (The sandwich, [X, 6, 8]
    // in one straight, is cheaper.)
    cells: [
      shoe([-2, 1], '6C', { out: NW }), c([-2, 0], 'gather', { under: SE, out: { out: NE } }),
      c([-1, -1], 'straight', { out: { yes: NE } }), c([0, -2], 'cut', { out: { top: E } }),
      shoe([0, -1], '8C', { out: NE }), c([1, -2], 'gather', { under: SW, out: { out: SE } }),
      c([1, -1], 'straight', { out: { yes: SW } }), c([0, 0], 'cut', { out: { top: E } }),
    ],
  },
  'sevens-and-eights': {
    // A reference card, a Kind (2) and a cut per table. Gathering each
    // table's reference first and then sharing one Kind and one cut saves two
    // croupiers, and is slower.
    cells: [
      shoe([-1, -1], '7C', { out: SE }), c([-1, 0], 'gather', { under: NW, out: { out: E } }),
      c([0, 0], 'kind', { n: 2, out: { yes: E } }), c([1, 0], 'cut', { out: { top: E } }),
      shoe([-1, 2], '8C', { out: NW }), c([-1, 1], 'gather', { under: SE, out: { out: E } }),
      c([0, 1], 'kind', { n: 2, out: { yes: E } }), c([1, 1], 'cut', { out: { top: NE } }),
    ],
  },
  'seven-up': {
    // [a, b, 7, 7] has three of a kind exactly when a or b is a 7.
    cells: [
      shoe([-1, -2], '7C', { out: SE }), shoe([0, -2], '7D', { out: SW }), c([-1, -1], 'gather', { out: { out: SW } }),
      c([-2, 0], 'gather', { under: NE, out: { out: SE } }),
      c([-2, 1], 'kind', { n: 3, out: { yes: E } }), c([-1, 1], 'cut', { out: { top: E } }),
    ],
  },
  'even-money': {
    // References 3, 7, J catch {2,4}, {6,8}, {10,Q}: three neighbour tests in
    // a row, each with its own cut to the desk.
    cells: [
      shoe([-1, -2], '3C', { out: SE }), c([-1, -1], 'gather', { under: NW, out: { out: NE } }),
      c([0, -2], 'straight', { out: { yes: SE, no: E } }), c([0, -1], 'cut', { out: { top: SW } }),
      c([1, -2], 'cut', { out: { top: SE } }),
      shoe([2, -2], '7C', { out: SW }), c([1, -1], 'gather', { under: NE, out: { out: SE } }),
      c([1, 0], 'straight', { out: { yes: W, no: SE } }), c([0, 0], 'cut', { out: { top: W } }),
      c([1, 1], 'cut', { out: { top: W } }),
      shoe([0, 2], 'JC', { out: NW }), c([0, 1], 'gather', { under: SE, out: { out: W } }),
      c([-1, 1], 'straight', { out: { yes: W } }), c([-2, 1], 'cut', { out: { top: NE } }),
    ],
  },
  'lucky-number': {
    // Four sevens on top of the hand: five of a kind means at least one 7 in
    // the hand, six means two. The sevens are added one at a time, four shoes
    // and four gathers. (A loop that builds the stack of sevens is cheaper.)
    cells: [
      shoe([-3, -1], '7C', { out: SE }), c([-3, 0], 'gather', { under: W, out: { out: NE } }),
      shoe([-2, -2], '7D', { out: SE }), c([-2, -1], 'gather', { under: SW, out: { out: E } }),
      shoe([-1, -2], '7H', { out: SE }), c([-1, -1], 'gather', { under: W, out: { out: E } }),
      shoe([0, -2], '7S', { out: SE }), c([0, -1], 'gather', { under: W, out: { out: SW } }),
      c([-1, 0], 'kind', { n: 5, out: { yes: SE } }), c([-1, 1], 'kind', { n: 6, out: { no: SE } }),
      c([-1, 2], 'cut', { out: { bottom: NE } }),
    ],
  },
};
