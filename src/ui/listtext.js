// The text form of a Deal's side list and a shoe's deck (no DOM; test/listtext.js).
//
// A list is written as entries separated by spaces, commas or line breaks:
//   Deal:  E SE SW W NW NE (or the arrows → ↘ ↙ ← ↖ ↗)
//   shoe:  AS 10H kd (or K♦), $ $$ ? ?? (where the floor allows them),
//          AH-KH or A-KH (a run up a suit), KH-AH (down), H (all of a suit,
//          A to K), deck (a new deck: A–K♠, A–K♦, K–A♣, K–A♥)
// Any entry, or a group in brackets, can be repeated: NEx25, (SE W SE)x5.
// The text is only how the list is shown and edited; saves keep the flat list.
import { SPECIAL_FACE } from './dom.js';
import { MAX_DECK, MAX_DEAL_SIDES } from '../score.js';

export const SIDE_TEXT = ['E', 'SE', 'SW', 'W', 'NW', 'NE'];
export const SIDE_ARROWS = ['→', '↘', '↙', '←', '↖', '↗'];
const RANKS = 'A23456789TJQK'.split('');
const SUITS = ['S', 'D', 'C', 'H'];
const MAX_COUNT = 999;

// The cards from rank a to rank b of suit s, up or down.
export function suitRun(s, a, b) {
  const i = RANKS.indexOf(a), j = RANKS.indexOf(b), step = i <= j ? 1 : -1, out = [];
  for (let k = i; ; k += step) { out.push(RANKS[k] + s); if (k === j) break; }
  return out;
}
export const NEW_DECK = [...suitRun('S', 'A', 'K'), ...suitRun('D', 'A', 'K'), ...suitRun('C', 'K', 'A'), ...suitRun('H', 'K', 'A')];
const isNormal = (c) => typeof c === 'string' && c.length === 2 && RANKS.includes(c[0]) && SUITS.includes(c[1]);

// ---------- reading ----------
// A token: { s, e, text, kind: 'item' | 'open' | 'close' | 'bad', be (where
// the entry ends and its count, if any, starts), n (its count), counted
// (whether it has one), val (Deal: a side; shoe: { t: 'card', c } |
// { t: 'run', s, a, b } | { t: 'deck' }), err (filled in by readList) }.
const COUNT_RE = /\s*[xX×*]\s*(\d+)/y;
const ENDS = /[\s,()]/;
const DIR_RE = /(NE|NW|SE|SW|E|W)|([→↘↙←↖↗])/iy;
const RK = '(10|[A2-9TJQK])', SU = '([SHDC♠♥♦♣])';
const DECK_RE = /deck/iy;
const RUN_RE = new RegExp(`${RK}${SU}?-${RK}${SU}`, 'iy');
const CARD_RE = new RegExp(`${RK}${SU}`, 'iy');
const SPECIAL_RE = /\$\$|\$|\?\?|\?/y;
const SUIT_RE = new RegExp(SU, 'iy');
const rankOf = (r) => (r === '10' ? 'T' : r.toUpperCase());
const suitOf = (s) => ({ '♠': 'S', '♥': 'H', '♦': 'D', '♣': 'C' })[s] ?? s.toUpperCase();
const at = (re, text, i) => { re.lastIndex = i; return re.exec(text); };

function dealEntry(text, i) {
  const m = at(DIR_RE, text, i);
  return m && { end: i + m[0].length, val: m[1] ? SIDE_TEXT.indexOf(m[1].toUpperCase()) : SIDE_ARROWS.indexOf(m[2]) };
}
function shoeEntry(text, i) {
  let m;
  if ((m = at(DECK_RE, text, i))) return { end: i + 4, val: { t: 'deck' } };
  if ((m = at(RUN_RE, text, i))) {
    const s = suitOf(m[4]);
    return { end: i + m[0].length, val: !m[2] || suitOf(m[2]) === s ? { t: 'run', s, a: rankOf(m[1]), b: rankOf(m[3]) } : null };
  }
  if ((m = at(CARD_RE, text, i))) return { end: i + m[0].length, val: { t: 'card', c: rankOf(m[1]) + suitOf(m[2]) } };
  if ((m = at(SPECIAL_RE, text, i))) return { end: i + m[0].length, val: { t: 'card', c: m[0] } };
  if ((m = at(SUIT_RE, text, i))) return { end: i + 1, val: { t: 'run', s: suitOf(m[0]), a: 'A', b: 'K' } };
  return null;
}

