# Stacked Deck: online features (design)

Status: built except for the deploy workflow and `rescore.js` (see "Build
order"), and tested against the Firebase emulators; nothing is deployed yet.

Two connected features:

* **Cloud save** of the working machine and solved floors.
* **Score comparison** on each floor's plot: a heatmap of everyone's results
  with the overall frontier, plus the frontiers of the player's friends.
  Friends see each other's scores and chosen names, never their machines.

Both are for players signed in with Google, and **signing in is the opt-in**:
a player who never signs in stores nothing online and loads nothing from
Firebase. There are no anonymous accounts.

The game stays a static site on GitHub Pages (`zygoloid.github.io`) with no
build step and no dependencies. Everything online is optional: `localStorage`
stays the primary save, and the game works as before offline or when Firebase
is unreachable.

## Threat model

In priority order, the things this design must prevent:

1. **Excessive billing.** No attack or bug may run up an unbounded bill.
   Attacks may instead cause an outage.
2. **Hosting illegal content.** Nothing a stranger can read may hold free-form
   data, and what a player can store is capped.
3. **Breaking privacy law** (UK GDPR / PECR). Online features are opt-in
   (signing in, after being told what is stored), names are chosen rather
   than copied from Google, and a player can delete everything.

Lower priority, accepted where noted: denial of service, cheating (fake
players, valid but unrepresentative scores), and anything that only affects
other games in the same Firebase project or on the same `github.io` origin.
The project holds game data only, so nothing here can give access to anything
more valuable.

## Overview

| Piece | What it is |
|---|---|
| Firebase project | A **shared Blaze project for games hosted on `zygoloid.github.io`**, used for nothing else. Each game has its own database instance and its own functions codebase. |
| Firebase Auth | Plain Firebase Auth (no Identity Platform upgrade), shared by the games: Google sign-in only. Never anonymous or phone sign-in. |
| Realtime Database | This game's own instance (e.g. `zygoloid-stacked-deck`), read and written directly by the browser under security rules deployed from this repo. Instance names are global and can't move between projects. |
| Cloud Functions | Node functions in `functions/` (the `stacked-deck` codebase) that verify solutions with the game's own engine and maintain scores and stats; later also friends and account deletion. |
| `src/score.js` | Scoring and validation code shared by the game and the functions. |
| Project controls | App Check, a budget, and a kill switch, set up once for the shared project (see below). |

## Shared project controls

These belong to the shared games project, not to this game (they live with
the project's own infrastructure), but this design depends on them being in
place before launch.

* **Kill switch**, kept with the project's own infrastructure (it covers every
  game in the project). It sets deny-all rules on every database instance in
  the project when the budget's Pub/Sub notification says spend has reached
  the budget, or when a check every 10 minutes finds database downloads or
  storage past fixed limits (about 1 GiB sent in an hour, 2 GiB stored).
  Denied requests cost almost nothing, and with writes refused no function is
  triggered. That turns a bandwidth attack (about $1/GB downloaded, otherwise
  limited only by the attacker's bandwidth) into some minutes of charges
  followed by an outage. After a lockdown, this game's rules are restored by
  redeploying them (`firebase deploy --only database:stacked-deck`).
* **Budget** on the billing account, notifying by email and on `over-budget`.
* **App Check** enforced on every database instance and callable function from
  launch (reCAPTCHA Enterprise provider; check its current free allowance and
  set a long token lifetime so each session needs few assessments).
* **Auth settings.** The Google provider only (Anonymous disabled);
  authorized domain `zygoloid.github.io` (and `localhost` for development).
  Do not upgrade to Identity Platform, which bills by monthly active users.
  The rules check for a Google sign-in themselves, so another game enabling
  another provider in the shared project grants nothing here.

## Data layout

```
/config/rulesVersion          9
/config/scoringPaused         true | absent
/limits/$uid/submit           {level, hash, at}
/solutions/$uid/$level/$hash  {cells, at, rules, score?}  or tombstone {invalid, rules, at}
/scores/v$N/$uid/$level       {"<croupiers>_<rounds>": true, ...}
/stats/v$N/$level             {points: {"<croupiers>_<rounds>": count, ...}, players}
/saves/$uid/$level            {work: {cells, at}, solved, deleted: {$hash: true}}
/profiles/$uid                {name}
/friends/$uid/$other          true
/invites/$code                {from, expires}
/inviteOf/$uid                $code
```

| Path | Written by | Read by |
|---|---|---|
| `config` | the deploy workflow | any player signed in with Google |
| `limits` | the player | the player |
| `solutions` | the player, once per machine; functions add `score` or replace it with a tombstone | the player |
| `scores` | functions | the player and anyone they list as a friend |
| `stats` | functions | any player signed in with Google |
| `saves` | the player | the player |
| `profiles` | the player | the player and their friends |

"The player" always means someone signed in with Google: every rule that
admits a player checks `sign_in_provider === 'google.com'`.
| `friends`, `invites`, `inviteOf` | functions | `friends/$uid`: the player; the rest: functions only |

Conventions:

* **Machines are JSON strings** (`cells`), never database trees: cells hold
  arrays, some empty, which the database would drop or turn into objects. A
  string also lets the rules cap its size: 10,000 characters, about 4× the
  largest reference solution. The client doesn't submit larger machines.
* **`$hash`** is the first 32 hex digits of the SHA-256 of `canonicalCells` of
  the *validated* machine (`crypto.subtle` in both the browser and Node).
* **Score keys** are `"<croupiers>_<rounds>"`, e.g. `"12_31"`, and rules
  versions are `"v9"`, never bare integers, so the database never turns them
  into arrays.
* **`rules`** in a solution is the **server's** rules version when it was
  submitted: the client copies `/config/rulesVersion` and the rules reject
  anything else (see "Rules versions"). It says which engine scores it, not
  which engine found it.
* **`at`** in `saves` and `limits` is `ServerValue.TIMESTAMP`; `at` in a
  solution is the client's `Date.now()` when it was found (as in the local
  save).
* **`score`** is `{croupiers, rounds}` for a working machine or
  `{broken: true}` for one that doesn't clear the floor. An invalid submission
  is replaced by a **tombstone** `{invalid: '<reason>', rules, at}`, dropping
  its `cells`.

A player's frontier in `scores` is their **best ever** under that rules
version: the verified points not beaten on both axes by another of their
verified solutions. Deleting a solution from the local list (and
`saves/…/deleted`) hides it from the player's own plot but doesn't change
`scores` or `stats`; only deleting the account does.

`stats/v$N/$level/points` counts, for each point, the players whose frontier
contains it; `players` counts players with a non-empty frontier on that floor.
The overall frontier is computed in the browser from the points with a count.

## Rules versions

Scores depend on the engine, so everything derived from them is keyed by the
rules version (`scores/v$N`, `stats/v$N`), and each solution records the
server version current when it was submitted. A client always reads the stats
for its own `RULES_VERSION`, so they match the scores it computes locally.

Deploying a new rules version (say 8 to 9):

1. **Deploy functions and database rules** with the v9 engine. They score only
   solutions tagged 9, so anything submitted now (still tagged 8) waits.
2. **Set `/config/rulesVersion` to 9.** From now on the rules only accept
   submissions tagged 9, so no new solution is ever tagged 8. A client that
   read the old value gets "permission denied", re-reads it and retries.
3. **Run `rescore.js`.** It re-scores every solution tagged below 9 under the
   v9 engine, retags it 9, and adds its point to `scores/v9` and `stats/v9`. It
   then sweeps any solution tagged 9 that is still unscored. It uses the same
   add-a-point operation as the trigger (below), which is commutative and
   idempotent, so it can run while live submissions are being scored.
4. **Deploy the site.** v9 clients read `stats/v9`. Clients still running
   cached v8 code read `stats/v8`, frozen but consistent with their engine,
   until they reload.
5. Delete `scores/v8` and `stats/v8` at the next version bump.

Deploys that don't change `RULES_VERSION` skip steps 2, 3 and 5.

## Security rules

`database.rules.json` for this game's instance is generated by
`tools/write-rules.js` from `tools/database.rules.template.json`, filling in
`LEVEL_IDS` (a regex alternation of every id in `LEVELS` and `BONUS`); `npm
test` checks the file is current. Functions use the Admin SDK, which bypasses
the rules. `test/emulator/run.js` checks each guarantee below, and the attacks
the security review raised, against the emulator.

What the rules guarantee:

* **One solution per write, at most one per second per account.** Each
  submission is a multi-path `update()` that sets `limits/$uid/submit` to
  `{level, hash, at: now}` and creates `solutions/$uid/$level/$hash` with that
  same level and hash, so one update can create only one solution. `submit` can't be deleted
  (which would reset the clock), only replaced a second or more after the last
  one. Each account can therefore add at most 10 KB a second; with the level
  allowlist and App Check that bounds what scripted accounts can store, and
  the kill switch's storage check covers the rest.
* **Nothing a stranger can read is free-form.** `stats` holds integers written
  by functions. Names are visible only to friends and capped at 40
  characters. Machines are readable only by their owner.
* **Shapes are checked at every level**, including the parents: a plain
  string written where an object belongs is rejected (`hasChildren()`), so
  `.validate` rules on children can't be skipped by writing a primitive.
* **`deleted` can only name solutions the player has uploaded**, so it can't
  grow without bound.
* **Google only.** Every rule that admits a player requires
  `sign_in_provider === 'google.com'`, not just `auth != null`, so enabling
  another provider later (perhaps for another game in the shared project)
  grants nothing here.
* **Revoking a friend.** Read access to someone's `scores` and `profiles`
  comes from *their* `friends` list, so `removeFriend` takes effect at once.

## Functions

All in `functions/` (its own `package.json` with `firebase-functions` and
`firebase-admin`; the game itself keeps no dependencies), deployed as the
`stacked-deck` codebase so deploys from other games never delete them.
`functions/config.js` names the project, the database instance and its URL,
the region and the runtime service account.

Every function:

* names this game's database instance explicitly (the trigger's `instance`
  option and `getDatabase(app, '<instance URL>')`), never the project default;
