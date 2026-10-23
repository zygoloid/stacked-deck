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
    // Top card against bottom card; a gather puts the winner and the dealer's
    // losing card back together for the desk.
    cells: [
      c([-1, 0], 'cut', { out: { top: E, bottom: NE } }), pass([0, -1], SE),
      war([0, 0], { dealer: NW, out: { win: E, dlose: SE } }), pass([0, 1], NE),
      c([1, 0], 'gather', { out: { out: E } }),
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
    // The plain build: two cuts split [a | b | c]; War sorts the ends into
    // hi and lo. b plays lo, and the two go on together, to one of two
    // gathers by the result, where they pick up an indicator on top: a 2 if
    // b won, an ace if not. hi plays that stack (its high card is b when b
    // won; an ace makes hi lose anyway), and the stack picks up a second
    // indicator the same way, a 2 only if hi won, with hi gathered
    // underneath: [i, i, b, lo, hi]. A cut takes the two indicators off the
    // top, and the hand is paid if it beats them (only two 2s). The two
    // routes out of each War are the same length, and hi waits for its stack
    // at the last gather, so no piece meets another hand's.
    cells: [
      c([-3, 0], 'cut', { out: { top: SE, bottom: SW } }), c([-4, 1], 'cut', { out: { top: SE, bottom: E } }),
      war([-3, 1], { dealer: W, out: { win: E, dwin: E, lose: SW, dlose: SW } }), // a vs c: hi E, lo SW
      // b plays lo: [2, b, lo] if b won, [A, lo, b] if not
      war([-4, 2], { dealer: NE, out: { win: E, dlose: E, dwin: SE, lose: SE } }),
      c([-3, 2], 'gather', { under: W, out: { out: SE } }), shoe([-2, 2], '2C', { out: W }),
      c([-4, 3], 'gather', { under: NW, out: { out: E } }), shoe([-4, 4], 'AC', { out: NW }),
      pass([-3, 3], E), pass([-2, 3], NE), // the stack on to deal against hi
      pass([-2, 1], E), pass([-1, 1], SE), // hi
      // hi plays the stack: the stack picks up a 2 (hi won) or an ace
      war([-1, 2], { dealer: SW, out: { win: E, lose: E, dlose: SE, dwin: NE } }),
      c([-1, 3], 'gather', { under: NW, out: { out: NE } }), shoe([0, 3], '2C', { out: W }),
      c([0, 1], 'gather', { under: SW, out: { out: SE } }), shoe([0, 0], 'AC', { out: SE }),
      c([0, 2], 'gather', { under: W, out: { out: E } }), // hi underneath
      c([1, 2], 'cut', { out: { top: NE, bottom: NW } }), pass([2, 1], W), // indicators round to the dealer side
      war([1, 1], { dealer: E, out: { win: NW } }), // the hand beats two 2s, never an ace
    ],
  },
};
