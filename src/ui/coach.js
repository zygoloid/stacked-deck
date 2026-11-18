// The tutorial: a strip above the board that walks the player through a
// floor's `tutorial` steps (src/levels/hearts.js has the first two floors').
// A step is
//   { say: 'text', at?: [q, r], side?: 0-5, ui?: name, until }
// `say` may use {Click} / {click}, which read "Tap" / "tap" on a touch-only
// screen. `at` (and `side`) ring a hex (and one of its edges) on the board;
// `ui` lights up part of the editor (UI below). `until` is when the step is
// done:
//   'next'                 the player presses Next
//   'ran'                  a test has been run (a round or more)
//   'cleared'              the floor is cleared
//   { cell: { at, fn, out? } }   a croupier `fn` at `at`, with these ports
//                          pointed so (only the ports named)
// Steps only go forward: once one is done the next shows, even if the
// machine later changes (the player may well build it some other way), and
// a player who is ahead (a later step already done) skips the ones between.
// Finishing or skipping the tutorial is remembered in this browser; the
// floor panel offers it again.
import { h } from './dom.js';
import { CHANNEL } from '../build.js';

const KEY = CHANNEL === 'beta' ? 'stacked-deck-beta-coach' : 'stacked-deck-coach';

// Parts of the editor a step can light up.
const UI = {
  play: '.transport .tp.main',
  tests: '.panel.tests',
  ports: '.inspector .port-row',
  roster: '.inspector .roster-box',
  undo: '.board-wrap .history',
  brief: '.topbar .brief',
  stats: '.topbar .stats',
};

function loadDone() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || 'null');
    return v && typeof v === 'object' && v.done && typeof v.done === 'object' ? v.done : {};
  } catch { return {}; }
}
function saveDone(done) {
  try { localStorage.setItem(KEY, JSON.stringify({ done })); } catch { /* storage full or blocked */ }
}

const hexKey = ([q, r]) => `${q},${r}`;

// Whether `state` ({ cells, round, cleared }) meets a step's `until`;
// `acked`: Next was pressed on it.
function met(until, state, acked) {
  if (until === 'next') return acked;
  if (until === 'ran') return state.round > 0;
  if (until === 'cleared') return !!state.cleared;
  if (until?.cell) {
    const want = until.cell;
    const c = state.cells.find((x) => hexKey(x.at) === hexKey(want.at));
    if (!c || (want.fn && (c.fn ?? c.kind) !== want.fn)) return false;
    return Object.entries(want.out ?? {}).every(([port, side]) => c.out?.[port] === side);
  }
  return false;
}

// createCoach(level, { tapWord: () => 'tap' | 'click', root: () => element
// the `ui` selectors are looked up in, changed: () => redraw the editor
// (which calls update()) }) -> { el, update(state), mark() (the ring for the board, or
// null), restart(), available, active() }.
export function createCoach(level, { tapWord, root, changed }) {
  const steps = level.tutorial ?? [];
  const el = h('div', { class: 'coach hidden', role: 'status', 'aria-live': 'polite' });
  let index = 0, acked = false, state = { cells: [], round: 0, cleared: false };
  let on = steps.length > 0 && !loadDone()[level.id];
  let lit = null;

  const words = (text) => {
    const t = tapWord();
    return text.replaceAll('{Click}', t[0].toUpperCase() + t.slice(1)).replaceAll('{click}', t);
  };
  // Done with the tutorial (finished, or skipped: `byPlayer`, so the
  // editor is redrawn here; otherwise update()'s caller redraws).
  const finish = (byPlayer = false) => {
    on = false;
    const done = loadDone();
    done[level.id] = true;
    saveDone(done);
    draw();
    if (byPlayer) changed();
  };

  // Past every step that is done, and past any step the player has got
  // ahead of (a later step, not a Next, already done).
  function advance() {
    if (!on) return;
    for (let j = steps.length - 1; j > index; j--) {
      if (steps[j].until !== 'next' && met(steps[j].until, state, false)) { index = j; acked = false; break; }
    }
    while (index < steps.length && met(steps[index].until, state, acked)) { index++; acked = false; }
    if (index >= steps.length) finish();
  }

  function draw() {
    if (lit) { lit.classList.remove('coach-glow'); lit = null; }
    if (!on) { el.classList.add('hidden'); el.replaceChildren(); return; }
    const step = steps[index];
    el.classList.remove('hidden');
    el.replaceChildren(
      h('span', { class: 'coach-count', title: 'Tutorial step' }, `${index + 1} / ${steps.length}`),
      h('p', { class: 'coach-text' }, words(step.say)),
      h('div', { class: 'coach-actions' },
        step.until === 'next' ? h('button', { class: 'btn small gold coach-next', onclick: () => { acked = true; advance(); changed(); } },
          index === steps.length - 1 ? 'Done' : 'Next') : null,
        h('button', { class: 'btn small ghost coach-skip', title: 'Hide the tutorial (the floor panel can show it again)', onclick: () => finish(true) }, 'Skip tutorial')));
    if (step.ui && UI[step.ui]) {
      lit = root().querySelector(UI[step.ui]);
      lit?.classList.add('coach-glow');
    }
  }

  return {
    el,
    available: steps.length > 0,
    active: () => on,
    // The hex (and edge) to ring on the board, or null.
    mark: () => (on && steps[index]?.at ? { at: steps[index].at, side: steps[index].side ?? null } : null),
    // The editor's state changed ({ cells, round, cleared }): move on if a
    // step is done. True if the step (or the ring) changed.
    update(next) {
      state = next;
      const before = index, was = on;
      advance();
      draw();
      return index !== before || on !== was;
    },
    restart() {
      on = steps.length > 0;
      index = 0;
      acked = false;
      const done = loadDone();
      delete done[level.id];
      saveDone(done);
      advance();
      changed();
    },
  };
}