* runs as a dedicated runtime service account (`stacked-deck-fn`: Firebase
  Realtime Database Admin; Eventarc Event Receiver, without which the
  database trigger can't be deployed; and Cloud Run Invoker on the
  `scoresolution` service, without which its events are refused with 403),
  not the Compute Engine default account. The CLI grants the last two only
  to the default account, so they are granted by hand;
* has `maxInstances` (2), `concurrency` 1, a short timeout and retries off,
  which caps the worst-case compute bill at a few dollars a month;
* enforces App Check (callables) and checks `request.auth` itself, including
  that the caller signed in with Google.

### `scoreSolution` (built)

`onValueCreated` on `/solutions/{uid}/{level}/{hash}` (`functions/index.js`;
the work is `processSolution` and `addPoint` in `functions/solutions.js`).

1. Read the node from the database (the event carries only what the client
   wrote). Stop if it already has `score`, is a tombstone, or
   `/config/scoringPaused` is set (a later sweep picks it up).
2. Stop unless its `rules` equals the function's `RULES_VERSION`: during a
   deploy, `rescore.js` handles the rest.
3. **Validate.** Look the level up in a `Map` of `LEVELS` and `BONUS`; parse
   `cells` in a `try`; run `validateCells` (below), which rejects anything
   the editor can't build; check that `$hash` matches the validated machine.
   Any failure replaces the node with a tombstone and stops.
