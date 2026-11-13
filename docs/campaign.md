# Stacked Deck: the 56-floor campaign

One floor per playing card. Four suit chapters of 13 floors, A to K, then a
finale of four floors, one per special card. This document describes the
campaign as built: the floor table, when each croupier and card arrives, the
conventions every chapter follows, and the notes from building it. Floors
outside the 56 live in the bonus deck (see "The bonus deck" below). All five
chapters are built; where the builders departed from the original plan, the
tables below follow the code (`src/levels/*.js`, `tools/level-specs/*.js`).

| Ch | Suit | Name (`CHAPTERS`) | Module | Cast and arc | Status |
|---|---|---|---|---|---|
| 1 | ♥ | Opening Night | `hearts` | Opening night, the Owner's notes, Old Thursday, the twins, Sal; the house learns to stack the deck. Ends with Dmitri's Even Money. | **built** |
| 2 | ♦ | Stacking the Deck | `diamonds` | The Vellanis' games: flushes, sets, the Owner's sevens, then War. Ends with the Vellani family game; a rival casino lights up two blocks away. | **built** |
| 3 | ♣ | House Rules | `clubs` | The rival casino opens; copies of a hand. Commissioner Pryce's top-card regulation (4♣ to 9♣); the Kesslers' bottom dealer and the riffles; the first floors that pay something other than the hands dealt (a hand upside down, a hand once per ace); Pryce loses Low Ball. Ends with verdict cards and the rival's last big night. | **built** |
| 4 | ♠ | The House Always Wins | `spades` | The rival folds and its owner deals for you. Memory, burn, the ticket door, sort, hand; flushes regrouped across hands, house hearts paid for spades. The council, the mayor's records, the house record. Ends with the envelope under the cash tray. | **built** |
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
| 6♣ | expected payouts, `ordered` (the payouts are not the input hands) | Upside Down |
| 10♣ | both War rules again (regulation lifted); a hand paid more than once | Ace Count |
| J♣ | releasing a verdict card (technique, no new croupier) | Bottom Pair |
| A♠ | shoe `once` (memory; technique) | Hot Streak |
| 3♠ | burn | Burn Card |
| 5♠ | the ticket door (technique) | Full House |
| 7♠ | sort | Calling Card |
| 8♠ | hand (n 1–13) | Seven Heaven |
| 9♠ | payouts regrouped from several input hands | Suit Yourself |
| 10♠ | payouts made of house cards | Change of Heart |
| `?` | monochrome joker (`specialCards: ['?']`) | Mind the Gap |
| `??` | colour joker | One Card Short |
| `$` | front advertising card | Red Carpet |
| `$$` | back advertising card | Déjà Vu |

`warRules`: `['high']` until 3♣; `['top']` for 4♣–9♣; `['high', 'top']`
from 10♣ on. `specialCards`: `[]` everywhere except the finale, where it grows
`['?']`, `['?', '??']`, `['?', '??', '$']`, then all four.

## The floors

Difficulty is 1–10. "Ref" means a reference card from a shoe. Floors marked
**expected** pay something other than a subset of the input hands (their
level has `expected(inputs)` instead of `pays`; see docs/architecture.md,
"Payouts"). Every sketch
describes the reference solution (the recipe in `tools/level-specs/<chapter>.js`)
and its par as croupiers/rounds from the chapter's `PAR` block (rounds are
the total over the floor's tests); where a cleverer build is known, its
croupier count follows (a way to beat par). Figures marked ~ are alternative
builds' scores converted from the rounded averages used before rules
version 9, so they are approximate.
Hands are the hand size. "Reused" means the level id survives from the old campaign (saves
are keyed by id).

### Chapter 1 ♥ Opening Night (built)

| Card | id | Title | New | Hand | Puzzle | Reference (par) | Diff | Reused |
|---|---|---|---|---|---|---|---|---|
| A♥ | opening-night | Opening Night | pass | 1 | pay every card | 3 passes in a line (3/33) | 1 | yes |
| 2♥ | around-the-bar | Around the Bar | routing | 1 | a ring floor around the bar | either side of the ring (7/45) | 1 | yes |
| 3♥ | two-tables | Two Tables | merging | 1 | two sources, one desk, 16 hands | merge early 4/57, or a line per table 6/~33: the first real trade-off | 2 | yes |
| 4♥ | hearts-only | Hearts Only | suits | 1 | hearts only; unassigned ports drop | one splitter (3/55) | 2 | yes |
| 5♥ | seeing-red | Seeing Red | shared sides | 1 | red cards; a wheel in the way | H and D to one side (4/69) | 2 | yes |
| 6♥ | standing-room | Standing Room | three sources | 1 | hearts and spades from three tables, palms on the floor | merge all then one splitter 10/107, or a splitter per table ~18/~56 | 3 | new |
| 7♥ | black-tie | Black Tie | | 1 | black cards, two tables, cramped | 7/74 | 4 | yes |
| 8♥ | back-to-back | Back to Back | straight | 2 | runs from two tables by the door | merge then one straight 9/83, or a straight per table 10/~60 | 3 | yes (now two tables) |
| 9♥ | next-door | Next Door | shoe, gather, cut | 1 | 6s and 8s; corridor | [X, 7] straight, cut off the 7 (7/75) | 4 | yes |
| 10♥ | lucky-seven | Lucky Seven | two refs | 1 | the 7s | two neighbour stages, each with its own cut: [X, 6] catches 5 and 7, then [X, 8] keeps the 7 (8/77). Beat par with the chain [X, 6] then [X, 6, 8] (7) or the sandwich, [X, 6, 8] in one straight, a run only for 7 (6) | 5 | new |
| J♥ | penny-ante | Penny Ante | a second stage | 1 | A, 2, 3, 4 (ace low) | [X, 2] catches A and 3; a cut strips the 2 from the rest, and [X, 3] catches 2 and 4; each stage's yes hands lose their ref at their own cut, and one pass takes both to the desk (10/103). Both stages sharing one cut, wrapped round the first straight: 9 | 5 | new |
| Q♥ | royalty | Royalty | three stages | 1 | J, Q, K | three single-ref stages, each with its own cut: [X, Q] catches J and K; the rest lose the Q and meet [X, J] (10 or Q); those meet [X, K], which keeps the queens (13/114). The sandwich [X, J, K] as the second stage, with both yes hands sharing one cut: 10 | 6 | new |
| K♥ | even-money | Even Money | three stages | 1 | 2 4 6 8 10 Q | refs 3, 7, J catch {2, 4}, {6, 8}, {10, Q}; each stage has its own yes cut to the desk (14/169). Shared cuts: 12 | 7 | yes |

### Chapter 2 ♦ Stacking the Deck (built)

