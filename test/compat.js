// Saved solutions must keep working: once a floor ships, its fixed cells
// (players and chip desks) must not move and its buildable area may only
// grow. test/compat.json records every shipped floor; new floors are added
// automatically with --update.
//
//   node test/compat.js            check
//   node test/compat.js --update   record new floors (and, deliberately,
//                                  accept changes to existing ones)
import { readFileSync, writeFileSync } from 'node:fs';
import { LEVELS, BONUS } from '../src/levels.js';

const file = new URL('./compat.json', import.meta.url);
const update = process.argv.includes('--update');
const snap = JSON.parse(readFileSync(file, 'utf8'));
const key = (h) => h.join(',');
const fixedOf = (l) => l.fixed.map((c) => ({ at: c.at, kind: c.kind, ...(c.out !== undefined ? { out: c.out } : {}), ...(c.seat !== undefined ? { seat: c.seat } : {}), ...(c.desk !== undefined ? { desk: c.desk } : {}) }));
const levels = [...LEVELS, ...(BONUS ?? [])];
const ids = new Set(levels.map((l) => l.id));

const problems = [];
let added = 0;
for (const l of levels) {
  const s = snap[l.id];
  const now = { fixed: fixedOf(l), floor: l.floor.map(key).sort() };
  if (!s) { snap[l.id] = now; added++; continue; }
  if (JSON.stringify(s.fixed) !== JSON.stringify(now.fixed)) {
    problems.push(`${l.id}: players/desks moved ${JSON.stringify(s.fixed)} -> ${JSON.stringify(now.fixed)}`);
  }
  const floor = new Set(now.floor);
  const lost = s.floor.filter((h) => !floor.has(h));
  if (lost.length) problems.push(`${l.id}: floor lost hexes ${lost.join(' ')}`);
  if (update) snap[l.id] = { fixed: now.fixed, floor: [...new Set([...s.floor, ...now.floor])].sort() };
}
for (const id of Object.keys(snap)) if (!ids.has(id)) problems.push(`${id}: floor removed (saves for it are orphaned)`);

if (update) {
  writeFileSync(file, JSON.stringify(snap, null, 1) + '\n');
  console.log(`compat: recorded ${added} new floor(s)${problems.length ? `, accepted ${problems.length} change(s)` : ''}`);
} else if (problems.length || added) {
  for (const p of problems) console.log('FAIL', p);
  if (added) console.log(`FAIL ${added} floor(s) not recorded yet: run node test/compat.js --update`);
  process.exit(1);
} else {
  console.log(`compat ok (${levels.length} floors keep their players, desks and floor)`);
}