4. **Score** in a `worker_threads` Worker (`functions/worker.js`) with
   `resourceLimits` (64 MB heap) and a 5-second timer. The engine's card limit
   (below) makes a runaway machine an ordinary failed run; a Worker that dies
   or times out anyway writes the tombstone `{invalid: 'resources'}`. Scoring
   runs the floor's published tests and then the machine's check deals
   (below), exactly as the game does, so a machine that cleared the floor in
   the game is never rejected here. A reference solution takes about 100 ms,
   mostly starting the Worker.
5. If it clears the floor, **add the point**: a transaction on
   `/scores/v{N}/{uid}/{level}` adds it and drops the points it beats. Take
   the difference from the run that committed (a transaction may first run
   against a missing cached value). If the frontier changed, apply it to
   `/stats/v{N}/{level}` in one `update()` with `ServerValue.increment(±1)` on
   each added or removed point, and on `players` if the frontier was empty.
   No transaction ever covers a shared node.
6. Write `score` last, in a transaction that writes only if the solution still
   exists (tombstones too): if the player deleted their data meanwhile,
   nothing is written back and the point is taken out again (`removePoint`).
   A retry after a crash redoes steps 5 and 6, and the transaction makes step
   5 a no-op if the point is already there. A crash between the transaction
   and the increments loses those increments until the next rebuild.

