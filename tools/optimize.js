// Hill-climb the hand-placed tables of a solution to reduce the number of
// croupiers once the router has laid its pass chains.
//   node tools/optimize.js solutions/record-set.js [iterations] [seed]
// Prints the best node positions found; paste them back into the solution.
import { build } from '../src/layout.js';
import { rng } from '../src/cards.js';

const [file, iters = '20000', seed = '1'] = process.argv.slice(2);
const { spec } = await import(`../${file}`);
const rand = rng(Number(seed));
const names = Object.keys(spec.nodes);
const fixed = new Set(['src']);

const score = (nodes) => {
  try {
    return build({ ...spec, nodes: structuredClone(nodes) }).cells.filter((c) => c.kind !== 'payout' && c.kind !== 'source').length;
  } catch { return Infinity; }
};

let best = structuredClone(spec.nodes), bestScore = score(best);
let cur = best, curScore = bestScore;
console.error('start', bestScore);
for (let i = 0; i < Number(iters); i++) {
  const next = structuredClone(cur);
  const name = names[Math.floor(rand() * names.length)];
  if (fixed.has(name)) continue;
  const taken = new Set(Object.values(next).map((n) => n.at.join(',')));
  const [q, r] = next[name].at;
  const at = [q + Math.floor(rand() * 5) - 2, r + Math.floor(rand() * 5) - 2];
  if (taken.has(at.join(','))) {
    // swap with whoever is there
    const other = Object.entries(next).find(([, n]) => n.at.join(',') === at.join(','));
    if (fixed.has(other[0])) continue;
    other[1].at = [q, r];
  }
  next[name].at = at;
  const s = score(next);
  const temp = 2 * (1 - i / Number(iters));
  if (s <= curScore || rand() < Math.exp((curScore - s) / Math.max(temp, 0.01))) {
    cur = next; curScore = s;
    if (s < bestScore) { best = next; bestScore = s; console.error(i, s); }
  }
}
console.log(bestScore);
for (const [n, v] of Object.entries(best)) console.log(`${n}: [${v.at.join(', ')}]`);
