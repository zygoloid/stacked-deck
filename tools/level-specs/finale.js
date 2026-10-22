// Reference-solution recipes for chapter 5 (the finale). Regenerate with
// `node tools/write-solutions.js finale [--par]`.
import { E, SE, SW, W, NW, NE, c, pass, war, shoe } from './shared.js';

export const SPECS = {
  'mind-the-gap': {
    // Not a run, but a run with a joker on top: the ranks are two apart.
    // Burn takes the joker off again.
    cells: [
      c([-2, 0], 'straight', { out: { no: E } }),
      c([-1, 0], 'gather', { under: W, out: { out: E } }), shoe([-1, -1], '?', { out: SE }),
      c([0, 0], 'straight', { out: { yes: E } }),
      c([1, 0], 'burn', { out: { rest: E } }),
    ],
  },
  'straight-flush-draw': {
    // The colour joker on top fills the run and keeps the flush, so the
    // tests can come in either order; burn takes it off.
    cells: [
      c([-2, 0], 'gather', { under: W, out: { out: E } }), shoe([-2, -1], '??', { out: SE }),
      c([-1, 0], 'straight', { out: { yes: E } }),
      c([0, 0], 'flush', { out: { yes: E } }),
      c([1, 0], 'burn', { out: { rest: E } }),
    ],
  },
  'red-carpet': {
    // Test a copy: an advertising card joins it so the red pile is never
    // empty, and it can't make a pair; the black cards are dropped (unassigned
    // suits would go to misc). A pair releases a 2, anything else an
    // ace; both routes take the same time, so no door.
    cells: [
      c([2, 0], 'duplicate', { out: { a: NW, b: E } }), pass([2, -1], NW),
      c([3, 0], 'gather', { out: { out: NE } }), shoe([4, 0], '$', { out: W }),
      c([4, -1], 'suits', { out: { H: NW, D: NW, misc: NW, S: E, C: E } }),
      c([4, -2], 'kind', { n: 2, out: { yes: W, no: NW } }),
      war([3, -2], { dealer: SE, out: { dwin: NW, dlose: NW } }), shoe([3, -1], '2C', { out: NW }),
      war([4, -3], { dealer: E, out: { dwin: W, dlose: W } }), shoe([5, -3], 'AC', { out: W }),
      pass([3, -3], SW), war([2, -2], { dealer: NE, out: { win: SW } }),
    ],
  },
  'deja-vu': {
    // The memory is a stack of one card of each rank seen so far, seeded with
    // an advertising card (which pairs with nothing). A new card goes on top:
    // if that makes a pair, burn sends it to the desk and the memory goes
    // round again; if not, the bigger stack is the new memory.
    cells: [
      c([-2, 0], 'gather', { under: NE, out: { out: E } }),
      c([-1, 0], 'kind', { n: 2, out: { yes: E, no: NW } }),
      c([0, 0], 'burn', { out: { burn: E, rest: NW } }),
      pass([0, -1], W), pass([-1, -1], SW), shoe([0, -2], '$$', { out: SW, once: true }),
    ],
  },
};