Transactions here return `null`, never `undefined`, for a `null` current
value: a transaction's first run often sees a cached `null` rather than the
server's value, and `undefined` would abort without asking the server.

### Friends and accounts (callables)

Built (`functions/friends.js`; the callables in `functions/index.js` check
the caller signed in with Google and turn its errors into callable errors
with a code the client shows):

* **`createInvite()`**: generates a 12-character code with
  `crypto.randomInt`, claims `invites/$code = {from, expires: now + 7 days}`
  with a transaction (only if free), and deletes the caller's previous invite
  (`inviteOf/$uid`), so each player has at most one live invite.
* **`previewInvite(code)`**: `{ name, own, friends }`: the inviter's nickname,
  and whether it's the caller's own invite or they are friends already, for
  the confirmation screen.
* **`acceptInvite(code)`**: checks `code` against
  `/^[A-Za-z0-9]{12}$/` before building any path; claims the invite with a
  transaction on `/invites/$code` that deletes it only if it exists, is
  unexpired and isn't the caller's own; only after that commits, writes
  `friends/a/b` and `friends/b/a`.
* **`removeFriend(uid)`**: deletes both directions.
* **`deleteMyData()`** (built; `functions/account.js`): for a caller signed
  in with Google, deletes their `solutions` first (so nothing new is scored),
  then for every rules version their frontiers and their points in each
  floor's `stats` (`removeFrontier`), then their `saves`, `profile`, `limits`,
  invite and both directions of every friendship. Safe to repeat. The client
  then deletes the sign-in account itself (`deleteUser`), so the functions
  never need rights over the project's users; if Google wants a recent
  sign-in first, the client asks the player to confirm with Google (a popup
  from a click) and deletes it then. While the project holds only this game
  that removes everything stored about the player; once other games share
  the sign-in accounts, deleting the account will need to cover them too.

### `rescore.js` and repairs

`functions/tools/rescore.js` is a script run with deploy credentials, not a
deployed function, so it can run longer than a function's timeout. It scores
each solution in its own Worker with the same limits as `scoreSolution`,
records failures as tombstones and carries on. Besides the version bump
above, it can:

* **remove a banned account's results** (the inverse of adding a point for
  each, then delete its data, as `deleteMyData`);
* **rebuild** `scores/v$N` and `stats/v$N` from `solutions` to repair drift:
  set `/config/scoringPaused`, recompute everything, write it, clear the flag,
  then sweep unscored solutions.

Packaging: Firebase uploads only `functions/`, so a `predeploy` step
(`tools/copy-game.js`) copies everything in `src/` except `src/ui/` into
`functions/game/` (git-ignored). Test-only fixture floors are not included.

## Engine card limit (built)

A machine can multiply cards without bound: two Duplicates feeding each other
quadruple the cards every four rounds, and reach millions within 40 rounds,
which runs Node (or a browser tab) out of memory. `maxRounds` doesn't help.

