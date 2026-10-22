// Mutants and door levels for chapter 4 (spades). See test/mutants/shared.js.
// PLACEHOLDER: the surviving entries from the 25-level campaign.
import { suitOf, rankValue, largestSet } from '../../src/cards.js';
import { hv, high, isRed, last, countsOf } from './shared.js';

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
  'full-house': {
    'trips or better': (h) => largestSet(h) >= 3,
    'trips and a pair, or quads': (h) => countsOf(h) === '2,3' || largestSet(h) === 4,
    'two pair': (h) => countsOf(h) === '1,2,2',
  },
  'calling-card': {
    'top card spade': (h) => suitOf(h[0]) === 'S', 'spade flush': (h) => h.every((c) => suitOf(c) === 'S'),
    'black card': (h) => h.some((c) => !isRed(c)),
  },
  'house-record': {
    'strictly beats': (h, b) => b.every((x) => largestSet(h) > largestSet(x)),
    'beats previous only': (h, b) => b.length === 0 || largestSet(h) >= largestSet(last(b)),
    'high card record': (h, b) => b.every((x) => high(h) >= high(x)),
  },
};

export const DOOR = ['full-house', 'calling-card', 'house-record'];
