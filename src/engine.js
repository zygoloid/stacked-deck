// Floor simulator.
//
// Geometry: pointy-top hexes in axial coordinates (q, r). Directions are
// numbered clockwise starting from east:
//   0 E   1 SE   2 SW   3 W   4 NW   5 NE
// Every table has one input slot per direction; slot[d] holds the hand that
// arrived from the neighbour in direction d. A croupier "outputting at
// input+n" deposits into the neighbour at direction (in+n)%6.
//
// A round has three phases:
//   1. Read: every croupier that is not holding undelivered output picks up
//      one hand: from the direction it faces, otherwise from the next
//      non-empty slot clockwise. With nothing to pick up it stalls.
//   2. Act: croupiers compute their outputs. Empty hands are never deposited.
//   3. Deposit: every undelivered output is placed if the target slot is empty
//      (slots emptied in phase 1 count as empty). Otherwise the croupier keeps
//      it and stalls until it can deliver. Players at sources place their next
//      hand in this phase too. Cards handed towards a hex with no table are
//      dropped on the floor and leave play; that is how hands are discarded.
//
// Cards carry provenance (`src`: 'player' or 'house') so the checker knows when
// every player card has left the floor.

import {
  rankOf, highValue, newDeckIndex, isFlush, isStraight, rankCounts,
} from './cards.js';

export const DIRS = [[1, 0], [0, 1], [-1, 1], [-1, 0], [0, -1], [1, -1]];
export const DIR_NAMES = ['E', 'SE', 'SW', 'W', 'NW', 'NE'];
const key = (q, r) => `${q},${r}`;
const mod6 = (n) => ((n % 6) + 6) % 6;

const cardsOf = (hand) => hand.map((x) => x.c);
const playerCards = (hand) => hand.filter((x) => x.src === 'player').length;

// Croupier functions. Each gets (state, hand, inDir) and returns a list of
// [dir, hand] outputs. `two(hand, yes)` routes to +2 / +4 (swapped by flip).
export const FUNCTIONS = {
  pass: (st, h, d) => [[d + st.n, h]],
  duplicate: (st, h, d) => [[d + 2, h], [d + 4, h.map((x) => ({ ...x }))]],
  sort: (st, h, d) => [[d + 3, [...h].sort((a, b) => newDeckIndex(a.c) - newDeckIndex(b.c))]],
  cut: (st, h, d) => {
    const k = Math.floor(h.length / 2);
    return st.split(d, h.slice(0, k), h.slice(k));
  },
  outshuffle: (st, h, d) => [[d + 3, riffle(h, true)]],
  inshuffle: (st, h, d) => [[d + 3, riffle(h, false)]],
  straight: (st, h, d) => st.route(d, h, isStraight(cardsOf(h))),
  flush: (st, h, d) => st.route(d, h, isFlush(cardsOf(h))),
  set: (st, h, d) => {
    const counts = rankCounts(cardsOf(h));
    const max = Math.max(...counts.values());
    return st.split(d, h.filter((x) => counts.get(rankOf(x.c)) === max),
      h.filter((x) => counts.get(rankOf(x.c)) !== max));
  },
  deal: (st, h, d) => {
    const targets = [];
    for (let i = 1; i < 6; i++) if (st.isTable(mod6(d + i))) targets.push(mod6(d + i));
    const piles = targets.map(() => []);
    h.forEach((x, i) => piles[i % targets.length].push(x));
    return targets.map((t, i) => [t, piles[i]]);
  },
  // Gather ("stack"): hold the first hand, wait for one from another
  // direction, put it on top and deposit at (second input)+n. The croupier
  // keeps facing the first hand's direction, so with a shoe that always has a
  // card waiting, the shoe's card reliably ends up at the bottom.
  gather: (st, h, d) => {
    if (!st.held) { st.held = h; st.heldDir = d; return []; }
    const out = [...st.held, ...h];
    st.held = null;
    return [[d + st.n, out]];
  },
  // --- proposed additions ---
  // War: compare the hand's high card (ace high) with the next card of the
  // house's stacked deck. Higher -> +2, lower -> +4, tie ("push") -> +3.
  war: (st, h, d) => {
    const house = st.deck[st.pos++ % st.deck.length];
    const mine = Math.max(...h.map((x) => highValue(x.c)));
    const theirs = highValue(house);
    if (mine === theirs) return [[d + 3, h]];
    return st.split(d, mine > theirs ? h : [], mine > theirs ? [] : h);
  },
};

function riffle(h, out) {
  const k = out ? Math.ceil(h.length / 2) : Math.floor(h.length / 2);
  const a = h.slice(0, k), b = h.slice(k);
  const [first, second] = out ? [a, b] : [b, a];
  const res = [];
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (i < first.length) res.push(first[i]);
    if (i < second.length) res.push(second[i]);
  }
  return res;
}

