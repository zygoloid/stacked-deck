// Tests for the database rules, the scoring function and the kill switch,
// against the Firebase emulators. Run from test/emulator: npm ci && npm test
// (which starts the database and functions emulators and runs this).
//
// Namespaces (database instances) in the emulator:
//   rules-tests            the rules, exercised with client contexts
//   direct-tests           processSolution and addPoint called directly
//   zygoloid-stacked-deck  end to end: the deployed trigger scores a submission
// The kill switch runs last, since it locks every instance it finds.
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
const PAR = scoreMachine(byId.get(LEVEL), CELLS);
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

// ---------- kill switch ----------
{
  const opsRequire = createRequire(new URL('../../ops/package.json', import.meta.url));
  const opsAdmin = opsRequire('firebase-admin/app');
  const ks = await import('../../ops/killswitch.js');
  const { KNOWN_INSTANCE_URLS, LIMITS } = await import('../../ops/config.js');

  assert.strictEqual(ks.budgetExceeded({ costAmount: 2, budgetAmount: 10 }, 1), false);
  assert.strictEqual(ks.budgetExceeded({ costAmount: 9.99, budgetAmount: 10, alertThresholdExceeded: 0.9 }, 1), false);
  assert.strictEqual(ks.budgetExceeded({ costAmount: 10, budgetAmount: 10 }, 1), true);
  assert.strictEqual(ks.budgetExceeded({ costAmount: 3, budgetAmount: 10, alertThresholdExceeded: 1.0 }, 1), true);
  assert.strictEqual(ks.budgetExceeded(null, 1), false);
  assert.deepStrictEqual(ks.overLimits({ sentBytesPerHour: 0, storedBytes: 0 }), []);
  assert.deepStrictEqual(ks.overLimits({ sentBytesPerHour: LIMITS.sentBytesPerHour + 1, storedBytes: LIMITS.storedBytes + 1 }), ['sentBytesPerHour', 'storedBytes']);
  assert.strictEqual(ks.sumSeries({ timeSeries: [{ points: [{ value: { int64Value: '5' } }, { value: { doubleValue: 2.5 } }] }] }), 7.5);
  assert.strictEqual(ks.sumSeries({}), 0);

  // A fake Google API: the instance list names one more game's instance, and
  // the metrics come back as one series each.
  const seen = [];
  const fakeFetch = async (u) => {
    seen.push(u);
    const body = u.startsWith('https://firebasedatabase.googleapis.com/')
      ? { instances: [{ databaseUrl: url('another-game') }, { databaseUrl: KNOWN_INSTANCE_URLS[1] }] }
      : { timeSeries: [{ points: [{ value: { int64Value: u.includes('sent_bytes') ? '123' : '456' } }] }] };
    return { ok: true, json: async () => body, text: async () => '' };
  };
  assert.deepStrictEqual(await ks.readUsage(fakeFetch, 't'), { sentBytesPerHour: 123, storedBytes: 456 });
  assert(seen.some((u) => u.includes('crossSeriesReducer=REDUCE_SUM') && u.includes('sent_bytes_count')));

  const logs = [];
  const log = { error: (m) => logs.push(m), info: () => {} };
  await owner('another-game', 'x', 'PUT', 1);
  // The emulator treats the access token "owner" as an admin.
  const ownerCredential = { getAccessToken: async () => ({ access_token: 'owner', expires_in: 3600 }) };
  const opsApp = opsAdmin.initializeApp({ projectId: 'demo-stacked-deck', credential: ownerCredential }, 'ops-tests');
  const locked = await ks.lockdown({ app: opsApp, fetchFn: fakeFetch, token: 't', log, reason: 'test' });
  assert.deepStrictEqual(locked.sort(), [...new Set([...KNOWN_INSTANCE_URLS, url('another-game')])].sort());
  for (const ns of ['another-game', 'zygoloid-stacked-deck']) {
    assert.deepStrictEqual(await owner(ns, '.settings/rules'), ks.DENY_ALL, ns);
  }
  // Players are now refused, even for what they could read before.
  const env3 = await initializeTestEnvironment({ projectId: 'demo-stacked-deck', database: { host, port: Number(port) } });
  await assertFails(env3.authenticatedContext('e2e', { firebase: { sign_in_provider: 'google.com' } }).database(url('zygoloid-stacked-deck')).ref('config').get());
  await env3.cleanup();
  // Listing failing still locks the known instances.
  const failing = async () => ({ ok: false, status: 403, text: async () => 'denied' });
  const locked2 = await ks.lockdown({ app: opsApp, fetchFn: failing, token: 't', log, reason: 'test' });
  assert.deepStrictEqual(locked2.sort(), [...KNOWN_INSTANCE_URLS].sort());
  assert(logs.some((m) => m.includes('could not list')));
}
console.log('kill switch ok');
process.exit(0);
