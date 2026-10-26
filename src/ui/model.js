// Saves (localStorage), unlocking and the saved-solutions list. Turning cells
// into an engine spec and scoring them lives in ../score.js (re-exported here).
import { RULES_VERSION } from '../engine.js';
import { CAMPAIGN as LEVELS, BONUS, ALL_LEVELS, campaignIndex } from './catalog.js';
import { SPECIALS } from '../cards.js';
import { specialCardsOf, canonicalCells, scoreMachine } from '../score.js';

export {
  hexKey, addDir, warRules, specialCardsOf, sanitizeCells, toSpec, countCroupiers, canonicalCells, scoreMachine,
} from '../score.js';

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

// A bonus floor opens once its `unlockAfter` campaign floor is solved (one
// without unlockAfter is open from the start); it never counts towards the
// campaign's OPEN_UNSOLVED window. Solved floors always stay open.
export function isBonusOpen(save, level) {
  if (unlockAll() || save.levels[level.id]?.solved) return true;
  return !level.unlockAfter || !!save.levels[level.unlockAfter]?.solved;
}

// Whether any floor (campaign or bonus) is open.
export function isOpen(save, level) {
  const i = campaignIndex(level);
  if (i >= 0) return isUnlocked(save, i);
  return BONUS.includes(level) && isBonusOpen(save, level);
}

// Special cards allowed on some open floor: the help explains only these, so
// they stay a surprise until the first such floor opens.
export function specialCardsUnlocked(save) {
  const seen = new Set();
  ALL_LEVELS.forEach((lv) => { if (isOpen(save, lv)) specialCardsOf(lv).forEach((c) => seen.add(c)); });
  return SPECIALS.filter((c) => seen.has(c));
}

// ---------- saved solutions ----------
// levels[id].solutions: [{ cells, croupiers, rounds, at }], one per distinct
// machine that cleared the floor. `best` is the smallest croupiers and the
// smallest rounds over all of them (each minimised on its own); `solved`
// stays true once set.

// Each solution also records `rules` (the RULES_VERSION it was scored under)
// and `broken` (it no longer clears the floor under the current rules).
// rescoreStale() re-runs solutions scored under older rules.

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
