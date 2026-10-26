// Entry point: hash router between level select, story and editor.
//   #/                     level select
//   #/level/<id>/story     story
//   #/level/<id>           editor
//   ?unlockall             every floor open; ?testlevels adds test fixtures (catalog.js)
import { CAMPAIGN, BONUS, ALL_LEVELS, findLevel } from './catalog.js';
import { loadSave, writeSave, isOpen, rescoreStale } from './model.js';
import { levelSelect, storyScreen, helpPanel } from './screens.js';
import { openEditor } from './editor.js';
import { createCloud } from './cloud.js';
import { confirmOtherAccount, askName } from './account.js';

const root = document.getElementById('app');
const helpHost = document.getElementById('help');
const save = loadSave();
let cleanup = null;

const ctx = {
  save,
  persist: () => writeSave(save),
  go: (hash) => { if (location.hash === hash) route(); else location.hash = hash; },
  help: () => {
    helpHost.replaceChildren(helpPanel(() => helpHost.replaceChildren(), save));
  },
  helpOpen: () => !!helpHost.firstChild,
  nextLevel,
};

// The online features (src/ui/cloud.js): nothing loads unless the player
// signed in last time or signs in now.
ctx.cloud = createCloud({
  save, persist: ctx.persist, levels: ALL_LEVELS,
  ui: { confirmOtherAccount, askName, cleared: () => ctx.go('#/') },
});
ctx.cloud.onChange(() => { if (document.body.dataset.screen === 'select') route(); });

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

function route() {
  cleanup?.();
  cleanup = null;
  window.scrollTo(0, 0);
  const m = /^#\/level\/([^/]+)(\/story)?$/.exec(location.hash);
  if (m) {
    const level = findLevel(decodeURIComponent(m[1]));
    if (level && isOpen(save, level)) {
      document.title = `${level.title} · Stacked Deck`;
      document.body.dataset.screen = m[2] ? 'story' : 'editor';
      cleanup = m[2] ? storyScreen(root, ctx, level) : openEditor(root, ctx, level);
      return;
    }
  }
  document.title = 'Stacked Deck';
  document.body.dataset.screen = 'select';
  levelSelect(root, ctx);
}

window.addEventListener('hashchange', route);
route();

// Saved solutions scored under older rules are re-run in the background.
rescoreStale(save, ALL_LEVELS, () => {
  writeSave(save);
  if (document.body.dataset.screen === 'select') route();
  ctx.cloud.queueUploads();
});
ctx.cloud.start();
