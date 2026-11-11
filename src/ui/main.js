// Entry point: hash router between level select, story and editor.
//   #/                     level select
//   #/level/<id>/story     story
//   #/level/<id>           editor
//   ?unlockall             every floor open; ?testlevels adds test fixtures (catalog.js)
//   ?dev, ?dev=0           dev mode on or off, remembered (dev.js; not on the live site)
import { CAMPAIGN, BONUS, ALL_LEVELS, findLevel } from './catalog.js';
import { loadSave, writeSave, watchSave, saveProblem, isOpen, rescoreStale } from './model.js';
import { levelSelect, storyScreen, helpPanel } from './screens.js';
import { openEditor } from './editor.js';
import { createCloud } from './cloud.js';
import { LEVELS as REAL_LEVELS, BONUS as REAL_BONUS } from '../levels.js';
import { confirmOtherAccount, askName, inviteFlow } from './account.js';
import { downloadSave } from './savefile.js';
import { h } from './dom.js';
import { CHANNEL } from '../build.js';
import { devMode } from './dev.js';

const root = document.getElementById('app');
const helpHost = document.getElementById('help');
const noticeHost = document.getElementById('notice');
const save = loadSave();
let cleanup = null;
let lastFloor = null; // the floor last opened, shown when coming back to the floors list
let problemShown = null, problemDismissed = false; // the save notice (showProblem)

const ctx = {
  save,
  // Returns saveProblem() (null when saved).
  persist: () => { const p = writeSave(save); showProblem(p); return p; },
  // Floors whose saves changed from outside the screen showing (another tab,
  // or a save file): draw it again if it shows them.
  savesChanged: (ids) => {
    const m = /^#\/level\/([^/]+)(\/story)?$/.exec(location.hash);
    if (document.body.dataset.screen === 'select' || (m && ids.includes(decodeURIComponent(m[1])))) rerender();
  },
  go: (hash) => { if (location.hash === hash) route(); else location.hash = hash; },
  help: () => {
    helpHost.replaceChildren(helpPanel(() => helpHost.replaceChildren(), save));
  },
  helpOpen: () => !!helpHost.firstChild,
  nextLevel,
  // Open a floor's editor with one of its saved solutions loaded (by its
  // index in the save's list); the editor takes it when it opens.
  openSolution: (level, index) => { pendingSolution = { id: level.id, index }; ctx.go(`#/level/${level.id}`); },
  takeSolution: (id) => {
    const p = pendingSolution;
    pendingSolution = null;
    return p?.id === id ? p.index : null;
  },
};
let pendingSolution = null;

// The online features (src/ui/cloud.js): nothing loads unless the player
// signed in last time or signs in now. Only real floors go online (not the
// ?testlevels fixtures). When cloud save changes the floor being edited, the
// editor reopens with it. The beta has none: its floors aren't the live
// game's, so the server would refuse them (ctx.cloud is null).
ctx.cloud = CHANNEL === 'beta' ? null : createCloud({
  save, persist: ctx.persist, levels: [...REAL_LEVELS, ...(REAL_BONUS ?? [])],
  ui: {
    confirmOtherAccount, askName,
    cleared: () => ctx.go('#/'),
    levelsUpdated: (ids) => {
      const m = /^#\/level\/([^/]+)$/.exec(location.hash);
      if (m && ids.includes(decodeURIComponent(m[1]))) rerender();
    },
  },
});
ctx.cloud?.onChange(() => { if (document.body.dataset.screen === 'select') rerender(); });
document.body.dataset.channel = CHANNEL;

// The game's other tabs: their progress is merged into this tab's save as
// they write it (watchSave in model.js).
watchSave(save, ctx.savesChanged);

// A notice while progress can't be saved in this browser, offering the save
// file instead. Dismissed, it stays away for the rest of this visit; it goes
// by itself once saving works again.
function showProblem(p) {
  if (p === problemShown) return;
  problemShown = p;
  if (!p || problemDismissed) { noticeHost.replaceChildren(); return; }
  const text = p === 'full'
    ? 'This browser\'s storage for the game is full, so your latest progress isn\'t being saved here.'
    : 'This browser isn\'t letting the game save (storage may be turned off, as in some private windows), so your progress will be lost when you close the page.';
  noticeHost.replaceChildren(h('div', { class: 'save-notice', role: 'alert' },
    h('span', {}, `⚠ ${text} Download your save to keep a copy; you can load it again from the floors list.`),
    h('button', { class: 'btn small gold', onclick: () => downloadSave(save) }, 'Download save'),
    h('button', {
      class: 'btn small ghost', title: 'Dismiss', 'aria-label': 'Dismiss',
      onclick: () => { problemDismissed = true; noticeHost.replaceChildren(); },
    }, '×')));
}
showProblem(saveProblem());

