// Cards are strings: rank + suit, e.g. "AS", "TD", "9C", "QH".
// Ranks: A 2 3 4 5 6 7 8 9 T J Q K. Suits: S D C H.
//
// Special cards (late game, only ever dealt by shoes):
//   '?'   monochrome joker: wild for value, no suit
//   '??'  colour joker: wild for value, every suit
//   '$'   front advertising card: no value, no suit; first in new deck order
//   '$$'  back advertising card: no value, no suit; last in new deck order
// Jokers are wild in n of a kind, Set and Straight, and beat everything in
// War. Advertising cards are never part of a set, a run or a flush, and lose
// to everything in War.

export const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K'];
export const SUITS = ['S', 'D', 'C', 'H'];
export const SPECIALS = ['?', '??', '$', '$$'];

export const isJoker = (card) => card === '?' || card === '??';
export const isAd = (card) => card === '$' || card === '$$';
export const isSpecial = (card) => isJoker(card) || isAd(card);
export const isCard = (card) => SPECIALS.includes(card) ||
  (typeof card === 'string' && card.length === 2 && RANKS.includes(card[0]) && SUITS.includes(card[1]));

export const rankOf = (card) => card[0];
export const suitOf = (card) => card[1];
// The suits a card counts as: the colour joker has all four, the monochrome
// joker and advertising cards have none.
export const suitsOf = (card) => (card === '??' ? ['S', 'H', 'D', 'C'] : isSpecial(card) ? [] : [card[1]]);

// 1..13 with ace low (natural cards only).
export const rankValue = (card) => RANKS.indexOf(rankOf(card)) + 1;
// War value: 2..14 with ace high; jokers 15, advertising cards 0.
export const highValue = (card) => (isJoker(card) ? 15 : isAd(card) ? 0
  : rankOf(card) === 'A' ? 14 : rankValue(card));

// New deck order (Bicycle-style): front ad card, spades A-K, diamonds A-K,
// clubs K-A, hearts K-A, jokers, back ad card.
export function newDeckIndex(card) {
  if (card === '$') return -1;
  if (card === '?') return 52;
  if (card === '??') return 53;
  if (card === '$$') return 54;
  const s = SUITS.indexOf(suitOf(card));
  const r = rankValue(card) - 1;
  return s < 2 ? s * 13 + r : s * 13 + (12 - r);
}

export function fullDeck() {
  const deck = [];
  for (const s of SUITS) for (const r of RANKS) deck.push(r + s);
  return deck.sort((a, b) => newDeckIndex(a) - newDeckIndex(b));
}

// Every card shares a suit (the colour joker matches any suit).
export function isFlush(hand) {
  if (!hand.length) return false;
  let common = ['S', 'H', 'D', 'C'];
  for (const c of hand) common = common.filter((x) => suitsOf(c).includes(x));
  return common.length > 0;
}

// Distinct ranks forming a consecutive run, jokers filling any gaps or ends;
// ace may play low or high (no wrap). A single card counts as a straight; an
// advertising card spoils any run.
export function isStraight(hand) {
  if (hand.length === 0 || hand.length > 13 || hand.some(isAd)) return false;
  const natural = hand.filter((c) => !isJoker(c));
  if (!natural.length) return true;
  const check = (vals) => {
    if (new Set(vals).size !== vals.length) return false;
    return Math.max(...vals) - Math.min(...vals) + 1 <= hand.length;
  };
  return check(natural.map(rankValue)) || check(natural.map(highValue));
}

// Counts of natural ranks (jokers and advertising cards are not counted).
export function rankCounts(hand) {
  const counts = new Map();
  for (const c of hand) {
    if (isSpecial(c)) continue;
    counts.set(rankOf(c), (counts.get(rankOf(c)) || 0) + 1);
  }
  return counts;
}

// Size of the biggest set, with jokers joining it.
export function largestSet(hand) {
  return Math.max(0, ...rankCounts(hand).values()) + hand.filter(isJoker).length;
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
