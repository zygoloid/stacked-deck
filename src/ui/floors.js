// Floor numbering: every floor is a playing card. Levels name their card
// (`card`: 'AS'…'KS' for the 52 suit floors, '?', '??', '$', '$$' for the
// finale); without one it is derived from the chapter and the position in it
// (chapters 1–4 are ♠ ♥ ♣ ♦, A to K; chapter 5's floors are ? ?? $ $$).
import { LEVELS, CHAPTERS } from '../levels.js';
import { h, SUIT_GLYPH, SUIT_NAME, isSpecialCard, rankText, cardClass, SPECIAL_FACE } from './dom.js';
import { RANKS } from '../cards.js';

const CHAPTER_SUIT = { 1: 'S', 2: 'H', 3: 'C', 4: 'D' };
const FINALE = ['?', '??', '$', '$$'];

const isSuitCard = (c) => typeof c === 'string' && c.length === 2 && RANKS.includes(c[0]) && c[1] in SUIT_GLYPH;
const chapterOf = (lv) => lv.chapter ?? 1;

// Position (1-based) of LEVELS[i] within its chapter.
function position(i) {
  const ch = chapterOf(LEVELS[i]);
  return LEVELS.slice(0, i + 1).filter((l) => chapterOf(l) === ch).length;
}

// The card string for LEVELS[i] ('AS', '?', ...) or null when there is none
// (a fallback position past K, or past the four finale cards).
export function floorCardOf(i) {
  const lv = LEVELS[i];
  if (isSuitCard(lv.card) || isSpecialCard(lv.card)) return lv.card;
  const ch = chapterOf(lv), n = position(i);
  if (CHAPTER_SUIT[ch]) return n <= 13 ? RANKS[n - 1] + CHAPTER_SUIT[ch] : null;
  return n <= FINALE.length ? FINALE[n - 1] : null;
}

// { card, text, rank, glyph, cls, special } for LEVELS[i]. `text` is the
// short label ("A♠", "10♥", "?"); without a card it is "chapter-position".
export function floorLabel(i) {
  const card = floorCardOf(i);
  if (!card) {
    const text = `${chapterOf(LEVELS[i])}-${position(i)}`;
    return { card: null, text, rank: text, glyph: '', cls: 'plain', special: false };
  }
  if (isSpecialCard(card)) {
    const f = SPECIAL_FACE[card];
    return { card, text: card, rank: f.face, glyph: f.pip, cls: cardClass(card), special: true, name: f.name };
  }
  return { card, text: rankText(card) + SUIT_GLYPH[card[1]], rank: rankText(card), glyph: SUIT_GLYPH[card[1]], cls: cardClass(card), special: false, suit: card[1] };
}

// The suit a chapter is played in (from its floors' cards), or null.
export function chapterSuit(ch) {
  for (let i = 0; i < LEVELS.length; i++) {
    if (chapterOf(LEVELS[i]) !== ch) continue;
    const c = floorCardOf(i);
    if (c && isSuitCard(c)) return c[1];
  }
  return null;
}

// { glyph, suitName, name, red } for a chapter heading.
export function chapterInfo(ch) {
  const suit = chapterSuit(ch);
  return {
    suit, glyph: suit ? SUIT_GLYPH[suit] : '✦', red: suit === 'H' || suit === 'D',
    suitName: suit ? SUIT_NAME[suit] : (CHAPTER_SUIT[ch] ? `Chapter ${ch}` : 'Finale'),
    name: CHAPTERS?.[ch] ?? '',
  };
}

// The floor's card as a small inline badge (editor top bar, story screen).
export function floorBadge(i, cls = '') {
  const f = floorLabel(i);
  return h('span', { class: `floor-badge ${f.cls} ${cls}`, title: f.special ? f.name : `Floor ${f.text}` },
    h('b', {}, f.rank), f.glyph ? h('i', {}, f.glyph) : null);
}
