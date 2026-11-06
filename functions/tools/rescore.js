// Re-scoring for a rules version change (docs/online.md, "Rules versions"),
// run by hand with the database's admin rights; not a deployed function.
//
//   node tools/copy-game.js          (from the repository: the engine it scores with)
//   node functions/tools/rescore.js --dry-run   what it would do; writes nothing
//   node functions/tools/rescore.js             re-score (needs config/rulesVersion = RULES_VERSION)
//   node functions/tools/rescore.js --check     compare scores, stats and best with the solutions
// Options: --instance <name> (default this game's instance). Credentials are
// the Application Default Credentials (gcloud auth application-default
// login); against the emulator, set FIREBASE_DATABASE_EMULATOR_HOST.
//
// Every solution tagged with an older rules version (scored or not) is
// retagged RULES_VERSION and scored again exactly as the trigger scores a
// new submission (processSolution): its point goes into scores, stats and
// best for the new version, or it becomes broken, or (if it no longer
// validates) a tombstone. Solutions already tagged RULES_VERSION but not yet
// scored are scored too. Tombstones, and everything under older versions'
// scores, stats and best, are left alone. Adding a point is commutative and
// idempotent, so this can run while new submissions are being scored, and
// can be run again (after a crash, say) to finish the job.
import { pathToFileURL } from 'node:url';
import { RULES_VERSION } from '../game/engine.js';
import { readStats, readFrontier, recordOf, readRecord } from '../game/online.js';
import { judgeSolution, processSolution, pointKey } from '../solutions.js';

const CONCURRENCY = 4;

// Every solution: [{ uid, level, hash, sol }].
async function allSolutions(db) {
  const tree = (await db.ref('solutions').get()).val() ?? {};
  const out = [];
  for (const [uid, byLevel] of Object.entries(tree)) {
    for (const [level, byHash] of Object.entries(byLevel ?? {})) {
      for (const [hash, sol] of Object.entries(byHash ?? {})) out.push({ uid, level, hash, sol });
    }
  }
  return out;
}

// What a solution's score says, for reports.
const describe = (score) => (!score ? 'unscored' : score.broken ? 'broken' : `${score.croupiers} croupiers, ${score.rounds} rounds`);

// Run fn over items, a few at a time.
async function pool(items, fn) {
  let next = 0;
  await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
    while (next < items.length) await fn(items[next++]);
  }));
}

// Re-score (or with dryRun, only judge) every solution that needs it.
// Returns { version, items: [{ uid, level, hash, was, now, change }], counts }
// where `change` is one of: same, rounds, croupiers and rounds, newly broken,
// fixed, scored (was unscored), still broken, invalid, deleted.
export async function rescore(db, { dryRun = false, log = () => {} } = {}) {
  const version = RULES_VERSION;
  if (!dryRun) {
    const server = (await db.ref('config/rulesVersion').get()).val();
    if (server !== version) throw new Error(`config/rulesVersion is ${JSON.stringify(server)}, not ${version}: set it first (docs/online.md, "Rules versions")`);
    if ((await db.ref('config/scoringPaused').get()).val()) throw new Error('config/scoringPaused is set: nothing would be scored');
  }
  const todo = (await allSolutions(db)).filter(({ sol }) => sol && typeof sol === 'object' && !sol.invalid &&
    Number.isInteger(sol.rules) && (sol.rules < version || (sol.rules === version && !sol.score)));
  const items = [];
  await pool(todo, async ({ uid, level, hash, sol }) => {
    const was = sol.rules < version ? sol.score ?? null : null;
    let now;
    if (dryRun) {
      const res = await judgeSolution(level, hash, sol);
      now = res.invalid ? { invalid: res.invalid } : res.ok ? { croupiers: res.croupiers, rounds: res.rounds } : { broken: true };
    } else {
      const ref = db.ref(`solutions/${uid}/${level}/${hash}`);
      if (sol.rules < version) {
        // Retag it as an unscored submission under this version (unless it
        // changed meanwhile), then score it as the trigger would.
        await ref.transaction((current) => {
          if (current === null) return null; // a cached miss: the server retries with the real value
          if (current.invalid || !(current.rules < version)) return undefined; // nothing to do
          return { ...current, rules: version, score: null };
        });
      }
      const result = await processSolution(db, { uid, level, hash });
      if (result === 'paused' || result === 'other version') throw new Error(`${uid}/${level}/${hash}: ${result}`);
      const node = (await ref.get()).val();
      now = !node ? null : node.invalid ? { invalid: node.invalid } : node.score ?? null;
    }
    const change = !now ? 'deleted'
      : now.invalid ? 'invalid'
      : !was ? (now.broken ? 'broken' : 'scored')
      : was.broken ? (now.broken ? 'still broken' : 'fixed')
      : now.broken ? 'newly broken'
      : now.rounds === was.rounds && now.croupiers === was.croupiers ? 'same'
      : now.croupiers === was.croupiers ? 'rounds' : 'croupiers and rounds';
    const item = { uid, level, hash, was, now, change };
    items.push(item);
    if (change !== 'same') log(`${uid}/${level}/${hash}: ${change}: ${describe(was)} -> ${now?.invalid ? `invalid (${now.invalid})` : describe(now)}`);
  });
  const counts = {};
  for (const { change } of items) counts[change] = (counts[change] ?? 0) + 1;
  return { version, items, counts };
}

