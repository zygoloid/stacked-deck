// Unit checks for individual croupiers and engine features.
import assert from 'node:assert';
import { Floor, runTest, MAX_FLOOR_CARDS } from '../src/engine.js';
import { Sim } from '../src/ui/sim.js';

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
// Cut with both halves to one side completes the cut: the top half goes under.
{
  const floor = new Floor({ cells: [
    { at: [-1, 0], kind: 'source', out: 0 },
    { at: [0, 0], kind: 'croupier', fn: 'cut', out: { top: 0, bottom: 0 } },
    { at: [1, 0], kind: 'payout' },
  ] }, [['AS', '2S', '3S', '4S', '5S']]);
  for (let i = 0; i < 4; i++) floor.step();
  assert.deepStrictEqual(floor.paid, [['3S', '4S', '5S', 'AS', '2S']]);
}
console.log('stacking ok');
// War with both hands waiting plays them in the same round: one hand per
// round through a line of War croupiers, no stall cycles.
{
  const floor = new Floor({ cells: [
    { at: [-1, 0], kind: 'source', out: 0 },
    { at: [0, -1], kind: 'shoe', out: 1, deck: ['2C'] },
    { at: [0, 0], kind: 'croupier', fn: 'war', rule: 'high', dealer: 4, out: { win: 0 } },
    { at: [1, 0], kind: 'payout' },
  ] }, [['KS'], ['QS'], ['JS'], ['TS']]);
  const rounds = [];
  for (let i = 0; i < 8; i++) { floor.step(); rounds.push(floor.paid.length); }
  assert.deepStrictEqual(rounds, [0, 1, 2, 3, 4, 4, 4, 4], JSON.stringify(rounds));
}
console.log('same-round pickup ok');
// --- rules v7: burn, hand, jokers, advertising cards ---
const runFloor = (cells, inputs, rounds = 12) => {
  const f = new Floor({ cells }, inputs);
  for (let i = 0; i < rounds; i++) f.step();
  return f;
};
// Burn: top card one way, rest the other; both to one side moves the top card to the bottom.
{
  const f = runFloor([
    { at: [-1, 0], kind: 'source', out: 0 },
    { at: [0, 0], kind: 'croupier', fn: 'burn', out: { burn: 1, rest: 0 } },
    { at: [1, 0], kind: 'payout' }, { at: [0, 1], kind: 'payout' },
  ], [['AS', '2S', '3S']]);
  assert.deepStrictEqual(f.paid, [['2S', '3S'], ['AS']].sort((a, b) => b.length - a.length));
  const g = runFloor([
    { at: [-1, 0], kind: 'source', out: 0 },
    { at: [0, 0], kind: 'croupier', fn: 'burn', out: { burn: 0, rest: 0 } },
    { at: [1, 0], kind: 'payout' },
  ], [['AS', '2S', '3S']]);
  assert.deepStrictEqual(g.paid, [['2S', '3S', 'AS']]);
}
// Hand: regroups cards into hands of n; leftovers start the next hand, and a
// big input is dealt out over several rounds without new pickups.
{
  const f = runFloor([
    { at: [-1, 0], kind: 'source', out: 0 },
    { at: [0, 0], kind: 'croupier', fn: 'hand', n: 2, out: { out: 0 } },
    { at: [1, 0], kind: 'payout' },
  ], [['AS'], ['2S', '3S', '4S', '5S', '6S'], ['7S']], 15);
  assert.deepStrictEqual(f.paid, [['AS', '2S'], ['3S', '4S'], ['5S', '6S']]);
  assert.strictEqual(f.cells.get('0,0').held.buffer.map((x) => x.c).join(), '7S');
  assert(!f.done(), 'a leftover card is still held');
}
// Jokers are wild in Set and n of a kind; ad cards never join a set.
{
  const f = runFloor([
    { at: [-1, 0], kind: 'source', out: 0 },
    { at: [0, 0], kind: 'croupier', fn: 'set', out: { set: 0, rest: 1 } },
    { at: [1, 0], kind: 'payout' }, { at: [0, 1], kind: 'payout' },
  ], [['5S', '5H', '9C', '?', '$']]);
  assert.deepStrictEqual(f.paid, [['5S', '5H', '?'], ['9C', '$']]);
  const g = runFloor([
    { at: [-1, 0], kind: 'source', out: 0 },
    { at: [0, 0], kind: 'croupier', fn: 'set', out: { set: 0, rest: 1 } },
    { at: [1, 0], kind: 'payout' }, { at: [0, 1], kind: 'payout' },
  ], [['$', '$$']]);
  assert.deepStrictEqual(g.paid, [['$', '$$']], 'ad cards alone are all rest');
}
// Suits: the colour joker goes to the first suit with a port (S, H, D, C);
// the monochrome joker and ad cards go to misc.
{
  const f = runFloor([
    { at: [-1, 0], kind: 'source', out: 0 },
    { at: [0, 0], kind: 'croupier', fn: 'suits', out: { H: 0, D: 1, misc: 5 } },
    { at: [1, 0], kind: 'payout' }, { at: [0, 1], kind: 'payout' }, { at: [1, -1], kind: 'payout' },
  ], [['??', '2D', '?', '$', '3H']]);
  const byLen = f.paid.map((h) => h.join(' ')).sort();
  assert.deepStrictEqual(byLen, ['2D', '? $', '?? 3H']);
}
// War: jokers beat aces, ad cards lose to everything.
{
  const f = runFloor([
    { at: [-1, 0], kind: 'source', out: 0 },
    { at: [0, -1], kind: 'shoe', out: 1, deck: ['AS'] },
    { at: [0, 0], kind: 'croupier', fn: 'war', rule: 'high', dealer: 4, out: { win: 0 } },
    { at: [1, 0], kind: 'payout' },
  ], [['?'], ['$'], ['??']]);
  assert.deepStrictEqual(f.paid, [['?'], ['??']]);
}
console.log('rules v7 ok');
// Expected payouts: a level can ask for hands that aren't just a subset of
// the inputs, e.g. one payout per ace (repeats allowed), and optionally
// compare card order.
{
  const { runTest } = await import('../src/engine.js');
  const perAce = { expected: (inputs) => inputs.flatMap((h) => h.filter((c) => c[0] === 'A').map(() => h)) };
  const dupPay = { cells: [
    { at: [-1, 0], kind: 'source', out: 0 },
    { at: [0, 0], kind: 'croupier', fn: 'duplicate', out: { a: 0, b: 1 } },
    { at: [1, 0], kind: 'payout' }, { at: [0, 1], kind: 'payout' },
  ] };
  assert(runTest(dupPay, [['AS', 'AD', '3C']], perAce).ok, 'a two-ace hand paid twice');
  assert(!runTest(dupPay, [['AS', '2D', '3C']], perAce).ok, 'a one-ace hand paid twice is wrong');
  const sorted = { expected: (inputs) => inputs.map((h) => [...h].sort()), ordered: true };
  const passPay = { cells: [{ at: [-1, 0], kind: 'source', out: 0 }, { at: [0, 0], kind: 'payout' }] };
  assert(!runTest(passPay, [['KS', 'AS']], sorted).ok, 'ordered: KS AS is not AS KS');
  assert(runTest(passPay, [['AS', 'KS']], sorted).ok);
}
console.log('expected payouts ok');
// A house card still on its way to the desk after the last player card has
// gone is not cut off: the run waits (up to the grace period) for it.
{
  const { runTest } = await import('../src/engine.js');
  const level = { expected: (inputs) => inputs.map(() => ['AH']) };
  // The player's card is dropped at once; the shoe's A♥ walks three hexes.
  const spec = { cells: [
    { at: [-1, 0], kind: 'source', out: 0 },
    { at: [0, 0], kind: 'croupier', fn: 'war', rule: 'high', dealer: 4, out: { dwin: 0, dlose: 0 } },
    { at: [0, -1], kind: 'shoe', out: 1, deck: ['AH'] },
    { at: [1, 0], kind: 'croupier', fn: 'pass', out: { out: 0 } },
    { at: [2, 0], kind: 'croupier', fn: 'pass', out: { out: 0 } },
    { at: [3, 0], kind: 'payout' },
  ] };
  const r = runTest(spec, [['2S']], level);
  assert(r.ok, `house card in flight: ${JSON.stringify(r)}`);
  const bad = runTest(spec, [['2S'], ['3S']], { expected: (inputs) => inputs.map(() => ['AH']).concat([['KH']]) });
  assert(!bad.ok && bad.missing.length === 1, 'a payout that never comes still fails');
}
console.log('house cards in flight ok');
// Deal: one pile per side, each card dealt on top, so piles come out in
// reverse deal order; a side listed twice is still one pile.
{
  const run = (to, hand) => {
    const f = new Floor({ cells: [
      { at: [-1, 0], kind: 'source', out: 0 },
      { at: [0, 0], kind: 'croupier', fn: 'deal', out: { to } },
      { at: [1, 0], kind: 'payout' }, { at: [0, 1], kind: 'payout' },
    ] }, [hand]);
    for (let i = 0; i < 4; i++) f.step();
    return f.paid.map((h) => h.join(' ')).sort();
  };
  assert.deepStrictEqual(run([0, 0], ['AS', '2S', '3S', '4S']), ['4S 3S 2S AS'], 'repeated side reverses the hand');
  assert.deepStrictEqual(run([0], ['AS', '2S', '3S']), ['3S 2S AS'], 'one side reverses the hand');
  assert.deepStrictEqual(run([0, 1], ['AS', '2S', '3S', '4S', '5S']), ['4S 2S', '5S 3S AS']);
  assert.deepStrictEqual(run([0, 3], ['AS', '2S', '3S']), ['3S AS'], 'a side with no table drops its pile');
}
console.log('deal piles ok');
// Card limit: two duplicates feeding each other multiply the cards without
// bound; the run fails (overflow) instead of running out of memory.
{
  const spec = { cells: [
    { at: [0, 0], kind: 'source', out: 0 },
    { at: [1, 0], kind: 'croupier', fn: 'duplicate', out: { a: 0, b: 0 } },
    { at: [2, 0], kind: 'croupier', fn: 'duplicate', out: { a: 3, b: 3 } },
    { at: [1, 1], kind: 'payout' },
  ] };
  const pays = () => true;
  const r = runTest(spec, [['AS', 'KH']], pays);
  assert(r.overflow && !r.ok && !r.timeout, JSON.stringify(r));
  assert(r.rounds < 40, `overflowed in round ${r.rounds}`);
  const f = new Floor(spec, [['AS', 'KH']]);
  while (!f.overflowed()) f.step();
  assert(f.cardCount() > MAX_FLOOR_CARDS && f.cardCount() <= 4 * MAX_FLOOR_CARDS, String(f.cardCount()));
  assert.strictEqual(f.round, r.rounds);
  // The interactive simulator stops at the same round.
  const sim = new Sim(spec, [['AS', 'KH']], pays);
  while (!sim.finished) sim.step();
  assert.strictEqual(sim.status.kind, 'overflow');
  assert.strictEqual(sim.round, r.rounds);
}
// A machine that keeps a few cards in a loop is well under the limit.
{
  const f = new Floor({ cells: [
    { at: [0, 0], kind: 'source', out: 0 },
    { at: [1, 0], kind: 'croupier', fn: 'pass', out: { out: 0 } },
    { at: [2, 0], kind: 'croupier', fn: 'pass', out: { out: 3 } },
  ] }, [['AS', '2S', '3S']]);
  for (let i = 0; i < 20; i++) f.step();
  assert.strictEqual(f.cardCount(), 3);
  assert(!f.overflowed());
}
console.log('card limit ok');
