// ASCII rendering of a floor layout (pointy-top hexes, odd rows shifted).
// A label is the croupier's name plus an arrow for its main output side.
const ARROWS = ['>', '\\', '/', '<', '`', "'"]; // E SE SW W NW NE
const NAMES = {
  pass: 'P', duplicate: 'Dup', sort: 'Srt', cut: 'Cut', outshuffle: 'Out', inshuffle: 'In',
  straight: 'Str', flush: 'Fl', kind: 'K', suits: 'Su', set: 'Set', deal: 'Del', gather: 'G', war: 'W',
};
const MAIN = { duplicate: 'a', cut: 'top', straight: 'yes', flush: 'yes', kind: 'yes', set: 'set', war: 'win' };

export function label(c) {
  if (c.label) return c.label;
  if (c.kind === 'source') return `in${ARROWS[c.out]}`;
  if (c.kind === 'payout') return '$$';
  if (c.kind === 'shoe') return `${c.deck[0][0]}${ARROWS[c.out]}`;
  if (c.fn === 'war') return `W${c.rule === 'top' ? 't' : 'h'}`;
  if (c.fn === 'kind') return `K${c.n}`;
  const side = c.fn === 'deal' ? undefined : c.out?.[MAIN[c.fn] ?? 'out'];
  return NAMES[c.fn] + (side === undefined ? '' : ARROWS[side]);
}

export function render(spec) {
  const cells = spec.cells.map((c) => ({ ...c, q: c.at[0], r: c.at[1] }));
  const xs = cells.map((c) => 2 * c.q + c.r);
  const rs = cells.map((c) => c.r);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minR = Math.min(...rs), maxR = Math.max(...rs);
  const W = 3;
  const lines = [];
  for (let r = minR; r <= maxR; r++) {
    const row = new Array((maxX - minX + 2) * W).fill(' ');
    for (let x = minX; x <= maxX; x++) {
      if (((x - r) % 2 + 2) % 2) continue;
      row[(x - minX) * W + 1] = '.';
    }
    for (const c of cells.filter((c) => c.r === r)) {
      const s = label(c).padEnd(5).slice(0, 5);
      const at = (2 * c.q + c.r - minX) * W;
      for (let i = 0; i < 5; i++) row[at + i] = s[i];
    }
    lines.push(row.join('').trimEnd());
  }
  return lines.join('\n');
}
