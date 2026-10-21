// Saves (localStorage) and turning the player's cells into an engine spec.
import { DIRS } from '../engine.js';
import { LEVELS } from '../levels.js';

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

export function isUnlocked(save, index) {
  if (index <= 0 || unlockAll()) return true;
  return !!save.levels[LEVELS[index - 1].id]?.solved;
}

// War rules the player may pick on a level (levels.js: defaults to high only).
export const warRules = (level) => (Array.isArray(level.warRules) && level.warRules.length ? level.warRules : ['high']);

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
    if (cell.kind === 'shoe' && !(Array.isArray(cell.deck) && cell.deck.length)) cell.deck = ['AS'];
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