export function lexList(kind, text) {
  const entryAt = kind === 'deal' ? dealEntry : shoeEntry;
  const toks = [];
  const count = (t) => {
    const m = at(COUNT_RE, text, t.e);
    if (m) { t.n = Number(m[1]); t.counted = true; t.e += m[0].length; }
  };
  for (let i = 0; i < text.length;) {
    const ch = text[i];
    if (/[\s,]/.test(ch)) { i++; continue; }
    if (ch === '(') { toks.push({ s: i, e: i + 1, be: i + 1, kind: 'open', n: 1 }); i++; continue; }
    if (ch === ')') { const t = { s: i, e: i + 1, be: i + 1, kind: 'close', n: 1 }; count(t); toks.push(t); i = t.e; continue; }
    const m = entryAt(text, i);
    if (m) {
      const t = { s: i, e: m.end, be: m.end, kind: 'item', n: 1, val: m.val };
      count(t);
      // An entry must end at a space, comma or bracket ("NEW" isn't NE W).
      if (t.e >= text.length || ENDS.test(text[t.e])) { toks.push(t); i = t.e; continue; }
    }
    let e = i + 1;
    while (e < text.length && !ENDS.test(text[e])) e++;
    toks.push({ s: i, e, be: e, kind: 'bad', n: 1 });
    i = e;
  }
  for (const t of toks) t.text = text.slice(t.s, t.e);
  return toks;
}

function expand(kind, val) {
  if (kind === 'deal') return [val];
  if (val.t === 'card') return [val.c];
  if (val.t === 'run') return suitRun(val.s, val.a, val.b);
  return NEW_DECK;
}

// Reads a list's text: { toks (each with its mistake, if any, in err),
// list (null while there is a mistake), error (the first mistake) }.
// `specials`: the special cards the floor allows (shoes); without any, they
// read as unknown cards, so the error never gives them away.
export function readList(kind, text, { specials = [] } = {}) {
  const toks = lexList(kind, text);
  const max = kind === 'deal' ? MAX_DEAL_SIDES : MAX_DECK;
  const stack = [{ list: [], open: null }];
  let tooMany = false;
  const add = (items, n) => {
    const top = stack.at(-1).list;
    for (let k = 0; k < n && !tooMany; k++) {
      top.push(...items);
      if (top.length > max) tooMany = true;
    }
  };
  for (const t of toks) {
    t.err = null;
    if (t.kind === 'bad') { t.err = kind === 'deal' ? `"${t.text}" isn't a side (E, SE, SW, W, NW or NE)` : notACard(t.text, specials); continue; }
    if (t.counted && !(t.n >= 1 && t.n <= MAX_COUNT)) { t.err = `Counts go from 1 to ${MAX_COUNT}`; continue; }
    if (t.kind === 'item') {
      if (t.val == null) { t.err = `A run stays in one suit ("${t.text}")`; continue; }
      if (kind === 'shoe' && t.val.t === 'card' && SPECIAL_FACE[t.val.c]) {
        if (!specials.length) { t.err = notACard(t.text, specials); continue; }
        if (!specials.includes(t.val.c)) {
          t.err = `${SPECIAL_FACE[t.val.c].name} (${t.val.c}) isn't allowed on this floor (allowed here: ${specials.join(' ')})`;
          continue;
        }
      }
      add(expand(kind, t.val), t.n);
    } else if (t.kind === 'open') {
      stack.push({ list: [], open: t });
    } else if (stack.length === 1) {
      t.err = 'This ")" has no "(" before it';
    } else {
      const g = stack.pop();
      add(g.list, t.n);
    }
  }
  while (stack.length > 1) {
    const g = stack.pop();
    g.open.err = 'This "(" is never closed';
    stack.at(-1).list.push(...g.list);
  }
  const bad = toks.find((t) => t.err);
  let error = bad?.err ?? null;
  if (!error && tooMany) error = kind === 'deal' ? `A Deal takes at most ${MAX_DEAL_SIDES} sides` : `A shoe holds at most ${MAX_DECK} cards`;
  if (!error && kind === 'shoe' && !stack[0].list.length) error = 'A shoe needs at least one card';
  return { toks, list: error ? null : stack[0].list, error };
}
function notACard(text, specials) {
  return `"${text}" is not a card (try AS, 10H, KD${specials.length ? `, ${specials[0]}` : ''})`;
}

