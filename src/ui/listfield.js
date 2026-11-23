// The inspector's editor for a Deal's side list and a shoe's deck.
//
// The list is kept as text (src/ui/listtext.js has the grammar) and shown as
// a row of entries: cards as card faces, runs as their two ends, a new deck
// as a card back, Deal sides as their coloured badges, counts as gold tags,
// and groups as frames (inline boxes, so a group wraps across lines). The
// caret is a gap between entries (inside a group's brackets too); typing
// opens a small box there, which adds its entry on Space, Enter or a comma.
// Entries are selected by a tap, a Shift-click, Shift+arrows or a drag across
// the field's background, and moved by dragging them.
//
// Every change made here reads as a list (text that doesn't stays in the
// typing box), so each one is a single edit of the croupier. The Text view
// shows the same list in its shorthand, in a plain text box, and is applied
// when it is left.
//
// Under the field, a pad: a shoe's cards (a drag along a suit adds a run) or a
// Deal's sides. A pad tap adds at the caret; the same entry again makes it x2.
import { h, cardEl, cardName, uiScale, SUIT_GLYPH, arrowEl } from './dom.js';
import {
  readList, lexList, setCount, removeRange, ungroup, wrapGroup, tapEntry, tidyText, matching,
  gapOffset, gapAt, balance, tapAt, insertAt, moveTokens, SIDE_TEXT, MAX_COUNT,
} from './listtext.js';
import { stepper } from './stepper.js';

// One colour per side, E round to NE (Deal lists and their pad).
export const SIDE_COLOURS = ['#f2c14e', '#f08a5d', '#e8709f', '#a99af4', '#62b6ea', '#5fd3a0'];
const RANKS = 'A23456789TJQK'.split('');
const SUITS = ['S', 'D', 'C', 'H'];
const rankText = (r) => (r === 'T' ? '10' : r);
const COUNT_ONLY = /^[xX×*]\s*(\d+)$/;
// Click with a mouse, tap on a touch screen.
const hasMouse = () => !!window.matchMedia?.('(any-pointer: fine)').matches;
const clickWord = () => (hasMouse() ? 'click' : 'tap');
const ClickWord = () => (hasMouse() ? 'Click' : 'Tap');

