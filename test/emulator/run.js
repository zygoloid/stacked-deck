// Tests for the database rules and the scoring function,
// against the Firebase emulators. Run from test/emulator: npm ci && npm test
// (which starts the database and functions emulators and runs this).
//
// Namespaces (database instances) in the emulator:
//   rules-tests            the rules, exercised with client contexts
//   direct-tests           processSolution and addPoint called directly
//   zygoloid-stacked-deck  end to end: the deployed trigger scores a submission
// (The project's kill switch lives, and is tested, with the project's own
// infrastructure, not here.)
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { LEVELS, BONUS } from '../../src/levels.js';
import { RULES_VERSION } from '../../src/engine.js';
import { solutionHash, scoreMachine } from '../../src/score.js';

const HOST = process.env.FIREBASE_DATABASE_EMULATOR_HOST;
assert(HOST, 'run under firebase emulators:exec');
const [host, port] = HOST.split(':');
const RULES = readFileSync(new URL('../../database.rules.json', import.meta.url), 'utf8');
const TS = { '.sv': 'timestamp' };
const url = (ns) => `https://${ns}.firebaseio.com`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// The emulator's REST API as the owner (bypasses rules).
async function owner(ns, path, method = 'GET', body) {
  const res = await fetch(`http://${HOST}/${path}.json?ns=${ns}`, {
    method, headers: { Authorization: 'Bearer owner' }, body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${method} ${ns}/${path}: ${res.status} ${await res.text()}`);
  return res.json();
}
for (const ns of ['rules-tests', 'zygoloid-stacked-deck']) {
  await owner(ns, '.settings/rules', 'PUT', JSON.parse(RULES));
  await owner(ns, 'config/rulesVersion', 'PUT', RULES_VERSION);
}

const ALL = [...LEVELS, ...BONUS];
const byId = new Map(ALL.map((l) => [l.id, l]));
const reference = async (id) => {
  const m = await import(`../../solutions/levels/${id}.js`);
  const sol = m.default ?? Object.values(m)[0];
  return sol.cells ?? sol;
};
const LEVEL = 'upper-hand';
const CELLS = await reference(LEVEL);
const HASH = await solutionHash(CELLS);
const PAR = await scoreMachine(byId.get(LEVEL), CELLS);
assert(PAR.ok);
// Two duplicates feeding each other: valid, but it fails on the card limit.
const BOMB = [
  { at: [-1, 0], kind: 'croupier', fn: 'duplicate', out: { a: 0, b: 0 } },
  { at: [0, 0], kind: 'croupier', fn: 'duplicate', out: { a: 3, b: 3 } },
];

// ---------- rules ----------
const env = await initializeTestEnvironment({ projectId: 'demo-stacked-deck', database: { host, port: Number(port) } });
const ctx = (uid, provider) => (uid ? env.authenticatedContext(uid, { firebase: { sign_in_provider: provider } }) : env.unauthenticatedContext());
const as = (uid, provider = 'google.com') => ctx(uid, provider).database(url('rules-tests'));
const anonDb = as(null);
const submission = (uid, { level = LEVEL, hash = HASH, cells = JSON.stringify(CELLS), rules = RULES_VERSION, limitLevel = level, limitHash = hash, extra = {} } = {}) => ({
  [`limits/${uid}/submit`]: { level: limitLevel, hash: limitHash, at: TS },
  [`solutions/${uid}/${level}/${hash}`]: { cells, at: Date.now(), rules, ...extra },
});
let n = 0;
const fresh = () => `u${++n}`; // a new user, so the one-a-second limit never interferes

{
  const u = fresh();
  await assertFails(anonDb.ref('config').get());
  await assertSucceeds(as(u).ref('config').get());
  await assertFails(anonDb.ref(`stats/v${RULES_VERSION}`).get());
  await assertSucceeds(as(u).ref(`stats/v${RULES_VERSION}/${LEVEL}`).get());
  await assertFails(as(u).ref('/').get());
  // Signing in with Google is the opt-in: other kinds of account get nothing.
  for (const provider of ['anonymous', 'password', 'custom']) {
    await assertFails(as(u, provider).ref('config').get());
    await assertFails(as(u, provider).ref(`stats/v${RULES_VERSION}/${LEVEL}`).get());
  }
  await assertFails(as(u).ref('anything').set(1));
  await assertFails(as(u).ref('config/rulesVersion').set(RULES_VERSION + 1));
}
console.log('rules: config and stats ok');

{
  // A valid submission, by a player signed in with Google, and the same
  // write by an anonymous account (refused).
  const u = fresh();
  await assertFails(as(u, 'anonymous').ref().update(submission(u)));
  await assertSucceeds(as(u).ref().update(submission(u)));
  await assertFails(as(u, 'anonymous').ref(`solutions/${u}`).get());
  await assertSucceeds(as(u).ref(`solutions/${u}`).get());
  await assertFails(as(fresh()).ref(`solutions/${u}`).get());
  // Never changed or deleted afterwards.
  await assertFails(as(u).ref(`solutions/${u}/${LEVEL}/${HASH}/cells`).set('[]'));
  await assertFails(as(u).ref(`solutions/${u}/${LEVEL}/${HASH}`).remove());
  await assertFails(as(u).ref(`solutions/${u}`).remove());
  // At most one a second.
  const other = await solutionHash(BOMB);
  await assertFails(as(u).ref().update(submission(u, { hash: other, cells: JSON.stringify(BOMB) })));
  await sleep(1100);
  await assertSucceeds(as(u).ref().update(submission(u, { hash: other, cells: JSON.stringify(BOMB) })));
  // The clock can't be reset.
  await assertFails(as(u).ref(`limits/${u}/submit`).remove());
  await assertFails(as(u).ref(`limits/${u}/submit`).set({ level: LEVEL, hash: HASH, at: 1 }));
}
{
  const h2 = await solutionHash(BOMB);
  const bad = async (why, write) => { const u = fresh(); await assertFails(write(u)); return why; };
  await bad('no limits entry', (u) => as(u).ref(`solutions/${u}/${LEVEL}/${HASH}`).set({ cells: '[]', at: 1, rules: RULES_VERSION }));
  await bad('two solutions in one write', (u) => as(u).ref().update({
    ...submission(u), [`solutions/${u}/${LEVEL}/${h2}`]: { cells: '[]', at: 1, rules: RULES_VERSION },
  }));
  await bad('same hash on two floors', (u) => as(u).ref().update({
    ...submission(u), [`solutions/${u}/opening-night/${HASH}`]: { cells: '[]', at: 1, rules: RULES_VERSION },
  }));
  await bad('limit names another floor', (u) => as(u).ref().update(submission(u, { limitLevel: 'opening-night' })));
  await bad('limit names another hash', (u) => as(u).ref().update(submission(u, { limitHash: h2 })));
  await bad('unknown floor', (u) => as(u).ref().update(submission(u, { level: 'no-such-floor' })));
  await bad('not a hash', (u) => as(u).ref().update(submission(u, { hash: 'x'.repeat(32) })));
  await bad('old rules version', (u) => as(u).ref().update(submission(u, { rules: RULES_VERSION - 1 })));
  await bad('future rules version', (u) => as(u).ref().update(submission(u, { rules: 1e300 })));
  await bad('machine too long', (u) => as(u).ref().update(submission(u, { cells: 'x'.repeat(10001) })));
  await bad('machine not a string', (u) => as(u).ref().update(submission(u, { cells: { a: 1 } })));
  await bad('a score from the client', (u) => as(u).ref().update(submission(u, { extra: { score: { croupiers: 1, rounds: 1 } } })));
  await bad('another field', (u) => as(u).ref().update(submission(u, { extra: { junk: 'x' } })));
  await bad("another player's solutions", (u) => as(u).ref().update({
    [`limits/${u}/submit`]: { level: LEVEL, hash: HASH, at: TS },
    [`solutions/victim/${LEVEL}/${HASH}`]: { cells: '[]', at: 1, rules: RULES_VERSION },
  }));
  await bad('signed out', () => anonDb.ref().update(submission('nobody')));
  // A machine at the size limit is fine.
  const u = fresh();
  await assertSucceeds(as(u).ref().update(submission(u, { cells: 'x'.repeat(10000) })));
}
console.log('rules: solutions ok');

{
  const [a, b, c] = [fresh(), fresh(), fresh()];
  await owner('rules-tests', `scores/v${RULES_VERSION}/${a}/${LEVEL}`, 'PUT', { '3_20': true });
  await owner('rules-tests', `profiles/${a}`, 'PUT', { name: 'Ann' });
  await owner('rules-tests', `friends/${a}/${b}`, 'PUT', true);
  await assertSucceeds(as(a).ref(`scores/v${RULES_VERSION}/${a}`).get());
  await assertFails(as(b, 'anonymous').ref(`scores/v${RULES_VERSION}/${a}`).get());
  await assertFails(as(a, 'anonymous').ref(`friends/${a}`).get());
  await assertSucceeds(as(b).ref(`scores/v${RULES_VERSION}/${a}`).get());
  await assertSucceeds(as(b).ref(`profiles/${a}`).get());
  await assertFails(as(c).ref(`scores/v${RULES_VERSION}/${a}`).get());
  await assertFails(as(c).ref(`profiles/${a}`).get());
  await assertFails(as(a).ref(`scores/v${RULES_VERSION}`).get());
  await assertFails(as(a).ref(`scores/v${RULES_VERSION}/${a}/${LEVEL}`).set({ '1_1': true }));
  await assertFails(as(a).ref(`stats/v${RULES_VERSION}/${LEVEL}/players`).set(1000));
  await assertSucceeds(as(a).ref(`friends/${a}`).get());
  await assertFails(as(b).ref(`friends/${a}`).get());
  await assertFails(as(c).ref(`friends/${a}/${c}`).set(true));
  await assertFails(as(a).ref(`friends/${a}/${b}`).remove());
}
console.log('rules: scores, stats, profiles and friends ok');

{
  const g = fresh();
  const google = (uid) => as(uid);
  const save = `saves/${g}/${LEVEL}`;
  await assertSucceeds(google(g).ref(save).set({ work: { cells: '[]', at: TS }, solved: true }));
  await assertSucceeds(google(g).ref(`${save}/work`).set({ cells: JSON.stringify(CELLS), at: TS }));
  await assertSucceeds(google(g).ref(`saves/${g}`).get());
  await assertFails(as(g, 'anonymous').ref(`${save}/solved`).set(true)); // the same uid, but anonymous
  await assertFails(as(g, 'password').ref(`${save}/solved`).set(true)); // only Google
  await assertFails(google(fresh()).ref(`saves/${g}`).get());
  await assertFails(google(fresh()).ref(`${save}/solved`).set(true));
  await assertFails(google(g).ref(`saves/${g}`).set('x'.repeat(1000)));
  await assertFails(google(g).ref(save).set('x'));
  await assertFails(google(g).ref(`${save}/deleted`).set('x'));
  await assertFails(google(g).ref(`saves/${g}/no-such-floor/solved`).set(true));
  await assertFails(google(g).ref(`${save}/work`).set({ cells: '[]', at: 1 }));
  await assertFails(google(g).ref(`${save}/work`).set({ cells: 'x'.repeat(10001), at: TS }));
  await assertFails(google(g).ref(`${save}/junk`).set(1));
  // `deleted` may only name the player's own uploaded solutions.
  await assertFails(google(g).ref(`${save}/deleted/${HASH}`).set(true));
  await owner('rules-tests', `solutions/${g}/${LEVEL}/${HASH}`, 'PUT', { cells: '[]', at: 1, rules: RULES_VERSION });
  await assertSucceeds(google(g).ref(`${save}/deleted/${HASH}`).set(true));
  await assertSucceeds(google(g).ref(`saves/${g}`).remove());
  // Profiles.
  await assertSucceeds(google(g).ref(`profiles/${g}`).set({ name: 'Gina' }));
  await assertFails(as(g, 'anonymous').ref(`profiles/${g}`).set({ name: 'Anon' }));
  await assertFails(google(g).ref(`profiles/${g}`).set({ name: 'x'.repeat(41) }));
  await assertFails(google(g).ref(`profiles/${g}`).set({ name: '' }));
  await assertFails(google(g).ref(`profiles/${g}`).set({ name: 'Gina', email: 'g@example.com' }));
  await assertFails(google(g).ref(`profiles/${g}`).set('Gina'));
}
console.log('rules: saves and profiles ok');
await env.cleanup();

// ---------- processSolution and addPoint, called directly ----------
const fnRequire = createRequire(new URL('../../functions/package.json', import.meta.url));
const admin = { ...fnRequire('firebase-admin/app'), ...fnRequire('firebase-admin/database') };
const { processSolution, addPoint } = await import('../../functions/solutions.js');
const app = admin.initializeApp({ projectId: 'demo-stacked-deck' }, 'tests');
const direct = admin.getDatabaseWithUrl(url('direct-tests'), app);
await direct.ref('/').set(null);
const put = (uid, hash, sol) => direct.ref(`solutions/${uid}/${LEVEL}/${hash}`).set({ at: 1, rules: RULES_VERSION, ...sol });
const stats = async () => (await direct.ref(`stats/v${RULES_VERSION}/${LEVEL}`).get()).val();
const key = `${PAR.croupiers}_${PAR.rounds}`;

{
  await put('p1', HASH, { cells: JSON.stringify(CELLS) });
  assert.strictEqual(await processSolution(direct, { uid: 'p1', level: LEVEL, hash: HASH }), 'scored');
  assert.deepStrictEqual((await direct.ref(`solutions/p1/${LEVEL}/${HASH}/score`).get()).val(), { croupiers: PAR.croupiers, rounds: PAR.rounds });
  assert.deepStrictEqual((await direct.ref(`scores/v${RULES_VERSION}/p1/${LEVEL}`).get()).val(), { [key]: true });
  assert.deepStrictEqual(await stats(), { points: { [key]: 1 }, players: 1 });
  // Repeating changes nothing.
  assert.strictEqual(await processSolution(direct, { uid: 'p1', level: LEVEL, hash: HASH }), 'done already');
  await direct.ref(`solutions/p1/${LEVEL}/${HASH}/score`).remove();
  assert.strictEqual(await processSolution(direct, { uid: 'p1', level: LEVEL, hash: HASH }), 'scored');
  assert.deepStrictEqual(await stats(), { points: { [key]: 1 }, players: 1 });
  // A second player with the same machine.
  await put('p2', HASH, { cells: JSON.stringify(CELLS) });
  assert.strictEqual(await processSolution(direct, { uid: 'p2', level: LEVEL, hash: HASH }), 'scored');
  assert.deepStrictEqual(await stats(), { points: { [key]: 2 }, players: 2 });
}
{
  // A valid machine that doesn't clear the floor (the card bomb): broken, no point.
  const h = await solutionHash(BOMB);
  await put('p3', h, { cells: JSON.stringify(BOMB) });
  assert.strictEqual(await processSolution(direct, { uid: 'p3', level: LEVEL, hash: h }), 'broken');
  assert.deepStrictEqual((await direct.ref(`solutions/p3/${LEVEL}/${h}/score`).get()).val(), { broken: true });
  assert.strictEqual((await direct.ref(`scores/v${RULES_VERSION}/p3`).get()).val(), null);
}
{
  // Invalid submissions become tombstones without their contents.
  const cases = [
    ['not JSON', HASH, { cells: '[{' }, LEVEL],
    ['unknown field', HASH, { cells: JSON.stringify(CELLS.map((c, i) => (i ? c : { ...c, junk: 1 }))) }, LEVEL],
    ['wrong hash', 'f'.repeat(32), { cells: JSON.stringify(CELLS) }, LEVEL],
    ['unknown floor', HASH, { cells: JSON.stringify(CELLS) }, 'no-such-floor'],
  ];
  for (const [why, h, sol, level] of cases) {
    const uid = `t-${why.replace(/ /g, '-')}`;
    await direct.ref(`solutions/${uid}/${level}/${h}`).set({ at: 5, rules: RULES_VERSION, ...sol });
    const res = await processSolution(direct, { uid, level, hash: h });
    assert(res.startsWith('invalid'), `${why}: ${res}`);
    const node = (await direct.ref(`solutions/${uid}/${level}/${h}`).get()).val();
    assert.deepStrictEqual(Object.keys(node).sort(), ['at', 'invalid', 'rules'], why);
    assert.strictEqual(await processSolution(direct, { uid, level, hash: h }), 'done already');
  }
}
{
  // Another rules version, and paused scoring, are left alone.
  await put('p4', HASH, { cells: JSON.stringify(CELLS), rules: RULES_VERSION - 1 });
  assert.strictEqual(await processSolution(direct, { uid: 'p4', level: LEVEL, hash: HASH }), 'other version');
  await put('p5', HASH, { cells: JSON.stringify(CELLS) });
  await direct.ref('config/scoringPaused').set(true);
  assert.strictEqual(await processSolution(direct, { uid: 'p5', level: LEVEL, hash: HASH }), 'paused');
  await direct.ref('config/scoringPaused').remove();
  assert.strictEqual(await processSolution(direct, { uid: 'p5', level: LEVEL, hash: HASH }), 'scored');
}
{
  // Frontiers: points that don't beat each other are both kept; a point
  // beating both replaces them; repeats and beaten points change nothing,
  // even when run at the same time.
  const lvl = 'opening-night';
  const s = async () => (await direct.ref(`stats/v1/${lvl}`).get()).val();
  const f = async () => Object.keys((await direct.ref(`scores/v1/q/${lvl}`).get()).val() ?? {}).sort();
  await addPoint(direct, 1, 'q', lvl, { croupiers: 10, rounds: 50 });
  await addPoint(direct, 1, 'q', lvl, { croupiers: 12, rounds: 40 });
  assert.deepStrictEqual(await f(), ['10_50', '12_40']);
  assert.strictEqual(await addPoint(direct, 1, 'q', lvl, { croupiers: 12, rounds: 45 }), null);
  await addPoint(direct, 1, 'q', lvl, { croupiers: 9, rounds: 39 });
  assert.deepStrictEqual(await f(), ['9_39']);
  assert.deepStrictEqual(await s(), { points: { '10_50': 0, '12_40': 0, '9_39': 1 }, players: 1 });
  await Promise.all(Array.from({ length: 8 }, () => addPoint(direct, 1, 'q', lvl, { croupiers: 8, rounds: 39 })));
  assert.deepStrictEqual(await f(), ['8_39']);
  assert.deepStrictEqual(await s(), { points: { '10_50': 0, '12_40': 0, '9_39': 0, '8_39': 1 }, players: 1 });
}
console.log('processSolution and addPoint ok');

{
  // Deleting a player's data: their solutions, frontiers (every rules
  // version) and points in the stats, profile, save, limits, friendships
  // both ways and invite; other players' data stays. Safe to repeat.
  const { deleteUserData } = await import('../../functions/account.js');
  const { removePoint } = await import('../../functions/solutions.js');
  const before = await stats();
  await direct.ref('/').update({
    'profiles/p1': { name: 'One' }, 'saves/p1/opening-night/solved': true, 'limits/p1/submit': { level: LEVEL, hash: HASH, at: 1 },
    'friends/p1/p2': true, 'friends/p2/p1': true, 'friends/p2/p9': true, 'inviteOf/p1': 'abcdefghijkl',
    'invites/abcdefghijkl': { from: 'p1', expires: 1 }, 'scores/v1/p1/opening-night': { '4_40': true },
    'stats/v1/opening-night': { points: { '4_40': 3 }, players: 3 },
  });
  assert.strictEqual(await deleteUserData(direct, 'p1'), 2);
  for (const path of ['solutions/p1', `scores/v${RULES_VERSION}/p1`, 'scores/v1/p1', 'profiles/p1', 'saves/p1', 'limits/p1',
    'friends/p1', 'friends/p2/p1', 'inviteOf/p1', 'invites/abcdefghijkl']) {
    assert.strictEqual((await direct.ref(path).get()).val(), null, `${path} deleted`);
  }
  assert.deepStrictEqual((await direct.ref('friends/p2').get()).val(), { p9: true }, "others' friendships stay");
  assert.notStrictEqual((await direct.ref(`solutions/p2/${LEVEL}`).get()).val(), null, "others' solutions stay");
  const after = await stats();
  assert.strictEqual(after.players, before.players - 1);
  assert.strictEqual(after.points[key], before.points[key] - 1);
  assert.deepStrictEqual((await direct.ref('stats/v1/opening-night').get()).val(), { points: { '4_40': 2 }, players: 2 });
  assert.strictEqual(await deleteUserData(direct, 'p1'), 0);
  assert.deepStrictEqual(await stats(), after, 'repeating changes nothing');

  // Taking a single point back out (a solution deleted while being scored).
  await addPoint(direct, 1, 'r', 'two-tables', { croupiers: 5, rounds: 50 });
  await addPoint(direct, 1, 'r', 'two-tables', { croupiers: 6, rounds: 40 });
  assert.strictEqual(await removePoint(direct, 1, 'r', 'two-tables', { croupiers: 5, rounds: 50 }), true);
  assert.strictEqual(await removePoint(direct, 1, 'r', 'two-tables', { croupiers: 5, rounds: 50 }), false);
  assert.strictEqual(await removePoint(direct, 1, 'r', 'two-tables', { croupiers: 6, rounds: 40 }), true);
  assert.strictEqual((await direct.ref('scores/v1/r').get()).val(), null);
  assert.deepStrictEqual((await direct.ref('stats/v1/two-tables').get()).val(), { points: { '5_50': 0, '6_40': 0 }, players: 0 });

  // A solution deleted while it is being scored leaves nothing behind.
  await put('p6', HASH, { cells: JSON.stringify(CELLS) });
  const run = processSolution(direct, { uid: 'p6', level: LEVEL, hash: HASH });
  await sleep(15);
  const mid = await stats();
  await deleteUserData(direct, 'p6');
  const res = await run;
  assert(['deleted meanwhile', 'done already'].includes(res), res);
  assert.strictEqual((await direct.ref('solutions/p6').get()).val(), null, 'nothing written back');
  assert.strictEqual((await direct.ref(`scores/v${RULES_VERSION}/p6`).get()).val(), null);
  const end = await stats();
  assert.strictEqual(end.players, mid.players);
  assert.strictEqual(end.points[key], mid.points[key]);
}
console.log('deleting a player\'s data ok');

// ---------- end to end: the trigger scores a real submission ----------
{
  const env2 = await initializeTestEnvironment({ projectId: 'demo-stacked-deck', database: { host, port: Number(port) } });
  const player = env2.authenticatedContext('e2e', { firebase: { sign_in_provider: 'google.com' } }).database(url('zygoloid-stacked-deck'));
  await assertSucceeds(player.ref().update({
    'limits/e2e/submit': { level: LEVEL, hash: HASH, at: TS },
    [`solutions/e2e/${LEVEL}/${HASH}`]: { cells: JSON.stringify(CELLS), at: Date.now(), rules: RULES_VERSION },
  }));
  let score = null;
  for (let i = 0; i < 60 && !score; i++) {
    await sleep(500);
    score = (await player.ref(`solutions/e2e/${LEVEL}/${HASH}/score`).get()).val();
  }
  assert.deepStrictEqual(score, { croupiers: PAR.croupiers, rounds: PAR.rounds }, 'scored by the trigger');
  const st = (await player.ref(`stats/v${RULES_VERSION}/${LEVEL}`).get()).val();
  assert.deepStrictEqual(st, { points: { [key]: 1 }, players: 1 });
  await env2.cleanup();
}
console.log('end to end ok');

process.exit(0);
