// Helpers for the per-chapter mutant tables in test/mutants/<chapter>.js.
//
// Each chapter file exports
//   MUTANTS: { [levelId]: { [name]: (hand, earlierHands) => boolean } }
//     plausible wrong rules that some test hand must tell apart from the
//     level's real rule (a player who guessed the rule wrong must fail);
//     for a level with `expected(inputs)` a mutant is instead
//     (inputs) => payouts, and some test's payouts must differ (as
//     multisets of hands, compared like runTest does);
//   DOOR: [levelId, ...]
//     levels whose reference solution admits one hand at a time through a
//     ticket door (a War on the hex the source feeds) and must fail without it.
import { rankOf, suitOf, highValue } from '../../src/cards.js';

export const hv = highValue;
export const high = (h) => Math.max(...h.map(hv));
export const low = (h) => Math.min(...h.map(hv));
export const isRed = (c) => 'HD'.includes(suitOf(c));
export const last = (before) => before[before.length - 1];
export const has = (h, rank) => h.some((c) => rankOf(c) === rank);
export const count = (h, rank) => h.filter((c) => rankOf(c) === rank).length;

// '1,1,1,2' style shape of a hand's rank counts.
export function countsOf(h) {
  const m = new Map();
  for (const c of h) m.set(rankOf(c), (m.get(rankOf(c)) || 0) + 1);
  return [...m.values()].sort().join();
}
// The cards of the most common rank(s).
export function setOf(h) {
  const m = new Map();
  for (const c of h) m.set(rankOf(c), (m.get(rankOf(c)) || 0) + 1);
  const max = Math.max(...m.values());
  return h.filter((c) => m.get(rankOf(c)) === max);
}

// Cards in runs of n (leftovers dropped), and cards grouped by a key, in order.
export const chunks = (cards, n) => Array.from({ length: Math.floor(cards.length / n) }, (_, i) => cards.slice(i * n, i * n + n));
export function groupBy(cards, key) {
  const m = new Map();
  for (const c of cards) { if (!m.has(key(c))) m.set(key(c), []); m.get(key(c)).push(c); }
  return [...m.values()];
}
