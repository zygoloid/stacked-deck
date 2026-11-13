// The inspector's editor for a Deal's side list and a shoe's deck: a
// multi-line text field (src/ui/listtext.js has the grammar) that paints its
// own text, plus a pad of taps for the same entries and tools to erase and
// move them.
//
// The textarea's own text is invisible; a copy of it underneath is painted
// entry by entry (sides in their colours, cards as little cards, counts in
// gold, mistakes underlined). The copy must lay out exactly as the textarea
// does, so it may only change what keeps every character the same width:
// colours, backgrounds, upper case in a monospace font, and glyph swaps in a
// 1ch box (H→♥, x→×). Those boxes would add line breaks the textarea doesn't
// have, so a painted entry never breaks inside.
//
// Every pad tap writes the text a player would type (a second tap on the same
// entry makes it NEx2), so the shorthand is learned by watching the field.
// Leaving the field tidies each entry into the same form (listtext.js tidyText).
import { h, cardEl, SPECIAL_FACE } from './dom.js';
import {
  readList, tokenAt, setCount, removeRange, moveToken, ungroup, wrapGroup, tapEntry, tidyText, padSpecials, isLoneSpecial, isPadded, SIDE_TEXT, SIDE_ARROWS,
} from './listtext.js';

// One colour per side, E round to NE (the painted Deal list and its pad).
export const SIDE_COLOURS = ['#f2c14e', '#f08a5d', '#e8709f', '#a99af4', '#62b6ea', '#5fd3a0'];
const SUIT_GLYPH = { S: '♠', H: '♥', D: '♦', C: '♣' };
const RANKS = 'A23456789TJQK'.split('');
const SUITS = ['S', 'D', 'C', 'H'];

