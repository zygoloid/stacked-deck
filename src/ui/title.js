// The title screen: the game's name over a working machine (title-machine.js,
// run by the real engine and drawn by the editor's Board), and a Start
// button. Starting zooms into the machine's chip desk while the name moves
// up into the floors list's header; the felt and machine fall away, and the
// desk deals the floors list's cards out onto the page: face down, the open
// floors turning over as they land.
//
// The floors list is drawn under the title the whole time (main.js routes
// as usual), so starting only uncovers it. The title is shown once per
// visit (a browser tab: sessionStorage), when the game opens on the floors
// list, and again from the floors list's heading. Any key or click during
// the start animation skips to its end. With reduced motion the machine
// stands still and starting just fades the title away.
//
// Layering: before Start the title (#title) covers the page. While dealing,
// it goes behind the page (body.title-deal: z-index -1, with the floors
// list's own felt hidden; both felts are the same), so the cards fly over
// the desk.
import { h, s, uiScale } from './dom.js';
import { Board, R, center } from './board.js';
import { Floor } from '../engine.js';
import { TITLE_LEVEL, TITLE_CELLS, TITLE_SPEC, TITLE_DESK, TITLE_FRAME, titleInputs } from './title-machine.js';

const SEEN_KEY = 'stacked-deck-title';
const RATE = 1.8;            // machine rounds per second
const MOVE = 0.8;            // of a round, spent moving the cards
const ZOOM_MS = 1100;        // zooming into the desk
const FLY_MS = 620;          // one card's flight
const DEAL_MS = 900;         // at most, between the first card leaving and the last
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

export function titleSeen() {
  try { return sessionStorage.getItem(SEEN_KEY) === '1'; } catch { return false; }
}
function markSeen() {
  try { sessionStorage.setItem(SEEN_KEY, '1'); } catch { /* storage blocked */ }
}

const reducedMotion = () => !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

// Hex outlines for the felt, drawn once (the Board draws the machine over
// it every frame).
function feltSvg() {
  const pts = [];
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i - Math.PI / 6;
    pts.push(`${((R - 1) * Math.cos(a)).toFixed(2)},${((R - 1) * Math.sin(a)).toFixed(2)}`);
  }
  const hex = pts.join(' ');
  const taken = new Set([...TITLE_LEVEL.fixed, ...TITLE_CELLS].map((c) => c.at.join()));
  return s('svg', { class: 'board title-felt', 'aria-hidden': 'true', preserveAspectRatio: 'none' },
    TITLE_LEVEL.floor.filter((at) => !taken.has(at.join())).map((at) => {
      const [x, y] = center(at);
      return s('polygon', { class: 'hex floor', points: hex, transform: `translate(${x.toFixed(1)},${y.toFixed(1)})` });
    }));
}

