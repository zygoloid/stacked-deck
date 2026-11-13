// Mutants and door levels for the bonus deck. See test/mutants/shared.js.
import { RANKS, rankOf, rankValue, largestSet, newDeckIndex } from '../../src/cards.js';
import { hv, high, last, countsOf, setOf, groupBy, count, has, chunks } from './shared.js';

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
const up = (c, k = 1) => RANKS[(RANKS.indexOf(rankOf(c)) + 13 + k) % 13] + c[1];
// Casino numbers (as src/levels/bonus.js): digits ace up to the base, no zero.
const casinoOf = (n, base = 13) => { const d = []; for (let v = n; v > 0; v = Math.floor((v - 1) / base)) d.unshift(RANKS[(v - 1) % base] + 'S'); return d; };
// A two-card hand as a casino number, leading digit on top.
const two = ([a, b]) => 13 * rv(a) + rv(b);
const sameSuit = (h) => h.every((c) => c[1] === h[0][1]);
// Perfect Pair, Counterfeit: identical cards.
const twins = (h) => new Set(h).size < h.length;
const isRed = (c) => 'HD'.includes(c[1]);
// Red Flush variants (Off Suit, Night Off).
const redFlushMutants = {
  'any flush': (h) => sameSuit(h), 'all red': (h) => h.every((c) => 'HD'.includes(c[1])),
  'hearts only': (h) => sameSuit(h) && h[0][1] === 'H', 'two of a red suit': (h) => ['H', 'D'].some((u) => h.filter((c) => c[1] === u).length >= 2),
  'a red card': (h) => h.some((c) => 'HD'.includes(c[1])),
};
// Rank and File variants: every hand sorted by `val`, ties in the suit
// order given (null: as dealt).
const byRank = (val, suits) => (t) => t.map((h) => [...h].sort((a, b) => val(a) - val(b) ||
  (suits ? suits.indexOf(a[1]) - suits.indexOf(b[1]) : 0)));
const NEW_DECK = ['S', 'D', 'C', 'H'].flatMap((s) => RANKS.map((r) => r + s)).sort((a, b) => newDeckIndex(a) - newDeckIndex(b));
// Missing Card: the card a 51-card hand lacks.
const missingOf = (h) => NEW_DECK.find((c) => !h.includes(c));
// Running Count variants: `val` scores a card, and the card pays when the
// total, with it, is above zero (or zero too, with `level`).
const hiLo = (c) => (hv(c) <= 6 ? 1 : hv(c) >= 10 ? -1 : 0);
const counted = ({ val = hiLo, level = false } = {}) => (h, b) => {
  const n = [...b, h].reduce((a, [c]) => a + val(c), 0);
  return level ? n >= 0 : n > 0;
};
// Round the Clock variants: the cards since the last payout, in play order;
// at the thirteenth rank pay the first card of each rank (the `last`, or
// `all` of the cards). `restart`: a repeated rank starts the round again;
// `tail`: an unfinished round pays its first cards at closing.
function clock({ last = false, all = false, restart = false, tail = false } = {}) {
  return (t) => {
    const out = [];
    let cards = [];
    const pay = () => {
      if (all) return [...cards];
      const m = new Map();
      for (const c of cards) if (last || !m.has(rankOf(c))) m.set(rankOf(c), c);
      return [...m.values()];
    };
    for (const [c] of t) {
      if (restart && cards.some((x) => rankOf(x) === rankOf(c))) cards = [];
      cards.push(c);
      if (new Set(cards.map(rankOf)).size === 13) { out.push(pay()); cards = []; }
    }
    if (tail && cards.length) out.push(pay());
    return out;
  };
}

// Crossed Wires variants: seat i % 3's hands go to desk `to(seat)`.
const atDesks = (to) => (t) => t.flatMap((h, i) => (h ? [{ desk: to(i % 3), hand: h }] : []));
const crossings = {
  'straight across': atDesks((s) => s), 'all to desk Y': atDesks(() => 1),
  'one down': atDesks((s) => (s + 1) % 3), 'one up': atDesks((s) => (s + 2) % 3),
  'only A crosses': atDesks((s) => (s === 0 ? 2 : s)),
  'hands in deal order to X, Y, Z': (t) => t.filter(Boolean).map((h, i) => ({ desk: i % 3, hand: h })),
};

