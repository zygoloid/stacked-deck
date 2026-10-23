// Mutants and door levels for the bonus deck. See test/mutants/shared.js.
import { rankOf, rankValue, largestSet } from '../../src/cards.js';
import { hv, high, last, countsOf, setOf, groupBy } from './shared.js';

const rv = (c) => rankValue(c);
const highIn = (h, idx) => Math.max(...idx.map((i) => hv(h[i])));
const kings = (t) => t.filter(([c]) => rankOf(c) === 'K');

export const MUTANTS = {
  // Expected-payout floors: mutants are (inputs) => payouts.
  'small-change': {
    'pay the kings': (t) => kings(t),
    'kings and aces': (t) => t.filter(([c]) => 'AK'.includes(rankOf(c))).map(() => ['AS']),
    'ace of the same suit': (t) => kings(t).map(([c]) => ['A' + c[1]]),
    'king and ace together': (t) => kings(t).map(([c]) => [c, 'AS']),
  },
  'split-pot': {
    'whole hand': (t) => t.filter((h) => largestSet(h) >= 2),
    'set only': (t) => t.filter((h) => largestSet(h) >= 2).map((h) => setOf(h)),
    'set and rest stacked': (t) => t.filter((h) => largestSet(h) >= 2).map((h) => [...setOf(h), ...h.filter((c) => !setOf(h).includes(c))]),
    'no-pair hands too': (t) => t.flatMap((h) => [setOf(h), h.filter((c) => !setOf(h).includes(c))].filter((p) => p.length)),
    'one pair only': (t) => t.filter((h) => countsOf(h) === '1,1,1,2').flatMap((h) => [setOf(h), h.filter((c) => !setOf(h).includes(c))]),
  },
  'four-of-a-kind': {
    'quads per test': (t) => groupBy(t.map(([c]) => c), rankOf).filter((p) => p.length >= 4).map((p) => p.slice(0, 4)),
    'three of a kind': (t) => { const m = {}, out = []; for (const [c] of t) { (m[rankOf(c)] ??= []).push(c); if (m[rankOf(c)].length === 3) out.push(m[rankOf(c)].splice(0)); } return out; },
    'the fourth card only': (t) => { const m = {}, out = []; for (const [c] of t) { m[rankOf(c)] = (m[rankOf(c)] ?? 0) + 1; if (m[rankOf(c)] % 4 === 0) out.push([c]); } return out; },
  },
  'every-other': {
    'top two': (h) => highIn(h, [0, 1]) >= high(h), '1st, 3rd or 5th': (h) => highIn(h, [0, 2, 4]) >= high(h),
    'strictly highest': (h) => highIn(h, [0, 2]) > highIn(h, [1, 3, 4]),
    'aces low': (h) => Math.max(rv(h[0]), rv(h[2])) >= Math.max(...h.map(rv)), 'top card only': (h) => hv(h[0]) >= high(h),
    '2nd or 4th': (h) => highIn(h, [1, 3]) >= high(h),
  },
  'after-a-pair': {
    'holds a pair itself': (h) => largestSet(h) >= 2,
    'first hand pays': (h, b) => b.length === 0 || largestSet(last(b)) >= 2,
    'after no pair': (h, b) => b.length > 0 && largestSet(last(b)) < 2,
    'after one pair only': (h, b) => b.length > 0 && countsOf(last(b)) === '1,1,1,2',
    'after any earlier pair': (h, b) => b.some((x) => largestSet(x) >= 2),
    'two before': (h, b) => b.length > 1 && largestSet(b[b.length - 2]) >= 2,
  },
  bookends: {
    'own bottom card': (h) => hv(h[0]) > hv(h[1]),
    'ties pay': (h, b) => b.length > 0 && hv(h[0]) >= hv(last(b)[1]),
    'high card': (h, b) => b.length > 0 && high(h) > hv(last(b)[1]),
    'previous top card': (h, b) => b.length > 0 && hv(h[0]) > hv(last(b)[0]),
    'previous high card': (h, b) => b.length > 0 && hv(h[0]) > high(last(b)),
    'first hand pays': (h, b) => b.length === 0 || hv(h[0]) > hv(last(b)[1]),
    'aces low': (h, b) => b.length > 0 && rankValue(h[0]) > rankValue(last(b)[1]),
  },
};

export const DOOR = [];
