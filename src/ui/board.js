// SVG rendering of a casino floor: hexes, tables, port arrows and live cards.
import { s, SUIT_GLYPH, rankText, cardText, cardClass, isSpecialCard, SPECIAL_FACE } from './dom.js';
import {
  PORT_STYLE, infoFor, chipLabel, arrowsOf, SIDE_NAMES,
} from './croupiers.js';
import { hexKey } from './model.js';
import { DESK_NAMES } from './sim.js';

export const R = 50;                       // hex circumradius
const AP = R * Math.sqrt(3) / 2;           // apothem
const CHIP = 17;                           // chip radius
const rad = (d) => (d * Math.PI) / 3;      // side d -> angle (clockwise from east)
const unit = (d) => [Math.cos(rad(d)), Math.sin(rad(d))];

export const center = ([q, r]) => [R * Math.sqrt(3) * (q + r / 2), R * 1.5 * r];

function corners(r = R) {
  const pts = [];
  for (let i = 0; i < 6; i++) {
    const a = rad(i) - Math.PI / 6;
    pts.push(`${(r * Math.cos(a)).toFixed(2)},${(r * Math.sin(a)).toFixed(2)}`);
  }
  return pts.join(' ');
}
const HEX = corners(R - 1);
const HEX_IN = corners(R - 5);

// Edge d runs between corners at angles 60d-30 and 60d+30.
function edge(d, r = R, shrink = 1) {
  const a1 = rad(d) - (Math.PI / 6) * shrink, a2 = rad(d) + (Math.PI / 6) * shrink;
  const k = r * (shrink === 1 ? 1 : Math.cos(Math.PI / 6) / Math.cos((Math.PI / 6) * shrink));
  return [[k * Math.cos(a1), k * Math.sin(a1)], [k * Math.cos(a2), k * Math.sin(a2)]];
}

export function axialRound(fq, fr) {
  let q = Math.round(fq), r = Math.round(fr);
  const sx = Math.round(-fq - fr);
  const dq = Math.abs(q - fq), dr = Math.abs(r - fr), ds = Math.abs(sx - (-fq - fr));
  if (dq > dr && dq > ds) q = -r - sx;
  else if (dr > ds) r = -q - sx;
  return [q, r];
}

// Pill text widths at 7px bold: digits and the deal list's separators are
// narrower than letters.
const CHAR_W = { '·': 2.2, '-': 2.6, '…': 7 };
const textWidth = (text) => [...text].reduce((w, ch) => w + (CHAR_W[ch] ?? (/\d/.test(ch) ? 4.1 : 4.6)), 0);
const pillWidth = (text) => Math.max(12, textWidth(text) + 6);

// A deal port's positions on one side as a pill label: runs of three or more
// consecutive positions collapse to "1-6"; if that is still wider than
// `maxW`, the tail is cut to "…". Returns { text, full } (full: uncut).
export function dealLabel(positions, maxW = Infinity) {
  const parts = [];
  for (let i = 0; i < positions.length;) {
    let j = i;
    while (j + 1 < positions.length && positions[j + 1] === positions[j] + 1) j++;
    if (j - i >= 2) parts.push(`${positions[i]}-${positions[j]}`);
    else for (let k = i; k <= j; k++) parts.push(String(positions[k]));
    i = j + 1;
  }
  const full = parts.join('·');
  if (pillWidth(full) <= maxW) return { text: full, full };
  let n = parts.length - 1;
  while (n > 1 && pillWidth(`${parts.slice(0, n).join('·')}·…`) > maxW) n--;
  return { text: `${parts.slice(0, n).join('·')}·…`, full };
}

const CARD_W = 15, CARD_H = 20, CARD_STEP = 11, MAX_SHOWN = 6;
const FADE_MS = 150; // an arrow a click would take away turning grey (style.css)
const cardCount = (n) => `${n} card${n === 1 ? '' : 's'}`;
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

const JOKER_COLOURS = ['#d62f4b', '#e9a100', '#1f9d55', '#2f6fd6'];

// Shadows are drawn, not CSS filters: a filter on each card and chip made
// every frame slow to paint (more so on a phone), and more so with more
// cards on the floor. A card's: its outline 1 down, with a soft edge (what
// drop-shadow(0 1px 1px rgba(0,0,0,.45)) drew). A chip's: a disc 2 down,
// shaded by a gradient falling off as a blur of 2 does (#chip-shadow, after
// drop-shadow(0 2px 2px rgba(0,0,0,.5))).
const CARD_SHADOW = (() => {
  const r = 2.2, w = CARD_W, h = CARD_H, y = 1;
  return `M${r},${y}H${w - r}A${r},${r} 0 0 1 ${w},${y + r}V${y + h - r}A${r},${r} 0 0 1 ${w - r},${y + h}`
    + `H${r}A${r},${r} 0 0 1 0,${y + h - r}V${y + r}A${r},${r} 0 0 1 ${r},${y}Z`;
})();
const cardShadow = () => s('path', { class: 'card-shadow', d: CARD_SHADOW });
const CHIP_SHADOW_R = CHIP + 3;
const chipShadowGradient = () => s('radialGradient', { id: 'chip-shadow' },
  ...[[CHIP - 3, 0.5], [CHIP - 2, 0.49], [CHIP - 1, 0.42], [CHIP - 0.5, 0.346], [CHIP, 0.25], [CHIP + 0.5, 0.154],
    [CHIP + 1, 0.079], [CHIP + 2, 0.011], [CHIP_SHADOW_R, 0]]
    .map(([r, a]) => s('stop', { offset: (r / CHIP_SHADOW_R).toFixed(3), 'stop-color': '#000', 'stop-opacity': a })));

