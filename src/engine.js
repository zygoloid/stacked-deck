// Floor simulator.
//
// Geometry: pointy-top hexes in axial coordinates (q, r). Directions are
// numbered clockwise starting from east:
//   0 E   1 SE   2 SW   3 W   4 NW   5 NE
// Every table has one input slot per side; slot[d] holds the hand that arrived
// from the neighbour in direction d. Croupiers accept hands from any side, so
// streams merge freely.
//
// Outputs are named ports ("yes"/"no", "top"/"bottom", ...) and the player
// points each port at a side. A port left unassigned, or pointing at a hex with
// no table, drops its cards on the floor; that is how hands are discarded.
//
// A round has three phases:
//   1. Read: every croupier that is not holding undelivered output picks up
//      one hand: from the side it faces, otherwise from the next filled slot
//      clockwise, and then faces that side. With nothing to pick up it stalls.
//      Gather and War take both of their hands this round if both are waiting.
//      Having acted, it turns to face the side of its last output (pass: out;
//      cut: bottom, else top; set: rest, else set; duplicate: b; suits and
//      deal: the pile that got the last card; war: the player's hand).
//   2. Act: croupiers compute their outputs. Empty hands are never placed.
//   3. Deposit: every undelivered output is placed if the target slot is empty
//      (slots emptied in phase 1 count as empty). Otherwise the croupier keeps
//      it and stalls until it can deliver. Players and shoes place their next
//      hand in this phase too.
//
// Hands are arrays with the top card first. Cards carry provenance (`src`:
// 'player' or 'house') so the checker knows when every player card has left
// the floor.

import {
  rankOf, suitsOf, isJoker, isAd, highValue, newDeckIndex, isFlush, isStraight, rankCounts, largestSet,
} from './cards.js';

// Bump whenever the rules change (shown on the level select, so players can
// tell which version their browser is running).
//   3  croupiers turn to face their last output
//   4  outputs to the same side are stacked
//   5  cut with both halves to one side completes the cut
//   6  gather and war take both hands in one round when both are waiting
//   7  burn and hand croupiers; jokers and advertising cards
export const RULES_VERSION = 7;

export const DIRS = [[1, 0], [0, 1], [-1, 1], [-1, 0], [0, -1], [1, -1]];
export const DIR_NAMES = ['E', 'SE', 'SW', 'W', 'NW', 'NE'];
const key = (q, r) => `${q},${r}`;
const mod6 = (n) => ((n % 6) + 6) % 6;

const cardsOf = (hand) => hand.map((x) => x.c);
const playerCards = (hand) => hand.filter((x) => x.src === 'player').length;
const heldCards = (cell) => {
  if (!cell.held) return 0;
  if (cell.fn === 'gather') return playerCards(cell.held[0]);
  return Object.values(cell.held).reduce((a, h) => a + playerCards(h), 0);
};

