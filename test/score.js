// Checks for src/score.js: the strict validator, solution hashes, and the
// port table (which must match the editor's croupier table).
import assert from 'node:assert';
import { LEVELS, BONUS } from '../src/levels.js';
import { PORTS, validateCells, canonicalCells, solutionHash, scoreMachine, MAX_DECK } from '../src/score.js';
import { CROUPIERS } from '../src/ui/croupiers.js';

const ALL = [...LEVELS, ...BONUS];
const byId = new Map(ALL.map((l) => [l.id, l]));
const reference = async (level) => {
  const m = await import(`../solutions/levels/${level.id}.js`);
  const sol = m.default ?? Object.values(m)[0];
  return sol.cells ?? sol;
};

// PORTS matches the editor's table.
for (const [fn, info] of Object.entries(CROUPIERS)) {
  if (info.shoe) continue;
  assert.deepStrictEqual(PORTS[fn], info.deal ? ['to'] : info.ports, fn);
}
assert.deepStrictEqual(Object.keys(PORTS).sort(), Object.keys(CROUPIERS).filter((k) => k !== 'shoe').sort());
console.log('ports ok');

// Every reference solution is valid, unchanged by validation, and (via JSON,
// as a submitted solution would be) still clears its floor.
for (const level of ALL) {
  const cells = await reference(level);
  const res = validateCells(level, JSON.parse(JSON.stringify(cells)));
  assert(res.cells, `${level.id}: ${res.error}`);
  assert.strictEqual(canonicalCells(res.cells), canonicalCells(cells), level.id);
  assert(scoreMachine(level, res.cells).ok, level.id);
}
console.log(`reference solutions valid (${ALL.length})`);

