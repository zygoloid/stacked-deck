// Scoring submitted solutions, and keeping each player's frontier and the
// per-floor stats. See docs/online.md ("Functions").
import { Worker } from 'node:worker_threads';
import { ServerValue } from 'firebase-admin/database';
import { RULES_VERSION } from './game/engine.js';
import { LEVELS, BONUS } from './game/levels.js';
import { validateCells, solutionHash } from './game/score.js';

const LEVEL_BY_ID = new Map([...LEVELS, ...BONUS].map((l) => [l.id, l]));

// Limits for scoring one machine. The engine's card limit keeps real runs
// far below these; they only stop something unforeseen.
export const SCORE_LIMITS = { heapMb: 64, ms: 5000 };

// Score keys in the database: "<croupiers>_<rounds>".
export const pointKey = (p) => `${p.croupiers}_${p.rounds}`;
const parseKey = (k) => {
  const [croupiers, rounds] = k.split('_').map(Number);
  return { croupiers, rounds };
};
// a is at least as good as b on both axes.
const beats = (a, b) => a.croupiers <= b.croupiers && a.rounds <= b.rounds;

// Score validated cells in a worker thread with a memory and time budget:
// { ok, croupiers, rounds } or { error: 'resources' }.
export function scoreInWorker(level, cells, limits = SCORE_LIMITS) {
  return new Promise((resolve) => {
    const worker = new Worker(new URL('./worker.js', import.meta.url), {
      workerData: { level, cells },
      resourceLimits: { maxOldGenerationSizeMb: limits.heapMb },
    });
    let done = false;
    const finish = (result) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      worker.terminate();
      resolve(result);
    };
    const timer = setTimeout(() => finish({ error: 'resources' }), limits.ms);
    worker.once('message', finish);
    worker.once('error', () => finish({ error: 'resources' }));
    worker.once('exit', () => finish({ error: 'resources' }));
  });
}

// Add a verified point to a player's frontier for a rules version and, if the
// frontier changed, apply the change to the floor's stats. Adding a point
// that is already there (or beaten) changes nothing, so this is safe to
// repeat and to run alongside itself in any order. Returns the change or null.
export async function addPoint(db, version, uid, level, point) {
  const key = pointKey(point);
  let diff = null;
  const { committed } = await db.ref(`scores/v${version}/${uid}/${level}`).transaction((current) => {
    // The transaction may run more than once (first against a cached or
    // missing value); `diff` ends up describing the run that committed.
    const old = Object.keys(current ?? {}).map(parseKey);
    diff = null;
    if (old.some((p) => beats(p, point))) return undefined; // nothing new: abort
    diff = { added: key, removed: old.filter((p) => beats(point, p)).map(pointKey), first: !old.length };
    const next = Object.fromEntries(old.filter((p) => !beats(point, p)).map((p) => [pointKey(p), true]));
    next[key] = true;
    return next;
  });
  if (!committed || !diff) return null;
  // Increments, not a transaction, so the shared stats node is never locked.
  const update = { [`points/${diff.added}`]: ServerValue.increment(1) };
  for (const k of diff.removed) update[`points/${k}`] = ServerValue.increment(-1);
  if (diff.first) update.players = ServerValue.increment(1);
  await db.ref(`stats/v${version}/${level}`).update(update);
  return diff;
}

// (A transaction's first run often sees a cached null rather than the
// server's value. Returning undefined then would abort without ever asking
// the server, so the transactions below return null for null: if the node
// does exist, the server refuses that and the function runs again with it.)

// Remove a player's whole frontier for a floor and rules version, and their
// points from its stats. Safe to repeat. Returns the points removed.
export async function removeFrontier(db, version, uid, level) {
  let removed = [];
  const { committed } = await db.ref(`scores/v${version}/${uid}/${level}`).transaction((current) => {
    removed = Object.keys(current ?? {}); // from the run that commits
    return null;
  });
  if (!committed || !removed.length) return [];
  const update = { players: ServerValue.increment(-1) };
  for (const k of removed) update[`points/${k}`] = ServerValue.increment(-1);
  await db.ref(`stats/v${version}/${level}`).update(update);
  return removed;
}

// Take one point back out of a player's frontier (when the solution it came
// from was deleted while being scored). Safe to repeat.
export async function removePoint(db, version, uid, level, point) {
  const key = pointKey(point);
  let removed = false, emptied = false;
  const { committed } = await db.ref(`scores/v${version}/${uid}/${level}`).transaction((current) => {
    removed = !!current?.[key];
    if (!removed) return current ?? null; // not there: change nothing
    const next = { ...current };
    delete next[key];
    emptied = !Object.keys(next).length;
    return emptied ? null : next;
  });
  if (!committed || !removed) return false;
  const update = { [`points/${key}`]: ServerValue.increment(-1) };
  if (emptied) update.players = ServerValue.increment(-1);
  await db.ref(`stats/v${version}/${level}`).update(update);
  return true;
}

// Verify and score one submitted solution (written by a player to
// solutions/{uid}/{level}/{hash}). Returns what happened, for logs and tests.
export async function processSolution(db, { uid, level, hash }) {
  const ref = db.ref(`solutions/${uid}/${level}/${hash}`);
  // Read it back: the trigger's event only says what the player wrote.
  const sol = (await ref.get()).val();
  if (!sol || sol.score || sol.invalid) return 'done already';
  if ((await db.ref('config/scoringPaused').get()).val()) return 'paused';
  // During a rules-version deploy, rescoring handles the other version.
  if (sol.rules !== RULES_VERSION) return 'other version';

  // Invalid submissions keep only a small tombstone, never their contents.
  // (Only while it still exists: never recreate one the player deleted.)
  const tombstone = async (reason) => {
    const stone = { invalid: reason, rules: sol.rules, at: typeof sol.at === 'number' ? sol.at : 0 };
    await ref.transaction((current) => (current ? stone : null));
    return `invalid: ${reason}`;
  };
  const lv = LEVEL_BY_ID.get(level);
  if (!lv) return tombstone('unknown floor');
  let cells;
  try {
    if (typeof sol.cells !== 'string') throw new Error();
    cells = JSON.parse(sol.cells);
  } catch {
    return tombstone('not JSON');
  }
  const valid = validateCells(lv, cells);
  if (valid.error) return tombstone(valid.error);
  if (await solutionHash(valid.cells) !== hash) return tombstone('wrong hash');

  const res = await scoreInWorker(level, valid.cells);
  if (res.error) return tombstone(res.error);
  // The point goes in before `score` is written, so a retry after a crash
  // redoes both (and adding the point again changes nothing).
  if (res.ok) await addPoint(db, RULES_VERSION, uid, level, res);
  const score = res.ok ? { croupiers: res.croupiers, rounds: res.rounds } : { broken: true };
  // Only while the solution still exists: if the player deleted their data
  // meanwhile, write nothing back and take the point out again.
  const { snapshot } = await ref.transaction((current) => (current ? { ...current, score } : null));
  if (!snapshot.exists()) {
    if (res.ok) await removePoint(db, RULES_VERSION, uid, level, res);
    return 'deleted meanwhile';
  }
  return res.ok ? 'scored' : 'broken';
}
