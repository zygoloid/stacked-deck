// Browser test of the online features against the Firebase emulators
// (Playwright + Chromium, as tools/ui-smoke.js). Run it from test/emulator:
//   npm run test:browser       (SHOTS=<dir> to save screenshots)
// which starts the auth, database and functions emulators and runs this. The
// page runs with `?emulator`, and the Firebase SDK's CDN URLs are served from
// test/emulator/node_modules/firebase (the same files), so nothing outside
// this machine is contacted.
//
// It checks: signing in is explained first; a nickname is asked for; saved
// solutions upload and the scoring function scores them; everyone's scores
// appear on a floor's plot; signing out keeps or clears this browser's
// progress; signing in with another account asks before adding this
// browser's progress to it; a reload restores the session; deleting an
// account's data removes it (and the sign-in account) and its stats; cloud
// save carries progress, edits and deletions between two devices; invites
// make friends (only after accepting), whose frontiers appear on the plot,
// and removing a friend ends it both ways.
import { spawn, execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LEVELS } from '../src/levels.js';
import { RULES_VERSION } from '../src/engine.js';
import { FIREBASE_SDK } from '../src/firebase-config.js';

const repo = fileURLToPath(new URL('..', import.meta.url));
const shots = process.argv.slice(2).find((a) => !a.startsWith('--')) || process.env.SHOTS || null;
if (shots) mkdirSync(shots, { recursive: true });
const DB = process.env.FIREBASE_DATABASE_EMULATOR_HOST;
if (!DB || !process.env.FIREBASE_AUTH_EMULATOR_HOST) throw new Error('run under firebase emulators:exec with auth and database');
const NS = 'zygoloid-stacked-deck';
const LEVEL = 'opening-night';
const level = LEVELS.find((l) => l.id === LEVEL);
const REF = ((m) => (m.default ?? Object.values(m)[0]).cells ?? (m.default ?? Object.values(m)[0]))(await import(`../solutions/levels/${LEVEL}.js`));

async function loadPlaywright() {
  try { return await import('playwright'); } catch { /* fall through */ }
  const root = execSync('npm root -g').toString().trim();
  return createRequire(join(root, 'noop.js'))('playwright');
}
const { chromium } = await loadPlaywright();
// The Admin SDK (test/emulator's copy) against the auth emulator, to check
// sign-in accounts.
const adminRequire = createRequire(join(repo, 'test/emulator/package.json'));
const adminAuth = adminRequire('firebase-admin/auth').getAuth(adminRequire('firebase-admin/app').initializeApp({ projectId: 'demo-stacked-deck' }));
const userExists = (uid) => adminAuth.getUser(uid).then(() => true, () => false);

