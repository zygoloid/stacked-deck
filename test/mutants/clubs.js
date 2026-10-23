// Mutants and door levels for chapter 3 (clubs). See test/mutants/shared.js.
import { rankOf, suitOf, rankValue, largestSet } from '../../src/cards.js';
import { hv, high, low, has, countsOf, setOf } from './shared.js';

const spades = (h) => h.filter((c) => suitOf(c) === 'S');
const rv = (c) => rankValue(c);
const highIn = (h, idx) => Math.max(...idx.map((i) => hv(h[i])));
const pairedRanks = (h) => setOf(h).map(hv);

export const MUTANTS = {
  'upper-hand': {
    'top card only': (h) => hv(h[0]) >= high(h),
    'strictly highest': (h) => highIn(h, [0, 1]) > highIn(h, [2, 3, 4]),
    'top three': (h) => highIn(h, [0, 1, 2]) >= high(h),
    'aces low': (h) => Math.max(rv(h[0]), rv(h[1])) >= Math.max(...h.map(rv)),
    'bottom two': (h) => highIn(h, [3, 4]) >= high(h),
  },
  'high-spade': {
    'any spade': (h) => spades(h).length > 0,
    'strictly highest': (h) => spades(h).length > 0 && high(spades(h)) > high(h.filter((c) => suitOf(c) !== 'S')),
    'aces low': (h) => spades(h).length > 0 && Math.max(...spades(h).map(rv)) >= Math.max(...h.map(rv)),
  },
  'top-pair': {
    'any pair': (h) => largestSet(h) >= 2,
    'highest card paired': (h) => h.filter((c) => hv(c) === high(h)).length >= 2,
    'no pair counts': (h) => high(setOf(h)) === high(h),
  },
  'new-rules': { 'high card': (h) => high(h) > 10, 'ties pay': (h) => hv(h[0]) >= 10 },
  'bottom-dealer': {
    'top card': (h) => hv(h[0]) > 10, 'high card': (h) => high(h) > 10, 'ties pay': (h) => hv(h[3]) >= 10,
    'second from bottom': (h) => hv(h[2]) > 10, 'second card': (h) => hv(h[1]) > 10,
  },
  // Expected-payout floors: mutants are (inputs) => payouts.
  'upside-down': {
    'unchanged': (t) => t,
    'bottom card to the top': (t) => t.map((h) => [h[4], ...h.slice(0, 4)]),
    'top card to the bottom': (t) => t.map((h) => [...h.slice(1), h[0]]),
    'ends swapped': (t) => t.map((h) => [h[4], ...h.slice(1, 4), h[0]]),
  },
  'second-fiddle': {
    'beats the bottom card': (h) => hv(h[0]) > hv(h[4]), 'ties pay': (h) => hv(h[0]) >= hv(h[1]),
    'aces low': (h) => rv(h[0]) > rv(h[1]), 'second beats top': (h) => hv(h[1]) > hv(h[0]),
    'beats the third card': (h) => hv(h[0]) > hv(h[2]), 'top card highest': (h) => hv(h[0]) >= high(h),
  },
  knockout: {
    'top card ace': (h) => rankOf(h[0]) === 'A', 'king or better': (h) => high(h) >= 13,
    'ace in the top two': (h) => has(h.slice(0, 2), 'A'),
  },
  'low-ball': {
    'ties pay': (h) => low(h) >= 5, 'aces low': (h) => Math.min(...h.map(rv)) > 5,
    'top card': (h) => hv(h[0]) > 5, 'high card': (h) => high(h) > 5,
    'four of five': (h) => h.filter((c) => hv(c) > 5).length >= 4,
  },
  'ace-count': {
    'once per hand with an ace': (t) => t.filter((h) => has(h, 'A')),
    'the aces themselves': (t) => t.filter((h) => has(h, 'A')).map((h) => h.filter((c) => rankOf(c) === 'A')),
    'each ace on its own': (t) => t.flatMap((h) => h.filter((c) => rankOf(c) === 'A').map((c) => [c])),
    'top card ace only': (t) => t.filter((h) => rankOf(h[0]) === 'A'),
    'kings count too': (t) => t.flatMap((h) => h.filter((c) => 'AK'.includes(rankOf(c))).map(() => h)),
  },
  'bottom-pair': {
    'top pair': (h) => rankOf(h[0]) === rankOf(h[1]), 'any pair': (h) => largestSet(h) >= 2,
    'pair in the bottom three': (h) => largestSet(h.slice(2)) >= 2,
    'bottom card paired anywhere': (h) => h.slice(0, 4).some((c) => rankOf(c) === rankOf(h[4])),
    'exactly a pair at the bottom': (h) => rankOf(h[3]) === rankOf(h[4]) && h.filter((c) => rankOf(c) === rankOf(h[4])).length === 2,
  },
  'small-pairs': {
    'any pair': (h) => largestSet(h) === 2, '7 or lower': (h) => largestSet(h) === 2 && Math.max(...pairedRanks(h)) <= 7,
    'some paired card 6 or lower': (h) => largestSet(h) === 2 && Math.min(...pairedRanks(h)) <= 6,
    'trips count': (h) => largestSet(h) >= 2 && largestSet(h) <= 3 && Math.max(...pairedRanks(h)) <= 6,
    'aces low': (h) => largestSet(h) === 2 && Math.max(...setOf(h).map(rv)) <= 6,
    'one pair only': (h) => countsOf(h) === '1,1,1,2' && Math.max(...pairedRanks(h)) <= 6,
  },
  'two-pair': {
    'two pair or better': (h) => ['1,2,2', '2,3', '1,4'].includes(countsOf(h)),
    'pair or better': (h) => largestSet(h) >= 2, 'one pair': (h) => countsOf(h) === '1,1,1,2',
    'two pair or full house': (h) => ['1,2,2', '2,3'].includes(countsOf(h)),
    'largest set a pair': (h) => largestSet(h) === 2,
  },
};

export const DOOR = [];
