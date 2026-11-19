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
};
