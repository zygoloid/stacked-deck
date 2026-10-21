// "Ace in the hole" with top-card War.
//
// Only the top card counts now, so the machine first brings the hand's best
// card to the top with a knockout tournament: the deal splits the hand into
// five single cards, and each "merge" plays two piles against each other and
// stacks the winner on top of the loser. After four merges the hand is whole
// again with its highest card on top, and a final War against a king decides.
//
// A merge is three croupiers: War, a gather beside it, and a pass that walks
// the loser round to the gather's other side ("under").
const E = 0, SE = 1, SW = 2, W = 3, NW = 4, NE = 5;
const war = (at, dealer, win, lose) =>
  ({ at, kind: 'croupier', fn: 'war', rule: 'top', dealer, out: { win, dwin: win, lose, dlose: lose } });
const gather = (at, under, out) => ({ at, kind: 'croupier', fn: 'gather', under, out: { out } });
const pass = (at, out) => ({ at, kind: 'croupier', fn: 'pass', out: { out } });

export default {
  puzzle: 'ace',
  rules: 'ports + top-card war',
  cells: [
    { at: [-1, 0], kind: 'source', out: E },
    // Cards 1-5 go NW, NE, E, SE, SW.
    { at: [0, 0], kind: 'croupier', fn: 'deal', out: { to: [NW, NE, E, SE, SW] } },
    pass([0, -1], E),
    war([1, -1], W, E, NE), gather([2, -1], NW, SW), pass([2, -2], SE),   // cards 1, 2
    war([1, 0], W, SE, E), gather([1, 1], NE, W), pass([2, 0], SW),       // + card 3
    war([0, 1], NW, SW, SE), gather([-1, 2], E, NW), pass([0, 2], W),     // + card 4
    war([-1, 1], NE, W, SW), gather([-2, 1], SE, NW), pass([-2, 2], NW),  // + card 5
    { at: [-3, 0], kind: 'shoe', out: E, deck: ['KS'] },
    { at: [-2, 0], kind: 'croupier', fn: 'war', rule: 'top', dealer: W, out: { win: NW } },
    { at: [-2, -1], kind: 'payout' },
  ],
};
