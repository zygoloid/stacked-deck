// SVG rendering of a casino floor: hexes, tables, port arrows and live cards.
import { s, SUIT_GLYPH, rankText, cardText, cardName, cardClass, isSpecialCard, SPECIAL_FACE } from './dom.js';
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

function axialRound(fq, fr) {
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
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

const JOKER_COLOURS = ['#d62f4b', '#e9a100', '#1f9d55', '#2f6fd6'];

// One little card at (x, y). Special cards get a centred face and their own
// colours (style.css: .scard.sp.joker.mono / .joker.colour / .ad.front / .ad.back).
function cardSvg(c, x, house, y = 0, opacity = 1) {
  const g = s('g', {
    class: `scard ${cardClass(c)}${house ? ' house' : ''}`, transform: `translate(${x.toFixed(1)},${y.toFixed(1)})`,
    opacity: opacity < 1 ? opacity.toFixed(2) : undefined,
  }, s('rect', { width: CARD_W, height: CARD_H, rx: 2.2 }));
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
  //   anim {from, t} }
  // anim moves the live cards from where they were drawn before the last step
  // (`from`: this.positions then) toward where they are now, t from 0 to 1.
  render(state) {
    const { cells, live } = state;
    this.paidNow = state.paidNow;
    this.paidNowDesk = state.paidNowDesk;
    this.paidWrong = state.paidWrong;
    this.anim = live ? state.anim : null;
    if (this.anim) {
      // Cards that left the floor in the step (paid or dropped): the chip
      // desk's hand is matched to them by card, the rest fade out.
      if (!this.anim.vanished) {
        const present = new Set();
        for (const lc of live.cells.values()) for (const hand of liveHands(lc)) hand.forEach((x) => present.add(x));
        this.anim.vanished = [...this.anim.from].filter(([x]) => !present.has(x)).map(([, p]) => p);
      }
      this.pool = [...this.anim.vanished];
    }
    // Card object -> where it is drawn (for the next step's animation), and
    // what a collapsed stack or label holds ([data-peek] indexes this).
    this.positions = new Map();
    this.peeks = [];
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
        if (lc) gCards.append(this.liveSvg(lc, t, [x, y]));
      }
    }
    // Dropped cards fade out where they were.
    if (this.anim && this.anim.t < 1) {
      for (const p of this.pool) gCards.append(cardSvg(p.c, p.x, p.house, p.y, 1 - ease(this.anim.t)));
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
        s('text', { class: 'fixed-label', y: 22, 'text-anchor': 'middle' }, cell.seat === undefined ? 'PLAYER' : `PLAYER ${'ABCDEF'[cell.seat]}`));
      // Hands still to come: a lone player's, or a seated player's own.
      const seated = cell.seat !== undefined;
      if (live && (seated || this.level.fixed.filter((c) => c.kind === 'source').length === 1)) {
        const st = live.cells.get(hexKey(cell.at));
        const mine = seated ? live.inputs.filter((x, i) => x && i % live.seats === cell.seat).length : live.total;
        const left = mine - (seated ? st.pos : live.inputPos) + st.pending.length;
        g.append(s('text', { class: 'src-count', y: -3, 'text-anchor': 'middle' }, String(left)));
      }
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
      // Hands paid here (on a floor with labelled desks, at this desk).
      const paid = live ? live.paidAt.filter((d) => d === cell.desk).length : 0;
      if (paid) {
        g.append(s('circle', { class: 'paid-badge', cx: 24, cy: -22, r: 10 }),
          s('text', { class: 'paid-badge-t', x: 24, y: -18.5, 'text-anchor': 'middle' }, String(paid)));
      }
      g.append(s('title', {}, cell.desk === undefined ? 'Chip desk: hands that reach it are paid out'
        : `Chip desk ${DESK_NAMES[cell.desk]}: hands that reach it are paid out here (marked → ${DESK_NAMES[cell.desk]} in the expected payouts)`));
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
      const label = s('text', { class: 'shoe-deck', y: CHIP + 11, 'text-anchor': 'middle' }, prev + (cell.once ? ' ¹' : ''));
      if (deck.length > 3) {
        // The whole deck on hover or tap (an invisible hit area: text ignores the pointer).
        const w = [...label.textContent].length * 4.2 + 6;
        g.append(s('g', { class: 'peekable', 'data-peek': this.peek({ cards: deck, title: `Shoe deck (${deck.length} cards, top first)` }) },
          s('rect', { class: 'peek-hit', x: -w / 2, y: CHIP + 4, width: w, height: 9 }), label));
      } else g.append(label);
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
      // One pill per port (deal: one pill listing the deal positions,
      // collapsed to fit the hex), laid side by side along the edge.
      const horizontal = Math.abs(uy) > 0.1; // tangent mostly horizontal for the slanted sides
      let pills;
      if (ports[0][0] === 'to') {
        const { text, full } = dealLabel(ports.map(([, i]) => i), horizontal ? 40 : 26);
        const peek = text === full ? null : this.peek({ text: `Deals cards ${full.replace(/·/g, ', ')} to ${SIDE_NAMES[side]}` });
        pills = [[text, st.color, activePort === 'to', peek]];
      } else {
        pills = ports.map(([p]) => [PORT_STYLE[p].short, PORT_STYLE[p].color, p === activePort]);
      }
      const widths = pills.map(([text]) => pillWidth(text));
      const gap = 2;
      const along = horizontal ? widths : widths.map(() => 12);
      const total = along.reduce((x, y) => x + y, 0) + gap * (pills.length - 1);
      const rr = AP - 15;
      const cx = ux * rr, cy = uy * rr;
      let off = -total / 2;
      pills.forEach(([text, color, active, peek], i) => {
        const mid = off + along[i] / 2;
        off += along[i] + gap;
        const x = horizontal ? cx + mid : cx, y = horizontal ? cy : cy + mid;
        g.append(this.pill(text, color, x, y, active, peek));
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

  // Register what a collapsed stack or label holds; returns its [data-peek] index.
  peek(item) {
    this.peeks.push(item);
    return this.peeks.length - 1;
  }

  // Where a card drawn at (ax, ay) (board coordinates) is during the step
  // animation: [dx, dy, opacity]. Cards that were on the floor before slide
  // from there; the chip desk's cards come from cards that left the floor;
  // new cards fade in.
  motion(card, c, ax, ay) {
    const a = this.anim;
    if (!a || a.t >= 1) return [0, 0, 1];
    let from = card && typeof card === 'object' ? a.from.get(card) : undefined;
    if (!from && typeof card === 'string') {
      const i = this.pool.findIndex((p) => p.c === c);
      if (i >= 0) [from] = this.pool.splice(i, 1);
    }
    if (!from) return [0, 0, ease(a.t)];
    const k = 1 - ease(a.t);
    return [(from.x - ax) * k, (from.y - ay) * k, 1];
  }

  // A hand as little cards centred on (x, y) in a cell at `origin` (board
  // coordinates). Live hands are [{c, src}]. Long hands show their first
  // cards and a "+n" card; hovering or tapping it shows them all.
  handSvg(hand, x, y, cls, [ox, oy]) {
    const cards = hand.map((v) => (typeof v === 'string' ? v : v.c));
    const house = hand.map((v) => typeof v !== 'string' && v.src === 'house');
    const shown = cards.length > MAX_SHOWN ? MAX_SHOWN - 1 : cards.length;
    const n = shown + (cards.length > shown ? 1 : 0);
    const w = CARD_W + (n - 1) * CARD_STEP;
    const x0 = x - w / 2, y0 = y - CARD_H / 2;
    const collapsed = cards.length > shown;
    const g = s('g', {
      class: `hand ${cls}${collapsed ? ' peekable' : ''}`, transform: `translate(${x0.toFixed(1)},${y0.toFixed(1)})`,
      'data-peek': collapsed ? this.peek({ cards, house, title: `${cards.length} cards, top first` }) : undefined,
    });
    if (!collapsed) g.append(s('title', {}, cards.map(cardName).join(' ') + (house.some(Boolean) ? '  (house cards dashed)' : '')));
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
      const [dx, dy, op] = this.motion(hand[i], cards[i], ax, ay);
      for (let j = i; j < i + k; j++) {
        if (typeof hand[j] === 'object') this.positions.set(hand[j], { x: ax + dx, y: ay + dy, c: cards[j], house: house[j] });
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
        s('rect', { width: CARD_W, height: CARD_H, rx: 2.2 }),
        s('text', { x: CARD_W / 2, y: 13, 'text-anchor': 'middle' }, `+${cards.length - shown}`)));
    }
    return g;
  }

  liveSvg(lc, t, origin) {
    const g = s('g', { transform: t, class: 'live' });
    const hand = (cards, x, y, cls) => this.handSvg(cards, x, y, cls, origin);
    if (lc.kind === 'payout') {
      // (On a floor with labelled desks, only at the desk it was paid at.)
      if (this.paidNow && this.paidNowDesk === lc.desk) g.append(hand(this.paidNow, 0, -2, `paid-now${this.paidWrong ? ' wrong' : ''}`));
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
      const tray = hand(cards, x, y, 'slot');
      if (Math.hypot(x, y) - k >= 6) {
        const bx = x - ux * k, by = y - uy * k;
        const px = -uy * 3.2, py = ux * 3.2;
        g.append(s('polygon', {
          class: 'tray-notch', opacity: this.arriving < 1 ? this.arriving.toFixed(2) : undefined,
          points: `${(bx + px).toFixed(1)},${(by + py).toFixed(1)} ${(bx - ux * 4).toFixed(1)},${(by - uy * 4).toFixed(1)} ${(bx - px).toFixed(1)},${(by - py).toFixed(1)}`,
        }));
      }
      g.append(tray);
    });
    for (const [side, cards] of lc.pending) {
      if (!cards.length) continue;
      const [x, y] = sidePos(side, lc.kind === 'shoe' ? 1 : cards.length, 0.62);
      g.append(hand(cards, x, y, 'pending'));
    }
    // Hands a croupier holds while it waits for more: on a plate in the
    // middle, with a badge saying what it is waiting with.
    const held = (cards, cls, tag) => {
      g.append(hand(cards, 0, 4, `held ${cls}`));
      const w = tag.length * 4.6 + 8;
      g.append(s('g', { class: 'held-badge', transform: 'translate(0,-10)', opacity: this.arriving < 1 ? this.arriving.toFixed(2) : undefined },
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
