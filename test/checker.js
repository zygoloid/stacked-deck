// Sanity checks that the checker rejects wrong machines.
import { runTest } from '../src/engine.js';
import { PUZZLES } from '../src/puzzles.js';
import assert from 'node:assert';

const pz = PUZZLES.ace;
const t = pz.tests[0];
const payAll = { cells: [{ at: [0, 0], kind: 'source', out: 0 }, { at: [1, 0], kind: 'payout' }] };
assert(!runTest(payAll, t, pz.pays).ok, 'paying everything must fail');
const dropAll = { cells: [{ at: [0, 0], kind: 'source', out: 0 }, { at: [1, 0], kind: 'croupier', fn: 'pass' }] };
const r = runTest(dropAll, t, pz.pays);
const wrongPort = { cells: [{ at: [0, 0], kind: 'source', out: 0 }, { at: [1, 0], kind: 'croupier', fn: 'pass', out: { out: 0 } }, { at: [2, 0], kind: 'payout' }] };
assert(!runTest(wrongPort, t, pz.pays).ok, 'passing everything to the desk must fail');
assert(!r.ok && !r.timeout, 'dropping everything must fail (but finish)');
const stuck = { cells: [{ at: [0, 0], kind: 'source', out: 0 }, { at: [1, 0], kind: 'croupier', fn: 'gather' }] };
assert(runTest(stuck, t, pz.pays, { maxRounds: 200 }).timeout, 'a jammed floor must time out');
console.log('checker ok');
