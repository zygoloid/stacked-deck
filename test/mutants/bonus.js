// Mutants and door levels for the bonus deck. See test/mutants/shared.js.
import { RANKS, rankOf, rankValue, largestSet, newDeckIndex } from '../../src/cards.js';
import { hv, high, last, countsOf, setOf, groupBy } from './shared.js';

const rv = (c) => rankValue(c);
const highIn = (h, idx) => Math.max(...idx.map((i) => hv(h[i])));
const kings = (t) => t.filter(([c]) => rankOf(c) === 'K');
// Rank gaps of a two-card hand: ace low, ace high.
const lowGap = ([a, b]) => Math.abs(rv(a) - rv(b));
const highGap = ([a, b]) => Math.abs(hv(a) - hv(b));
const gapIs = (n) => (h) => lowGap(h) === n || highGap(h) === n;
// Counting Up variants: `next(k)` is the rank index after k (null: stop);
// `chain` lets one hand count for several ranks in a row.
const counting = ({ start = 1, next = (k) => (k + 1) % 13, chain = false } = {}) => (h, before) => {
  let want = start;
  const has = (x, k) => k !== null && x.some((c) => rankOf(c) === RANKS[k]);
  for (const b of before) while (has(b, want)) { want = next(want); if (!chain) break; }
  return has(h, want);
};
const climbs = (val) => (h) => h.every((c, i) => i === 0 || val(c) >= val(h[i - 1]));
// Two-player floors: [player A's hand, player B's] for each deal.
const deals = (t) => Array.from({ length: Math.floor(t.length / 2) }, (_, i) => [t[2 * i], t[2 * i + 1]]);
const sameCards = (a, b) => [...a].sort().join() === [...b].sort().join();
const sameRanks = (a, b) => a.map(rankOf).sort().join() === b.map(rankOf).sort().join();
// Showdown variants: `key` turns a hand into values compared in order.
const showdown = (key, { ties = [] } = {}) => (t) => deals(t).flatMap(([a, b]) => {
  const x = key(a), y = key(b);
  const i = x.findIndex((v, j) => v !== y[j]);
  return i < 0 ? ties.map((n) => [a, b][n]) : x[i] > y[i] ? [a] : [b];
});
const desc = (val) => (h) => h.map(val).sort((x, y) => y - x);

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
  'two-apart': {
    'one or two apart': (h) => gapIs(1)(h) || gapIs(2)(h), 'two or more apart': (h) => lowGap(h) >= 2 && highGap(h) >= 2,
    'aces high only': (h) => highGap(h) === 2, 'aces low only': (h) => lowGap(h) === 2,
    'king and 2 wrap': (h) => gapIs(2)(h) || ['K2', '2K'].includes(h.map(rankOf).join('')), 'one apart': gapIs(1),
  },
  'three-apart': {
    'two or three apart': (h) => gapIs(2)(h) || gapIs(3)(h), 'three or more apart': (h) => lowGap(h) >= 3 && highGap(h) >= 3,
    'aces high only': (h) => highGap(h) === 3, 'aces low only': (h) => lowGap(h) === 3, 'two apart': gapIs(2),
  },
  'counting-up': {
    'every hand with a 2': (h) => h.some((c) => rankOf(c) === '2'),
    'stops after the ace': counting({ next: (k) => (k === 0 ? null : (k + 1) % 13) }),
    'king then 2': counting({ next: (k) => (k === 12 ? 1 : k + 1) }),
    'starts at the ace': counting({ start: 0 }),
    'a hand counts for several ranks': counting({ chain: true }),
  },
  rising: {
    'strictly rising': (h) => h.every((c, i) => i === 0 || hv(c) > hv(h[i - 1])), 'aces low': climbs(rv),
    'falling': (h) => h.every((c, i) => i === 0 || hv(c) <= hv(h[i - 1])),
    'top card lowest': (h) => hv(h[0]) <= Math.min(...h.map(hv)), 'bottom card highest': (h) => hv(h[h.length - 1]) >= high(h),
    'new deck order': climbs(newDeckIndex),
  },
  'head-count': {
    'aces high': (h) => hv(h[0]) === h.length, 'one more card': (h) => rv(h[0]) === h.length + 1,
    'bottom card': (h) => rv(h[h.length - 1]) === h.length, 'highest card': (h) => Math.max(...h.map(rv)) === h.length,
    'any card': (h) => h.some((c) => rv(c) === h.length),
  },
  'mirror-image': {
    'same ranks': (t) => deals(t).filter(([a, b]) => sameRanks(a, b)).flat(),
    'same order': (t) => deals(t).filter(([a, b]) => a.join() === b.join()).flat(),
    'player A only': (t) => deals(t).filter(([a, b]) => sameCards(a, b)).map(([a]) => a),
    'four cards the same': (t) => deals(t).filter(([a, b]) => a.filter((c) => b.includes(c)).length >= 4).flat(),
  },
  showdown: {
    'highest card only': showdown((h) => [high(h)]),
    'ties pay both': showdown(desc(hv), { ties: [0, 1] }),
    'player A wins ties': showdown(desc(hv), { ties: [0] }),
    'lowest card first': showdown((h) => desc(hv)(h).reverse()),
    'aces low': showdown(desc(rv)),
    'total of the ranks': showdown((h) => [h.reduce((a, c) => a + hv(c), 0)]),
    'in dealt order': showdown((h) => h.map(hv)),
  },
};

export const DOOR = [];
