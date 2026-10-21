// Sanity checks that the checker rejects wrong machines.
import { runTest } from '../src/engine.js';
import { PUZZLES } from '../src/puzzles.js';
import assert from 'node:assert';

const pz = PUZZLES.ace;
const t = pz.tests[0];
const payAll = { cells: [{ at: [0, 0], kind: 'source', dir: 0 }, { at: [1, 0], kind: 'payout' }] };
assert(!runTest(payAll, t, pz.pays).ok, 'paying everything must fail');
const scratchAll = { cells: [{ at: [0, 0], kind: 'source', dir: 0 }, { at: [1, 0], kind: 'croupier', fn: 'scratch' }] };
assert(!runTest(scratchAll, t, pz.pays).ok, 'paying nothing must fail');
const dropped = { cells: [{ at: [0, 0], kind: 'source', dir: 0 }, { at: [1, 0], kind: 'croupier', fn: 'pass', n: 3 }] };
const r = runTest(dropped, t, pz.pays);
assert(!r.ok && r.errors.length, 'cards on the floor must fail');
const stuck = { cells: [{ at: [0, 0], kind: 'source', dir: 0 }, { at: [1, 0], kind: 'croupier', fn: 'gather' }] };
assert(runTest(stuck, t, pz.pays, { maxRounds: 200 }).timeout, 'a jammed floor must time out');
console.log('checker ok');
