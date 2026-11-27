// Runs the Node unit/invariant test suite concurrently across available cores,
// printing each script's output in deterministic order.
import { spawn } from 'node:child_process';
import { availableParallelism } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = resolve(fileURLToPath(new URL('..', import.meta.url)));
const TASKS = [
  ['tools/write-rules.js', '--check'],
  ['test/compat.js'],
  ['test/engine.js'],
  ['test/score.js'],
  ['test/online.js'],
  ['test/saves.js'],
  ['test/checker.js'],
  ['test/run.js'],
  ['test/transform.js'],
  ['test/listtext.js'],
  ['test/title.js'],
  ['test/build.js'],
  ['test/ci.js'],
  ['test/levels.js'],
];

const order = [TASKS.length - 1, ...Array.from({ length: TASKS.length - 1 }, (_, i) => i)];
const concurrency = Math.max(2, Math.min(availableParallelism(), 6));
const results = new Array(TASKS.length);
let next = 0;

function runTask(args) {
  return new Promise((res) => {
    const proc = spawn(process.execPath, args, { cwd: repo, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '', err = '';
    proc.stdout.on('data', (d) => { out += d; });
    proc.stderr.on('data', (d) => { err += d; });
    proc.on('close', (code) => res({ args, code: code ?? 1, out, err }));
  });
}

await Promise.all(Array.from({ length: concurrency }, async () => {
  while (next < order.length) {
    const i = order[next++];
    results[i] = await runTask(TASKS[i]);
  }
}));

let failed = 0;
for (const r of results) {
  if (r.out) process.stdout.write(r.out);
  if (r.err) process.stderr.write(r.err);
  if (r.code !== 0) {
    console.error(`FAIL ${r.args.join(' ')} (exit ${r.code})`);
    failed++;
  }
}
process.exit(failed ? 1 : 0);
