// Turning a machine (the editor's group rotation, src/ui/croupiers.js) must
// not change what it does: every reference solution, turned with its whole
// floor to each of the six orientations, gives the same result on every test.
import assert from 'node:assert';
import { readdirSync } from 'node:fs';
import { runTest } from '../src/engine.js';
import { toSpec } from '../src/score.js';
import { rotateCell, rotateAt } from '../src/ui/croupiers.js';
import { ALL_LEVELS } from '../src/ui/catalog.js';

const turned = (spec, k) => ({
  cells: spec.cells.map((c0) => {
    const c = structuredClone(c0);
    c.at = rotateAt(c.at, [0, 0], k);
    if (c.kind === 'source') c.out = (c.out + k) % 6; // fixed cells only turn here, with the whole floor
    else rotateCell(c, k);
    return c;
  }),
});

let n = 0;
for (const file of readdirSync(new URL('../solutions/levels/', import.meta.url))) {
  const id = file.replace(/\.js$/, '');
  const level = ALL_LEVELS.find((l) => l.id === id);
  if (!level) continue;
  const { default: sol } = await import(`../solutions/levels/${file}`);
  const spec = toSpec(level, sol.cells);
  const want = level.tests.map((t) => runTest(spec, t, level));
  for (let k = 1; k < 6; k++) {
    const got = level.tests.map((t) => runTest(turned(spec, k), t, level));
    assert.deepStrictEqual(got, want, `${id} turned ${k * 60}° behaves differently`);
  }
  n++;
}
assert(n > 50, `only ${n} solutions found`);
console.log(`rotate ok (${n} reference solutions, 5 turns each)`);
