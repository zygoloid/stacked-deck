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
export const rankText = (c) => (c[0] === 'T' ? '10' : c[0]);
export const isRed = (c) => c[1] === 'H' || c[1] === 'D';
export const cardText = (c) => rankText(c) + SUIT_GLYPH[c[1]];

// A hand as a row of little HTML cards.
export function handEl(hand, cls = '') {
  return h('span', { class: `hand ${cls}` },
    hand.map((c) => h('span', { class: `card ${isRed(c) ? 'red' : 'black'}` },
      h('b', {}, rankText(c)), h('i', {}, SUIT_GLYPH[c[1]]))));
}

// Parse "AS KH 10C 2c" into card strings. Returns { cards } or { error }.
export function parseCards(text) {
  const toks = text.toUpperCase().replace(/[♠♥♦♣]/g, (g) => ({ '♠': 'S', '♥': 'H', '♦': 'D', '♣': 'C' })[g])
    .split(/[\s,]+/).filter(Boolean);
  const cards = [];
  for (const t of toks) {
    const m = /^(10|[A2-9TJQK])([SHDC])$/.exec(t);
    if (!m) return { error: `"${t}" is not a card (try AS, 10H, KD)` };
    cards.push((m[1] === '10' ? 'T' : m[1]) + m[2]);
  }
  if (!cards.length) return { error: 'A shoe needs at least one card' };
  return { cards };
}

export const fmtCards = (cards) => cards.map((c) => (c[0] === 'T' ? '10' + c[1] : c)).join(' ');
