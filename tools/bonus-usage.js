// What players' machines on the bonus floors actually use (croupiers, shoes,
// War rules, special cards), and so how early each floor could open without
// breaking any of them.
//
//   node tools/bonus-usage.js [dump.json]... [--saves saves.json]... [--broken]
//                             [--level <id>]... [--who <feature>] [--json]
//
// A dump is the output of
//   firebase database:get /solutions --instance zygoloid-stacked-deck > solutions.json
// (or of `/`, the whole database: then its `solutions` and `saves` are both
// read). `--saves` reads a dump of /saves too, so working machines (cloud
// saves) count as well as solutions. Players' data: keep the dumps on your
// own machine, and delete them within 30 days (docs/online.md, "Copies of
// the database"). The reference solutions are always included; with no dump the
// tool reports on those alone.
//
// Why it matters: a bonus floor can only open after a campaign floor whose
// palette, War rules and special cards include everything on the bonus
// floor (test/levels.js). To open a floor earlier its palette must shrink,
// and a croupier taken off a floor breaks every saved machine using it: the
// editor drops it from local saves (sanitizeCells), cloud saves holding it
// are refused (validateCells), and the server tombstones submissions with it.
// So for each bonus floor this lists every feature in use, with how many
// machines and players use it and the campaign floor that introduces it,
// and the earliest campaign floor by which all of it is available. Opening
// the floor there (directly, or through a bonus floor that opens there), with
// its palette cut to what that floor has, breaks nothing in the dump.
//
// Only uploaded machines are seen: players who never signed in keep theirs in
// their browser, so treat a feature used by very few players as possibly
// used by others too.
//
// Solutions scored broken are left out unless `--broken` (they don't clear
// the floor anyway, but a player may still be fixing one); tombstones have no
// machine. `--level` limits the report to some floors; `--who <feature>`
// (a croupier name, `shoe`, `war:high`, `war:top` or a special card such as
// `?`) lists the machines using it, by uid/level/hash; `--json` prints the
// report as JSON.
import { readFileSync } from 'node:fs';
import { LEVELS, BONUS } from '../src/levels.js';
import { SPECIALS, isSpecial } from '../src/cards.js';
import { warRules, specialCardsOf } from '../src/score.js';

const args = process.argv.slice(2);
const dumps = [], saveDumps = [], only = [];
let broken = false, json = false, who = null;
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--saves') saveDumps.push(args[++i]);
  else if (a === '--level') only.push(args[++i]);
  else if (a === '--who') who = args[++i];
  else if (a === '--broken') broken = true;
  else if (a === '--json') json = true;
  else if (a.startsWith('--')) { console.error(`unknown option ${a}`); process.exit(2); }
  else dumps.push(a);
}
const bonusById = new Map(BONUS.map((l) => [l.id, l]));
for (const id of only) if (!bonusById.has(id)) { console.error(`${id} is not a bonus floor`); process.exit(2); }
const floors = only.length ? BONUS.filter((l) => only.includes(l.id)) : BONUS;

// ---------- what each campaign floor makes available ----------
// As test/levels.js: the palette at each floor, and the War rules and
// special cards seen by then. `introduced` maps a feature to the first
// campaign floor that has it.
const available = [];
const introduced = new Map();
{
  const rules = new Set();
  for (const level of LEVELS) {
    warRules(level).forEach((r) => rules.add(r));
    const have = new Set([...level.croupiers, ...[...rules].map((r) => `war:${r}`), ...specialCardsOf(level)]);
    // War rules count only where War is on the palette.
    if (!level.croupiers.includes('war')) for (const r of rules) have.delete(`war:${r}`);
    for (const f of have) if (!introduced.has(f)) introduced.set(f, level);
    available.push({ level, have });
  }
}
const campaignIndex = new Map(LEVELS.map((l, i) => [l.id, i]));
// A floor's text may not mention special cards before the campaign has
// introduced one (as SPECIAL_WORDS in test/levels.js).
const SPECIAL_WORDS = /joker|advertis|wild card/i;
const firstSpecial = LEVELS.findIndex((l) => specialCardsOf(l).length);
const mentionsSpecials = (level) => SPECIAL_WORDS.test([level.title, level.brief, ...(level.story ?? [])].join(' '));

// The campaign floors a bonus floor waits for, through its chain of bonus
// floors, and the latest of them (the one that decides what it may use).
const unlockIds = (level) => [].concat(level.unlockAfter ?? []);
function rootsOf(level, seen = new Set()) {
  if (seen.has(level.id)) return [];
  seen.add(level.id);
  return unlockIds(level).flatMap((id) => (bonusById.has(id) ? rootsOf(bonusById.get(id), seen) : [id]));
}
const latest = (ids) => ids.reduce((a, b) => (campaignIndex.get(b) > campaignIndex.get(a) ? b : a), ids[0]);

