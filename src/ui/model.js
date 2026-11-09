// Saves (localStorage), unlocking and the saved-solutions list. Turning cells
// into an engine spec and scoring them lives in ../score.js (re-exported here).
import { RULES_VERSION } from '../engine.js';
import { CAMPAIGN as LEVELS, BONUS, ALL_LEVELS, campaignIndex } from './catalog.js';
import { SPECIALS } from '../cards.js';
import { specialCardsOf, canonicalCells, scoreMachine } from '../score.js';
import { CHANNEL } from '../build.js';

export {
  hexKey, addDir, warRules, specialCardsOf, sanitizeCells, toSpec, countCroupiers, canonicalCells, scoreMachine,
} from '../score.js';

// The beta keeps its own save: every github.io project page shares one
// origin, so the beta at /beta/ would otherwise share the live game's.
export const KEY = CHANNEL === 'beta' ? 'stacked-deck-beta-v1' : 'stacked-deck-v1';

// The stored save as this tab last read or wrote it. Another tab of the game
// writes the same key: when the stored save differs from this, that tab's
// changes are merged into this tab's copy (mergeSave below) before anything
// is written, so neither tab's progress overwrites the other's.
let lastRaw = null;
// Why the save can't be kept in this browser just now: null, 'blocked'
// (storage turned off, as in some private windows) or 'full'.
let problem = null;
export const saveProblem = () => problem;

const problemOf = (e) => (e?.name === 'QuotaExceededError' || e?.name === 'NS_ERROR_DOM_QUOTA_REACHED' || e?.code === 22 || e?.code === 1014
  ? 'full' : 'blocked');
const isSave = (s) => !!s && typeof s === 'object' && !!s.levels && typeof s.levels === 'object' && !Array.isArray(s.levels);
const parseSave = (raw) => {
  try {
    const s = JSON.parse(raw ?? 'null');
    return isSave(s) ? s : null;
  } catch { return null; }
};

export function loadSave() {
  let raw;
  try { raw = localStorage.getItem(KEY); } catch (e) { problem = problemOf(e); return { levels: {} }; }
  lastRaw = raw;
  const s = parseSave(raw);
  if (s) return s;
  // Unreadable: keep a copy before it is overwritten.
  if (raw) try { localStorage.setItem(`${KEY}-unreadable`, raw); } catch { /* storage full */ }
  return { levels: {} };
}

// Merge in what another tab stored since this tab last read or wrote the
// save (`raw`, the stored save now). Returns the ids of the floors that
// changed here, or null if `raw` isn't a save.
function catchUp(save, raw) {
  const theirs = parseSave(raw);
  if (!theirs) return null;
  const changed = mergeSave(parseSave(lastRaw) ?? { levels: {} }, theirs, save);
  lastRaw = raw;
  return changed;
}

// Returns saveProblem(): null if the save was written.
export function writeSave(save) {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw !== lastRaw) catchUp(save, raw);
    const out = JSON.stringify(save);
    localStorage.setItem(KEY, out);
    lastRaw = out;
    problem = null;
  } catch (e) { problem = problemOf(e); }
  return problem;
}