// The floor to offer after clearing `level`: the next campaign floor; for a
// bonus floor, the next open bonus floor (after it, else an earlier unsolved
// one), or null (back to the floors list).
function nextLevel(level) {
  const i = CAMPAIGN.indexOf(level);
  if (i >= 0) return CAMPAIGN[i + 1] ?? null;
  const b = BONUS.indexOf(level);
  const open = (l) => l !== level && isOpen(save, l);
  return BONUS.slice(b + 1).find(open) ?? BONUS.slice(0, b).find((l) => open(l) && !save.levels[l.id]?.solved) ?? null;
}

document.addEventListener('keydown', (e) => {
  if (e.target.closest?.('input, textarea, select')) return;
  if (helpHost.firstChild && (e.key === 'Escape' || e.key === '?')) { e.preventDefault(); helpHost.replaceChildren(); return; }
  if (e.key === '?' && !helpHost.firstChild) { e.preventDefault(); ctx.help(); }
});

// Draw the current screen again for a change from elsewhere (the cloud, or
// rescoring), where the player is: route() scrolls to the top, as for
// navigating.
function rerender() {
  const y = window.scrollY;
  route();
  window.scrollTo(0, y);
}
ctx.rerender = rerender;

function route() {
  cleanup?.();
  cleanup = null;
  window.scrollTo(0, 0);
  const m = /^#\/level\/([^/]+)(\/story)?$/.exec(location.hash);
  if (m) {
    const level = findLevel(decodeURIComponent(m[1]));
    // (Dev mode enters any floor, open or not.)
    if (level && (isOpen(save, level) || devMode())) {
      document.title = `${level.title} · Stacked Deck`;
      document.body.dataset.screen = m[2] ? 'story' : 'editor';
      lastFloor = level.id;
      cleanup = m[2] ? storyScreen(root, ctx, level) : openEditor(root, ctx, level);
      return;
    }
  }
  document.title = 'Stacked Deck';
  document.body.dataset.screen = 'select';
  cleanup = levelSelect(root, ctx, lastFloor);
  // Back from a floor: its deck is shown, scrolled so that floor's card is in
  // view (its small card, in a folded suit). Only once: drawn again later, the
  // list stays on the deck the player picked.
  const card = lastFloor && [...root.querySelectorAll('[data-level]')].find((t) => t.dataset.level === lastFloor && t.getClientRects().length);
  card?.scrollIntoView({ block: 'center' });
  lastFloor = null;
}

// An invite link (#invite=<code>): take the code out of the address (so it
// isn't left in the history or shared on), show the floors, and offer to
// accept it.
function takeInvite() {
  const m = /^#invite=([A-Za-z0-9]{12})$/.exec(location.hash);
  if (!m) return false;
  history.replaceState(null, '', `${location.pathname}${location.search}#/`);
  route();
  if (ctx.cloud) inviteFlow(ctx.cloud, m[1]).catch((e) => console.warn('invite:', e));
  return true;
}

window.addEventListener('hashchange', () => { if (!takeInvite()) route(); });
if (!takeInvite()) route();

// Saved solutions scored under older rules are re-run in the background;
// outside the live site (the beta, a checkout), so are those scored on a
// floor that has changed since (floorPrint in model.js): floors there change
// without a rules version. Dev mode can re-run every one (ctx.rescoreAll).
const rescored = () => {
  ctx.persist();
  if (document.body.dataset.screen === 'select') rerender();
  ctx.cloud?.queueUploads();
};
rescoreStale(save, ALL_LEVELS, rescored, { floors: CHANNEL !== 'live' });
ctx.rescoreAll = () => rescoreStale(save, ALL_LEVELS, rescored, { all: true });
ctx.cloud?.start();
