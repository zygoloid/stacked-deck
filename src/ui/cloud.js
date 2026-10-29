// The online features' Firebase side (docs/online.md): signing in with
// Google, the account's nickname, uploading solved machines, cloud save
// (merging this browser's progress with the account's), reading each floor's
// stats, friends, and deleting the account's data. The Firebase SDK is loaded from Google's CDN only when the
// player signs in (or was signed in last time); a player who never signs in
// loads nothing and stores nothing online. Every call is best-effort: a
// failure leaves the local save as it is, and uploads are retried later.
//
// With `?emulator` in the page URL it talks to the Firebase emulators on
// 127.0.0.1 instead (for tests; see tools/online-smoke.js), and exposes
// window.stackedDeckTest.signIn(sub, email) to sign in without a popup; with
// sessionStorage 'stacked-deck-test-stall' set to '1', its database reads
// never answer (as when the database can't be reached).
import { RULES_VERSION } from '../engine.js';
import {
  firebaseConfig, DATABASE_URL, FIREBASE_SDK, FUNCTIONS_REGION, APP_CHECK_SITE_KEY, EMULATOR_PROJECT,
} from '../firebase-config.js';
import { validateCells, scoreMachine, countCroupiers } from '../score.js';
import {
  uploadCandidates, prepareUpload, submission, readStats, cleanName, planMerge, withTimeout, MAX_MACHINE_CHARS,
} from '../online.js';
import { solutionsOf, recomputeBest } from './model.js';

const EMULATOR = typeof location !== 'undefined' && /[?&]emulator\b/.test(location.search);
const stalled = () => EMULATOR && sessionStorage.getItem('stacked-deck-test-stall') === '1';
const SUBMIT_GAP_MS = 1100; // the rules allow one solution a second per account
const IDLE_MS = 15000;      // close the database connection when idle this long
const READ_TIMEOUT_MS = EMULATOR ? 5000 : 15000; // give up on a database read after this long
const RETRY_MS = 60000;     // while the database can't be reached, try again this often
const PUSH_DELAY_MS = 4000; // save the working machine this long after the last edit
const RESYNC_MS = 5 * 60000; // on returning to the tab, pull other devices' changes this often at most

