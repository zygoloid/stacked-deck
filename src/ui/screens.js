// Level select, story and help screens.
import { h, s, handEl, SPECIAL_FACE, SUIT_GLYPH, SUIT_NAME } from './dom.js';
import { CROUPIERS, PORT_STYLE, chipLabel, sampleCell } from './croupiers.js';
import { CAMPAIGN as LEVELS, BONUS, findLevel } from './catalog.js';
import { RULES_VERSION } from '../engine.js';
import { isUnlocked, isBonusOpen, unlockIds, specialCardsUnlocked } from './model.js';
import { floorLabel, chapterInfo, floorBadge } from './floors.js';
import { accountButton } from './account.js';
import { scatterPlot, parMark } from './scatter.js';
import { standing } from '../online.js';

// Tile classes for the four finale cards.
const SPECIAL_TILE = { '?': 'f-mono', '??': 'f-colour', '$': 'f-front', '$$': 'f-back' };

// The floors list's own settings, kept in this browser only: which deck is
// showing and which suits are folded away.
const UI_KEY = 'stacked-deck-ui';
function loadUi() {
  try {
    const u = JSON.parse(localStorage.getItem(UI_KEY) || 'null');
    if (u && typeof u === 'object') return { deck: u.deck === 'bonus' ? 'bonus' : 'campaign', folded: Array.isArray(u.folded) ? u.folded : [] };
  } catch { /* unreadable or blocked storage */ }
  return { deck: 'campaign', folded: [] };
}
function saveUi(ui) {
  try { localStorage.setItem(UI_KEY, JSON.stringify(ui)); } catch { /* storage full or blocked */ }
}

// The bonus deck's groups, by the suit of their cards: ♠ ♥ ♣ ♦, then special
// cards, then floors without a playing card.
const BONUS_GROUPS = [
  ...['S', 'H', 'C', 'D'].map((k) => ({ key: k, glyph: SUIT_GLYPH[k], name: SUIT_NAME[k], red: k === 'H' || k === 'D' })),
  { key: 'special', glyph: '✦', name: 'Specials', red: false },
  { key: 'other', glyph: '★', name: 'More floors', red: false },
];
const bonusGroupOf = (f) => (f.suit ?? (f.special ? 'special' : 'other'));

