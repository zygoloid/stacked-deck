// Interactive simulation of one test case, with history for stepping back and
// the same pass/fail rules as runTest in src/engine.js (checked live, so a run
// can pause at the first wrong payout).
import {
  Floor, GRACE, graceOf, expectedPayouts, handKey, payoutKey, payoutHand, payoutDesk, paidPayout, MAX_FLOOR_CARDS,
} from '../engine.js';

export const MAX_ROUNDS = 5000;   // as runTest
export const JAM_ROUNDS = 200;    // no player card moved for this long: jammed
const KEEP_ALL = 400;             // keep every snapshot for the last N rounds
const CHECKPOINT = 25;            // older rounds keep one snapshot in N

export const canon = (h) => handKey(h);
// Labelled desks' names (desk 0, 1, ...), as players are lettered A, B, ...
export const DESK_NAMES = 'XYZW';

// `rule` is the level (a `pays` level or an `expected` one, optionally
// `ordered`) or a bare `pays` function, as for runTest.
export class Sim {
  constructor(spec, inputs, rule) {
    this.spec = spec;
    this.inputs = inputs;
    this.expected = expectedPayouts(rule, inputs);
    this.ordered = typeof rule === 'object' && !!rule?.ordered;
    this.inOrder = typeof rule === 'object' && !!rule?.inOrder;
    this.grace = graceOf(rule) ?? GRACE;
    // `expected` levels list their payouts; `pays` levels pay input hands.
    this.listed = typeof rule === 'object' && typeof rule?.expected === 'function';
    this.reset();
  }

  // Keys of an expected payout ({ desk, hand } on a floor with labelled
  // desks) and of the n-th payout made.
  key(p) { return payoutKey(p, this.ordered); }
  paidKey(n) { return this.key(paidPayout(this.floor, n)); }

  reset() {
    this.floor = new Floor(this.spec, this.inputs);
    this.snaps = new Map([[0, this.floor.snapshot()]]);
    this.settled = null;
    this.drained = null;
    this.lastMove = 0;
    this.sig = this.signature();
    this.status = { kind: 'ready' };
    this.paidNow = null;
    this.paidNowDesk = undefined;
    this.paidWrong = false;
  }

  get round() { return this.floor.round; }
  get finished() { return ['passed', 'wrong', 'missing', 'timeout', 'jam', 'overflow'].includes(this.status.kind); }

  // Player-card positions: if this stops changing, nothing is happening.
  signature() {
    const f = this.floor;
    const parts = [f.inputPos, f.paid.length];
    const pc = (h) => (h ? h.filter((x) => x.src === 'player').map((x) => x.c).join('') : '');
    for (const c of f.cells.values()) {
      parts.push(c.slots.map(pc).join('/'), c.pending.map(([d, h]) => d + pc(h)).join('/'));
      if (c.held) parts.push(JSON.stringify(c.held));
    }
    return parts.join('|');
  }

  // Match paid hands against the expected payouts (as card multisets, or
  // card sequences when the level is ordered), as runTest does. `matched[i]`
  // is the number (1-based) of the payout that matched expected[i], or 0.
  tally() {
    if (this.inOrder) {
      // The n-th payout must be expected[n].
      const matched = this.expected.map((x, i) => (i < this.floor.paid.length && this.paidKey(i) === this.key(x) ? i + 1 : 0));
      const paid = this.floor.paid.map((h, n) => ({ h, desk: this.floor.paidAt[n], ok: !!matched[n] }));
      return { paid, matched, missing: this.expected.filter((x, i) => !matched[i]) };
    }
    const remaining = this.expected.map((h, i) => ({ h, i, k: this.key(h) }));
    const matched = this.expected.map(() => 0);
    const paid = this.floor.paid.map((h, n) => {
      const desk = this.floor.paidAt[n];
      const j = remaining.findIndex((x) => x.k === this.paidKey(n));
      if (j < 0) return { h, desk, ok: false };
      matched[remaining[j].i] = n + 1;
      remaining.splice(j, 1);
      return { h, desk, ok: true };
    });
    return { paid, matched, missing: remaining.map((x) => x.h) };
  }