// Croupier functions. Each gets (cell, hand, inSide) and returns a list of
// [port, hand] outputs. Croupiers that need two hands (gather, war) keep the
// first in `cell.held` and return nothing until the second arrives.
export const FUNCTIONS = {
  pass: (st, h) => [['out', h]],
  duplicate: (st, h) => [['a', h], ['b', h.map((x) => ({ ...x }))]],
  sort: (st, h) => [['out', [...h].sort((a, b) => newDeckIndex(a.c) - newDeckIndex(b.c))]],
  cut: (st, h) => {
    const k = Math.floor(h.length / 2);
    // Bottom half listed first: if both halves go to one side, the top half
    // lands underneath, i.e. the cut is completed as at a real table.
    return [['bottom', h.slice(k)], ['top', h.slice(0, k)]];
  },
  outshuffle: (st, h) => [['out', riffle(h, true)]],
  inshuffle: (st, h) => [['out', riffle(h, false)]],
  straight: (st, h) => [[isStraight(cardsOf(h)) ? 'yes' : 'no', h]],
  flush: (st, h) => [[isFlush(cardsOf(h)) ? 'yes' : 'no', h]],
  // n of a kind (or better): some rank appears at least n times.
  kind: (st, h) => [[largestSet(cardsOf(h)) >= st.n ? 'yes' : 'no', h]],
  // Suits: deal each card to the pile for its suit (ports S, H, D, C).
  // Cards whose suit has no port go to 'misc' if it is assigned, otherwise
  // they are dropped. Suits sharing a side form one pile, in hand order.
  suits: (st, h) => {
    const piles = new Map();
    let last;
    for (const x of h) {
      // The colour joker goes to the first suit (S, H, D, C) that has a port;
      // the monochrome joker and advertising cards have no suit.
      const own = suitsOf(x.c).find((u) => st.out[u] !== undefined);
      const port = own ?? 'misc';
      const side = st.out[port];
      if (side === undefined) continue;
      if (!piles.has(side)) piles.set(side, []);
      piles.get(side).push(x);
      last = side;
    }
    // The pile that got the last card goes last, so the croupier faces it.
    return [...piles].sort(([a], [b]) => (a === last) - (b === last)).map(([side, pile]) => [`@${side}`, pile]);
  },
  // Set: the most common rank(s) to `set`, the rest to `rest`. Jokers join the
  // set; advertising cards always go to `rest`.
  set: (st, h) => {
    const counts = rankCounts(cardsOf(h));
    const max = Math.max(0, ...counts.values());
    const inSet = (x) => isJoker(x.c) || (!isAd(x.c) && counts.get(rankOf(x.c)) === max);
    return [['set', h.filter(inSet)], ['rest', h.filter((x) => !inSet(x))]];
  },
  // Burn: the top card to `burn`, the rest to `rest`. Rest is handed on first,
  // so with both on one side the burned card ends up at the bottom.
  burn: (st, h) => [['rest', h.slice(1)], ['burn', h.slice(0, 1)]],
  // Hand: collect cards until there are at least n, then deal the first n as a
  // hand; leftovers start the next hand. With n or more already held it deals
  // without picking anything up (h is null then).
  hand: (st, h) => {
    const buffer = [...(st.held?.buffer ?? []), ...(h ?? [])];
    const n = st.n ?? 5;
    const out = buffer.length >= n ? buffer.splice(0, n) : null;
    st.held = buffer.length ? { buffer } : null;
    return out ? [['out', out]] : [];
  },
  // Deal: one card at a time, round-robin, to the sides listed in out.to.
  deal: (st, h) => {
    const piles = (st.out.to ?? []).map(() => []);
    if (!piles.length) return []; // no sides: everything is dropped
    h.forEach((x, i) => piles[i % piles.length].push(x));
    // The pile that got the last card goes last, so the croupier faces it.
    const last = (h.length - 1) % piles.length;
    return piles.map((p, i) => [i, p]).sort(([a], [b]) => (a === last) - (b === last));
  },
  // Gather ("stack"): put two hands from different sides together. The hand
  // from side `under` goes underneath; without `under`, the first one picked up does.
  gather: (st, h, d) => {
    if (!st.held) { st.held = [h, d]; return []; }
    const [first, firstSide] = st.held;
    st.held = null;
    const firstUnder = st.under === undefined ? true : firstSide === st.under;
    return [['out', firstUnder ? [...h, ...first] : [...first, ...h]]];
  },
  // War: the player's hand (any side but `dealer`) against the dealer's hand
  // (from side `dealer`). Rule 'high' compares high cards, rule 'top' compares
  // top cards; aces high. Ties go to the house.
  // Ports: win / lose for the player's hand, dwin / dlose for the dealer's.
  war: (st, h, d) => {
    const role = d === st.dealer ? 'dealer' : 'player';
    if (!st.held) { st.held = { [role]: h }; return []; }
    const { player, dealer } = { ...st.held, [role]: h };
    st.held = null;
    const value = (hand) => (st.rule === 'top' ? highValue(hand[0].c)
      : Math.max(...hand.map((x) => highValue(x.c))));
    const won = value(player) > value(dealer);
    // Winner first, so if both go to the same side the winner is on top.
    // (The croupier faces where the player's hand went; see step().)
    return won ? [['win', player], ['dlose', dealer]] : [['dwin', dealer], ['lose', player]];
  },
};

