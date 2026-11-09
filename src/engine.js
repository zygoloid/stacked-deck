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
// 'player' or 'house') for drawing them; the rules never look at it.

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
//   8  deal builds one pile per side, each card on top (piles reverse order)
//   9  a run fails once more than MAX_FLOOR_CARDS cards are on the floor; a
//      floor is cleared only if the machine also passes its check deals
//      (random deals seeded from the machine itself; see src/score.js); the
//      rounds score is the total over the tests, not the rounded average
//  10  a run stops when the floor repeats a state with no progress (a hand
//      dealt or a payout) since, or after STALL_ROUNDS rounds without
//      progress, or at a wrong payout; player and house cards alike (see Run)
// (The card limit going from 1000 to 2000 and Hand's n from 13 to 52 at
// most are not rules changes either: no machine that cleared a floor before
// behaves differently.)
// (Seated players, `seat` on a source, seats with fewer hands than others,
// labelled desks, `desk` on a payout, and `inOrder` payouts are level
// features: no rule changed.)
export const RULES_VERSION = 10;

// A machine can multiply cards without bound (two duplicates feeding each
// other quadruple them every four rounds), so a run fails once more than this
// many cards are on the floor. It only guards against runaway machines:
// no reference solution has more than about 600.
export const MAX_FLOOR_CARDS = 2000;

export const DIRS = [[1, 0], [0, 1], [-1, 1], [-1, 0], [0, -1], [1, -1]];
export const DIR_NAMES = ['E', 'SE', 'SW', 'W', 'NW', 'NE'];
const key = (q, r) => `${q},${r}`;
const mod6 = (n) => ((n % 6) + 6) % 6;

