// The croupier table: what every function does, its ports and parameters.
// The help panel, the palette and the inspector are generated from this.
// The descriptions are deliberately brief (true, but leaving the details
// for the player to find out); docs/architecture.md has the full rules.

// Port styles: one colour and label per port name, used everywhere.
export const PORT_STYLE = {
  out: { label: 'out', short: 'out', color: '#f2c14e' },
  yes: { label: 'yes', short: 'yes', color: '#5fd38d' },
  no: { label: 'no', short: 'no', color: '#ff6b6b' },
  a: { label: 'A', short: 'A', color: '#6fb7ff' },
  b: { label: 'B', short: 'B', color: '#c792ea' },
  top: { label: 'top', short: 'top', color: '#6fb7ff' },
  bottom: { label: 'bot', short: 'bot', color: '#c792ea' },
  set: { label: 'set', short: 'set', color: '#5fd38d' },
  rest: { label: 'rest', short: 'rest', color: '#ff6b6b' },
  burn: { label: 'burn', short: 'burn', color: '#6fb7ff' },
  win: { label: 'win', short: 'win', color: '#5fd38d' },
  lose: { label: 'lose', short: 'lose', color: '#ff6b6b' },
  dwin: { label: 'd-win', short: 'dW', color: '#4fc3f7' },
  dlose: { label: 'd-lose', short: 'dL', color: '#ffa45c' },
  S: { label: '♠', short: '♠', color: '#e6e9f2' },
  H: { label: '♥', short: '♥', color: '#ff7a93' },
  D: { label: '♦', short: '♦', color: '#ffa45c' },
  C: { label: '♣', short: '♣', color: '#7ee0c3' },
  misc: { label: 'misc', short: 'misc', color: '#b8b8b8' },
  to: { label: 'deal', short: 'deal', color: '#f2c14e' },
  // input markers (param sides, not outputs)
  dealer: { label: 'dealer', short: 'D', color: '#f48fb1', input: true },
  under: { label: 'under', short: 'U', color: '#80deea', input: true },
};

// Chip colours by family.
const ROUTE = '#3d5a80', SHAPE = '#6d4c8f', TEST = '#22709a', WAR = '#9b2c3a', SHOE = '#8a6420';

