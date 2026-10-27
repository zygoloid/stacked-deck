// Reference-solution recipes for the bonus deck. Regenerate with
// `node tools/write-solutions.js bonus [--par]`.
import { E, SE, SW, W, NW, NE, c, pass, war, twar, shoe } from './shared.js';
import { RANKS } from '../../src/cards.js';

export const SPECS = {
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
  'split-pot': {
    // Set's two piles go to the desk by different sides, so they arrive as
    // two hands rather than stacked into one.
    cells: [
      c([-2, 0], 'kind', { n: 2, out: { yes: E } }),
      c([-1, 0], 'set', { out: { set: E, rest: SE } }), pass([-1, 1], NE),
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
  'after-a-pair': {
    // Test a copy: a pair releases a 2, anything else an ace, into the
    // gate's dealer line, which a shoe seeds with an ace for the first hand;
    // so each original meets the verdict on the hand before it. One decision
    // and equal routes afterwards, so no door.
    cells: [
      c([-2, 0], 'duplicate', { out: { a: NE, b: NW } }),
      c([-2, -1], 'kind', { n: 2, out: { yes: NE, no: NW } }),
      war([-1, -2], { dealer: E, out: { dwin: NW, dlose: NW } }), shoe([0, -2], '2C', { out: W }),
      war([-2, -2], { dealer: SW, out: { dwin: NE, dlose: NE } }), shoe([-3, -1], 'AC', { out: NE }),
      pass([-1, -3], E), pass([0, -3], E), pass([1, -3], SE), pass([1, -2], SW), pass([0, -1], W),
      shoe([1, -1], 'AD', { out: W, once: true }),
      war([-1, -1], { dealer: E, out: { win: SE } }),
    ],
  },
  bookends: {
    // A copy of each hand loses its top card; its bottom card waits in the
    // gate's dealer line for the next hand, behind an ace for the first.
    cells: [
      c([-2, 0], 'duplicate', { out: { a: E, b: SE } }),
      c([-2, 1], 'burn', { out: { rest: E } }), pass([-1, 1], NW), shoe([-1, 2], 'AC', { out: NW, once: true }),
      twar([-1, 0], { dealer: SE, out: { win: E } }),
    ],
  },
  'four-of-a-kind': {
    // As in Deja Vu, the memory is a stack of the cards played so far, seeded
    // with an advertising card (which Set never counts). A new card goes on
    // top; four of a kind goes to Set, whose set is the four to pay, and
    // whose rest is the new memory.
    cells: [
      c([-2, 0], 'gather', { under: NE, out: { out: E } }),
      c([-1, 0], 'kind', { n: 4, out: { yes: E, no: NW } }),
      c([0, 0], 'set', { out: { set: E, rest: NW } }),
      pass([0, -1], W), pass([-1, -1], SW), shoe([0, -2], '$$', { out: SW, once: true }),
    ],
  },
  'two-apart': {
    // Not a run of two, but a run once a joker fills the gap (or an end:
    // one apart is already out); Suits then drops the joker on the way out.
    cells: [
      c([-2, 0], 'straight', { out: { no: E } }),
      c([-1, 0], 'gather', { under: NW, out: { out: E } }), shoe([-1, -1], '?', { out: SE }),
      c([0, 0], 'straight', { out: { yes: E } }),
      c([1, 0], 'suits', { out: { S: E, H: E, D: E, C: E } }),
    ],
  },
  'three-apart': {
    // As Two Apart, one joker further: not a run with one joker, a run with two.
    cells: [
      c([-2, 0], 'gather', { under: NW, out: { out: E } }), shoe([-2, -1], '?', { out: SE }),
      c([-1, 0], 'straight', { out: { no: E } }),
      c([0, 0], 'gather', { under: NW, out: { out: E } }), shoe([0, -1], '?', { out: SE }),
      c([1, 0], 'straight', { out: { yes: SE } }),
      c([1, 1], 'suits', { out: { S: NE, H: NE, D: NE, C: NE } }),
    ],
  },
  'counting-up': {
    // The rank waited for is four cards of it, gathered on top of each hand:
    // five of a kind means the hand holds one. A cut then splits the four
    // from the hand. A paid hand's four go to a War that releases the next
    // four (a Hand(4) on a shoe stacked 2222 3333 ... AAAA) and drops the
    // old; an advertising card in a `once` shoe lets the first four through.
    cells: [
      c([-3, 0], 'gather', { under: W, out: { out: E } }),
      c([-2, 0], 'kind', { n: 5, out: { yes: E, no: SW } }),
      c([-1, 0], 'cut', { out: { bottom: E, top: NW } }), pass([0, 0], E), pass([1, 0], E),
      c([-3, 1], 'cut', { out: { top: NW } }),
      pass([-1, -1], W), shoe([0, -1], '$', { out: W, once: true }),
      war([-2, -1], { dealer: E, out: { win: SW, lose: SW } }),
      c([-1, -2], 'hand', { n: 4, out: { out: SW } }),
      shoe([0, -2], RANKS.flatMap((r) => 'SHDC'.split('').map((s) => r + s)).slice(4).concat(['AS', 'AH', 'AD', 'AC']), { out: W }),
    ],
  },
  rising: {
    // Each hand goes round a loop as [hand, joker, hand]: Burn takes the top
    // card off and a top-card War checks it doesn't beat the next one (a
    // tie goes to the house, so equal ranks pass). When the joker comes up
    // it beats the ace in the second War, and a last Burn drops it, leaving
    // the hand's copy to pay.
    cells: [
      c([-3, 0], 'duplicate', { out: { a: E, b: SE } }),
      c([-2, 0], 'gather', { under: NW, out: { out: E } }), shoe([-2, -1], '?', { out: SE }),
      pass([-3, 1], E), pass([-2, 1], NE),
      c([-1, 0], 'gather', { under: SW, out: { out: E } }),
      c([0, 0], 'burn', { out: { burn: NE, rest: E } }), pass([1, -1], SE),
      twar([1, 0], { dealer: W, out: { dwin: E } }),
      twar([2, 0], { dealer: NW, out: { win: E, lose: SW } }), shoe([2, -1], 'AC', { out: SE }),
      pass([1, 1], W), pass([0, 1], NW),
      c([3, 0], 'burn', { out: { rest: E } }),
    ],
  },
  'head-count': {
    // A copy of the hand is doubled and laid on a ruler 6 5 4 3 2 A and six
    // advertising cards: cutting that in half puts the ruler card naming the
    // hand's size on top of the bottom half, and the hand's top card on top
    // of the top half. Two top-card Wars check they tie; if so the bottom
    // half's advertising cards (Suits' misc) go to the gate's dealer and the
    // hand beats them; otherwise the top half goes, and the hand can't beat
    // a stack that holds it.
    cells: [
      c([-4, 0], 'duplicate', { out: { a: E, b: NE } }),
      pass([-3, 0], E), pass([-2, 0], E), pass([-1, 0], E), pass([0, 0], SE),
      c([-3, -1], 'duplicate', { out: { a: E, b: NE } }), pass([-2, -2], SE),
      c([-2, -1], 'gather', { under: NW, out: { out: E } }),
      c([-1, -2], 'hand', { n: 12, out: { out: SE } }),
      shoe([0, -3], ['6S', '5S', '4S', '3S', '2S', 'AS', '$', '$', '$', '$', '$', '$'], { out: SW }),
      c([-1, -1], 'gather', { under: NW, out: { out: E } }),
      c([0, -1], 'cut', { out: { bottom: E, top: NE } }), pass([1, -2], SE),
      twar([1, -1], { dealer: W, out: { dwin: E, lose: NE, win: SE } }), pass([2, -2], SE),
      twar([2, -1], { dealer: NW, out: { dlose: SW, lose: SE } }),
      c([2, 0], 'suits', { out: { misc: W, S: E, H: E, D: E, C: E } }),
      pass([1, 0], SW),
      war([0, 1], { dealer: NE, out: { win: E } }),
    ],
  },
  'mirror-image': {
    // The two hands are stacked and the stack copied. Sorted into new deck
    // order, the copy of a matching deal is ten cards in identical pairs;
    // Hand(2) splits it into five pairs, and each becomes one verdict card:
    // a pair of identical cards (K2 then Flush) loses one card, any other
    // pair is swapped for a joker. Hand(5) collects the five verdicts to
    // play the stack (as dealer, so ties go its way): it can't lose to its
    // own cards, but loses to a joker. A cut splits a winning stack back
    // into the two hands. Every verdict takes the same number of rounds to
    // reach Hand(5), so the deals' verdicts never overtake each other.
    cells: [
      c([-4, 0], 'gather', { under: SW, out: { out: E } }),
      c([-3, 0], 'duplicate', { out: { a: NE, b: SE } }),
      c([-2, -1], 'sort', { out: { out: E } }),
      c([-1, -1], 'hand', { n: 2, out: { out: E } }),
      c([0, -1], 'kind', { n: 2, out: { yes: NE, no: SE } }), pass([0, 0], NE),
      c([1, -2], 'flush', { out: { yes: E, no: SE } }),
      pass([1, -1], E),
      c([2, -1], 'gather', { under: W, out: { out: E } }), shoe([2, 0], '?', { out: NW }),
      c([3, -1], 'burn', { out: { burn: E } }),
      c([2, -2], 'burn', { out: { rest: E } }), pass([3, -2], E), pass([4, -2], SE),
      c([4, -1], 'hand', { n: 5, out: { out: SE } }),
      pass([-3, 1], E), pass([-2, 1], E), pass([-1, 1], E), pass([0, 1], E), pass([1, 1], E), pass([2, 1], E),
      pass([3, 1], NE),
      war([4, 0], { dealer: SW, out: { dwin: E } }),
      c([5, 0], 'cut', { out: { top: E, bottom: SE } }), pass([5, 1], NE),
    ],
  },
  showdown: {
    // The players' hands are stacked and dealt out again one at a time
    // (Hand(3)), so one sorter serves both. It deals a hand into three
    // cards and sorts them high to low with three Wars wired as
    // compare-and-swap (both wins to one side, both losses to the other),
    // then gathers them back up. Hand(6) and a cut pair each deal's sorted
    // hands up again, and three stages of top-card Wars compare them: each
    // stage plays the hands both ways round (ties go to the house, so a win
    // either way is a strict win), pays a winner, and on a tie moves both
    // top cards to the bottom (Burn with both piles to one side) for the
    // next stage. Ties in the last stage are dropped.
    cells: [
      c([-9, 0], 'gather', { under: SW, out: { out: E } }),
      c([-8, 0], 'hand', { n: 3, out: { out: E } }),
      c([-7, 0], 'deal', { out: { to: [E, NE, SE] } }), pass([-6, -1], SE), pass([-7, 1], E),
      war([-6, 0], { dealer: NW, out: { win: E, dwin: E, lose: SE, dlose: SE } }),
      war([-6, 1], { dealer: W, out: { win: NE, dwin: NE, lose: SE, dlose: SE } }),
      war([-5, 0], { dealer: SW, out: { win: E, dwin: E, lose: SE, dlose: SE } }), pass([-5, 1], NE),
      c([-4, 0], 'gather', { under: SW, out: { out: E } }),
      pass([-6, 2], E), pass([-5, 2], E), pass([-4, 2], NE), pass([-3, 1], NW),
      c([-3, 0], 'gather', { under: SE, out: { out: E } }),
      c([-2, 0], 'hand', { n: 6, out: { out: E } }),
      c([-1, 0], 'cut', { out: { top: E, bottom: SE } }), pass([-1, 1], NE),
      // stage 1
      twar([0, 0], { dealer: SW, out: { win: NE, dwin: E, lose: SE } }), pass([0, 1], NE),
      twar([1, 0], { dealer: SW, out: { win: NE, dwin: E, lose: SE } }),
      c([2, 0], 'burn', { out: { burn: SE, rest: SE } }), c([1, 1], 'burn', { out: { burn: E, rest: E } }),
      // stage 2
      twar([2, 1], { dealer: W, out: { win: NE, dwin: E, lose: SE } }), pass([2, 2], NE),
      twar([3, 1], { dealer: SW, out: { win: NE, dwin: E, lose: SE } }),
      c([4, 1], 'burn', { out: { burn: SE, rest: SE } }), c([3, 2], 'burn', { out: { burn: E, rest: E } }),
      // stage 3
      twar([4, 2], { dealer: W, out: { win: NE, dwin: E, lose: SE } }), pass([4, 3], NE),
      twar([5, 2], { dealer: SW, out: { win: NE } }),
      // to the desk
      pass([1, -1], E), pass([2, -1], E), pass([3, -1], SE), pass([3, 0], E), pass([4, 0], E),
      pass([5, 0], SE), pass([5, 1], E), pass([6, 1], E),
    ],
  },
};
