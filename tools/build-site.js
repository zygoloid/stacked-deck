// Builds the published site into _site/ (the GitHub Pages artifact, made by
// .github/workflows/deploy.yml): the pages, the stylesheet and src/, nothing
// else, with src/build.js saying which build it is. Then checks that every
// relative import in it stays inside the site, so a module moved outside
// src/ fails here rather than on the live site.
//   node tools/build-site.js [--beta] [--out <dir>]
//   --beta   the beta (docs/architecture.md, "Builds"): CHANNEL 'beta', and
//            the reference solutions (solutions/levels/) go in too, for dev
//            mode's par machines
//   --out    build into <dir> instead of _site/ (the deploy builds the beta
//            into _site/beta/)
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = resolve(fileURLToPath(new URL('..', import.meta.url)));
const args = process.argv.slice(2);
const beta = args.includes('--beta');
const outAt = args.indexOf('--out');
const site = outAt >= 0 ? resolve(args[outAt + 1]) : join(repo, '_site');
const FILES = ['index.html', 'privacy.html', 'style.css', 'src', ...(beta ? ['solutions'] : [])];
// The ?testlevels hook loads test fixtures that the live site doesn't have.
const TEST_ONLY = ['../../test/ui-levels.js'];

rmSync(site, { recursive: true, force: true });
mkdirSync(site);
for (const f of FILES) cpSync(join(repo, f), join(site, f), { recursive: true });
writeFileSync(join(site, 'src/build.js'), `// Written by tools/build-site.js (see src/build.js in the repository).
export const CHANNEL = '${beta ? 'beta' : 'live'}';
`);

const missing = [];
const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]));
for (const file of walk(site).filter((f) => f.endsWith('.js'))) {
  const text = readFileSync(file, 'utf8');
  for (const [, spec] of text.matchAll(/(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)['"`](\.{1,2}\/[^'"`$]+)['"`]/g)) {
    if (TEST_ONLY.includes(spec)) continue;
    const target = resolve(dirname(file), spec);
    if (!target.startsWith(site + '/') || !existsSync(target)) missing.push(`${relative(site, file)}: ${spec}`);
  }
}
if (missing.length) {
  console.error(`imports missing from the site:\n  ${missing.join('\n  ')}`);
  process.exit(1);
}
console.log(`built ${relative(process.cwd(), site) || '.'}/ (${beta ? 'beta, ' : ''}${walk(site).length} files)`);
