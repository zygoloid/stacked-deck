// Checks for keeping progress (src/ui/model.js, src/ui/savefile.js): merging
// another tab's save into this tab's, catching up with another tab when
// writing, reporting a save that can't be written, and save files.
import assert from 'node:assert';
import { LEVELS } from '../src/levels.js';
import { mergeSave, loadSave, writeSave, watchSave, saveProblem } from '../src/ui/model.js';
import { saveFileText, readSaveFile, loadSaveFile, saveFileName, FILE_FORMAT } from '../src/ui/savefile.js';
import { RULES_VERSION } from '../src/engine.js';
import { countCroupiers } from '../src/score.js';

const clone = structuredClone;
const sol = (n, extra = {}) => ({ cells: [{ at: [n, 0], kind: 'croupier', fn: 'pass', out: { out: 0 } }], croupiers: 1, rounds: 10 + n, at: n, rules: 1, ...extra });

// ---------- mergeSave ----------
{
  // Each tab cleared a different floor: both are kept (the bug: the second
  // tab's write lost the first one's floor).
  const base = { levels: { a: { cells: [] } } };
  const theirs = { levels: { a: { cells: [] }, x: { solved: true, solutions: [sol(1)], best: { croupiers: 1, rounds: 11 } } } };
  const mine = { levels: { a: { cells: [] }, y: { solved: true, solutions: [sol(2)], best: { croupiers: 1, rounds: 12 } } } };
  const a = mine.levels.a;
  const changed = mergeSave(base, theirs, mine);
  assert.deepStrictEqual(changed, ['x']);
  assert.ok(mine.levels.x.solved && mine.levels.y.solved);
  assert.strictEqual(mine.levels.a, a, 'unchanged floors keep their objects');
}
{
  // Within one floor: solutions found in both tabs are all kept, one
  // deleted there goes, and best is recomputed.
  const s1 = sol(1), s2 = sol(2), s3 = sol(3), s4 = sol(4);
  const base = { levels: { x: { solved: true, solutions: [clone(s1), clone(s2)], best: { croupiers: 1, rounds: 11 } } } };
  const theirs = { levels: { x: { solved: true, solutions: [clone(s2), clone(s3)], best: { croupiers: 1, rounds: 12 } } } };
  const mine = { levels: { x: { solved: true, solutions: [clone(s1), clone(s2), clone(s4)], best: { croupiers: 1, rounds: 11 } } } };
  const ls = mine.levels.x, kept = ls.solutions[1], list = ls.solutions;
  assert.deepStrictEqual(mergeSave(base, theirs, mine), ['x']);
  assert.strictEqual(mine.levels.x, ls, 'the floor keeps its object');
  assert.strictEqual(ls.solutions, list, 'and its list');
  assert.strictEqual(ls.solutions[0], kept, 'and its solutions');
  assert.deepStrictEqual(ls.solutions.map((s) => s.at), [2, 4, 3]);
  assert.deepStrictEqual(ls.best, { croupiers: 1, rounds: 12 });
}
{
  // A solution rescored or uploaded there is updated here, unless it
  // changed here too.
  const base = { levels: { x: { solutions: [sol(1), sol(2)] } } };
  const theirs = { levels: { x: { solutions: [sol(1, { rounds: 99, rules: 2, uploaded: 'u', hash: 'h' }), sol(2, { rounds: 50 })] } } };
  const mine = { levels: { x: { solutions: [sol(1), sol(2, { rounds: 40 })] } } };
  mergeSave(base, theirs, mine);
  assert.deepStrictEqual(mine.levels.x.solutions[0], sol(1, { rounds: 99, rules: 2, uploaded: 'u', hash: 'h' }));
  assert.strictEqual(mine.levels.x.solutions[1].rounds, 40);
  assert.deepStrictEqual(mine.levels.x.best, { croupiers: 1, rounds: 40 });
}
{
  // The working machine: theirs if only it changed; this tab's if both did.
  const w = (n) => [{ at: [n, n], kind: 'croupier', fn: 'pass', out: {} }];
  const base = { levels: { x: { cells: w(0), workAt: 1 }, y: { cells: w(0), workAt: 1 } } };
  const theirs = { levels: { x: { cells: w(1), workAt: 5 }, y: { cells: w(1), workAt: 5 } } };
  const mine = { levels: { x: { cells: w(0), workAt: 1 }, y: { cells: w(2), workAt: 3 } } };
  assert.deepStrictEqual(mergeSave(base, theirs, mine), ['x']);
  assert.deepStrictEqual(mine.levels.x, { cells: w(1), workAt: 5 });
  assert.deepStrictEqual(mine.levels.y, { cells: w(2), workAt: 3 });
}
{
  // Key order doesn't count as a change.
  const base = { levels: { x: { solved: true, cells: [{ at: [0, 0], kind: 'croupier', fn: 'pass', out: {} }] } } };
  const theirs = { levels: { x: { cells: [{ out: {}, fn: 'pass', kind: 'croupier', at: [0, 0] }], solved: true } } };
  assert.deepStrictEqual(mergeSave(base, theirs, clone(base)), []);
}
{
  // solved is never lost; cleared progress goes here too, unless it changed
  // here since.
  const base = { levels: { x: { solved: true }, y: { cells: [] }, z: { cells: [] } } };
  const theirs = { levels: { x: { solved: false } } };
  const mine = { levels: { x: { solved: true }, y: { cells: [] }, z: { cells: [], workAt: 9 } } };
  assert.deepStrictEqual(mergeSave(base, theirs, mine).sort(), ['y']);
  assert.deepStrictEqual(mine.levels, { x: { solved: true }, z: { cells: [], workAt: 9 } });
}
{
  // Deleted machines (cloud save): deletions on both sides are kept, and one
  // restored there is restored here.
  const base = { levels: { x: { deleted: ['a', 'b'] } } };
  const theirs = { levels: { x: { deleted: ['b', 'c'] } } };
  const mine = { levels: { x: { deleted: ['a', 'b', 'd'] } } };
  mergeSave(base, theirs, mine);
  assert.deepStrictEqual(mine.levels.x.deleted, ['b', 'c', 'd']);
}
{
  // Other fields: the account, a floor's last score.
  const base = { levels: { x: { last: { croupiers: 1, rounds: 1 } } }, account: { uid: 'u', signedIn: true } };
  const theirs = { levels: { x: { last: { croupiers: 2, rounds: 2 } } }, account: { uid: 'u', signedIn: false } };
  const mine = clone(base);
  mergeSave(base, theirs, mine);
  assert.deepStrictEqual(mine, theirs);
}
console.log('merge ok');

