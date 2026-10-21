// Recipes for the reference solutions in solutions/levels/. Each entry is
// either { cells } (written by hand) or { nodes, links } for the router
// (see tools/level-build.js and src/layout.js). Regenerate the solution files
// with `node tools/write-solutions.js [id]`.
const E = 0, SE = 1, SW = 2, W = 3, NW = 4, NE = 5;

const c = (at, fn, extra = {}) => ({ at, kind: 'croupier', fn, ...extra });
const pass = (at, out) => c(at, 'pass', { out: { out } });
const war = (at, extra = {}) => c(at, 'war', { rule: 'high', ...extra });
const twar = (at, extra = {}) => c(at, 'war', { rule: 'top', ...extra });
const shoe = (at, card, extra = {}) => ({ at, kind: 'shoe', deck: [card], ...extra });

export const SPECS = {
  'opening-night': { cells: [pass([-1, 0], E), pass([0, 0], E), pass([1, 0], E)] },
  'around-the-bar': {
    cells: [pass([-2, 0], NE), pass([-1, -1], NE), pass([0, -2], E), pass([1, -2], E),
      pass([2, -2], SE), pass([2, -1], SE), pass([2, 0], E)],
  },
  'two-tables': { cells: [pass([-1, 0], E), pass([-1, 1], NE), pass([0, 0], E), pass([1, 0], E)] },
  'hearts-only': {
    nodes: { su: c([-1, 0], 'suits') },
    links: [['su', 'H', 'desk']],
  },
  'seeing-red': {
    nodes: { su: c([-2, 1], 'suits') },
    links: [['su', ['H', 'D'], 'desk']],
  },
  'black-tie': {
    nodes: { a: pass([-3, 0]), b: c([-2, 1], 'suits') },
    links: [['a', 'out', 'b'], ['b', ['S', 'C'], 'desk']],
  },
  'back-to-back': {
    nodes: { st: c([-1, 0], 'straight') },
    links: [['st', 'yes', 'desk']],
  },
  'next-door': {
    nodes: {
      g: c([-3, 0], 'gather'), s7: shoe([-3, -1], '7C'),
      st: c([-2, 0], 'straight'), cut: c([-1, 0], 'cut'),
    },
    links: [['s7', null, 'g', 'under'], ['g', 'out', 'st'], ['st', 'yes', 'cut'], ['cut', 'top', 'desk']],
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
  'red-flush': {
    nodes: { fl: c([-1, 0], 'flush'), su: c([0, 0], 'suits') },
    links: [['fl', 'yes', 'su'], ['su', ['H', 'D'], 'desk']],
  },
  'pair-night': {
    nodes: { k2: c([-1, 0], 'kind', { n: 2 }), k3: c([0, 0], 'kind', { n: 3 }) },
    links: [['k2', 'yes', 'k3'], ['k3', 'no', 'desk']],
  },
  'beat-the-dealer': {
    nodes: { w: war([-1, 0]), s9: shoe([-1, -1], '9C') },
    links: [['s9', null, 'w', 'dealer'], ['w', 'win', 'desk']],
  },
  'ace-in-the-hole': {
    nodes: { w: war([-1, 0]), sk: shoe([-1, -1], 'KS') },
    links: [['sk', null, 'w', 'dealer'], ['w', 'win', 'desk']],
  },
  'top-dog': {
    nodes: { cut: c([-1, 0], 'cut'), w: war([0, 0]), g: c([1, 0], 'gather') },
    links: [['cut', 'bottom', 'w', 'dealer'], ['cut', 'top', 'w'],
      ['w', 'dlose', 'g', 'under'], ['w', 'win', 'g'], ['g', 'out', 'desk']],
  },
  'high-spade': {
    nodes: {
      dup: c([-2, 0], 'duplicate'), g: c([-1, -1], 'gather'), s2: shoe([-2, -1], '2S'),
      su: c([0, -1], 'suits'), gate: war([1, 0]),
    },
    links: [['s2', null, 'g', 'under'], ['dup', 'b', 'g'], ['g', 'out', 'su'],
      ['su', 'S', 'gate', 'dealer'], ['dup', 'a', 'gate'], ['gate', 'lose', 'desk']],
  },
  'top-pair': {
    nodes: {
      k2: c([-2, 0], 'kind', { n: 2 }), dup: c([-1, 0], 'duplicate'),
      set: c([0, -1], 'set'), gate: war([1, 0]),
    },
    links: [['k2', 'yes', 'dup'], ['dup', 'b', 'set'], ['set', 'set', 'gate', 'dealer'],
      ['dup', 'a', 'gate'], ['gate', 'lose', 'desk']],
  },
  'new-rules': {
    nodes: { w: twar([-1, 0]), st: shoe([-1, -1], 'TC') },
    links: [['st', null, 'w', 'dealer'], ['w', 'win', 'desk']],
  },
  'bottom-dealer': {
    // out, in, in brings the bottom card of five to the top.
    nodes: {
      o: c([-2, 0], 'outshuffle'), i1: c([-1, 0], 'inshuffle'), i2: c([0, 0], 'inshuffle'),
      w: twar([1, 0]), st: shoe([1, -1], 'TC'),
    },
    links: [['o', 'out', 'i1'], ['i1', 'out', 'i2'], ['i2', 'out', 'w'],
      ['st', null, 'w', 'dealer'], ['w', 'win', 'desk']],
  },
  knockout: { cells: knockout(false) },
  'low-ball': { cells: knockout(true) },
  'hot-streak': {
    cells: [
      c([-1, 0], 'duplicate', { out: { a: E, b: SE } }),
      pass([-1, 1], NE),
      shoe([-2, 2], 'AS', { out: NE, once: true }),
      war([0, 0], { dealer: SW, out: { win: E } }),
    ],
  },
  'high-roller': {
    // From solutions/record-high.js: the champion loop.
    cells: [
      shoe([1, -1], '2C', { out: SE, once: true }),
      war([1, 0], { dealer: W, out: { win: NE, dwin: E } }),
      pass([2, -1], SW),
      c([2, 0], 'duplicate', { out: { a: E, b: W } }),
    ],
  },
  'full-house': {
    // From solutions/full-house.js: test a copy, release, gate, door.
    nodes: {
      door: war([1, 0], { dealer: W }), ticket: shoe([1, 1], '2D', { once: true }),
      dup: c([2, 0], 'duplicate'),
      gate: war([2, -1]),
      trips: c([3, 0], 'kind', { n: 3 }),
      set: c([4, 0], 'set'),
      pair: c([5, -1], 'kind', { n: 2 }),
      yes: war([5, -2]), yesShoe: shoe([6, -2], '2C'),
      no: war([4, -1]), noShoe: shoe([3, -1], 'AC'),
      verdict: c([4, -2], 'pass'),
    },
    links: [
      ['ticket', null, 'door'],
      ['yesShoe', null, 'yes', 'dealer'], ['noShoe', null, 'no', 'dealer'],
      ['door', ['dwin', 'dlose'], 'dup'], ['dup', 'a', 'gate'], ['dup', 'b', 'trips'],
      ['trips', 'yes', 'set'], ['trips', 'no', 'no'], ['set', 'rest', 'pair'],
      ['pair', 'yes', 'yes'], ['pair', 'no', 'no'],
      ['yes', ['dwin', 'dlose'], 'verdict'], ['no', ['dwin', 'dlose'], 'verdict'],
      ['verdict', 'out', 'gate', 'dealer'],
      ['gate', 'win', 'desk'], ['gate', ['dwin', 'dlose'], 'door'],
    ],
  },
  'calling-card': {
    // Sort brings a spade to the top if there is one; two cuts take the top
    // card off a copy, and the suit splitter turns it into a verdict.
    nodes: {
      door: war([1, 0], { dealer: W }), ticket: shoe([1, 1], '2D', { once: true }),
      dup: c([2, 0], 'duplicate'),
      gate: war([2, -1]),
      sort: c([3, 0], 'sort'), cut1: c([4, 0], 'cut'), cut2: c([5, -1], 'cut'),
      su: c([5, -2], 'suits'),
      yes: war([4, -3]), yesShoe: shoe([5, -4], '2C'),
      no: war([4, -2]), noShoe: shoe([4, -1], 'AC'),
      verdict: c([3, -2], 'pass'),
    },
    links: [
      ['ticket', null, 'door'],
      ['yesShoe', null, 'yes', 'dealer'], ['noShoe', null, 'no', 'dealer'],
      ['door', ['dwin', 'dlose'], 'dup'], ['dup', 'a', 'gate'], ['dup', 'b', 'sort'],
      ['sort', 'out', 'cut1'], ['cut1', 'top', 'cut2'], ['cut2', 'top', 'su'],
      ['su', 'S', 'yes'], ['su', 'misc', 'no'],
      ['yes', ['dwin', 'dlose'], 'verdict'], ['no', ['dwin', 'dlose'], 'verdict'],
      ['verdict', 'out', 'gate', 'dealer'],
      ['gate', 'win', 'desk'], ['gate', ['dwin', 'dlose'], 'door'],
    ],
  },
  'house-record': {
    // From solutions/record-set.js.
    nodes: {
      door: war([0, -1], { dealer: SE }), ticket: shoe([1, -1], '2D', { once: true }),
      dup: c([1, -2], 'duplicate'),
      gate: war([0, -2]),
      k2: c([2, -3], 'kind', { n: 2 }), k3: c([4, -3], 'kind', { n: 3 }), k4: c([6, -6], 'kind', { n: 4 }),
      m1: war([3, -4]), s1: shoe([2, -4], '3S'),
      m2: war([4, -4]), s2: shoe([3, -3], '4S'),
      m3: war([5, -5]), s3: shoe([5, -4], '5S'),
      m4: war([5, -6]), s4: shoe([5, -7], '6S'),
      markers: c([4, -5], 'pass'),
      champ: war([2, -5]), loop: c([3, -6], 'pass'), seed: shoe([3, -7], '3H', { once: true }),
      toAce: war([1, -4]), aces: shoe([1, -3], 'AC'),
      toTwo: war([1, -5]), twos: shoe([0, -5], '2C'),
      verdict: c([0, -4], 'pass'),
    },
    links: [
      ['ticket', null, 'door'],
      ['s1', null, 'm1', 'dealer'], ['s2', null, 'm2', 'dealer'],
      ['s3', null, 'm3', 'dealer'], ['s4', null, 'm4', 'dealer'],
      ['markers', 'out', 'champ', 'dealer'],
      ['aces', null, 'toAce', 'dealer'], ['twos', null, 'toTwo', 'dealer'],
      ['verdict', 'out', 'gate', 'dealer'],
      ['door', ['dwin', 'dlose'], 'dup'], ['dup', 'a', 'gate'], ['dup', 'b', 'k2'],
      ['k2', 'no', 'm1'], ['k2', 'yes', 'k3'], ['k3', 'no', 'm2'], ['k3', 'yes', 'k4'],
      ['k4', 'no', 'm3'], ['k4', 'yes', 'm4'],
      ['m1', ['dwin', 'dlose'], 'markers'], ['m2', ['dwin', 'dlose'], 'markers'],
      ['m3', ['dwin', 'dlose'], 'markers'], ['m4', ['dwin', 'dlose'], 'markers'],
      ['champ', ['win', 'dwin'], 'loop'], ['loop', 'out', 'champ'], ['seed', null, 'loop'],
      ['champ', 'dlose', 'toAce'], ['champ', 'lose', 'toTwo'],
      ['toAce', ['dwin', 'dlose'], 'verdict'], ['toTwo', ['dwin', 'dlose'], 'verdict'],
      ['gate', 'win', 'desk'], ['gate', ['dwin', 'dlose'], 'door'],
    ],
  },
};

// The knockout tournament from solutions/ace-top-war.js (source at [-1, 0]
// facing east, desk at [-2, -1]). Each merge plays two piles with top-card
// War and stacks the winner on the loser; `low` swaps the ports so the
// loser goes on top instead, which brings the lowest card up. The final War
// plays the top card against a king (any ace) or a 5 (lowest beats 5).
function knockout(low) {
  const merge = (at, dealer, win, lose) => (low
    ? twar(at, { dealer, out: { win: lose, dwin: lose, lose: win, dlose: win } })
    : twar(at, { dealer, out: { win, dwin: win, lose, dlose: lose } }));
  const gather = (at, under, out) => c(at, 'gather', { under, out: { out } });
  return [
    c([0, 0], 'deal', { out: { to: [NW, NE, E, SE, SW] } }),
    pass([0, -1], E),
    merge([1, -1], W, E, NE), gather([2, -1], NW, SW), pass([2, -2], SE),
    merge([1, 0], W, SE, E), gather([1, 1], NE, W), pass([2, 0], SW),
    merge([0, 1], NW, SW, SE), gather([-1, 2], E, NW), pass([0, 2], W),
    merge([-1, 1], NE, W, SW), gather([-2, 1], SE, NW), pass([-2, 2], NW),
    shoe([-3, 0], low ? '5S' : 'KS', { out: E }),
    twar([-2, 0], { dealer: W, out: { win: NW } }),
  ];
}