// host: the #title element. opts: { progress (a line under Start, or
// null), onClose () (the title has gone; the floors list is the page) }.
export function showTitle(host, { progress = null, onClose = () => {} } = {}) {
  markSeen();
  const still = reducedMotion();
  const felt = feltSvg();
  const svg = s('svg', { class: 'board title-board', 'aria-hidden': 'true', preserveAspectRatio: 'none' });
  const board = new Board(svg, { ...TITLE_LEVEL, floor: [] });
  const startBtn = h('button', { class: 'btn gold title-start', onclick: () => start() }, 'Start');
  const logo = h('span', {}, 'Stacked Deck');
  const suits = h('div', { class: 'title-suits', 'aria-hidden': 'true' }, '♠ ♥ ♣ ♦');
  const tagline = h('p', { class: 'title-tagline' }, 'An esoteric casino. Build machines of croupiers that pay out exactly the right hands.');
  const el = h('div', { class: 'title-screen', role: 'dialog', 'aria-label': 'Stacked Deck' },
    h('div', { class: 'title-felt-bg' }), felt, svg, h('div', { class: 'title-shade' }),
    h('div', { class: 'title-front' },
      h('div', { class: 'title-head' }, suits, h('h1', { class: 'title-logo' }, logo), tagline),
      h('div', { class: 'title-go' }, startBtn, progress ? h('p', { class: 'title-progress' }, progress) : null)));
  host.replaceChildren(el);
  document.body.classList.add('title-open');

  // ---------- the machine ----------
  let floor = null, seed = (Date.now() & 0xffff) + 1;
  const newFloor = () => { floor = new Floor(TITLE_SPEC, titleInputs(seed++)); };
  newFloor();
  // Start part way through, with cards everywhere.
  for (let i = 0; i < 40; i++) floor.step();
  let anim = null, acc = 0, last = performance.now(), raf = 0, running = !still;
  const paidNow = () => {
    const n = floor.justPaid.length;
    return n ? { hand: floor.justPaid[n - 1], hex: floor.paidHex[floor.paidHex.length - 1] } : null;
  };
  // `runOnly`: only the run has moved on since the last draw (Board.render).
  function draw(runOnly = false) {
    const t = anim ? Math.min(1, (performance.now() - anim.start) / anim.dur) : 1;
    const p = paidNow();
    board.render({
      cells: TITLE_CELLS, live: floor, paidNow: p?.hand ?? null, paidNowHex: p?.hex ?? null,
      anim: anim && t < 1 ? Object.assign(anim, { t }) : null,
    }, { runOnly });
    if (t >= 1) anim = null;
  }
  function step() {
    const from = board.positions;
    floor.step();
    if (floor.done()) newFloor();
    anim = { from, start: performance.now(), dur: (MOVE * 1000) / RATE };
  }
  function tick(now) {
    acc += Math.min(0.25, (now - last) / 1000) * RATE;
    last = now;
    if (running && acc >= 1) { acc = Math.min(acc - 1, 1); step(); }
    if (zoom) zoomFrame(now);
    draw(true);
    raf = requestAnimationFrame(tick);
  }

  // ---------- the camera ----------
  // The picture (TITLE_FRAME) fits the screen, unless that would draw its
  // tables too small to read: then a narrow screen shows its middle. The
  // name goes above the carousel and Start below the desk (--head, --go:
  // where those are on the screen). `view` is in board units, the same
  // shape as the screen.
  let view = null, zoom = null;
  const apply = (v) => {
    const vb = `${v.x.toFixed(2)} ${v.y.toFixed(2)} ${v.w.toFixed(2)} ${v.h.toFixed(2)}`;
    svg.setAttribute('viewBox', vb);
    felt.setAttribute('viewBox', vb);
  };
  const size = () => [el.clientWidth || window.innerWidth, el.clientHeight || window.innerHeight];
  function restView() {
    const [W, H] = size();
    const F = TITLE_FRAME, colW = Math.sqrt(3) * R, rowH = 1.5 * R;
    const fw = (F.x1 - F.x0 + 1) * colW, fh = (F.r1 - F.r0) * rowH;
    const scale = Math.max(Math.min(W / fw, H / fh), Math.min((26 * uiScale()) / R, H / fh));
    const cx = ((F.x0 + F.x1) / 2) * colW, cy = ((F.r0 + F.r1) / 2) * rowH;
    const v = { x: cx - W / 2 / scale, y: cy - H / 2 / scale, w: W / scale, h: H / scale };
    el.style.setProperty('--head', `${((F.head * rowH - v.y) * scale).toFixed(1)}px`);
    el.style.setProperty('--go', `${((F.go * rowH - v.y) * scale).toFixed(1)}px`);
    // The name fits between the wings (and the screen).
    el.style.setProperty('--logo', `${(Math.min(F.gap * colW * scale, W - 32) / 6.5).toFixed(1)}px`);
    return v;
  }
  // Zoomed in: the desk a third of the screen's height, a little above the middle.
  function deskView() {
    const [W, H] = size();
    const scale = Math.min((0.34 * H) / (2 * R), (0.5 * W) / (2 * R));
    const [dx, dy] = center(TITLE_DESK);
    return { x: dx - W / 2 / scale, y: dy - (H * 0.46) / scale, w: W / scale, h: H / scale };
  }
  function fit() {
    if (zoom) return;
    view = restView();
    apply(view);
  }
  function zoomFrame(now) {
    const t = Math.min(1, (now - zoom.start) / ZOOM_MS), e = ease(t);
    const a = zoom.from, b = zoom.to;
    // Zoom at an even pace (the width changes geometrically), the middle following.
    const w = a.w * (b.w / a.w) ** e, hh = a.h * (b.h / a.h) ** e;
    const cx = a.x + a.w / 2 + (b.x + b.w / 2 - a.x - a.w / 2) * e, cy = a.y + a.h / 2 + (b.y + b.h / 2 - a.y - a.h / 2) * e;
    view = { x: cx - w / 2, y: cy - hh / 2, w, h: hh };
    apply(view);
    if (t >= 1) { const done = zoom.done; zoom = null; done(); }
  }

  fit();
  draw();
  if (!still) raf = requestAnimationFrame(tick);
  window.addEventListener('resize', fit);
  startBtn.focus({ preventScroll: true });

  // ---------- starting ----------
  let started = false, finished = false;
  const anims = [];
  const track = (a) => { anims.push(a); return a; };
  const onKey = (e) => {
    if (e.target.closest?.('input, textarea, select')) return;
    if (!started && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); start(); }
    else if (started && !finished) { e.preventDefault(); finish(); }
    // (Scrolling the page under the title.)
    else if (/^(Page(Up|Down)|Home|End|Arrow(Up|Down))$/.test(e.key) && e.target.closest?.('#title')) e.preventDefault();
  };
  const onPress = (e) => { if (started && !finished) { e.preventDefault(); finish(); } };
  document.addEventListener('keydown', onKey, true);
  document.addEventListener('pointerdown', onPress, true);
  // (Scrolling the page under the title.)
  const noScroll = (e) => { if (!document.body.classList.contains('title-deal')) e.preventDefault(); };
  el.addEventListener('wheel', noScroll, { passive: false });
  el.addEventListener('touchmove', noScroll, { passive: false });

  function start() {
    if (started) return;
    started = true;
    el.classList.add('starting');
    if (still) {
      track(el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 250, fill: 'forwards' })).finished.then(finish, () => {});
      return;
    }
    // The name, its suits and the tagline move to their places in the floors list's header.
    const marquee = document.querySelector('.select .marquee');
    const pairs = marquee ? [[suits, '.marquee-suits'], [logo, '.logo-btn'], [tagline, '.tagline']] : [];
    for (const [from, sel] of pairs) {
      const to = marquee.querySelector(sel);
      if (!to) continue;
      const a = from.getBoundingClientRect(), b = to.getBoundingClientRect();
      const k = b.width && a.width ? b.width / a.width : 1;
      const dx = b.left + b.width / 2 - (a.left + a.width / 2), dy = b.top + b.height / 2 - (a.top + a.height / 2);
      track(from.animate([{ transform: 'none' }, { transform: `translate(${dx}px, ${dy}px) scale(${from === logo ? k : 1})` }],
        { duration: ZOOM_MS, easing: 'cubic-bezier(0.65, 0, 0.35, 1)', fill: 'forwards' }));
    }
    zoom = { from: { ...view }, to: deskView(), start: performance.now(), done: deal };
  }

  // The desk deals the floors list's cards out: the ones in view fly from
  // it to their places, one after another; the rest are simply there.
  function deal() {
    if (finished) return;
    running = false;
    anim = null;
    draw();
    const deskEl = svg.querySelector(`[data-at="${TITLE_DESK.join(',')}"]`);
    const d = deskEl?.getBoundingClientRect();
    document.body.classList.add('title-deal');
    el.classList.add('dealing');
    const page = document.querySelector('.select');
    if (!d || !page) { finish(); return; }
    const ox = d.left + d.width / 2, oy = d.top + d.height * 0.45;
    const H = window.innerHeight;
    const cards = [...page.querySelectorAll('.deck .tiles > *')].filter((k) => {
      const r = k.getBoundingClientRect();
      return r.width && r.bottom > 0 && r.top < H;
    });
    const gap = cards.length > 1 ? Math.min(70, DEAL_MS / (cards.length - 1)) : 0;
    let flights = [];
    cards.forEach((card, i) => {
      const r = card.getBoundingClientRect();
      const dx = ox - (r.left + r.width / 2), dy = oy - (r.top + r.height / 2);
      const s0 = Math.min(0.5, (0.42 * d.height) / r.height);
      const spin = (i % 2 ? 1 : -1) * (14 + ((i * 37) % 23));
      // Open floors arrive face down and turn over; a locked floor is a card back already.
      const open = !card.matches('.locked') && !!card.querySelector('a.tile');
      const opts = { duration: FLY_MS + (open ? 220 : 0), delay: i * gap, fill: 'backwards', easing: 'linear' };
      const land = open ? FLY_MS / opts.duration : 1;
      const frames = [
        { offset: 0, opacity: 0, translate: `${dx}px ${dy}px`, scale: `${s0}`, rotate: `${spin}deg`, easing: 'cubic-bezier(0.2, 0.75, 0.25, 1)' },
        { offset: 0.06 * land, opacity: 1 },
        { offset: land, opacity: 1, translate: '0px 0px', scale: '1', rotate: '0deg' },
      ];
      if (open) {
        frames[2].easing = 'ease-in';
        frames.push({ offset: land + (1 - land) / 2, scale: '0 1', easing: 'ease-out' }, { offset: 1, opacity: 1, translate: '0px 0px', scale: '1', rotate: '0deg' });
        const back = h('div', { class: `deal-back${card.closest('.deck.bonus') ? ' bonus' : ''}`, 'aria-hidden': 'true' });
        card.append(back);
        const flip = land + (1 - land) / 2;
        track(back.animate([{ opacity: 1 }, { offset: flip, opacity: 1 }, { offset: flip, opacity: 0 }, { opacity: 0 }],
          { ...opts, fill: 'both' })).finished.then(() => back.remove(), () => back.remove());
      }
      flights.push(track(card.animate(frames, opts)).finished);
    });
    // The felt and the machine go at once, the desk as the first cards leave it.
    if (deskEl) track(deskEl.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 450, delay: Math.min(250, DEAL_MS / 4), fill: 'forwards' }));
    flights = flights.length ? flights : [new Promise((res) => setTimeout(res, 300))];
    Promise.all(flights).then(finish, () => {});
  }

  function finish() {
    if (finished) return;
    finished = true;
    started = true;
    for (const a of anims) { try { a.finish(); } catch { /* gone */ } }
    for (const a of anims) { try { a.cancel(); } catch { /* gone */ } }
    document.querySelectorAll('.deal-back').forEach((b) => b.remove());
    close();
  }

  function close() {
    cancelAnimationFrame(raf);
    window.removeEventListener('resize', fit);
    document.removeEventListener('keydown', onKey, true);
    document.removeEventListener('pointerdown', onPress, true);
    host.replaceChildren();
    document.body.classList.remove('title-open', 'title-deal');
    onClose();
  }

  return { start, finish, get open() { return !finished; } };
}
