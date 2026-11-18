// Reference-solution recipes for the floor (floors that left the campaign).
// Regenerate with `node tools/write-solutions.js floor [--par]`.
import { E, SE, SW, W, NW, NE, c, pass, war, shoe } from './shared.js';

export const SPECS = {
  // Chapter 1's first floors (replaced in the campaign's new introduction).
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
  // Chapter 2's floors replaced when Flush moved after War.
  'either-or': {
    // Suited hands pay unless they're a run; unsuited ones only if they are.
    cells: [
      c([-2, 0], 'flush', { out: { yes: NE, no: SE } }),
      c([-1, -1], 'straight', { out: { no: SE } }), c([-2, 1], 'straight', { out: { yes: NE } }),
      pass([-1, 0], E), pass([0, 0], E),
    ],
  },
  'pair-night': {
    nodes: { k2: c([-1, 0], 'kind', { n: 2 }), k3: c([0, 0], 'kind', { n: 3 }) },
    links: [['k2', 'yes', 'k3'], ['k3', 'no', 'desk']],
  },
  'inside-seven': {
    // The 7 goes on top ([7, a, b]), so the cut takes just the 7 off again.
    nodes: {
      g: c([-2, 0], 'gather', { under: SW }), s7: shoe([-2, -1], '7C'),
      st: c([-1, 0], 'straight'), cut: c([0, 0], 'cut'),
    },
    links: [['s7', null, 'g'], ['g', 'out', 'st'], ['st', 'yes', 'cut'], ['cut', 'bottom', 'desk']],
  },
  'beat-the-dealer': {
    nodes: { w: war([-1, 0]), s9: shoe([-1, -1], '9C') },
    links: [['s9', null, 'w', 'dealer'], ['w', 'win', 'desk']],
  },
  'ace-in-the-hole': {
    nodes: { w: war([-1, 0]), sk: shoe([-1, -1], 'KS') },
    links: [['sk', null, 'w', 'dealer'], ['w', 'win', 'desk']],
  },
  'inside-bet': {
    // Beat an 8, then fail to beat a queen (ties go to the house).
    cells: [
      shoe([-2, -1], '8C', { out: SE }), war([-2, 0], { dealer: NW, out: { win: E } }),
      shoe([-1, -1], 'QC', { out: SE }), war([-1, 0], { dealer: NW, out: { lose: E } }),
      pass([0, 0], E),
    ],
  },
  'top-of-the-heap': {
    // Two cuts split off the top card; the other four are gathered as the
    // dealer's hand, and a gather puts a winning hand back together.
    cells: [
      c([-2, 0], 'cut', { out: { top: NE, bottom: E } }), c([-1, -1], 'cut', { out: { top: E, bottom: SE } }),
      c([-1, 0], 'gather', { out: { out: NE } }),
      war([0, -1], { dealer: SW, out: { win: E, dlose: SE } }), pass([0, 0], NE),
      c([1, -1], 'gather', { out: { out: SE } }),
    ],
  },
};
