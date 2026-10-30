// Level select, story and help screens.
import { h, s, handEl, SPECIAL_FACE } from './dom.js';
import { CROUPIERS, PORT_STYLE, chipLabel, sampleCell } from './croupiers.js';
import { CAMPAIGN as LEVELS, BONUS, findLevel } from './catalog.js';
import { RULES_VERSION } from '../engine.js';
import { isUnlocked, isBonusOpen, specialCardsUnlocked } from './model.js';
import { floorLabel, chapterInfo, floorBadge } from './floors.js';
import { accountButton } from './account.js';
import { scatterPlot, parMark } from './scatter.js';
import { standing } from '../online.js';

// Tile classes for the four finale cards.
const SPECIAL_TILE = { '?': 'f-mono', '??': 'f-colour', '$': 'f-front', '$$': 'f-back' };

export function levelSelect(root, ctx) {
  const { save, cloud } = ctx;
  const signedIn = cloud?.state() === 'signed-in';
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
  const scoresOf = (lv) => (signedIn ? cloud.floorScores(lv.id) : { stats: null, friends: [] });
  const bestOf = (lv) => (save.levels[lv.id]?.solved ? save.levels[lv.id].best ?? null : null);
  const standingOf = (lv) => {
    const sc = scoresOf(lv);
    return standing({ best: bestOf(lv), par: lv.par, stats: sc.stats, friends: sc.friends });
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
          h('span', { class: 'meta-count' }, `${solvedCount} / ${LEVELS.length} floors cleared`,
            BONUS.length ? h('span', { class: 'meta-bonus' }, ` · ${bonusSolved} / ${BONUS.length} bonus`) : null),
          h('button', { class: 'btn ghost small', onclick: () => ctx.help() }, '? How to play'),
          cloud ? accountButton(cloud) : null,
          h('span', { class: 'rules-version', title: 'Version of the game rules this page is running' }, `rules v${RULES_VERSION}`)),
        solvedCount + bonusSolved ? legend() : null),
      [...chapters].map(([ch, list]) => h('section', { class: 'chapter' },
        chapterHeading(ch),
        h('div', { class: 'tiles' }, list.map(([lv, i]) => tile(lv, i))))),
      BONUS.length ? bonusDeck() : null,
      pop].flat().filter(Boolean));
    fitBriefs();
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

  // The bonus deck: extra floors outside the campaign, each opened by
  // clearing a campaign floor (shown on its card back).
  function bonusDeck() {
    return h('section', { class: 'chapter bonus' },
      h('h2', { 'data-chapter': 'bonus' }, h('span', { class: 'ch-suit bonus' }, '★'), 'Bonus deck',
        h('span', { class: 'ch-name' }, ' · Off the books')),
      h('p', { class: 'bonus-note' }, 'Extra floors outside the campaign. Each one opens when you clear the floor named on its back.'),
      h('div', { class: 'tiles' }, BONUS.map((lv) => bonusTile(lv))));
  }

  function bonusTile(lv) {
    const f = floorLabel(lv);
    if (!isBonusOpen(save, lv)) {
      const after = findLevel(lv.unlockAfter);
      const need = after ? floorLabel(after).text : lv.unlockAfter;
      return h('div', {
        class: 'tile locked bonus', 'data-bonus': lv.id, 'data-card': f.card ?? f.text,
        title: after ? `Clear ${after.title} (${need}) to open` : 'Locked',
      },
      h('div', { class: 'tile-back' }, h('span', { class: 'lock' }, after ? `After ${need}` : 'Locked')),
      h('div', { class: `tile-no${f.cls === 'red' ? ' red' : ''}` }, f.text));
    }
    return tile(lv, -1, f);
  }
  function chapterHeading(ch) {
    const c = chapterInfo(ch);
    return h('h2', { 'data-chapter': ch },
      h('span', { class: `ch-suit${c.red ? ' red' : ''}` }, c.glyph), c.suitName,
      c.name ? h('span', { class: 'ch-name' }, ` · ${c.name}`) : '');
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
    const corner = (pos) => h('div', { class: `tile-corner ${pos}` }, h('b', {}, f.rank), f.glyph ? h('i', {}, f.glyph) : null);
    const sd = standingOf(lv);
    const tops = AXES.filter((k) => sd.top[k]).length;
    const finish = tops === 2 ? ' holo' : tops === 1 ? ' foil' : '';
    const el = h('a', {
      class: `tile ${kind}${f.bonus ? ' bonus' : ''}${st.solved ? ' solved' : ''}${finish}`, href: `#/level/${lv.id}/story`, 'data-level': lv.id, 'data-card': f.card ?? f.text,
      title: [f.special ? `${f.name}` : `${f.bonus ? 'Bonus floor' : 'Floor'} ${f.text}`,
        tops ? `best known ${AXES.filter((k) => sd.top[k]).join(' and ')}` : null].filter(Boolean).join(' · '),
    },
    finish ? h('div', { class: 'tile-foil', 'aria-hidden': 'true' }) : null,
    h('div', { class: 'tile-pip', 'aria-hidden': 'true' }, f.special ? f.rank : f.glyph),
    corner('tl'), corner('br'),
    h('div', { class: 'tile-title' }, lv.title),
    h('div', { class: 'tile-brief' }, lv.brief ?? ''),
    st.solved ? scoreBox(lv, sd) : h('div', { class: 'tile-score open' },
      h('span', { class: 'ts-state' }, st.cells?.length ? 'In progress' : 'New floor'),
      lv.par ? h('span', { class: 'ts-par' }, `par ${lv.par.croupiers ?? '–'} · ${lv.par.rounds ?? '–'}`) : null),
    friendsLine(sd, st.solved));
    if (finish) {
      // The foil's shine follows the pointer.
      el.addEventListener('pointermove', (e) => {
        const r = el.getBoundingClientRect();
        el.style.setProperty('--mx', `${(((e.clientX - r.left) / r.width) * 100).toFixed(1)}%`);
        el.style.setProperty('--my', `${(((e.clientY - r.top) / r.height) * 100).toFixed(1)}%`);
      });
    }
    // The score chart, once there are scores: on hovering the card, on
    // keyboard focus, or from the chart button (for touch).
    if (!(st.solutions ?? []).some((p) => !p.broken) && !scoresOf(lv).stats?.points.length) return h('div', { class: 'tile-slot' }, el);
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
    if (r.right + gap + pw <= vw - 8 || r.left - gap - pw >= 8) {
      left = r.right + gap + pw <= vw - 8 ? r.right + gap : r.left - gap - pw;
      top = r.top + r.height / 2 - ph / 2;
    } else {
      left = r.left + r.width / 2 - pw / 2;
      top = r.bottom + gap + ph <= vh - 8 ? r.bottom + gap : r.top - gap - ph;
    }
    pop.style.left = `${Math.max(8, Math.min(vw - pw - 8, left))}px`;
    pop.style.top = `${Math.max(8, Math.min(vh - ph - 8, top))}px`;
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
  const onResize = () => { hidePop(); cancelAnimationFrame(fitFrame); fitFrame = requestAnimationFrame(fitBriefs); };
  const onScroll = () => { if (!pop.classList.contains('hidden')) hidePop(); };
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
        h('li', {}, 'Croupiers accept hands from any side. Every round, each free croupier picks up one hand (from the side it last took from, otherwise the next filled side clockwise), acts, and places its outputs. A croupier whose target slot is full waits.'),
        h('li', {}, 'A hand\'s top card is drawn first (leftmost). House cards from shoes are drawn dashed.'),
        h('li', {}, 'A floor is cleared when every test passes, and then its check deals: random deals made from your machine itself, so they change whenever the machine does. A machine has to follow the floor\'s rule, not just get the tests right.'),
        h('li', {}, 'Scores: croupiers placed (shoes count) and rounds (the total over all the tests; check deals don\'t count). Fewer is better.'),
        h('li', {}, 'Signing in with Google (optional, from the floors list) uploads the machines you solve floors with and shows everyone\'s scores behind your own on each floor\'s chart. Other players see only how many players got each score, never your machines. Until you sign in, nothing leaves your browser, and the account menu can delete everything signing in stored. See the ', h('a', { href: 'privacy.html', target: '_blank', rel: 'noopener' }, 'privacy notice'), '.')),
      h('h3', {}, 'Croupiers'),
      h('table', { class: 'help-table' }, h('tbody', {}, rows)),
      specials.length ? specialHelp(specials) : null,
      h('h3', {}, 'Keys'),
      h('div', { class: 'keys-grid' },
        [['Space', 'play / pause'], ['.', 'step'], [',', 'step back'], ['R', 'reset the run'], ['F', 'next speed'],
          ['1–9', 'pick a croupier'], ['Del', 'remove selected'], ['Q E A D Z C', 'point active port NW NE W E SW SE'],
          ['X', 'active port to floor'], ['Tab', 'next port'], ['Ctrl+Z', 'undo'], ['Wheel / pinch / drag', 'zoom / pan the floor'], ['+ − 0', 'zoom in, out, fit'], ['Esc', 'cancel / deselect'], ['Right-click', 'remove a croupier']]
          .map(([k, v]) => h('div', {}, h('kbd', {}, k), ' ', v)))));
}

// "n (1–13, default 5)" or "rule (high / top)".
function optionText(p) {
  const o = p.options;
  const numeric = o.every((x, k) => typeof x === 'number' && (k === 0 || x === o[k - 1] + 1));
  const range = numeric && o.length > 3 ? `${o[0]}–${o[o.length - 1]}` : o.join(' / ');
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
  '?': 'Wild for value: joins the biggest set (n of a kind, Set) and fills a gap or an end of a straight. Has no suit, so it spoils a flush and Suits sends it to misc. In War it beats everything, aces included.',
  '??': 'Wild like the monochrome joker, and it counts as every suit: it never spoils a flush, and Suits sends it to the first of ♠ ♥ ♦ ♣ that has a port. Beats everything in War.',
  '$': 'No value and no suit: never part of a set, a straight or a flush (Set always sends it to rest), and it loses to everything in War. First in new deck order, before A♠.',
  '$$': 'Like the front advertising card, but last in new deck order, after the jokers.',
};