// Ceasefire, Three in a Row, Odds and Evens.
import { isStraight } from '../../src/cards.js';
const prevs = (before, n) => before.slice(-n).map((b) => b[0]);
// Three cards whose values (by `val`) are three consecutive numbers.
const run3 = (val) => (h, before) => {
  if (before.length < 2) return false;
  const v = [h[0], ...prevs(before, 2)].map(val).sort((x, y) => x - y);
  return v[1] === v[0] + 1 && v[2] === v[1] + 1;
};
const reds = (h) => h.filter((c) => 'HD'.includes(c[1])).length;

// Twenty-One Card Trick variants: A's hand with B's card in place i.
const trickAt = (i) => (t) => deals(t).map(([a, [b]]) => {
  const rest = a.filter((c) => c !== b);
  return [...rest.slice(0, i), b, ...rest.slice(i)];
});

// Checkerboard variants: the hand's red and black cards, recombined.
const colours = (f) => (t) => t.map((h) => f(h.filter((c) => 'HD'.includes(c[1])), h.filter((c) => !'HD'.includes(c[1])), h));
const alternate = (a, b) => a.flatMap((c, i) => [c, b[i]]);
const outRiffle = (h) => alternate(h.slice(0, 3), h.slice(3));
// Crazy Eights variants: which cards pay, and which card the next must match.
const crazy = ({ first = true, eights = true, rank = true, suit = true, played = false, eightKeeps = false, afterEight = false } = {}) => (h, before) => {
  const pays = (c, top) => (eights && c[0] === '8') || (top ? (afterEight && top[0] === '8') ||
    (rank && c[0] === top[0]) || (suit && c[1] === top[1]) : first);
  let top = null;
  for (const [c] of before) if (played || (pays(c, top) && !(eightKeeps && top && c[0] === '8'))) top = c;
  return pays(h[0], top);
};
const isBlackjack = (h) => h.some((c) => c[0] === 'A') && h.some((c) => 'TJQK'.includes(c[0]));

// Every Twenty-One variants: `test(before, after)` on the running total,
// with cards worth `val`.
const runningTotal = (val, test) => (h, before) => {
  const s = before.reduce((a, [c]) => a + val(c), 0);
  return test(s, s + val(h[0]));
};
const crossed = (n) => (s0, s1) => Math.floor(s1 / n) > Math.floor(s0 / n);
// Hit Me: the total with aces 1 and picture cards 10.
const bj = (c) => Math.min(10, rv(c)); // a card in blackjack, the ace as 1
const blackjackOf = (h) => h.reduce((a, c) => a + bj(c), 0);

// Pot Luck and Follow Suit.
// Pot Luck variants: `val` ranks the cards; a tie goes to player `tie` if
// given, else into the pot (none with `pot: false`), which keeps its last
// `keep` cards; the winner (0 for A, 1 for B) is paid at `desk(winner)`,
// the pot with the cards or `apart` as a hand of its own; a pot left at
// the end is paid at desk `leftover` if given.
const potLuckBy = ({ val = hv, tie, pot = true, keep = Infinity, apart = false, desk = (w) => w, leftover } = {}) => (t) => {
  const out = [];
  let p = [];
  for (const [[a], [b]] of deals(t)) {
    if (val(a) === val(b) && tie === undefined) {
      if (pot) p = [...p, a, b].slice(-keep);
      continue;
    }
    const w = val(a) > val(b) ? 0 : val(a) < val(b) ? 1 : tie;
    if (apart) out.push({ desk: desk(w), hand: [a, b] }, ...(p.length ? [{ desk: desk(w), hand: p }] : []));
    else out.push({ desk: desk(w), hand: [a, b, ...p] });
    p = [];
  }
  if (leftover !== undefined && p.length) out.push({ desk: leftover, hand: p });
  return out;
};
// Follow Suit variants: a card takes the trick from the one winning it so
// far when `beats(card, winning, suit led, trick)`; the trick is paid at
// `desk(winner)`.
const followBy = ({ beats = (c, w, led) => c[1] === led && hv(c) > hv(w), desk = (w) => w } = {}) => (t) =>
  Array.from({ length: Math.floor(t.length / 4) }, (_, i) => t.slice(4 * i, 4 * i + 4).map(([c]) => c)).map((trick) => {
    let w = 0;
    trick.forEach((c, j) => { if (j && beats(c, trick[w], trick[0][1], trick)) w = j; });
    return { desk: desk(w), hand: trick };
  });

