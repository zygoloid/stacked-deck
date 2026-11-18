// Reference-solution recipes for chapter 2 (diamonds). Regenerate with
// `node tools/write-solutions.js diamonds [--par]`.
import { E, SE, SW, W, NW, NE, c, pass, war, shoe } from './shared.js';

export const SPECS = {
  'high-card': { cells: [shoe([-1, -1], '9C', { out: SE }), war([-1, 0], { dealer: NW, out: { win: E } })] },
  'small-stakes': {
    // Only an ace beats a king; the rest play a 4, and lose to it if they are
    // 4 or lower (a 4 ties, and ties go to the house).
    cells: [
      shoe([-1, -1], 'KC', { out: SE }), war([-1, 0], { dealer: NW, out: { win: NE, lose: E } }),
      shoe([0, 1], '4C', { out: NW }), war([0, 0], { dealer: SE, out: { lose: NW } }),
    ],
  },
  'face-off': {
    // Gather the twins' cards; a pair is a tie and drops. Otherwise cut them
    // apart again and play them against each other: the winner, whichever
    // side it played, goes to the desk.
    cells: [
      c([-1, 0], 'gather', { out: { out: E } }), c([0, 0], 'kind', { n: 2, out: { no: E } }),
      c([1, 0], 'cut', { out: { top: E, bottom: SE } }), pass([1, 1], NE),
      war([2, 0], { dealer: SW, out: { win: E, dwin: E } }),
    ],
  },
  'red-flush': {
    nodes: { fl: c([-1, 0], 'flush'), su: c([0, 0], 'suits') },
    links: [['fl', 'yes', 'su'], ['su', ['H', 'D'], 'desk']],
  },
  'small-change': {
    // A king beats a queen but not a king; the ace of spades then beats it,
    // and goes to the desk while the king drops (by the desk, so the ace is
    // paid in the same round as the last king leaves the floor).
    cells: [
      war([-2, 0], { dealer: NW, out: { win: E } }), shoe([-2, -1], 'QC', { out: SE }),
      war([-1, 0], { dealer: NW, out: { lose: E } }), shoe([-1, -1], 'KC', { out: SE }),
      war([0, 0], { dealer: NW, out: { dwin: E } }), shoe([0, -1], 'AS', { out: SE }),
    ],
  },
  'high-suit': {
    // A suited hand is cut in two and the halves play each other; the winner
    // goes to the desk whichever side it played.
    cells: [
      c([-1, 0], 'flush', { out: { yes: E } }), c([0, 0], 'cut', { out: { top: E, bottom: SE } }), pass([0, 1], NE),
      war([1, 0], { dealer: SW, out: { win: E, dwin: E } }),
    ],
  },
  'natural': {
    // Pairs are dropped (two aces), and the hand must beat a king (it holds
    // an ace). Then a jack, a queen and a king are gathered underneath:
    // [ace, x, J, Q, K] is a straight only when x is a 10, and holds a pair
    // only when x is a J, Q or K. A cut takes the three cards off the bottom.
    // (The War's king, stacked under the winning hand with both ports one
    // way, can be one of the three: 10.)
    cells: [
      c([-3, 0], 'kind', { n: 2, out: { no: E } }),
      war([-2, 0], { dealer: NW, out: { win: E } }), shoe([-2, -1], 'KC', { out: SE }),
      c([-1, 0], 'gather', { under: NW, out: { out: E } }), shoe([-1, -1], 'JC', { out: SE }),
      c([0, 0], 'gather', { under: NW, out: { out: E } }), shoe([0, -1], 'QC', { out: SE }),
      c([1, 0], 'gather', { under: NW, out: { out: SE } }), shoe([1, -1], 'KD', { out: SE }),
      c([1, 1], 'straight', { out: { yes: W, no: SW } }),
      c([0, 2], 'kind', { n: 2, out: { yes: NW } }),
      c([0, 1], 'cut', { out: { top: W } }),
    ],
  },
  'low-kicker': {
    // The hand beats a 7 (its high card is above 7, so with a bottom card of
    // 7 or lower it is the top card that does); then its bottom card must not
    // beat another 7. One 7 can do both jobs: the 7 the hand beat comes out
    // of the first War (dlose) as the second War's dealer, with the cut in
    // between instead of a second shoe; that is a croupier fewer, and slower.
    cells: [
      shoe([-1, -1], '7C', { out: SE }), war([-1, 0], { dealer: NW, out: { win: E } }),
      c([0, 0], 'cut', { out: { bottom: SW } }),
      shoe([-2, 1], '7D', { out: E }), war([-1, 1], { dealer: W, out: { lose: E } }),
    ],
  },
  'crossed-wires': {
    // A crossover network: each pair of streams crosses at a War with the
    // player's hand sent one way and the dealer's the other, win or lose.
    // A crosses B, then C, then B and C cross; every War pairs one hand of
    // each, which works because the players have the same number of hands.
    cells: [
      pass([-1, -2], SE), pass([-2, 0], NE),
      war([-1, -1], { dealer: SW, out: { win: SE, lose: SE, dwin: E, dlose: E } }),
      pass([-3, 2], NE), pass([-2, 1], NE),
      war([-1, 0], { dealer: SW, out: { win: SE, lose: SE, dwin: E, dlose: E } }),
      pass([-1, 1], SE), pass([-1, 2], E), pass([0, 2], E),
      pass([0, -1], SE),
      war([0, 0], { dealer: W, out: { win: E, lose: E, dwin: NE, dlose: NE } }),
      pass([1, 0], E), pass([1, -1], NE), pass([2, -2], E),
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
  'pecking-order': {
    // Cut the hand into its three cards; compare the bottom two (winner one
    // way, loser the other, whichever side each played), then the top card
    // with the lower of those: the loser is the lowest card. The winner plays
    // the higher of the first pair, with all four ports one way, so the stack
    // comes out highest on top; a gather puts the lowest card underneath.
    cells: [
      c([-1, 0], 'cut', { out: { top: E, bottom: SE } }),
      c([-1, 1], 'cut', { out: { top: E, bottom: SE } }), pass([-1, 2], NE),
      war([0, 1], { dealer: SW, out: { win: NE, dwin: NE, lose: NW, dlose: NW } }),
      war([0, 0], { dealer: SE, out: { win: E, dwin: E, lose: NE, dlose: NE } }),
      war([1, 0], { dealer: SW, out: { win: NW, dwin: NW, lose: NW, dlose: NW } }),
      c([1, -1], 'gather', { under: SW, out: { out: E } }),
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