// `focus`: the floor just left (its deck is shown, and main.js scrolls to it).
export function levelSelect(root, ctx, focus = null) {
  const { save, cloud } = ctx;
  const signedIn = cloud?.state() === 'signed-in';
  const ui = loadUi();
  if (focus) ui.deck = BONUS.some((l) => l.id === focus) ? 'bonus' : 'campaign';
  if (!BONUS.length) ui.deck = 'campaign';
  const chapters = new Map();
  LEVELS.forEach((lv, i) => {
    const ch = lv.chapter ?? 1;
    if (!chapters.has(ch)) chapters.set(ch, []);
    chapters.get(ch).push([lv, i]);
  });
  const solvedCount = LEVELS.filter((l) => save.levels[l.id]?.solved).length;
  const bonusSolved = BONUS.filter((l) => save.levels[l.id]?.solved).length;

  // Everyone's and friends' scores on a floor, as last read (signed in only),
  // and how the player's best compares with them and with par.
  const scoresOf = (lv) => (signedIn ? cloud.floorScores(lv.id) : { everyone: null, stats: null, friends: [] });
  const bestOf = (lv) => (save.levels[lv.id]?.solved ? save.levels[lv.id].best ?? null : null);
  const standingOf = (lv) => {
    const sc = scoresOf(lv);
    return standing({ best: bestOf(lv), par: lv.par, everyone: sc.everyone, friends: sc.friends });
  };
  // 'holo' (best known on both counts), 'foil' (on one) or ''.
  const finishOf = (lv) => {
    const sd = standingOf(lv);
    const tops = AXES.filter((k) => sd.top[k]).length;
    return tops === 2 ? 'holo' : tops === 1 ? 'foil' : '';
  };

  const page = h('div', { class: 'select' });
  const pop = h('div', { class: 'tile-pop hidden' });
  const draw = () => {
    hidePop();
    page.replaceChildren(...[
      h('header', { class: 'marquee' },
        h('div', { class: 'marquee-suits' }, '♠ ♥ ♣ ♦'),
        h('h1', {}, 'Stacked Deck'),
        h('p', { class: 'tagline' }, 'An esoteric casino. Build machines of croupiers that pay out exactly the right hands.'),
        h('div', { class: 'marquee-meta' },
          BONUS.length ? null : h('span', { class: 'meta-count' }, `${solvedCount} / ${LEVELS.length} floors cleared`),
          h('button', { class: 'btn ghost small', onclick: () => ctx.help() }, '? How to play'),
          cloud ? accountButton(cloud) : null,
          h('span', { class: 'rules-version', title: 'Version of the game rules this page is running' }, `rules v${RULES_VERSION}`)),
        solvedCount + bonusSolved ? legend() : null),
      BONUS.length ? deckTabs() : null,
      ui.deck === 'bonus' ? bonusDeck() : campaignDeck(),
      pop].flat().filter(Boolean));
    layHands();
    fitBriefs();
    light();
  };

  // What the marks on the cards mean.
  function legend() {
    return h('div', { class: 'select-legend' },
      h('span', {}, h('b', { class: 'ts-at' }, '✓'), ' par'),
      h('span', {}, h('b', { class: 'ts-under' }, '−1'), ' under par'),
      h('span', {}, h('b', { class: 'ts-over' }, '+1'), ' over par'),
      signedIn
        ? [h('span', {}, h('b', { class: 'ts-top' }, '★'), ' best known score'),
          h('span', {}, h('i', { class: 'lg-foil' }), 'best known on one count'),
          h('span', {}, h('i', { class: 'lg-holo' }), 'on both')]
        : h('span', { class: 'muted' }, 'Sign in to compare with everyone else'));
  }

  // The two decks, as two card boxes: the campaign (red backs) and the bonus
  // deck (blue backs), each with how much of it is cleared.
  function deckTabs() {
    const tab = (deck, title, sub, done, total) => h('button', {
      class: `deck-tab ${deck}${ui.deck === deck ? ' on' : ''}`, role: 'tab', 'aria-selected': String(ui.deck === deck), 'data-deck': deck,
      onclick: () => {
        if (ui.deck === deck) return;
        ui.deck = deck;
        saveUi(ui);
        draw();
        const tabs = page.querySelector('.decks');
        if (tabs && tabs.getBoundingClientRect().top < 0) tabs.scrollIntoView({ block: 'start' });
      },
    },
    h('span', { class: 'deck-box', 'aria-hidden': 'true' }, h('i'), h('i'), h('i')),
    h('span', { class: 'deck-text' },
      h('b', {}, title),
      h('span', { class: 'deck-sub' }, sub),
      h('span', { class: 'deck-count' }, `${done} / ${total} cleared`),
      h('span', { class: 'deck-bar', 'aria-hidden': 'true' }, h('i', { style: { width: `${total ? (100 * done) / total : 0}%` } }))));
    return h('nav', { class: 'decks', role: 'tablist', 'aria-label': 'Decks' },
      tab('campaign', 'Campaign', 'Red deck · the story', solvedCount, LEVELS.length),
      tab('bonus', 'Bonus deck', 'Blue deck · off the books', bonusSolved, BONUS.length));
  }

  function campaignDeck() {
    return h('div', { class: 'deck campaign' }, [...chapters].map(([ch, list]) => {
      const c = chapterInfo(ch);
      return suitSection(`c${ch}`, list.map(([lv, i]) => ({ lv, i })), { ...c, chapter: ch });
    }));
  }

  // The bonus deck: extra floors outside the campaign, each opened by
  // clearing a floor (shown on its card back): a campaign floor or another
  // bonus floor.
  function bonusDeck() {
    const groups = BONUS_GROUPS.map((g) => ({ ...g, floors: BONUS.filter((lv) => bonusGroupOf(floorLabel(lv)) === g.key) }))
      .filter((g) => g.floors.length);
    return h('div', { class: 'deck bonus' },
      h('p', { class: 'bonus-note' }, 'Extra floors outside the campaign. Each one opens when you clear the floors named on its back (★ marks a bonus floor).'),
      groups.map((g) => suitSection(`b${g.key}`, g.floors.map((lv) => ({ lv, i: -1 })),
        { glyph: g.glyph, suitName: g.name, red: g.red, name: '', chapter: 'bonus' }, true)));
  }

  // One suit: its heading (a button that folds it away), and its cards; or,
  // folded, the same cards gathered into a hand (folded suits sit side by
  // side).
  function suitSection(key, floors, c, bonus = false) {
    const done = floors.filter(({ lv }) => save.levels[lv.id]?.solved).length;
    const folded = () => ui.folded.includes(key);
    const sec = h('section', { class: `chapter${bonus ? ' bonus' : ''}`, 'data-suit': key });
    const tiles = h('div', { class: 'tiles' }, floors.map(({ lv, i }) => (bonus ? bonusTile(lv) : tile(lv, i))));
    const toggle = h('button', {
      class: 'ch-toggle', 'aria-expanded': String(!folded()), title: 'Fold or unfold this suit',
      onclick: () => {
        ui.folded = folded() ? ui.folded.filter((k) => k !== key) : [...ui.folded, key];
        saveUi(ui);
        toggle.setAttribute('aria-expanded', String(!folded()));
        hidePop();
        if (folded()) fold(sec, tiles, true); else unfold(sec, tiles);
      },
    },
    h('span', { class: `ch-suit${c.red ? ' red' : ''}` }, c.glyph), c.suitName,
    c.name ? h('span', { class: 'ch-name' }, ` · ${c.name}`) : '',
    h('span', { class: 'ch-rule', 'aria-hidden': 'true' }),
    h('span', { class: `ch-count${done === floors.length ? ' all' : ''}` }, `${done} / ${floors.length}`),
    h('span', { class: 'ch-chev', 'aria-hidden': 'true' }));
    // In a hand, the card under the pointer (or focused) is shown whole by a
    // break opening after it.
    const breakAt = (e) => {
      const card = [...tiles.children].find((k) => k.contains(e.target));
      if (card) openBreak(tiles, card);
    };
    tiles.addEventListener('pointerover', breakAt);
    tiles.addEventListener('focusin', breakAt);
    tiles.addEventListener('pointerleave', () => openBreak(tiles, null));
    tiles.addEventListener('focusout', (e) => { if (!tiles.contains(e.relatedTarget)) openBreak(tiles, null); });
    sec.append(h('h2', { 'data-chapter': c.chapter }, toggle), tiles);
    if (folded()) sec.classList.add('folded');
    return sec;
  }

  // ---------- folding a suit into a hand ----------
  // The cards keep their size: a folded suit's cards are fanned about a point
  // below them, each turned a little more than the last, so that each card's
  // corner index shows; where one hand would be wider than the deck, it is
  // dealt in overlapping rows. Folding and unfolding move each card from one
  // place to the other. A card's place in the hand is --x, --y (its top left
  // corner, unturned) and --a (its turn about its centre); see style.css.
  const MOVE_MS = 550;

  // The width of a card: as many columns of at least 150px as fit the deck,
  // as the grid in style.css lays them out.
  function cardWidth() {
    const W = page.querySelector('.deck')?.clientWidth ?? 0;
    const cols = Math.max(1, Math.floor((W + 18) / (150 + 18)));
    return { W, w: (W - 18 * (cols - 1)) / cols };
  }

  // Each card's place in a hand of n cards w wide that fits in W:
  // { width, height, places: [{ x, y, a, row }], gap }: `gap` is how far the
  // cards after a card move aside to show it whole. Where the hand is turned
  // least (at the bottom), each card shows about 0.6 `step` of the last.
  function handLayout(n, W, w) {
    const hgt = (w * 7) / 5, R = 2.4 * hgt, step = 0.17 * w, lift = 0.05 * hgt, pitch = 0.42 * hgt;
    const row = (m) => {
      const da = step / (R + hgt / 2);
      const cards = Array.from({ length: m }, (_, k) => {
        const a = (k - (m - 1) / 2) * da;
        return { a, cx: R * Math.sin(a), cy: -R * Math.cos(a) };
      });
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      for (const p of cards) {
        for (const [ux, uy] of [[-w / 2, -hgt / 2], [w / 2, -hgt / 2], [-w / 2, hgt / 2], [w / 2, hgt / 2]]) {
          const X = p.cx + ux * Math.cos(p.a) - uy * Math.sin(p.a), Y = p.cy + ux * Math.sin(p.a) + uy * Math.cos(p.a);
          x0 = Math.min(x0, X); x1 = Math.max(x1, X); y0 = Math.min(y0, Y); y1 = Math.max(y1, Y);
        }
      }
      return { width: x1 - x0, height: y1 - y0, cards: cards.map((p) => ({ a: p.a, x: p.cx - x0 - w / 2, y: p.cy - y0 - hgt / 2 })) };
    };
    let per = n;
    while (per > 1 && row(per).width > W) per--;
    const rows = Math.ceil(n / per);
    per = Math.ceil(n / rows);
    const hands = Array.from({ length: rows }, (_, r) => row(Math.min(per, n - r * per)));
    const width = Math.max(...hands.map((f) => f.width));
    const places = hands.flatMap((f, r) => f.cards.map((p) => ({ a: p.a, x: p.x + (width - f.width) / 2, y: p.y + lift + r * pitch, row: r })));
    return { width, height: lift + (rows - 1) * pitch + hands[rows - 1].height, places, gap: 1.04 * w - 0.6 * step };
  }

  const place = (el, p) => {
    el.style.setProperty('--x', `${p.x.toFixed(1)}px`);
    el.style.setProperty('--y', `${p.y.toFixed(1)}px`);
    el.style.setProperty('--a', `${p.a.toFixed(4)}rad`);
  };
  const unplace = (el) => ['--x', '--y', '--a', '--brk'].forEach((k) => el.style.removeProperty(k));

  // A break in a hand after `card` (null: none): the cards after it in its
  // row move aside, clear of it. The card itself and those before it stay
  // put, so what is under the pointer doesn't move, and the next card starts
  // right of the pointer however low on the card it is.
  function openBreak(tiles, card) {
    const lay = tiles._hand;
    if (!lay || !tiles.classList.contains('fan') || tiles.classList.contains('moving')) return;
    const kids = [...tiles.children];
    const k = card ? kids.indexOf(card) : -1;
    kids.forEach((el, j) => {
      const open = k >= 0 && j > k && lay.places[j].row === lay.places[k].row;
      el.style.setProperty('--brk', open ? `${lay.gap.toFixed(1)}px` : '0px');
    });
    followLight(300);
  }

  // While cards move (a break opening, a suit folding), their foil follows
  // where they are on the screen, frame by frame.
  let followUntil = 0, followFrame = 0;
  function followLight(ms) {
    followUntil = Math.max(followUntil, performance.now() + ms);
    if (followFrame) return;
    const step = () => {
      light();
      followFrame = performance.now() < followUntil && page.isConnected ? requestAnimationFrame(step) : 0;
    };
    followFrame = requestAnimationFrame(step);
  }
  // The cards drawn where they are now placed (with no transition: .still),
  // then moving (.moving) to wherever they are placed next.
  const moveTimers = new WeakMap();
  function startMove(tiles, done) {
    followLight(MOVE_MS + 50);
    void tiles.offsetHeight;
    tiles.classList.remove('still');
    tiles.classList.add('moving');
    clearTimeout(moveTimers.get(tiles));
    moveTimers.set(tiles, setTimeout(() => { tiles.classList.remove('moving', 'placed'); done?.(); }, MOVE_MS + 50));
  }
  const animated = () => !matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Lay a folded suit out as a hand; `animate`: moving the cards there from
  // where they are.
  function fold(sec, tiles, animate) {
    const kids = [...tiles.children];
    const before = animate ? kids.map((k) => k.getBoundingClientRect()) : null;
    const oldH = animate ? tiles.offsetHeight : 0;
    // Laid out without moving (on drawing the list, or a resize), the cards
    // must not slide from wherever the browser last drew them.
    tiles.classList.add('still');
    tiles.classList.remove('moving', 'placed');
    clearTimeout(moveTimers.get(tiles));
    const { W, w } = cardWidth();
    const lay = handLayout(kids.length, W, w);
    sec.classList.add('folded');
    sec.style.width = `${lay.width}px`;
    tiles.style.setProperty('--card-w', `${w}px`);
    tiles.classList.add('fan');
    tiles._hand = lay;
    if (!animate || !animated()) {
      tiles.style.height = `${lay.height}px`;
      kids.forEach((k, j) => place(k, lay.places[j]));
      void tiles.offsetHeight;
      tiles.classList.remove('still');
      return;
    }
    tiles.style.height = `${oldH}px`;
    const box = tiles.getBoundingClientRect();
    kids.forEach((k, j) => place(k, { x: before[j].left - box.left, y: before[j].top - box.top, a: 0 }));
    startMove(tiles);
    kids.forEach((k, j) => place(k, lay.places[j]));
    tiles.style.height = `${lay.height}px`;
  }

  function unfold(sec, tiles) {
    const kids = [...tiles.children];
    const lay = tiles._hand;
    const oldBox = tiles.getBoundingClientRect(), oldH = tiles.offsetHeight;
    tiles.classList.remove('moving', 'placed', 'fan');
    clearTimeout(moveTimers.get(tiles));
    sec.classList.remove('folded');
    sec.style.width = '';
    tiles.style.height = '';
    kids.forEach(unplace);
    fitBriefs();
    light();
    if (!lay || !animated()) return;
    const newH = tiles.offsetHeight;
    const after = kids.map((k) => k.getBoundingClientRect());
    kids.forEach((k, j) => {
      const p = lay.places[j];
      place(k, { x: oldBox.left + p.x - after[j].left, y: oldBox.top + p.y - after[j].top, a: p.a });
    });
    tiles.style.height = `${oldH}px`;
    tiles.classList.add('placed', 'still');
    startMove(tiles, () => { tiles.style.height = ''; kids.forEach(unplace); });
    kids.forEach((k) => place(k, { x: 0, y: 0, a: 0 }));
    tiles.style.height = `${newH}px`;
  }

  // Every folded suit laid out again (after drawing, or a resize).
  function layHands() {
    for (const sec of page.querySelectorAll('.chapter.folded')) fold(sec, sec.querySelector('.tiles'), false);
  }

  function bonusTile(lv) {
    const f = floorLabel(lv);
    if (!isBonusOpen(save, lv)) {
      // What opens it: campaign floors by their card; bonus floors by theirs,
      // marked as bonus floors (a star on a bonus-deck chip). Floors already
      // cleared are struck through.
      const needs = unlockIds(lv).map((id) => findLevel(id) ?? id);
      const isBonus = (x) => typeof x !== 'string' && BONUS.includes(x);
      const done = (x) => typeof x !== 'string' && !!save.levels[x.id]?.solved;
      const chip = (x) => {
        if (typeof x === 'string') return h('span', { class: 'req' }, x);
        return h('span', { class: `req${isBonus(x) ? ' bonus' : ''}${done(x) ? ' done' : ''}` },
          isBonus(x) ? h('span', { class: 'req-star' }, '★') : null, floorLabel(x).text);
      };
      const named = (x) => (typeof x === 'string' ? x
        : `${x.title} (${isBonus(x) ? 'bonus deck ' : ''}${floorLabel(x).text}${done(x) ? ', cleared' : ''})`);
      const list = needs.map(named);
      const title = needs.length
        ? `Clear ${list.length > 1 ? `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}` : list[0]} to open` : 'Locked';
      return h('div', {
        class: 'tile locked bonus', 'data-bonus': lv.id, 'data-card': f.card ?? f.text, title,
      },
      h('div', { class: 'tile-back' }, h('span', { class: 'lock' },
        needs.length ? ['After ', needs.map((x, i) => [i ? ' + ' : '', chip(x)])] : 'Locked')),
      h('div', { class: `tile-no${f.cls === 'red' ? ' red' : ''}` }, f.text));
    }
    return tile(lv, -1, f);
  }

  // Where the light catches a foil or holographic card (style.css): its
  // piece of the screen-sized sheen is set by where the card is on the
  // screen, and its glint by a light above the screen (or the pointer,
  // while it is over the card). Each change repaints the card, so it is
  // only written when it moves by a pixel or more.
  const LIGHT = [0.3, -0.1];   // the light, as a fraction of the screen
  // The card's top left corner as it lies unturned (in a hand it is turned
  // about its centre), and the values for it.
  const shineOf = (el, lx, ly) => {
    const r = el.getBoundingClientRect();
    const left = r.left + r.width / 2 - el.offsetWidth / 2, top = r.top + r.height / 2 - el.offsetHeight / 2;
    return { r, v: [-left, -top, lx - left, ly - top].map((n) => `${Math.round(n)}px`) };
  };
  const shine = (el, v) => {
    const key = v.join();
    if (el._shine === key) return;
    el._shine = key;
    ['--sx', '--sy', '--lx', '--ly'].forEach((k, j) => el.style.setProperty(k, v[j]));
  };
  function light() {
    // Everything is measured first, then written (so as not to lay the page
    // out again for each card).
    const lx = LIGHT[0] * innerWidth, ly = LIGHT[1] * innerHeight;
    const todo = [...page.querySelectorAll('a.tile.foil:not(.lit), a.tile.holo:not(.lit)')]
      .map((el) => ({ el, ...shineOf(el, lx, ly) }))
      .filter(({ r }) => r.width && r.bottom > -200 && r.top < innerHeight + 200);
    for (const { el, v } of todo) shine(el, v);
  }

  function tile(lv, i, label) {
    const st = save.levels[lv.id] ?? {};
    const open = i < 0 || isUnlocked(save, i);
    const f = label ?? floorLabel(i);
    if (!open) {
      // A card back. Special floors keep their card hidden until they open.
      return h('div', { class: 'tile locked', title: 'Clear the previous floors to unlock', 'data-card': f.special ? null : f.card },
        h('div', { class: 'tile-back' }, h('span', { class: 'lock' }, 'Locked')),
        f.special ? null : h('div', { class: `tile-no${f.cls === 'red' ? ' red' : ''}` }, f.text));
    }
    const kind = f.special ? `special ${SPECIAL_TILE[f.card]}` : f.cls === 'red' ? 'red' : f.cls === 'plain' ? 'plain' : 'black';
    const corner = (pos, mark) => h('div', { class: `tile-corner ${pos}` }, h('b', {}, f.rank), f.glyph ? h('i', {}, f.glyph) : null, mark);
    const sd = standingOf(lv);
    const tops = AXES.filter((k) => sd.top[k]).length;
    const finish = st.solved ? (tops === 2 ? ' holo' : tops === 1 ? ' foil' : '') : '';
    const el = h('a', {
      class: `tile ${kind}${f.bonus ? ' bonus' : ''}${st.solved ? ' solved' : ''}${finish}`, href: `#/level/${lv.id}/story`, 'data-level': lv.id, 'data-card': f.card ?? f.text,
      title: [f.special ? `${f.name}` : `${f.bonus ? 'Bonus floor' : 'Floor'} ${f.text}`,
        tops ? `best known ${AXES.filter((k) => sd.top[k]).join(' and ')}` : null].filter(Boolean).join(' · '),
    },
    finish ? h('div', { class: 'tile-foil', 'aria-hidden': 'true' }) : null,
    h('div', { class: 'tile-pip', 'aria-hidden': 'true' }, f.special ? f.rank : f.glyph),
    // Not cleared yet: a ring under the corner index (half filled once
    // started), which shows even when the card is in a hand.
    corner('tl', st.solved ? null : h('span', { class: `tile-mark${st.cells?.length ? ' started' : ''}`, 'aria-hidden': 'true' })),
    corner('br'),
    h('div', { class: 'tile-title' }, lv.title),
    h('div', { class: 'tile-brief' }, lv.brief ?? ''),
    st.solved ? scoreBox(lv, sd) : h('div', { class: 'tile-score open' },
      h('span', { class: 'ts-state' }, st.cells?.length ? 'In progress' : 'New floor'),
      lv.par ? h('span', { class: 'ts-par' }, `par ${lv.par.croupiers ?? '–'} · ${lv.par.rounds ?? '–'}`) : null),
    friendsLine(sd, st.solved));
    if (finish) {
      // The glint follows the pointer over the card.
      el.addEventListener('pointermove', (e) => {
        el.classList.add('lit');
        shine(el, shineOf(el, e.clientX, e.clientY).v);
      });
      el.addEventListener('pointerleave', () => { el.classList.remove('lit'); light(); });
    }
    // The score chart, once there are scores: on hovering the card, on
    // keyboard focus, or from the chart button (for touch).
    const sc = scoresOf(lv);
    const scored = (st.solutions ?? []).some((p) => !p.broken) || sc.everyone?.croupiers != null || sc.stats?.points.length || sc.friends.length;
    if (!scored) return h('div', { class: 'tile-slot' }, el);
    el.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') hoverPop(lv, el); });
    el.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') leavePop(); });
    el.addEventListener('focus', () => { if (el.matches(':focus-visible')) showPop(lv, el); });
    el.addEventListener('blur', () => { if (!popPinned) hidePop(); });
    return h('div', { class: 'tile-slot' }, el,
      h('button', {
        class: 'tile-chart', title: 'Scores chart', 'aria-label': `Scores chart for ${lv.title}`, tabindex: -1,
        onclick: () => { if (popFor === lv && popPinned) hidePop(); else showPop(lv, el, true); },
      }, chartIcon()));
  }

  // Your best on each count against par, with ★ where it is the best known.
  function scoreBox(lv, sd) {
    const best = bestOf(lv);
    return h('div', { class: 'tile-score' }, AXES.map((k) => {
      const m = parMark(best?.[k], lv.par?.[k]);
      return h('div', { class: `ts-axis ${m?.cls ?? ''}${sd.top[k] ? ' top' : ''}` },
        h('span', { class: 'ts-k' }, k),
        h('span', { class: 'ts-v' }, h('b', {}, best?.[k] ?? '–'), m ? h('i', { title: m.title }, m.text) : null,
          sd.top[k] ? h('span', { class: 'ts-top', title: 'Best known score' }, '★') : null),
        h('span', { class: 'ts-par' }, lv.par?.[k] != null ? `par ${lv.par[k]}` : 'no par'));
    }));
  }

  // Friends who beat the player here (or, unsolved, who cleared it).
  function friendsLine(sd, solved) {
    if (!sd.beatenBy.length) return null;
    const names = sd.beatenBy.map((f) => f.name ?? 'A friend');
    const who = names.length > 2 ? `${names[0]} and ${names.length - 1} more` : names.join(' and ');
    return h('div', { class: `tile-friends${solved ? ' beaten' : ''}` }, solved ? `Beaten by ${who}` : `Cleared by ${who}`);
  }

  // ---------- the chart beside a card ----------
  let popFor = null, popPinned = false, popTimer = 0;
  function showPop(lv, anchor, pin = false) {
    clearTimeout(popTimer);
    popFor = lv;
    popPinned = pin;
    pop.replaceChildren(...popContent(lv));
    pop.classList.remove('hidden');
    const r = anchor.getBoundingClientRect(), vw = innerWidth, vh = innerHeight;
    const pw = pop.offsetWidth, ph = pop.offsetHeight, gap = 10;
    let left, top;
    // In a hand, beside the card would cover the cards after it (the ones
    // the pointer moves on to): below it, else above it, if either fits.
    const inHand = !!anchor.closest('.tiles.fan');
    const below = r.bottom + gap + ph <= vh - 8, above = r.top - gap - ph >= 8;
    if (inHand && (below || above)) {
      left = r.left + r.width / 2 - pw / 2;
      top = below ? r.bottom + gap : r.top - gap - ph;
    } else if (r.right + gap + pw <= vw - 8 || r.left - gap - pw >= 8) {
      left = r.right + gap + pw <= vw - 8 ? r.right + gap : r.left - gap - pw;
      top = r.top + r.height / 2 - ph / 2;
    } else {
      left = r.left + r.width / 2 - pw / 2;
      top = r.bottom + gap + ph <= vh - 8 ? r.bottom + gap : r.top - gap - ph;
    }
    pop.style.left = `${Math.max(8, Math.min(vw - pw - 8, left))}px`;
    pop.style.top = `${Math.max(8, Math.min(vh - ph - 8, top))}px`;
    // Everyone's scores on this floor are read when its chart is first shown
    // (the floors list reads only each floor's best): shown again with them.
    if (signedIn && !cloud.cachedStats(lv.id)) {
      cloud.statsFor(lv.id).then(() => { if (popFor === lv && page.isConnected) showPop(lv, anchor, popPinned); }, () => {});
    }
  }
  function hidePop() {
    clearTimeout(popTimer);
    pop.classList.add('hidden');
    popFor = null;
    popPinned = false;
  }
  // Hovering: shown after a moment, and kept while the pointer moves onto it.
  function hoverPop(lv, anchor) {
    if (popPinned) return;
    clearTimeout(popTimer);
    popTimer = setTimeout(() => showPop(lv, anchor), popFor ? 0 : 250);
  }
  function leavePop() {
    if (popPinned) return;
    clearTimeout(popTimer);
    popTimer = setTimeout(hidePop, 150);
  }
  pop.addEventListener('pointerenter', () => { if (!popPinned) clearTimeout(popTimer); });
  pop.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') leavePop(); });

  function popContent(lv) {
    const st = save.levels[lv.id] ?? {};
    const sc = scoresOf(lv);
    const sd = standingOf(lv);
    const best = bestOf(lv);
    const f = floorLabel(lv);
    const rows = AXES.map((k) => h('tr', {},
      h('th', {}, k),
      h('td', { class: parMark(best?.[k], lv.par?.[k])?.cls ?? '' }, best?.[k] ?? '–', sd.top[k] ? h('span', { class: 'ts-top' }, ' ★') : null),
      h('td', {}, lv.par?.[k] ?? '–'),
      sd.record ? h('td', {}, sd.record[k] ?? '–') : null));
    const n = sc.stats?.players;
    let note = null;
    if (cloud && !signedIn) note = 'Sign in to compare with everyone else\'s scores.';
    else if (signedIn && !sc.stats) note = 'Loading everyone\'s scores…';
    else if (signedIn) note = n ? `Best known: the best of ${n} player${n === 1 ? '\'s' : 's\''} verified scores, par and yours.` : 'Nobody has a verified score here yet.';
    return [
      h('div', { class: 'pop-head' }, floorBadge(lv), h('b', {}, lv.title), f.bonus ? h('span', { class: 'muted small' }, 'Bonus floor') : null),
      h('table', { class: 'pop-table' },
        h('thead', {}, h('tr', {}, h('th'), h('th', {}, 'You'), h('th', {}, 'Par'), sd.record ? h('th', {}, 'Best known') : null)),
        h('tbody', {}, rows)),
      sd.beatenBy.length ? h('ul', { class: 'pop-friends' }, sd.beatenBy.map((b) => h('li', {}, h('b', {}, b.name ?? 'A friend'), ': ',
        AXES.filter((k) => b[k] !== null).map((k) => `${b[k]} ${k}`).join(', ')))) : null,
      scatterPlot({ solutions: st.solutions ?? [], par: lv.par, others: sc.stats?.points ?? [], friends: sc.friends, width: 340, height: 230 }),
      note ? h('p', { class: 'pop-note muted small' }, note) : null,
    ].filter(Boolean);
  }

  // A long brief is cut short with a fade (the cards are all one size).
  function fitBriefs() {
    for (const b of page.querySelectorAll('.tile-brief')) b.classList.toggle('clipped', b.scrollHeight > b.clientHeight + 1);
  }

  const onKey = (e) => { if (e.key === 'Escape' && !pop.classList.contains('hidden')) hidePop(); };
  const onDown = (e) => { if (popPinned && !pop.contains(e.target) && !e.target.closest?.('.tile-chart')) hidePop(); };
  let fitFrame = 0;
  let lightFrame = 0;
  const onResize = () => { hidePop(); cancelAnimationFrame(fitFrame); fitFrame = requestAnimationFrame(() => { layHands(); fitBriefs(); light(); }); };
  const onScroll = () => {
    if (!pop.classList.contains('hidden')) hidePop();
    cancelAnimationFrame(lightFrame);
    lightFrame = requestAnimationFrame(light);
  };
  document.addEventListener('keydown', onKey);
  document.addEventListener('pointerdown', onDown);
  addEventListener('resize', onResize);
  addEventListener('scroll', onScroll, { passive: true });

  root.replaceChildren(page);
  draw();
  // Everyone's and friends' scores on every floor, read when due: the cards
  // are drawn again with them.
  if (signedIn) cloud.overview().then((got) => { if (got && page.isConnected) draw(); });
  return () => {
    document.removeEventListener('keydown', onKey);
    document.removeEventListener('pointerdown', onDown);
    removeEventListener('resize', onResize);
    removeEventListener('scroll', onScroll);
    cancelAnimationFrame(fitFrame);
    cancelAnimationFrame(lightFrame);
    cancelAnimationFrame(followFrame);
    clearTimeout(popTimer);
  };
}

