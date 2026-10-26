# Stacked Deck: architecture

A zachlike puzzle game played in the browser. It has no dependencies and no
build step: plain ES modules served as static files.

```
index.html, style.css      page shell
src/cards.js               cards, deck order, hand predicates, PRNG
src/engine.js              floor simulator (Floor, runTest, FUNCTIONS)
src/score.js               machines: engine spec, scoring, validation, canonical
                           form and hash, frontier (no DOM; shared with
                           anything that checks solutions outside the browser)
src/levels.js              the campaign: LEVELS, CHAPTERS, CHAPTER_FILES, helpers
src/levels/<chapter>.js    one module per chapter (hearts, diamonds, clubs,
                           spades, finale): its levels and PAR table
src/levels/shared.js       level helpers (hexRange, makeTests, paletteThrough, ...)
src/layout.js              router for writing reference solutions (dev only)
src/ui/*.js                the game UI
solutions/levels/<id>.js   a verified reference solution for every level
test/*.js                  node tests (npm test); test/mutants/<chapter>.js
tools/level-specs/<chapter>.js  reference-solution recipes per chapter
tools/write-solutions.js   freezes recipes into solutions/ (per chapter, --par)
tools/serve.js             zero-dependency static server (npm run serve)
```

Ownership while the game is being built:
* `src/engine.js` and `src/cards.js` are shared. Don't change their behaviour
  without coordinating, because every saved solution and reference solution
  depends on them. `src/score.js` is shared too: solution hashes and the
  validator must stay the same wherever solutions are checked.
* The UI owns `index.html`, `style.css`, `src/ui/`, `tools/serve.js`.
* Content owns `src/levels.js`, `src/levels/`, `solutions/levels/`,
  `tools/level-specs/`, `test/levels.js`, `test/mutants/`, `docs/story.md`,
  `docs/campaign.md`. Each chapter's files can be worked on independently;
  see docs/campaign.md for the plan and the conventions.

## Engine contract (`src/engine.js`)

```js
const floor = new Floor({ cells }, inputs);  // inputs: array of hands (arrays of card strings)
floor.step();                // advance one round
floor.round                  // rounds so far
floor.paid                   // array of paid hands (card strings), in order
floor.done()                 // every input placed and every player card off the floor
floor.snapshot() / floor.restore(snap)   // for stepping backwards
floor.cells                  // Map "q,r" -> cell with live state:
                             //   slots[6] (hand or null; slot d = arrived from side d),
                             //   pending [[side, hand]] (output waiting to be placed),
                             //   held (gather: [hand, side]; war: {player?, dealer?}),
                             //   facing
                             // A hand in the live state is an array of {c: 'AS', src: 'player'|'house'}.
floor.cardCount()            // cards in slots, held, or waiting to be placed by croupiers
floor.overflowed()           // cardCount() > MAX_FLOOR_CARDS (1000): the run has failed
runTest({ cells }, inputs, pays) -> { ok, rounds, croupiers, wrong, missing, timeout, overflow }
```

Cards are strings: rank `A23456789TJQK` + suit `SDCH`. A hand's top card is
first. Sides are numbered clockwise from east, pointy-top hexes, axial
coordinates: `0 E [1,0]`, `1 SE [0,1]`, `2 SW [-1,1]`, `3 W [-1,0]`,
`4 NW [0,-1]`, `5 NE [1,-1]` (exported as `DIRS`).

### Cells

| kind | fields |
|---|---|
| `source` (card player, fixed by level) | `at, out` (side it hands cards to) |
| `payout` (chip desk, fixed) | `at` |
| `shoe` (croupier dealing a stacked deck) | `at, out, deck: ['AS', ...], once?` |
| `croupier` | `at, fn, out: {port: side}, facing?, ...params` |

An unassigned port, or a port pointing at a hex with no table, drops cards on
the floor (they are gone). Every croupier accepts input from any side.

**Outputs to the same side are stacked** into one hand, earlier outputs on
top: cut bottom half above top (so both halves to one side complete the cut,
as at a real table), set
`set` above `rest`, duplicate `a` above `b`, war the
winning hand above the losing one. So a War with all four ports on one side
hands on a single stack with the winner on top.

**Which input is picked up.** A croupier faces one side (initially `facing`,
default east). Each round it takes from the side it faces if that slot has a
hand, otherwise from the next filled slot clockwise, and turns to face it.
After acting it turns to face the side of its **last output**: pass `out`;
cut `bottom` (else `top`); set `rest` (else `set`); duplicate `b`; suits and
deal the pile that got the hand's last card; war the player's hand. Dropped
outputs (unassigned ports) don't count. So a pass croupier looks for input
clockwise starting from its output side. Gather and War skip sides they can't
use while holding their first hand. Gather and War pick up both of their
hands in the same round when both are waiting (the second is found by
scanning on clockwise from the first), so they keep up with a line of passes.

