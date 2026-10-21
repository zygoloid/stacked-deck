// "House record": pay every hand whose largest set ties or beats every
// earlier hand's.
//
// 1. Door: a War that only admits a hand with a ticket, so one hand is in the
//    machine at a time (the gate hands each used verdict back as the next
//    ticket; a shoe that deals once supplies the first).
// 2. The hand is duplicated. The copy runs down a chain of 2-, 3- and
//    4-of-a-kind dealers, which sorts it into one of four classes; each class
//    plays a War against its own shoe just to release a marker card: 3, 4, 5
//    or 6 for largest set 1, 2, 3 or 4.
// 3. The record is a champion card circling through a War: champion is the
//    player, marker the dealer. If the champion is strictly higher, the hand
//    falls short: the champion keeps circling and the marker is swapped for an
//    ace. Otherwise (ties go to the house) the marker becomes the new champion
//    and the old champion is swapped for a 2. The first champion is a 3.
// 4. Gate: the original hand plays high-card War against that verdict card;
//    it beats any 2 and never beats an ace.
import { build } from '../src/layout.js';

const war = (at) => ({ at, kind: 'croupier', fn: 'war', rule: 'high' });
const c = (at, fn, extra = {}) => ({ at, kind: 'croupier', fn, ...extra });
const shoe = (at, card, extra = {}) => ({ at, kind: 'shoe', deck: [card], ...extra });

export const spec = {
  puzzle: 'record',
  rules: 'ports + high-card war + n of a kind',
  nodes: {
    src: { at: [0, 0], kind: 'source' },
    door: war([0, -1]), ticket: shoe([1, -1], '2D', { once: true }),
    dup: c([1, -2], 'duplicate'),
    gate: war([0, -2]), desk: { at: [-1, -2], kind: 'payout' },
    k2: c([2, -3], 'kind', { n: 2 }), k3: c([4, -3], 'kind', { n: 3 }), k4: c([6, -6], 'kind', { n: 4 }),
    m1: war([3, -4]), s1: shoe([2, -4], '3S'),
    m2: war([4, -4]), s2: shoe([3, -3], '4S'),
    m3: war([5, -5]), s3: shoe([5, -4], '5S'),
    m4: war([5, -6]), s4: shoe([5, -7], '6S'),
    markers: c([4, -5], 'pass'),
    champ: war([2, -5]), loop: c([3, -6], 'pass'), seed: shoe([3, -7], '3H', { once: true }),
    toAce: war([1, -4]), aces: shoe([1, -3], 'AC'),
    toTwo: war([1, -5]), twos: shoe([0, -5], '2C'),
    verdict: c([0, -4], 'pass'),
  },
  links: [
    ['src', null, 'door', 'dealer'], ['ticket', null, 'door'],
    ['s1', null, 'm1', 'dealer'], ['s2', null, 'm2', 'dealer'],
    ['s3', null, 'm3', 'dealer'], ['s4', null, 'm4', 'dealer'],
    ['markers', 'out', 'champ', 'dealer'],
    ['aces', null, 'toAce', 'dealer'], ['twos', null, 'toTwo', 'dealer'],
    ['verdict', 'out', 'gate', 'dealer'],
    ['door', ['dwin', 'dlose'], 'dup'], ['dup', 'a', 'gate'], ['dup', 'b', 'k2'],
    ['k2', 'no', 'm1'], ['k2', 'yes', 'k3'], ['k3', 'no', 'm2'], ['k3', 'yes', 'k4'],
    ['k4', 'no', 'm3'], ['k4', 'yes', 'm4'],
    ['m1', ['dwin', 'dlose'], 'markers'], ['m2', ['dwin', 'dlose'], 'markers'],
    ['m3', ['dwin', 'dlose'], 'markers'], ['m4', ['dwin', 'dlose'], 'markers'],
    ['champ', ['win', 'dwin'], 'loop'], ['loop', 'out', 'champ'], ['seed', null, 'loop'],
    ['champ', 'dlose', 'toAce'], ['champ', 'lose', 'toTwo'],
    ['toAce', ['dwin', 'dlose'], 'verdict'], ['toTwo', ['dwin', 'dlose'], 'verdict'],
    ['gate', 'win', 'desk'], ['gate', ['dwin', 'dlose'], 'door'],
  ],
};

export default build(spec);