const AXES = ['croupiers', 'rounds'];


// A small staircase chart, for the chart button.
const chartIcon = () => s('svg', { viewBox: '0 0 16 16', width: 14, height: 14, 'aria-hidden': 'true' },
  s('path', { d: 'M2 1.5V14.5H15', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.5 }),
  s('path', { d: 'M5 3V8.5H9V11.5H13.5', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.5 }),
  s('circle', { cx: 5, cy: 8.5, r: 1.6, fill: 'currentColor' }), s('circle', { cx: 9, cy: 11.5, r: 1.6, fill: 'currentColor' }));

export function storyScreen(root, ctx, level) {
  const go = () => ctx.go(`#/level/${level.id}`);
  const onKey = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } if (e.key === 'Escape') ctx.go('#/'); };
  document.addEventListener('keydown', onKey);
  root.replaceChildren(h('div', { class: 'story' },
    h('article', { class: 'story-card' },
      storyHead(level),
      h('h1', {}, level.title),
      (level.story ?? []).map((p) => h('p', {}, p)),
      h('div', { class: 'story-brief' }, h('span', { class: 'stat-k' }, 'Tonight'), h('div', {}, level.brief ?? '')),
      storyScore(ctx.save.levels[level.id], level.par),
      h('div', { class: 'story-actions' },
        h('button', { class: 'btn ghost', onclick: () => ctx.go('#/') }, '← All floors'),
        h('button', { class: 'btn gold', onclick: go, autofocus: true }, 'Open the floor →')))));
  return () => document.removeEventListener('keydown', onKey);
}