| fn | ports | params | what it does |
|---|---|---|---|
| `pass` | `out` | | passes the hand on |
| `duplicate` | `a`, `b` | | one copy to each |
| `sort` | `out` | | new deck order (A♠ top) |
| `cut` | `top`, `bottom` | | top floor(n/2) cards / rest; both to one side completes the cut (top half underneath) |
| `outshuffle`, `inshuffle` | `out` | | perfect riffle |
| `straight` | `yes`, `no` | | consecutive distinct ranks (A high or low); 1 card = yes |
| `flush` | `yes`, `no` | | all one suit |
| `kind` | `yes`, `no` | `n` (2–8) | some rank appears ≥ n times |
| `set` | `set`, `rest` | | cards of the most common rank(s) (jokers join them) / the rest (ad cards always) |
| `suits` | `S`,`H`,`D`,`C`,`misc` | | each card to its suit's pile; unassigned suits go to misc (or the floor); suits sharing a side form one pile |
| `deal` | `out: {to: [sides…]}` | | one card at a time, round-robin, each onto the top of its side's pile (one pile per side, even if listed twice), so piles come out in reverse deal order |
| `gather` | `out` | `under?` (side) | stacks two hands from different sides; the hand from `under` goes underneath (else the first picked up does) |
| `burn` | `burn`, `rest` | | top card / the rest; both to one side moves the top card to the bottom |
| `hand` | `out` | `n` (1–13) | collects cards until it holds ≥ n, deals the first n as a hand; leftovers start the next; holding ≥ n it deals without picking up |
| `war` | `win`,`lose` (player hand), `dwin`,`dlose` (dealer hand) | `dealer` (side), `rule: 'high'|'top'` | player hand (any other side) vs dealer hand; aces high; ties go to the house |

A shoe counts as a croupier for scoring.

### Special cards (late game; dealt only by shoes)

| card | name | value | suit | new deck order |
|---|---|---|---|---|
| `?` | monochrome joker | wild | none | after the hearts |
| `??` | colour joker | wild | every suit | after `?` |
| `$` | front advertising card | none | none | first (before A♠) |
| `$$` | back advertising card | none | none | last |

* **Jokers** are wild for value: they join the biggest set (n of a kind, Set)
  and fill gaps or ends of a straight. In War a joker beats everything,
  including an ace.
