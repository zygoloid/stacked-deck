# Stacked Deck: the 56-floor campaign

One floor per playing card. Four suit chapters of 13 floors, A to K, then a
finale of four floors, one per special card. This document describes the
campaign as built: the floor table, when each croupier and card arrives, the
conventions every chapter follows, and the notes from building it. All five
chapters are built; where the builders departed from the original plan, the
tables below follow the code (`src/levels/*.js`, `tools/level-specs/*.js`).

| Ch | Suit | Name (`CHAPTERS`) | Module | Cast and arc | Status |
|---|---|---|---|---|---|
| 1 | ♥ | Opening Night | `hearts` | Opening night, the Owner's notes, Old Thursday, the twins, Sal; the house learns to stack the deck. Ends with Dmitri's Even Money. | **built** |
| 2 | ♦ | Stacking the Deck | `diamonds` | The Vellanis' games: flushes, sets, the Owner's sevens, then War. Ends with the Vellani family game; a rival casino lights up two blocks away. | **built** |
| 3 | ♣ | House Rules | `clubs` | The rival casino opens; copies of a hand. Commissioner Pryce's top-card regulation (4♣ to 9♣); the Kesslers' bottom dealer and the riffles; Pryce loses Low Ball. Ends with verdict cards and the rival's last big night. | **built** |
| 4 | ♠ | The House Always Wins | `spades` | The rival folds and its owner deals for you. Memory, burn, the ticket door, sort, hand. The council, the mayor's records, the house record. Ends with the envelope under the cash tray. | **built** |
| 5 | | The Envelope | `finale` | You are the Owner now. The new printing of the house deck has extras: jokers and advertising cards. | **built** |

The chapter name for the finale is deliberately neutral: special cards are an
endgame reveal, and the level select shows chapter names.

## Introduction schedule

Palettes grow in one fixed order (`paletteThrough(newest)` in
`src/levels/shared.js`; test/levels.js checks that the palette only grows):

| Arrives at | Croupier / card / rule | Floor |
|---|---|---|
| A♥ | pass | Opening Night |
| 4♥ | suits | Hearts Only |
| 8♥ | straight | Back to Back |
| 9♥ | shoe, gather, cut | Next Door |
| A♦ | flush | Red Flush |
| 3♦ | kind (n 2–8) | Pair Night |
| 7♦ | war (high card) | Beat the Dealer |
| A♣ | duplicate | Upper Hand |
| 3♣ | set | Top Pair |
| 4♣ | top-card War (regulation: top only, 4♣–9♣) | New Rules |
| 5♣ | inshuffle, outshuffle | Bottom Dealer |
| 8♣ | deal | Knockout |
| 10♣ | both War rules again (regulation lifted) | Every Other |
| J♣ | releasing a verdict card (technique, no new croupier) | Bottom Pair |
| A♠ | shoe `once` (memory; technique) | Hot Streak |
| 3♠ | burn | Burn Card |
| 5♠ | the ticket door (technique) | Full House |
| 7♠ | sort | Calling Card |
| 8♠ | hand (n 1–13) | Seven Heaven |
| `?` | monochrome joker (`specialCards: ['?']`) | Mind the Gap |
| `??` | colour joker | One Card Short |
| `$` | front advertising card | Red Carpet |
| `$$` | back advertising card | Déjà Vu |

`warRules`: `['high']` until 3♣; `['top']` for 4♣–9♣; `['high', 'top']`
from 10♣ on. `specialCards`: `[]` everywhere except the finale, where it grows
`['?']`, `['?', '??']`, `['?', '??', '$']`, then all four.

## The floors

Difficulty is 1–10. "Ref" means a reference card from a shoe. Every sketch
describes the reference solution (the recipe in `tools/level-specs/<chapter>.js`)
and its par as croupiers/rounds from the chapter's `PAR` block. Hands are the
hand size. "Reused" means the level id survives from the old campaign (saves
are keyed by id).

### Chapter 1 ♥ Opening Night (built)