export const MUTANTS = {
  checkerboard: {
    'black on top': colours((r, b) => alternate(b, r)),
    'reds then blacks': colours((r, b) => [...r, ...b]),
    'blacks then reds': colours((r, b) => [...b, ...r]),
    'reds reversed': colours((r, b) => alternate([...r].reverse(), b)),
    'blacks reversed': colours((r, b) => alternate(r, [...b].reverse())),
    'the hand upside down, black on top': colours((r, b) => alternate([...b].reverse(), [...r].reverse())),
    'the hand out-shuffled as dealt': (t) => t.map(outRiffle),
  },
  natural: {
    'holds an ace': (h) => h.some((c) => c[0] === 'A'),
    'ace and king only': (h) => h.some((c) => c[0] === 'A') && h.some((c) => c[0] === 'K'),
    'ace and a face card (not a 10)': (h) => h.some((c) => c[0] === 'A') && h.some((c) => 'JQK'.includes(c[0])),
    'ace and a 9 or better': (h) => h.some((c) => c[0] === 'A') && h.some((c) => '9TJQK'.includes(c[0])),
    'two aces count': (h) => isBlackjack(h) || h.every((c) => c[0] === 'A'),
    'both cards 10 or better': (h) => h.every((c) => hv(c) >= 10),
    'a ten-card': (h) => h.some((c) => 'TJQK'.includes(c[0])),
    'ace on top': (h) => h[0][0] === 'A' && 'TJQK'.includes(h[1][0]),
  },
  snap: {
    'the first card never pays': (h, b) => b.length > 0 && h[0][0] === last(b)[0][0],
    'the first card always pays': (h, b) => b.length === 0 || h[0][0] === last(b)[0][0],
    'same suit': (h, b) => h[0][1] === (b.length ? last(b)[0][1] : 'C'),
    'same colour': (h, b) => 'HD'.includes(h[0][1]) === 'HD'.includes((b.length ? last(b)[0] : '7C')[1]),
    'rank played before tonight': (h, b) => [['7C'], ...b].some(([c]) => c[0] === h[0][0]),
    'next in rank': (h, b) => Math.abs(rankValue(h[0]) - rankValue(b.length ? last(b)[0] : '7C')) === 1,
    'two cards before': (h, b) => h[0][0] === (b.length > 1 ? b[b.length - 2][0][0] : '7'),
    'same rank as the last card paid': (h, b) => {
      let top = '7C';
      for (const [c] of b) if (c[0] === top[0]) top = c;
      return h[0][0] === top[0];
    },
  },
  'crazy-eights': {
    'matches the last card played': crazy({ played: true }),
    'an 8 must match too': crazy({ eights: false }),
    'rank only': crazy({ suit: false }),
    'suit only': crazy({ rank: false }),
    'anything after an 8': crazy({ afterEight: true }),
    'an 8 is not matched against': crazy({ eightKeeps: true }),
    'the first card pays only if it is an 8': crazy({ first: false }),
  },

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
  'two-by-two': {
    'two pair or better': (h) => ['2,2', '1,3', '4'].includes(countsOf(h)),
    'pair or better': (h) => largestSet(h) >= 2, 'one pair': (h) => countsOf(h) === '1,1,2',
    'two pair or quads': (h) => ['2,2', '4'].includes(countsOf(h)),
    'largest set a pair': (h) => largestSet(h) === 2,
    'no pairs': (h) => largestSet(h) === 1,
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
  'split-the-difference': {
    'the sum': (t) => deals(t).map(([[a], [b]]) => casinoOf(rv(a) + rv(b))),
    'aces high': (t) => deals(t).flatMap(([[a], [b]]) => { const d = Math.abs(hv(a) - hv(b)); return d ? [casinoOf(d)] : []; }),
    'a king for a tie': (t) => deals(t).map(([[a], [b]]) => casinoOf(Math.abs(rv(a) - rv(b)) || 13)),
    'only when A is higher': (t) => deals(t).filter(([[a], [b]]) => rv(a) > rv(b)).map(([[a], [b]]) => casinoOf(rv(a) - rv(b))),
    'the higher card': (t) => deals(t).filter(([[a], [b]]) => rv(a) !== rv(b)).map(([[a], [b]]) => [rv(a) > rv(b) ? a : b]),
    'one more': (t) => deals(t).filter(([[a], [b]]) => rv(a) !== rv(b)).map(([[a], [b]]) => casinoOf(Math.abs(rv(a) - rv(b)) + 1)),
  },
  'last-in-first-out': {
    'in the order played': (t) => t,
    'last first, then in order': (t) => [t[t.length - 1], ...t.slice(0, -1)],
    'first first, then reversed': (t) => [t[0], ...t.slice(1).reverse()],
    'reversed in pairs': (t) => t.map((h, i) => t[i ^ 1] ?? h),
  },
  'one-up': {
    'the same card': (t) => t,
    'one down': (t) => t.map(([c]) => [up(c, -1)]),
    'the next spade': (t) => t.map(([c]) => [up(c[0] + 'S')]),
    'no wrap at the king': (t) => t.filter(([c]) => rankOf(c) !== 'K').map(([c]) => [up(c)]),
    'next in new deck order': (t) => t.map(([c]) => [NEW_DECK[(NEW_DECK.indexOf(c) + 1) % 52]]),
    'two up': (t) => t.map(([c]) => [up(c, 2)]),
  },
  'twice-shy': {
    'every hand whole': (t) => t,
    // the first copy of a repeated card is paid, the second dropped
    'only the second copy dropped': (t) => { const seen = new Set(); return t.map((h) => h.filter((c) => !seen.has(c) && seen.add(c))).filter((h) => h.length); },
    'only within a deal': (t) => deals(t).flatMap(([a, b]) => [a.filter((c) => !b.includes(c)), b.filter((c) => !a.includes(c))]).filter((h) => h.length),
    'by rank, not card': (t) => t.map((h) => h.filter((c) => t.flat().filter((x) => rankOf(x) === rankOf(c)).length === 1)).filter((h) => h.length),
    'repeated cards only': (t) => t.map((h) => h.filter((c) => t.flat().filter((x) => x === c).length > 1)).filter((h) => h.length),
    'whole hands without repeats': (t) => t.filter((h) => h.every((c) => t.flat().filter((x) => x === c).length === 1)),
  },
  'casino-numbers': {
    'base 10 (ace to ten)': (t) => deals(t).map(([[a], [b]]) => casinoOf(rv(a) + rv(b), 10)),
    'decimal, $ for zero': (t) => deals(t).map(([[a], [b]]) => { const n = rv(a) + rv(b); return n < 10 ? [RANKS[n - 1] + 'S'] : [RANKS[Math.floor(n / 10) - 1] + 'S', n % 10 ? RANKS[(n % 10) - 1] + 'S' : '$']; }),
    'leading digit underneath': (t) => deals(t).map(([[a], [b]]) => casinoOf(rv(a) + rv(b)).reverse()),
    'units digit only': (t) => deals(t).map(([[a], [b]]) => casinoOf(rv(a) + rv(b)).slice(-1)),
    'aces high': (t) => deals(t).map(([[a], [b]]) => casinoOf(hv(a) + hv(b))),
    'the difference': (t) => deals(t).filter(([[a], [b]]) => a !== b).map(([[a], [b]]) => casinoOf(Math.abs(rv(a) - rv(b)))),
    'the two cards': (t) => deals(t).map(([a, b]) => [...a, ...b]),
  },
  'times-tables': {
    'the sum': (t) => deals(t).map(([[a], [b]]) => casinoOf(rv(a) + rv(b))),
    'leading digit underneath': (t) => deals(t).map(([[a], [b]]) => casinoOf(rv(a) * rv(b)).reverse()),
    'units digit only': (t) => deals(t).map(([[a], [b]]) => casinoOf(rv(a) * rv(b)).slice(-1)),
    'base 10': (t) => deals(t).map(([[a], [b]]) => casinoOf(rv(a) * rv(b), 10)),
    'aces high': (t) => deals(t).map(([[a], [b]]) => casinoOf(hv(a) * hv(b))),
    'one less than the product': (t) => deals(t).filter(([[a], [b]]) => rv(a) * rv(b) > 1).map(([[a], [b]]) => casinoOf(rv(a) * rv(b) - 1)),
  },
  'off-suit': redFlushMutants,
  'night-off': redFlushMutants,
  'no-kings': redFlushMutants,
  'skeleton-crew': {
    'any flush': (h) => sameSuit(h), 'red flushes': (h) => sameSuit(h) && 'HD'.includes(h[0][1]),
    'two hearts or more': (h) => h.filter((c) => c[1] === 'H').length >= 2, 'a heart': (h) => h.some((c) => c[1] === 'H'),
    'all red': (h) => h.every((c) => 'HD'.includes(c[1])),
  },
  'carry-the-one': {
    'leading digit underneath': (t) => deals(t).map(([a, b]) => casinoOf(two(a) + two(b)).reverse()),
    'no carry from the units': (t) => deals(t).map(([a, b]) => casinoOf(13 * (rv(a[0]) + rv(b[0])) + ((rv(a[1]) + rv(b[1]) - 1) % 13) + 1)),
    'two digits at most': (t) => deals(t).map(([a, b]) => casinoOf(two(a) + two(b)).slice(-2)),
    'units digit on top of the hands': (t) => deals(t).map(([a, b]) => casinoOf(two([...a].reverse()) + two([...b].reverse()))),
    'aces high': (t) => deals(t).map(([a, b]) => casinoOf(13 * (hv(a[0]) + hv(b[0])) + hv(a[1]) + hv(b[1]))),
    'the four cards': (t) => deals(t).map(([a, b]) => [...a, ...b]),
  },
  'rest-of-the-deck': {
    'the cards played': (t) => t.flat().map((c) => [c]),
    'unplayed, as one hand': (t) => [NEW_DECK.filter((c) => !t.flat().includes(c))],
    'unplayed, a hand per suit': (t) => groupBy(NEW_DECK.filter((c) => !t.flat().includes(c)), (c) => c[1]),
    'unplayed ranks only': (t) => NEW_DECK.filter((c) => !t.flat().some((x) => rankOf(x) === rankOf(c))).map((c) => [c]),
    'all but the last hand': (t) => NEW_DECK.filter((c) => !t.slice(0, -1).flat().includes(c)).map((c) => [c]),
  },
  'crossed-wires': crossings,
  'uneven-tables': crossings,
  ceasefire: {
    'aces high': (h, b) => b.length > 0 && hv(h[0]) > hv(last(b)[0]),
    'lower than the card before': (h, b) => b.length > 0 && rv(h[0]) < rv(last(b)[0]),
    'one rank higher': (h, b) => b.length > 0 && rv(h[0]) === rv(last(b)[0]) + 1,
    'higher than every card before': (h, b) => b.length > 0 && b.every(([c]) => rv(h[0]) > rv(c)),
    'the first card pays': (h, b) => !b.length || rv(h[0]) > rv(last(b)[0]),
    'next in rank': (h, b) => b.length > 0 && isStraight([h[0], last(b)[0]]),
    'higher than the first card': (h, b) => b.length > 0 && rv(h[0]) > rv(b[0][0]),
  },
  'three-in-a-row': {
    'aces low only': run3(rv), 'aces high only': run3(hv),
    'wrapping round K-A-2': (h, b) => b.length >= 2 && [0, 1, 2].some((k) => run3((c) => (rv(c) + 13 - k) % 13)(h, b)),
    'climbing only': (h, b) => b.length >= 2 && [rv, hv].some((v) => { const [x, y] = prevs(b, 2).map(v); return y === x + 1 && v(h[0]) === y + 1; }),
    'next to the card before': (h, b) => b.length >= 1 && isStraight([h[0], last(b)[0]]),
    'next to either card before': (h, b) => prevs(b, 2).some((c) => isStraight([h[0], c])),
    'a pair still counts': (h, b) => b.length >= 2 && new Set([h[0], ...prevs(b, 2)].map(rankOf)).size === 2 &&
      isStraight([...new Map([h[0], ...prevs(b, 2)].map((c) => [rankOf(c), c])).values()]),
    'three of a kind': (h, b) => b.length >= 2 && prevs(b, 2).every((c) => rankOf(c) === rankOf(h[0])),
  },
  'odds-and-evens': {
    'odd number of red cards': (h) => reds(h) % 2 === 1, 'two or four (none is not even)': (h) => reds(h) === 2 || reds(h) === 4,
    'at least two red cards': (h) => reds(h) >= 2, 'exactly two red cards': (h) => reds(h) === 2,
    'even number of hearts': (h) => h.filter((c) => c[1] === 'H').length % 2 === 0,
    'even number of spades': (h) => h.filter((c) => c[1] === 'S').length % 2 === 0,
    'more black cards than red': (h) => reds(h) <= 2,
  },
  'twenty-one-card-trick': {
    'the chosen card on top': trickAt(0),
    'the chosen card 10th': trickAt(9),
    'the chosen card 12th': trickAt(11),
    'the chosen card at the bottom': trickAt(20),
    'A\'s hand as played': (t) => deals(t).map(([a]) => a),
    'A\'s hand reversed': (t) => deals(t).map(([a]) => [...a].reverse()),
    'both copies, the chosen card 11th': (t) => deals(t).map(([a, [b]]) => [...a.slice(0, 10), b, ...a.slice(10)]),
    'B\'s card alone': (t) => deals(t).map(([, b]) => b),
  },
  'rank-and-file': {
    'as dealt': (t) => t,
    'new deck order (suit first)': (t) => t.map((h) => [...h].sort((a, b) => newDeckIndex(a) - newDeckIndex(b))),
    'aces high': byRank(hv, 'SDCH'),
    'highest on top': (t) => byRank(rv, 'SDCH')(t).map((h) => h.reverse()),
    'ties as dealt': byRank(rv, null),
    'ties clubs, diamonds, hearts, spades': byRank(rv, 'CDHS'),
    'ties hearts, clubs, diamonds, spades': byRank(rv, 'HCDS'),
    'ties spades, hearts, diamonds, clubs': byRank(rv, 'SHDC'),
    'ties spades, diamonds, hearts, clubs': byRank(rv, 'SDHC'),
  },
  'one-deck': {
    'two or more sevens': (h) => count(h, '7') >= 2, 'exactly three': (h) => count(h, '7') === 3,
    'any three of a kind': (h) => largestSet(h) >= 3, 'any seven': (h) => has(h, '7'),
    'four sevens': (h) => count(h, '7') === 4,
    // Machines that test with fewer than four 7s, which the tests must
    // catch for every other rank: two 7s and two other cards (Kind 5 also
    // says yes to four of a kind of a filler's rank), or two 7s and two of
    // one rank (three of a kind of it).
    ...Object.fromEntries(RANKS.filter((r) => r !== '7').flatMap((r) => [
      [`two 7s and a ${r}`, (h) => count(h, '7') >= 3 || count(h, r) >= 4],
      [`two 7s and two ${r}s`, (h) => count(h, '7') >= 3 || count(h, r) >= 3],
    ])),
  },
  'one-war': {
    '9 to K': (h) => high(h) >= 9 && high(h) <= 13, '10 to Q': (h) => high(h) >= 10 && high(h) <= 12,
    '8 to Q': (h) => high(h) >= 8 && high(h) <= 12, '9 to J': (h) => high(h) >= 9 && high(h) <= 11,
    'top card': (h) => hv(h[0]) >= 9 && hv(h[0]) <= 12, 'aces low': (h) => Math.max(...h.map(rv)) >= 9 && Math.max(...h.map(rv)) <= 12,
    'holds a 9 to Q': (h) => h.some((c) => hv(c) >= 9 && hv(c) <= 12),
  },
  dumbwaiter: {
    'every card on its own': (t) => t.flat().map((c) => [c]),
    'hands upside down': (t) => t.map((h) => [...h].reverse()),
    'in fives': (t) => chunks(t.flat(), 5),
    'the whole night as one hand': (t) => [t.flat()],
    'the top card last': (t) => t.map(([x, ...rest]) => [...rest, x]),
  },
  'every-twenty-one': {
    'exactly a multiple': runningTotal(bj, (s0, s1) => s1 % 21 === 0),
    'strictly past': runningTotal(bj, (s0, s1) => Math.floor(s1 / 21) > Math.floor(s0 / 21) && s1 % 21 !== 0),
    'casino numbers (J 11, Q 12, K 13)': runningTotal(rv, crossed(21)),
    'aces 11': runningTotal((c) => (rankOf(c) === 'A' ? 11 : bj(c)), crossed(21)),
    'every 20': runningTotal(bj, crossed(20)), 'every 22': runningTotal(bj, crossed(22)),
    'the card after': (h, before) => before.length > 0 && runningTotal(bj, crossed(21))(last(before), before.slice(0, -1)),
    'reset after paying': (h, before) => {
      let s = 0;
      for (const [c] of before) { s += bj(c); if (s >= 21) s = 0; }
      return s + bj(h[0]) >= 21;
    },
  },
  'hit-me': {
    'aces 11': (h) => h.reduce((a, c) => a + (rankOf(c) === 'A' ? 11 : Math.min(10, rv(c))), 0) <= 21,
    'picture cards face value': (h) => h.reduce((a, c) => a + rv(c), 0) <= 21,
    'under 21': (h) => blackjackOf(h) < 21, 'up to 22': (h) => blackjackOf(h) <= 22,
    'exactly 21': (h) => blackjackOf(h) === 21, 'the hands that go over': (h) => blackjackOf(h) > 21,
    'one ace as 11': (h) => blackjackOf(h) + (h.some((c) => rankOf(c) === 'A') ? 10 : 0) <= 21,
    'the first three cards': (h) => blackjackOf(h.slice(0, 3)) <= 21,
  },
  'perfect-pair': {
    'a pair of any suits': (h) => largestSet(h) >= 2,
    'a pair of one colour': (h) => h.some((c, i) => h.some((d, j) => j !== i && c[0] === d[0] && isRed(c) === isRed(d))),
    'identical cards side by side': (h) => h.some((c, i) => i && c === h[i - 1]),
    'exactly one perfect pair': (h) => h.length - new Set(h).size === 1,
    'a perfect pair and no other pair': (h) => twins(h) && largestSet([...new Set(h)]) === 1,
    'a perfect pair or three of a kind': (h) => twins(h) || largestSet(h) >= 3,
    'a perfect pair in the top three': (h) => twins(h.slice(0, 3)),
  },
  counterfeit: {
    'the rank played before': ([c], before) => before.some(([b]) => b[0] === c[0]),
    'the rank in another suit': ([c], before) => before.some(([b]) => b[0] === c[0] && b !== c),
    'the rank and colour played before': ([c], before) => before.some(([b]) => b[0] === c[0] && isRed(b) === isRed(c)),
    'the same as the card before': ([c], before) => before.length > 0 && last(before)[0] === c,
    'within the last ten cards': ([c], before) => before.slice(-10).some(([b]) => b === c),
    'every copy after the first, and the first copy once more': ([c], before) => before.some(([b]) => b === c) || before.length === 0,
  },
  'missing-card': {
    'the hand itself': (t) => t,
    'the last card of the hand': (t) => t.map((h) => [h[h.length - 1]]),
    'the first card of the hand': (t) => t.map((h) => [h[0]]),
    'every card of the missing rank': (t) => t.map((h) => NEW_DECK.filter((c) => rankOf(c) === rankOf(missingOf(h)))),
    'the missing rank in spades': (t) => t.map((h) => [rankOf(missingOf(h)) + 'S']),
    'the next card in new deck order': (t) => t.map((h) => [NEW_DECK[(NEW_DECK.indexOf(missingOf(h)) + 1) % 52]]),
    'the rest of the missing suit': (t) => t.map((h) => h.filter((c) => c[1] === missingOf(h)[1])),
  },
  'running-count': {
    'level pays': counted({ level: true }),
    'before the card': (h, b) => b.reduce((n, [c]) => n + hiLo(c), 0) > 0,
    'aces count low': counted({ val: (c) => (rankOf(c) === 'A' ? 1 : hiLo(c)) }),
    'aces count for neither': counted({ val: (c) => (rankOf(c) === 'A' ? 0 : hiLo(c)) }),
    '7 counts low': counted({ val: (c) => (hv(c) <= 7 ? 1 : hiLo(c)) }),
    '9 counts high': counted({ val: (c) => (hv(c) === 9 ? -1 : hiLo(c)) }),
    '10 counts for neither': counted({ val: (c) => (hv(c) === 10 ? 0 : hiLo(c)) }),
    'low cards': (h) => hiLo(h[0]) > 0,
    'more low cards than not': counted({ val: (c) => (hiLo(c) > 0 ? 1 : -1) }),
  },
  'round-the-clock': {
    'the last card of each rank': clock({ last: true }),
    'repeats too': clock({ all: true }),
    'every 13 cards': (t) => chunks(t.map(([c]) => c), 13),
    'only once a night': (t) => clock()(t).slice(0, 1),
    'a repeat starts again': clock({ restart: true }),
    'the unfinished round at closing': clock({ tail: true }),
    'each new rank at once': (t) => {
      const out = [];
      let seen = new Set();
      for (const [c] of t) {
        if (!seen.has(rankOf(c))) { out.push([c]); seen.add(rankOf(c)); }
        if (seen.size === 13) seen = new Set();
      }
      return out;
    },
  },
  'pot-luck': {
    'no pot: ties pay nothing': potLuckBy({ pot: false }),
    'ties go to player B': potLuckBy({ tie: 1 }),
    'aces low': potLuckBy({ val: rv }),
    'paid at the loser\'s desk': potLuckBy({ desk: (w) => 1 - w }),
    'the pot as a hand of its own': potLuckBy({ apart: true }),
    'only the last tie in the pot': potLuckBy({ keep: 2 }),
    'the pot left at the end paid at desk X': potLuckBy({ leftover: 0 }),
  },
  'follow-suit': {
    'the highest card, any suit': followBy({ beats: (c, w) => hv(c) > hv(w) }),
    'aces low': followBy({ beats: (c, w, led) => c[1] === led && rv(c) > rv(w) }),
    'the leader always wins': followBy({ beats: () => false }),
    'the last to follow suit': followBy({ beats: (c, w, led) => c[1] === led }),
    'the first to beat the lead': followBy({ beats: (c, w, led, t) => c[1] === led && w === t[0] && hv(c) > hv(w) }),
    'spades are trumps': followBy({ beats: (c, w, led) => (c[1] === 'S' && (w[1] !== 'S' || hv(c) > hv(w))) || (c[1] === led && w[1] !== 'S' && hv(c) > hv(w)) }),
    'all at desk X': followBy({ desk: () => 0 }),
    'paid at the next desk round': followBy({ desk: (w) => (w + 1) % 4 }),
    'only the winning card paid': (t) => followBy()(t).map(({ desk, hand }) => ({ desk, hand: [hand[desk]] })),
  },
  'cut-to-the-ace': {
    'as dealt': (t) => t,
    'cut to the first ace': (t) => t.map((h) => ctaCutAt(h, h.findIndex((c) => rankOf(c) === 'A'))),
    'cut to the first spade': (t) => t.map((h) => ctaCutAt(h, h.findIndex((c) => c[1] === 'S'))),
    'cut to the last ace': (t) => t.map((h) => ctaCutAt(h, h.findLastIndex((c) => rankOf(c) === 'A'))),
    'the A♠ to the bottom': (t) => t.map((h) => ctaCutAt(h, (h.indexOf('AS') + 1) % h.length)),
    'cut one card short': (t) => t.map((h) => ctaCutAt(h, (h.indexOf('AS') + h.length - 1) % h.length)),
    'only the A♠ moved': (t) => t.map((h) => ['AS', ...h.filter((c) => c !== 'AS')]),
    'the cards above turned over': (t) => t.map((h) => { const i = h.indexOf('AS'); return [...h.slice(i), ...h.slice(0, i).reverse()]; }),
    'the cards above dropped': (t) => t.map((h) => h.slice(h.indexOf('AS'))),
    'the hand turned over': (t) => t.map((h) => [...h].reverse()),
  },
  'punto-banco': {
    'worth 8 only': (h) => bacPoints(h) === 8, 'worth 9 only': (h) => bacPoints(h) === 9,
    'worth 7 or more': (h) => bacPoints(h) >= 7, 'worth 8, 9 or nothing': (h) => [8, 9, 0].includes(bacPoints(h)),
    'the total, not its last digit': (h) => [8, 9].includes(h.reduce((a, c) => a + bacValue(c), 0)),
    'jacks 1, queens 2, kings 3': (h) => h.reduce((a, c) => a + rv(c), 0) % 10 >= 8,
    'aces worth nothing': (h) => h.reduce((a, c) => a + (rv(c) === 1 ? 0 : bacValue(c)), 0) % 10 >= 8,
    'the first card worth 8 or 9': (h) => bacValue(h[0]) >= 8,
    'either card worth 8 or 9': (h) => h.some((c) => bacValue(c) >= 8),
  },
  'first-sighting': {
    'order matters': (h, b) => !b.some((x) => rankOf(x[0]) === rankOf(h[0]) && rankOf(x[1]) === rankOf(h[1])),
    'suits matter too': (h, b) => !b.some((x) => sameCards(x, h)),
    'pairs never pay': (h, b) => rankOf(h[0]) !== rankOf(h[1]) && !b.some((x) => sameRanks(x, h)),
    'pairs always pay': (h, b) => rankOf(h[0]) === rankOf(h[1]) || !b.some((x) => sameRanks(x, h)),
    'both ranks new': (h, b) => !b.flat().some((c) => h.some((d) => rankOf(c) === rankOf(d))),
    'either rank new': (h, b) => h.some((d) => !b.flat().some((c) => rankOf(c) === rankOf(d))),
    'only the hand before': (h, b) => !b.length || !sameRanks(last(b), h),
    'the second sighting': (h, b) => b.filter((x) => sameRanks(x, h)).length === 1,
    'every repeat': (h, b) => b.some((x) => sameRanks(x, h)),
    'by the top card': (h, b) => !b.some((x) => rankOf(x[0]) === rankOf(h[0])),
  },
};
// Punto Banco: a card's points (10s and picture cards none) and a hand's
// (the units digit of the total).
function bacValue(c) { return rv(c) >= 10 ? 0 : rv(c); }
function bacPoints(h) { return h.reduce((a, c) => a + bacValue(c), 0) % 10; }
// Cut to the Ace: the hand cut so that card i is on top.
function ctaCutAt(h, i) { return [...h.slice(i), ...h.slice(0, i)]; }

export const DOOR = ['punto-banco', 'rank-and-file', 'first-sighting'];
