// Which values of STALL_ROUNDS (src/engine.js) keep existing machines
// working: the reference solutions, and optionally every solution in a dump
// of the database's /solutions.
//   node tools/stall-bound.js [solutions.json] [--skip <level>/<hash>]...
// where solutions.json is the output of
//   firebase database:get /solutions --instance zygoloid-stacked-deck
// Each machine is run on its floor's tests and check deals with no stall
// limit (up to LIMIT rounds without progress). It works for a stall limit X
// if X >= its longest stretch without progress (`gap`) and X is less than
// the rounds from its last expected payout to the first extra payout or
// overflow, if it ever makes one. Solutions already scored broken, and
// tombstones, are left out; `--skip` leaves out others by hash (or prefix).
import { readFileSync } from 'node:fs';
import { LEVELS, BONUS } from '../src/levels.js';
import { Run } from '../src/engine.js';
import { toSpec, checkDeals } from '../src/score.js';

const LIMIT = 20000;
const args = process.argv.slice(2);
const skip = [];
const files = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--skip') skip.push(args[++i]);
  else files.push(args[i]);
}
const levels = new Map([...LEVELS, ...BONUS].map((l) => [l.id, l]));

// [{ level, cells, from, score? }]
const machines = [];
for (const level of levels.values()) {
  const sol = (await import(`../solutions/levels/${level.id}.js`)).default;
  machines.push({ level, cells: sol.cells, from: 'reference', score: level.par });
}
const seen = new Set();
for (const file of files) {
  const dump = JSON.parse(readFileSync(file, 'utf8')) ?? {};
  for (const [uid, byLevel] of Object.entries(dump)) {
    for (const [id, byHash] of Object.entries(byLevel ?? {})) {
      const level = levels.get(id);
      for (const [hash, sol] of Object.entries(byHash ?? {})) {
        if (!level || typeof sol?.cells !== 'string' || !sol.score || sol.score.broken) continue;
        if (seen.has(`${id}/${hash}`)) continue;
        seen.add(`${id}/${hash}`);
        if (skip.some((s) => `${id}/${hash}`.startsWith(s))) continue;
        machines.push({ level, cells: JSON.parse(sol.cells), from: `${uid}/${id}/${hash}`, score: sol.score });
      }
    }
  }
}

// One test: { gap, upper, fails, rounds }. `upper` is the stall limit it
// needs to stay under (Infinity if none); `fails` says why it fails at any.
function measure(spec, test, level) {
  const run = new Run(spec, test, level, { stall: LIMIT });
  while (!run.step());
  const complete = run.complete;
  const res = { gap: run.maxGap, upper: Infinity, fails: null, rounds: run.last, stop: run.stop };
  if ((run.stop === 'wrong' || run.stop === 'overflow') && complete) res.upper = run.round - run.last;
  else if (!run.passed) res.fails = `${run.stop} in round ${run.round} (${run.missing.length} missing)`;
  return res;
}

let lower = 0, lowerAt = null, upper = Infinity, upperAt = null;
const failing = [], changed = [];
for (const m of machines) {
  const spec = toSpec(m.level, m.cells);
  const tests = [...m.level.tests, ...(await checkDeals(m.level, m.cells))];
  const res = tests.map((t) => measure(spec, t, m.level));
  const name = `${m.level.id} ${m.from} (${m.cells.length} cells)`;
  const bad = res.findIndex((r) => r.fails);
  if (bad >= 0) { failing.push(`${name}: test ${bad} ${res[bad].fails}`); continue; }
  const gap = Math.max(...res.map((r) => r.gap));
  const up = Math.min(...res.map((r) => r.upper));
  if (gap > lower) { lower = gap; lowerAt = name; }
  if (up < upper) { upper = up; upperAt = name; }
  if (up <= gap) failing.push(`${name}: needs a stall limit of at least ${gap} and under ${up}`);
  const rounds = res.slice(0, m.level.tests.length).reduce((a, r) => a + r.rounds, 0);
  if (m.score?.rounds !== undefined && rounds !== m.score.rounds) changed.push(`${name}: ${m.score.rounds} -> ${rounds} rounds`);
}

console.log(`${machines.length} machines (${machines.length - levels.size} from the database)`);
console.log(`stall limit at least ${lower}${lowerAt ? `: ${lowerAt}` : ''}`);
console.log(`stall limit under ${upper}${upperAt ? `: ${upperAt}` : ''}`);
for (const f of failing) console.log(`fails: ${f}`);
for (const c of changed) console.log(`score changes: ${c}`);
