// "Even money". Single cards; War can't help much here (it only answers
// "higher than?"), so this uses the straight trick: a gather puts a reference
// card R from a shoe under X, and [X, R] is a straight exactly when X is next
// to R. Stages with R = 3, 7, J catch {2,4}, {6,8}, {10,Q}. Every stage's
// "yes" goes to one shared cut that sends X (top) to the desk and drops R;
// "no" goes to a cut that passes X on.
const E = 0, SE = 1, SW = 2, W = 3, NW = 4, NE = 5;
const shoe = (at, out, ref) => ({ at, kind: 'shoe', out, deck: [ref] });
const gather = (at, under, out) => ({ at, kind: 'croupier', fn: 'gather', under, out: { out } });
const straight = (at, yes, no) => ({ at, kind: 'croupier', fn: 'straight', out: { yes, no } });
const cut = (at, top) => ({ at, kind: 'croupier', fn: 'cut', out: { top } });

export default {
  puzzle: 'even',
  rules: 'ports',
  cells: [
    { at: [-2, -1], kind: 'source', out: E },
    shoe([-1, -2], SE, '3C'), gather([-1, -1], NW, E), straight([0, -1], SE, E), cut([1, -1], E),
    shoe([3, -1], W, '7C'), gather([2, -1], E, SW), straight([1, 0], W, E), cut([2, 0], SW),
    shoe([1, 2], NW, 'JC'), gather([1, 1], SE, W), straight([0, 1], NW),
    cut([0, 0], W), // the shared payout cut
    { at: [-1, 0], kind: 'payout' },
  ],
};
