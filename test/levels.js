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
//    opens after one or more campaign or bonus floors (`unlockAfter`, an id
//    or a list; every chain of bonus floors ends at campaign floors), with
//    cards A..K of each of BONUS_SUITS in turn, in list order (by
//    difficulty, not by unlocking, except that a floor comes after every
//    bonus floor it needs); its palette, War rules and special cards are all
//    available by the latest campaign floor it needs;
//  * the floor's levels (src/levels/floor.js, floors that left the
//    campaign): ids unique; no chapter; a playing card each (any, repeats
//    allowed); no unlockAfter (always open);
//  * a level has either `pays(hand, earlierHands)` or `expected(inputs)`;
//  * its reference solution only uses the level's floor, palette, War rules
//    and special cards, places only shoes and croupiers, and doesn't overlap
//    the fixed cells;
//  * the solution passes every test, and its check deals (src/score.js);
//  * par matches the solution exactly: croupiers, and rounds (the total over
//    all tests). The engine is deterministic, so any change in rounds
//    means the solution or the tests changed; regenerate the PAR table with
//    `node tools/write-solutions.js <chapter> --par`.
//  * the tests discriminate: "pay everything" and "drop everything" machines
//    fail wherever that would be wrong; plausible wrong rules (mutants, in
//    test/mutants/<chapter>.js) are told apart from the real rule by some test
//    hand; removing any one croupier from the reference solution breaks it;
//    and the levels that teach the door fail without one.
//
//   node test/levels.js [id | chapter]      (chapter: 1-5 or hearts, diamonds, ..., bonus, floor)
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { availableParallelism } from 'node:os';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import {
  LEVELS, BONUS, FLOOR, CHAPTERS, CHAPTER_FILES, CHAPTER_SUITS, FINALE_CARDS, BONUS_FILE, BONUS_SUITS, FLOOR_FILE,
} from '../src/levels.js';
import {
  runTest, expectedPayouts, payoutKey, payoutHand, FUNCTIONS, DIRS,
} from '../src/engine.js';
import { RANKS, SUITS, SPECIALS } from '../src/cards.js';
import { checkDeals, totalRounds, MAX_HAND, cellError, countCroupiers } from '../src/score.js';

const MUTANTS = {}, DOOR = [];
for (const name of [...Object.values(CHAPTER_FILES), BONUS_FILE, FLOOR_FILE]) {
  const m = await import(`./mutants/${name}.js`);
  Object.assign(MUTANTS, m.MUTANTS);
  DOOR.push(...m.DOOR);
}

const arg = process.argv[2];
const byName = Object.fromEntries(Object.entries(CHAPTER_FILES).map(([n, f]) => [f, Number(n)]));
const onlyChapter = arg && (/^[1-5]$/.test(arg) ? Number(arg) : byName[arg]);
const selected = (level) => !arg || level.id === arg ||
  (arg === BONUS_FILE ? BONUS.includes(level) : arg === FLOOR_FILE ? FLOOR.includes(level)
    : level.chapter !== undefined && level.chapter === onlyChapter);
const key = ([q, r]) => `${q},${r}`;
const step = (at, d) => [at[0] + DIRS[d][0], at[1] + DIRS[d][1]];

const PALETTE = new Set([...Object.keys(FUNCTIONS), 'shoe']);
const CARDS = new Set(RANKS.flatMap((r) => SUITS.map((s) => r + s)));
const SPECIAL_WORDS = /joker|advertis|wild card/i;
let failures = 0;
const check = (cond, msg) => { if (!cond) { failures++; console.log(`   FAIL ${msg}`); } };