// Make the children of `old` (an element on the page) match those of
// `fresh` (one just built), changing only what differs: an element that is
// the same as before is left alone, so the browser doesn't paint it again.
// (Building the cards afresh each frame made every card count as removed
// and added, so the whole area under them, arrows and all, was painted
// again every frame.) Children are matched by data-k where they have one,
// else in order by tag; `fresh` is emptied.
function morphChildren(old, fresh) {
  const olds = [...old.childNodes], news = [...fresh.childNodes];
  const keyOf = (n) => (n.nodeType === 1 ? n.getAttribute('data-k') : null);
  const byKey = new Map();
  for (const n of olds) if (keyOf(n) !== null) byKey.set(keyOf(n), n);
  const used = new Set(), match = new Map();
  let i = 0;
  for (const f of news) {
    const k = keyOf(f);
    let m = null;
    if (k !== null) m = byKey.get(k) ?? null;
    else {
      for (let j = i; j < olds.length; j++) {
        const o = olds[j];
        if (!used.has(o) && keyOf(o) === null && o.nodeName === f.nodeName) { m = o; i = j + 1; break; }
      }
    }
    if (m && m.nodeName === f.nodeName && !used.has(m)) { used.add(m); match.set(f, m); }
  }
  for (const o of olds) if (!used.has(o)) o.remove();
  let ref = old.firstChild;
  for (const f of news) {
    const m = match.get(f);
    if (!m) { old.insertBefore(f, ref); continue; }
    if (m.nodeType === 3) { if (m.data !== f.data) m.data = f.data; } else morph(m, f);
    if (m === ref) ref = ref.nextSibling;
    else old.insertBefore(m, ref);
  }
}
function morph(old, fresh) {
  for (const a of [...old.attributes]) if (!fresh.hasAttribute(a.name)) old.removeAttribute(a.name);
  for (const a of fresh.attributes) if (old.getAttribute(a.name) !== a.value) old.setAttribute(a.name, a.value);
  morphChildren(old, fresh);
}

// One little card at (x, y). Special cards get a centred face and their own
// colours (style.css: .scard.sp.joker.mono / .joker.colour / .ad.front / .ad.back).
function cardSvg(c, x, house, y = 0, opacity = 1) {
  const g = s('g', {
    class: `scard ${cardClass(c)}${house ? ' house' : ''}`, transform: `translate(${x.toFixed(1)},${y.toFixed(1)})`,
    opacity: opacity < 1 ? opacity.toFixed(2) : undefined,
  }, cardShadow(), s('rect', { width: CARD_W, height: CARD_H, rx: 2.2 }));
  if (isSpecialCard(c)) {
    const f = SPECIAL_FACE[c];
    if (c === '$$') g.append(s('rect', { class: 'sp-band', x: 1.5, y: 1.5, width: CARD_W - 3, height: CARD_H - 3, rx: 1.4 }));
    if (c === '?') g.append(s('rect', { class: 'sp-stripe', x: 1.5, y: 1.5, width: CARD_W - 3, height: 2.6 }));
    if (c === '??') {
      const w = (CARD_W - 3) / 4;
      JOKER_COLOURS.forEach((fill, k) => g.append(s('rect', { class: 'sp-stripe', x: 1.5 + k * w, y: 1.5, width: w + 0.05, height: 2.6, style: { fill } })));
    }
    if (f.pip) g.append(s('text', { x: 1.8, y: CARD_H - 1.8, class: 'pip' }, f.pip));
    // Centred on the part a following card doesn't cover.
    const face = s('text', { x: CARD_STEP / 2 + 1.2, y: 13.2, class: `face${f.face.length > 1 ? ' two' : ''}`, 'text-anchor': 'middle' });
    if (c === '??') face.append(s('tspan', { style: { fill: JOKER_COLOURS[0] } }, '?'), s('tspan', { style: { fill: JOKER_COLOURS[3] } }, '?'));
    else face.textContent = f.face;
    g.append(face);
    return g;
  }
  g.append(s('text', { x: 2, y: 8.6, class: 'rank' }, rankText(c)),
    s('text', { x: CARD_W - 2, y: CARD_H - 2.2, class: 'suit', 'text-anchor': 'end' }, SUIT_GLYPH[c[1]]));
  return g;
}

// Every hand on a live cell: in its slots, waiting to be placed, or held.
function liveHands(lc) {
  const out = [];
  lc.slots.forEach((hand) => { if (hand) out.push(hand); });
  for (const [, hand] of lc.pending) out.push(hand);
  if (lc.held) {
    if (lc.fn === 'gather') out.push(lc.held[0]);
    else out.push(...Object.values(lc.held));
  }
  return out;
}

// Position for a hand sitting at side d of a hex, keeping it inside the hex.
function sidePos(d, nCards, frac = 0.58) {
  const n = Math.min(nCards, MAX_SHOWN);
  const w = CARD_W + (n - 1) * CARD_STEP;
  const [ux, uy] = unit(d);
  // keep the strip's far side inside the edge (support function of the strip along u)
  const maxD = AP - 3 - Math.abs(ux) * w / 2 - Math.abs(uy) * CARD_H / 2;
  const dist = Math.max(8, Math.min(AP * frac, maxD));
  return [ux * dist, uy * dist];
}

export class Board {
  constructor(svg, level) {
    this.svg = svg;
    this.level = level;
    const hexes = [...level.floor, ...level.fixed.map((c) => c.at)];
    const xs = hexes.map((h) => center(h)[0]), ys = hexes.map((h) => center(h)[1]);
    const pad = R * 0.35;
    this.box = {
      x: Math.min(...xs) - AP - pad, y: Math.min(...ys) - R - pad,
      w: Math.max(...xs) - Math.min(...xs) + 2 * (AP + pad), h: Math.max(...ys) - Math.min(...ys) + 2 * (R + pad),
    };
    this.view = { ...this.box };
    this.applyView();
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    this.floorKeys = new Set(level.floor.map(hexKey));
    // Arrows (pills, input marks) a click would take away, by fade key: when
    // each turned grey, and when each that was grey stopped being (so their
    // fades carry on smoothly over the next renders).
    this.fadeGone = new Map();
    this.fadeBack = new Map();
    for (const f of level.fixed) this.floorKeys.delete(hexKey(f.at));
  }

  applyView() {
    const v = this.view;
    this.svg.setAttribute('viewBox', `${v.x.toFixed(2)} ${v.y.toFixed(2)} ${v.w.toFixed(2)} ${v.h.toFixed(2)}`);
  }

  get zoomed() { return Math.abs(this.view.w - this.box.w) > 1e-6 || Math.abs(this.view.x - this.box.x) > 1e-6 || Math.abs(this.view.y - this.box.y) > 1e-6; }

  fit() { this.view = { ...this.box }; this.applyView(); }

