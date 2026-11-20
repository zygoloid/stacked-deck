// The title screen's machine (src/ui/title-machine.js): a machine the
// editor could build, which runs on the real engine without ever jamming
// or flooding the floor: on several deals, for many rounds, it keeps taking
// hands from both players, keeps paying out at its desk, keeps its
// carousel turning, and keeps a steady number of cards on the floor.
import assert from 'node:assert';
import { Floor, MAX_FLOOR_CARDS } from '../src/engine.js';
import { validateCells } from '../src/score.js';
import { CROUPIERS } from '../src/ui/croupiers.js';
import { TITLE_LEVEL, TITLE_CELLS, TITLE_SPEC, TITLE_DESK, titleInputs } from '../src/ui/title-machine.js';

const level = { ...TITLE_LEVEL, croupiers: Object.keys(CROUPIERS), warRules: ['high', 'top'] };
const v = validateCells(level, TITLE_CELLS);
assert.ok(v.cells, `the title machine is one the editor could build: ${v.error}`);
const fixedKeys = new Set(TITLE_LEVEL.fixed.map((c) => c.at.join()));
assert.ok(TITLE_CELLS.every((c) => !fixedKeys.has(c.at.join())), 'no croupier on a player or the desk');

// The carousel's tables: the six round the hex two rows above the desk.
const hub = [TITLE_DESK[0] + 1, TITLE_DESK[1] - 2];
const ring = [[1, 0], [0, 1], [-1, 1], [-1, 0], [0, -1], [1, -1]].map(([dq, dr]) => `${hub[0] + dq},${hub[1] + dr}`);
assert.ok(ring.every((k) => TITLE_CELLS.some((c) => c.at.join() === k)), 'the carousel is all there');

const WINDOW = 100, ROUNDS = 3000;
for (const seed of [1, 2, 3, 0xbeef]) {
  // Enough hands that they never run out in the rounds checked.
  const f = new Floor(TITLE_SPEC, titleInputs(seed, 4000));
  let paid = 0, dealt = 0, most = 0, turning = 0;
  for (let round = 1; round <= ROUNDS; round++) {
    f.step();
    most = Math.max(most, f.cardCount());
    if (ring.some((k) => f.cells.get(k).slots.some(Boolean))) turning++;
    if (round % WINDOW === 0) {
      assert.ok(f.paid.length > paid + WINDOW / 2, `seed ${seed}: pays out steadily (rounds ${round - WINDOW}-${round}: ${f.paid.length - paid})`);
      assert.ok(f.inputPos > dealt + WINDOW / 10, `seed ${seed}: takes hands steadily (rounds ${round - WINDOW}-${round}: ${f.inputPos - dealt})`);
      paid = f.paid.length;
      dealt = f.inputPos;
    }
  }
  assert.ok(!f.allDealt(), `seed ${seed}: hands left`);
  assert.ok(most < 200 && most < MAX_FLOOR_CARDS, `seed ${seed}: a steady number of cards on the floor (at most ${most})`);
  assert.ok(turning > ROUNDS * 0.8, `seed ${seed}: the carousel keeps turning (hands on it in ${turning} of ${ROUNDS} rounds)`);
  // Both players deal: each has handed over most of the hands it was offered.
  for (const src of TITLE_LEVEL.fixed.filter((c) => c.kind === 'source')) {
    assert.ok(f.cells.get(src.at.join()).pos > f.inputPos / 4, `seed ${seed}: the player at ${src.at} deals`);
  }
}
console.log(`title: the title machine is buildable and runs ${ROUNDS} rounds steadily on 4 deals`);