// Run every test; a machine "fails the level" if any test is not ok.
const runAll = (level, cells, opts) => level.tests.map((t) => runTest({ cells }, t, level, opts));
const passesAll = (level, cells, opts) => level.tests.every((t) => runTest({ cells }, t, level, opts).ok);
// A test's payouts as a sorted list of hand keys (compared like runTest does;
// with their desks, on a floor with labelled desks). (In order, for a level
// whose payouts must come in order.) Null hands (a player's missing hands)
// are skipped.
const payoutKeys = (level, hands) => {
  const keys = hands.filter(Boolean).map((p) => payoutKey(p, level.ordered ?? false));
  return (level.inOrder ? keys : keys.sort()).join(' | ');
};

async function checkOneLevel(level, bonusSpecialsMap) {
  const lines = [];
  let fails = 0;
  const checkL = (cond, msg) => { if (!cond) { fails++; lines.push(`   FAIL ${msg}`); } };
  const isBonus = BONUS.includes(level), onFloor = FLOOR.includes(level);
  lines.push(`== ${level.card} ${level.id} (${isBonus ? `bonus, after ${level.unlockAfter}` : onFloor ? 'floor' : `chapter ${level.chapter}`}): ${level.title}`);

  // --- Level shape ---
  checkL(/^[a-z0-9-]+$/.test(level.id), 'id is lowercase-kebab');
  for (const f of ['title', 'brief']) checkL(typeof level[f] === 'string' && level[f].length, `has ${f}`);
  checkL(Array.isArray(level.story) && level.story.length >= 1 && level.story.length <= 3, 'story has 1-3 paragraphs');
  const [minSize, maxSize] = [].concat(level.handSize, level.handSize).slice(0, 2);
  checkL(Number.isInteger(minSize) && Number.isInteger(maxSize) && minSize >= 1 && minSize <= maxSize, 'handSize');
  const hasPays = typeof level.pays === 'function', hasExpected = typeof level.expected === 'function';
  checkL(hasPays !== hasExpected, 'has exactly one of pays(hand, earlierHands) and expected(inputs)');
  checkL(level.ordered === undefined || typeof level.ordered === 'boolean' ||
    (Array.isArray(level.ordered) && level.ordered.length && level.ordered.every((i) => Number.isInteger(i) && i >= 0 && i < maxSize)),
  'ordered is a boolean, or a list of card places (0 for the top card) within the hand size');
  checkL(!level.ordered || hasExpected, 'ordered only on an expected level');
  checkL(level.inOrder === undefined || (typeof level.inOrder === 'boolean' && hasExpected), 'inOrder is a boolean, only on an expected level');
  checkL(level.croupiers.every((c) => PALETTE.has(c)), `palette names ${level.croupiers}`);
  const warRules = level.warRules ?? ['high'];
  checkL(warRules.length && warRules.every((r) => r === 'high' || r === 'top'), 'warRules');
  const specials = level.specialCards ?? [];
  const decks = level.decks ?? 1;
  checkL(Number.isInteger(decks) && decks >= 1 && decks <= 8, 'decks is 1 to 8');
  const floor = new Set(level.floor.map(key));
  checkL(floor.size === level.floor.length, 'floor has no repeated hexes');
  const fixedAt = new Set(level.fixed.map((c) => key(c.at)));
  checkL(fixedAt.size === level.fixed.length, 'fixed cells do not overlap');
  checkL(level.fixed.every((c) => ['source', 'payout', 'shoe', 'croupier'].includes(c.kind)), 'fixed cells are players, desks, shoes and croupiers');
  for (const c of level.fixed.filter((f) => f.kind === 'shoe' || f.kind === 'croupier')) {
    const bolted = { ...level, croupiers: [...PALETTE], warRules: ['high', 'top'] };
    const err = cellError(bolted, c);
    checkL(!err, `fixed ${c.fn ?? c.kind} at ${c.at}: ${err}`);
    if (c.kind === 'shoe') checkL(c.deck.every((x) => CARDS.has(x) || specials.includes(x)), `fixed shoe at ${c.at}: deck uses natural cards${specials.length ? ` and ${specials}` : ''}`);
    checkL(c.kind === 'shoe' ? c.out !== undefined : c.fn !== 'deal' || c.out.to?.length, `fixed ${c.fn ?? c.kind} at ${c.at} hands its cards somewhere`);
  }
  checkL(level.fixed.some((c) => c.kind === 'source') && level.fixed.some((c) => c.kind === 'payout'), 'has a source and a desk');
  checkL(level.floor.every((h) => !fixedAt.has(key(h))), 'floor excludes fixed cells');
  for (const s of level.fixed.filter((c) => c.kind === 'source')) {
    const to = key(step(s.at, s.out));
    checkL(floor.has(to) || level.fixed.some((c) => c.kind === 'croupier' && key(c.at) === to), `source ${s.at} hands cards onto the floor or to a fixed croupier`);
  }
  const labels = (kind, field) => level.fixed.filter((c) => c.kind === kind).map((c) => c[field]);
  for (const [kind, field] of [['source', 'seat'], ['payout', 'desk']]) {
    const l = labels(kind, field);
    checkL(l.every((x) => x === undefined) || l.slice().sort().every((x, i) => x === i), `${kind}s: ${field} on all or none, numbered from 0`);
  }
  const seats = labels('source', 'seat').filter((x) => x !== undefined).length;
  const desks = labels('payout', 'desk').filter((x) => x !== undefined).length;
  checkL(desks <= 1 || hasExpected, 'labelled desks only on an expected level');
  checkL(level.tests.length >= 3, 'at least 3 tests');
  for (const t of level.tests) {
    checkL(t.some(Boolean), 'test has hands');
    t.forEach((h, i) => {
      if (h) return;
      checkL(seats > 0, 'missing hands (null) only on a seated floor');
      checkL(i + seats >= t.length || !t[i + seats], `test hand ${i} is missing, but the same player has a later hand`);
    });
    for (const h of t.filter(Boolean)) {
      checkL(h.length >= minSize && h.length <= maxSize, `hand ${h} has ${minSize === maxSize ? minSize : `${minSize}-${maxSize}`} cards`);
      checkL(h.every((c) => h.filter((x) => x === c).length <= decks), `hand ${h} repeats a card${decks > 1 ? ` more than ${decks} times` : ''}`);
      for (const c of h) checkL(CARDS.has(c), `card ${c}`);
    }
  }

  // --- Reference solution ---
  let sol;
  try {
    sol = (await import(`../solutions/levels/${level.id}.js`)).default;
  } catch (e) {
    checkL(false, `solution: ${e.message}`);
    return { lines, fails };
  }
  const cells = sol.cells;
  const at = new Set();
  for (const c of cells) {
    checkL(c.kind === 'shoe' || c.kind === 'croupier', `cell ${c.at} is a shoe or croupier`);
    checkL(floor.has(key(c.at)), `cell ${c.at} is on the floor`);
    checkL(!fixedAt.has(key(c.at)), `cell ${c.at} doesn't overlap a fixed cell`);
    checkL(!at.has(key(c.at)), `cell ${c.at} isn't placed twice`); at.add(key(c.at));
    const name = c.kind === 'shoe' ? 'shoe' : c.fn;
    checkL(level.croupiers.includes(name), `cell ${c.at}: ${name} is in the palette`);
    if (c.fn === 'war') checkL(warRules.includes(c.rule ?? 'high'), `cell ${c.at}: war rule ${c.rule} allowed`);
    if (c.fn === 'kind') checkL(Number.isInteger(c.n) && c.n >= 2 && c.n <= 8, `cell ${c.at}: kind n`);
    if (c.fn === 'hand') checkL(Number.isInteger(c.n) && c.n >= 1 && c.n <= MAX_HAND, `cell ${c.at}: hand n`);
    if (c.kind === 'shoe') {
      const usable = isBonus ? bonusSpecialsMap.get(level.id) ?? [] : specials;
      checkL(c.deck.length && c.deck.every((x) => CARDS.has(x) || usable.includes(x)),
        `cell ${c.at}: shoe deck ${c.deck} uses natural cards${usable.length ? ` and ${usable}` : ''}${isBonus ? ' (those a player has by its campaign floors)' : ''}`);
    }
  }
  if (level.tutorial !== undefined) {
    const COACH_UI = ['play', 'tests', 'ports', 'roster', 'undo', 'brief', 'stats'];
    checkL(Array.isArray(level.tutorial) && level.tutorial.length > 0, 'tutorial is a list of steps');
    checkL(level.tutorial?.some((st) => !st.on), 'tutorial has a step in its sequence (not only on-failed ones)');
    checkL((level.tutorial ?? []).filter((st) => st.on === 'failed').length <= 1, 'tutorial has at most one on-failed step');
    for (const [i, st] of (level.tutorial ?? []).entries()) {
      const where = `tutorial step ${i + 1}:`;
      checkL(typeof st.say === 'string' && st.say.length, `${where} says something`);
      checkL(st.at === undefined || floor.has(key(st.at)), `${where} rings a hex on the floor`);
      checkL(st.side === undefined || (st.at && Number.isInteger(st.side) && st.side >= 0 && st.side < 6), `${where} side is an edge of its hex`);
      checkL(st.ui === undefined || COACH_UI.includes(st.ui), `${where} ui ${st.ui} is one coach.js knows`);
      checkL(st.modal === undefined || (st.modal === true && i === 0 && st.until === 'next'), `${where} modal only on the first step, which waits for Next`);
      checkL(st.on === undefined || (st.on === 'failed' && st.until === 'next' && !st.at && !st.modal), `${where} on is 'failed', on a step that waits for Next and rings no hex`);
      const u = st.until;
      const cellOk = (x) => x && x.cell && Array.isArray(x.cell.at);
      checkL(['next', 'ran', 'cleared'].includes(u) || cellOk(u) || (Array.isArray(u?.any) && u.any.length && u.any.every(cellOk)),
        `${where} until is next, ran, cleared, { cell } or { any: [{ cell }, ...] }`);
      const inRef = (x) => {
        const ref = cells.find((c) => key(c.at) === key(x.cell.at));
        return ref && (!x.cell.fn || (ref.fn ?? ref.kind) === x.cell.fn) &&
          Object.entries(x.cell.out ?? {}).every(([port, side]) => (side === '*' ? ref.out?.[port] !== undefined : ref.out?.[port] === side));
      };
      const alts = u?.cell ? [u] : u?.any ?? [];
      if (alts.length) checkL(alts.some(inRef), `${where} a croupier it asks for (${alts.map((x) => `${x.cell.fn} at ${x.cell.at}`).join(' or ')}) is in the reference solution`);
    }
  }
  const all = [...level.fixed, ...cells];
  const results = runAll(level, all);
  results.forEach((r, i) => checkL(r.ok, `test ${i}: stop ${r.stop}, wrong ${JSON.stringify(r.wrong)} missing ${JSON.stringify(r.missing)}`));
  const rounds = totalRounds(results);
  checkL(level.par && level.par.croupiers === countCroupiers(cells), `par croupiers ${level.par?.croupiers} = ${countCroupiers(cells)}`);
  checkL(level.par && level.par.rounds === rounds, `par rounds ${level.par?.rounds} = ${rounds}`);
  checkL(level.tests.deal, 'tests made by dealtTests (so it has check deals)');
  (await checkDeals(level, cells)).forEach((t, i) => {
    const r = runTest({ cells: all }, t, level);
    checkL(r.ok, `check deal ${i + 1}: stop ${r.stop}, wrong ${JSON.stringify(r.wrong)} missing ${JSON.stringify(r.missing)}`);
  });

  // --- The tests discriminate ---
  const payouts = level.tests.map((t) => expectedPayouts(level, t));
  checkL(payouts.every((p) => Array.isArray(p) && p.every((x) => Array.isArray(payoutHand(x)) && payoutHand(x).length)), 'payouts are non-empty hands');
  if (desks > 1) {
    checkL(payouts.every((p) => p.every((x) => !Array.isArray(x) && Number.isInteger(x.desk) && x.desk < desks)), 'payouts name their desks');
  }
  const anyPaid = payouts.some((p) => p.length);
  const anyUnpaid = level.tests.some((t, i) => payoutKeys(level, t) !== payoutKeys(level, payouts[i]));
  checkL(anyPaid, 'some hand is paid');
  const src = { at: [0, 0], kind: 'source', out: 0 };
  const payAll = [src, { at: [1, 0], kind: 'payout' }];
  const dropAll = [src, { at: [1, 0], kind: 'croupier', fn: 'pass' }];
  if (anyUnpaid) checkL(!passesAll(level, payAll), '"pay everything" fails');
  checkL(!passesAll(level, dropAll), '"drop everything" fails');
  for (const [name, wrong] of Object.entries(MUTANTS[level.id] ?? {})) {
    const differs = hasExpected
      ? level.tests.some((t, i) => payoutKeys(level, wrong(t)) !== payoutKeys(level, payouts[i]))
      : level.tests.some((t) => t.some((h, i) => wrong(h, t.slice(0, i)) !== level.pays(h, t.slice(0, i))));
    checkL(differs, `tests tell "${name}" apart from the real rule`);
  }
  const limit = { maxRounds: 4 * level.par.rounds + 200 };
  cells.forEach((c, i) => {
    const without = [...level.fixed, ...cells.filter((_, j) => j !== i)];
    checkL(!passesAll(level, without, limit), `removing ${c.fn ?? c.kind} at ${c.at} breaks the machine`);
  });
  if (DOOR.includes(level.id)) {
    const source = level.fixed.find((f) => f.kind === 'source');
    const deskAt = key(level.fixed.find((f) => f.kind === 'payout').at);
    const doorAt = key(step(source.at, source.out));
    const door = cells.find((c) => key(c.at) === doorAt);
    checkL(door?.fn === 'war', 'the door is a War at the source');
    const open = cells
      .filter((c) => !(c.kind === 'shoe' && c.once && step(c.at, c.out).join() === door.at.join()))
      .map((c) => {
        if (c === door) return { at: c.at, kind: 'croupier', fn: 'pass', out: { out: c.out.dwin } };
        if (c.fn === 'war' && c.out.win !== undefined && key(step(c.at, c.out.win)) === deskAt) return { ...c, out: { win: c.out.win } };
        return c;
      });
    checkL(!passesAll(level, [...level.fixed, ...open], limit), 'fails without the door');
  }
  return { lines, fails };
}

