// Checks for src/online.js: which saved solutions upload, what a submission
// writes, reading stats, and cleaning nicknames.
import assert from 'node:assert';
import { LEVELS, BONUS } from '../src/levels.js';
import { RULES_VERSION } from '../src/engine.js';
import { solutionHash } from '../src/score.js';
import { uploadCandidates, prepareUpload, submission, readStats, cleanName, MAX_MACHINE_CHARS } from '../src/online.js';

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
  assert.strictEqual(cleanName('  Ace‮ of​  Clubs\n'), 'Ace of Clubs');
  assert.strictEqual(cleanName('x'.repeat(50)).length, 40);
  assert.strictEqual(cleanName('\u0007'), '');
  assert.strictEqual(cleanName(undefined), '');
}
console.log('online ok');
