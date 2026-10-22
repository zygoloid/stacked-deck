// The croupier table: what every function does, its ports and parameters.
// The help panel, the palette and the inspector are generated from this, so
// keep it in sync with the fn table in docs/architecture.md.

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
// order. sides: param sides edited like ports (input markers).
export const CROUPIERS = {
  pass: {
    name: 'Pass', abbr: 'PASS', family: ROUTE, ports: ['out'],
    desc: 'Passes the hand on unchanged.',
  },
  duplicate: {
    name: 'Duplicate', abbr: 'DUP', family: ROUTE, ports: ['a', 'b'],
    desc: 'Copies the hand: one copy to A, one to B.',
  },
  sort: {
    name: 'Sort', abbr: 'SORT', family: SHAPE, ports: ['out'],
    desc: 'Puts the hand in new deck order (A♠ on top): ♠A–K, ♦A–K, ♣K–A, ♥K–A.',
  },
  cut: {
    name: 'Cut', abbr: 'CUT', family: SHAPE, ports: ['top', 'bottom'],
    desc: 'Splits the hand: the top ⌊n/2⌋ cards to top, the rest to bottom. A single card goes to bottom. Point both at the same side to complete the cut: the top half ends up underneath.',
  },
  outshuffle: {
    name: 'Out-shuffle', abbr: 'OUT', family: SHAPE, ports: ['out'],
    desc: 'Perfect riffle that keeps the top card on top (top half is the larger one).',
  },
  inshuffle: {
    name: 'In-shuffle', abbr: 'IN', family: SHAPE, ports: ['out'],
    desc: 'Perfect riffle that moves the top card to second place.',
  },
  straight: {
    name: 'Straight', abbr: 'STR', family: TEST, ports: ['yes', 'no'],
    desc: 'Is the hand a run of consecutive distinct ranks? Aces play high or low (no wrap). One card is a straight.',
  },
  flush: {
    name: 'Flush', abbr: 'FL', family: TEST, ports: ['yes', 'no'],
    desc: 'Are all the cards one suit?',
  },
  kind: {
    name: 'N of a kind', abbr: 'K', family: TEST, ports: ['yes', 'no'],
    params: { n: { label: 'n', options: [2, 3, 4, 5, 6, 7, 8], default: 2 } },
    desc: 'Does some rank appear at least n times? (n from 2 to 8; reference cards from a shoe can push a hand past four of a kind.)',
  },
  set: {
    name: 'Set', abbr: 'SET', family: SHAPE, ports: ['set', 'rest'],
    desc: 'Cards of the most common rank(s) go to set, the others to rest (rest may be empty).',
  },
  suits: {
    name: 'Suits', abbr: 'SUIT', family: SHAPE, ports: ['S', 'H', 'D', 'C', 'misc'],
    desc: 'Each card goes to its suit\'s pile. Suits without a side go to misc (or the floor). Suits sharing a side form one pile, in hand order.',
  },
  deal: {
    name: 'Deal', abbr: 'DEAL', family: ROUTE, ports: [], deal: true,
    desc: 'Deals the hand one card at a time, round-robin, to an ordered list of sides (a side may repeat).',
  },
  gather: {
    name: 'Gather', abbr: 'GATH', family: ROUTE, ports: ['out'], sides: ['under'],
    desc: 'Stacks two hands that arrive from different sides. The hand from the under side goes underneath; without one, the first picked up does.',
  },
  war: {
    name: 'War', abbr: 'WAR', family: WAR, ports: ['win', 'lose', 'dwin', 'dlose'], sides: ['dealer'],
    params: { rule: { label: 'rule', options: ['high', 'top'], default: 'high' } },
    desc: 'Plays the player\'s hand (any side but the dealer side) against the dealer\'s hand (from the dealer side). Rule high compares high cards, rule top the top cards; aces high; ties go to the house. The player hand goes to win/lose, the dealer hand to d-win/d-lose.',
  },
  shoe: {
    name: 'Shoe', abbr: 'SHOE', family: SHOE, ports: ['out'], shoe: true,
    desc: 'Deals its stacked deck one card per round in one direction, repeating forever, or only once. Counts as a croupier.',
  },
};

export const SIDE_NAMES = ['E', 'SE', 'SW', 'W', 'NW', 'NE'];

export const infoFor = (cell) => (cell.kind === 'shoe' ? CROUPIERS.shoe : CROUPIERS[cell.fn]);
export const toolOf = (cell) => (cell.kind === 'shoe' ? 'shoe' : cell.fn);

// Short label drawn on the chip.
export function chipLabel(cell) {
  if (cell.kind === 'shoe') return 'SHOE';
  if (cell.fn === 'kind') return `K${cell.n ?? 2}`;
  if (cell.fn === 'war') return cell.rule === 'top' ? 'WAR·T' : cell.rule === 'high' ? 'WAR·H' : 'WAR';
  return CROUPIERS[cell.fn]?.abbr ?? cell.fn;
}

// A fresh cell for a palette tool.
export function newCell(tool, at, primarySide) {
  if (tool === 'shoe') return { at, kind: 'shoe', out: primarySide, deck: ['AS'] };
  const info = CROUPIERS[tool];
  const cell = { at, kind: 'croupier', fn: tool, out: {} };
  if (info.deal) cell.out = { to: [] };
  else if (primarySide !== undefined && info.ports.length) cell.out[info.ports[0]] = primarySide;
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
