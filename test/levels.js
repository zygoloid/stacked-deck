// Verifies the campaign in src/levels.js (chapters in src/levels/) and the
// bonus deck (src/levels/bonus.js) against the reference solutions in
// solutions/levels/<id>.js.
//
// For every level:
//  * the level is well formed (fields, floor, fixed cells, palette, tests);
//  * its card fits the campaign: unique, and the next card of its chapter
//    (A..K in the chapter's suit, or ? ?? $ $$ in the finale);
//  * the palette only grows; special cards only appear in the finale, only
//    grow, and are not mentioned before a floor allows them;
//  * bonus floors: ids unique across the campaign and the bonus deck; each
//    opens after a campaign floor (`unlockAfter`), in campaign order, with
//    cards A..K of BONUS_SUIT in list order; its palette, War rules and
//    special cards are all available by its unlockAfter floor;
//  * a level has either `pays(hand, earlierHands)` or `expected(inputs)`;
//  * its reference solution only uses the level's floor, palette, War rules
//    and special cards, places only shoes and croupiers, and doesn't overlap
//    the fixed cells;
//  * the solution passes every test, and its check deals (src/score.js);
//  * par matches the solution exactly: croupiers, and rounds (the average over
//    all tests, rounded). The engine is deterministic, so any change in rounds
//    means the solution or the tests changed; regenerate the PAR table with
//    `node tools/write-solutions.js <chapter> --par`.
//  * the tests discriminate: "pay everything" and "drop everything" machines
//    fail wherever that would be wrong; plausible wrong rules (mutants, in
//    test/mutants/<chapter>.js) are told apart from the real rule by some test
//    hand; removing any one croupier from the reference solution breaks it;
//    and the levels that teach the door fail without one.
//
//   node test/levels.js [id | chapter]      (chapter: 1-5 or hearts, diamonds, ..., bonus)
import assert from 'node:assert';
import {
  LEVELS, BONUS, CHAPTERS, CHAPTER_FILES, CHAPTER_SUITS, FINALE_CARDS, BONUS_FILE, BONUS_SUIT,
} from '../src/levels.js';
import { runTest, expectedPayouts, handKey, FUNCTIONS, DIRS } from '../src/engine.js';
import { RANKS, SUITS, SPECIALS } from '../src/cards.js';
import { checkDeals } from '../src/score.js';

const MUTANTS = {}, DOOR = [];
for (const name of [...Object.values(CHAPTER_FILES), BONUS_FILE]) {
  const m = await import(`./mutants/${name}.js`);
  Object.assign(MUTANTS, m.MUTANTS);
  DOOR.push(...m.DOOR);
}

const arg = process.argv[2];
const byName = Object.fromEntries(Object.entries(CHAPTER_FILES).map(([n, f]) => [f, Number(n)]));
const onlyChapter = arg && (/^[1-5]$/.test(arg) ? Number(arg) : byName[arg]);
const selected = (level) => !arg || level.id === arg ||
  (arg === BONUS_FILE ? BONUS.includes(level) : !BONUS.includes(level) && level.chapter === onlyChapter);
const key = ([q, r]) => `${q},${r}`;
const step = (at, d) => [at[0] + DIRS[d][0], at[1] + DIRS[d][1]];

const PALETTE = new Set([...Object.keys(FUNCTIONS), 'shoe']);
const CARDS = new Set(RANKS.flatMap((r) => SUITS.map((s) => r + s)));
const SPECIAL_WORDS = /joker|advertis|wild card/i;
let failures = 0;
const check = (cond, msg) => { if (!cond) { failures++; console.log(`   FAIL ${msg}`); } };

// Run every test; a machine "fails the level" if any test is not ok.
const runAll = (level, cells, opts) => level.tests.map((t) => runTest({ cells }, t, level, opts));
// A test's payouts as a sorted list of hand keys (compared like runTest does).
const payoutKeys = (level, hands) => hands.map((h) => handKey(h, !!level.ordered)).sort().join(' | ');

