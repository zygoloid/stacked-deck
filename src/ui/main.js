// Entry point: hash router between level select, story and editor.
//   #/                     level select
//   #/level/<id>/story     story
//   #/level/<id>           editor
import { LEVELS } from '../levels.js';
import { loadSave, writeSave, isUnlocked, rescoreStale } from './model.js';
import { levelSelect, storyScreen, helpPanel } from './screens.js';
import { openEditor } from './editor.js';

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
  nextLevel: (i) => LEVELS[i + 1] ?? null,
};

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
    const index = LEVELS.findIndex((l) => l.id === decodeURIComponent(m[1]));
    if (index >= 0 && isUnlocked(save, index)) {
      const level = LEVELS[index];
      document.title = `${level.title} · Stacked Deck`;
      document.body.dataset.screen = m[2] ? 'story' : 'editor';
      cleanup = m[2] ? storyScreen(root, ctx, level, index) : openEditor(root, ctx, level, index);
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
rescoreStale(save, LEVELS, () => {
  writeSave(save);
  if (document.body.dataset.screen === 'select') route();
});
