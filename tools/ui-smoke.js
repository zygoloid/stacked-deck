// Browser smoke test for the UI (Playwright + Chromium, not a repo dependency).
//   node tools/ui-smoke.js [screenshot-dir]
// Uses the `playwright` package from node_modules or the global npm root, and
// the browsers in PLAYWRIGHT_BROWSERS_PATH. It serves the repo itself, solves
// 'opening-night', checks the save and unlock, records a second (longer)
// solution and checks the solutions plot (load, delete), checks that a wrong payout
// on the first level that drops hands pauses the run and can be stepped back,
// checks floor numbering (playing-card labels), special card faces, the shoe
// deck parser's special-card rules, and placing Burn and Hand croupiers (with
// a Hand's held cards drawn on the board), step animation (copies of a card
// each moving from their own place; stepping back too, a Duplicate's copies
// going back into their originals), pausing with a
// slow mouse click, touch (drag pans with a croupier picked, tap places,
// tapping the bare floor deselects, pinch zoom, a selected croupier's panel
// right under the floor on a phone, tap to see a cut-short Deal
// label), a croupier's settings before placing, and the floors list scrolled
// back to the floor just left; two tabs keeping each other's progress, the
// Save file dialog (download, load), and the notice when storage is turned off
// or full. With `?testlevels` the page adds the
// fixture floors of test/ui-levels.js to the bonus deck; those cover an
// `expected` floor (expected-payouts list, clearing), an `ordered` floor
// (a wrong card order is rejected) and bonus unlocking, saves and Next.
// --all also solves every bonus floor that has a reference solution.
import { spawn, execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as L from '../src/levels.js';
import { DIRS } from '../src/engine.js';
import { floorLabel } from '../src/ui/floors.js';
import { dealLabel } from '../src/ui/board.js';

const { LEVELS } = L;
const BONUS_LEVELS = Array.isArray(L.BONUS) ? L.BONUS : [];
const repo = fileURLToPath(new URL('..', import.meta.url));
const args = process.argv.slice(2);
const all = args.includes('--all');          // also solve every level with its reference solution
const shots = args.find((a) => !a.startsWith('--')) || null;
if (shots) mkdirSync(shots, { recursive: true });

async function loadPlaywright() {
  try { return await import('playwright'); } catch { /* fall through */ }
  const root = execSync('npm root -g').toString().trim();
  return createRequire(join(root, 'noop.js'))('playwright');
}

const { chromium } = await loadPlaywright();

// Shortest line of passes from the (single) source to the desk: [[at, outSide], ...],
// avoiding the hexes in `blocked` ("q,r" keys).
function passLine(lv, blocked = new Set()) {
  const key = ([q, r]) => `${q},${r}`;
  const add = ([q, r], d) => [q + DIRS[d][0], r + DIRS[d][1]];
  const src = lv.fixed.find((c) => c.kind === 'source');
  const desk = lv.fixed.find((c) => c.kind === 'payout');
  const floor = new Set(lv.floor.map(key));
  lv.fixed.forEach((c) => floor.delete(key(c.at)));
  blocked.forEach((k) => floor.delete(k));
  const start = add(src.at, src.out);
  if (!floor.has(key(start))) return null;
  const prev = new Map([[key(start), null]]);
  const queue = [start];
  while (queue.length) {
    const at = queue.shift();
    for (let d = 0; d < 6; d++) {
      const n = add(at, d);
      if (key(n) === key(desk.at)) {
        const line = [[at, d]];
        for (let p = prev.get(key(at)); p; p = prev.get(key(p[0]))) line.unshift(p);
        return line;
      }
      if (floor.has(key(n)) && !prev.has(key(n))) { prev.set(key(n), [at, d]); queue.push(n); }
    }
  }
  return null;
}
const port = 8000 + Math.floor(Math.random() * 900) + 100;
const server = spawn(process.execPath, [join(repo, 'tools/serve.js')], { env: { ...process.env, PORT: String(port) }, stdio: 'pipe' });
await new Promise((res) => server.stdout.once('data', res));
const base = `http://localhost:${port}/`;

let failures = 0;

// The floors list shows one deck at a time: pick `deck` ('campaign' or
// 'bonus') if it has a tab and isn't showing.
async function showDeck(pg, deck) {
  await pg.waitForSelector('.deck');
  if (await pg.locator(`.deck-tab.${deck}:not(.on)`).count()) await pg.click(`.deck-tab.${deck}`);
  await pg.waitForSelector(`.deck.${deck}`);
}
const check = (cond, msg) => {
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${msg}`);
  if (!cond) failures++;
};

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 860 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  // Signed out, the game must not contact any other site (the online
  // features load only on signing in), and nothing may break its CSP.
  const external = [];
  page.on('request', (r) => { const u = new URL(r.url()); if (/^https?:$/.test(u.protocol) && !['localhost', '127.0.0.1'].includes(u.hostname)) external.push(r.url()); });
  page.on('console', (m) => { if (m.type() === 'error' && /Content Security Policy/i.test(m.text())) errors.push(m.text()); });
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('dialog', (d) => d.accept()); // "Clear the whole floor?", "Delete ... solution?"

  await page.goto(base);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForSelector('.tile');
  check(await page.locator('a.tile[data-level="opening-night"]').count() === 1, 'level select lists opening-night');
  check(await page.locator(`a.tile[data-level="${LEVELS[2].id}"]`).count() === 1, 'first three levels are open');
  check(await page.locator(`a.tile[data-level="${LEVELS[3].id}"]`).count() === 0, 'fourth level is locked');
  // Nothing covers the floors list's header (the editor's styles once took it out of the page flow).
  const covered = await page.$$eval('header.marquee button', (bs) => bs.filter((b) => {
    const r = b.getBoundingClientRect();
    const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    return !(top === b || b.contains(top));
  }).map((b) => b.textContent));
  check(!covered.length && await page.locator('header.marquee button').count() > 0, `the floors list's header buttons are on top${covered.length ? ` (covered: ${covered.join(', ')})` : ''}`);
  if (shots) await page.screenshot({ path: join(shots, '1-level-select.png') });

  await page.click('a.tile[data-level="opening-night"]');
  await page.waitForSelector('.story-card');
  check((await page.textContent('.story-card h1')).includes('Opening Night'), 'story screen shows the title');
  await page.click('.story-actions .btn.gold');
  await page.waitForSelector('svg.board');

  // Screen position of a hex centre (and of a point toward side d).
  const hexPoint = (at, d = null, frac = 0.8) => page.evaluate(([[q, r], d, frac]) => {
    const R = 50, svg = document.querySelector('svg.board');
    let x = R * Math.sqrt(3) * (q + r / 2), y = R * 1.5 * r;
    if (d !== null) { x += Math.cos(d * Math.PI / 3) * R * 0.866 * frac; y += Math.sin(d * Math.PI / 3) * R * 0.866 * frac; }
    const p = new DOMPoint(x, y).matrixTransform(svg.getScreenCTM());
    return [p.x, p.y];
  }, [at, d, frac]);
  const clickHex = async (at, d, frac) => { const [x, y] = await hexPoint(at, d, frac); await page.mouse.click(x, y); };

  // Build the trivial solution: a line of passes from the player to the desk
  // (for 'opening-night': [-1,0] [0,0] [1,0], out -> E), derived from level.fixed.
  const line1 = passLine(LEVELS[0]);
  const buildLine = async (line) => {
    for (const [at] of line) { await page.click('.pal-item[data-tool="pass"]'); await clickHex(at); } // placing one puts the tool down
    await page.keyboard.press('Escape'); // deselect the last
    for (const [at, d] of line) {
      await clickHex(at);                 // select
      await page.keyboard.press('x');     // port to the floor
      await clickHex(at, d);              // click the edge: out -> d
    }
  };
  await buildLine(line1);
  check(await page.locator('.sol-btn.hidden').count() === 1, 'no Solutions button before the floor is cleared');
  check((await page.textContent('.stats .stat-v')).trim() === String(line1.length), `croupier count shows ${line1.length}`);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('stacked-deck-v1')));
  const cells = saved?.levels?.['opening-night']?.cells ?? [];
  check(cells.length === line1.length && line1.every(([at, d]) => cells.some((c) => c.at.join() === at.join() && c.fn === 'pass' && c.out.out === d)),
    `machine autosaved: ${line1.map(([at, d]) => `[${at}]->${'E SE SW W NW NE'.split(' ')[d]}`).join(' ')}`);
  // Placing a croupier selects it and puts the palette tool down.
  check(await page.locator('.pal-item.on').count() === 0, 'placing a croupier puts the croupier type down');
  // Dragging a croupier: the ghost shows its chip (and nothing else).
  {
    const [gx, gy] = await hexPoint(line1[0][0]);
    await page.mouse.move(gx, gy);
    await page.mouse.down();
    await page.mouse.move(gx + 30, gy + 30, { steps: 3 });
    const ghostText = (await page.textContent('.drag-ghost')).trim();
    await page.mouse.move(gx, gy, { steps: 3 });
    await page.mouse.up();
    check(ghostText === 'PASS', `dragging a croupier shows just its chip ("${ghostText}")`);
  }
  await clickHex(line1[Math.floor(line1.length / 2)][0]);
  if (shots) await page.screenshot({ path: join(shots, '2-editor.png') });

  // Watch a few rounds.
  await page.keyboard.press('Escape');
  for (let i = 0; i < 4; i++) await page.keyboard.press('.');
  check((await page.textContent('.tp-round b')).trim() === '4', 'stepping advances rounds');
  await page.keyboard.press(',');
  check((await page.textContent('.tp-round b')).trim() === '3', 'step back goes back a round');
  const cardsOnBoard = await page.locator('.l-cards .scard').count();
  check(cardsOnBoard >= 2, `cards drawn on the board (${cardsOnBoard})`);
  if (shots) await page.screenshot({ path: join(shots, '3-running.png') });

  // Stepping animates the cards from where they were to where they are.
  {
    const where = () => page.$$eval('.l-cards .scard', (els) => els.map((e) => e.getAttribute('transform') + (e.getAttribute('opacity') ?? '')).join(' '));
    await page.keyboard.press('.');
    const during = await where();
    await page.waitForTimeout(500);
    const after = await where();
    check(during !== after, 'a step animates the cards');
    await page.keyboard.press(',');
    const backDuring = await where();
    await page.waitForTimeout(500);
    const backAfter = await where();
    check(backDuring !== backAfter, 'a step back animates the cards');
  }
  // Copies of a card each move from their own place: Duplicate's copies go on
  // to two passes, and in one step one is paid and the other dropped. The
  // desk's card slides in from the paid copy; the dropped one fades out.
  {
    const r = await page.evaluate(async () => {
      const { Board } = await import('./src/ui/board.js');
      const { Sim } = await import('./src/ui/sim.js');
      const level = {
        floor: [[0, 0], [1, 0], [2, 0], [3, 0], [1, 1], [0, 2], [1, 2]],
        fixed: [{ at: [0, 0], kind: 'source', out: 0 }, { at: [3, 0], kind: 'payout' }],
      };
      const cells = [ // the dropping pass first, so its copy is drawn first
        { at: [1, 1], kind: 'croupier', fn: 'pass', out: { out: 2 } },
        { at: [1, 0], kind: 'croupier', fn: 'duplicate', out: { a: 1, b: 0 } },
        { at: [2, 0], kind: 'croupier', fn: 'pass', out: { out: 0 } },
      ];
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.style.cssText = 'position:fixed;left:0;top:0;width:600px;height:400px';
      document.body.append(svg);
      const board = new Board(svg, level);
      const sim = new Sim({ cells: [...level.fixed, ...cells] }, [['AS', 'KH']], () => true);
      const draw = (anim) => board.render({ cells, live: sim.floor, paidNow: sim.paidNow, paidNowDesk: sim.paidNowDesk, anim });
      const inv = svg.getScreenCTM().inverse();
      const at = (el) => { const p = new DOMPoint(0, 0).matrixTransform(el.getScreenCTM()).matrixTransform(inv); return `${p.x.toFixed(1)},${p.y.toFixed(1)}`; };
      draw(null);
      let out = null;
      for (let i = 0; i < 10 && !out; i++) {
        const from = board.positions;
        // The ace of each copy: the paying pass is east, the dropping one south-east.
        const ace = (f) => [...from].find(([x, p]) => x.c === 'AS' && f(p))?.[1];
        const paid = ace((p) => p.x > 100 && p.y < 0), dropped = ace((p) => p.y > 20);
        sim.step();
        draw({ from, t: 0 });
        if (sim.floor.paid.length) {
          const xy = (p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
          out = { desk: at(svg.querySelector('.paid-now .scard')), paid: paid && xy(paid), dropped: dropped && xy(dropped),
            fading: [...svg.querySelectorAll('.l-cards > .scard.black')].map(at) };
        }
        draw(null);
      }
      svg.remove();
      return out;
    });
    check(r && r.paid && r.desk === r.paid && r.fading.includes(r.dropped) && !r.fading.includes(r.paid),
      `a paid copy of a card slides from its own place, the dropped copy fades (${JSON.stringify(r)})`);
  }
  // Stepping back over a Duplicate: its copies slide back into the card they
  // copy (rather than fading), and the hand it took slides back to its slot.
  {
    const r = await page.evaluate(async () => {
      const { Board } = await import('./src/ui/board.js');
      const { Sim } = await import('./src/ui/sim.js');
      const level = {
        floor: [[0, 0], [1, 0], [2, 0], [3, 0], [1, 1], [0, 2], [1, 2]],
        fixed: [{ at: [0, 0], kind: 'source', out: 0 }, { at: [3, 0], kind: 'payout' }],
      };
      const cells = [
        { at: [1, 1], kind: 'croupier', fn: 'pass', out: { out: 2 } },
        { at: [1, 0], kind: 'croupier', fn: 'duplicate', out: { a: 1, b: 0 } },
        { at: [2, 0], kind: 'croupier', fn: 'pass', out: { out: 0 } },
      ];
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.style.cssText = 'position:fixed;left:0;top:0;width:600px;height:400px';
      document.body.append(svg);
      const board = new Board(svg, level);
      const sim = new Sim({ cells: [...level.fixed, ...cells] }, [['AS', 'KH']], () => true);
      const draw = (anim) => board.render({ cells, live: sim.floor, paidNow: sim.paidNow, paidNowDesk: sim.paidNowDesk, anim });
      const loose = () => [...svg.querySelectorAll('.l-cards > .scard')].map((e) => {
        const [x, y] = e.getAttribute('transform').match(/translate\(([^,]*),([^)]*)\)/).slice(1).map(Number);
        return { x, y, op: e.getAttribute('opacity') };
      });
      const near = (p) => (e) => Math.abs(e.x - p.x) < 0.3 && Math.abs(e.y - p.y) < 0.3 && !e.op;
      draw(null);
      for (let i = 0; i < 10 && !sim.floor.copiedFrom.size; i++) { sim.step(); draw(null); }
      const copies = [...sim.floor.copiedFrom];
      if (!copies.length) { svg.remove(); return null; }
      const from = board.positions;
      const back = sim.back();
      const anim = { from, t: 0, back };
      draw(anim);
      const start = loose();
      const origins = copies.map(([copy, orig]) => [from.get(copy), board.landing.get(orig)]);
      anim.t = 0.9999;
      draw(anim);
      const end = loose();
      svg.remove();
      return {
        start, end, copies: copies.length,
        moved: origins.every(([a, b]) => a && b && start.some(near(a)) && end.some(near(b))),
      };
    });
    check(r?.moved, `stepping back, Duplicate's copies slide back into their originals (${JSON.stringify(r)})`);
  }

  // Pause with a real (slow) mouse click while playing: the transport isn't
  // rebuilt under the pointer, so the click lands.
  {
    await page.click('.speeds .sp:first-child'); // 1x, plays
    await page.waitForTimeout(700);
    const b = await page.evaluate(() => { const r = document.querySelector('.tp.main').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; });
    await page.mouse.move(...b);
    await page.mouse.down();
    await page.waitForTimeout(200);
    await page.mouse.up();
    const r1 = await page.textContent('.tp-round b');
    await page.waitForTimeout(700);
    check((await page.textContent('.tp.main')).trim() === '▶' && await page.textContent('.tp-round b') === r1, `a slow mouse click pauses (round ${r1})`);
  }

  // Play one test to the end at full speed.
  await page.click('.speeds .sp:last-child');
  await page.waitForSelector('.sim-status.good', { timeout: 10000 });
  check(true, 'test 1 passes when played');

  // Passing the watched test checks every test and clears the floor.
  await page.waitForSelector('.modal.results', { timeout: 20000 });
  check((await page.textContent('.modal.results h2')).includes('cleared'), 'results panel shows the floor cleared');
  if (shots) await page.screenshot({ path: join(shots, '4-results.png') });
  const save = await page.evaluate(() => JSON.parse(localStorage.getItem('stacked-deck-v1')));
  const lv = save.levels['opening-night'];
  check(lv.solved === true && lv.best.croupiers === line1.length && Number.isInteger(lv.best.rounds), `saved solved with best ${JSON.stringify(lv.best)}`);
  check(lv.solutions?.length === 1 && lv.solutions[0].croupiers === line1.length && lv.solutions[0].rounds === lv.best.rounds &&
    lv.solutions[0].cells.length === line1.length && Number.isFinite(lv.solutions[0].at), 'the solution is recorded');
  check(await page.locator('.modal.results .scatter .sc-pt').count() === 1 && await page.locator('.modal.results .sc-pt.fresh.front').count() === 1,
    'results plot shows the new solution, highlighted');
  const best1 = lv.best;

  // Clearing again with the same machine doesn't add a duplicate.
  await page.click('.modal-actions .btn:first-child'); // Keep tinkering
  await page.click('.tp.main');
  await page.waitForSelector('.modal.results', { timeout: 20000 });
  let ls = (await page.evaluate(() => JSON.parse(localStorage.getItem('stacked-deck-v1')))).levels['opening-night'];
  check(ls.solutions.length === 1 && /already saved/.test(await page.textContent('.modal.results')), 'clearing with the same machine adds no duplicate');
  await page.click('.modal-actions .btn:first-child');

  // A second, longer solution: the shortest line that avoids the first line's middle hex.
  const line2 = passLine(LEVELS[0], new Set([line1[Math.floor(line1.length / 2)][0].join()]));
  check(!!line2 && line2.length > line1.length, `a longer route exists (${line2?.length} passes)`);
  await page.click('.pal-tools .btn.danger'); // Clear floor (confirm accepted)
  await buildLine(line2);
  await page.keyboard.press('Escape');
  await page.click('.speeds .sp:last-child');
  await page.waitForSelector('.modal.results', { timeout: 20000 });
  ls = (await page.evaluate(() => JSON.parse(localStorage.getItem('stacked-deck-v1')))).levels['opening-night'];
  check(ls.solutions.length === 2 && ls.solutions[1].croupiers === line2.length, `second solution recorded (${ls.solutions.map((s) => `${s.croupiers}/${s.rounds}`).join(', ')})`);
  check(ls.best.croupiers === best1.croupiers && ls.best.rounds === Math.min(best1.rounds, ls.solutions[1].rounds), `best is kept per axis: ${JSON.stringify(ls.best)}`);
  check(await page.locator('.modal.results .sc-pt').count() === 2 && await page.locator('.modal.results .sc-pt.fresh[data-index="1"]').count() === 1,
    'results plot shows both solutions, the new one highlighted');
  check(await page.locator('.modal.results .sc-front').count() === 1 && await page.locator('.modal.results .sc-par').count() === (LEVELS[0].par ? 1 : 0), 'plot draws the frontier and par');
  await page.hover('.modal.results .sc-pt[data-index="0"] .sc-hit', { force: true });
  check(/croupiers? · \d+ rounds/.test(await page.textContent('.modal.results .sc-tip:not(.hidden)')), 'hovering a point shows its score');
  if (shots) await page.screenshot({ path: join(shots, '4b-results-two-solutions.png') });

  // Clicking the first point loads it into the editor, as an undoable edit.
  await page.click('.modal.results .sc-pt[data-index="0"] .sc-hit', { force: true });
  check(await page.locator('.modal.results').count() === 0, 'clicking a point closes the results');
  check((await page.textContent('.stats .stat-v')).trim() === String(line1.length), `clicking the first point loads it (croupiers ${line2.length} -> ${line1.length})`);
  await page.keyboard.press('Control+z');
  check((await page.textContent('.stats .stat-v')).trim() === String(line2.length), 'undo puts the other machine back');
  await page.keyboard.press('Control+Shift+z');
  check((await page.textContent('.stats .stat-v')).trim() === String(line1.length), 'redo loads it again');

  // The Solutions panel in the editor: plot and list, delete one.
  check((await page.textContent('.sol-btn')).trim() === 'Solutions (2)', 'top bar shows Solutions (2)');
  await page.click('.sol-btn');
  await page.waitForSelector('.modal.solutions');
  check(await page.locator('.modal.solutions .sc-pt').count() === 2 && await page.locator('.modal.solutions .sol-row').count() === 2, 'Solutions panel plots and lists both');
  check(await page.locator('.modal.solutions .sc-pt.current[data-index="0"]').count() === 1, 'the loaded machine is highlighted');
  if (shots) await page.screenshot({ path: join(shots, '4c-solutions-panel.png') });
  await page.click('.modal.solutions .sol-row[data-index="1"] .sol-del'); // confirm accepted
  ls = (await page.evaluate(() => JSON.parse(localStorage.getItem('stacked-deck-v1')))).levels['opening-night'];
  check(ls.solutions.length === 1 && ls.solutions[0].croupiers === line1.length && ls.solved, 'deleting removes it from the save');
  check(ls.best.croupiers === best1.croupiers && ls.best.rounds === best1.rounds, `best recomputed: ${JSON.stringify(ls.best)}`);
  check(await page.locator('.modal.solutions .sc-pt').count() === 1 && await page.locator('.modal.solutions .sol-row').count() === 1 &&
    (await page.textContent('.sol-btn')).trim() === 'Solutions (1)', 'deleted solution is gone from the plot, list and button');
  await page.keyboard.press('Escape');
  check(await page.locator('.modal.solutions').count() === 0, 'Esc closes the Solutions panel');

  // Next level is unlocked.
  const next = LEVELS[1];
  await page.goto(`${base}#/level/${next.id}/story`);
  await page.waitForSelector('.story-card');
  check((await page.textContent('.story-card h1')).includes(next.title), `next level (${next.id}) opens`);

  // Wrong payout: on the first level that drops some hand, a plain pass line
  // from the player to the desk pays everything.
  const wrongLevel = LEVELS.find((lv) => lv.croupiers.includes('pass') && lv.fixed.filter((c) => c.kind === 'source').length === 1 &&
    typeof lv.pays === 'function' && lv.tests[0].some((hand, i) => !lv.pays(hand, lv.tests[0].slice(0, i))) && passLine(lv));
  if (wrongLevel) {
    await page.goto(`${base}?unlockall#/level/${wrongLevel.id}`);
    await page.waitForSelector('svg.board');
    const line = passLine(wrongLevel);
    for (const [at] of line) { await page.click('.pal-item[data-tool="pass"]'); await clickHex(at); }
    await page.keyboard.press('Escape');
    for (const [at, d] of line) { await clickHex(at); await page.keyboard.press('x'); await page.keyboard.press('dczaqe'[d]); }
    await page.keyboard.press('Escape');
    for (let i = 0; i < 60 && !(await page.locator('.toast.bad').count()); i++) await page.keyboard.press('.');
    const toast = await page.textContent('.toast');
    check(/Wrong payout/.test(toast || ''), `${wrongLevel.id}: wrong payout pauses the run: "${(toast || '').slice(0, 60)}..."`);
    check(await page.locator('.p-item.bad').count() === 1, 'paid list marks the wrong hand');
    if (shots) await page.screenshot({ path: join(shots, '5-wrong-payout.png') });
    await page.keyboard.press(',');
    check(await page.locator('.p-item.bad').count() === 0, 'step back undoes the wrong payout');
  } else {
    console.log('skip wrong-payout check: no suitable level');
  }

  await page.goto(base);
  await page.waitForSelector('.tile');
  check(await page.locator('a.tile.solved[data-level="opening-night"]').count() === 1, 'level select marks opening-night solved');
  check(await page.locator(`a.tile[data-level="${LEVELS[3].id}"]`).count() === 1, `clearing a floor opens ${LEVELS[3].id}`);
  check(await page.locator(`a.tile[data-level="${LEVELS[4].id}"]`).count() === 0, `${LEVELS[4].id} still locked`);
  {
    // Every card, open or locked, is the same size, in a playing card's proportions.
    const sizes = await page.$$eval('.tiles > *', (els) => els.map((e) => { const r = e.getBoundingClientRect(); return `${r.width.toFixed(1)}x${r.height.toFixed(1)}`; }));
    const [w, hgt] = sizes[0].split('x').map(Number);
    check(new Set(sizes).size === 1 && Math.abs(w / hgt - 5 / 7) < 0.01, `floor cards are all ${sizes[0]} (${new Set(sizes).size} sizes)`);
    // The cleared floor's best against par, and its chart on hovering it.
    const marks = await page.$$eval('a.tile[data-level="opening-night"] .ts-axis', (els) => els.map((e) => e.className));
    const par = LEVELS[0].par;
    check(marks.length === 2 && (par.croupiers !== 3 || par.rounds !== 33 || marks.every((c) => c.includes('ts-at'))), `cleared card marks its best against par (${marks.join(', ')})`);
    await page.hover('a.tile[data-level="opening-night"]');
    await page.waitForSelector('.tile-pop:not(.hidden) .sc-svg', { timeout: 3000 }).catch(() => {});
    check(await page.locator('.tile-pop:not(.hidden) .sc-pt').count() >= 1, 'hovering a cleared card shows its chart');
    await page.mouse.move(2, 2);
    await page.waitForTimeout(300);
    check(await page.locator('.tile-pop.hidden').count() === 1, 'the chart goes away on leaving the card');
    // Clicking one of the player's points on it opens the floor with that machine.
    await page.hover('a.tile[data-level="opening-night"]');
    await page.waitForSelector('.tile-pop:not(.hidden) .sc-pt', { timeout: 3000 }).catch(() => {});
    await page.click('.tile-pop .sc-pt');
    await page.waitForSelector('svg.board', { timeout: 5000 }).catch(() => {});
    const toast = await page.textContent('.toast').catch(() => '');
    check(page.url().endsWith('#/level/opening-night') && /Loaded your/.test(toast ?? ''),
      `clicking a point on a card's chart opens the floor with that solution ("${(toast ?? '').slice(0, 50)}")`);
    await page.goto(base);
    await page.waitForSelector('.tile');
  }
  if (shots) await page.screenshot({ path: join(shots, '6-level-select-after.png') });

  // Help panel.
  await page.keyboard.press('?');
  check(await page.locator('.modal.help .help-table tr').count() >= 10, 'help panel lists croupiers');
  check(await page.locator('.modal.help a[href="privacy.html"]').count() === 1, 'help links the privacy notice');
  await page.keyboard.press('Escape');

  // An old save (no solutions list) still loads; best is kept when solving.
  {
    const sol = (await import(join(repo, 'solutions/levels/opening-night.js'))).default;
    await page.goto(base);
    await page.evaluate((cells) => {
      localStorage.setItem('stacked-deck-v1', JSON.stringify({ levels: { 'opening-night': { cells, solved: true, best: { croupiers: 2, rounds: 9 } } } }));
    }, sol.cells);
    await page.goto(`${base}?old-save#/level/opening-night`); // a fresh load reads the old save
    await page.waitForSelector('svg.board');
    check(await page.locator('.sol-btn.hidden').count() === 1, 'old save: loads, no Solutions button');
    await page.click('.speeds .sp:last-child');
    await page.waitForSelector('.modal.results', { timeout: 20000 });
    const ls = (await page.evaluate(() => JSON.parse(localStorage.getItem('stacked-deck-v1')))).levels['opening-night'];
    check(ls.solutions.length === 1 && ls.best.croupiers === 2 && ls.best.rounds === 9, `old save: solution added, old best kept ${JSON.stringify(ls.best)}`);
    await page.goto(base);
    await page.evaluate(() => localStorage.setItem('stacked-deck-v1', JSON.stringify({ levels: { 'opening-night': { solved: true } } })));
  }

  // When the watched test passes but another fails, the floor is left paused
  // at the failure. This 'Beat the Dealer' machine plays an 8 instead of a 9,
  // so it passes test 4 (no 9s) and pays a 9 wrongly in test 1.
  {
    const lv = LEVELS.find((l) => l.id === 'beat-the-dealer');
    const sol = (await import(join(repo, 'solutions/levels/beat-the-dealer.js'))).default;
    const cells = sol.cells.map((c) => (c.kind === 'shoe' ? { ...c, deck: ['8S'] } : c));
    await page.goto(base);
    await page.evaluate(([id, cells]) => {
      const s = JSON.parse(localStorage.getItem('stacked-deck-v1') || '{"levels":{}}');
      s.levels[id] = { cells };
      localStorage.setItem('stacked-deck-v1', JSON.stringify(s));
    }, [lv.id, cells]);
    await page.goto(`${base}?unlockall#/level/${lv.id}`);
    await page.waitForSelector('svg.board');
    await page.click('.test-chip:nth-child(4)');
    await page.click('.speeds .sp:last-child');
    await page.waitForSelector('.toast.bad', { timeout: 20000 });
    const msg = await page.textContent('.toast');
    check(/Test 4 passed, but test 1 failed\. Wrong payout in round \d+/.test(msg) && !/watch/i.test(msg), `other failing test reported: "${msg.slice(0, 80)}..."`);
    check((await page.textContent('.test-chip.on')).trim() === '1', 'failing test 1 is selected');
    check(await page.locator('.p-item.bad').count() === 1, 'paused at the bad payout');
    const round = Number((await page.textContent('.tp-round b')).trim());
    await page.keyboard.press(',');
    check(await page.locator('.p-item.bad').count() === 0 && Number((await page.textContent('.tp-round b')).trim()) === round - 1, 'one step back undoes it');
  }

  // Solutions saved under older rules are re-scored in the background: a stale
  // score is corrected, a machine that no longer works is marked broken, and
  // best follows. Re-clearing a saved machine also refreshes its score.
  {
    const lv = LEVELS.find((l) => l.id === 'beat-the-dealer');
    const sol = (await import(join(repo, 'solutions/levels/beat-the-dealer.js'))).default;
    const broken = sol.cells.map((c) => (c.kind === 'shoe' ? { ...c, deck: ['8S'] } : c));
    await page.goto(base);
    await page.evaluate(([id, good, bad]) => {
      localStorage.setItem('stacked-deck-v1', JSON.stringify({ levels: { [id]: {
        cells: good, solved: true, best: { croupiers: 4, rounds: 99 },
        solutions: [
          { cells: good, croupiers: 4, rounds: 99, at: 1 },             // stale score, no rules field
          { cells: bad, croupiers: 4, rounds: 50, at: 2, rules: 1 },    // no longer works
        ],
      } } }));
    }, [lv.id, sol.cells, broken]);
    await page.reload();
    await page.waitForFunction((id) => JSON.parse(localStorage.getItem('stacked-deck-v1')).levels[id].solutions.every((x) => x.rules !== undefined && x.rules > 1), lv.id, { timeout: 20000 });
    const ls = await page.evaluate((id) => JSON.parse(localStorage.getItem('stacked-deck-v1')).levels[id], lv.id);
    check(ls.solutions[0].rounds === lv.par.rounds && !ls.solutions[0].broken, `stale score re-scored (99 -> ${ls.solutions[0].rounds})`);
    check(ls.solutions[1].broken === true, 'machine that no longer clears the floor is marked broken');
    check(ls.best.rounds === lv.par.rounds, `best follows the re-scored solutions (${JSON.stringify(ls.best)})`);
    await page.goto(`${base}?unlockall#/level/${lv.id}`);
    await page.waitForSelector('svg.board');
    await page.click('.top-solutions, button:has-text("Solutions")');
    await page.waitForSelector('.sol-list');
    check(await page.locator('.sc-pt').count() === 1 && await page.locator('.sol-score.broken').count() === 1, 'plot shows the working solution; list marks the broken one');
    await page.keyboard.press('Escape');
    // Re-clearing the saved machine refreshes its stored score.
    await page.evaluate((id) => {
      const s = JSON.parse(localStorage.getItem('stacked-deck-v1'));
      s.levels[id].solutions[0].rounds = 77;
      localStorage.setItem('stacked-deck-v1', JSON.stringify(s));
    }, lv.id);
    await page.reload();
    await page.waitForSelector('svg.board');
    await page.click('.speeds .sp:last-child');
    await page.waitForSelector('.modal.results', { timeout: 20000 });
    const after = await page.evaluate((id) => JSON.parse(localStorage.getItem('stacked-deck-v1')).levels[id].solutions[0].rounds, lv.id);
    check(after === lv.par.rounds, `re-clearing a saved machine updates its score (77 -> ${after})`);
  }

  // The palette's War chip shows the rule the level allows.
  for (const [id, want] of [['beat-the-dealer', 'WAR·H'], ['new-rules', 'WAR·T'], ['hot-streak', 'WAR']]) {
    await page.goto(`${base}?unlockall#/level/${id}`);
    await page.waitForSelector('svg.board');
    const label = (await page.textContent('.pal-item[data-tool="war"] .pal-chip')).trim();
    check(label === want, `${id}: palette War chip reads ${label}`);
  }

  // Labelled desks (Uneven Tables): each desk is named and counts its own
  // payouts, expected payouts name their desk, and a player's missing hands
  // are left out of the queue.
  {
    await page.goto(`${base}?unlockall#/level/uneven-tables`);
    await page.waitForSelector('svg.board');
    const labels = await page.$$eval('.cell.payout .fixed-label', (els) => els.map((e) => e.textContent).sort());
    check(labels.join() === 'DESK X,DESK Y,DESK Z', `desks are labelled (${labels})`);
    const lv = L.BONUS.find((l) => l.id === 'uneven-tables');
    const t0 = lv.tests[0];
    const queue = await page.locator('.queue .q-item').count();
    check(queue === t0.filter(Boolean).length, `the queue lists only real hands (${queue} of ${t0.length} entries)`);
    const tags = await page.$$eval('.paid.expected .e-item .desk-tag', (els) => els.map((e) => e.textContent.trim()));
    check(tags.length === t0.filter(Boolean).length && tags[0] === '→ Z', `expected payouts name their desks (${tags.slice(0, 3)})`);
    // A line of passes from player A to the desk opposite it fails at the wrong desk.
    await page.evaluate((cells) => {
      const s = JSON.parse(localStorage.getItem('stacked-deck-v1') || '{"levels":{}}');
      s.levels['uneven-tables'] = { ...(s.levels['uneven-tables'] || {}), cells };
      localStorage.setItem('stacked-deck-v1', JSON.stringify(s));
    }, [-1, 0, 1, 2].map((q) => ({ at: [q, -2], kind: 'croupier', fn: 'pass', out: { out: 0 } })));
    await page.reload();
    await page.waitForSelector('svg.board');
    for (let i = 0; i < 8; i++) await page.keyboard.press('.');
    const status = await page.textContent('.sim-status');
    check(/desk X that belongs at desk Z/.test(status), `a hand paid at the wrong desk is flagged: "${status.slice(0, 80)}"`);
  }

  // On a phone-sized screen, playing must not scroll the page away from the floor.
  {
    const phone = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    phone.on('pageerror', (e) => errors.push(e.message));
    await phone.goto(`${base}?unlockall#/level/even-money`);
    await phone.waitForSelector('svg.board');
    const sol = (await import(join(repo, 'solutions/levels/even-money.js'))).default;
    await phone.evaluate((cells) => {
      const s = JSON.parse(localStorage.getItem('stacked-deck-v1') || '{"levels":{}}');
      s.levels['even-money'] = { cells };
      localStorage.setItem('stacked-deck-v1', JSON.stringify(s));
    }, sol.cells);
    await phone.reload();
    await phone.waitForSelector('svg.board');
    await phone.evaluate(() => window.scrollTo(0, 0));
    // Playwright scrolls the button into view to click it (by a few pixels
    // where the fonts make the page taller), so compare with just after.
    await phone.click('.tp.main');
    const y0 = await phone.evaluate(() => window.scrollY);
    await phone.waitForTimeout(3000);
    const y = await phone.evaluate(() => window.scrollY);
    check(y === y0, `playing on a phone keeps the page still (scrollY ${y0} -> ${y})`);
    if (shots) await phone.screenshot({ path: join(shots, '7-phone-playing.png') });
    await phone.waitForSelector('.modal.results', { timeout: 60000 });
    check(await phone.locator('.modal.results .sc-pt').count() === 1, 'phone: results plot shows the solution');
    if (shots) await phone.screenshot({ path: join(shots, '7b-phone-results.png'), fullPage: true });
    await phone.click('.modal-actions .btn:first-child');
    await phone.click('.sol-btn');
    await phone.waitForSelector('.modal.solutions .sol-row');
    const overflow = await phone.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    check(overflow <= 0, `phone: Solutions panel fits the width (overflow ${overflow}px)`);
    if (shots) await phone.screenshot({ path: join(shots, '7c-phone-solutions.png') });
    await phone.close();
  }

  // A folded suit on a phone: a long press opens the break at the card under
  // the finger, sliding moves it (without scrolling the page), and it stays
  // where the finger lifts; a tap on a hidden card shows it, a tap on the
  // card shown opens it, a tap off the hands closes the break, and a swipe
  // still scrolls. No context menu or text selection on the hand.
  {
    const phone = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    phone.on('pageerror', (e) => errors.push(e.message));
    const cdp = await phone.context().newCDPSession(phone);
    const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y], id) => ({ x, y, id })) });
    const tap = async (pt) => { await touch('touchStart', [pt]); await touch('touchEnd', []); await phone.waitForTimeout(350); };
    await phone.goto(`${base}?unlockall`);
    await phone.evaluate(() => localStorage.setItem('stacked-deck-ui', JSON.stringify({ deck: 'campaign', folded: ['c1'] })));
    await phone.reload();
    await phone.waitForSelector('.tiles.fan');
    const hand = phone.locator('.chapter[data-suit="c1"] .tiles.fan');
    await hand.evaluate((t) => t.scrollIntoView({ block: 'center' }));
    await phone.waitForTimeout(200);
    // The card a break is open after (-1: none).
    const after = () => hand.evaluate((t) => {
      const k = [...t.children].findIndex((c) => (parseFloat(c.style.getPropertyValue('--brk')) || 0) > 0);
      return k < 0 ? -1 : k - 1;
    });
    const strip = async (k) => { const b = await hand.locator(':scope > *').nth(k).boundingBox(); return [b.x + 10, b.y + 40]; };
    const path = () => new URL(phone.url()).hash;
    const y0 = await phone.evaluate(() => scrollY);
    const a = await strip(1);
    await touch('touchStart', [a]);
    await phone.waitForTimeout(650);   // the press (300ms), then the break opening
    const menu = await hand.evaluate((t) => {
      const ev = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
      t.children[1].firstElementChild.dispatchEvent(ev);
      return ev.defaultPrevented;
    });
    check(await after() === 1 && menu && (await hand.evaluate((t) => getComputedStyle(t).userSelect)) === 'none',
      'phone: a long press on a hand opens the break at the card pressed, with no context menu or text selection');
    // Sliding right a little at a time: the break moves on a card at a time.
    const seen = [1];
    for (let x = a[0]; seen[seen.length - 1] < 4 && x < a[0] + 300; x += 6) {
      await touch('touchMove', [[x, a[1]]]);
      await phone.waitForTimeout(30);
      const k = await after();
      if (k !== seen[seen.length - 1]) seen.push(k);
    }
    const scrolled = (await phone.evaluate(() => scrollY)) - y0;
    await touch('touchEnd', []);
    await phone.waitForTimeout(400);
    check(seen.join() === '1,2,3,4' && scrolled === 0 && await after() === 4 && path() === '',
      `phone: sliding moves the break along the hand a card at a time without scrolling, and it stays as the finger lifts (${seen.join(' ')}, scrolled ${scrolled})`);
    await tap(await strip(2));
    check(await after() === 2 && path() === '', 'phone: a tap on a hidden card in a hand shows it, without opening it');
    const shown = await hand.locator(':scope > *').nth(2).boundingBox();
    await tap([shown.x + shown.width / 2, shown.y + shown.height / 2]);
    check(path() === `#/level/${LEVELS[2].id}/story`, `phone: a tap on the card shown opens it (${path()})`);
    await phone.goBack();
    await phone.waitForSelector('.tiles.fan');
    await phone.waitForTimeout(300);
    await tap(await strip(3));
    const was = await after();
    await tap([5, 5]);
    check(was === 3 && await after() === -1, `phone: a tap off the hands closes the break (after ${was}, then ${await after()})`);
    const s0 = await phone.evaluate(() => scrollY);
    const f = await strip(5);
    await touch('touchStart', [f]);
    for (let i = 1; i <= 6; i++) { await touch('touchMove', [[f[0], f[1] - i * 30]]); await phone.waitForTimeout(16); }
    await touch('touchEnd', []);
    await phone.waitForTimeout(400);
    const swiped = (await phone.evaluate(() => scrollY)) - s0;
    check(swiped > 50 && await after() === -1, `phone: a swipe on a hand still scrolls the page (by ${swiped}px; after ${await after()})`);
    if (shots) await phone.screenshot({ path: join(shots, '7f-phone-hand.png') });
    await phone.close();
  }

  // Touch on a phone: a drag pans; a tap on an empty hex opens the croupier
  // picker there (no palette on a phone), and a tap near an edge points the
  // first port that way; tapping the bare floor deselects, two fingers
  // pinch-zoom, a long press draws a box that picks up a group, and tapping
  // a cut-short label shows it in full.
  {
    const phone = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    phone.on('pageerror', (e) => errors.push(e.message));
    const cdp = await phone.context().newCDPSession(phone);
    const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y], id) => ({ x, y, id })) });
    const tap = async (pt) => { await touch('touchStart', [pt]); await touch('touchEnd', []); };
    const hexAt = ([q, r]) => phone.evaluate(([q, r]) => {
      const R = 50, svg = document.querySelector('svg.board');
      const pt = new DOMPoint(R * Math.sqrt(3) * (q + r / 2), R * 1.5 * r).matrixTransform(svg.getScreenCTM());
      return [pt.x, pt.y];
    }, [q, r]);
    const viewBox = () => phone.getAttribute('svg.board', 'viewBox');
    const placed = () => phone.evaluate(() => JSON.parse(localStorage.getItem('stacked-deck-v1'))?.levels?.['opening-night']?.cells?.length ?? 0);
    await phone.goto(`${base}?unlockall#/level/opening-night`);
    await phone.evaluate(() => {
      const s = JSON.parse(localStorage.getItem('stacked-deck-v1') || '{"levels":{}}');
      s.levels['opening-night'] = { ...s.levels['opening-night'], cells: [] };
      localStorage.setItem('stacked-deck-v1', JSON.stringify(s));
    });
    await phone.reload();
    await phone.waitForSelector('svg.board');
    await phone.locator('svg.board').scrollIntoViewIfNeeded();
    const free = LEVELS[0].floor.filter((at) => !LEVELS[0].fixed.some((c) => c.at.join() === at.join()));
    check(!(await phone.isVisible('.palette')), 'phone: no palette');
    // The floor panel: Clear floor at its top; its list of the floor's
    // croupiers unfolded at first (folding it is remembered); touch hints,
    // no keyboard ones.
    {
      const y = async (sel) => (await phone.locator(sel).boundingBox()).y;
      check(await phone.locator('.roster-box[open]').count() === 1 && await phone.isVisible('.roster-row[data-tool="pass"] .roster-desc') &&
        await y('.inspector .floor-head .btn.danger') < await y('.inspector .howto'), 'phone: the floor panel starts with Clear floor, and lists the floor\'s croupiers unfolded');
      check(!(await phone.isVisible('.inspector .keys')) && await phone.isVisible('.inspector .howto .touch-only') && !(await phone.isVisible('.inspector .howto .kbd-only')),
        'phone: touch hints, no keyboard shortcuts');
      const phoneText = await phone.innerText('.inspector');
      check(/Tap an empty hex/.test(phoneText) && !/\bclick/i.test(phoneText), 'phone: the floor panel says tap, not click');
      await phone.tap('.roster-box > summary');
      await phone.reload();
      await phone.waitForSelector('svg.board');
      const folded = await phone.locator('.roster-box[open]').count() === 0;
      await phone.tap('.roster-box > summary');
      check(folded && await phone.locator('.roster-box[open]').count() === 1, 'phone: folding the list is remembered');
      await phone.locator('svg.board').scrollIntoViewIfNeeded();
    }
    const v0 = await viewBox();
    const [a, b] = [await hexAt(free[0]), await hexAt(free[1])];
    await touch('touchStart', [a]);
    for (let i = 1; i <= 8; i++) await touch('touchMove', [[a[0] + (b[0] - a[0]) * i / 8, a[1] + (b[1] - a[1]) * i / 8]]);
    await touch('touchEnd', []);
    check(await viewBox() !== v0 && await placed() === 0 && !(await phone.isVisible('.picker')), 'a drag over empty hexes pans the floor, opening nothing');
    await phone.click('.zoom button:last-child'); // fit
    const tapItem = async (tool) => { const r = await phone.locator(`.picker-item[data-tool="${tool}"]`).boundingBox(); await tap([r.x + r.width / 2, r.y + r.height / 2]); };
    await tap(await hexAt(free[0]));
    check(await phone.isVisible('.picker') && await phone.locator('.picker-item').count() === LEVELS[0].croupiers.length,
      'a tap on an empty hex opens the croupier picker');
    if (shots) await phone.screenshot({ path: join(shots, '7a-phone-picker.png') });
    // A long press on a croupier in it shows what it does, without placing it.
    {
      const r = await phone.locator('.picker-item[data-tool="pass"]').boundingBox();
      await touch('touchStart', [[r.x + r.width / 2, r.y + r.height / 2]]);
      await phone.waitForTimeout(500);
      const info = await phone.textContent('.peek.type-info').catch(() => '');
      await touch('touchEnd', []);
      await phone.waitForTimeout(100);
      check(/Pass/.test(info) && /Passes the hand on/.test(info) && !(await phone.isVisible('.peek.type-info')) && await placed() === 0 && await phone.isVisible('.picker'),
        `phone: a long press on a croupier in the picker shows what it does, and letting go places nothing ("${info}")`);
    }
    // It closes on a tap on its blank parts, or anywhere off the board.
    const tapOn = async (sel) => { const r = await phone.locator(sel).boundingBox(); await tap([r.x + r.width / 2, r.y + r.height / 2]); };
    await tapOn('.picker-head');
    const closedInside = !(await phone.isVisible('.picker'));
    await tap(await hexAt(free[0]));
    await tapOn('.inspector h3');
    check(closedInside && !(await phone.isVisible('.picker')) && await placed() === 0, 'a tap on the picker\'s blank part, or off the board, closes it');
    await tap(await hexAt(free[0]));
    await tapItem('pass');
    check(await placed() === 1 && await phone.locator('.cell.selected').count() === 1 && !(await phone.isVisible('.picker')),
      'picking one places it there, selected');
    const box = await phone.locator('svg.board').boundingBox();
    await tap([box.x + 3, box.y + 3]);
    check(await phone.locator('.cell.selected').count() === 0, 'tapping the bare floor drops the selection');
    // A tap near an edge: the new croupier's first port points that way.
    const nearEdge = ([q, r], d) => phone.evaluate(([[q, r], d]) => {
      const R = 50, svg = document.querySelector('svg.board');
      const x = R * Math.sqrt(3) * (q + r / 2) + Math.cos(d * Math.PI / 3) * R * 0.74, y = R * 1.5 * r + Math.sin(d * Math.PI / 3) * R * 0.74;
      const pt = new DOMPoint(x, y).matrixTransform(svg.getScreenCTM());
      return [pt.x, pt.y];
    }, [[q, r], d]);
    await tap(await nearEdge(free[1], 3));
    check(/←/.test(await phone.textContent('.picker-head')), `the picker says which way the first port will point ("${await phone.textContent('.picker-head')}")`);
    await tapItem('pass');
    const second = await phone.evaluate(() => JSON.parse(localStorage.getItem('stacked-deck-v1')).levels['opening-night'].cells[1]);
    check(second?.out?.out === 3, `a tap near an edge points the first port that way (${JSON.stringify(second?.out)})`);
    await tap(await (async () => { const u = await phone.locator('.history button[aria-label="Undo"]').boundingBox(); return [u.x + u.width / 2, u.y + u.height / 2]; })());
    check(await placed() === 1, 'undo takes it away again');
    const w0 = Number((await viewBox()).split(' ')[2]);
    const [cx, cy] = [box.x + box.width / 2, box.y + box.height / 2];
    await touch('touchStart', [[cx - 30, cy], [cx + 30, cy]]);
    for (let i = 1; i <= 8; i++) await touch('touchMove', [[cx - 30 - i * 8, cy], [cx + 30 + i * 8, cy]]);
    await touch('touchEnd', []);
    const w1 = Number((await viewBox()).split(' ')[2]);
    check(w1 < w0 * 0.8 && await placed() === 1, `two fingers pinch-zoom (view ${w0.toFixed(0)} -> ${w1.toFixed(0)} wide)`);
    await phone.click('.zoom button:last-child');
    const boardH = (await phone.locator('.board-wrap').boundingBox()).height;
    const playAt = await phone.locator('.tp.main').boundingBox();
    await tap(await hexAt(free[0]));
    check(await phone.locator('.cell.selected').count() === 1, 'a tap selects a croupier');
    // Its panel comes right under the floor: the palette and the play controls step aside.
    const gap = await phone.evaluate(() => document.querySelector('.inspector').getBoundingClientRect().top - document.querySelector('.board-wrap').getBoundingClientRect().bottom);
    check(!(await phone.isVisible('.palette')) && !(await phone.isVisible('.transport')) && gap >= 0 && gap < 4,
      `phone: a selected croupier's panel sits right under the floor (gap ${gap.toFixed(0)}px)`);
    if (shots) await phone.screenshot({ path: join(shots, '7e-phone-selected.png') });
    // The floor keeps its size, so a tap where the play button was lands on
    // the croupier's panel, not on a floor that grew into its place (which
    // deselected and let the tap's click start playing).
    const selH = (await phone.locator('.board-wrap').boundingBox()).height;
    check(Math.abs(selH - boardH) < 1, `phone: selecting a croupier leaves the floor its size (${boardH.toFixed(0)} -> ${selH.toFixed(0)}px)`);
    await tap([playAt.x + playAt.width / 2, playAt.y + playAt.height / 2]);
    check((await phone.textContent('.tp.main')).trim() === '▶' && await phone.locator('.cell.selected').count() === 1,
      'phone: a tap where the play button was neither plays nor deselects');
    await phone.tap('.inspector .done-btn');
    check(await phone.locator('.cell.selected').count() === 0 && await phone.isVisible('.transport'),
      'Done deselects it and brings them back');
    // A long press on an edge opens the port menu, which stays open after the
    // finger lifts (lifting it clicks whatever is under it: the menu's centre);
    // then a tap on a port points it there.
    await tap(await hexAt(free[0]));
    const edgeAt = (d) => phone.evaluate(([[q, r], d]) => {
      const R = 50, svg = document.querySelector('svg.board');
      const x = R * Math.sqrt(3) * (q + r / 2) + Math.cos(d * Math.PI / 3) * R * 0.74, y = R * 1.5 * r + Math.sin(d * Math.PI / 3) * R * 0.74;
      const pt = new DOMPoint(x, y).matrixTransform(svg.getScreenCTM());
      return [pt.x, pt.y];
    }, [free[0], d]);
    await touch('touchStart', [await edgeAt(4)]);
    await phone.waitForTimeout(500);
    await touch('touchEnd', []);
    await phone.waitForTimeout(200);
    check(await phone.isVisible('.radial-hub'), 'phone: the port menu stays open after a long press');
    // On Android the browser's own long press (it lands on the menu, under the
    // finger) can cancel the touch while it is still held: the menu stays open.
    await phone.keyboard.press('Escape');
    await touch('touchStart', [await edgeAt(4)]);
    await phone.waitForTimeout(500);
    await touch('touchCancel', []);
    await phone.waitForTimeout(100);
    check(await phone.isVisible('.radial-hub'), 'phone: the port menu stays open when the browser cancels the held touch');
    const outItem = await phone.locator('.radial-item[data-port="out"]').boundingBox();
    await tap([outItem.x + outItem.width / 2, outItem.y + outItem.height / 2]);
    check(!(await phone.isVisible('.radial-hub')) &&
      (await phone.evaluate(() => JSON.parse(localStorage.getItem('stacked-deck-v1')).levels['opening-night'].cells[0].out.out)) === 4,
    'phone: tapping a port in it points the port there');
    await tap([box.x + 3, box.y + 3]); // deselect
    // Undo on the floor: it restores the selection (which hides the palette on
    // a phone) and stays in reach, so several steps undo in a row.
    const passOut = () => phone.evaluate(() => JSON.parse(localStorage.getItem('stacked-deck-v1')).levels['opening-night'].cells[0].out.out);
    await tap(await hexAt(free[0]));
    await tap(await edgeAt(0));
    await tap(await edgeAt(1));
    await tap([box.x + 3, box.y + 3]);
    const undoAt = async () => { const u = await phone.locator('.history button[aria-label="Undo"]').boundingBox(); return [u.x + u.width / 2, u.y + u.height / 2]; };
    check(await passOut() === 1, 'phone: two edge taps point the Pass (out 1)');
    await tap(await undoAt());
    const after1 = await passOut();
    const visible = await phone.isVisible('.history button[aria-label="Undo"]') && await phone.locator('.cell.selected').count() === 1;
    await tap(await undoAt());
    check(after1 === 0 && visible && await passOut() === 4, `phone: undo stays in reach with the restored selection; two taps undo two steps (1 -> ${after1} -> ${await passOut()})`);
    await tap([box.x + 3, box.y + 3]);
    // A long press on the bare floor, then a drag: a box that picks up the
    // croupiers in it; turn them and put them down.
    const passCell = () => phone.evaluate(() => JSON.parse(localStorage.getItem('stacked-deck-v1')).levels['opening-night'].cells[0]);
    const before = await passCell();
    await touch('touchStart', [[box.x + 3, box.y + 3]]);
    await phone.waitForTimeout(450);
    for (let i = 1; i <= 6; i++) await touch('touchMove', [[box.x + 3 + (box.width - 6) * i / 6, box.y + 3 + (box.height - 6) * i / 6]]);
    await touch('touchEnd', []);
    check(await phone.isVisible('.lift-bar') && /1 croupier/.test(await phone.textContent('.lift-bar')),
      `phone: a long press and a drag pick up the croupiers in the box ("${await phone.textContent('.lift-bar').catch(() => '')}")`);
    if (shots) await phone.screenshot({ path: join(shots, '7f-phone-group.png') });
    // (Tapped straight away: a browser can drop the click of the first tap
    // after a long-press drag, so the toolbar acts as the finger lifts.)
    const btn = async (act) => { const r = await phone.locator(`.lift-bar [data-act="${act}"]`).boundingBox(); await tap([r.x + r.width / 2, r.y + r.height / 2]); };
    await btn('cw');
    await btn('place');
    const turnedPass = await passCell();
    check(!(await phone.isVisible('.lift-bar')) && turnedPass.out.out === (before.out.out + 1) % 6 && turnedPass.facing === undefined,
      `phone: ⟳ then ✓ turns it, ports and all, facing left alone (out ${before.out.out} -> ${turnedPass.out.out}, facing ${turnedPass.facing})`);
    await tap(await (async () => { const u = await phone.locator('.history button[aria-label="Undo"]').boundingBox(); return [u.x + u.width / 2, u.y + u.height / 2]; })());
    check(JSON.stringify(await passCell()) === JSON.stringify(before), 'phone: one undo puts the group back as it was');
    // A long press on a croupier picks it up; held and dragged, a box grows
    // from it (so croupiers packed together can be picked up).
    const btnX = async () => { const r = await phone.locator('.lift-bar [data-act="cancel"]').boundingBox(); await tap([r.x + r.width / 2, r.y + r.height / 2]); };
    await tap([box.x + 3, box.y + 3]);
    await touch('touchStart', [await hexAt(free[0])]);
    await phone.waitForTimeout(450);
    await touch('touchEnd', []);
    check(/^1 croupier/.test(await phone.textContent('.lift-bar').catch(() => '')), 'phone: a long press on a croupier picks it up');
    await btnX();
    const nb = free.find((x) => [[1, 0], [0, 1], [-1, 1], [-1, 0], [0, -1], [1, -1]].some(([dq, dr]) => x[0] === free[0][0] + dq && x[1] === free[0][1] + dr));
    await tap(await hexAt(nb));
    await tapItem('pass');
    await tap([box.x + 3, box.y + 3]);
    const [p0, p1] = [await hexAt(free[0]), await hexAt(nb)];
    await touch('touchStart', [p0]);
    await phone.waitForTimeout(450);
    for (let i = 1; i <= 5; i++) await touch('touchMove', [[p0[0] + (p1[0] - p0[0]) * i / 4, p0[1] + (p1[1] - p0[1]) * i / 4]]);
    await touch('touchEnd', []);
    check(/^2 croupiers/.test(await phone.textContent('.lift-bar').catch(() => '')), `phone: a long press on a croupier, then a drag over its neighbour, picks up both ("${await phone.textContent('.lift-bar').catch(() => '')}")`);
    await btnX();
    await tap(await (async () => { const u = await phone.locator('.history button[aria-label="Undo"]').boundingBox(); return [u.x + u.width / 2, u.y + u.height / 2]; })());
    // With nothing selected, the floor's panel has Clear floor (no palette on a phone).
    check(await phone.locator('.cell.selected').count() === 0 && await phone.isVisible('.inspector .floor-head .btn.danger') &&
      (await phone.textContent('.inspector .floor-head .btn.danger')) === 'Clear floor', 'phone: the floor panel offers Clear floor');
    // Play mode: a tap on a cut-short stack shows it all (before anything
    // else); a croupier can be selected without leaving play mode, until it
    // is edited.
    {
      const lvH = LEVELS.find((l) => l.croupiers.includes('hand') && l.croupiers.includes('shoe'));
      const fixedH = new Set(lvH.fixed.map((c) => c.at.join()));
      const freeH = lvH.floor.filter((x) => !fixedH.has(x.join()));
      const [sa, sb] = (() => {
        for (const x of freeH) {
          const y = [x[0] + 1, x[1]];
          if (freeH.some((z) => z.join() === y.join())) return [x, y];
        }
        return [];
      })();
      await phone.evaluate(([id, sa, sb]) => {
        const s = JSON.parse(localStorage.getItem('stacked-deck-v1') || '{"levels":{}}');
        s.levels[id] = { cells: [
          { at: sa, kind: 'shoe', out: 0, deck: ['AS', '2S', '3S', '4S', '5S', '6S', '7S', '8S', '9S'] },
          { at: sb, kind: 'croupier', fn: 'hand', n: 13, out: { out: 0 } }] };
        localStorage.setItem('stacked-deck-v1', JSON.stringify(s));
      }, [lvH.id, sa, sb]);
      await phone.goto(`${base}?unlockall#/level/${lvH.id}`);
      await phone.reload();
      await phone.waitForSelector('svg.board');
      await phone.locator('svg.board').scrollIntoViewIfNeeded();
      for (let i = 0; i < 10; i++) await phone.tap('.tp:nth-child(4)'); // step
      const watching = () => phone.evaluate(() => document.querySelector('.side').classList.contains('watching'));
      const more = await phone.evaluate(() => {
        const r = document.querySelector('.l-cards [data-peek] .scard.more')?.getBoundingClientRect();
        return r ? [r.x + r.width / 2, r.y + r.height / 2] : null;
      });
      check(!!more && await watching(), 'play mode: the Hand\'s collected cards are cut short');
      if (more) {
        await tap(more);
        await phone.waitForTimeout(100);
        check(/9 cards/.test(await phone.textContent('.peek:not(.hidden)').catch(() => '')) && await phone.locator('.cell.selected').count() === 0 && await watching(),
          'play mode: a tap on a cut-short stack shows it all, and selects nothing');
      }
      const shoeAt = await hexAt(sa);
      await tap([shoeAt[0], shoeAt[1] - 12]); // the shoe's chip, above its deck label
      check(await phone.locator('.cell.selected').count() === 1 && await watching() && await phone.isVisible('.inspector h3') && await phone.isVisible('.transport'),
        'play mode: a tap selects a croupier and shows its panel, staying in play mode with the play controls');
      await phone.tap('.inspector [aria-label="Turn clockwise"]');
      check(!(await watching()), 'editing it leaves play mode');
    }
    // A Deal croupier with more positions on a side than fit: cut short, shown in full on a tap.
    const dealer = LEVELS.find((lv) => lv.croupiers.includes('deal'));
    if (dealer) {
      const at = dealer.floor.find((x) => !dealer.fixed.some((c) => c.at.join() === x.join()));
      await phone.evaluate(([id, at]) => {
        const s = JSON.parse(localStorage.getItem('stacked-deck-v1') || '{"levels":{}}');
        s.levels[id] = { cells: [{ at, kind: 'croupier', fn: 'deal', out: { to: [0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1] } }] };
        localStorage.setItem('stacked-deck-v1', JSON.stringify(s));
      }, [dealer.id, at]);
      await phone.goto(`${base}?unlockall#/level/${dealer.id}`);
      await phone.reload();
      await phone.waitForSelector('svg.board');
      const pills = await phone.$$eval('.pill text', (els) => els.map((e) => e.textContent));
      check(pills.includes('1·3·…') && pills.includes('2·4·6·8·…'), `${dealer.id}: Deal labels are cut short to fit (${pills.join(' ')})`);
      const pb = await phone.locator('.pill.peekable').first().boundingBox();
      await tap([pb.x + pb.width / 2, pb.y + pb.height / 2]);
      check(/Deals cards 1, 3, 5, 7, 9, 11 to E/.test(await phone.textContent('.peek:not(.hidden)')), 'tapping a cut-short label shows it in full');
      if (shots) await phone.screenshot({ path: join(shots, '7d-phone-peek.png') });
    }
    await phone.close();
  }
  check(dealLabel([1, 2, 3, 4, 5, 6]).text === '1-6' && dealLabel([1, 2, 4, 5, 6, 9]).text === '1·2·4-6·9' &&
    dealLabel([1, 3, 5, 7, 9, 11], 26).text === '1·3·…' && dealLabel([1, 3, 5, 7, 9, 11], 20).text === '1·…', 'Deal labels collapse runs, then cut the tail');

  // Pointing ports: only required ports start with a side (and have no
  // floor option); selecting starts at the first port; each direction key
  // points the active port and moves on; Ctrl+Z goes back a port; a long
  // press on an edge opens a menu of the ports.
  {
    const lv = LEVELS.find((l) => ['straight', 'war', 'pass'].every((t) => l.croupiers.includes(t)));
    const free = lv.floor.filter((x) => !lv.fixed.some((c) => c.at.join() === x.join()));
    await page.goto(base);
    await page.evaluate((id) => {
      const s = JSON.parse(localStorage.getItem('stacked-deck-v1') || '{"levels":{}}');
      s.levels[id] = {};
      localStorage.setItem('stacked-deck-v1', JSON.stringify(s));
    }, lv.id);
    await page.goto(`${base}?unlockall#/level/${lv.id}`);
    await page.reload();
    await page.waitForSelector('svg.board');
    const cellsNow = () => page.evaluate((id) => JSON.parse(localStorage.getItem('stacked-deck-v1')).levels[id].cells, lv.id);
    const at = (c) => (x) => x.at.join() === c.join();
    const place = async (tool, hex) => { await page.click(`.pal-item[data-tool="${tool}"]`); await clickHex(hex); await page.keyboard.press('Escape'); };
    await place('pass', free[0]);
    await place('straight', free[1]);
    await place('war', free[2]);
    let cs = await cellsNow();
    const war = cs.find(at(free[2]));
    check(cs.find(at(free[0]))?.out.out !== undefined && Object.keys(cs.find(at(free[1]))?.out ?? {}).length === 0 &&
      Object.keys(war?.out ?? {}).length === 0 && war?.dealer !== undefined,
    `new croupiers: Pass's out and War's dealer have a side, optional ports none (${JSON.stringify(cs.map((c) => [c.fn, c.out, c.dealer]))})`);
    await clickHex(free[2]);
    const dealerRow = page.locator('.inspector .port-row', { has: page.locator('.port-tag', { hasText: /^dealer$/ }) });
    const winRow = page.locator('.inspector .port-row', { has: page.locator('.port-tag', { hasText: /^win$/ }) });
    check(await dealerRow.locator('.side-btn.floor').count() === 0 && await winRow.locator('.side-btn.floor').count() === 1, 'War: the dealer side has no floor option, its outputs do');
    await clickHex(free[0]);
    await page.keyboard.press('x');
    check((await cellsNow()).find(at(free[0])).out.out !== undefined, 'X leaves a Pass pointing where it was');
    // Straight: starts at yes; d points yes E and moves to no; a points no W.
    await clickHex(free[1]);
    check((await page.textContent('.inspector .port-row.active .port-tag')) === 'yes', 'selecting starts at the first port');
    await page.keyboard.press('d');
    check((await page.textContent('.inspector .port-row.active .port-tag')) === 'no', 'a direction key points it and moves on to the next port');
    await page.keyboard.press('a');
    cs = await cellsNow();
    check(JSON.stringify(cs.find(at(free[1])).out) === '{"yes":0,"no":3}', `two keys point both ports (${JSON.stringify(cs.find(at(free[1])).out)})`);
    await page.keyboard.press('Control+z');
    cs = await cellsNow();
    check(JSON.stringify(cs.find(at(free[1])).out) === '{"yes":0}' && (await page.textContent('.inspector .port-row.active .port-tag')) === 'no',
      'Ctrl+Z goes back to the port it unpointed');
    // Long press on the SW edge: the menu offers yes and no; picking no points it there.
    const [ex, ey] = await hexPoint(free[1], 2, 0.85);
    await page.mouse.move(ex, ey);
    await page.mouse.down();
    await page.waitForTimeout(650);
    const items = await page.$$eval('.radial:not(.hidden) .radial-item', (els) => els.map((e) => e.dataset.port));
    await page.mouse.up();
    check(items.join() === 'yes,no' && await page.isVisible('.radial-hub'), `a long press on an edge opens the port menu (${items.join(', ')}), and it stays open`);
    if (shots) await page.screenshot({ path: join(shots, '12-port-menu.png'), clip: { x: ex - 150, y: ey - 150, width: 300, height: 300 } });
    await page.click('.radial-item[data-port="no"]');
    cs = await cellsNow();
    check(JSON.stringify(cs.find(at(free[1])).out) === '{"yes":0,"no":2}' && !(await page.isVisible('.radial-hub')), 'picking a port in the menu points it at that edge');
    // Hold, slide onto a port and let go.
    await page.mouse.move(ex, ey);
    await page.mouse.down();
    await page.waitForTimeout(650);
    const yes = await page.locator('.radial-item[data-port="yes"]').boundingBox();
    await page.mouse.move(yes.x + yes.width / 2, yes.y + yes.height / 2, { steps: 4 });
    await page.mouse.up();
    cs = await cellsNow();
    check(cs.find(at(free[1])).out.yes === 2, 'or hold, slide onto a port and let go');
    // The edge zones reach a little past the hex: just outside its east edge
    // (in the next hex) a click points the active port east, and a long press
    // opens the menu for that side.
    const [ox, oy] = await hexPoint(free[1], 0, 1.2);
    const portBefore = await page.textContent('.inspector .port-row.active .port-tag');
    await page.mouse.click(ox, oy);
    cs = await cellsNow();
    check(cs.find(at(free[1])).out[portBefore] === 0, `a click just outside the selected croupier's edge points its port that way (${portBefore} -> ${cs.find(at(free[1])).out[portBefore]})`);
    await page.mouse.move(ox, oy);
    await page.mouse.down();
    await page.waitForTimeout(650);
    await page.mouse.up();
    check(await page.isVisible('.radial-hub') && /E/.test(await page.textContent('.radial-hub')), 'and a long press there opens the port menu for that side');
    await page.keyboard.press('Escape');
  }

  // Placing from the floor with a mouse and keys: a click on an empty hex
  // opens the picker (a number key or a click picks); pointing at an empty
  // hex near an edge and pressing a number places that croupier pointing
  // there. Then groups: a Shift-drag box picks them up; ] turns them and M
  // mirrors them (positions and ports; facing is left alone, see
  // test/transform.js); direction keys move them; they can't go down where
  // they clash; copy, delete, a mouse drag; each put-down is one undo step.
  // [ ] and M turn and mirror a single selected croupier.
  {
    // The first floor with these croupiers and room for the checks below.
    const key = ([q, r]) => `${q},${r}`;
    const freeRow = (l) => {
      const fixed = new Set(l.fixed.map((c) => key(c.at)));
      const buildable = new Set(l.floor.map(key).filter((k) => !fixed.has(k)));
      return l.floor.map(([q, r]) => [[q, r], [q + 1, r], [q + 2, r]]).find((hs) => hs.every((x) => buildable.has(key(x))) &&
        hs.every(([q, r]) => DIRS.every(([dq, dr]) => buildable.has(key([q + dq, r + dr])) || hs.some((x) => key(x) === key([q + dq, r + dr])))));
    };
    const lv = LEVELS.find((l) => ['straight', 'war', 'pass'].every((t) => l.croupiers.includes(t)) && freeRow(l));
    const digit = (tool) => String(lv.croupiers.indexOf(tool) + 1);
    await page.goto(base);
    await page.evaluate((id) => {
      const s = JSON.parse(localStorage.getItem('stacked-deck-v1') || '{"levels":{}}');
      s.levels[id] = {};
      localStorage.setItem('stacked-deck-v1', JSON.stringify(s));
    }, lv.id);
    await page.goto(`${base}?unlockall#/level/${lv.id}`);
    await page.reload();
    await page.waitForSelector('svg.board');
    const cellsNow = () => page.evaluate((id) => JSON.parse(localStorage.getItem('stacked-deck-v1')).levels[id].cells ?? [], lv.id);
    const at = (c) => (x) => x.at.join() === c.join();
    // Three free hexes in a row (west to east) whose neighbours are free too (room to turn and move).
    const row = freeRow(lv);
    check(await page.locator('.roster-box').count() === 1 && await page.locator('.roster-box[open]').count() === 0 &&
      await page.isVisible('.inspector .keys') && !(await page.isVisible('.inspector .howto .touch-only')),
      'desktop: the floor panel\'s croupier list starts folded; keyboard shortcuts, no touch hints');
    const deskText = await page.innerText('.inspector');
    check(/Click an empty hex/.test(deskText) && !/\btap/i.test(deskText), 'desktop: the floor panel says click, not tap');
    await clickHex(row[0]);
    check(await page.isVisible('.picker') && await page.locator('.picker-item').count() === lv.croupiers.length, 'a click on an empty hex opens the croupier picker');
    await page.hover('.picker-item[data-tool="straight"]');
    check(/Is the hand a straight\?/.test(await page.textContent('.peek.type-info').catch(() => '')), 'with a mouse over a croupier in the picker, what it does shows');
    if (shots) await page.screenshot({ path: join(shots, '13-picker.png') });
    await page.keyboard.press(digit('straight'));
    let cs = await cellsNow();
    check(cs.find(at(row[0]))?.fn === 'straight' && Object.keys(cs.find(at(row[0])).out).length === 0 && !(await page.isVisible('.picker')) &&
      await page.locator('.cell.selected').count() === 1, 'a number key in the picker places that croupier there, selected');
    await page.keyboard.press('Escape');
    const [ex, ey] = await hexPoint(row[1], 0, 0.8);
    await page.mouse.move(ex, ey);
    await page.keyboard.press(digit('pass'));
    cs = await cellsNow();
    check(cs.find(at(row[1]))?.fn === 'pass' && cs.find(at(row[1])).out.out === 0, 'pointing near an empty hex\'s edge and pressing a number places it pointing there');
    await page.keyboard.press('Escape');
    await clickHex(row[2], 2, 0.8);
    await page.click('.picker-item[data-tool="war"]');
    cs = await cellsNow();
    const war0 = cs.find(at(row[2]));
    check(war0?.fn === 'war' && war0.out.win === 2 && war0.dealer !== undefined, `clicking near an edge, then a croupier in the picker: its first port points there (${JSON.stringify(war0?.out)})`);
    await page.keyboard.press('Escape');
    // A Shift-drag box around the three.
    const pts = await Promise.all(row.map((x) => hexPoint(x)));
    const [bx0, by0] = [Math.min(...pts.map((p) => p[0])) - 70, Math.min(...pts.map((p) => p[1])) - 50];
    const [bx1, by1] = [Math.max(...pts.map((p) => p[0])) + 70, Math.max(...pts.map((p) => p[1])) + 50];
    const shiftBox = async () => {
      await page.keyboard.down('Shift');
      await page.mouse.move(bx0, by0);
      await page.mouse.down();
      await page.mouse.move(bx1, by1, { steps: 5 });
      await page.mouse.up();
      await page.keyboard.up('Shift');
    };
    await shiftBox();
    check(await page.isVisible('.lift-bar') && /3 croupiers/.test(await page.textContent('.lift-bar')), 'a Shift-drag box picks up the croupiers in it');
    const orig = await cellsNow();
    await page.keyboard.press(']');
    if (shots) await page.screenshot({ path: join(shots, '14-group-turned.png') });
    await page.keyboard.press('Enter');
    cs = await cellsNow();
    const turnedBy = (v) => [-v[1], v[0] + v[1]]; // a sixth of a turn clockwise, in axial coordinates
    const findFn = (list, fn) => list.find((c) => c.fn === fn);
    const off = (list, f1, f2) => { const p = findFn(list, f1).at, q = findFn(list, f2).at; return [q[0] - p[0], q[1] - p[1]]; };
    check(off(cs, 'straight', 'war').join() === turnedBy(off(orig, 'straight', 'war')).join() &&
      findFn(cs, 'pass').out.out === 1 && findFn(cs, 'war').out.win === 3 && findFn(cs, 'war').dealer === (findFn(orig, 'war').dealer + 1) % 6 &&
      findFn(cs, 'war').facing === undefined && !(await page.isVisible('.lift-bar')),
    `] then Enter turns the group a sixth clockwise, positions and ports (${JSON.stringify(cs.map((c) => [c.fn, c.at, c.out]))})`);
    await page.keyboard.press('Control+z');
    check(JSON.stringify(await cellsNow()) === JSON.stringify(orig), 'one undo puts the whole turn back');
    // M mirrors the group left to right: E and W swap, SE and SW, NE and NW.
    await shiftBox();
    await page.keyboard.press('m');
    await page.keyboard.press('Enter');
    cs = await cellsNow();
    const mirrored = (v) => [-v[0] - v[1], v[1]];
    check(off(cs, 'straight', 'war').join() === mirrored(off(orig, 'straight', 'war')).join() &&
      findFn(cs, 'pass').out.out === 3 && findFn(cs, 'war').out.win === 1 && findFn(cs, 'war').dealer === (9 - findFn(orig, 'war').dealer) % 6,
    `M then Enter mirrors the group, positions and ports (${JSON.stringify(cs.map((c) => [c.fn, c.at, c.out]))})`);
    await page.keyboard.press('Control+z');
    // Moved onto the player (west, a hex at a time): it shows red and won't go down there.
    await shiftBox();
    let steps = 0;
    while (!(await page.locator('.lift-bar.bad').count()) && steps++ < 12) await page.keyboard.press('a');
    check(await page.locator('.lift-bar.bad').count() === 1 && await page.locator('.lift-bar [data-act="place"]').isDisabled() &&
      await page.locator('.lift-bar [data-act="copy"]').isDisabled() &&
      await page.locator('.board .cell.lifted.bad').count() > 0, 'moved where it clashes, the group shows red and ✓ is off');
    await page.keyboard.press('Enter');
    check(await page.isVisible('.lift-bar'), 'Enter does nothing there');
    await page.keyboard.press('Escape');
    check(!(await page.isVisible('.lift-bar')) && JSON.stringify(await cellsNow()) === JSON.stringify(orig), 'Esc puts the group back');
    // Copy: the copy floats off to the nearest place it fits.
    await shiftBox();
    await page.click('.lift-bar [data-act="copy"]');
    const copyOk = !(await page.locator('.lift-bar [data-act="place"]').isDisabled());
    await page.click('.lift-bar [data-act="place"]');
    check(copyOk && (await cellsNow()).length === 6, `⧉ then ✓ copies the group (${(await cellsNow()).length} croupiers)`);
    await page.keyboard.press('Control+z');
    // Moved, then copied: put down where it was moved to (not back where it
    // came from), with a copy floating; ⧉ again stamps another.
    {
      await shiftBox();
      await page.keyboard.press('c'); // a hex south-east
      await page.click('.lift-bar [data-act="copy"]');
      const placed = await cellsNow();
      const movedTo = row.map(([q, r]) => `${q},${r + 1}`).sort().join(' ');
      check(placed.length === 3 && placed.map((c) => c.at.join()).sort().join(' ') === movedTo && /Copy of 3/.test(await page.textContent('.lift-bar')),
        `moved then ⧉: the group goes down where it was moved, and a copy floats (${placed.map((c) => c.at.join()).join(' ')})`);
      await page.click('.lift-bar [data-act="copy"]');
      check((await cellsNow()).length === 6 && /Copy of 3/.test(await page.textContent('.lift-bar')), `⧉ again stamps another copy (${(await cellsNow()).length} croupiers)`);
      await page.keyboard.press('Escape');
      check((await cellsNow()).length === 6 && !(await page.isVisible('.lift-bar')), 'Esc drops the floating copy, keeping the ones put down');
      await page.keyboard.press('Control+z');
      await page.keyboard.press('Control+z');
      check(JSON.stringify(await cellsNow()) === JSON.stringify(orig), 'two undos put it all back');
    }
    // Leaving one out (a click on it): it stays where the group was moved
    // to; the rest go down there too, still picked up. Not where it clashes.
    {
      const south = ([q, r]) => [q, r + 1];
      await shiftBox();
      await page.keyboard.press('c');
      await clickHex(south(row[0]));
      const now = await cellsNow();
      check(now.map((c) => c.at.join()).sort().join(' ') === row.map((x) => south(x).join()).sort().join(' ') &&
        /^2 croupiers/.test(await page.textContent('.lift-bar')),
        `moved, then one left out: it stays where it was moved to, the rest still up (${now.map((c) => c.at.join()).join(' ')})`);
      await page.keyboard.press('Escape');
      check(JSON.stringify(await cellsNow()) === JSON.stringify(now), 'Esc then leaves the rest there too');
      await page.keyboard.press('Control+z');
      check(JSON.stringify(await cellsNow()) === JSON.stringify(orig), 'one undo puts them back');
      await shiftBox();
      let n = 0;
      while (!(await page.locator('.lift-bar.bad').count()) && n++ < 12) await page.keyboard.press('a');
      const red = await page.locator('.board .cell.lifted.bad').first().getAttribute('data-at');
      await clickHex(red.split(',').map(Number));
      check(/^3 croupiers/.test(await page.textContent('.lift-bar')) && JSON.stringify(await cellsNow()) === JSON.stringify(orig),
        'one can\'t be left out where it clashes');
      await page.keyboard.press('Escape');
      // Of a floating copy, one left out goes down; the rest still float.
      await shiftBox();
      await page.click('.lift-bar [data-act="copy"]');
      const k = await page.locator('.board .cell.lifted').first().getAttribute('data-at');
      await clickHex(k.split(',').map(Number));
      check((await cellsNow()).length === 4 && /Copy of 2/.test(await page.textContent('.lift-bar')), `one left out of a copy goes down (${(await cellsNow()).length} croupiers)`);
      await page.keyboard.press('Escape');
      check((await cellsNow()).length === 4, 'Esc drops the rest of the copy');
      await page.keyboard.press('Control+z');
      check(JSON.stringify(await cellsNow()) === JSON.stringify(orig), 'and undo takes the one out');
    }
    // A mouse drag on one of them moves them all.
    await shiftBox();
    const [sx, sy] = await hexPoint(row[1]);
    const dest = [row[1][0], row[1][1] + 1]; // one hex south-east
    const [tx, ty] = await hexPoint(dest);
    await page.mouse.move(sx, sy);
    await page.mouse.down();
    await page.mouse.move(tx, ty, { steps: 6 });
    await page.mouse.up();
    const movedOk = !(await page.locator('.lift-bar [data-act="place"]').isDisabled());
    if (movedOk) await page.click('.lift-bar [data-act="place"]'); else await page.keyboard.press('Escape');
    cs = await cellsNow();
    check(movedOk && findFn(cs, 'pass').at.join() === dest.join() && findFn(cs, 'straight').at.join() === [row[0][0], row[0][1] + 1].join(),
      `dragging one of the group moves them all (${JSON.stringify(cs.map((c) => c.at))})`);
    await page.keyboard.press('Control+z');
    // Delete.
    await shiftBox();
    await page.keyboard.press('Delete');
    check((await cellsNow()).length === 0, 'Delete deletes the group');
    await page.keyboard.press('Control+z');
    check((await cellsNow()).length === 3, 'and undo brings it back');
    // A Shift-drag that starts on a croupier takes it in too.
    {
      const [ax, ay] = await hexPoint(row[0]);
      const [bx, by] = await hexPoint(row[1]);
      await page.keyboard.down('Shift');
      await page.mouse.move(ax, ay);
      await page.mouse.down();
      await page.mouse.move(bx + 10, by + 10, { steps: 4 });
      await page.mouse.up();
      await page.keyboard.up('Shift');
      check(/^2 croupiers/.test(await page.textContent('.lift-bar')), `a Shift-drag from a croupier picks it up with the ones in the box ("${await page.textContent('.lift-bar')}")`);
      await page.keyboard.press('Escape');
    }
    // [ ] on one selected croupier.
    await clickHex(row[2]);
    await page.keyboard.press(']');
    const war1 = (await cellsNow()).find(at(row[2]));
    check(war1.out.win === (war0.out.win + 1) % 6 && war1.dealer === (war0.dealer + 1) % 6 && war1.facing === undefined, `] turns a selected croupier (${JSON.stringify(war1)})`);
    await page.click('.inspector [aria-label="Mirror"]');
    const war2 = (await cellsNow()).find(at(row[2]));
    check(war2.out.win === (9 - war1.out.win) % 6 && war2.dealer === (9 - war1.dealer) % 6, `⇋ mirrors a selected croupier (${JSON.stringify(war2)})`);
    await page.keyboard.press('Escape');
  }

  // Picking a croupier shows its settings: a Hand set to 3 before placing is placed with n = 3.
  {
    const lv = LEVELS.find((l) => l.croupiers.includes('hand'));
    await page.goto(`${base}?unlockall#/level/${lv.id}`);
    await page.waitForSelector('svg.board');
    await page.click('.pal-item[data-tool="hand"]');
    await page.click('.inspector [data-param="n"] button:nth-child(3)');
    check((await page.textContent('.pal-item[data-tool="hand"] .pal-chip')).trim() === 'HND3', 'setting n before placing a Hand shows on the palette chip');
    const at = lv.floor.find((x) => !lv.fixed.some((c) => c.at.join() === x.join()));
    await clickHex(at);
    const hc = (await page.evaluate((id) => JSON.parse(localStorage.getItem('stacked-deck-v1')).levels[id].cells, lv.id)).find((c) => c.fn === 'hand');
    check(hc?.n === 3, `the Hand is placed with n = 3 (${JSON.stringify(hc)})`);
    await page.keyboard.press('Delete'); // it is selected
    // Play mode: stepping hides the palette and the inspector; Edit brings them back.
    await page.click('.pal-item[data-tool="hand"]');
    await page.keyboard.press('.');
    check(!(await page.isVisible('.palette')) && !(await page.isVisible('.inspector')) && await page.locator('.pal-item.on').count() === 0 &&
      await page.isVisible('.tests .edit-btn'), 'stepping enters play mode: palette and inspector hidden, croupier dropped');
    await page.click('.tests .edit-btn');
    check(await page.isVisible('.palette') && await page.isVisible('.inspector') && !(await page.isVisible('.tests .edit-btn')) &&
      (await page.textContent('.tp-round b')).trim() === '1', 'Edit shows them again, leaving the run where it was');
    await page.keyboard.press('r');
  }

  // Back to the floors list from a floor far down it: that floor's tile is in view.
  {
    const lv = LEVELS[Math.min(30, LEVELS.length - 1)];
    await page.goto(`${base}?unlockall#/level/${lv.id}`);
    await page.waitForSelector('svg.board');
    await page.click('.topbar .btn.ghost');
    await page.waitForSelector('.tile');
    const [top, bottom, vh] = await page.evaluate((id) => {
      const r = document.querySelector(`.tile[data-level="${id}"]`).getBoundingClientRect();
      return [r.top, r.bottom, innerHeight];
    }, lv.id);
    check(top >= 0 && bottom <= vh, `back on the floors list, ${lv.id}'s tile is in view (${top.toFixed(0)}–${bottom.toFixed(0)} of ${vh})`);
    // Folding its suit gathers the same cards, the same size, into a fanned
    // hand, still folded after a reload; back from the floor, its card is in view.
    const suit = page.locator(`.chapter:has(.tile[data-level="${lv.id}"])`);
    const sizeOf = () => suit.locator('.tiles > *').evaluateAll((els) => els.map((e) => `${e.offsetWidth}x${e.offsetHeight}`));
    const flat = await sizeOf();
    await suit.locator('.ch-toggle').click();
    await page.waitForTimeout(700);
    const folded = await sizeOf();
    const turns = await suit.locator('.tiles > *').evaluateAll((els) => els.map((e) => getComputedStyle(e).transform));
    check(await suit.locator('.tiles.fan').count() === 1 && (await suit.locator('.ch-toggle').getAttribute('aria-expanded')) === 'false' &&
      folded.join() === flat.join() && new Set(turns).size === turns.length,
    `folding a suit fans its ${flat.length} cards, each turned its own way, at their size (${flat[0]} -> ${folded[0]})`);
    // Drawn again (as when scores arrive from the server), the hand stays
    // still: its cards don't slide in from where the grid had them.
    {
      const places = await page.evaluate((id) => new Promise((res) => {
        window.dispatchEvent(new HashChangeEvent('hashchange'));
        const pts = new Set();
        const t0 = performance.now();
        const tick = () => {
          const r = document.querySelector(`.tile[data-level="${id}"]`).getBoundingClientRect();
          pts.add(`${Math.round(r.left)},${Math.round(r.top)}`);
          if (performance.now() - t0 < 400) requestAnimationFrame(tick); else res([...pts]);
        };
        tick();
      }), lv.id);
      check(places.length === 1, `drawn again, a folded suit's cards stay still (${places.join(' ')})`);
    }
    // Pointing at a card in the hand opens a break after it: the cards after
    // it move aside, it stays put, and the pointer stays on it.
    {
      const kids = suit.locator('.tiles > *');
      await suit.evaluate((sec) => sec.scrollIntoView({ block: 'center' }));
      await page.waitForTimeout(100);
      const before = await kids.nth(3).boundingBox();
      await page.mouse.move(before.x + 12, before.y + before.height * 0.35);
      await page.waitForTimeout(400);
      const after = await kids.nth(3).boundingBox();
      const moved = await kids.evaluateAll((els) => els.map((e) => parseFloat(e.style.getPropertyValue('--brk')) || 0));
      const hovered = await suit.evaluate((sec) => [...sec.querySelector('.tiles').children].findIndex((e) => e.matches(':hover')));
      check(hovered === 3 && Math.abs(after.x - before.x) < 1 && moved.slice(0, 4).every((d) => d === 0) && moved.slice(4).every((d) => d > 0),
        `pointing at a card in a hand opens a break after it, leaving it under the pointer (hovered ${hovered})`);
      await page.mouse.move(2, 2);
    }
    await page.goto(`${base}?unlockall#/level/${lv.id}`);
    await page.waitForSelector('svg.board');
    await page.click('.topbar .btn.ghost');
    await page.waitForSelector('.tile');
    const card = page.locator(`.tile[data-level="${lv.id}"]`);
    const box = await card.boundingBox();
    check(await page.locator(`.chapter.folded .tiles.fan .tile[data-level="${lv.id}"]`).count() === 1 && box && box.y >= 0 && box.y + box.height <= 860,
      `it stays folded; back from ${lv.id}, its card in the hand is in view`);
    await page.locator(`.chapter:has(.tile[data-level="${lv.id}"]) .ch-toggle`).click();
    await page.waitForTimeout(700);
    check(await page.locator(`a.tile[data-level="${lv.id}"]`).isVisible(), 'unfolding it shows the cards again');
  }


  // Floor numbering: every floor is labelled by its playing card.
  {
    await page.goto(`${base}?unlockall`);
    await showDeck(page, 'campaign');
    const tiles = await page.$$eval('.deck.campaign a.tile', (els) => els.map((e) => ({
      id: e.dataset.level, card: e.dataset.card, corner: e.querySelector('.tile-corner.tl').textContent,
    })));
    const bad = tiles.filter((t) => {
      const f = floorLabel(LEVELS.findIndex((l) => l.id === t.id));
      return t.card !== (f.card ?? f.text) || t.corner !== f.rank + f.glyph;
    });
    check(tiles.length === LEVELS.length && !bad.length, `tiles show their floor's card (${tiles.slice(0, 3).map((t) => t.corner).join(' ')} …${bad.length ? `; wrong: ${bad.map((t) => t.id).join(', ')}` : ''})`);
    const plain = LEVELS.map((_, i) => floorLabel(i)).filter((f) => !f.card).map((f) => f.text);
    if (plain.length) console.log(`note: floors without a card label (fallback past K / past the four finale cards): ${plain.join(' ')}`);
    const heads = await page.$$eval('.chapter h2', (els) => els.map((e) => e.textContent));
    check(/^♠\s*Spades/.test(heads[0] ?? '') || /^[♠♥♦♣]/.test(heads[0] ?? ''), `chapter headings name the suit: "${heads.join('" "')}"`);
    if (shots) await page.screenshot({ path: join(shots, '8-level-select-cards.png'), fullPage: true });
    await page.goto(base);
    await page.waitForSelector('.tile');
    const locked = await page.$$eval('.deck.campaign .tile.locked .tile-no', (els) => els.map((e) => e.textContent));
    const want = LEVELS.map((_, i) => floorLabel(i)).filter((f) => !f.special);
    check(locked.length > 0 && locked.every((t) => want.some((f) => f.text === t)), `locked tiles are card backs labelled by card (${locked.slice(0, 3).join(' ')} …)`);
    const fin = LEVELS.findIndex((_, i) => floorLabel(i).special);
    if (fin >= 0) check(await page.locator(`.tile.locked[data-card="${floorLabel(fin).card}"]`).count() === 0, 'locked special floors hide their card');
    await page.goto(`${base}#/level/${LEVELS[0].id}/story`);
    await page.waitForSelector('.story-card');
    const f0 = floorLabel(0);
    check((await page.textContent('.story-head')).includes(`Floor ${f0.text}`) && (await page.textContent('.story-head .floor-badge')) === f0.rank + f0.glyph,
      `story shows floor ${f0.text}`);
    if (shots) await page.screenshot({ path: join(shots, '8b-story-card.png') });
    await page.goto(`${base}#/level/${LEVELS[0].id}`);
    await page.waitForSelector('svg.board');
    check((await page.textContent('.topbar .floor-badge')) === f0.rank + f0.glyph, `editor top bar shows ${f0.text}`);
  }

  // Special cards are not mentioned in the help before a floor allows them.
  {
    await page.goto(base);
    await page.waitForSelector('.tile');
    const anyOpen = LEVELS.some((lv, i) => (lv.specialCards ?? []).length && i < 3);
    await page.keyboard.press('?');
    await page.waitForSelector('.modal.help');
    const txt = await page.textContent('.modal.help');
    check(anyOpen || (!(await page.locator('.help-special').count()) && !/joker|advertising/i.test(txt)), 'help hides special cards before they are unlocked');
    check(/Burn/.test(txt) && /Hand/.test(txt) && /n \(1–52, default 5\)/.test(txt), 'help documents Burn and Hand (n 1–52, default 5)');
    await page.keyboard.press('Escape');
  }

  // Special card faces (HTML), drawn straight from the dom helpers.
  {
    await page.goto(`${base}?unlockall`);
    await page.waitForSelector('.tile');
    const faces = await page.evaluate(async () => {
      const { handEl } = await import('/src/ui/dom.js');
      const strip = document.createElement('div');
      strip.id = 'face-test';
      Object.assign(strip.style, { position: 'fixed', left: '10px', top: '10px', zIndex: 99, padding: '10px', background: '#0c4a2d', display: 'flex', flexDirection: 'column', gap: '8px' });
      const row = (cls) => { const r = document.createElement('div'); r.className = cls; r.append(handEl(['?', '??', '$', '$$', 'AS', 'TH'])); return r; };
      strip.append(row(''), row('queue'));
      document.body.append(strip);
      return [...strip.querySelector('.hand').children].map((c) => ({ cls: c.className, text: c.textContent, bg: getComputedStyle(c).backgroundColor, w: c.offsetWidth }));
    });
    const [mono, colour, front, back] = faces;
    check(/joker mono/.test(mono.cls) && /joker colour/.test(colour.cls) && /ad front/.test(front.cls) && /ad back/.test(back.cls),
      `special card faces have their own classes (${faces.slice(0, 4).map((f) => f.text).join(' ')})`);
    check(new Set(faces.slice(0, 4).map((f) => f.bg + f.text)).size === 4 && front.bg !== back.bg, 'the four special faces are distinct (front and back ads differ)');
    check(faces.every((f) => f.w >= 20 && f.w <= 32), `special faces keep card size (${faces.map((f) => f.w).join(' ')}px)`);
    if (shots) await page.locator('#face-test').screenshot({ path: join(shots, '9-special-faces-html.png') });
  }

  // Shoe decks: special cards only where the level allows them; Burn and Hand
  // can be placed and configured; a Hand croupier's held cards are drawn.
  {
    const key = ([q, r]) => `${q},${r}`;
    const add = ([q, r], d) => [q + DIRS[d][0], r + DIRS[d][1]];
    const pick = (lv) => {
      const fixed = new Set(lv.fixed.map((c) => key(c.at)));
      const feeds = new Set(lv.fixed.filter((c) => c.kind === 'source').map((c) => key(add(c.at, c.out))));
      const free = lv.floor.filter((at) => !fixed.has(key(at)) && !feeds.has(key(at)));
      const has = new Set(free.map(key));
      for (const a of free) {
        for (let d = 0; d < 6; d++) {
          const b = add(a, d);
          if (!has.has(key(b))) continue;
          const c = free.find((x) => key(x) !== key(a) && key(x) !== key(b));
          if (c) return { a, b, c, d };
        }
      }
      return null;
    };
    const lvIndex = LEVELS.findIndex((lv) => lv.croupiers.includes('shoe') && pick(lv) && !(lv.specialCards ?? []).length);
    const lv = LEVELS[lvIndex];
    const spot = pick(lv);
    const setDeck = async (text) => {
      await page.fill('.deck-in', text);
      await page.press('.deck-in', 'Enter');
    };
    const placeAt = async (tool, at) => {
      await page.click(`.pal-item[data-tool="${tool}"]`);
      await clickHex(at);
      await page.keyboard.press('Escape');
      await clickHex(at); // select it (placing selects; this keeps it selected)
    };
    // Patch the level in the page (the module is shared by the app) and open
    // its editor without reloading.
    const openPatched = async (patch) => {
      await page.evaluate(async ([id, patch]) => {
        const { LEVELS } = await import('/src/levels.js');
        Object.assign(LEVELS.find((l) => l.id === id), patch);
        location.hash = '#/';
      }, [lv.id, patch]);
      await page.waitForSelector('.tile');
      await page.evaluate((id) => { location.hash = `#/level/${id}`; }, lv.id);
      await page.waitForSelector('svg.board');
    };
    await page.goto(base);
    await page.evaluate((id) => {
      const s = JSON.parse(localStorage.getItem('stacked-deck-v1') || '{"levels":{}}');
      s.levels[id] = {};
      localStorage.setItem('stacked-deck-v1', JSON.stringify(s));
    }, lv.id);
    await page.goto(`${base}?unlockall#/level/${lv.id}`);
    await page.waitForSelector('svg.board');
    await placeAt('shoe', spot.a);
    await setDeck('? AS');
    let err = await page.textContent('.inspector .err').catch(() => '');
    check(/"\?" is not a card/.test(err) && !/joker|special/i.test(err), `${lv.id}: deck rejects "?" where no special cards are allowed ("${err}")`);
    await openPatched({ specialCards: ['?', '??'] });
    await clickHex(spot.a);
    await setDeck('$$ AS');
    err = await page.textContent('.inspector .err').catch(() => '');
    check(/isn't allowed on this floor/.test(err) && /\? \?\?/.test(err), `deck rejects a special card the floor doesn't allow ("${err}")`);
    await openPatched({ specialCards: ['?', '??', '$', '$$'], croupiers: [...lv.croupiers.filter((c) => c !== 'burn' && c !== 'hand'), 'burn', 'hand'] });
    await clickHex(spot.a);
    await setDeck('? ?? $ $$ AS 10H');
    const deck = (await page.evaluate((id) => JSON.parse(localStorage.getItem('stacked-deck-v1')).levels[id].cells, lv.id)).find((c) => c.kind === 'shoe')?.deck;
    check(JSON.stringify(deck) === JSON.stringify(['?', '??', '$', '$$', 'AS', 'TH']), `deck accepts allowed special cards: ${JSON.stringify(deck)}`);
    check(await page.locator('.inspector .deck-prev .card.spc').count() === 4, 'deck preview draws the special faces');
    await page.keyboard.press('x');
    await page.keyboard.press('dczaqe'[spot.d]);
    // Hand croupier, n = 4.
    await placeAt('hand', spot.b);
    check(await page.locator('.inspector [data-param="n"] button').count() === 13 &&
      (await page.textContent('.inspector [data-param="n"] button.on')).trim() === '5', 'Hand: n offers 1–13, default 5');
    await page.click('.inspector [data-param="n"] button:nth-child(4)');
    let cells = await page.evaluate((id) => JSON.parse(localStorage.getItem('stacked-deck-v1')).levels[id].cells, lv.id);
    const hc = cells.find((c) => c.fn === 'hand');
    check(hc?.n === 4 && (await page.textContent(`.cell[data-at="${key(spot.b)}"] .chip-t`)) === 'HND4', `Hand placed with n = 4 (${JSON.stringify(hc)})`);
    // Any n up to 52 in the field; out of range is refused; a button goes back.
    await page.fill('.inspector [data-param="n-any"]', '28');
    await page.press('.inspector [data-param="n-any"]', 'Enter');
    const hn = async () => (await page.evaluate((id) => JSON.parse(localStorage.getItem('stacked-deck-v1')).levels[id].cells, lv.id)).find((c) => c.fn === 'hand')?.n;
    check(await hn() === 28 && await page.locator('.inspector [data-param="n"] button.on').count() === 0 &&
      await page.locator('.inspector .n-in.on').count() === 1, 'Hand: n = 28 from the field');
    await page.fill('.inspector [data-param="n-any"]', '53');
    await page.press('.inspector [data-param="n-any"]', 'Enter');
    check(await hn() === 28 && await page.inputValue('.inspector [data-param="n-any"]') === '28', 'Hand: n = 53 is refused');
    await page.click('.inspector [data-param="n"] button:nth-child(4)');
    check(await hn() === 4, 'Hand: back to n = 4 with a button');
    // Burn croupier: two ports.
    await placeAt('burn', spot.c);
    const ports = await page.$$eval('.inspector .port-row .port-tag', (els) => els.map((e) => e.textContent));
    check(ports.join() === 'burn,rest', `Burn has ports ${ports.join(', ')}`);
    await page.click('.inspector .port-row:nth-of-type(2)').catch(() => {});
    await page.keyboard.press('Tab');
    await page.keyboard.press('a');
    cells = await page.evaluate((id) => JSON.parse(localStorage.getItem('stacked-deck-v1')).levels[id].cells, lv.id);
    const bc = cells.find((c) => c.fn === 'burn');
    check(bc && Object.keys(bc.out).length >= 1, `Burn configured: ${JSON.stringify(bc?.out)}`);
    // Run: the shoe feeds the Hand croupier, which shows what it holds.
    await page.keyboard.press('Escape');
    for (let i = 0; i < 4; i++) await page.keyboard.press('.');
    const tag = await page.textContent('.l-cards .held-tag').catch(() => '');
    const held = await page.locator('.l-cards .hand.hand-buffer .scard').count();
    check(/^held [1-4]\/4$/.test(tag) && held >= 1, `Hand croupier's held cards are drawn ("${tag}", ${held} cards)`);
    const sp = await page.locator('.l-cards .scard.spc').count();
    check(sp >= 2, `special cards drawn on the board (${sp})`);
    // Zoom in on the machine for the screenshot.
    const [x, y] = await hexPoint(spot.b);
    await page.mouse.move(x, y);
    for (let i = 0; i < 6; i++) await page.mouse.wheel(0, -120);
    await page.waitForTimeout(100);
    if (shots) {
      const [bx, by] = await hexPoint(spot.b);
      await page.screenshot({ path: join(shots, '10-hand-burn-special-board.png'), clip: { x: Math.max(0, bx - 260), y: Math.max(0, by - 200), width: 520, height: 400 } });
      await page.screenshot({ path: join(shots, '10b-editor-hand-burn.png') });
    }
    // Three more rounds: the Hand deals its four cards and starts again.
    for (let i = 0; i < 3; i++) await page.keyboard.press('.');
    if (shots) {
      const [bx, by] = await hexPoint(spot.b);
      await page.screenshot({ path: join(shots, '10c-hand-dealt.png'), clip: { x: Math.max(0, bx - 260), y: Math.max(0, by - 200), width: 520, height: 400 } });
    }
    // Help now explains the special cards (a floor allowing them is open).
    await page.keyboard.press('?');
    await page.waitForSelector('.modal.help');
    check(await page.locator('.help-special tr').count() === 4, 'help explains special cards once a floor allows them');
    if (shots) {
      await page.locator('.help-special').scrollIntoViewIfNeeded();
      await page.locator('.modal.help').screenshot({ path: join(shots, '11-help-special.png') });
    }
    await page.keyboard.press('Escape');
    await page.goto(base);
    await page.evaluate((id) => {
      const s = JSON.parse(localStorage.getItem('stacked-deck-v1'));
      delete s.levels[id];
      localStorage.setItem('stacked-deck-v1', JSON.stringify(s));
    }, lv.id);
  }

  // Test-only floors (?testlevels adds test/ui-levels.js to the bonus deck).
  {
    const { BONUS: TB, SOLUTIONS } = await import(join(repo, 'test/ui-levels.js'));
    const T = `${base}?testlevels`;
    const nBonus = BONUS_LEVELS.length + TB.length;
    const setSave = (levels) => page.evaluate((l) => localStorage.setItem('stacked-deck-v1', JSON.stringify({ levels: l })), levels);
    const getSave = () => page.evaluate(() => JSON.parse(localStorage.getItem('stacked-deck-v1')).levels);
    const twice = TB.find((l) => l.id === 'test-pay-twice');
    const sorted = TB.find((l) => l.id === 'test-sorted');
    await page.goto(T);
    await setSave({});
    await page.reload();
    await showDeck(page, 'bonus');
    check(await page.locator('.tile.locked.bonus[data-bonus="test-pay-twice"]').count() === 1 &&
      await page.locator('a.tile[data-level="test-pay-twice"]').count() === 0, 'bonus floor is locked before its unlockAfter floor is solved');
    const lockText = await page.textContent('.tile.locked.bonus[data-bonus="test-pay-twice"]');
    check(lockText.includes(`After ${floorLabel(0).text}`), `locked bonus tile names the floor that opens it ("${lockText.trim()}")`);
    check((await page.textContent('.deck-tab.bonus .deck-count')) === `0 / ${nBonus} cleared`, `the bonus deck's tab counts its floors (0 / ${nBonus})`);
    await page.goto(`${T}#/level/test-pay-twice`);
    await page.waitForSelector('.tile');
    check(await page.locator('svg.board').count() === 0, 'a locked bonus floor cannot be opened by URL');
    if (shots) await page.locator('.deck.bonus').screenshot({ path: join(shots, '12-bonus-deck-locked.png') });

    await setSave({ 'opening-night': { solved: true } });
    await page.goto(T);
    await page.reload();
    await showDeck(page, 'bonus');
    check(await page.locator('.chapter.bonus a.tile.bonus[data-level="test-pay-twice"]').count() === 1 &&
      await page.locator('.chapter.bonus a.tile.bonus[data-level="test-sorted"]').count() === 1 &&
      await page.locator('.tile.locked.bonus[data-bonus="test-locked"]').count() === 1, 'solving opening-night opens its bonus floors only');
    check((await page.textContent('a.tile[data-level="test-pay-twice"] .tile-corner.tl')) === 'A♠' &&
      (await page.textContent('.tile.locked.bonus[data-bonus="test-locked"] .tile-no')).startsWith('B'), 'bonus tiles are labelled by their bonus card (A♠; B… without one)');
    check(await page.locator(`a.tile[data-level="${LEVELS[4].id}"]`).count() === 0, 'open bonus floors leave the campaign window alone');
    // A floor needing a campaign floor and a bonus floor: both are named, the
    // bonus one on a starred chip, and a cleared one is struck through.
    const keys = '.tile.locked.bonus[data-bonus="test-two-keys"]';
    check(await page.locator(`${keys} .req`).count() === 2 &&
      (await page.textContent(`${keys} .req:not(.bonus)`)) === floorLabel(1).text &&
      (await page.textContent(`${keys} .req.bonus`)) === '★A♠' &&
      await page.locator(`${keys} .req.done`).count() === 0, 'a bonus floor needing two floors names both, the bonus one starred');
    await setSave({ 'opening-night': { solved: true }, 'around-the-bar': { solved: true } });
    await page.reload();
    await showDeck(page, 'bonus');
    check(await page.locator(keys).count() === 1 && await page.locator(`${keys} .req.done:not(.bonus)`).count() === 1 &&
      await page.locator(`${keys} .req.bonus.done`).count() === 0, 'it stays locked with one of the two cleared, which is struck through');
    await setSave({ 'opening-night': { solved: true }, 'around-the-bar': { solved: true }, 'test-pay-twice': { solved: true } });
    await page.reload();
    await showDeck(page, 'bonus');
    check(await page.locator('a.tile[data-level="test-two-keys"]').count() === 1, 'and opens once both are cleared');
    await setSave({ 'opening-night': { solved: true } });
    await page.reload();
    await showDeck(page, 'bonus');

    if (shots) await page.screenshot({ path: join(shots, '12b-bonus-deck.png'), fullPage: true });

    await page.click('a.tile[data-level="test-pay-twice"]');
    await page.waitForSelector('.story-card');
    check(/Bonus deck/.test(await page.textContent('.story-head')) && (await page.textContent('.story-head .floor-badge')) === 'A♠', 'story screen shows the bonus floor');
    // Back to the floors from a bonus floor: the bonus deck, whichever deck was showing last.
    await page.evaluate(() => localStorage.setItem('stacked-deck-ui', JSON.stringify({ deck: 'campaign', folded: [] })));
    await page.click('.story-actions .btn.ghost');
    await page.waitForSelector('.deck');
    check(await page.locator('.deck.bonus a.tile[data-level="test-pay-twice"]').isVisible() && await page.locator('.deck-tab.bonus.on').count() === 1,
      'back from a bonus floor, the floors list shows the bonus deck');
    await setSave({ 'opening-night': { solved: true }, 'test-pay-twice': { cells: SOLUTIONS['test-pay-twice'] } });
    await page.goto(`${T}#/level/test-pay-twice`);
    await page.reload();
    await page.waitForSelector('svg.board');
    check((await page.textContent('.topbar .floor-badge')) === 'A♠', 'editor top bar shows the bonus card');
    const nExp = twice.expected(twice.tests[0]).length;
    check(await page.locator('.paid.expected .e-item').count() === nExp, `expected floor lists its ${nExp} expected payouts before running`);
    check(await page.locator('.queue .q-mark').count() === 0 && await page.locator('.order-tag').count() === 0, 'expected floor: input hands are not marked $, no order tag');
    for (let i = 0; i < 3; i++) await page.keyboard.press('.');
    const ticked = await page.locator('.paid.expected .e-item.ok').count();
    check(ticked > 0 && ticked < nExp, `expected payouts are ticked off as they are paid (${ticked}/${nExp})`);
    if (shots) {
      await page.screenshot({ path: join(shots, '13-expected-payouts.png') });
      await page.locator('.panel.tests').screenshot({ path: join(shots, '13b-expected-panel.png') });
    }
    await page.click('.speeds .sp:last-child');
    await page.waitForSelector('.modal.results', { timeout: 20000 });
    let ls = (await getSave())['test-pay-twice'];
    check(ls.solved && ls.solutions?.length === 1 && ls.best.croupiers === 2, `expected floor clears; solution saved under its id (${JSON.stringify(ls.best)})`);
    const nextBtn = await page.textContent('.modal-actions .btn.gold').catch(() => '');
    check(nextBtn.includes(sorted.title), `Next on a bonus floor goes to the next open bonus floor ("${nextBtn}")`);
    await page.click('.modal-actions .btn:first-child');
    check(await page.locator('.paid.expected .e-item.ok').count() === nExp, 'every expected payout is ticked after the run');

    // Ordered floor: the right cards in the wrong order are rejected.
    await setSave({ ...(await getSave()), 'test-sorted': { cells: SOLUTIONS['test-sorted-wrong'] } });
    await page.goto(`${T}#/level/test-sorted`);
    await page.reload();
    await page.waitForSelector('svg.board');
    check((await page.textContent('.order-tag').catch(() => '')) === 'card order matters', 'ordered floor says card order matters');
    for (let i = 0; i < 30 && !(await page.locator('.toast.bad').count()); i++) await page.keyboard.press('.');
    const toast = await page.textContent('.toast');
    check(/wrong order/.test(toast || '') && await page.locator('.paid.expected .p-item.bad').count() === 1, `ordered floor rejects a wrong order: "${(toast || '').slice(0, 70)}..."`);
    if (shots) await page.locator('.panel.tests').screenshot({ path: join(shots, '14-ordered-wrong.png') });
    await setSave({ ...(await getSave()), 'test-sorted': { cells: SOLUTIONS['test-sorted'] } });
    await page.reload();
    await page.waitForSelector('svg.board');
    await page.click('.speeds .sp:last-child');
    await page.waitForSelector('.modal.results', { timeout: 20000 });
    ls = (await getSave())['test-sorted'];
    check(ls.solved && ls.solutions?.length === 1, 'ordered floor clears with the sorting machine');
    check(await page.locator('.modal-actions .btn.gold').count() === 0, 'no Next when no other bonus floor is open');
    await page.goto(T);
    await showDeck(page, 'bonus');
    check((await page.textContent('.deck-tab.campaign .deck-count')) === `1 / ${LEVELS.length} cleared` &&
      (await page.textContent('.deck-tab.bonus .deck-count')) === `2 / ${nBonus} cleared`, 'deck tabs: 1 campaign floor and 2 bonus floors cleared');
    check(await page.locator('.chapter.bonus a.tile.solved').count() === 2, 'bonus tiles marked solved');
    if (shots) await page.locator('.deck.bonus').screenshot({ path: join(shots, '12c-bonus-deck-solved.png') });

    // Check deals: a machine that only fits the published tests (they deal
    // only hearts) passes them and fails a check deal, which is loaded and
    // explained, and the floor stays uncleared.
    await setSave({ 'opening-night': { solved: true }, 'around-the-bar': { solved: true }, 'test-hearts': { cells: SOLUTIONS['test-hearts-everything'] } });
    await page.goto(`${T}#/level/test-hearts`);
    await page.reload();
    await page.waitForSelector('svg.board');
    check((await page.textContent('.check-hint').catch(() => '')).includes('8 check deals'), 'the tests panel mentions the check deals before a run');
    await page.click('.speeds .sp:last-child');
    await page.waitForSelector('.toast.bad', { timeout: 20000 });
    const ct = (await page.textContent('.toast')) || '';
    check(/Test 1 passed, but check deal \d failed/.test(ct) && ct.includes('change when it does'), `fitting the tests fails a check deal: "${ct.slice(0, 80)}..."`);
    check(await page.locator('.test-chip.check').count() === 8 && await page.locator('.test-chip.check.fail').count() >= 1 &&
      await page.locator('.test-chip.check.on').count() === 1, 'the check deals are shown, and the failing one is loaded');
    check((await page.textContent('.tp-round')).includes('Check deal'), 'the transport names the check deal');
    check(!(await getSave())['test-hearts'].solved, 'a floor is not cleared by fitting its tests');
    if (shots) await page.locator('.panel.tests').screenshot({ path: join(shots, '15-check-deal-failed.png') });
    await setSave({});
  }

  // Keeping progress: two tabs of the game don't overwrite each other's
  // progress, the floors list's Save file dialog downloads the save and loads
  // one back (adding to what is there), and a browser that won't keep the
  // save says so and offers the file instead.
  {
    const [l0, l1] = LEVELS;
    const ref = async (lv) => (await import(join(repo, 'solutions/levels', `${lv.id}.js`))).default.cells;
    const KEY = 'stacked-deck-v1';
    const stored = (pg) => pg.evaluate((k) => JSON.parse(localStorage.getItem(k)).levels, KEY);
    const shared = await browser.newContext({ viewport: { width: 1440, height: 860 } });
    const tab1 = await shared.newPage();
    tab1.on('pageerror', (e) => errors.push(e.message));
    tab1.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await tab1.goto(base);
    await tab1.evaluate(([k, l, cells]) => {
      localStorage.setItem(k, JSON.stringify({ levels: { [l]: { cells } } }));
      localStorage.setItem('stacked-deck-ui', JSON.stringify({ deck: 'campaign', folded: [] }));
    }, [KEY, l0.id, await ref(l0)]);
    await tab1.reload();
    await tab1.waitForSelector('.tile');
    // A second tab clears the first floor; the first tab's list shows it.
    const tab2 = await shared.newPage();
    tab2.on('pageerror', (e) => errors.push(e.message));
    await tab2.goto(`${base}#/level/${l0.id}`);
    await tab2.waitForSelector('svg.board');
    await tab2.click('.speeds .sp:last-child');
    await tab2.waitForSelector('.modal.results', { timeout: 60000 });
    await tab1.waitForSelector(`a.tile.solved[data-level="${l0.id}"]`, { timeout: 5000 }).catch(() => {});
    check(await tab1.locator(`a.tile.solved[data-level="${l0.id}"]`).count() === 1, 'a floor cleared in another tab shows as cleared in this one');

    // Download the save.
    await tab1.click('button:has-text("Save file")');
    await tab1.waitForSelector('.modal.dialog h2:has-text("Save file")');
    const [download] = await Promise.all([tab1.waitForEvent('download'), tab1.click('.modal.dialog button:has-text("Download save")')]);
    const { readFileSync } = await import('node:fs');
    const file = JSON.parse(readFileSync(await download.path(), 'utf8'));
    check(/^stacked-deck-save-\d{4}-\d\d-\d\d\.json$/.test(download.suggestedFilename()) && file.format === 'stacked-deck-save' &&
      file.levels[l0.id]?.solutions?.length === 1, `the save downloads as a file (${download.suggestedFilename()})`);

    // Load a file that clears the second floor: added to this tab's save
    // (keeping the floor the other tab cleared), and the other tab hears.
    const upload = (pg, levels) => pg.setInputFiles('.modal.dialog input[type=file]', {
      name: 'save.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ format: 'stacked-deck-save', version: 1, levels })),
    });
    await upload(tab1, { [l1.id]: { solutions: [{ cells: await ref(l1), at: 1 }] } });
    await tab1.waitForFunction(() => /^Loaded/.test(document.querySelector('.modal.dialog .dlg-status')?.textContent ?? ''));
    check((await tab1.textContent('.modal.dialog .dlg-status')) === 'Loaded: 1 floor cleared and 1 solution added.', `loading a save file says what it added: "${await tab1.textContent('.modal.dialog .dlg-status')}"`);
    let levels = await stored(tab1);
    check(levels[l0.id]?.solved && levels[l0.id].solutions.length === 1 && levels[l1.id]?.solved && levels[l1.id].best?.rounds === l1.par.rounds,
      'the loaded floor is saved alongside the one cleared in the other tab, and rescored');
    await upload(tab1, { [l1.id]: { solutions: [{ cells: await ref(l1), at: 1 }] } });
    await tab1.waitForFunction(() => /^Nothing new/.test(document.querySelector('.modal.dialog .dlg-status')?.textContent ?? ''));
    check(true, 'loading it again adds nothing');
    await tab1.setInputFiles('.modal.dialog input[type=file]', { name: 'x.json', mimeType: 'application/json', buffer: Buffer.from('not json') });
    await tab1.waitForFunction(() => /isn't a Stacked Deck save/.test(document.querySelector('.modal.dialog .dlg-status')?.textContent ?? ''));
    check(true, 'a file that isn\'t a save is refused');
    if (shots) await tab1.locator('.modal.dialog').screenshot({ path: join(shots, 'save-file.png') });
    await tab1.click('.modal.dialog button:has-text("Close")');
    check(await tab1.locator(`a.tile.solved[data-level="${l1.id}"]`).count() === 1, 'the list shows the loaded floor cleared');
    await tab2.goto(`${base}#/`);
    await tab2.waitForSelector('.tile');
    check(await tab2.locator(`a.tile.solved[data-level="${l1.id}"]`).count() === 1, 'and so does the other tab, without reloading');
    await tab2.close();

    // Storage turned off: the notice shows at once, with the file.
    const blocked = await browser.newPage({ viewport: { width: 1440, height: 860 } });
    blocked.on('pageerror', (e) => errors.push(e.message));
    await blocked.addInitScript(() => {
      const no = () => { throw new DOMException('blocked', 'SecurityError'); };
      Storage.prototype.getItem = no;
      Storage.prototype.setItem = no;
    });
    await blocked.goto(base);
    await blocked.waitForSelector('.tile');
    check(/isn't letting the game save/.test(await blocked.textContent('.save-notice').catch(() => '')), 'with storage turned off, a notice says progress isn\'t being saved');
    if (shots) await blocked.screenshot({ path: join(shots, 'save-notice.png') });
    const [d2] = await Promise.all([blocked.waitForEvent('download'), blocked.click('.save-notice button:has-text("Download save")')]);
    check(!!d2.suggestedFilename(), 'the notice downloads the save');
    await blocked.click('.save-notice button[aria-label="Dismiss"]');
    check(await blocked.locator('.save-notice').count() === 0, 'the notice can be dismissed');
    await blocked.close();

    // Storage full: the notice shows when a write fails.
    const full = await browser.newPage({ viewport: { width: 1440, height: 860 } });
    full.on('pageerror', (e) => errors.push(e.message));
    await full.addInitScript(() => {
      Storage.prototype.setItem = () => { throw new DOMException('full', 'QuotaExceededError'); };
    });
    await full.goto(base);
    await full.waitForSelector('.tile');
    check(await full.locator('.save-notice').count() === 0, 'no notice while nothing has failed');
    await full.click('button:has-text("Save file")');
    await upload(full, { [l0.id]: { solved: true } });
    await full.waitForFunction(() => /^Loaded/.test(document.querySelector('.modal.dialog .dlg-status')?.textContent ?? ''));
    check(/couldn't be saved/.test(await full.textContent('.modal.dialog .dlg-status')) && /storage for the game is full/.test(await full.textContent('.save-notice')),
      'with storage full, a failed write shows the notice');
    await full.close();
    await shared.close();
  }

  if (all) {
    const { readdirSync } = await import('node:fs');
    const have = new Set(readdirSync(join(repo, 'solutions/levels')).map((f) => f.replace(/\.js$/, '')));
    for (const lv of [...LEVELS, ...BONUS_LEVELS]) {
      if (!have.has(lv.id)) { console.log(`skip ${lv.id}: no reference solution`); continue; }
      const sol = (await import(join(repo, 'solutions/levels', `${lv.id}.js`))).default;
      await page.goto(base);
      await page.evaluate(([id, cells]) => {
        const s = JSON.parse(localStorage.getItem('stacked-deck-v1') || '{"levels":{}}');
        s.levels[id] = { cells };
        localStorage.setItem('stacked-deck-v1', JSON.stringify(s));
      }, [lv.id, sol.cells]);
      await page.goto(`${base}?unlockall#/level/${lv.id}`);
      await page.waitForSelector('svg.board');
      await page.click('.speeds .sp:last-child');
      const res = await Promise.race([
        page.waitForSelector('.modal.results', { timeout: 120000 }).then(() => 'solved'),
        page.waitForSelector('.toast.bad', { timeout: 120000 }).then(async () => `failed: ${await page.textContent('.toast')}`),
      ]);
      const saved = await page.evaluate((id) => JSON.parse(localStorage.getItem('stacked-deck-v1')).levels[id], lv.id);
      const par = lv.par ? ` (par ${lv.par.croupiers}/${lv.par.rounds})` : '';
      check(res === 'solved' && saved.solved && saved.solutions?.length === 1, `${lv.id}: reference solution ${res}, best ${JSON.stringify(saved.best)}${par}`);
    }
  }

  // The privacy notice, a page of its own (no scripts; checked for CSP
  // errors and requests below).
  await page.goto(`${base}privacy.html`);
  await page.waitForSelector('main.doc h1');
  check(/Delete my data/.test(await page.textContent('main.doc')) && await page.locator('main.doc a[href="./"]').count() === 1,
    'the privacy notice loads, with a way back to the game');
  if (shots) await page.screenshot({ path: join(shots, 'privacy.png'), fullPage: true });

  check(errors.length === 0, `no page errors${errors.length ? ': ' + errors.join(' | ') : ''}`);
  check(external.length === 0, `signed out, no requests to other sites${external.length ? ': ' + external.slice(0, 3).join(' ') : ''}`);
} finally {
  await browser.close();
  server.kill();
}
console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
process.exit(failures ? 1 : 0);
