// Writes database.rules.json (the Realtime Database security rules) from
// tools/database.rules.template.json, filling in LEVEL_IDS with every floor
// id, so the rules accept only real floors.
//   node tools/write-rules.js           write the file
//   node tools/write-rules.js --check   fail if the file is out of date (npm test)
import { readFileSync, writeFileSync } from 'node:fs';
import { LEVELS, BONUS } from '../src/levels.js';

const root = new URL('..', import.meta.url);
const ids = [...LEVELS, ...BONUS].map((l) => l.id);
for (const id of ids) {
  if (!/^[a-z0-9-]{1,40}$/.test(id)) throw new Error(`level id ${id} can't be used as a database key`);
}

function rulesText() {
  const template = readFileSync(new URL('tools/database.rules.template.json', root), 'utf8');
  const text = template.replaceAll('LEVEL_IDS', ids.join('|'));
  JSON.parse(text); // still valid JSON
  return text;
}

const out = new URL('database.rules.json', root);
if (process.argv.includes('--check')) {
  let current = null;
  try { current = readFileSync(out, 'utf8'); } catch { /* missing */ }
  if (current !== rulesText()) {
    console.error('database.rules.json is out of date: run node tools/write-rules.js');
    process.exit(1);
  }
  console.log('database rules ok');
} else {
  writeFileSync(out, rulesText());
  console.log(`wrote database.rules.json (${ids.length} floors)`);
}