// Everything on a floor's palette, as features.
function featuresOf(level) {
  const f = new Set(level.croupiers);
  if (level.croupiers.includes('war')) warRules(level).forEach((r) => f.add(`war:${r}`));
  specialCardsOf(level).forEach((c) => f.add(c));
  return f;
}

// The features one machine uses.
function uses(cells) {
  const f = new Set();
  for (const c of cells) {
    if (c?.kind === 'shoe') {
      f.add('shoe');
      for (const x of Array.isArray(c.deck) ? c.deck : []) if (isSpecial(x)) f.add(x);
    } else if (c?.kind === 'croupier' && typeof c.fn === 'string') {
      f.add(c.fn);
      if (c.fn === 'war') f.add(`war:${c.rule ?? 'high'}`);
    }
  }
  return f;
}

// ---------- the machines ----------
// [{ level, from, uid, cells, kind: 'reference' | 'solution' | 'save' }]
const machines = [];
for (const level of floors) {
  const sol = (await import(`../solutions/levels/${level.id}.js`)).default;
  machines.push({ level, from: 'reference', uid: null, cells: sol.cells, kind: 'reference' });
}
const parseCells = (cells) => {
  try { const c = typeof cells === 'string' ? JSON.parse(cells) : cells; return Array.isArray(c) ? c : null; } catch { return null; }
};
const read = (file) => JSON.parse(readFileSync(file, 'utf8')) ?? {};
const skipped = { tombstones: 0, broken: 0, unreadable: 0 };
const seen = new Set();
function addSolutions(tree, file) {
  for (const [uid, byLevel] of Object.entries(tree ?? {})) {
    for (const [id, byHash] of Object.entries(byLevel ?? {})) {
      const level = bonusById.get(id);
      if (!level || !floors.includes(level)) continue;
      for (const [hash, sol] of Object.entries(byHash ?? {})) {
        if (seen.has(`${uid}/${id}/${hash}`)) continue;
        seen.add(`${uid}/${id}/${hash}`);
        if (sol?.invalid !== undefined || sol?.cells === undefined) { skipped.tombstones++; continue; }
        if (sol.score?.broken && !broken) { skipped.broken++; continue; }
        const cells = parseCells(sol.cells);
        if (!cells) { skipped.unreadable++; console.error(`${file}: can't read ${uid}/${id}/${hash}`); continue; }
        machines.push({ level, from: `${uid}/${id}/${hash}`, uid, cells, kind: 'solution' });
      }
    }
  }
}
function addSaves(tree, file) {
  for (const [uid, byLevel] of Object.entries(tree ?? {})) {
    for (const [id, save] of Object.entries(byLevel ?? {})) {
      const level = bonusById.get(id);
      if (!level || !floors.includes(level) || save?.work?.cells === undefined) continue;
      const cells = parseCells(save.work.cells);
      if (!cells) { skipped.unreadable++; console.error(`${file}: can't read the save ${uid}/${id}`); continue; }
      if (cells.length) machines.push({ level, from: `${uid}/${id} (save)`, uid, cells, kind: 'save' });
    }
  }
}
for (const file of dumps) {
  const tree = read(file);
  // A dump of the whole database has `solutions` (and `saves`) at the top;
  // a dump of /solutions has uids there.
  if (tree.solutions || tree.saves) { addSolutions(tree.solutions, file); addSaves(tree.saves, file); }
  else addSolutions(tree, file);
}
for (const file of saveDumps) addSaves(read(file), file);

// ---------- the report ----------
const SUIT = { S: '♠', H: '♥', D: '♦', C: '♣' };
const cardName = (card) => (card?.length === 2 ? `${card[0] === 'T' ? '10' : card[0]}${SUIT[card[1]] ?? card[1]}` : card ?? '?');
const floorName = (level) => `${cardName(level.card)} ${level.id}`;
// Features in the order the campaign introduces them.
const order = (f) => (introduced.has(f) ? campaignIndex.get(introduced.get(f).id) : Infinity);
const byIntro = (a, b) => order(a) - order(b) || a.localeCompare(b);

