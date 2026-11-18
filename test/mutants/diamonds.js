// Mutants and door levels for chapter 2 (diamonds). See test/mutants/shared.js.
import { rankOf, suitOf, rankValue, largestSet, isFlush, isStraight } from '../../src/cards.js';
import { hv, isRed, has } from './shared.js';

const deals = (t) => Array.from({ length: Math.floor(t.length / 2) }, (_, i) => [t[2 * i][0], t[2 * i + 1][0]]);
const kings = (t) => t.filter(([c]) => rankOf(c) === 'K');
const isBlackjack = (h) => h.some((c) => c[0] === 'A') && h.some((c) => 'TJQK'.includes(c[0]));
// Crossed Wires variants: seat i % 3's hands go to desk `to(seat)`.
const atDesks = (to) => (t) => t.flatMap((h, i) => (h ? [{ desk: to(i % 3), hand: h }] : []));
const crossings = {
  'straight across': atDesks((s) => s), 'all to desk Y': atDesks(() => 1),
  'one down': atDesks((s) => (s + 1) % 3), 'one up': atDesks((s) => (s + 2) % 3),
  'only A crosses': atDesks((s) => (s === 0 ? 2 : s)),
  'hands in deal order to X, Y, Z': (t) => t.filter(Boolean).map((h, i) => ({ desk: i % 3, hand: h })),
};

const between = (h, strict = true) => {
  const lo = Math.min(hv(h[0]), hv(h[2])), hi = Math.max(hv(h[0]), hv(h[2])), m = hv(h[1]);
  return strict ? lo < m && m < hi : lo <= m && m <= hi;
};

export const MUTANTS = {
  'high-card': { 'ties pay': (h) => hv(h[0]) >= 9, 'aces low': (h) => rankValue(h[0]) > 9 },
  'small-stakes': {
    'aces high': (h) => '234'.includes(rankOf(h[0])), 'A to 5': (h) => 'A2345'.includes(rankOf(h[0])),
    'A to 3': (h) => 'A23'.includes(rankOf(h[0])),
  },
  'face-off': {
    'ties pay both': (t) => deals(t).flatMap(([a, b]) => (hv(a) === hv(b) ? [[a], [b]] : [[hv(a) > hv(b) ? a : b]])),
    'ties pay A': (t) => deals(t).map(([a, b]) => [hv(a) >= hv(b) ? a : b]),
    'aces low': (t) => deals(t).flatMap(([a, b]) => (rankValue(a) === rankValue(b) ? [] : [[rankValue(a) > rankValue(b) ? a : b]])),
    'the lower card': (t) => deals(t).flatMap(([a, b]) => (hv(a) === hv(b) ? [] : [[hv(a) < hv(b) ? a : b]])),
    'both cards together': (t) => deals(t).flatMap(([a, b]) => (hv(a) === hv(b) ? [] : [[a, b]])),
  },
  'red-flush': {
    'any flush': (h) => isFlush(h), 'all red': (h) => h.every(isRed),
    'hearts only': (h) => isFlush(h) && suitOf(h[0]) === 'H',
  },
  'small-change': {
    'pay the kings': (t) => kings(t),
    'kings and aces': (t) => t.filter(([c]) => 'AK'.includes(rankOf(c))).map(() => ['AS']),
    'ace of the same suit': (t) => kings(t).map(([c]) => ['A' + c[1]]),
    'king and ace together': (t) => kings(t).map(([c]) => [c, 'AS']),
  },
  'high-suit': {
    'the whole hand': (t) => t.filter((h) => isFlush(h)),
    'the lower card': (t) => t.filter((h) => isFlush(h)).map((h) => [hv(h[0]) < hv(h[1]) ? h[0] : h[1]]),
    'any hand': (t) => t.map((h) => [hv(h[0]) > hv(h[1]) ? h[0] : h[1]]),
    'aces low': (t) => t.filter((h) => isFlush(h)).map((h) => [rankValue(h[0]) > rankValue(h[1]) ? h[0] : h[1]]),
    'the top card': (t) => t.filter((h) => isFlush(h)).map((h) => [h[0]]),
  },
  'natural': {
    'holds an ace': (h) => h.some((c) => c[0] === 'A'),
    'ace and king only': (h) => h.some((c) => c[0] === 'A') && h.some((c) => c[0] === 'K'),
    'ace and a face card (not a 10)': (h) => h.some((c) => c[0] === 'A') && h.some((c) => 'JQK'.includes(c[0])),
    'ace and a 9 or better': (h) => h.some((c) => c[0] === 'A') && h.some((c) => '9TJQK'.includes(c[0])),
    'two aces count': (h) => isBlackjack(h) || h.every((c) => c[0] === 'A'),
    'both cards 10 or better': (h) => h.every((c) => hv(c) >= 10),
    'a ten-card': (h) => h.some((c) => 'TJQK'.includes(c[0])),
    'ace on top': (h) => h[0][0] === 'A' && 'TJQK'.includes(h[1][0]),
  },
  'low-kicker': {
    'the whole hand': (t) => t.filter(([a, b]) => hv(a) > 7 && hv(b) <= 7),
    'the top card': (t) => t.filter(([a, b]) => hv(a) > 7 && hv(b) <= 7).map(([a]) => [a]),
    'ties beat': (t) => t.filter(([a, b]) => hv(a) >= 7 && hv(b) < 7).map(([, b]) => [b]),
    'either way round': (t) => t.filter(([a, b]) => (hv(a) > 7) !== (hv(b) > 7)).map(([a, b]) => [hv(a) > 7 ? b : a]),
    'aces low': (t) => t.filter(([a, b]) => rankValue(a) > 7 && rankValue(b) <= 7).map(([, b]) => [b]),
  },
  'crossed-wires': crossings,
  'top-dog': {
    'ties pay': (h) => hv(h[0]) >= hv(h[1]), 'aces low': (h) => rankValue(h[0]) > rankValue(h[1]),
    'bottom beats top': (h) => hv(h[1]) > hv(h[0]),
  },
  'pecking-order': {
    'lowest on top': (t) => t.map((h) => [...h].sort((a, b) => hv(a) - hv(b))),
    'aces low': (t) => t.map((h) => [...h].sort((a, b) => rankValue(b) - rankValue(a))),
    'as dealt': (t) => t,
    'highest on top, rest as dealt': (t) => t.map((h) => { const m = h.reduce((x, c) => (hv(c) > hv(x) ? c : x)); return [m, ...h.filter((c) => c !== m)]; }),
  },
  'royal-flush': {
    'straight flush': (h) => isFlush(h) && isStraight(h), 'ace-high straight': (h) => isStraight(h) && has(h, 'A') && has(h, 'K'),
    'flush with an ace': (h) => isFlush(h) && has(h, 'A'), 'straight flush with an ace': (h) => isFlush(h) && isStraight(h) && has(h, 'A'),
  },
  'acey-deucey': {
    'ties count': (h) => between(h, false), 'top below bottom only': (h) => hv(h[0]) < hv(h[1]) && hv(h[1]) < hv(h[2]),
    'aces low': (h) => { const v = h.map(rankValue); return Math.min(v[0], v[2]) < v[1] && v[1] < Math.max(v[0], v[2]); },
    'middle beats top': (h) => hv(h[1]) > hv(h[0]),
  },
};

export const DOOR = [];
