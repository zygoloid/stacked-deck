// Mutants and door levels for chapter 5 (the finale). See test/mutants/shared.js.
import { rankOf, suitOf, rankValue, largestSet, isFlush, isStraight } from '../../src/cards.js';
import { hv, isRed, last } from './shared.js';

const diff = (h, v) => Math.abs(v(h[0]) - v(h[1]));
const draw = (h) => isFlush(h) && isStraight([...h, '?']);

export const MUTANTS = {
  'mind-the-gap': {
    'within two': (h) => isStraight([...h, '?']) && rankOf(h[0]) !== rankOf(h[1]),
    'consecutive': (h) => isStraight(h),
    'aces low only': (h) => diff(h, rankValue) === 2, 'aces high only': (h) => diff(h, hv) === 2,
    'wraps K-2': (h) => [rankValue, hv].some((v) => diff(h, v) === 2) || ['K2', '2K'].includes(rankOf(h[0]) + rankOf(h[1])),
    'three apart': (h) => [rankValue, hv].some((v) => diff(h, v) === 3),
  },
  'straight-flush-draw': {
    'already a straight flush': (h) => isFlush(h) && isStraight(h),
    'flush': (h) => isFlush(h), 'straight draw': (h) => isStraight([...h, '?']),
    'no inside draws': (h) => isFlush(h) && isStraight(h),
    'aces high only': (h) => draw(h) && !(h.some((c) => rankOf(c) === 'A') && h.some((c) => '2345'.includes(rankOf(c)))),
    'two wild cards': (h) => isFlush(h) && isStraight([...h, '?', '?']),
  },
  'red-carpet': {
    'any pair': (h) => largestSet(h) >= 2,
    'pair with a red card': (h) => h.some((c) => isRed(c) && h.some((d) => d !== c && rankOf(d) === rankOf(c))),
    'black pair': (h) => largestSet(h.filter((c) => !isRed(c))) >= 2,
    'no black cards': (h) => h.every(isRed),
    'two red cards': (h) => h.filter(isRed).length >= 2,
  },
  'deja-vu': {
    'previous card only': (h, b) => b.length > 0 && rankOf(last(b)[0]) === rankOf(h[0]),
    'same suit before': (h, b) => b.some((x) => suitOf(x[0]) === suitOf(h[0])),
    'second time only': (h, b) => b.filter((x) => rankOf(x[0]) === rankOf(h[0])).length === 1,
    'first time': (h, b) => !b.some((x) => rankOf(x[0]) === rankOf(h[0])),
    'neighbour seen': (h, b) => b.some((x) => isStraight([x[0], h[0]])),
  },
};

export const DOOR = [];
