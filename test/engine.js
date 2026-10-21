// Unit checks for individual croupiers and engine features.
import assert from 'node:assert';
import { Floor } from '../src/engine.js';

// Suits: hearts east, spades+clubs south-east, rest (diamonds) to misc = west... via payout cells.
{
  const floor = new Floor({ cells: [
    { at: [0, 0], kind: 'source', out: 0 },
    { at: [1, 0], kind: 'croupier', fn: 'suits', out: { H: 0, S: 1, C: 1, misc: 5 } },
    { at: [2, 0], kind: 'payout' }, { at: [1, 1], kind: 'payout' }, { at: [2, -1], kind: 'payout' },
  ] }, [['AS', 'KH', '2D', '3C', '4H']]);
  for (let i = 0; i < 4; i++) floor.step();
  const paid = floor.paid.map((h) => h.join(' ')).sort();
  assert.deepStrictEqual(paid, ['2D', 'AS 3C', 'KH 4H'], paid);
}
// Suits with no misc: unmatched cards are dropped.
{
  const floor = new Floor({ cells: [
    { at: [0, 0], kind: 'source', out: 0 },
    { at: [1, 0], kind: 'croupier', fn: 'suits', out: { D: 0 } },
    { at: [2, 0], kind: 'payout' },
  ] }, [['AS', '2D', '3D']]);
  for (let i = 0; i < 5; i++) floor.step();
  assert.deepStrictEqual(floor.paid, [['2D', '3D']]);
  assert(floor.done());
}
// Snapshot / restore round-trips.
{
  const spec = { cells: [
    { at: [0, 0], kind: 'source', out: 0 },
    { at: [1, 0], kind: 'croupier', fn: 'pass', out: { out: 0 } },
    { at: [2, 0], kind: 'payout' },
  ] };
  const floor = new Floor(spec, [['AS'], ['2S'], ['3S']]);
  floor.step();
  const snap = floor.snapshot();
  const paidAfter = () => { for (let i = 0; i < 3; i++) floor.step(); return JSON.stringify(floor.paid); };
  const first = paidAfter();
  floor.restore(snap);
  assert.strictEqual(floor.round, 1);
  assert.strictEqual(paidAfter(), first);
}
console.log('engine ok');
// A deal with no sides and a shoe with no side drop their cards instead of crashing.
{
  const floor = new Floor({ cells: [
    { at: [0, 0], kind: 'source', out: 0 },
    { at: [1, 0], kind: 'croupier', fn: 'deal', out: {} },
    { at: [1, 1], kind: 'shoe', deck: ['AS'] },
  ] }, [['AS', '2D']]);
  for (let i = 0; i < 4; i++) floor.step();
  assert(floor.done());
}
console.log('engine edge cases ok');
