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
// Croupiers turn to face their last output, so a pass prioritises inputs
// clockwise from its output side.
{
  const floor = new Floor({ cells: [
    { at: [-1, 0], kind: 'shoe', out: 0, deck: ['2C'] },   // feeds from W
    { at: [1, -1], kind: 'shoe', out: 2, deck: ['KC'] },   // feeds from NE
    { at: [0, 0], kind: 'croupier', fn: 'pass', facing: 5, out: { out: 0 } },
    { at: [1, 0], kind: 'payout' },
  ] }, []);
  for (let i = 0; i < 8; i++) floor.step();
  const pass = floor.cells.get('0,0');
  assert.strictEqual(pass.facing, 0, 'pass faces its output');
  // Starts facing NE so takes K first; afterwards faces E and scans E, SE, SW, W: always the 2.
  assert.deepStrictEqual(floor.paid.map((h) => h[0]), ['KC', '2C', '2C', '2C', '2C', '2C', '2C'], JSON.stringify(floor.paid));
}
{
  const floor = new Floor({ cells: [
    { at: [-1, 0], kind: 'source', out: 0 },
    { at: [0, 0], kind: 'croupier', fn: 'cut', out: { top: 5, bottom: 1 } },
  ] }, [['AS', '2S', '3S'], ['4S']]);
  floor.step(); floor.step();
  assert.strictEqual(floor.cells.get('0,0').facing, 1, 'cut faces bottom');
}
console.log('facing ok');
// Outputs to the same side are stacked into one hand: War with every port
// pointing east hands on one hand, the winner on top.
{
  const floor = new Floor({ cells: [
    { at: [-1, 0], kind: 'source', out: 0 },
    { at: [0, -1], kind: 'shoe', out: 1, deck: ['9C'] },
    { at: [0, 0], kind: 'croupier', fn: 'war', rule: 'high', dealer: 4, out: { win: 0, lose: 0, dwin: 0, dlose: 0 } },
    { at: [1, 0], kind: 'payout' },
  ] }, [['KS'], ['2S']]);
  for (let i = 0; i < 8; i++) floor.step();
  assert.deepStrictEqual(floor.paid, [['KS', '9C'], ['9C', '2S']], JSON.stringify(floor.paid));
}
// Cut with both halves to one side gives back the original hand.
{
  const floor = new Floor({ cells: [
    { at: [-1, 0], kind: 'source', out: 0 },
    { at: [0, 0], kind: 'croupier', fn: 'cut', out: { top: 0, bottom: 0 } },
    { at: [1, 0], kind: 'payout' },
  ] }, [['AS', '2S', '3S', '4S', '5S']]);
  for (let i = 0; i < 4; i++) floor.step();
  assert.deepStrictEqual(floor.paid, [['AS', '2S', '3S', '4S', '5S']]);
}
console.log('stacking ok');