  // Why a paid hand (paid at `desk`) matched nothing.
  wrongReason(hand, desk) {
    const k = this.key(desk === undefined ? hand : { desk, hand });
    const dup = this.expected.some((x) => this.key(x) === k);
    if (desk !== undefined && !dup) {
      const same = (x) => handKey(payoutHand(x), this.ordered) === handKey(hand, this.ordered);
      const there = this.expected.find(same);
      if (there) return `Paid out a hand at desk ${DESK_NAMES[desk]} that belongs at desk ${DESK_NAMES[payoutDesk(there)]}.`;
    }
    if (!this.listed) return dup ? 'Paid out a winning hand a second time.' : 'Paid out a hand that should have been dropped.';
    if (this.inOrder && dup) return 'Paid out a hand out of turn (payouts must come in the order listed).';
    if (dup) return 'Paid out that hand more times than expected.';
    if (this.ordered && this.expected.some((x) => canon(payoutHand(x)) === canon(hand))) return 'Paid out a hand with its cards in the wrong order (card order matters here).';
    return 'Paid out a hand that isn\'t one of the expected payouts.';
  }

  // Advance one round. Returns the status kind.
  step() {
    if (this.finished) return this.status.kind;
    const f = this.floor;
    const before = f.paid.length;
    f.step();
    this.status = { kind: 'running' };
    this.paidNow = null;
    this.paidNowDesk = undefined;
    this.paidWrong = false;
    this.store();
    const sig = this.signature();
    if (sig !== this.sig) { this.sig = sig; this.lastMove = f.round; }
    if (f.overflowed()) {
      const { missing } = this.tally();
      this.status = { kind: 'overflow', missing, msg: `Too many cards: more than ${MAX_FLOOR_CARDS} on the floor in round ${f.round}.` };
      return this.status.kind;
    }

    if (f.paid.length > before) {
      const t = this.tally();
      this.paidNow = f.paid[f.paid.length - 1];
      this.paidNowDesk = f.paidAt[f.paidAt.length - 1];
      const bad = t.paid.slice(before).find((x) => !x.ok);
      if (bad) {
        this.paidWrong = true;
        this.paidNow = bad.h;
        this.paidNowDesk = bad.desk;
        this.status = { kind: 'wrong', hand: bad.h, desk: bad.desk, msg: this.wrongReason(bad.h, bad.desk) };
        return this.status.kind;
      }
    }
    const allPaid = f.allDealt() && f.paid.length >= this.expected.length;
    if (allPaid) this.settled ??= f.round;
    // Player cards all gone but payouts still owed: house cards may still be
    // on their way to the desk, so allow the grace rounds (as runTest does).
    if (f.done() && !allPaid) this.drained ??= f.round;
    const t = () => this.tally();
    if ((f.done() && (allPaid || f.round - this.drained >= this.grace)) ||
        (!f.done() && this.settled !== null && f.round - this.settled >= this.grace)) {
      const { missing } = t();
      this.status = missing.length
        ? { kind: 'missing', missing, msg: `Every card has left the floor, but ${missing.length} ${this.listed ? 'expected payout' : 'winning hand'}${missing.length > 1 ? 's were' : ' was'} never paid.` }
        : { kind: 'passed', rounds: this.settled ?? f.round, msg: `Test passed in ${this.settled ?? f.round} rounds.` };
    } else if (f.round >= MAX_ROUNDS) {
      const { missing } = t();
      this.status = { kind: 'timeout', missing, msg: `Out of time after ${MAX_ROUNDS} rounds.` };
    } else if (f.round - this.lastMove >= JAM_ROUNDS) {
      const { missing } = t();
      this.status = { kind: 'jam', missing, msg: `Jammed: no player card has moved for ${JAM_ROUNDS} rounds.` };
    }
    return this.status.kind;
  }

  store() {
    const r = this.floor.round;
    this.snaps.set(r, this.floor.snapshot());
    const old = r - KEEP_ALL;
    if (old > 0 && old % CHECKPOINT) this.snaps.delete(old);
  }

  // Go back one round (restoring the nearest snapshot and replaying if needed).
  back() {
    const target = this.floor.round - 1;
    if (target < 0) return;
    let from = target;
    while (!this.snaps.has(from)) from--;
    this.floor.restore(this.snaps.get(from));
    while (this.floor.round < target) this.floor.step();
    for (const k of this.snaps.keys()) if (k > target) this.snaps.delete(k);
    this.snaps.set(target, this.floor.snapshot());
    if (this.settled !== null && this.settled > target) this.settled = null;
    if (this.drained !== null && this.drained > target) this.drained = null;
    this.lastMove = Math.min(this.lastMove, target);
    this.sig = this.signature();
    this.status = { kind: target === 0 ? 'ready' : 'paused' };
    this.paidNow = null;
    this.paidNowDesk = undefined;
    this.paidWrong = false;
  }
}
