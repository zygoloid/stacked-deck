// Helper for writing bigger machines: place the interesting croupiers by hand,
// list the connections, and let a breadth-first search lay pass chains for
// connections between tables that aren't neighbours.
//
//   build({ nodes: { name: { at, ...cell } }, links: [[from, ports, to, role]] })
//
// `ports` is a port name, a list of port names that share one route, or null
// for a shoe or source. `role` sets the side the cards arrive on: 'dealer' for
// War sets the War's dealer side, 'under' for Gather sets its under side.
// Routes are laid in order, so a dealer link must come before player links
// into the same War.

import { DIRS } from './engine.js';

const key = ([q, r]) => `${q},${r}`;
const add = ([q, r], d) => [q + DIRS[d][0], r + DIRS[d][1]];
const dirTo = (a, b) => DIRS.findIndex(([dq, dr]) => a[0] + dq === b[0] && a[1] + dr === b[1]);

export function build({ puzzle, rules, nodes, links }) {
  const cells = Object.entries(nodes).map(([name, n]) => ({ ...n, name, out: n.out ?? {} }));
  const byName = Object.fromEntries(cells.map((c) => [c.name, c]));
  const used = new Set(cells.map((c) => key(c.at)));
  const outUsed = new Map(cells.map((c) => [c.name, new Set()]));
  // Keep routes within a margin around the hand-placed tables.
  const qs = cells.map((c) => c.at[0]), rs = cells.map((c) => c.at[1]);
  const inBounds = ([q, r]) => q >= Math.min(...qs) - 3 && q <= Math.max(...qs) + 3 &&
    r >= Math.min(...rs) - 3 && r <= Math.max(...rs) + 3;

  for (const [fromName, ports, toName, role] of links) {
    const from = byName[fromName], to = byName[toName];
    if (!from || !to) throw new Error(`bad link ${fromName} -> ${toName}`);
    const okSide = (side) => {
      if (role === 'dealer') return to.dealer === undefined || to.dealer === side;
      if (role === 'under') return to.under === undefined || to.under === side;
      if (to.fn === 'war' && to.dealer === side) return false;
      if (to.fn === 'gather' && to.under === side) return false;
      return true;
    };
    // BFS from `from` through free cells to a cell (or `from` itself) next to `to`.
    const start = { at: from.at, prev: null };
    const seen = new Set([key(from.at)]);
    let queue = [start], goal = null;
    while (queue.length && !goal) {
      const next = [];
      for (const node of queue) {
        for (let d = 0; d < 6 && !goal; d++) {
          const at = add(node.at, d);
          if (node === start && outUsed.get(fromName).has(d) && key(at) !== key(to.at)) continue;
          if (key(at) === key(to.at)) {
            const side = (d + 3) % 6;
            if (okSide(side)) goal = { node, d, side };
            continue;
          }
          if (used.has(key(at)) || seen.has(key(at)) || !inBounds(at)) continue;
          seen.add(key(at));
          next.push({ at, prev: node, d });
        }
      }
      queue = next;
    }
    if (!goal) throw new Error(`no route ${fromName} -> ${toName}`);
    // Walk back to lay passes.
    const path = [];
    for (let n = goal.node; n !== start; n = n.prev) path.unshift(n);
    const firstDir = path.length ? path[0].d : goal.d;
    path.forEach((n, i) => {
      const out = i + 1 < path.length ? path[i + 1].d : goal.d;
      cells.push({ at: n.at, kind: 'croupier', fn: 'pass', out: { out } });
      used.add(key(n.at));
    });
    outUsed.get(fromName).add(firstDir);
    if (role === 'dealer') to.dealer = goal.side;
    if (role === 'under') to.under = goal.side;
    if (from.kind === 'shoe' || from.kind === 'source') from.out = firstDir;
    else for (const p of [].concat(ports)) {
      if (from.fn === 'deal') (from.out.to ??= [])[p] = firstDir;
      else from.out[p] = firstDir;
    }
  }
  return { puzzle, rules, cells: cells.map(({ name, ...c }) => c) };
}

export { dirTo };
