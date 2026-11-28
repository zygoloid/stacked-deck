// The tutorial: a strip above the board that walks the player through a
// floor's `tutorial` steps (src/levels/hearts.js has the first two floors').
// A step is
//   { say: 'text', at?: [q, r], side?: 0-5, ui?: name, modal?: true, on?: 'failed', until }
// `say` may use {Click} / {click}, which read "Tap" / "tap" on a touch-only
// screen, {hold}, which reads "long press" there and "Ctrl-click" with a
// mouse, and {kbd:text}, shown only where there is a keyboard (not on a
// touch-only screen). `at` (and `side`) ring a hex (and one of its edges) on the board;
// `ui` lights up part of the editor (UI below), and dims the rest of the
// screen around it and the strip: while the step waits for Next (there is
// only reading to do), or for a moment otherwise. `until` is when the step is
// done:
//   'next'                 the player presses Next
//   'ran'                  a test has been run (a round or more)
//   'cleared'              the floor is cleared (since the editor opened)
//   { cell: { at, fn, out? } }   a croupier `fn` at `at`, with these ports
//                          pointed so (only the ports named; '*': anywhere)
//   { any: [until, ...] }  any one of these
// `modal` (the first step only, with until 'next'): the step first shows as a
// dialog in the middle of the screen, and on Next flies up to the strip, so
// the player sees where the tutorial lives. `on: 'failed'` (until 'next')
// takes a step out of the sequence: it shows, once a visit, when a run fails
// (a watched test or the check of them all), and Next goes back to the step
// the tutorial was on.
// Steps only go forward: once one is done the next shows, even if the
// machine later changes (the player may well build it some other way). A
// player who is ahead skips the steps between: to a later step that is done
// when every croupier the steps before it ask for is in place too (so
// pressing play early doesn't skip the building), or to 'cleared'. Back
// shows the steps before (skipped ones too), each with Next, until the
// player is back at the one they had reached.
// Finishing or skipping the tutorial is remembered in this browser; the
// floor's story page offers it again (forgetTutorial).
import { h, uiScale } from './dom.js';
import { CHANNEL } from '../build.js';

const KEY = CHANNEL === 'beta' ? 'stacked-deck-beta-coach' : 'stacked-deck-coach';

// Parts of the editor a step can light up.
const UI = {
  play: '.transport .tp.main, .insp-tp .tp.main', // whichever is showing
  tests: '.panel.tests',
  ports: '.inspector .port-row.active', // the port the next edge points
  roster: '.inspector .roster-box',
  undo: '.board-wrap .history',
  brief: '.topbar .brief',
  stats: '.topbar .stats',
};

// How long the screen stays dim around a lit part, on a step the player acts
// on (ms); and how far the clear patch reaches past the part (px at the
// design size).
const DIM_MS = 2600;
const DIM_PAD = 8;

function loadDone() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || 'null');
    return v && typeof v === 'object' && v.done && typeof v.done === 'object' ? v.done : {};
  } catch { return {}; }
}
function saveDone(done) {
  try { localStorage.setItem(KEY, JSON.stringify({ done })); } catch { /* storage full or blocked */ }
}

// Whether this browser has finished (or skipped) a floor's tutorial; and
// forgetting that, so it shows again next time the floor opens.
export const tutorialDone = (id) => !!loadDone()[id];
export function forgetTutorial(id) {
  const done = loadDone();
  delete done[id];
  saveDone(done);
}

const hexKey = ([q, r]) => `${q},${r}`;
// A step that asks for a croupier.
const builds = (until) => !!(until?.cell || until?.any);

// Whether `state` ({ cells, round, cleared }) meets a step's `until`;
// `acked`: Next was pressed on it.
function met(until, state, acked) {
  if (until === 'next') return acked;
  if (until === 'ran') return state.round > 0;
  if (until === 'cleared') return !!state.cleared;
  if (until?.any) return until.any.some((u) => met(u, state, acked));
  if (until?.cell) {
    const want = until.cell;
    const c = state.cells.find((x) => hexKey(x.at) === hexKey(want.at));
    if (!c || (want.fn && (c.fn ?? c.kind) !== want.fn)) return false;
    return Object.entries(want.out ?? {}).every(([port, side]) => (side === '*' ? c.out?.[port] !== undefined : c.out?.[port] === side));
  }
  return false;
}

