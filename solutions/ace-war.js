// "Ace in the hole" using the proposed War dealer: the house plays an ace
// against every hand. A push (tie) means the hand's high card is an ace.
export default {
  puzzle: 'ace',
  rules: 'core + war',
  cells: [
    { at: [0, 0], kind: 'source', dir: 0 },
    { at: [1, 0], kind: 'croupier', fn: 'war', deck: ['AS'] }, // in from W
    { at: [2, 0], kind: 'payout' },                             // push: straight on
    // lower hands go out at +4 (SE) onto the floor
  ],
};
