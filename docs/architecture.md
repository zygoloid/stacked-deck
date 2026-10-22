# Stacked Deck: architecture

A zachlike puzzle game played in the browser. It has no dependencies and no
build step: plain ES modules served as static files.

```
index.html, style.css      page shell
src/cards.js               cards, deck order, hand predicates, PRNG
src/engine.js              floor simulator (Floor, runTest, FUNCTIONS)
src/levels.js              level list (LEVELS) + helpers (hexRange, makeTests)
src/layout.js              router for writing reference solutions (dev only)
src/ui/*.js                the game UI
solutions/levels/<id>.js   a verified reference solution for every level
test/*.js                  node tests (npm test)
tools/serve.js             zero-dependency static server (npm run serve)
```

Ownership while the game is being built:
* `src/engine.js` and `src/cards.js` are shared. Don't change their behaviour
  without coordinating, because every saved solution and reference solution
  depends on them.
* The UI owns `index.html`, `style.css`, `src/ui/`, `tools/serve.js`.
* Content owns `src/levels.js`, `solutions/levels/`, `test/levels.js`,
  `docs/story.md`.

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
runTest({ cells }, inputs, pays) -> { ok, rounds, croupiers, wrong, missing, timeout }
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
`set` above `rest`, duplicate `a` above `b`, deal piles in list order, war the
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
| `set` | `set`, `rest` | | cards of the most common rank(s) / the rest |
| `suits` | `S`,`H`,`D`,`C`,`misc` | | each card to its suit's pile; unassigned suits go to misc (or the floor); suits sharing a side form one pile |
| `deal` | `out: {to: [sides…]}` | | one card at a time, round-robin |
| `gather` | `out` | `under?` (side) | stacks two hands from different sides; the hand from `under` goes underneath (else the first picked up does) |
| `war` | `win`,`lose` (player hand), `dwin`,`dlose` (dealer hand) | `dealer` (side), `rule: 'high'|'top'` | player hand (any other side) vs dealer hand; aces high; ties go to the house |

A shoe counts as a croupier for scoring.

Bump `RULES_VERSION` in `src/engine.js` (with a line in the comment above it)
whenever a rule changes; the level select shows it.

## Level format (`src/levels.js`)

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
  pays: (hand, earlierHands) => boolean,
  tests: [[hand, ...], ...],    // each test is a list of input hands (card-string arrays)
  par: { croupiers, rounds },   // from the reference solution (optional)
}
```

A level is solved when `runTest` passes on every test. Scores are croupiers
(shoes included) and rounds (the average over all tests, rounded). Levels
unlock in order: a level is available once the previous one is solved.

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
`src/ui/model.js`: undefined, empty and default fields (`facing: 0`,
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