// --- Campaign-wide checks (always on the whole campaign) ---
const ids = new Set(), cards = new Set();
let prevChapter = 1, prevPalette = [], prevSpecials = [], specialsSeen = false;
const perChapter = new Map();
// What the campaign has made available by each floor (for the bonus deck).
const availableBy = new Map();
const rulesSeen = new Set();
for (const level of LEVELS) {
  const where = `${level.id}:`;
  (level.warRules ?? ['high']).forEach((r) => rulesSeen.add(r));
  check(!ids.has(level.id), `${where} duplicate id`); ids.add(level.id);
  check(Number.isInteger(level.chapter) && CHAPTERS[level.chapter], `${where} chapter ${level.chapter} is one of ${Object.keys(CHAPTERS)}`);
  check(level.chapter >= prevChapter, `${where} chapters are in order`); prevChapter = level.chapter;
  // Cards: the n-th floor of a suit chapter is RANKS[n] of its suit; the
  // finale's floors are ? ?? $ $$ in order.
  const n = perChapter.get(level.chapter) ?? 0;
  perChapter.set(level.chapter, n + 1);
  const suit = CHAPTER_SUITS[level.chapter];
  const want = suit ? (n < 13 ? RANKS[n] + suit : null) : (FINALE_CARDS[n] ?? null);
  check(want !== null, `${where} chapter ${level.chapter} has at most ${suit ? 13 : FINALE_CARDS.length} floors`);
  check(level.card === want, `${where} card ${level.card} should be ${want}`);
  check(!cards.has(level.card), `${where} card ${level.card} is unique`); cards.add(level.card);
  // The palette only grows.
  check(prevPalette.every((c) => level.croupiers.includes(c)), `${where} palette only grows (lost ${prevPalette.filter((c) => !level.croupiers.includes(c))})`);
  prevPalette = level.croupiers;
  // Special cards: finale only, only grow, never mentioned before they're allowed.
  const specials = level.specialCards ?? [];
  check(Array.isArray(specials) && specials.every((c) => SPECIALS.includes(c)), `${where} specialCards ${specials} are special cards`);
  check(!specials.length || level.chapter === 5, `${where} special cards only in the finale`);
  check(prevSpecials.every((c) => specials.includes(c)), `${where} specialCards only grow`);
  prevSpecials = specials;
  specialsSeen ||= specials.length > 0;
  if (!specialsSeen) {
    const text = [level.title, level.brief, ...(level.story ?? [])].join(' ');
    check(!SPECIAL_WORDS.test(text), `${where} doesn't mention special cards before they're introduced`);
  }
  availableBy.set(level.id, {
    index: availableBy.size, palette: level.croupiers, rules: [...rulesSeen], specials, specialsSeen,
  });
}
// The bonus deck.
let prevUnlock = -1;
BONUS.forEach((level, i) => {
  const where = `${level.id} (bonus):`;
  check(!ids.has(level.id), `${where} id is unique across the campaign and the bonus deck`); ids.add(level.id);
  check(level.chapter === undefined, `${where} has no chapter`);
  const want = i < 13 ? RANKS[i] + BONUS_SUIT : null;
  check(level.card === want, `${where} card ${level.card} should be ${want} (at most 13 bonus floors)`);
  const after = availableBy.get(level.unlockAfter);
  check(after, `${where} unlockAfter ${level.unlockAfter} is a campaign floor`);
  if (!after) return;
  check(after.index >= prevUnlock, `${where} bonus floors are in the order they unlock`); prevUnlock = after.index;
  const lost = level.croupiers.filter((c) => !after.palette.includes(c));
  check(!lost.length, `${where} palette is available by ${level.unlockAfter} (not yet: ${lost})`);
  const rules = level.warRules ?? ['high'];
  check(rules.every((r) => after.rules.includes(r)), `${where} War rules ${rules} are available by ${level.unlockAfter}`);
  const specials = level.specialCards ?? [];
  check(specials.every((c) => after.specials.includes(c)), `${where} specialCards ${specials} are available by ${level.unlockAfter}`);
  if (!after.specialsSeen) {
    const text = [level.title, level.brief, ...(level.story ?? [])].join(' ');
    check(!SPECIAL_WORDS.test(text), `${where} doesn't mention special cards before they're introduced`);
  }
});
for (const [ch, name] of Object.entries(CHAPTER_FILES)) {
  const have = perChapter.get(Number(ch)) ?? 0, full = CHAPTER_SUITS[ch] ? 13 : FINALE_CARDS.length;
  if (have < full) console.log(`(chapter ${ch}, ${name}: ${have} of ${full} floors so far)`);
}