// The database emulator as its owner (bypasses rules).
async function owner(path, method = 'GET', body) {
  const res = await fetch(`http://${DB}/${path}.json?ns=${NS}`, {
    method, headers: { Authorization: 'Bearer owner' }, body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${await res.text()}`);
  return res.json();
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms = 60000) {
  for (const t = Date.now(); Date.now() - t < ms; await sleep(300)) {
    const v = await fn();
    if (v) return v;
  }
  return null;
}

await owner('.settings/rules', 'PUT', JSON.parse(await (await import('node:fs/promises')).readFile(join(repo, 'database.rules.json'), 'utf8')));
await owner('config/rulesVersion', 'PUT', RULES_VERSION);

const port = 8000 + Math.floor(Math.random() * 1000);
const server = spawn(process.execPath, [join(repo, 'tools/serve.js')], { env: { ...process.env, PORT: String(port) }, stdio: 'pipe' });
await new Promise((r) => server.stdout.once('data', r));
const base = `http://127.0.0.1:${port}/`;
const site = `${base}?emulator`;

let failures = 0;
const check = (cond, msg) => { console.log(`${cond ? 'ok  ' : 'FAIL'} ${msg}`); if (!cond) failures++; };

const browser = await chromium.launch();
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  const sdkDir = join(repo, 'test/emulator/node_modules/firebase');
  const outside = [];
  await context.route('**/*', (route) => {
    const u = new URL(route.request().url());
    if (route.request().url().startsWith(`${FIREBASE_SDK}/`)) {
      return route.fulfill({ path: join(sdkDir, u.pathname.split('/').pop()), contentType: 'text/javascript' });
    }
    if (!['127.0.0.1', 'localhost'].includes(u.hostname)) { outside.push(u.href); return route.abort(); }
    return route.continue();
  });
  const errors = [];
  // A browser "device": its own storage, so its own local save and session.
  async function device() {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
    await ctx.route('**/*', (route) => {
      const u = new URL(route.request().url());
      if (route.request().url().startsWith(`${FIREBASE_SDK}/`)) {
        return route.fulfill({ path: join(sdkDir, u.pathname.split('/').pop()), contentType: 'text/javascript' });
      }
      if (!['127.0.0.1', 'localhost'].includes(u.hostname)) { outside.push(u.href); return route.abort(); }
      return route.continue();
    });
    const p = await ctx.newPage();
    p.on('pageerror', (e) => errors.push(e.message));
    p.on('console', (m) => { if (m.type() === 'error' && !/WebSocket|net::ERR_FAILED/.test(m.text())) errors.push(m.text()); });
    p.on('dialog', (d) => d.accept()); // the editor's confirm()s
    return p;
  }
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/WebSocket|net::ERR_FAILED/.test(m.text())) errors.push(m.text()); });
  page.on('dialog', (d) => d.accept());
  const saveOf = (p = page) => p.evaluate(() => JSON.parse(localStorage.getItem('stacked-deck-v1')));
  const header = (p = page) => p.textContent('.btn.account');
  // Sign in on a page with the test hook (after the SDK has loaded).
  async function signInAs(p, sub, email) {
    await p.waitForSelector('.btn.account');
    await p.click('.btn.account');
    await p.waitForSelector('.modal.dialog .btn.gold:not([disabled])', { timeout: 20000 });
    await p.click('.modal.dialog .btn.ghost');
    await p.evaluate(([s, e]) => window.stackedDeckTest.signIn(s, e), [sub, email]);
  }

  // A player with one solved floor, never signed in.
  await page.goto(base);
  await page.evaluate(([id, cells, par, rules]) => localStorage.setItem('stacked-deck-v1', JSON.stringify({ levels: { [id]: {
    cells, solved: true, best: par, solutions: [{ cells, croupiers: par.croupiers, rounds: par.rounds, at: 1700000000000, rules }],
  } } })), [LEVEL, REF, level.par, RULES_VERSION]);
  await page.goto(`${site}#/`);
  await page.waitForSelector('.btn.account');
  check((await header()) === 'Sign in', 'signed out: the header offers signing in');

  // Signing in explains what is stored first.
  await page.click('.btn.account');
  await page.waitForSelector('.modal.dialog');
  const text = await page.textContent('.modal.dialog');
  check(/What signing in stores/.test(text) && /never shown to anyone else/.test(text) && /nickname/.test(text), 'the sign-in dialog says what is stored');
  await page.waitForSelector('.modal.dialog .btn.gold:not([disabled])', { timeout: 20000 });
  check((await page.textContent('.modal.dialog .btn.gold')) === 'Sign in with Google', 'the Google button is ready once the SDK has loaded');
  if (shots) await page.locator('.modal.dialog').screenshot({ path: join(shots, 'o1-sign-in.png') });
  await page.click('.modal.dialog .btn.ghost');

  // Sign in (the emulator's test hook stands in for Google's popup).
  await page.evaluate(() => window.stackedDeckTest.signIn('alice-sub', 'alice@example.com'));
  await page.waitForSelector('.modal.dialog .dlg-input', { timeout: 20000 });
  check(/Choose a nickname/.test(await page.textContent('.modal.dialog')), 'first sign-in asks for a nickname');
  if (shots) await page.locator('.modal.dialog').screenshot({ path: join(shots, 'o2-nickname.png') });
  await page.fill('.dlg-input', '  Ace\u202e of Clubs ');
  await page.keyboard.press('Enter');
  await until(async () => (await header()) === '☺ Ace of Clubs', 10000);
  check((await header()) === '☺ Ace of Clubs', `the header shows the cleaned nickname ("${await header()}")`);
  const alice = (await saveOf()).account?.uid;
  check(alice && (await saveOf()).account.signedIn, 'the save records the account');
  check((await owner(`profiles/${alice}`))?.name === 'Ace of Clubs', 'the nickname is stored');

  // The saved solution uploads, and the scoring function scores it.
  const scored = await until(async () => {
    const sols = await owner(`solutions/${alice}/${LEVEL}`);
    const one = sols && Object.values(sols)[0];
    return one?.score ? one : null;
  });
  check(scored && scored.score.croupiers === level.par.croupiers && scored.score.rounds === level.par.rounds && scored.rules === RULES_VERSION,
    `the saved solution is uploaded and scored (${JSON.stringify(scored?.score)})`);
  check((await saveOf()).levels[LEVEL].solutions[0].uploaded === alice, 'the local solution is marked uploaded');
  const key = `${level.par.croupiers}_${level.par.rounds}`;
  check(JSON.stringify(await owner(`stats/v${RULES_VERSION}/${LEVEL}`)) === JSON.stringify({ players: 1, points: { [key]: 1 } }), 'the floor\'s stats count it');

  // Everyone's scores on the floor's plot.
  await page.goto(`${site}#/level/${LEVEL}`);
  await page.waitForSelector('svg.board');
  await page.click('.sol-btn');
  await page.waitForSelector('.modal.solutions .sc-overall', { timeout: 20000 });
  check(await page.locator('.modal.solutions .sc-others circle').count() === 1, 'the plot draws everyone\'s scores');
  check(/1 player with this rules version/.test(await page.textContent('.modal.solutions .compare-note')), 'the note counts the players');
  if (shots) await page.locator('.modal.solutions').screenshot({ path: join(shots, 'o3-plot.png') });
  await page.keyboard.press('Escape');

  // A reload restores the session.
  await page.goto(`${site}#/`);
  await page.reload();
  await page.waitForSelector('.btn.account.signed-in', { timeout: 20000 });
  check((await header()) === '☺ Ace of Clubs', 'a reload restores the session');

  // Sign out, keeping this browser's progress.
  await page.click('.btn.account');
  await page.click('.modal.dialog >> text=Sign out');
  await page.click('.modal.dialog >> text=Sign out, keep progress here');
  await until(async () => (await header()) === 'Sign in', 10000);
  const kept = await saveOf();
  check((await header()) === 'Sign in' && kept.levels[LEVEL]?.solved && kept.account?.uid === alice && !kept.account.signedIn, 'signing out keeps the progress, remembering whose it is');

  // Another account on this browser: asked before adding the progress to it.
  await page.click('.btn.account');
  await page.waitForSelector('.modal.dialog .btn.gold:not([disabled])');
  await page.click('.modal.dialog .btn.ghost');
  await page.evaluate(() => window.stackedDeckTest.signIn('bob-sub', 'bob@example.com'));
  await page.waitForSelector('.modal.dialog >> text=Progress from another account', { timeout: 20000 });
  check(true, 'signing in with another account asks first');
  if (shots) await page.locator('.modal.dialog').screenshot({ path: join(shots, 'o4-other-account.png') });
  await page.click('.modal.dialog >> text=Add it to this account');
  await page.waitForSelector('.modal.dialog .dlg-input', { timeout: 20000 });
  await page.click('.modal.dialog >> text=Later');
  await until(async () => (await header()) === '☺ Signed in', 10000);
  const bob = (await saveOf()).account?.uid;
  check(bob && bob !== alice && (await header()) === '☺ Signed in', 'the second account is signed in, without a nickname');
  const bobs = await until(async () => {
    const sols = await owner(`solutions/${bob}/${LEVEL}`);
    return sols && Object.values(sols)[0]?.score ? sols : null;
  });
  check(!!bobs, 'the progress is added to the second account');
  check((await owner(`stats/v${RULES_VERSION}/${LEVEL}`))?.players === 2, 'the stats now count two players');

  // Delete the second account's data (keeping this browser's progress).
  await page.click('.btn.account');
  await page.click('.modal.dialog >> text=Delete my data…');
  await page.waitForSelector('.modal.dialog >> text=Delete everything');
  check(/sign-in account itself/.test(await page.textContent('.modal.dialog')), 'the delete dialog says what goes');
  if (shots) await page.locator('.modal.dialog').screenshot({ path: join(shots, 'o5-delete.png') });
  await page.click('.modal.dialog >> text=Delete everything');
  await page.waitForSelector('.modal.dialog h2 >> text=Deleted', { timeout: 30000 });
  check(await owner(`solutions/${bob}`) === null && await owner(`scores/v${RULES_VERSION}/${bob}`) === null && await owner(`limits/${bob}`) === null,
    'the account\'s solutions, scores and limits are deleted');
  check(JSON.stringify(await owner(`stats/v${RULES_VERSION}/${LEVEL}`)) === JSON.stringify({ players: 1, points: { [key]: 1 } }), 'its points leave the stats');
  check(!(await userExists(bob)) && await userExists(alice), 'its sign-in account is deleted (and only that one)');
  await page.click('.modal.dialog >> text=Close');
  const afterDelete = await saveOf();
  check((await header()) === 'Sign in' && !afterDelete.account && afterDelete.levels[LEVEL]?.solved, 'signed out, with this browser\'s progress kept');

  // The first account signs in again: no questions (the browser's progress
  // belongs to no account now), and its nickname is back.
  await page.click('.btn.account');
  await page.waitForSelector('.modal.dialog .btn.gold:not([disabled])');
  await page.click('.modal.dialog .btn.ghost');
  await page.evaluate(() => window.stackedDeckTest.signIn('alice-sub', 'alice@example.com'));
  await until(async () => (await header()) === '☺ Ace of Clubs', 20000);
  check((await header()) === '☺ Ace of Clubs' && !(await page.locator('.modal.dialog').count()), 'the first account signs in again without questions');

  // ---------- cloud save between two devices ----------
  const second = await device();
  await second.goto(`${site}#/`);
  await signInAs(second, 'alice-sub', 'alice@example.com');
  await until(async () => (await header(second)) === '☺ Ace of Clubs', 20000);
  const got = await until(async () => {
    const lv = (await saveOf(second))?.levels?.[LEVEL];
    return lv?.solved && lv.solutions?.length === 1 && lv.cells?.length ? lv : null;
  }, 20000);
  check(got && JSON.stringify(got.cells) === JSON.stringify(REF) && got.solutions[0].croupiers === level.par.croupiers &&
    got.solutions[0].rounds === level.par.rounds && !got.solutions[0].broken, 'a second device gets the floor: solved, its solution and the working machine');
  check(await second.locator(`a.tile.solved[data-level="${LEVEL}"]`).count() === 1, 'the second device shows the floor cleared');

  // ---------- friends ----------
  // Carol: her own device, with a solved floor, signs in and picks a nickname.
  const carolPage = await device();
  await carolPage.goto(base);
  await carolPage.evaluate(([id, cells, par, rules]) => localStorage.setItem('stacked-deck-v1', JSON.stringify({ levels: { [id]: {
    cells, solved: true, best: par, solutions: [{ cells, croupiers: par.croupiers, rounds: par.rounds, at: 1700000000000, rules }],
  } } })), [LEVEL, REF.slice().reverse(), level.par, RULES_VERSION]);
  await carolPage.goto(`${site}#/`);
  await signInAs(carolPage, 'carol-sub', 'carol@example.com');
  await carolPage.waitForSelector('.modal.dialog .dlg-input', { timeout: 20000 });
  await carolPage.fill('.dlg-input', 'Carol');
  await carolPage.keyboard.press('Enter');
  const carol = await until(async () => (await saveOf(carolPage)).account?.uid);
  await until(async () => { const s = await owner(`solutions/${carol}/${LEVEL}`); return s && Object.values(s)[0]?.score; });

  // Alice makes an invite link.
  await page.click('.btn.account');
  await page.click('.modal.dialog >> text=Friends…');
  await page.waitForSelector('.modal.dialog >> text=No friends yet');
  await page.click('.modal.dialog >> text=Invite a friend');
  await page.waitForSelector('.invite-link', { timeout: 20000 });
  const link = await page.inputValue('.invite-link');
  const code = /#invite=([A-Za-z0-9]{12})$/.exec(link)?.[1];
  check(!!code && link === `${base}#invite=${code}`, `an invite link is made (${link.replace(base, '')})`);
  if (shots) await page.locator('.modal.dialog').screenshot({ path: join(shots, 'o6-invite.png') });
  await page.click('.modal.dialog >> text=Close');

  // Carol opens it: told who it's from, and nothing happens until she accepts.
  await carolPage.goto(`${base}?emulator#invite=${code}`);
  await carolPage.waitForSelector('.modal.dialog >> text=Accept invite?', { timeout: 30000 });
  check(/Ace of Clubs/.test(await carolPage.textContent('.modal.dialog')), 'the invitee sees who the invite is from');
  check(!(await carolPage.evaluate(() => location.hash)).includes('invite'), 'the code is taken out of the address');
  check(await owner(`friends/${alice}`) === null, 'nothing changes before accepting');
  if (shots) await carolPage.locator('.modal.dialog').screenshot({ path: join(shots, 'o7-accept.png') });
  await carolPage.click('.modal.dialog button:text-is("Accept")');
  await carolPage.waitForSelector('.modal.dialog >> text=/now friends|Couldn/', { timeout: 20000 });
  check(/now friends/.test(await carolPage.textContent('.modal.dialog')), `accepting succeeds (${(await carolPage.textContent('.modal.dialog')).slice(0, 120)})`);
  await carolPage.click('.modal.dialog >> text=OK');
  check((await owner(`friends/${alice}/${carol}`)) === true && (await owner(`friends/${carol}/${alice}`)) === true && await owner(`invites/${code}`) === null,
    'accepting makes the friendship both ways and uses up the invite');

  // Alice sees Carol's frontier on the floor's plot, labelled with her nickname.
  await page.goto(`${site}#/level/${LEVEL}`);
  await page.reload();
  await page.waitForSelector('svg.board');
  await until(async () => (await header().catch(() => '')) !== 'Signing in…', 5000);
  await page.click('.sol-btn');
  await page.waitForSelector('.modal.solutions .sc-friend', { timeout: 20000 });
  check((await page.textContent('.modal.solutions .sc-friend-t')) === 'Carol' && /Carol/.test(await page.textContent('.modal.solutions .sc-legend')),
    'a friend\'s frontier is drawn on the plot with their nickname');
  if (shots) await page.locator('.modal.solutions').screenshot({ path: join(shots, 'o8-friend-plot.png') });
  await page.keyboard.press('Escape');

  // Carol ends the friendship from her Friends list: gone both ways.
  await carolPage.click('.btn.account');
  await carolPage.click('.modal.dialog >> text=Friends…');
  await carolPage.waitForSelector('.modal.dialog .friend-row >> text=Ace of Clubs', { timeout: 20000 });
  await carolPage.click('.modal.dialog .friend-row >> text=Remove');
  await carolPage.waitForSelector('.modal.dialog >> text=No friends yet', { timeout: 20000 });
  check(await owner(`friends/${alice}`) === null && await owner(`friends/${carol}`) === null, 'removing a friend ends it both ways');
  await carolPage.click('.modal.dialog >> text=Close');

  // ---------- cloud save: edits and deletions reach the other device ----------
  await page.goto(`${site}#/level/${LEVEL}`);
  await page.waitForSelector('svg.board');
  await page.click('text=Clear floor');
  const emptied = await until(async () => (await owner(`saves/${alice}/${LEVEL}/work`))?.cells === '[]', 20000);
  check(!!emptied, 'clearing the floor saves the (empty) working machine to the account');
  await second.reload();
  await until(async () => (await saveOf(second))?.levels?.[LEVEL]?.cells?.length === 0, 20000);
  check((await saveOf(second)).levels[LEVEL].cells.length === 0, 'the other device gets the edit');
  await page.click('.sol-btn');
  await page.waitForSelector('.modal.solutions .sol-del');
  await page.click('.modal.solutions .sol-del');
  const hash = (await saveOf()).levels[LEVEL].deleted?.[0];
  check(!!hash && (await saveOf()).levels[LEVEL].solutions.length === 0, 'deleting a solution remembers its hash');
  await until(async () => (await owner(`saves/${alice}/${LEVEL}/deleted/${hash}`)) === true, 20000);
  await second.reload();
  await until(async () => (await saveOf(second))?.levels?.[LEVEL]?.solutions?.length === 0, 20000);
  const gone = (await saveOf(second)).levels[LEVEL];
  check(gone.solutions.length === 0 && gone.solved && gone.deleted?.includes(hash), 'the other device drops the deleted solution (the floor stays cleared)');
  await page.goto(`${site}#/`);

  // Sign out and clear this browser.
  await page.click('.btn.account');
  await page.click('.modal.dialog >> text=Sign out');
  await page.click('.modal.dialog >> text=Sign out and clear this browser');
  await until(async () => (await header()) === 'Sign in', 10000);
  const cleared = await saveOf();
  check(Object.keys(cleared.levels).length === 0 && !cleared.account, 'signing out can clear this browser\'s progress');

  check(errors.length === 0, `no page errors${errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''}`);
  check(outside.length === 0, `nothing outside this machine was contacted${outside.length ? ': ' + outside.slice(0, 3).join(' ') : ''}`);
} finally {
  await browser.close();
  server.kill();
}
console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
process.exit(failures ? 1 : 0);