  // Zoom by `factor` (<1 zooms in) keeping the point under (clientX, clientY) fixed.
  zoomAt(clientX, clientY, factor) {
    const v = this.view;
    const minW = Math.min(this.box.w, 7 * R), maxW = this.box.w * 1.6;
    const w = Math.min(maxW, Math.max(minW, v.w * factor));
    const f = w / v.w;
    if (f === 1) return;
    const m = this.svg.getScreenCTM();
    const p = m ? new DOMPoint(clientX, clientY).matrixTransform(m.inverse()) : { x: v.x + v.w / 2, y: v.y + v.h / 2 };
    this.view = { x: p.x - (p.x - v.x) * f, y: p.y - (p.y - v.y) * f, w, h: v.h * f };
    this.applyView();
  }

  panBy(dxPx, dyPx) {
    const m = this.svg.getScreenCTM();
    if (!m) return;
    this.view.x -= dxPx / m.a;
    this.view.y -= dyPx / m.d;
    this.applyView();
  }

  // Client point -> { at, side, dist } (dist in units of R from the hex centre).
  locate(clientX, clientY) {
    const m = this.svg.getScreenCTM();
    if (!m) return null;
    const p = new DOMPoint(clientX, clientY).matrixTransform(m.inverse());
    const fq = ((Math.sqrt(3) / 3) * p.x - p.y / 3) / R, fr = ((2 / 3) * p.y) / R;
    const at = axialRound(fq, fr);
    const [cx, cy] = center(at);
    const dx = p.x - cx, dy = p.y - cy;
    const side = ((Math.round(Math.atan2(dy, dx) / (Math.PI / 3)) % 6) + 6) % 6;
    return { at, side, dist: Math.hypot(dx, dy) / R };
  }

  isBuildable(at) { return this.floorKeys.has(hexKey(at)); }

  // state: { cells, selected (key), activePort, hover {at, side, edge}, live (Floor), alert (key), ghost {at, tool},
  //   anim {from, t, back} }
  // anim moves the live cards from where they were drawn before the last step
  // (`from`: this.positions then) toward where they are now, t from 0 to 1.
  // After a step back, `back` is what Sim.back returned ({ copiedFrom }: the
  // copies Duplicate made in the round undone), and live may be none (back
  // at the start).
  //
  // With `runOnly`, the caller says that since the last render only the run
  // has moved on (a step, or the cards' animation): the floor, the
  // croupiers' tables and their arrows stay as they are, and only what the
  // run changes is drawn again (the cards, and a cell whose facing or count
  // changed). That saves building it all every frame, and lets the browser
  // repaint just what changed. (If the state's other parts have changed
  // after all, it draws everything.)
  render(state, { runOnly = false } = {}) {
    const { cells, live } = state;
    if (runOnly && this.drawn && this.sameScene(state)) {
      this.peeks.length = this.staticPeeks;
      this.bodies.forEach((b) => {
        const key = this.bodyKey(b.cell, state);
        if (key === b.key) return;
        const el = this.cellBody(b.cell, state);
        b.el.replaceWith(el);
        Object.assign(b, { el, key });
      });
      this.staticPeeks = this.peeks.length;
      this.renderCards(state);
      return;
    }
    this.drawn = state;
    // What a collapsed stack or label holds ([data-peek] indexes this): the
    // labels' entries first, then the stacks' (redrawn with the cards).
    this.peeks = [];
    const svg = this.svg;
    svg.replaceChildren(s('defs', {}, s('filter', {
      id: 'desaturate', filterUnits: 'userSpaceOnUse', x: -2 * R, y: -2 * R, width: 4 * R, height: 4 * R,
    }, s('feColorMatrix', { type: 'saturate', values: '0' })), chipShadowGradient()));
    this.nextGone = new Map();
    this.nextBack = new Map();
    const gFloor = s('g', { class: 'l-floor' }), gBody = s('g', { class: 'l-body' });
    const gArrow = s('g', { class: 'l-arrows' }), gCards = s('g', { class: 'l-cards' }), gOver = s('g', { class: 'l-over' });
    // A picked-up group floats over everything on the floor, ports and all.
    const gLift = s('g', { class: 'l-lift' });
    svg.append(gFloor, gBody, gArrow, gCards, gLift, gOver);

    const fixedKeys = new Set(this.level.fixed.map((c) => hexKey(c.at)));
    for (const at of this.level.floor) {
      if (fixedKeys.has(hexKey(at))) continue;
      const [x, y] = center(at);
      gFloor.append(s('polygon', { class: 'hex floor', points: HEX, transform: `translate(${x},${y})`, 'data-at': hexKey(at) }));
    }

    const all = [...this.level.fixed, ...cells];
    // The live cells' hexes, in drawing order, for renderCards; each cell's
    // table as drawn, and what it showed (bodyKey), for a runOnly render.
    this.cardCells = [];
    this.bodies = [];
    for (const cell of all) {
      const k = hexKey(cell.at);
      const [x, y] = center(cell.at);
      const t = `translate(${x.toFixed(2)},${y.toFixed(2)})`;
      const selected = state.selected === k;
      const body = this.cellBody(cell, state);
      this.bodies.push({ cell, el: body, key: this.bodyKey(cell, state) });
      // A picked-up group floats over the floor, red where it can't go and
      // marked where it would replace a croupier; that croupier's ports are
      // hidden (they would only show round the edges).
      // (With the pointer on an edge of the selected croupier: what a click there would do.)
      const preview = selected && state.preview;
      const arrows = preview ? this.arrowsSvg(preview, t, state.activePort, { was: cell, key: k })
        : this.arrowsSvg(cell, t, selected ? state.activePort : null, { key: k });
      if (state.lifted?.cells.has(cell)) {
        const bad = state.lifted.bad.has(k), under = bad ? null : state.lifted.covers.get(k);
        body.classList.add('lifted', ...(bad ? ['bad'] : []), ...(under ? ['covers'] : []));
        gLift.append(body, arrows);
        if (under) gLift.append(this.coverTag(under, t));
      } else {
        gBody.append(body);
        if (state.lifted?.covers.get(k) !== cell) gArrow.append(arrows);
      }
      this.cardCells.push([k, t, [x, y]]);
    }
    this.gCards = gCards;

    // The tutorial's ring (src/ui/coach.js): a hex to use, and the edge to point.
    if (state.coach) {
      const [x, y] = center(state.coach.at);
      const g = s('g', { class: 'coach-mark', transform: `translate(${x},${y})` }, s('polygon', { class: 'hex coach-ring', points: HEX_IN }));
      if (state.coach.side !== null && state.coach.side !== undefined) {
        const [[x1, y1], [x2, y2]] = edge(state.coach.side, R - 5, 0.8);
        g.append(s('line', { class: 'coach-edge', x1, y1, x2, y2 }));
      }
      gOver.append(g);
    }
    // The empty hex the croupier picker is open for, and the edge its first port will point at.
    if (state.pick) {
      const [x, y] = center(state.pick.at);
      const g = s('g', { class: 'pick', transform: `translate(${x},${y})` }, s('polygon', { class: 'hex pick-hex', points: HEX_IN }));
      if (state.pick.side !== undefined) g.append(this.arrowsSvg({ kind: 'shoe', out: state.pick.side }, undefined, null, { ghost: true }));
      gOver.append(g);
    }
    // Selection overlay and edge hints.
    if (state.selected) {
      const cell = cells.find((c) => hexKey(c.at) === state.selected);
      if (cell) {
        const [x, y] = center(cell.at);
        const g = s('g', { transform: `translate(${x},${y})`, class: 'sel' });
        g.append(s('polygon', { class: 'sel-ring', points: corners(R - 2) }));
        const st = PORT_STYLE[state.activePort] ?? PORT_STYLE.out;
        for (let d = 0; d < 6; d++) {
          const [[x1, y1], [x2, y2]] = edge(d, R - 3, 0.7);
          // (Lit on the edge the pointer is on when a click there changes
          // nothing: the arrows show what one that does change something will do.)
          const hot = !state.preview && state.hover && hexKey(state.hover.at) === state.selected && state.hover.edge && state.hover.side === d;
          g.append(s('line', {
            class: `edge-hint${hot ? ' hot' : ''}`, x1, y1, x2, y2, stroke: hot ? st.color : undefined,
          }));
        }
        gOver.append(g);
      }
    }
    if (state.hover && !state.drag && this.isBuildable(state.hover.at) && state.tool &&
      !cells.some((c) => hexKey(c.at) === hexKey(state.hover.at))) {
      const [x, y] = center(state.hover.at);
      gOver.append(s('polygon', { class: 'hex ghost', points: HEX_IN, transform: `translate(${x},${y})` }));
    }
    // The croupier a click (or a drop from the palette) would place, see-through.
    if (state.ghost) {
      const t = `translate(${center(state.ghost.at).join(',')})`;
      const body = this.bodySvg(state.ghost, t, false, false, null);
      body.classList.add('ghost-cell');
      body.removeAttribute('data-at');
      gOver.append(body, this.arrowsSvg(state.ghost, t, null, { ghost: true }));
    }
    // Where a dragged croupier (or a new one from the palette) would go:
    // onto another, it replaces it (marked as a group's does).
    if (state.drag && state.drag.over) {
      const [x, y] = center(state.drag.over);
      const k = hexKey(state.drag.over);
      const under = k === state.drag.key ? null : cells.find((c) => hexKey(c.at) === k);
      const cls = !this.isBuildable(state.drag.over) ? 'bad' : under ? 'covers' : 'ok';
      const t = `translate(${x},${y})`;
      gOver.append(s('polygon', { class: `hex drop ${cls}`, points: HEX_IN, transform: t }));
      if (cls === 'covers') gOver.append(this.coverTag(under, t));
    }
    this.fadeGone = this.nextGone;
    this.fadeBack = this.nextBack;
    this.staticPeeks = this.peeks.length;
    this.renderCards(state);
  }

