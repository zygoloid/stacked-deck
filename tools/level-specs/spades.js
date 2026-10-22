// Reference-solution recipes for chapter 4 (spades). PLACEHOLDER: the
// surviving recipes from the 25-level campaign. Regenerate with
// `node tools/write-solutions.js spades [--par]`.
import { E, SE, SW, W, NW, NE, c, pass, war, shoe } from './shared.js';

export const SPECS = {
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
