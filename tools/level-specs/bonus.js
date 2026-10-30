// Reference-solution recipes for the bonus deck. Regenerate with
// `node tools/write-solutions.js bonus [--par]`.
import { E, SE, SW, W, NW, NE, c, pass, war, twar, shoe } from './shared.js';
import { RANKS } from '../../src/cards.js';

const SUITED = ['S', 'D', 'C', 'H'];
const at = ([q, r], [dq, dr]) => [q + dq, r + dr];

// Twice Shy (see the recipe's comment below): node positions and links.
function twiceShy() {
  // The store along the top, ending next to the first tester.
  const nodes = {
    M: pass([-2, -4], E), J: shoe([-1, -5], '?', { out: SW, once: true }),
    MK: c([-1, -4], 'gather', { under: SE, out: { out: E } }), S$: shoe([-1, -3], '$', { out: NW }),
    ST: c([0, -4], 'gather', { under: SE, out: { out: E } }),
    T: twar([1, -4], { dealer: NW, out: { win: E, lose: SW } }), AC: shoe([1, -5], 'AC', { out: SE }),
    BK: pass([0, -3], NW), SEED: shoe([-1, -2], '$', { out: NE, once: true }),
    D: c([2, -4], 'duplicate', { out: { a: E, b: NE } }),
    Bd: c([4, -5], 'burn', { out: { burn: E, rest: NW } }), BdP: pass([4, -6], SW), BdQ: pass([3, -5], E),
  };
  const links = [];
  // Testers down a diagonal; tester k's Suits at base + k * (-1, 3).
  const suits = ['S', 'H', 'D', 'C'];
  suits.forEach((suit, k) => {
    const [a, b] = [3 - k, -4 + 3 * k];
    const last = k === suits.length - 1;
    nodes[`Su${k}`] = c([a, b], 'suits', { out: { [suit]: E, ...Object.fromEntries(suits.slice(k + 1).map((x) => [x, SE])) } });
    nodes[`Dup${k}`] = c([a + 1, b], 'duplicate', { out: { a: W, b: NE } });
    nodes[`G${k}`] = c([a + 2, b - 1], 'gather', { under: SW, out: { out: SE } });
    nodes[`Fl${k}`] = c([a + 2, b], 'flush', { out: { yes: SW, no: SE } });
    nodes[`K${k}`] = c([a + 1, b + 1], 'kind', { n: 3, out: { no: E } });
    nodes[`Bu${k}`] = c([a + 2, b + 1], 'burn', { out: { burn: SW } });
    if (!last) Object.assign(nodes, { [`Ch${k}`]: pass([a, b + 1], SW), [`Ci${k}`]: pass([a - 1, b + 2], SE) });
  });
  // The assembler (as in Last In, First Out), below the last tester.
  Object.assign(nodes, {
    AG: c([1, 7], 'gather', { under: SW, out: { out: W } }),
    AT: twar([0, 7], { dealer: NW, out: { win: SE, lose: W } }), A$$: shoe([0, 6], '$$', { out: SE }),
    AP: pass([0, 8], NE), AS: shoe([1, 8], '$', { out: W, once: true }),
    ABu: c([-1, 7], 'burn', { out: { burn: SE, rest: W } }), AP2: pass([-1, 8], E),
    SuF: c([-2, 7], 'suits', { out: { S: W, H: W, D: W, C: W } }),
  });
  return { nodes, links };
}

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
      c([-1, 0], 'gather', { under: NW, out: { out: SE } }), shoe([-1, -1], '?', { out: SE }),
      c([-1, 1], 'straight', { out: { yes: W } }),
      c([-2, 1], 'suits', { out: { S: SE, H: SE, D: SE, C: SE } }),
    ],
  },
  'three-apart': {
    // As Two Apart, one joker further: not a run with one joker, a run with two.
    cells: [
      c([-2, 0], 'gather', { under: NW, out: { out: E } }), shoe([-2, -1], '?', { out: SE }),
      c([-1, 0], 'straight', { out: { no: E } }),
      c([0, 0], 'gather', { under: NW, out: { out: SE } }), shoe([0, -1], '?', { out: SE }),
      c([0, 1], 'straight', { out: { yes: W } }),
      c([-1, 1], 'suits', { out: { S: SW, H: SW, D: SW, C: SW } }),
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
      c([-1, 0], 'cut', { out: { bottom: SW, top: NW } }),
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
      c([-3, 0], 'duplicate', { out: { a: E, b: NE } }),
      c([-2, 0], 'gather', { under: SW, out: { out: E } }), shoe([-3, 1], '?', { out: NE }),
      pass([-2, -1], E), pass([-1, -1], SE),
      c([-1, 0], 'gather', { under: NW, out: { out: E } }),
      c([0, 0], 'burn', { out: { burn: E, rest: SE } }), pass([1, 0], SW),
      twar([0, 1], { dealer: NW, out: { dwin: W } }),
      twar([-1, 1], { dealer: SE, out: { win: W, lose: NE } }), shoe([-1, 2], 'AC', { out: NW }),
      c([-2, 1], 'burn', { out: { rest: SW } }),
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
      c([-4, 0], 'duplicate', { out: { a: SE, b: NE } }),
      c([-3, -1], 'duplicate', { out: { a: E, b: NE } }), pass([-2, -2], SE),
      c([-2, -1], 'gather', { under: NW, out: { out: E } }),
      c([-1, -2], 'hand', { n: 12, out: { out: SE } }),
      shoe([0, -3], ['6S', '5S', '4S', '3S', '2S', 'AS', '$', '$', '$', '$', '$', '$'], { out: SW }),
      c([-1, -1], 'gather', { under: NW, out: { out: E } }),
      c([0, -1], 'cut', { out: { bottom: E, top: NE } }), pass([1, -2], SE),
      twar([1, -1], { dealer: W, out: { dwin: E, lose: NE, win: SE } }), pass([2, -2], SE),
      twar([2, -1], { dealer: NW, out: { dlose: SW, lose: SE } }),
      c([2, 0], 'suits', { out: { misc: W, S: E, H: E, D: E, C: E } }),
      pass([1, 0], SW), pass([0, 1], W), pass([-1, 1], W), pass([-2, 1], W), pass([-3, 1], W),
      war([-4, 1], { dealer: E, out: { win: SE } }),
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
      pass([4, 0], SW), pass([3, 1], W), pass([2, 1], W), pass([1, 1], W), pass([0, 1], W), pass([-1, 1], W),
      pass([-2, 1], W),
      war([-3, 1], { dealer: NW, out: { dwin: SE } }),
      c([-3, 2], 'cut', { out: { top: W, bottom: SW } }), pass([-4, 3], NW),
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
      // the sorter, along the top
      c([-5, -4], 'gather', { under: SW, out: { out: E } }),
      c([-4, -4], 'hand', { n: 3, out: { out: E } }),
      c([-3, -4], 'deal', { out: { to: [E, NE, SE] } }), pass([-2, -5], SE), pass([-3, -3], E),
      war([-2, -4], { dealer: NW, out: { win: E, dwin: E, lose: SE, dlose: SE } }),
      war([-2, -3], { dealer: W, out: { win: NE, dwin: NE, lose: SE, dlose: SE } }),
      war([-1, -4], { dealer: SW, out: { win: E, dwin: E, lose: SE, dlose: SE } }), pass([-1, -3], NE),
      c([0, -4], 'gather', { under: SW, out: { out: E } }),
      pass([-2, -2], E), pass([-1, -2], E), pass([0, -2], NE), pass([1, -3], NW),
      c([1, -4], 'gather', { under: SE, out: { out: E } }),
      c([2, -4], 'hand', { n: 6, out: { out: SE } }),
      pass([2, -3], SE), pass([2, -2], SW), pass([1, -1], SE),
      c([1, 0], 'cut', { out: { top: W, bottom: SW } }), pass([0, 1], NW),
      // stage 1
      twar([0, 0], { dealer: SE, out: { win: NW, dwin: W, lose: SW } }), pass([-1, 1], NW),
      twar([-1, 0], { dealer: SE, out: { win: NW, dwin: W, lose: SW } }),
      c([-2, 0], 'burn', { out: { burn: SW, rest: SW } }), c([-2, 1], 'burn', { out: { burn: W, rest: W } }),
      // stage 2
      twar([-3, 1], { dealer: E, out: { win: NW, dwin: W, lose: SW } }), pass([-4, 2], NW),
      twar([-4, 1], { dealer: SE, out: { win: NW, dwin: W, lose: SW } }),
      c([-5, 1], 'burn', { out: { burn: SW, rest: SW } }), c([-5, 2], 'burn', { out: { burn: W, rest: W } }),
      // stage 3
      twar([-6, 2], { dealer: E, out: { win: NW, dwin: W, lose: SW } }), pass([-7, 3], NW),
      twar([-7, 2], { dealer: SE, out: { win: NW } }),
      // to the desk
      pass([0, -1], W), pass([-1, -1], W), pass([-2, -1], SW), pass([-3, 0], W), pass([-4, 0], W),
      pass([-5, 0], SW), pass([-6, 1], W), pass([-7, 1], NW), pass([-7, 0], NW),
    ],
  },
  'last-in-first-out': {
    // A pass prefers the player's side to a `once` joker's, so the joker
    // only gets through after the last hand. Each hand is gathered onto a
    // `$` marker and pushed onto a stack (seeded with a `$`); a top-card War
    // against an ace sends the stack round again until the joker is on top.
    // Then the joker is burned and the stack is dealt off a card at a time
    // (Burn in a loop) onto a growing hand; when a marker comes up (a
    // top-card War against `$$` only ties on an advertising card), Burn
    // takes it off to start the next hand, and Suits drops the old marker
    // on the way to the desk.
    cells: [
      pass([-2, 0], E), shoe([-2, -1], '?', { out: SE, once: true }),
      c([-1, 0], 'gather', { under: NW, out: { out: E } }), shoe([-1, -1], '$', { out: SE }),
      c([0, 0], 'gather', { under: SE, out: { out: E } }),
      twar([1, 0], { dealer: NW, out: { lose: SW, win: E } }), shoe([1, -1], 'AC', { out: SE }),
      pass([0, 1], NW), shoe([-1, 1], '$', { out: E, once: true }),
      c([2, 0], 'burn', { out: { rest: SE } }),
      c([2, 1], 'burn', { out: { burn: SW, rest: E } }), pass([3, 1], W),
      c([1, 2], 'gather', { under: SW, out: { out: W } }),
      twar([0, 2], { dealer: NE, out: { win: SE, lose: W } }), shoe([1, 1], '$$', { out: SW }),
      pass([0, 3], NE), shoe([1, 3], '$', { out: W, once: true }),
      c([-1, 2], 'burn', { out: { burn: SE, rest: W } }), pass([-1, 3], E),
      c([-2, 2], 'suits', { out: { S: W, H: W, D: W, C: W } }),
    ],
  },
  'one-up': {
    // Two shoes in step deal each card and the next one up in its suit
    // (A..K and 2..A, suit by suit); a gather pairs them, and the card
    // waiting in the loop takes the next pair on top of it. N of a kind and
    // Flush keep [card, x, y] only if the card is x or y; a Deal sets x
    // aside and a second K2 tells x (pay y: Burn) from y (go round again).
    // Everything else burns the waiting card back into the loop (Burn's
    // rest keeps the player's own card when it matched y). One card at a
    // time: a War lets the next card in when the last one is paid.
    cells: [
      war([-1, 1], { dealer: SE, out: { win: E, lose: E } }),
      pass([-1, 2], NW), shoe([-2, 2], '$', { out: E, once: true }),
      c([0, 1], 'pass', { out: { out: NW } }),
      c([0, 0], 'gather', { under: NE, out: { out: E } }),
      c([1, -1], 'gather', { under: NE, out: { out: SW } }),
      shoe([1, -2], SUITED.flatMap((s) => RANKS.map((r) => r + s)), { out: SE }),
      shoe([2, -2], SUITED.flatMap((s) => RANKS.map((r, i) => RANKS[(i + 1) % 13] + s)), { out: SW }),
      c([1, 0], 'kind', { n: 2, out: { yes: E, no: SE } }),
      c([2, 0], 'flush', { out: { yes: SE, no: SW } }),
      c([2, 1], 'deal', { out: { to: [SW, E, SW] } }),
      c([1, 2], 'kind', { n: 2, out: { no: SW, yes: W } }),
      c([1, 1], 'burn', { out: { burn: W } }),
      c([0, 2], 'burn', { out: { rest: NW } }),
      pass([0, 3], W),
      c([-1, 3], 'burn', { out: { burn: W, rest: NW } }),
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
  'uneven-tables': {
    // Tag A's hands with a joker on top and C's with an advertising card,
    // merge the three streams, and sort them out with two top-card Wars:
    // only the joker beats an ace, and only the advertising card fails to
    // beat another. Burn takes the tags off again.
    cells: [
      c([-1, -2], 'gather', { under: W, out: { out: SE } }), shoe([-1, -3], '?', { out: SE }),
      c([-3, 2], 'gather', { under: W, out: { out: NE } }), shoe([-3, 3], '$', { out: NW }),
      pass([-2, 0], E), pass([-1, -1], SE), pass([-2, 1], NE),
      twar([-1, 0], { dealer: SE, out: { win: E, lose: NE } }), shoe([-1, 1], 'AS', { out: NW }),
      c([0, 0], 'burn', { out: { rest: SE } }), pass([0, 1], SE), pass([0, 2], E),
      twar([0, -1], { dealer: NW, out: { win: E, lose: NE } }), shoe([0, -2], '$', { out: SE }),
      pass([1, -1], SE), pass([1, 0], E),
      c([1, -2], 'burn', { out: { rest: E } }), pass([2, -2], E),
    ],
  },

  'rest-of-the-deck': {
    // A shoe deals the whole deck and then a joker, but a pass prefers the
    // player's side, so the deck follows the last hand and the joker comes
    // last of all. Everything is stacked (on a `$` seed) until the joker is
    // on top: then each suit of the stack holds the cards played twice and
    // the others once. Split by suit, a suit with a pair (K2) loses its
    // played cards to Set (whose rest is the unplayed cards); a suit
    // without one was never played and is paid whole. Hand(1) pays them
    // one card at a time.
    cells: [
      pass([-3, 0], E), shoe([-3, -1], [...SUITED.flatMap((s) => RANKS.map((r) => r + s)), '?'], { out: SE, once: true }),
      c([-2, 0], 'gather', { under: SE, out: { out: E } }),
      twar([-1, 0], { dealer: NW, out: { win: E, lose: SW } }), shoe([-1, -1], 'AC', { out: SE }),
      pass([-2, 1], NW), shoe([-3, 1], '$', { out: E, once: true }),
      c([0, 0], 'suits', { out: { S: E, H: NE, D: SE, C: NW } }),
      pass([1, -1], SE), pass([0, 1], NE), pass([0, -1], E),
      c([1, 0], 'kind', { n: 2, out: { yes: E, no: SE } }),
      c([2, 0], 'set', { out: { rest: SW } }),
      c([1, 1], 'hand', { n: 1, out: { out: SE } }),
    ],
  },

  'twice-shy': twiceShy(),

};