So the engine has a rule: **a run fails once more than `MAX_FLOOR_CARDS`
(1,000) cards are on the floor** (`overflow: true` from `runTest`;
`Floor.overflowed()`). The most any reference solution ever has on the floor
is 70, and no test has more than 52 input cards. This is `RULES_VERSION` 9.
The editor and the step-by-step simulator report it as a failure ("more than
1000 cards on the floor in round N"). It protects the browser as well as the
server.

## Check deals (built)

The published tests are public and fixed, so on their own a machine could be
built around them: hard-coding their payouts (on floors with shoes, dealing
the expected hands from house cards and dropping the players' hands; the
checker compares cards, not where they came from), or getting the published
deals right without following the rule. Secret or fresh random tests on the
server would stop that, but then a machine that cleared a floor in the game
could fail online.

So a floor is cleared only if the machine also passes 8 **check deals**:
random deals made like the floor's own random tests (by the same deal
function, `tests.deal`), seeded from the SHA-256
of the floor id and the machine's canonical form, through a 128-bit PRNG
(`sfc32`; a 32-bit seed would let someone search for a machine whose check
deals they already know). The game and the server deal the same check deals
for the same machine, so there are no surprises online, but changing a
machine to fit its check deals changes them. Scores (croupiers and rounds)
still come from the published tests only (rounds being the total over
them), so everyone's rounds are measured on the same deals. This is part of
`RULES_VERSION` 9, with the card limit and the change from averaged to total
rounds: saved solutions are re-scored, and any that only fitted the published
tests become broken.

In the editor the check deals run after the published tests, as chips C1–C8;
a failing one is loaded into the step-by-step view like any test, with a note
that check deals change with the machine. The help says the same.

## Shared scoring module (built)

`src/score.js` (no DOM, no `localStorage`, no `location`) holds `scoreMachine`,
`toSpec`, `sanitizeCells`, `canonicalCells`, `countCroupiers`, `frontierOf`
and their helpers (moved from `src/ui/model.js` and `src/ui/scatter.js`;
`model.js` re-exports them, so the UI is unchanged), plus:

* `validateCells(level, cells)`: a strict validator, unlike `sanitizeCells`
  (which cleans up the editor's own saves). It allows only the known fields for
  each kind and `fn` and the known ports (`PORTS`, checked against the
  editor's table by `test/score.js`); requires integer coordinates on
  buildable hexes, one cell per hex, sides that are integers 0–5, parameters
  within the editor's ranges (`kind` n 2–8, `hand` n 1–13, War rule and
  special cards allowed by the level), at most `MAX_DECK` (1,000) cards in a
  shoe and `MAX_DEAL_SIDES` (60) entries in a deal's list. It returns
  `{cells}` (a copy) or `{error}`.
* `solutionHash(cells)` (async): the first 32 hex digits of the SHA-256 of
  `canonicalCells`.
* `checkDeals(level, cells)` (async) and `scoreMachine` (now async): see
  "Check deals" below.

The client validates and hashes the same way before uploading, so honest
submissions never fail the server's checks. The editor doesn't enforce the
deck and deal caps; a machine beyond them stays in the local save but isn't
submitted.

## Client

Built so far (step 4): signing in, nicknames, uploading solutions and the
comparison on the plot. The pieces:

| File | What it does |
|---|---|
| `src/firebase-config.js` | the project's (public) web config, this game's database URL, the SDK version, the App Check site key |
| `src/online.js` | the logic that needs no SDK, tested in Node (`test/online.js`): which solutions to upload, the submission write, reading stats, cleaning nicknames |
| `src/ui/cloud.js` | the Firebase side: loading the SDK, sign-in state, the profile, the upload queue, stats |
| `src/ui/account.js` | the dialogs (sign in, nickname, another account's progress, account menu, sign out) and the header's account button |

Firebase's modular SDK is imported from
`https://www.gstatic.com/firebasejs/13.1.0/…` as ES modules, **lazily**:
nothing loads until the player opens the sign-in dialog, or until a player who
was signed in last time starts the game (the save's `account.signedIn`). A
signed-out session contacts no other site at all (`tools/ui-smoke.js` checks
this). Every call is best-effort; failures leave the local save as it is and
are retried later. The database connection is closed after 15 idle seconds
(`goOffline`), and nothing uses live listeners.

App Check is initialised with reCAPTCHA Enterprise (`APP_CHECK_SITE_KEY` in
`src/firebase-config.js`; skipped against the emulators). It is not enforced
yet: turn on enforcement for the database in the console, and
`ENFORCE_APP_CHECK` in `functions/config.js` for the callables, once the App
Check metrics show the game's requests are verified. For sign-in testing from
`localhost`, add `localhost` to the reCAPTCHA key's domains (or register a
debug token); unenforced, a failed App Check token doesn't block anything.

`index.html` has a Content-Security-Policy `<meta>` tag: scripts only from the
site and Google's hosts (`www.gstatic.com` for the SDK, `apis.google.com` for
the sign-in popup, `www.google.com` for reCAPTCHA, `*.firebaseio.com` for the
database's long-polling transport, which loads its responses as scripts: the
SDK falls back to it, and starts with it on every later load, once a
WebSocket has failed in that browser), frames only from the auth
domain, reCAPTCHA and `*.firebaseio.com` (long-polling's "disconnect ping"
frame, whose removal tells the server the transport has closed),
connections only to Google's APIs, the Firebase databases and (for the
emulators in tests) 127.0.0.1. Pages can't send
headers, so `frame-ancestors` isn't available. The policy is checked against
the emulators, not the real services, so a violation in production shows as
a "Content Security Policy" error in the browser console.

