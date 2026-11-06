// Runs rehearse.js (the rules-version rehearsal) on a small export made
// here from the reference solutions, so it keeps working between rules
// version changes. Part of npm test in test/emulator, after run.js.
import assert from 'node:assert';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LEVELS, BONUS } from '../../src/levels.js';
import { RULES_VERSION } from '../../src/engine.js';
import { solutionHash } from '../../src/score.js';

const byId = new Map([...LEVELS, ...BONUS].map((l) => [l.id, l]));
const reference = async (id) => (await import(`../../solutions/levels/${id}.js`)).default.cells;
const OLD = RULES_VERSION - 1;
const par = (id) => ({ croupiers: byId.get(id).par.croupiers, rounds: byId.get(id).par.rounds });
const sol = (cells, score) => ({ cells: JSON.stringify(cells), at: 1, rules: OLD, ...(score ? { score } : {}) });

const upper = await reference('upper-hand');
const small = await reference('small-change');
// Small Change's reference plus a shoe that pays an extra A♠ in round 202,
// after the floor is done: the old rules passed it; it pays a hand too many.
const cheat = [...small,
  { at: [1, -1], kind: 'croupier', fn: 'suits', out: { S: 1 } },
  { at: [1, -2], kind: 'shoe', deck: [...Array(200).fill('2C'), 'AS'], once: true, out: 1 }];
// Two Duplicates feeding each other: valid, broken under any rules.
const bomb = [
  { at: [-1, 0], kind: 'croupier', fn: 'duplicate', out: { a: 0, b: 0 } },
  { at: [0, 0], kind: 'croupier', fn: 'duplicate', out: { a: 3, b: 3 } },
];
const [uh, sh, ch, bh] = await Promise.all([upper, small, cheat, bomb].map(solutionHash));

const live = {
  config: { rulesVersion: OLD },
  solutions: {
    a: {
      'upper-hand': { [uh]: sol(upper, par('upper-hand')) },                  // same
      'small-change': { [sh]: sol(small, par('small-change')), [ch]: sol(cheat, { croupiers: 8, rounds: 130 }) }, // same; newly broken
    },
    b: {
      'upper-hand': {
        [uh]: sol(upper),                                                       // sent mid-switch: scored
        [bh]: sol(bomb, { broken: true }),                                      // still broken
        ['f'.repeat(32)]: sol(upper, { croupiers: 1, rounds: 1 }),              // wrong hash: invalid
        ['e'.repeat(32)]: { invalid: 'not JSON', rules: OLD, at: 1 },           // a tombstone, left alone
      },
    },
  },
  scores: { [`v${OLD}`]: { a: { 'small-change': { '8_130': true } } } },
  stats: { [`v${OLD}`]: { 'small-change': { points: { '8_130': 1 }, players: 1 } } },
  best: { [`v${OLD}`]: { 'small-change': { croupiers: 8, rounds: 130 } } },
  profiles: { a: { name: 'Ann' }, b: { name: 'Bob' } },
  friends: { a: { b: true }, b: { a: true } },
};

const dir = mkdtempSync(join(tmpdir(), 'rehearse-'));
try {
  const file = join(dir, 'live.json');
  writeFileSync(file, JSON.stringify(live));
  const expect = { same: 2, 'newly broken': 1, scored: 1, 'still broken': 1, invalid: 1 };
  const r = spawnSync(process.execPath, [new URL('./rehearse.js', import.meta.url).pathname], {
    env: { ...process.env, REHEARSE_EXPORT: file, REHEARSE_INSTANCE: 'rehearse-tests', REHEARSE_EXPECT: JSON.stringify(expect) },
    encoding: 'utf8',
  });
  if (r.status !== 0) console.log(r.stdout, r.stderr);
  assert.strictEqual(r.status, 0, 'the rehearsal passes');
  assert.match(r.stdout, /OK: 6 solutions scored under v\d+, 1 tombstones left alone/);

  // An export already on the new version is refused.
  writeFileSync(file, JSON.stringify({ ...live, config: { rulesVersion: RULES_VERSION } }));
  const again = spawnSync(process.execPath, [new URL('./rehearse.js', import.meta.url).pathname], {
    env: { ...process.env, REHEARSE_EXPORT: file, REHEARSE_INSTANCE: 'rehearse-tests' }, encoding: 'utf8',
  });
  assert.notStrictEqual(again.status, 0, 'an export already on the new version is refused');
  assert.match(again.stderr, /should be below/);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
console.log('rehearsal ok');
process.exit(0);
