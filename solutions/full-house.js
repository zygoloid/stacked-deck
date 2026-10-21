// "Full house": three of a kind plus a pair.
//
// The hand is duplicated and the copy tested: a 3-of-a-kind dealer rejects
// hands without trips, then Set pulls out the trips, and the hand is a full
// house exactly when the rest is a pair. That answer is about the copy, so it
// is turned into a verdict card for the original: a War against a shoe of 2s
// (for "yes") or aces (for "no") hands on its dealer card whatever happens.
// The original then plays high-card War against the verdict at the gate:
// every hand beats a 2, and no hand beats an ace (ties go to the house).
//
// The yes and no verdicts merge on their way to the gate, and with several
// hands in flight a later verdict can overtake an earlier one. So a War at
// the door only lets a hand in with a ticket, and the gate hands the used
// verdict card back as the next ticket: one hand at a time. A shoe that deals
// once supplies the first ticket.
import { build } from '../src/layout.js';

const war = (at) => ({ at, kind: 'croupier', fn: 'war', rule: 'high' });
const c = (at, fn, extra = {}) => ({ at, kind: 'croupier', fn, ...extra });

export const spec = {
  puzzle: 'fullHouse',
  rules: 'ports + high-card war + n of a kind',
  nodes: {
    src: { at: [0, 0], kind: 'source' },
    door: war([1, 0]), ticket: { at: [1, 1], kind: 'shoe', deck: ['2D'], once: true },
    dup: c([2, 0], 'duplicate'),
    gate: war([2, -1]), desk: { at: [1, -1], kind: 'payout' },
    trips: c([3, 0], 'kind', { n: 3 }),
    set: c([4, 0], 'set'),
    pair: c([5, -1], 'kind', { n: 2 }),
    yes: war([5, -2]), yesShoe: { at: [6, -2], kind: 'shoe', deck: ['2C'] },
    no: war([4, -1]), noShoe: { at: [3, -1], kind: 'shoe', deck: ['AC'] },
    verdict: c([4, -2], 'pass'),
  },
  links: [
    ['src', null, 'door', 'dealer'], ['ticket', null, 'door'],
    ['yesShoe', null, 'yes', 'dealer'], ['noShoe', null, 'no', 'dealer'],
    ['door', ['dwin', 'dlose'], 'dup'], ['dup', 'a', 'gate'], ['dup', 'b', 'trips'],
    ['trips', 'yes', 'set'], ['trips', 'no', 'no'], ['set', 'rest', 'pair'],
    ['pair', 'yes', 'yes'], ['pair', 'no', 'no'],
    ['yes', ['dwin', 'dlose'], 'verdict'], ['no', ['dwin', 'dlose'], 'verdict'],
    ['verdict', 'out', 'gate', 'dealer'],
    ['gate', 'win', 'desk'], ['gate', ['dwin', 'dlose'], 'door'],
  ],
};

export default build(spec);