### Signing in (the opt-in)

* A **Sign in** button (on the floor select and under each floor's plot)
  first explains what signing in stores: the machines and scores (machines
  never shown to anyone), the counts on each floor's chart, a nickname, and
  what Google tells the sign-in service. Only then does it open Google's
  sign-in popup (always a popup, never a redirect: on github.io the auth
  domain is a different site and browsers' storage partitioning breaks the
  redirect flow). The SDK starts loading when the dialog opens, so the popup
  opens straight from the button's click (browsers block popups opened
  later).
* `privacy.html` is the privacy notice: what is stored where, who sees
  it, how long it's kept and how to delete it. The sign-in dialog, the
  account menu and the help link to it; keep it in step with what this
  document says is stored.
* On first sign-in the player picks a nickname (or "Later"), and their
  solutions so far are uploaded (below). The nickname is asked for only when
  the profile was read and has none, not when the read failed (as it does
  during a lockdown). The help screen repeats what is stored.
* Database reads give up after 15 seconds (`READ_TIMEOUT_MS` in
  `src/ui/cloud.js`; 5 against the emulators), since the SDK waits for a
  connection indefinitely: if it can't connect, signing in still finishes
  (as when the profile read fails, with no nickname asked for) instead of
  staying at "Signing in…", the Friends dialog says it couldn't load them,
  and uploads and cloud save pause. Writes aren't timed: the SDK queues them
  until it connects.
* While reads time out, the account is **offline**: the header shows
  "⚠ Offline" and the account menu says nothing is being saved to the
  account or loaded from it (progress stays in this browser), with a **Try
  again** button. It tries again every minute (`RETRY_MS`) and on returning
  to the tab; the first read that is answered ends it, reads the nickname if
  signing in missed it, and catches up cloud save and uploads.
* The local save records the account it belongs to (`account: { uid,
  signedIn }`). Signing in to a different account on a browser whose save
  belongs to someone else asks first: add the progress to this account,
  clear this browser, or cancel and sign out.
* **Sign out** (from the account menu) offers to keep the local save or clear
  this browser.

### Submitting solutions

* Every saved solution that works under the current rules and isn't yet
  uploaded for this account (`uploaded: <uid>`) is uploaded in the
  background, one at a time and at most one a second: on signing in, on each
  start, after rescoring and after each new solution. Its validated machine
  is hashed (`hash` is kept too), the client reads `/config/rulesVersion`
  once a session, and one `update()` sets `limits/$uid/submit` and
  `solutions/$uid/$level/$hash`. A machine the server wouldn't accept (it
  fails `validateCells`, or is over 10,000 characters) is not uploaded.
* On "permission denied", the client reads the solution back (the owner can):
  if it is there (the same machine, scored or a tombstone), it is flagged as
  uploaded; otherwise it is skipped for the session and the rules version is
  read again. Any other error (offline) pauses the queue until the next
  trigger.

### Cloud save (built)

