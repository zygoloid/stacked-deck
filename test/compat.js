// Saved solutions must keep working: once a floor ships, its fixed cells
// (players and chip desks, and any shoes and croupiers bolted to the floor)
// must not move or change and its buildable area may only
// grow. Where the player may move the players and desks (`moves`: src/score.js,
// desksMove), they must stay movable: saved machines may have moved them.
// test/compat.json records every shipped floor; new floors are added
// automatically with --update.
//
//   node test/compat.js            check
//   node test/compat.js --update   record new floors (and, deliberately,
//                                  accept changes to existing ones)
import { readFileSync, writeFileSync } from 'node:fs';
import { ALL_LEVELS } from '../src/levels.js';
import { desksMove } from '../src/score.js';

const file = new URL('./compat.json', import.meta.url);
const update = process.argv.includes('--update');
const snap = JSON.parse(readFileSync(file, 'utf8'));
const key = (h) => h.join(',');
// Players and desks are recorded by position, direction and label; shoes and
// croupiers bolted to the floor in full (a saved machine relies on all of it).
const fixedOf = (l) => l.fixed.map((c) => (c.kind === 'source' || c.kind === 'payout'
  ? { at: c.at, kind: c.kind, ...(c.out !== undefined ? { out: c.out } : {}), ...(c.seat !== undefined ? { seat: c.seat } : {}), ...(c.desk !== undefined ? { desk: c.desk } : {}) }
  : c));
const levels = ALL_LEVELS;
const ids = new Set(levels.map((l) => l.id));

const problems = [];
let added = 0, newlyMoving = 0;
const moveKind = (l) => (!desksMove(l) ? false : l.stayInRoom ? 'room' : true);
for (const l of levels) {
  const s = snap[l.id];
  const m = moveKind(l);
  const now = { fixed: fixedOf(l), floor: l.floor.map(key).sort(), ...(m ? { moves: m } : {}) };
  if (!s) { snap[l.id] = now; added++; continue; }
  if (s.moves && !m) problems.push(`${l.id}: players and desks bolted down (saved machines may have moved them)`);
  if (s.moves === true && m === 'room') problems.push(`${l.id}: players and desks confined to their rooms (saved machines may have moved them across rooms)`);
  if ((!s.moves && m) || (s.moves === 'room' && m === true)) newlyMoving++;
  if (JSON.stringify(s.fixed) !== JSON.stringify(now.fixed)) {
    problems.push(`${l.id}: players/desks moved ${JSON.stringify(s.fixed)} -> ${JSON.stringify(now.fixed)}`);
  }
  const floor = new Set(now.floor);
  const lost = s.floor.filter((h) => !floor.has(h));
  if (lost.length) problems.push(`${l.id}: floor lost hexes ${lost.join(' ')}`);
  if (update) {
    const keptMoves = s.moves === true || m === true ? true : (s.moves || m);
    snap[l.id] = { fixed: now.fixed, floor: [...new Set([...s.floor, ...now.floor])].sort(), ...(keptMoves ? { moves: keptMoves } : {}) };
  }
}
for (const id of Object.keys(snap)) if (!ids.has(id)) problems.push(`${id}: floor removed (saves for it are orphaned)`);

if (update) {
  writeFileSync(file, JSON.stringify(snap, null, 1) + '\n');
  console.log(`compat: recorded ${added} new floor(s)${problems.length ? `, accepted ${problems.length} change(s)` : ''}`);
} else if (problems.length || added || newlyMoving) {
  for (const p of problems) console.log('FAIL', p);
  if (added) console.log(`FAIL ${added} floor(s) not recorded yet: run node test/compat.js --update`);
  if (newlyMoving) console.log(`FAIL ${newlyMoving} floor(s) whose players and desks now move not recorded yet: run node test/compat.js --update`);
  process.exit(1);
} else {
  console.log(`compat ok (${levels.length} floors keep their players, desks and floor)`);
}
