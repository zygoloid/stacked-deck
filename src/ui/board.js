// SVG rendering of a casino floor: hexes, tables, port arrows and live cards.
import { s, SUIT_GLYPH, rankText, cardText, cardName, cardClass, isSpecialCard, SPECIAL_FACE } from './dom.js';
import {
  PORT_STYLE, infoFor, chipLabel, arrowsOf, SIDE_NAMES,
} from './croupiers.js';
import { hexKey } from './model.js';

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

function axialRound(fq, fr) {
  let q = Math.round(fq), r = Math.round(fr);
  const sx = Math.round(-fq - fr);
  const dq = Math.abs(q - fq), dr = Math.abs(r - fr), ds = Math.abs(sx - (-fq - fr));
  if (dq > dr && dq > ds) q = -r - sx;
  else if (dr > ds) r = -q - sx;
  return [q, r];
}

const pillWidth = (text) => Math.max(12, [...text].length * 4.6 + 6);

const CARD_W = 15, CARD_H = 20, CARD_STEP = 11, MAX_SHOWN = 6;

// A hand as little cards centred on (x, y). Live hands are [{c, src}].
function handSvg(hand, x, y, cls = '') {
  const cards = hand.map((x) => (typeof x === 'string' ? x : x.c));
  const house = hand.map((x) => typeof x !== 'string' && x.src === 'house');
  const shown = cards.length > MAX_SHOWN ? MAX_SHOWN - 1 : cards.length;
  const n = shown + (cards.length > shown ? 1 : 0);
  const w = CARD_W + (n - 1) * CARD_STEP;
  const g = s('g', { class: `hand ${cls}`, transform: `translate(${(x - w / 2).toFixed(1)},${(y - CARD_H / 2).toFixed(1)})` },
    s('title', {}, cards.map(cardName).join(' ') + (house.some(Boolean) ? '  (house cards dashed)' : '')));
  if (cls.includes('pending')) {
    g.append(s('rect', { class: 'hand-glow', x: -3, y: -3, width: w + 6, height: CARD_H + 6, rx: 4 }));
  }
  for (let i = 0; i < shown; i++) g.append(cardSvg(cards[i], i * CARD_STEP, house[i]));
  if (cards.length > shown) {
    g.append(s('g', { class: 'scard more', transform: `translate(${shown * CARD_STEP},0)` },
      s('rect', { width: CARD_W, height: CARD_H, rx: 2.2 }),
      s('text', { x: CARD_W / 2, y: 13, 'text-anchor': 'middle' }, `+${cards.length - shown}`)));
  }
  return g;
}

const JOKER_COLOURS = ['#d62f4b', '#e9a100', '#1f9d55', '#2f6fd6'];

