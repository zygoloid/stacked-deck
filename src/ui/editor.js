// The level editor: palette, board, inspector, simulation and test runs.
import {
  runTest, expectedPayouts, payoutHand, payoutDesk, MAX_FLOOR_CARDS,
} from '../engine.js';
import { h, s, handEl, cardEl, parseCards, fmtCards } from './dom.js';
import { Board, R } from './board.js';
import {
  CROUPIERS, PORT_STYLE, SIDE_NAMES, infoFor, newCell, portsOf, getPort, setPort, isRequired, chipLabel, sampleCell,
} from './croupiers.js';
import { floorBadge } from './floors.js';
import {
  hexKey, sanitizeCells, toSpec, countCroupiers, levelSave, warRules, specialCardsOf,
  solutionsOf, recordSolution, deleteSolution, findSolution,
} from './model.js';
import { checkDeals, CHECK_DEALS, totalRounds } from '../score.js';
import { signInDialog, dialogOpen } from './account.js';
import { Sim, DESK_NAMES } from './sim.js';
import { scatterPlot, solutionList, scoreText, parMark } from './scatter.js';

const ARROW = ['→', '↘', '↙', '←', '↖', '↗'];
const SIDE_KEYS = { d: 0, c: 1, z: 2, a: 3, q: 4, e: 5 };
const SPEEDS = [
  { label: '1×', rate: 2 }, { label: '4×', rate: 8 }, { label: '16×', rate: 30 },
  { label: '64×', rate: 120 }, { label: 'Max', rate: Infinity },
];