export class Floor {
  // spec: { cells: [...], level }
  // cell kinds:
  //   { at:[q,r], kind:'source', dir }            card player placing hands
  //   { at:[q,r], kind:'payout' }                 chip desk / cashier cage
  //   { at:[q,r], kind:'croupier', fn, facing, n, flip, deck }
  //   { at:[q,r], kind:'shoe', dir, deck }        croupier dealing a stacked deck,
  //                                               one card per round
  constructor(spec, inputs) {
    this.cells = new Map();
    this.round = 0;
    this.paid = [];
    this.inputs = inputs.map((h) => h.map((c) => ({ c, src: 'player' })));
    this.inputPos = 0;
    this.live = 0; // player cards currently on the floor (including held ones)
    for (const c of spec.cells) {
      const cell = {
        ...c, q: c.at[0], r: c.at[1], slots: [null, null, null, null, null, null],
        pending: [], facing: c.facing ?? 0, n: c.n ?? 3, pos: 0, held: null,
      };
      this.cells.set(key(cell.q, cell.r), cell);
    }
    for (const cell of this.cells.values()) {
      if (cell.kind === 'croupier' && !FUNCTIONS[cell.fn]) throw new Error(`unknown fn ${cell.fn}`);
    }
  }

  neighbour(cell, d) {
    const [dq, dr] = DIRS[mod6(d)];
    return this.cells.get(key(cell.q + dq, cell.r + dr));
  }

  croupierCount() {
    let n = 0;
    for (const c of this.cells.values()) if (c.kind === 'croupier' || c.kind === 'shoe') n++;
    return n;
  }

  step() {
    this.round++;
    const croupiers = [...this.cells.values()].filter((c) => c.kind === 'croupier');
    // Phase 1 + 2: read and act.
    for (const cell of croupiers) {
      if (cell.pending.length) continue;
      let start = cell.facing, skip = -1;
      if (cell.fn === 'gather' && cell.held) { skip = cell.heldDir; start = cell.heldDir + 1; }
      let found = -1;
      for (let i = 0; i < 6; i++) {
        const d = mod6(start + i);
        if (d !== skip && cell.slots[d]) { found = d; break; }
      }
      if (found < 0) continue;
      const hand = cell.slots[found];
      cell.slots[found] = null;
      // A gathering croupier keeps facing the hand it is holding.
      if (skip < 0) cell.facing = found;
      const st = this.stateFor(cell);
      const before = playerCards(hand) + playerCards(cell.held || []);
      const outs = FUNCTIONS[cell.fn](st, hand, found);
      this.live += outs.reduce((a, [, h]) => a + playerCards(h), 0) + playerCards(cell.held || []) - before;
      cell.pending = outs.filter(([, h]) => h.length).map(([d, h]) => [mod6(d), h]);
    }
    // Phase 3: deposit.
    for (const cell of this.cells.values()) {
      if (cell.kind === 'shoe' && !cell.pending.length) {
        cell.pending = [[cell.dir, [{ c: cell.deck[cell.pos++ % cell.deck.length], src: 'house' }]]];
      }
      if (cell.kind === 'source' && !cell.pending.length && this.inputPos < this.inputs.length) {
        cell.pending = [[cell.dir, this.inputs[this.inputPos++]]];
      }
      cell.pending = cell.pending.filter(([d, h]) => !this.deposit(cell, d, h));
    }
  }

  deposit(from, d, hand) {
    const to = this.neighbour(from, d);
    if (!to || to.kind === 'source' || to.kind === 'shoe') {
      // Dropped on the floor: the cards are gone.
      if (from.kind !== 'source') this.removed(hand);
      return true;
    }
    if (to.kind === 'payout') {
      this.paid.push(hand.map((x) => x.c));
      if (from.kind === 'source') return true;
      this.removed(hand);
      return true;
    }
    const slot = mod6(d + 3);
    if (to.slots[slot]) return false;
    to.slots[slot] = hand;
    if (from.kind === 'source') this.live += hand.length;
    return true;
  }

  removed(hand) {
    this.live -= playerCards(hand);
  }

  stateFor(cell) {
    const flip = !!cell.flip;
    const floor = this;
    return Object.assign(cell, {
      route: (d, h, yes) => [[d + ((yes !== flip) ? 2 : 4), h]],
      split: (d, a, b) => (flip ? [[d + 4, a], [d + 2, b]] : [[d + 2, a], [d + 4, b]]),
      isTable: (dir) => {
        const t = floor.neighbour(cell, dir);
        return t && (t.kind === 'croupier' || t.kind === 'payout');
      },
    });
  }

  done() {
    return this.inputPos >= this.inputs.length && this.live === 0 &&
      ![...this.cells.values()].some((c) => c.kind === 'source' && c.pending.length);
  }
}

// Run one test case. `pays(hand, history)` says whether an input hand should
// be paid out; history is the list of earlier input hands.
export function runTest(spec, inputs, pays, { maxRounds = 5000 } = {}) {
  const floor = new Floor(spec, inputs);
  while (!floor.done() && floor.round < maxRounds) floor.step();
  const expected = inputs.filter((h, i) => pays(h, inputs.slice(0, i)));
  const canon = (h) => [...h].sort().join(' ');
  const remaining = expected.map(canon);
  const wrong = [];
  for (const h of floor.paid) {
    const i = remaining.indexOf(canon(h));
    if (i < 0) wrong.push(h); else remaining.splice(i, 1);
  }
  const ok = floor.done() && !wrong.length && !remaining.length;
  return {
    ok, rounds: floor.round, croupiers: floor.croupierCount(),
    wrong, missing: remaining, timeout: !floor.done(),
  };
}