// ---------- writing ----------
// A list in its shortest text: runs as NEx25, and a repeated stretch as a
// group, (SE W SE)x5; a shoe's suit runs as AH-KH and a new deck as `deck`.
// A deck sorted A–K by suit gets a line per suit. Every card is two
// characters wide, as the field draws them: TS for a ten, and " ?" and " $"
// (see padSpecials).
export function formatList(kind, list) {
  if (kind === 'deal') return segments(list, dealSeg, 8).join(' ');
  const text = segments(list, shoeSeg, 26).join(' ').replace(/AS-KS AD-KD AC-KC AH-KH( |$)/g, 'AS-KS\nAD-KD\nAC-KC\nAH-KH\n').trim();
  return padSpecials(text, 0).text;
}
// A one-character card (? or $) has a space of its own in front of it, on
// top of the one that separates it from the entry before, so it is drawn two
// characters wide like the rest. isPadded: whether the token starting at `s`
// has it.
export const isLoneSpecial = (t) => t.kind === 'item' && t.val?.t === 'card' && (t.val.c === '?' || t.val.c === '$') && t.be - t.s === 1;
export const isPadded = (text, s) => text[s - 1] === ' ' && (s === 1 || /[\s(]/.test(text[s - 2]));
// The text with every one-character card padded (the caret kept with its text).
export function padSpecials(text, caret) {
  for (const t of lexList('shoe', text).reverse()) {
    if (!isLoneSpecial(t) || isPadded(text, t.s)) continue;
    text = `${text.slice(0, t.s)} ${text.slice(t.s)}`;
    if (caret >= t.s) caret++;
  }
  return { text, caret };
}
// The entry at list[i] (and how many items it covers), without repeats.
function dealSeg(list, i) {
  let r = 1;
  while (list[i + r] === list[i]) r++;
  return { text: SIDE_TEXT[list[i]] + (r > 1 ? `x${r}` : ''), len: r };
}
function shoeSeg(d, i) {
  if (NEW_DECK.every((c, j) => d[i + j] === c)) return { text: 'deck', len: 52 };
  let best = null;
  if (isNormal(d[i]) && isNormal(d[i + 1]) && d[i + 1][1] === d[i][1]) {
    const step = RANKS.indexOf(d[i + 1][0]) - RANKS.indexOf(d[i][0]);
    if (Math.abs(step) === 1) {
      let L = 2;
      while (isNormal(d[i + L]) && d[i + L][1] === d[i][1] && RANKS.indexOf(d[i + L][0]) - RANKS.indexOf(d[i + L - 1][0]) === step) L++;
      if (L >= 3) best = { text: `${d[i]}-${d[i + L - 1]}`, len: L };
    }
  }
  let r = 1;
  while (d[i + r] === d[i]) r++;
  if (!best || r > best.len) best = { text: d[i] + (r > 1 ? `x${r}` : ''), len: r };
  return best;
}
function segments(list, seg, maxGroup) {
  const out = [];
  for (let i = 0; i < list.length;) {
    let best = seg(list, i);
    for (let p = 2; p <= maxGroup && i + 2 * p <= list.length; p++) {
      let k = 1;
      while (i + (k + 1) * p <= list.length && list.slice(i + k * p, i + (k + 1) * p).every((x, j) => x === list[i + j])) k++;
      if (k >= 2 && p * k > best.len) best = { text: `(${segments(list.slice(i, i + p), seg, 0).join(' ')})x${k}`, len: p * k };
    }
    out.push(best.text);
    i += best.len;
  }
  return out;
}

// Each entry written as the pad writes it, keeping the player's spacing,
// line breaks, groups and runs: upper case, TS for a ten, letters for suits,
// side names for arrows, x3 for a count, and a lone ? or $ padded. An entry
// with a mistake is left as it is. Returns { text, caret } (the caret kept
// with the text around it).
export function tidyText(kind, text, caret) {
  for (const t of lexList(kind, text).reverse()) {
    if (t.kind === 'bad' || t.kind === 'open' || (t.kind === 'item' && t.val == null)) continue;
    const count = t.counted ? `x${t.n}` : '';
    let entry;
    if (t.kind === 'close') entry = ')';
    else if (kind === 'deal') entry = SIDE_TEXT[t.val];
    else if (t.val.t === 'card') entry = t.val.c;
    else if (t.val.t === 'deck') entry = 'deck';
    else entry = t.text.slice(0, t.be - t.s).includes('-') ? `${t.val.a}${t.val.s}-${t.val.b}${t.val.s}` : t.val.s;
    const tidy = entry + count;
    if (tidy === t.text) continue;
    text = text.slice(0, t.s) + tidy + text.slice(t.e);
    if (caret >= t.e) caret += tidy.length - t.text.length;
    else if (caret > t.s) caret = t.s + tidy.length;
  }
  return kind === 'shoe' ? padSpecials(text, caret) : { text, caret };
}

// ---------- editing (each returns { text, caret }, or null for no change) ----------
// The token the caret is in or touching (preferring the one it ends), or -1.
export function tokenAt(toks, caret) {
  let best = -1;
  toks.forEach((t, i) => { if (t.s <= caret && caret <= t.e && (best < 0 || t.e === caret)) best = i; });
  return best;
}
// `str` added at `off`, with a space either side where it would otherwise
// run into its neighbours.
export function insertAt(text, off, str) {
  const pre = off > 0 && !/[\s(]/.test(text[off - 1]) ? ' ' : '';
  const post = off < text.length && !/[\s)]/.test(text[off]) ? ' ' : '';
  return { text: text.slice(0, off) + pre + str + post + text.slice(off), caret: off + pre.length + str.length };
}
// text[a..b) taken out, closing up the spaces either side.
export function removeRange(text, a, b) {
  let left = text.slice(0, a).replace(/(\S)[ \t]{2,}$/, '$1 '), right = text.slice(b);
  if (/[ \t]$/.test(left) && /^[ \t]/.test(right)) right = right.replace(/^[ \t]+/, '');
  if (!left.length || left.endsWith('\n')) right = right.replace(/^[ \t]+/, '');
  if (!right.length || right.startsWith('\n')) left = left.replace(/[ \t]+$/, '');
  return { text: left + right, caret: left.length };
}
export function setCount(text, t, n) {
  n = Math.max(1, Math.min(MAX_COUNT, n));
  const tok = text.slice(t.s, t.be) + (n > 1 ? `x${n}` : '');
  return { text: text.slice(0, t.s) + tok + text.slice(t.e), caret: t.s + tok.length };
}
// Token t moved to text offset `target` (another token's start or end).
export function moveToken(text, t, target) {
  if (target >= t.s && target <= t.e) return null;
  const r = removeRange(text, t.s, t.e);
  let to = target > t.s ? target - (text.length - r.text.length) : target;
  to = Math.max(0, Math.min(to, r.text.length));
  const moved = insertAt(r.text, to, t.text);
  return moved.text === text ? null : moved;
}
// The bracket matching toks[i], or -1.
function matching(toks, i) {
  const dir = toks[i].kind === 'open' ? 1 : -1;
  let depth = 0;
  for (let k = i; k >= 0 && k < toks.length; k += dir) {
    if (toks[k].kind === 'open') depth += dir;
    else if (toks[k].kind === 'close') depth -= dir;
    if (depth === 0) return k;
  }
  return -1;
}
// Takes out a group's brackets (and its count), keeping what was in it.
export function ungroup(text, toks, i) {
  const j = matching(toks, i);
  if (j < 0) return removeRange(text, toks[i].s, toks[i].e);
  const [o, c] = toks[i].kind === 'open' ? [toks[i], toks[j]] : [toks[j], toks[i]];
  const r = removeRange(text, c.s, c.e);
  return { text: r.text.slice(0, o.s) + r.text.slice(o.e), caret: r.caret - (o.e - o.s) };
}
// The entries overlapping text[a..b) put in a group, repeated twice.
export function wrapGroup(text, toks, a, b) {
  const inside = toks.filter((t) => (a === b ? t.s <= a && a <= t.e : t.e > a && t.s < b));
  if (!inside.length) return null;
  const s = inside[0].s, e = inside.at(-1).e;
  return { text: `${text.slice(0, s)}(${text.slice(s, e)})x2${text.slice(e)}`, caret: e + 4 };
}
// A tap on the pad: the entry `entry` (its text) added at the caret, or,
// when the token at the caret is that same entry, one more of it. With the
// caret at the start of a token it goes before it, otherwise after it.
export function tapEntry(kind, text, caret, entry) {
  const toks = lexList(kind, text);
  const i = tokenAt(toks, caret);
  const t = i >= 0 ? toks[i] : null;
  const val = lexList(kind, entry)[0]?.val;
  if (t && t.kind === 'item' && JSON.stringify(t.val) === JSON.stringify(val)) return setCount(text, t, t.n + 1);
  return insertAt(text, t ? (caret === t.s ? t.s : t.e) : caret, entry);
}
