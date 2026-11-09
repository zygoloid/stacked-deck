// Interactive simulation of one test case, with history for stepping back,
// checked by the engine's Run (the same rules as runTest in src/engine.js),
// so a run can pause at the first wrong payout. Once the last hand is dealt
// and the last expected payout made, it runs a copy ahead to see whether
// the floor would still pass, and if so stops there.
import {
  Run, handKey, payoutKey, payoutHand, payoutDesk, paidPayout, MAX_FLOOR_CARDS,
} from '../engine.js';

const KEEP_ALL = 400;             // keep every snapshot for the last N rounds
const CHECKPOINT = 25;            // older rounds keep one snapshot in N

export const canon = (h) => handKey(h);
// The places a floor with `ordered: [places]` checks, in words: "11th from
// the top", "1st and 3rd from the top".
const nth = (n) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
export const placesText = (places) => {
  const ns = places.map((i) => nth(i + 1));
  return `${ns.length > 1 ? `${ns.slice(0, -1).join(', ')} and ${ns[ns.length - 1]}` : ns[0]} from the top`;
};
// Labelled desks' names (desk 0, 1, ...), as players are lettered A, B, ...
export const DESK_NAMES = 'XYZW';

// `rule` is the level (a `pays` level or an `expected` one, optionally
// `ordered`) or a bare `pays` function, as for runTest.
export class Sim {
  constructor(spec, inputs, rule) {
    this.spec = spec;
    this.inputs = inputs;
    this.rule = rule;
    this.run = new Run(spec, inputs, rule);
    this.expected = this.run.expected;
    this.ordered = this.run.ordered;
    this.inOrder = this.run.inOrder;
    // `expected` levels list their payouts; `pays` levels pay input hands.
    this.listed = typeof rule === 'object' && typeof rule?.expected === 'function';
    this.reset();
  }

  // Keys of an expected payout ({ desk, hand } on a floor with labelled
  // desks) and of the n-th payout made.
  key(p) { return payoutKey(p, this.ordered); }
  paidKey(n) { return this.key(paidPayout(this.floor, n)); }

  reset() {
    if (this.run.round) this.run = new Run(this.spec, this.inputs, this.rule);
    this.snaps = new Map([[0, this.floor.snapshot()]]);
    // Round -> the cards Duplicate made in it (copy -> original), for
    // drawing a step back from it (the copies go back into their originals).
    this.copies = new Map();
    this.lookedAhead = null; // the round it last ran a copy ahead from
    this.status = { kind: 'ready' };
    this.paidNow = null;
    this.paidNowDesk = undefined;
    this.paidWrong = false;
  }

  get floor() { return this.run.floor; }
  get round() { return this.floor.round; }
  get finished() { return ['passed', 'wrong', 'missing', 'overflow'].includes(this.status.kind); }

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
    if (this.ordered && this.expected.some((x) => canon(payoutHand(x)) === canon(hand))) {
      return Array.isArray(this.ordered)
        ? `Paid out a hand with the wrong card ${placesText(this.ordered)}.`
        : 'Paid out a hand with its cards in the wrong order (card order matters here).';
    }
    return 'Paid out a hand that isn\'t one of the expected payouts.';
  }

  // Advance one round. Returns the status kind.
  step() {
    if (this.finished) return this.status.kind;
    const run = this.run, f = this.floor;
    const before = f.paid.length;
    const stop = run.step();
    this.status = { kind: 'running' };
    this.paidNow = null;
    this.paidNowDesk = undefined;
    this.paidWrong = false;
    this.store();
    if (stop === 'overflow') {
      this.status = { kind: 'overflow', missing: run.missing, msg: `Too many cards: more than ${MAX_FLOOR_CARDS} on the floor in round ${f.round}.` };
      return this.status.kind;
    }
    if (f.paid.length > before) {
      // paidNow is the hand as card objects ({c, src}), so the board can
      // tell which copy of a card went to the desk.
      this.paidNow = f.justPaid[f.justPaid.length - 1];
      this.paidNowDesk = f.paidAt[f.paidAt.length - 1];
      if (stop === 'wrong') {
        const h = f.paid[run.wrong], desk = f.paidAt[run.wrong];
        this.paidWrong = true;
        this.paidNow = f.justPaid[run.wrong - before];
        this.paidNowDesk = desk;
        this.status = { kind: 'wrong', hand: h, desk, msg: this.wrongReason(h, desk) };
        return this.status.kind;
      }
    }
    // Everything dealt and paid: any more progress would be a wrong payout.
    // If a copy run on to the end passes, so does this run, and it stops now.
    if (!stop && run.complete && this.lookedAhead === null) {
      this.lookedAhead = f.round;
      const ahead = run.fork();
      while (!ahead.step());
      if (ahead.passed) return this.end(ahead);
    }
    if (stop) return this.end(run);
    return this.status.kind;
  }

  // The status once `run` (this run, or a copy run ahead) has stopped at a
  // cycle or a stall.
  end(run) {
    if (run.passed) {
      this.status = { kind: 'passed', rounds: run.last, msg: `Test passed in ${run.last} rounds.` };
      return this.status.kind;
    }
    const { missing } = run;
    const undealt = run.floor.total - run.floor.inputPos;
    const what = [
      missing.length ? `${missing.length} ${this.listed ? 'expected payout' : 'winning hand'}${missing.length > 1 ? 's were' : ' was'} never paid` : '',
      undealt ? `${undealt} hand${undealt > 1 ? 's were' : ' was'} never dealt` : '',
    ].filter(Boolean).join(', and ');
    this.status = { kind: 'missing', missing, msg: `${what[0].toUpperCase()}${what.slice(1)}.` };
    return this.status.kind;
  }

  store() {
    const r = this.floor.round;
    this.snaps.set(r, this.floor.snapshot());
    this.storeCopies(r);
    const old = r - KEEP_ALL;
    if (old > 0 && old % CHECKPOINT) this.snaps.delete(old);
    // (Stepping back past here replays, making new cards: no use for these.)
    if (old > 0) this.copies.delete(old);
  }

  storeCopies(r) {
    if (this.floor.copiedFrom.size) this.copies.set(r, this.floor.copiedFrom);
    else this.copies.delete(r);
  }

  // Go back one round (restoring the nearest snapshot and replaying if
  // needed). Returns false if there is no round to go back to; else, for
  // drawing it, { copiedFrom }: the cards Duplicate made in the round undone.
  back() {
    const target = this.floor.round - 1;
    if (target < 0) return false;
    const copiedFrom = this.copies.get(this.floor.round) ?? new Map();
    let from = target;
    while (!this.snaps.has(from)) from--;
    this.floor.restore(this.snaps.get(from));
    while (this.floor.round < target) this.floor.step();
    if (from < target) this.storeCopies(target);
    this.floor.copiedFrom = this.copies.get(target) ?? new Map();
    this.floor.justPaid = [];
    this.run.reset();
    for (const k of this.snaps.keys()) if (k > target) this.snaps.delete(k);
    for (const k of this.copies.keys()) if (k > target) this.copies.delete(k);
    this.snaps.set(target, this.floor.snapshot());
    if (this.lookedAhead !== null && this.lookedAhead > target) this.lookedAhead = null;
    this.status = { kind: target === 0 ? 'ready' : 'paused' };
    this.paidNow = null;
    this.paidNowDesk = undefined;
    this.paidWrong = false;
    return { copiedFrom };
  }
}