if (!isMainThread) {
  const allById = new Map([...LEVELS, ...BONUS, ...FLOOR].map((l) => [l.id, l]));
  const bsMap = new Map(Object.entries(workerData.bonusSpecials));
  const out = [];
  for (const id of workerData.ids) {
    out.push({ id, ...(await checkOneLevel(allById.get(id), bsMap)) });
  }
  parentPort.postMessage(out);
  process.exit(0);
}

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
// The bonus deck. A bonus floor's unlockAfter is an id or a list of ids, of
// campaign floors or other bonus floors; following the bonus floors back
// gives the campaign floors it needs (null for a cycle or an unknown id).
const bonusById = new Map(BONUS.map((l) => [l.id, l]));
// The special cards a bonus floor's reference solution may use: those
// available by its campaign floors.
const bonusSpecials = new Map();
const unlockIds = (level) => [].concat(level.unlockAfter ?? []);
const rootsOf = (level, seen = new Set()) => {
  if (seen.has(level.id)) return null;
  seen.add(level.id);
  const roots = [];
  for (const id of unlockIds(level)) {
    if (bonusById.has(id)) {
      const more = rootsOf(bonusById.get(id), new Set(seen));
      if (!more) return null;
      roots.push(...more);
    } else if (availableBy.has(id)) roots.push(id);
    else return null;
  }
  return roots;
};
BONUS.forEach((level, i) => {
  const where = `${level.id} (bonus):`;
  check(!ids.has(level.id), `${where} id is unique across the campaign and the bonus deck`); ids.add(level.id);
  check(level.chapter === undefined, `${where} has no chapter`);
  // A..K of each of BONUS_SUITS, then the bonus deck's own finale: the
  // special cards ? ?? $ $$ (the endgame floors).
  const nSuit = 13 * BONUS_SUITS.length;
  const want = i < nSuit ? RANKS[i % 13] + BONUS_SUITS[Math.floor(i / 13)] : FINALE_CARDS[i - nSuit] ?? null;
  check(level.card === want, `${where} card ${level.card} should be ${want} (at most ${nSuit + FINALE_CARDS.length} bonus floors)`);
  for (const id of unlockIds(level)) {
    if (bonusById.has(id)) check(BONUS.indexOf(bonusById.get(id)) < i, `${where} comes after ${id}, which opens it`);
  }
  const roots = rootsOf(level);
  check(unlockIds(level).length && roots?.length, `${where} unlockAfter ${unlockIds(level)} names campaign floors, or bonus floors whose chains end at campaign floors (no cycles)`);
  if (!roots?.length) return;
  // Everything the latest of those campaign floors has seen is available.
  const root = roots.reduce((a, b) => (availableBy.get(b).index > availableBy.get(a).index ? b : a));
  const after = availableBy.get(root);
  const lost = level.croupiers.filter((c) => !after.palette.includes(c));
  check(!lost.length, `${where} palette is available by ${root} (not yet: ${lost})`);
  const rules = level.warRules ?? ['high'];
  check(rules.every((r) => after.rules.includes(r)), `${where} War rules ${rules} are available by ${root}`);
  // Every bonus floor allows all four special cards (the game offers each
  // one only once the player has reached it in the campaign: the bonus deck
  // uses the player's current house deck); but a reference solution uses
  // only those available by its campaign floors, as a player there could.
  const specials = level.specialCards ?? [];
  check(SPECIALS.every((c) => specials.includes(c)), `${where} specialCards are all four special cards (${specials})`);
  bonusSpecials.set(level.id, after.specials);
  if (!after.specialsSeen) {
    const text = [level.title, level.brief, ...(level.story ?? [])].join(' ');
    check(!SPECIAL_WORDS.test(text), `${where} doesn't mention special cards before they're introduced`);
  }
});
// The floor: floors that left the campaign. Each keeps a playing card (any,
// repeats allowed: the floor can hold two A♥s) and is always open (the
// floors list shows only those the player has played), so it has no
// `unlockAfter`. Its palette, War rules and special cards are its own, as
// they were in the campaign.
FLOOR.forEach((level) => {
  const where = `${level.id} (floor):`;
  check(!ids.has(level.id), `${where} id is unique across the campaign, the bonus deck and the floor`); ids.add(level.id);
  check(level.chapter === undefined, `${where} has no chapter`);
  check(CARDS.has(level.card), `${where} card ${level.card} is a playing card`);
  check(level.unlockAfter === undefined, `${where} has no unlockAfter (always open)`);
});
// Difficulty: every floor rates 1 to 10, as the Diff column of its row in
// docs/campaign.md says. The bonus deck is in difficulty order, then par
// croupiers (ties in any order), except that a floor comes straight after
// the bonus floors it needs when they would otherwise come later.
const docDiffs = new Map();
{
  const lines = readFileSync(new URL('../docs/campaign.md', import.meta.url), 'utf8').split('\n');
  lines.forEach((line, i) => {
    if (!/^\| Card \| id \|/.test(line)) return;
    const d = line.split('|').map((x) => x.trim()).indexOf('Diff');
    for (let j = i + 2; lines[j]?.startsWith('|'); j++) {
      const c = lines[j].split('|').map((x) => x.trim());
      docDiffs.set(c[2], Number(c[d]));
    }
  });
}
for (const level of [...LEVELS, ...BONUS, ...FLOOR]) {
  check(Number.isInteger(level.difficulty) && level.difficulty >= 1 && level.difficulty <= 10, `${level.id}: difficulty is 1 to 10`);
  check(docDiffs.get(level.id) === level.difficulty, `${level.id}: difficulty ${level.difficulty} is the Diff in its docs/campaign.md row (${docDiffs.get(level.id)})`);
}
// (The suit cards and the bonus finale's special cards are each in that
// order on their own: the finale comes after the 52 suit cards whatever.)
for (const deck of [BONUS.slice(0, 13 * BONUS_SUITS.length), BONUS.slice(13 * BONUS_SUITS.length)]) {
  const sortKey = (l) => [l.difficulty ?? 0, l.par?.croupiers ?? 0, BONUS.indexOf(l)];
  const pending = [...deck].sort((a, b) => {
    const x = sortKey(a), y = sortKey(b);
    return x[0] - y[0] || x[1] - y[1] || x[2] - y[2];
  });
  const inDeck = new Set(deck.map((l) => l.id));
  const placed = new Set(), order = [];
  while (pending.length) {
    let i = pending.findIndex((l) => unlockIds(l).every((id) => !inDeck.has(id) || placed.has(id)));
    if (i < 0) i = 0; // a cycle (reported above)
    const [l] = pending.splice(i, 1);
    order.push(l.id);
    placed.add(l.id);
  }
  const at = order.findIndex((id, i) => id !== deck[i].id);
  check(at < 0, `bonus deck is in difficulty order: ${deck[at]?.id} (card ${deck[at]?.card}) should be ${order[at]} (difficulty, then par croupiers; after the bonus floors it needs)`);
}
for (const [ch, name] of Object.entries(CHAPTER_FILES)) {
  const have = perChapter.get(Number(ch)) ?? 0, full = CHAPTER_SUITS[ch] ? 13 : FINALE_CARDS.length;
  if (have < full) console.log(`(chapter ${ch}, ${name}: ${have} of ${full} floors so far)`);
}

