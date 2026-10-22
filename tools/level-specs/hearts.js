// Reference-solution recipes for chapter 1 (hearts). Regenerate with
// `node tools/write-solutions.js hearts [--par]`.
import { E, SE, SW, W, NW, NE, c, pass, shoe } from './shared.js';

export const SPECS = {
  'opening-night': { cells: [pass([-1, 0], E), pass([0, 0], E), pass([1, 0], E)] },
  'around-the-bar': {
    cells: [pass([-2, 0], NE), pass([-1, -1], NE), pass([0, -2], E), pass([1, -2], E),
      pass([2, -2], SE), pass([2, -1], SE), pass([2, 0], E)],
  },
  // Merging the twins early is cheapest; a line per table is faster.
  'two-tables': { cells: [pass([-1, 0], E), pass([-1, 1], NE), pass([0, 0], E), pass([1, 0], E)] },
  'hearts-only': {
    nodes: { su: c([-1, 0], 'suits') },
    links: [['su', 'H', 'desk']],
  },
  'seeing-red': {
    nodes: { su: c([-2, 1], 'suits') },
    links: [['su', ['H', 'D'], 'desk']],
  },
  'standing-room': {
    nodes: { a: pass([-1, -2]), b: c([-2, 0], 'suits'), cc: pass([-3, 2]) },
    links: [['a', 'out', 'b'], ['cc', 'out', 'b'], ['b', ['H', 'S'], 'desk']],
  },
  'black-tie': {
    nodes: { a: pass([-3, 0]), b: c([-2, 1], 'suits') },
    links: [['a', 'out', 'b'], ['b', ['S', 'C'], 'desk']],
  },
  'back-to-back': {
    // Merging the twins before the straight is cheapest; a straight per table
    // costs one more croupier and is faster.
    nodes: { a: pass([-4, 2]), b: pass([-3, 0]), st: c([-3, 1], 'straight') },
    links: [['a', 'out', 'st'], ['b', 'out', 'st'], ['st', 'yes', 'desk']],
  },
  'next-door': {
    nodes: {
      g: c([-3, 0], 'gather'), s7: shoe([-3, -1], '7C'),
      st: c([-2, 0], 'straight'), cut: c([-1, 0], 'cut'),
    },
    links: [['s7', null, 'g', 'under'], ['g', 'out', 'st'], ['st', 'yes', 'cut'], ['cut', 'top', 'desk']],
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
  'penny-ante': {
    // [X, 2] catches A and 3; what's left loses its 2 and goes on to [X, 3]
    // for 2 and 4. Each stage strips its reference with its own cut.
    cells: [
      shoe([-2, -1], '2C', { out: SE }), c([-2, 0], 'gather', { under: NW, out: { out: E } }),
      c([-1, 0], 'straight', { out: { yes: SE, no: NE } }),
      c([-1, 1], 'cut', { out: { top: E } }),
      c([0, -1], 'cut', { out: { top: NE } }),
      shoe([0, -2], '3C', { out: E }), c([1, -2], 'gather', { under: W, out: { out: SE } }),
      c([1, -1], 'straight', { out: { yes: SW } }),
      c([0, 0], 'cut', { out: { top: SE } }),
      pass([0, 1], E),
    ],
  },
  'royalty': {
    // Three neighbour tests: [X, Q] catches J and K; the rest lose the Q and
    // meet [X, J] (10 and Q), and those meet [X, K], which keeps the queens.
    // Every stage strips its reference with its own cut.
    cells: [
      shoe([-3, -1], 'QC', { out: SE }), c([-3, 0], 'gather', { under: NW, out: { out: E } }),
      c([-2, 0], 'straight', { out: { yes: SE, no: NE } }),
      c([-2, 1], 'cut', { out: { top: E } }),
      c([-1, -1], 'cut', { out: { top: E } }),
      shoe([0, -2], 'JC', { out: SE }), c([0, -1], 'gather', { under: NW, out: { out: E } }),
      c([1, -1], 'straight', { out: { yes: SE } }),
      c([1, 0], 'cut', { out: { top: SE } }),
      shoe([0, 2], 'KC', { out: NE }), c([1, 1], 'gather', { under: SW, out: { out: W } }),
      c([0, 1], 'straight', { out: { yes: SW } }),
      c([-1, 2], 'cut', { out: { top: NW } }),
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
};