// ---------- storage, with another tab ----------
{
  const store = new Map();
  let failWith = null, onStorage = null;
  globalThis.localStorage = {
    getItem: (k) => { if (failWith === 'blocked') throw Object.assign(new Error('no'), { name: 'SecurityError' }); return store.get(k) ?? null; },
    setItem: (k, v) => {
      if (failWith) throw Object.assign(new Error('no'), { name: failWith === 'full' ? 'QuotaExceededError' : 'SecurityError' });
      store.set(k, String(v));
    },
  };
  globalThis.window = { addEventListener: (type, fn) => { if (type === 'storage') onStorage = fn; } };
  const KEY = 'stacked-deck-v1';
  const other = (fn) => { const s = JSON.parse(store.get(KEY)); fn(s); store.set(KEY, JSON.stringify(s)); };

  store.set(KEY, JSON.stringify({ levels: { a: { solved: true } } }));
  const save = loadSave();
  assert.strictEqual(saveProblem(), null);
  // Another tab clears x; this tab, not having heard, clears y and writes.
  other((s) => { s.levels.x = { solved: true }; });
  save.levels.y = { solved: true };
  assert.strictEqual(writeSave(save), null);
  assert.deepStrictEqual(Object.keys(JSON.parse(store.get(KEY)).levels).sort(), ['a', 'x', 'y']);
  assert.ok(save.levels.x.solved, 'this tab has the other\'s floor');

  // Told about another tab's write, this tab merges it (without writing).
  const seen = [];
  watchSave(save, (ids) => seen.push(...ids));
  other((s) => { s.levels.z = { solved: true }; });
  const written = store.get(KEY);
  onStorage({ key: KEY });
  assert.deepStrictEqual(seen, ['z']);
  assert.ok(save.levels.z.solved);
  assert.strictEqual(store.get(KEY), written, 'nothing written back');
  onStorage({ key: KEY });
  onStorage({ key: 'stacked-deck-ui' });
  assert.deepStrictEqual(seen, ['z'], 'nothing new');

  // Writes that fail say why, and the next one that works says so too.
  failWith = 'full';
  assert.strictEqual(writeSave(save), 'full');
  failWith = 'blocked';
  assert.strictEqual(writeSave(save), 'blocked');
  failWith = null;
  assert.strictEqual(writeSave(save), null);
  assert.strictEqual(saveProblem(), null);
  failWith = 'blocked';
  assert.deepStrictEqual(loadSave(), { levels: {} });
  assert.strictEqual(saveProblem(), 'blocked');
  failWith = null;

  // An unreadable save is kept aside before it is overwritten.
  store.set(KEY, '{"levels":');
  assert.deepStrictEqual(loadSave(), { levels: {} });
  assert.strictEqual(store.get(`${KEY}-unreadable`), '{"levels":');
  delete globalThis.localStorage;
  delete globalThis.window;
}
console.log('storage ok');

