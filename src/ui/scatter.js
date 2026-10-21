// Rounds-vs-croupiers scatter plot of a floor's saved solutions (plain SVG).
//
//   scatterPlot({ solutions, par, current, fresh, others, onPick }) -> element
//   solutionList({ solutions, current, fresh, onPick, onDelete })   -> element
//
// solutions: [{ croupiers, rounds, at }] (the save's list, indexes are passed
//            back to onPick / onDelete)
// par:       { croupiers, rounds } or null
// current:   index of the solution loaded in the editor, or -1
// height, width: drawing size in SVG units (it scales to the container's width;
//            width defaults to a narrower drawing on phones)
// fresh:     index of the solution just found, or -1 (freshIsNew: false when
//            it was already saved)
// others:    optional [{ croupiers, rounds, count }]: other players' solutions,
//            drawn as faint background markers sized by count (not used yet)
import { h, s } from './dom.js';

const M = { l: 48, r: 18, t: 18, b: 42 };

// Solutions not beaten on both axes by another one (by index).
export function frontierOf(solutions) {
  const out = new Set();
  solutions.forEach((a, i) => {
    const beaten = solutions.some((b) => b.croupiers <= a.croupiers && b.rounds <= a.rounds &&
      (b.croupiers < a.croupiers || b.rounds < a.rounds));
    if (!beaten) out.add(i);
  });
  return out;
}

const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
export const scoreText = (p) => `${plural(p.croupiers, 'croupier')} · ${plural(p.rounds, 'round')}`;
export function dateText(t) {
  if (!t) return '';
  const d = new Date(t);
  return `${d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}, ${d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`;
}

function niceStep(span, target) {
  const raw = Math.max(span, 1) / target;
  const mag = 10 ** Math.floor(Math.log10(raw));
  for (const m of [1, 2, 5, 10]) if (m * mag >= raw) return Math.max(1, m * mag);
  return Math.max(1, 10 * mag);
}

// Integer axis covering the values with a little room, snapped to its ticks.
function axis(values, target, minSpan) {
  let lo = Math.min(...values), hi = Math.max(...values);
  const pad = Math.max(1, Math.ceil((hi - lo) * 0.12));
  lo = Math.max(0, lo - pad); hi += pad;
  while (hi - lo < minSpan) { hi++; if (hi - lo < minSpan && lo > 0) lo--; }
  const step = niceStep(hi - lo, target);
  lo = Math.floor(lo / step) * step;
  hi = Math.ceil(hi / step) * step;
  const ticks = [];
  for (let v = lo; v <= hi + 1e-9; v += step) ticks.push(v);
  return { lo, hi, ticks };
}

