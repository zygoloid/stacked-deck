// The online features' logic that needs no Firebase SDK and no DOM (so it is
// tested in Node): what to upload, what a submission writes, how stats read.
// The SDK side is src/ui/cloud.js; the design is docs/online.md.
import { RULES_VERSION } from './engine.js';
import { validateCells, solutionHash } from './score.js';

// The longest machine (as JSON) the database accepts (database.rules.json).
export const MAX_MACHINE_CHARS = 10000;

// Saved solutions not yet uploaded for account `uid`: working under the
// current rules and not skipped this session. [{ level, sol }]
export function uploadCandidates(save, levels, uid, skip = new Set()) {
  const out = [];
  for (const level of levels) {
    for (const sol of save.levels?.[level.id]?.solutions ?? []) {
      if (sol.broken || sol.rules !== RULES_VERSION || sol.uploaded === uid || skip.has(sol)) continue;
      out.push({ level, sol });
    }
  }
  return out;
}

// A saved machine as uploaded: { json, hash } of the validated cells, or null
// if it can't be uploaded (the editor allows a few things the server
// doesn't, such as very long shoe decks).
export async function prepareUpload(level, cells) {
  const v = validateCells(level, cells);
  if (v.error) return null;
  const json = JSON.stringify(v.cells);
  if (json.length > MAX_MACHINE_CHARS) return null;
  return { json, hash: await solutionHash(v.cells) };
}

// The multi-path update that submits one solution: the per-account limit
// (one solution per write, at most one a second) and the solution itself,
// tagged with the server's rules version. `now` is the server timestamp
// sentinel.
export function submission({ uid, levelId, hash, json, at, rules, now }) {
  return {
    [`limits/${uid}/submit`]: { level: levelId, hash, at: now },
    [`solutions/${uid}/${levelId}/${hash}`]: { cells: json, at: typeof at === 'number' ? at : Date.now(), rules },
  };
}

// A floor's stats node ({ points: { "<croupiers>_<rounds>": count }, players })
// as plot points [{ croupiers, rounds, count }] (counts above zero only) and
// the number of players.
export function readStats(node) {
  const points = [];
  for (const [k, n] of Object.entries(node?.points ?? {})) {
    const m = /^(\d+)_(\d+)$/.exec(k);
    if (!m || !Number.isInteger(n) || n <= 0) continue;
    points.push({ croupiers: Number(m[1]), rounds: Number(m[2]), count: n });
  }
  const players = Number.isInteger(node?.players) && node.players > 0 ? node.players : 0;
  return { points, players };
}

// A player's frontier on a floor as stored in scores ({ "<croupiers>_<rounds>":
// true }) as points [{ croupiers, rounds }].
export const readFrontier = (node) => readStats({ points: Object.fromEntries(Object.keys(node ?? {}).map((k) => [k, 1])) }).points
  .map(({ croupiers, rounds }) => ({ croupiers, rounds }));

const AXES = ['croupiers', 'rounds'];
const minOf = (points, k) => {
  const vs = points.map((p) => p?.[k]).filter(Number.isFinite);
  return vs.length ? Math.min(...vs) : null;
};

// How the player's best on a floor (`best`: the fewest croupiers and the
// fewest rounds, each on its own; null if unsolved) compares, axis by axis:
//   record:   the best known score on each axis (everyone's, friends', par and
//             the player's own), or null when everyone's scores aren't known
//             (`stats` null: signed out, or not read yet)
//   top:      the player's best equals the record
//   beatenBy: [{ name, croupiers, rounds }]: friends who beat the player's
//             best on some axis, with their best on each axis they beat it on
//             (else null); for an unsolved floor, every friend who solved it
export function standing({ best = null, par = null, stats = null, friends = [] }) {
  const out = { record: null, top: {}, beatenBy: [] };
  const friendPoints = (friends ?? []).flatMap((f) => f.points ?? []);
  if (stats) {
    out.record = Object.fromEntries(AXES.map((k) => [k, minOf([...stats.points, ...friendPoints, par, best], k)]));
  }
  for (const k of AXES) out.top[k] = !!out.record && Number.isFinite(best?.[k]) && best[k] === out.record[k];
  for (const f of friends ?? []) {
    const theirs = Object.fromEntries(AXES.map((k) => [k, minOf(f.points ?? [], k)]));
    if (theirs.croupiers === null) continue;
    const beats = Object.fromEntries(AXES.map((k) => [k, !best || theirs[k] < best[k] ? theirs[k] : null]));
    if (beats.croupiers !== null || beats.rounds !== null) out.beatenBy.push({ name: f.name ?? null, ...beats });
  }
  return out;
}

