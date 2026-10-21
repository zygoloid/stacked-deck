// Cards are strings: rank + suit, e.g. "AS", "TD", "9C", "QH".
// Ranks: A 2 3 4 5 6 7 8 9 T J Q K. Suits: S D C H.

export const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K'];
export const SUITS = ['S', 'D', 'C', 'H'];

export const rankOf = (card) => card[0];
export const suitOf = (card) => card[1];

// 1..13 with ace low.
export const rankValue = (card) => RANKS.indexOf(rankOf(card)) + 1;
// 2..14 with ace high (as in Casino War).
export const highValue = (card) => (rankOf(card) === 'A' ? 14 : rankValue(card));

// New deck order (Bicycle-style): spades A-K, diamonds A-K, clubs K-A, hearts K-A.
export function newDeckIndex(card) {
  const s = SUITS.indexOf(suitOf(card));
  const r = rankValue(card) - 1;
  return s < 2 ? s * 13 + r : s * 13 + (12 - r);
}

export function fullDeck() {
  const deck = [];
  for (const s of SUITS) for (const r of RANKS) deck.push(r + s);
  return deck.sort((a, b) => newDeckIndex(a) - newDeckIndex(b));
}

export function isFlush(hand) {
  return hand.length > 0 && hand.every((c) => suitOf(c) === suitOf(hand[0]));
}

// Distinct ranks forming a consecutive run; ace may play low or high (no wrap).
// A single card counts as a straight.
export function isStraight(hand) {
  if (hand.length === 0) return false;
  const check = (vals) => {
    const sorted = [...vals].sort((a, b) => a - b);
    for (let i = 1; i < sorted.length; i++) if (sorted[i] !== sorted[i - 1] + 1) return false;
    return true;
  };
  return check(hand.map(rankValue)) || check(hand.map(highValue));
}

export function rankCounts(hand) {
  const counts = new Map();
  for (const c of hand) counts.set(rankOf(c), (counts.get(rankOf(c)) || 0) + 1);
  return counts;
}

export function largestSet(hand) {
  return Math.max(0, ...rankCounts(hand).values());
}

export const fmtHand = (hand) => '[' + hand.join(' ') + ']';

// Small deterministic PRNG so random tests are reproducible.
export function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffled(deck, rand) {
  const d = [...deck];
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}