// One little card at (x, 0). Special cards get a centred face and their own
// colours (style.css: .scard.sp.joker.mono / .joker.colour / .ad.front / .ad.back).
function cardSvg(c, x, house) {
  const g = s('g', { class: `scard ${cardClass(c)}${house ? ' house' : ''}`, transform: `translate(${x},0)` },
    s('rect', { width: CARD_W, height: CARD_H, rx: 2.2 }));
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

  // state: { cells, selected (key), activePort, hover {at, side, edge}, live (Floor), alert (key), ghost {at, tool} }
  render(state) {
    const { cells, live } = state;
    this.paidNow = state.paidNow;
    this.paidWrong = state.paidWrong;
    const svg = this.svg;
    svg.replaceChildren();
    const gFloor = s('g', { class: 'l-floor' }), gBody = s('g', { class: 'l-body' });
    const gArrow = s('g', { class: 'l-arrows' }), gCards = s('g', { class: 'l-cards' }), gOver = s('g', { class: 'l-over' });
    svg.append(gFloor, gBody, gArrow, gCards, gOver);

    const fixedKeys = new Set(this.level.fixed.map((c) => hexKey(c.at)));
    for (const at of this.level.floor) {
      if (fixedKeys.has(hexKey(at))) continue;
      const [x, y] = center(at);
      gFloor.append(s('polygon', { class: 'hex floor', points: HEX, transform: `translate(${x},${y})`, 'data-at': hexKey(at) }));
    }

    const all = [...this.level.fixed, ...cells];
    const liveCells = live ? live.cells : null;
    for (const cell of all) {
      const k = hexKey(cell.at);
      const [x, y] = center(cell.at);
      const t = `translate(${x.toFixed(2)},${y.toFixed(2)})`;
      const selected = state.selected === k;
      gBody.append(this.bodySvg(cell, t, selected, state.alert === k, live));
      gArrow.append(this.arrowsSvg(cell, t, selected ? state.activePort : null));
      if (liveCells) {
        const lc = liveCells.get(k);
        if (lc) gCards.append(this.liveSvg(lc, t, live));
      }
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
          const hot = state.hover && hexKey(state.hover.at) === state.selected && state.hover.edge && state.hover.side === d;
          g.append(s('line', {
            class: `edge-hint${hot ? ' hot' : ''}`, x1, y1, x2, y2, stroke: hot ? st.color : undefined,
          }));
          if (hot) {
            const [ux, uy] = unit(d);
            g.append(s('text', { class: 'edge-tip', x: ux * (AP + 12), y: uy * (AP + 12) + 3, 'text-anchor': 'middle' },
              `${st.label} → ${SIDE_NAMES[d]}`));
          }
        }
        gOver.append(g);
      }
    }
    if (state.hover && !state.drag && this.isBuildable(state.hover.at) && state.tool &&
      !cells.some((c) => hexKey(c.at) === hexKey(state.hover.at))) {
      const [x, y] = center(state.hover.at);
      gOver.append(s('polygon', { class: 'hex ghost', points: HEX_IN, transform: `translate(${x},${y})` }));
    }
    if (state.drag && state.drag.over) {
      const [x, y] = center(state.drag.over);
      const ok = this.isBuildable(state.drag.over);
      gOver.append(s('polygon', { class: `hex drop ${ok ? 'ok' : 'bad'}`, points: HEX_IN, transform: `translate(${x},${y})` }));
    }
  }

  bodySvg(cell, t, selected, alert, live) {
    const g = s('g', { class: `cell ${cell.kind}${selected ? ' selected' : ''}${alert ? ' alert' : ''}`, transform: t, 'data-at': hexKey(cell.at) });
    if (cell.kind === 'source') {
      g.append(s('polygon', { class: 'hex src', points: HEX }),
        s('rect', { class: 'cardback', x: -11, y: -22, width: 22, height: 30, rx: 3 }),
        s('rect', { class: 'cardback-inner', x: -8, y: -19, width: 16, height: 24, rx: 2 }),
        s('text', { class: 'fixed-label', y: 22, 'text-anchor': 'middle' }, 'PLAYER'));
      if (live && this.level.fixed.filter((c) => c.kind === 'source').length === 1) {
        const left = live.inputs.length - live.inputPos + live.cells.get(hexKey(cell.at)).pending.length;
        g.append(s('text', { class: 'src-count', y: -3, 'text-anchor': 'middle' }, String(left)));
      }
      g.append(s('title', {}, 'Card player: hands out the test hands'));
      return g;
    }
    if (cell.kind === 'payout') {
      g.append(s('polygon', { class: 'hex desk', points: HEX }));
      for (let i = 0; i < 4; i++) {
        g.append(s('ellipse', { class: 'deskchip', cx: 0, cy: 2 - i * 5, rx: 15, ry: 5.5 }));
      }
      g.append(s('text', { class: 'desk-sign', y: -14, 'text-anchor': 'middle' }, '$'),
        s('text', { class: 'fixed-label dark', y: 26, 'text-anchor': 'middle' }, 'CHIP DESK'));
      if (live && live.paid.length) {
        g.append(s('circle', { class: 'paid-badge', cx: 24, cy: -22, r: 10 }),
          s('text', { class: 'paid-badge-t', x: 24, y: -18.5, 'text-anchor': 'middle' }, String(live.paid.length)));
      }
      g.append(s('title', {}, 'Chip desk: hands that reach it are paid out'));
      return g;
    }
    const info = infoFor(cell) ?? { family: '#555', name: cell.fn };
    g.append(s('polygon', { class: 'hex table', points: HEX }),
      s('polygon', { class: 'hex table-in', points: HEX_IN }));
    const chip = s('g', { class: 'chip' },
      s('circle', { r: CHIP, fill: info.family }),
      s('circle', { class: 'chip-ring', r: CHIP - 2.5 }),
      s('circle', { class: 'chip-face', r: CHIP - 6 }));
    const label = chipLabel(cell);
    chip.append(s('text', { class: `chip-t${label.length > 4 ? ' small' : ''}`, y: 3.3, 'text-anchor': 'middle' }, label));
    g.append(chip);
    if (cell.kind === 'croupier') {
      // Placeholder until the croupier art exists: a small chevron showing
      // which side the croupier faces (it looks there first, then clockwise).
      const d = (live ? live.cells.get(hexKey(cell.at))?.facing : cell.facing) ?? 0;
      g.append(s('polyline', {
        class: 'facing', points: `${CHIP + 2},-4 ${CHIP + 6},0 ${CHIP + 2},4`, transform: `rotate(${d * 60})`,
      }, s('title', {}, 'Facing: looks for cards on this side first, then clockwise')));
    }
    if (cell.kind === 'shoe') {
      const deck = cell.deck ?? [];
      const prev = deck.slice(0, 3).map(cardText).join(' ') + (deck.length > 3 ? ' …' : '');
      g.append(s('text', { class: 'shoe-deck', y: CHIP + 11, 'text-anchor': 'middle' }, prev + (cell.once ? ' ¹' : '')));
    }
    g.append(s('title', {}, `${info.name}: ${info.desc}`));
    return g;
  }

  arrowsSvg(cell, t, activePort) {
    const g = s('g', { transform: t, class: 'arrows' });
    // Input markers (war dealer side, gather under side): a bar on the edge
    // and a lettered badge.
    for (const p of ['dealer', 'under']) {
      if (cell.kind !== 'croupier' || cell[p] === undefined) continue;
      if (!(p === 'dealer' ? cell.fn === 'war' : cell.fn === 'gather')) continue;
      const d = cell[p];
      const st = PORT_STYLE[p];
      const [[x1, y1], [x2, y2]] = edge(d, R - 4, 0.62);
      const [ux, uy] = unit(d);
      g.append(s('line', { class: 'in-mark', x1, y1, x2, y2, stroke: st.color }));
      const bx = ux * (AP - 12), by = uy * (AP - 12);
      g.append(s('g', { class: `badge${activePort === p ? ' active' : ''}`, transform: `translate(${bx.toFixed(1)},${by.toFixed(1)})` },
        s('title', {}, `${st.label} side`),
        s('circle', { r: 6, fill: st.color }),
        s('text', { y: 2.6, 'text-anchor': 'middle' }, st.short)));
    }
    const groups = new Map();
    for (const [side, port, idx] of arrowsOf(cell)) {
      if (!groups.has(side)) groups.set(side, []);
      groups.get(side).push([port, idx]);
    }
    const isFixed = cell.kind === 'source';
    for (const [side, ports] of groups) {
      const st = PORT_STYLE[ports[0][0]];
      const [ux, uy] = unit(side);
      const r0 = isFixed ? 16 : CHIP + 1, r1 = AP + 1;
      g.append(s('line', { class: 'port-line', x1: ux * r0, y1: uy * r0, x2: ux * (r1 - 6), y2: uy * (r1 - 6), stroke: st.color }));
      // arrowhead straddling the edge
      const bx = ux * (r1 - 7), by = uy * (r1 - 7), tx = ux * (r1 + 6), ty = uy * (r1 + 6);
      const px = -uy * 6, py = ux * 6;
      g.append(s('polygon', { class: 'port-head', fill: st.color, points: `${bx + px},${by + py} ${tx},${ty} ${bx - px},${by - py}` }));
      if (isFixed || (ports.length === 1 && ports[0][0] === 'out')) continue;
      // One pill per port (deal: one pill listing the deal positions),
      // laid side by side along the edge.
      const pills = ports[0][0] === 'to'
        ? [[ports.map(([, i]) => i).join('·'), st.color, activePort === 'to']]
        : ports.map(([p]) => [PORT_STYLE[p].short, PORT_STYLE[p].color, p === activePort]);
      const widths = pills.map(([text]) => pillWidth(text));
      const horizontal = Math.abs(uy) > 0.1; // tangent mostly horizontal for the slanted sides
      const gap = 2;
      const along = horizontal ? widths : widths.map(() => 12);
      const total = along.reduce((x, y) => x + y, 0) + gap * (pills.length - 1);
      const rr = AP - 15;
      const cx = ux * rr, cy = uy * rr;
      let off = -total / 2;
      pills.forEach(([text, color, active], i) => {
        const mid = off + along[i] / 2;
        off += along[i] + gap;
        const x = horizontal ? cx + mid : cx, y = horizontal ? cy : cy + mid;
        g.append(this.pill(text, color, x, y, active));
      });
    }
    return g;
  }

  pill(text, color, x, y, active) {
    const w = pillWidth(text);
    return s('g', { class: `pill${active ? ' active' : ''}`, transform: `translate(${x.toFixed(1)},${y.toFixed(1)})` },
      s('rect', { x: -w / 2, y: -5.5, width: w, height: 11, rx: 5.5, fill: color }),
      s('text', { y: 2.5, 'text-anchor': 'middle' }, text));
  }

  liveSvg(lc, t, floor) {
    const g = s('g', { transform: t, class: 'live' });
    if (lc.kind === 'payout') {
      if (this.paidNow) g.append(handSvg(this.paidNow, 0, -2, `paid-now${this.paidWrong ? ' wrong' : ''}`));
      return g;
    }
    lc.slots.forEach((hand, d) => {
      if (!hand) return;
      const [x, y] = sidePos(d, hand.length);
      g.append(handSvg(hand, x, y, 'slot'));
    });
    for (const [side, hand] of lc.pending) {
      if (lc.kind === 'shoe' || !hand.length) {
        if (lc.kind === 'shoe') {
          const [x, y] = sidePos(side, 1, 0.62);
          g.append(handSvg(hand, x, y, 'pending'));
        }
        continue;
      }
      const [x, y] = sidePos(side, hand.length, 0.62);
      g.append(handSvg(hand, x, y, 'pending'));
    }
    if (lc.held) {
      if (lc.fn === 'gather') {
        g.append(handSvg(lc.held[0], 0, 4, 'held'), s('text', { class: 'held-tag', x: 0, y: -8.5, 'text-anchor': 'middle' }, 'held'));
      } else if (lc.fn === 'war') {
        const { player, dealer } = lc.held;
        if (player) g.append(handSvg(player, 0, 4, 'held'), s('text', { class: 'held-tag', x: 0, y: -8.5, 'text-anchor': 'middle' }, 'player'));
        if (dealer) g.append(handSvg(dealer, 0, 4, 'held dealer'), s('text', { class: 'held-tag', x: 0, y: -8.5, 'text-anchor': 'middle' }, 'dealer'));
      } else if (lc.fn === 'hand' && lc.held.buffer?.length) {
        // The cards a Hand croupier is collecting, with how many it needs.
        const buf = lc.held.buffer, n = lc.n ?? 5;
        g.append(handSvg(buf, 0, 4, `held hand-buffer${buf.length >= n ? ' full' : ''}`),
          s('text', { class: 'held-tag', x: 0, y: -8.5, 'text-anchor': 'middle' }, `held ${buf.length}/${n}`));
      }
    }
    return g;
  }
}
