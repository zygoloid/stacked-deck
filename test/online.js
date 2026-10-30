// Checks for src/online.js: which saved solutions upload, what a submission
// writes, reading stats, cleaning nicknames, merging cloud saves and timing
// out reads.
import assert from 'node:assert';
import { LEVELS, BONUS } from '../src/levels.js';
import { RULES_VERSION } from '../src/engine.js';
import { solutionHash } from '../src/score.js';
import {
  uploadCandidates, prepareUpload, submission, readStats, readFrontier, standing, cleanName, planMerge, withTimeout, MAX_MACHINE_CHARS,
} from '../src/online.js';

const ALL = [...LEVELS, ...BONUS];
const level = ALL.find((l) => l.id === 'opening-night');
const m = await import('../solutions/levels/opening-night.js');
const cells = (m.default ?? Object.values(m)[0]).cells ?? (m.default ?? Object.values(m)[0]);

{
  const ok = { cells, croupiers: 3, rounds: 33, at: 5, rules: RULES_VERSION };
  const save = { levels: { 'opening-night': { solutions: [
    ok,
    { ...ok, broken: true },
    { ...ok, rules: RULES_VERSION - 1 },
    { ...ok, uploaded: 'me' },
    { ...ok, uploaded: 'someone-else' },
  ] } } };
  const got = uploadCandidates(save, ALL, 'me');
  assert.deepStrictEqual(got.map((c) => save.levels['opening-night'].solutions.indexOf(c.sol)), [0, 4]);
  assert(got.every((c) => c.level === level));
  assert.deepStrictEqual(uploadCandidates(save, ALL, 'me', new Set([ok])).length, 1);
  assert.deepStrictEqual(uploadCandidates({ levels: {} }, ALL, 'me'), []);
}
{
  const prep = await prepareUpload(level, cells);
  assert.strictEqual(prep.hash, await solutionHash(cells));
  assert.deepStrictEqual(JSON.parse(prep.json), cells);
  assert.strictEqual(await prepareUpload(level, [{ ...cells[0], junk: 1 }]), null, 'invalid machines are not uploaded');
  const huge = [{ at: cells[0].at, kind: 'shoe', out: 0, deck: Array(1000).fill('AS') }];
  if (level.croupiers.includes('shoe')) assert.strictEqual(await prepareUpload(level, huge), null);
  assert(MAX_MACHINE_CHARS === 10000);
}
{
  const now = { '.sv': 'timestamp' };
  assert.deepStrictEqual(submission({ uid: 'u', levelId: 'opening-night', hash: 'h', json: '[]', at: 7, rules: 9, now }), {
    'limits/u/submit': { level: 'opening-night', hash: 'h', at: now },
    'solutions/u/opening-night/h': { cells: '[]', at: 7, rules: 9 },
  });
}
{
  assert.deepStrictEqual(readStats(null), { points: [], players: 0 });
  assert.deepStrictEqual(readStats({ points: { '3_33': 2, '4_30': 0, '5_20': -1, x: 3, '6_1': 1.5 }, players: 2 }),
    { points: [{ croupiers: 3, rounds: 33, count: 2 }], players: 2 });
}
{
  assert.strictEqual(cleanName('  Ace\u202e of\u200b  Clubs\n'), 'Ace of Clubs');
  assert.strictEqual(cleanName('x'.repeat(50)).length, 40);
  assert.strictEqual(cleanName('\u0007'), '');
  assert.strictEqual(cleanName(undefined), '');
}
console.log('online ok');

