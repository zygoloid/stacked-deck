// The two published builds (tools/build-site.js): the live site says it is
// 'live' and leaves out the reference solutions; the beta says 'beta' and
// carries every floor's reference solution, for dev mode's par machines.
// Both are built into a temporary directory.
import assert from 'node:assert';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LEVELS, BONUS } from '../src/levels.js';
import { CHANNEL } from '../src/build.js';

assert.strictEqual(CHANNEL, 'dev', 'src/build.js says dev in the repository (only builds say otherwise)');
const dir = mkdtempSync(join(tmpdir(), 'stacked-deck-build-'));
try {
  const build = (...args) => execFileSync(process.execPath, [new URL('../tools/build-site.js', import.meta.url).pathname, ...args], { stdio: 'pipe' });
  build('--out', join(dir, 'live'));
  build('--beta', '--out', join(dir, 'beta'));
  const channel = (site) => /CHANNEL = '(\w+)'/.exec(readFileSync(join(site, 'src/build.js'), 'utf8'))?.[1];
  assert.strictEqual(channel(join(dir, 'live')), 'live');
  assert.strictEqual(channel(join(dir, 'beta')), 'beta');
  assert(!existsSync(join(dir, 'live/solutions')), 'the live site has no reference solutions');
  for (const l of [...LEVELS, ...BONUS]) assert(existsSync(join(dir, 'beta/solutions/levels', `${l.id}.js`)), `the beta has ${l.id}'s reference solution`);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
console.log('builds ok (live and beta)');
