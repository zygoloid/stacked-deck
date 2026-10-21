// Same machine as even-core.js, but with a single chip desk: the three
// payout streams have to be walked to it with runners (pass croupiers),
// because nothing in the core set can merge two streams into one.
import base from './even-core.js';

const drop = new Set(['4,-1', '8,1', '7,0']); // old desks + stage 3's scratch
const cells = base.cells.filter((c) => !drop.has(c.at.join(','))).map((c) => ({ ...c }));
for (const c of cells) if (c.at.join(',') === '7,1') c.flip = true; // stage 3 yes-cut: X -> NW
cells.push(
  { at: [8, 1], kind: 'croupier', fn: 'scratch' },
  { at: [7, 0], kind: 'croupier', fn: 'pass', n: 2 },  // from SE -> W into desk
  { at: [4, -1], kind: 'croupier', fn: 'pass', n: 2 }, // stage 1 X: from W -> NE
  { at: [5, -2], kind: 'croupier', fn: 'pass', n: 4 }, // from SW -> E
  { at: [6, -2], kind: 'croupier', fn: 'pass', n: 4 }, // from W -> SE
  { at: [6, -1], kind: 'croupier', fn: 'pass', n: 3 }, // from NW -> SE into desk
);
export default { ...base, cells };
