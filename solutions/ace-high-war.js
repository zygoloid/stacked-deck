// "Ace in the hole" with high-card War: the house plays a king against every
// hand, and only a hand holding an ace beats it (ties go to the house).
const E = 0, SE = 1, SW = 2, W = 3, NW = 4, NE = 5;
export default {
  puzzle: 'ace',
  rules: 'ports + high-card war',
  cells: [
    { at: [0, 0], kind: 'source', out: E },
    { at: [1, -1], kind: 'shoe', out: SE, deck: ['KS'] },
    { at: [1, 0], kind: 'croupier', fn: 'war', rule: 'high', dealer: NW, out: { win: E } },
    { at: [2, 0], kind: 'payout' },
  ],
};
