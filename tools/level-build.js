// Build a level's reference solution with the router in src/layout.js.
//
//   buildLevel(id, nodes, links) -> { cells }   (only the player's own cells)
//
// The level's fixed cells are added as nodes named src, src2, ... and desk,
// desk2, ..., and any shoes and croupiers bolted to the floor as fix, fix2,
// ...; don't link from a source or a bolted cell (their sides are fixed by
// the level): place the next croupier on the hex they hand cards to. Links
// into a bolted croupier are fine. Hexes that
// are not on the level's floor are walls the router won't route through.
import { build } from '../src/layout.js';
import { LEVELS, BONUS, hexRange } from '../src/levels.js';

const key = ([q, r]) => `${q},${r}`;

export function buildLevel(id, nodes, links, { walls = true } = {}) {
  const level = [...LEVELS, ...BONUS].find((l) => l.id === id);
  if (!level) throw new Error(`no level ${id}`);
  const all = { ...nodes };
  let s = 0, d = 0, f = 0;
  for (const c of level.fixed) {
    const name = c.kind === 'source' ? (s++ ? `src${s}` : 'src')
      : c.kind === 'payout' ? (d++ ? `desk${d}` : 'desk') : (f++ ? `fix${f}` : 'fix');
    all[name] = structuredClone(c);
  }
  const bolted = new Set(level.fixed.map((c) => key(c.at)));
  for (const [from] of links) {
    if (all[from] && bolted.has(key(all[from].at)) && all[from].kind !== 'source') throw new Error(`link from fixed cell ${from}`);
  }
  const floor = new Set(level.floor.map(key));
  const taken = new Set(Object.values(all).map((n) => key(n.at)));
  // Walls: every non-floor hex near the floor.
  const qs = level.floor.map((h) => h[0]), rs = level.floor.map((h) => h[1]);
  const cq = Math.round((Math.min(...qs) + Math.max(...qs)) / 2);
  const cr = Math.round((Math.min(...rs) + Math.max(...rs)) / 2);
  let w = 0;
  for (const h of hexRange(Math.max(...qs) - Math.min(...qs) + Math.max(...rs) - Math.min(...rs) + 6, [cq, cr])) {
    if (walls && !floor.has(key(h)) && !taken.has(key(h))) all[`wall${w++}`] = { at: h, kind: 'wall' };
  }
  const { cells } = build({ nodes: all, links });
  return { cells: cells.filter((c) => (c.kind === 'shoe' || c.kind === 'croupier') && !bolted.has(key(c.at))) };
}
