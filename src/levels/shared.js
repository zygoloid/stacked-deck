// Helpers shared by the chapter modules in src/levels/. See docs/campaign.md
// for the campaign plan and docs/architecture.md for the level format.
import {
  fullDeck, shuffled, rng, rankOf, suitOf, highValue, RANKS,
} from '../cards.js';

// All hexes within `radius` of [cq, cr].
export function hexRange(radius, [cq, cr] = [0, 0]) {
  const out = [];
  for (let q = -radius; q <= radius; q++) {
    for (let r = Math.max(-radius, -q - radius); r <= Math.min(radius, -q + radius); r++) {
      out.push([cq + q, cr + r]);
    }
  }
  return out;
}

// Hexes exactly `radius` away from [cq, cr].
export function hexRing(radius, [cq, cr] = [0, 0]) {
  const dist = ([q, r]) => (Math.abs(q) + Math.abs(r) + Math.abs(q + r)) / 2;
  return hexRange(radius).filter((h) => dist(h) === radius).map(([q, r]) => [cq + q, cr + r]);
}

// A screen rectangle: rows r0..r1, and in each row the hexes whose screen
// column x = 2q + r lies in x0..x1 (rows are offset by half a hex, as drawn).
export function hexRect(r0, r1, x0, x1) {
  const out = [];
  for (let r = r0; r <= r1; r++) {
    for (let x = x0; x <= x1; x++) if (((x - r) % 2 + 2) % 2 === 0) out.push([(x - r) / 2, r]);
  }
  return out;
}

// Fixed hands (strings like 'AS 2S'), then `nRandom` tests of `handsPerTest`
// hands dealt from one shuffled deck each.
export function makeTests({ handSize, handsPerTest, fixed = [], nRandom = 4, seed = 1 }) {
  const rand = rng(seed);
  const tests = fixed.map((t) => t.map((h) => h.split(' ')));
  for (let i = 0; i < nRandom; i++) {
    const deck = shuffled(fullDeck(), rand);
    const t = [];
    for (let j = 0; j < handsPerTest; j++) t.push(deck.slice(j * handSize, (j + 1) * handSize));
    tests.push(t);
  }
  return tests;
}

// Floor helpers: remove hexes (fixed cells, pillars) from a list of hexes.
const k = ([q, r]) => `${q},${r}`;
export function without(hexes, ...remove) {
  const gone = new Set(remove.flat().map((x) => k(Array.isArray(x) ? x : x.at)));
  const seen = new Set();
  return hexes.filter((h) => !gone.has(k(h)) && !seen.has(k(h)) && seen.add(k(h)));
}
export const floorOf = (hexes, fixed, ...holes) => without(hexes, fixed, ...holes);

// Sides and fixed cells.
export const E = 0, SE = 1, SW = 2, W = 3, NW = 4, NE = 5;
export const source = (at, out) => ({ at, kind: 'source', out });
export const desk = (at) => ({ at, kind: 'payout' });

// Hand predicates.
export const hv = highValue;
export const high = (h) => Math.max(...h.map(hv));
export const low = (h) => Math.min(...h.map(hv));
export const isRed = (c) => suitOf(c) === 'H' || suitOf(c) === 'D';
export const one = (s) => s.split(' ');            // '2S 3S' -> ['2S', '3S'] (1-card hands)
export const spadesOf = (h) => h.filter((c) => suitOf(c) === 'S');
export const countOf = (h, rank) => h.filter((c) => rankOf(c) === rank).length;

// Every 1-card hand of one suit, A..K.
export const suitRun = (s) => RANKS.map((r) => r + s);

// The palette grows in this order over the campaign; a level's palette is
// everything up to and including its newest croupier (see docs/campaign.md
// for which floor introduces each one). Groups are introduced together.
const INTRODUCED = [
  ['pass'], ['suits'], ['straight'], ['shoe', 'gather', 'cut'], ['flush'], ['kind'], ['war'],
  ['duplicate'], ['set'], ['inshuffle', 'outshuffle'], ['deal'], ['burn'], ['sort'], ['hand'],
];
export function paletteThrough(newest) {
  const i = INTRODUCED.findIndex((g) => g.includes(newest));
  if (i < 0) throw new Error(`unknown croupier ${newest}`);
  return INTRODUCED.slice(0, i + 1).flat();
}

// Attach par (from the chapter's PAR table) and fill in defaults.
export function finishChapter(levels, par) {
  for (const level of levels) {
    level.par = par[level.id];
    level.specialCards ??= [];
    level.warRules ??= ['high'];
  }
  return levels;
}
