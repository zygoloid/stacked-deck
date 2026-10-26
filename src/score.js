// Turning a player's machine into an engine spec, scoring it, and telling
// machines apart. Shared by the game UI and anything that checks solutions
// outside the browser, so it uses no DOM, localStorage or location.
import { DIRS, runTest } from './engine.js';
import { SPECIALS, isCard, isSpecial, sfc32, randomDeals } from './cards.js';

export const hexKey = ([q, r]) => `${q},${r}`;
export const addDir = ([q, r], d) => [q + DIRS[d][0], r + DIRS[d][1]];

// War rules the player may pick on a level (levels.js: defaults to high only).
export const warRules = (level) => (Array.isArray(level.warRules) && level.warRules.length ? level.warRules : ['high']);

// Special cards a shoe may deal on a level (levels.js `specialCards`; none
// by default), in the order ? ?? $ $$.
export const specialCardsOf = (level) => SPECIALS.filter((c) => Array.isArray(level?.specialCards) && level.specialCards.includes(c));

// The hexes of a level the player may build on.
function buildable(level) {
  const floor = new Set(level.floor.map(hexKey));
  for (const f of level.fixed) floor.delete(hexKey(f.at));
  return floor;
}

// The player's cells, cleaned up: only cells on buildable hexes, one per hex.
export function sanitizeCells(level, cells) {
  const floor = buildable(level);
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

// ---------- strict validation ----------
// sanitizeCells cleans up the editor's own saves. validateCells instead
// rejects anything the editor can't produce, for machines from elsewhere.

// Output ports of each function (as src/ui/croupiers.js; deal has `to`).
export const PORTS = {
  pass: ['out'], duplicate: ['a', 'b'], sort: ['out'], cut: ['top', 'bottom'],
  outshuffle: ['out'], inshuffle: ['out'], straight: ['yes', 'no'], flush: ['yes', 'no'],
  kind: ['yes', 'no'], set: ['set', 'rest'], suits: ['S', 'H', 'D', 'C', 'misc'],
  burn: ['burn', 'rest'], hand: ['out'], deal: ['to'], gather: ['out'],
  war: ['win', 'lose', 'dwin', 'dlose'],
};
// Parameters of each function besides `out` and `facing`, with their ranges
// (as the editor offers them).
const isSide = (v) => Number.isInteger(v) && v >= 0 && v < 6;
const inRange = (lo, hi) => (v) => Number.isInteger(v) && v >= lo && v <= hi;
const PARAMS = {
  kind: { n: inRange(2, 8) },
  hand: { n: inRange(1, 13) },
  gather: { under: isSide },
  war: { dealer: isSide, rule: (v, level) => warRules(level).includes(v) },
};
export const MAX_DECK = 1000;      // cards in one shoe
export const MAX_DEAL_SIDES = 60;  // entries in a deal's `to` list

const isPlain = (v) => v !== null && typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype;

// Check one cell; returns an error message or null.
function cellError(level, c) {
  if (!isPlain(c)) return 'not an object';
  const extra = (allowed) => Object.keys(c).find((k) => !allowed.includes(k));
  if (c.kind === 'shoe') {
    if (!level.croupiers.includes('shoe')) return 'no shoes on this floor';
    const k = extra(['at', 'kind', 'out', 'deck', 'once']);
    if (k !== undefined) return `unknown field ${k}`;
    if (c.out !== undefined && !isSide(c.out)) return 'bad side';
    if (c.once !== undefined && typeof c.once !== 'boolean') return 'bad once';
    const allowed = specialCardsOf(level);
    if (!Array.isArray(c.deck) || !c.deck.length || c.deck.length > MAX_DECK) return 'bad deck';
    if (!c.deck.every((x) => typeof x === 'string' && isCard(x) && (!isSpecial(x) || allowed.includes(x)))) return 'bad card';
    return null;
  }
  if (c.kind !== 'croupier') return 'unknown kind';
  if (typeof c.fn !== 'string' || !Object.hasOwn(PORTS, c.fn) || !level.croupiers.includes(c.fn)) return 'function not on this floor';
  const params = PARAMS[c.fn] ?? {};
  const k = extra(['at', 'kind', 'fn', 'out', 'facing', ...Object.keys(params)]);
  if (k !== undefined) return `unknown field ${k}`;
  if (c.facing !== undefined && !isSide(c.facing)) return 'bad facing';
  for (const [name, ok] of Object.entries(params)) {
    if (c[name] !== undefined && !ok(c[name], level)) return `bad ${name}`;
  }
  if (c.fn === 'war' && c.rule === undefined && !warRules(level).includes('high')) return 'bad rule';
  if (c.out === undefined) return null;
  if (!isPlain(c.out)) return 'bad out';
  const p = Object.keys(c.out).find((x) => !PORTS[c.fn].includes(x));
  if (p !== undefined) return `unknown port ${p}`;
  if (c.fn === 'deal') {
    const to = c.out.to;
    if (to !== undefined && !(Array.isArray(to) && to.length <= MAX_DEAL_SIDES && to.every(isSide))) return 'bad deal sides';
  } else if (!Object.values(c.out).every(isSide)) return 'bad side';
  return null;
}

// A machine from outside the editor (a cloud save or a submitted solution):
// { cells } (a copy) if the editor could have built it on this level, else
// { error }.
export function validateCells(level, cells) {
  if (!Array.isArray(cells)) return { error: 'not a list of cells' };
  const floor = buildable(level);
  const seen = new Set();
  for (const [i, c] of cells.entries()) {
    const err = cellError(level, c);
    if (err) return { error: `cell ${i}: ${err}` };
    if (!Array.isArray(c.at) || c.at.length !== 2 || !c.at.every(Number.isInteger)) return { error: `cell ${i}: bad position` };
    const key = hexKey(c.at);
    if (!floor.has(key)) return { error: `cell ${i}: not on the buildable floor` };
    if (seen.has(key)) return { error: `cell ${i}: two cells on one hex` };
    seen.add(key);
  }
  return { cells: structuredClone(cells) };
}

// ---------- running and scoring ----------

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

// ---------- check deals ----------
// Besides a floor's published tests, a machine must pass CHECK_DEALS more
// random deals, dealt like the floor's own random tests (`tests.deal`, from
// makeTests) but seeded from the machine itself: from the SHA-256 of the
// floor id and the machine's canonical form. The game and the server deal
// the same check deals for the same machine, so a machine that clears a floor
// locally clears it everywhere; but changing a machine changes its check
// deals, so no machine can be built around them (hard-coding the payouts, or
// fitting just the published tests). Scores come from the published tests.
export const CHECK_DEALS = 8;

export async function checkDeals(level, cells) {
  const deal = level.tests?.deal;
  if (!deal) return [];
  const text = `stacked-deck check deals\n${level.id}\n${canonicalCells(cells)}`;
  const d = new DataView(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
  const rand = sfc32(d.getUint32(0), d.getUint32(4), d.getUint32(8), d.getUint32(12));
  return randomDeals(rand, CHECK_DEALS, deal.handsPerTest, deal.handSize);
}

// Run a machine against every test of a level, then (if they all pass) its
// check deals. `ok` needs both; the score comes from the tests alone.
export async function scoreMachine(level, cells) {
  const spec = toSpec(level, cells);
  const results = level.tests.map((t) => runTest(spec, t, level));
  let ok = results.every((r) => r.ok);
  if (ok) ok = (await checkDeals(level, cells)).every((t) => runTest(spec, t, level).ok);
  return {
    ok,
    croupiers: countCroupiers(cells),
    rounds: Math.round(results.reduce((a, r) => a + r.rounds, 0) / results.length),
  };
}

// Points (anything with croupiers and rounds) not beaten on both axes by
// another one, by index. Points marked `broken` (solutions that no longer
// clear the floor after a rules change) are left out.
export function frontierOf(points) {
  const out = new Set();
  points.forEach((a, i) => {
    if (a.broken) return;
    const beaten = points.some((b) => !b.broken && b.croupiers <= a.croupiers && b.rounds <= a.rounds &&
      (b.croupiers < a.croupiers || b.rounds < a.rounds));
    if (!beaten) out.add(i);
  });
  return out;
}

// ---------- telling machines apart ----------

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

// The first 32 hex digits of the SHA-256 of the machine's canonical form: the
// same for the same machine everywhere (browser and Node).
export async function solutionHash(cells) {
  const bytes = new TextEncoder().encode(canonicalCells(cells));
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return [...digest.slice(0, 16)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