const report = floors.map((level) => {
  const mine = machines.filter((m) => m.level === level);
  const players = new Set(mine.filter((m) => m.uid).map((m) => m.uid));
  const count = new Map(); // feature -> { machines, players: Set }
  for (const m of mine) {
    for (const f of uses(m.cells)) {
      const c = count.get(f) ?? { machines: 0, players: new Set() };
      c.machines++;
      if (m.uid) c.players.add(m.uid);
      count.set(f, c);
    }
  }
  const used = [...count.keys()].sort(byIntro);
  const palette = featuresOf(level);
  const unused = [...palette].filter((f) => !count.has(f)).sort(byIntro);
  // The earliest campaign floor with everything used (and the feature, or
  // features, that make it that late).
  const at = available.findIndex(({ have }) => used.every((f) => have.has(f)));
  const earliest = at >= 0 ? available[at].level : null;
  const blockers = earliest ? used.filter((f) => introduced.get(f) === earliest) : [];
  const roots = rootsOf(level);
  const now = roots.length ? latest(roots) : null;
  const gain = earliest && now ? campaignIndex.get(now) - at : 0;
  // What the floor's palette would lose there.
  const drop = earliest ? [...palette].filter((f) => !available[at].have.has(f)).sort(byIntro) : [];
  const rewrite = earliest && at < firstSpecial && mentionsSpecials(level);
  return {
    level, machines: mine.length, solutions: mine.filter((m) => m.kind === 'solution').length,
    saves: mine.filter((m) => m.kind === 'save').length, players: players.size,
    used: used.map((f) => ({ feature: f, machines: count.get(f).machines, players: count.get(f).players.size, introduced: introduced.get(f) ?? null })),
    unused, now, earliest, blockers, gain, drop, rewrite,
  };
});

if (who) {
  for (const m of machines) if (uses(m.cells).has(who)) console.log(`${m.level.id} ${m.from}`);
  process.exit(0);
}

if (json) {
  console.log(JSON.stringify(report.map((r) => ({
    id: r.level.id, card: r.level.card, unlockAfter: r.level.unlockAfter,
    machines: r.machines, solutions: r.solutions, saves: r.saves, players: r.players,
    used: r.used.map((u) => ({ ...u, introduced: u.introduced?.id ?? null })),
    unused: r.unused, opensAfter: r.now, earliest: r.earliest?.id ?? null, blockers: r.blockers, floorsEarlier: r.gain, wouldDrop: r.drop, textMentionsSpecials: r.rewrite,
  })), null, 1));
  process.exit(0);
}

const fromDb = machines.filter((m) => m.kind !== 'reference');
const plural = (n, what) => `${n} ${what}${n === 1 ? '' : 's'}`;
console.log(`${plural(machines.length, 'machine')} on ${plural(floors.length, 'bonus floor')}: ` +
  `${plural(floors.length, 'reference solution')}, ${plural(fromDb.filter((m) => m.kind === 'solution').length, 'solution')} and ` +
  `${plural(fromDb.filter((m) => m.kind === 'save').length, 'save')} from ${plural(new Set(fromDb.map((m) => m.uid)).size, 'player')}` +
  `${skipped.broken ? ` (${skipped.broken} broken left out; --broken includes them)` : ''}` +
  `${skipped.tombstones ? ` (${plural(skipped.tombstones, 'tombstone')})` : ''}`);
if (!fromDb.length) console.log('No dump given (or nothing in it for these floors): the reference solutions only.');
console.log('Each feature: machines/players using it, and the campaign floor that introduces it.\n');

const feature = (f) => (f.startsWith('war:') ? `War ${f.slice(4)}` : f);
for (const r of report) {
  const n = r.machines - 1; // less the reference solution
  console.log(`${floorName(r.level)} (${r.level.title}): ${n ? `${plural(n, 'machine')} from ${plural(r.players, 'player')}, and the reference` : 'the reference solution only'}`);
  console.log(`  uses     ${r.used.map((u) => `${feature(u.feature)} ${u.machines}/${u.players} ${u.introduced ? cardName(u.introduced.card) : '(never)'}`).join(' · ')}`);
  console.log(`  unused   ${r.unused.length ? r.unused.map(feature).join(', ') : '(none)'}`);
  const roots = rootsOf(r.level);
  const chain = unlockIds(r.level).join(' + ');
  console.log(`  opens    after ${chain}${r.now && chain !== r.now ? ` (so after ${floorName(LEVELS[campaignIndex.get(r.now)])})` : ''}${roots.length ? '' : ' (no campaign floor?)'}`);
  if (!r.earliest) console.log('  earliest (something in use is never on the campaign\'s palette)');
  else {
    const why = r.blockers.map(feature).join(', ');
    const more = r.gain > 0 ? `: ${r.gain} campaign floor${r.gain === 1 ? '' : 's'} earlier` : r.gain === 0 ? ': where it opens now' : '';
    console.log(`  earliest after ${floorName(r.earliest)}${why ? `, for ${why}` : ''}${more}`);
    if (r.gain > 0) console.log(`           its palette would lose ${r.drop.length ? r.drop.map(feature).join(', ') : 'nothing'}`);
    if (r.rewrite) console.log('           and its text mentions special cards, which aren\'t introduced there yet');
  }
  console.log();
}