// Output whose side a croupier turns to face, when it has more than one.
const PREFER_FACING = { cut: 'bottom', burn: 'rest' };

// Which sides a waiting croupier may pick up from next.
function canTake(cell, d) {
  if (!cell.held) return true;
  if (cell.fn === 'gather') return d !== cell.held[1];
  if (cell.fn === 'war') return cell.held.player ? d === cell.dealer : d !== cell.dealer;
  return true;
}

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
  // spec.cells entries:
  //   { at:[q,r], kind:'source', out }          card player placing hands
  //   { at:[q,r], kind:'payout' }               chip desk
  //   { at:[q,r], kind:'shoe', out, deck, once } deals its stacked deck one card
  //                                             per round, repeating unless `once`
  //   { at:[q,r], kind:'croupier', fn, out:{port: side}, facing, under, dealer, rule }
  constructor(spec, inputs) {
    this.cells = new Map();
    this.round = 0;
    this.paid = [];
    this.inputs = inputs.map((h) => h.map((c) => ({ c, src: 'player' })));
    this.inputPos = 0;
    this.live = 0; // player cards on the floor, including ones held by croupiers
    for (const c of spec.cells) {
      if (c.kind === 'croupier' && !FUNCTIONS[c.fn]) throw new Error(`unknown fn ${c.fn}`);
      const cell = {
        ...c, q: c.at[0], r: c.at[1], slots: [null, null, null, null, null, null],
        pending: [], facing: c.facing ?? 0, pos: 0, held: null, out: c.out ?? {},
      };
      this.cells.set(key(cell.q, cell.r), cell);
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
    // Phases 1 and 2: read and act.
    for (const cell of this.cells.values()) {
      if (cell.kind !== 'croupier' || cell.pending.length) continue;
      if (cell.fn === 'hand' && (cell.held?.buffer.length ?? 0) >= (cell.n ?? 5)) {
        this.act(cell, null, -1);
        continue;
      }
      let found = -1;
      for (let i = 0; i < 6; i++) {
        const d = mod6(cell.facing + i);
        if (cell.slots[d] && canTake(cell, d)) { found = d; break; }
      }
      if (found < 0) continue;
      const hand = cell.slots[found];
      cell.slots[found] = null;
      cell.facing = found;
      this.act(cell, hand, found);
    }
    // Phase 3: deposit.
    for (const cell of this.cells.values()) {
      if (cell.kind === 'shoe' && !cell.pending.length && cell.out !== undefined && typeof cell.out === 'number') {
        if (!cell.once || cell.pos < cell.deck.length) {
          cell.pending = [[cell.out, [{ c: cell.deck[cell.pos++ % cell.deck.length], src: 'house' }]]];
        }
      }
      if (cell.kind === 'source' && !cell.pending.length && this.inputPos < this.inputs.length) {
        cell.pending = [[cell.out, this.inputs[this.inputPos++]]];
      }
      cell.pending = cell.pending.filter(([d, h]) => !this.deposit(cell, d, h));
    }
  }

  // Act on a hand just picked up (or, for Hand dealing from what it holds,
  // on nothing) and queue the outputs.
  act(cell, hand, found) {
    let before = (hand ? playerCards(hand) : 0) + heldCards(cell);
    let outs = FUNCTIONS[cell.fn](cell, hand, found);
    // Gather and War need two hands. If the second is already waiting, they
    // pick it up in the same round (scanning on clockwise from the first).
    if ((cell.fn === 'gather' || cell.fn === 'war') && cell.held && !outs.length) {
      for (let i = 1; i < 6; i++) {
        const d = mod6(found + i);
        if (!cell.slots[d] || !canTake(cell, d)) continue;
        const second = cell.slots[d];
        cell.slots[d] = null;
        before += playerCards(second);
        outs = FUNCTIONS[cell.fn](cell, second, d);
        break;
      }
    }
    const ports = cell.fn === 'deal' ? (cell.out.to ?? []) : cell.out;
    let face;
    for (const [port, h] of outs) {
      const side = typeof port === 'string' && port[0] === '@' ? Number(port.slice(1)) : ports[port];
      if (!h.length || side === undefined) continue; // dropped
      // Outputs to the same side are stacked into one hand, earlier ones on
      // top (cut: bottom half above top, completing the cut; set: set above rest; war: winner
      // above loser; duplicate: a above b; deal: piles in list order).
      const same = cell.pending.find(([d]) => d === side);
      if (same) same[1] = [...same[1], ...h];
      else cell.pending.push([side, h]);
      // Facing: war faces its player's hand, cut its bottom half and burn
      // its rest (else the other output), everything else its last output.
      const prefer = PREFER_FACING[cell.fn];
      if (cell.fn === 'war' ? port === 'win' || port === 'lose'
        : !prefer || port === prefer || face === undefined) face = side;
    }
    this.live += cell.pending.reduce((a, [, h]) => a + playerCards(h), 0) + heldCards(cell) - before;
    // Having handed cards on, the croupier faces the side of its last output
    // (war: the player's hand; dropped hands don't count), so it next looks
    // there and then clockwise.
    if (face !== undefined) cell.facing = face;
  }

  deposit(from, d, hand) {
    const fromSource = from.kind === 'source';
    const to = this.neighbour(from, d);
    if (!to || to.kind === 'source' || to.kind === 'shoe') { // dropped on the floor
      if (!fromSource) this.live -= playerCards(hand);
      return true;
    }
    if (to.kind === 'payout') {
      this.paid.push(cardsOf(hand));
      if (!fromSource) this.live -= playerCards(hand);
      return true;
    }
    const slot = mod6(d + 3);
    if (to.slots[slot]) return false;
    to.slots[slot] = hand;
    if (fromSource) this.live += hand.length;
    return true;
  }

  // Everything that changes while running, for stepping backwards.
  snapshot() {
    const cells = [...this.cells.values()].map((c) => ({
      slots: c.slots, pending: c.pending, held: c.held, facing: c.facing, pos: c.pos,
    }));
    return structuredClone({
      cells, round: this.round, paid: this.paid, inputPos: this.inputPos, live: this.live,
    });
  }

  restore(snap) {
    const s = structuredClone(snap);
    [...this.cells.values()].forEach((c, i) => Object.assign(c, s.cells[i]));
    Object.assign(this, { round: s.round, paid: s.paid, inputPos: s.inputPos, live: s.live });
  }

  done() {
    return this.inputPos >= this.inputs.length && this.live === 0 &&
      ![...this.cells.values()].some((c) => c.kind === 'source' && c.pending.length);
  }
}

