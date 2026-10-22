// Reference-solution recipes for chapter 2 (diamonds). Regenerate with
// `node tools/write-solutions.js diamonds [--par]`.
import { E, SE, SW, W, NW, NE, c, pass, war, shoe } from './shared.js';

export const SPECS = {
  'red-flush': {
    nodes: { fl: c([-1, 0], 'flush'), su: c([0, 0], 'suits') },
    links: [['fl', 'yes', 'su'], ['su', ['H', 'D'], 'desk']],
  },
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
  'seven-up': {
    // [a, b, 7, 7] has three of a kind exactly when a or b is a 7.
    cells: [
      shoe([-1, -2], '7C', { out: SE }), shoe([0, -2], '7D', { out: SW }), c([-1, -1], 'gather', { out: { out: SW } }),
      c([-2, 0], 'gather', { under: NE, out: { out: SE } }),
      c([-2, 1], 'kind', { n: 3, out: { yes: E } }), c([-1, 1], 'cut', { out: { top: E } }),
    ],
  },
  'lucky-number': {
    // Four sevens on top of the hand: five of a kind means at least one 7 in
    // the hand, six means two. The stack of sevens is built by a loop: two
    // shoes start a pile, and 4 of a kind sends it on, otherwise round again
    // for another seven. (Four shoes and three gathers also build it.)
    cells: [
      shoe([-2, -2], '7C', { out: SE }), shoe([-1, -2], '7D', { out: SW }),
      c([-2, -1], 'gather', { out: { out: W } }), c([-3, -1], 'kind', { n: 4, out: { yes: SE, no: E } }),
      c([-3, 0], 'gather', { under: W, out: { out: E } }),
      c([-2, 0], 'kind', { n: 5, out: { yes: E } }), c([-1, 0], 'kind', { n: 6, out: { no: SE } }),
      c([-1, 1], 'cut', { out: { bottom: E } }),
    ],
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
  'top-dog': {
    // Top card against bottom card; the winner and the dealer's losing card
    // stack up on their way to the desk.
    cells: [
      c([-1, 0], 'cut', { out: { top: E, bottom: NE } }), pass([0, -1], SE),
      war([0, 0], { dealer: NW, out: { win: E, dlose: E } }), pass([1, 0], E),
    ],
  },
  'top-of-the-heap': {
    // Two cuts split off the top card; the other four are gathered as the
    // dealer's hand.
    cells: [
      c([-2, 0], 'cut', { out: { top: NE, bottom: E } }), c([-1, -1], 'cut', { out: { top: E, bottom: SE } }),
      c([-1, 0], 'gather', { out: { out: E } }), pass([0, -1], SE),
      war([0, 0], { dealer: W, out: { win: E, dlose: E } }),
    ],
  },
  'royal-flush': {
    // A flush that beats a king holds an ace; with a 9 on top it's a run only
    // for 10-A (or 4-8, which has no ace). Two cuts and a gather take the 9 off.
    nodes: {
      fl: c([-3, 0], 'flush'), w: war([-2, 0]), sk: shoe([-2, -1], 'KC'),
      g: c([-1, 0], 'gather'), s9: shoe([-1, -1], '9C'), st: c([0, 0], 'straight'),
      c1: c([1, 0], 'cut'), c2: c([1, -1], 'cut'), g2: c([2, 0], 'gather'),
    },
    links: [['fl', 'yes', 'w'], ['sk', null, 'w', 'dealer'], ['w', 'win', 'g', 'under'], ['s9', null, 'g'], ['g', 'out', 'st'],
      ['st', 'yes', 'c1'], ['c1', 'top', 'c2'], ['c1', 'bottom', 'g2'], ['c2', 'bottom', 'g2'], ['g2', 'out', 'desk']],
  },
  'acey-deucey': {
    // Split [a | b | c]; War sorts a and c into [hi, lo]; b plays lo. If b
    // wins, [b, lo] is the dealer's hand against hi; if not, an ace joins
    // [lo, b] so that last War is lost. Both routes take the same time, so
    // the pieces of one hand never meet another's.
    cells: [
      c([-3, 0], 'cut', { out: { top: E, bottom: SE } }),
      c([-3, 1], 'cut', { out: { top: E, bottom: NE } }),
      war([-2, 0], { dealer: SW, out: { win: E, dlose: E, lose: E, dwin: E } }),
      c([-1, 0], 'cut', { out: { top: E, bottom: SW } }),
      war([-2, 1], { dealer: NE, out: { win: E, dlose: E, lose: SE, dwin: SE } }),
      pass([-1, 1], SE), c([-2, 2], 'gather', { out: { out: E } }), shoe([-3, 2], 'AC', { out: E }),
      pass([-1, 2], NE), pass([0, 1], NW),
      war([0, 0], { dealer: SE, out: { win: E, dlose: E } }),
    ],
  },
};