  // Whether `state` would draw the floor, the croupiers' tables and their
  // arrows as the last full render did, but for what the run changes: the
  // same objects. (Previews and ghosts are made afresh for each render, so
  // any is a change.)
  sameScene(state) {
    const d = this.drawn;
    const keys = ['cells', 'selected', 'activePort', 'hover', 'tool', 'drag', 'pick', 'preview', 'ghost', 'lifted'];
    return keys.every((k) => (state[k] ?? null) === (d[k] ?? null)) && !state.preview && !state.ghost && !state.lifted
      // (The tutorial's ring is made afresh for each render too, but is shown
      // while playing: compared by where it is.)
      && JSON.stringify(state.coach ?? null) === JSON.stringify(d.coach ?? null);
  }

  // A cell's table, chip and labels (bodySvg), with the alert ring.
  cellBody(cell, state) {
    const k = hexKey(cell.at);
    const [x, y] = center(cell.at);
    const body = this.bodySvg(cell, `translate(${x.toFixed(2)},${y.toFixed(2)})`, state.selected === k, state.alert === k, state.live);
    // The alert (the desk after a wrong payout): a red ring over the hex
    // whose opacity pulses. (Animating the hex's own stroke width made the
    // page lay itself out again every frame, which on a phone made a long
    // page, the payout lists of 21-card hands, lag for seconds.)
    if (state.alert === k) body.append(s('polygon', { class: 'alert-ring', points: HEX }));
    return body;
  }

  // What of a cell's body the run changes (a runOnly render draws the body
  // again when this changes): the alert, a croupier's facing, the hands a
  // player has still to deal, the hands paid at a desk.
  bodyKey(cell, { live, alert }) {
    const k = hexKey(cell.at);
    const what = cell.kind === 'croupier' ? this.facing(cell, live)
      : cell.kind === 'source' ? this.handsLeft(cell, live)
        : cell.kind === 'payout' ? this.paidHere(cell, live) : null;
    return `${alert === k}|${what}`;
  }

  facing(cell, live) {
    return (live ? live.cells.get(hexKey(cell.at))?.facing : cell.facing) ?? 0;
  }

  // Hands still to come from a player (a lone player's, or a seated
  // player's own), or null when not shown.
  handsLeft(cell, live) {
    const seated = cell.seat !== undefined;
    if (!live || !(seated || this.level.fixed.filter((c) => c.kind === 'source').length === 1)) return null;
    const st = live.cells.get(hexKey(cell.at));
    const mine = seated ? live.inputs.filter((x, i) => x && i % live.seats === cell.seat).length : live.total;
    return mine - (seated ? st.pos : live.inputPos) + st.pending.length;
  }