// ---------- save files ----------
{
  const reference = async (level) => (await import(`../solutions/levels/${level.id}.js`)).default.cells;
  const [l1, l2, l3] = LEVELS;
  const c1 = await reference(l1), c2 = await reference(l2);
  const now = new Date(2026, 10, 7, 12);
  assert.strictEqual(saveFileName(now), 'stacked-deck-save-2026-11-07.json');

  // Written without the account or the cloud save's bookkeeping.
  const save = {
    account: { uid: 'secret', signedIn: true },
    levels: {
      [l1.id]: {
        solved: true, cells: c1, workAt: 5, workSynced: 5, deleted: ['h'],
        solutions: [{ cells: c1, croupiers: 1, rounds: 1, at: 7, rules: RULES_VERSION, uploaded: 'secret', hash: 'h2' }],
      },
    },
  };
  const text = saveFileText(save, now);
  assert.ok(!text.includes('secret') && !text.includes('h2') && !text.includes('workSynced') && !text.includes('deleted'));
  const file = JSON.parse(text);
  assert.strictEqual(file.format, FILE_FORMAT);
  assert.strictEqual(file.version, 1);

  // Read back: scores are worked out again, not taken from the file.
  const read = await readSaveFile(text, LEVELS);
  const ls = read.save.levels[l1.id];
  assert.ok(ls.solved);
  assert.strictEqual(ls.solutions.length, 1);
  assert.strictEqual(ls.solutions[0].croupiers, countCroupiers(c1));
  assert.strictEqual(ls.solutions[0].rounds, l1.par.rounds);
  assert.deepStrictEqual(ls.best, { croupiers: l1.par.croupiers, rounds: l1.par.rounds });
  assert.strictEqual(ls.solutions[0].at, 7);

  // Unknown floors, machines the editor couldn't build, and anything else
  // are left out; a raw save (no format) is read too.
  const odd = await readSaveFile(JSON.stringify({
    account: { uid: 'x' },
    levels: {
      nope: { solved: true },
      [l2.id]: { solved: 'yes', cells: [{ at: [99, 99], kind: 'croupier', fn: 'pass', out: {} }], solutions: [{ cells: 'bad' }, null], best: { croupiers: 0, rounds: 0 } },
      [l3.id]: { solutions: [{ cells: c1 }] },
    },
  }), LEVELS);
  assert.deepStrictEqual(Object.keys(odd.save), ['levels']);
  assert.deepStrictEqual(Object.keys(odd.save.levels), [l3.id]);
  assert.ok(odd.save.levels[l3.id].solutions[0].broken, 'another floor\'s machine doesn\'t clear this one');
  assert.ok(!odd.save.levels[l3.id].solved);

  for (const bad of ['', 'nope', '[]', '{"levels":[]}', JSON.stringify({ format: 'other', levels: {} })]) {
    assert.ok((await readSaveFile(bad, LEVELS)).error, bad);
  }
  assert.match((await readSaveFile(JSON.stringify({ format: FILE_FORMAT, version: 2, levels: {} }), LEVELS)).error, /newer/);

  // Loading adds to this browser's progress; nothing here is replaced.
  const here = {
    levels: {
      [l1.id]: { cells: [], workAt: 9 },
      [l2.id]: { solved: true, solutions: [{ cells: c2, croupiers: 1, rounds: 1, at: 1, rules: RULES_VERSION }] },
    },
  };
  const res = loadSaveFile(here, read.save);
  assert.deepStrictEqual(res, { changed: [l1.id], cleared: 1, solutions: 1 });
  assert.deepStrictEqual(here.levels[l1.id].cells, [], 'the working machine here stays');
  assert.strictEqual(here.levels[l1.id].workAt, 9);
  assert.ok(here.levels[l2.id].solved);
  assert.deepStrictEqual(loadSaveFile(here, read.save), { changed: [], cleared: 0, solutions: 0 }, 'loading it again adds nothing');

  // Into an empty browser, it brings the working machine too.
  const fresh = { levels: {} };
  loadSaveFile(fresh, read.save);
  assert.deepStrictEqual(fresh.levels[l1.id].cells, c1);
}
console.log('save files ok');
