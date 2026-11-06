// Rehearse a rules version change (docs/online.md, "Rules versions") on a
// copy of the live database, in the database emulator: load an export,
// judge every solution (rescore.js --dry-run), set config/rulesVersion,
// re-score (twice: the second run must find nothing to do), then check that
// scores, stats and best for the new version agree with the solutions, that
// tools/repair-best.js would change nothing, and that nothing else changed.
// From test/emulator:
//   firebase database:get / --instance zygoloid-stacked-deck --project zygoloid-github-io > live.json
//   REHEARSE_EXPORT=path/to/live.json npm run rehearse
// The export holds players' data: keep it on your own machine.
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
import { RULES_VERSION } from '../../src/engine.js';
import { bestRepairs } from '../../src/online.js';

assert(process.env.FIREBASE_DATABASE_EMULATOR_HOST, 'run under firebase emulators:exec (npm run rehearse)');
// A relative path is relative to where npm was run (INIT_CWD).
assert(process.env.REHEARSE_EXPORT, 'set REHEARSE_EXPORT to the path of an export of the database');
const file = resolve(process.env.INIT_CWD ?? process.cwd(), process.env.REHEARSE_EXPORT);
const live = JSON.parse(readFileSync(file, 'utf8'));
assert(live && typeof live === 'object' && live.solutions, `${file} has no solutions: export the whole database (/)`);

const fnRequire = createRequire(new URL('../../functions/package.json', import.meta.url));
const { initializeApp } = fnRequire('firebase-admin/app');
const { getDatabaseWithUrl } = fnRequire('firebase-admin/database');
const { rescore, check } = await import('../../functions/tools/rescore.js');
const app = initializeApp({ projectId: 'demo-stacked-deck' }, 'rehearse');
const db = getDatabaseWithUrl('https://zygoloid-stacked-deck.firebaseio.com', app);

const V = RULES_VERSION;
const from = live.config?.rulesVersion;
console.log(`Export: config/rulesVersion ${from}; rehearsing the change to ${V}`);
assert(Number.isInteger(from) && from < V, `the export's config/rulesVersion (${from}) should be below ${V}`);
await db.ref('/').set(live);

const describe = (s) => (!s ? 'unscored' : s.broken ? 'broken' : `${s.croupiers}/${s.rounds}`);
const report = (r) => {
  for (const x of r.items.filter((i) => i.change !== 'same').sort((a, b) => a.level.localeCompare(b.level))) {
    console.log(`  ${x.change}: ${x.uid}/${x.level}/${x.hash} ${describe(x.was)} -> ${x.now?.invalid ? `invalid (${x.now.invalid})` : describe(x.now)}`);
  }
  console.log(`  ${r.items.length} solutions: ${Object.entries(r.counts).map(([k, n]) => `${n} ${k}`).join(', ') || 'nothing to do'}`);
};

// 1. What would change (the same as rescore.js --dry-run against the live database).
console.log('\nDry run:');
const dry = await rescore(db, { dryRun: true });
report(dry);

// 2. Set the version, and 3. re-score.
await db.ref('config/rulesVersion').set(V);
console.log('\nRe-scoring:');
const t0 = Date.now();
const real = await rescore(db);
console.log(`  (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
report(real);
assert.deepStrictEqual(real.counts, dry.counts, 'the re-score did what the dry run said');
const again = await rescore(db);
assert.deepStrictEqual(again.counts, {}, 'a second run finds nothing to do');

// Afterwards: everything agrees, and nothing else changed.
const after = (await db.ref('/').get()).val();
const diffs = await check(db);
for (const d of diffs) console.log(`  ${d}`);
assert.deepStrictEqual(diffs, [], `scores, stats and best for v${V} agree with the solutions`);
assert.deepStrictEqual(bestRepairs(after.stats?.[`v${V}`] ?? {}, after.best?.[`v${V}`] ?? {}), {}, 'repair-best.js would change nothing');
for (const k of Object.keys(live)) {
  if (k === 'solutions' || k === 'config') continue;
  for (const [sub, v] of Object.entries(live[k] ?? {})) {
    assert.deepStrictEqual(after[k]?.[sub], v, `${k}/${sub} unchanged`);
  }
}
assert.deepStrictEqual({ ...after.config, rulesVersion: from }, live.config, 'config: only rulesVersion changed');
let tombstones = 0, scored = 0;
for (const [uid, byLevel] of Object.entries(live.solutions)) {
  for (const [level, byHash] of Object.entries(byLevel ?? {})) {
    for (const [hash, sol] of Object.entries(byHash ?? {})) {
      const now = after.solutions[uid][level][hash];
      if (sol.invalid) { assert.deepStrictEqual(now, sol, 'tombstones unchanged'); tombstones++; continue; }
      assert(now.invalid || (now.rules === V && now.score), `${uid}/${level}/${hash} is scored under v${V}`);
      const { rules, score, ...rest } = now;
      if (!now.invalid) assert.deepStrictEqual(rest, (({ rules: _r, score: _s, ...x }) => x)(sol), 'only rules and score changed');
      scored++;
    }
  }
}
console.log(`\nOK: ${scored} solutions scored under v${V}, ${tombstones} tombstones left alone; scores, stats and best for v${V} agree; everything else unchanged.`);

// How each floor's best known score moves.
const bestOld = live.best?.[`v${from}`] ?? {}, bestNew = after.best?.[`v${V}`] ?? {};
for (const level of [...new Set([...Object.keys(bestOld), ...Object.keys(bestNew)])].sort()) {
  const a = bestOld[level], b = bestNew[level];
  if (JSON.stringify(a) !== JSON.stringify(b)) console.log(`  best ${level}: ${a ? `${a.croupiers}/${a.rounds}` : 'none'} -> ${b ? `${b.croupiers}/${b.rounds}` : 'none'}`);
}
await app.delete();
process.exit(0);
