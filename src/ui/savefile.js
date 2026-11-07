// Save files: the player's progress as a file to download, and loading one
// back (into another browser, or into this one after it lost its storage).
// Loading a file adds to what this browser has (mergeSave in model.js, from
// an empty base): floors cleared there count as cleared here, its solutions
// join this browser's, and nothing here is lost or replaced.
//
// A file can come from anywhere, so loading one keeps only floors the game
// has, and only machines the editor could have built (validateCells); every
// solution is scored again here rather than trusting the file's scores.
import { RULES_VERSION } from '../engine.js';
import { validateCells, scoreMachine, countCroupiers } from '../score.js';
import { mergeSave, recomputeBest } from './model.js';
import { h } from './dom.js';
import { dialog } from './account.js';

export const FILE_FORMAT = 'stacked-deck-save';

// What a file keeps of a floor's save: not the cloud save's bookkeeping
// (workSynced, deleted, and which account a solution was uploaded to).
const keepLevel = ({ workSynced, deleted, ...ls }) => ({
  ...ls,
  ...(Array.isArray(ls.solutions) ? { solutions: ls.solutions.map(({ uploaded, hash, ...s }) => s) } : {}),
});

export function saveFileText(save, now = new Date()) {
  const levels = Object.fromEntries(Object.entries(save.levels).map(([id, ls]) => [id, keepLevel(ls)]));
  return `${JSON.stringify({ format: FILE_FORMAT, version: 1, saved: now.toISOString(), levels }, null, 1)}\n`;
}

export const saveFileName = (now = new Date()) => {
  const p = (n) => String(n).padStart(2, '0');
  return `stacked-deck-save-${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}.json`;
};

// A save file's text as a save holding only what this game can use:
// { save: { levels } } or { error }. `levels` is every floor the game has.
export async function readSaveFile(text, levels) {
  let data;
  try { data = JSON.parse(text); } catch { return { error: 'That file isn\'t a Stacked Deck save.' }; }
  if (!data || typeof data !== 'object' || !data.levels || typeof data.levels !== 'object' || Array.isArray(data.levels) ||
      (data.format !== undefined && data.format !== FILE_FORMAT)) {
    return { error: 'That file isn\'t a Stacked Deck save.' };
  }
  if (data.format === FILE_FORMAT && data.version !== 1) {
    return { error: 'That save is from a newer version of the game. Reload the page to update it, then try again.' };
  }
  const out = {};
  for (const level of levels) {
    const ls = data.levels[level.id];
    if (!ls || typeof ls !== 'object') continue;
    const l = {};
    if (ls.solved === true) l.solved = true;
    const work = validateCells(level, ls.cells).cells;
    if (work) { l.cells = work; l.workAt = Number.isFinite(ls.workAt) ? ls.workAt : 0; }
    for (const sol of Array.isArray(ls.solutions) ? ls.solutions : []) {
      const cells = validateCells(level, sol?.cells).cells;
      if (!cells) continue;
      await new Promise((r) => setTimeout(r, 0)); // stay responsive
      let sc = { ok: false };
      try { sc = await scoreMachine(level, cells); } catch { /* broken */ }
      (l.solutions ??= []).push({
        cells, croupiers: countCroupiers(cells), rounds: sc.rounds ?? 0, at: Number.isFinite(sol.at) ? sol.at : Date.now(),
        rules: RULES_VERSION, ...(sc.ok ? {} : { broken: true }),
      });
      if (sc.ok) l.solved = true;
    }
    if (l.solutions) recomputeBest(l);
    if (Object.keys(l).length) out[level.id] = l;
  }
  return { save: { levels: out } };
}

// Add a save read by readSaveFile to `save`. Returns the ids of the floors
// that changed and how many floors it newly cleared and solutions it added.
export function loadSaveFile(save, loaded) {
  const cleared = Object.values(save.levels).filter((l) => l.solved).length;
  const count = () => Object.values(save.levels).reduce((n, l) => n + (Array.isArray(l.solutions) ? l.solutions.length : 0), 0);
  const solutions = count();
  const changed = mergeSave({ levels: {} }, loaded, save);
  return {
    changed,
    cleared: Object.values(save.levels).filter((l) => l.solved).length - cleared,
    solutions: count() - solutions,
  };
}

export function downloadSave(save) {
  const url = URL.createObjectURL(new Blob([saveFileText(save)], { type: 'application/json' }));
  const a = h('a', { href: url, download: saveFileName() });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

// The floors list's "Save file" dialog. ctx: { save, persist, cloud,
// savesChanged(ids) }; `levels` is every floor the game has.
export function saveFileDialog(ctx, levels) {
  return dialog((close) => {
    const status = h('p', { class: 'muted small dlg-status', role: 'status' }, '');
    const picker = h('input', { type: 'file', accept: '.json,application/json', class: 'hidden', onchange: () => load() });
    const loadBtn = h('button', { class: 'btn', onclick: () => picker.click() }, 'Load a save file…');
    async function load() {
      const file = picker.files?.[0];
      picker.value = '';
      if (!file) return;
      loadBtn.disabled = true;
      status.textContent = 'Reading the file…';
      let res;
      try { res = await readSaveFile(await file.text(), levels); } catch { res = { error: 'That file couldn\'t be read.' }; }
      loadBtn.disabled = false;
      if (res.error) { status.textContent = res.error; return; }
      const { changed, cleared, solutions } = loadSaveFile(ctx.save, res.save);
      if (!changed.length) { status.textContent = 'Nothing new in that file: this browser already has all of it.'; return; }
      const problem = ctx.persist();
      for (const id of changed) ctx.cloud?.levelChanged(id, { solved: !!ctx.save.levels[id]?.solved });
      ctx.cloud?.queueUploads();
      ctx.savesChanged(changed);
      const parts = [cleared ? `${plural(cleared, 'floor')} cleared` : null, solutions ? plural(solutions, 'solution') : null].filter(Boolean);
      status.textContent = `Loaded${parts.length ? `: ${parts.join(' and ')} added` : ''}.${problem ? ' It couldn\'t be saved in this browser, though.' : ''}`;
    }
    return [
      h('h2', {}, 'Save file'),
      h('p', {}, 'Your progress is kept in this browser. Download it as a file to keep a copy, or to carry on in another browser.'),
      h('p', { class: 'muted small' }, 'Loading a save file adds its cleared floors and solutions to the ones here; nothing here is lost or replaced.',
        ctx.cloud?.state() === 'signed-in' ? ' Signed in, your progress is also kept in your account.' : ''),
      h('div', { class: 'modal-actions' },
        h('button', { class: 'btn gold', onclick: () => downloadSave(ctx.save) }, 'Download save'),
        loadBtn,
        h('button', { class: 'btn ghost', onclick: () => close() }, 'Close')),
      status,
      picker,
    ];
  });
}
