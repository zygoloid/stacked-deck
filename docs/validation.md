# Validating the core idea with example puzzles

To check the rules, `src/engine.js` simulates a floor and `test/run.js` runs
each machine in `solutions/` against fixed and random tests (`npm test`).
Each solution file includes an ASCII map. Map key: `in>` is a card player
with an arrow showing which way they hand cards, `$$` is the chip desk, `XX`
is scratch, `3\` is a shoe dealing 3s, `G3`/`P2` are a gather/pass with
offset 3/2, and `~` marks a flipped croupier.

## Rules I had to pin down

These are my picks. The simulator implements them, and all of them can be changed.

* **Geometry.** Pointy-top hexes, directions numbered clockwise from east.
  Each table has one input slot per side. "Output at input+n" means the side
  n steps clockwise from the side the hand came in on, so `+3` is straight through.
* **A round** has three steps. First every free croupier picks up one hand
  (from the side it faces, otherwise the next filled slot clockwise). Then it
  acts. Then all outputs are placed at once. A slot emptied this round can
  be refilled this round. A croupier whose output is blocked holds it and does
  nothing else until it can place it. Empty hands are never placed. Cards
  handed to a side with no table count as *dropped on the floor*, which fails the test.
* **Gather** (your first "Stack") holds the first hand it picks up. It then
  waits for a hand from a *different* side, puts that hand on top, and outputs
  at (second side)+n. It keeps facing the first side. So if a shoe feeds it,
  the shoe card always ends up at the bottom. This matters a lot (see below).
* **Shoe** (your second "Stack") deals one card per round from a stacked deck
  that repeats, in a fixed direction. It's a croupier and counts as one.
* **Straight**: distinct ranks in a row, ace high or low, no wrapping. **Flush**:
  every card the same suit. A single card counts as both.
* **Cut**: the top floor(n/2) cards go to +2 and the rest to +4. **Set**: cards of
  the rank(s) tied for the highest count go to +2 and the rest go to +4.
* **Checking a run.** A test passes once every player card has left the floor
  (paid out or scratched), every paid hand is a winning input hand, and every
  winning hand was paid. Payout **order is not checked**. A hand counts as the
  same if it has the same cards, whatever their order.

## Results

| Puzzle | Rules | Croupiers | Rounds | Status |
|---|---|---|---|---|
| Even card (1-card hands) | core | 20 (25 with one chip desk) | 55 for 26 cards | built, passes |
| Contains an ace (5-card hands) | core + War | **2** | 11 for 10 hands | built, passes |
| Contains an ace | core only | ~45 (estimate) | — | design sketch only |
| Largest set so far | core | far bigger (estimate) | — | analysis only |

### Even card, core croupiers only (`solutions/even-core.js`)

```
 .     .    XX     .     .     .     .     .     .
   3\     .    Cut   $$    XX     .     .     .     .
in>   G3    Str   7\     .    Cut   $$    XX     .
    .     .    Cut~  G3    Str   J\     .    Cut   $$
 .     .    XX     .     .    Cut~  G3    Str    .
    .     .     .     .    XX     .     .    XX     .
```

**Every core test is trivially true for a single card**: one card is a
straight, a flush and a set. So with one-card hands a machine can't tell cards
apart on its own. It has to **borrow a reference card** from a shoe. This
solution chains three stages with references 3, 7 and J:

1. The gather puts the shoe's card R under X, giving `[R, X]`.
2. Straight: `[R, X]` is a straight exactly when X is next to R. So the three
   stages catch {2,4}, {6,8} and {10,Q}.
3. A cut on either branch splits R (top half) away from X (bottom half).
   R goes to scratch, and X goes to the desk or on to the next stage.

Each stage is about 6 croupiers. A single stage on its own ("pay 2s and 4s")
is a nice early "aha" level. The whole machine fits in about a 6×9 patch.
Throughput is 2 rounds per card, because each gather takes two pickups.

Parity is an awkward property for card tests. Any comparison-style croupier
needs about one test per two values, because even ranks alternate with odd ones. Tests like "face card", "red card" or "higher
than 8" fit cards much better for early puzzles.

### Contains an ace, with a proposed War dealer (`solutions/ace-war.js`)

```
in>   WA    $$
    .    XX