| Card | id | Title | New | Hand | Puzzle | Reference (par) | Diff | Reused |
|---|---|---|---|---|---|---|---|---|
| A♦ | red-flush | Red Flush | flush | 3 | red flushes | flush, then suits H D (3/53) | 3 | yes |
| 2♦ | either-or | Either Or | xor of two tests | 2 | suited or a run, not both | flush yes → straight no; flush no → straight yes; merge (5/84) | 3 | new |
| 3♦ | pair-night | Pair Night | kind | 5 | largest set is a pair | K2 yes → K3 no (3/60) | 3 | yes |
| 4♦ | inside-seven | Inside Seven | ref position and cut size | 2 | the two cards make a 3-card run with a 7 | gather the 7 *on top*, straight, cut's bottom half is the hand (5/82) | 4 | new |
| 5♦ | seven-up | Seven Up | kind with a ref stack | 2 | holds a 7 | [a, b, 7, 7] has trips iff a 7 is held; cut top half (6/89); without the stack, split on pairs first (8) | 5 | new |
| 6♦ | lucky-number | Lucky Number | **a loop beats unrolling** | 5 | exactly one 7 | four 7s on top: K5 yes, K6 no, cut. The reference unrolls the 7-stack, four shoes and four gathers (11/80). A loop beats par on croupiers (two shoes → gather → K4, "no" back to the gather): 8/~170 | 6 | new |
| 7♦ | beat-the-dealer | Beat the Dealer | war | 1 | beats a 9 | War vs a 9 shoe (4/69) | 4 | yes |
| 8♦ | ace-in-the-hole | Ace in the Hole | whole-hand War | 5 | holds an ace | War vs a king (4/52) | 3 | yes |
| 9♦ | inside-bet | Inside Bet | lose port | 5 | high card 9–Q | beat an 8, then lose to a Q (5/60); or the hand as dealer against a K | 4 | new |
| 10♦ | top-dog | Top Dog | War on the pieces | 2 | top card beats bottom | cut, War; a gather puts the winner and the dealer's losing card back together for the desk (5/78). Stacking the two War outputs on one side instead: 4 | 5 | yes |
| J♦ | top-of-the-heap | Top of the Heap | pieces reassembled | 5 | top card beats each other card | cut, cut, gather the other four as dealer, War; a gather rebuilds a winning hand (6/74). Stacking the War outputs instead: 5 | 5 | new |
| Q♦ | royal-flush | Royal Flush | stripping one ref from a big hand | 5 | 10–A suited (the A–5 straight flush is the trap) | flush → beats a K (has an ace) → 9 on top → straight (only 10–A or 4–8) → two cuts and a gather take the 9 off (11/66) | 7 | new |
| K♦ | acey-deucey | Acey-Deucey | **indicator cards on the pieces** | 3 | middle card strictly between the ends | split [a][b][c]; War sorts the ends into hi and lo; b plays lo, and the pair goes on as one stack to one of two gathers by the result, where it picks up an indicator on top from a shoe (2: b won; ace: it didn't); hi plays that stack (its high card is b when b won, and an ace makes hi lose anyway), and the stack picks up a second indicator the same way (2 only if hi won) with hi gathered underneath; a cut takes the two indicators off the top, and the hand is paid if it beats them (two 2s; never an ace). Equal routes out of each War; hi waits for its stack at the last gather (21/244, 4 passes). Beat par by rigging the last War (b collects an ace only when it loses, so the final War, hi against [b, lo] or [b, ace], is the gate; equal routes; a gather rebuilds a winner): 15/~224 (the old reference); stacking War outputs as well: 11 | 8 | new |

### Chapter 3 ♣ House Rules (built)

Regulation: top-card War only from 4♣ to 9♣ (Pryce); lifted at 10♣ when Pryce
loses his own Tuesday game.

| Card | id | Title | New | Hand | War | Puzzle | Reference (par) | Diff | Reused |
|---|---|---|---|---|---|---|---|---|---|
| A♣ | upper-hand | Upper Hand | duplicate | 5 | high | highest card (ties count) is one of the top two | duplicate; cut the copy; gate: the original vs the copy's top half, pay on **lose** (ties go to the house) (4/90). Cutting the hand itself and playing the halves also works | 4 | new |
| 2♣ | high-spade | High Spade | | 5 | high | no card outranks the best spade | copy + 2♠ ref gathered → suits → spade pile is the gate's dealer, pay on lose (6/101) | 6 | yes |
| 3♣ | top-pair | Top Pair | set | 5 | high | pair or better, highest card in the largest set | K2 yes, duplicate, the copy's set pile is the gate's dealer, pay on lose (5/73) | 6 | yes |
| 4♣ | new-rules | New Rules | top-card War | 5 | top | top card beats a 10 | top-card War vs a 10 shoe (4/53) | 3 | yes |
| 5♣ | bottom-dealer | Bottom Dealer | in/out shuffles | 4 | top | bottom card beats a 10 | on 4 cards a cut only swaps the halves; in, in brings the bottom card up (in, cut too), then War vs a 10 (5/77) | 4 | yes (now 4-card hands) |
| 6♣ | upside-down | Upside Down | **expected**, `ordered` | 5 | top | pay every hand in reverse order (card order checked) | completed cut, in, out reverses five cards (3/63); cutting into halves, reversing each (completed cut on 2, out + completed cut on 3) and stacking them also works (5) | 4 | new (replaces Fourth Street) |
| 7♣ | second-fiddle | Second Fiddle | a non-rotation | 5 | top | top card beats the second card | out-shuffle gives [a d b e c]; cut, so the halves' top cards are a and b; top-card War of the halves, winner and dealer's loser stack to the desk (4/98). Rotations never put a and b on different halves' tops | 5 | new |
| 8♣ | knockout | Knockout | deal | 5 | top | holds an ace | deal to five singles round the dealer; each merge is a War, a gather and a pass (the winning card goes straight to the gather, the loser round the pass to its under side, so the better top card stays on top); four merges bring the best card up; final War vs a K (17/220). One War with all four ports to one side (winner on top) is a whole merge: 8 | 6 | yes |
| 9♣ | low-ball | Low Ball | | 5 | top | every card beats a 5 | a chain of five top-card Wars, each card in turn against a 5 from its own shoe: a completed cut between Wars rotates the hand by two, so all five get a turn (14/103). Passing the 5 just beaten along as the next dealer saves the shoes: 10. Pryce loses; the regulation goes | 7 | yes |
| 10♣ | ace-count | Ace Count | both rules again; **expected** (a hand paid several times) | 3 | both | pay each hand once per ace it holds | three stages: a copy plays a K by its top card (only an ace wins) and pays on a win; the hand is cut (on 3 cards a completed cut brings the next card up) (13/112, 3 passes). Passing the K just played on as the next War's dealer saves shoes | 5 | new (replaces Every Other, now in the bonus deck) |
| J♣ | bottom-pair | Bottom Pair | **release a verdict, no door** | 5 | both | the bottom two cards are a pair | duplicate; deal drops the copy's top three cards; K2 on the bottom two: yes releases a 2, no an ace, both routes one War and one shared pass long; gate the original vs the verdict with high-card War (11/94) | 6 | new |
| Q♣ | small-pairs | Small Pairs | | 5 | both | largest set is a pair (or two pair) and every paired card is 6 or lower | K2 yes, K3 no, duplicate; copy → set → War(set pile vs a 6): the 6 it loses to releases a 2, the 6 it beats an ace; same verdict and gate as Bottom Pair (14/91) | 7 | new |
| K♣ | two-pair | Two Pair | finale | 5 | both | exactly two pair (trips, full houses and quads don't count) | K3 no; duplicate; copy → set → deal drops one paired card, so what's left still holds a pair only if there were two → K2; release; gate (13/104) | 7 | new |

### Chapter 4 ♠ The House Always Wins (built)

Both War rules throughout.

| Card | id | Title | New | Hand | Puzzle | Reference (par) | Diff | Reused |
|---|---|---|---|---|---|---|---|---|
| A♠ | hot-streak | Hot Streak | memory (`once`) | 1 | beats the card before | a copy of each card waits as the next card's dealer; a `once` ace makes the first card lose (4/80) | 5 | yes |
| 2♠ | high-roller | High Roller | champion loop | 5 | high card ties or beats every earlier hand | the champion loop, seeded by a `once` 2 (4/89) | 5 | yes |
| 3♠ | burn-card | Burn Card | burn | 5 | the second card beats a 10 | burn with both ports to one side (top card to the bottom), then top-card War vs a 10 (3/55); vs 2 shuffles or 3 cuts | 3 | new |
| 4♠ | third-time-lucky | Third Time Lucky | a shoe deck as a sequence | 5 | every third hand pays | a shoe stacked [A, A, 2] as the gate's dealer (shoes only deal when the slot is free, so the sequence stays in step) (2/49) | 3 | new |
| 5♠ | full-house | Full House | the ticket door | 5 | full house | test a copy (K3, set, K2 on the rest), release, gate, door (13/409). The copy's decision comes at different depths, so verdicts overtake each other: this is where the door is needed | 8 | yes |
| 6♠ | the-wheel | The Wheel | burn strips a ref | 5 | ace-to-five straights only | 6 on top → straight (only A–5 or 7–J and the like) → burn → beats a K (6/63) | 5 | new |
| 7♠ | calling-card | Calling Card | sort | 5 | holds a spade | duplicate; sort the copy so a spade comes to the top; burn isolates the top card; suits turn it into a verdict (2 or A); gate. One decision, equal routes, no door (11/210; old par 14 with a door) | 6 | yes |
| 8♠ | seven-heaven | Seven Heaven | hand | 5 | three or more 7s | shoe of 7s → Hand(4) → four 7s on top → K7 → cut (5/168); five 7s and K8 also work, slower; compare Lucky Number's loop | 4 | new |
| 9♠ | suit-yourself | Suit Yourself | **expected**: regrouping | 5 | every five cards of one suit played (in play order, top card first) are paid as one hand; leftovers never | Suits to four sides (S, H, D, C clockwise from NW), a Hand(5) per suit, passes to the desk (9/69; giving spades and hearts the two shortest routes makes 9/~63) | 4 | new (replaces After a Pair, now in the bonus deck) |
| 10♠ | change-of-heart | Change of Heart | **expected**: house cards | 1 | for every spade, pay the heart of the same rank | a shoe stacked A♥..K♥ into Hand(13) makes a whole suit; gather a spade on top, Set pulls out [spade, heart], burn drops the spade by the desk (6/696). A suit kept circulating (duplicate, a `once` build) is much faster | 6 | new (replaces Bookends, now in the bonus deck) |
| J♠ | next-in-line | Next in Line | windows: remembering the previous card | 1 | a card next in rank to the card before (the first card is compared with the dealer's 7) | duplicate: one copy into a gather, the other round a pass to its under side, where it waits as the previous card (a `once` shoe seeds a 7); straight; the cut's top card (the current one) to the desk (6/133). Duplicate with both ports one way into Hand(2) makes the windows in 5 | 6 | new |
| Q♠ | jacks-or-better | Jacks or Better | everything, no door | 5 | video poker: a pair of jacks or better, or any better hand | straight / flush / K3 pay directly; K2 no drops; pairs: copy → set → burn → K2 (two pair) or the lone pair card vs a 10 (high pair); release; gate. A pass beside the second K2 matches the War vs the 10, so every route from the last decision takes the same time and no door is needed (19/147) | 9 | new |
| K♠ | house-record | House Record | finale | 5 | largest set ties or beats every earlier hand's | copy → K2/K3/K4 release a marker card for the set size → champion loop of markers → release a 2 or an ace; gate; door (31/627) | 10 | yes |

### Chapter 5 The Envelope (built)

| Card | id | Title | New | Hand | Puzzle | Reference (par) | Diff |
|---|---|---|---|---|---|---|---|
| `?` | mind-the-gap | Mind the Gap | monochrome joker as a wild reference | 2 | the ranks are exactly two apart (5–7, Q–A, A–3; no wrapping) | straight no → joker on top → straight yes → burn the joker (5/129). Without jokers it needs a ref per rank | 6 |
| `??` | straight-flush-draw | One Card Short | colour joker keeps a flush | 4 | one wild card would make a straight flush | colour joker on top → straight → flush → burn (5/86); the colour joker keeps the flush, so the tests can come in either order (a monochrome joker would spoil it) | 6 |
| `$` | red-carpet | Red Carpet | advertising card as a filler | 5 | the red cards alone hold a pair or better | duplicate; a `$` joins the copy so the red pile is never empty (it never pairs); suits drop the black cards; K2: yes releases a 2, no an ace, equal routes; gate (12/114) | 7 |
| `$$` | deja-vu | Déjà Vu | memory of the player's own cards | 1 | the card's rank has been played before tonight | a gather stacks [X, memory]; K2 yes: burn X to the desk, the memory goes round; no: [X, memory] is the new memory. A `once` shoe seeds the memory with `$$` (no natural card could, it might pair the first card) (6/595). Harder variants (only the second time) need two memories and were not found to work | 8 |

(Snap — "pay a card of the same rank as the card before" — is the same
window machine as Next in Line with Kind 2 instead of Straight. It is in the
bonus deck after Next in Line, with the first card compared with a 7 as
there; "the first card never wins" would need a `$` seed instead.)

## The bonus deck (built)

`BONUS` in `src/levels.js` (module `src/levels/bonus.js`, recipes in
`tools/level-specs/bonus.js`, mutants in `test/mutants/bonus.js`): floors
outside the 56-card campaign. Cut floors move here rather than being deleted
(their ids, saves and solutions are unchanged), and the deck holds extra
floors. Each bonus floor opens once its `unlockAfter` floor is
solved and doesn't count towards the campaign's unlock window.

**Cards.** The bonus deck is a second deck: the n-th bonus floor is the
n-th card A♠, 2♠, ... K♠, then A♥ ... K♥, A♣ ... K♣ and A♦ ... K♦
(`BONUS_SUITS`, the order the level select groups them in), and BONUS is
kept in difficulty order (the Diff column, which each level repeats as
`difficulty`, then par croupiers), not the order the floors open in, with
one exception: if bonus floor A opens bonus floor B, B comes after A
(test/levels.js checks all of this). Adding a floor renumbers the ones
after it (cards are labels only; saves are keyed by id). The deck is full
at 52: a 53rd floor would need a third deck (`BONUS_SUITS`).

**Opening.** A bonus floor opens when its `unlockAfter` floors are all
solved: one id or a list, of campaign floors or other bonus floors. Every
chain of bonus floors ends at campaign floors. A locked bonus card names what
it needs on its back: campaign floors by their card, bonus floors by theirs
on a starred navy chip, and floors already cleared struck through.

The floors cut from the campaign, and the easy extras, open after the
campaign floor whose idea they take further, as early as their palettes
allow. Bookends (after Burn Card, palette through Burn) and After a Pair
(after Small Pairs, palette through Deal) were moved earlier, and Crossed
Wires (after Beat the Dealer, palette through War, high card only, no
special cards) out of the Déjà Vu floors, once `tools/bonus-usage.js` showed
no player's machine used anything those floors don't have. The extras with
early palettes open in the campaign: Checkerboard after Bottom Dealer,
Natural after Ace in the Hole, Snap and Ceasefire after Next in Line, Crazy
Eights after High Roller, Cut to the Ace after Burn Card, Rank and File
after Change of Heart, Every Other after Ace Count, Running Count after Ace
Count and Hot Streak (the Kesslers' count; its palette), Two by Two after
Two Pair, and Pot Luck after Crossed Wires and Hot Streak (the twins'
game; memory).

The floors that need every croupier and special card open in lines from
Déjà Vu, each following the floor its story continues (and usually a
simpler puzzle of the same kind), so that Déjà Vu alone opens four floors rather
than all of them:

* Two Apart, then Three Apart (the doormen tell the cloakroom);
* Four of a Kind (the city's one more game), then Missing Card (a card
  palmed from a deck) and First Sighting (the mayor's birdwatching); Missing
  Card opens The Rest of the Deck (then Head Count, Pryce's next
  regulation) and Perfect Pair (the house's two-deck shoe; then
  Counterfeit);
* Counting Up, then One Up (Old Thursday's last trick, then Twenty-One Card
  Trick: it wasn't) and Round the Clock (Old Thursday wants every rank);
* Odds and Evens (Dmitri's even numbers);
* and, with Crossed Wires (the first floor with seated players and
  labelled desks), Uneven Tables ("the wiring stays"), Mirror Image (the
  twins at two tables again; then Showdown, then Follow Suit, the uncle's
  trick-taking game, and Twice Shy, the twins with a deck each again) and
  Casino Numbers (then Split the Difference; Times Tables and Carry the
  One, Dmitri's spreadsheet growing; and Every Twenty-One, Hit Me and Punto
  Banco, the casino's card games counted out).

Rising follows Every Other (the string quartet gives up on beats) and Déjà
Vu (its palette), and Three in a Row Next in Line (the mayor's napkin) and Déjà
Vu; Last In, First Out follows Three Apart (the cloakroom again) and The
Rest of the Deck (paying back at closing time). Red Flush opens Off Suit,
which opens Night Off; Skeleton Crew needs Calling Card (for Sort) and Night
Off; No Kings follows Skeleton Crew. The bolted floors open in a line (the
auditors): One Deck after Seven Heaven, One War after Inside Bet and One
Deck, Dumbwaiter after One War and Déjà Vu.

Perfect Pair and Counterfeit deal from two decks (`decks: 2`), so a hand
may hold a card twice and a card may be played twice in a night.

Solved floors stay open, so a new chain never locks a floor someone has
cleared; one they had opened but not solved closes until they clear what it
now needs (their working machine is kept). A floor can open earlier only if
its palette shrinks to what the earlier floor has, and a croupier taken off a
floor breaks every saved machine using it, so check what players' machines
use first: `node tools/bonus-usage.js solutions.json` (on a dump of
`/solutions`; see the comment at its top) lists, for each bonus floor, every
croupier, War rule and special card in use (machines and players), and the
earliest campaign floor with all of it. Floors that open after a moved floor
still need Déjà Vu (or whatever their palette needs) in their own
`unlockAfter`, as the seated floors after Crossed Wires do.

**Palette.** A bonus floor's palette, War rules and special cards must all be
available at the latest campaign floor it needs (directly or through its
chain;
test/levels.js checks this; the campaign's "palette only grows" rule doesn't
apply to the bonus deck, and Off Suit and Night Off take croupiers away).

| Card | id | Title | After | Hand | Puzzle | Reference (par) | Diff | Origin |
|---|---|---|---|---|---|---|---|---|
| A♠ | split-pot | Split Pot | 3♣ top-pair | 5 | **expected**: for every hand with a pair or better, pay its largest set and the rest as two hands | K2, Set with the two piles to the desk by different sides (same side would stack them) (3/56) | 2 | new |
| 2♠ | small-change | Small Change | 7♦ beat-the-dealer | 1 | **expected**, house cards: for every K pay the A♠ | War vs a Q (win), War vs a K (lose: kings only), War against an A♠ shoe, dealer's win to the desk (6/130) | 2 | new |
| 3♠ | checkerboard | Checkerboard | 5♣ bottom-dealer | 6 | **expected**, `ordered`: every hand (three red cards and three black) with its colours alternating, a red card on top, each colour in the order dealt | Suits sends the reds one way and the blacks another, each pile in hand order; a pass brings the blacks round, a gather stacks the reds on top, and an out-shuffle interleaves the halves (4/79). Blacks on top and an in-shuffle is the same size; no smaller build found (Suits is the only croupier that sees colour, and its two piles can't both reach the gather directly) | 3 | new |
| 4♠ | two-apart | Two Apart | `$$` deja-vu | 2 | ranks exactly two apart (ace high or low) | not a Straight, but a Straight once a joker is gathered on; Suits drops the joker (5/120) | 3 | new |
| 5♠ | snap | Snap | J♠ next-in-line | 1 | a card of the same rank as the card before (the first card is compared with a 7) | Next in Line's windows with Kind 2 instead of Straight: duplicate, one copy round a pass to wait as the card before (a `once` 7 seeds it), gather [current, previous], Kind 2, the cut's top card to the desk (6/150). Duplicate with both ports one way into Hand(2), the seed beside it: 5/150 | 3 | new (the spare idea from the finale notes) |
| 6♠ | three-apart | Three Apart | two-apart (bonus) | 2 | ranks exactly three apart (ace high or low) | as Two Apart with two jokers: not a run with one, a run with two (7/125) | 3 | new |
| 7♠ | natural | Natural | 8♦ ace-in-the-hole | 2 | blackjack: an ace with a 10, J, Q or K (two aces don't count) | Kind 2 drops pairs (two aces), a War against a K keeps hands with an ace; a J, a Q and a K are gathered underneath, so [A, x, J, Q, K] is a straight only for x = 10 and holds a pair only for J, Q or K; a cut takes them off (12/134). Any three of 10, J, Q, K work the same way. Beat par by stacking the War's king under the hand (win and dlose to one side) as one of the three: 10/128. High-card War only sees the ace, so testing the other card on its own means splitting the hand (sort the two cards with a War, test the low one against a 9); that is no smaller, since a miss must still take both pieces off the floor in step | 4 | new |
| 8♠ | off-suit | Off Suit | A♦ red-flush | 3 | **pays**: as Red Flush (a flush in hearts or diamonds), but with no Suits | an ace of hearts gathered under the hand: a flush only for a heart flush. Otherwise strip the ace (Cut: [c0 c1] [c2 A♥]; Cut the bottom: [c2] and the ace; Gather the hand back) and try an ace of diamonds; either flush loses its ace the same way on the way to the desk (13/71). Without Burn or Suits, stripping a card takes two Cuts and a Gather | 4 | new |
| 9♠ | crossed-wires | Crossed Wires | 7♦ beat-the-dealer | 1–3, three players | **expected**, labelled desks: every hand at the desk diametrically opposite its player (A at Z, B at Y, C at X) | a crossover network: every pair of streams crosses at a War, the player's hand sent one way and the dealer's the other, win or lose (A crosses B, then C, then B and C cross) (14/68) | 4 | new |
| 10♠ | every-other | Every Other | 10♣ ace-count | 5 | highest card (ties count) is the 1st or 3rd card | duplicate; deal the copy's 1st and 3rd cards to the gate and the rest onto the floor; gate on lose (4/90) | 5 | cut from 10♣ (it repeated Upper Hand) |
| J♠ | bookends | Bookends | 3♠ burn-card | 2 | top card beats the previous hand's bottom card | duplicate; the copy's bottom card waits in the gate's dealer line behind a `once` ace; top-card War (5/134) | 5 | cut from 10♠ (it repeated Hot Streak's carried card) |
| Q♠ | one-deck | One Deck | 8♠ seven-heaven | 5 | **pays**: as Seven Heaven (three or four 7s), but no shoes: one `once` shoe bolted to the floor deals one deck in new deck order | Seven Heaven's machine with all four of the house's sevens: Hand(13) splits the deck into its suits, and the 7 is the seventh card of each (A..K, or K..A for clubs and hearts), so Deal keeps it and drops the rest, and Hand(4) stacks the four. Gathered on top of each hand, K7; a cut either way takes the stack off and sends it back round to the gather (10/837). Fewer sevens don't cut off cleanly from a five-card hand. Beat par with Hand(52) and one Deal picking out the four places: 9. Testing with fewer 7s (two 7s and two other cards, with Kind 5, so two sets can circulate) is wrong only on a hand holding four of a kind of another card's rank (or three, with two of a rank): a fixed test holds four of a kind of every rank, another three of a kind of every rank but 7, and a mutant per rank checks they catch it | 5 | new |
| K♠ | cut-to-the-ace | Cut to the Ace | 3♠ burn-card | 8–20 | **expected**, `ordered`: every hand cut to the A♠ (the cards above it moved, in order, under the rest; a hand with the A♠ on top paid as it is) | a loop: a Duplicate copies the hand, Burn takes the copy's top card X off, and Suits sends a spade to a War against a K that hands on the K, any other card on as itself (through a pass, so both routes are the same length and copies never overtake); the hand plays that at a top-card gate, which only the A♠ wins (it beats the K; every other spade loses to it, and a card ties itself); a loser is rotated by Burn with both ports one way and goes round again. Every route is first in, first out, so several hands share the loop (11/913). Beat par with the gate next to the Duplicate and no pass round the loop: 10 | 5 | new |
| A♥ | uneven-tables | Uneven Tables | `$$` deja-vu + crossed-wires (bonus) | 1–3, three players | as Crossed Wires, but each player plays a different number of hands (0 to 6) | tags: a joker on top of A's hands, an advertising card on C's; merge, two top-card Wars sort them out (only a joker beats an ace; only an ad card fails to beat one), Burn takes the tags off (18/94). The War network still works if a pass fills a stream's gaps with `$` | 5 | new |
| 2♥ | four-of-a-kind | Four of a Kind | `$$` deja-vu | 1 | **expected**, regrouped: every time the fourth unpaid card of a rank is played, pay those four as one hand | Déjà Vu's memory seeded with `$$`: gather, K4, Set (set to the desk, rest back to the memory) (6/533) | 6 | new |
| 3♥ | missing-card | Missing Card | four-of-a-kind (bonus) | 51 | **expected**, house cards: each test is one hand, a deck less one card; pay the missing card | a house deck (a shoe into Hand(52)) gathered with the hand holds every card twice but the missing one; Suits splits that by suit, and a Set per suit keeps every pair, so its rest is empty (dropped) for a whole suit and the missing card for the short one (12/1040). Beat par with Set on the whole stack first (the missing rank, seven cards against eight), Suits into piles of one or two and a single Kind 2 fed by all four piles: 9; two half-deck shoes into Hand(26)s are faster, 13/623 | 4 | new |
| 4♥ | counting-up | Counting Up | `$$` deja-vu | 5 | pay the first hand holding a 2, then the next holding a 3, ... up to the ace, then 2 again | the rank waited for is four cards of it, gathered on each hand: K5, then a cut splits them off; on a payout the four go to a War that releases the next four from Hand(4) on a stacked shoe (seeded by a `once` `$`) (9/290) | 6 | new |
| 5♥ | ceasefire | Ceasefire | J♠ next-in-line | 1 | single spades (each test one suit, or part of one, shuffled) with no War: pay a card higher than the card before (aces low); the first card never pays | windows [p c]: Duplicate (both copies one way) into Hand(2), seeded by a `once` K♠ (nothing beats a king, aces low); within one suit Sort is rank order, so a sorted copy of each window is stacked under it, [p c min max]; Deal sends c and min to K2: a pair means c is not higher (or is the king against the seed), otherwise Burn drops min and pays c (9/212). Beat par with four copies of each card (two Duplicates, both ports one way) into Hand(4): windows [p c c c], sorted, and a Cut's top half is [c c] unless c beats p, then K2 and Burn as before: 8/174 | 6 | new |
| 6♥ | three-in-a-row | Three in a Row | J♠ next-in-line + `$$` deja-vu | 1 | a card that makes three consecutive ranks with the two cards before it, in any order (ace high or low, no K-A-2); the first two cards never pay | windows of windows: Duplicate (both one way) into Hand(2), seeded with `$`, gives [p c]; the same on the windows with Hand(4), seeded with `$ $`, gives [a b b c]; Deal drops the second b (which reverses the rest, so c is on top), Straight, and Burn pays the top card; advertising cards are never in a run, so the first two cards can't pay (9/222). Beat par with a memory of the last two cards, as in Déjà Vu: a Gather puts [p2 p1] on the new card, one copy goes to Straight and Deal pays its third card, Burn drops p2 from the other to make the next memory, which starts as [`$` `$`] (a Hand(2) on a `once` shoe): 7/539, slower | 6 | new |
| 7♥ | rising | Rising | `$$` deja-vu + every-other (bonus) | 1–6 | cards never go down, top to bottom (aces high, ties fine) | [hand, joker, hand] round a loop: Burn, a top-card War of the burned card against the rest, a top-card War of the rest against an ace that only the joker wins; a last Burn drops the joker and pays the copy (12/214) | 6 | new |
| 8♥ | odds-and-evens | Odds and Evens | `$$` deja-vu | 5 | an even number of red cards (none counts as even) | copy; a colour joker gathered under it; Suits with only H and D assigned keeps the red cards in one pile with the joker last (it goes to hearts, the first suit with a port), so the pile is never empty; Deal to two sides leaves the last card dealt on top of its pile, so the joker tops pile X exactly when the red count is even; pile X plays an ace by top card (only a joker wins); a win plays a 2 from a shoe to release it, a loss releases the ace through a pass, routes of equal length; high-card gate (12/217). Beat par by gathering the red pile onto a `$`: then pile X has the joker or the `$` on top, and is itself the gate's dealer by top card, paying the original on a loss: 8/171 | 6 | new |
| 9♥ | after-a-pair | After a Pair | Q♣ small-pairs | 5 | pay a hand if the hand before it held a pair or better | duplicate; the copy's K2 releases a 2 or an ace into the gate's dealer line, seeded with a `once` ace (13/171); 12 without a copy | 6 | cut from 9♠ |
| 10♥ | two-by-two | Two by Two | K♣ two-pair | 4 | exactly two pair (trips and quads don't count) | Two Pair's reference unchanged: K3 no; duplicate; copy → set → deal drops one paired card, so what's left still holds a pair only if there were two → K2; release; gate (13/114). Two Pair with one card fewer: a player's machine that beats Two Pair's par may not carry over | 6 | new |
| J♥ | rest-of-the-deck | The Rest of the Deck | four-of-a-kind (bonus) | 1–5 | **expected**, house cards: after the last hand, every card of the deck not played, one card a hand | a shoe deals the deck then a joker behind the player (a pass prefers the player); everything is stacked until the joker is on top, so each suit holds the played cards twice and the rest once; Suits, K2 (a pair: Set drops the played cards; none: the whole suit is unplayed) and Hand(1) pays them one at a time (14/1506) | 6 | new |
| Q♥ | crazy-eights | Crazy Eights | 2♠ high-roller | 1 | pay the first card, every 8, and every card that matches the last card *paid* in rank or suit (a card not paid changes nothing; after an 8, its rank or its suit) | High Roller's champion loop, the champion replaced only on a payout: a gather stacks [card, champion]; two top-card Wars (beats a 7, not an 8) find an 8, else Flush or Kind 2 on the pair decides. On a payout a cut sends the card to a duplicate (the desk, and back as the champion); on a miss a second cut returns the champion and drops the card, and the same cut passes the paid card's copy back (a one-card hand is all bottom half). The first champion is a pair (a `once` shoe into a duplicate with both ports one way), so the first card always pays; the next card is always waiting at the gather before the champion comes back, so it goes on top whichever side the champion arrives from (14/1021, 2 passes). No smaller build found | 6 | new |
| K♥ | perfect-pair | Perfect Pair | four-of-a-kind (bonus) | 5, two decks | a hand holding two identical cards (the same rank and the same suit; with two decks never three) | within one suit a pair of ranks is a pair of identical cards. A copy is split by Suits, and one Kind(2) tests every pile (the clubs pile shares the hearts pile's pass); a pile with a pair loses its top card to Burn and gains a joker at a Gather, so Hand(5) gathers the piles again into the copy, with a joker exactly when the hand had a perfect pair. At the gate the original is the dealer: the joker beats it (paid on dlose), the plain copy only ties it. A hand gives one to four piles, and the next hand's piles would overtake them at the shared Kind(2) and Hand(5), so the rebuilt copy goes back to a door as its ticket (14/922, 4 passes). Without the door the piles mix | 6 | new |
| A♣ | pot-luck | Pot Luck | A♠ hot-streak + crossed-wires (bonus) | 1, two players | **expected**, labelled desks: War for a pot: the higher card (aces high) wins both, and the pot if any, as one hand at its player's desk (A's at X, B's at Y); on a tie (same rank) both go into the pot, which carries over until a deal has a winner; a pot left at the end is not paid | the pot rides under A's card with a marker card on top of it ([a, marker, pot...]; a `once` shoe deals the first marker, the empty pot), so two top-card Wars see only a and b: A's beats B's, else B's beats A's, else a tie. A winner's stack ([a, marker, pot..., b] or [b, a, marker, pot...]) goes to a Deal that sends the marker back round the loop and the rest to the desk; a tie's stack loses its marker to a Deal and gets it back on top from a Gather, and is the next pot. The loop passes behind A's desk (with both players and both desks outside it, the three ways back to the pot would cross), so the desks stand in the room (18/747; 18/687 with the tie's Gather joining the loop two passes sooner). With Burn, a tie's stack needs only a Burn with both piles to one side (the marker comes to the top) | 6 | new |
| 2♣ | night-off | Night Off | off-suit (bonus) | 3 | **pays**: as Red Flush (a flush in hearts or diamonds), but the palette stops at Cut: no Flush | Suits splits the hand's hearts and diamonds (to different sides, or they'd stack into one pile) into one line. Each red pile P (1 to 3 cards) gets 2♣ 3♠ 9♠ on top and is cut: the top half is 2♣ 3♠ (n < 3) or 2♣ 3♠ 9♠ (n = 3), the whole pile below. Straight tells those apart; a run is cut to its 2♣, the other gets a Q♠ underneath (one card or four). [K♠, bottom half, those cards] cut again puts the pile all in the top half only for n = 3, and Suits pays it. One Cut with fixed house cards can't (a bigger pile moves the cut only half a card, so the small piles are the ones that land cleanly); Straight amplifies the difference here, but Cuts alone can do it too, more simply. The 2♣ is a token, always the only club in the last bottom half, and goes back to build the next pile's house cards (a once shoe deals the first): without it piles overtake one another on Straight's two branches (25/398) | 6 | new |
| 3♣ | skeleton-crew | Skeleton Crew | 7♠ calling-card + night-off (bonus) | 3 | **pays**: heart flushes only, with Calling Card's croupiers but neither Flush nor Suits | Sort is the only croupier left that sees suits, and A♣ is the last card before the hearts in new deck order. Sort the hand with three A♣: a heart flush is [A♣ A♣ A♣, its hearts highest first], so card 3 is a heart and never an ace (A♥ sorts last); any other hand has card 3 inside the A♣ block (at most three cards before it, and something, or its own A♣, ahead of the hearts). Cut, and the bottom half plays a K in a top-card War: only an ace wins, and the losers are paid (10/69; checked on all 22,100 hands). Diamonds can't be done: K♦ and K♣ are adjacent in new deck order with the same rank, so every croupier left treats them alike | 6 | new |
| 4♣ | one-war | One War | 9♦ inside-bet + one-deck (bonus) | 5 | **pays**: as Inside Bet (high card 9 to Q), but no War croupiers: one high-card War bolted down, dealer from the W, its four ports to four sides (win NE, lose SE, dealer win SW, dealer lose E) | two passes through the one War: the hand as player against five 8s, then as dealer against five kings (which win only if the hand's high card is Q or lower). Each port then carries hands from one pass and references from the other, and Kind(5) tells them apart (a hand never holds five of a rank): win sends a hand on, dealer lose pays it; lose and dealer win only drop. Player and dealer travel as one stack, [hand, 8 8 8 8 8] or [K K K K K, hand] (shoe, Hand(5) and a gather each), and one cut splits every stack to the War's two sides, so its two queues stay in step (10/368). The mirror image (the hand as dealer against five 9s, then as player against five queens) works too, but sends its hands on by the far side of the War: 20 on this floor | 7 | new |
| 5♣ | dumbwaiter | Dumbwaiter | one-war (bonus) + `$$` deja-vu | 1–5 | **expected**, `ordered`: every hand as played, card for card; the players and the desk are in two rooms with no hexes in common (nor side by side), joined only by a bolted Hand(1) that takes cards from any side and hands them on one at a time into the desk's room | the players' room pads every hand to five cards: four `$` (shoe, Hand(4)) gathered under it, and Deal keeps the first five (reversed) and drops the rest; the desk's room collects fives again with Hand(5), a Deal to one side turns them back over, and Suits drops the `$`s (8/327). Marking the end of each hand instead (a `$` under it) and collecting cards in the desk's room until the marker comes up is another way (not built) | 6 | new |
| 6♣ | no-kings | No Kings | skeleton-crew (bonus) | 3 | **pays**: as Red Flush (hearts or diamonds), with Calling Card's croupiers but neither Flush nor Suits, and no kings in the players' hands | without kings in play, kings are unmistakable markers, and they sort into the gaps between suits (K♠ after the spades, K♦ after the diamonds, K♥ before the hearts). Eight of them, [K♠ K♦ K♥ K♥] copied by a Duplicate with both copies to one side (which stacks them), are sorted with the hand; Deal sends cards 1-5 (a diamond flush between two kings) and 6-10 (a heart flush after two kings) to Kind(3), which says no only for a flush's window (every other hand leaves three or more kings in each), and Set strips its two kings (13/107; checked on all 17,296 king-free hands). A search over markers found no single window, and no smaller set of kings, serving both suits | 7 | new |
| 7♣ | one-up | One Up | counting-up (bonus) | 1 | **expected**, house cards: for every card, the next card up in its suit (K → A) | two shoes in step deal [x, next-of-x] pairs through the whole deck; the card waits in a loop taking pairs until K2 + Flush find it is x (a Deal and a second K2 tell x from y), then y is paid; a War lets one card in at a time (16/4076) | 7 | new |
| 8♣ | twenty-one-card-trick | Twenty-One Card Trick | one-up (bonus) | 21 and 1, two players | **expected**, `ordered: [10]`: player B's card is one of player A's 21; pay A's 21 as one hand with that card 11th from the top (once; the other 20 in any order) | B's card gathered onto A's 21: one deck has no two cards of the same suit and rank, so after Suits the chosen card's pile is the only one with a pair (K2). Set takes the pair out and Burn keeps one copy; everything else goes to Hand(20) (a suit missing from A's hand makes no pile, so the piles can't simply be gathered back), and a cut's two tens are gathered round the card. K2 and Hand(20) pick up from several sides, so a War lets one deal in at a time, the burned copy its ticket (a `once` shoe deals the first) (14/290). Beat par with a completed cut ([20, card], both halves to the desk): 13. The classic trick (Deal into three piles of seven, gather the chosen card's pile between the other two, three times) puts the card 11th from any place with this Deal (checked in code, without a machine), but every pile needs its own test for the card; not built. The floor (90 hexes) leaves room for it | 7 | new |
| 9♣ | round-the-clock | Round the Clock | counting-up (bonus) | 1 | **expected**, regrouped: as soon as every rank has been played since the last payout, the first card of each rank in that time, as one hand (repeats in between never paid, an unfinished round never) | Déjà Vu's memory (a `$$` seed; K2 and Burn drop repeats). A copy of each new memory goes under a house A..K (Hand(13) on a shoe): Set's rest is only the advertising card exactly when every rank is there. A top-card War of the rest against a `$` releases the `$` (complete) or, through a War it loses to an ace, an ace; the memory beats the `$` at a high-card gate and is paid (Set drops its seed) while the `$` seeds the next memory, or loses to the ace and goes round again (20/3139). A house A..K kept going round a Duplicate loop is no faster (23/2799): the memory's own loop is what takes the time | 7 | new |
| 10♣ | running-count | Running Count | 10♣ ace-count + A♠ hot-streak | 1 | pay a card if, counting every card so far with it, more have been 2 to 6 than 10 to ace (aces high; 7 to 9 neither; level doesn't pay) | the memory M, 6s and 9s, is the first War's dealer, so one card is counted at a time. Its top card is always a 6 and it holds a 9 (new cards go underneath): a top-card War against M is one against a 6, a high-card War against M one against a 9. A low card puts a 9 under M, a high card a 6, a 7 to 9 nothing. Set on a copy keeps only 9s exactly when the count is above zero (else the top 6 too), and the card, under an 8, plays the set's top card at a top-card gate; Cut strips the 8. The first M (a once 6 gathered with the 9 shoe's first 9) is copied too, and its verdict meets a king that a once shoe sends down the card line first (22/674) | 7 | new |
| J♣ | counterfeit | Counterfeit | perfect-pair (bonus) | 1, two decks | pay every card identical to one already played tonight (the second copy; the first never pays) | Suits sends each card to its suit's memory (within a suit, a pair of ranks is a pair of identical cards). Each memory is a line: Gather (the memory underneath), Kind(2), Burn; a pair burns the new card to the desk and Burn's rest goes back to Kind(2), which finds no pair in it and returns it; no pair, and the bigger stack is the memory again. Each memory is seeded through its Kind(2) with `$$` (25/496). Déjà Vu's loop with its two passes, four times, also fits the floor (39). One Kind(2) and Burn shared by the four memories (a second Suits sending them home) doesn't fit on a hex floor as such: Suits, the shared Kind(2) and the second Suits would each need a route of their own to all four gathers, and those routes would have to cross | 7 | new |
| Q♣ | rank-and-file | Rank and File | 10♠ change-of-heart | 5 | **expected**, `ordered`: every hand in rank order, lowest on top, aces low (A 2 ... K); cards of the same rank spade, diamond, club, heart | Sort (new deck order, suits first) puts each rank's cards spade, diamond, club, heart; then the hand goes round a loop thirteen times, king first: five spades of the rank (Hand(5) on a shoe of five K♠, five Q♠, ... five A♠) gathered on top make it the hand's only biggest set (five cards or more against at most four), Set's set pile is gathered back on top of the rest (so that rank comes to the top and nothing else changes order), and a cut drops the spades. The gate's War (a shoe of twelve aces, then a 2) sends the hand round again, then pays it, and its 2 goes back as the ticket at the door (13/5511). Beat par with Set's piles stacked on one side and a loop of four, the hand entering at the gate's War (its shoe dealing thirteen aces, then the 2): 10/3875. Much faster: a sorting network of Wars. Deal splits the sorted hand into single cards; an odd-even transposition network (ten Wars as compare-and-swap on neighbouring cards, the earlier card as the player, so a tie keeps it in front and the suit order survives) sorts them aces high; four gathers stack them again, and five A♠ gathered on top, Set and a cut bring the aces up from the bottom: 34/367. (Not built: spade stand-ins looked up for each card, Change of Heart's way, and sorted give the ranks in order, but pulling the cards back out of the hand with Set needs several copies of each stand-in, since one stand-in on top of the hand ties with any pair of another rank) | 8 | new |
| K♣ | head-count | Head Count | rest-of-the-deck (bonus) | 1–6 | the top card's rank (ace 1) is the number of cards | the hand doubled on a 12-card ruler (6 5 4 3 2 A and six `$`; Hand(12) on a shoe); a cut puts the ruler card for the hand's size on top of the bottom half; two top-card Wars compare it with the top card; the gate's dealer gets the `$`s on a tie, else the top half (19/676) | 8 | new |
| A♦ | mirror-image | Mirror Image | `$$` deja-vu + crossed-wires (bonus) | 5, two players | **expected**: when both players hold the same five cards (any order), pay both hands | stack the two hands and copy; Sort the copy, Hand(2) into pairs, K2 + Flush check each pair is two identical cards; one card per pair (the card, or a joker for a mismatch, routes of equal length) into Hand(5); the stack beats its own cards but not a joker; a cut splits it back into the two hands (25/383) | 8 | new |
| 2♦ | casino-numbers | Casino Numbers | `$$` deja-vu + crossed-wires (bonus) | 1, two players | **expected**, `ordered`: each deal's sum (cards A..K) in casino numbers, base 13 with digits A..K and no zero (13 is K, 14 is A A, 26 is A K), house spades, the leading digit on top | a shoe's cards are stacked (in Hand(13) chunks, released by a joker) and split by suit into a table and a ruler. Set on a spade and a copy of the table keeps the rank's twelve-card group, r - 1 of them hearts, and Suits keeps the spade and the hearts: r cards (one lookup per player: on a pair Set keeps one group). Both counts go on a copy of the ruler, and Deal pays card 26 (the units card for the sum) and card 51, which exists only for sums of 14 or more (a leading ace) (27/1574; up to about 1250 cards on the floor). The same machine does base 10 (cards A..9, digits A..T) with a 104-card shoe (27/927), and with `$` as zero instead it is the same size. A smaller count: a K..A stack with the player's card underneath, burned (K2 + Burn in a loop) until it holds no pair, is exactly that many cards; but the loop lets a later stack overtake, so a War gate lets one deal in at a time (its token: the cards the Deal drops). With the ruler as one Hand that comes to 26 croupiers (base 10 or 13), slower. Doubling the gathered counts (a Duplicate) lets Deal pay two adjacent places from a table of digit pairs, but one-digit sums need a `$` in the leading place and a Suits to drop it: 28 | 8 | new |
| 3♦ | every-twenty-one | Every Twenty-One | casino-numbers (bonus) | 1 | pay each card that takes the night's running total, counted as in blackjack (ace 1, picture cards 10), to or past the next multiple of 21; the total is never reset | each card worth v becomes itself on top of v - 1 jokers, v cards, so Hand(21) holds the running total and deals a group of 21 each time it reaches another 21: the card to pay is the group's last natural card (every group has one, since no card is worth more than 10); Suits drops the jokers, Deal turns the rest over and Burn pays its top card. The lookup is a table (twelve cards of each rank, v - 1 of them hearts (picture cards as tens), a joker on top and twelve under) stacked once by a store as in Casino Numbers and waiting for each card in a ring as in Times Tables (Gather, Duplicate, Burn); on the copy Set, Burn (the card off) and Suits give [?, v - 1 hearts, 12 jokers], and with the card gathered underneath Deal from place 13 on leaves v - 1 jokers and the card, dealt last, on top (20/2240). Beat par with the store's `$` dealt straight into its Gather (no pass) and a free-running Duplicate loop for the table instead of the ring: 18 (about 700 cards on the floor) | 7 | new |
| 4♦ | hit-me | Hit Me | every-twenty-one (bonus) | 2–5 | hands that don't go over 21: number cards their face value, jacks, queens and kings 10, aces 1 or 11 as the player likes (so in effect 1) | each hand goes round a loop on top of 20 `$$` (a shoe and Hand(20)): a top-card War against a `$` lets it in while its top card is natural, Burn sends that card to Every Twenty-One's lookup (ten cards of each rank, min(r, 10) of them hearts, nine jokers under the table), which gives it back as [v - 1 jokers, the card], and that is gathered under the rest. When the `$$` come up the hand is 20 + t cards, t its total, and it carries its own cards, so hands may overtake one another. A copy is cut: the top half is all `$$` just when t ≤ 21, and otherwise also holds the start of the first group, whose first card is a joker or an ace (an ace's group is just the ace); Suits keeps the hand's cards, which beat a top half of `$$` in a high-card War but never a joker or an ace they hold themselves (27/2077). Beat par with the store's `$` dealt straight into its Gather and a free-running Duplicate loop for the table, the lookup moving up into the ring's place: 25. [21 `$$`, ?] under each hand needs no copy (cut; Suits on the bottom half plays the top half, which holds the joker just when t > 21), but here it costs a pass to reach the desk, so it is 25 too | 8 | new |
| 5♦ | punto-banco | Punto Banco | hit-me (bonus) | 2 | baccarat naturals: a hand worth 8 or 9, its worth the units digit of its total (aces 1, 2 to 9 face value, 10s and picture cards 0) | each card is counted: under a stack of 9 down to A (house clubs, a shoe and Hand(9)), Kind(2) and Burn in a loop burn the top card until no pair is left, leaving r cards for rank r up to 9 and ten for a 10 or a picture card, its points modulo 10. A copy of the hand is split by Burn and each card counted in a loop of its own; the two counts go on a ten-card ruler (a shoe and Hand(10)), and Deal round ten places reads the total modulo 10: the ruler card left on top of pile 0 is `$` for a total ending in 8 or 9 and `?` otherwise, and the hand plays that pile at a top-card gate. A low card's count takes longer, so counts would overtake: the gate's pile goes back to the door as the next ticket, one hand at a time (24/2626, 4 passes; `DOOR`). With a 19-card ruler Deal can read one exact place instead (the same size). One S supply copied by a Duplicate for both counts is a croupier fewer, but no layout of it was found without more passes | 8 | new |
| 6♦ | split-the-difference | Split the Difference | casino-numbers (bonus) | 1, two players | **expected**: each deal's difference (the higher card less the lower, cards A..K) as one house spade, A to Q; nothing on a tie | Casino Numbers' machine with B's lookup keeping the spade and the clubs, 14 - b cards, so a + 14 - b cards go on a 25-card ruler whose card 26 is the spade for a - b either way round, or a diamond on a tie that Suits drops by the desk (28/1504). | 8 | new |
| 7♦ | last-in-first-out | Last In, First Out | three-apart + rest-of-the-deck (bonus) | 1–5 | **expected**, `inOrder`: every hand, last played first | a pass prefers the player to a `once` joker shoe, so the joker comes after the last hand; hands gathered onto `$` markers are pushed on a stack until the joker is on top; then Burn deals the stack off card by card onto a growing hand, and a marker coming up (top-card War vs `$$`) sends the hand to the desk (20/835) | 9 | new |
| 8♦ | first-sighting | First Sighting | four-of-a-kind (bonus) | 2 | pay a hand the first time its two ranks are seen together tonight (suits and order don't count; a pair is a combination of its own) | a memory of every hand so far (repeats too), dealt out a stored hand at a time by Hand(2) and rebuilt by a Gather loop, ending in a `$$ ?` marker (a War against an ace, which only the joker beats, releases it; the new hand's copy goes in first, so it is only tested from the next hand on). The probe is four copies of the hand (two Duplicates with both copies one way) and goes round a loop: each stored hand goes on top, a copy with a `$` goes to Set, whose rest holds only advertising cards exactly when the ranks match (four copies outnumber any other rank; checked on all 28,561 pairs of rank pairs); a high War of the rest against `$$` releases a token, a joker picked up on a match, gathered onto the probe once Deal has stripped the stored hand off it. A top-card War against `$` sends the marker to the end, where the probe plays a waiting copy of the hand (it wins only with a joker; on a tie the copy is paid), and its player hand is the door's next ticket: one hand at a time (29/5951 with 2 passes; at most 142 cards on the floor). The probe's loop, the test and the strip meet at the token Gather, so the strip sits between the two loops (it drops the stored hand into an empty hex); the memory is rebuilt from a copy taken off the stream before the probe, not from the probe, which is what keeps the memory's loop outside. Tests have at most 14 hands (random ones 12): each scan is as long as the night so far, and after the last hand several scans can pass with nothing dealt or paid, so the longest gap without progress grows with the night (par: about 360 rounds, against `STALL_ROUNDS` 1000) | 9 | new |
| 9♦ | times-tables | Times Tables | casino-numbers (bonus) | 1, two players | **expected**, `ordered`: each deal's product (cards A..K) in casino numbers (1 to 169: 13 is K, 14 is A A, 169 is Q K), house spades, the leading digit on top | each card is counted by a master table (13 cards of each rank r, r of them hearts) going round a ring of two lookups: each gathers its card on top of the table, copies it (Set and Suits on the copy: r hearts) and burns the card off again, so the table waits for every card and only one or two copies are out (a free-running Duplicate loop, as in Casino Numbers, puts too many copies of the bigger table on the floor). The store also stacks a 338-card ruler (spades, diamonds for no digit), split from the table by suit, on a gated ring of its own (Suits drops A's count again). A's count on a copy of the ruler and Deal round 13 piles: pile 0 is row a, every 13th card from 13 - a. B's count on the row and Deal pays cards 13 (units of a × b) and 26 (its leading digit, or a diamond that Suits drops) (34/3720; laid out by annealing block positions; about 900 cards on the floor). Neither ring layout fits both players and the desk on the floor's edge (two players on the edge split the free floor into two, and the lookups' outputs fall on different sides), so the players sit inside | 9 | new |
| 10♦ | showdown | Showdown | mirror-image (bonus) | 3, two players | **expected**: pay the higher hand of each deal, comparing highest, middle, lowest (aces high); a tie pays neither | stack the hands, Hand(3) deals them out again into one sorter (Deal, three Wars as compare-and-swap, two gathers); Hand(6) and a cut pair them up; three stages of two top-card Wars (both ways round), Burn-rotating both on a tie; laid out as a U so the winners' line ends by the players (43/296) | 9 | new |
| J♦ | follow-suit | Follow Suit | showdown (bonus) | 1, four players | **expected**, labelled desks: tricks of four cards, A leads every one: pay the four as one hand at the desk of the highest card of the suit led (aces high; cards of other suits never win) | the trick is gathered in seat order and copied: one copy waits at the router, the other is copied four times over and dealt into entries (one copy of A's card, the champion; one of C's, two of B's, four of D's). Each challenger plays the champion at a War (the champion as player, so a tie goes on to the Flush): a lower one drops; otherwise the two are stacked and a Flush (the copies all follow, the champion is all the suit led) keeps the stack as the champion, or a Deal drops the challenger's copies. So the champion's size says who leads: 1 A, 2 C, 3 or 4 B, 5 to 8 D. On top of a ten-card ruler of jokers and advertising cards, Deal cards 8 and 10 are two verdicts; a top-card War splits A and B from C and D, and a high-card War (or a Burn and a War) sends the trick to its desk. The ruler is the dealer of a door on its way to the lookup, so a trick goes in every ten rounds at most and none overtakes another (38/867). No shorter ruler works for these sizes, and none up to 14 cards gives A and the first challenger the same first verdict, so B challenges second (order C, B, D) to put desks X, Y, Z, W in a row. Beat par on rounds with two ruler shoes (alternate cards) gathered into Hand(10): 40/504 | 9 | new |
| Q♦ | twice-shy | Twice Shy | mirror-image (bonus) | 5, two players | **expected**: every hand less the cards played more than once over the whole night (both copies, any hands; a hand left empty pays nothing) | the night is stacked (a joker after the last hand lets it out, as in Last In, First Out) and copied: Hand(5) deals one copy out again a hand at a time, and a Duplicate loop copies the other once per hand. A hand doubled on a copy of the night holds each of its cards three times if it was played once tonight and four times if twice, any other card at most twice; Suits splits it by suit (a rank is then a card) into one line, the night's bottom `$` last: K4 + Set drop the fours, K3 + Set keep the threes, Suits passes only the `$`. The hand's piles are gathered until the `$` (as in Last In, First Out); Sort puts each card's three copies together and Deal pays one in three. The `$` that ends a hand opens a War gate in the copying loop for the next hand's copy, then starts the next pile, so one hand is in flight at a time (36/1145) | 10 | new |
| K♦ | carry-the-one | Carry the One | times-tables (bonus) | 2, two players | **expected**, `ordered`: each deal's sum of two two-digit casino numbers (the leading digit a club on top, the units a spade: 14 to 182) in casino numbers, 28 to 364 (from 183 three digits: A A A, up to 2 A K), house spades, the leading digit on top | Burn splits each hand; four lookups on a ring (as in Times Tables) count the four digits. The units counts (2 to 26 cards) on a 25-card ruler: Deal pays the units digit (card 26) and a carry pile (cards 0 and 38: two cards from 14 up). The carry pile and the leading counts (t + 1 cards) on a 40-card ruler: Deal pays the middle digit (card 28) and card 54, there only for t ≥ 14 (its leading digit), on top; the units digit is gathered underneath (Deal's list is at most 60 places and wraps, so no paid place may be reached twice). The counts must leave the ring on the side away from the players (a player's two digits enclose one lookup's other side), so the column and the desk sit inside the ring. The players are seated as in Casino Numbers, side by side, so a machine can share croupiers between them (75/2046; 69 with the players on far sides of the ring) | 10 | new |

Fourth Street (6♣, "the 4th card beats a 10") was replaced outright by Upside
Down: it was Bottom Dealer's floor again with one more card, and Burn Card
(3♠) asks the same question with the next croupier.

**Seated players.** Mirror Image, Showdown, Pot Luck, Twenty-One Card
Trick and the casino-number floors seat two players, and Follow Suit four
(`seat` on each source, see docs/architecture.md): each player deals only their own
hands, so a deal's two hands can be paired up by a Gather or a War however
the machine holds either player up. Mirror Image's tests give each player a
deck of their own (player B often holds player A's hand reordered, or one
card off); Showdown deals both from one deck. In Twenty-One Card Trick the
players hold hands of different sizes (A 21 cards, B one of them), each deal
from a fresh deck.

**Labelled desks.** Crossed Wires and Uneven Tables seat three players and
label their three desks (`desk` on each payout; X, Y, Z from the top): each
expected payout names its desk. Pot Luck labels a desk per player (A's X,
B's Y), and Follow Suit four (A's X to D's W), each paying a deal's winner. Uneven Tables' tests give the players
different numbers of hands (`null` for a player's missing hands).

**Desks.** Most of the extra floors (opening after Déjà Vu) have their chip
desk 2 or 3 hexes from the player(s), so the distance never forces passes on
a player; the reference machines fold round to reach it (Showdown is laid out
as a U).

**Bolted floors.** One Deck, One War and Dumbwaiter take something away by
bolting it to the floor (fixed cells: see docs/architecture.md): the only
shoe (one deck, dealt once), the only War (its ports fixed), and the only way
from the players' room to the desk's (a Hand(1)). Their stories say plainly
what is bolted down, and nothing about working with it. Floor shapes and
bolted cells that rule out an earlier floor's usual machine were tried (a
bolted Deal, Burn, Sort, Suits or Hand at the door; one Straight for Lucky
Seven) and dropped: each was either a gift, undone by one croupier, or fell
to a known trick.

Ideas not built: "pay two-card hands the first time their ranks are seen
(ignoring suits)". The loop was designed but not built: it comes to about 32
croupiers before any routing passes. In outline: the hand as a probe of four
copies of itself (Set on [stored pair, probe, `$`] then leaves only
advertising cards in rest exactly when the ranks match, pairs included);
the memory as one stack of stored pairs that Hand(2) deals out a pair at a
time, each tested against the probe and gathered onto an accumulator seeded
with the previous scan's `$$ $$` end marker; each test leaves a `$` or `$$`
token on the probe (Wv, a high War of rest against `$$`), and at the end
marker Sort brings a `$` to the top if any pair matched. A War gate lets one
probe in per scan, and a joker flush sent after the end marker (with the new
hand, if it was new) empties the accumulator into the next stack. A first
design that rotated the stack in place was smaller (about 29) but its loops
cross, so it can't be laid out on a hex floor. "Pay the ace of the same suit for every
Ideas not built: "Pay the ace of the same suit for every
king" (Small Change with a suit splitter and four ace Wars, 13 croupiers of
the same idea).

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
  The bonus deck works the same way with `bonus` as the chapter name.
* Shared files (`src/levels.js`, `src/levels/shared.js`, `test/levels.js`,
  `tools/*.js`) belong to the coordinator: ask rather than edit. Never touch
  `src/engine.js`, `src/cards.js`, `index.html`, `style.css`, `src/ui/**`.
* UI smoke-test dependencies: `opening-night` must stay `LEVELS[0]` (a line of
  passes); `beat-the-dealer` (high only, its 9-shoe tests unchanged),
  `new-rules` (top only), `hot-streak` (both rules), `even-money` must keep
  their ids and War rules.

### What test/levels.js enforces

* Difficulty: every level's `difficulty` is the Diff in its row of the
  tables here.
* Cards: the n-th floor of a chapter is the n-th card (A..K of the chapter's
  suit; `?`, `??`, `$`, `$$` in the finale); unique. Add floors in card order.
* A level has exactly one of `pays(hand, earlierHands)` and
  `expected(inputs)`; `ordered: true` only with `expected`.
* The palette only grows across the whole campaign (use `paletteThrough`).
* The bonus deck: ids unique across `LEVELS` and `BONUS`; no `chapter`;
  `unlockAfter` names campaign floors, or bonus floors whose chains end at
  campaign floors (one id or a list); cards A♠, 2♠, ... in list order;
  palette, War rules and special cards all available at the latest campaign
  floor it needs (no special-card words before then).
* `specialCards` only in the finale, only growing; no floor before the first
  special floor mentions "joker", "advertis…" or "wild card" in its title,
  brief or story.
* Reference solutions: on the floor, palette and War rules only; shoe decks
  only natural cards plus the level's `specialCards`; every test passes; par
  exact; removing any one croupier breaks it; door levels fail without the door.
* Tests: ≥ 3; every hand has `handSize` distinct natural cards (fixed tests
  may reuse cards between hands); "pay all" (wherever the payouts aren't
  just the inputs) and "drop all" fail; every mutant differs from the real
  rule on some test hand. For an `expected` floor a mutant is
  `(inputs) => payouts` and must give different payouts on some test
  (paying the input hand untransformed, the right cards grouped wrongly,
  once instead of per ace, ...).

### Design rules

* **Intros never explain the solution.** One to three short paragraphs: set
  the scene, continue the arc (docs/story.md), introduce a new croupier or
  card in a sentence. The brief states the exact rule; put edge cases (ties,
  aces, two pair vs trips, the A–5 straight) in the brief or story whenever a
  player could guess wrong.
* **Rules are causal.** `pays(hand, earlierHands)` sees only earlier hands, so
  "the best of its group" style rules are impossible; "the 5th card of its
  group" is fine. `expected(inputs)` sees the whole test, but every payout
  must depend only on cards already played (Suit Yourself pays five of a
  suit as soon as the fifth is played; leftovers at the end are never paid).
* **Payouts.** On a `pays` floor the payouts are input hands: any order
  within a hand; a duplicate's copy counts as the card (so a copy may be paid
  and the original dropped); house cards never. An `expected` floor lists the
  exact payouts instead: a hand may be paid several times (Ace Count),
  rebuilt from several inputs (Suit Yourself, Four of a Kind), reordered
  (`ordered: true`, Upside Down), split (Split Pot) or made of house cards
  (Change of Heart, Small Change). Card order within a payout doesn't matter
  unless the floor is `ordered`, and the order of the payouts never does.
  Define every edge case in the brief (leftovers, empty results, ties).
* **House and player cards alike.** A run stops only at a wrong payout, too many cards,
  a repeated state, or `STALL_ROUNDS` rounds with nothing dealt or paid,
  whoever's cards they are (docs/architecture.md, "When a run stops"). So
  house-card floors needn't time the player's card to leave with the house
  card, and a floor's tests may have no player hands at all.
* **Floor sizing.** The working croupiers should dominate: place the desk so
  the reference needs few passes (≤ about a quarter of par), and leave 1.5–3×
  the reference's footprint so other designs fit. Pillars are for making
  layout choices, not for padding pass counts. Check the reference is not
  wildly loose with `node tools/optimize-level.js <id>` (only for
  `{ nodes, links }` recipes), but par is simply what the reference achieves;
  players beating it is fine.
* **Par is the plain build.** One idea per croupier, nothing a first-time
  player wouldn't reach for. Tricks (shared croupiers, output stacking, loops,
  sandwiches) are left for players to beat par with.
* **Trade-offs.** Prefer floors where a cheaper machine is slower (merging
  streams, sharing a croupier, loops) or where several structures compete.
* **Random tests.** `makeTests` deals from one deck per test, so hands per
  test ≤ 52 / handSize (5-card: 10; 4-card: 13; 3-card: 17; 2-card: 26). Fixed
  tests carry the edge cases; rare hands (royal flushes, quads, full houses)
  must be in fixed tests. `makeMixedTests` does the same for floors with
  `handSize: [min, max]`, drawing each hand's size at random. A floor that
  needs its own kind of deal (Mirror Image's near matches) passes its deal
  function to `dealtTests`. Either way the deal function is recorded as
  `tests.deal`, and the floor's check deals are dealt by it, so it must
  deal hands the rule is interesting on (`test/levels.js` checks every
  floor has one).
* **Stress tests** for every machine that tests a copy, releases a verdict, or
  sends pieces of a hand along different routes: a fixed test of deciding
  hands back to back (all winners, then all losers), one alternating winners
  with hands that fail fast, and runs of the same verdict. These are what
  catch verdicts or pieces overtaking each other.
* **The door** (a War on the hex the source feeds, a `once` shoe for the first
  ticket, the gate returning used verdict cards as tickets) is needed when a
  copy's decision can be made at different depths and the routes can't be
  evened out (Full House, House Record; in the bonus deck Punto Banco and
  Rank and File, which `DOOR` lists, and Perfect Pair and Twenty-One Card
  Trick, which it can't: Perfect Pair's gate pays on the dealer's loss and
  Twenty-One Card Trick's door isn't on the hex a player feeds). A single
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
  than the rotation by cuts). From 8♣ on, Deal with repeated sides picks any
  subset of a hand's positions, reversed (unlisted sides drop cards), so shuffles
  are only ever necessary on 5♣–7♣; later floors that pick out positions use
  Deal (Bottom Pair, Two Pair; Every Other in the bonus deck). Upside Down
  (6♣) is a non-rotation too: completed cut, in, out reverses five cards.
* **Stacking.** Outputs to one side are stacked: War with all four ports one
  way stacks winner on top (so a knockout merge can be one War, a way to beat
  Knockout's par, but a "loser on top" merge still needs a gather); Duplicate with both ports one way doubles
  a hand; completed cut and burn rotate.

### Patterns the later chapters can build on

* Reference card, stripped by cut: k refs on top of an n-card hand need
  k ∈ {n−1, n}; underneath, k ∈ {n, n+1}. Burn (3♠) strips one ref on top.
* The sandwich: [X, R−1, R+1] is a run only for R (no reference uses it; it
  beats par on Lucky Seven and Royalty).
* A reference stack built by Hand(n) (Seven Heaven), or by a loop (beats
  Lucky Number's unrolled par).
* Deal as a selector: list a side once per card position to keep, an empty
  side for cards to drop (Bottom Pair, Two Pair, bonus Every Other).
* Test a copy and gate the original with a *copy-derived dealer* (Upper Hand,
  High Spade, Top Pair, bonus Every Other): no verdict needed when "the highest card
  is (not) in this pile" is the question.
* Indicator cards on the pieces (Acey-Deucey): with no copy to test, the
  pieces themselves go on; a gather with a shoe hands each piece a 2 or an
  ace by the route it took, a cut takes it off again, and the hand is gated
  against the pile of indicators. Rigging the last War (failing pieces
  collect an ace so the final War loses) does the same with fewer croupiers.
  Two routes merging into one croupier must never back up there, or a later
  hand's piece is picked up first: keep every meeting point downstream in
  step to within a round.
* Release a verdict (Bottom Pair onwards): War against a shoe with both
  dealer ports one way; yes releases a 2, no an ace, and the original plays
  it at a high-card gate.
* A shoe deck as a sequence (Third Time Lucky): shoes deal in order, one card
  per free slot. With Hand(13) a shoe stacked with a suit deals whole suits
  (Change of Heart).
* Set as a lookup (Change of Heart): put a card on top of a whole suit and
  Set pulls out the pair, its own card and the house card of the same rank.
* Rotate and test (Ace Count): copy, test the top card, rotate the hand
  (completed cut on 3 or 5 cards, burn with both ports one way), repeat.
* A Hand(n) per pile regroups cards across hands (Suit Yourself).
* Carry a card to the next hand: put it in the gate's dealer line behind a
  `once` seed for the first hand (Hot Streak; in the bonus deck, After a
  Pair's verdicts and Bookends' bottom cards).
* Windows: Duplicate (both ports one way) + a seed + Hand(2) gives
  [previous, current] pairs.
* Advertising cards as fillers and seeds: a `$` keeps a pile from being
  empty without ever pairing (Red Carpet); a `$$` seeds a memory (Déjà Vu).
* Memory of player cards (Déjà Vu): the cards themselves circulate (and in
  the bonus deck's Four of a Kind, Set pays a completed rank out of it).

## Feasibility notes

Machines checked in the simulator while planning, and what the built
references came to (par croupiers):

* Shuffles: Bottom Dealer (4-card) in,in (in,cut also works); Fourth Street
  (cut from the campaign: it repeated Bottom Dealer's idea) in,cut vs four
  cuts; Upside Down cut,in,out (no shorter chain of cuts and riffles reverses five cards); Second Fiddle out,cut (no rotation puts the 1st and 2nd
  cards on top of different halves); Burn Card a single burn. The planned
  Top and Bottom (7♣) and 4-card Bookends were dropped; Every Other and Bottom
  Pair use Deal instead of the planned shuffles.
* Verdict floors, all door-free: Bottom Pair 11, Small Pairs 14 (planned 16),
  Two Pair 13, Calling Card 11 (14 with a door before), After a Pair 13 with
  a copy (12 without; planned 16), Jacks or Better 19, Red Carpet 12 (the planned "no
  black cards" rule, with sort and regrouping, was 9). Each passes back-to-back, alternating and same-verdict
  stress tests; unequal verdict routes fail them.
* Knockout: 17 with War + gather + pass merges; one-War merges (all four
  ports one way) make 8 (planned ~10, old campaign par 16). Low Ball: a cut
  chain, 14 with a shoe of 5s per War, 10 passing the beaten 5 along (planned
  ~16 as a loser-on-top tournament).
* Third Time Lucky 2 (planned 7 with passes). The Wheel 6 (planned 8). Seven
  Heaven 5 with Hand(4) and K7 (planned 8 with Hand(5) and K8). Déjà Vu 6
  (planned 7). Snap 6, 5 with Hand(2) windows (bonus deck). Acey-Deucey: see the last note. Lucky
  Number 11 unrolled, 8 with the loop. Top Dog 5 and Top of the Heap 6 with
  gathers, 4 and 5 with stacking.
* Hearts stages: Lucky Seven 8 with two stages and two cuts (7 as a chain,
  6 as the sandwich); Penny Ante 10 with a cut per stage (9 sharing one);
  Royalty 13 with three single-ref stages (10 with the sandwich and a shared
  cut).
* Expected floors: Upside Down 3 (cut, in, out; 5 splitting the halves);
  Ace Count 13 with three copy-test-cut stages on 3-card hands (5-card hands
  would need five stages, 18 plus passes); Suit Yourself 9 (four Hand(5)
  croupiers, four passes: a desk can't be next to more than two of the
  splitter's neighbours); Change of Heart 6 but slow (a new suit takes 13
  rounds to collect); Small Change 6; Split Pot 3; Four of a Kind 6. On
  house-card floors a machine that drops the player's card a round before the
  house card reaches the desk fails on the last card of a test (see "The
  night ends with the last player card").
* Even Money: the owner reported an 11-croupier loop; I could not find it (a
  single gather/straight/cut loop fed by a cycling 3-7-J shoe jams on the odd
  cards, which never leave). The reference is 14 unrolled with a cut per
  stage (12 with shared cuts); Lucky Number is the designated "loop beats
  unrolling" floor.
* Acey-Deucey: the owner asked for room for the straightforward design
  (compare the top two cards into an A or 2, the bottom two into an A or 2,
  compare the two indicators, and pass the hand on or not), so the floor
  grew from 29 hexes (rows -2..2) to 83 (rows -4..4, about two rings more,
  with the source and desk where they were, so saved solutions still fit).
  That design as stated
  can't be built: two yes/no comparisons can't get the ties right (whichever
  side each tie falls on, some tie shares an outcome with a paying hand),
  and even with pairs dropped first (Kind 2), "both the same way" is an
  equality of two indicators, which no single War tells (ties go to the
  house, so only one of the four indicator pairs wins). Sorting the ends
  first makes it an AND of two strict comparisons (b beats lo, hi beats b),
  and a gate against the pile of both indicators is the AND: that is the
  reference (21/244: 17 working croupiers and 4 passes). Laid out with a
  separate strip cut per indicator and gathers to rebuild the hand it took
  33 (19 working croupiers and 14 passes, because the indicators have to go
  round the hand to meet it at the gate); carrying the pieces on as one
  stack, with both indicators on top for a single cut, needs neither. With
  no duplicate the pieces must carry on, so each comparison's result is a
  gather with a 2 or an ace; War releases (player ports one way, dealer ports
  another) can't be laid out, since the card and the indicator would each
  need its own merge and the three routes between the two release Wars
  enclose one of them. The old reference (rig the last War, 15/~224) and
  output stacking (11) beat par.
