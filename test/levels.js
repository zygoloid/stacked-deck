// Verifies the campaign in src/levels.js against the reference solutions in
// solutions/levels/<id>.js.
//
// For every level:
//  * the level is well formed (fields, floor, fixed cells, palette, tests);
//  * its reference solution only uses the level's floor and palette, places
//    only shoes and croupiers, and doesn't overlap the fixed cells;
//  * the solution passes every test;
//  * par matches the solution exactly: croupiers, and rounds (the average over
//    all tests, rounded). The engine is deterministic, so any change in rounds
//    means the solution or the tests changed; regenerate the PAR table with
//    `node tools/write-solutions.js`.
//  * the tests discriminate: "pay everything" and "drop everything" machines
//    fail wherever that would be wrong; plausible wrong rules (mutants) are
//    told apart from the real rule by some test hand; removing any one
//    croupier from the reference solution breaks it; and the levels that teach
//    the door fail without one.
//
//   node test/levels.js [id]
import assert from 'node:assert';
import { LEVELS } from '../src/levels.js';
import { runTest, FUNCTIONS, DIRS } from '../src/engine.js';
import {
  RANKS, SUITS, rankOf, suitOf, highValue, rankValue, largestSet, isFlush, isStraight,
} from '../src/cards.js';

const only = process.argv[2];
const key = ([q, r]) => `${q},${r}`;
const step = (at, d) => [at[0] + DIRS[d][0], at[1] + DIRS[d][1]];
const hv = highValue;
const high = (h) => Math.max(...h.map(hv));
const low = (h) => Math.min(...h.map(hv));
const isRed = (c) => 'HD'.includes(suitOf(c));
const last = (before) => before[before.length - 1];