The local save gains, per floor, `workAt` (when the working machine last
changed: the server's time once synced, this browser's clock for edits
since), `workSynced` (the server time of the working machine last pulled or
pushed) and `deleted` (hashes of solutions the player deleted). Merging a
floor (`planMerge` in `src/online.js`, applied by `runSync` in
`src/ui/cloud.js`) with `saves/$uid/$level` and `solutions/$uid/$level`:

| Field | Merge |
|---|---|
| working machine | the account's if it changed since the last sync and this browser's didn't (or is older); this browser's if only it changed (an old save that never synced counts) |
| `solved` | true if either is |
| solutions | local list ∪ the account's `solutions` (not tombstones), minus `deleted` from either side; added ones are validated and scored locally |
| `deleted` | union; only deletions of solutions the account has are written (the rules require it) |

* The merge runs on signing in (after the nickname, before uploading) and on
  each start, and when the player returns to the tab if 5 minutes have
  passed: one read each of `saves/$uid` and `solutions/$uid`. If it changes
  the floor open in the editor, the editor reopens with it.
* While editing, only `saves/$uid/$level/work` is written, 4 seconds after
  the last change (and at once when the page is hidden), with the server's
  time read back into `workAt` and `workSynced`. Emptying the floor syncs
  too. Clearing a floor writes `solved`; a machine deleted earlier and found
  again is taken out of `deleted`. Deleting a solution writes its hash to
  `deleted` (if the account has it).
* Machines from the account go through `validateCells` before they reach the
  editor.
* Rescoring stays local (`rescoreStale`); the plot shows local scores, which
  match the server's because both use `src/score.js`.
* Only real floors go online (not the `?testlevels` fixtures, which the rules
  would reject).

### Comparison on the plot

Built (step 4): when a floor's plot is shown to a signed-in player (the
results after clearing it, and the solutions list), `/stats/v{RULES_VERSION}/{level}`
is read when first needed, again after one of the player's uploads to that
floor (open plots then redraw), and at most every five minutes otherwise; it
is drawn behind the player's solutions: faint markers sized by
count, a dashed staircase for everyone's frontier, and a note counting the
players. Signed-out players see their own solutions only, with a line
inviting them to sign in; signing in from there redraws the plot.

Friends (built): the client reads `/friends/$uid` and each friend's
`/profiles/$friend` when first needed, again after a change made here, on
opening the Friends dialog, and at most every five minutes otherwise (an
invite may be accepted meanwhile); if the friends changed, open plots
redraw. Each friend's `/scores/v{RULES_VERSION}/$friend/{level}` is read in
parallel along with the floor's stats, and again whenever those are: one
snapshot, so a friend's point in everyone's stats always comes with their
staircase. The plot draws each friend's frontier as a staircase in its own
colour (up to six), labelled with their nickname, with a legend entry each. A friend whose
data can't be read (they removed you) is skipped.

Names are only ever rendered as text (children or `textContent`, never the
`html:` attribute of `dom.js` or a link `href`), with bidi and zero-width
control characters stripped.

### Friends and names

* On first sign-in the player picks a **nickname** for `profiles/$uid/name`.
  It is never filled in from the Google account.
* **Friends…** in the account menu (built) lists friends by nickname, each
  with Remove (`removeFriend`, after a confirm), and **Invite a friend**:
  `createInvite`, then the link `<page>#invite=$code` with Copy, and a note
  that it works once, until a date, for whoever has it. Inviting needs a
  nickname first (friends see it).
* **Accept** (built): opening an invite link takes the code out of the
  address (`history.replaceState`) and shows the floors; if signed out, it
  says there is an invite and offers signing in (which first explains what is
  stored, as always); then it shows "Accept the invite from *name*?"
  (`previewInvite`) and only on Accept calls `acceptInvite`. Its own invite
  or an existing friend just gets a message. A player without a nickname is
  asked for one after accepting.
* **Delete my data** (built): from the account menu. The dialog lists what
  goes (uploaded machines and scores, which leave every chart; the nickname;
  the sign-in account) and offers to clear this browser's progress too.
  Uploads stop and any under way finishes first; then `deleteMyData`, then
  `deleteUser`; the player is signed out and the save forgets the account.

## Testing and deployment

