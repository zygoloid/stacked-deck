// "High roller": pay every hand whose high card ties or beats every earlier
// hand's. This needs memory: the best hand so far circulates as the War's
// player hand ("the champion"), and each new hand is the dealer's. Ties go to
// the house, so a new hand that ties or beats the champion wins; it is paid
// and a copy becomes the new champion. The first champion is a 2 from a shoe
// that only deals once.
const E = 0, SE = 1, SW = 2, W = 3, NW = 4, NE = 5;
export default {
  puzzle: 'recordHigh',
  rules: 'ports + high-card war',
  cells: [
    { at: [0, 0], kind: 'source', out: E },
    { at: [1, -1], kind: 'shoe', out: SE, deck: ['2C'], once: true },
    { at: [1, 0], kind: 'croupier', fn: 'war', rule: 'high', dealer: W, out: { win: NE, dwin: E } },
    { at: [2, -1], kind: 'croupier', fn: 'pass', out: { out: SW } },           // champion stays
    { at: [2, 0], kind: 'croupier', fn: 'duplicate', out: { a: E, b: W } },   // pay + new champion
    { at: [3, 0], kind: 'payout' },
  ],
};
