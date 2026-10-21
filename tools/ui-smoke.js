// Browser smoke test for the UI (Playwright + Chromium, not a repo dependency).
//   node tools/ui-smoke.js [screenshot-dir]
// Uses the `playwright` package from node_modules or the global npm root, and
// the browsers in PLAYWRIGHT_BROWSERS_PATH. It serves the repo itself, solves
// 'opening-night', checks the save and unlock, and checks that a wrong payout
// on the first level that drops hands pauses the run and can be stepped back.
import { spawn, execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LEVELS } from '../src/levels.js';
import { DIRS } from '../src/engine.js';

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

// Shortest line of passes from the (single) source to the desk: [[at, outSide], ...].
function passLine(lv) {
  const key = ([q, r]) => `${q},${r}`;
  const add = ([q, r], d) => [q + DIRS[d][0], r + DIRS[d][1]];
  const src = lv.fixed.find((c) => c.kind === 'source');
  const desk = lv.fixed.find((c) => c.kind === 'payout');
  const floor = new Set(lv.floor.map(key));
  lv.fixed.forEach((c) => floor.delete(key(c.at)));
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

  await page.goto(base);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForSelector('.tile');
  check(await page.locator('a.tile[data-level="opening-night"]').count() === 1, 'level select lists opening-night');
  check(await page.locator(`a.tile[data-level="${LEVELS[1].id}"]`).count() === 0, 'second level is locked');
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
  await page.click('.pal-item[data-tool="pass"]');
  for (const [at] of line1) await clickHex(at);
  await page.keyboard.press('Escape'); // drop the tool
  for (const [at, d] of line1) {
    await clickHex(at);                 // select
    await page.keyboard.press('x');     // port to the floor
    await clickHex(at, d);              // click the edge: out -> d
  }
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

  // Next level is unlocked.
  const next = LEVELS[1];
  await page.click('.modal-actions .btn.gold');
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
  check(await page.locator(`a.tile[data-level="${LEVELS[1].id}"]`).count() === 1, `${LEVELS[1].id} unlocked`);
  if (shots) await page.screenshot({ path: join(shots, '6-level-select-after.png') });

  // Help panel.
  await page.keyboard.press('?');
  check(await page.locator('.modal.help .help-table tr').count() >= 10, 'help panel lists croupiers');
  await page.keyboard.press('Escape');

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
    await phone.close();
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
      check(res === 'solved' && saved.solved, `${lv.id}: reference solution ${res}, best ${JSON.stringify(saved.best)}${par}`);
    }
  }

  check(errors.length === 0, `no page errors${errors.length ? ': ' + errors.join(' | ') : ''}`);
} finally {
  await browser.close();
  server.kill();
}
console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
process.exit(failures ? 1 : 0);