| Card | id | Title | New | Hand | Puzzle | Reference (par) | Diff | Reused |
|---|---|---|---|---|---|---|---|---|
| A♥ | opening-night | Opening Night | pass | 1 | pay every card | 3 passes in a line (3/11) | 1 | yes |
| 2♥ | around-the-bar | Around the Bar | routing | 1 | a ring floor around the bar | either side of the ring (7/15) | 1 | yes |
| 3♥ | two-tables | Two Tables | merging | 1 | two sources, one desk, 16 hands | merge early 4/19, or a line per table 6/11: the first real trade-off | 2 | yes |
| 4♥ | hearts-only | Hearts Only | suits | 1 | hearts only; unassigned ports drop | one splitter (3/14) | 2 | yes |
| 5♥ | seeing-red | Seeing Red | shared sides | 1 | red cards; a wheel in the way | H and D to one side (4/17) | 2 | yes |
| 6♥ | standing-room | Standing Room | three sources | 1 | hearts and spades from three tables, palms on the floor | merge all then one splitter 10/27, or a splitter per table ~18/14 | 3 | new |
| 7♥ | black-tie | Black Tie | | 1 | black cards, two tables, cramped | 7/19 | 4 | yes |
| 8♥ | back-to-back | Back to Back | straight | 2 | runs from two tables by the door | merge then one straight 9/17, or a straight per table 10/12 | 3 | yes (now two tables) |
| 9♥ | next-door | Next Door | shoe, gather, cut | 1 | 6s and 8s; corridor | [X, 7] straight, cut off the 7 (7/15) | 4 | yes |
| 10♥ | lucky-seven | Lucky Seven | two refs | 1 | the 7s | the sandwich: gather 6 and 8 into one ref hand, [X, 6, 8] is a run only for 7 (6/16); chains [X,6] then [X,6,8] cost 7, [X,6] and [X,8] with two cuts 8 | 5 | new |
| J♥ | penny-ante | Penny Ante | stages share a cut | 1 | A, 2, 3, 4 (ace low) | [X, 2] catches A and 3, strip, [X, 3] catches 2 and 4; both yes ports into one cut; the stages wrap round the first straight so no passes (9/21) | 5 | new |
| Q♥ | royalty | Royalty | mixed stages | 1 | J, Q, K | [X, Q] catches J and K; the queens left meet [X, J, K]; both 2- and 3-card yes hands lose their refs at one cut (10/20) | 6 | new |
| K♥ | even-money | Even Money | three stages | 1 | 2 4 6 8 10 Q | refs 3, 7, J (12/28) | 7 | yes |

### Chapter 2 ♦ Stacking the Deck (built)