// Rejections: anything the editor can't build.
{
  // A floor whose reference solution has a duplicate, and whose palette has
  // n of a kind and deal.
  let level, cells;
  for (const l of ALL) {
    if (!l.croupiers.includes('kind') || !l.croupiers.includes('deal')) continue;
    const c = await reference(l);
    if (c.some((x) => x.fn === 'duplicate')) { level = l; cells = c; break; }
  }
  const base = JSON.parse(JSON.stringify(cells));
  const free = level.floor.find((at) => ![...level.fixed, ...cells].some((c) => c.at[0] === at[0] && c.at[1] === at[1]));
  const reject = (why, change) => {
    const c = structuredClone(base);
    const out = change(c) ?? c;
    const res = validateCells(level, out);
    assert(res.error, `accepted: ${why}`);
  };
  const dup = base.findIndex((c) => c.fn === 'duplicate');
  const unused = Object.keys(PORTS).find((f) => !level.croupiers.includes(f));
  assert(free && unused);
  // The changes below are rejected for the reason given: the same cells
  // with an acceptable value pass.
  const accept = (why, change) => {
    const c = structuredClone(base);
    const res = validateCells(level, change(c) ?? c);
    assert(res.cells, `rejected: ${why}: ${res.error}`);
  };
  accept('kind n', (c) => { c[0] = { at: c[0].at, kind: 'croupier', fn: 'kind', n: 3, out: {} }; });
  accept('a pass', (c) => { c[0] = { at: c[0].at, kind: 'croupier', fn: 'pass', out: {} }; });
  accept('deal', (c) => { c.push({ at: free, kind: 'croupier', fn: 'deal', out: { to: [0, 0, 3] } }); });
  accept('facing', (c) => { c[0].facing = 5; });
  reject('not a list', () => ({}));
  reject('unknown field', (c) => { c[0].junk = 1; });
  reject('__proto__ field', () => JSON.parse(JSON.stringify(base).replace('"kind":', '"__proto__":{"x":1},"kind":')));
  reject('unknown kind', (c) => { c[0].kind = 'source'; });
  reject('fn not in palette', (c) => { c[0] = { at: c[0].at, kind: 'croupier', fn: unused, out: {} }; });
  reject('fn not a function', (c) => { c[0] = { at: c[0].at, kind: 'croupier', fn: 'constructor', out: {} }; });
  reject('kind n out of range', (c) => { c[0] = { at: c[0].at, kind: 'croupier', fn: 'kind', n: -5, out: {} }; });
  reject('n on a pass', (c) => { c[0] = { at: c[0].at, kind: 'croupier', fn: 'pass', n: 3, out: {} }; });
  reject('string position', (c) => { c[0].at = c[0].at.map(String); });
  reject('fractional position', (c) => { c[0].at = [c[0].at[0] + 0.5, c[0].at[1]]; });
  reject('off the floor', (c) => { c[0].at = [99, 99]; });
  reject('on a fixed cell', (c) => { c[0].at = [...level.fixed[0].at]; });
  reject('two cells on one hex', (c) => { c.push({ ...c[0] }); });
  reject('side out of range', (c) => { c[dup].out.a = 6; });
  reject('unknown port', (c) => { c[dup].out.yes = 1; });
  reject('out not an object', (c) => { c[dup].out = 'x'; });
  reject('deal out a string', (c) => { c.push({ at: free, kind: 'croupier', fn: 'deal', out: 'x' }); });
  reject('deal to a string', (c) => { c.push({ at: free, kind: 'croupier', fn: 'deal', out: { to: 'ab' } }); });
  reject('bad facing', (c) => { c[0].facing = 7; });
}
{
  // Shoes and War rules, on a floor that has both but not special cards.
  const level = ALL.find((l) => l.croupiers.includes('shoe') && l.croupiers.includes('war') && !l.specialCards?.length &&
    (l.warRules ?? ['high']).length === 1);
  const cells = await reference(level);
  const free = level.floor.find((at) => ![...level.fixed, ...cells].some((c) => c.at[0] === at[0] && c.at[1] === at[1]));
  const ok = (extra) => validateCells(level, [...cells, extra]);
  assert(ok({ at: free, kind: 'shoe', out: 0, deck: ['AS', 'KH'], once: true }).cells);
  assert(ok({ at: free, kind: 'shoe', deck: ['AS'] }).cells, 'a shoe without a side');
  assert(ok({ at: free, kind: 'shoe', out: 0, deck: ['AS', '?'] }).error, 'special card not allowed here');
  assert(ok({ at: free, kind: 'shoe', out: 0, deck: ['1S'] }).error, 'not a card');
  assert(ok({ at: free, kind: 'shoe', out: 0, deck: [] }).error, 'empty deck');
  assert(ok({ at: free, kind: 'shoe', out: 0, deck: Array(MAX_DECK + 1).fill('AS') }).error, 'deck too long');
  assert(ok({ at: free, kind: 'shoe', out: 0, deck: ['AS'], facing: 1 }).error, 'facing on a shoe');
  const rule = (level.warRules ?? ['high'])[0];
  const other = rule === 'high' ? 'top' : 'high';
  assert(ok({ at: free, kind: 'croupier', fn: 'war', rule, dealer: 4, out: { win: 0 } }).cells);
  assert(ok({ at: free, kind: 'croupier', fn: 'war', rule: other, out: {} }).error, 'War rule not allowed here');
  if (rule === 'top') assert(ok({ at: free, kind: 'croupier', fn: 'war', out: {} }).error, 'default rule not allowed here');
}
console.log('validation rejects ok');

// Hashes: 32 hex digits, the same for the same machine written differently,
// different for a different machine.
{
  const level = byId.get('upper-hand');
  const cells = await reference(level);
  const h = await solutionHash(cells);
  assert.match(h, /^[0-9a-f]{32}$/);
  const shuffled = [...cells].reverse().map((c) => Object.fromEntries(Object.entries(c).reverse()));
  assert.strictEqual(await solutionHash(shuffled), h, 'cell and field order');
  assert.strictEqual(await solutionHash(cells.map((c) => ({ ...c, facing: 0 }))), h, 'default fields');
  const moved = structuredClone(cells);
  moved[0].out = { ...moved[0].out, [Object.keys(moved[0].out)[0]]: (Object.values(moved[0].out)[0] + 1) % 6 };
  assert.notStrictEqual(await solutionHash(moved), h, 'a different machine');
}
console.log('solution hashes ok');