// Your best on a cleared floor, against par; par alone otherwise.
function storyScore(ls, par) {
  const best = ls?.solved ? ls.best : null;
  if (!best && !par) return null;
  const count = (k) => {
    const m = parMark(best?.[k], par?.[k]);
    return h('span', { class: 'story-count' }, h('b', {}, best?.[k] ?? par?.[k] ?? '–'), ` ${k}`,
      m ? h('i', { class: m.cls, title: m.title }, m.text) : null);
  };
  return h('div', { class: 'story-score' }, h('span', { class: 'stat-k' }, best ? 'Your best' : 'Par'), count('croupiers'), count('rounds'),
    best && par ? h('span', { class: 'story-par' }, `par ${par.croupiers ?? '–'} · ${par.rounds ?? '–'}`) : null);
}

function storyHead(level) {
  const f = floorLabel(level);
  if (f.bonus) {
    return h('div', { class: 'story-head' },
      floorBadge(level, 'big'),
      h('div', { class: 'story-no' }, h('span', { class: 'bonus-star' }, '★'), ' Bonus deck',
        h('span', { class: 'story-floor' }, ` · Floor ${f.text}`)));
  }
  const c = chapterInfo(level.chapter ?? 1);
  return h('div', { class: 'story-head' },
    floorBadge(level, 'big'),
    h('div', { class: 'story-no' }, h('span', { class: c.red ? 'red' : '' }, c.glyph), ` ${c.suitName}`, c.name ? ` · ${c.name}` : '',
      h('span', { class: 'story-floor' }, ` · Floor ${f.text}`)));
}