// kind: 'croupier' entries have fn = key. ports: output ports in display
// order. sides: param sides edited like ports (input markers). required:
// ports that always point somewhere (without them the croupier does nothing
// useful): a new croupier gets a side for them, and they have no floor option.
export const CROUPIERS = {
  pass: {
    name: 'Pass', abbr: 'PASS', family: ROUTE, ports: ['out'], required: ['out'],
    desc: 'Passes the hand on.',
  },
  duplicate: {
    name: 'Duplicate', abbr: 'DUP', family: ROUTE, ports: ['a', 'b'],
    desc: 'Copies the hand: one copy to A, one to B.',
  },
  sort: {
    name: 'Sort', abbr: 'SORT', family: SHAPE, ports: ['out'], required: ['out'],
    desc: 'Puts the hand in new deck order: ♠A–K, ♦A–K, ♣K–A, ♥K–A.',
  },
  cut: {
    name: 'Cut', abbr: 'CUT', family: SHAPE, ports: ['top', 'bottom'],
    desc: 'Cuts the hand: the top half to top, the rest to bottom.',
  },
  outshuffle: {
    name: 'Out-shuffle', abbr: 'OUT', family: SHAPE, ports: ['out'], required: ['out'],
    desc: 'A perfect riffle shuffle that keeps the top card on top.',
  },
  inshuffle: {
    name: 'In-shuffle', abbr: 'IN', family: SHAPE, ports: ['out'], required: ['out'],
    desc: 'A perfect riffle shuffle that moves the top card to second.',
  },
  straight: {
    name: 'Straight', abbr: 'STR', family: TEST, ports: ['yes', 'no'],
    desc: 'Is the hand a straight?',
  },
  flush: {
    name: 'Flush', abbr: 'FL', family: TEST, ports: ['yes', 'no'],
    desc: 'Are all the cards one suit?',
  },
  kind: {
    name: 'N of a kind', abbr: 'K', family: TEST, ports: ['yes', 'no'],
    params: { n: { label: 'n', options: [2, 3, 4, 5, 6, 7, 8], default: 2 } },
    desc: 'Does some rank appear at least n times?',
  },
  set: {
    name: 'Set', abbr: 'SET', family: SHAPE, ports: ['set', 'rest'],
    desc: 'The cards of the most common rank go to set, the rest to rest.',
  },
  suits: {
    name: 'Suits', abbr: 'SUIT', family: SHAPE, ports: ['S', 'H', 'D', 'C', 'misc'],
    desc: 'Deals each card to its suit\'s pile. Cards without a side go to misc.',
  },
  burn: {
    name: 'Burn', abbr: 'BURN', family: SHAPE, ports: ['burn', 'rest'],
    desc: 'The top card goes to burn, the rest to rest.',
  },
  hand: {
    name: 'Hand', abbr: 'HND', family: ROUTE, ports: ['out'], required: ['out'],
    params: { n: { label: 'n', options: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13], default: 5 } },
    desc: 'Collects cards and deals them out in hands of n.',
  },
  deal: {
    name: 'Deal', abbr: 'DEAL', family: ROUTE, ports: [], deal: true,
    desc: 'Deals the hand out a card at a time to a list of sides, in turn.',
  },
  gather: {
    name: 'Gather', abbr: 'GATH', family: ROUTE, ports: ['out'], required: ['out'], sides: ['under'],
    desc: 'Stacks two hands from different sides. The hand from the under side goes underneath.',
  },
  war: {
    name: 'War', abbr: 'WAR', family: WAR, ports: ['win', 'lose', 'dwin', 'dlose'], sides: ['dealer'], required: ['dealer'],
    params: { rule: { label: 'rule', options: ['high', 'top'], default: 'high' } },
    desc: 'Plays a player\'s hand against a dealer\'s hand from the dealer side; ties go to the house. The player\'s hand goes to win or lose, the dealer\'s to d-win or d-lose.',
  },
  shoe: {
    name: 'Shoe', abbr: 'SHOE', family: SHOE, ports: ['out'], required: ['out'], shoe: true,
    desc: 'Deals its deck a card per round, over and over, or once.',
  },
};

export const SIDE_NAMES = ['E', 'SE', 'SW', 'W', 'NW', 'NE'];

export const infoFor = (cell) => (cell.kind === 'shoe' ? CROUPIERS.shoe : CROUPIERS[cell.fn]);
// A cell for showing a palette entry or help row: every param at its default.
export function sampleCell(tool) {
  if (tool === 'shoe') return { kind: 'shoe' };
  const cell = { kind: 'croupier', fn: tool };
  for (const [k, p] of Object.entries(CROUPIERS[tool]?.params ?? {})) cell[k] = p.default;
  return cell;
}

export const toolOf = (cell) => (cell.kind === 'shoe' ? 'shoe' : cell.fn);

// Short label drawn on the chip.
export function chipLabel(cell) {
  if (cell.kind === 'shoe') return 'SHOE';
  if (cell.fn === 'kind') return `K${cell.n ?? 2}`;
  if (cell.fn === 'hand') return `HND${cell.n ?? 5}`;
  if (cell.fn === 'war') return cell.rule === 'top' ? 'WAR·T' : cell.rule === 'high' ? 'WAR·H' : 'WAR';
  return CROUPIERS[cell.fn]?.abbr ?? cell.fn;
}

// Whether a port must always point somewhere (see `required` above).
export const isRequired = (cell, port) => !!infoFor(cell)?.required?.includes(port);