// Plausible wrong rules a test suite must tell apart from the real one.
const MUTANTS = {
  'hearts-only': { red: (h) => isRed(h[0]), diamonds: (h) => suitOf(h[0]) === 'D' },
  'seeing-red': { hearts: (h) => suitOf(h[0]) === 'H', diamonds: (h) => suitOf(h[0]) === 'D' },
  'black-tie': { spades: (h) => suitOf(h[0]) === 'S', clubs: (h) => suitOf(h[0]) === 'C' },
  'back-to-back': {
    'pairs too': (h) => isStraight(h) || rankOf(h[0]) === rankOf(h[1]),
    'ace low only': (h) => Math.abs(rankValue(h[0]) - rankValue(h[1])) === 1,
    'ace high only': (h) => Math.abs(hv(h[0]) - hv(h[1])) === 1,
    'wraps K-2': (h) => isStraight(h) || ['K2', '2K'].includes(rankOf(h[0]) + rankOf(h[1])),
  },
  'next-door': {
    '6 only': (h) => rankOf(h[0]) === '6', '8 only': (h) => rankOf(h[0]) === '8',
    '6 to 8': (h) => '678'.includes(rankOf(h[0])),
  },
  'red-flush': {
    'any flush': (h) => isFlush(h), 'all red': (h) => h.every(isRed),
    'hearts only': (h) => isFlush(h) && suitOf(h[0]) === 'H',
  },
  'even-money': {
    'ace counts 14': (h) => hv(h[0]) % 2 === 0, 'no queen': (h) => '2468T'.includes(rankOf(h[0])),
    'odd': (h) => rankValue(h[0]) % 2 === 1,
  },
  'pair-night': {
    'pair or better': (h) => largestSet(h) >= 2,
    'one pair only': (h) => countsOf(h) === '1,1,1,2',
    'no full house rule': (h) => largestSet(h) === 2 || countsOf(h) === '2,3',
  },
  'beat-the-dealer': { 'ties pay': (h) => hv(h[0]) >= 9, 'aces low': (h) => rankValue(h[0]) > 9 },
  'ace-in-the-hole': { 'king or better': (h) => high(h) >= 13, 'top card ace': (h) => rankOf(h[0]) === 'A' },
  'top-dog': {
    'ties pay': (h) => hv(h[0]) >= hv(h[1]), 'aces low': (h) => rankValue(h[0]) > rankValue(h[1]),
    'bottom beats top': (h) => hv(h[1]) > hv(h[0]),
  },
  'high-spade': {
    'any spade': (h) => h.some((c) => suitOf(c) === 'S'),
    'strictly highest': (h) => { const s = h.filter((c) => suitOf(c) === 'S'); return s.length > 0 && high(s) > high(h.filter((c) => suitOf(c) !== 'S')); },
    'aces low': (h) => { const s = h.filter((c) => suitOf(c) === 'S'); return s.length > 0 && Math.max(...s.map(rankValue)) >= Math.max(...h.map(rankValue)); },
  },
  'top-pair': {
    'any pair': (h) => largestSet(h) >= 2,
    'highest card paired': (h) => h.filter((c) => hv(c) === high(h)).length >= 2,
    'no pair counts': (h) => { const s = setOf(h); return high(s) === high(h); },
  },
  'new-rules': { 'high card': (h) => high(h) > 10, 'ties pay': (h) => hv(h[0]) >= 10 },
  'bottom-dealer': {
    'top card': (h) => hv(h[0]) > 10, 'high card': (h) => high(h) > 10, 'ties pay': (h) => hv(h[4]) >= 10,
    'second from bottom': (h) => hv(h[3]) > 10,
  },
  knockout: { 'top card ace': (h) => rankOf(h[0]) === 'A', 'king or better': (h) => high(h) >= 13 },
  'low-ball': {
    'ties pay': (h) => low(h) >= 5, 'aces low': (h) => Math.min(...h.map(rankValue)) > 5,
    'top card': (h) => hv(h[0]) > 5, 'high card': (h) => high(h) > 5,
  },
  'hot-streak': {
    'ties pay': (h, b) => b.length > 0 && hv(h[0]) >= hv(last(b)[0]),
    'first card pays': (h, b) => b.length === 0 || hv(h[0]) > hv(last(b)[0]),
    'beats all earlier': (h, b) => b.length > 0 && b.every((x) => hv(h[0]) > hv(x[0])),
    'aces low': (h, b) => b.length > 0 && rankValue(h[0]) > rankValue(last(b)[0]),
  },
  'high-roller': {
    'strictly beats': (h, b) => b.every((x) => high(h) > high(x)),
    'beats previous only': (h, b) => b.length === 0 || high(h) >= high(last(b)),
  },
  'full-house': {
    'trips or better': (h) => largestSet(h) >= 3,
    'trips and a pair, or quads': (h) => countsOf(h) === '2,3' || largestSet(h) === 4,
    'two pair': (h) => countsOf(h) === '1,2,2',
  },
  'calling-card': {
    'top card spade': (h) => suitOf(h[0]) === 'S', 'spade flush': (h) => h.every((c) => suitOf(c) === 'S'),
    'black card': (h) => h.some((c) => !isRed(c)),
  },
  'house-record': {
    'strictly beats': (h, b) => b.every((x) => largestSet(h) > largestSet(x)),
    'beats previous only': (h, b) => b.length === 0 || largestSet(h) >= largestSet(last(b)),
    'high card record': (h, b) => b.every((x) => high(h) >= high(x)),
  },
};
function countsOf(h) {
  const m = new Map();
  for (const c of h) m.set(rankOf(c), (m.get(rankOf(c)) || 0) + 1);
  return [...m.values()].sort().join();
}
function setOf(h) {
  const m = new Map();
  for (const c of h) m.set(rankOf(c), (m.get(rankOf(c)) || 0) + 1);
  const max = Math.max(...m.values());
  return h.filter((c) => m.get(rankOf(c)) === max);
}

// Levels whose reference solution uses the door (a War at the source that
// admits one hand at a time) and must fail without it.
const DOOR = ['full-house', 'calling-card', 'house-record'];

