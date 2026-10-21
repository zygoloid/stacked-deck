// Level select, story and help screens.
import { h } from './dom.js';
import { CROUPIERS, PORT_STYLE } from './croupiers.js';
import { LEVELS, CHAPTERS } from '../levels.js';
import { isUnlocked } from './model.js';

const SUITS = ['♠', '♥', '♣', '♦'];

export function levelSelect(root, ctx) {
  const { save } = ctx;
  const chapters = new Map();
  LEVELS.forEach((lv, i) => {
    const ch = lv.chapter ?? 1;
    if (!chapters.has(ch)) chapters.set(ch, []);
    chapters.get(ch).push([lv, i]);
  });
  const solvedCount = LEVELS.filter((l) => save.levels[l.id]?.solved).length;
  root.replaceChildren(h('div', { class: 'select' },
    h('header', { class: 'marquee' },
      h('div', { class: 'marquee-suits' }, '♠ ♥ ♣ ♦'),
      h('h1', {}, 'Stacked Deck'),
      h('p', { class: 'tagline' }, 'An esoteric casino. Build machines of croupiers that pay out exactly the right hands.'),
      h('div', { class: 'marquee-meta' },
        h('span', {}, `${solvedCount} / ${LEVELS.length} floors cleared`),
        h('button', { class: 'btn ghost small', onclick: () => ctx.help() }, '? How to play'))),
    [...chapters].map(([ch, list]) => h('section', { class: 'chapter' },
      h('h2', {}, h('span', { class: 'ch-suit' }, SUITS[(ch - 1) % 4]), `Chapter ${ch}`, CHAPTERS[ch] ? h('span', { class: 'ch-name' }, ` · ${CHAPTERS[ch]}`) : ''),
      h('div', { class: 'tiles' }, list.map(([lv, i]) => tile(lv, i)))))));

  function tile(lv, i) {
    const st = save.levels[lv.id] ?? {};
    const open = isUnlocked(save, i);
    const no = ctx.levelNumber(i);
    const suit = SUITS[((lv.chapter ?? 1) - 1) % 4];
    if (!open) {
      return h('div', { class: 'tile locked', title: 'Clear the previous floor to unlock' },
        h('div', { class: 'tile-back' }, h('span', { class: 'lock' }, 'Locked')),
        h('div', { class: 'tile-no' }, no.split('-')[1]));
    }
    const red = suit === '♥' || suit === '♦';
    return h('a', {
      class: `tile${st.solved ? ' solved' : ''}${red ? ' red' : ''}`, href: `#/level/${lv.id}/story`, 'data-level': lv.id,
    },
    h('div', { class: 'tile-corner tl' }, h('b', {}, no.split('-')[1]), h('i', {}, suit)),
    h('div', { class: 'tile-corner br' }, h('b', {}, no.split('-')[1]), h('i', {}, suit)),
    h('div', { class: 'tile-title' }, lv.title),
    h('div', { class: 'tile-brief' }, lv.brief ?? ''),
    st.solved
      ? h('div', { class: 'tile-score' }, h('span', { class: 'solved-mark' }, '✓ Cleared'),
        h('span', {}, `${st.best?.croupiers ?? '–'} croupiers · ${st.best?.rounds ?? '–'} rounds`))
      : h('div', { class: 'tile-score open' }, st.cells?.length ? 'In progress' : 'New floor'),
    lv.par ? h('div', { class: 'tile-par' }, `par ${lv.par.croupiers ?? '–'} · ${lv.par.rounds ?? '–'}`) : null);
  }
}

export function storyScreen(root, ctx, level, index) {
  const go = () => ctx.go(`#/level/${level.id}`);
  const onKey = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } if (e.key === 'Escape') ctx.go('#/'); };
  document.addEventListener('keydown', onKey);
  root.replaceChildren(h('div', { class: 'story' },
    h('article', { class: 'story-card' },
      h('div', { class: 'story-no' }, `Chapter ${level.chapter ?? 1}${CHAPTERS[level.chapter] ? ` (${CHAPTERS[level.chapter]})` : ''} · Floor ${ctx.levelNumber(index)}`),
      h('h1', {}, level.title),
      (level.story ?? []).map((p) => h('p', {}, p)),
      h('div', { class: 'story-brief' }, h('span', { class: 'stat-k' }, 'Tonight'), h('div', {}, level.brief ?? '')),
      h('div', { class: 'story-actions' },
        h('button', { class: 'btn ghost', onclick: () => ctx.go('#/') }, '← All floors'),
        h('button', { class: 'btn gold', onclick: go, autofocus: true }, 'Open the floor →')))));
  return () => document.removeEventListener('keydown', onKey);
}

// Help panel, generated from the croupier table.
export function helpPanel(close) {
  const portTag = (p) => {
    const st = PORT_STYLE[p];
    return h('span', { class: `port-tag${st.input ? ' input' : ''}`, style: st.input ? { color: st.color, borderColor: st.color } : { background: st.color } }, st.label);
  };
  const rows = Object.entries(CROUPIERS).map(([fn, c]) => h('tr', {},
    h('td', {}, h('span', { class: 'pal-chip', style: { background: c.family } }, h('span', {}, c.abbr === 'K' ? 'K2' : c.abbr))),
    h('td', {}, h('b', {}, c.name), h('div', { class: 'muted small' }, fn)),
    h('td', {}, c.desc, c.params ? h('div', { class: 'muted small' }, 'Options: ', Object.values(c.params).map((p) => `${p.label} (${p.options.join(' / ')})`).join(', ')) : null),
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
        h('li', {}, 'A floor is cleared when every test passes. Scores: croupiers placed (shoes count) and rounds (average over the tests). Fewer is better.')),
      h('h3', {}, 'Croupiers'),
      h('table', { class: 'help-table' }, h('tbody', {}, rows)),
      h('h3', {}, 'Keys'),
      h('div', { class: 'keys-grid' },
        [['Space', 'play / pause'], ['.', 'step'], [',', 'step back'], ['R', 'reset the run'], ['F', 'next speed'],
          ['1–9', 'pick a croupier'], ['Del', 'remove selected'], ['Q E A D Z C', 'point active port NW NE W E SW SE'],
          ['X', 'active port to floor'], ['Tab', 'next port'], ['Ctrl+Z', 'undo'], ['Wheel / drag', 'zoom / pan the floor'], ['+ − 0', 'zoom in, out, fit'], ['Esc', 'cancel / deselect'], ['Right-click', 'remove a croupier']]
          .map(([k, v]) => h('div', {}, h('kbd', {}, k), ' ', v)))));
}
