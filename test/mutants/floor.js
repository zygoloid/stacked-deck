// Mutants for the floor's levels (floors that left the campaign); see
// test/mutants/shared.js.
import { rankOf, suitOf, rankValue, isStraight, isFlush, largestSet } from '../../src/cards.js';
import { hv, high, isRed, has, countsOf } from './shared.js';

const r = (h) => rankOf(h[0]);
const s = (h) => suitOf(h[0]);

export const MUTANTS = {
  // Chapter 1's first floors.
  'hearts-only': { red: (h) => isRed(h[0]), diamonds: (h) => s(h) === 'D' },
  'seeing-red': { hearts: (h) => s(h) === 'H', diamonds: (h) => s(h) === 'D' },
  'standing-room': {
    red: (h) => isRed(h[0]), black: (h) => !isRed(h[0]), hearts: (h) => s(h) === 'H', spades: (h) => s(h) === 'S',
  },
  'black-tie': { spades: (h) => s(h) === 'S', clubs: (h) => s(h) === 'C' },
  'back-to-back': {
    'pairs too': (h) => isStraight(h) || rankOf(h[0]) === rankOf(h[1]),
    'ace low only': (h) => Math.abs(rankValue(h[0]) - rankValue(h[1])) === 1,
    'ace high only': (h) => Math.abs(hv(h[0]) - hv(h[1])) === 1,
    'wraps K-2': (h) => isStraight(h) || ['K2', '2K'].includes(rankOf(h[0]) + rankOf(h[1])),
  },
  'next-door': {
    '6 only': (h) => r(h) === '6', '8 only': (h) => r(h) === '8', '6 to 8': (h) => '678'.includes(r(h)),
  },
  // Chapter 2's floors replaced when Flush moved after War.
  'beat-the-dealer': { 'ties pay': (h) => hv(h[0]) >= 9, 'aces low': (h) => rankValue(h[0]) > 9 },
  'ace-in-the-hole': { 'king or better': (h) => high(h) >= 13, 'top card ace': (h) => rankOf(h[0]) === 'A' },
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
  'inside-bet': {
    '9 to K': (h) => high(h) >= 9 && high(h) <= 13, '10 to Q': (h) => high(h) >= 10 && high(h) <= 12,
    '8 to Q': (h) => high(h) >= 8 && high(h) <= 12, '9 to J': (h) => high(h) >= 9 && high(h) <= 11,
    'top card': (h) => hv(h[0]) >= 9 && hv(h[0]) <= 12,
  },
};

export const DOOR = [];