{
  // Cloud save merges.
  const sol = (h) => ({ cells: [], croupiers: 3, rounds: 33, at: 1, rules: 9, hash: h });
  const hashes = (ls) => new Map((ls?.solutions ?? []).map((s) => [s, s.hash]));
  const plan = (ls, remote, remoteSolutions) => planMerge({ ls, remote, remoteSolutions, localHashes: hashes(ls) });
  // Nothing anywhere.
  assert.deepStrictEqual(plan(undefined, null, null), { work: null, markSolved: false, pushSolved: false, add: [], remove: [], deleted: [], pushDeleted: [] });
  // Work: remote newer than the last sync and no local edits -> take; local
  // edits only -> push; both changed -> the newer wins.
  const cells = [{ at: [0, 0] }];
  assert.strictEqual(plan({ cells, workAt: 5, workSynced: 5 }, { work: { cells: '[]', at: 9 } }).work, 'take');
  assert.strictEqual(plan({ cells, workAt: 9, workSynced: 9 }, { work: { cells: '[]', at: 9 } }).work, null);
  assert.strictEqual(plan({ cells, workAt: 12, workSynced: 9 }, { work: { cells: '[]', at: 9 } }).work, 'push');
  assert.strictEqual(plan({ cells, workAt: 12, workSynced: 5 }, { work: { cells: '[]', at: 9 } }).work, 'push');
  assert.strictEqual(plan({ cells, workAt: 7, workSynced: 5 }, { work: { cells: '[]', at: 9 } }).work, 'take');
  assert.strictEqual(plan({ cells }, null).work, 'push', 'an old save with a machine and no times pushes it');
  assert.strictEqual(plan({ cells }, { work: { cells: '[]', at: 9 } }).work, 'take', '...but a remote one wins over it');
  assert.strictEqual(plan({ cells: [] }, null).work, null, 'an empty floor pushes nothing');
  // Solved is true if either is.
  assert.deepStrictEqual([plan({ solved: true }, null).pushSolved, plan({}, { solved: true }).markSolved], [true, true]);
  // Solutions: the union, minus deletions from either side.
  const a = sol('a'), b = sol('b');
  const p = plan({ solutions: [a, b], deleted: ['c'] }, { deleted: { b: true } },
    { a: { cells: '[]', at: 1, score: {} }, b: { cells: '[]', at: 2 }, c: { cells: '[]', at: 3 }, d: { cells: '[1]', at: 4 }, e: { invalid: 'x', rules: 9, at: 5 } });
  assert.deepStrictEqual(p.add, [{ hash: 'd', cells: '[1]', at: 4 }]);
  assert.deepStrictEqual(p.remove, [b]);
  assert.deepStrictEqual(p.deleted, ['b', 'c']);
  assert.deepStrictEqual(p.pushDeleted, ['c'], 'only deletions of solutions the account has');
  assert.deepStrictEqual(plan({ deleted: ['zz'] }, null, null).pushDeleted, []);
}
console.log('cloud save merges ok');
{
  // Emptying the floor syncs too.
  assert.strictEqual(planMerge({ ls: { cells: [], workAt: 12, workSynced: 9 }, remote: { work: { cells: '[1]', at: 9 } } }).work, 'push');
}
console.log('cloud save: emptied floors ok');
{
  // A read that settles in time is passed through; one that doesn't is given up on.
  assert.strictEqual(await withTimeout(Promise.resolve(7), 50, 'slow'), 7);
  await assert.rejects(withTimeout(Promise.reject(new Error('denied')), 50, 'slow'), /denied/);
  const never = new Promise(() => {});
  await assert.rejects(withTimeout(never, 20, 'no answer'), (e) => e.code === 'timeout' && e.message === 'no answer');
}
console.log('read timeouts ok');
{
  assert.deepStrictEqual(readFrontier({ '3_40': true, '5_31': true, junk: true }), [{ croupiers: 3, rounds: 40 }, { croupiers: 5, rounds: 31 }]);
  assert.deepStrictEqual(readFrontier(null), []);
  const par = { croupiers: 4, rounds: 40 };
  // Without everyone's scores there is no record.
  let st = standing({ best: { croupiers: 3, rounds: 45 }, par });
  assert.strictEqual(st.record, null);
  assert.deepStrictEqual(st.top, { croupiers: false, rounds: false });
  // The record counts everyone, friends, par and the player's own best (not uploaded yet).
  const stats = { points: [{ croupiers: 5, rounds: 38, count: 2 }, { croupiers: 6, rounds: 36, count: 1 }], players: 3 };
  st = standing({ best: { croupiers: 3, rounds: 45 }, par, stats });
  assert.deepStrictEqual(st.record, { croupiers: 3, rounds: 36 });
  assert.deepStrictEqual(st.top, { croupiers: true, rounds: false });
  st = standing({ best: { croupiers: 4, rounds: 36 }, par, stats: { points: [], players: 0 } });
  assert.deepStrictEqual(st.record, { croupiers: 4, rounds: 36 });
  assert.deepStrictEqual(st.top, { croupiers: true, rounds: true });
  // Friends who beat the player's best on either axis, with their best there.
  const friends = [
    { name: 'Ann', points: [{ croupiers: 2, rounds: 50 }, { croupiers: 5, rounds: 30 }] },
    { name: 'Bob', points: [{ croupiers: 4, rounds: 44 }] },
    { name: 'Cy', points: [] },
  ];
  st = standing({ best: { croupiers: 3, rounds: 45 }, par, stats, friends });
  assert.deepStrictEqual(st.beatenBy, [{ name: 'Ann', croupiers: 2, rounds: 30 }, { name: 'Bob', croupiers: null, rounds: 44 }]);
  assert.deepStrictEqual(st.record, { croupiers: 2, rounds: 30 });
  assert.deepStrictEqual(standing({ best: null, par, stats, friends }).beatenBy.map((f) => f.name), ['Ann', 'Bob'], 'unsolved: every friend who solved it');
  assert.deepStrictEqual(standing({ best: { croupiers: 2, rounds: 30 }, par, stats, friends }).beatenBy, []);
}
console.log('standings ok');