// A fresh cell for a palette tool. Only its required ports get a side:
// outputs toward `primarySide` (where the last croupier's first port
// pointed), War's dealer side off to one side of that flow. Optional ports
// start on the floor.
export function newCell(tool, at, primarySide = 0) {
  if (tool === 'shoe') return { at, kind: 'shoe', out: primarySide, deck: ['AS'] };
  const info = CROUPIERS[tool];
  const cell = { at, kind: 'croupier', fn: tool, out: {} };
  if (info.deal) cell.out = { to: [] };
  for (const p of info.required ?? []) setPort(cell, p, p === 'dealer' ? (primarySide + 4) % 6 : primarySide);
  for (const [k, p] of Object.entries(info.params ?? {})) cell[k] = p.default;
  return cell;
}

// Editable "port-like" things of a cell: outputs plus input-side params.
export function portsOf(cell) {
  const info = infoFor(cell);
  if (info.deal) return ['to'];
  return [...info.ports, ...(info.sides ?? [])];
}

export function getPort(cell, port) {
  if (cell.kind === 'shoe' || cell.kind === 'source') return port === 'out' ? cell.out : undefined;
  if (port === 'dealer' || port === 'under') return cell[port];
  return cell.out?.[port];
}

// Set (or with side undefined, clear) a port. For deal, toggles nothing:
// use addDealSide / the inspector list.
export function setPort(cell, port, side) {
  if (cell.kind === 'shoe') {
    if (side === undefined) delete cell.out; else cell.out = side;
    return;
  }
  if (port === 'dealer' || port === 'under') {
    if (side === undefined) delete cell[port]; else cell[port] = side;
    return;
  }
  if (port === 'to') {
    cell.out.to ??= [];
    if (side !== undefined) cell.out.to.push(side);
    return;
  }
  if (side === undefined) delete cell.out[port]; else cell.out[port] = side;
}

// Every [side, port] arrow drawn for a cell (outputs only).
export function arrowsOf(cell) {
  if (cell.kind === 'source' || cell.kind === 'shoe') {
    return cell.out === undefined ? [] : [[cell.out, 'out']];
  }
  if (cell.kind !== 'croupier') return [];
  if (cell.fn === 'deal') return (cell.out?.to ?? []).map((s, i) => [s, 'to', i + 1]);
  const info = CROUPIERS[cell.fn];
  if (!info) return [];
  return info.ports.filter((p) => cell.out?.[p] !== undefined).map((p) => [cell.out[p], p]);
}

// Re-point every side a cell has through `map`: its outputs (the Deal list
// too) and its input sides (War's dealer, Gather's under). Its facing (where
// it starts looking for input) isn't something the player sets, so it stays
// as it is: east, unless a cell came with another. So a turned or mirrored
// machine can behave differently, as built anew that way would.
function mapSides(cell, map) {
  const m = (s) => (typeof s === 'number' ? map(s) : s);
  if (cell.kind === 'shoe') { cell.out = m(cell.out); return; }
  for (const p of Object.keys(cell.out ?? {})) cell.out[p] = p === 'to' ? cell.out.to.map(m) : m(cell.out[p]);
  for (const p of ['dealer', 'under']) if (cell[p] !== undefined) cell[p] = m(cell[p]);
}

// Turn a cell by k sixths of a turn clockwise (negative: anticlockwise).
export const rotateCell = (cell, k) => mapSides(cell, (s) => (((s + k) % 6) + 6) % 6);
// Mirror a cell left to right: E and W swap, SE and SW, NE and NW.
export const mirrorCell = (cell) => mapSides(cell, (s) => (9 - s) % 6);

// The hex `at` turned by k sixths clockwise about `pivot` (axial coordinates).
export function rotateAt([q, r], [pq, pr], k) {
  let x = q - pq, z = r - pr, y = -x - z;
  for (let i = 0; i < (((k % 6) + 6) % 6); i++) [x, y, z] = [-z, -x, -y];
  return [pq + x, pr + z];
}
// The hex `at` mirrored left to right about `pivot`.
export function mirrorAt([q, r], [pq, pr]) {
  const x = q - pq, z = r - pr;
  return [pq - x - z, pr + z];
}
