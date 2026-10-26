# Stacked Deck: online features (design)

Status: agreed design, partly built (see "Build order"): the shared scoring
module, the engine card limit, the database rules, `scoreSolution` and the
kill switch. Nothing is deployed yet.

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
| Project controls | App Check, a budget, and a kill switch (`ops/`, the `ops` codebase), set up once for the shared project (see below). |

## Shared project controls

These belong to the shared games project, not to this game, but this design
depends on them being in place before launch.

* **Kill switch** (`ops/`, deployed as the `ops` codebase with
  `firebase deploy --only functions:ops`). It covers every game in the
  project, and lives in this repo only until it moves to a repo of its own.
  `lockdown()` (`ops/killswitch.js`) sets deny-all rules on every database
  instance: those in `ops/config.js`, plus any the management API lists.
  Rejected requests cost almost nothing, and with writes refused no function
  is triggered. Undo it by redeploying each game's rules. Two triggers:
  * `usageKillSwitch`, every 10 minutes, reads the project's database usage
    from the Cloud Monitoring API (bytes sent in the last hour, and the most
    stored in the last day, each summed across instances into one time
    series) and locks down past `LIMITS`: 1 GiB sent in an hour (about $1)
    or 2 GiB stored. That turns a bandwidth attack (about $1/GB downloaded,
    otherwise limited only by the attacker's bandwidth) into some minutes of
    charges followed by an outage. It stands in for Cloud Monitoring alert
    policies, which cost about $0.10 per condition a month: it reads about
    9,000 time series a month against a free allowance of 1 million per
    billing account (then $0.50 per million), and uses one of the billing
    account's 3 free Cloud Scheduler jobs. If it can't read the metrics it
    logs an error and does nothing; after deploying, check that its
    "database usage" log line shows plausible numbers.
  * `budgetKillSwitch`, on the budget's Pub/Sub topic `over-budget`. Budgets
    publish their status several times a day whatever the spend, so it locks
    down only once actual spend reaches the budget. Billing data lags by
    hours, so this is the slow backstop.
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
* runs as a dedicated runtime service account with only database access, not
  the Compute Engine default account;
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
   or times out anyway writes the tombstone `{invalid: 'resources'}`. A
   reference solution takes about 100 ms, mostly starting the Worker.
5. If it clears the floor, **add the point**: a transaction on
   `/scores/v{N}/{uid}/{level}` adds it and drops the points it beats. Take
   the difference from the run that committed (a transaction may first run
   against a missing cached value). If the frontier changed, apply it to
   `/stats/v{N}/{level}` in one `update()` with `ServerValue.increment(±1)` on
   each added or removed point, and on `players` if the frontier was empty.
   No transaction ever covers a shared node.
6. Write `score` last. A retry after a crash redoes steps 5 and 6, and the
   transaction makes step 5 a no-op if the point is already there. A crash
   between the transaction and the increments loses those increments until
   the next rebuild.

### Friends and accounts (callables)

* **`createInvite()`**: generates a 12-character code with
  `crypto.randomInt`, stores `invites/$code = {from, expires: now + 7 days}`,
  deletes the caller's previous invite (`inviteOf/$uid`), so each player has at
  most one live invite.
* **`previewInvite(code)`**: returns the inviter's profile name, for the
  confirmation screen.
* **`acceptInvite(code)`**: checks `code` against
  `/^[A-Za-z0-9]{12}$/` before building any path; claims the invite with a
  transaction on `/invites/$code` that deletes it only if it exists, is
  unexpired and isn't the caller's own; only after that commits, writes
  `friends/a/b` and `friends/b/a`.
* **`removeFriend(uid)`**: deletes both directions.
* **`deleteMyData()`**: removes the caller's points from the
  current `stats` (the inverse of adding a point), then deletes their
  `solutions`, `scores`, `saves`, `profiles`, `limits`, invite and both
  directions of every friendship. The client then calls `user.delete()`.

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

The client validates and hashes the same way before uploading, so honest
submissions never fail the server's checks. The editor doesn't enforce the
deck and deal caps; a machine beyond them stays in the local save but isn't
submitted.

## Client

A new `src/ui/cloud.js` owns everything online. Firebase's modular SDK is
imported from `https://www.gstatic.com/firebasejs/<version>/…` (an exact
version) as ES modules, **lazily**: nothing loads until the player signs in,
or until a previously signed-in player starts the game. Every call is best-effort; failures leave the local
save as it is and are retried later. The Firebase config lives in
`src/firebase-config.js`.

`index.html` gets a Content-Security-Policy `<meta>` tag allowing scripts only
from the site and the Firebase and reCAPTCHA hosts, and connections only to
the Firebase endpoints. (Pages can't send headers, so `frame-ancestors` isn't
available.)

### Signing in (the opt-in)

* A **Sign in** button (on the floor select and next to each floor's plot)
  first explains what signing in does: your scores join the heatmap, your
  machines and progress are saved to your account, friends you invite see
  your scores and nickname, and you can delete it all. Only then does it open
  Google's sign-in popup (always a popup, never a redirect: on github.io the
  auth domain is a different site and browsers' storage partitioning breaks
  the redirect flow).
* On first sign-in the player picks a nickname, and their solutions so far are
  uploaded (below). The help screen repeats what is stored and how to delete
  it.
* The local save records the uid it belongs to. Signing in to a different
  Google account on a browser whose save belongs to someone else asks before
  merging anything.
* **Sign out** offers to keep the local save or clear this device.

### Submitting solutions

* Each local solution gets a `hash` and an `uploaded` flag. Before uploading,
  the client reads `/config/rulesVersion` and submits with one `update()`
  that sets `limits/$uid/submit` and `solutions/$uid/$level/$hash`, at most one
  a second, in the background. Earlier solutions (from before this feature,
  or found while offline) go up the same way.
* On "permission denied", the client reads the solution back (the owner can):
  if it is there with the same `cells`, it is flagged as uploaded; otherwise
  the client re-reads `rulesVersion` and retries later, or gives up for good
  on a solution that fails validation.

### Cloud save

The local save gains, per level, `workAt` (when the working machine last
changed, server time once synced) and `deleted` (hashes of solutions the
player deleted). Merging a local level with `saves/$uid/$level`:

| Field | Merge |
|---|---|
| working machine | the newer `at` wins |
| `solved` | true if either is |
| solutions | local list ∪ the account's `solutions` (scored, not tombstones), minus `deleted` from either side |
| `deleted` | union (only of uploaded solutions) |

* On sign-in and on each start, read `saves/$uid` and `solutions/$uid` once,
  merge into the local save, and write back what the server lacks. Machines
  from the server go through `validateCells` before they reach the editor.
* While editing, write only `saves/$uid/$level/work`, a few seconds after the
  last change and on `pagehide`. `solved` and `deleted` are written when they
  change.
* The client uses `get()` and short-lived connections (`goOffline()` once
  synced), never live listeners.
* Rescoring stays local (`rescoreStale`); the plot shows local scores, which
  match the server's because both use `src/score.js`.

### Comparison on the plot

When a floor's plot is shown to a signed-in player, read
`/stats/v{RULES_VERSION}/{level}` once, cached for the session, and pass it to
`scatterPlot` as `others` (the hook is already there): faint markers sized by
count, plus a line for the overall frontier. Signed-out players see their own
solutions only, with a line inviting them to sign in to compare. Also read
`/friends/$uid`, then each friend's `/profiles/$friend` and
`/scores/v{RULES_VERSION}/$friend` (all floors at once; cached for the
session), and draw each friend's frontier as a labelled staircase. If a
friend's data can't be read (they removed you), skip them.

Names are only ever rendered as text (children or `textContent`, never the
`html:` attribute of `dom.js` or a link `href`), with bidi and zero-width
control characters stripped.

### Friends and names

* On first sign-in the player picks a **nickname** for `profiles/$uid/name`.
  It is never filled in from the Google account.
* **Invite**: `createInvite` and show `…/#invite=$code` to send by any means.
* **Accept**: opening an invite link removes the code from the URL
  (`history.replaceState`), prompts Google sign-in if needed, shows "Accept
  invite from *name*?" (`previewInvite`) and only then calls `acceptInvite`.
* **List and remove** friends (`removeFriend`).
* **Delete my data** (`deleteMyData`, then `user.delete()`), and offer to
  clear the local save too.

## Testing and deployment

The emulator tests: `cd test/emulator && npm ci && npm test` (needs Java;
`firebase-tools` is pinned in that package). It copies the game code into
`functions/game/`, starts the database and functions emulators for a demo
project (no real resources) and runs `run.js`: the rules, `processSolution`
and `addPoint`, a submission scored end to end by the trigger, and the kill
switch. `firebase-tools` sends all its requests through `HTTPS_PROXY` and
ignores `NO_PROXY`, so behind a proxy run it with `HTTPS_PROXY` unset.

The kill switch is deployed by hand, once for the project:
`firebase deploy --only functions:ops`.

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
   limit (`RULES_VERSION` 9).
2. Shared project setup: project, Auth providers, App Check and budget are
   done (by hand); the kill switch is written (`ops/`), to be deployed with
   its service account.
3. Done, not deployed: generated rules and `scoreSolution`, with rules and
   functions tested in the emulator, including attack cases: primitives at
   parents, unknown levels, wrong versions, bursts, oversized machines, the
   card bomb.
4. Google sign-in (the opt-in), nicknames and solution upload; heatmap and
   overall frontier on the plot.
5. Cloud save.
6. Invites and friends' frontiers; `deleteMyData`.
7. The deploy workflow and `rescore.js`.