const PALETTE = new Set([...Object.keys(FUNCTIONS), 'shoe']);
const CARDS = new Set(RANKS.flatMap((r) => SUITS.map((s) => r + s)));
let failures = 0;
const check = (cond, msg) => { if (!cond) { failures++; console.log(`   FAIL ${msg}`); } };

// Run every test; a machine "fails the level" if any test is not ok.
const runAll = (level, cells, opts) => level.tests.map((t) => runTest({ cells }, t, level.pays, opts));

const ids = new Set();
let prevChapter = 0;
let prevPalette = [];
for (const level of LEVELS) {
  if (only && level.id !== only) continue;
  console.log(`== ${level.id} (chapter ${level.chapter}): ${level.title}`);

  // --- Level shape ---
  check(!ids.has(level.id), 'duplicate id'); ids.add(level.id);
  check(/^[a-z0-9-]+$/.test(level.id), 'id is lowercase-kebab');
  for (const f of ['title', 'brief']) check(typeof level[f] === 'string' && level[f].length, `has ${f}`);
  check(Array.isArray(level.story) && level.story.length >= 1 && level.story.length <= 3, 'story has 1-3 paragraphs');
  check(level.chapter >= prevChapter, 'chapters are in order'); prevChapter = level.chapter;
  check(Number.isInteger(level.handSize) && level.handSize >= 1, 'handSize');
  check(level.croupiers.every((c) => PALETTE.has(c)), `palette names ${level.croupiers}`);
  if (!only) check(prevPalette.every((c) => level.croupiers.includes(c)), 'palette only grows');
  prevPalette = level.croupiers;
  const warRules = level.warRules ?? ['high'];
  check(warRules.length && warRules.every((r) => r === 'high' || r === 'top'), 'warRules');
  const floor = new Set(level.floor.map(key));
  check(floor.size === level.floor.length, 'floor has no repeated hexes');
  const fixedAt = new Set(level.fixed.map((c) => key(c.at)));
  check(fixedAt.size === level.fixed.length, 'fixed cells do not overlap');
  check(level.fixed.every((c) => c.kind === 'source' || c.kind === 'payout'), 'fixed cells are sources and desks');
  check(level.fixed.some((c) => c.kind === 'source') && level.fixed.some((c) => c.kind === 'payout'), 'has a source and a desk');
  check(level.floor.every((h) => !fixedAt.has(key(h))), 'floor excludes fixed cells');
  for (const s of level.fixed.filter((c) => c.kind === 'source')) {
    check(floor.has(key(step(s.at, s.out))), `source ${s.at} hands cards onto the floor`);
  }
  check(level.tests.length >= 3, 'at least 3 tests');
  for (const t of level.tests) {
    check(t.length >= 1, 'test has hands');
    // Fixed tests may reuse cards between hands (the house plays from a
    // multi-deck shoe), but a hand never holds the same card twice.
    for (const h of t) {
      check(h.length === level.handSize, `hand ${h} has ${level.handSize} cards`);
      check(new Set(h).size === h.length, `hand ${h} repeats a card`);
      for (const c of h) check(CARDS.has(c), `card ${c}`);
    }
  }

  // --- Reference solution ---
  let sol;
  try {
    sol = (await import(`../solutions/levels/${level.id}.js`)).default;
  } catch (e) {
    check(false, `solution: ${e.message}`);
    continue;
  }
  const cells = sol.cells;
  const at = new Set();
  for (const c of cells) {
    check(c.kind === 'shoe' || c.kind === 'croupier', `cell ${c.at} is a shoe or croupier`);
    check(floor.has(key(c.at)), `cell ${c.at} is on the floor`);
    check(!fixedAt.has(key(c.at)), `cell ${c.at} doesn't overlap a fixed cell`);
    check(!at.has(key(c.at)), `cell ${c.at} isn't placed twice`); at.add(key(c.at));
    const name = c.kind === 'shoe' ? 'shoe' : c.fn;
    check(level.croupiers.includes(name), `cell ${c.at}: ${name} is in the palette`);
    if (c.fn === 'war') check(warRules.includes(c.rule ?? 'high'), `cell ${c.at}: war rule ${c.rule} allowed`);
    if (c.fn === 'kind') check(Number.isInteger(c.n) && c.n >= 2 && c.n <= 8, `cell ${c.at}: kind n`);
    if (c.kind === 'shoe') check(c.deck.length && c.deck.every((x) => CARDS.has(x)), `cell ${c.at}: shoe deck`);
  }
  const all = [...level.fixed, ...cells];
  const results = runAll(level, all);
  results.forEach((r, i) => check(r.ok, `test ${i}: ${r.timeout ? 'timeout' : ''} wrong ${JSON.stringify(r.wrong)} missing ${JSON.stringify(r.missing)}`));
  const rounds = Math.round(results.reduce((a, r) => a + r.rounds, 0) / results.length);
  check(level.par && level.par.croupiers === results[0].croupiers, `par croupiers ${level.par?.croupiers} = ${results[0].croupiers}`);
  check(level.par && level.par.rounds === rounds, `par rounds ${level.par?.rounds} = ${rounds}`);

  // --- The tests discriminate ---
  const expected = level.tests.map((t) => t.map((h, i) => level.pays(h, t.slice(0, i))));
  const anyPaid = expected.some((e) => e.some(Boolean));
  const anyUnpaid = expected.some((e) => e.some((x) => !x));
  check(anyPaid, 'some hand is paid');
  const src = { at: [0, 0], kind: 'source', out: 0 };
  const payAll = [src, { at: [1, 0], kind: 'payout' }];
  const dropAll = [src, { at: [1, 0], kind: 'croupier', fn: 'pass' }];
  if (anyUnpaid) check(!runAll(level, payAll).every((r) => r.ok), '"pay everything" fails');
  check(!runAll(level, dropAll).every((r) => r.ok), '"drop everything" fails');
  // Each test with a decision in it should matter: fixed tests are listed first.
  for (const [name, wrong] of Object.entries(MUTANTS[level.id] ?? {})) {
    const differs = level.tests.some((t) => t.some((h, i) => wrong(h, t.slice(0, i)) !== level.pays(h, t.slice(0, i))));
    check(differs, `tests tell "${name}" apart from the real rule`);
  }
  // Every croupier in the reference solution is needed.
  const limit = { maxRounds: 4 * level.par.rounds + 200 };
  cells.forEach((c, i) => {
    const without = [...level.fixed, ...cells.filter((_, j) => j !== i)];
    check(!runAll(level, without, limit).every((r) => r.ok), `removing ${c.fn ?? c.kind} at ${c.at} breaks the machine`);
  });
  // The door: replace it with a pass, drop the first ticket, and let the gate
  // drop its verdict cards instead of returning them.
  if (DOOR.includes(level.id)) {
    const source = level.fixed.find((f) => f.kind === 'source');
    const deskAt = key(level.fixed.find((f) => f.kind === 'payout').at);
    const doorAt = key(step(source.at, source.out));
    const door = cells.find((c) => key(c.at) === doorAt);
    check(door?.fn === 'war', 'the door is a War at the source');
    const open = cells
      .filter((c) => !(c.kind === 'shoe' && c.once && step(c.at, c.out).join() === door.at.join()))
      .map((c) => {
        if (c === door) return { at: c.at, kind: 'croupier', fn: 'pass', out: { out: c.out.dwin } };
        if (c.fn === 'war' && c.out.win !== undefined && key(step(c.at, c.out.win)) === deskAt) return { ...c, out: { win: c.out.win } };
        return c;
      });
    check(!runAll(level, [...level.fixed, ...open], limit).every((r) => r.ok), 'fails without the door');
  }
}

assert(only || ids.size === LEVELS.length);
if (failures) {
  console.log(`\n${failures} level check(s) failed`);
  process.exit(1);
}
console.log(`\nlevels ok (${ids.size} levels)`);