// Help panel, generated from the croupier table. Special cards are only
// explained once a floor that allows them is open.
export function helpPanel(close, save) {
  const portTag = (p) => {
    const st = PORT_STYLE[p];
    return h('span', { class: `port-tag${st.input ? ' input' : ''}`, style: st.input ? { color: st.color, borderColor: st.color } : { background: st.color } }, st.label);
  };
  const specials = save ? specialCardsUnlocked(save) : [];
  const rows = Object.entries(CROUPIERS).map(([fn, c]) => h('tr', {},
    h('td', {}, h('span', { class: 'pal-chip', style: { background: c.family } }, h('span', {}, chipLabel(sampleCell(fn))))),
    h('td', {}, h('b', {}, c.name), h('div', { class: 'muted small' }, fn)),
    h('td', {}, c.desc, c.params ? h('div', { class: 'muted small' }, 'Options: ', Object.values(c.params).map(optionText).join(', ')) : null),
    h('td', { class: 'ports-cell' }, c.deal ? portTag('to') : null, c.ports.map(portTag), (c.sides ?? []).map(portTag))));
  return h('div', { class: 'modal-back', onclick: (e) => { if (e.target === e.currentTarget) close(); } },
    h('div', { class: 'modal help' },
      h('button', { class: 'modal-x', onclick: close, title: 'Close (Esc)' }, '×'),
      h('h2', {}, 'How the house works'),
      h('ul', { class: 'rules' },
        h('li', {}, 'The ', h('b', {}, 'card player'), ' hands out the test hands one at a time. Hands that should win must reach the ', h('b', {}, 'chip desk'), '; every other card must end up on the floor.'),
        h('li', {}, 'Each croupier has named ', h('b', {}, 'output ports'), '. Point each port at a side of its hex. A port left on ', h('b', {}, '✕ floor'), ', or pointing at a hex with no table, drops its cards.'),
        h('li', {}, 'Croupiers accept hands from any side. Every round, each croupier takes a hand if it can, acts, and hands its results on; a croupier whose way is blocked waits.'),
        h('li', {}, 'A hand\'s top card is drawn first (leftmost). House cards from shoes are drawn dashed.'),
        h('li', {}, 'A floor is cleared when every test passes, and then its check deals: random deals made from your machine itself, so they change whenever the machine does. A machine has to follow the floor\'s rule, not just get the tests right.'),
        h('li', {}, 'Scores: croupiers placed and rounds (the total over all the tests; check deals don\'t count). Fewer is better.'),
        h('li', {}, 'Signing in with Google (optional, from the floors list) uploads the machines you solve floors with and shows everyone\'s scores behind your own on each floor\'s chart. Other players see only how many players got each score, never your machines. Until you sign in, nothing leaves your browser, and the account menu can delete everything signing in stored. See the ', h('a', { href: 'privacy.html', target: '_blank', rel: 'noopener' }, 'privacy notice'), '.')),
      h('h3', {}, 'Croupiers'),
      h('table', { class: 'help-table' }, h('tbody', {}, rows)),
      specials.length ? specialHelp(specials) : null,
      h('h3', {}, 'Controls'),
      // Keyboard and mouse controls only where there is a mouse, touch ones
      // only where there is a touch screen (style.css: .kbd-only, .touch-only).
      h('div', { class: 'keys-grid' },
        [['Tap an empty hex', 'pick a croupier to place there', 'touch'], ['Long-press a croupier in the picker', 'read about it', 'touch'],
          ['Click an empty hex', 'pick a croupier to place there', 'kbd'], ['Point at a croupier in the picker', 'read about it', 'kbd'],
          ['Long-press an edge', 'pick which port points there'], ['Long-press', 'pick up croupiers (drag for more)', 'touch'],
          ['Pinch / drag', 'zoom / pan the floor', 'touch'],
          ['Space', 'play / pause', 'kbd'], ['.', 'step', 'kbd'], [',', 'step back', 'kbd'], ['R', 'reset the run', 'kbd'], ['F', 'next speed', 'kbd'],
          ['1–9', 'place a croupier at the pointer', 'kbd'], ['Del', 'remove selected', 'kbd'],
          ['[ ] M', 'turn / mirror the selected croupier or group', 'kbd'], ['Shift-drag', 'pick up croupiers in a box', 'kbd'], ['Enter / Esc', 'put a group down / back', 'kbd'],
          ['Q E A D Z C', 'point the active port NW NE W E SW SE, then the next', 'kbd'],
          ['X', 'active port to floor', 'kbd'], ['Tab', 'next port', 'kbd'], ['Ctrl+Z', 'undo', 'kbd'], ['Wheel / drag', 'zoom / pan the floor', 'kbd'], ['+ − 0', 'zoom in, out, fit', 'kbd'],
          ['Esc', 'cancel / deselect', 'kbd'], ['Right-click', 'remove a croupier', 'kbd']]
          .map(([k, v, only]) => h('div', { class: only ? `${only === 'kbd' ? 'kbd' : 'touch'}-only` : null }, h('kbd', {}, k), ' ', v)))));
}

