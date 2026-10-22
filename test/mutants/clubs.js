// Mutants and door levels for chapter 3 (clubs). See test/mutants/shared.js.
// PLACEHOLDER: the surviving entries from the 25-level campaign.
import { rankOf, suitOf, rankValue, largestSet } from '../../src/cards.js';
import { hv, high, low, setOf } from './shared.js';

export const MUTANTS = {
  'high-spade': {
    'any spade': (h) => h.some((c) => suitOf(c) === 'S'),
    'strictly highest': (h) => { const s = h.filter((c) => suitOf(c) === 'S'); return s.length > 0 && high(s) > high(h.filter((c) => suitOf(c) !== 'S')); },
    'aces low': (h) => { const s = h.filter((c) => suitOf(c) === 'S'); return s.length > 0 && Math.max(...s.map(rankValue)) >= Math.max(...h.map(rankValue)); },
  },
  'top-pair': {
    'any pair': (h) => largestSet(h) >= 2,
    'highest card paired': (h) => h.filter((c) => hv(c) === high(h)).length >= 2,
    'no pair counts': (h) => { const s = setOf(h); return high(s) === high(h); },
  },
  'new-rules': { 'high card': (h) => high(h) > 10, 'ties pay': (h) => hv(h[0]) >= 10 },
  'bottom-dealer': {
    'top card': (h) => hv(h[0]) > 10, 'high card': (h) => high(h) > 10, 'ties pay': (h) => hv(h[4]) >= 10,
    'second from bottom': (h) => hv(h[3]) > 10,
  },
  knockout: { 'top card ace': (h) => rankOf(h[0]) === 'A', 'king or better': (h) => high(h) >= 13 },
  'low-ball': {
    'ties pay': (h) => low(h) >= 5, 'aces low': (h) => Math.min(...h.map(rankValue)) > 5,
    'top card': (h) => hv(h[0]) > 5, 'high card': (h) => high(h) > 5,
  },
};

export const DOOR = [];