  // Hands paid at a chip desk.
  paidHere(cell, live) {
    const here = hexKey(cell.at);
    return live ? live.paidHex.filter((k) => k === here).length : 0;
  }

  // The live cards, drawn afresh into their layer.
  renderCards(state) {
    const { live } = state;
    this.paidNow = state.paidNow;
    this.paidNowHex = state.paidNowHex;
    this.paidWrong = state.paidWrong;
    this.anim = live || state.anim?.back ? state.anim : null;
    // New copies come from the card they copy (not when going back: the
    // cards that are there now were there before the round undone).
    this.copiedFrom = this.anim?.back ? null : live?.copiedFrom;
    if (this.anim && !this.anim.vanished) {
      // Cards that left the floor in the step without reaching the chip desk
      // (dropped, or paid but not shown), or that a step back unmade: they
      // fade out where they were, except that copies unmade go back into
      // the cards they copy.
      const present = new Set(state.paidNow);
      if (live) for (const lc of live.cells.values()) for (const hand of liveHands(lc)) hand.forEach((x) => present.add(x));
      this.anim.vanished = [...this.anim.from].filter(([x]) => !present.has(x));
    }
    // Card object -> where it is drawn (for the next step's animation);
    // card object -> where it is going (where the animation ends).
    this.positions = new Map();
    this.landing = new Map();
    this.peeks.length = this.staticPeeks;
    const items = [];
    if (live) {
      for (const [k, t, xy] of this.cardCells) {
        const lc = live.cells.get(k);
        if (lc) items.push(this.liveSvg(lc, t, xy));
      }
    }
    // Dropped cards fade out where they were; unmade copies slide into their originals.
    if (this.anim && this.anim.t < 1) {
      const e = ease(this.anim.t), copied = this.anim.back?.copiedFrom;
      for (const [card, p] of this.anim.vanished) {
        const to = copied && this.landing.get(copied.get(card));
        if (to) items.push(cardSvg(p.c, p.x + (to.x - p.x) * e, p.house, p.y + (to.y - p.y) * e));
        else items.push(cardSvg(p.c, p.x, p.house, p.y, 1 - e));
      }
    }
    // (rebuildCards: the dev frame meter's switch, for comparing.)
    if (this.rebuildCards) this.gCards.replaceChildren(...items);
    else morphChildren(this.gCards, s('g', {}, items));
  }

  bodySvg(cell, t, selected, alert, live) {
    const g = s('g', { class: `cell ${cell.kind}${selected ? ' selected' : ''}${alert ? ' alert' : ''}`, transform: t, 'data-at': hexKey(cell.at) });
    if (cell.kind === 'source') {
      g.append(s('polygon', { class: 'hex src', points: HEX }),
        s('rect', { class: 'cardback', x: -11, y: -22, width: 22, height: 30, rx: 3 }),
        s('rect', { class: 'cardback-inner', x: -8, y: -19, width: 16, height: 24, rx: 2 }),
        s('text', { class: 'fixed-label', y: 22, 'text-anchor': 'middle' }, cell.seat === undefined ? 'PLAYER' : `PLAYER ${'ABCDEF'[cell.seat]}`));
      // Hands still to come: a lone player's, or a seated player's own.
      const seated = cell.seat !== undefined;
      const left = this.handsLeft(cell, live);
      if (left !== null) g.append(s('text', { class: 'src-count', y: -3, 'text-anchor': 'middle' }, String(left)));
      g.append(s('title', {}, seated ? `Player ${'ABCDEF'[cell.seat]}: hands out their own test hands (marked ${'ABCDEF'[cell.seat]} in the list)` : 'Card player: hands out the test hands'));
      return g;
    }
    if (cell.kind === 'payout') {
      g.append(s('polygon', { class: 'hex desk', points: HEX }));
      for (let i = 0; i < 4; i++) {
        g.append(s('ellipse', { class: 'deskchip', cx: 0, cy: 2 - i * 5, rx: 15, ry: 5.5 }));
      }
      g.append(s('text', { class: 'desk-sign', y: -14, 'text-anchor': 'middle' }, '$'),
        s('text', { class: 'fixed-label dark', y: 26, 'text-anchor': 'middle' }, cell.desk === undefined ? 'CHIP DESK' : `DESK ${DESK_NAMES[cell.desk]}`));
      // Hands paid at this desk.
      const paid = this.paidHere(cell, live);
      if (paid) {
        g.append(s('circle', { class: 'paid-badge', cx: 24, cy: -22, r: 10 }),
          s('text', { class: 'paid-badge-t', x: 24, y: -18.5, 'text-anchor': 'middle' }, String(paid)));
      }
      g.append(s('title', {}, cell.desk === undefined ? 'Chip desk: hands that reach it are paid out'
        : `Chip desk ${DESK_NAMES[cell.desk]}: hands that reach it are paid out here (marked → ${DESK_NAMES[cell.desk]} in the expected payouts)`));
      return g;
    }
    const info = infoFor(cell) ?? { family: '#555', name: cell.fn };
    // A shoe or croupier the floor bolts down (part of the level's fixed
    // cells): drawn on a darker table with a bolt in each corner.
    const bolted = this.level.fixed.includes(cell);
    if (bolted) g.classList.add('bolted');
    // The table and chip (a group of their own, for a bolted one's tooltip).
    const face = s('g', {});
    g.append(face);
    face.append(s('polygon', { class: 'hex table', points: HEX }),
      s('polygon', { class: 'hex table-in', points: HEX_IN }));
    if (bolted) {
      for (let i = 0; i < 6; i++) {
        const a = rad(i) - Math.PI / 6;
        face.append(s('circle', { class: 'bolt', cx: ((R - 9) * Math.cos(a)).toFixed(2), cy: ((R - 9) * Math.sin(a)).toFixed(2), r: 2.2 }));
      }
    }
    face.append(s('circle', { class: 'chip-shadow', cy: 2, r: CHIP_SHADOW_R, fill: 'url(#chip-shadow)' }));
    const chip = s('g', { class: 'chip' },
      s('circle', { r: CHIP, fill: info.family }),
      s('circle', { class: 'chip-ring', r: CHIP - 2.5 }),
      s('circle', { class: 'chip-face', r: CHIP - 6 }));
    const label = chipLabel(cell);
    chip.append(s('text', { class: `chip-t${label.length > 4 ? ' small' : ''}`, y: 3.3, 'text-anchor': 'middle' }, label));
    face.append(chip);
    if (cell.kind === 'croupier') {
      // Placeholder until the croupier art exists: a small chevron showing
      // which side the croupier faces (it looks there first, then clockwise).
      const d = this.facing(cell, live);
      g.append(s('polyline', {
        class: 'facing', points: `${CHIP + 2},-4 ${CHIP + 6},0 ${CHIP + 2},4`, transform: `rotate(${d * 60})`,
      }, s('title', {}, 'Facing: looks for cards on this side first, then clockwise')));
    }
    if (cell.kind === 'shoe') {
      const deck = cell.deck ?? [];
      const prev = deck.length ? deck.slice(0, 3).map(cardText).join(' ') + (deck.length > 3 ? ' …' : '') : 'empty';
      const label = s('text', { class: 'shoe-deck', y: CHIP + 11, 'text-anchor': 'middle' }, prev + (cell.once ? ' ¹' : ''));
      if (deck.length) {
        // The whole deck on hover or tap (an invisible hit area: text ignores the pointer).
        const w = [...label.textContent].length * 4.2 + 6;
        g.append(s('g', { class: 'peekable', 'data-peek': this.peek({ cards: deck, title: `Shoe deck (${cardCount(deck.length)}, top first)` }) },
          s('rect', { class: 'peek-hit', x: -w / 2, y: CHIP + 4, width: w, height: 9 }), label));
      } else g.append(label);
    }
    // A placed croupier is explained by its panel when selected, so it has
    // no tooltip (one would cover the cards shown on hover). A bolted one
    // can't be selected: it has one on its table and chip, not on the shoe
    // deck under it.
    if (bolted) face.append(s('title', {}, `Bolted to the floor (part of the floor: it can't be moved or changed, and doesn't count as one of your croupiers). ${info.name}: ${info.desc}`));
    return g;
  }