// cloud = createCloud({ save, persist, levels, ui })
//   ui.confirmOtherAccount() -> 'merge' | 'clear' | 'cancel': this browser's
//     progress was saved with another account
//   ui.askName() -> a nickname, or null to choose one later
//   ui.cleared() after this browser's progress is cleared
//   ui.levelsUpdated(ids) after cloud save changed those floors' local saves
// cloud.state(): 'signed-out' | 'starting' | 'signed-in'; cloud.user(): { uid, name } | null
// cloud.offline(): signed in, but the database isn't answering
export function createCloud({ save, persist, levels, ui }) {
  const listeners = new Set();
  let fb = null;         // loaded SDK: { authM, dbM, auth, db }
  let loading = null;    // promise of fb
  let state = 'signed-out';
  let user = null;
  const stats = new Map();      // level id -> { at, st: { points, players } }
  const statsLoads = new Map(); // level id -> promise
  const skip = new Set();       // solutions not to retry this session
  let uploading = null;          // the upload queue's run, while it runs
  let deleting = false;          // deleting the account: no more uploads
  let serverRules = null;       // /config/rulesVersion, read once per session
  let lastSubmit = 0;
  let idleTimer = 0;
  let pendingClear = false;      // deleteAccount's clearLocal, while Google asks to confirm
  const levelById = new Map(levels.map((l) => [l.id, l]));
  let syncing = null;            // cloud save's merge, while it runs
  let lastSync = 0;
  const pending = new Map();     // level id -> { timer, solved } waiting to be pushed
  let friendList = null;         // { at, list: promise of [{ uid, name }] }
  const friendLoads = new Map(); // level id -> { at, frontiers: promise of friendFrontiers' result }
  let fnM = null, functions = null;
  let handling = null;           // the latest sign-in change being handled
  let profileRead = false;       // the account's nickname has been read (it may be '')
  let offline = false;           // the last database read timed out (until one is answered)
  let answeredAt = 0;            // when the last answered read was asked
  let retryTimer = 0;
  let retrying = null;           // retry(), while it runs
  let settle;                    // resolves once the first sign-in state is known
  const settled = new Promise((r) => { settle = r; });

  // A floor's stats and friends' frontiers are read when a plot first needs
  // them, again after the account uploads a solution there, and at most every
  // RESYNC_MS otherwise, so friends' new solves show up.
  const fresh = (entry) => !!entry && Date.now() - entry.at < RESYNC_MS;

  const notify = () => listeners.forEach((fn) => { try { fn(); } catch (e) { console.error(e); } });
  const setState = (s, u = user) => {
    state = s;
    user = u;
    if (s !== 'signed-in') { offline = false; clearTimeout(retryTimer); }
    notify();
  };

  function load() {
    loading ??= (async () => {
      const sdk = (name) => import(`${FIREBASE_SDK}/firebase-${name}.js`);
      const [appM, authM, dbM] = await Promise.all([sdk('app'), sdk('auth'), sdk('database')]);
      const app = appM.initializeApp(EMULATOR ? { ...firebaseConfig, projectId: EMULATOR_PROJECT } : firebaseConfig);
      if (APP_CHECK_SITE_KEY && !EMULATOR) {
        const checkM = await sdk('app-check');
        checkM.initializeAppCheck(app, {
          provider: new checkM.ReCaptchaEnterpriseProvider(APP_CHECK_SITE_KEY), isTokenAutoRefreshEnabled: true,
        });
      }
      const auth = authM.getAuth(app);
      const db = dbM.getDatabase(app, DATABASE_URL);
      if (EMULATOR) {
        authM.connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
        dbM.connectDatabaseEmulator(db, '127.0.0.1', 9000);
        window.stackedDeckTest = {
          signIn: (sub, email) => authM.signInWithCredential(auth,
            authM.GoogleAuthProvider.credential(JSON.stringify({ sub, email, email_verified: true }))),
        };
      }
      fb = { app, authM, dbM, auth, db };
      authM.onAuthStateChanged(auth, (u) => {
        handling = onUser(u).catch((e) => console.error('sign-in:', e)).finally(settle);
      });
      return fb;
    })();
    loading.catch(() => { loading = null; });
    return loading;
  }

  // The database, connected while in use and disconnected once idle (the
  // project pays for connections and downloads, so none are kept open).
  // Reads give up after READ_TIMEOUT_MS: the SDK waits for a connection
  // indefinitely, and a read that never finishes would leave signing in at
  // "Signing in…" and the Friends dialog loading for good. Each read's
  // outcome says whether the database is reachable (see reached()). Writes
  // aren't timed: the SDK queues them and sends them once it connects.
  async function withDb(fn) {
    const { dbM, db } = fb;
    const get = (query) => {
      const asked = Date.now();
      return withTimeout(stalled() ? new Promise(() => {}) : dbM.get(query), READ_TIMEOUT_MS, 'no answer from the database').then(
        (snap) => { reached(true, asked); return snap; },
        (e) => { reached(e?.code !== 'timeout', asked); throw e; });
    };
    const timed = { ...dbM, get };
    clearTimeout(idleTimer);
    dbM.goOnline(db);
    try {
      return await fn(timed, db);
    } finally {
      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => dbM.goOffline(db), IDLE_MS);
    }
  }

  // A database read asked at `asked` was answered (`ok`, even if refused) or
  // timed out. While reads time out the account is shown as offline, and
  // everything is tried again every RETRY_MS; once one is answered, what was
  // missed catches up. (A read that times out after a later one was answered
  // doesn't count: it was asked while offline.)
  function reached(ok, asked) {
    if (state === 'signed-out') return;
    if (!ok) {
      if (asked < answeredAt) return;
      clearTimeout(retryTimer);
      retryTimer = setTimeout(retry, RETRY_MS);
      if (!offline) { offline = true; notify(); }
      return;
    }
    answeredAt = Math.max(answeredAt, asked);
    if (offline) {
      offline = false;
      clearTimeout(retryTimer);
      notify();
      retry();
    }
  }

  // Read the nickname if it couldn't be read on signing in, then catch up
  // cloud save and uploads (after any run already under way, which may have
  // started offline). Resolves when done (or still offline).
  function retry() {
    retrying ??= (async () => {
      if (state !== 'signed-in') return;
      if (!profileRead) {
        const uid = user.uid;
        try {
          const name = await readName(uid);
          if (state === 'signed-in' && user.uid === uid && !profileRead) {
            profileRead = true;
            setState('signed-in', { ...user, name });
          }
        } catch (e) { console.warn('profile:', e); }
        if (offline) return;
      }
      await syncing;
      await syncAll();
      await uploading;
      queueUploads();
    })().finally(() => { retrying = null; });
    return retrying;
  }

  const readName = (uid) => withDb(async (dbM, db) => (await dbM.get(dbM.ref(db, `profiles/${uid}/name`))).val() ?? '');

  async function onUser(u) {
    if (!u) {
      if (save.account?.signedIn) { save.account.signedIn = false; persist(); }
      friendList = null;
      friendLoads.clear();
      setState('signed-out', null);
      return;
    }
    if (!u.providerData.some((p) => p.providerId === 'google.com')) { await fb.authM.signOut(fb.auth); return; }
    setState('starting', null);
    // This browser's progress belongs to another account: ask before mixing.
    if (save.account?.uid && save.account.uid !== u.uid) {
      const choice = await ui.confirmOtherAccount();
      if (choice === 'cancel') { await fb.authM.signOut(fb.auth); return; }
      if (choice === 'clear') { save.levels = {}; persist(); ui.cleared?.(); }
    }
    save.account = { uid: u.uid, signedIn: true };
    persist();
    let name = '';
    profileRead = false;
    try {
      name = await readName(u.uid);
      profileRead = true;
    } catch (e) { console.warn('profile:', e); }
    setState('signed-in', { uid: u.uid, name });
    // Ask for a nickname only if there really is none (not if the read
    // failed, e.g. while the database is locked down or can't be reached).
    if (profileRead && !name) {
      const chosen = await ui.askName();
      if (chosen) await setName(chosen).catch((e) => console.warn('nickname:', e));
    }
    await syncAll();
    queueUploads();
  }

  async function setName(raw) {
    const name = cleanName(raw);
    if (!name || state !== 'signed-in') return false;
    await withDb((dbM, db) => dbM.set(dbM.ref(db, `profiles/${user.uid}`), { name }));
    profileRead = true;
    setState('signed-in', { ...user, name });
    return true;
  }

  // Upload saved solutions this account doesn't have yet, one at a time and
  // at most one a second, in the background.
  function queueUploads() {
    if (uploading || deleting || state !== 'signed-in') return uploading;
    uploading = runUploads().finally(() => { uploading = null; });
    return uploading;
  }
  async function runUploads() {
    let uploaded = false;
    try {
      for (;;) {
        if (state !== 'signed-in' || deleting) break;
        const uid = user.uid;
        const [next] = uploadCandidates(save, levels, uid, skip);
        if (!next) break;
        const { level, sol } = next;
        const prep = await prepareUpload(level, sol.cells);
        if (!prep) {
          console.warn(`online: not uploading a ${level.id} solution the server wouldn't accept (invalid or too long)`);
          skip.add(sol);
          continue;
        }
        const done = await withDb(async (dbM, db) => {
          serverRules ??= (await dbM.get(dbM.ref(db, 'config/rulesVersion'))).val();
          if (!Number.isInteger(serverRules)) {
            // The server isn't set up: config/rulesVersion must be a number.
            console.warn(`online: not uploading: config/rulesVersion is ${JSON.stringify(serverRules)}, not a number`);
            serverRules = null; // read it again next time
            return 'stop';
          }
          await new Promise((r) => setTimeout(r, Math.max(0, lastSubmit + SUBMIT_GAP_MS - Date.now())));
          lastSubmit = Date.now();
          try {
            await dbM.update(dbM.ref(db), submission({
              uid, levelId: level.id, hash: prep.hash, json: prep.json, at: sol.at, rules: serverRules, now: dbM.serverTimestamp(),
            }));
            return 'uploaded';
          } catch (e) {
            if (!/permission.denied/i.test(`${e?.code} ${e?.message}`)) throw e;
            // Already there (an earlier upload, or another device), or refused.
            const there = (await dbM.get(dbM.ref(db, `solutions/${uid}/${level.id}/${prep.hash}`))).val();
            if (there && (there.cells === prep.json || there.invalid || there.score)) return 'uploaded';
            console.warn(`online: upload of a ${level.id} solution refused (rules version ${serverRules}; this game's is ${RULES_VERSION}):`, e?.message ?? e);
            serverRules = null; // perhaps the server's rules version changed
            return 'refused';
          }
        });
        if (done === 'stop') break;
        if (done === 'refused') { skip.add(sol); continue; }
        sol.uploaded = uid;
        sol.hash = prep.hash;
        persist();
        // Our point may change the stats, and friends may have solved the
        // floor since they were read: read both again.
        stats.delete(level.id);
        friendLoads.delete(level.id);
        uploaded = true;
      }
    } catch (e) {
      console.warn('online: upload paused:', e); // offline or similar: retried on the next solve or start
    }
    // Open plots redraw (once, not after every upload of a backlog).
    if (uploaded) notify();
  }

  // ---------- cloud save ----------

  // A saved solution's hash (of its validated machine), computed once.
  async function hashOf(level, sol) {
    if (!sol.hash) sol.hash = (await prepareUpload(level, sol.cells))?.hash;
    return sol.hash ?? null;
  }

  // Pull the account's saves and solutions, merge them with this browser's
  // (planMerge in src/online.js), and push what the account lacks.
  function syncAll() {
    if (syncing || deleting || state !== 'signed-in') return syncing;
    syncing = runSync().catch((e) => console.warn('cloud save:', e)).finally(() => { syncing = null; lastSync = Date.now(); });
    return syncing;
  }
  async function runSync() {
    const uid = user.uid;
    const [remoteSaves, remoteSols] = await withDb((dbM, db) => Promise.all([
      dbM.get(dbM.ref(db, `saves/${uid}`)).then((snap) => snap.val() ?? {}),
      dbM.get(dbM.ref(db, `solutions/${uid}`)).then((snap) => snap.val() ?? {}),
    ]));
    if (state !== 'signed-in' || user?.uid !== uid) return;
    const changed = [], workToPush = [], push = {};
    for (const level of levels) {
      const id = level.id;
      const remote = remoteSaves[id] ?? null, rsols = remoteSols[id] ?? null;
      if (!save.levels[id] && !remote && !rsols) continue;
      const ls = save.levels[id];
      const localHashes = new Map();
      for (const sol of ls?.solutions ?? []) localHashes.set(sol, await hashOf(level, sol));
      const plan = planMerge({ ls, remote, remoteSolutions: rsols, localHashes });
      const l = save.levels[id] ??= {};
      let touched = false;
      if (plan.work === 'take') {
        let cells = null;
        try { cells = validateCells(level, JSON.parse(remote.work.cells)).cells ?? null; } catch { /* ignore a bad remote machine */ }
        if (cells) { l.cells = cells; l.workAt = l.workSynced = remote.work.at; touched = true; }
      } else if (plan.work === 'push') workToPush.push(id);
      if (plan.markSolved) { l.solved = true; touched = true; }
      if (plan.pushSolved) push[`saves/${uid}/${id}/solved`] = true;
      if (plan.remove.length) { l.solutions = solutionsOf(l).filter((s) => !plan.remove.includes(s)); touched = true; }
      for (const add of plan.add) {
        let cells = null;
        try { cells = validateCells(level, JSON.parse(add.cells)).cells ?? null; } catch { /* ignore */ }
        if (!cells) continue;
        let sc = { ok: false };
        try { sc = await scoreMachine(level, cells); } catch { /* broken */ }
        solutionsOf(l).push({
          cells, croupiers: countCroupiers(cells), rounds: sc.rounds ?? 0, at: Number.isFinite(add.at) ? add.at : Date.now(),
          rules: RULES_VERSION, uploaded: uid, hash: add.hash, ...(sc.ok ? {} : { broken: true }),
        });
        if (sc.ok) l.solved = true;
        touched = true;
      }
      if (plan.deleted.join() !== (l.deleted ?? []).join()) { l.deleted = plan.deleted; touched = true; }
      for (const h of plan.pushDeleted) push[`saves/${uid}/${id}/deleted/${h}`] = true;
      if (touched) { recomputeBest(l); changed.push(id); }
      else if (!Object.keys(l).length) delete save.levels[id];
    }
    if (changed.length) { persist(); notify(); ui.levelsUpdated?.(changed); }
    if (Object.keys(push).length) await withDb((dbM, db) => dbM.update(dbM.ref(db), push));
    for (const id of workToPush) await pushWork(id);
  }

  // Send a floor's working machine (validated, as JSON) to the account.
  async function pushWork(id) {
    const level = levelById.get(id), ls = save.levels[id];
    if (!level || !ls?.cells || state !== 'signed-in') return;
    const v = validateCells(level, ls.cells);
    if (v.error) return;
    const json = JSON.stringify(v.cells);
    if (json.length > MAX_MACHINE_CHARS) return;
    const uid = user.uid, editedAt = ls.workAt;
    const at = await withDb(async (dbM, db) => {
      const ref = dbM.ref(db, `saves/${uid}/${id}/work`);
      await dbM.set(ref, { cells: json, at: dbM.serverTimestamp() });
      return (await dbM.get(dbM.child(ref, 'at'))).val();
    });
    // Synced, unless it was edited again meanwhile.
    ls.workSynced = at;
    if (ls.workAt === editedAt) ls.workAt = at;
    persist();
  }

  // A floor changed in the editor: its working machine (`work`), or it was
  // cleared with a new solution (`solved`). Pushed a few seconds later.
  function levelChanged(id, { work = false, solved = false } = {}) {
    const ls = save.levels[id];
    if (!ls || !levelById.has(id)) return;
    if (work) { ls.workAt = Date.now(); persist(); }
    if (state !== 'signed-in' || deleting) return;
    const p = pending.get(id) ?? {};
    clearTimeout(p.timer);
    p.solved ||= solved;
    p.timer = setTimeout(() => flush(id), PUSH_DELAY_MS);
    pending.set(id, p);
  }
  function flush(id) {
    const p = pending.get(id);
    if (!p) return;
    clearTimeout(p.timer);
    pending.delete(id);
    pushLevel(id, p).catch((e) => console.warn('cloud save:', e));
  }
  async function pushLevel(id, { solved }) {
    const ls = save.levels[id], level = levelById.get(id);
    if (!ls || state !== 'signed-in') return;
    const uid = user.uid;
    if (Array.isArray(ls.cells) && (ls.workSynced === undefined || ls.workAt !== ls.workSynced)) await pushWork(id);
    if (solved) {
      const update = { [`saves/${uid}/${id}/solved`]: true };
      // A machine deleted earlier and found again is no longer deleted.
      const hashes = new Set();
      for (const sol of ls.solutions ?? []) hashes.add(await hashOf(level, sol));
      const back = (ls.deleted ?? []).filter((h) => hashes.has(h));
      if (back.length) {
        ls.deleted = ls.deleted.filter((h) => !hashes.has(h));
        persist();
        for (const h of back) update[`saves/${uid}/${id}/deleted/${h}`] = null;
      }
      await withDb((dbM, db) => dbM.update(dbM.ref(db), update));
    }
  }

  // The player deleted a saved solution: remember it (here and, if the
  // account has that machine, in the account) so other devices drop it too.
  async function solutionDeleted(level, sol) {
    const h = await hashOf(level, sol);
    const ls = save.levels[level.id];
    if (!h || !ls) return;
    ls.deleted = [...new Set([...(ls.deleted ?? []), h])].sort();
    persist();
    if (state === 'signed-in' && sol.uploaded === user.uid && levelById.has(level.id)) {
      await withDb((dbM, db) => dbM.set(dbM.ref(db, `saves/${user.uid}/${level.id}/deleted/${h}`), true)).catch((e) => console.warn('cloud save:', e));
    }
  }

  // Leaving the page: push waiting changes now (best-effort). Returning to it:
  // pull other devices' changes, now and then (at once if offline).
  if (typeof document !== 'undefined') {
    addEventListener('pagehide', () => { for (const id of [...pending.keys()]) flush(id); });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') { for (const id of [...pending.keys()]) flush(id); return; }
      if (state === 'signed-in' && (offline || Date.now() - lastSync > RESYNC_MS)) retry();
    });
  }

  // ---------- server functions and friends ----------

  // Call one of this game's callable functions (functions/index.js). Errors
  // carry the server's code (e.g. 'functions/not-found') and message.
  async function call(name, data) {
    if (!fnM) {
      fnM = await import(`${FIREBASE_SDK}/firebase-functions.js`);
      functions = fnM.getFunctions(fb.app, FUNCTIONS_REGION);
      if (EMULATOR) fnM.connectFunctionsEmulator(functions, '127.0.0.1', 5001);
    }
    return (await fnM.httpsCallable(functions, name)(data)).data;
  }

  // The account's friends, with their nicknames: [{ uid, name }]. Read at
  // most every RESYNC_MS (someone may accept an invite meanwhile), after a
  // change here, and whenever `reread` (the Friends dialog). If the friends
  // differ from before, open plots redraw with them.
  function friends({ reread = false } = {}) {
    if (state !== 'signed-in') return Promise.resolve([]);
    if (reread || !fresh(friendList)) {
      const before = friendList?.list.catch(() => null);
      const entry = { at: Date.now() };
      entry.list = withDb(async (dbM, db) => {
        const uids = Object.keys((await dbM.get(dbM.ref(db, `friends/${user.uid}`))).val() ?? {});
        return Promise.all(uids.map(async (uid) => {
          let name = null;
          try { name = (await dbM.get(dbM.ref(db, `profiles/${uid}/name`))).val(); } catch { /* they removed us */ }
          return { uid, name: cleanName(name) || null };
        }));
      });
      entry.list.then(async (list) => {
        const old = await before;
        if (old && friendList === entry && JSON.stringify(old) !== JSON.stringify(list)) { friendLoads.clear(); notify(); }
      }, () => { if (friendList === entry) friendList = null; });
      friendList = entry;
    }
    return friendList.list;
  }
  const friendsChanged = () => { friendList = null; friendLoads.clear(); notify(); };

  // Each friend's frontier on a floor (this rules version): [{ uid, name,
  // points: [{ croupiers, rounds }] }], for friends with any. Read with the
  // floor's stats, and again when they are (see fresh()).
  function friendFrontiers(levelId) {
    if (!fresh(friendLoads.get(levelId))) {
      const entry = { at: Date.now() };
      entry.frontiers = friends().then((list) => withDb((dbM, db) => Promise.all(list.map(async (f) => {
        let node = null;
        try { node = (await dbM.get(dbM.ref(db, `scores/v${RULES_VERSION}/${f.uid}/${levelId}`))).val(); } catch { /* they removed us */ }
        const points = readStats({ points: Object.fromEntries(Object.keys(node ?? {}).map((k) => [k, 1])) }).points
          .map(({ croupiers, rounds }) => ({ croupiers, rounds }));
        return { ...f, points };
      })))).then((all) => all.filter((f) => f.points.length));
      entry.frontiers.catch(() => { if (friendLoads.get(levelId) === entry) friendLoads.delete(levelId); });
      friendLoads.set(levelId, entry);
    }
    return friendLoads.get(levelId).frontiers;
  }

  // After the account's data is deleted: forget the account here, and clear
  // this browser's progress too if asked.
  function forgetAccount(clearLocal) {
    delete save.account;
    if (clearLocal) save.levels = {};
    persist();
    stats.clear();
    friendLoads.clear();
    deleting = false;
    setState('signed-out', null);
    if (clearLocal) ui.cleared?.();
  }

  return {
    state: () => state,
    user: () => user,
    offline: () => offline,
    retry,
    onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    // On page load: reconnect if the player was signed in last time.
    start() { if (save.account?.signedIn) load().catch((e) => console.warn('online:', e)); },
    // Start loading the SDK early (when the sign-in dialog opens), so that
    // signIn() can open Google's popup straight from the click.
    preload: () => load(),
    ready: () => !!fb,
    // Must be called from a click handler, after preload() has finished.
    signIn() {
      return fb.authM.signInWithPopup(fb.auth, new fb.authM.GoogleAuthProvider());
    },
    async signOut({ clear = false } = {}) {
      if (fb) await fb.authM.signOut(fb.auth);
      if (clear) { save.levels = {}; delete save.account; }
      else if (save.account) save.account.signedIn = false;
      persist();
      setState('signed-out', null);
      if (clear) ui.cleared?.();
    },
    setName,
    queueUploads,
    syncAll,
    levelChanged,
    solutionDeleted,
    // Resolves once it is known whether a player who was signed in last time
    // still is (at once if they weren't).
    settled: () => (save.account?.signedIn ? settled : Promise.resolve()),
    // Resolves once the latest sign-in change has been handled (nickname,
    // merging progress).
    whenReady: () => handling ?? Promise.resolve(),
    friends,
    friendFrontiers,
    createInvite: () => call('createInvite'),
    previewInvite: (code) => call('previewInvite', { code }),
    async acceptInvite(code) { const r = await call('acceptInvite', { code }); friendsChanged(); return r; },
    async removeFriend(uid) { await call('removeFriend', { uid }); friendsChanged(); },
    // Delete everything this game stores for the account (the deleteMyData
    // function), then the sign-in account itself. Returns 'done', or
    // 'reauth' if Google wants the player to confirm it's them first (then
    // call reauthAndDelete() from a click).
    async deleteAccount({ clearLocal = false } = {}) {
      if (state !== 'signed-in') throw new Error('not signed in');
      deleting = true;
      for (const p of pending.values()) clearTimeout(p.timer);
      pending.clear();
      try {
        await uploading; // let an upload or merge under way finish first
        await syncing;
        await call('deleteMyData');
        try {
          await fb.authM.deleteUser(fb.auth.currentUser);
        } catch (e) {
          if (e?.code === 'auth/requires-recent-login') { pendingClear = clearLocal; return 'reauth'; }
          throw e;
        }
        forgetAccount(clearLocal);
        return 'done';
      } catch (e) {
        deleting = false;
        throw e;
      }
    },
    async reauthAndDelete() {
      const u = fb.auth.currentUser;
      await fb.authM.reauthenticateWithPopup(u, new fb.authM.GoogleAuthProvider());
      await fb.authM.deleteUser(u);
      forgetAccount(pendingClear);
    },
    // A floor's stats for this rules version: { points, players }, fetched
    // once per session (and again after one of our uploads to that floor).
    cachedStats: (levelId) => (fresh(stats.get(levelId)) ? stats.get(levelId).st : null),
    statsFor(levelId) {
      if (state !== 'signed-in') return Promise.resolve(null);
      if (fresh(stats.get(levelId))) return Promise.resolve(stats.get(levelId).st);
      if (!statsLoads.has(levelId)) {
        const at = Date.now();
        statsLoads.set(levelId, withDb(async (dbM, db) => readStats((await dbM.get(dbM.ref(db, `stats/v${RULES_VERSION}/${levelId}`))).val()))
          .then((st) => { stats.set(levelId, { at, st }); return st; })
          .finally(() => statsLoads.delete(levelId)));
      }
      return statsLoads.get(levelId);
    },
  };
}