// --- Per-level checks ---
const toCheck = [...LEVELS, ...BONUS, ...FLOOR].filter(selected);
const checked = toCheck.length;
assert(checked > 0, `no level matches ${arg}`);

if (checked <= 8) {
  for (const level of toCheck) {
    const { lines, fails } = await checkOneLevel(level, bonusSpecials);
    failures += fails;
    for (const l of lines) console.log(l);
  }
} else {
  const nWorkers = Math.min(4, availableParallelism(), checked);
  const shards = Array.from({ length: nWorkers }, () => []);
  toCheck.forEach((l, i) => shards[i % nWorkers].push(l.id));
  const bsObj = Object.fromEntries(bonusSpecials);
  const resultsById = new Map();
  await Promise.all(shards.map((shard) => new Promise((resolve, reject) => {
    const w = new Worker(new URL(import.meta.url), { workerData: { ids: shard, bonusSpecials: bsObj } });
    w.once('message', (list) => {
      for (const r of list) resultsById.set(r.id, r);
      resolve();
    });
    w.once('error', reject);
    w.once('exit', (code) => { if (code !== 0) reject(new Error(`levels worker exited with code ${code}`)); });
  })));
  for (const level of toCheck) {
    const { lines, fails } = resultsById.get(level.id);
    failures += fails;
    for (const l of lines) console.log(l);
  }
}

if (failures) {
  console.log(`\n${failures} level check(s) failed`);
  process.exit(1);
}
console.log(`\nlevels ok (${checked} of ${LEVELS.length} campaign, ${BONUS.length} bonus and ${FLOOR.length} floor levels checked)`);