// --- Per-level checks ---
let checked = 0;
for (const level of [...LEVELS, ...BONUS]) {
  if (!selected(level)) continue;
  checked++;
  const isBonus = BONUS.includes(level);
  console.log(`== ${level.card} ${level.id} (${isBonus ? `bonus, after ${level.unlockAfter}` : `chapter ${level.chapter}`}): ${level.title}`);

  // --- Level shape ---
  check(/^[a-z0-9-]+$/.test(level.id), 'id is lowercase-kebab');
  for (const f of ['title', 'brief']) check(typeof level[f] === 'string' && level[f].length, `has ${f}`);
  check(Array.isArray(level.story) && level.story.length >= 1 && level.story.length <= 3, 'story has 1-3 paragraphs');
  check(Number.isInteger(level.handSize) && level.handSize >= 1, 'handSize');
  const hasPays = typeof level.pays === 'function', hasExpected = typeof level.expected === 'function';
  check(hasPays !== hasExpected, 'has exactly one of pays(hand, earlierHands) and expected(inputs)');
  check(level.ordered === undefined || typeof level.ordered === 'boolean', 'ordered is a boolean');
  check(!level.ordered || hasExpected, 'ordered only on an expected level');
  check(level.croupiers.every((c) => PALETTE.has(c)), `palette names ${level.croupiers}`);
  const warRules = level.warRules ?? ['high'];
  check(warRules.length && warRules.every((r) => r === 'high' || r === 'top'), 'warRules');
  const specials = level.specialCards ?? [];
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
    // multi-deck shoe), but a hand never holds the same card twice. Players
    // only ever hold natural cards.
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
    if (c.fn === 'hand') check(Number.isInteger(c.n) && c.n >= 1 && c.n <= 13, `cell ${c.at}: hand n`);
    if (c.kind === 'shoe') {
      check(c.deck.length && c.deck.every((x) => CARDS.has(x) || specials.includes(x)),
        `cell ${c.at}: shoe deck ${c.deck} uses natural cards${specials.length ? ` and ${specials}` : ''}`);
    }
  }
  const all = [...level.fixed, ...cells];
  const results = runAll(level, all);
  results.forEach((r, i) => check(r.ok, `test ${i}: ${r.timeout ? 'timeout' : ''} wrong ${JSON.stringify(r.wrong)} missing ${JSON.stringify(r.missing)}`));
  const rounds = Math.round(results.reduce((a, r) => a + r.rounds, 0) / results.length);
  check(level.par && level.par.croupiers === results[0].croupiers, `par croupiers ${level.par?.croupiers} = ${results[0].croupiers}`);
  check(level.par && level.par.rounds === rounds, `par rounds ${level.par?.rounds} = ${rounds}`);
  check(level.tests.deal, 'tests made by makeTests (so it has check deals)');
  (await checkDeals(level, cells)).forEach((t, i) => {
    const r = runTest({ cells: all }, t, level);
    check(r.ok, `check deal ${i + 1}: ${r.timeout ? 'timeout' : ''} wrong ${JSON.stringify(r.wrong)} missing ${JSON.stringify(r.missing)}`);
  });

  // --- The tests discriminate ---
  const payouts = level.tests.map((t) => expectedPayouts(level, t));
  check(payouts.every((p) => Array.isArray(p) && p.every((h) => Array.isArray(h) && h.length)), 'payouts are non-empty hands');
  const anyPaid = payouts.some((p) => p.length);
  // "Pay everything" is right only where the payouts are exactly the inputs.
  const anyUnpaid = level.tests.some((t, i) => payoutKeys(level, t) !== payoutKeys(level, payouts[i]));
  check(anyPaid, 'some hand is paid');
  const src = { at: [0, 0], kind: 'source', out: 0 };
  const payAll = [src, { at: [1, 0], kind: 'payout' }];
  const dropAll = [src, { at: [1, 0], kind: 'croupier', fn: 'pass' }];
  if (anyUnpaid) check(!runAll(level, payAll).every((r) => r.ok), '"pay everything" fails');
  check(!runAll(level, dropAll).every((r) => r.ok), '"drop everything" fails');
  for (const [name, wrong] of Object.entries(MUTANTS[level.id] ?? {})) {
    const differs = hasExpected
      ? level.tests.some((t, i) => payoutKeys(level, wrong(t)) !== payoutKeys(level, payouts[i]))
      : level.tests.some((t) => t.some((h, i) => wrong(h, t.slice(0, i)) !== level.pays(h, t.slice(0, i))));
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

assert(checked > 0, `no level matches ${arg}`);
if (failures) {
  console.log(`\n${failures} level check(s) failed`);
  process.exit(1);
}
console.log(`\nlevels ok (${checked} of ${LEVELS.length} campaign and ${BONUS.length} bonus levels checked)`);
