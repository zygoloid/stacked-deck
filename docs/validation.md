# Validating the core idea with example puzzles

To check the rules, `src/engine.js` simulates a floor and `test/run.js` runs
each machine in `solutions/` against fixed and random tests (`npm test`).
Each solution file includes an ASCII map. A label is the croupier's name plus
an arrow for its main output side (`>` E, `\` SE, `/` SW, `<` W, `` ` `` NW,
`'` NE). `in` is a card player, `$$` the chip desk, `K\` a shoe dealing kings,
`Wh`/`Wt` a high-card/top-card War dealer, `K3` a 3-of-a-kind dealer.

## Current rules

* **Geometry.** Pointy-top hexes. Every table has one input slot per side and
  accepts hands from any side, so streams merge freely.
* **Output ports.** Each croupier has named outputs (Straight: yes/no; Cut:
  top/bottom; Set: set/rest; War: see below). The player points each one at a
  side. An unassigned port, or one pointing at a hex with no table, **drops the
  cards on the floor**; that is how hands are discarded (there is no Scratch).
* **A round** has three steps. First every free croupier picks up one hand
  (from the side it faces, otherwise the next filled slot clockwise, and then it
  faces that side). Then it acts, and turns to face the side of its last
  output (see docs/architecture.md). Then all outputs are placed at once. A slot
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
* **n of a kind** (`K2`, `K3`, `K4`): like Straight and Flush, it sends the
  whole hand to `yes` if some rank appears at least n times, otherwise to `no`.
* **Checking a run.** Payouts must be exactly the winning input hands (same
  cards, any order within a hand, any order between hands). A run ends when
  every player card has left the floor, or 50 rounds after the last expected
  payout. The second case is for machines that keep copies of cards in memory.
  A run fails if more than 1,000 cards are ever on the floor at once (a pair
  of Duplicates feeding each other would otherwise multiply cards without
  bound), or after 5,000 rounds. A floor is cleared when the machine passes
  every test and then 8 **check deals**: random deals seeded from the machine
  itself, so a machine has to follow the rule rather than fit the tests (see
  docs/architecture.md).

## Results

| Puzzle | Rules | Croupiers | Rounds | |
|---|---|---|---|---|
| Even card (1-card hands) | ports | **12** | 51 / 26 cards | built, passes |
| Contains an ace (5-card hands) | high-card War | **2** | 17 / 10 hands | built, passes |
| Contains an ace | top-card War | **16** | 40 / 10 hands | built, passes |
| High card ties or beats every earlier hand | high-card War | **4** | 19 / 10 hands | built, passes |
| Full house (5-card hands) | + n of a kind | **13** | 49 / 10 hands | built, passes |
| Largest set ties or beats every earlier hand | + n of a kind | **31** | 115 / 10 hands | built, passes |

The two newest machines were laid out with `src/layout.js`. I place the main
tables by hand, list the connections, and a breadth-first search lays the pass
chains. `tools/optimize.js` then hill-climbs the table positions to minimise
the number of croupiers. Both machines admit only one hand at a time (see the
door pattern below), so any layout the router accepts behaves the same way.

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

### Full house (`solutions/full-house.js`)

```
 .     .    P/    P<    Wh    2<
   $$    Wh    A>    Wh    K2
in>   Wh    Dup`  K3    Set    .
    .    2`     .     .     .
```

This is not as easy as it looks. n of a kind tests the whole hand, and every
hand with three of a kind is also "2 of a kind". The real question is about
the cards *left over* once the trips are taken out. So the machine has to use
the general pattern: **test a copy, gate the original**.

1. Duplicate the hand.
2. Test the copy: `K3` rejects hands without trips. Set pulls out the trips,
   and `K2` asks whether the rest is a pair.
3. The yes and no answers are about the copy, so each plays a War against a
   shoe just to *release* a verdict card: a 2 for yes, an ace for no.
4. **Gate:** the original plays high-card War against the verdict. Every
   5-card hand beats a 2, and no hand beats an ace (ties go to the house).

**The door.** The yes and no verdicts merge on the way to the gate. With
several hands in flight, a later verdict can overtake an earlier one and be
paired with the wrong hand. A layout with equal-length routes passed the
normal tests but failed a stress test of back-to-back trips hands.

The fix is a second War at the entrance. It only lets a hand in with a
*ticket*, and the gate hands each used verdict card back as the next ticket.
A shoe that deals once supplies the first ticket. That's 2 croupiers plus a
short return route, and it makes "one hand at a time" a reusable idiom.

If full house should be an early puzzle instead, the natural fix is to let
the n of a kind dealer also test poker shapes ("three plus a pair", "two
pairs"). Then full house becomes 1 croupier and two pair becomes buildable.
At 13 croupiers it makes a good mid-game puzzle that teaches the gate and door
patterns.

### Largest set ties or beats every earlier hand (`solutions/record-set.js`)

```
 .     .    3\     .    6\     .     .
    .     .    P/     .    Wh    K4     .
2>    Wh    Wh    P<    P<    Wh    P`
   P\    Wh    3>    Wh    Wh    5`    P`
 .    P\    A`    K2    4'    K3    P'
   $$    Wh    Dup<  P>    P'     .     .
 .     .    Wh    2<     .     .     .
    .     .    in`    .     .     .     .
```

This combines the champion pattern from "High roller" with the gate and door
from full house:

1. **Door and gate** as in full house.
2. **Classify the copy.** `K2`, `K3` and `K4` in a chain sort it into
   largest set 1, 2, 3 or 4. Each class plays a War against its own shoe to
   release a *marker* card: 3, 4, 5 or 6.
3. **Compare with the record.** The record is a champion card circling
   through a War, with the marker as the dealer.
   * If the champion is strictly higher, the hand falls short. The champion
     keeps circling, and the marker is swapped for an ace.
   * Otherwise (ties go to the house), the marker becomes the new champion,
     and the old champion is swapped for a 2.
   * A shoe that deals a single 3 once seeds the first champion.
4. **Gate:** the original plays against the 2 or the ace.

That's 24 croupiers that do real work, plus 7 passes. The tests include
hands with four of a kind and two pair, because random deals rarely produce
four of a kind. It's endgame-sized, but each part is a pattern players will
already know from earlier levels:
* constant comparison;
* champion loop;
* release;
* gate;
* door.

That feels right for a late puzzle. The obvious way to make it cheaper is a
Showdown croupier (War by poker hand rank) for a "high hand" variant, which
needs no classification at all.

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
   empty output (Set's rest, Cut on one card) can't drive a decision. Whole-hand
   tests like n of a kind avoid this, which is why they unlocked the
   largest-set puzzle.
6. **Test a copy, gate the original** is the general pattern for any decision
   about part of a hand:
   * duplicate;
   * test the copy;
   * release a 2 or an A;
   * gate the original with high-card War.

   It costs 5 or more croupiers. Merged verdict streams can reorder under load,
   so it needs **the door** (one hand at a time) unless a layout can prove
   otherwise. Add stress tests with many deciding hands back to back to every
   puzzle where this pattern is likely.
7. **Releasing a fixed card on an event** is War with a shoe as the dealer,
   with both dealer ports pointing the same way. It deserves to be taught
   explicitly. Alternatively, a dedicated croupier could do it.

## History

The first round used rotation-relative outputs (out at input+n) and a
Scratch croupier, with no War. Under those rules:

* "even" took 20 croupiers (25 with a single desk);
* "contains an ace" needed an estimated 45, because nothing could branch one
  stream on another's data;
* streams could not merge at all.

That led to the current rules.