// Keep `save` up to date with the game's other tabs: onChange(ids) after
// another tab's changes to those floors were merged into it. Nothing is
// written here (this tab's next write includes them), so two tabs can never
// keep answering each other.
export function watchSave(save, onChange) {
  window.addEventListener('storage', (e) => {
    if (e.key !== KEY && e.key !== null) return;
    let raw;
    try { raw = localStorage.getItem(KEY); } catch { return; }
    // Unchanged (an event this tab already caught up with when writing), or
    // removed (this tab's next write puts its copy back).
    if (raw === lastRaw || raw === null) return;
    const changed = catchUp(save, raw);
    if (changed?.length) onChange(changed);
  });
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

// A bonus floor opens once its `unlockAfter` floors (campaign or bonus: one
// id or a list of them) are all solved (one without unlockAfter is open from
// the start); it never counts towards the campaign's OPEN_UNSOLVED window.
// Solved floors always stay open.
export const unlockIds = (level) => [].concat(level.unlockAfter ?? []);
export function isBonusOpen(save, level) {
  if (unlockAll() || save.levels[level.id]?.solved) return true;
  return unlockIds(level).every((id) => !!save.levels[id]?.solved);
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
      try { res = await scoreMachine(level, sol.cells); } catch { res = { ok: false }; }
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

// ---------- merging saves ----------
// mergeSave(base, theirs, mine) changes `mine` (in place, so the editor's
// references to a floor's save and its solutions stay good) to hold the
// changes `theirs` made since `base` as well as its own. Where both changed
// the same thing, `mine` wins: it is this tab's (or, loading a save file,
// this browser's). Nothing is lost that either has: `solved` stays set once
// either set it, solutions are matched by machine (canonicalCells), and a
// solution goes only if `theirs` deleted it. Returns the ids of the floors
// that changed in `mine`.
//
// For another tab, `base` is the save as this tab last read or wrote it; for
// a save file it is empty, which keeps everything either has.

// JSON with keys sorted, so equal values give equal strings.
const stable = (v) => JSON.stringify(v, (k, x) => (x && typeof x === 'object' && !Array.isArray(x)
  ? Object.fromEntries(Object.keys(x).sort().map((key) => [key, x[key]])) : x));
const same = (a, b) => stable(a) === stable(b);
// Whether to take `theirs`: it changed, and `mine` didn't.
const theirsWins = (base, theirs, mine) => !same(theirs, base) && same(mine, base);
const setKey = (o, k, v) => { if (v === undefined) delete o[k]; else o[k] = v; };
const keysOf = (...os) => [...new Set(os.flatMap((o) => Object.keys(o ?? {})))];
// The working machine and its cloud save times change together.
const WORK = ['cells', 'workAt', 'workSynced'];
const MERGED = new Set([...WORK, 'solved', 'solutions', 'deleted', 'best']);

export function mergeSave(base, theirs, mine) {
  for (const k of keysOf(base, theirs, mine)) {
    if (k !== 'levels' && theirsWins(base[k], theirs[k], mine[k])) setKey(mine, k, theirs[k]);
  }
  const bl = base.levels ?? {}, tl = theirs.levels ?? {};
  const changed = [];
  for (const id of keysOf(bl, tl, mine.levels)) {
    const b = bl[id], t = tl[id], m = mine.levels[id];
    if (same(t, b)) continue;
    if (!m) {
      if (t) { mine.levels[id] = t; changed.push(id); }
    } else if (!t) {
      // Gone there (progress cleared): here too, unless changed here since.
      if (same(m, b)) { delete mine.levels[id]; changed.push(id); }
    } else {
      const before = stable(m);
      mergeLevel(b ?? {}, t, m);
      if (stable(m) !== before) changed.push(id);
    }
  }
  return changed;
}

function mergeLevel(b, t, m) {
  for (const k of keysOf(b, t, m)) {
    if (!MERGED.has(k) && theirsWins(b[k], t[k], m[k])) setKey(m, k, t[k]);
  }
  const work = (o) => WORK.map((k) => o[k]);
  if (theirsWins(work(b), work(t), work(m))) WORK.forEach((k) => setKey(m, k, t[k]));
  if (t.solved || m.solved) m.solved = true;
  if (b.deleted || t.deleted || m.deleted) {
    const bd = new Set(b.deleted ?? []), td = new Set(t.deleted ?? []);
    const out = new Set([...(m.deleted ?? []).filter((h) => td.has(h) || !bd.has(h)), ...[...td].filter((h) => !bd.has(h))]);
    setKey(m, 'deleted', out.size || m.deleted ? [...out].sort() : undefined);
  }
  if (!Array.isArray(t.solutions) && !Array.isArray(m.solutions)) {
    if (theirsWins(b.best, t.best, m.best)) setKey(m, 'best', t.best);
    return;
  }
  const key = (s) => canonicalCells(s?.cells);
  const bs = new Map((Array.isArray(b.solutions) ? b.solutions : []).map((s) => [key(s), s]));
  const ts = new Map((Array.isArray(t.solutions) ? t.solutions : []).map((s) => [key(s), s]));
  const list = solutionsOf(m);
  const here = new Set();
  for (let i = list.length - 1; i >= 0; i--) {
    const s = list[i], k = key(s);
    here.add(k);
    // Deleted there.
    if (bs.has(k) && !ts.has(k)) { list.splice(i, 1); continue; }
    // Rescored or uploaded there.
    if (bs.has(k) && theirsWins(bs.get(k), ts.get(k), s)) {
      const src = ts.get(k);
      for (const f of Object.keys(s)) if (!(f in src)) delete s[f];
      Object.assign(s, src);
    }
  }
  // Found there (and not deleted here).
  for (const [k, s] of ts) if (!here.has(k) && !bs.has(k)) list.push(s);
  recomputeBest(m);
}