export function openEditor(root, ctx, level) {
  const { save } = ctx;
  const ls = levelSave(save, level.id);
  let cells = sanitizeCells(level, ls.cells);
  let selected = null;            // hex key of the selected player cell
  let activePort = null;
  let tool = null;                // palette tool
  const toolCells = new Map();    // palette tool -> the cell it places (params set before placing)
  let hover = null;
  let drag = null;                // { kind: 'move'|'new'|'pan'|'pinch', key|tool, x0, y0, active, over, overPalette, id }
  const pointers = new Map();     // pointers down on the board: id -> [x, y] (two pinch-zoom)
  let peekAt = null;              // { x, y, tap } where a collapsed stack or label is being looked at
  let anim = null, animRaf = 0;   // cards moving after a step: { from, start, dur }
  let watching = false;           // play mode: the palette and inspector are hidden, nothing is selected
  let lastSide = 0;
  const undo = [], redo = [];
  let sim = null, testIndex = 0, playing = false, speed = 1, raf = 0, lastT = 0, acc = 0;
  let runResults = null;          // results of checking every test
  let checks = null;              // this machine's check deals, once a run reaches them
  let running = false;            // every test is being checked
  let deckDraft = null;           // { key, text, error }

  const cellAt = (key) => cells.find((c) => hexKey(c.at) === key);
  const selCell = () => (selected ? cellAt(selected) : null);

  // ---------- DOM skeleton ----------
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'board');
  const board = new Board(svg, level);
  const elCount = h('span', { class: 'stat-v' });
  const palette = h('section', { class: 'panel palette' });
  const inspector = h('section', { class: 'panel inspector' });
  const testsPanel = h('section', { class: 'panel tests' });
  const side = h('aside', { class: 'side' }, palette, inspector, testsPanel);
  const transport = h('div', { class: 'transport' });
  const toast = h('div', { class: 'toast hidden' });
  const modal = h('div', { class: 'modal-host' });
  const specials = specialCardsOf(level);
  const solBtn = h('button', { class: 'btn ghost sol-btn hidden', onclick: () => openSolutions(), title: 'Your saved solutions for this floor' });
  const peek = h('div', { class: 'peek hidden' });
  const radial = h('div', { class: 'radial hidden', role: 'menu' });

  const par = level.par;
  // `expected` levels list the exact payouts (which may repeat, regroup or
  // reorder cards); `pays` levels pay out some of the input hands.
  const listed = typeof level.expected === 'function';
  const editorEl = h('div', { class: 'editor' },
    h('header', { class: 'topbar' },
      h('button', { class: 'btn ghost', onclick: () => ctx.go('#/'), title: 'Level select' }, '← Floors'),
      h('div', { class: 'title' },
        floorBadge(level, 'lvl-no'),
        h('span', { class: 'lvl-title' }, level.title)),
      h('div', { class: 'brief', title: 'The goal for this floor' }, level.brief ?? ''),
      h('div', { class: 'stats' },
        h('span', { class: 'stat', title: 'Croupiers placed (shoes included)' }, h('span', { class: 'stat-k' }, 'Croupiers'), elCount),
        par ? h('span', { class: 'stat par', title: 'Par from the reference solution' }, h('span', { class: 'stat-k' }, 'Par'),
          h('span', { class: 'stat-v' }, `${par.croupiers ?? '–'} / ${par.rounds ?? '–'}`)) : null),
      solBtn,
      h('button', { class: 'btn ghost', onclick: () => ctx.go(`#/level/${level.id}/story`), title: 'Read the story again' }, 'Story'),
      h('button', { class: 'btn ghost', onclick: () => ctx.help(), title: 'Help (?)' }, '? Help')),
    h('main', { class: 'stage' }, h('div', { class: 'board-wrap' }, svg, toast, peek, radial,
      h('div', { class: 'zoom' },
        h('button', { title: 'Zoom in (+)', onclick: () => zoomCenter(1 / 1.25) }, '+'),
        h('button', { title: 'Zoom out (-)', onclick: () => zoomCenter(1.25) }, '−'),
        h('button', { title: 'Fit the floor (0)', onclick: () => board.fit() }, '⤢'))), transport),
    // The palette sits right above the inspector it switches (beside the
    // board on a wide screen, under it on a phone); in play mode both are
    // hidden, leaving the tests.
    side,
    modal);
  root.replaceChildren(editorEl);

  // ---------- editing ----------
  // Undo and redo restore the selection and its active port too, so undoing
  // a port's side goes back to that port.
  const editState = () => ({ cells: JSON.stringify(cells), selected, activePort });
  function commit(fn) {
    undo.push(editState());
    if (undo.length > 200) undo.shift();
    redo.length = 0;
    fn();
    changed();
  }
  function undoStep() { if (undo.length) { redo.push(editState()); restoreCells(undo.pop()); } }
  function redoStep() { if (redo.length) { undo.push(editState()); restoreCells(redo.pop()); } }
  function changed() {
    closeRadial();
    ls.cells = cells;
    ctx.persist();
    ctx.cloud?.levelChanged(level.id, { work: true });
    leavePlay();
    resetSim();
    runResults = null;
    checks = null;
    if (testIndex >= level.tests.length) testIndex = 0;
    renderAll();
  }
  function restoreCells(st) {
    cells = JSON.parse(st.cells);
    selected = st.selected && cellAt(st.selected) ? st.selected : null;
    activePort = selected ? st.activePort : null;
    deckDraft = null;
    changed();
  }

  // The cell a palette tool places: its params (n, War's rule, a shoe's
  // deck) can be set in the inspector before placing.
  function toolCell(name) {
    if (!toolCells.has(name)) {
      const c = sampleCell(name);
      if (c.fn === 'war') c.rule = warRules(level)[0];
      if (c.kind === 'shoe') c.deck = ['AS'];
      toolCells.set(name, c);
    }
    return toolCells.get(name);
  }
  // What a palette entry looks like: the tool's settings once picked; until
  // then War shows its rule when the level allows only one, plain "WAR" when
  // the player can choose.
  function paletteSample(name) {
    if (toolCells.has(name)) return toolCells.get(name);
    const cell = sampleCell(name);
    const rules = warRules(level);
    if (name === 'war') cell.rule = rules.length === 1 ? rules[0] : undefined;
    return cell;
  }
  function place(toolName, at) {
    if (!board.isBuildable(at) || cellAt(hexKey(at))) return;
    commit(() => {
      const c = newCell(toolName, at, lastSide);
      const t = toolCell(toolName);
      for (const k of ['n', 'rule', 'once']) if (t[k] !== undefined) c[k] = t[k];
      if (t.deck) c.deck = [...t.deck];
      cells.push(c);
      // Placing one is the usual end of it: the new croupier is selected,
      // ready to point its ports, and the palette tool is put down.
      tool = null;
      selected = hexKey(at);
      activePort = portsOf(c)[0] ?? null;
    });
  }
  // Pick a palette tool (or none). Picking one shows its settings, so it
  // deselects the selected croupier.
  function setTool(name) {
    if (name) leavePlay();
    tool = name;
    if (name) { selected = null; activePort = null; deckDraft = null; }
    renderPalette(); renderBoard(); renderInspector();
  }
  // Drop the palette tool and the selection (tapping the bare floor).
  function dropSelection() {
    if (!tool && !selected) return;
    tool = null;
    select(null);
    renderPalette();
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
  // Selecting a croupier starts at its first port.
  function select(key) {
    if (key) leavePlay();
    if (selected !== key) {
      closeRadial();
      selected = key;
      deckDraft = null;
      const c = selCell();
      activePort = c ? portsOf(c)[0] ?? null : null;
    }
    renderBoard(); renderInspector();
  }
  // Point a port of the selected cell at a side (undefined: the floor, which
  // required ports don't have), then move on to the next port, so pressing
  // directions one after another points the ports in order. Deal's list
  // takes one side per press. With advance false the active port stays.
  function assign(side, port = activePort, { advance = true } = {}) {
    const c = selCell();
    if (!c || !port) return;
    if (port === 'to') { commit(() => setPort(c, 'to', side)); return; }
    if (side === undefined && isRequired(c, port)) return;
    const ports = portsOf(c);
    const next = advance ? ports[(ports.indexOf(port) + 1) % ports.length] : activePort;
    if (getPort(c, port) === side) { activePort = next; renderBoard(); renderInspector(); return; }
    commit(() => {
      setPort(c, port, side);
      if (side !== undefined && ports[0] === port) lastSide = side;
      activePort = next;
    });
  }

  // ---------- simulation ----------
  // The published tests, then (once a run has reached them) the machine's
  // check deals: random deals made from the machine itself (src/score.js).
  const allTests = () => (checks ? [...level.tests, ...checks] : level.tests);
  const isCheck = (i) => i >= level.tests.length;
  const testName = (i) => (isCheck(i) ? `Check deal ${i - level.tests.length + 1}` : `Test ${i + 1}`);
  const CHECK_NOTE = 'Check deals are random deals made from your machine itself, so they change when it does.';
  function makeSim() {
    try {
      sim = new Sim(toSpec(level, cells), allTests()[testIndex], level);
    } catch (e) {
      sim = null;
      showToast(`Can't run this floor: ${e.message}`, 'bad');
    }
    return sim;
  }
  function resetSim() {
    stop();
    sim = null;
    anim = null;
    hideToast();
  }
  // How long cards take to move after a step (s): at the slower speeds and
  // when stepping by hand; not at all when that would be too quick to see,
  // or when the player prefers less motion.
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  function animDuration(rate) {
    if (reducedMotion?.matches) return 0;
    const d = Math.min(0.32, 0.7 / rate);
    return d >= 0.06 ? d : 0;
  }
  // Animate the cards from where they were drawn before the step just taken.
  function startAnim(from, dur) {
    anim = dur && from ? { from, start: performance.now(), dur: dur * 1000 } : null;
    animate();
  }
  // While playing, tick() draws the frames; otherwise this does.
  function animate() {
    cancelAnimationFrame(animRaf);
    const frame = () => { if (anim && !playing) { renderBoard(); if (anim) animRaf = requestAnimationFrame(frame); } };
    if (anim && !playing) animRaf = requestAnimationFrame(frame);
  }
  // Play mode: watching a test. Playing, stepping or stepping back enters it,
  // dropping the palette tool and the selection and hiding the palette and
  // the inspector, so the tests panel has the room. Selecting a croupier,
  // picking one to place, editing, resetting or the Edit button leave it
  // (and pause), keeping the run where it is.
  function enterPlay() {
    if (watching) return;
    watching = true;
    tool = null; selected = null; activePort = null; deckDraft = null;
    side.classList.add('watching');
    renderPalette(); renderInspector(); renderBoard(); renderTests();
  }
  function leavePlay() {
    if (!watching) return;
    watching = false;
    side.classList.remove('watching');
    stop();
    renderTests();
  }
  function stepOnce() {
    if (running) return;
    enterPlay();
    if (!sim && !makeSim()) return;
    if (sim.finished) { stop(); return; }
    const from = board.positions;
    sim.step();
    startAnim(from, animDuration(2));
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
    enterPlay();
    stop();
    sim.back();
    anim = null;
    hideToast();
    renderBoard(); renderTests(); renderTransport();
  }
  function play() {
    if (running) return;
    enterPlay();
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
    animate();
    renderTransport();
  }
  function tick(t) {
    if (!playing || !sim) return;
    const rate = SPEEDS[speed].rate;
    const dt = Math.min(0.25, (t - lastT) / 1000);
    lastT = t;
    const from = board.positions;
    const r0 = sim.round;
    if (rate === Infinity) {
      const t0 = performance.now();
      while (!sim.finished && performance.now() - t0 < 14) sim.step();
    } else {
      acc += dt * rate;
      while (acc >= 1 && !sim.finished) { sim.step(); acc -= 1; }
    }
    const stepped = sim.round !== r0;
    if (stepped) startAnim(sim.round - r0 === 1 ? from : null, animDuration(rate));
    if (sim.finished) { afterStep(); return; }
    // Redraw the board for a step or while cards move; the panels only for a step.
    if (stepped || anim) renderBoard();
    if (stepped) { renderTests(); renderTransport(); }
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
    if (st.kind === 'passed') showToast(`${testName(testIndex)} passed in ${st.rounds} rounds.`, 'good');
    else showToast(failureText(), 'bad');
  }
  function failureText() {
    const st = sim.status;
    if (st.kind === 'wrong') return `Wrong payout in round ${sim.round}: ${st.msg} Step back (,) to see how it got there.`;
    return st.msg;
  }

  async function checkAll() {
    if (running) return;
    const watched = testIndex;
    const machine = structuredClone(cells); // the machine being checked
    running = true;
    runResults = [];
    renderAll();
    let spec;
    try { spec = toSpec(level, cells); } catch (e) { showToast(e.message, 'bad'); running = false; return; }
    const runAll = async (tests) => {
      for (const t of tests) {
        await new Promise((r) => setTimeout(r, 0));
        let res;
        try { res = runTest(spec, t, level); } catch (e) { res = { ok: false, error: e.message, rounds: 0, wrong: [], missing: [] }; }
        runResults.push(res);
        renderTests();
      }
    };
    // The published tests, then (if they all pass) the check deals. They
    // depend only on the machine, so any shown already stay valid (editing the
    // machine clears them).
    await runAll(level.tests);
    if (runResults.every((r) => r.ok)) {
      checks = await checkDeals(level, machine);
      await runAll(checks);
    }
    running = false;
    const ok = runResults.every((r) => r.ok);
    if (ok) {
      const croupiers = countCroupiers(machine);
      // Scores come from the published tests only.
      const rounds = totalRounds(runResults.slice(0, level.tests.length));
      solutionsOf(ls);
      const prev = ls.best ? { ...ls.best } : undefined;
      const wasSolved = !!ls.solved;
      const { index: found, isNew } = recordSolution(ls, machine, { croupiers, rounds });
      ls.last = { croupiers, rounds };
      ctx.persist();
      ctx.cloud?.levelChanged(level.id, { solved: true });
      ctx.cloud?.queueUploads();
      renderAll();
      showResults({ croupiers, rounds, prev, wasSolved, found, isNew });
    } else {
      // Load the failing test and run it up to the failure, so the floor is
      // left paused at the moment it goes wrong (e.g. the bad payout).
      const first = runResults.findIndex((r) => !r.ok);
      testIndex = first;
      resetSim();
      if (makeSim()) while (!sim.finished) sim.step();
      renderAll();
      const note = isCheck(first) ? ` ${CHECK_NOTE}` : '';
      if (sim?.finished && sim.status.kind !== 'passed') {
        showToast(`${testName(watched)} passed, but ${testName(first).toLowerCase()} failed. ${failureText()}${note}`, 'bad');
      } else {
        showToast(`${testName(first)} failed: ${describeFailure(runResults[first])}${note}`, 'bad');
      }
    }
  }
  function describeFailure(r) {
    if (r.error) return r.error;
    if (r.wrong?.length) return `paid ${fmtCards(r.wrong[0])}, which ${listed ? 'isn\'t one of the expected payouts' : 'should have been dropped'}.`;
    if (r.overflow) return `more than ${MAX_FLOOR_CARDS} cards on the floor in round ${r.rounds}.`;
    if (r.timeout) return `still running after ${r.rounds} rounds (${r.missing.length} hand${r.missing.length === 1 ? '' : 's'} never paid).`;
    if (r.missing?.length) return `${r.missing.length} ${listed ? 'expected payout' : 'winning hand'}${r.missing.length === 1 ? '' : 's'} never paid.`;
    return 'failed.';
  }

  // ---------- results ----------
  function showResults({ croupiers, rounds, prev, wasSolved, found, isNew }) {
    const next = ctx.nextLevel(level);
    // This run's score, marked against par (✓, −1, +1).
    const row = (label, v, best, parV, prevV) => {
      const m = parMark(v, parV);
      return h('div', { class: 'res-row' },
        h('div', { class: 'res-k' }, label),
        h('div', { class: 'res-v' }, String(v), m ? h('span', { class: `res-par ${m.cls}`, title: m.title }, m.text) : null,
          prevV !== undefined && v < prevV ? h('span', { class: 'res-new' }, 'new best') : null),
        h('div', { class: 'res-sub' }, `best ${best}`, parV != null ? ` · par ${parV}` : ''));
    };
    const close = () => modal.replaceChildren();
    modal.replaceChildren(h('div', { class: 'modal-back', onclick: (e) => { if (e.target === e.currentTarget) close(); } },
      h('div', { class: 'modal results' },
        h('div', { class: 'res-suits' }, '♠ ♥ ♦ ♣'),
        h('h2', {}, wasSolved ? 'Floor cleared again' : 'Floor cleared!'),
        h('p', { class: 'res-sub' }, `${level.title}: all ${level.tests.length} tests${checks?.length ? ` and ${checks.length} check deals` : ''} passed.`),
        h('div', { class: 'res-grid' },
          row('Croupiers', croupiers, ls.best.croupiers, par?.croupiers, prev?.croupiers),
          row('Rounds', rounds, ls.best.rounds, par?.rounds, prev?.rounds)),
        h('div', { class: 'res-plot' },
          h('div', { class: 'res-plot-head' },
            h('span', { class: 'sub-title' }, 'Your solutions'),
            h('span', { class: 'muted small' }, isNew
              ? `${ls.solutions.length === 1 ? 'Your first solution' : `Solution ${ls.solutions.length} saved`}. Click a point to load it.`
              : 'You had already saved this machine. Click a point to load it.')),
          comparePlot({
            solutions: ls.solutions, par, current: findSolution(ls, cells), fresh: found, freshIsNew: isNew,
            onPick: (i) => { close(); loadSolution(i); }, height: 250,
          })),
        h('div', { class: 'modal-actions' },
          h('button', { class: 'btn', onclick: () => { close(); leavePlay(); } }, 'Keep tinkering'),
          h('button', { class: 'btn', onclick: () => ctx.go('#/') }, 'All floors'),
          next ? h('button', { class: 'btn gold', autofocus: true, onclick: () => ctx.go(`#/level/${next.id}/story`) }, `Next: ${next.title} →`) : null))));
    modal.querySelector('.btn.gold, .btn')?.focus();
  }

  // ---------- saved solutions ----------
  function loadSolution(i) {
    const sol = ls.solutions?.[i];
    if (!sol || running) return;
    commit(() => {
      cells = sanitizeCells(level, sol.cells);
      selected = null;
      activePort = null;
      deckDraft = null;
    });
    showToast(`Loaded your ${scoreText(sol)} solution. Ctrl+Z to undo.`, 'good');
  }
  function openSolutions() {
    const close = () => modal.replaceChildren();
    const draw = () => {
      const list = solutionsOf(ls);
      if (!list.length) { close(); renderAll(); return; }
      const current = findSolution(ls, cells);
      const pick = (i) => { close(); loadSolution(i); };
      const del = (i) => {
        if (!confirm(`Delete your ${scoreText(list[i])} solution? This can't be undone.`)) return;
        const gone = list[i];
        deleteSolution(ls, i);
        ctx.persist();
        ctx.cloud?.solutionDeleted(level, gone);
        renderAll();
        draw();
      };
      const b = ls.best;
      modal.replaceChildren(h('div', { class: 'modal-back', onclick: (e) => { if (e.target === e.currentTarget) close(); } },
        h('div', { class: 'modal solutions' },
          h('button', { class: 'modal-x', onclick: close, title: 'Close (Esc)' }, '×'),
          h('h2', {}, 'Your solutions'),
          h('p', { class: 'res-sub' }, `${level.title}: ${list.length} machine${list.length === 1 ? '' : 's'} saved`,
            b ? ` · best ${b.croupiers} croupiers, ${b.rounds} rounds` : '', par ? ` · par ${par.croupiers ?? '–'} / ${par.rounds ?? '–'}` : '',
            '. Fewer is better on both axes: the gold staircase joins the solutions nothing else beats on both.'),
          comparePlot({ solutions: list, par, current, onPick: pick }),
          solutionList({ solutions: list, current, onPick: pick, onDelete: del }))));
      modal.querySelector('.modal-x')?.focus();
    };
    draw();
  }

  // A floor's plot of the player's solutions. Signed in, everyone's scores and
  // friends' frontiers are drawn behind it (read when needed, then the plot is
  // redrawn, and again when the cloud reads them again);
  // signed out, a line under it offers signing in.
  function comparePlot(opts) {
    const cloud = ctx.cloud;
    const box = h('div', { class: 'compare' });
    const note = (st) => {
      if (!cloud) return null;
      if (cloud.state() !== 'signed-in') {
        return h('p', { class: 'compare-note' }, 'Sign in to see how everyone else scored on this floor. ',
          h('button', { class: 'btn ghost small', onclick: () => signInDialog(cloud) }, 'Sign in…'));
      }
      if (st === undefined) return h('p', { class: 'compare-note muted' }, 'Loading everyone\'s scores…');
      if (st === null) return h('p', { class: 'compare-note muted' }, 'Everyone\'s scores couldn\'t be loaded just now.');
      return h('p', { class: 'compare-note muted' }, st.players
        ? `Behind your solutions: everyone's best scores (${st.players} player${st.players === 1 ? '' : 's'} with this rules version).`
        : 'Nobody has a verified score on this floor yet.');
    };
    let friends = [];
    let friendsLoading = false;
    let shown;
    const draw = (st) => {
      shown = st;
      box.replaceChildren(scatterPlot({ ...opts, others: st?.points ?? [], friends }), note(st) ?? '',
        friendsLoading ? h('p', { class: 'compare-note muted' }, 'Loading friends\' scores…') : '');
    };
    const refresh = () => {
      const cached = cloud?.cachedStats(level.id);
      const signedIn = cloud?.state() === 'signed-in';
      if (!signedIn) friends = [];
      friendsLoading = false;
      // While re-reading, keep showing what was read before.
      draw(cached ?? (signedIn ? shown : null));
      if (signedIn && !cached) {
        cloud.statsFor(level.id).then((st) => { if (box.isConnected) draw(st); }, () => { if (box.isConnected) draw(null); });
      }
      // Friends' frontiers too, with a note if they take a moment.
      if (signedIn) {
        let loaded = false;
        setTimeout(() => { if (!loaded && box.isConnected) { friendsLoading = true; draw(shown); } }, 300);
        const done = (fr) => {
          loaded = true;
          if (!box.isConnected) return;
          friendsLoading = false;
          friends = fr ?? friends;
          draw(shown);
        };
        cloud.friendFrontiers(level.id).then(done, () => done());
      }
    };
    refresh();
    // Signing in (or out) from the note redraws the plot.
    const off = cloud?.onChange(() => { if (box.isConnected) refresh(); else off(); });
    return box;
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
    const nSol = ls.solutions?.length ?? 0;
    solBtn.textContent = `Solutions (${nSol})`;
    solBtn.classList.toggle('hidden', !nSol);
    renderPalette(); renderBoard(); renderInspector(); renderTests(); renderTransport();
  }

  function renderBoard() {
    const live = sim && sim.round > 0 ? sim.floor : null;
    // The desk to flag on a wrong payout: the one it was paid at.
    const wrongDesk = sim?.status.desk;
    const desk = level.fixed.find((c) => c.kind === 'payout' && (wrongDesk === undefined || c.desk === wrongDesk));
    const t = anim ? Math.min(1, (performance.now() - anim.start) / anim.dur) : 1;
    board.render({
      cells, selected, activePort, hover, live, tool, drag: drag?.active ? drag : null,
      paidNow: live ? sim.paidNow : null, paidNowDesk: sim?.paidNowDesk, paidWrong: sim?.paidWrong,
      alert: sim?.status.kind === 'wrong' && desk ? hexKey(desk.at) : null,
      anim: anim && t < 1 ? Object.assign(anim, { t }) : null,
    });
    if (t >= 1) anim = null;
    svg.classList.toggle('placing', !!tool);
    updatePeek();
  }

  // ---------- peeking at collapsed stacks and labels ----------
  // A long hand shows its first cards and "+n"; a shoe's deck and a Deal's
  // positions are cut short. Hovering one (or tapping it) shows it in full.
  let peekKey = null;
  function updatePeek() {
    const el = peekAt && document.elementFromPoint(peekAt.x, peekAt.y)?.closest?.('svg.board [data-peek]');
    const item = el ? board.peeks[Number(el.dataset.peek)] : null;
    if (!item) {
      if (peekAt?.tap) peekAt = null;
      peek.className = 'peek hidden';
      peekKey = null;
      return;
    }
    const key = JSON.stringify(item);
    if (key !== peekKey) {
      peekKey = key;
      peek.replaceChildren(...[
        item.title ? h('div', { class: 'peek-t' }, item.title) : null,
        item.cards ? h('span', { class: 'hand' }, item.cards.map((c, i) => cardEl(c, item.house?.[i] ? 'house' : ''))) : null,
        item.text ? h('div', {}, item.text) : null].filter(Boolean));
    }
    peek.className = 'peek';
    // Next to the pointer, inside the board.
    const wrap = peek.parentElement.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    const pw = peek.offsetWidth, ph = peek.offsetHeight;
    let x = r.left + r.width / 2 - wrap.left - pw / 2;
    let y = r.top - wrap.top - ph - 8;
    if (y < 6) y = r.bottom - wrap.top + 8;
    x = Math.max(6, Math.min(wrap.width - pw - 6, x));
    y = Math.max(6, Math.min(wrap.height - ph - 6, y));
    peek.style.transform = `translate(${x.toFixed(0)}px, ${y.toFixed(0)}px)`;
  }

  function renderPalette() {
    palette.replaceChildren(
      h('div', { class: 'pal-head' }, h('div', { class: 'pal-title' }, 'Croupiers'),
        h('div', { class: 'pal-tools' },
          h('button', { class: 'btn small', disabled: !undo.length, onclick: undoStep, title: 'Undo (Ctrl+Z)' }, '↶ Undo'),
          h('button', { class: 'btn small', disabled: !redo.length, onclick: redoStep, title: 'Redo (Ctrl+Shift+Z)' }, '↷ Redo'),
          h('button', {
            class: 'btn small danger', disabled: !cells.length, title: 'Remove every croupier',
            onclick: () => { if (confirm('Clear the whole floor?')) commit(() => { cells = []; selected = null; }); },
          }, 'Clear floor'))),
      h('div', { class: 'pal-grid' }, level.croupiers.map((name, i) => {
        const info = CROUPIERS[name];
        if (!info) return null;
        const sample = paletteSample(name);
        return h('button', {
          class: `pal-item${tool === name ? ' on' : ''}`, 'data-tool': name,
          title: `${info.name} (${i + 1}): ${info.desc}`,
          onpointerdown: (e) => startPaletteDrag(e, name),
        },
        h('span', { class: 'pal-chip', style: { background: info.family } }, h('span', {}, chipLabel(sample))),
        h('span', { class: 'pal-name' }, info.name),
        i < 9 ? h('kbd', {}, String(i + 1)) : null);
      }).filter(Boolean)),
      h('div', { class: 'pal-hint' }, tool
        ? 'Tap an empty hex to place it; drag to pan. Tap the bare floor or press Esc to cancel.'
        : 'Pick a croupier, then tap the floor, or drag it on.'));
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

  // The selected croupier; with none, the palette tool's settings (the cell
  // it will place); with neither, the floor's brief and how to play.
  function renderInspector() {
    // On a phone, a selected croupier's panel goes right under the floor:
    // the palette and the play controls step aside (style.css).
    editorEl.classList.toggle('cell-selected', !!selCell());
    let c = selCell();
    const template = !c && tool ? toolCell(tool) : null;
    c ??= template;
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
    const key = template ? `tool:${tool}` : hexKey(c.at);
    // Changes to a placed croupier are undoable edits; to the tool, settings
    // for the croupiers it places next.
    const edit = template ? (fn) => { fn(); renderInspector(); renderPalette(); } : commit;
    const parts = [
      h('div', { class: 'insp-head' },
        h('span', { class: 'pal-chip big', style: { background: info.family } }, h('span', {}, chipLabel(c))),
        h('div', {}, h('h3', {}, info.name), h('div', { class: 'insp-at' }, template ? 'Tap an empty hex to place' : `hex ${c.at[0]}, ${c.at[1]}`)),
        template
          ? h('button', { class: 'btn small', title: 'Stop placing (Esc)', onclick: () => setTool(null) }, 'Done')
          : [h('button', { class: 'btn small danger', title: 'Remove (Delete)', onclick: () => remove(key) }, 'Remove'),
            h('button', { class: 'btn small done-btn', title: 'Deselect (Esc)', onclick: dropSelection }, 'Done')]),
      h('p', { class: 'insp-desc' }, info.desc),
    ];
    // params
    if (c.fn === 'kind' || c.fn === 'hand') {
      const p = CROUPIERS[c.fn].params.n;
      const opts = p.options;
      parts.push(h('div', { class: `param${opts.length > 8 ? ' col' : ''}` }, h('span', { class: 'param-k' }, c.fn === 'kind' ? 'n of a kind' : 'Cards per hand (n)'),
        h('div', { class: `seg${opts.length > 8 ? ' wide' : ''}`, 'data-param': 'n' }, opts.map((n) => h('button', {
          class: (c.n ?? p.default) === n ? 'on' : '', onclick: () => edit(() => { c.n = n; }),
        }, String(n))))));
    }
    if (c.fn === 'war') {
      const names = { high: 'High card', top: 'Top card' };
      const rules = warRules(level);
      parts.push(h('div', { class: 'param' }, h('span', { class: 'param-k' }, 'Rule'),
        rules.length > 1
          ? h('div', { class: 'seg' }, rules.map((v) => h('button', {
            class: (c.rule ?? 'high') === v ? 'on' : '', onclick: () => edit(() => { c.rule = v; }),
          }, names[v] ?? v)))
          : h('span', { class: 'fixed-rule', title: 'The only War rule on this floor' }, `${names[rules[0]] ?? rules[0]} (house rule)`)));
    }
    if (c.kind === 'shoe') {
      const draft = deckDraft?.key === key ? deckDraft : { key, text: fmtCards(c.deck), error: null };
      const input = h('input', {
        class: `deck-in${draft.error ? ' bad' : ''}`, value: draft.text, spellcheck: false, placeholder: specials.length ? `AS KH 10C ${specials[0]}` : 'AS KH 10C',
        onkeydown: (e) => { if (e.key === 'Enter') input.blur(); e.stopPropagation(); },
        onchange: () => {
          const res = parseCards(input.value, specials);
          if (res.error) { deckDraft = { key, text: input.value, error: res.error }; renderInspector(); return; }
          deckDraft = null;
          if (res.cards.join() !== c.deck.join()) edit(() => { c.deck = res.cards; });
          else renderInspector();
        },
      });
      parts.push(h('div', { class: 'param col' }, h('span', { class: 'param-k' }, 'Deck (top first)'), input,
        draft.error ? h('div', { class: 'err' }, draft.error) : h('div', { class: 'deck-prev' }, handEl(c.deck)),
        specials.length ? h('div', { class: 'deck-special muted small' }, 'Special cards on this floor: ', handEl(specials), ' type ',
          specials.map((x, k) => [k ? ' ' : '', h('kbd', {}, x)])) : null,
        h('label', { class: 'check' }, h('input', {
          type: 'checkbox', checked: !!c.once, onchange: (e) => edit(() => { if (e.target.checked) c.once = true; else delete c.once; }),
        }), ' Deal the deck only once')));
    }
    // ports
    const ports = portsOf(c);
    if (template) {
      // Which ports it has; they are pointed once it is placed.
      if (ports.length) {
        parts.push(h('div', { class: 'ports-title' }, 'Ports', h('span', { class: 'muted' }, ' point them once it is placed')),
          h('div', { class: 'port-list' }, ports.map((p) => {
            const st = PORT_STYLE[p];
            return h('span', { class: `port-tag${st.input ? ' input' : ''}`, style: st.input ? { color: st.color, borderColor: st.color } : { background: st.color } }, p === 'to' ? 'deal to' : st.label);
          })));
      }
    } else if (ports.length) {
      parts.push(h('div', { class: 'ports-title' }, 'Ports', h('span', { class: 'muted' }, ' tap an edge of the hex to point the highlighted one; long-press an edge to pick')));
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
        sideButtons(cur, (d) => { activePort = p; assign(d, p); }, { floor: !isRequired(c, p) })));
      }
      parts.push(h('p', { class: 'keys' }, 'Keys: ', h('kbd', {}, 'Q'), h('kbd', {}, 'E'), h('kbd', {}, 'A'), h('kbd', {}, 'D'), h('kbd', {}, 'Z'), h('kbd', {}, 'C'),
        ' point the port NW NE W E SW SE and go to the next, ', h('kbd', {}, 'X'), ' floor, ', h('kbd', {}, 'Tab'), ' skip, ', h('kbd', {}, 'Ctrl+Z'), ' back.'));
    }
    inspector.replaceChildren(...parts.filter(Boolean));
  }

  // A payout's desk, on a floor with labelled desks.
  const deskTag = (d) => (d === undefined ? null : h('span', { class: 'desk-tag', title: `At desk ${DESK_NAMES[d]}` }, `→ ${DESK_NAMES[d]}`));
  // A payout ({ desk, hand } on a floor with labelled desks), with its desk.
  const payoutEl = (p) => [handEl(payoutHand(p)), deskTag(payoutDesk(p))];

  // Expected payouts for a test before any run (cached per test).
  const expectedCache = new Map();
  function expectedOf(inputs) {
    if (!expectedCache.has(inputs)) {
      let e;
      try { e = expectedPayouts(level, inputs); } catch { e = []; }
      expectedCache.set(inputs, e);
    }
    return expectedCache.get(inputs);
  }

  // The test chips are kept while they don't change (so a click isn't lost
  // when the panel is redrawn between press and release while playing).
  let chipsKey = null;
  // Its heading is kept too: the Edit button (play mode only) must get its click.
  const testsCount = h('span', { class: 'muted small' });
  const editBtn = h('button', { class: 'btn small edit-btn', title: 'Back to building: show the croupiers (the run stays where it is)', onclick: () => leavePlay() }, '✎ Edit');
  const testsHead = h('div', { class: 'tests-head' }, h('h3', {}, 'Tests'), testsCount, editBtn);
  const chipsEl = h('div', { class: 'test-chips' });
  const testsBody = h('div', { class: 'tests-body' });
  testsPanel.append(testsHead, chipsEl, testsBody);
  function renderTests() {
    const tests = allTests();
    const nChecks = level.tests.deal ? CHECK_DEALS : 0;
    const chip = (i) => {
      const r = runResults?.[i];
      const cls = r ? (r.ok ? 'pass' : 'fail') : '';
      return h('button', {
        class: `test-chip ${cls}${isCheck(i) ? ' check' : ''}${i === testIndex ? ' on' : ''}`, onclick: () => setTest(i),
        title: `${testName(i)}: ${r ? (r.ok ? `passed in ${r.rounds} rounds` : describeFailure(r)) : `${tests[i].length} hands`}`,
      }, isCheck(i) ? `C${i - level.tests.length + 1}` : String(i + 1));
    };
    const key = JSON.stringify([tests.length, testIndex, runResults?.map((r) => [r.ok, r.rounds]), !!checks]);
    if (key !== chipsKey) {
      chipsKey = key;
      chipsEl.replaceChildren(...tests.map((_, i) => chip(i)),
        nChecks && !checks ? h('span', { class: 'check-hint muted small', title: CHECK_NOTE }, `+ ${nChecks} check deals`) : '');
    }
    testsCount.textContent = running ? `Checking ${runResults?.length ?? 0}/${level.tests.length + nChecks}…` : '';
    editBtn.classList.toggle('hidden', !watching);
    const parts = [];
    const inputs = tests[testIndex] ?? [];
    // (A player with fewer hands than the others has nulls for the rest.)
    const nHands = inputs.filter(Boolean).length;
    const f = sim?.floor;
    const pos = f ? f.inputPos : 0;
    const t = sim ? sim.tally() : null;
    // status line
    const st = sim?.status;
    let status = 'Press play (Space) or step (.) to watch this test.';
    let sCls = '';
    if (st) {
      if (st.kind === 'ready') status = 'Ready.';
      else if (st.kind === 'running' || st.kind === 'paused') status = `Round ${sim.round}. ${pos}/${nHands} hands dealt, ${f.paid.length} paid.`;
      else { status = st.msg; sCls = st.kind === 'passed' ? 'good' : 'bad'; }
    }
    parts.push(h('div', { class: `sim-status ${sCls}` }, status));
    if (st && (st.kind === 'wrong')) parts.push(h('div', { class: 'sim-detail bad' }, 'Paid: ', handEl(st.hand), deskTag(st.desk)));
    if (st && st.missing?.length) {
      parts.push(h('div', { class: 'sim-detail' }, 'Never paid: ', st.missing.slice(0, 6).map((m) => payoutEl(m)), st.missing.length > 6 ? ` +${st.missing.length - 6}` : ''));
    }
    // queue
    // Seated floors: hand i belongs to player A, B, ... (i % seats), each dealing their own.
    const seats = level.fixed.filter((c) => c.kind === 'source' && c.seat !== undefined).length;
    const dealt = (i) => (f ? f.dealt(i) : false);
    const nextIdx = seats ? -1 : pos;
    parts.push(h('div', { class: 'sub-title' }, seats ? 'Players\' hands' : 'Player\'s hands', h('span', { class: 'muted' }, ` ${Math.max(0, nHands - pos)} to come`)));
    const winIdx = new Set();
    if (!listed) inputs.forEach((hand, i) => { if (level.pays(hand, inputs.slice(0, i))) winIdx.add(i); });
    parts.push(h('div', { class: `queue${listed ? ' short' : ''}` }, inputs.map((hand, i) => hand && h('div', {
      class: `q-item${dealt(i) ? ' dealt' : ''}${i === nextIdx || (seats && !dealt(i) && (i < seats || dealt(i - seats))) ? ' next' : ''}${winIdx.has(i) ? ' win' : ''}`,
      title: [seats ? `Player ${'ABCDEF'[i % seats]}` : null, listed ? null : winIdx.has(i) ? 'Should be paid' : 'Should be dropped'].filter(Boolean).join(': ') || null,
    }, h('span', { class: 'q-n' }, seats ? `${Math.floor(i / seats) + 1}${'ABCDEF'[i % seats]}` : String(i + 1)), handEl(hand), listed ? null : h('span', { class: 'q-mark' }, winIdx.has(i) ? '$' : '')))));
    const paidRows = t ? t.paid : [];
    if (listed) {
      // The hands the chip desk should receive, ticked off as they are paid;
      // payouts that match none of them are listed after, flagged.
      const expected = sim ? sim.expected : expectedOf(inputs);
      const matched = t ? t.matched : expected.map(() => 0);
      const wrong = paidRows.map((p, i) => [p, i]).filter(([p]) => !p.ok);
      const done = matched.filter(Boolean).length;
      parts.push(h('div', { class: 'sub-title' }, 'Expected payouts',
        h('span', { class: 'muted' }, ` ${done}/${expected.length} paid${wrong.length ? `, ${wrong.length} wrong` : ''}`)));
      if (level.ordered) {
        parts.push(h('div', { class: 'order-note' }, h('span', { class: 'order-tag' }, 'card order matters'),
          h('span', { class: 'muted small' }, 'each payout must match card for card, top card first')));
      }
      if (level.inOrder) {
        parts.push(h('div', { class: 'order-note' }, h('span', { class: 'order-tag' }, 'payout order matters'),
          h('span', { class: 'muted small' }, 'pay these hands in the order listed, first to last')));
      }
      parts.push(h('div', { class: 'paid expected' },
        expected.map((hand, i) => h('div', { class: `p-item e-item${matched[i] ? ' ok' : ''}`, title: matched[i] ? `Paid (payout ${matched[i]})` : 'Not paid yet' },
          h('span', { class: 'p-n' }, String(i + 1)), payoutEl(hand), h('span', { class: 'p-mark' }, matched[i] ? '✓' : '$'))),
        wrong.map(([p, i]) => h('div', { class: 'p-item bad', title: `Payout ${i + 1} is not an expected payout` },
          h('span', { class: 'p-n' }, '✗'), handEl(p.h), deskTag(p.desk), h('span', { class: 'p-mark' }, 'wrong'))),
        expected.length ? null : h('div', { class: 'muted small' }, 'Nothing should be paid in this test.')));
    } else {
      const nWins = winIdx.size;
      const matched = t ? nWins - t.missing.length : 0;
      parts.push(h('div', { class: 'sub-title' }, 'Chip desk', h('span', { class: 'muted' }, ` ${matched}/${nWins} winners paid`)));
      parts.push(h('div', { class: 'paid' }, paidRows.length
        ? paidRows.map((p, i) => h('div', { class: `p-item ${p.ok ? 'ok' : 'bad'}` }, h('span', { class: 'p-n' }, String(i + 1)), handEl(p.h), h('span', { class: 'p-mark' }, p.ok ? '✓' : '✗')))
        : h('div', { class: 'muted small' }, 'Nothing paid yet. Hands marked $ should be paid.')));
    }
    testsBody.replaceChildren(...parts);
    // Keep the next hand visible by scrolling the queue box only, never the page.
    const queue = testsBody.querySelector('.queue');
    const next = queue?.querySelector('.q-item.next');
    if (next && playing && queue.scrollHeight > queue.clientHeight) {
      const top = next.getBoundingClientRect().top - queue.getBoundingClientRect().top + queue.scrollTop;
      if (top < queue.scrollTop || top + next.offsetHeight > queue.scrollTop + queue.clientHeight) {
        queue.scrollTop = top - queue.clientHeight / 2;
      }
    }
  }

  // The transport is built once and updated in place: while playing it is
  // updated every round, and buttons rebuilt between a mouse press and its
  // release never get the click (so pause didn't work with a mouse).
  const tp = {
    reset: h('button', { class: 'tp', title: 'Reset (R)', onclick: () => { leavePlay(); resetSim(); renderAll(); } }, '⟲'),
    back: h('button', { class: 'tp', title: 'Step back (,)', onclick: back }, icon('back')),
    play: h('button', { class: 'tp main', title: 'Play / pause (Space)', onclick: () => { if (playing) stop(); else play(); } }),
    step: h('button', { class: 'tp', title: 'Step (.)', onclick: stepOnce }, icon('step')),
    speeds: SPEEDS.map((sp, i) => h('button', {
      class: 'sp', onclick: () => { speed = i; if (!playing && !running) play(); else renderTransport(); },
    }, sp.label)),
    round: h('b'),
    which: h('span', { class: 'muted' }),
  };
  transport.append(
    h('div', { class: 'tp-group' }, tp.reset, tp.back, tp.play, tp.step),
    h('div', { class: 'tp-group speeds', title: 'Speed (F cycles)' }, tp.speeds),
    h('div', { class: 'tp-round' }, h('span', { class: 'muted' }, 'Round '), tp.round, tp.which));
  function renderTransport() {
    const r = sim ? sim.round : 0;
    tp.reset.disabled = !sim || running;
    tp.back.disabled = !sim || r === 0 || running;
    tp.play.disabled = running;
    tp.play.classList.toggle('on', playing);
    tp.play.textContent = playing ? '⏸' : '▶';
    tp.step.disabled = running || !!sim?.finished;
    tp.speeds.forEach((b, i) => b.classList.toggle('on', i === speed));
    tp.round.textContent = String(r);
    tp.which.textContent = ` · ${isCheck(testIndex) ? `${testName(testIndex)}/${checks?.length ?? CHECK_DEALS}` : `Test ${testIndex + 1}/${level.tests.length}`}`;
  }

  // ---------- board pointer handling ----------
  // A press on the board: on a croupier, selects it (a drag moves it).
  // Anywhere else a drag pans the floor, and a tap points the selected
  // croupier's active port at the edge tapped, places the palette tool's
  // croupier on an empty hex, or drops the tool and the selection. Two
  // fingers pinch-zoom.
  const tapSlop = (e) => (e.pointerType === 'mouse' ? 6 : 10);
  svg.addEventListener('contextmenu', (e) => e.preventDefault());
  svg.addEventListener('pointerdown', (e) => {
    // With the port menu open, a press on the board just closes it.
    if (radialOpen()) { closeRadial(); return; }
    pointers.set(e.pointerId, [e.clientX, e.clientY]);
    if (pointers.size === 2) { startPinch(); return; }
    if (pointers.size > 2 || running) return;
    if (e.pointerType !== 'mouse' && peekAt?.tap) { peekAt = null; updatePeek(); }
    const loc = board.locate(e.clientX, e.clientY);
    if (!loc) return;
    const key = hexKey(loc.at);
    const c = cellAt(key);
    const base = { x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, id: e.pointerId, slop: tapSlop(e) };
    if (e.button === 2) {
      if (tool) { setTool(null); return; }
      if (c) remove(key);
      return;
    }
    if (e.button === 1) { e.preventDefault(); drag = { kind: 'pan', ...base, active: true, middle: true }; return; }
    if (e.button !== 0) return;
    // A tap on a cut-short stack or label shows it in full (a mouse hovers instead).
    const peekEl = e.target.closest?.('[data-peek]');
    if (peekEl && e.pointerType !== 'mouse') { drag = { kind: 'pan', ...base, active: false, peek: true }; return; }
    // An edge: a tap points the active port there, a long press opens the port menu.
    if (c && key === selected && loc.dist > 0.45) { drag = { kind: 'pan', ...base, active: false, assign: loc.side }; holdFor(loc.side); return; }
    if (c) {
      if (tool && key !== selected) setTool(null);
      select(key);
      drag = { kind: 'move', key, ...base, active: false };
      if (loc.dist > 0.45) holdFor(loc.side);
      return;
    }
    // empty space: a tap places (with a tool on a free hex) or deselects; a drag pans
    drag = { kind: 'pan', ...base, active: false, place: tool && board.isBuildable(loc.at) ? loc.at : null };
  });
  svg.addEventListener('auxclick', (e) => e.preventDefault());
  svg.addEventListener('wheel', (e) => {
    e.preventDefault();
    board.zoomAt(e.clientX, e.clientY, Math.exp(Math.sign(e.deltaY) * Math.min(Math.abs(e.deltaY), 100) * 0.0022));
    updatePeek();
  }, { passive: false });
  function zoomCenter(f) {
    const r = svg.getBoundingClientRect();
    board.zoomAt(r.left + r.width / 2, r.top + r.height / 2, f);
  }
  svg.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'mouse' && !drag) { peekAt = { x: e.clientX, y: e.clientY }; updatePeek(); }
    if (drag?.kind === 'pinch') return;
    const loc = board.locate(e.clientX, e.clientY);
    const nh = loc ? { at: loc.at, side: loc.side, edge: loc.dist > 0.45 } : null;
    const same = hover && nh && hexKey(hover.at) === hexKey(nh.at) && hover.side === nh.side && hover.edge === nh.edge;
    if (!same) { hover = nh; if (!drag) renderBoard(); }
  });
  svg.addEventListener('pointerleave', (e) => {
    hover = null;
    if (e.pointerType === 'mouse') peekAt = null;
    if (!drag) renderBoard();
  });

  // Two fingers on the board: zoom by how far apart they move, pan with
  // their midpoint. Whatever the first finger was doing is dropped.
  function pinchState() {
    const [[ax, ay], [bx, by]] = [...pointers.values()];
    return { mx: (ax + bx) / 2, my: (ay + by) / 2, dist: Math.max(1, Math.hypot(ax - bx, ay - by)) };
  }
  function startPinch() {
    clearTimeout(drag?.hold);
    if (drag?.kind === 'move' || drag?.kind === 'new') ghost.className = 'drag-ghost hidden';
    svg.classList.remove('panning');
    drag = { kind: 'pinch', ...pinchState() };
    hover = null;
    renderBoard();
  }

  function startPaletteDrag(e, name) {
    if (e.button !== 0 || running) return;
    e.preventDefault();
    drag = { kind: 'new', tool: name, x0: e.clientX, y0: e.clientY, active: false, id: e.pointerId, slop: tapSlop(e) };
  }
  const ghost = h('div', { class: 'drag-ghost hidden' });
  root.append(ghost);
  function onMove(e) {
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, [e.clientX, e.clientY]);
    if (!drag) return;
    if (drag.kind === 'pinch') {
      if (pointers.size < 2) return;
      const p = pinchState();
      board.zoomAt(p.mx, p.my, drag.dist / p.dist);
      board.panBy(p.mx - drag.mx, p.my - drag.my);
      Object.assign(drag, p);
      updatePeek();
      return;
    }
    if (drag.id !== undefined && e.pointerId !== drag.id) return;
    // Still holding after the port menu opened: slide onto a port to pick it on release.
    if (drag.radial) { radialHover(e.clientX, e.clientY); return; }
    if (!drag.active && Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) > (drag.slop ?? 6)) { drag.active = true; clearTimeout(drag.hold); }
    if (!drag.active) return;
    if (drag.kind === 'pan') {
      board.panBy(e.clientX - drag.x, e.clientY - drag.y);
      drag.x = e.clientX; drag.y = e.clientY;
      svg.classList.add('panning');
      updatePeek();
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
      h('span', {}, drag.kind === 'new' ? chipLabel(paletteSample(name)) : chipLabel(cellAt(drag.key)))),
    ...(overPalette && drag.kind === 'move' ? [h('span', { class: 'ghost-t' }, 'remove')] : []));
    renderBoard();
  }
  function onUp(e) {
    const wasPinch = drag?.kind === 'pinch';
    pointers.delete(e.pointerId);
    if (wasPinch) {
      // One finger left: it carries on panning (lifting it doesn't count as a tap).
      const rest = [...pointers][0];
      drag = rest ? { kind: 'pan', id: rest[0], x0: rest[1][0], y0: rest[1][1], x: rest[1][0], y: rest[1][1], active: true } : null;
      return;
    }
    if (!drag || (drag.id !== undefined && e.pointerId !== drag.id)) return;
    const d = drag;
    drag = null;
    clearTimeout(d.hold);
    ghost.className = 'drag-ghost hidden';
    // (The press that opened the port menu leaves it open even if the browser cancels it.)
    if (e.type === 'pointercancel' && !d.radial) { svg.classList.remove('panning'); renderBoard(); return; }
    if (d.radial) {
      // Released on a port: pick it; anywhere else the menu stays open for a tap.
      const item = e.type === 'pointerup' && radialHover(e.clientX, e.clientY);
      if (item) pickRadial(item.dataset.port);
      return;
    }
    if (d.kind === 'pan') {
      svg.classList.remove('panning');
      if (d.active) return;
      if (d.peek) { peekAt = { x: e.clientX, y: e.clientY, tap: true }; updatePeek(); return; }
      if (d.assign !== undefined) { assign(d.assign); return; }
      if (d.place) { place(tool, d.place); return; }
      dropSelection();
      return;
    }
    if (!d.active) {
      if (d.kind === 'new') setTool(tool === d.tool ? null : d.tool);
      return;
    }
    if (d.kind === 'move') {
      if (d.overPalette) remove(d.key);
      else if (d.over && hexKey(d.over) !== d.key) move(d.key, d.over);
    } else if (d.over) {
      place(d.tool, d.over);
    }
    renderBoard(); // clear the drop marker when nothing changed
  }
  document.addEventListener('pointermove', onMove);
  document.addEventListener('pointerup', onUp);
  document.addEventListener('pointercancel', onUp);

  // ---------- port menu ----------
  // A long press on an edge of a croupier opens a ring of its ports around
  // the press: pick one (tap it, or slide onto it and let go) to point it at
  // that side. Ports already pointing there are marked; picking one of those
  // sends it to the floor (unless it must point somewhere). Deal's entry adds
  // the side to its list.
  const HOLD_MS = 300;
  let radialSide = null;
  // Taps on the menu count only once a press starts on it: lifting the finger
  // that opened it makes a touch screen click whatever is under it now (the
  // centre, which closes it).
  let radialArmed = false;
  radial.addEventListener('pointerdown', () => { radialArmed = true; });
  radial.addEventListener('contextmenu', (e) => e.preventDefault());
  function radialOpen() { return radialSide !== null; }
  function holdFor(side) {
    const d = drag;
    d.hold = setTimeout(() => {
      if (drag !== d || d.active) return;
      d.radial = true;
      openRadial(side, d.x0, d.y0);
    }, HOLD_MS);
  }
  function openRadial(side, x, y) {
    const c = selCell();
    const ports = c ? portsOf(c) : [];
    if (!ports.length) return;
    radialSide = side;
    const n = ports.length;
    const ring = n > 4 ? 64 : 54;
    const items = ports.map((p, i) => {
      const st = PORT_STYLE[p];
      const on = p === 'to' ? (c.out.to ?? []).includes(side) : getPort(c, p) === side;
      const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
      const fixed = on && isRequired(c, p);
      return h('button', {
        class: `radial-item${on ? ' on' : ''}${st.input ? ' input' : ''}`, 'data-port': p, role: 'menuitem',
        title: p === 'to' ? `Add ${SIDE_NAMES[side]} to the deal list` : on ? (fixed ? `${st.label} already points ${SIDE_NAMES[side]}` : `${st.label}: back to the floor`) : `Point ${st.label} ${SIDE_NAMES[side]}`,
        style: {
          left: `${(Math.cos(a) * ring).toFixed(1)}px`, top: `${(Math.sin(a) * ring).toFixed(1)}px`,
          ...(st.input ? { color: st.color, borderColor: st.color } : { background: st.color }),
        },
        onclick: () => { if (radialArmed) pickRadial(p); },
      }, p === 'to' ? 'deal +' : st.label, on ? h('span', { class: 'radial-tick' }, '✓') : null);
    });
    radialArmed = false;
    radial.replaceChildren(h('button', { class: 'radial-hub', title: 'Close (Esc)', onclick: () => { if (radialArmed) closeRadial(); } }, h('b', {}, ARROW[side]), h('span', {}, SIDE_NAMES[side])), ...items);
    // Centred on the press, kept inside the board.
    const wrap = radial.parentElement.getBoundingClientRect();
    const m = ring + 34;
    const cx = Math.max(m, Math.min(wrap.width - m, x - wrap.left));
    const cy = Math.max(m, Math.min(wrap.height - m, y - wrap.top));
    radial.style.transform = `translate(${cx.toFixed(0)}px, ${cy.toFixed(0)}px)`;
    radial.className = 'radial';
    peekAt = null;
    hover = null; // no edge tip under the menu
    renderBoard();
  }
  function closeRadial() {
    if (!radialOpen()) return;
    radialSide = null;
    radial.className = 'radial hidden';
    radial.replaceChildren();
  }
  // The port under (x, y), highlighted, or null.
  function radialHover(x, y) {
    const item = document.elementFromPoint(x, y)?.closest?.('.radial-item');
    radial.querySelectorAll('.radial-item').forEach((el) => el.classList.toggle('hot', el === item));
    return item ?? null;
  }
  function pickRadial(p) {
    const c = selCell();
    const side = radialSide;
    closeRadial();
    if (!c || side === null) return;
    if (p === 'to') assign(side, 'to');
    else if (getPort(c, p) === side) assign(isRequired(c, p) ? side : undefined, p, { advance: false });
    else assign(side, p, { advance: false });
  }
  // A press anywhere else on the page closes it (the board handles its own).
  function onDocDown(e) {
    if (radialOpen() && !e.target.closest?.('.radial, svg.board')) closeRadial();
  }
  document.addEventListener('pointerdown', onDocDown, true);

  // ---------- keyboard ----------
  function onKey(e) {
    if (e.target.closest?.('input, textarea, select') || dialogOpen()) return;
    if (modal.firstChild) {
      if (e.key === 'Escape') modal.replaceChildren();
      return;
    }
    if (ctx.helpOpen()) return;
    const k = e.key;
    const lower = k.length === 1 ? k.toLowerCase() : k;
    if ((e.ctrlKey || e.metaKey) && lower === 'z') {
      e.preventDefault();
      if (e.shiftKey) redoStep(); else undoStep();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && lower === 'y') {
      e.preventDefault();
      redoStep();
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (k === ' ') { e.preventDefault(); if (playing) stop(); else play(); return; }
    if (k === '.') { e.preventDefault(); stop(); stepOnce(); return; }
    if (k === ',') { e.preventDefault(); back(); return; }
    if (lower === 'r') { leavePlay(); resetSim(); renderAll(); return; }
    if (k === '+' || k === '=') { zoomCenter(1 / 1.25); return; }
    if (k === '-') { zoomCenter(1.25); return; }
    if (k === '0') { board.fit(); return; }
    if (lower === 'f') { speed = (speed + 1) % SPEEDS.length; renderTransport(); return; }
    if (lower === 'h') { ctx.help(); return; }
    if (k === 'Escape') {
      if (radialOpen()) closeRadial(); else if (tool) setTool(null); else select(null);
      return;
    }
    if (k === 'Delete' || k === 'Backspace') { if (selected) { e.preventDefault(); remove(selected); } return; }
    if (/^[1-9]$/.test(k)) {
      const name = level.croupiers[Number(k) - 1];
      if (name) setTool(tool === name ? null : name);
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
      else assign(undefined);
    }
  }
  document.addEventListener('keydown', onKey);

  renderAll();
  void R;

  return () => {
    stop();
    document.removeEventListener('pointermove', onMove);
    document.removeEventListener('pointerup', onUp);
    document.removeEventListener('pointercancel', onUp);
    document.removeEventListener('pointerdown', onDocDown, true);
    cancelAnimationFrame(animRaf);
    document.removeEventListener('keydown', onKey);
  };
}

// Single-step icons: one triangle and a bar (not the double-triangle skip icons).
function icon(kind) {
  const path = kind === 'step' ? 'M5 3 L13 9 L5 15 Z M14 3 h2.5 v12 H14 Z' : 'M13 3 L5 9 L13 15 Z M1.5 3 h2.5 v12 H1.5 Z';
  return s('svg', { class: 'tp-icon', viewBox: '0 0 18 18', width: 16, height: 16, 'aria-hidden': 'true' },
    s('path', { d: path, fill: 'currentColor' }));
}