export function scatterPlot({
  solutions, par = null, current = -1, fresh = -1, freshIsNew = true, others = [], onPick, height = 300, width,
}) {
  // A narrower drawing on phones, so the text isn't scaled down to nothing.
  const W = width ?? (window.innerWidth < 640 ? 360 : 520);
  const H = width || window.innerWidth >= 640 ? height : Math.round(height * 0.85);
  const pw = W - M.l - M.r, ph = H - M.t - M.b;
  const pts = [...solutions, ...(par?.croupiers != null && par?.rounds != null ? [par] : []), ...others];
  const xa = axis(pts.length ? pts.map((p) => p.croupiers) : [1], 8, 4);
  const ya = axis(pts.length ? pts.map((p) => p.rounds) : [10], 5, 4);
  const X = (v) => M.l + ((v - xa.lo) / (xa.hi - xa.lo)) * pw;
  const Y = (v) => M.t + ph - ((v - ya.lo) / (ya.hi - ya.lo)) * ph;
  const front = frontierOf(solutions);

  const tip = h('div', { class: 'sc-tip hidden', role: 'tooltip' });
  const svg = s('svg', { class: 'sc-svg', viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'Your solutions: rounds against croupiers' });
  const wrap = h('div', { class: 'scatter' }, svg, tip);

  // grid and ticks
  const g = s('g', { class: 'sc-axes' });
  for (const v of xa.ticks) {
    g.append(s('line', { class: 'sc-grid', x1: X(v), x2: X(v), y1: M.t, y2: M.t + ph }),
      s('text', { class: 'sc-tick', x: X(v), y: M.t + ph + 15, 'text-anchor': 'middle' }, String(v)));
  }
  for (const v of ya.ticks) {
    g.append(s('line', { class: 'sc-grid', x1: M.l, x2: M.l + pw, y1: Y(v), y2: Y(v) }),
      s('text', { class: 'sc-tick', x: M.l - 7, y: Y(v) + 3.5, 'text-anchor': 'end' }, String(v)));
  }
  g.append(
    s('path', { class: 'sc-axis', d: `M${M.l} ${M.t} V${M.t + ph} H${M.l + pw}` }),
    s('text', { class: 'sc-label', x: M.l + pw / 2, y: H - 6, 'text-anchor': 'middle' }, 'Croupiers'),
    s('text', { class: 'sc-label', transform: `translate(13 ${M.t + ph / 2}) rotate(-90)`, 'text-anchor': 'middle' }, 'Rounds'),
    s('text', { class: 'sc-better', x: M.l + 8, y: M.t + ph - 8 }, '↙ better'));
  svg.append(g);

  // other players: faint background
  if (others.length) {
    const maxN = Math.max(...others.map((o) => o.count ?? 1));
    svg.append(s('g', { class: 'sc-others' }, others.map((o) => s('circle', {
      cx: X(o.croupiers), cy: Y(o.rounds), r: 2.5 + 7 * Math.sqrt((o.count ?? 1) / maxN),
    }))));
  }

  // par: dashed guides to both axes here, and a diamond drawn over the points
  const hasPar = par?.croupiers != null && par?.rounds != null;
  const isPar = (p) => hasPar && p.croupiers === par.croupiers && p.rounds === par.rounds;
  if (hasPar) svg.append(s('path', { class: 'sc-par-guide', d: `M${M.l} ${Y(par.rounds)} H${X(par.croupiers)} V${M.t + ph}` }));

  // frontier: a staircase through the unbeaten points, shading what they beat
  const fpts = [...front].map((i) => solutions[i])
    .filter((p, i, a) => a.findIndex((q) => q.croupiers === p.croupiers && q.rounds === p.rounds) === i)
    .sort((a, b) => a.croupiers - b.croupiers);
  if (fpts.length) {
    let d = `M${X(fpts[0].croupiers)} ${M.t} V${Y(fpts[0].rounds)}`;
    for (let i = 1; i < fpts.length; i++) d += ` H${X(fpts[i].croupiers)} V${Y(fpts[i].rounds)}`;
    d += ` H${M.l + pw}`;
    svg.append(
      s('path', { class: 'sc-beaten', d: `${d} V${M.t} Z` }),
      s('path', { class: 'sc-front', d }));
  }

  // points; machines with the same score are spread out side by side
  const groups = new Map();
  solutions.forEach((p, i) => {
    const k = `${p.croupiers},${p.rounds}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(i);
  });
  const colW = pw / (xa.hi - xa.lo);
  const order = solutions.map((_, i) => i).sort((a, b) => (front.has(a) - front.has(b)) || ((a === current) - (b === current)));
  const layer = s('g', { class: 'sc-points' });
  const pos = new Map();
  for (const idx of groups.values()) {
    const step = idx.length > 1 ? Math.min(13, (colW * 0.7) / (idx.length - 1)) : 0;
    idx.forEach((i, j) => pos.set(i, [X(solutions[i].croupiers) + (j - (idx.length - 1) / 2) * step, Y(solutions[i].rounds)]));
    if (idx.length > 1) {
      const [x0] = pos.get(idx[idx.length - 1]);
      layer.append(s('text', { class: 'sc-count', x: x0 + 9, y: Y(solutions[idx[0]].rounds) - 8 }, `×${idx.length}`));
    }
  }
  for (const i of order) {
    const p = solutions[i];
    const [x, y] = pos.get(i);
    const cls = ['sc-pt', front.has(i) ? 'front' : 'beaten', i === current ? 'current' : '', i === fresh ? 'fresh' : ''].filter(Boolean).join(' ');
    const same = groups.get(`${p.croupiers},${p.rounds}`).length;
    const pt = s('g', { class: cls, 'data-index': i, tabindex: 0, role: 'button', 'aria-label': `${scoreText(p)}. Load this solution.` },
      i === fresh ? s('circle', { class: 'sc-halo', cx: x, cy: y, r: 13 }) : null,
      i === current ? s('circle', { class: 'sc-ring', cx: x, cy: y, r: 10 }) : null,
      s('circle', { class: 'sc-dot', cx: x, cy: y, r: front.has(i) ? 6.5 : 5 }),
      s('circle', { class: 'sc-hit', cx: x, cy: y, r: 12 }),
      i === fresh ? s('text', { class: 'sc-fresh-t', x, y: y - 16, 'text-anchor': 'middle' }, freshIsNew ? 'new' : 'this one') : null);
    hoverTip(pt, () => [
      h('b', {}, scoreText(p)),
      p.at ? h('div', { class: 'muted' }, `found ${dateText(p.at)}`) : null,
      h('div', { class: 'sc-tip-tags' },
        front.has(i) ? h('span', { class: 'sc-tag front' }, 'frontier') : h('span', { class: 'sc-tag' }, 'beaten'),
        i === current ? h('span', { class: 'sc-tag cur' }, 'loaded') : null,
        isPar(p) ? h('span', { class: 'sc-tag' }, 'par') : null,
        same > 1 ? h('span', { class: 'sc-tag' }, `1 of ${same} with this score`) : null),
      onPick ? h('div', { class: 'muted small' }, 'Click to load it') : null,
    ]);
    if (onPick) {
      pt.addEventListener('click', () => onPick(i));
      pt.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); onPick(i); } });
    }
    layer.append(pt);
  }
  svg.append(layer);
  if (hasPar) {
    const px = X(par.croupiers), py = Y(par.rounds);
    svg.append(s('g', { class: 'sc-par' },
      s('rect', { class: 'sc-par-mark', x: px - 8, y: py - 8, width: 16, height: 16, transform: `rotate(45 ${px} ${py})` }),
      s('text', { class: 'sc-par-t', x: px + 12, y: py + 19 }, `par ${par.croupiers}/${par.rounds}`)));
  }

  function hoverTip(el, content) {
    const show = () => {
      tip.replaceChildren(...content().flat().filter(Boolean));
      tip.classList.remove('hidden');
      const wr = wrap.getBoundingClientRect(), er = el.getBoundingClientRect();
      const cx = er.left + er.width / 2 - wr.left, top = er.top - wr.top;
      const tw = tip.offsetWidth;
      tip.style.left = `${Math.max(4, Math.min(wr.width - tw - 4, cx - tw / 2))}px`;
      const above = top - tip.offsetHeight - 6;
      tip.style.top = `${above >= 0 ? above : er.bottom - wr.top + 6}px`;
    };
    const hide = () => tip.classList.add('hidden');
    el.addEventListener('pointerenter', show);
    el.addEventListener('pointerleave', hide);
    el.addEventListener('focus', show);
    el.addEventListener('blur', hide);
  }

  wrap.append(h('div', { class: 'sc-legend' },
    h('span', {}, h('i', { class: 'lg-dot front' }), 'your frontier'),
    h('span', {}, h('i', { class: 'lg-dot beaten' }), 'beaten'),
    current >= 0 ? h('span', {}, h('i', { class: 'lg-dot ring' }), 'loaded now') : null,
    par ? h('span', {}, h('i', { class: 'lg-par' }), 'par') : null,
    others.length ? h('span', {}, h('i', { class: 'lg-dot others' }), 'other players') : null));
  return wrap;
}

// The saved solutions as rows (best croupiers first), each with load and delete.
export function solutionList({ solutions, current = -1, fresh = -1, onPick, onDelete }) {
  const front = frontierOf(solutions);
  const idx = solutions.map((_, i) => i).sort((a, b) => solutions[a].croupiers - solutions[b].croupiers || solutions[a].rounds - solutions[b].rounds || (solutions[a].at ?? 0) - (solutions[b].at ?? 0));
  return h('ol', { class: 'sol-list' }, idx.map((i) => {
    const p = solutions[i];
    return h('li', { class: `sol-row${i === current ? ' current' : ''}`, 'data-index': i },
      h('i', { class: `lg-dot ${front.has(i) ? 'front' : 'beaten'}${i === current ? ' ring' : ''}` }),
      h('button', { class: 'sol-load', title: 'Load this solution into the editor', onclick: () => onPick(i) },
        h('span', { class: 'sol-score' }, h('b', {}, String(p.croupiers)), ' croupiers · ', h('b', {}, String(p.rounds)), ' rounds'),
        h('span', { class: 'sol-date' }, dateText(p.at))),
      i === current ? h('span', { class: 'sc-tag cur' }, 'loaded') : null,
      i === fresh ? h('span', { class: 'sc-tag new' }, 'new') : null,
      h('button', { class: 'sol-del', title: 'Delete this solution', 'aria-label': `Delete the ${scoreText(p)} solution`, onclick: () => onDelete(i) }, '×'));
  }));
}
