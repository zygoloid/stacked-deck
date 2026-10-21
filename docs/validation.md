# Validating the core idea with example puzzles

To check the rules, `src/engine.js` simulates a floor and `test/run.js` runs
each machine in `solutions/` against fixed and random tests (`npm test`).
Each solution file includes an ASCII map. A label is the croupier's name plus
an arrow for its main output side (`>` E, `\` SE, `/` SW, `<` W, `` ` `` NW,
`'` NE). `in` is a card player, `$$` the chip desk, `K\` a shoe dealing kings,
`Wh`/`Wt` a high-card/top-card War dealer.

## Current rules

* **Geometry.** Pointy-top hexes. Every table has one input slot per side and
  accepts hands from any side, so streams merge freely.
* **Output ports.** Each croupier has named outputs (Straight: yes/no; Cut:
  top/bottom; Set: set/rest; War: see below). The player points each one at a
  side. An unassigned port, or one pointing at a hex with no table, **drops the
  cards on the floor**; that is how hands are discarded (there is no Scratch).
* **A round** has three steps. First every free croupier picks up one hand
  (from the side it faces, otherwise the next filled slot clockwise, and then it
  faces that side). Then it acts. Then all outputs are placed at once. A slot
  emptied this round can be refilled this round. A croupier whose output is
  blocked holds it and stalls until it can place it.
* **Hands** have a top card (first in the list). Cut's top half is
  floor(n/2) cards. Sort uses new deck order with A♠ on top.
* **Gather** takes two hands from different sides and stacks them. The player
  can pick an `under` side whose hand always goes underneath; otherwise the
  first hand picked up goes under.
* **Shoe** deals one card per round from a stacked deck in a fixed direction,
  repeating (or only once, for seeding memory). It counts as a croupier.
* **War** takes a *player* hand (any side) and a *dealer* hand (a side the
  player picks). It compares them by **high card** or by **top card** (two
  variants), aces high, and **ties go to the house**. It has four ports: the
  player hand goes to `win` or `lose`, and the dealer hand goes to `dwin` or `dlose`.
* **Checking a run.** Payouts must be exactly the winning input hands (same
  cards, any order within a hand, any order between hands). A run ends when
  every player card has left the floor, or 50 rounds after the last expected
  payout. The second case is for machines that keep copies of cards in memory.

## Results

| Puzzle | Rules | Croupiers | Rounds | |
|---|---|---|---|---|
| Even card (1-card hands) | ports | **12** | 51 / 26 cards | built, passes |
| Contains an ace (5-card hands) | high-card War | **2** | 17 / 10 hands | built, passes |
| Contains an ace | top-card War | **16** | 40 / 10 hands | built, passes |
| High card ties or beats every earlier hand | high-card War | **4** | 19 / 10 hands | built, passes |
| Largest set ties or beats every earlier hand | any | — | — | not buildable yet, see below |

### Contains an ace, high-card War (`solutions/ace-high-war.js`)

```
   K\     .
in>   Wh    $$
```

A shoe of kings is the dealer. Only a hand holding an ace beats a king,
since ties go to the house. That's 2 croupiers, as expected.

### Contains an ace, top-card War (`solutions/ace-top-war.js`)

```
 .     .     .     .    P\     .
   $$     .    P>    Wt    G/
K>    Wt    in>   Del   Wt    P/
    .    G`    Wt    Wt    G<
 .     .    P`    G`    P<     .
```

Only the top card counts, so the machine has to bring the best card to the
top. It does this with a **knockout tournament**:

1. Deal the hand into five single cards.
2. Then four times: play two piles against each other with War, and gather
   the winner on top of the loser. Each of these "merges" is War + Gather +
   a Pass that walks the loser round to the gather's `under` side.
3. The hand is whole again with its highest card on top. A final top-card
   War against a king decides.

That's 16 croupiers in a compact ring around the dealer, so it's still a
reasonable mid-game puzzle. The tournament is also a reusable pattern
("top-card War can do high-card War"). I'd keep top-card War: it turns "play
the house" into a real puzzle rather than one croupier. Possible ways to make
it cheaper later:

* a **Burn** croupier (send the top card one way and the rest another), which
  is a real dealer action;