| Card | id | Title | New | Hand | Puzzle | Reference (par) | Diff | Reused |
|---|---|---|---|---|---|---|---|---|
| A♦ | red-flush | Red Flush | flush | 3 | red flushes | flush, then suits H D (3/11) | 3 | yes |
| 2♦ | either-or | Either Or | xor of two tests | 2 | suited or a run, not both | flush yes → straight no; flush no → straight yes; merge (5/17) | 3 | new |
| 3♦ | pair-night | Pair Night | kind | 5 | largest set is a pair | K2 yes → K3 no (3/12) | 3 | yes |
| 4♦ | inside-seven | Inside Seven | ref position and cut size | 2 | the two cards make a 3-card run with a 7 | gather the 7 *on top*, straight, cut's bottom half is the hand (5/16) | 4 | new |
| 5♦ | seven-up | Seven Up | kind with a ref stack | 2 | holds a 7 | [a, b, 7, 7] has trips iff a 7 is held; cut top half (6/18); without the stack, split on pairs first (8) | 5 | new |
| 6♦ | lucky-number | Lucky Number | **a loop beats unrolling** | 5 | exactly one 7 | four 7s on top: K5 yes, K6 no, cut. The 7-stack is built by a loop (two shoes → gather → K4, "no" back to the gather): 8/34. Unrolled (4 shoes, 3 gathers): 11 | 6 | new |
| 7♦ | beat-the-dealer | Beat the Dealer | war | 1 | beats a 9 | War vs a 9 shoe (4/14) | 4 | yes |
| 8♦ | ace-in-the-hole | Ace in the Hole | whole-hand War | 5 | holds an ace | War vs a king (4/10) | 3 | yes |
| 9♦ | inside-bet | Inside Bet | lose port | 5 | high card 9–Q | beat an 8, then lose to a Q (5/12); or the hand as dealer against a K | 4 | new |
| 10♦ | top-dog | Top Dog | War on the pieces | 2 | top card beats bottom | cut, War, winner and dealer's loser stack to the desk (4/15; was 6) | 5 | yes |
| J♦ | top-of-the-heap | Top of the Heap | pieces reassembled by War | 5 | top card beats each other card | cut, cut, gather the other four as dealer, War (5/14) | 5 | new |
| Q♦ | royal-flush | Royal Flush | stripping one ref from a big hand | 5 | 10–A suited (the A–5 straight flush is the trap) | flush → beats a K (has an ace) → 9 on top → straight (only 10–A or 4–8) → two cuts and a gather take the 9 off (11/13) | 7 | new |
| K♦ | acey-deucey | Acey-Deucey | **rig the last War** | 3 | middle card strictly between the ends | split [a][b][c]; War stacks a, c into [hi, lo]; b plays lo; winners go on as [b, lo], losers get an ace from a shoe so the final War (hi vs that pile) must lose; both routes take equal time (11/36) | 8 | new |

### Chapter 3 ♣ House Rules (built)

Regulation: top-card War only from 4♣ to 9♣ (Pryce); lifted at 10♣ when Pryce
loses his own Tuesday game.