* **Advertising cards** have no value. They are never part of a set (Set
  sends them to `rest` even when they're all there is), a straight or a flush,
  and they lose to everything in War.
* **Flush and Suits:** the colour joker matches any suit, so it never spoils a
  flush, and Suits sends it to the first of ♠ ♥ ♦ ♣ that has a port. The
  monochrome joker and ad cards spoil a flush and go to `misc` in Suits.
* `isCard`, `isJoker`, `isAd` and `suitsOf` in `src/cards.js` encode this.

Bump `RULES_VERSION` in `src/engine.js` (with a line in the comment above it)
whenever a rule changes; the level select shows it.

## Level format (`src/levels/<chapter>.js`)

```js
{
  id: 'opening-night',          // stable; used for saves and solutions/levels/<id>.js
  chapter: 1,
  title: 'Opening Night',
  story: ['paragraph', ...],    // shown before the level
  brief: 'Pay out every card.', // one-line goal, always visible
  handSize: 1,
  floor: [[q, r], ...],         // hexes where the player may place croupiers
  fixed: [cells],               // sources and payouts (not editable)
  croupiers: ['pass', 'shoe', ...],  // palette: fn names plus 'shoe'
  warRules: ['high', 'top'],    // War rules allowed (when 'war' is in the palette)
  card: 'AS',                   // the floor's playing card: 'AS'…'KS' (suit floors), '?' '??' '$' '$$' (finale);
                                //   default from chapter + position (ch 1–4 ♠ ♥ ♣ ♦ A…K, ch 5 ? ?? $ $$)
  specialCards: ['?', '??'],    // special cards a shoe may deal here (default none; the UI
                                //   mentions special cards only once such a floor is open)
  pays: (hand, earlierHands) => boolean,   // either this…
  expected: (inputs) => [hand, ...],       // …or this: the exact payouts (see below)
  ordered: false,                          // compare card order within payouts
  tests: [[hand, ...], ...],    // each test is a list of input hands (card-string arrays);
                                //   made by makeTests (src/levels/shared.js), which also records
                                //   tests.deal = { handSize, handsPerTest } for the check deals
  par: { croupiers, rounds },   // from the reference solution (optional)
}
```

**Payouts.** A `pays` level pays out a subset of the input hands unchanged. An
`expected` level lists the hands the chip desk should receive for a test's
inputs: hands may repeat (pay a hand once per ace), be regrouped from cards of
several inputs (each four of a kind across all cards played), or be made of
house cards from shoes (pay the next higher spade). Payouts may arrive in any
order, and each must match a distinct expected hand; hands are compared as
multisets of cards unless `ordered: true`. `expectedPayouts(rule, inputs)` and
`runTest(spec, inputs, rule)` in `src/engine.js` accept either a `pays`
function or the level object.

**Don't break saved solutions.** Once a floor has shipped, its fixed cells
(players and chip desks: position and direction) must not move, its buildable
floor may only grow, and its id must stay. `test/compat.js` checks this
against `test/compat.json`; new floors are recorded with
`node test/compat.js --update`, which is also the (deliberate) way to accept a
breaking change.

**Bonus deck.** `src/levels.js` also exports `BONUS`: extra floors outside the
56-card campaign (cut floors moved out of the campaign, and new extras), with
the same format plus `unlockAfter: '<campaign level id>'` (open once that
floor is solved) and their own `card` labels in the bonus deck. They don't
count towards the campaign's unlock window, and their palette is whatever the
level lists. Ids are unique across `LEVELS` and `BONUS`, since saves are keyed
by id.

A level is solved when `runTest` passes on every test and then on the
machine's **check deals**: `CHECK_DEALS` (8) more random tests, dealt like the
level's own random tests (`tests.deal`) from a seed taken from the SHA-256 of
the level id and the machine's canonical form (`checkDeals` in
`src/score.js`, with the 128-bit `sfc32` PRNG in `src/cards.js`). The same
machine always gets the same check deals, in the browser and on the server,
but changing the machine changes them, so a machine can't be fitted to the
published tests or hard-code their payouts. `test/levels.js` checks every
reference solution passes its check deals. Scores are croupiers (shoes
included) and rounds (the total over the published tests only: `totalRounds` in
`src/score.js`, an integer that changes whenever any test's count does). Levels
unlock in order, with some slack: a level is open when fewer than three levels
before it are unsolved (`OPEN_UNSOLVED` in `src/ui/model.js`), so up to three
unsolved levels are open at once. The UI reads both lists through
`src/ui/catalog.js`; with `?testlevels` in the URL it also appends the
test-only fixture floors of `test/ui-levels.js` to the bonus deck (used by
`tools/ui-smoke.js`).

## Save format (localStorage key `stacked-deck-v1`)

```js
{ levels: { [id]: {
  cells: [placed cells],          // the working machine (autosaved)
  solved: true,                   // set once the floor is first cleared; never unset
  best: { croupiers, rounds },    // each minimised on its own over all solutions
  solutions: [{ cells, croupiers, rounds, at, rules, broken? }],  // every distinct machine that cleared it
  legacyBest: { croupiers, rounds },  // only for saves from before `solutions`
  last: { croupiers, rounds },    // score of the latest clear
} } }
```

`cells` (both the working machine and each solution's) holds only the
player's own cells (shoes and croupiers), in the cell format above.

`solutions` grows each time every test passes with a machine not already in
the list; `at` is `Date.now()` when it was first found. Two machines are the
same solution when their canonical forms match (`canonicalCells` in
`src/score.js`: undefined, empty and default fields (`facing: 0`,
`once: false`, `rule: 'high'`) dropped, keys sorted, cells sorted by
position). The same machine built elsewhere on the floor is a different
solution. The player can delete solutions; `best` is then recomputed from
what is left (and removed when nothing is), while `solved` stays true.

Older saves have no `solutions`: they start with an empty list, and the
`best` they recorded is kept as `legacyBest` and still counts towards `best`
until the level is next re-scored.

**Rules changes.** Each solution records `rules`, the `RULES_VERSION` it was
scored under. On startup, solutions scored under older rules are re-run in the
background (`rescoreStale` in `src/ui/model.js`): working ones get their new
score, ones that no longer clear the floor get `broken: true` (left off the
plot and out of `best`, kept in the list so they can be loaded and fixed), and
`legacyBest` is dropped. Clearing the floor again with a saved machine also
refreshes its score.
The editor plots the list (`src/ui/scatter.js`, rounds against croupiers).
