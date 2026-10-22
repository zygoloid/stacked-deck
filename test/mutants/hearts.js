// Mutants and door levels for chapter 1 (hearts). See test/mutants/shared.js.
import { rankOf, suitOf, rankValue, isStraight } from '../../src/cards.js';
import { hv, isRed } from './shared.js';

const r = (h) => rankOf(h[0]);
const s = (h) => suitOf(h[0]);

export const MUTANTS = {
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
  'lucky-seven': {
    '6 to 8': (h) => '678'.includes(r(h)), 'neighbours': (h) => '68'.includes(r(h)),
  },
  'penny-ante': {
    'aces high': (h) => '234'.includes(r(h)), 'A to 5': (h) => 'A2345'.includes(r(h)),
    '2 to 4': (h) => '234'.includes(r(h)), 'A to 3': (h) => 'A23'.includes(r(h)),
  },
  royalty: {
    'J and K only': (h) => 'JK'.includes(r(h)), 'with aces': (h) => 'JQKA'.includes(r(h)),
    'with tens': (h) => 'TJQK'.includes(r(h)),
  },
  'even-money': {
    'ace counts 14': (h) => hv(h[0]) % 2 === 0, 'no queen': (h) => '2468T'.includes(r(h)),
    'odd': (h) => rankValue(h[0]) % 2 === 1,
  },
};

export const DOOR = [];