| Card | id | Title | New | Hand | War | Puzzle | Reference (par) | Diff | Reused |
|---|---|---|---|---|---|---|---|---|---|
| A♣ | upper-hand | Upper Hand | duplicate | 5 | high | highest card (ties count) is one of the top two | duplicate; cut the copy; gate: the original vs the copy's top half, pay on **lose** (ties go to the house) (4/15). Cutting the hand itself and playing the halves also works | 4 | new |
| 2♣ | high-spade | High Spade | | 5 | high | no card outranks the best spade | copy + 2♠ ref gathered → suits → spade pile is the gate's dealer, pay on lose (6/17) | 6 | yes |
| 3♣ | top-pair | Top Pair | set | 5 | high | pair or better, highest card in the largest set | K2 yes, duplicate, the copy's set pile is the gate's dealer, pay on lose (5/12) | 6 | yes |
| 4♣ | new-rules | New Rules | top-card War | 5 | top | top card beats a 10 | top-card War vs a 10 shoe (4/11) | 3 | yes |
| 5♣ | bottom-dealer | Bottom Dealer | in/out shuffles | 4 | top | bottom card beats a 10 | on 4 cards a cut only swaps the halves; in, in brings the bottom card up (in, cut too), then War vs a 10 (5/15) | 4 | yes (now 4-card hands) |
| 6♣ | fourth-street | Fourth Street | shuffles beat cuts | 5 | top | 4th card beats a 10 | in + completed cut brings the 4th card up (cuts alone need four), then War vs a 10 (5/12) | 4 | new |
| 7♣ | second-fiddle | Second Fiddle | a non-rotation | 5 | top | top card beats the second card | out-shuffle gives [a d b e c]; cut, so the halves' top cards are a and b; top-card War of the halves, winner and dealer's loser stack to the desk (4/16). Rotations never put a and b on different halves' tops | 5 | new |
| 8♣ | knockout | Knockout | deal | 5 | top | holds an ace | deal to five singles round the dealer; each merge is **one** War with all four ports to one side (winner on top), four of them bring the best card up; final War vs a K (8/23; old par 16) | 6 | yes |
| 9♣ | low-ball | Low Ball | | 5 | top | every card beats a 5 | a chain of five top-card Wars, each card in turn against a 5: a completed cut between Wars rotates the hand by two (so all five get a turn), and the 5 just beaten goes along as the next dealer (10/18). Pryce loses; the regulation goes | 7 | yes |
| 10♣ | every-other | Every Other | both rules again | 5 | both | highest card (ties count) is the 1st or 3rd card | duplicate; deal the copy's 1st and 3rd cards to the gate and the rest onto the floor; gate on lose (4/15). An in-shuffle and a cut also isolate them | 5 | new |
| J♣ | bottom-pair | Bottom Pair | **release a verdict, no door** | 5 | both | the bottom two cards are a pair | duplicate; deal drops the copy's top three cards; K2 on the bottom two: yes releases a 2, no an ace, both routes one War and one shared pass long; gate the original vs the verdict with high-card War (11/13) | 6 | new |
| Q♣ | small-pairs | Small Pairs | | 5 | both | largest set is a pair (or two pair) and every paired card is 6 or lower | K2 yes, K3 no, duplicate; copy → set → War(set pile vs a 6): the 6 it loses to releases a 2, the 6 it beats an ace; same verdict and gate as Bottom Pair (14/13) | 7 | new |
| K♣ | two-pair | Two Pair | finale | 5 | both | exactly two pair (trips, full houses and quads don't count) | K3 no; duplicate; copy → set → deal drops one paired card, so what's left still holds a pair only if there were two → K2; release; gate (13/15) | 7 | new |

### Chapter 4 ♠ The House Always Wins (built)

Both War rules throughout.

| Card | id | Title | New | Hand | Puzzle | Reference (par) | Diff | Reused |
|---|---|---|---|---|---|---|---|---|
| A♠ | hot-streak | Hot Streak | memory (`once`) | 1 | beats the card before | a copy of each card waits as the next card's dealer; a `once` ace makes the first card lose (4/13) | 5 | yes |
| 2♠ | high-roller | High Roller | champion loop | 5 | high card ties or beats every earlier hand | the champion loop, seeded by a `once` 2 (4/18) | 5 | yes |
| 3♠ | burn-card | Burn Card | burn | 5 | the second card beats a 10 | burn with both ports to one side (top card to the bottom), then top-card War vs a 10 (3/11); vs 2 shuffles or 3 cuts | 3 | new |
| 4♠ | third-time-lucky | Third Time Lucky | a shoe deck as a sequence | 5 | every third hand pays | a shoe stacked [A, A, 2] as the gate's dealer (shoes only deal when the slot is free, so the sequence stays in step) (2/8) | 3 | new |
| 5♠ | full-house | Full House | the ticket door | 5 | full house | test a copy (K3, set, K2 on the rest), release, gate, door (13/58). The copy's decision comes at different depths, so verdicts overtake each other: this is where the door is needed | 8 | yes |
| 6♠ | the-wheel | The Wheel | burn strips a ref | 5 | ace-to-five straights only | 6 on top → straight (only A–5 or 7–J and the like) → burn → beats a K (6/11) | 5 | new |
| 7♠ | calling-card | Calling Card | sort | 5 | holds a spade | duplicate; sort the copy so a spade comes to the top; burn isolates the top card; suits turn it into a verdict (2 or A); gate. One decision, equal routes, no door (11/30; old par 14 with a door) | 6 | yes |
| 8♠ | seven-heaven | Seven Heaven | hand | 5 | three or more 7s | shoe of 7s → Hand(4) → four 7s on top → K7 → cut (5/34); five 7s and K8 also work, slower; compare Lucky Number's loop | 4 | new |
| 9♠ | after-a-pair | After a Pair | delayed verdict | 5 | pay a hand if the hand before it held a pair or better | no copy: the hand itself goes through K2, yes releases a 2 and no an ace (equal routes) into the gate's dealer line, which a `once` shoe seeds with an ace; each hand meets the verdict on the hand before it (12/14) | 6 | new |
| 10♠ | bookends | Bookends | carrying a card to the next hand | 2 | top card beats the previous hand's bottom card | duplicate; the copy burns its top card, and its bottom card waits in the gate's dealer line behind a `once` ace; top-card War (5/22) | 5 | new |
| J♠ | next-in-line | Next in Line | windows with Hand | 1 | a card next in rank to the card before (the first card is compared with the dealer's 7) | duplicate with both ports to one side, a `once` shoe seeds a 7, Hand(2) makes [previous, current] windows, straight, cut's bottom card to the desk (the copy is paid) (5/17) | 6 | new |
| Q♠ | jacks-or-better | Jacks or Better | everything, no door | 5 | video poker: a pair of jacks or better, or any better hand | straight / flush / K3 pay directly; K2 no drops; pairs: copy → set → burn → K2 (two pair) or the lone pair card vs a 10 (high pair); release; gate. A pass beside the second K2 matches the War vs the 10, so every route from the last decision takes the same time and no door is needed (19/18) | 9 | new |
| K♠ | house-record | House Record | finale | 5 | largest set ties or beats every earlier hand's | copy → K2/K3/K4 release a marker card for the set size → champion loop of markers → release a 2 or an ace; gate; door (31/105) | 10 | yes |

### Chapter 5 The Envelope (built)

| Card | id | Title | New | Hand | Puzzle | Reference (par) | Diff |
|---|---|---|---|---|---|---|---|
| `?` | mind-the-gap | Mind the Gap | monochrome joker as a wild reference | 2 | the ranks are exactly two apart (5–7, Q–A, A–3; no wrapping) | straight no → joker on top → straight yes → burn the joker (5/26). Without jokers it needs a ref per rank | 6 |
| `??` | straight-flush-draw | One Card Short | colour joker keeps a flush | 4 | one wild card would make a straight flush | colour joker on top → straight → flush → burn (5/14); the colour joker keeps the flush, so the tests can come in either order (a monochrome joker would spoil it) | 6 |
| `$` | red-carpet | Red Carpet | advertising card as a filler | 5 | the red cards alone hold a pair or better | duplicate; a `$` joins the copy so the red pile is never empty (it never pairs); suits drop the black cards; K2: yes releases a 2, no an ace, equal routes; gate (12/16) | 7 |
| `$$` | deja-vu | Déjà Vu | memory of the player's own cards | 1 | the card's rank has been played before tonight | a gather stacks [X, memory]; K2 yes: burn X to the desk, the memory goes round; no: [X, memory] is the new memory. A `once` shoe seeds the memory with `$$` (no natural card could, it might pair the first card) (6/74). Harder variants (only the second time) need two memories and were not found to work | 8 |

(Snap — "pay a card of the same rank as the card before; the first card
never wins" — is the same window machine as Next in Line with a `$` seed
instead of a 7, *(sim: 5)*; a spare idea if a finale floor needs replacing.)

## Conventions for chapter builders

### Files (one set per chapter, no conflicts)

* `src/levels/<chapter>.js`: the chapter's `LEVELS` and its `PAR` table between
  `// BEGIN PAR` and `// END PAR`, finished with `finishChapter(LEVELS, PAR)`.
  Shared helpers (`hexRange`, `hexRect`, `makeTests`, `floorOf`, `source`,
  `desk`, `paletteThrough`, predicates) come from `src/levels/shared.js`.
* `tools/level-specs/<chapter>.js`: the reference recipes (`SPECS`), either
  `{ cells }` or `{ nodes, links }` for the router; helpers from
  `tools/level-specs/shared.js`.
* `test/mutants/<chapter>.js`: `MUTANTS` (plausible wrong rules per level) and
  `DOOR` (levels whose reference must fail without its ticket door).
* `solutions/levels/<id>.js`: generated; never edit by hand.
* Workflow: `node tools/write-solutions.js <chapter> --par` (writes that
  chapter's solutions and PAR table only), then `node test/levels.js <chapter>`,
  then `npm test`. Remove `solutions/levels/<id>.js` for any id you drop.
* Shared files (`src/levels.js`, `src/levels/shared.js`, `test/levels.js`,
  `tools/*.js`) belong to the coordinator: ask rather than edit. Never touch
  `src/engine.js`, `src/cards.js`, `index.html`, `style.css`, `src/ui/**`.
* UI smoke-test dependencies: `opening-night` must stay `LEVELS[0]` (a line of
  passes); `beat-the-dealer` (high only, its 9-shoe tests unchanged),
  `new-rules` (top only), `hot-streak` (both rules), `even-money` must keep
  their ids and War rules.

### What test/levels.js enforces

* Cards: the n-th floor of a chapter is the n-th card (A..K of the chapter's
  suit; `?`, `??`, `$`, `$$` in the finale); unique. Add floors in card order.
* The palette only grows across the whole campaign (use `paletteThrough`).
* `specialCards` only in the finale, only growing; no floor before the first
  special floor mentions "joker", "advertis…" or "wild card" in its title,
  brief or story.
* Reference solutions: on the floor, palette and War rules only; shoe decks
  only natural cards plus the level's `specialCards`; every test passes; par
  exact; removing any one croupier breaks it; door levels fail without the door.
* Tests: ≥ 3; every hand has `handSize` distinct natural cards (fixed tests
  may reuse cards between hands); "pay all" and "drop all" fail; every mutant
  differs from the real rule on some test hand.

### Design rules

* **Intros never explain the solution.** One to three short paragraphs: set
  the scene, continue the arc (docs/story.md), introduce a new croupier or
  card in a sentence. The brief states the exact rule; put edge cases (ties,
  aces, two pair vs trips, the A–5 straight) in the brief or story whenever a
  player could guess wrong.
* **Rules are causal.** `pays(hand, earlierHands)` sees only earlier hands, so
  "the best of its group" style rules are impossible; "the 5th card of its
  group" is fine.
* **Payouts are input hands.** Any order within a hand; a duplicate's copy
  counts as the card (so a copy may be paid and the original dropped); house
  cards never. Regrouping can only be internal.
* **Floor sizing.** The working croupiers should dominate: place the desk so
  the reference needs few passes (≤ about a quarter of par), and leave 1.5–3×
  the reference's footprint so other designs fit. Pillars are for making
  layout choices, not for padding pass counts. Check the reference is not
  wildly loose with `node tools/optimize-level.js <id>` (only for
  `{ nodes, links }` recipes), but par is simply what the reference achieves;
  players beating it is fine.
* **Trade-offs.** Prefer floors where a cheaper machine is slower (merging
  streams, sharing a croupier, loops) or where several structures compete.
* **Random tests.** `makeTests` deals from one deck per test, so hands per
  test ≤ 52 / handSize (5-card: 10; 4-card: 13; 3-card: 17; 2-card: 26). Fixed
  tests carry the edge cases; rare hands (royal flushes, quads, full houses)
  must be in fixed tests.
* **Stress tests** for every machine that tests a copy, releases a verdict, or
  sends pieces of a hand along different routes: a fixed test of deciding
  hands back to back (all winners, then all losers), one alternating winners
  with hands that fail fast, and runs of the same verdict. These are what
  catch verdicts or pieces overtaking each other.
* **The door** (a War on the hex the source feeds, a `once` shoe for the first
  ticket, the gate returning used verdict cards as tickets) is needed when a
  copy's decision can be made at different depths and the routes can't be
  evened out (Full House, House Record: `DOOR` is exactly these two). A single
  decision point with equal-length routes afterwards works without it (Bottom
  Pair, Small Pairs, Two Pair, Calling Card, After a Pair, Red Carpet), and so
  do several decision points padded to equal length (Jacks or Better); prove
  it with the stress tests and only list a level in `DOOR` if its reference
  has a door.
* **Top-card gates.** With top-card War a released 2 does not always lose to
  the original (its top card may be a 2). Gate with high-card War (allowed
  from 10♣) or, in the finale, with `$` (loses to everything) and `?`
  (beats everything). One-card hands have the same problem with a 2 or an A.
* **Shuffles.** On 5 cards the completed cut gives all five rotations, and
  cut/in/out reach 20 of the 120 orders; on 4 cards cut gives 2 orders,
  cut/in/out 8 (the 1st and 4th cards always land in different halves), and
  burn adds the rest. Shuffle floors must need a non-rotation (or be cheaper
  than the rotation by cuts). From 8♣ on, Deal with repeated sides makes any
  order-preserving subset of a hand (unlisted sides drop cards), so shuffles
  are only ever necessary on 5♣–7♣; later floors that pick out positions use
  Deal (Every Other, Bottom Pair, Two Pair).
* **Stacking.** Outputs to one side are stacked: War with all four ports one
  way stacks winner on top (so a knockout merge is one War, but a "loser on
  top" merge still needs a gather); Duplicate with both ports one way doubles
  a hand; completed cut and burn rotate.

### Patterns the later chapters can build on

* Reference card, stripped by cut: k refs on top of an n-card hand need
  k ∈ {n−1, n}; underneath, k ∈ {n, n+1}. Burn (3♠) strips one ref on top.
* The sandwich: [X, R−1, R+1] is a run only for R.
* A reference stack built by a loop (Lucky Number) or by Hand(n) (Seven Heaven).
* Deal as a selector: list a side once per card position to keep, an empty
  side for cards to drop (Every Other, Bottom Pair, Two Pair).
* Test a copy and gate the original with a *copy-derived dealer* (Upper Hand,
  High Spade, Top Pair, Every Other): no verdict needed when "the highest card
  is (not) in this pile" is the question.
* Rig the last War (Acey-Deucey): when a hand is tested in pieces, every
  piece goes on; failing pieces collect an ace so the final War loses.
* Release a verdict (Bottom Pair onwards): War against a shoe with both
  dealer ports one way; yes releases a 2, no an ace, and the original plays
  it at a high-card gate.
* A shoe deck as a sequence (Third Time Lucky): shoes deal in order, one card
  per free slot.
* Carry a card to the next hand: put it in the gate's dealer line behind a
  `once` seed for the first hand (Hot Streak, After a Pair's verdicts,
  Bookends' bottom cards).
* Windows: Duplicate (both ports one way) + a seed + Hand(2) gives
  [previous, current] pairs.
* Advertising cards as fillers and seeds: a `$` keeps a pile from being
  empty without ever pairing (Red Carpet); a `$$` seeds a memory (Déjà Vu).
* Memory of player cards (Déjà Vu): the cards themselves circulate.

## Feasibility notes

Machines checked in the simulator while planning, and what the built
references came to (par croupiers):

* Shuffles: Bottom Dealer (4-card) in,in (in,cut also works); Fourth Street
  in,cut vs four cuts; Second Fiddle out,cut (no rotation puts the 1st and 2nd
  cards on top of different halves); Burn Card a single burn. The planned
  Top and Bottom (7♣) and 4-card Bookends were dropped; Every Other and Bottom
  Pair use Deal instead of the planned shuffles.
* Verdict floors, all door-free: Bottom Pair 11, Small Pairs 14 (planned 16),
  Two Pair 13, Calling Card 11 (14 with a door before), After a Pair 12
  (planned 16, with a copy), Jacks or Better 19, Red Carpet 12 (the planned "no
  black cards" rule, with sort and regrouping, was 9). Each passes back-to-back, alternating and same-verdict
  stress tests; unequal verdict routes fail them.
* Knockout with one-War merges: 8 (planned ~10, old par 16). Low Ball: a
  10-croupier cut chain (planned ~16 as a loser-on-top tournament).
* Third Time Lucky 2 (planned 7 with passes). The Wheel 6 (planned 8). Seven
  Heaven 5 with Hand(4) and K7 (planned 8 with Hand(5) and K8). Déjà Vu 6
  (planned 7). Snap 5 (not built). Acey-Deucey 11. Lucky Number loop 8 vs 11.
* Even Money: the owner reported an 11-croupier loop; I could not find it (a
  single gather/straight/cut loop fed by a cycling 3-7-J shoe jams on the odd
  cards, which never leave). The reference stays at 12 unrolled; Lucky Number
  is the designated "loop beats unrolling" floor.
