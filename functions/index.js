// Cloud Functions for this game (the `stacked-deck` codebase). Deploy with
// `firebase deploy --only functions:stacked-deck`; the predeploy step copies
// the game's engine, levels and scoring code into game/. See docs/online.md.
import { initializeApp } from 'firebase-admin/app';
import { getDatabaseWithUrl } from 'firebase-admin/database';
import { logger } from 'firebase-functions';
import { onValueCreated } from 'firebase-functions/v2/database';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { INSTANCE, INSTANCE_URL, REGION, RUNTIME_SERVICE_ACCOUNT, ENFORCE_APP_CHECK } from './config.js';
import { processSolution } from './solutions.js';
import { deleteUserData } from './account.js';
import * as friends from './friends.js';

const app = initializeApp();
// Always this game's instance, never the project's default database.
const db = () => getDatabaseWithUrl(INSTANCE_URL, app);

// Every function is capped: a few instances, one request each, short
// timeouts and no retries, so no input can run up much compute.
const LIMITS = {
  region: REGION, serviceAccount: RUNTIME_SERVICE_ACCOUNT,
  memory: '512MiB', cpu: 1, concurrency: 1, maxInstances: 2, timeoutSeconds: 30,
};

export const scoreSolution = onValueCreated(
  { ...LIMITS, ref: '/solutions/{uid}/{level}/{hash}', instance: INSTANCE, retry: false },
  async (event) => {
    const result = await processSolution(db(), event.params);
    logger.info('scoreSolution', { ...event.params, result });
  },
);

// The caller's uid, if they signed in with Google (all callables require it).
function caller(request) {
  const uid = request.auth?.uid;
  if (!uid || request.auth.token?.firebase?.sign_in_provider !== 'google.com') {
    throw new HttpsError('unauthenticated', 'Sign in with Google first.');
  }
  return uid;
}

// A callable whose handler gets (db, uid, data); FriendErrors become
// HttpsErrors the client can show.
const callable = (name, fn) => onCall({ ...LIMITS, enforceAppCheck: ENFORCE_APP_CHECK }, async (request) => {
  const uid = caller(request);
  try {
    return await fn(db(), uid, request.data ?? {});
  } catch (e) {
    if (e instanceof friends.FriendError) throw new HttpsError(e.code, e.message);
    logger.error(name, { uid, error: String(e) });
    throw new HttpsError('internal', 'Something went wrong.');
  }
});

// Friends (friends.js).
export const createInvite = callable('createInvite', (db, uid) => friends.createInvite(db, uid));
export const previewInvite = callable('previewInvite', (db, uid, data) => friends.previewInvite(db, uid, data.code));
export const acceptInvite = callable('acceptInvite', (db, uid, data) => friends.acceptInvite(db, uid, data.code));
export const removeFriend = callable('removeFriend', async (db, uid, data) => {
  await friends.removeFriend(db, uid, data.uid);
  return { ok: true };
});

// Delete everything this game stores for the caller (account.js). The client
// then deletes the sign-in account itself (user.delete()), so these functions
// never need rights over the project's users.
export const deleteMyData = onCall({ ...LIMITS, enforceAppCheck: ENFORCE_APP_CHECK }, async (request) => {
  const uid = caller(request);
  const floors = await deleteUserData(db(), uid);
  logger.info('deleteMyData', { uid, floors });
  return { ok: true };
});
