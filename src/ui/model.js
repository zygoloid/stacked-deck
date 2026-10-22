// Saves (localStorage) and turning the player's cells into an engine spec.
import { DIRS, RULES_VERSION, runTest } from '../engine.js';
import { LEVELS } from '../levels.js';
import { SPECIALS, isCard, isSpecial } from '../cards.js';

const KEY = 'stacked-deck-v1';

export function loadSave() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (s && typeof s === 'object' && s.levels && typeof s.levels === 'object') return s;
  } catch { /* unreadable or blocked storage */ }
  return { levels: {} };
}

export function writeSave(save) {
  try { localStorage.setItem(KEY, JSON.stringify(save)); } catch { /* storage full or blocked */ }
}

export const levelSave = (save, id) => (save.levels[id] ??= {});

export const unlockAll = () => /[?&]unlockall\b/.test(location.search);

// Up to this many unsolved floors are open at once, so a stuck player can
// skip ahead a little.
export const OPEN_UNSOLVED = 3;

// A floor is open if fewer than OPEN_UNSOLVED floors before it are unsolved
// (solved floors always stay open).
export function isUnlocked(save, index) {
  if (index <= 0 || unlockAll()) return true;
  if (save.levels[LEVELS[index].id]?.solved) return true;
  const unsolvedBefore = LEVELS.slice(0, index).filter((l) => !save.levels[l.id]?.solved).length;
  return unsolvedBefore < OPEN_UNSOLVED;
}

// War rules the player may pick on a level (levels.js: defaults to high only).
export const warRules = (level) => (Array.isArray(level.warRules) && level.warRules.length ? level.warRules : ['high']);

// Special cards a shoe may deal on a level (levels.js `specialCards`; none
// by default), in the order ? ?? $ $$.
export const specialCardsOf = (level) => SPECIALS.filter((c) => Array.isArray(level?.specialCards) && level.specialCards.includes(c));

// Special cards allowed on some open floor: the help explains only these, so
// they stay a surprise until the first such floor opens.
export function specialCardsUnlocked(save) {
  const seen = new Set();
  LEVELS.forEach((lv, i) => { if (isUnlocked(save, i)) specialCardsOf(lv).forEach((c) => seen.add(c)); });
  return SPECIALS.filter((c) => seen.has(c));
}

export const hexKey = ([q, r]) => `${q},${r}`;
export const addDir = ([q, r], d) => [q + DIRS[d][0], r + DIRS[d][1]];

// The player's cells, cleaned up: only cells on buildable hexes, one per hex.
export function sanitizeCells(level, cells) {
  const floor = new Set(level.floor.map(hexKey));
  for (const f of level.fixed) floor.delete(hexKey(f.at));
  const seen = new Set();
  const out = [];
  for (const c of Array.isArray(cells) ? cells : []) {
    if (!c || !Array.isArray(c.at) || !floor.has(hexKey(c.at)) || seen.has(hexKey(c.at))) continue;
    if (c.kind === 'croupier' && !level.croupiers.includes(c.fn)) continue;
    if (c.kind === 'shoe' && !level.croupiers.includes('shoe')) continue;
    if (c.kind !== 'croupier' && c.kind !== 'shoe') continue;
    seen.add(hexKey(c.at));
    const cell = structuredClone(c);
    if (cell.kind === 'shoe') {
      // Only real cards, and special cards only where the level allows them.
      const allowed = specialCardsOf(level);
      cell.deck = (Array.isArray(cell.deck) ? cell.deck : []).filter((x) => isCard(x) && (!isSpecial(x) || allowed.includes(x)));
      if (!cell.deck.length) cell.deck = ['AS'];
    }
    if (cell.fn === 'hand' && !(Number.isInteger(cell.n) && cell.n >= 1 && cell.n <= 13)) cell.n = 5;
    if (cell.kind === 'croupier') cell.out ??= {};
    if (cell.fn === 'deal') cell.out.to ??= [];
    if (cell.fn === 'war' && !warRules(level).includes(cell.rule)) cell.rule = warRules(level)[0];
    out.push(cell);
  }
  return out;
}

// Engine spec for the level plus the player's cells. A few states the
// editor allows would crash or misbehave in the engine, so they are mapped to
// equivalent machines:
//  * a deal with no sides drops everything: run it as a pass with no output;
//  * a shoe with no side deals onto the floor: point it at a side with no
//    table (or at a source/shoe, which also drops).
export function toSpec(level, cells) {
  const all = [...level.fixed.map((c) => structuredClone(c)), ...cells.map((c) => structuredClone(c))];
  const at = new Map(all.map((c) => [hexKey(c.at), c]));
  for (const c of all) {
    if (c.kind === 'croupier' && c.fn === 'deal' && !(c.out?.to?.length)) {
      c.fn = 'pass';
      c.out = {};
    }
    if (c.kind === 'shoe' && c.out === undefined) {
      let side = [0, 1, 2, 3, 4, 5].find((d) => !at.has(hexKey(addDir(c.at, d))));
      side ??= [0, 1, 2, 3, 4, 5].find((d) => ['source', 'shoe'].includes(at.get(hexKey(addDir(c.at, d))).kind));
      c.out = side ?? 0;
    }
  }
  return { cells: all };
}

