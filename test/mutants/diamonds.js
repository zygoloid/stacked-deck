// Mutants and door levels for chapter 2 (diamonds). See test/mutants/shared.js.
import { rankOf, suitOf, rankValue, largestSet, isFlush, isStraight } from '../../src/cards.js';
import { hv, high, isRed, has, count, countsOf } from './shared.js';

const between = (h, strict = true) => {
  const lo = Math.min(hv(h[0]), hv(h[2])), hi = Math.max(hv(h[0]), hv(h[2])), m = hv(h[1]);
  return strict ? lo < m && m < hi : lo <= m && m <= hi;
};

export const MUTANTS = {
  'red-flush': {
    'any flush': (h) => isFlush(h), 'all red': (h) => h.every(isRed),
    'hearts only': (h) => isFlush(h) && suitOf(h[0]) === 'H',
  },
  'either-or': {
    'suited or connected': (h) => isFlush(h) || isStraight(h), 'suited and connected': (h) => isFlush(h) && isStraight(h),
    'suited': (h) => isFlush(h), 'connected': (h) => isStraight(h),
    'ace low only': (h) => isFlush(h) !== (Math.abs(rankValue(h[0]) - rankValue(h[1])) === 1),
  },
  'pair-night': {
    'pair or better': (h) => largestSet(h) >= 2,
    'one pair only': (h) => countsOf(h) === '1,1,1,2',
    'no full house rule': (h) => largestSet(h) === 2 || countsOf(h) === '2,3',
  },
  'inside-seven': {
    'consecutive': (h) => isStraight(h), 'holds a 6 or 8': (h) => has(h, '6') || has(h, '8'),
    'sevens count': (h) => isStraight([...h, '7C']) || (has(h, '7') && h.some((c) => '68'.includes(rankOf(c)))),
    'any two from 5 to 9': (h) => h.every((c) => '56789'.includes(rankOf(c))) && rankOf(h[0]) !== rankOf(h[1]),
  },
  'seven-up': {
    'neighbours count': (h) => h.some((c) => '678'.includes(rankOf(c))),
    'not a pair of sevens': (h) => count(h, '7') === 1, 'top card only': (h) => rankOf(h[0]) === '7',
  },
  'lucky-number': {
    'at least one 7': (h) => has(h, '7'), 'two sevens': (h) => count(h, '7') === 2,
    'one or two sevens': (h) => [1, 2].includes(count(h, '7')),
  },
  'beat-the-dealer': { 'ties pay': (h) => hv(h[0]) >= 9, 'aces low': (h) => rankValue(h[0]) > 9 },
  'ace-in-the-hole': { 'king or better': (h) => high(h) >= 13, 'top card ace': (h) => rankOf(h[0]) === 'A' },
  'inside-bet': {
    '9 to K': (h) => high(h) >= 9 && high(h) <= 13, '10 to Q': (h) => high(h) >= 10 && high(h) <= 12,
    '8 to Q': (h) => high(h) >= 8 && high(h) <= 12, '9 to J': (h) => high(h) >= 9 && high(h) <= 11,
    'top card': (h) => hv(h[0]) >= 9 && hv(h[0]) <= 12,
  },
  'top-dog': {
    'ties pay': (h) => hv(h[0]) >= hv(h[1]), 'aces low': (h) => rankValue(h[0]) > rankValue(h[1]),
    'bottom beats top': (h) => hv(h[1]) > hv(h[0]),
  },
  'top-of-the-heap': {
    'ties pay': (h) => h.every((c) => hv(h[0]) >= hv(c)), 'beats the next card': (h) => hv(h[0]) > hv(h[1]),
    'beats the bottom card': (h) => hv(h[0]) > hv(h[4]), 'holds the high card': (h) => h.some((c) => hv(c) === high(h)),
    'aces low': (h) => h.slice(1).every((c) => rankValue(h[0]) > rankValue(c)),
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
