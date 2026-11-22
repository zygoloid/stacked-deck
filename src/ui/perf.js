// Dev mode's frame meter (docs/architecture.md, "Builds and dev mode"): for
// finding what makes the step animation slow on a particular device. Under
// the transport, a panel lists each step taken (by hand or while playing):
// how many frames its animation got and the longest gap between two, how
// long the step itself took, how long drawing the board took each frame,
// and the longest main-thread frame the browser reported (Long Animation
// Frames, Chrome only). Slow frames with no long main-thread frame are
// waiting on painting or the GPU. Switches leave out parts of the drawing
// one at a time, to see which part costs; Copy puts the readout (and which
// switches are on) on the clipboard. It records only while open.
import { h } from './dom.js';

const KEY = 'stacked-deck-perf';
const KEEP = 14;     // steps listed
const SLACK = 120;   // ms after a step's animation that its frames still count

// [key, label, class on the editor (style.css), title]. fullRedraw is read
// by the editor instead.
const SWITCHES = [
  ['fullRedraw', 'Redraw everything each frame', null, 'As before the playback speed-up: the whole floor is built again every frame'],
  ['ownLayer', 'Board on its own layer', 'perf-own-layer', 'will-change: transform on the board, so it is painted apart from the felt behind it'],
  ['noFade', 'No fading', 'perf-no-fade', 'Cards, trays and badges that fade in or out are drawn solid'],
  ['noCardShadow', 'No card shadows', 'perf-no-card-shadow', null],
  ['noChipShadow', 'No chip shadows', 'perf-no-chip-shadow', null],
  ['noDash', 'No dashed lines', 'perf-no-dash', 'Chip rings, house cards, waiting hands: solid lines'],
  ['noTrays', 'No trays or badges', 'perf-no-trays', 'The trays, plates, glows and badges drawn with hands'],
  ['noCardText', 'No card text', 'perf-no-card-text', 'Cards without their ranks and suits'],
  ['noFloor', 'No empty hexes', 'perf-no-floor', null],
  ['noTables', 'No croupiers', 'perf-no-tables', 'The tables, chips and labels of every cell'],
  ['noArrows', 'No arrows', 'perf-no-arrows', null],
  ['noFelt', 'Plain felt', 'perf-no-felt', 'A flat colour behind the board instead of the textured felt'],
  ['noVignette', 'No vignette', 'perf-no-vignette', 'The shadow round the inside of the board'],
  ['noTests', 'Hide the tests panel', 'perf-no-tests', 'Its queue and payout lists'],
];

function load() {
  try { return JSON.parse(localStorage.getItem(KEY) ?? '{}') ?? {}; } catch { return {}; }
}

