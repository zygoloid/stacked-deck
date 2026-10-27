// Friends (docs/online.md, "Friends and accounts"): single-use invite codes
// that last a week, accepted only after the invitee has seen who it is from.
// A friendship is mutual (friends/a/b and friends/b/a) and lets each read the
// other's nickname and scores (database.rules.json).
import { randomInt } from 'node:crypto';

export const INVITE_DAYS = 7;
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
export const isCode = (code) => typeof code === 'string' && /^[A-Za-z0-9]{12}$/.test(code);
// Firebase Auth uids: letters and digits (checked before building a path).
export const isUid = (uid) => typeof uid === 'string' && /^[A-Za-z0-9]{1,128}$/.test(uid);

// A thrown error the callable turns into an HttpsError of that code.
export class FriendError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

// A new invite from `uid`, replacing their previous one. { code, expires }
export async function createInvite(db, uid, now = Date.now()) {
  const expires = now + INVITE_DAYS * 24 * 3600 * 1000;
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = Array.from({ length: 12 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');
    // Claim the code only if it is free (null for null: see solutions.js).
    let mine = false;
    const { committed } = await db.ref(`invites/${code}`).transaction((current) => {
      mine = !current;
      return current ?? { from: uid, expires };
    });
    if (!committed || !mine) continue;
    const old = (await db.ref(`inviteOf/${uid}`).get()).val();
    const update = { [`inviteOf/${uid}`]: code };
    if (isCode(old) && old !== code) update[`invites/${old}`] = null;
    await db.ref().update(update);
    return { code, expires };
  }
  throw new FriendError('unavailable', 'Couldn\'t make an invite just now.');
}

async function liveInvite(db, code, now) {
  if (!isCode(code)) throw new FriendError('invalid-argument', 'That isn\'t an invite code.');
  const inv = (await db.ref(`invites/${code}`).get()).val();
  if (!inv || !(inv.expires > now)) throw new FriendError('not-found', 'That invite has been used or has expired.');
  return inv;
}

// Who an invite is from, for the "accept?" screen. { name, own, friends }
export async function previewInvite(db, uid, code, now = Date.now()) {
  const inv = await liveInvite(db, code, now);
  const name = (await db.ref(`profiles/${inv.from}/name`).get()).val() ?? null;
  const friends = !!(await db.ref(`friends/${uid}/${inv.from}`).get()).val();
  return { name, own: inv.from === uid, friends };
}

// Accept an invite: claim it (it is single-use, so of two accepting at once
// only one wins), then make the friendship. { name }
export async function acceptInvite(db, uid, code, now = Date.now()) {
  await liveInvite(db, code, now);
  let from = null, refusal = null;
  const { committed } = await db.ref(`invites/${code}`).transaction((current) => {
    from = null; refusal = null;
    if (!current) return null; // gone (or not yet read: the server decides)
    if (!(current.expires > now)) { refusal = 'not-found'; return current; }
    if (current.from === uid) { refusal = 'failed-precondition'; return current; }
    from = current.from;
    return null; // used up
  });
  if (refusal === 'failed-precondition') throw new FriendError(refusal, 'That\'s your own invite.');
  if (!committed || !from || refusal) throw new FriendError('not-found', 'That invite has been used or has expired.');
  const update = { [`friends/${uid}/${from}`]: true, [`friends/${from}/${uid}`]: true };
  if ((await db.ref(`inviteOf/${from}`).get()).val() === code) update[`inviteOf/${from}`] = null;
  await db.ref().update(update);
  const name = (await db.ref(`profiles/${from}/name`).get()).val() ?? null;
  return { name };
}

// End a friendship, both ways.
export async function removeFriend(db, uid, other) {
  if (!isUid(other)) throw new FriendError('invalid-argument', 'That isn\'t a player.');
  await db.ref().update({ [`friends/${uid}/${other}`]: null, [`friends/${other}/${uid}`]: null });
}
