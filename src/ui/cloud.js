// The online features' Firebase side (docs/online.md): signing in with
// Google, the account's nickname, uploading solved machines, and reading each
// floor's stats. The Firebase SDK is loaded from Google's CDN only when the
// player signs in (or was signed in last time); a player who never signs in
// loads nothing and stores nothing online. Every call is best-effort: a
// failure leaves the local save as it is, and uploads are retried later.
//
// With `?emulator` in the page URL it talks to the Firebase emulators on
// 127.0.0.1 instead (for tests; see tools/online-smoke.js), and exposes
// window.stackedDeckTest.signIn(sub, email) to sign in without a popup.
import { RULES_VERSION } from '../engine.js';
import {
  firebaseConfig, DATABASE_URL, FIREBASE_SDK, FUNCTIONS_REGION, APP_CHECK_SITE_KEY, EMULATOR_PROJECT,
} from '../firebase-config.js';
import { uploadCandidates, prepareUpload, submission, readStats, cleanName } from '../online.js';

const EMULATOR = typeof location !== 'undefined' && /[?&]emulator\b/.test(location.search);
const SUBMIT_GAP_MS = 1100; // the rules allow one solution a second per account
const IDLE_MS = 15000;      // close the database connection when idle this long

// cloud = createCloud({ save, persist, levels, ui })
//   ui.confirmOtherAccount() -> 'merge' | 'clear' | 'cancel': this browser's
//     progress was saved with another account
//   ui.askName() -> a nickname, or null to choose one later
//   ui.cleared() after this browser's progress is cleared
// cloud.state(): 'signed-out' | 'starting' | 'signed-in'; cloud.user(): { uid, name } | null
export function createCloud({ save, persist, levels, ui }) {
  const listeners = new Set();
  let fb = null;         // loaded SDK: { authM, dbM, auth, db }
  let loading = null;    // promise of fb
  let state = 'signed-out';
  let user = null;
  const stats = new Map();      // level id -> { points, players }
  const statsLoads = new Map(); // level id -> promise
  const skip = new Set();       // solutions not to retry this session
  let uploading = null;          // the upload queue's run, while it runs
  let deleting = false;          // deleting the account: no more uploads
  let serverRules = null;       // /config/rulesVersion, read once per session
  let lastSubmit = 0;
  let idleTimer = 0;
  let pendingClear = false;      // deleteAccount's clearLocal, while Google asks to confirm

  const notify = () => listeners.forEach((fn) => { try { fn(); } catch (e) { console.error(e); } });
  const setState = (s, u = user) => { state = s; user = u; notify(); };

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
      authM.onAuthStateChanged(auth, (u) => { onUser(u).catch((e) => console.error('sign-in:', e)); });
      return fb;
    })();
    loading.catch(() => { loading = null; });
    return loading;
  }

  // The database, connected while in use and disconnected once idle (the
  // project pays for connections and downloads, so none are kept open).
  async function withDb(fn) {
    const { dbM, db } = fb;
    clearTimeout(idleTimer);
    dbM.goOnline(db);
    try {
      return await fn(dbM, db);
    } finally {
      clearTimeout(idleTimer);
      idleTimer = setTimeout(() => dbM.goOffline(db), IDLE_MS);
    }
  }

  async function onUser(u) {
    if (!u) {
      if (save.account?.signedIn) { save.account.signedIn = false; persist(); }
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
    try {
      name = await withDb(async (dbM, db) => (await dbM.get(dbM.ref(db, `profiles/${u.uid}/name`))).val() ?? '');
    } catch (e) { console.warn('profile:', e); }
    setState('signed-in', { uid: u.uid, name });
    if (!name) {
      const chosen = await ui.askName();
      if (chosen) await setName(chosen).catch((e) => console.warn('nickname:', e));
    }
    queueUploads();
  }

  async function setName(raw) {
    const name = cleanName(raw);
    if (!name || state !== 'signed-in') return false;
    await withDb((dbM, db) => dbM.set(dbM.ref(db, `profiles/${user.uid}`), { name }));
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
    try {
      for (;;) {
        if (state !== 'signed-in' || deleting) break;
        const uid = user.uid;
        const [next] = uploadCandidates(save, levels, uid, skip);
        if (!next) break;
        const { level, sol } = next;
        const prep = await prepareUpload(level, sol.cells);
        if (!prep) { skip.add(sol); continue; }
        const done = await withDb(async (dbM, db) => {
          serverRules ??= (await dbM.get(dbM.ref(db, 'config/rulesVersion'))).val();
          if (!Number.isInteger(serverRules)) return 'stop'; // the server isn't set up
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
            serverRules = null; // perhaps the server's rules version changed
            return 'refused';
          }
        });
        if (done === 'stop') break;
        if (done === 'refused') { skip.add(sol); continue; }
        sol.uploaded = uid;
        sol.hash = prep.hash;
        persist();
        stats.delete(level.id); // our point may change the stats
      }
    } catch (e) {
      console.warn('upload paused:', e); // offline or similar: retried on the next solve or start
    }
  }

  // After the account's data is deleted: forget the account here, and clear
  // this browser's progress too if asked.
  function forgetAccount(clearLocal) {
    delete save.account;
    if (clearLocal) save.levels = {};
    persist();
    stats.clear();
    deleting = false;
    setState('signed-out', null);
    if (clearLocal) ui.cleared?.();
  }

  return {
    state: () => state,
    user: () => user,
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
    // Delete everything this game stores for the account (the deleteMyData
    // function), then the sign-in account itself. Returns 'done', or
    // 'reauth' if Google wants the player to confirm it's them first (then
    // call reauthAndDelete() from a click).
    async deleteAccount({ clearLocal = false } = {}) {
      if (state !== 'signed-in') throw new Error('not signed in');
      deleting = true;
      try {
        await uploading; // let an upload under way finish first
        const fnM = await import(`${FIREBASE_SDK}/firebase-functions.js`);
        const functions = fnM.getFunctions(fb.app, FUNCTIONS_REGION);
        if (EMULATOR) fnM.connectFunctionsEmulator(functions, '127.0.0.1', 5001);
        await fnM.httpsCallable(functions, 'deleteMyData')();
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
    cachedStats: (levelId) => stats.get(levelId) ?? null,
    statsFor(levelId) {
      if (state !== 'signed-in') return Promise.resolve(null);
      if (stats.has(levelId)) return Promise.resolve(stats.get(levelId));
      if (!statsLoads.has(levelId)) {
        statsLoads.set(levelId, withDb(async (dbM, db) => readStats((await dbM.get(dbM.ref(db, `stats/v${RULES_VERSION}/${levelId}`))).val()))
          .then((st) => { stats.set(levelId, st); return st; })
          .finally(() => statsLoads.delete(levelId)));
      }
      return statsLoads.get(levelId);
    },
  };
}
