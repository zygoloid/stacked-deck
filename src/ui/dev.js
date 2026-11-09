// Dev mode (docs/architecture.md, "Builds and dev mode"): tools for building
// and trying out floors. `?dev` in the page URL turns it on and `?dev=0` off;
// either is remembered in this browser. It is never available on the live
// site (src/build.js), only in a checkout served as it is and in the beta,
// which also carry the reference solutions it loads. In dev mode:
//  * any floor can be entered from the floors list, open or not;
//  * the floors list shows each floor's difficulty;
//  * the editor's floor panel shows the floor's difficulty, par and what
//    opens it (and what it opens), loads the par machine, and measures the
//    machine on the floor test by test: rounds, the most cards on the floor
//    at once, and the longest stretch with nothing dealt or paid (the
//    engine's STALL_ROUNDS limit is on that).
import { CHANNEL } from '../build.js';
import { Run, STALL_ROUNDS } from '../engine.js';
import { toSpec } from '../score.js';
import { h } from './dom.js';
import { ALL_LEVELS, BONUS, findLevel } from './catalog.js';
import { floorBadge } from './floors.js';

export const devAvailable = CHANNEL !== 'live';
const KEY = CHANNEL === 'beta' ? 'stacked-deck-beta-dev' : 'stacked-deck-dev';

let on = false;
if (devAvailable && typeof location !== 'undefined') {
  const m = /[?&]dev(?:=([^&#]*))?(?:[&#]|$)/.exec(location.search);
  if (m) on = m[1] !== '0';
  try {
    if (m) localStorage.setItem(KEY, on ? '1' : '0');
    else on = localStorage.getItem(KEY) === '1';
  } catch { /* storage blocked: only for this page */ }
}

export const devMode = () => on;
export function setDevMode(v) {
  on = devAvailable && !!v;
  try { localStorage.setItem(KEY, on ? '1' : '0'); } catch { /* storage blocked */ }
}

// The build's badge, for the headers (only the beta has one).
export const channelBadge = () => (CHANNEL === 'beta'
  ? h('span', { class: 'channel-badge', title: 'The beta: new floors being tried out. Its progress is kept apart from the main game\'s (use Save file to move it), and it has no online features.' }, 'Beta')
  : null);

// The floors list's dev bar: says dev mode is on, and turns it off.
export function devBar(onOff) {
  if (!on) return null;
  return h('div', { class: 'dev-bar' },
    h('b', {}, 'Dev mode'),
    h('span', {}, 'Locked floors open on a click; each floor shows its difficulty.'),
    h('button', { class: 'btn ghost small', onclick: () => { setDevMode(false); onOff(); } }, 'Turn off'));
}

// A floor's reference solution (solutions/levels/<id>.js): its cells, or
// null where there is none (the test fixtures, or a build without them).
export async function parMachine(level) {
  try {
    return (await import(`../../solutions/levels/${level.id}.js`)).default.cells;
  } catch {
    return null;
  }
}

// Measure a machine on each of the floor's tests: { ok, stop, rounds,
// maxCards, maxGap }. Rounds is the score's count (the round of the last
// progress) when the test passes, else where it stopped.
export function measureTest(level, cells, inputs) {
  const run = new Run(toSpec(level, cells), inputs, level);
  let maxCards = 0;
  while (!run.step()) maxCards = Math.max(maxCards, run.floor.cardCount());
  return { ok: run.passed, stop: run.stop, rounds: run.passed ? run.last : run.round, maxCards, maxGap: run.maxGap };
}

// Bonus floors that `level` helps open.
const opens = (level) => BONUS.filter((l) => [].concat(l.unlockAfter ?? []).includes(level.id));

// The editor's dev panel. `measured`: null, or the results so far (a list,
// one per test measured; `done` once all are). `loadPar()` and `measure()`
// are the editor's.
export function devPanel(level, { measured, loadPar, measure }) {
  const link = (l) => h('a', { class: 'dev-floor', href: `#/level/${l.id}` }, floorBadge(l), ' ', l.title);
  const list = (ls) => (ls.length ? ls.map((l, i) => [i ? ', ' : '', link(l)]) : h('span', { class: 'muted' }, 'none'));
  const after = [].concat(level.unlockAfter ?? []).map((id) => findLevel(id)).filter(Boolean);
  const rows = measured?.map((r, i) => h('tr', { class: r.ok ? '' : 'bad' },
    h('td', {}, String(i + 1)),
    h('td', {}, r.ok ? 'pass' : r.stop),
    h('td', {}, String(r.rounds)),
    h('td', {}, String(r.maxCards)),
    h('td', { class: r.maxGap > STALL_ROUNDS / 2 ? 'warn' : '', title: r.maxGap > STALL_ROUNDS / 2 ? `More than half of the ${STALL_ROUNDS}-round limit` : null }, String(r.maxGap))));
  const total = measured?.done && measured.every((r) => r.ok) ? measured.reduce((a, r) => a + r.rounds, 0) : null;
  return h('details', { class: 'dev-panel', open: true },
    h('summary', { class: 'sub-title' }, 'Dev'),
    h('p', {}, `Difficulty ${level.difficulty ?? '?'}`, level.par ? ` · par ${level.par.croupiers} croupiers, ${level.par.rounds} rounds` : ''),
    BONUS.includes(level) ? h('p', {}, 'Opens after: ', list(after)) : null,
    ALL_LEVELS.includes(level) ? h('p', {}, 'Opens: ', list(opens(level))) : null,
    h('div', { class: 'dev-actions' },
      h('button', { class: 'btn small', onclick: loadPar, title: 'Load the reference solution (an undo away)' }, 'Load par machine'),
      h('button', { class: 'btn small', onclick: measure, disabled: !!measured && !measured.done, title: 'Run every test and measure it' }, measured && !measured.done ? 'Measuring…' : 'Measure machine')),
    rows ? h('table', { class: 'dev-measure' },
      h('thead', {}, h('tr', {}, h('th', {}, 'Test'), h('th', {}, ''), h('th', {}, 'Rounds'), h('th', { title: 'Most cards on the floor at once' }, 'Cards'), h('th', { title: 'Longest stretch with nothing dealt or paid' }, 'Gap'))),
      h('tbody', {}, rows)) : null,
    total !== null ? h('p', { class: 'muted small' }, `Total ${total} rounds (the score).`) : null);
}
