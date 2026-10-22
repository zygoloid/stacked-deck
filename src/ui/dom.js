// Tiny DOM helpers and card faces.
const SVGNS = 'http://www.w3.org/2000/svg';

function apply(el, attrs, children, svg) {
  for (const [k, v] of Object.entries(attrs ?? {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.setAttribute('class', v);
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'text') el.textContent = v;
    else if (k === 'html') el.innerHTML = v;
    else if (!svg && k in el && typeof v !== 'string') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export const h = (tag, attrs, ...children) => apply(document.createElement(tag), attrs, children, false);
export const s = (tag, attrs, ...children) => apply(document.createElementNS(SVGNS, tag), attrs, children, true);

export const SUIT_GLYPH = { S: '♠', H: '♥', D: '♦', C: '♣' };
export const SUIT_NAME = { S: 'Spades', H: 'Hearts', D: 'Diamonds', C: 'Clubs' };

// Special cards (late game, dealt only by shoes): how they are drawn.
//   cls    extra class on the card (style.css colours them)
//   face   the big centred text on a card face
//   pip    the small mark in the corner (jokers: a star)
export const SPECIAL_FACE = {
  '?': { cls: 'joker mono', face: '?', pip: '★', name: 'Monochrome joker', blurb: 'wild for value, no suit' },
  '??': { cls: 'joker colour', face: '??', pip: '★', name: 'Colour joker', blurb: 'wild for value, counts as every suit' },
  '$': { cls: 'ad front', face: '$', pip: '', name: 'Front advertising card', blurb: 'no value and no suit; first in new deck order' },
  '$$': { cls: 'ad back', face: '$$', pip: '', name: 'Back advertising card', blurb: 'no value and no suit; last in new deck order' },
};
export const isSpecialCard = (c) => Object.hasOwn(SPECIAL_FACE, c);
export const rankText = (c) => (isSpecialCard(c) ? SPECIAL_FACE[c].face : c[0] === 'T' ? '10' : c[0]);
export const isRed = (c) => !isSpecialCard(c) && (c[1] === 'H' || c[1] === 'D');
export const cardText = (c) => (isSpecialCard(c) ? c : rankText(c) + SUIT_GLYPH[c[1]]);
export const cardName = (c) => (isSpecialCard(c) ? SPECIAL_FACE[c].name : cardText(c));
// Class list for a card face: colour plus, for special cards, their kind.
export const cardClass = (c) => (isSpecialCard(c) ? `spc ${SPECIAL_FACE[c].cls}` : isRed(c) ? 'red' : 'black');

// One little HTML card.
export function cardEl(c, cls = '') {
  if (isSpecialCard(c)) {
    const f = SPECIAL_FACE[c];
    return h('span', { class: `card ${cardClass(c)} ${cls}`, title: f.name },
      h('b', {}, f.face), f.pip ? h('i', {}, f.pip) : null);
  }
  return h('span', { class: `card ${cardClass(c)} ${cls}` }, h('b', {}, rankText(c)), h('i', {}, SUIT_GLYPH[c[1]]));
}

// A hand as a row of little HTML cards.
export function handEl(hand, cls = '') {
  return h('span', { class: `hand ${cls}` }, hand.map((c) => cardEl(c)));
}

// Parse "AS KH 10C 2c" into card strings. Special cards ('?', '??', '$',
// '$$') are accepted only when listed in `special` (the level's
// specialCards); while none are allowed they read as unknown cards, so the
// error never gives them away. Returns { cards } or { error }.
export function parseCards(text, special = []) {
  const toks = text.toUpperCase().replace(/[♠♥♦♣]/g, (g) => ({ '♠': 'S', '♥': 'H', '♦': 'D', '♣': 'C' })[g])
    .split(/[\s,]+/).filter(Boolean);
  const cards = [];
  for (const t of toks) {
    if (isSpecialCard(t) && special.length) {
      if (!special.includes(t)) {
        return { error: `${SPECIAL_FACE[t].name} (${t}) isn't allowed on this floor (allowed here: ${special.join(' ')})` };
      }
      cards.push(t);
      continue;
    }
    const m = /^(10|[A2-9TJQK])([SHDC])$/.exec(t);
    if (!m) return { error: `"${t}" is not a card (try AS, 10H, KD${special.length ? `, ${special[0]}` : ''})` };
    cards.push((m[1] === '10' ? 'T' : m[1]) + m[2]);
  }
  if (!cards.length) return { error: 'A shoe needs at least one card' };
  return { cards };
}

export const fmtCards = (cards) => cards.map((c) => (c[0] === 'T' && c.length === 2 ? '10' + c[1] : c)).join(' ');