* a real casino **cut**, where the top part moves to the bottom. That would
  let a loop rotate through the hand.

### Even card (`solutions/even.js`)

```
   3\     .     .     .     .
in>   G>    Str\  Cut>  G/    7<
    .    $$    Cut<  Str<  Cut/
 .     .     .    Str`  G<     .
    .     .     .     .    J`
```

War doesn't help with parity: it only answers "higher than?". So this machine
uses the straight trick:

* A gather puts a reference card R from a shoe under the card X.
* `[X, R]` is a straight exactly when X is next to R. Three stages with
  R = 3, 7, J catch {2,4}, {6,8} and {10,Q}.
* Because ports can merge, all three "yes" outputs share one cut, which sends
  X to the desk and drops R.

That brings it to 12 croupiers (it was 14, or 19 with one desk, under the
rotating rules). A machine built only from War would need 11 thresholds,
about 22 croupiers.

### High card ties or beats every earlier hand (`solutions/record-high.js`)

```
   2\    P/     .
in>   Wh    Dup>  $$
```

This is a stand-in for the "largest set so far" puzzle, to check that memory
works. The best hand so far circulates as War's player hand (the
"champion"), and each new hand is the dealer's.

* If the champion wins, the new hand is dropped and the champion loops round
  through a pass.
* If the new hand ties or beats it (ties go to the house), it's duplicated:
  one copy is paid out and the other becomes the new champion.
* A shoe that deals a single 2 once seeds the first champion.

That's 4 croupiers, which makes this pattern an easy "remember something" level.

### Largest set ties or beats every earlier hand: still missing a piece

The memory part works the same way as above. What's missing is turning
"size of the largest set" into something a croupier can branch on:

* **Set** finds the biggest group, but doesn't send the hand anywhere based
  on its size. For a hand with no pair, everything ties, so the `rest` port
  stays *empty*. "Nothing came out" isn't a hand, so nothing downstream can
  react to it.
* **War** compares ranks, not counts.
* Every trick I tried for turning a count into a rank broke down. The idea was
  padding a group with known cards and cutting so that a known card lands on
  top. But a player hand can contain a card of any rank, so the padding cards
  can't be told apart from the hand's own.

Two natural croupiers would fix this, and each makes the puzzle a mid-game one:

* **Pair Plus dealer** (a real side bet): sends the whole hand one way if it
  holds a pair or better, otherwise the other way. Used on the hand, and on
  Set's output padded with reference cards, it should separate hands with no
  pair, a pair, three of a kind and four of a kind (not built yet).
  Each class then becomes a reference card, compared with the champion as above.
* **Showdown** (War with full poker hand ranking). This gives the "high hand
  of the hour" version for free (the champion machine above, about 4
  croupiers). But poker ranks two pair above one pair, so it doesn't measure
  "largest set" as stated.

## Design notes

1. **Ports + merging fixed most layout pain.** The even machine dropped from
   19 to 12 croupiers and from a staircase to a compact blob, mostly because
   outputs can now merge.
2. **Two-input War is the cross-stream branch.** It gives three things:
   * comparing with a constant (a shoe as the dealer);
   * memory (the champion pattern);
   * merges for the tournament.

   With ties going to the house, a dealer A always beats anything. With
   high-card War, a dealer 2 always loses to any 5-card hand. So a stream
   of 2s and As can switch another stream pure on/off. With top-card War that
   only works one way, because the hand's own top card might be a 2.
3. **Gather's `under` side** removed the timing-dependent card order that the
   rotating rules needed a special case for.
4. **Seeding memory** needed a shoe that deals once. A pre-placed hand on a
   table at level start would also work.
5. **"Nothing came out" is never a signal.** Croupiers that can produce an
   empty output (Set's rest, Cut on one card) can't drive a decision. This is
   the root cause of the largest-set problem, and is worth keeping in mind
   for any future croupier.

## History

The first round used rotation-relative outputs (out at input+n) and a
Scratch croupier, with no War. Under those rules:

* "even" took 20 croupiers (25 with a single desk);
* "contains an ace" needed an estimated 45, because nothing could branch one
  stream on another's data;
* streams could not merge at all.

That led to the current rules.
