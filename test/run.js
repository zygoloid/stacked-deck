import { readdirSync } from 'node:fs';
import { runTest } from '../src/engine.js';
import { PUZZLES } from '../src/puzzles.js';
import { render } from '../src/render.js';
import { fmtHand } from '../src/cards.js';

const only = process.argv[2];
let failed = 0;
for (const f of readdirSync(new URL('../solutions/', import.meta.url)).sort()) {
  if (only && !f.includes(only)) continue;
  const sol = (await import(`../solutions/${f}`)).default;
  const pz = PUZZLES[sol.puzzle];
  const results = pz.tests.map((t) => runTest(sol, t, pz.pays));
  const ok = results.every((r) => r.ok);
  const avg = Math.round(results.reduce((a, r) => a + r.rounds, 0) / results.length);
  console.log(`\n== ${f}: ${pz.title} [${sol.rules}] ${ok ? 'PASS' : 'FAIL'}`);
  console.log(`   croupiers: ${results[0].croupiers}, rounds (avg over ${results.length} tests): ${avg}`);
  console.log(render(sol).replace(/^/gm, '   '));
  results.forEach((r, i) => {
    if (r.ok) return;
    failed++;
    console.log(`   test ${i} failed after ${r.rounds} rounds:`, r.timeout ? 'TIMEOUT' : '', 'wrong:', r.wrong.map(fmtHand).join(' '),
      'missing:', r.missing.join(' | '));
  });
}
process.exit(failed ? 1 : 0);
