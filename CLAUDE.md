# Notes for Claude

Standing rules for working on this repository. The full design notes are in
docs/ (campaign.md, story.md, architecture.md); these are the ones that are
easy to forget.

## Writing floors

- Stories never say or hint how to solve their floor, not even as a joke:
  no helpful croupier, technique, marker card or pitfall that points at the
  method. State what a floor takes away (a croupier, a card) plainly, as a
  rule; keep solution notes for docs/campaign.md and the recipe comments.
  See "Notes for writers" in docs/story.md.
- The brief is the precise rule; the story must never contradict it.

## The bonus deck

- BONUS (src/levels/bonus.js) is in difficulty order: the Diff column of
  docs/campaign.md, then par croupiers. Exception: if bonus floor A opens
  bonus floor B (`unlockAfter`), B comes after A. Cards follow list order
  (A♠..K♠, then A♥..), so reordering renumbers them; that's fine (saves are
  keyed by id).
- `unlockAfter` is an id or a list of ids (campaign or bonus floors).
- Par should be beatable and somewhat naive, not optimal.

## Adding or changing a floor

- Recipe in tools/level-specs/<chapter>.js, mutants in
  test/mutants/<chapter>.js, docs rows in docs/campaign.md and
  docs/story.md.
- `node tools/write-solutions.js <id|chapter> --par`, then
  `node test/levels.js <id>`.
- `node test/compat.js --update` records new floors. A floor that has
  shipped may only grow; for one that hasn't, delete its entry and record it
  afresh.
- `node tools/write-rules.js`, then `npm test` and `node tools/ui-smoke.js`.

## Git

- When the branch's previous pull request has already been merged, restart
  the branch from main and force-push (with --force-with-lease); don't merge
  old branch history back in.
- Don't create a pull request unless asked.
- To stop the dev server, `for p in $(pgrep -f "^node tools/serve"); do kill
  $p; done`; never `pkill -f` with a pattern that matches your own command.
