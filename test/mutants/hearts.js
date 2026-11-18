// Mutants and door levels for chapter 1 (hearts). See test/mutants/shared.js.
import { rankOf, suitOf, rankValue, isStraight, isFlush } from '../../src/cards.js';
import { hv, isRed, has, count } from './shared.js';

const r = (h) => rankOf(h[0]);
const black = (c) => !isRed(c);

// In the Black, with a different idea of when the pile is paid.
const blackPiles = (min, test) => (inputs) => {
  const out = [];
  let pile = [];
  for (const [c] of inputs) {
    if (!black(c)) continue;
    pile.push(c);
    if (pile.length >= min && test(pile)) { out.push(pile); pile = []; }
  }
  return out;
};
// Three's Company, each deal's three cards (or a wrong idea of a run).
const deals = (inputs) => {
  const out = [];
  for (let i = 0; i + 2 < inputs.length; i += 3) out.push([inputs[i][0], inputs[i + 1][0], inputs[i + 2][0]]);
  return out;
};

export const MUTANTS = {
  'red-and-black': {
    'desks swapped': (inputs) => inputs.map((h) => ({ desk: isRed(h[0]) ? 1 : 0, hand: h })),
    'hearts and spades': (inputs) => inputs.map((h) => ({ desk: 'HS'.includes(suitOf(h[0])) ? 0 : 1, hand: h })),
  },
  'two-at-a-time': {
    'pairs too': (h) => isStraight(h) || rankOf(h[0]) === rankOf(h[1]),
    'ace low only': (h) => Math.abs(rankValue(h[0]) - rankValue(h[1])) === 1,
    'ace high only': (h) => Math.abs(hv(h[0]) - hv(h[1])) === 1,
    'wraps K-2': (h) => isStraight(h) || ['K2', '2K'].includes(rankOf(h[0]) + rankOf(h[1])),
  },
  'thursdays-game': {
    'runs only': (h) => isStraight(h), 'suited only': (h) => isFlush(h),
    'same colour': (h) => isStraight(h) || isRed(h[0]) === isRed(h[1]),
    'not both': (h) => isStraight(h) !== isFlush(h),
    'pairs too': (h) => isStraight(h) || isFlush(h) || rankOf(h[0]) === rankOf(h[1]),
  },
  'threes-company': {
    'any two in a run': (inputs) => deals(inputs).filter((h) => isStraight(h.slice(0, 2)) || isStraight(h.slice(1)) || isStraight([h[0], h[2]])),
    'ace low only': (inputs) => deals(inputs).filter((h) => isStraight(h) && !h.some((c) => rankOf(c) === 'A' && h.some((d) => rankOf(d) === 'K'))),
    'wraps round': (inputs) => deals(inputs).filter((h) => isStraight(h) || ['QKA', 'KA2'].some((w) => [...w].every((x) => h.some((c) => rankOf(c) === x))) ||
      ['K', 'A', '2'].every((x) => h.some((c) => rankOf(c) === x))),
  },
  'in-the-black': {
    'one card is enough': blackPiles(1, isStraight),
    'spades only': (inputs) => blackPiles(2, isStraight)(inputs.filter(([c]) => suitOf(c) === 'S')),
    'pairs too': blackPiles(2, (p) => isStraight(p) || (p.length === 2 && rankOf(p[0]) === rankOf(p[1]))),
    'two at a time': (inputs) => {
      const b = inputs.map(([c]) => c).filter(black), out = [];
      for (let i = 0; i + 1 < b.length; i += 2) if (isStraight([b[i], b[i + 1]])) out.push([b[i], b[i + 1]]);
      return out;
    },
  },
  'top-and-bottom': {
    'top two': (inputs) => inputs.map((h) => [h[0], h[1]]),
    'bottom two': (inputs) => inputs.map((h) => [h[3], h[4]]),
    'top and middle': (inputs) => inputs.map((h) => [h[0], h[2]]),
    'one card each': (inputs) => inputs.flatMap((h) => [[h[0]], [h[4]]]),
  },
  'neighbours': {
    '6 only': (h) => r(h) === '6', '8 only': (h) => r(h) === '8', '6 to 8': (h) => '678'.includes(r(h)),
  },
  'lucky-seven': {
    '6 to 8': (h) => '678'.includes(r(h)), 'neighbours': (h) => '68'.includes(r(h)),
  },
  'sevens-and-eights': {
    'tables swapped': (h, before) => r(h) === (before.length % 2 ? '7' : '8'),
    'either table': (h) => '78'.includes(r(h)),
    'sevens only': (h) => r(h) === '7',
  },
  'seven-up': {
    'neighbours count': (h) => h.some((c) => '678'.includes(rankOf(c))),
    'not a pair of sevens': (h) => count(h, '7') === 1, 'top card only': (h) => rankOf(h[0]) === '7',
  },
  'even-money': {
    'ace counts 14': (h) => hv(h[0]) % 2 === 0, 'no queen': (h) => '2468T'.includes(r(h)),
    'odd': (h) => rankValue(h[0]) % 2 === 1,
  },
  'lucky-number': {
    'at least one 7': (h) => has(h, '7'), 'two sevens': (h) => count(h, '7') === 2,
    'one or two sevens': (h) => [1, 2].includes(count(h, '7')),
  },
};

export const DOOR = [];