const cardsOf = (hand) => hand.map((x) => x.c);
const playerCards = (hand) => hand.filter((x) => x.src === 'player').length;
// The hands a croupier is holding (gather: [hand, side]; war: {player,
// dealer}; hand: {buffer}).
const heldHands = (cell) => {
  if (!cell.held) return [];
  if (cell.fn === 'gather') return [cell.held[0]];
  return Object.values(cell.held);
};
const heldCards = (cell) => heldHands(cell).reduce((a, h) => a + playerCards(h), 0);

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
    // Cards are dealt one at a time onto one pile per side, each new card on
    // top, so a pile holds its cards in reverse deal order (a side listed
    // more than once still has just one pile).
    const sides = st.out.to ?? [];
    if (!sides.length) return []; // no sides: everything is dropped
    const piles = new Map();
    let last;
    h.forEach((x, i) => {
      const side = sides[i % sides.length];
      if (side === undefined || side === null) return; // dropped
      if (!piles.has(side)) piles.set(side, []);
      piles.get(side).unshift(x);
      last = side;
    });
    // The pile that got the last card goes last, so the croupier faces it.
    return [...piles].sort(([a], [b]) => (a === last) - (b === last)).map(([side, pile]) => [`@${side}`, pile]);
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
    this.paidAt = []; // the desk (its `desk` label) each payout went to
    // For drawing the last step (not part of the state): the hands (card
    // objects, not just cards) paid in it, in order, and each card Duplicate
    // made in it -> the card it is a copy of.
    this.justPaid = [];
    this.copiedFrom = new Map();
    // On a seated floor a test may give a player fewer hands than the others:
    // their missing hands are null (always after their last real hand).
    this.inputs = inputs.map((h) => h && h.map((c) => ({ c, src: 'player' })));
    this.total = inputs.filter(Boolean).length; // hands to deal
    this.inputPos = 0; // hands dealt so far (by all players)
    this.live = 0; // player cards on the floor, including ones held by croupiers
    // Seated players (sources with a `seat`) each deal their own hands: with
    // n seats, hand i belongs to seat i % n. Unseated players share one queue.
    this.seats = Math.max(0, ...spec.cells.filter((c) => c.kind === 'source' && c.seat !== undefined)
      .map((c) => c.seat + 1));
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

  // Cards on the floor: in slots, held by croupiers, or waiting to be placed
  // by them (not the players' and shoes' next hands).
  cardCount() {
    let n = 0;
    for (const c of this.cells.values()) {
      for (const h of c.slots) if (h) n += h.length;
      for (const h of heldHands(c)) n += h.length;
      if (c.kind === 'croupier') for (const [, h] of c.pending) n += h.length;
    }
    return n;
  }

  // More than MAX_FLOOR_CARDS cards on the floor: the run has failed.
  overflowed() {
    return this.cardCount() > MAX_FLOOR_CARDS;
  }

  croupierCount() {
    let n = 0;
    for (const c of this.cells.values()) if (c.kind === 'croupier' || c.kind === 'shoe') n++;
    return n;
  }

  step() {
    this.round++;
    this.justPaid = [];
    this.copiedFrom = new Map();
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
      if (cell.kind === 'shoe' && !cell.pending.length && shoeDeals(cell)) {
        cell.pending = [[cell.out, [{ c: cell.deck[cell.pos++ % cell.deck.length], src: 'house' }]]];
      }
      if (cell.kind === 'source' && !cell.pending.length) {
        const i = this.seats ? (cell.seat ?? 0) + cell.pos * this.seats : this.inputPos;
        if (i < this.inputs.length && this.inputs[i]) {
          cell.pending = [[cell.out, this.inputs[i]]];
          cell.pos++;
          this.inputPos++;
        }
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
    if (cell.fn === 'duplicate') {
      const [[, a], [, b]] = outs;
      b.forEach((x, i) => this.copiedFrom.set(x, a[i]));
    }
    const ports = cell.fn === 'deal' ? (cell.out.to ?? []) : cell.out;
    let face;
    for (const [port, h] of outs) {
      const side = typeof port === 'string' && port[0] === '@' ? Number(port.slice(1)) : ports[port];
      if (!h.length || side === undefined) continue; // dropped
      // Outputs to the same side are stacked into one hand, earlier ones on
      // top (cut: bottom half above top, completing the cut; set: set above rest; war: winner
      // above loser; duplicate: a above b; deal builds its own piles).
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

  // Every hand has been dealt.
  allDealt() {
    return this.inputPos >= this.total;
  }

  // Whether input hand i has been dealt.
  dealt(i) {
    if (!this.seats) return i < this.inputPos;
    const src = [...this.cells.values()].find((c) => c.kind === 'source' && (c.seat ?? 0) === i % this.seats);
    return !!src && Math.floor(i / this.seats) < src.pos;
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
      this.paidAt.push(to.desk);
      this.justPaid.push(hand);
      if (!fromSource) this.live -= playerCards(hand);
      return true;
    }
    const slot = mod6(d + 3);
    if (to.slots[slot]) return false;
    to.slots[slot] = hand;
    if (fromSource) this.live += hand.length;
    return true;
  }

  // Everything that changes while running, for stepping backwards (and
  // Run.fork). Hands, their cards and held hands are never changed once
  // made, only replaced, so a snapshot shares them: it copies just the
  // arrays that are changed in place (slots, pending, the payouts).
  snapshot() {
    const cells = [...this.cells.values()].map((c) => ({
      slots: [...c.slots], pending: c.pending.map(([d, h]) => [d, h]), held: c.held, facing: c.facing, pos: c.pos,
    }));
    return {
      cells, round: this.round, paid: [...this.paid], paidAt: [...this.paidAt], inputPos: this.inputPos, live: this.live,
    };
  }

  // Back to a snapshot (which stays as it was, to restore again).
  restore(s) {
    [...this.cells.values()].forEach((c, i) => {
      const { slots, pending, held, facing, pos } = s.cells[i];
      Object.assign(c, { slots: [...slots], pending: pending.map(([d, h]) => [d, h]), held, facing, pos });
    });
    Object.assign(this, { round: s.round, paid: [...s.paid], paidAt: [...s.paidAt], inputPos: s.inputPos, live: s.live });
  }

  // Every player card has left the floor (house cards may still be on it).
  done() {
    return this.allDealt() && this.live === 0 &&
      ![...this.cells.values()].some((c) => c.kind === 'source' && c.pending.length);
  }

  // Everything the floor's future depends on, as of now: the cards (not
  // where they came from) in every slot, held and waiting to be placed,
  // each croupier's facing, how far each shoe and player has dealt, and the
  // progress so far (hands dealt, payouts made). Hands are never changed
  // once made, so this keeps references to them and costs little; sameAs
  // compares the floor with one, stopping at the first difference.
  mark() {
    const cells = [];
    for (const c of this.cells.values()) {
      if (c.kind === 'payout') continue;
      cells.push([c, c.facing, shoePos(c), [...c.slots], c.pending.map(([d, h]) => [d, h]), c.held]);
    }
    return { inputPos: this.inputPos, paid: this.paid.length, cells };
  }

  sameAs(m) {
    if (m.inputPos !== this.inputPos || m.paid !== this.paid.length) return false;
    for (const [c, facing, pos, slots, pending, held] of m.cells) {
      if (c.facing !== facing || shoePos(c) !== pos || c.pending.length !== pending.length) return false;
      for (let d = 0; d < 6; d++) if (!sameHand(c.slots[d], slots[d])) return false;
      for (let i = 0; i < pending.length; i++) {
        if (c.pending[i][0] !== pending[i][0] || !sameHand(c.pending[i][1], pending[i][1])) return false;
      }
      if (c.held !== held && !sameHeld(c.held, held)) return false;
    }
    return true;
  }
}

// How far a cell has dealt, as far as its future goes (a repeating shoe
// starts its deck again).
const shoePos = (c) => (c.kind === 'shoe' && !c.once ? c.pos % c.deck.length : c.pos);
// Hands (arrays of {c, src}) with the same cards in the same order, or both
// none; and croupiers' held hands (see heldHands), likewise.
const sameHand = (a, b) => a === b || (!!a && !!b && a.length === b.length && a.every((x, i) => x.c === b[i].c));
const sameHeld = (a, b) => {
  if (!a || !b) return a === b;
  if (Array.isArray(a)) return a[1] === b[1] && sameHand(a[0], b[0]); // gather: [hand, side]
  const ka = Object.keys(a), kb = Object.keys(b);
  return ka.length === kb.length && ka.every((k) => sameHand(a[k], b[k]));
};

// Whether a shoe will deal another card (a shoe dealing `once` runs out).
const shoeDeals = (cell) => typeof cell.out === 'number' && (!cell.once || cell.pos < cell.deck.length);

// What the chip desk should receive for one test. `rule` is either a
// `pays(hand, earlierHands)` function (pay out a subset of the input hands)
// or a level-like object with `expected(inputs)` returning the list of hands
// to pay, which may repeat hands, regroup cards or use house cards (on a
// floor with labelled desks, as { desk, hand }); a `pays` field works too.
// On a floor whose players have different numbers of hands, `inputs` holds
// null for each missing hand.
export function expectedPayouts(rule, inputs) {
  const pays = typeof rule === 'function' ? rule : rule.pays;
  if (typeof rule === 'object' && typeof rule.expected === 'function') return rule.expected(inputs);
  return inputs.filter((h, i) => pays(h, inputs.slice(0, i)));
}

// Hands are compared as multisets of cards unless the level says `ordered`:
// `true` compares them card for card, top card first; a list of places
// (0 for the top card) compares the cards in those places, and the rest of
// the hand as a multiset.
export const handKey = (hand, ordered = false) => {
  if (Array.isArray(ordered)) return `${ordered.map((i) => hand[i] ?? '-').join(' ')} / ${[...hand].sort().join(' ')}`;
  return (ordered ? [...hand] : [...hand].sort()).join(' ');
};

// On a floor with labelled desks (`desk: 0, 1, ...` on each payout cell) an
// expected payout is { desk, hand }: that hand, paid at that desk. Elsewhere
// it is just the hand. These read either form.
export const payoutHand = (p) => (Array.isArray(p) ? p : p.hand);
export const payoutDesk = (p) => (Array.isArray(p) ? undefined : p.desk);
// A payout's key for matching: its hand's key, and its desk if it has one.
export const payoutKey = (p, ordered = false) => {
  const desk = payoutDesk(p);
  return (desk === undefined ? '' : `@${desk} `) + handKey(payoutHand(p), ordered);
};
// What a floor actually paid, in the same form: the n-th payout.
export const paidPayout = (floor, n) => (floor.paidAt[n] === undefined ? floor.paid[n] : { desk: floor.paidAt[n], hand: floor.paid[n] });

// Rounds a run may go without progress before it is taken never to make
// any more (see Run). It must be at least the longest stretch without
// progress of any machine that should work: 525 for the reference
// solutions (Times Tables filling its table before taking the second hand)
// and 171 for every player's machine when it was set. See "When a run
// stops" in docs/architecture.md.
export const STALL_ROUNDS = 1000;

// A run of one test against `rule` (see expectedPayouts), checked round by
// round: runTest, and the editor's step-by-step simulator. Progress is
// irreversible: a player handing over a hand, or a payout. Payouts may
// arrive in any order; each must match a distinct expected hand (at its
// desk, on a floor with labelled desks), and with `inOrder: true` the n-th
// payout must be the n-th expected. A run stops at:
//   wrong     a payout matching none still owed: it can never be put right;
//   overflow  more than MAX_FLOOR_CARDS cards on the floor;
//   cycle     a state (Floor.mark) it was in before, with no progress
//             since: it is going round a loop and will never progress again
//             (found as in Brent's algorithm: the floor is compared with a
//             state saved 1, 2, 4, 8, ... rounds after the last progress,
//             so a loop is found within about twice its start and length);
//   stall     `stall` rounds (STALL_ROUNDS) without progress: taken to mean
//             that it never will.
// Every way to stop treats house and player cards alike. A run passes if
// it stopped at a cycle or a stall with every hand dealt and every expected
// payout made, and it scores the round of its last progress.
export class Run {
  constructor(spec, inputs, rule, { stall = STALL_ROUNDS } = {}) {
    Object.assign(this, { spec, inputs, rule, stall });
    this.floor = new Floor(spec, inputs);
    this.expected = expectedPayouts(rule, inputs);
    this.ordered = typeof rule === 'object' && (Array.isArray(rule?.ordered) ? rule.ordered : !!rule?.ordered);
    this.inOrder = typeof rule === 'object' && !!rule?.inOrder;
    this.keys = this.expected.map((p) => payoutKey(p, this.ordered));
    this.reset();
  }

  // Back to round `floor.round` (after floor.restore), or to the start.
  reset() {
    const f = this.floor;
    this.matched = this.expected.map(() => 0); // the payout (1-based) that matched each
    this.wrong = null;                          // the first wrong payout's number (0-based)
    this.checked = 0;
    for (let n = 0; n < f.paid.length && this.wrong === null; n++) this.check(n);
    this.progress = (this.progress ?? []).filter((r) => r <= f.round); // rounds with progress
    this.dealt = f.inputPos;
    this.watch();
    this.stop = null;
  }

  get round() { return this.floor.round; }
  get last() { return this.progress?.length ? this.progress[this.progress.length - 1] : 0; }
  // Every hand dealt and every expected payout made: any more progress
  // would be a wrong payout.
  get complete() { return this.floor.allDealt() && this.matched.every(Boolean); }
  get passed() { return (this.stop === 'cycle' || this.stop === 'stall') && this.complete; }
  get missing() { return this.expected.filter((_, i) => !this.matched[i]); }
  // The longest run of rounds between one progress and the next (or the start).
  get maxGap() { return this.progress.reduce((a, r, i) => Math.max(a, r - (i ? this.progress[i - 1] : 0)), 0); }

  // Match the n-th payout; false if it is wrong.
  check(n) {
    const k = payoutKey(paidPayout(this.floor, n), this.ordered);
    const i = this.inOrder ? (this.keys[n] === k ? n : -1) : this.keys.findIndex((x, j) => !this.matched[j] && x === k);
    this.checked = n + 1;
    if (i < 0) { this.wrong = n; return false; }
    this.matched[i] = n + 1;
    return true;
  }

  // Look for a loop from the state the floor is in now.
  watch() {
    this.saved = this.floor.mark();
    this.savedAt = this.floor.round;
    this.power = 1;
  }

  // Advance one round; returns the reason it stopped, or null.
  step() {
    if (this.stop) return this.stop;
    const f = this.floor;
    f.step();
    if (f.overflowed()) return (this.stop = 'overflow');
    const paidBefore = this.checked;
    while (this.checked < f.paid.length) if (!this.check(this.checked)) return (this.stop = 'wrong');
    if (f.inputPos !== this.dealt || this.checked !== paidBefore) {
      this.dealt = f.inputPos;
      this.progress.push(f.round);
      this.watch(); // no earlier state can come back
    } else if (f.sameAs(this.saved)) {
      this.cycleFrom = this.savedAt; // the round it was in this state before
      return (this.stop = 'cycle');
    } else if (f.round - this.savedAt === this.power) {
      this.saved = f.mark();
      this.savedAt = f.round;
      this.power *= 2;
    }
    if (f.round - this.last >= this.stall) return (this.stop = 'stall');
    return null;
  }

  // A copy to run ahead on, leaving this one where it is.
  fork() {
    const r = new Run(this.spec, this.inputs, this.rule, { stall: this.stall });
    r.floor.restore(this.floor.snapshot());
    Object.assign(r, { matched: [...this.matched], wrong: this.wrong, checked: this.checked, dealt: this.dealt });
    r.progress = [...this.progress];
    r.watch();
    return r;
  }
}

// Run one test case to the end (see Run). `maxRounds` (for tools) gives up
// sooner, as stop 'limit'.
export function runTest(spec, inputs, rule, { stall = STALL_ROUNDS, maxRounds = Infinity } = {}) {
  const run = new Run(spec, inputs, rule, { stall });
  while (!run.step()) if (run.round >= maxRounds) { run.stop = 'limit'; break; }
  const f = run.floor;
  return {
    ok: run.passed,
    rounds: run.passed ? run.last : f.round,
    croupiers: f.croupierCount(),
    wrong: run.wrong === null ? [] : [f.paid[run.wrong]],
    missing: run.missing.map((p) => payoutKey(p, run.ordered)),
    undealt: f.total - f.inputPos,
    stop: run.stop,
    maxGap: run.maxGap,
    overflow: run.stop === 'overflow',
  };
}
