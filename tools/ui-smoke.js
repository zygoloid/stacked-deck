// Browser smoke test for the UI (Playwright + Chromium, not a repo dependency).
//   node tools/ui-smoke.js [screenshot-dir]
// Uses the `playwright` package from node_modules or the global npm root, and
// the browsers in PLAYWRIGHT_BROWSERS_PATH. It serves the repo itself, solves
// 'opening-night', checks the save and unlock, records a second (longer)
// solution and checks the solutions plot (load, delete), checks that a wrong payout
// on the first level that drops hands pauses the run and can be stepped back,
// checks floor numbering (playing-card labels), special card faces, the shoe
// deck parser's special-card rules, and placing Burn and Hand croupiers (with
// a Hand's held cards drawn on the board).
import { spawn, execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LEVELS } from '../src/levels.js';
import { DIRS } from '../src/engine.js';
import { floorLabel } from '../src/ui/floors.js';

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
const check = (cond, msg) => {
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${msg}`);
  if (!cond) failures++;
};

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 860 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('dialog', (d) => d.accept()); // "Clear the whole floor?", "Delete ... solution?"

  await page.goto(base);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForSelector('.tile');
  check(await page.locator('a.tile[data-level="opening-night"]').count() === 1, 'level select lists opening-night');
  check(await page.locator(`a.tile[data-level="${LEVELS[2].id}"]`).count() === 1, 'first three levels are open');
  check(await page.locator(`a.tile[data-level="${LEVELS[3].id}"]`).count() === 0, 'fourth level is locked');
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
    await page.click('.pal-item[data-tool="pass"]');
    for (const [at] of line) await clickHex(at);
    await page.keyboard.press('Escape'); // drop the tool
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
    lv.tests[0].some((hand, i) => !lv.pays(hand, lv.tests[0].slice(0, i))) && passLine(lv));
  if (wrongLevel) {
    await page.goto(`${base}?unlockall#/level/${wrongLevel.id}`);
    await page.waitForSelector('svg.board');
    const line = passLine(wrongLevel);
    await page.click('.pal-item[data-tool="pass"]');
    for (const [at] of line) await clickHex(at);
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
  if (shots) await page.screenshot({ path: join(shots, '6-level-select-after.png') });

  // Help panel.
  await page.keyboard.press('?');
  check(await page.locator('.modal.help .help-table tr').count() >= 10, 'help panel lists croupiers');
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
    await phone.click('.tp.main');
    await phone.waitForTimeout(3000);
    const y = await phone.evaluate(() => window.scrollY);
    check(y === 0, `playing on a phone keeps the page still (scrollY ${y})`);
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


  // Floor numbering: every floor is labelled by its playing card.
  {
    await page.goto(`${base}?unlockall`);
    await page.waitForSelector('.tile');
    const tiles = await page.$$eval('a.tile', (els) => els.map((e) => ({
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
    const locked = await page.$$eval('.tile.locked .tile-no', (els) => els.map((e) => e.textContent));
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
    check(/Burn/.test(txt) && /Hand/.test(txt) && /n \(1–13, default 5\)/.test(txt), 'help documents Burn and Hand (n 1–13, default 5)');
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

  if (all) {
    const { readdirSync } = await import('node:fs');
    const have = new Set(readdirSync(join(repo, 'solutions/levels')).map((f) => f.replace(/\.js$/, '')));
    for (const lv of LEVELS) {
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

  check(errors.length === 0, `no page errors${errors.length ? ': ' + errors.join(' | ') : ''}`);
} finally {
  await browser.close();
  server.kill();
}
console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
process.exit(failures ? 1 : 0);
