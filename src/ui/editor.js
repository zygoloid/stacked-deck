// The level editor: palette, board, inspector, simulation and test runs.
import { runTest } from '../engine.js';
import { h, s, handEl, parseCards, fmtCards } from './dom.js';
import { Board, R } from './board.js';
import {
  CROUPIERS, PORT_STYLE, SIDE_NAMES, infoFor, newCell, portsOf, getPort, setPort, chipLabel,
} from './croupiers.js';
import {
  hexKey, sanitizeCells, toSpec, countCroupiers, levelSave, warRules,
} from './model.js';
import { Sim } from './sim.js';

const ARROW = ['→', '↘', '↙', '←', '↖', '↗'];
const SIDE_KEYS = { d: 0, c: 1, z: 2, a: 3, q: 4, e: 5 };
const SPEEDS = [
  { label: '1×', rate: 2 }, { label: '4×', rate: 8 }, { label: '16×', rate: 30 },
  { label: '64×', rate: 120 }, { label: 'Max', rate: Infinity },
];

export function openEditor(root, ctx, level, index) {
  const { save } = ctx;
  const ls = levelSave(save, level.id);
  let cells = sanitizeCells(level, ls.cells);
  let selected = null;            // hex key of the selected player cell
  let activePort = null;
  let tool = null;                // palette tool
  let hover = null;
  let drag = null;                // { kind: 'move'|'new', key|tool, x0, y0, active, over, overPalette }
  let lastSide = 0;
  const undo = [], redo = [];
  let sim = null, testIndex = 0, playing = false, speed = 1, raf = 0, lastT = 0, acc = 0;
  let runResults = null;          // results of checking every test
  let running = false;            // every test is being checked
  let deckDraft = null;           // { key, text, error }

  const cellAt = (key) => cells.find((c) => hexKey(c.at) === key);
  const selCell = () => (selected ? cellAt(selected) : null);

  // ---------- DOM skeleton ----------
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'board');
  const board = new Board(svg, level);
  const elCount = h('span', { class: 'stat-v' });
  const palette = h('aside', { class: 'palette' });
  const inspector = h('section', { class: 'panel inspector' });
  const testsPanel = h('section', { class: 'panel tests' });
  const transport = h('div', { class: 'transport' });
  const toast = h('div', { class: 'toast hidden' });
  const modal = h('div', { class: 'modal-host' });
  const chapterIdx = ctx.levelNumber(index);

  const par = level.par;
  root.replaceChildren(h('div', { class: 'editor' },
    h('header', { class: 'topbar' },
      h('button', { class: 'btn ghost', onclick: () => ctx.go('#/'), title: 'Level select' }, '← Floors'),
      h('div', { class: 'title' },
        h('span', { class: 'lvl-no' }, chapterIdx),
        h('span', { class: 'lvl-title' }, level.title)),
      h('div', { class: 'brief', title: 'The goal for this floor' }, level.brief ?? ''),
      h('div', { class: 'stats' },
        h('span', { class: 'stat', title: 'Croupiers placed (shoes included)' }, h('span', { class: 'stat-k' }, 'Croupiers'), elCount),
        par ? h('span', { class: 'stat par', title: 'Par from the reference solution' }, h('span', { class: 'stat-k' }, 'Par'),
          h('span', { class: 'stat-v' }, `${par.croupiers ?? '–'} / ${par.rounds ?? '–'}`)) : null),
      h('button', { class: 'btn ghost', onclick: () => ctx.go(`#/level/${level.id}/story`), title: 'Read the story again' }, 'Story'),
      h('button', { class: 'btn ghost', onclick: () => ctx.help(), title: 'Help (?)' }, '? Help')),
    palette,
    h('main', { class: 'stage' }, h('div', { class: 'board-wrap' }, svg, toast,
      h('div', { class: 'zoom' },
        h('button', { title: 'Zoom in (+)', onclick: () => zoomCenter(1 / 1.25) }, '+'),
        h('button', { title: 'Zoom out (-)', onclick: () => zoomCenter(1.25) }, '−'),
        h('button', { title: 'Fit the floor (0)', onclick: () => board.fit() }, '⤢'))), transport),
    h('aside', { class: 'side' }, inspector, testsPanel),
    modal));

  // ---------- editing ----------
  function commit(fn) {
    undo.push(JSON.stringify(cells));
    if (undo.length > 200) undo.shift();
    redo.length = 0;
    fn();
    changed();
  }
  function changed() {
    ls.cells = cells;
    ctx.persist();
    resetSim();
    runResults = null;
    renderAll();
  }
  function restoreCells(json) {
    cells = JSON.parse(json);
    if (selected && !cellAt(selected)) selected = null;
    changed();
  }

  function place(toolName, at) {
    if (!board.isBuildable(at) || cellAt(hexKey(at))) return;
    commit(() => {
      const c = newCell(toolName, at, lastSide);
      if (c.fn === 'war') c.rule = warRules(level)[0];
      cells.push(c);
      selected = hexKey(at);
      activePort = firstOpenPort(c);
    });
  }
  function move(key, at) {
    const c = cellAt(key);
    if (!c || !board.isBuildable(at) || cellAt(hexKey(at))) return;
    commit(() => { c.at = [...at]; selected = hexKey(at); });
  }
  function remove(key) {
    if (!cellAt(key)) return;
    commit(() => {
      cells = cells.filter((c) => hexKey(c.at) !== key);
      if (selected === key) selected = null;
    });
  }
  function select(key) {
    if (selected !== key) {
      selected = key;
      deckDraft = null;
      const c = selCell();
      activePort = c ? firstOpenPort(c) : null;
    }
    renderBoard(); renderInspector();
  }
  function firstOpenPort(c) {
    const ports = portsOf(c);
    return ports.find((p) => p !== 'to' && getPort(c, p) === undefined) ?? ports[0] ?? null;
  }
  // Point the active (or given) port of the selected cell at a side.
  function assign(side, port = activePort) {
    const c = selCell();
    if (!c || !port) return;
    commit(() => {
      if (port === 'to') { setPort(c, 'to', side); return; }
      const cur = getPort(c, port);
      setPort(c, port, cur === side ? undefined : side);
      if (side !== undefined && cur !== side) {
        if (portsOf(c)[0] === port) lastSide = side;
        // advance to the next port that still needs a side
        const ports = portsOf(c);
        const i = ports.indexOf(port);
        const next = [...ports.slice(i + 1), ...ports.slice(0, i)].find((p) => getPort(c, p) === undefined);
        if (next) activePort = next;
      }
    });
  }

  // ---------- simulation ----------
  function makeSim() {
    try {
      sim = new Sim(toSpec(level, cells), level.tests[testIndex], level.pays);
    } catch (e) {
      sim = null;
      showToast(`Can't run this floor: ${e.message}`, 'bad');
    }
    return sim;
  }
  function resetSim() {
    stop();
    sim = null;
    hideToast();
  }
  function stepOnce() {
    if (running) return;
    if (!sim && !makeSim()) return;
    if (sim.finished) { stop(); return; }
    sim.step();
    afterStep();
  }
  function afterStep() {
    if (sim.finished) {
      stop();
      reportStatus();
    }
    renderBoard(); renderTests(); renderTransport();
    // Once the watched test passes, check every test; that's how a floor is cleared.
    if (sim.finished && sim.status.kind === 'passed') checkAll();
  }
  function back() {
    if (!sim || running) return;
    stop();
    sim.back();
    hideToast();
    renderBoard(); renderTests(); renderTransport();
  }
  function play() {
    if (running) return;
    if (!sim && !makeSim()) return;
    if (sim.finished) { sim.reset(); hideToast(); }
    playing = true;
    lastT = performance.now();
    acc = 1; // take the first step right away
    raf = requestAnimationFrame(tick);
    renderTransport();
  }
  function stop() {
    playing = false;
    cancelAnimationFrame(raf);
    renderTransport();
  }
  function tick(t) {
    if (!playing || !sim) return;
    const rate = SPEEDS[speed].rate;
    const dt = Math.min(0.25, (t - lastT) / 1000);
    lastT = t;
    if (rate === Infinity) {
      const t0 = performance.now();
      while (!sim.finished && performance.now() - t0 < 14) sim.step();
    } else {
      acc += dt * rate;
      while (acc >= 1 && !sim.finished) { sim.step(); acc -= 1; }
    }
    if (sim.finished) { afterStep(); return; }
    renderBoard(); renderTests(); renderTransport();
    raf = requestAnimationFrame(tick);
  }
  function setTest(i) {
    if (running) return;
    testIndex = i;
    resetSim();
    renderAll();
  }
  function reportStatus() {
    const st = sim.status;
    if (st.kind === 'passed') showToast(`Test ${testIndex + 1} passed in ${st.rounds} rounds.`, 'good');
    else if (st.kind === 'wrong') showToast(`Wrong payout in round ${sim.round}: ${st.msg} Step back (,) to see how it got there.`, 'bad');
    else showToast(st.msg, 'bad');
  }

  async function checkAll() {
    if (running) return;
    const watched = testIndex;
    running = true;
    runResults = [];
    renderAll();
    let spec;
    try { spec = toSpec(level, cells); } catch (e) { showToast(e.message, 'bad'); running = false; return; }
    for (let i = 0; i < level.tests.length; i++) {
      await new Promise((r) => setTimeout(r, 0));
      let res;
      try { res = runTest(spec, level.tests[i], level.pays); } catch (e) { res = { ok: false, error: e.message, rounds: 0, wrong: [], missing: [] }; }
      runResults.push(res);
      renderTests();
    }
    running = false;
    const ok = runResults.every((r) => r.ok);
    if (ok) {
      const croupiers = countCroupiers(cells);
      const rounds = Math.round(runResults.reduce((a, r) => a + r.rounds, 0) / runResults.length);
      const prev = ls.best;
      const wasSolved = !!ls.solved;
      ls.solved = true;
      ls.best = {
        croupiers: Math.min(croupiers, prev?.croupiers ?? Infinity),
        rounds: Math.min(rounds, prev?.rounds ?? Infinity),
      };
      ls.last = { croupiers, rounds };
      ctx.persist();
      renderAll();
      showResults({ croupiers, rounds, prev, wasSolved });
    } else {
      const first = runResults.findIndex((r) => !r.ok);
      testIndex = first;
      resetSim();
      renderAll();
      const r = runResults[first];
      showToast(`Test ${watched + 1} passed, but test ${first + 1} fails: ${describeFailure(r)} Press play to watch it.`, 'bad');
    }
  }
  function describeFailure(r) {
    if (r.error) return r.error;
    if (r.wrong?.length) return `paid ${fmtCards(r.wrong[0])}, which should have been dropped.`;
    if (r.timeout) return `still running after ${r.rounds} rounds (${r.missing.length} hand${r.missing.length === 1 ? '' : 's'} never paid).`;
    if (r.missing?.length) return `${r.missing.length} winning hand${r.missing.length === 1 ? '' : 's'} never paid.`;
    return 'failed.';
  }

  // ---------- results ----------
  function showResults({ croupiers, rounds, prev, wasSolved }) {
    const next = ctx.nextLevel(index);
    const row = (label, v, best, parV, prevV) => h('div', { class: 'res-row' },
      h('div', { class: 'res-k' }, label),
      h('div', { class: 'res-v' }, String(v), prevV !== undefined && v < prevV ? h('span', { class: 'res-new' }, 'new best') : null),
      h('div', { class: 'res-sub' }, `best ${best}`, parV !== undefined ? ` · par ${parV}` : ''));
    const close = () => modal.replaceChildren();
    modal.replaceChildren(h('div', { class: 'modal-back', onclick: (e) => { if (e.target === e.currentTarget) close(); } },
      h('div', { class: 'modal results' },
        h('div', { class: 'res-suits' }, '♠ ♥ ♦ ♣'),
        h('h2', {}, wasSolved ? 'Floor cleared again' : 'Floor cleared!'),
        h('p', { class: 'res-sub' }, `${level.title}: all ${level.tests.length} tests passed.`),
        h('div', { class: 'res-grid' },
          row('Croupiers', croupiers, ls.best.croupiers, par?.croupiers, prev?.croupiers),
          row('Rounds', rounds, ls.best.rounds, par?.rounds, prev?.rounds)),
        h('div', { class: 'modal-actions' },
          h('button', { class: 'btn', onclick: close }, 'Keep tinkering'),
          h('button', { class: 'btn', onclick: () => ctx.go('#/') }, 'All floors'),
          next ? h('button', { class: 'btn gold', autofocus: true, onclick: () => ctx.go(`#/level/${next.id}/story`) }, `Next: ${next.title} →`) : null))));
    modal.querySelector('.btn.gold, .btn')?.focus();
  }

  // ---------- toast ----------
  function showToast(msg, kind = '') {
    toast.className = `toast ${kind}`;
    toast.replaceChildren(h('span', {}, msg), h('button', { class: 'toast-x', onclick: hideToast, title: 'Dismiss' }, '×'));
  }
  function hideToast() { toast.className = 'toast hidden'; }

  // ---------- rendering ----------
  function renderAll() {
    elCount.textContent = String(countCroupiers(cells));
    renderPalette(); renderBoard(); renderInspector(); renderTests(); renderTransport();
  }

  function renderBoard() {
    const live = sim && sim.round > 0 ? sim.floor : null;
    const desk = level.fixed.find((c) => c.kind === 'payout');
    board.render({
      cells, selected, activePort, hover, live, tool, drag: drag?.active ? drag : null,
      paidNow: live ? sim.paidNow : null, paidWrong: sim?.paidWrong,
      alert: sim?.status.kind === 'wrong' && desk ? hexKey(desk.at) : null,
    });
    svg.classList.toggle('placing', !!tool);
  }

  function renderPalette() {
    palette.replaceChildren(h('div', { class: 'pal-title' }, 'Croupiers'),
      ...level.croupiers.map((name, i) => {
        const info = CROUPIERS[name];
        if (!info) return null;
        const sample = name === 'shoe' ? { kind: 'shoe' } : { kind: 'croupier', fn: name, n: 2, rule: 'high' };
        return h('button', {
          class: `pal-item${tool === name ? ' on' : ''}`, 'data-tool': name,
          title: `${info.name} (${i + 1}): ${info.desc}`,
          onpointerdown: (e) => startPaletteDrag(e, name),
        },
        h('span', { class: 'pal-chip', style: { background: info.family } }, h('span', {}, chipLabel(sample))),
        h('span', { class: 'pal-name' }, info.name),
        i < 9 ? h('kbd', {}, String(i + 1)) : null);
      }),
      h('div', { class: 'pal-hint' }, tool
        ? 'Click empty hexes to place. Esc or right-click to stop.'
        : 'Pick a croupier, then click the floor. Or drag it on.'),
      h('div', { class: 'pal-tools' },
        h('button', { class: 'btn small', disabled: !undo.length, onclick: () => undo.length && (redo.push(JSON.stringify(cells)), restoreCells(undo.pop())), title: 'Undo (Ctrl+Z)' }, '↶ Undo'),
        h('button', { class: 'btn small', disabled: !redo.length, onclick: () => redo.length && (undo.push(JSON.stringify(cells)), restoreCells(redo.pop())), title: 'Redo (Ctrl+Shift+Z)' }, '↷ Redo'),
        h('button', {
          class: 'btn small danger', disabled: !cells.length, title: 'Remove every croupier',
          onclick: () => { if (confirm('Clear the whole floor?')) commit(() => { cells = []; selected = null; }); },
        }, 'Clear floor')));
  }

  function sideButtons(current, onPick, { floor = true } = {}) {
    return h('div', { class: 'sides' },
      [0, 1, 2, 3, 4, 5].map((d) => h('button', {
        class: `side-btn${current === d ? ' on' : ''}`, title: `${SIDE_NAMES[d]} (${Object.keys(SIDE_KEYS).find((k) => SIDE_KEYS[k] === d).toUpperCase()})`,
        onclick: (e) => { e.stopPropagation(); onPick(d); },
      }, ARROW[d])),
      floor ? h('button', {
        class: `side-btn floor${current === undefined ? ' on' : ''}`, title: 'Floor: drop these cards (X)',
        onclick: (e) => { e.stopPropagation(); onPick(undefined); },
      }, '✕') : null);
  }

  function renderInspector() {
    const c = selCell();
    if (!c) {
      inspector.replaceChildren(
        h('h3', {}, 'The floor'),
        h('p', { class: 'brief-big' }, level.brief ?? ''),
        h('ul', { class: 'howto' },
          h('li', {}, 'Place croupiers from the palette on the felt hexes.'),
          h('li', {}, 'Select one, then click an edge of its hex to point the highlighted port there. Ports left on ', h('b', {}, '✕ floor'), ' drop their cards.'),
          h('li', {}, 'Winning hands must reach the chip desk; everything else must be dropped.'),
          h('li', {}, 'Press play to watch a test. When it passes, every other test is checked; pass them all to clear the floor.')),
        h('p', { class: 'keys' }, h('kbd', {}, 'Space'), ' play  ', h('kbd', {}, '.'), ' step  ', h('kbd', {}, ','), ' back  ', h('kbd', {}, 'Del'), ' remove  ', h('kbd', {}, '?'), ' help'));
      return;
    }
    const info = infoFor(c);
    const key = hexKey(c.at);
    const parts = [
      h('div', { class: 'insp-head' },
        h('span', { class: 'pal-chip big', style: { background: info.family } }, h('span', {}, chipLabel(c))),
        h('div', {}, h('h3', {}, info.name), h('div', { class: 'insp-at' }, `hex ${c.at[0]}, ${c.at[1]}`)),
        h('button', { class: 'btn small danger', title: 'Remove (Delete)', onclick: () => remove(key) }, 'Remove')),
      h('p', { class: 'insp-desc' }, info.desc),
    ];
    // params
    if (c.fn === 'kind') {
      parts.push(h('div', { class: 'param' }, h('span', { class: 'param-k' }, 'n of a kind'),
        h('div', { class: 'seg' }, [2, 3, 4].map((n) => h('button', {
          class: (c.n ?? 2) === n ? 'on' : '', onclick: () => commit(() => { c.n = n; }),
        }, String(n))))));
    }
    if (c.fn === 'war') {
      const names = { high: 'High card', top: 'Top card' };
      const rules = warRules(level);
      parts.push(h('div', { class: 'param' }, h('span', { class: 'param-k' }, 'Rule'),
        rules.length > 1
          ? h('div', { class: 'seg' }, rules.map((v) => h('button', {
            class: (c.rule ?? 'high') === v ? 'on' : '', onclick: () => commit(() => { c.rule = v; }),
          }, names[v] ?? v)))
          : h('span', { class: 'fixed-rule', title: 'The only War rule on this floor' }, `${names[rules[0]] ?? rules[0]} (house rule)`)));
    }
    if (c.kind === 'shoe') {
      const draft = deckDraft?.key === key ? deckDraft : { key, text: fmtCards(c.deck), error: null };
      const input = h('input', {
        class: `deck-in${draft.error ? ' bad' : ''}`, value: draft.text, spellcheck: false, placeholder: 'AS KH 10C',
        onkeydown: (e) => { if (e.key === 'Enter') input.blur(); e.stopPropagation(); },
        onchange: () => {
          const res = parseCards(input.value);
          if (res.error) { deckDraft = { key, text: input.value, error: res.error }; renderInspector(); return; }
          deckDraft = null;
          if (res.cards.join() !== c.deck.join()) commit(() => { c.deck = res.cards; });
          else renderInspector();
        },
      });
      parts.push(h('div', { class: 'param col' }, h('span', { class: 'param-k' }, 'Deck (top first)'), input,
        draft.error ? h('div', { class: 'err' }, draft.error) : h('div', { class: 'deck-prev' }, handEl(c.deck)),
        h('label', { class: 'check' }, h('input', {
          type: 'checkbox', checked: !!c.once, onchange: (e) => commit(() => { if (e.target.checked) c.once = true; else delete c.once; }),
        }), ' Deal the deck only once')));
    }
    // ports
    const ports = portsOf(c);
    if (ports.length) {
      parts.push(h('div', { class: 'ports-title' }, 'Ports', h('span', { class: 'muted' }, ' click a row, then an edge of the hex')));
      for (const p of ports) {
        const st = PORT_STYLE[p];
        if (p === 'to') {
          const to = c.out.to ?? [];
          parts.push(h('div', { class: `port-row deal${activePort === p ? ' active' : ''}`, onclick: () => { activePort = p; renderBoard(); renderInspector(); } },
            h('span', { class: 'port-tag', style: { background: st.color } }, 'deal to'),
            h('div', { class: 'deal-list' },
              to.length ? to.map((d, i) => h('button', {
                class: 'deal-chip', title: 'Remove',
                onclick: (e) => { e.stopPropagation(); commit(() => { c.out.to.splice(i, 1); }); },
              }, `${i + 1}·${ARROW[d]} ${SIDE_NAMES[d]}`)) : h('span', { class: 'muted' }, 'no sides: drops everything')),
            sideButtons(null, (d) => { activePort = 'to'; if (d === undefined) commit(() => { c.out.to = []; }); else assign(d, 'to'); })));
          continue;
        }
        const cur = getPort(c, p);
        parts.push(h('div', {
          class: `port-row${activePort === p ? ' active' : ''}${st.input ? ' input' : ''}`,
          onclick: () => { activePort = p; renderBoard(); renderInspector(); },
        },
        h('span', { class: `port-tag${st.input ? ' input' : ''}`, style: st.input ? { color: st.color, borderColor: st.color } : { background: st.color } }, st.label),
        sideButtons(cur, (d) => { activePort = p; if (d === undefined) { if (cur !== undefined) commit(() => setPort(c, p, undefined)); else renderInspector(); } else if (cur !== d) assign(d, p); else renderInspector(); })));
      }
      parts.push(h('p', { class: 'keys' }, 'Keys: ', h('kbd', {}, 'Q'), h('kbd', {}, 'E'), h('kbd', {}, 'A'), h('kbd', {}, 'D'), h('kbd', {}, 'Z'), h('kbd', {}, 'C'),
        ' point the port NW NE W E SW SE, ', h('kbd', {}, 'X'), ' floor, ', h('kbd', {}, 'Tab'), ' next port.'));
    }
    inspector.replaceChildren(...parts);
  }

  function renderTests() {
    const tests = level.tests;
    const chip = (i) => {
      const r = runResults?.[i];
      const cls = r ? (r.ok ? 'pass' : 'fail') : '';
      return h('button', {
        class: `test-chip ${cls}${i === testIndex ? ' on' : ''}`, onclick: () => setTest(i),
        title: r ? (r.ok ? `Passed in ${r.rounds} rounds` : describeFailure(r)) : `Test ${i + 1}: ${tests[i].length} hands`,
      }, String(i + 1));
    };
    const parts = [
      h('div', { class: 'tests-head' }, h('h3', {}, 'Tests'),
        running ? h('span', { class: 'muted small' }, `Checking ${runResults?.length ?? 0}/${tests.length}…`) : null),
      h('div', { class: 'test-chips' }, tests.map((_, i) => chip(i))),
    ];
    const inputs = tests[testIndex] ?? [];
    const f = sim?.floor;
    const pos = f ? f.inputPos : 0;
    const t = sim ? sim.tally() : null;
    // status line
    const st = sim?.status;
    let status = 'Press play (Space) or step (.) to watch this test.';
    let sCls = '';
    if (st) {
      if (st.kind === 'ready') status = 'Ready.';
      else if (st.kind === 'running' || st.kind === 'paused') status = `Round ${sim.round}. ${pos}/${inputs.length} hands dealt, ${f.paid.length} paid.`;
      else { status = st.msg; sCls = st.kind === 'passed' ? 'good' : 'bad'; }
    }
    parts.push(h('div', { class: `sim-status ${sCls}` }, status));
    if (st && (st.kind === 'wrong')) parts.push(h('div', { class: 'sim-detail bad' }, 'Paid: ', handEl(st.hand)));
    if (st && st.missing?.length) {
      parts.push(h('div', { class: 'sim-detail' }, 'Never paid: ', st.missing.slice(0, 6).map((m) => handEl(m)), st.missing.length > 6 ? ` +${st.missing.length - 6}` : ''));
    }
    // queue
    const expectedSet = new Set();
    const wins = sim ? sim.expected : [];
    parts.push(h('div', { class: 'sub-title' }, 'Player\'s hands', h('span', { class: 'muted' }, ` ${Math.max(0, inputs.length - pos)} to come`)));
    const winIdx = new Set();
    inputs.forEach((hand, i) => { if (level.pays(hand, inputs.slice(0, i))) winIdx.add(i); });
    parts.push(h('div', { class: 'queue' }, inputs.map((hand, i) => h('div', {
      class: `q-item${i < pos ? ' dealt' : ''}${i === pos ? ' next' : ''}${winIdx.has(i) ? ' win' : ''}`,
      title: winIdx.has(i) ? 'Should be paid' : 'Should be dropped',
    }, h('span', { class: 'q-n' }, String(i + 1)), handEl(hand), h('span', { class: 'q-mark' }, winIdx.has(i) ? '$' : '')))));
    // payouts
    const paidRows = t ? t.paid : [];
    const nWins = winIdx.size;
    const matched = t ? nWins - t.missing.length : 0;
    parts.push(h('div', { class: 'sub-title' }, 'Chip desk', h('span', { class: 'muted' }, ` ${matched}/${nWins} winners paid`)));
    parts.push(h('div', { class: 'paid' }, paidRows.length
      ? paidRows.map((p, i) => h('div', { class: `p-item ${p.ok ? 'ok' : 'bad'}` }, h('span', { class: 'p-n' }, String(i + 1)), handEl(p.h), h('span', { class: 'p-mark' }, p.ok ? '✓' : '✗')))
      : h('div', { class: 'muted small' }, 'Nothing paid yet. Hands marked $ should be paid.')));
    void expectedSet; void wins;
    testsPanel.replaceChildren(...parts);
    // Keep the next hand visible by scrolling the queue box only, never the page.
    const queue = testsPanel.querySelector('.queue');
    const next = queue?.querySelector('.q-item.next');
    if (next && playing && queue.scrollHeight > queue.clientHeight) {
      const top = next.getBoundingClientRect().top - queue.getBoundingClientRect().top + queue.scrollTop;
      if (top < queue.scrollTop || top + next.offsetHeight > queue.scrollTop + queue.clientHeight) {
        queue.scrollTop = top - queue.clientHeight / 2;
      }
    }
  }

  function renderTransport() {
    const r = sim ? sim.round : 0;
    const fin = sim?.finished;
    transport.replaceChildren(
      h('div', { class: 'tp-group' },
        h('button', { class: 'tp', title: 'Reset (R)', disabled: !sim || running, onclick: () => { resetSim(); renderAll(); } }, '⟲'),
        h('button', { class: 'tp', title: 'Step back (,)', disabled: !sim || r === 0 || running, onclick: back }, icon('back')),
        h('button', { class: `tp main${playing ? ' on' : ''}`, title: 'Play / pause (Space)', disabled: running, onclick: () => (playing ? stop() : play()) }, playing ? '⏸' : '▶'),
        h('button', { class: 'tp', title: 'Step (.)', disabled: running || fin, onclick: stepOnce }, icon('step'))),
      h('div', { class: 'tp-group speeds', title: 'Speed (F cycles)' },
        SPEEDS.map((sp, i) => h('button', {
          class: `sp${i === speed ? ' on' : ''}`, onclick: () => { speed = i; if (!playing && !running) play(); else renderTransport(); },
        }, sp.label))),
      h('div', { class: 'tp-round' }, h('span', { class: 'muted' }, 'Round '), h('b', {}, String(r)),
        h('span', { class: 'muted' }, ` · Test ${testIndex + 1}/${level.tests.length}`)));
  }

  // ---------- board pointer handling ----------
  svg.addEventListener('contextmenu', (e) => e.preventDefault());
  svg.addEventListener('pointerdown', (e) => {
    if (running) return;
    const loc = board.locate(e.clientX, e.clientY);
    if (!loc) return;
    const key = hexKey(loc.at);
    const c = cellAt(key);
    if (e.button === 2) {
      if (tool) { tool = null; renderPalette(); renderBoard(); return; }
      if (c) remove(key);
      return;
    }
    if (e.button === 1) { e.preventDefault(); drag = { kind: 'pan', x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, active: true, middle: true }; return; }
    if (e.button !== 0) return;
    if (c && key === selected && loc.dist > 0.45) { assign(loc.side); return; }
    if (c) {
      select(key);
      drag = { kind: 'move', key, x0: e.clientX, y0: e.clientY, active: false };
      return;
    }
    if (tool && board.isBuildable(loc.at)) { place(tool, loc.at); return; }
    // empty space: a click deselects, a drag pans
    drag = { kind: 'pan', x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, active: false };
  });
  svg.addEventListener('auxclick', (e) => e.preventDefault());
  svg.addEventListener('wheel', (e) => {
    e.preventDefault();
    board.zoomAt(e.clientX, e.clientY, Math.exp(Math.sign(e.deltaY) * Math.min(Math.abs(e.deltaY), 100) * 0.0022));
  }, { passive: false });
  function zoomCenter(f) {
    const r = svg.getBoundingClientRect();
    board.zoomAt(r.left + r.width / 2, r.top + r.height / 2, f);
  }
  svg.addEventListener('pointermove', (e) => {
    const loc = board.locate(e.clientX, e.clientY);
    const nh = loc ? { at: loc.at, side: loc.side, edge: loc.dist > 0.45 } : null;
    const same = hover && nh && hexKey(hover.at) === hexKey(nh.at) && hover.side === nh.side && hover.edge === nh.edge;
    if (!same) { hover = nh; if (!drag) renderBoard(); }
  });
  svg.addEventListener('pointerleave', () => { hover = null; if (!drag) renderBoard(); });

  function startPaletteDrag(e, name) {
    if (e.button !== 0 || running) return;
    e.preventDefault();
    drag = { kind: 'new', tool: name, x0: e.clientX, y0: e.clientY, active: false };
  }
  const ghost = h('div', { class: 'drag-ghost hidden' });
  root.append(ghost);
  function onMove(e) {
    if (!drag) return;
    if (!drag.active && Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) > 6) drag.active = true;
    if (!drag.active) return;
    if (drag.kind === 'pan') {
      board.panBy(e.clientX - drag.x, e.clientY - drag.y);
      drag.x = e.clientX; drag.y = e.clientY;
      svg.classList.add('panning');
      return;
    }
    const loc = board.locate(e.clientX, e.clientY);
    const overBoard = document.elementFromPoint(e.clientX, e.clientY)?.closest('svg.board');
    const overPalette = !!document.elementFromPoint(e.clientX, e.clientY)?.closest('.palette');
    drag.over = overBoard && loc ? loc.at : null;
    drag.overPalette = overPalette;
    const name = drag.kind === 'new' ? drag.tool : (cellAt(drag.key)?.kind === 'shoe' ? 'shoe' : cellAt(drag.key)?.fn);
    const info = CROUPIERS[name];
    ghost.className = `drag-ghost${overPalette && drag.kind === 'move' ? ' trash' : ''}`;
    ghost.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`;
    ghost.replaceChildren(h('span', { class: 'pal-chip', style: { background: info?.family } },
      h('span', {}, drag.kind === 'new' ? chipLabel(name === 'shoe' ? { kind: 'shoe' } : { kind: 'croupier', fn: name }) : chipLabel(cellAt(drag.key)))),
    overPalette && drag.kind === 'move' ? h('span', { class: 'ghost-t' }, 'remove') : null);
    renderBoard();
  }
  function onUp(e) {
    if (!drag) return;
    const d = drag;
    drag = null;
    ghost.className = 'drag-ghost hidden';
    if (d.kind === 'pan') {
      svg.classList.remove('panning');
      if (!d.active) select(null);
      return;
    }
    if (!d.active) {
      if (d.kind === 'new') { tool = tool === d.tool ? null : d.tool; renderPalette(); renderBoard(); }
      return;
    }
    if (d.kind === 'move') {
      if (d.overPalette) remove(d.key);
      else if (d.over && hexKey(d.over) !== d.key) move(d.key, d.over);
    } else if (d.over) {
      place(d.tool, d.over);
    }
    renderBoard(); // clear the drop marker when nothing changed
    void e;
  }
  document.addEventListener('pointermove', onMove);
  document.addEventListener('pointerup', onUp);

  // ---------- keyboard ----------
  function onKey(e) {
    if (e.target.closest?.('input, textarea, select')) return;
    if (modal.firstChild) {
      if (e.key === 'Escape') modal.replaceChildren();
      return;
    }
    if (ctx.helpOpen()) return;
    const k = e.key;
    const lower = k.length === 1 ? k.toLowerCase() : k;
    if ((e.ctrlKey || e.metaKey) && lower === 'z') {
      e.preventDefault();
      if (e.shiftKey) { if (redo.length) { undo.push(JSON.stringify(cells)); restoreCells(redo.pop()); } }
      else if (undo.length) { redo.push(JSON.stringify(cells)); restoreCells(undo.pop()); }
      return;
    }
    if ((e.ctrlKey || e.metaKey) && lower === 'y') {
      e.preventDefault();
      if (redo.length) { undo.push(JSON.stringify(cells)); restoreCells(redo.pop()); }
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (k === ' ') { e.preventDefault(); if (playing) stop(); else play(); return; }
    if (k === '.') { e.preventDefault(); stop(); stepOnce(); return; }
    if (k === ',') { e.preventDefault(); back(); return; }
    if (lower === 'r') { resetSim(); renderAll(); return; }
    if (k === '+' || k === '=') { zoomCenter(1 / 1.25); return; }
    if (k === '-') { zoomCenter(1.25); return; }
    if (k === '0') { board.fit(); return; }
    if (lower === 'f') { speed = (speed + 1) % SPEEDS.length; renderTransport(); return; }
    if (lower === 'h') { ctx.help(); return; }
    if (k === 'Escape') {
      if (tool) { tool = null; renderPalette(); renderBoard(); } else select(null);
      return;
    }
    if (k === 'Delete' || k === 'Backspace') { if (selected) { e.preventDefault(); remove(selected); } return; }
    if (/^[1-9]$/.test(k)) {
      const name = level.croupiers[Number(k) - 1];
      if (name) { tool = tool === name ? null : name; renderPalette(); renderBoard(); }
      return;
    }
    const c = selCell();
    if (!c) return;
    if (k === 'Tab') {
      e.preventDefault();
      const ports = portsOf(c);
      const i = ports.indexOf(activePort);
      activePort = ports[(i + (e.shiftKey ? ports.length - 1 : 1)) % ports.length];
      renderBoard(); renderInspector();
      return;
    }
    if (lower in SIDE_KEYS) { assign(SIDE_KEYS[lower]); return; }
    if (lower === 'x' && activePort) {
      if (activePort === 'to') commit(() => { c.out.to = []; });
      else if (getPort(c, activePort) !== undefined) commit(() => setPort(c, activePort, undefined));
    }
  }
  document.addEventListener('keydown', onKey);

  renderAll();
  void R;

  return () => {
    stop();
    document.removeEventListener('pointermove', onMove);
    document.removeEventListener('pointerup', onUp);
    document.removeEventListener('keydown', onKey);
  };
}

// Single-step icons: one triangle and a bar (not the double-triangle skip icons).
function icon(kind) {
  const path = kind === 'step' ? 'M5 3 L13 9 L5 15 Z M14 3 h2.5 v12 H14 Z' : 'M13 3 L5 9 L13 15 Z M1.5 3 h2.5 v12 H1.5 Z';
  return s('svg', { class: 'tp-icon', viewBox: '0 0 18 18', width: 16, height: 16, 'aria-hidden': 'true' },
    s('path', { d: path, fill: 'currentColor' }));
}