// `promise`, or a rejection with code 'timeout' if it hasn't settled within
// `ms` (the database SDK waits for a connection indefinitely, so a read it
// can't connect for never finishes otherwise).
export function withTimeout(promise, ms, message) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(Object.assign(new Error(message), { code: 'timeout' })), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

// A nickname as stored: no control, bidi or zero-width characters, spaces
// collapsed, at most 40 characters (database.rules.json). '' if nothing is left.
export function cleanName(name) {
  return String(name ?? '')
    .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060-\u2069\ufeff]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 40)
    .trim();
}

// ---------- cloud save ----------
// A floor's local save holds, besides the editor's fields: `workAt` (when the
// working machine last changed: the server's time once synced, this
// browser's clock for edits since), `workSynced` (the server time of the
// working machine last pulled or pushed) and `deleted` (hashes of solutions
// the player deleted). Its remote copy is saves/$uid/$level
// ({ work: { cells, at }, solved, deleted: { $hash: true } }) plus the
// account's solutions/$uid/$level.

// What merging one floor needs to do, given its local save `ls` (or
// undefined), its remote save and solutions (or null), and the hashes of its
// local solutions (`localHashes`: hash per solution, null if unknown).
//   work:      'take' (use remote.work), 'push' (send the local one) or null
//   markSolved / pushSolved
//   add:       remote solutions to add locally [{ hash, cells, at }]
//   remove:    local solutions to drop (deleted elsewhere)
//   deleted:   the merged deleted hashes; pushDeleted: those to send (only
//              of solutions the account has, as the rules require)
export function planMerge({ ls, remote, remoteSolutions, localHashes = new Map() }) {
  const rw = remote?.work && typeof remote.work.cells === 'string' && Number.isFinite(remote.work.at) ? remote.work : null;
  const synced = ls?.workSynced ?? 0;
  // Local edits not yet pushed (including emptying the floor), or an old save
  // that never synced and has a machine.
  const unsyncedLocal = Array.isArray(ls?.cells) &&
    (ls.workSynced === undefined ? ls.cells.length > 0 : ls.workAt !== ls.workSynced);
  let work = null;
  if (rw && rw.at > synced) work = unsyncedLocal && (ls.workAt ?? 0) > rw.at ? 'push' : 'take';
  else if (unsyncedLocal) work = 'push';

  const remoteDeleted = Object.keys(remote?.deleted ?? {}).filter((h) => remote.deleted[h] === true);
  const deleted = new Set([...(ls?.deleted ?? []), ...remoteDeleted]);
  const remoteSols = Object.entries(remoteSolutions ?? {})
    .filter(([, s]) => s && typeof s.cells === 'string' && !s.invalid);
  const have = new Set([...localHashes.values()].filter(Boolean));
  const add = remoteSols.filter(([h]) => !have.has(h) && !deleted.has(h)).map(([hash, s]) => ({ hash, cells: s.cells, at: s.at }));
  const remove = (ls?.solutions ?? []).filter((s) => deleted.has(localHashes.get(s)));
  const pushDeleted = [...deleted].filter((h) => !remoteDeleted.includes(h) && remoteSolutions?.[h]);
  return {
    work,
    markSolved: !!remote?.solved && !ls?.solved,
    pushSolved: !!ls?.solved && !remote?.solved,
    add, remove,
    deleted: [...deleted].sort(),
    pushDeleted,
  };
}
