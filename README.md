# Stacked Deck

A zachlike puzzle game set in an esoteric casino. Each floor is a hex grid of
card tables. You staff it with croupiers who each know exactly one move: pass
a hand on, cut it, check for a straight, split it by suit, play War against
the house. Wire them together so that exactly the right hands reach the chip
desk and everything else ends up on the floor.

## Play

    npm run serve        # then open http://localhost:8000

There are no dependencies and no build step. Any static file server works.
Add `?unlockall` to the URL to open every floor.

## Develop

    npm test             # engine, checker, sample machines, every level

| Path | Contents |
|---|---|
| [docs/architecture.md](docs/architecture.md) | modules, engine contract, croupier catalogue, level and save formats |
| [docs/story.md](docs/story.md) | cast and chapter arcs |
| [docs/validation.md](docs/validation.md) | how the rules were designed, with worked example machines |
| `src/levels.js` | level list |
| `solutions/levels/` | a verified reference solution for each level |
| `tools/write-solutions.js` | regenerates the par table |

UI smoke test (Playwright with the system Chromium):

    PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node tools/ui-smoke.js [screenshot-dir] [--all]