The emulator tests: `cd test/emulator && npm ci && npm test` (needs Java;
`firebase-tools` is pinned in that package). It copies the game code into
`functions/game/`, starts the database and functions emulators for a demo
project (no real resources) and runs `run.js`: the rules, `processSolution`
and `addPoint`, and a submission scored end to end by the trigger.

`npm run test:browser` there (also needs Playwright's Chromium, as
`tools/ui-smoke.js`) adds the auth emulator and runs `tools/online-smoke.js`:
the game in a browser with `?emulator`, which makes `src/ui/cloud.js` use the
emulators and offer a test hook to sign in without Google's popup, and the
SDK's CDN URLs served from `test/emulator/node_modules/firebase`. It signs in,
picks a nickname, checks the saved solution is uploaded, scored and counted,
that the plot shows it, the sign-out and other-account flows, deleting an
account's data (and the sign-in account) through the dialog, cloud save
between two browser contexts (a second device gets the floor; an edit and a
deletion reach it), and friends (an invite link, accepting it, the friend's
frontier on the plot, removing them). `firebase-tools`
sends all its requests through `HTTPS_PROXY` and ignores `NO_PROXY`, so
behind a proxy run either suite with `HTTPS_PROXY` unset.

The project's kill switch is deployed (from its own repository) before this
game's rules and functions.

One GitHub Actions workflow on pushes to `main`:

* a **test** job (`npm test`, plus the rules and functions tests in the
  Firebase emulator) with no deploy permissions;
* a **deploy** job, after it, in a protected `production` environment, the
  only job with `id-token: write`. It authenticates with Workload Identity
  Federation and runs the steps in "Rules versions": deploy functions and
  rules (`firebase deploy --only database:stacked-deck,functions:stacked-deck`),
  and if `RULES_VERSION` changed, set `config/rulesVersion` and run
  `rescore.js`; then deploy the site to Pages (Pages' source set to "GitHub
  Actions").

Hardening:

* The Workload Identity Federation provider only accepts this repository (by
  `repository_id` and `repository_owner_id`, not by name), `refs/heads/main`
  and this workflow.
* The deploy service account can deploy functions and this instance's rules,
  act as the runtime service account and nothing else, and read and write the
  database for `rescore.js`.
* Actions are pinned by commit SHA; `firebase-tools` and the functions'
  dependencies are pinned in lockfiles.

## Risks accepted

* **Same origin as other Pages sites.** Any page on `zygoloid.github.io` can
  read this game's local save and its Firebase sign-in. That gives access only
  to game data in the shared games project, never to anything outside it.
* **Shared project.** Database admin roles are project-wide, so a bug or
  compromise in one game's functions could touch another game's data, and the
  kill switch takes every game down at once.
* **Fake players.** Someone with many Google accounts can inflate the
  heatmap's counts with valid machines (reference solutions are public).
  Google accounts are much costlier to script than anonymous ones would be,
  App Check raises the cost further, and `rescore.js` can remove an account's
  results.
* **A smaller heatmap.** Only players who sign in count towards it.
* **SDK from a CDN.** The Firebase SDK is loaded from Google's CDN at a pinned
  version, without integrity checks (not available for module imports).

## Build order

1. Done: extract `src/score.js` and add `validateCells`; add the engine card
   limit, check deals, and rounds as the total over the tests (all
   `RULES_VERSION` 9).
2. Done: shared project setup (by hand: project, Auth, App Check, budget,
   service accounts and APIs) and the kill switch, deployed from the infra
   repository and tested with a lockdown and a restore.
3. Done and deployed: generated rules and `scoreSolution`, with rules and
   functions tested in the emulator, including attack cases: primitives at
   parents, unknown levels, wrong versions, bursts, oversized machines, the
   card bomb.
4. Done and deployed: Google sign-in (the opt-in), nicknames and solution
   upload; heatmap and overall frontier on the plot; tested end to end
   against the emulators and the real project. App Check sends tokens; it
   isn't enforced yet.
5. Done: cloud save.
6. Done: invites, the friends list and friends' frontiers on the plot;
   `deleteMyData` and its dialog; the privacy notice.
7. The deploy workflow and `rescore.js`.
