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

// A nickname as stored: no control, bidi or zero-width characters, spaces
// collapsed, at most 40 characters (database.rules.json). '' if nothing is left.
export function cleanName(name) {
  return String(name ?? '')
    .replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁠-⁩﻿]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 40)
    .trim();
}
