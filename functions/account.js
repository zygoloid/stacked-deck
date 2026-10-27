// Deleting a player's data (the deleteMyData callable; docs/online.md).
import { RULES_VERSION } from './game/engine.js';
import { removeFrontier } from './solutions.js';

// Everything stored for `uid` in this game's database: their solutions,
// their points in every floor's stats (for every rules version), their
// frontiers, cloud save, profile, limits, friendships (both directions) and
// invite. Safe to repeat. Returns how many floors' stats changed.
export async function deleteUserData(db, uid) {
  // Solutions first, so nothing new is scored for them; a scoring run
  // already under way takes its point back out (processSolution).
  await db.ref(`solutions/${uid}`).remove();
  let floors = 0;
  // Scores are kept per rules version; versions run from 1, and the server
  // may be one ahead of this code during a deploy.
  for (let v = 1; v <= RULES_VERSION + 1; v++) {
    const levels = (await db.ref(`scores/v${v}/${uid}`).get()).val();
    for (const level of Object.keys(levels ?? {})) {
      if ((await removeFrontier(db, v, uid, level)).length) floors++;
    }
    await db.ref(`scores/v${v}/${uid}`).remove();
  }
  const friends = Object.keys((await db.ref(`friends/${uid}`).get()).val() ?? {});
  const invite = (await db.ref(`inviteOf/${uid}`).get()).val();
  const gone = {
    [`saves/${uid}`]: null, [`profiles/${uid}`]: null, [`limits/${uid}`]: null,
    [`friends/${uid}`]: null, [`inviteOf/${uid}`]: null,
  };
  for (const f of friends) gone[`friends/${f}/${uid}`] = null;
  if (typeof invite === 'string' && /^[A-Za-z0-9]{12}$/.test(invite)) gone[`invites/${invite}`] = null;
  await db.ref().update(gone);
  return floors;
}
