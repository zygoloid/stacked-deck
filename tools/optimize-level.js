// Hill-climb the hand-placed tables of a level recipe (tools/level-specs.js)
// to reduce the croupier count, keeping the level's floor as walls.
//   node tools/optimize-level.js <id> [iterations] [seed] [--nowalls]
// Prints the best node positions found; paste them back into the recipe.
import { rng } from '../src/cards.js';
import { LEVELS } from '../src/levels.js';
import { runTest } from '../src/engine.js';
import { SPECS } from './level-specs.js';
import { buildLevel } from './level-build.js';

const args = process.argv.slice(2);
const walls = !args.includes('--nowalls');
const [id, iters = '5000', seed = '1'] = args.filter((a) => !a.startsWith('--'));
const level = LEVELS.find((l) => l.id === id);
const spec = SPECS[id];
const rand = rng(Number(seed));
const names = Object.keys(spec.nodes);
const floor = new Set(level.floor.map((h) => h.join(',')));

const score = (nodes, check = false) => {
  try {
    const { cells } = buildLevel(id, structuredClone(nodes), spec.links, { walls });
    if (walls && cells.some((c) => !floor.has(c.at.join(',')))) return Infinity;
    if (check) {
      const all = [...level.fixed, ...cells];
      if (!level.tests.every((t) => runTest({ cells: all }, t, level.pays).ok)) return Infinity;
    }
    return cells.length;
  } catch { return Infinity; }
};

let best = structuredClone(spec.nodes), bestScore = score(best, true);
let cur = best, curScore = bestScore;
console.error('start', bestScore);
const fixedAt = new Set(level.fixed.map((c) => c.at.join(',')));
for (let i = 0; i < Number(iters); i++) {
  const next = structuredClone(cur);
  const name = names[Math.floor(rand() * names.length)];
  const [q, r] = next[name].at;
  const at = [q + Math.floor(rand() * 5) - 2, r + Math.floor(rand() * 5) - 2];
  if (fixedAt.has(at.join(',')) || (walls && !floor.has(at.join(',')))) continue;
  const other = Object.entries(next).find(([, n]) => n.at.join(',') === at.join(','));
  if (other) other[1].at = [q, r];
  next[name].at = at;
  let s = score(next);
  if (s < Infinity && s <= curScore) s = score(next, true);
  const temp = 2 * (1 - i / Number(iters));
  if (s <= curScore || (s < Infinity && rand() < Math.exp((curScore - s) / Math.max(temp, 0.01)))) {
    cur = next; curScore = s;
    if (s < bestScore) { best = next; bestScore = s; console.error(i, s); }
  }
}
console.log(bestScore);
for (const [n, v] of Object.entries(best)) console.log(`${n}: [${v.at.join(', ')}]`);