// Compare scores, stats and best for `version` with what the solutions
// scored under it say they should be. Returns a list of differences (empty
// if they agree). Zero counts left in stats by increments are ignored.
export async function check(db, version = RULES_VERSION) {
  const diffs = [];
  // Each player's frontier on each floor, from their scored solutions.
  const want = {};
  for (const { uid, level, sol } of await allSolutions(db)) {
    if (sol?.rules !== version || !sol.score || sol.score.broken) continue;
    ((want[uid] ??= {})[level] ??= new Set()).add(pointKey(sol.score));
  }
  const beats = (a, b) => a.croupiers <= b.croupiers && a.rounds <= b.rounds;
  const frontier = (keys) => {
    const pts = readFrontier(Object.fromEntries([...keys].map((k) => [k, true])));
    return pts.filter((p) => !pts.some((q) => q !== p && beats(q, p))).map(pointKey).sort();
  };
  const scores = (await db.ref(`scores/v${version}`).get()).val() ?? {};
  const stats = {};
  for (const uid of new Set([...Object.keys(want), ...Object.keys(scores)])) {
    for (const level of new Set([...Object.keys(want[uid] ?? {}), ...Object.keys(scores[uid] ?? {})])) {
      const should = frontier(want[uid]?.[level] ?? []);
      const have = readFrontier(scores[uid]?.[level]).map(pointKey).sort();
      if (should.join() !== have.join()) diffs.push(`scores/v${version}/${uid}/${level}: ${have.join(' ') || 'none'}, should be ${should.join(' ') || 'none'}`);
      if (!should.length) continue;
      const s = (stats[level] ??= { points: {}, players: 0 });
      s.players++;
      for (const k of should) s.points[k] = (s.points[k] ?? 0) + 1;
    }
  }
  const haveStats = (await db.ref(`stats/v${version}`).get()).val() ?? {};
  const haveBest = (await db.ref(`best/v${version}`).get()).val() ?? {};
  for (const level of new Set([...Object.keys(stats), ...Object.keys(haveStats), ...Object.keys(haveBest)])) {
    const norm = (node) => {
      const { points, players } = readStats(node);
      return JSON.stringify({ points: points.map((p) => `${pointKey(p)}x${p.count}`).sort(), players });
    };
    if (norm(stats[level]) !== norm(haveStats[level])) diffs.push(`stats/v${version}/${level}: ${norm(haveStats[level])}, should be ${norm(stats[level])}`);
    const should = recordOf(stats[level]), have = readRecord(haveBest[level]);
    if (JSON.stringify(should) !== JSON.stringify(have)) diffs.push(`best/v${version}/${level}: ${JSON.stringify(have)}, should be ${JSON.stringify(should)}`);
  }
  return diffs;
}

async function main() {
  const args = process.argv.slice(2);
  const opt = (name) => { const i = args.indexOf(name); return i < 0 ? undefined : args[i + 1]; };
  const { createRequire } = await import('node:module');
  const require = createRequire(import.meta.url);
  const { initializeApp } = require('firebase-admin/app');
  const { getDatabaseWithUrl } = require('firebase-admin/database');
  const { PROJECT, INSTANCE } = await import('../config.js');
  const instance = opt('--instance') ?? INSTANCE;
  const app = initializeApp({ projectId: PROJECT });
  const db = getDatabaseWithUrl(`https://${instance}.firebaseio.com`, app);
  const where = process.env.FIREBASE_DATABASE_EMULATOR_HOST ? `the emulator's ${instance}` : instance;
  try {
    if (args.includes('--check')) {
      const diffs = await check(db);
      for (const d of diffs) console.log(d);
      console.log(`${where}: ${diffs.length ? `${diffs.length} differences` : `scores, stats and best for v${RULES_VERSION} agree with the solutions`}`);
      process.exitCode = diffs.length ? 1 : 0;
    } else {
      const dryRun = args.includes('--dry-run');
      console.log(`${dryRun ? 'Dry run: judging' : 'Re-scoring'} solutions in ${where} under rules version ${RULES_VERSION}`);
      const { items, counts } = await rescore(db, { dryRun, log: (l) => console.log(`  ${l}`) });
      console.log(`${items.length} solutions: ${Object.entries(counts).map(([k, n]) => `${n} ${k}`).join(', ') || 'nothing to do'}`);
    }
  } finally {
    await app.delete();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) await main();
