// Mutants and door levels for chapter 4 (spades). See test/mutants/shared.js.
import { rankOf, suitOf, rankValue, largestSet, isFlush, isStraight } from '../../src/cards.js';
import { hv, high, isRed, last, has, count, countsOf, setOf } from './shared.js';

const wheel = (h) => 'A2345'.split('').every((r) => count(h, r) === 1);
const pairRank = (h) => hv(setOf(h)[0]);
const jacks = (h) => isStraight(h) || isFlush(h) || largestSet(h) >= 3 || countsOf(h) === '1,2,2' ||
  (countsOf(h) === '1,1,1,2' && pairRank(h) >= 11);

export const MUTANTS = {
  'hot-streak': {
    'ties pay': (h, b) => b.length > 0 && hv(h[0]) >= hv(last(b)[0]),
    'first card pays': (h, b) => b.length === 0 || hv(h[0]) > hv(last(b)[0]),
    'beats all earlier': (h, b) => b.length > 0 && b.every((x) => hv(h[0]) > hv(x[0])),
    'aces low': (h, b) => b.length > 0 && rankValue(h[0]) > rankValue(last(b)[0]),
  },
  'high-roller': {
    'strictly beats': (h, b) => b.every((x) => high(h) > high(x)),
    'beats previous only': (h, b) => b.length === 0 || high(h) >= high(last(b)),
  },
  'burn-card': {
    'top card': (h) => hv(h[0]) > 10, 'high card': (h) => high(h) > 10, 'ties pay': (h) => hv(h[1]) >= 10,
    'third card': (h) => hv(h[2]) > 10, 'bottom card': (h) => hv(h[4]) > 10,
    'aces low': (h) => rankValue(h[1]) > 10,
  },
  'third-time-lucky': {
    'first of three': (h, b) => b.length % 3 === 0, 'second of three': (h, b) => b.length % 3 === 1,
    'every other': (h, b) => b.length % 2 === 1, 'third hand only': (h, b) => b.length === 2,
    'from the third on': (h, b) => b.length >= 2,
  },
  'full-house': {
    'trips or better': (h) => largestSet(h) >= 3,
    'trips and a pair, or quads': (h) => countsOf(h) === '2,3' || largestSet(h) === 4,
    'two pair': (h) => countsOf(h) === '1,2,2',
  },
  'the-wheel': {
    'any straight': (h) => isStraight(h), 'straight with an ace': (h) => isStraight(h) && has(h, 'A'),
    'ace and a five': (h) => has(h, 'A') && has(h, '5'), 'all five or lower': (h) => h.every((c) => rankValue(c) <= 5),
    'wheel or 2-6': (h) => wheel(h) || '23456'.split('').every((r) => count(h, r) === 1),
    'suited wheel': (h) => wheel(h) && isFlush(h),
  },
  'calling-card': {
    'top card spade': (h) => suitOf(h[0]) === 'S', 'spade flush': (h) => h.every((c) => suitOf(c) === 'S'),
    'black card': (h) => h.some((c) => !isRed(c)),
  },
  'seven-heaven': {
    'two or more sevens': (h) => count(h, '7') >= 2, 'exactly three': (h) => count(h, '7') === 3,
    'any three of a kind': (h) => largestSet(h) >= 3, 'any seven': (h) => has(h, '7'),
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
  'next-in-line': {
    'first card never pays': (h, b) => b.length > 0 && isStraight([h[0], last(b)[0]]),
    'one up only': (h, b) => hv(h[0]) === hv(b.length ? last(b)[0] : '7C') + 1 ||
      (rankOf(h[0]) === '2' && rankOf(b.length ? last(b)[0] : '7C') === 'A'),
    'pairs count': (h, b) => { const p = b.length ? last(b)[0] : '7C'; return isStraight([h[0], p]) || rankOf(h[0]) === rankOf(p); },
    'wraps K-2': (h, b) => { const p = b.length ? last(b)[0] : '7C'; return isStraight([h[0], p]) || ['K2', '2K'].includes(rankOf(h[0]) + rankOf(p)); },
    'beats the card before': (h, b) => hv(h[0]) > hv(b.length ? last(b)[0] : '7C'),
    'aces high only': (h, b) => Math.abs(hv(h[0]) - hv(b.length ? last(b)[0] : '7C')) === 1,
  },
  'jacks-or-better': {
    'any pair': (h) => largestSet(h) >= 2 || isStraight(h) || isFlush(h),
    'tens or better': (h) => jacks(h) || (countsOf(h) === '1,1,1,2' && pairRank(h) === 10),
    'queens or better': (h) => jacks(h) && !(countsOf(h) === '1,1,1,2' && pairRank(h) === 11),
    'no straights': (h) => jacks(h) && !(isStraight(h) && !isFlush(h)),
    'no flushes': (h) => jacks(h) && !(isFlush(h) && !isStraight(h)),
    'two pair needs jacks': (h) => jacks(h) && !(countsOf(h) === '1,2,2' && high(setOf(h)) < 11),
    'high card jack': (h) => jacks(h) || high(h) >= 11,
  },
  'house-record': {
    'strictly beats': (h, b) => b.every((x) => largestSet(h) > largestSet(x)),
    'beats previous only': (h, b) => b.length === 0 || largestSet(h) >= largestSet(last(b)),
    'high card record': (h, b) => b.every((x) => high(h) >= high(x)),
  },
};

export const DOOR = ['full-house', 'house-record'];
