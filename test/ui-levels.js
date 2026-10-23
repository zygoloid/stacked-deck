// Test-only bonus floors for tools/ui-smoke.js. The UI appends these to the
// bonus deck only when the page URL has `?testlevels` (src/ui/catalog.js), so
// the smoke test can cover `expected` / `ordered` floors and bonus unlocking
// whatever the real content is. Not part of the game; ids start with `test-`.
import { newDeckIndex } from '../src/cards.js';

const source = (at, out) => ({ at, kind: 'source', out });
const desk = (at) => ({ at, kind: 'payout' });
// Radius-2 hexagon around the origin, minus the fixed cells.
const FIXED = [source([-1, 0], 0), desk([1, 0])];
const hexes = [];
for (let q = -2; q <= 2; q++) for (let r = -2; r <= 2; r++) if (Math.abs(q + r) <= 2) hexes.push([q, r]);
const floor = hexes.filter(([q, r]) => !FIXED.some((c) => c.at[0] === q && c.at[1] === r));
const tests = (...ts) => ts.map((t) => t.map((hand) => hand.split(' ')));
const deckOrder = (hand) => [...hand].sort((a, b) => newDeckIndex(a) - newDeckIndex(b));

export const BONUS = [
  {
    id: 'test-pay-twice',
    card: 'AS',
    unlockAfter: 'opening-night',
    title: 'Double or Nothing',
    story: ['Test floor: every hand is paid twice.'],
    brief: 'Pay every hand twice.',
    handSize: 2,
    floor, fixed: FIXED,
    croupiers: ['pass', 'duplicate'],
    expected: (inputs) => inputs.flatMap((hand) => [hand, hand]),
    tests: tests(['AS 5H', 'KD 2C', '9S 9H'], ['QH JD', '3C 4S']),
  },
  {
    id: 'test-sorted',
    card: 'KH',
    unlockAfter: 'opening-night',
    title: 'Fresh Out of the Box',
    story: ['Test floor: every hand is paid in new deck order.'],
    brief: 'Pay every hand sorted into new deck order.',
    handSize: 3,
    floor, fixed: FIXED,
    croupiers: ['pass', 'sort'],
    ordered: true,
    expected: (inputs) => inputs.map(deckOrder),
    tests: tests(['KS AS 5D', '2H 3H 7C'], ['QD JC TS']),
  },
  {
    id: 'test-locked',
    unlockAfter: 'around-the-bar',
    title: 'Back Room',
    story: ['Test floor: opens after the second campaign floor.'],
    brief: 'Pay out every card.',
    handSize: 1,
    floor, fixed: FIXED,
    croupiers: ['pass'],
    pays: () => true,
    tests: tests(['AS', '2D']),
  },
];

// Machines for the floors above (player cells, as saved).
export const SOLUTIONS = {
  'test-pay-twice': [
    { at: [0, 0], kind: 'croupier', fn: 'duplicate', out: { a: 0, b: 1 } },
    { at: [0, 1], kind: 'croupier', fn: 'pass', out: { out: 5 } },
  ],
  'test-sorted': [{ at: [0, 0], kind: 'croupier', fn: 'sort', out: { out: 0 } }],
  'test-sorted-wrong': [{ at: [0, 0], kind: 'croupier', fn: 'pass', out: { out: 0 } }],
};
