// "Even money" with only the core croupiers.
//
// A single card can't be told apart from anything by itself (every core test
// is trivially true for one card), so each stage borrows a reference card from
// a shoe: the gather puts the shoe's card under X, giving [R, X]. That pair is
// a straight exactly when X is next to R, so stages with R = 3, 7, J catch
// {2,4}, {6,8}, {10,Q}. A cut then splits R back off X.
const stage = (dq, dr, ref, last) => {
  const at = (q, r) => [q + dq, r + dr];
  const cells = [
    { at: at(0, -1), kind: 'shoe', dir: 1, deck: [ref] },
    { at: at(0, 0), kind: 'croupier', fn: 'gather', n: 3, facing: 4 },
    { at: at(1, 0), kind: 'croupier', fn: 'straight' },
    { at: at(2, -1), kind: 'croupier', fn: 'cut' },       // yes: R -> NW, X -> E
    { at: at(2, -2), kind: 'croupier', fn: 'scratch' },
    { at: at(3, -1), kind: 'payout' },
  ];
  if (last) cells.push({ at: at(1, 1), kind: 'croupier', fn: 'scratch' });
  else cells.push(
    { at: at(1, 1), kind: 'croupier', fn: 'cut', flip: true }, // no: X -> E, R -> SW
    { at: at(0, 2), kind: 'croupier', fn: 'scratch' },
  );
  return cells;
};

export default {
  puzzle: 'even',
  rules: 'core',
  cells: [
    { at: [0, 0], kind: 'source', dir: 0 },
    ...stage(1, 0, '3C'), ...stage(3, 1, '7C'), ...stage(5, 2, 'JC', true),
  ],
};
