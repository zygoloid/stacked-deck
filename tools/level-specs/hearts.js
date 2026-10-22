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
    // The sandwich: [X, 6, 8] is a run only when X is a 7. (Two stages,
    // [X, 6] then [X, 6, 8], also work, for one more croupier.)
    nodes: {
      g1: c([-2, 1], 'gather'), s6: shoe([-3, 1], '6C'), s8: shoe([-2, 2], '8C'),
      g: c([-2, 0], 'gather'), st: c([-1, 0], 'straight'), cut: c([0, 0], 'cut'),
    },
    links: [['s6', null, 'g1'], ['s8', null, 'g1', 'under'], ['g1', 'out', 'g', 'under'], ['g', 'out', 'st'],
      ['st', 'yes', 'cut'], ['cut', 'top', 'desk']],
  },
  'penny-ante': {
    // [X, 2] catches A and 3; what's left goes on to [X, 3] for 2 and 4. The
    // stages wrap round the first straight so both share the last cut.
    cells: [
      shoe([-2, -1], '2C', { out: SE }), c([-2, 0], 'gather', { under: NW, out: { out: E } }),
      c([-1, 0], 'straight', { out: { yes: SE, no: NW } }),
      c([-1, -1], 'cut', { out: { top: E } }),
      shoe([1, -2], '3C', { out: SW }), c([0, -1], 'gather', { under: NE, out: { out: SE } }),
      c([0, 0], 'straight', { out: { yes: SW } }),
      c([-1, 1], 'cut', { out: { top: E } }),
      pass([0, 1], E),
    ],
  },
  'royalty': {
    // [X, Q] catches J and K; the queens are left, and [X, J, K] catches them.
    cells: [
      shoe([-3, -1], 'QC', { out: SE }), c([-3, 0], 'gather', { under: NW, out: { out: E } }),
      c([-2, 0], 'straight', { out: { yes: SE, no: NW } }),
      c([-2, -1], 'cut', { out: { top: E } }),
      c([-1, -1], 'gather', { under: NE, out: { out: SE } }),
      c([0, -2], 'gather', { out: { out: SW } }), shoe([0, -3], 'JC', { out: SE }), shoe([1, -3], 'KC', { out: SW }),
      c([-1, 0], 'straight', { out: { yes: SW } }),
      c([-2, 1], 'cut', { out: { top: E } }),
    ],
  },
  'even-money': {
    // From solutions/even.js: references 3, 7, J catch {2,4}, {6,8}, {10,Q}.
    cells: [
      shoe([-1, -2], '3C', { out: SE }), c([-1, -1], 'gather', { under: NW, out: { out: E } }),
      c([0, -1], 'straight', { out: { yes: SE, no: E } }), c([1, -1], 'cut', { out: { top: E } }),
      shoe([3, -1], '7C', { out: W }), c([2, -1], 'gather', { under: E, out: { out: SW } }),
      c([1, 0], 'straight', { out: { yes: W, no: E } }), c([2, 0], 'cut', { out: { top: SW } }),
      shoe([1, 2], 'JC', { out: NW }), c([1, 1], 'gather', { under: SE, out: { out: W } }),
      c([0, 1], 'straight', { out: { yes: NW } }),
      c([0, 0], 'cut', { out: { top: W } }),
    ],
  },
};