// "n (1–13, default 5)" or "rule (high / top)".
function optionText(p) {
  const o = p.options;
  const numeric = o.every((x, k) => typeof x === 'number' && (k === 0 || x === o[k - 1] + 1));
  const range = numeric && o.length > 3 ? `${o[0]}–${p.max ?? o[o.length - 1]}` : o.join(' / ');
  return `${p.label} (${range}${p.default !== undefined && numeric ? `, default ${p.default}` : ''})`;
}

function specialHelp(cards) {
  return h('div', { class: 'help-special' },
    h('h3', {}, 'Special cards'),
    h('p', { class: 'muted small' }, 'Shoes on some late floors may deal special cards. Type them in a shoe\'s deck as ',
      cards.map((c, k) => [k ? ', ' : '', h('kbd', {}, c)]), '.'),
    h('table', { class: 'help-table special' }, h('tbody', {}, cards.map((c) => h('tr', { 'data-card': c },
      h('td', {}, handEl([c])),
      h('td', {}, h('b', {}, SPECIAL_FACE[c].name), h('div', { class: 'muted small' }, c)),
      h('td', {}, SPECIAL_RULES[c]))))));
}

const SPECIAL_RULES = {
  '?': 'Wild. It has no suit.',
  '??': 'Wild. It counts as every suit.',
  '$': 'No value and no suit. First in new deck order.',
  '$$': 'No value and no suit. Last in new deck order.',
};