  // An arrow, pill or input mark `el` that a click would take away (`gone`)
  // turns grey, fading quickly; one that was grey fades back. Elsewhere `el`
  // is drawn as it is. `k` names it across renders (fade keys, arrowsSvg).
  fade(el, k, gone) {
    const now = performance.now();
    const grey = (x) => { x.classList.add('fade-grey'); x.setAttribute('filter', 'url(#desaturate)'); return x; };
    const plain = (x) => { x.classList.add('fade-plain'); return x; };
    if (gone) {
      const t0 = this.fadeGone.get(k) ?? now;
      this.nextGone.set(k, t0);
      const e = now - t0, g = s('g', { class: 'gone' });
      if (e < FADE_MS) {
        g.classList.add('fading');
        g.setAttribute('style', `--fade-t: -${e.toFixed(0)}ms`);
        g.append(plain(el.cloneNode(true)));
      }
      g.append(grey(el));
      return g;
    }
    const t0 = this.fadeGone.has(k) ? now : this.fadeBack.get(k);
    if (t0 === undefined || now - t0 >= FADE_MS) return el;
    this.nextBack.set(k, t0);
    return s('g', { class: 'back', style: `--fade-t: -${(now - t0).toFixed(0)}ms` }, grey(el.cloneNode(true)), plain(el));
  }

