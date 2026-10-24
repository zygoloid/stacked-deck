// Reference-solution recipes for chapter 4 (spades). Regenerate with
// `node tools/write-solutions.js spades [--par]`.
import { E, SE, SW, W, NW, NE, c, pass, war, twar, shoe } from './shared.js';

export const SPECS = {
  'hot-streak': {
    // The previous card is kept as the dealer: a copy of each card waits for
    // the next one, and a shoe dealing one ace once makes the first card lose.
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
  'burn-card': {
    // Burn with both ports to one side moves the top card to the bottom, so
    // the second card is on top for a top-card War against a 10.
    cells: [
      c([-1, 0], 'burn', { out: { burn: E, rest: E } }),
      twar([0, 0], { dealer: NW, out: { win: E } }), shoe([0, -1], 'TC', { out: SE }),
    ],
  },
  'third-time-lucky': {
    // The shoe deals its deck in order, one card per hand: two aces (no hand
    // beats one) and a 2 (every five-card hand beats it).
    cells: [
      war([-1, 0], { dealer: NW, out: { win: E } }), shoe([-1, -1], ['AC', 'AD', '2C'], { out: SE }),
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
  'the-wheel': {
    // With a 6 on top, a five-card hand is a run only for A-5 or 7-J (or
    // 2-5 with a 7, and so on); burn takes the 6 off, and of those only the
    // wheel beats a king.
    cells: [
      c([-2, 0], 'gather', { under: W, out: { out: E } }), shoe([-2, -1], '6C', { out: SE }),
      c([-1, 0], 'straight', { out: { yes: E } }),
      c([0, 0], 'burn', { out: { rest: E } }),
      war([1, 0], { dealer: NW, out: { win: E } }), shoe([1, -1], 'KC', { out: SE }),
    ],
  },
  'calling-card': {
    // Sort brings a spade to the top if there is one; burn takes the top card
    // off a copy, and the suit splitter turns it into a verdict. There is one
    // decision and both verdict routes take the same time, so no door.
    cells: [
      c([2, 0], 'duplicate', { out: { a: NW, b: E } }), pass([3, 0], NE),
      c([4, -1], 'sort', { out: { out: NW } }), c([4, -2], 'burn', { out: { burn: NW } }),
      c([4, -3], 'suits', { out: { S: SW, misc: W } }),
      war([3, -2], { dealer: SE, out: { dwin: W, dlose: W } }), shoe([3, -1], '2C', { out: NW }),
      war([3, -3], { dealer: W, out: { dwin: SW, dlose: SW } }), shoe([2, -3], 'AC', { out: E }),
      pass([2, -2], SE), war([2, -1], { dealer: NW, out: { win: W } }),
    ],
  },
  'seven-heaven': {
    // Hand(4) turns a shoe of sevens into a stack of four; on top of the
    // hand, seven of a kind means three sevens in the hand, and the cut takes
    // the four off again. (Five sevens and eight of a kind work too, slower.)
    cells: [
      shoe([-1, -2], '7C', { out: SW }), c([-2, -1], 'hand', { n: 4, out: { out: SE } }),
      c([-2, 0], 'gather', { under: W, out: { out: E } }),
      c([-1, 0], 'kind', { n: 7, out: { yes: E } }),
      c([0, 0], 'cut', { out: { bottom: E } }),
    ],
  },
  'suit-yourself': {
    // Split the cards by suit, and collect each suit in its own Hand(5): the
    // suits go S, H, D, C clockwise round the splitter from its NW side. (Only
    // the orders giving spades and hearts the two shortest routes score 9
    // rounds; par shouldn't depend on spotting that, so this plain order
    // scores 10.)
    nodes: {
      suits: c([-2, 0], 'suits'),
      hs: c([-2, -1], 'hand', { n: 5 }), hh: c([-1, -1], 'hand', { n: 5 }),
      hd: c([-1, 0], 'hand', { n: 5 }), hc: c([-2, 1], 'hand', { n: 5 }),
    },
    links: [
      ['suits', 'S', 'hs'], ['suits', 'H', 'hh'], ['suits', 'D', 'hd'], ['suits', 'C', 'hc'],
      ['hs', 'out', 'desk'], ['hh', 'out', 'desk'], ['hd', 'out', 'desk'], ['hc', 'out', 'desk'],
    ],
  },
  'change-of-heart': {
    // Hand(13) turns a shoe stacked with the hearts into a whole suit; a
    // spade on top of it makes a pair with its heart, which Set pulls out,
    // and burn drops the spade. (Burn sits by the desk: the night is over
    // as soon as the last player's card leaves the floor.)
    nodes: {
      suits: c([-2, 0], 'suits'),
      hearts: shoe([-2, -1], ['AH', '2H', '3H', '4H', '5H', '6H', '7H', '8H', '9H', 'TH', 'JH', 'QH', 'KH']),
      hand: c([-1, -1], 'hand', { n: 13 }),
      gather: c([-1, 0], 'gather'), set: c([0, 0], 'set'), burn: c([0, 1], 'burn'),
    },
    links: [
      ['hearts', null, 'hand'], ['hand', 'out', 'gather', 'under'],
      ['suits', 'S', 'gather'], ['gather', 'out', 'set'], ['set', 'set', 'burn'], ['burn', 'rest', 'desk'],
    ],
  },
  'next-in-line': {
    // Each card is duplicated: one copy goes straight to a gather, the other
    // round a pass to the gather's under side, where it waits to be the
    // previous card for the next one (a shoe that deals once seeds a 7).
    // [current, previous] goes through Straight, and the cut's top half, the
    // current card, is paid. (Duplicate with both copies one way into
    // Hand(2) makes the same windows in 5.)
    cells: [
      c([-2, 0], 'duplicate', { out: { a: E, b: SE } }),
      c([-2, 1], 'pass', { out: { out: NE } }), shoe([-3, 2], '7C', { out: NE, once: true }),
      c([-1, 0], 'gather', { under: SW, out: { out: E } }),
      c([0, 0], 'straight', { out: { yes: E } }),
      c([1, 0], 'cut', { out: { top: E } }),
    ],
  },
  'jacks-or-better': {
    // Straights, flushes and trips (or better) pay at once. A pair or two
    // pair is copied: Set and burn leave a pair only for two pair, and a lone
    // pair card must beat a 10. That releases a 2 (pay) or an ace into the
    // gate. Every route from the copy's last decision to the gate takes the
    // same time (the pass beside the second Kind matches the War against the
    // 10), so verdicts can't overtake each other and no door is needed.
    cells: [
      c([-3, 0], 'straight', { out: { yes: E, no: SE } }),
      c([-3, 1], 'flush', { out: { yes: NE, no: E } }),
      c([-2, 1], 'kind', { n: 3, out: { yes: NW, no: E } }),
      c([-1, 1], 'kind', { n: 2, out: { yes: NE } }),
      c([0, 0], 'duplicate', { out: { a: W, b: SE } }),
      c([0, 1], 'set', { out: { set: E } }), c([1, 1], 'burn', { out: { rest: NE } }),
      c([2, 0], 'kind', { n: 2, out: { yes: W, no: NW } }), pass([1, 0], NW),
      war([2, -1], { dealer: E, out: { win: W, lose: NW } }), shoe([3, -1], 'TC', { out: W }),
      war([1, -1], { dealer: W, out: { dwin: NW, dlose: NW } }), shoe([0, -1], '2C', { out: E }),
      war([2, -2], { dealer: E, out: { dwin: W, dlose: W } }), shoe([3, -2], 'AC', { out: W }),
      pass([1, -2], W), pass([0, -2], SW),
      pass([-1, 0], NW), war([-1, -1], { dealer: NE, out: { win: SW } }),
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
