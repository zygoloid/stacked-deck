// Which values of STALL_ROUNDS (src/engine.js) keep existing machines
// working: the reference solutions, and optionally every solution in a dump
// of the database's /solutions.
//   node tools/stall-bound.js [solutions.json] [--skip <level>/<hash>]... [--stall N]
// where solutions.json is the output of
//   firebase database:get /solutions --instance zygoloid-stacked-deck
// Each machine is run on its floor's tests and check deals with no stall
// limit (up to LIMIT rounds without progress). It works for a stall limit X
// if X >= its longest stretch without progress (`gap`) and X is less than
// the rounds from its last expected payout to the first extra payout or
// overflow, if it ever makes one. Solutions already scored broken, and
// tombstones, are left out; `--skip` leaves out others by hash (or prefix).
// It lists every machine with an upper limit (what it pays, or overflows,
// and when, with a drawing of it), the machines needing the highest
// limits, and which machines the limit N (default STALL_ROUNDS) breaks.
import { readFileSync } from 'node:fs';
import { LEVELS, BONUS } from '../src/levels.js';
import { Run, STALL_ROUNDS } from '../src/engine.js';
import { toSpec, checkDeals } from '../src/score.js';
import { render } from '../src/render.js';
import { fmtHand } from '../src/cards.js';

const LIMIT = 20000;
const args = process.argv.slice(2);
const skip = [];
const files = [];
let stall = STALL_ROUNDS;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--skip') skip.push(args[++i]);
  else if (args[i] === '--stall') stall = Number(args[++i]);
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

// One test: { gap, upper, fails, rounds, why }. `upper` is the stall limit
// it needs to stay under (Infinity if none), and `why` what happens then;
// `fails` says why it fails at any limit.
function measure(spec, test, level) {
  const run = new Run(spec, test, level, { stall: LIMIT });
  while (!run.step());
  const complete = run.complete;
  const res = { gap: run.maxGap, gapAt: gapAt(run.progress), upper: Infinity, fails: null, rounds: run.last, stop: run.stop };
  if ((run.stop === 'wrong' || run.stop === 'overflow') && complete) {
    res.upper = run.round - run.last;
    res.why = `last expected progress in round ${run.last}, then ${run.stop === 'wrong'
      ? `pays ${fmtHand(run.floor.paid[run.wrong])} in round ${run.round}`
      : `more than the card limit in round ${run.round}`}`;
  } else if (!run.passed) res.fails = `${run.stop} in round ${run.round} (${run.missing.length} missing)`;
  return res;
}
// The rounds the longest stretch without progress runs between.
function gapAt(progress) {
  let best = [0, progress[0] ?? 0];
  progress.forEach((r, i) => { const from = i ? progress[i - 1] : 0; if (r - from > best[1] - best[0]) best = [from, r]; });
  return best;
}

const label = (m, i) => (i < m.level.tests.length ? `test ${i + 1}` : `check deal ${i - m.level.tests.length + 1}`);
const drawing = (m) => render(toSpec(m.level, m.cells)).split('\n').map((l) => `      ${l}`).join('\n');
const results = [];
const failing = [], changed = [];
for (const m of machines) {
  const spec = toSpec(m.level, m.cells);
  const tests = [...m.level.tests, ...(await checkDeals(m.level, m.cells))];
  const res = tests.map((t) => measure(spec, t, m.level));
  const name = `${m.level.id} ${m.from} (${m.cells.length} cells)`;
  const bad = res.findIndex((r) => r.fails);
  if (bad >= 0) { failing.push(`${name}: ${label(m, bad)} ${res[bad].fails}`); continue; }
  const lo = res.reduce((a, r, i) => (r.gap > res[a].gap ? i : a), 0);
  const up = res.reduce((a, r, i) => (r.upper < res[a].upper ? i : a), 0);
  results.push({ m, name, gap: res[lo].gap, lo, up, upper: res[up].upper, res });
  const rounds = res.slice(0, m.level.tests.length).reduce((a, r) => a + r.rounds, 0);
  if (m.score?.rounds !== undefined && rounds !== m.score.rounds) changed.push(`${name}: ${m.score.rounds} -> ${rounds} rounds`);
}

console.log(`${machines.length} machines (${machines.length - levels.size} from the database)\n`);
const highest = [...results].sort((a, b) => b.gap - a.gap).slice(0, 8);
console.log('Highest lower limits (longest stretch without progress):');
for (const r of highest) {
  const [from, to] = r.res[r.lo].gapAt;
  console.log(`  at least ${r.gap}: ${r.name}, ${label(r.m, r.lo)}, rounds ${from}-${to}`);
}
const capped = results.filter((r) => r.upper < Infinity).sort((a, b) => a.upper - b.upper);
console.log(`\nUpper limits (${capped.length} machine${capped.length === 1 ? ' pays' : 's pay'} or overflow${capped.length === 1 ? 's' : ''} after the last expected progress):`);
for (const r of capped) {
  const n = r.res.filter((x) => x.upper < Infinity).length;
  console.log(`  under ${r.upper}: ${r.name}, ${label(r.m, r.up)}: ${r.res[r.up].why} (${n} of ${r.res.length} runs)`);
  console.log(drawing(r.m));
}
const broken = results.filter((r) => r.gap > stall || r.upper <= stall);
console.log(`\nWith a stall limit of ${stall}: ${broken.length} machine${broken.length === 1 ? ' stops' : 's stop'} working`);
for (const r of broken) console.log(`  ${r.name}: ${r.gap > stall ? `needs at least ${r.gap}` : `pays or overflows after ${r.upper}`}`);
for (const f of failing) console.log(`fails at any limit: ${f}`);
for (const c of changed) console.log(`score changes: ${c}`);