  // A cell's port arrows. With `was` (the same cell as it is now), `cell` is
  // how a click would leave it, and the arrows show the difference: what the
  // click adds is drawn see-through, at once; what it takes away turns grey
  // (fade). With `ghost`, every arrow is drawn see-through (a croupier not
  // yet placed). `key` (the cell's) lets fades carry over between renders.
  arrowsSvg(cell, t, activePort, { was = null, ghost = false, key = null } = {}) {
    const fade = (el, k, gone) => (key === null ? el : this.fade(el, `${key}|${k}`, gone));
    const g = s('g', { transform: t, class: 'arrows' });
    const keyOf = ([side, port, idx]) => `${side}|${port}|${idx ?? ''}`;
    const now = arrowsOf(cell);
    const marked = ([side, port, idx], mark) => [side, port, idx, mark];
    let entries = now.map((a) => marked(a, ghost ? 'new' : null));
    if (was) {
      const before = arrowsOf(was), had = new Set(before.map(keyOf)), has = new Set(now.map(keyOf));
      entries = now.map((a) => marked(a, had.has(keyOf(a)) ? null : 'new'))
        .concat(before.filter((a) => !has.has(keyOf(a))).map((a) => marked(a, 'gone')));
    }
    // Input markers (war dealer side, gather under side): a bar on the edge
    // and a lettered badge.
    for (const p of ['dealer', 'under']) {
      if (cell.kind !== 'croupier' || !(p === 'dealer' ? cell.fn === 'war' : cell.fn === 'gather')) continue;
      const sides = [];
      if (was && was[p] !== undefined && was[p] !== cell[p]) sides.push([was[p], 'gone']);
      if (cell[p] !== undefined) sides.push([cell[p], ghost || (was && was[p] !== cell[p]) ? 'new' : null]);
      for (const [d, mark] of sides) {
        const st = PORT_STYLE[p];
        const [[x1, y1], [x2, y2]] = edge(d, R - 4, 0.62);
        const [ux, uy] = unit(d);
        const m = s('g', { class: mark === 'new' ? 'new' : '' });
        m.append(s('line', { class: 'in-mark', x1, y1, x2, y2, stroke: st.color }));
        const bx = ux * (AP - 12), by = uy * (AP - 12);
        m.append(s('g', { class: `badge${activePort === p && mark !== 'gone' ? ' active' : ''}`, transform: `translate(${bx.toFixed(1)},${by.toFixed(1)})` },
          s('title', {}, `${st.label} side`),
          s('circle', { r: 6, fill: st.color }),
          s('text', { y: 2.6, 'text-anchor': 'middle' }, st.short)));
        g.append(mark === 'new' ? m : fade(m, `${p}|${d}`, mark === 'gone'));
      }
    }
    const groups = new Map();
    for (const [side, port, idx, mark] of entries) {
      if (!groups.has(side)) groups.set(side, []);
      groups.get(side).push([port, idx, mark]);
    }
    const isFixed = cell.kind === 'source';
    for (const [side, ports] of groups) {
      // The arrow itself is new, or going, only if all its ports are.
      const mark = ports.every((p) => p[2] === 'new') ? 'new' : ports.every((p) => p[2] === 'gone') ? 'gone' : null;
      const staying = ports.filter((p) => p[2] !== 'gone');
      const st = PORT_STYLE[(staying[0] ?? ports[0])[0]];
      const [ux, uy] = unit(side);
      const r0 = isFixed ? 16 : CHIP + 1, r1 = AP + 1;
      const a = s('g', { class: mark === 'new' ? 'new' : '' });
      g.append(mark === 'new' ? a : fade(a, side, mark === 'gone'));
      const line = { x1: ux * r0, y1: uy * r0, x2: ux * (r1 - 6), y2: uy * (r1 - 6) };
      // arrowhead straddling the edge
      const bx = ux * (r1 - 7), by = uy * (r1 - 7), tx = ux * (r1 + 6), ty = uy * (r1 + 6);
      const px = -uy * 6, py = ux * 6;
      const head = `${bx + px},${by + py} ${tx},${ty} ${bx - px},${by - py}`;
      a.append(s('line', { class: 'port-line', ...line, stroke: st.color }),
        s('polygon', { class: 'port-head', fill: st.color, points: head }));
      if (isFixed || (ports.length === 1 && ports[0][0] === 'out')) continue;
      // One pill per port (deal: one pill listing the deal positions,
      // collapsed to fit the hex), laid side by side along the edge.
      const horizontal = Math.abs(uy) > 0.1; // tangent mostly horizontal for the slanted sides
      let pills;
      if (ports[0][0] === 'to') {
        const shown = staying.length ? staying : ports;
        const { text, full } = dealLabel(shown.map(([, i]) => i), horizontal ? 40 : 26);
        const peek = text === full ? null : this.peek({ text: `Deals cards ${full.replace(/·/g, ', ')} to ${SIDE_NAMES[side]}` });
        // (A deal pill that gains a position is see-through.)
        pills = [[text, st.color, activePort === 'to', peek, !mark && ports.some((p) => p[2] === 'new') ? 'new' : null]];
      } else {
        pills = ports.map(([p, idx, m]) => [PORT_STYLE[p].short, PORT_STYLE[p].color, p === activePort && m !== 'gone', null, mark ? null : m, `${side}|${p}|${idx ?? ''}`]);
      }
      const widths = pills.map(([text]) => pillWidth(text));
      const gap = 2;
      const along = horizontal ? widths : widths.map(() => 12);
      const total = along.reduce((x, y) => x + y, 0) + gap * (pills.length - 1);
      const rr = AP - 15;
      const cx = ux * rr, cy = uy * rr;
      let off = -total / 2;
      pills.forEach(([text, color, active, peek, pm, pk], i) => {
        const mid = off + along[i] / 2;
        off += along[i] + gap;
        const x = horizontal ? cx + mid : cx, y = horizontal ? cy : cy + mid;
        const pill = this.pill(text, color, x, y, active, peek);
        if (pm === 'new') pill.classList.add('new');
        // (A port leaving an arrow that stays: its pill alone turns grey.)
        a.append(pm === 'new' || !pk || mark ? pill : fade(pill, pk, pm === 'gone'));
      });
    }
    return g;
  }

  pill(text, color, x, y, active, peek = null) {
    const w = pillWidth(text);
    return s('g', {
      class: `pill${active ? ' active' : ''}${peek !== null ? ' peekable' : ''}`, transform: `translate(${x.toFixed(1)},${y.toFixed(1)})`,
      'data-peek': peek ?? undefined,
    },
    s('rect', { x: -w / 2, y: -5.5, width: w, height: 11, rx: 5.5, fill: color }),
    s('text', { y: 2.5, 'text-anchor': 'middle' }, text));
  }

  // Over the top corner of a picked-up croupier: the one it would replace.
  coverTag(under, t) {
    const text = `replaces ${chipLabel(under)}`;
    const w = pillWidth(text) + 4;
    return s('g', { class: 'cover-tag', transform: t },
      s('title', {}, `Put down here, it replaces the ${infoFor(under).name} under it`),
      s('rect', { x: -w / 2, y: -R - 6, width: w, height: 12, rx: 6 }),
      s('text', { y: -R + 2.6, 'text-anchor': 'middle' }, text));
  }

  // Register what a stack or cut-short label holds; returns its [data-peek] index.
  peek(item) {
    this.peeks.push(item);
    return this.peeks.length - 1;
  }

  // Where a card drawn at (ax, ay) (board coordinates) is during the step
  // animation: [dx, dy, opacity]. Cards that were on the floor before
  // (including the chip desk's, just paid) slide from there, matched by card
  // object so copies of a card each come from their own place; cards
  // Duplicate just made come from the card they copy; new cards fade in.
  motion(card, ax, ay) {
    const a = this.anim;
    if (!a || a.t >= 1) return [0, 0, 1];
    const from = card && typeof card === 'object'
      ? a.from.get(card) ?? a.from.get(this.copiedFrom?.get(card)) : undefined;
    if (!from) return [0, 0, ease(a.t)];
    const k = 1 - ease(a.t);
    return [(from.x - ax) * k, (from.y - ay) * k, 1];
  }