// `redraw()` draws the board again after a switch changes; attach(root)
// gives it the editor's element, which the switches' classes go on.
export function perfMeter({ redraw }) {
  let root = null;
  const saved = load();
  const on = { ...(saved.on ?? {}) };
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify({ open: details.open, on })); } catch { /* storage blocked */ } };
  const loaf = typeof PerformanceObserver !== 'undefined' && PerformanceObserver.supportedEntryTypes?.includes('long-animation-frame');

  const records = [];
  let cur = null;     // the step being measured: { label, t0, work, until, frames: [[t, boardMs]], timer }
  let longFrames = []; // Long Animation Frames seen while open
  let observer = null;

  const list = h('div', { class: 'perf-list' });
  const switches = SWITCHES.map(([key, label, , title]) => {
    const box = h('input', { type: 'checkbox', checked: !!on[key] });
    box.addEventListener('change', () => { on[key] = box.checked; apply(); save(); redraw(); });
    return h('label', { class: 'perf-switch', title }, box, ' ', label);
  });
  const copyBtn = h('button', { class: 'btn small ghost', onclick: copy }, 'Copy');
  const details = h('details', { class: 'perf-meter', open: !!saved.open },
    h('summary', { class: 'sub-title' }, 'Frame meter'),
    h('p', { class: 'muted small' }, 'Each step: frames its animation got (about 19 is smooth), the longest gap between frames, the step\'s own work, drawing the board per frame (average/most), and the longest main-thread frame',
      loaf ? ' (only those over 50 ms are reported; slow frames without one wait on painting)' : ' (not reported by this browser)', '.'),
    list,
    h('div', { class: 'dev-actions' }, copyBtn, h('button', { class: 'btn small ghost', onclick: () => { records.length = 0; show(); } }, 'Clear')),
    h('div', { class: 'perf-switches' }, switches));
  details.addEventListener('toggle', () => { listen(); save(); });

  function apply() {
    if (root) for (const [key, , cls] of SWITCHES) if (cls) root.classList.toggle(cls, !!on[key]);
  }
  function listen() {
    if (!loaf) return;
    if (details.open && !observer) {
      observer = new PerformanceObserver((l) => { longFrames.push(...l.getEntries()); if (longFrames.length > 200) longFrames = longFrames.slice(-100); });
      observer.observe({ type: 'long-animation-frame' });
    } else if (!details.open && observer) {
      observer.disconnect();
      observer = null;
    }
  }
  apply();
  listen();

  const ms = (x) => `${Math.round(x)}`;
  function line(r) {
    const n = r.frames.length;
    const gaps = r.frames.map(([t], i) => t - (i ? r.frames[i - 1][0] : r.t0 + r.work));
    const worst = n ? Math.max(...gaps) : 0;
    const board = r.frames.map(([, b]) => b);
    const avg = n ? board.reduce((a, b) => a + b, 0) / n : 0;
    const main = r.long.length ? Math.max(...r.long.map((e) => e.duration)) : null;
    return `${r.label}: ${n} frames, worst ${ms(worst)} ms · step ${ms(r.work)} ms · board ${avg.toFixed(1)}/${n ? ms(Math.max(...board)) : 0} ms · main ${main === null ? (loaf ? '<50' : '?') : `${ms(main)}`} ms`;
  }
  function detail(r) {
    // The longest main-thread frame, split: script before rendering, the
    // frame callbacks (drawing the board), style/layout/paint.
    const e = r.long.reduce((a, b) => (!a || b.duration > a.duration ? b : a), null);
    if (!e) return null;
    const end = e.startTime + e.duration;
    return `  longest main frame: script ${ms(e.renderStart ? e.renderStart - e.startTime : e.duration)}, frame callbacks ${ms(e.renderStart ? e.styleAndLayoutStart - e.renderStart : 0)}, style/layout/paint ${ms(e.styleAndLayoutStart ? end - e.styleAndLayoutStart : 0)} ms`;
  }
  function show() {
    list.replaceChildren(...records.map((r) => h('div', { class: 'perf-row' }, line(r), detail(r) ? h('div', { class: 'muted' }, detail(r)) : null)));
  }
  function finish() {
    if (!cur) return;
    clearTimeout(cur.timer);
    const r = cur;
    cur = null;
    r.long = longFrames.filter((e) => e.startTime + e.duration >= r.t0 && e.startTime <= r.until);
    records.unshift(r);
    records.length = Math.min(records.length, KEEP);
    show();
  }
  function copy() {
    const text = [
      `Frame meter, ${navigator.userAgent}`,
      `Switches on: ${SWITCHES.filter(([k]) => on[k]).map(([, l]) => l).join(', ') || 'none'}`,
      ...records.flatMap((r) => [line(r), detail(r)]).filter(Boolean),
    ].join('\n');
    const done = (ok) => { copyBtn.textContent = ok ? 'Copied' : 'Copy failed'; setTimeout(() => { copyBtn.textContent = 'Copy'; }, 1500); };
    navigator.clipboard?.writeText(text).then(() => done(true), () => done(false)) ?? done(false);
  }

  return {
    el: details,
    attach(el) { root = el; apply(); },
    get fullRedraw() { return !!on.fullRedraw; },
    // A step is starting: returns its start time, for end().
    begin: () => performance.now(),
    // The step that began at t0 has done its work (taking the run from one
    // round to another, `label`); its animation lasts animMs.
    end(t0, label, animMs) {
      if (!details.open) return;
      finish();
      const now = performance.now();
      cur = { label, t0, work: now - t0, until: now + animMs + SLACK, frames: [] };
      cur.timer = setTimeout(finish, animMs + SLACK + 50);
    },
    // The board was drawn in an animation frame, taking boardMs.
    frame(boardMs) {
      if (!cur) return;
      const t = performance.now();
      if (t > cur.until) { finish(); return; }
      cur.frames.push([t, boardMs]);
    },
  };
}
