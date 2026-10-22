// Reference-solution recipes for chapter 3 (clubs). PLACEHOLDER: the
// surviving recipes from the 25-level campaign. Regenerate with
// `node tools/write-solutions.js clubs [--par]`.
import { E, SE, SW, W, NW, NE, c, pass, war, twar, shoe } from './shared.js';

export const SPECS = {
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