  // A hand as little cards centred on (x, y) in a cell at `origin` (board
  // coordinates). Live hands are [{c, src}]. Long hands show their first
  // cards and a "+n" card; hovering or tapping any hand shows it all.
  handSvg(hand, x, y, cls, [ox, oy]) {
    const cards = hand.map((v) => (typeof v === 'string' ? v : v.c));
    const house = hand.map((v) => typeof v !== 'string' && v.src === 'house');
    const shown = cards.length > MAX_SHOWN ? MAX_SHOWN - 1 : cards.length;
    const n = shown + (cards.length > shown ? 1 : 0);
    const w = CARD_W + (n - 1) * CARD_STEP;
    const x0 = x - w / 2, y0 = y - CARD_H / 2;
    const collapsed = cards.length > shown;
    // Every hand shows in full, in bigger cards, on hover or tap (a short one
    // can be small to read, or partly under another).
    const g = s('g', {
      class: `hand ${cls} peekable`, transform: `translate(${x0.toFixed(1)},${y0.toFixed(1)})`,
      'data-peek': this.peek({ cards, house, title: `${cardCount(cards.length)}${cards.length > 1 ? ', top first' : ''}${house.some(Boolean) ? ' (house cards dashed)' : ''}` }),
    });
    let deco = null;
    if (cls.includes('pending')) {
      deco = s('rect', { class: 'hand-glow', x: -3, y: -3, width: w + 6, height: CARD_H + 6, rx: 4 });
    } else if (cls.includes('slot')) {
      deco = s('rect', { class: 'hand-tray', x: -2.5, y: -2.5, width: w + 5, height: CARD_H + 5, rx: 3.5 });
    } else if (cls.includes('held')) {
      deco = s('rect', { class: 'hand-plate', x: -3, y: -3, width: w + 6, height: CARD_H + 6, rx: 4 });
    }
    if (deco) g.append(deco);
    const place = (i, k, cx) => {
      const ax = ox + x0 + cx, ay = oy + y0;
      const [dx, dy, op] = this.motion(hand[i], ax, ay);
      for (let j = i; j < i + k; j++) {
        if (typeof hand[j] === 'object') {
          this.positions.set(hand[j], { x: ax + dx, y: ay + dy, c: cards[j], house: house[j] });
          this.landing.set(hand[j], { x: ax, y: ay });
        }
      }
      return [dx, dy, op];
    };
    // Whether the hand is arriving: its tray, plate or glow (and what the
    // cell draws with it, this.arriving) fades in as its cards move.
    this.arriving = 1;
    for (let i = 0; i < shown; i++) {
      const [dx, dy, op] = place(i, 1, i * CARD_STEP);
      if (i === 0 && (Math.abs(dx) + Math.abs(dy) > 0.5 || op < 1)) this.arriving = ease(this.anim.t);
      g.append(cardSvg(cards[i], i * CARD_STEP + dx, house[i], dy, op));
    }
    if (deco && this.arriving < 1) deco.setAttribute('opacity', this.arriving.toFixed(2));
    if (collapsed) {
      // The hidden cards travel with the "+n" card.
      const [dx, dy, op] = place(shown, cards.length - shown, shown * CARD_STEP);
      g.append(s('g', { class: 'scard more', transform: `translate(${(shown * CARD_STEP + dx).toFixed(1)},${dy.toFixed(1)})`, opacity: op < 1 ? op.toFixed(2) : undefined },
        cardShadow(), s('rect', { width: CARD_W, height: CARD_H, rx: 2.2 }),
        s('text', { x: CARD_W / 2, y: 13, 'text-anchor': 'middle' }, `+${cards.length - shown}`)));
    }
    return g;
  }

  // (Keyed with data-k, so that each frame's cards match the last's: morph.)
  liveSvg(lc, t, origin) {
    const g = s('g', { transform: t, class: 'live', 'data-k': `${lc.q},${lc.r}` });
    const hand = (cards, x, y, cls, key) => {
      const el = this.handSvg(cards, x, y, cls, origin);
      el.setAttribute('data-k', key);
      return el;
    };
    if (lc.kind === 'payout') {
      // (Only at the desk it was paid at.)
      if (this.paidNow && this.paidNowHex === `${lc.q},${lc.r}`) g.append(hand(this.paidNow, 0, -2, `paid-now${this.paidWrong ? ' wrong' : ''}`, 'paid'));
      return g;
    }
    // Hands waiting at an input: on a tray, with a notch pointing at the
    // croupier that will pick them up.
    lc.slots.forEach((cards, d) => {
      if (!cards) return;
      const [x, y] = sidePos(d, cards.length);
      const n = Math.min(cards.length, MAX_SHOWN);
      const w = CARD_W + (n - 1) * CARD_STEP;
      const [ux, uy] = unit(d);
      // Where the tray's edge meets the line to the centre, and a notch from there.
      // (A long hand reaching over the middle has no notch.)
      const k = Math.min((w / 2 + 2.5) / (Math.abs(ux) || 1e-9), (CARD_H / 2 + 2.5) / (Math.abs(uy) || 1e-9));
      const tray = hand(cards, x, y, 'slot', `s${d}`);
      if (Math.hypot(x, y) - k >= 6) {
        const bx = x - ux * k, by = y - uy * k;
        const px = -uy * 3.2, py = ux * 3.2;
        g.append(s('polygon', {
          class: 'tray-notch', 'data-k': `n${d}`, opacity: this.arriving < 1 ? this.arriving.toFixed(2) : undefined,
          points: `${(bx + px).toFixed(1)},${(by + py).toFixed(1)} ${(bx - ux * 4).toFixed(1)},${(by - uy * 4).toFixed(1)} ${(bx - px).toFixed(1)},${(by - py).toFixed(1)}`,
        }));
      }
      g.append(tray);
    });
    for (const [side, cards] of lc.pending) {
      if (!cards.length) continue;
      const [x, y] = sidePos(side, lc.kind === 'shoe' ? 1 : cards.length, 0.62);
      g.append(hand(cards, x, y, 'pending', `p${side}`));
    }
    // Hands a croupier holds while it waits for more: on a plate in the
    // middle, with a badge saying what it is waiting with.
    const held = (cards, cls, tag) => {
      g.append(hand(cards, 0, 4, `held ${cls}`, `h${tag}`));
      const w = tag.length * 4.6 + 8;
      g.append(s('g', { class: 'held-badge', 'data-k': `b${tag}`, transform: 'translate(0,-10)', opacity: this.arriving < 1 ? this.arriving.toFixed(2) : undefined },
        s('rect', { x: -w / 2, y: -4.5, width: w, height: 9, rx: 4.5 }),
        s('text', { class: 'held-tag', y: 2.1, 'text-anchor': 'middle' }, tag)));
    };
    if (lc.held) {
      if (lc.fn === 'gather') {
        held(lc.held[0], '', 'held');
      } else if (lc.fn === 'war') {
        const { player, dealer } = lc.held;
        if (player) held(player, '', 'player');
        if (dealer) held(dealer, 'dealer', 'dealer');
      } else if (lc.fn === 'hand' && lc.held.buffer?.length) {
        // The cards a Hand croupier is collecting, with how many it needs.
        const buf = lc.held.buffer, n = lc.n ?? 5;
        held(buf, `hand-buffer${buf.length >= n ? ' full' : ''}`, `held ${buf.length}/${n}`);
      }
    }
    return g;
  }
}