// A rectangle with rounded corners, as an SVG path.
function roundRect(x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  return `M${x + r} ${y}H${x + w - r}A${r} ${r} 0 0 1 ${x + w} ${y + r}V${y + h - r}A${r} ${r} 0 0 1 ${x + w - r} ${y + h}`
    + `H${x + r}A${r} ${r} 0 0 1 ${x} ${y + h - r}V${y + r}A${r} ${r} 0 0 1 ${x + r} ${y}Z`;
}

// createCoach(level, { tapWord: () => 'tap' | 'click', root: () => element
// the `ui` selectors are looked up in, changed: () => redraw the editor
// (which calls update()) }) -> { el (the strip), layer (for over the whole
// editor: the dimmer and the first step's dialog), update(state), mark()
// (the ring for the board, or null), relight(), available, active(),
// blocking() (the dialog is up) }.
export function createCoach(level, { tapWord, root, changed }) {
  const all = level.tutorial ?? [];
  const steps = all.filter((st) => !st.on);
  const onFail = all.find((st) => st.on === 'failed') ?? null;
  const el = h('div', { class: 'coach hidden', role: 'status', 'aria-live': 'polite' });
  const dim = h('div', { class: 'coach-dim', 'aria-hidden': 'true' });
  const layer = h('div', { class: 'coach-layer' }, dim);
  // index: the step shown; far: the furthest reached (index < far while the
  // player looks back); aside: the on-failed step, while it shows.
  let index = 0, far = 0, acked = false, aside = null, asideShown = false;
  let state = { cells: [], round: 0, cleared: false, fails: 0 };
  let on = steps.length > 0 && !loadDone()[level.id];
  let lit = null;
  let card = null, back = null, modalDone = false; // the first step's dialog
  let flying = null; // its flight up to the strip
  const reducedMotion = () => !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  const words = (text) => {
    const t = tapWord();
    return text.replaceAll('{Click}', t[0].toUpperCase() + t.slice(1)).replaceAll('{click}', t)
      .replaceAll('{hold}', t === 'tap' ? 'long press' : 'Ctrl-click')
      .replace(/\{kbd:([^}]*)\}/g, (m, keys) => (t === 'tap' ? '' : keys));
  };
  // Done with the tutorial (finished, or skipped: `byPlayer`, so the
  // editor is redrawn here; otherwise update()'s caller redraws).
  const finish = (byPlayer = false) => {
    on = false;
    aside = null;
    const done = loadDone();
    done[level.id] = true;
    saveDone(done);
    draw();
    if (byPlayer) changed();
  };

  // Past every step that is done, and on to a later step the player has got
  // ahead to: one (not a Next) already done, with every croupier the steps
  // before it ask for in place (or the floor cleared). Looking back (index <
  // far) waits for Next, unless the player gets further ahead.
  function advance() {
    if (!on) return;
    const built = (j) => steps.slice(0, j).every((st) => !builds(st.until) || met(st.until, state, false));
    for (let j = steps.length - 1; j > far; j--) {
      const u = steps[j].until;
      if (u !== 'next' && met(u, state, false) && (u === 'cleared' || built(j))) { index = far = j; acked = false; break; }
    }
    // Looking back, and the step reached is done: on from there.
    if (index < far && steps[far].until !== 'next' && met(steps[far].until, state, false)) { index = far; acked = false; }
    if (index < far) return;
    while (index < steps.length && met(steps[index].until, state, acked)) { index++; acked = false; }
    far = index;
    if (index >= steps.length) finish();
  }

  // What the strip (or the dialog) shows for the step.
  function content() {
    const step = aside ?? steps[index];
    // A tutorial of one step is a note: no count, and no Skip beside its button.
    const note = !aside && steps.length === 1;
    const looking = !aside && index < far;
    const next = aside || looking || step.until === 'next';
    const nextLabel = aside || note ? 'Got it' : !looking && index === steps.length - 1 ? 'Done' : 'Next';
    return [
      note || aside ? null : h('span', { class: 'coach-count', title: 'Tutorial step' }, `${index + 1} / ${steps.length}`),
      h('p', { class: 'coach-text' }, words(step.say)),
      h('div', { class: 'coach-actions' },
        !note && !aside && index > 0 ? h('button', { class: 'btn small ghost coach-back', title: 'The tutorial\'s step before', onclick: () => { index--; acked = false; changed(); } }, '‹ Back') : null,
        next ? h('button', {
          class: 'btn small gold coach-next',
          onclick: () => {
            if (aside) aside = null;
            else if (looking) { index++; acked = false; } else acked = true;
            modalDone = true;
            advance();
            changed();
          },
        }, nextLabel) : null,
        note || aside ? null : h('button', { class: 'btn small ghost coach-skip', title: 'Hide the tutorial (the floor\'s story page can show it again)', onclick: () => { modalDone = true; finish(true); } }, 'Skip tutorial'))]
      .filter(Boolean);
  }

  function onCardKey(e) {
    if (!card || !card.isConnected || document.getElementById('help')?.firstChild) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      card.querySelector('.coach-next')?.click();
      return;
    }
    if (e.key === 'Tab') {
      const btns = [...card.querySelectorAll('button:not(:disabled)')];
      if (!btns.length) { e.preventDefault(); return; }
      const i = btns.indexOf(document.activeElement);
      e.preventDefault();
      btns[i < 0 ? 0 : (i + (e.shiftKey ? -1 : 1) + btns.length) % btns.length].focus();
    }
  }
  document.addEventListener('keydown', onCardKey, true);

  function draw() {
    if (!on) { dropCard(); relight(); el.classList.add('hidden'); el.replaceChildren(); return; }
    if (!aside && steps[index].modal && !modalDone) {
      // The first step, as a dialog in the middle of the screen.
      el.classList.add('hidden');
      if (!card) {
        back = h('div', { class: 'coach-veil' });
        card = h('div', { class: 'coach coach-card', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Tutorial' });
        layer.append(back, card);
        requestAnimationFrame(() => card?.querySelector('.coach-next')?.focus());
      }
      card.replaceChildren(...content());
      relight();
      return;
    }
    el.classList.remove('hidden');
    el.replaceChildren(...content());
    dropCard();
    relight();
  }

  // The dialog goes: it flies up to the strip (which shows once it lands).
  function dropCard() {
    if (!card) return;
    const c = card, b = back;
    card = back = null;
    c.style.pointerEvents = b.style.pointerEvents = 'none';
    if (!on || reducedMotion() || !c.animate) { c.remove(); b.remove(); return; }
    const from = c.getBoundingClientRect(), to = el.getBoundingClientRect();
    const dx = to.left + to.width / 2 - (from.left + from.width / 2), dy = to.top + to.height / 2 - (from.top + from.height / 2);
    const sx = to.width / from.width, sy = to.height / from.height;
    el.classList.add('landing');
    const ms = 650, easing = 'cubic-bezier(0.5, 0, 0.2, 1)';
    for (const k of c.children) k.animate([{ opacity: 1 }, { opacity: 0 }], { duration: ms * 0.3, fill: 'forwards' });
    b.animate([{ opacity: 1 }, { opacity: 0 }], { duration: ms, easing, fill: 'forwards' });
    flying = c.animate([{ transform: 'none' }, { transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})` }], { duration: ms, easing, fill: 'forwards' });
    flying.onfinish = () => {
      flying = null;
      c.remove(); b.remove();
      el.classList.remove('landing');
      el.animate?.([{ boxShadow: '0 0 0 0.25rem #f2c14e, 0 0 2rem rgba(242, 193, 78, 0.9)' }, { boxShadow: '0 0 0 0 rgba(242, 193, 78, 0)' }], { duration: 900, easing: 'ease-out' });
      relight();
    };
  }

  // Light up the part of the editor the step names (again, after the editor
  // redraws that part). A new showing of a step that names one dims the
  // screen around it and the strip, updating on scroll and resize rather than
  // spinning an idle animation loop.
  let dimFor = null, dimUntil = 0, dimRaf = 0, dimTimer = 0, dimPath = '';
  const dimRo = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => scheduleDim()) : null;
  function updateDim() {
    dimRaf = 0;
    const live = !!dimFor?.ui && el.isConnected && performance.now() < dimUntil;
    if (live && lit?.isConnected) {
      const W = window.innerWidth, H = window.innerHeight, s = uiScale();
      const hole = (r, p, rad) => roundRect(r.left - p, r.top - p, r.width + 2 * p, r.height + 2 * p, rad);
      const path = `M0 0H${W}V${H}H0Z${hole(lit.getBoundingClientRect(), DIM_PAD * s, 12 * s)}${hole(el.getBoundingClientRect(), 0, 0)}`;
      if (path !== dimPath) { dimPath = path; dim.style.clipPath = `path(evenodd, "${path}")`; }
      dim.classList.add('on');
    } else dim.classList.remove('on');
  }
  function scheduleDim() {
    if (!dimRaf && dimFor?.ui && el.isConnected) dimRaf = requestAnimationFrame(updateDim);
  }
  function bringLitIntoView(target) {
    if (!target?.isConnected || !el.isConnected) return;
    const behavior = reducedMotion() ? 'instant' : 'smooth';
    const side = target.closest('.side');
    if (side && side.scrollHeight > side.clientHeight && getComputedStyle(side).overflowY !== 'visible') {
      const sr = side.getBoundingClientRect(), tr = target.getBoundingClientRect();
      if (tr.bottom > sr.bottom || tr.top < sr.top) {
        side.scrollTo({ top: Math.max(0, side.scrollTop + tr.top - sr.top - 8 * uiScale()), behavior });
      }
    }
    const tr = target.getBoundingClientRect(), s = uiScale();
    if (tr.bottom > window.innerHeight - 8 * s) {
      // Scroll no further than keeps the tutorial strip itself on screen.
      const maxDown = Math.max(0, el.getBoundingClientRect().top - 8 * s);
      const wantDown = Math.min(tr.bottom - (window.innerHeight - 8 * s), Math.max(0, tr.top - window.innerHeight * 0.5));
      const by = Math.min(maxDown, wantDown);
      if (by > 4) window.scrollBy({ top: by, behavior });
    }
  }
  addEventListener('resize', scheduleDim);
  document.addEventListener('scroll', scheduleDim, { capture: true, passive: true });
  function relight() {
    const step = on ? aside ?? steps[index] : null;
    const sel = UI[step?.ui];
    const now = sel ? [...root().querySelectorAll(sel)].find((e) => e.getClientRects().length) ?? null : null;
    if (lit && lit !== now) { lit.classList.remove('coach-glow'); dimRo?.unobserve(lit); }
    lit = now;
    if (lit) { lit.classList.add('coach-glow'); dimRo?.observe(lit); }
    if (el.isConnected) dimRo?.observe(el);
    const want = card || flying ? null : step;
    if (want !== dimFor) {
      clearTimeout(dimTimer);
      dimFor = want;
      dimUntil = want?.until === 'next' ? Infinity : performance.now() + DIM_MS;
      if (want?.ui && dimUntil < Infinity) dimTimer = setTimeout(updateDim, DIM_MS + 16);
      if (want?.ui && lit) requestAnimationFrame(() => bringLitIntoView(lit));
    }
    updateDim();
    scheduleDim();
  }

  function mark() {
    const step = on && !card ? aside ?? steps[index] : null;
    return step?.at ? { at: step.at, side: step.side ?? null } : null;
  }

  return {
    el,
    layer,
    available: steps.length > 0,
    active: () => on,
    blocking: () => !!card,
    // The editor redrew a panel: light up the step's part of it again.
    relight,
    // The hex (and edge) to ring on the board, or null.
    mark,
    destroy() {
      document.removeEventListener('keydown', onCardKey, true);
      removeEventListener('resize', scheduleDim);
      document.removeEventListener('scroll', scheduleDim, { capture: true });
      clearTimeout(dimTimer);
      cancelAnimationFrame(dimRaf);
      dimRo?.disconnect();
    },
    // The editor's state changed ({ cells, round, cleared, fails: runs
    // failed }): move on if a step is done, or show the on-failed step. True
    // if the ring on the board changed.
    update(next) {
      const before = JSON.stringify(mark());
      if (on && onFail && !asideShown && !card && (next.fails ?? 0) > (state.fails ?? 0)) { aside = onFail; asideShown = true; }
      state = next;
      advance();
      draw();
      return JSON.stringify(mark()) !== before;
    },
  };
}