```

**War** (Casino War): for each hand, the dealer turns over the next card of a
stacked house deck and compares it with the hand's high card, ace high.
Higher goes to +2, lower to +4, and a tie ("push") passes straight through at +3.
The house card goes to the discard. With a house deck of nothing but aces, a
push means "this hand contains an ace". That's 2 croupiers.

### Contains an ace with core croupiers only: possible, but about 45 croupiers

This is the most important finding. **No core croupier can send a whole hand
one way or the other based on part of its contents.** Straight and Flush move
whole hands but test the whole hand. Set and Cut look at parts, but they
*split* the hand. My best plan was:

1. Duplicate H. Gather one copy with 5 reference aces of mixed suits, then Set:
   the aces group has 5+k cards, where k is the number of aces in H.
2. Set that group against 6 K♥. With no ace the K♥s win alone and come out as
   a flush. With an ace they tie or lose, and the result is not a flush. A
   Flush croupier then gives two signal streams, "ace" and "no ace", and
   exactly one fires for each hand.
3. Swap the "ace" signal for a fixed 5-card token, using another Gather + Set
   against 5 Qs.
4. Gate the other copy of H. A gather holds H and outputs relative to the
   side the signal came in on. So "ace" and "no ace" leave in different
   directions. On the ace side, `[H, token]` is cut 5/5 to get H back.

Each reference hand of 5–6 cards needs about 5 shoes and 4 gathers to build,
because a shoe deals one card at a time. That adds up to about 45 croupiers.
It shows the core set *can* do it, but a puzzle that sounds this simple
shouldn't need a machine that big.

### Largest set so far (tied or beaten)

This puzzle needs **memory** (a hand kept circulating in a loop, or held by a
gather) and **comparing counts**. Set compares counts, but only within one
hand, and it splits the hand. So this puzzle has the gating problem above
plus a state machine on top. It's endgame material with the core set. A
casino-flavoured version that fits better is a "high hand of the hour"
promotion: pay any hand that ties or beats the best poker hand so far. A
**Showdown** croupier would make it a reasonable mid-game puzzle. It would
take two hands; the better hand goes straight on and the worse one is deflected.

## Design issues found

1. **One-card hands need reference cards.** That's fine, and maybe even
   good: "borrow a card from the shoe and compare" is a neat first trick. But
   it means the shoe and gather have to come right after Pass.
2. **Gather order must be predictable.** If a gather could pick up either
   hand first, `[R, X]` vs `[X, R]` would depend on traffic, and cuts would
   misbehave depending on load. The fix is the "keeps facing the hand it holds" rule.
3. **Streams can't merge.** Every core croupier sends each input side to a
   different output side. So two streams of cards can only meet at a sink
   (scratch or the desk) or a gather (which combines them). One six-sided desk
   makes routing costly. Moving even-core to a single desk added 5
   runners (20 → 25). Options:
   * make the cashier cage several hexes long, along a wall;
   * add a **runner** who always delivers to one fixed table;
   * accept it as part of the puzzle.
4. **No croupier routes a whole hand on a partial property** (see the ace
   puzzle). War fixes the "high card" case. Possible additions with real
   table equivalents:
   * **Showdown** for comparing two hands;
   * a **paytable** attendant ("pair or better?"), like a video poker paytable.
5. **Wrong order of results.** Parallel paths can deliver results out of
   input order. I don't check order. Checking it could become an optional
   extra challenge.

## Next steps

Settle the rule choices above (especially Gather order and merging). Then
write the first 5–6 one-card levels as a progression: Pass → Scratch →
Shoe+Gather+Straight ("pay 2s and 4s") → Cut to strip references → a
multi-stage level such as "Even money".
