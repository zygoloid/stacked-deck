// Turning, mirroring and flipping machines (the editor's group tools,
// src/ui/croupiers.js): every port still points at the same neighbour, moved
// with it; six turns, two mirrors or two flips give the machine back, and a
// mirror and a flip make a half turn; no facing is set (it isn't something the
// player sets, so a turned or mirrored machine can behave differently).
import assert from 'node:assert';
import { readdirSync } from 'node:fs';
import { DIRS } from '../src/engine.js';
import { rotateCell, rotateAt, mirrorCell, mirrorAt, flipCell, flipAt } from '../src/ui/croupiers.js';

const key = ([q, r]) => `${q},${r}`;
const step = ([q, r], d) => [q + DIRS[d][0], r + DIRS[d][1]];
// [port, side] for every side a cell points at or takes input from.
const sides = (c) => [
  ...(c.kind === 'shoe' ? [['out', c.out]] : Object.entries(c.out ?? {}).flatMap(([p, v]) => (p === 'to' ? v.map((s, i) => [`to${i}`, s]) : [[p, v]]))),
  ...['dealer', 'under'].filter((p) => c[p] !== undefined).map((p) => [p, c[p]]),
];
// Each [port, the hex it faces], by cell position.
const links = (cells) => new Map(cells.map((c) => [key(c.at), sides(c).map(([p, s]) => [p, key(step(c.at, s))])]));

const pivot = [1, -2];
const transforms = [
  ...[1, 2, 3, 4, 5].map((k) => [`turned ${k * 60}°`, (at) => rotateAt(at, pivot, k), (c) => rotateCell(c, k)]),
  ['mirrored', (at) => mirrorAt(at, pivot), (c) => mirrorCell(c)],
  ['flipped', (at) => flipAt(at, pivot), (c) => flipCell(c)],
];

let n = 0;
for (const file of readdirSync(new URL('../solutions/levels/', import.meta.url))) {
  const { default: sol } = await import(`../solutions/levels/${file}`);
  const cells = structuredClone(sol.cells);
  const before = links(cells);
  for (const [name, moveAt, turn] of transforms) {
    const after = cells.map((c0) => { const c = structuredClone(c0); c.at = moveAt(c.at); turn(c); return c; });
    const got = links(after);
    for (const c of cells) {
      const want = before.get(key(c.at)).map(([p, k]) => [p, key(moveAt(k.split(',').map(Number)))]);
      assert.deepStrictEqual(got.get(key(moveAt(c.at))), want, `${file} ${name}: ${c.fn ?? c.kind} at ${key(c.at)} points elsewhere`);
    }
    assert(after.every((c) => !('facing' in c)), `${file} ${name}: facing set`);
  }
  // Six turns, or two mirrors, give it back.
  const six = structuredClone(cells), two = structuredClone(cells), flips = structuredClone(cells), both = structuredClone(cells);
  for (const c of six) for (let i = 0; i < 6; i++) { c.at = rotateAt(c.at, pivot, 1); rotateCell(c, 1); }
  for (const c of two) for (let i = 0; i < 2; i++) { c.at = mirrorAt(c.at, pivot); mirrorCell(c); }
  assert.deepStrictEqual(six, cells, `${file}: six turns`);
  for (const c of flips) for (let i = 0; i < 2; i++) { c.at = flipAt(c.at, pivot); flipCell(c); }
  // A mirror and a flip make a half turn.
  for (const c of both) { c.at = flipAt(mirrorAt(c.at, pivot), pivot); mirrorCell(c); flipCell(c); }
  const half = structuredClone(cells);
  for (const c of half) { c.at = rotateAt(c.at, pivot, 3); rotateCell(c, 3); }
  assert.deepStrictEqual(two, cells, `${file}: two mirrors`);
  assert.deepStrictEqual(flips, cells, `${file}: two flips`);
  assert.deepStrictEqual(both, half, `${file}: a mirror and a flip`);
  n++;
}
assert(n > 50, `only ${n} solutions found`);
console.log(`transform ok (${n} reference solutions turned, mirrored and flipped)`);