// kind: 'deal' or 'shoe'. text: the list's text. specials: the special cards
// the floor allows. mode: 'cards' | 'text'. keep: what the field it replaces
// was showing ({ caret, sel, box, draft }, from state()).
// onEdit({ text, list }) after every change of the list (or of its text).
// onUndo/onRedo: Ctrl+Z and Ctrl+Shift+Z / Ctrl+Y in the field. onMode(mode).
export function listField({ kind, text = '', specials = [], mode = 'cards', keep = {}, onEdit, onUndo, onRedo, onMode }) {
  const deal = kind === 'deal';
  const read = (t) => readList(kind, t, { specials });
  let toks = [], list = null, error = null;
  let caret = Math.min(keep.caret ?? Infinity, lexList(kind, text).length); // a gap
  let sel = keep.sel ?? null;   // selected tokens { a, b } (b exclusive), or null
  let anchor = null;            // where a Shift selection started (a gap)
  let flash = null;             // a mistake to show until the next change
  let draft = keep.draft ?? null; // the Text view's text while it differs from the list
  let els = [];                 // token -> its element (a chip, a group's opening mark, its count tag)

  // Keeps the focus where it is (so a phone's keyboard doesn't come up for a tap).
  const noFocus = (e) => e.preventDefault();

  // ---------- the parts ----------
  const box = h('div', { class: 'lf-chips', tabindex: '-1', role: 'group', 'aria-label': deal ? 'Deal to: sides in order' : 'Deck, top first' });
  const inp = h('input', {
    class: 'lf-type', type: 'text', spellcheck: 'false', autocomplete: 'off', autocapitalize: 'characters', autocorrect: 'off', enterkeyhint: 'done',
    'aria-label': deal ? 'Add a side' : 'Add a card',
  });
  inp.value = keep.box ?? '';
  const slot = h('span', { class: 'lf-slot' });   // keeps the typing box's room among the entries
  const ghost = h('span', { class: 'lf-ghost', 'aria-hidden': 'true' });
  const drop = h('span', { class: 'lf-drop', 'aria-hidden': 'true' });
  const area = h('textarea', { class: 'lf-textarea', spellcheck: 'false', autocomplete: 'off', autocapitalize: 'characters', autocorrect: 'off', rows: 3, 'aria-label': deal ? 'Deal to, as text' : 'Deck, as text' });
  const selLayer = h('span', { class: 'lf-sel-layer', 'aria-hidden': 'true' });
  const wrap = h('div', { class: 'lf-text' }, box, inp, drop, area);
  const status = h('span', { class: 'lf-status' });
  const views = h('span', { class: 'seg lf-views', role: 'group', 'aria-label': 'Show the list as' });
  const ctx = h('div', { class: 'lf-ctx' });

  // ---------- drawing ----------
  function face(t) {
    if (deal) return h('span', { class: 'lf-side', style: `--c: ${SIDE_COLOURS[t.val]}` }, arrowEl(t.val), SIDE_TEXT[t.val]);
    const v = t.val;
    if (v.t === 'card') return cardEl(v.c);
    if (v.t === 'deck') return h('span', { class: 'lf-deck' }, 'DECK');
    return [cardEl(v.a + v.s), h('span', { class: 'lf-dash' }, '–'), cardEl(v.b + v.s)];
  }
  function title(t) {
    if (t.err) return t.err;
    if (deal) return `Deal to ${SIDE_TEXT[t.val]}`;
    const v = t.val;
    if (v.t === 'card') return cardName(v.c);
    if (v.t === 'deck') return 'A new deck: A–K♠, A–K♦, K–A♣, K–A♥';
    const n = Math.abs(RANKS.indexOf(v.a) - RANKS.indexOf(v.b)) + 1;
    return `${rankText(v.a)}${SUIT_GLYPH[v.s]} to ${rankText(v.b)}${SUIT_GLYPH[v.s]} (${n} cards)`;
  }
  const countTag = (t) => (t.counted ? h('span', { class: 'lf-n' }, `×${t.n}`) : null);
  function chip(t, i) {
    if (t.kind === 'bad' || t.val == null) return h('span', { class: 'lf-e bad', 'data-i': i, title: t.err ?? '' }, t.text);
    return h('span', { class: `lf-e${t.err ? ' bad' : ''}`, 'data-i': i, title: title(t) }, face(t), countTag(t));
  }
  // A group (by its opening or its count): its frame and its count.
  const groupOf = (i) => els[i]?.closest('.lf-gwrap');
  const frameOf = (i) => groupOf(i)?.querySelector('.lf-group');
  // The boxes a token's unit is drawn in: an entry's, or a group's frame
  // (a box a line) and its count.
  function unitRects(i) {
    if ((toks[i].kind === 'open' || toks[i].kind === 'close') && frameOf(i)) {
      const j = matching(toks, i);
      const c = toks[i].kind === 'close' ? i : j;
      return [...frameOf(i).getClientRects(), ...(c >= 0 && els[c] ? [els[c].getBoundingClientRect()] : [])];
    }
    return els[i] ? [els[i].getBoundingClientRect()] : [];
  }
  // Where gap g is: { x, top, bottom } (on screen).
  function gapRect(g) {
    const line = (r, x) => ({ x, top: r.top, bottom: r.bottom });
    if (g > 0) {
      const t = toks[g - 1];
      if (t.kind === 'close' && frameOf(g - 1)) {
        const f = [...frameOf(g - 1).getClientRects()].at(-1), c = els[g - 1].getBoundingClientRect();
        return line(f, c.right);
      }
      if (t.kind === 'open' && frameOf(g - 1)) {
        const f = frameOf(g - 1).getClientRects()[0];
        return line(f, els[g - 1].getBoundingClientRect().right);
      }
      const r = els[g - 1].getBoundingClientRect();
      return line(r, r.right);
    }
    if (toks.length) {
      const r = toks[0].kind === 'open' && frameOf(0) ? frameOf(0).getClientRects()[0] : els[0].getBoundingClientRect();
      return line(r, r.left);
    }
    const b = box.getBoundingClientRect();
    return { x: b.left + 8, top: b.top, bottom: b.bottom };
  }
  // The gap on the line above (dir -1) or below (1) gap g, nearest across;
  // off the top or the bottom, the start or the end.
  function lineFrom(g, dir) {
    const r = gapRect(g), lh = parseFloat(getComputedStyle(box).lineHeight) || 40;
    const y = (r.top + r.bottom) / 2 + dir * lh;
    const b = box.getBoundingClientRect();
    if (y < b.top || y > b.bottom) return dir < 0 ? 0 : toks.length;
    const to = gapNear(r.x, y);
    const t = gapRect(to);
    return Math.abs((t.top + t.bottom) / 2 - (r.top + r.bottom) / 2) < lh / 2 ? (dir < 0 ? 0 : toks.length) : to;
  }
  function render() {
    ({ toks, list, error } = read(text));
    caret = Math.min(caret, toks.length);
    els = [];
    const out = [];
    const stack = [out];
    const add = (node) => (Array.isArray(stack.at(-1)) ? stack.at(-1).push(node) : stack.at(-1).append(node));
    toks.forEach((t, i) => {
      if (t.kind === 'open') {
        els[i] = h('span', { class: 'lf-open', 'data-i': i, title: 'A repeated group' });
        const g = h('span', { class: 'lf-group' }, els[i]);
        add(h('span', { class: 'lf-gwrap' }, g));
        stack.push(g);
      } else if (t.kind === 'close' && stack.length > 1) {
        const g = stack.pop();
        // The count, after the frame (so it can't be taken for the last
        // entry's), on the line where the frame ends (style.css).
        els[i] = h('span', { class: `lf-n lf-gn${t.counted ? '' : ' one'}${t.err ? ' bad' : ''}`, 'data-i': i, title: t.err ?? 'Repeats the group' }, `×${t.n}`);
        g.after(els[i]);
        // The group's opening stays on the line of its first entry (a line
        // never ends on an empty frame).
        const [open, ...kids] = g.children;
        if (kids.length) g.replaceChildren(h('span', { class: 'lf-start' }, open, kids[0]), ...kids.slice(1));
      } else {
        els[i] = chip(t, i);
        add(els[i]);
      }
    });
    while (stack.length > 1) stack.pop().classList.add('bad'); // never closed
    box.replaceChildren(...out);
    el.dataset.text = text; // (for tests)
    if (sel) {
      for (let i = sel.a; i < sel.b; i++) {
        if (toks[i].kind === 'open') groupOf(i)?.classList.add('sel');
        else els[i]?.classList.add('sel');
      }
    }
    box.classList.toggle('empty', !toks.length);
    if (!toks.length) box.append(h('span', { class: 'lf-empty' }, deal ? 'No sides yet' : 'No cards: the shoe deals nothing'));
    box.prepend(selLayer);
    placeBox();
    renderBar();
  }
  // The selection: one frame a line round the entries it holds.
  function drawSel() {
    selLayer.replaceChildren();
    if (!sel || mode !== 'cards') return;
    const rects = [];
    for (let i = sel.a; i < sel.b; i++) {
      if (toks[i].kind === 'close') continue;
      rects.push(...unitRects(i));
      if (toks[i].kind === 'open') i = Math.max(i, matching(toks, i));
    }
    const lines = [];
    for (const r of [...rects].sort((p, q) => p.top - q.top)) {
      const mid = (r.top + r.bottom) / 2;
      const l = lines.find((n) => mid > n.top && mid < n.bottom);
      if (l) Object.assign(l, { left: Math.min(l.left, r.left), right: Math.max(l.right, r.right), top: Math.min(l.top, r.top), bottom: Math.max(l.bottom, r.bottom) });
      else lines.push({ left: r.left, right: r.right, top: r.top, bottom: r.bottom });
    }
    // A selection over several lines runs on to the field's edge, open
    // there, as one frame broken across the lines.
    const b = box.getBoundingClientRect(), pad = 4 * uiScale();
    const lh = parseFloat(getComputedStyle(box).lineHeight) || 40;
    const inL = b.left + box.clientLeft + 2, inR = b.left + box.clientLeft + box.clientWidth - 2;
    const vpad = (l) => Math.max(0, Math.min(pad, (lh - (l.bottom - l.top)) / 2 - 1));
    lines.forEach((l, j) => {
      const openL = j > 0, openR = j < lines.length - 1;
      const left = openL ? inL : l.left - pad, right = openR ? inR : l.right + pad;
      selLayer.append(h('span', { class: `lf-selbox${openL ? ' open-l' : ''}${openR ? ' open-r' : ''}`, style: {
        // (Above and below, no further than keeps it off the next line's.)
        left: `${left - b.left - box.clientLeft}px`, top: `${l.top - b.top - box.clientTop - vpad(l)}px`,
        width: `${right - left}px`, height: `${l.bottom - l.top + 2 * vpad(l)}px`,
      } }));
    });
  }
  // Puts `node` in gap g among the entries.
  function putAt(node, g) {
    if (g === 0) { box.prepend(node); return; }
    const t = toks[g - 1], el = els[g - 1];
    if (t.kind === 'close' && groupOf(g - 1)) groupOf(g - 1).after(node);
    else if (t.kind === 'open' && groupOf(g - 1)) groupOf(g - 1).querySelector('.lf-open').after(node);
    else el.after(node);
  }
  // The typing box: drawn over a slot among the entries while the field has
  // the focus, or while it holds text. (It stays where it is in the page: an
  // input moved in the page loses the focus, and a phone its keyboard.)
  const typing = () => document.activeElement === inp;
  function placeBox() {
    const text = inp.value;
    const shown = mode === 'cards' && !sel && (typing() || text);
    inp.classList.toggle('on', !!shown);
    inp.classList.toggle('filled', !!text);
    slot.remove(); ghost.remove();
    drawSel();
    if (!shown) { inp.style.left = inp.style.top = ''; return; }
    inp.style.width = text ? `calc(${text.length}ch + 0.75rem + ${4 * uiScale()}px)` : '';
    putAt(slot, caret);
    slot.style.width = `${inp.offsetWidth}px`;
    const r = slot.getBoundingClientRect(), w = wrap.getBoundingClientRect();
    const left = r.left - w.left, top = r.top - w.top + (r.height - inp.offsetHeight) / 2;
    inp.style.left = `${left}px`;
    inp.style.top = `${top}px`;
    // What it will add, over it (beside it, it would look added already).
    const prev = ghostFor(text);
    if (prev) {
      ghost.replaceChildren(...prev);
      wrap.append(ghost);
      const gw = ghost.offsetWidth;
      ghost.style.left = `${Math.max(0, Math.min(wrap.clientWidth - gw, left + inp.offsetWidth / 2 - gw / 2))}px`;
      ghost.style.top = `${top - ghost.offsetHeight - 3 * uiScale()}px`;
    }
  }
  // What the typing box's text will add, drawn over it.
  function ghostFor(t) {
    const s = t.trim();
    if (!s || COUNT_ONLY.test(s)) return null;
    const r = read(s);
    if (r.error) return null;
    if (r.toks.length === 1 && r.toks[0].kind === 'item') return [face(r.toks[0]), countTag(r.toks[0])].flat().filter(Boolean);
    return [h('span', { class: 'lf-ghost-n' }, `+${r.list.length}`)];
  }

  // ---------- the status line and the bar under it ----------
  const cardsIn = (a, b) => read(text.slice(toks[a].s, toks[b - 1].e)).list?.length ?? 0;
  const entriesIn = (a, b) => {
    let n = 0;
    for (let i = a; i < b; i++) {
      if (toks[i].kind === 'open') { n++; i = Math.max(i, matching(toks, i)); } else if (toks[i].kind !== 'close') n++;
    }
    return n;
  };
  // The group whose brackets are tokens o and c, if sel is exactly that.
  const selGroup = () => (sel && toks[sel.a]?.kind === 'open' && matching(toks, sel.a) === sel.b - 1 ? sel.a : -1);
  function renderBar() {
    const shownError = flash ?? (mode === 'text' ? (draft !== null ? read(draft).error : null) : boxShownError()) ?? error;
    status.className = `lf-status${shownError ? ' bad' : ''}`;
    const n = (mode === 'text' && draft !== null ? read(draft).list : list)?.length ?? 0;
    status.textContent = shownError ?? (deal ? (n ? `${n} card${n === 1 ? '' : 's'}, then again` : 'No sides: drops every card') : n ? `${n} card${n === 1 ? '' : 's'}` : 'Empty: deals nothing');
    const textBad = mode === 'text' && draft !== null && !!read(draft).error;
    views.replaceChildren(
      h('button', {
        class: mode === 'cards' ? 'on' : '', 'data-view': 'cards', onpointerdown: noFocus, disabled: textBad,
        title: textBad ? 'Put the mistake right first (Esc in the text puts the list back)' : undefined, onclick: () => setMode('cards'),
      }, deal ? 'Sides' : 'Cards'),
      h('button', { class: mode === 'text' ? 'on' : '', 'data-view': 'text', onpointerdown: noFocus, onclick: () => setMode('text') }, 'Text'));
    renderCtx();
  }
  // A count: ×1 to ×999 (its number can be typed).
  const counter = (n, onSet, title = 'How many times') => stepper(n, { min: 1, max: MAX_COUNT, prefix: '×', onSet, title, cls: 'lf-step' });
  const delBtn = (what) => h('button', { class: 'lf-del', title: `Remove ${what}`, 'aria-label': `Remove ${what}`, onpointerdown: noFocus, onclick: removeSel }, '✕');
  function renderCtx() {
    if (mode === 'text') {
      ctx.replaceChildren(h('span', { class: 'lf-hint' }, 'The list as text. Leaving the box puts it into the list; Esc puts the list back.'));
      return;
    }
    // The hint stays under a selection's bar, unseen, so the bar is as tall
    // as the hint is.
    const hint = h('span', { class: `lf-hint${sel ? ' under' : ''}` }, deal
      ? `${ClickWord()} a side to add it; ${clickWord()} it again to deal there twice in a row.`
      : `${ClickWord()} a card to add it; ${clickWord()} it again for two. Drag along a suit for a run, or corner to corner for a new deck.`);
    const bar = (...xs) => ctx.replaceChildren(hint, h('div', { class: 'lf-ctx-bar' }, ...xs));
    const g = selGroup();
    if (sel && sel.b - sel.a === 1 && toks[sel.a].kind === 'item' && toks[sel.a].val != null) {
      const t = toks[sel.a];
      bar(h('span', { class: 'lf-ctx-chip' }, face(t)), counter(t.n, (k) => edit(setCount(text, toks[sel.a], k), { sel: { ...sel } })), delBtn('it'));
    } else if (g >= 0) {
      // A group's count; down to 1, the group goes (its entries stay selected).
      const c = toks[sel.b - 1], e = entriesIn(g + 1, sel.b - 1);
      bar(
        h('span', { class: 'lf-ctx-n' }, `A group of ${e} entr${e === 1 ? 'y' : 'ies'}, ${cardsIn(g, sel.b)} cards in all`),
        counter(c.n, (k) => {
          if (k > 1) { edit(setCount(text, toks[sel.b - 1], k), { sel: { ...sel } }); return; }
          const { a, b } = sel;
          edit(ungroup(text, toks, a), b - 2 > a ? { sel: { a, b: b - 2 } } : { caret: a });
        }, 'How many times the group is repeated (1: not a group)'),
        delBtn('the group'));
    } else if (sel) {
      // Several entries: 1, as they are; more, repeated as a group.
      const e = entriesIn(sel.a, sel.b);
      bar(
        h('span', { class: 'lf-ctx-n' }, `${e} entr${e === 1 ? 'y' : 'ies'}, ${cardsIn(sel.a, sel.b)} cards`),
        counter(1, (k) => {
          if (k < 2 || !group()) return;
          if (k > 2) edit(setCount(text, toks[sel.b - 1], k), { sel: { ...sel } });
        }, 'Repeat these as a group'),
        delBtn('them'));
    } else ctx.replaceChildren(hint);
  }

  // ---------- changes ----------
  // next: { text } from a listtext.js edit (or null: no change). The caret or
  // selection afterwards: `sel`, else `caret` (a gap), else the edit's caret.
  // A change that doesn't read as a list isn't made (it is shown instead).
  function edit(next, after = {}) {
    if (!next) return false;
    const r = read(next.text);
    if (r.error) { flash = r.error; renderBar(); return false; }
    flash = null;
    const before = text;
    text = next.text;
    sel = after.sel ?? null;
    caret = after.caret ?? (next.caret !== undefined ? gapAt(r.toks, next.caret) : caret);
    render();
    if (text !== before) onEdit?.({ text, list: r.list });
    return true;
  }
  const removeSel = () => {
    if (!sel) return;
    const a = sel.a;
    // (The focus stays where it was: on a phone, the keyboard stays down.)
    edit(removeRange(text, toks[sel.a].s, toks[sel.b - 1].e), { caret: a });
  };
  // ( )×2: the selection, or the entry (or group) just before the caret.
  function group() {
    let a, b;
    if (sel) ({ a, b } = sel);
    else if (toks[caret - 1]?.kind === 'item') [a, b] = [caret - 1, caret];
    else if (toks[caret - 1]?.kind === 'close' && matching(toks, caret - 1) >= 0) [a, b] = [matching(toks, caret - 1), caret];
    else return;
    const r = wrapGroup(text, toks, toks[a].s, toks[b - 1].e);
    return !!r && edit(r, { sel: { a, b: b + 2 } });
  }
  // A tap on the pad (or from outside: the Deal's side keys, the port menu).
  function tap(entry) {
    if (mode === 'text') {
      const at = document.activeElement === area ? area.selectionEnd : (draft ?? text).length;
      const r = tapEntry(kind, draft ?? text, at, entry);
      area.value = r.text;
      draft = r.text;
      if (document.activeElement === area) area.setSelectionRange(r.caret, r.caret);
      else applyDraft();
      fitArea();
      renderBar();
      return;
    }
    commitBox();
    if (sel && sel.b - sel.a === 1 && toks[sel.a].kind === 'item') {
      const add = lexList(kind, entry);
      if (add.length === 1 && JSON.stringify(add[0].val) === JSON.stringify(toks[sel.a].val)) {
        edit(setCount(text, toks[sel.a], toks[sel.a].n + 1), { sel: { ...sel } });
        return;
      }
    }
    if (sel) { caret = sel.b; sel = null; }
    edit(tapAt(kind, text, caret, entry));
  }

  // ---------- the typing box ----------
  // Whether t is still being written: a group not yet closed.
  const partial = (t) => (t.match(/\(/g)?.length ?? 0) > (t.match(/\)/g)?.length ?? 0);
  // What adding the box's text would make of the list: { next, error }.
  function boxResult() {
    // (Upper case, as the pad writes it: in the list, and in a mistake.)
    const s = inp.value.trim().toUpperCase();
    if (!s) return null;
    const m = COUNT_ONLY.exec(s);
    if (m) {
      const t = toks[caret - 1];
      if (t && (t.kind === 'item' || (t.kind === 'close' && matching(toks, caret - 1) >= 0))) {
        return { next: setCount(text, t, Number(m[1])) };
      }
      return { error: 'A count goes straight after an entry (NEx3, or (E W)x3)' };
    }
    const own = read(s);
    if (own.error) return { error: own.error };
    const next = insertAt(text, gapOffset(text, toks, caret), tidyText(kind, s, 0).text);
    const all = read(next.text);
    return all.error ? { error: all.error } : { next };
  }
  const boxError = () => boxResult()?.error ?? null;
  // (Shown once adding it has failed, not while it is being typed.)
  const boxShownError = () => (inp.value.trim() && inp.classList.contains('bad') ? boxError() : null);
  // Adds what is in the box; false (and it stays) when it isn't an entry.
  function commitBox() {
    const r = boxResult();
    if (!r) { inp.value = ''; return true; }
    if (r.error) { inp.classList.add('bad'); renderBar(); return false; }
    inp.value = '';
    edit(r.next);
    return true;
  }
  inp.addEventListener('input', () => {
    // A space or comma ends an entry (unless a group is still open), and so
    // does a line break pasted in.
    const v = inp.value;
    if (/[\s,]$/.test(v) && !partial(v)) {
      inp.value = v.replace(/[\s,]+$/, '');
      if (inp.value) commitBox();
    }
    if (!/[\s,]$/.test(v) || partial(v)) inp.classList.remove('bad');
    placeBox();
    renderBar();
  });
  inp.addEventListener('paste', (e) => {
    const t = e.clipboardData?.getData('text/plain');
    if (t == null) return;
    e.preventDefault();
    const s = inp.selectionStart ?? inp.value.length, en = inp.selectionEnd ?? s;
    inp.value = `${inp.value.slice(0, s)}${t.replace(/\s+/g, ' ').trim()}${inp.value.slice(en)}`;
    if (!partial(inp.value)) commitBox();
    placeBox();
    renderBar();
  });
  inp.addEventListener('keydown', (e) => {
    const k = e.key, empty = !inp.value;
    if (undoKeys(e, empty)) return;
    if (k === 'Enter') { e.preventDefault(); if (!empty) { commitBox(); placeBox(); renderBar(); } return; }
    if (k === 'Escape') { e.preventDefault(); if (!empty) { inp.value = ''; placeBox(); renderBar(); } else inp.blur(); return; }
    // Off either end of what is typed: added, as by a space (with the
    // caret before it, off the left end).
    const atEnd = inp.selectionStart === inp.selectionEnd && inp.selectionEnd === inp.value.length;
    const atStart = inp.selectionStart === 0 && inp.selectionEnd === 0;
    if (!empty && !partial(inp.value) && (k === 'ArrowUp' || k === 'ArrowDown')) {
      e.preventDefault();
      if (!commitBox()) return;
      caret = lineFrom(caret, k === 'ArrowUp' ? -1 : 1);
      placeBox();
      renderBar();
      return;
    }
    if (!empty && !e.shiftKey && !partial(inp.value) && ((k === 'ArrowRight' && atEnd) || (k === 'ArrowLeft' && atStart))) {
      e.preventDefault();
      const g = caret;
      // (A count goes onto the entry or group before the caret: off the left
      // end, the caret goes before that count, which is inside the group,
      // after its last entry, or before the entry.)
      const count = COUNT_ONLY.test(inp.value.trim());
      if (commitBox() && k === 'ArrowLeft') caret = count ? Math.max(0, g - 1) : g;
      placeBox();
      renderBar();
      return;
    }
    if (!empty) return;
    if ((e.ctrlKey || e.metaKey) && k.toLowerCase() === 'a') { e.preventDefault(); if (toks.length) select(0, toks.length); return; }
    if (k === 'Backspace' || k === 'Delete') {
      e.preventDefault();
      const i = k === 'Backspace' ? caret - 1 : caret;
      const t = toks[i];
      if (!t) return;
      // Backspace after an entry's count takes just the count; after a
      // group's, the group's brackets (its entries stay).
      if (k === 'Backspace' && t.counted && t.kind === 'item') edit(setCount(text, t, 1), { caret });
      else if (k === 'Backspace' && t.counted && t.kind === 'close' && matching(toks, i) >= 0) edit(ungroup(text, toks, i));
      else if (t.kind === 'item' || t.kind === 'bad' || matching(toks, i) < 0) edit(removeRange(text, t.s, t.e), { caret: i });
      else { caret = k === 'Backspace' ? caret - 1 : caret + 1; placeBox(); } // into or out of a group
      return;
    }
    if (k === 'ArrowLeft' || k === 'ArrowRight' || k === 'Home' || k === 'End' || k === 'ArrowUp' || k === 'ArrowDown') {
      e.preventDefault();
      const to = k === 'Home' ? 0 : k === 'End' ? toks.length : k === 'ArrowUp' || k === 'ArrowDown' ? lineFrom(caret, k === 'ArrowUp' ? -1 : 1)
        : Math.max(0, Math.min(toks.length, caret + (k === 'ArrowLeft' ? -1 : 1)));
      if (e.shiftKey && to !== caret) { anchor = caret; selectGaps(anchor, to); return; }
      caret = to;
      placeBox();
    }
  });
  inp.addEventListener('focus', () => { sel = null; render(); });
  inp.addEventListener('blur', () => {
    if (!inp.isConnected) return;
    commitBox();
    placeBox();
    renderBar();
  });
  // Ctrl+Z and Ctrl+Y (with nothing being typed: the box's own undo first).
  function undoKeys(e, ours = true) {
    const k = e.key.toLowerCase();
    if (!(e.ctrlKey || e.metaKey) || (k !== 'z' && k !== 'y')) return false;
    if (!ours) return true;
    e.preventDefault();
    if (k === 'y' || e.shiftKey) onRedo?.(); else onUndo?.();
    return true;
  }

  // ---------- selection ----------
  function select(a, b) {
    [a, b] = balance(toks, a, b);
    sel = { a, b };
    render();
    if (document.activeElement !== box) box.focus({ preventScroll: true });
  }
  // The entries between two gaps.
  function selectGaps(g1, g2) {
    const [a, b] = [Math.min(g1, g2), Math.max(g1, g2)];
    if (a === b) { sel = null; caret = a; render(); return; }
    select(a, b);
  }
  function collapse(to) {
    sel = null;
    caret = to;
    render();
    focusBox();
  }
  function focusBox() { inp.focus({ preventScroll: true }); placeBox(); }
  box.addEventListener('keydown', (e) => {
    if (e.target !== box) return;
    const k = e.key;
    if (undoKeys(e)) return;
    if (!sel) {
      // Nothing selected (one was just removed): over to the typing box.
      if (k.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); focusBox(); inp.value = k; inp.dispatchEvent(new Event('input')); } else if (/^(Arrow|Home|End|Backspace|Delete)/.test(k)) {
        e.preventDefault();
        focusBox();
        inp.dispatchEvent(new KeyboardEvent('keydown', { key: k, shiftKey: e.shiftKey, ctrlKey: e.ctrlKey, metaKey: e.metaKey }));
      }
      return;
    }
    if (k === 'Backspace' || k === 'Delete') { e.preventDefault(); removeSel(); return; }
    if (k === 'Escape') { e.preventDefault(); collapse(sel.b); return; }
    if (k === '(' || k === ')') { e.preventDefault(); group(); return; }
    if (k === 'ArrowUp' || k === 'ArrowDown') {
      e.preventDefault();
      const dir = k === 'ArrowUp' ? -1 : 1;
      if (e.shiftKey) {
        if (anchor === null) anchor = sel.a;
        const head = anchor === sel.a ? sel.b : sel.a;
        selectGaps(anchor, lineFrom(head, dir));
        if (!sel) focusBox();
        return;
      }
      collapse(lineFrom(dir < 0 ? sel.a : sel.b, dir));
      return;
    }
    if ((e.ctrlKey || e.metaKey) && k.toLowerCase() === 'a') { e.preventDefault(); select(0, toks.length); return; }
    if (k === 'ArrowLeft' || k === 'ArrowRight' || k === 'Home' || k === 'End') {
      e.preventDefault();
      if (e.shiftKey) {
        if (anchor === null) anchor = sel.a;
        const head = anchor === sel.a ? sel.b : sel.a;
        const to = k === 'Home' ? 0 : k === 'End' ? toks.length : Math.max(0, Math.min(toks.length, head + (k === 'ArrowLeft' ? -1 : 1)));
        selectGaps(anchor, to);
        if (!sel) focusBox();
        return;
      }
      collapse(k === 'ArrowLeft' || k === 'Home' ? (k === 'Home' ? 0 : sel.a) : (k === 'End' ? toks.length : sel.b));
      return;
    }
    if (k.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      // Typing goes after the selection.
      e.preventDefault();
      collapse(sel.b);
      inp.value = k;
      inp.dispatchEvent(new Event('input'));
    }
  });
  // Copy, cut and paste the selection as text.
  const selText = () => text.slice(toks[sel.a].s, toks[sel.b - 1].e).replace(/\s+/g, ' ');
  box.addEventListener('copy', (e) => { if (!sel) return; e.preventDefault(); e.clipboardData.setData('text/plain', selText()); });
  box.addEventListener('cut', (e) => { if (!sel) return; e.preventDefault(); e.clipboardData.setData('text/plain', selText()); removeSel(); });
  box.addEventListener('paste', (e) => {
    const t = e.clipboardData?.getData('text/plain');
    if (!sel || t == null) return;
    e.preventDefault();
    const r = removeRange(text, toks[sel.a].s, toks[sel.b - 1].e);
    const next = insertAt(r.text, r.caret, t.replace(/\s+/g, ' ').trim());
    if (edit(next, { caret: gapAt(lexList(kind, next.text), next.caret) })) focusBox();
  });

  // ---------- pointing: caret, selection and moving ----------
  // The entries' elements, for finding the gap nearest a point (`skip`: a
  // range of tokens being moved).
  function gapNear(x, y, skip = null) {
    const near = [];
    els.forEach((el, i) => {
      if (!el || (skip && i >= skip.a && i < skip.b)) return;
      const r = el.getBoundingClientRect();
      near.push({ i, r, dy: y < r.top ? r.top - y : y > r.bottom ? y - r.bottom : 0 });
    });
    if (!near.length) return 0;
    // The row nearest the point, then the entry along it.
    const dy = Math.min(...near.map((n) => n.dy));
    let best = null, bd = Infinity;
    for (const n of near) {
      if (n.dy > dy + 2) continue;
      const dx = x < n.r.left ? n.r.left - x : x > n.r.right ? x - n.r.right : 0;
      if (dx < bd) { bd = dx; best = n; }
    }
    return best.i + (x > best.r.left + best.r.width / 2 ? 1 : 0);
  }
  // The tokens a press on an element stands for: an entry, or a whole group
  // (by its count). A group's frame is like the field's background: a tap
  // there puts the caret in the group.
  function unitAt(target, x) {
    const el = target.closest?.('[data-i]');
    if (!el || !box.contains(el) || el.classList.contains('lf-open')) return null;
    // Near an entry's sides is the gap beside it (the caret is easier to place).
    if (el.classList.contains('lf-e')) {
      const r = el.getBoundingClientRect(), edge = Math.min(5 * uiScale(), r.width / 5);
      if (x < r.left + edge || x > r.right - edge) return null;
    }
    const i = +el.dataset.i, j = toks[i].kind === 'close' ? matching(toks, i) : -1;
    return j >= 0 ? { a: j, b: i + 1 } : { a: i, b: i + 1 };
  }
  // Where gap g is drawn: the right edge of the entry before it, or the left
  // edge of the one after.
  function showDrop(g) {
    if (g === null) { drop.classList.remove('on'); return; }
    const w = wrap.getBoundingClientRect(), r = gapRect(g);
    drop.style.left = `${r.x + (g > 0 ? 1 : -3) - w.left}px`;
    drop.style.top = `${r.top - w.top}px`;
    drop.style.height = `${r.bottom - r.top}px`;
    drop.classList.add('on');
  }
  let press = null, float = null;
  function floatOf(a, b) {
    const parts = [];
    for (let i = a; i < b; i++) {
      if (toks[i].kind === 'open' && groupOf(i)) { parts.push(groupOf(i).cloneNode(true)); i = matching(toks, i); } else if (els[i]) parts.push(els[i].cloneNode(true));
    }
    const f = h('div', { class: 'lf-float' }, parts, h('span', { class: 'lf-float-x', 'aria-hidden': 'true' }, '✕'));
    f.querySelectorAll('.sel').forEach((x) => x.classList.remove('sel'));
    document.body.append(f);
    return f;
  }
  box.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || mode !== 'cards') return;
    e.preventDefault();
    box.setPointerCapture?.(e.pointerId);
    // (What is under the point itself: a touch's target can be moved onto an
    // entry beside a gap.)
    press = { id: e.pointerId, x0: e.clientX, y0: e.clientY, unit: unitAt(document.elementFromPoint(e.clientX, e.clientY) ?? e.target, e.clientX), gap: gapNear(e.clientX, e.clientY), moved: false, shift: e.shiftKey, touch: e.pointerType !== 'mouse' };
  });
  box.addEventListener('pointermove', (e) => {
    if (!press || e.pointerId !== press.id) return;
    const far = Math.hypot(e.clientX - press.x0, e.clientY - press.y0) > 6 * uiScale();
    if (!press.moved && !far) return;
    if (!press.moved) {
      press.moved = true;
      commitBox();
      if (press.unit) {
        // Moving: the selection, if this is part of it, else this entry.
        const u = press.unit;
        press.range = sel && u.a >= sel.a && u.b <= sel.b ? { ...sel } : u;
        float = floatOf(press.range.a, press.range.b);
        for (let i = press.range.a; i < press.range.b; i++) (toks[i].kind === 'open' ? groupOf(i) : els[i])?.classList.add('lf-lifted');
      }
    }
    if (press.range) {
      float.style.left = `${e.clientX + 8}px`;
      float.style.top = `${e.clientY - 28 * uiScale()}px`;
      // Outside the field, a drop takes them out.
      const b = box.getBoundingClientRect(), m = 4 * uiScale();
      press.out = e.clientX < b.left - m || e.clientX > b.right + m || e.clientY < b.top - m || e.clientY > b.bottom + m;
      float.classList.toggle('out', press.out);
      const g = press.out ? null : gapNear(e.clientX, e.clientY, press.range);
      press.to = g === null || (g >= press.range.a && g <= press.range.b) ? null : g;
      showDrop(press.to);
    } else {
      selectGaps(press.gap, gapNear(e.clientX, e.clientY));
    }
  });
  function endPress(cancel) {
    const p = press;
    press = null;
    float?.remove();
    float = null;
    showDrop(null);
    if (!p) return;
    if (p.range) {
      if (!cancel && p.out) {
        edit(removeRange(text, toks[p.range.a].s, toks[p.range.b - 1].e), { caret: p.range.a });
        return;
      }
      if (!cancel && p.to != null) {
        const r = moveTokens(kind, text, p.range.a, p.range.b, p.to);
        if (r && edit({ text: r.text }, { sel: { a: r.a, b: r.b } })) { box.focus({ preventScroll: true }); return; }
      }
      render();
      return;
    }
    if (cancel) return;
    if (p.moved) { if (sel) box.focus({ preventScroll: true }); else focusBox(); return; }
    commitBox();
    anchor = null;
    if (p.unit) {
      if (p.shift && (sel || typing())) {
        const from = sel ? sel.a : caret;
        selectGaps(Math.min(from, p.unit.a), Math.max(sel ? sel.b : caret, p.unit.b));
      } else if (sel && sel.a === p.unit.a && sel.b === p.unit.b) {
        // A second tap: back to the caret, after it.
        sel = null; caret = p.unit.b; render();
        if (!p.touch) focusBox(); else box.focus({ preventScroll: true });
      } else select(p.unit.a, p.unit.b);
      return;
    }
    collapse(p.gap);
  }
  box.addEventListener('pointerup', (e) => { if (press && e.pointerId === press.id) endPress(false); });
  box.addEventListener('pointercancel', () => endPress(true));
  box.addEventListener('lostpointercapture', () => { if (press) endPress(false); });

  // ---------- the Text view ----------
  function fitArea() {
    area.style.height = 'auto';
    area.style.height = `${area.scrollHeight + 2}px`;
  }
  // The Text view's text into the list, when it reads as one (tidied). Not
  // when the field is being taken away (the panel redrawn): the draft goes
  // to the new field instead.
  function applyDraft() {
    if (draft === null) return true;
    if (read(draft).error) return false;
    const t = tidyText(kind, draft.replace(/\r\n?/g, '\n'), 0).text;
    draft = null;
    if (t !== text) edit({ text: t }, { caret: lexList(kind, t).length });
    area.value = text;
    return true;
  }
  area.addEventListener('input', () => { draft = area.value === text ? null : area.value; fitArea(); renderBar(); });
  area.addEventListener('blur', () => { if (area.isConnected && applyDraft()) { area.value = text; fitArea(); renderBar(); } });
  area.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.preventDefault(); draft = null; area.value = text; setMode('cards'); }
  });

  function setMode(m) {
    if (m === mode) return;
    if (mode === 'text' && !applyDraft()) { renderBar(); return; }
    if (mode === 'cards') { commitBox(); inp.value = ''; }
    mode = m;
    sel = null;
    el.classList.toggle('as-text', m === 'text');
    if (m === 'text') { area.value = draft ?? text; requestAnimationFrame(fitArea); fitArea(); }
    render();
    onMode?.(m);
  }

  // ---------- the pad ----------
  let pad;
  if (deal) {
    const side = (d) => h('button', {
      class: 'lf-pad-side', style: `--c: ${SIDE_COLOURS[d]}`, title: `Deal to ${SIDE_TEXT[d]}`, 'aria-label': `Deal to ${SIDE_TEXT[d]}`, 'data-side': d,
      onpointerdown: noFocus, onclick: () => tap(SIDE_TEXT[d]),
    }, arrowEl(d), SIDE_TEXT[d]);
    pad = h('div', { class: 'lf-pad deal' },
      h('div', { class: 'lf-hex' }, h('span'), side(4), side(5), h('span'), side(3), h('span', { class: 'lf-hub', 'aria-hidden': 'true' }, '⬡'), side(0), h('span'), side(2), side(1)));
  } else {
    // A card a tap adds; a drag along its suit adds the run to where it ends
    // (either way up). Keys work by keyboard too (Enter or Space: one card).
    const keys = {};
    const tip = h('span', { class: 'lf-pad-tip', 'aria-live': 'polite' });
    const grid = h('div', { class: 'lf-grid' });
    for (const s of SUITS) {
      for (const r of RANKS) {
        const c = r + s;
        keys[c] = h('button', {
          class: `lf-key${s === 'H' || s === 'D' ? ' red' : ''}`, title: `${rankText(r)}${SUIT_GLYPH[s]}`, 'data-card': c,
          onclick: (e) => { if (e.detail === 0) tap(c); },
        }, h('b', {}, rankText(r)), h('i', {}, SUIT_GLYPH[s]));
        grid.append(keys[c]);
      }
    }
    let run = null; // { s, from, to, id, deck }
    // The pad's corners: a drag from one to the one opposite is a new deck.
    const OPPOSITE = { AS: 'KH', KH: 'AS', KS: 'AH', AH: 'KS' };
    const runKeys = () => {
      if (run.deck) return Object.values(keys);
      const [i, j] = [RANKS.indexOf(run.from), RANKS.indexOf(run.to)];
      return RANKS.slice(Math.min(i, j), Math.max(i, j) + 1).map((r) => keys[r + run.s]);
    };
    const markRun = () => {
      grid.querySelectorAll('.lf-run').forEach((k) => k.classList.remove('lf-run'));
      if (!run) { tip.textContent = ''; return; }
      for (const k of runKeys()) k.classList.add('lf-run');
      const n = runKeys().length;
      tip.textContent = run.deck ? 'A new deck: 52 cards'
        : n > 1 ? `${rankText(run.from)}${SUIT_GLYPH[run.s]} to ${rankText(run.to)}${SUIT_GLYPH[run.s]}: ${n} cards` : '';
    };
    grid.addEventListener('pointerdown', (e) => {
      const k = e.target.closest?.('.lf-key');
      if (!k || e.button !== 0) return;
      e.preventDefault(); // (no focus: a phone's keyboard stays down)
      grid.setPointerCapture?.(e.pointerId);
      const c = k.dataset.card;
      run = { s: c[1], from: c[0], to: c[0], id: e.pointerId };
      markRun();
    });
    grid.addEventListener('pointermove', (e) => {
      if (!run || e.pointerId !== run.id) return;
      const corner = OPPOSITE[run.from + run.s];
      if (corner) {
        const b = keys[corner].getBoundingClientRect();
        const deck = e.clientX >= b.left && e.clientX <= b.right && e.clientY >= b.top && e.clientY <= b.bottom;
        if (deck !== !!run.deck) { run.deck = deck; markRun(); }
        if (deck) return;
      }
      // The key in the run's own row under the pointer's x (clamped to the row).
      let to = run.to;
      for (const r of RANKS) {
        const b = keys[r + run.s].getBoundingClientRect();
        if (e.clientX >= b.left - 1 || r === 'A') to = r;
      }
      if (to !== run.to) { run.to = to; markRun(); }
    });
    const endRun = (cancel) => {
      const r = run;
      run = null;
      markRun();
      if (!r || cancel) return;
      tap(r.deck ? 'deck' : r.from === r.to ? r.from + r.s : `${r.from}${r.s}-${r.to}${r.s}`);
    };
    grid.addEventListener('pointerup', (e) => { if (run && e.pointerId === run.id) endRun(false); });
    grid.addEventListener('pointercancel', () => endRun(true));
    const specialKeys = specials.map((c) => {
      const f = cardEl(c, 'lf-key-sp');
      return h('button', { class: f.className, title: cardName(c), 'data-card': c, onpointerdown: noFocus, onclick: () => tap(c) }, ...f.childNodes);
    });
    pad = h('div', { class: 'lf-pad shoe' },
      grid,
      h('div', { class: 'lf-pad-row' },
        specialKeys,
        tip));
  }

  const el = h('div', { class: `list-field ${kind}${mode === 'text' ? ' as-text' : ''}` },
    wrap,
    h('div', { class: 'lf-bar' }, status, views),
    ctx, pad);
  if (draft !== null) area.value = draft;
  else area.value = text;
  render();
  if (mode === 'text') requestAnimationFrame(fitArea);
  // The field may change width (a phone turned, the panel resized).
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => { placeBox(); if (mode === 'text') fitArea(); }).observe(wrap);

  return {
    el,
    hasFocus: () => el.contains(document.activeElement) && document.activeElement !== el,
    // Focus the field: the Text view's box, the selection or the caret.
    focus() {
      if (mode === 'text') area.focus({ preventScroll: true });
      else if (sel) box.focus({ preventScroll: true });
      else focusBox();
    },
    // What the field is showing, for the field that replaces it.
    state: () => ({ text, caret, sel, box: inp.value, draft }),
    tap,
    // Replace the whole list (X: clear the Deal's list).
    setText(t) {
      if (mode === 'text') { draft = null; area.value = t; }
      edit({ text: t }, { caret: lexList(kind, t).length });
    },
  };
}