// Run one test case. `pays(hand, history)` says whether an input hand should
// be paid out; history is the list of earlier input hands.
export function runTest(spec, inputs, pays, { maxRounds = 5000, grace = 50 } = {}) {
  const floor = new Floor(spec, inputs);
  const expected = inputs.filter((h, i) => pays(h, inputs.slice(0, i)));
  // A run ends when every player card has left the floor. Machines with
  // memory keep copies of player cards circulating forever, so a run also
  // ends `grace` rounds after the last expected payout (catching any extra
  // payouts in that window).
  let settled = null;
  while (floor.round < maxRounds && !floor.done()) {
    floor.step();
    if (floor.inputPos >= inputs.length && floor.paid.length >= expected.length) {
      settled ??= floor.round;
      if (floor.round - settled >= grace) break;
    }
  }
  const canon = (h) => [...h].sort().join(' ');
  const remaining = expected.map(canon);
  const wrong = [];
  for (const h of floor.paid) {
    const i = remaining.indexOf(canon(h));
    if (i < 0) wrong.push(h); else remaining.splice(i, 1);
  }
  const finished = floor.done() || settled !== null;
  return {
    ok: finished && !wrong.length && !remaining.length,
    rounds: floor.done() && settled === null ? floor.round : (settled ?? floor.round),
    croupiers: floor.croupierCount(), wrong, missing: remaining, timeout: !finished,
  };
}