// kind: 'deal' or 'shoe'. text/caret: what to show. specials: the special
// cards the floor allows. mode: 'type' | 'erase' | 'move'.
// onEdit({ text, caret, list, typed }) after every change (list is null while
// the text has a mistake; typed: it came from typing, not a tap or a tool).
// onUndo/onRedo: Ctrl+Z and Ctrl+Shift+Z / Ctrl+Y in the field. onMode(mode).
export function listField({ kind, text = '', caret = text.length, specials = [], mode = 'type', onEdit, onUndo, onRedo, onMode }) {
  const deal = kind === 'deal';
  const back = h('div', { class: 'lf-back', 'aria-hidden': 'true' });
  const ta = h('textarea', {
    class: 'lf-in', rows: 1, spellcheck: 'false', autocomplete: 'off', autocapitalize: 'characters', autocorrect: 'off',
    'aria-label': deal ? 'Deal to: sides in order' : 'Deck, top first',
  });
  ta.value = text;
  const box = h('div', { class: 'lf-text' }, back, ta);
  const status = h('span', { class: 'lf-status' });
  const tools = h('div', { class: 'seg lf-tools', role: 'group', 'aria-label': 'Tool' });
  const ctx = h('div', { class: 'lf-ctx' });
  let toks = [], list = null, error = null;
  // Keeps focus where it is (so a phone's keyboard doesn't come up for a tap).
  const noFocus = (e) => e.preventDefault();

  // ---------- painting ----------
  const glyph = (ch) => h('span', { class: 'g' }, ch);
  function countPart(t) {
    if (!t.counted) return null;
    const m = /^(\s*)([xX×*])(.*)$/s.exec(t.text.slice(t.be - t.s));
    return h('span', { class: 'lf-n' }, m[1], glyph('×'), m[3]);
  }
  // A rank: T is drawn as a small 10 in one character's width.
  const rankPart = (r) => (/^t$/i.test(r) ? h('span', { class: 'g ten' }, h('i', {}, '1'), h('i', {}, '0')) : r);
  // A card: "KH", "10h", "K♥", "$$", or a bare rank (the "A" of "A-KH");
  // `lead`: the space in front of a one-character card, drawn as part of it.
  function cardPart(str, lead = '') {
    if (SPECIAL_FACE[str]) return h('span', { class: `lf-card ${str[0] === '$' ? 'ad' : 'joker'}` }, lead + str);
    if (/^(10|[A2-9TJQK])$/i.test(str)) return h('span', { class: 'lf-card' }, rankPart(str));
    const suit = str.at(-1);
    const s = { '♠': 'S', '♥': 'H', '♦': 'D', '♣': 'C' }[suit] ?? suit.toUpperCase();
    return h('span', { class: `lf-card${s === 'H' || s === 'D' ? ' red' : ''}` }, rankPart(str.slice(0, -1)), glyph(SUIT_GLYPH[s]));
  }
  function tokenEl(t, i, lead) {
    const entry = t.text.slice(0, t.be - t.s);
    let body;
    if (t.kind === 'bad' || t.val === null) body = h('span', { class: 'lf-bad' }, t.text);
    else if (t.kind !== 'item') body = [h('span', { class: `lf-par${t.err ? ' lf-bad' : ''}` }, entry), countPart(t)];
    else if (deal) body = [h('span', { class: 'lf-side', style: `--c: ${SIDE_COLOURS[t.val]}` }, entry), countPart(t)];
    else if (t.val.t === 'deck') body = [h('span', { class: 'lf-deck' }, entry), countPart(t)];
    else if (t.val.t === 'run' && entry.includes('-')) {
      const k = entry.indexOf('-');
      body = [cardPart(entry.slice(0, k)), h('span', { class: 'lf-dash' }, glyph('–')), cardPart(entry.slice(k + 1)), countPart(t)];
    } else if (t.val.t === 'run') {
      body = [h('span', { class: `lf-card${t.val.s === 'H' || t.val.s === 'D' ? ' red' : ''}` }, glyph(SUIT_GLYPH[t.val.s])), countPart(t)];
    } else body = [cardPart(entry, lead), countPart(t)];
    const el = h('span', { class: `lf-tok${t.err ? ' err' : ''}`, 'data-t': i, title: t.err ?? undefined }, body);
    return el;
  }
  function paint() {
    const text = ta.value;
    ({ toks, list, error } = readList(kind, text, { specials }));
    const out = [];
    let pos = 0;
    toks.forEach((t, i) => {
      // A padded one-character card takes its space into its face.
      const lead = !deal && isLoneSpecial(t) && isPadded(text, t.s) ? ' ' : '';
      if (t.s - lead.length > pos) out.push(text.slice(pos, t.s - lead.length));
      out.push(tokenEl(t, i, lead));
      pos = t.e;
    });
    out.push(text.slice(pos));
    // A last empty line still takes a line's height in the textarea.
    if (!text || text.endsWith('\n')) out.push('​');
    back.replaceChildren(...out);
    fit();
  }
  function fit() {
    ta.style.height = 'auto';
    ta.style.height = `${ta.scrollHeight}px`;
  }

  // ---------- the status line and the entry at the caret ----------
  let at = Math.min(caret, text.length); // the caret, remembered while the field isn't focused
  const currentIndex = () => tokenAt(toks, at);
  function chip(t) {
    if (deal) {
      return h('span', { class: 'lf-chip-side', style: `--c: ${SIDE_COLOURS[t.val]}` }, SIDE_ARROWS[t.val], SIDE_TEXT[t.val]);
    }
    const v = t.val;
    if (v.t === 'card') return cardEl(v.c);
    if (v.t === 'deck') return h('span', { class: 'lf-chip-deck' }, 'new deck');
    return h('span', { class: 'lf-chip-run' }, cardEl(v.a + v.s), '–', cardEl(v.b + v.s));
  }
  function renderStatus() {
    status.className = `lf-status${error ? ' bad' : ''}`;
    const n = list?.length ?? 0;
    status.textContent = error ?? (deal ? (n ? `${n} card${n === 1 ? '' : 's'}, then again` : 'No sides: drops every card') : `${n} card${n === 1 ? '' : 's'}`);
    tools.replaceChildren(...[['type', 'Type'], ['erase', 'Erase'], ['move', 'Move']].map(([m, label]) => h('button', {
      class: mode === m ? 'on' : '', 'data-mode': m, onpointerdown: noFocus, onclick: () => setMode(m),
    }, label)));
    if (mode !== 'type') {
      ctx.replaceChildren(h('span', { class: 'lf-hint' }, mode === 'erase'
        ? 'Tap an entry to erase it, or drag across several.' : 'Drag an entry to move it.'));
      return;
    }
    const i = currentIndex();
    const t = toks[i];
    if (!t || t.err || (t.kind === 'item' && t.val == null)) {
      ctx.replaceChildren(h('span', { class: 'lf-hint' }, deal
        ? 'Tap a side to add it; tap it again to deal there twice in a row.'
        : 'Tap a card to add it; tap it again for two. A suit adds all thirteen.'));
      return;
    }
    const counted = t.kind !== 'open';
    ctx.replaceChildren(
      t.kind === 'item' ? chip(t) : h('span', { class: 'lf-chip-par' }, t.kind === 'open' ? '(' : ')'),
      h('code', {}, t.text),
      counted ? h('span', { class: 'lf-step' },
        h('button', { 'aria-label': 'One fewer', title: 'One fewer', onpointerdown: noFocus, disabled: t.n <= 1, onclick: () => apply(() => setCount(ta.value, toks[i], t.n - 1)) }, '−'),
        h('span', {}, t.n),
        h('button', { 'aria-label': 'One more', title: 'One more', onpointerdown: noFocus, onclick: () => apply(() => setCount(ta.value, toks[i], t.n + 1)) }, '+')) : null,
      h('button', {
        class: 'lf-del', title: t.kind === 'item' ? 'Remove' : 'Remove the brackets (keep what is in them)', 'aria-label': 'Remove', onpointerdown: noFocus,
        onclick: () => apply(() => (t.kind === 'item' ? removeRange(ta.value, t.s, t.e) : ungroup(ta.value, toks, i))),
      }, '✕'));
  }

  // ---------- changes ----------
  function setText(next, typed = false) {
    ta.value = next.text;
    at = Math.min(next.caret, next.text.length);
    if (document.activeElement === ta) ta.setSelectionRange(at, at);
    paint();
    renderStatus();
    onEdit?.({ text: ta.value, caret: at, list, typed });
  }
  // An edit by the pad or a tool (typing is left as typed): one-character
  // cards get their space, so they draw as wide as the rest.
  function apply(fn) {
    let next = fn();
    if (next && !deal) next = padSpecials(next.text, next.caret);
    if (next && (next.text !== ta.value || next.caret !== at)) setText(next);
  }
  function setMode(m) {
    mode = m;
    el.classList.toggle('erasing', m === 'erase');
    el.classList.toggle('moving', m === 'move');
    ta.readOnly = m !== 'type';
    if (m !== 'type') ta.blur();
    renderStatus();
    onMode?.(m);
  }
  const tap = (entry) => () => { if (mode !== 'type') setMode('type'); apply(() => tapEntry(kind, ta.value, at, entry)); };
  const group = () => apply(() => {
    const [a, b] = document.activeElement === ta ? [ta.selectionStart, ta.selectionEnd] : [at, at];
    return wrapGroup(ta.value, toks, a, b);
  });

  ta.addEventListener('input', () => { at = ta.selectionEnd; paint(); renderStatus(); onEdit?.({ text: ta.value, caret: at, list, typed: true }); });
  const track = () => { if (document.activeElement === ta && ta.selectionEnd !== at) { at = ta.selectionEnd; renderStatus(); } };
  ta.addEventListener('keyup', track);
  ta.addEventListener('pointerup', track);
  ta.addEventListener('select', track);
  ta.addEventListener('focus', track);
  ta.addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    if ((e.ctrlKey || e.metaKey) && (k === 'z' || k === 'y')) {
      e.preventDefault();
      if (k === 'y' || e.shiftKey) onRedo?.(); else onUndo?.();
    } else if (e.key === 'Escape') ta.blur();
  });
  // Leaving the field tidies what was typed (it reads as the same list, so
  // this isn't an edit of the croupier). Not when the field is being taken
  // away (the panel redrawn).
  ta.addEventListener('blur', () => {
    if (!ta.isConnected) return;
    apply(() => tidyText(kind, ta.value, at));
  });
  // The textarea may change width (a phone turned, the panel resized).
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(fit).observe(box);

  // ---------- the pad ----------
  let pad;
  const groupBtn = h('button', { class: 'btn small lf-group', title: 'Repeat the selected entries (or the one at the caret) as a group', onpointerdown: noFocus, onclick: group }, '( )×2');
  if (deal) {
    const side = (d) => h('button', {
      class: 'lf-pad-side', style: `--c: ${SIDE_COLOURS[d]}`, title: `Deal to ${SIDE_TEXT[d]}`, 'aria-label': `Deal to ${SIDE_TEXT[d]}`, 'data-side': d,
      onpointerdown: noFocus, onclick: tap(SIDE_TEXT[d]),
    }, SIDE_ARROWS[d], SIDE_TEXT[d]);
    pad = h('div', { class: 'lf-pad deal' },
      h('div', { class: 'lf-hex' }, h('span'), side(4), side(5), h('span'), side(3), h('span', { class: 'lf-hub', 'aria-hidden': 'true' }, '⬡'), side(0), h('span'), side(2), side(1)),
      groupBtn);
  } else {
    let up = true; // a suit button's order: A to K, or K to A
    const order = h('span', { class: 'seg lf-order', title: 'Which way a suit button runs' });
    const renderOrder = () => order.replaceChildren(
      h('button', { class: up ? 'on' : '', onpointerdown: noFocus, onclick: () => { up = true; renderOrder(); } }, 'A→K'),
      h('button', { class: up ? '' : 'on', onpointerdown: noFocus, onclick: () => { up = false; renderOrder(); } }, 'K→A'));
    renderOrder();
    const grid = [];
    for (const s of SUITS) {
      grid.push(h('button', {
        class: `lf-suit${s === 'H' || s === 'D' ? ' red' : ''}`, title: `Every ${SUIT_GLYPH[s]}`, 'aria-label': `Every ${SUIT_GLYPH[s]}`, 'data-suit': s,
        onpointerdown: noFocus, onclick: () => tap(up ? `A${s}-K${s}` : `K${s}-A${s}`)(),
      }, SUIT_GLYPH[s]));
      for (const r of RANKS) {
        const face = cardEl(r + s, 'lf-key');
        grid.push(h('button', { class: face.className, title: `${r === 'T' ? '10' : r}${SUIT_GLYPH[s]}`, 'data-card': r + s, onpointerdown: noFocus, onclick: tap(r + s) }, ...face.childNodes));
      }
    }
    pad = h('div', { class: 'lf-pad shoe' },
      h('div', { class: 'lf-grid' }, grid),
      h('div', { class: 'lf-pad-row' },
        specials.map((c) => {
          const face = cardEl(c, 'lf-key');
          return h('button', { class: face.className, title: SPECIAL_FACE[c].name, 'data-card': c, onpointerdown: noFocus, onclick: tap(c) }, ...face.childNodes);
        }),
        h('button', { class: 'btn small', title: 'A new deck: A–K♠, A–K♦, K–A♣, K–A♥', onpointerdown: noFocus, onclick: tap('deck') }, 'deck'),
        groupBtn, order));
  }

  // ---------- erase and move ----------
  let drag = null;
  const tokEls = () => [...back.querySelectorAll('[data-t]')];
  const unmark = () => tokEls().forEach((x) => x.classList.remove('lf-erasing', 'lf-moving', 'lf-drop-before', 'lf-drop-after'));
  function nearest(x, y) {
    let best = null, bd = Infinity;
    for (const t of tokEls()) {
      const r = t.getBoundingClientRect();
      const dx = x < r.left ? r.left - x : x > r.right ? x - r.right : 0;
      const dy = y < r.top ? r.top - y : y > r.bottom ? y - r.bottom : 0;
      const d = dx * dx + 9 * dy * dy; // rows first, then along the row
      if (d < bd) { bd = d; best = t; }
    }
    return best;
  }
  function mark() {
    unmark();
    const els = tokEls();
    if (mode === 'erase') {
      const [i, j] = [Math.min(drag.from, drag.to), Math.max(drag.from, drag.to)];
      for (const t of els) if (+t.dataset.t >= i && +t.dataset.t <= j) t.classList.add('lf-erasing');
    } else {
      els[drag.from]?.classList.add('lf-moving');
      if (drag.gap) els[drag.gap.i]?.classList.add(drag.gap.after ? 'lf-drop-after' : 'lf-drop-before');
    }
  }
  back.addEventListener('pointerdown', (e) => {
    const t = e.target.closest?.('[data-t]');
    if (mode === 'type' || !t) return;
    e.preventDefault();
    back.setPointerCapture?.(e.pointerId);
    drag = { from: +t.dataset.t, to: +t.dataset.t, gap: null };
    mark();
  });
  back.addEventListener('pointermove', (e) => {
    if (!drag) return;
    if (mode === 'erase') {
      const t = document.elementFromPoint(e.clientX, e.clientY)?.closest?.('[data-t]');
      if (t && back.contains(t)) drag.to = +t.dataset.t;
    } else {
      const t = nearest(e.clientX, e.clientY);
      if (t) { const r = t.getBoundingClientRect(); drag.gap = { i: +t.dataset.t, after: e.clientX > r.left + r.width / 2 }; }
    }
    mark();
  });
  const endDrag = (cancel) => {
    if (!drag) return;
    const d = drag;
    drag = null;
    unmark();
    if (cancel) return;
    if (mode === 'erase') {
      const [i, j] = [Math.min(d.from, d.to), Math.max(d.from, d.to)];
      apply(() => removeRange(ta.value, toks[i].s, toks[j].e));
    } else if (d.gap) {
      const g = toks[d.gap.i];
      apply(() => moveToken(ta.value, toks[d.from], d.gap.after ? g.e : g.s));
    }
  };
  back.addEventListener('pointerup', () => endDrag(false));
  back.addEventListener('pointercancel', () => endDrag(true));
  back.addEventListener('lostpointercapture', () => endDrag(true));

  const el = h('div', { class: `list-field ${kind}` },
    box,
    h('div', { class: 'lf-bar' }, tools, status),
    ctx, pad);
  paint();
  setMode(mode);
  return {
    el,
    hasFocus: () => document.activeElement === ta,
    // Focus the field with the caret at `c` (default: where it was).
    focus(c = at) { at = Math.min(c, ta.value.length); ta.focus({ preventScroll: true }); ta.setSelectionRange(at, at); renderStatus(); },
    state: () => ({ text: ta.value, caret: at }),
    // A tap from outside the pad (the Deal's side keys, the board's port menu).
    tap: (entry) => tap(entry)(),
    // Replace the whole text (X: clear the Deal's list).
    setText: (text) => apply(() => ({ text, caret: text.length })),
  };
}
