// At each deploy: fill in and repair best/v{N}, each floor's best known score
// (docs/online.md, "Comparison on the floors list"), from stats/v{N}.
// Records missing or higher than the stats show are lowered to them; none is
// ever raised (removals recompute their own), so this is safe while
// solutions are being scored. It reads the two nodes as printed by `firebase
// database:get` and writes the update for `firebase database:update`, or
// `{}` if nothing needs repairing.
//   node tools/repair-best.js version                          print RULES_VERSION
//   node tools/repair-best.js <stats.json> <best.json> <update.json>
import { readFileSync, writeFileSync } from 'node:fs';
import { RULES_VERSION } from '../src/engine.js';
import { bestRepairs } from '../src/online.js';

const [statsFile, bestFile, outFile] = process.argv.slice(2);
if (statsFile === 'version') {
  console.log(RULES_VERSION);
} else {
  if (!outFile) throw new Error('usage: node tools/repair-best.js <stats.json> <best.json> <update.json>');
  const read = (f) => JSON.parse(readFileSync(f, 'utf8') || 'null');
  const update = bestRepairs(read(statsFile), read(bestFile));
  writeFileSync(outFile, JSON.stringify(update));
  const n = Object.keys(update).length;
  console.log(n ? `best/v${RULES_VERSION}: ${n} floor${n === 1 ? '' : 's'} to fill in or lower: ${Object.keys(update).join(', ')}` : `best/v${RULES_VERSION}: nothing to repair`);
}
