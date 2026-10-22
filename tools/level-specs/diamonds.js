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
    // Split [a | b | c]. War sorts a and c: the higher card goes on to the
    // last War, the lower one is the dealer against b. If b wins, a gather
    // puts b and the low card together as the last War's dealer; if not, b
    // picks up an ace from a shoe, so the last War is lost. Both routes take
    // the same time, so the pieces of one hand never meet another's. A
    // winning last War is gathered back into one hand for the desk.
    nodes: {
      cut1: c([-3, 0], 'cut'), cut2: c([-2, -1], 'cut'), w1: war([-2, 0]), w2: war([-1, -1]),
      gW: c([0, -1], 'gather'), x: pass([-1, 0]), gA: c([0, -2], 'gather'), sA: shoe([-1, -2], 'AC'),
      m: pass([1, -2]), f: war([1, -1]), gF: c([2, -1], 'gather'), x2: pass([2, -2]),
    },
    links: [
      ['cut1', 'bottom', 'cut2'], ['cut2', 'bottom', 'w1', 'dealer'], ['cut1', 'top', 'w1'],
      ['w1', ['lose', 'dlose'], 'w2', 'dealer'], ['cut2', 'top', 'w2'],
      ['w2', 'win', 'gW'], ['w2', 'dlose', 'x'], ['x', 'out', 'gW'],
      ['w2', 'lose', 'gA'], ['sA', null, 'gA'],
      ['gW', 'out', 'm'], ['gA', 'out', 'm'], ['m', 'out', 'f', 'dealer'],
      ['w1', ['win', 'dwin'], 'f'],
      ['f', 'win', 'gF'], ['f', 'dlose', 'x2'], ['x2', 'out', 'gF'], ['gF', 'out', 'desk'],
    ],
  },
};