export const countCroupiers = (cells) => cells.filter((c) => c.kind === 'croupier' || c.kind === 'shoe').length;

// ---------- saved solutions ----------
// levels[id].solutions: [{ cells, croupiers, rounds, at }], one per distinct
// machine that cleared the floor. `best` is the smallest croupiers and the
// smallest rounds over all of them (each minimised on its own); `solved`
// stays true once set.

// Each solution also records `rules` (the RULES_VERSION it was scored under)
// and `broken` (it no longer clears the floor under the current rules).
// rescoreStale() re-runs solutions scored under older rules.

// Default values that are the same as leaving the field out.
const DEFAULTS = { facing: 0, once: false, rule: 'high' };

function canonValue(v, key) {
  if (v === undefined || v === null) return undefined;
  if (key in DEFAULTS && v === DEFAULTS[key]) return undefined;
  if (Array.isArray(v)) {
    const a = v.map((x) => canonValue(x, '')).filter((x) => x !== undefined);
    return a.length ? a : undefined;
  }
  if (typeof v === 'object') {
    const o = {};
    for (const k of Object.keys(v).sort()) {
      const x = canonValue(v[k], k);
      if (x !== undefined) o[k] = x;
    }
    return Object.keys(o).length ? o : undefined;
  }
  return v;
}

// A string that is equal for two machines exactly when they are the same
// machine up to cosmetics (field order, cell order, empty or default fields).
// The same machine placed elsewhere on the floor is a different solution.
export function canonicalCells(cells) {
  const list = (Array.isArray(cells) ? cells : [])
    .map((c) => canonValue(c, '') ?? {})
    .sort((a, b) => (a.at?.[0] ?? 0) - (b.at?.[0] ?? 0) || (a.at?.[1] ?? 0) - (b.at?.[1] ?? 0));
  return JSON.stringify(list);
}

// The level's saved solutions (an old save without any starts with an empty
// list; the best it recorded is kept as `legacyBest` so best never gets worse).
export function solutionsOf(ls) {
  if (!Array.isArray(ls.solutions)) {
    ls.solutions = [];
    if (ls.best && ls.legacyBest === undefined) ls.legacyBest = { ...ls.best };
  }
  return ls.solutions;
}

export function recomputeBest(ls) {
  const all = [...solutionsOf(ls).filter((s) => !s.broken), ...(ls.legacyBest ? [ls.legacyBest] : [])];
  if (!all.length) { delete ls.best; return; }
  ls.best = {
    croupiers: Math.min(...all.map((s) => s.croupiers)),
    rounds: Math.min(...all.map((s) => s.rounds)),
  };
}

// Index of the saved solution that is the same machine as `cells`, or -1.
export function findSolution(ls, cells) {
  const key = canonicalCells(cells);
  return solutionsOf(ls).findIndex((s) => canonicalCells(s.cells) === key);
}

// Record a machine that cleared the floor. Returns { index, isNew }.
export function recordSolution(ls, cells, { croupiers, rounds }) {
  const list = solutionsOf(ls);
  let index = findSolution(ls, cells);
  const isNew = index < 0;
  if (isNew) {
    list.push({ cells: structuredClone(cells), croupiers, rounds, at: Date.now(), rules: RULES_VERSION });
    index = list.length - 1;
  } else {
    // Re-clearing a saved machine refreshes its score (the rules may have changed).
    Object.assign(list[index], { croupiers, rounds, rules: RULES_VERSION, broken: false });
  }
  ls.solved = true;
  recomputeBest(ls);
  return { index, isNew };
}

export function deleteSolution(ls, index) {
  solutionsOf(ls).splice(index, 1);
  recomputeBest(ls); // `solved` stays true
}

// Run a machine against every test of a level.
export function scoreMachine(level, cells) {
  const spec = toSpec(level, cells);
  const results = level.tests.map((t) => runTest(spec, t, level.pays));
  return {
    ok: results.every((r) => r.ok),
    croupiers: countCroupiers(cells),
    rounds: Math.round(results.reduce((a, r) => a + r.rounds, 0) / results.length),
  };
}

// Re-score saved solutions that were scored under older rules, a few at a
// time so the page stays responsive. Old-format bests (legacyBest) can't be
// re-run, so they are dropped once a level is re-scored. Calls onChange()
// after anything changed.
export async function rescoreStale(save, levels, onChange) {
  let changed = false;
  for (const level of levels) {
    const ls = save.levels?.[level.id];
    if (!ls || !Array.isArray(ls.solutions)) continue;
    const stale = ls.solutions.filter((s) => s.rules !== RULES_VERSION);
    if (!stale.length) continue;
    for (const sol of stale) {
      await new Promise((r) => setTimeout(r, 0));
      let res;
      try { res = scoreMachine(level, sol.cells); } catch { res = { ok: false }; }
      if (res.ok) Object.assign(sol, { croupiers: res.croupiers, rounds: res.rounds, broken: false });
      else sol.broken = true;
      sol.rules = RULES_VERSION;
    }
    delete ls.legacyBest;
    recomputeBest(ls);
    changed = true;
  }
  if (changed) onChange?.();
}
