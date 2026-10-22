// Reference-solution recipes for chapter 3 (clubs). Regenerate with
// `node tools/write-solutions.js clubs [--par]`.
import { E, SE, SW, W, NW, NE, c, pass, war, twar, shoe } from './shared.js';

// A knockout merge: the winning hand (player's or dealer's) one way, the
// losing one another.
const merge = (win, lose) => ({ win, dwin: win, lose, dlose: lose });

export const SPECS = {
  'upper-hand': {
    // The original plays the copy's top two cards; ties go to the house, so
    // the hands that lose are the ones to pay. (Cutting the hand itself and
    // playing the halves against each other also works.)
    cells: [
      c([-1, 0], 'duplicate', { out: { a: E, b: NE } }),
      c([0, -1], 'cut', { out: { top: SE } }),
      war([0, 0], { dealer: NW, out: { lose: E } }), pass([1, 0], E),
    ],
  },
  'high-spade': {
    // The copy's spades, plus a 2 of spades so the pile is never empty, are
    // the dealer's hand.
    cells: [
      c([-2, 0], 'duplicate', { out: { a: E, b: NE } }),
      shoe([-2, -1], '2S', { out: E }), c([-1, -1], 'gather', { out: { out: E } }),
      c([0, -1], 'suits', { out: { S: SW } }),
      war([-1, 0], { dealer: NE, out: { lose: E } }), pass([0, 0], E),
    ],
  },
  'top-pair': {
    cells: [
      c([-2, 0], 'kind', { n: 2, out: { yes: E } }),
      c([-1, 0], 'duplicate', { out: { a: E, b: NE } }),
      c([0, -1], 'set', { out: { set: SE } }),
      war([0, 0], { dealer: NW, out: { lose: E } }), pass([1, 0], E),
    ],
  },
  'new-rules': {
    cells: [
      shoe([-1, -1], 'TC', { out: SE }), twar([-1, 0], { dealer: NW, out: { win: E } }),
      pass([0, 0], E), pass([1, 0], E),
    ],
  },
  'bottom-dealer': {
    // On four cards a cut only swaps the halves; two in-shuffles bring the
    // bottom card to the top (so does an in-shuffle and a completed cut).
    cells: [
      c([-2, 0], 'inshuffle', { out: { out: E } }), c([-1, 0], 'inshuffle', { out: { out: E } }),
      shoe([0, -1], 'TC', { out: SE }), twar([0, 0], { dealer: NW, out: { win: E } }), pass([1, 0], E),
    ],
  },
  'fourth-street': {
    // An in-shuffle and a completed cut bring the 4th card up; cuts alone
    // need four.
    cells: [
      c([-2, 0], 'inshuffle', { out: { out: E } }), c([-1, 0], 'cut', { out: { top: E, bottom: E } }),
      shoe([0, -1], 'TC', { out: SE }), twar([0, 0], { dealer: NW, out: { win: E } }), pass([1, 0], E),
    ],
  },
  'second-fiddle': {
    // The out-shuffle gives [a d b e c]; cut, and the halves' top cards are
    // a and b. The winner and the dealer's losing half stack up for the desk.
    cells: [
      c([-2, 0], 'outshuffle', { out: { out: E } }), c([-1, 0], 'cut', { out: { top: E, bottom: NE } }),
      pass([0, -1], SE), twar([0, 0], { dealer: NW, out: { win: E, dlose: E } }),
    ],
  },
  knockout: {
    // Deal into five single cards and play a knockout. Each merge is a War
    // and a gather: the winning card (either hand) goes straight to the
    // gather, the loser round a pass to its under side, so the better top
    // card stays on top. After four merges the best card is on top for a
    // final War against a king.
    cells: [
      c([0, 0], 'deal', { out: { to: [SE, SW, E, NE, NW] } }),
      pass([-1, 1], E), twar([0, 1], { dealer: W, out: merge(E, SE) }),
      pass([0, 2], NE), c([1, 1], 'gather', { under: SW, out: { out: NW } }),
      twar([1, 0], { dealer: W, out: merge(NE, E) }),
      pass([2, 0], NW), c([2, -1], 'gather', { under: SE, out: { out: W } }),
      twar([1, -1], { dealer: SW, out: merge(NW, NE) }),
      pass([2, -2], W), c([1, -2], 'gather', { under: E, out: { out: W } }),
      pass([0, -1], NW), twar([0, -2], { dealer: SE, out: merge(W, NW) }),
      pass([0, -3], SW), c([-1, -2], 'gather', { under: NE, out: { out: SE } }),
      shoe([-2, 0], 'KC', { out: NE }), twar([-1, -1], { dealer: SW, out: { win: W } }),
    ],
  },
  'low-ball': {
    // Each card in turn plays a 5 from its own shoe. A completed cut between
    // the Wars brings the next card up (on five cards it rotates by two, so
    // all five get their turn).
    cells: [
      shoe([-2, -1], '5C', { out: SE }), twar([-2, 0], { dealer: NW, out: { win: NE } }),
      c([-1, -1], 'cut', { out: { top: SE, bottom: SE } }),
      shoe([-2, 1], '5C', { out: NE }), twar([-1, 0], { dealer: SW, out: { win: SE } }),
      c([-1, 1], 'cut', { out: { top: NE, bottom: NE } }),
      shoe([0, -1], '5C', { out: SE }), twar([0, 0], { dealer: NW, out: { win: NE } }),
      c([1, -1], 'cut', { out: { top: SE, bottom: SE } }),
      shoe([0, 1], '5C', { out: NE }), twar([1, 0], { dealer: SW, out: { win: SE } }),
      c([1, 1], 'cut', { out: { top: NE, bottom: NE } }),
      shoe([2, 1], '5C', { out: NW }), twar([2, 0], { dealer: SE, out: { win: E } }),
    ],
  },
  'every-other': {
    // Deal the copy's 1st and 3rd cards to the gate and the others onto the
    // floor (an in-shuffle and a cut also isolate them).
    cells: [
      c([-1, 0], 'duplicate', { out: { a: E, b: NE } }),
      c([0, -1], 'deal', { out: { to: [SE, NE, SE, NE, NE] } }),
      war([0, 0], { dealer: NW, out: { lose: E } }), pass([1, 0], E),
    ],
  },
  'bottom-pair': {
    // The copy's bottom two cards meet a pair test; yes releases a 2, no an
    // ace, and the original plays that card at the gate.
    cells: [...dupAt([-1, -1], SE), c([-1, 0], 'deal', { out: { to: [W, W, W, E, E] } }),
      c([0, 0], 'kind', { n: 2, out: { yes: NE, no: E } }), ...verdicts()],
  },
  'small-pairs': {
    // A pair (or two) and nothing bigger; then the copy's set plays a 6.
    // The 6 it loses to (good) releases a 2, the 6 it beats an ace.
    cells: [
      c([-3, -1], 'kind', { n: 2, out: { yes: E } }), c([-2, -1], 'kind', { n: 3, out: { no: E } }),
      ...dupAt([-1, -1], SE), c([-1, 0], 'set', { out: { set: E } }),
      shoe([0, 1], '6C', { out: NW }), war([0, 0], { dealer: SE, out: { dwin: NE, dlose: E } }),
      ...verdicts(),
    ],
  },
  'two-pair': {
    // Nothing bigger than pairs; the copy's set loses its first card to the
    // floor, and what's left still holds a pair only if there were two.
    cells: [
      c([-2, -1], 'kind', { n: 3, out: { no: E } }),
      ...dupAt([-1, -1], SE), c([-1, 0], 'set', { out: { set: SE } }),
      c([-1, 1], 'deal', { out: { to: [W, NE, NE, NE] } }),
      c([0, 0], 'kind', { n: 2, out: { yes: NE, no: E } }), ...verdicts(),
    ],
  },
};

// A duplicate at `at` sending its copy to `copy` and the original along the
// top row to the gate at [2, -2].
function dupAt(at, copy) {
  return [c(at, 'duplicate', { out: { a: NE, b: copy } }), pass([0, -2], E), pass([1, -2], E)];
}

// The verdict: whatever arrives at [1, -1] releases a 2 and whatever arrives
// at [1, 0] an ace; both routes are one War and one shared pass long, so
// verdicts keep their order. The gate pays the original if it beats its
// verdict card.
function verdicts() {
  return [
    shoe([0, -1], '2C', { out: E }), war([1, -1], { dealer: W, out: { dwin: E, dlose: E } }),
    shoe([1, 1], 'AC', { out: NW }), war([1, 0], { dealer: SE, out: { dwin: NE, dlose: NE } }),
    pass([2, -1], NW), war([2, -2], { dealer: SE, out: { win: E } }),
  ];
}
