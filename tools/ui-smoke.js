// Browser smoke test for the UI (Playwright + Chromium, not a repo dependency).
//   node tools/ui-smoke.js [screenshot-dir]
// Uses the `playwright` package from node_modules or the global npm root, and
// the browsers in PLAYWRIGHT_BROWSERS_PATH. It serves the repo itself, solves
// the first campaign floor, checks the save and unlock, records a second (different)
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
// The title screen: its machine runs, Start deals the floors list (on a
// phone too), it shows once a visit, the name opens it again, a key skips
// it, and with reduced motion it stands still.
// --all also solves every bonus floor that has a reference solution.
import { spawn, execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as L from '../src/levels.js';
import { DIRS } from '../src/engine.js';
import { floorLabel } from '../src/ui/floors.js';
import { dealLabel } from '../src/ui/board.js';

const { LEVELS } = L;
const BONUS_LEVELS = Array.isArray(L.BONUS) ? L.BONUS : [];
const FLOOR_LEVELS = Array.isArray(L.FLOOR) ? L.FLOOR : [];
// The first two campaign floors (the campaign flow: solving, unlocking),
// and a roomy line-of-passes floor for the editor checks that need space
// (Opening Night as it was, now on the floor tab).
const FIRST = LEVELS[0].id, SECOND = LEVELS[1].id;
const ROOMY = FLOOR_LEVELS.find((l) => l.id === 'opening-night') ?? LEVELS[0];
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

// Lines of passes from each source to a desk: [[at, outSide], ...] for all
// of them, avoiding the hexes in `blocked` ("q,r" keys) and each other. With
// `merge`, a later source's line may end by joining an earlier one. Null if
// some source can't reach a desk.
function passLine(lv, blocked = new Set(), { merge = false } = {}) {
  const key = ([q, r]) => `${q},${r}`;
  const add = ([q, r], d) => [q + DIRS[d][0], r + DIRS[d][1]];
  const desks = new Set(lv.fixed.filter((c) => c.kind === 'payout').map((c) => key(c.at)));
  const floor = new Set(lv.floor.map(key));
  lv.fixed.forEach((c) => floor.delete(key(c.at)));
  blocked.forEach((k) => floor.delete(k));
  const all = [];
  for (const src of lv.fixed.filter((c) => c.kind === 'source')) {
    const used = new Set(all.map(([at]) => key(at)));
    const start = add(src.at, src.out);
    if (merge && used.has(key(start))) continue;
    if (!floor.has(key(start)) || used.has(key(start))) return null;
    const prev = new Map([[key(start), null]]);
    const queue = [start];
    let line = null;
    while (queue.length && !line) {
      const at = queue.shift();
      for (let d = 0; d < 6 && !line; d++) {
        const n = add(at, d);
        if (desks.has(key(n)) || (merge && used.has(key(n)))) {
          line = [[at, d]];
          for (let p = prev.get(key(at)); p; p = prev.get(key(p[0]))) line.unshift(p);
        } else if (floor.has(key(n)) && !used.has(key(n)) && !prev.has(key(n))) { prev.set(key(n), [at, d]); queue.push(n); }
      }
    }
    if (!line) return null;
    all.push(...line);
  }
  return all;
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
// The title screen (src/ui/title.js) shows once a visit (a tab's
// sessionStorage): every page here starts past it, but the ones that check
// the title itself (rawContext).
const titleSeen = () => { try { sessionStorage.setItem('stacked-deck-title', '1'); } catch { /* storage blocked */ } };
const errors = [];
// Signed out, the game must not contact any other site (the online
// features load only on signing in), and nothing may break its CSP.
const external = [];
// Headless Chromium can occasionally abort in-flight ES module imports during
// rapid back-to-back navigations/reloads, leaving #app unbooted after load.
function steadyPage(p) {
  p.on('request', (r) => {
    const u = new URL(r.url());
    if (/^https?:$/.test(u.protocol) && !['localhost', '127.0.0.1'].includes(u.hostname)) external.push(r.url());
  });
  const rawGoto = p.goto.bind(p), rawReload = p.reload.bind(p);
  const ensureBooted = async () => {
    for (let k = 0; k < 2; k++) {
      const ok = await p.waitForFunction(
        () => !document.getElementById('app') || !!document.body.dataset.screen,
        null,
        { timeout: 800 },
      ).then(() => true, () => false);
      if (ok) return;
      await rawReload().catch(() => {});
    }
  };
  p.goto = async (url, opts) => {
    let r;
    try { r = await rawGoto(url, opts); } catch (e) { if (!/ERR_ABORTED/.test(e.message)) throw e; r = await rawGoto(url, opts); }
    await ensureBooted();
    return r;
  };
  p.reload = async (opts) => {
    let r;
    try { r = await rawReload(opts); } catch (e) { if (!/ERR_ABORTED/.test(e.message)) throw e; r = await rawReload(opts); }
    await ensureBooted();
    return r;
  };
  return p;
}
function steadyContext(c) {
  const np = c.newPage.bind(c);
  c.newPage = async (opts) => steadyPage(await np(opts));
  return c;
}
const baseContext = browser.newContext.bind(browser);
const rawContext = async (opts) => steadyContext(await baseContext(opts));
browser.newContext = async (opts) => { const c = await rawContext(opts); await c.addInitScript(titleSeen); return c; };
const rawNewPage = browser.newPage.bind(browser);
browser.newPage = async (opts) => { const p = steadyPage(await rawNewPage(opts)); await p.addInitScript(titleSeen); return p; };

// Screen position of a hex centre (and of a point toward side d) on `page`.
async function makeDesktopPage() {
  const page = await browser.newPage({ viewport: { width: 1440, height: 860 } });
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('dialog', (d) => d.accept()); // "Clear the whole floor?", "Delete ... solution?"
  const hexPoint = (at, d = null, frac = 0.8) => page.evaluate(([[q, r], d, frac]) => {
    const R = 50, svg = document.querySelector('svg.board');
    let x = R * Math.sqrt(3) * (q + r / 2), y = R * 1.5 * r;
    if (d !== null) { x += Math.cos(d * Math.PI / 3) * R * 0.866 * frac; y += Math.sin(d * Math.PI / 3) * R * 0.866 * frac; }
    const p = new DOMPoint(x, y).matrixTransform(svg.getScreenCTM());
    return [p.x, p.y];
  }, [at, d, frac]);
  const clickHex = async (at, d, frac) => { const [x, y] = await hexPoint(at, d, frac); await page.mouse.click(x, y); };
  return { page, hexPoint, clickHex };
}

async function runTracks(fns) {
  const logs = fns.map(() => []);
  // Start the longest tracks first, capped at 4 concurrent contexts so
  // time-sensitive touch/animation checks never starve on 4-core runners.
  const order = [2, 3, 4, 0, 6, 5, 1].filter((i) => i < fns.length);
  for (let i = 0; i < fns.length; i++) if (!order.includes(i)) order.push(i);
  let next = 0;
  try {
    await Promise.all(Array.from({ length: Math.min(4, fns.length) }, async () => {
      while (next < order.length) {
        const idx = order[next++];
        const trackCheck = (cond, msg) => {
          logs[idx].push(`${cond ? 'ok  ' : 'FAIL'} ${msg}`);
          if (!cond) failures++;
        };
        await fns[idx](trackCheck);
      }
    }));
  } finally {
    for (const lines of logs) {
      for (const l of lines) console.log(l);
    }
  }
}

try {
  await runTracks([
    async (check) => {
      const { page, hexPoint, clickHex } = await makeDesktopPage();
      try {
  await page.goto(base);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForSelector('.tile');
  check(await page.locator(`a.tile[data-level="${FIRST}"]`).count() === 1, `level select lists ${FIRST}`);
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

  await page.click(`a.tile[data-level="${FIRST}"]`);
  await page.waitForSelector('.story-card');
  check((await page.textContent('.story-card h1')).includes('Opening Night'), 'story screen shows the title');
  await page.click('.story-actions .btn.gold');
  await page.waitForSelector('svg.board');
  // The tutorial (src/ui/coach.js) on the first floor: a strip above the board.
  // Its steps in sequence (not an on-failed one).
  const tutorial = (LEVELS[0].tutorial ?? []).filter((st) => !st.on);
  const coachStep = async () => ((await page.textContent('.coach:not(.hidden) .coach-count').catch(() => '')) || '').trim();
  if (tutorial.length) check(await coachStep() === `1 / ${tutorial.length}`, `the first floor starts its tutorial (${await coachStep()})`);
  // Its first step shows as a dialog in the middle of the screen, then flies
  // up to the strip.
  const dismissWelcome = async () => {
    await page.click('.coach-card .coach-next');
    await page.waitForSelector('.coach-card', { state: 'detached' });
    await page.waitForSelector('.coach:not(.hidden):not(.landing)');
  };
  if (tutorial[0]?.modal) {
    const box = await page.locator('.coach-card').boundingBox();
    const vp = page.viewportSize();
    check(box && Math.abs(box.x + box.width / 2 - vp.width / 2) < 4 && Math.abs(box.y + box.height / 2 - vp.height / 2) < 4 &&
      await page.locator('.coach-veil').count() === 1 && await page.locator('.stage > .coach.hidden').count() === 1,
      'the first step shows as a dialog in the middle of the screen, the strip hidden');
    await page.keyboard.press('2'); // keys don't reach the editor behind it
    check(await page.locator('.pal-item.on').count() === 0, 'the dialog keeps keys from the editor');
    await dismissWelcome();
    check(await coachStep() === `2 / ${tutorial.length}` && await page.locator('.coach-card, .coach-veil').count() === 0,
      `Next flies the dialog up into the strip, on step 2 (${await coachStep()})`);
    // Back goes to the step before, in the strip, with Next to come back.
    await page.click('.coach .coach-back');
    check(await coachStep() === `1 / ${tutorial.length}` && await page.locator('.coach-card').count() === 0 && await page.isVisible('.coach .coach-next'),
      `Back shows the welcome again, in the strip (${await coachStep()})`);
    await page.click('.coach .coach-next');
    check(await coachStep() === `2 / ${tutorial.length}`, `Next comes back to step 2 (${await coachStep()})`);
  }
  // Running a test before building doesn't skip the building steps.
  if (tutorial.length) {
    await page.keyboard.press('.'); // step a round
    check(await coachStep() === `2 / ${tutorial.length}`, `running a test early stays on the step (${await coachStep()})`);
    await page.keyboard.press('r'); // back to editing
  }


  // Build the trivial solution: a line of passes from each player to a desk,
  // derived from level.fixed.
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
  if (tutorial.length) {
    // Built ahead of it: it skips to the first step not done yet (play).
    const playStep = tutorial.findIndex((st) => st.until === 'ran') + 1;
    check(await coachStep() === `${playStep} / ${tutorial.length}` && await page.locator('.transport .tp.main.coach-glow').count() === 1,
      `building ahead of the tutorial skips it on to "play", lit up (${await coachStep()})`);
  }
  check(await page.locator('.sol-btn.hidden').count() === 1, 'no Solutions button before the floor is cleared');
  check((await page.textContent('.stats .stat-v')).trim() === String(line1.length), `croupier count shows ${line1.length}`);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('stacked-deck-v1')));
  const cells = saved?.levels?.[FIRST]?.cells ?? [];
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
      const draw = (anim) => board.render({ cells, live: sim.floor, paidNow: sim.paidNow, paidNowHex: sim.paidNowHex, anim });
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
  // Two desks without labels: a payout is drawn (and counted) only at the
  // desk it reached.
  {
    const r = await page.evaluate(async () => {
      const { Board } = await import('./src/ui/board.js');
      const { Sim } = await import('./src/ui/sim.js');
      const level = {
        floor: [[0, 0], [1, 0], [2, 0], [0, 1], [1, 1]],
        fixed: [{ at: [0, 0], kind: 'source', out: 0 }, { at: [2, 0], kind: 'payout' }, { at: [1, 1], kind: 'payout' }],
      };
      const cells = [{ at: [1, 0], kind: 'croupier', fn: 'pass', out: { out: 0 } }];
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.style.cssText = 'position:fixed;left:0;top:0;width:600px;height:400px';
      document.body.append(svg);
      const board = new Board(svg, level);
      const sim = new Sim({ cells: [...level.fixed, ...cells] }, [['AS'], ['KH']], () => true);
      for (let i = 0; i < 10 && !sim.floor.paid.length; i++) sim.step();
      board.render({ cells, live: sim.floor, paidNow: sim.paidNow, paidNowHex: sim.paidNowHex });
      const out = [...svg.querySelectorAll('.cell.payout')].map((g) => `${g.dataset.at}:${g.querySelector('.paid-badge-t')?.textContent ?? 0}`);
      const now = [...svg.querySelectorAll('.paid-now')].length;
      svg.remove();
      return { out, now };
    });
    check(r.now === 1 && r.out.sort().join(' ') === '1,1:0 2,0:1', `two unlabelled desks: a payout shows only at its own desk (${JSON.stringify(r)})`);
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
      const draw = (anim) => board.render({ cells, live: sim.floor, paidNow: sim.paidNow, paidNowHex: sim.paidNowHex, anim });
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
  const lv = save.levels[FIRST];
  check(lv.solved === true && lv.best.croupiers === line1.length && Number.isInteger(lv.best.rounds), `saved solved with best ${JSON.stringify(lv.best)}`);
  check(lv.solutions?.length === 1 && lv.solutions[0].croupiers === line1.length && lv.solutions[0].rounds === lv.best.rounds &&
    lv.solutions[0].cells.length === line1.length && Number.isFinite(lv.solutions[0].at), 'the solution is recorded');
  check(await page.locator('.modal.results .scatter .sc-pt').count() === 1 && await page.locator('.modal.results .sc-pt.fresh.front').count() === 1,
    'results plot shows the new solution, highlighted');
  const best1 = lv.best;

  if (tutorial.length) {
    // Cleared: the tutorial is done, and the story page offers it again.
    await page.click('.modal-actions .btn:first-child'); // Keep tinkering
    check(await page.locator('.coach.hidden').count() === 1, 'clearing the floor finishes the tutorial');
    await page.goto(`${base}#/level/${FIRST}/story`);
    await page.click('.story-actions .coach-again');
    await page.waitForSelector('svg.board');
    check(await coachStep() === `1 / ${tutorial.length}` && (await page.textContent('.stats .stat-v')).trim() === '0',
      `the story page's Replay the tutorial brings it back, on an empty floor (${await coachStep()})`);
    if (tutorial[0]?.modal) await dismissWelcome();
    await buildLine(line1);
    await page.click('.coach-skip');
    check(await page.locator('.coach.hidden').count() === 1, 'Skip tutorial hides it');
    await page.click('.tp.main');
    await page.waitForSelector('.modal.results', { timeout: 20000 });
  }
  // Clearing again with the same machine doesn't add a duplicate.
  await page.click('.modal-actions .btn:first-child'); // Keep tinkering
  await page.click('.tp.main');
  await page.waitForSelector('.modal.results', { timeout: 20000 });
  let ls = (await page.evaluate(() => JSON.parse(localStorage.getItem('stacked-deck-v1')))).levels[FIRST];
  check(ls.solutions.length === 1 && /already saved/.test(await page.textContent('.modal.results')), 'clearing with the same machine adds no duplicate');
  await page.click('.modal-actions .btn:first-child');

  // A second solution: lines that may join each other (on the first floor,
  // one table's cards into the other's line: fewer croupiers, more rounds),
  // else the shortest lines that avoid the first machine's middle hex.
  let line2 = passLine(LEVELS[0], new Set(), { merge: true });
  if (!line2 || line2.length === line1.length) line2 = passLine(LEVELS[0], new Set([line1[Math.floor(line1.length / 2)][0].join()]));
  check(!!line2 && line2.length !== line1.length, `a different machine exists (${line2?.length} passes)`);
  await page.click('.pal-tools .btn.danger'); // Clear floor (confirm accepted)
  await buildLine(line2);
  await page.keyboard.press('Escape');
  await page.click('.speeds .sp:last-child');
  await page.waitForSelector('.modal.results', { timeout: 20000 });
  ls = (await page.evaluate(() => JSON.parse(localStorage.getItem('stacked-deck-v1')))).levels[FIRST];
  check(ls.solutions.length === 2 && ls.solutions[1].croupiers === line2.length, `second solution recorded (${ls.solutions.map((s) => `${s.croupiers}/${s.rounds}`).join(', ')})`);
  check(ls.best.croupiers === Math.min(best1.croupiers, line2.length) && ls.best.rounds === Math.min(best1.rounds, ls.solutions[1].rounds), `best is kept per axis: ${JSON.stringify(ls.best)}`);
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
  ls = (await page.evaluate(() => JSON.parse(localStorage.getItem('stacked-deck-v1')))).levels[FIRST];
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
  check(await page.locator(`a.tile.solved[data-level="${FIRST}"]`).count() === 1, `level select marks ${FIRST} solved`);
  check(await page.locator(`a.tile[data-level="${LEVELS[3].id}"]`).count() === 1, `clearing a floor opens ${LEVELS[3].id}`);
  check(await page.locator(`a.tile[data-level="${LEVELS[4].id}"]`).count() === 0, `${LEVELS[4].id} still locked`);
  {
    // Every card, open or locked, is the same size, in a playing card's proportions.
    const sizes = await page.$$eval('.tiles > *', (els) => els.map((e) => { const r = e.getBoundingClientRect(); return `${r.width.toFixed(1)}x${r.height.toFixed(1)}`; }));
    const [w, hgt] = sizes[0].split('x').map(Number);
    check(new Set(sizes).size === 1 && Math.abs(w / hgt - 5 / 7) < 0.01, `floor cards are all ${sizes[0]} (${new Set(sizes).size} sizes)`);
    // The cleared floor's best against par, and its chart on hovering it.
    const marks = await page.$$eval(`a.tile[data-level="${FIRST}"] .ts-axis`, (els) => els.map((e) => e.className));
    const par = LEVELS[0].par;
    check(marks.length === 2 && (best1.croupiers !== par.croupiers || best1.rounds !== par.rounds || marks.every((c) => c.includes('ts-at'))), `cleared card marks its best against par (${marks.join(', ')})`);
    await page.hover(`a.tile[data-level="${FIRST}"]`);
    await page.waitForSelector('.tile-pop:not(.hidden) .sc-svg', { timeout: 3000 }).catch(() => {});
    check(await page.locator('.tile-pop:not(.hidden) .sc-pt').count() >= 1, 'hovering a cleared card shows its chart');
    await page.mouse.move(2, 2);
    await page.waitForTimeout(300);
    check(await page.locator('.tile-pop.hidden').count() === 1, 'the chart goes away on leaving the card');
    // Clicking one of the player's points on it opens the floor with that machine.
    await page.hover(`a.tile[data-level="${FIRST}"]`);
    await page.waitForSelector('.tile-pop:not(.hidden) .sc-pt', { timeout: 3000 }).catch(() => {});
    await page.click('.tile-pop .sc-pt');
    await page.waitForSelector('svg.board', { timeout: 5000 }).catch(() => {});
    const toast = await page.textContent('.toast').catch(() => '');
    check(page.url().endsWith(`#/level/${FIRST}`) && /Loaded your/.test(toast ?? ''),
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
    const sol = (await import(pathToFileURL(join(repo, 'solutions/levels/opening-night.js')).href)).default;
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
    const lv = L.ALL_LEVELS.find((l) => l.id === 'beat-the-dealer');
    const sol = (await import(pathToFileURL(join(repo, 'solutions/levels/beat-the-dealer.js')).href)).default;
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
    const lv = L.ALL_LEVELS.find((l) => l.id === 'beat-the-dealer');
    const sol = (await import(pathToFileURL(join(repo, 'solutions/levels/beat-the-dealer.js')).href)).default;
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

  // The tutorial's light on a part of the editor survives that part being
  // drawn again: on the second floor's ports step, selecting the croupier by
  // a click (which redraws the panel) lights its active port.
  {
    const lv = LEVELS[1];
    const seq = (lv.tutorial ?? []).filter((st) => !st.on);
    const step = seq.findIndex((st) => st.ui === 'ports');
    const before = seq.slice(0, step).filter((st) => st.until?.cell).map((st) => st.until.cell);
    if (step >= 0 && before.length) {
      await page.goto(base);
      await page.evaluate(([id, cells]) => {
        localStorage.removeItem('stacked-deck-coach');
        localStorage.setItem('stacked-deck-v1', JSON.stringify({ levels: { [id]: { cells } } }));
      }, [lv.id, before.map((c) => ({ at: c.at, kind: 'croupier', fn: c.fn, out: c.out ?? {} }))]);
      await page.goto(`${base}?unlockall#/level/${lv.id}`);
      await page.waitForSelector('svg.board');
      await clickHex(before[before.length - 1].at);
      check((await page.textContent('.coach .coach-count')).trim() === `${step + 1} / ${seq.length}` &&
        await page.locator('.inspector .port-row.active.coach-glow').count() === 1, 'the tutorial lights the selected croupier\'s active port');
      await page.evaluate(() => localStorage.removeItem('stacked-deck-coach'));
    }
  }

  // A step that names a part of the editor lights it and dims the rest of the
  // screen; a failed run brings the on-failed step (the rules are in the
  // brief), and Got it goes back to the step the tutorial was on.
  {
    const lv = LEVELS.find((l) => l.tutorial?.some((st) => st.on === 'failed'));
    const seq = (lv?.tutorial ?? []).filter((st) => !st.on);
    const failed = lv?.tutorial.find((st) => st.on === 'failed');
    if (lv && seq[0].until === 'next' && !seq[0].modal) {
      await page.goto(base);
      await page.evaluate((id) => {
        localStorage.removeItem('stacked-deck-coach');
        const save = JSON.parse(localStorage.getItem('stacked-deck-v1') || '{}');
        if (save.levels?.[id]) save.levels[id].cells = [];
        localStorage.setItem('stacked-deck-v1', JSON.stringify(save));
      }, lv.id);
      await page.goto(`${base}?unlockall#/level/${lv.id}`);
      await page.waitForSelector('svg.board');
      if (seq[0].ui) {
        await page.waitForSelector('.coach-dim.on');
        check(await page.locator('.coach-glow').count() === 1, `${lv.id}: the first step lights its part, the rest dimmed`);
      }
      await page.click('.coach .coach-next');
      await page.click('.speeds .sp:last-child');
      await page.click('.tp.main');
      await page.waitForFunction((say) => document.querySelector('.coach:not(.hidden) .coach-text')?.textContent.startsWith(say.slice(0, 20)), failed.say, { timeout: 20000 });
      check(await page.locator('.coach .coach-count').count() === 0 && (!failed.ui || await page.locator('.topbar .coach-glow, .coach-glow').count() === 1),
        `${lv.id}: a failed run shows the on-failed step, its part lit`);
      if (failed.ui) await page.waitForSelector('.coach-dim.on');
      await page.click('.coach .coach-next');
      check((await page.textContent('.coach .coach-count')).trim() === `2 / ${seq.length}`, `${lv.id}: Got it goes back to the step it was on`);
      await page.evaluate(() => localStorage.removeItem('stacked-deck-coach'));
    }
  }

  // A one-step tutorial is a note: no count, no Skip; Got it puts it away.
  {
    const lv = LEVELS.find((l) => l.tutorial?.length === 1);
    if (lv) {
      await page.goto(`${base}?unlockall#/level/${lv.id}`);
      await page.waitForSelector('svg.board');
      check(await page.isVisible('.coach .coach-next') && (await page.textContent('.coach .coach-next')).trim() === 'Got it' &&
        await page.locator('.coach .coach-skip, .coach .coach-count').count() === 0, `${lv.id}: its note shows, with only Got it`);
      await page.click('.coach .coach-next');
      check(await page.locator('.coach.hidden').count() === 1, `${lv.id}: Got it puts the note away`);
      await page.goto(`${base}?unlockall#/level/${lv.id}/story`);
      await page.click('.story-actions .coach-again');
      await page.waitForSelector('svg.board');
      check(await page.isVisible('.coach .coach-next'), `${lv.id}: the story page's Replay tutorial shows the note again`);
      await page.evaluate(() => localStorage.removeItem('stacked-deck-coach'));
    }
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
      } finally {
        await page.close();
      }
    },
    async (check) => {
  // On a phone-sized screen, playing must not scroll the page away from the floor.
  {
    const phone = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    phone.on('pageerror', (e) => errors.push(e.message));
    await phone.goto(`${base}?unlockall#/level/even-money`);
    await phone.waitForSelector('svg.board');
    const sol = (await import(pathToFileURL(join(repo, 'solutions/levels/even-money.js')).href)).default;
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
    await phone.waitForFunction(() => (document.querySelector('.queue')?.scrollTop ?? 0) > 0, null, { timeout: 5000 }).catch(() => phone.waitForTimeout(1000));
    const y = await phone.evaluate(() => window.scrollY);
    check(y === y0, `playing on a phone keeps the page still (scrollY ${y0} -> ${y})`);
    if (shots) await phone.screenshot({ path: join(shots, '7-phone-playing.png') });
    if (!(await phone.locator('.modal.results').count())) await phone.click('.speeds .sp:last-child');
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
    await hand.evaluate((t) => Promise.all(t.getAnimations({ subtree: true }).map((a) => a.finished.catch(() => {}))));
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
    // Post-tap / sticky focus without an open break must not lift a card to the
    // front (which would hide the next ~4 cards behind it with --brk: 0).
    await tap([5, 5]);   // stop any lingering fling from the swipe above
    await hand.evaluate((t) => t.scrollIntoView({ block: 'center' }));
    await phone.waitForTimeout(150);
    const zCheck = await hand.evaluate((t) => {
      const a = t.children[1].querySelector('a.tile');
      a?.focus({ preventScroll: true });
      const res = { z: getComputedStyle(t.children[1]).zIndex, shown: t.querySelectorAll('.shown').length };
      a?.blur();
      return res;
    });
    check(zCheck.z === 'auto' && zCheck.shown === 0 && await after() === -1,
      `phone: non-keyboard focus does not lift a card in front of its neighbours with a closed break (${JSON.stringify(zCheck)})`);
    // Long-pressing and dragging along the bottom row (even across its break
    // gap, where the top row sits behind it) stays on the bottom row and never
    // pulls top-row cards in front.
    const b7 = await hand.locator(':scope > *').nth(7).boundingBox();
    const row1Pt = [b7.x + 12, b7.y + 70];
    await touch('touchStart', [row1Pt]);
    await phone.waitForSelector('.chapter[data-suit="c1"] .tiles.fan.browsing', { timeout: 3000 });
    const row1Seen = [await after()];
    let topRowPulled = false;
    for (let x = row1Pt[0]; row1Seen[row1Seen.length - 1] < 10 && x < row1Pt[0] + 280; x += 6) {
      await touch('touchMove', [[x, row1Pt[1]]]);
      await phone.waitForTimeout(20);
      const st = await hand.evaluate((t) => ({
        shown: [...t.children].findIndex((c) => c.classList.contains('shown')),
        topUp: [...t.children].slice(0, 7).some((c) => c.classList.contains('row-up') || c.classList.contains('shown')),
      }));
      if (st.topUp) topRowPulled = true;
      if (st.shown >= 0 && st.shown !== row1Seen[row1Seen.length - 1]) row1Seen.push(st.shown);
    }
    await touch('touchEnd', []);
    await phone.waitForTimeout(150);
    const rowZ = await hand.evaluate((t) => {
      const k = [...t.children].findIndex((c) => c.classList.contains('shown'));
      return k >= 0 && k + 1 < t.children.length ? [getComputedStyle(t.children[k]).zIndex, getComputedStyle(t.children[k + 1]).zIndex] : null;
    });
    check(!topRowPulled && row1Seen[0] === 7 && row1Seen.includes(8) && row1Seen.includes(9) && row1Seen.every((k) => k >= 7) &&
      rowZ && rowZ[0] === '20' && rowZ[1] === '20',
      `phone: dragging along the bottom row stays on the bottom row and keeps within-row stacking order (${row1Seen.join(',')}; z ${rowZ?.join('/')})`);
    // Mobile URL-bar height-only resize keeps the shown card and its break intact,
    // and tapping off afterwards still closes the break cleanly.
    const shownBeforeResize = await hand.evaluate((t) => [...t.children].findIndex((c) => c.classList.contains('shown')));
    await phone.setViewportSize({ width: 390, height: 780 });
    await phone.waitForTimeout(100);
    const shownAfterResize = await hand.evaluate((t) => [...t.children].findIndex((c) => c.classList.contains('shown')));
    await tap([5, 5]);
    check(shownBeforeResize >= 7 && shownAfterResize === shownBeforeResize && await after() === -1,
      `phone: height-only toolbar resize keeps the open break intact, and tapping off still closes it (${shownBeforeResize} -> ${shownAfterResize})`);
    // Narrow 360px phone still fans multiple cards per row (never 13 single-card rows), all inside the viewport.
    await phone.setViewportSize({ width: 360, height: 800 });
    await phone.waitForTimeout(100);
    const narrow = await hand.evaluate((t) => {
      const boxes = [...t.children].map((c) => c.getBoundingClientRect());
      return {
        rows: t._hand?.rowBounds.length ?? 0,
        allVisible: boxes.length === 13 && boxes.every((b) => b.width > 100 && b.left >= -1 && b.right <= innerWidth + 1),
      };
    });
    check(narrow.rows >= 2 && narrow.rows <= 3 && narrow.allVisible,
      `phone (360px): folded suit fans into ${narrow.rows} rows with all 13 cards visible inside the viewport`);
    await phone.close();
  }
    },
    async (check) => {
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
    const free = ROOMY.floor.filter((at) => !ROOMY.fixed.some((c) => c.at.join() === at.join()));
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
    check(await phone.isVisible('.picker') && await phone.locator('.picker-item').count() === ROOMY.croupiers.length,
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
    check(/ W$/.test(await phone.textContent('.picker-head')) && await phone.locator('.picker-head svg.arrow').count() === 1,
      `the picker says which way the first port will point ("${await phone.textContent('.picker-head')}")`);
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
    check(/^Pass/.test(await phone.textContent('.sel-bar')) && await phone.locator('.inspector .insp-head > button').count() === 0,
      'the bar on the floor names the croupier, and has its buttons (none left in the panel)');
    // With the play controls aside, the panel has play and step of its own.
    check(await phone.isVisible('.inspector .insp-tp .tp.main') && await phone.isVisible('.inspector .insp-tp .tp:not(.main)'),
      'phone: the panel of a selected croupier has play and step');
    await phone.tap('.sel-bar [data-act="done"]');
    check(await phone.locator('.cell.selected').count() === 0 && await phone.isVisible('.transport'),
      '✓ (done) deselects it and brings them back');
    // The floor moving under a finger that is down (selecting lays the page
    // out again, which can scroll it) doesn't move the croupier pressed: a
    // drag goes as far as the finger does from where it pressed the floor.
    {
      const p = await hexAt(free[0]);
      const ats = () => phone.evaluate(() => JSON.parse(localStorage.getItem('stacked-deck-v1')).levels['opening-night'].cells.map((c) => c.at.join()));
      const before = await ats();
      await touch('touchStart', [p]);
      await phone.evaluate(() => { document.querySelector('.board-wrap').style.marginTop = '150px'; });
      for (const dy of [10, 13, 16]) await touch('touchMove', [[p[0], p[1] - dy]]);
      await touch('touchEnd', []);
      await phone.evaluate(() => { document.querySelector('.board-wrap').style.marginTop = ''; });
      check(JSON.stringify(await ats()) === JSON.stringify(before), `the floor moving under a pressed croupier doesn't move it (${JSON.stringify(await ats())})`);
      if (await phone.isVisible('.sel-bar')) await phone.tap('.sel-bar [data-act="done"]');
      else await phone.keyboard.press('Escape');
    }
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
    // Just past the selected croupier's east edge (in the empty hex next to
    // it): a tap opens the picker there, leaving the port alone; a long press
    // opens the port menu for that side.
    const pastEdge = (d) => phone.evaluate(([[q, r], d]) => {
      const R = 50, svg = document.querySelector('svg.board');
      const x = R * Math.sqrt(3) * (q + r / 2) + Math.cos(d * Math.PI / 3) * R * 1.04, y = R * 1.5 * r + Math.sin(d * Math.PI / 3) * R * 1.04;
      const pt = new DOMPoint(x, y).matrixTransform(svg.getScreenCTM());
      return [pt.x, pt.y];
    }, [free[0], d]);
    await tap(await hexAt(free[0]));
    await tap(await pastEdge(0));
    check(await phone.isVisible('.picker') && await passOut() === 4 && await placed() === 1,
      `phone: a tap just past the selected croupier's edge, on an empty hex, opens the picker there (out ${await passOut()})`);
    await tapItem('pass');
    check(await placed() === 2 && await passOut() === 4, 'phone: and a croupier can be put down there');
    // Just past the edge on that neighbour: a long press opens the port menu
    // of the selected croupier, which stays selected; a tap selects the neighbour.
    const selAt = () => phone.evaluate(() => document.querySelector('.inspector .insp-at')?.textContent);
    await tap(await hexAt(free[0]));
    const firstAt = await selAt();
    await touch('touchStart', [await pastEdge(0)]);
    await phone.waitForTimeout(500);
    await touch('touchEnd', []);
    await phone.waitForTimeout(200);
    check(await phone.isVisible('.radial-hub') && /E/.test(await phone.textContent('.radial-hub')) && await selAt() === firstAt,
      `phone: a long press just past the edge, on a neighbour, opens the selected croupier's port menu (${await selAt()})`);
    await phone.keyboard.press('Escape');
    await tap(await pastEdge(0));
    check(await selAt() !== firstAt && await passOut() === 4 && await placed() === 2, `phone: and a tap there selects the neighbour (${firstAt} -> ${await selAt()})`);
    await tap(await undoAt());
    await tap(await hexAt(free[0]));
    await touch('touchStart', [await pastEdge(0)]);
    await phone.waitForTimeout(500);
    await touch('touchEnd', []);
    await phone.waitForTimeout(200);
    check(await phone.isVisible('.radial-hub') && /E/.test(await phone.textContent('.radial-hub')) && !(await phone.isVisible('.box-select:not(.hidden)')),
      'phone: a long press there opens the port menu for that side');
    await phone.keyboard.press('Escape');
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
    // ⧉ on a selected croupier picks up one copy. (The tap's click, which
    // lands on the group's bar now in its place, mustn't copy again.)
    {
      const count = () => phone.evaluate(() => JSON.parse(localStorage.getItem('stacked-deck-v1')).levels['opening-night'].cells.length);
      const n0 = await count();
      await tap(await hexAt(free[0]));
      const c = await phone.locator('.sel-bar [data-act="copy"]').boundingBox();
      await tap([c.x + c.width / 2, c.y + c.height / 2]);
      await phone.waitForTimeout(400);
      check(/^1 croupier/.test(await phone.textContent('.lift-bar').catch(() => '')) && await count() === n0,
        `phone: ⧉ on a selected croupier picks up one copy, putting nothing down (${await count() - n0} put down)`);
      await btn('delete');
    }
    // A tap on a croupier where its bar comes up selects it, and does
    // nothing else (the tap's click lands on the bar's ⟳, not there when the
    // finger pressed).
    {
      await tap(await hexAt(free[0]));
      const r = await phone.locator('.sel-bar [data-act="cw"]').boundingBox();
      const cw = [r.x + r.width / 2, r.y + r.height / 2];
      await phone.tap('.sel-bar [data-act="done"]');
      const pan = async (from, to) => {
        await touch('touchStart', [from]);
        for (let i = 1; i <= 8; i++) await touch('touchMove', [[from[0] + (to[0] - from[0]) * i / 8, from[1] + (to[1] - from[1]) * i / 8]]);
        await touch('touchEnd', []);
      };
      // (Panned from the floor's bottom-left corner, bare, and back from
      // where that corner went.)
      const b = await phone.locator('svg.board').boundingBox();
      const p = await hexAt(free[0]), corner = [b.x + 3, b.y + b.height - 3];
      const moved = [corner[0] + cw[0] - p[0], corner[1] + cw[1] - p[1]];
      await pan(corner, moved);
      const q = await hexAt(free[0]);
      const was = await passCell();
      await tap(q);
      await phone.waitForTimeout(400);
      check(Math.hypot(q[0] - cw[0], q[1] - cw[1]) < 8 && await phone.locator('.cell.selected').count() === 1 && JSON.stringify(await passCell()) === JSON.stringify(was),
        `phone: a tap on a croupier under where its bar comes up only selects it (${q.map(Math.round)} vs ⟳ at ${cw.map(Math.round)}; out ${was.out.out} -> ${(await passCell()).out.out})`);
      await phone.tap('.sel-bar [data-act="done"]');
      await pan(moved, corner);
    }
    // A long press on a croupier picks it up; held and dragged, a box grows
    // from it (so croupiers packed together can be picked up).
    const btnX = async () => { const r = await phone.locator('.lift-bar [data-act="place"]').boundingBox(); await tap([r.x + r.width / 2, r.y + r.height / 2]); };
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
        // Tapped again, or tapped on what it shows, it closes, and that is all.
        await tap(more);
        await phone.waitForTimeout(100);
        check(!(await phone.isVisible('.peek')) && await phone.locator('.cell.selected').count() === 0 && await watching(),
          'a second tap on the stack closes it, and does nothing else');
        await tap(more);
        await phone.waitForTimeout(100);
        const pk = await phone.locator('.peek:not(.hidden)').boundingBox();
        if (pk) await tap([pk.x + pk.width / 2, pk.y + pk.height / 2]);
        await phone.waitForTimeout(100);
        check(!!pk && !(await phone.isVisible('.peek')) && await phone.locator('.cell.selected').count() === 0 && !(await phone.isVisible('.picker')) && await watching(),
          'a tap on the shown stack closes it, and does nothing to the floor under it');
      }
      const shoeAt = await hexAt(sa);
      await tap([shoeAt[0], shoeAt[1] - 12]); // the shoe's chip, above its deck label
      check(await phone.locator('.cell.selected').count() === 1 && await watching() && await phone.isVisible('.inspector h3') && await phone.isVisible('.transport'),
        'play mode: a tap selects a croupier and shows its panel, staying in play mode with the play controls');
      const cw = await phone.locator('.sel-bar [data-act="cw"]').boundingBox();
      await tap([cw.x + cw.width / 2, cw.y + cw.height / 2]);
      check(!(await watching()) && (await phone.evaluate((id) => JSON.parse(localStorage.getItem('stacked-deck-v1')).levels[id].cells, lvH.id))[0].out === 1,
        'the selected croupier\'s ⟳ on the floor turns it; editing it leaves play mode');
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
      await tap([pb.x + pb.width / 2, pb.y + pb.height / 2]);
      check(!(await phone.isVisible('.peek')) && await phone.locator('.cell.selected').count() === 0, 'tapping it again closes it, selecting nothing');
      // Its list, shortest first; the pad adds to it (twice NW is NWx2)
      // without bringing up the keyboard; a tapped entry can be taken out.
      const dealAt = await hexAt(at);
      await tap([dealAt[0], dealAt[1] - 12]);
      await phone.waitForSelector('.inspector .list-field.deal');
      const dealTo = async () => (await phone.evaluate((id) => JSON.parse(localStorage.getItem('stacked-deck-v1')).levels[id].cells, dealer.id))[0].out.to;
      const listText = () => phone.getAttribute('.inspector .list-field', 'data-text');
      check(await listText() === '(E SE)x6', `${dealer.id}: the Deal list reads (E SE)x6 ("${await listText()}")`);
      await phone.tap('.lf-pad-side[data-side="4"]');
      await phone.tap('.lf-pad-side[data-side="4"]');
      check(await listText() === '(E SE)x6 NWx2' && JSON.stringify(await dealTo()) === JSON.stringify([0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 4, 4]) &&
        await phone.evaluate(() => !document.activeElement?.matches('input, textarea')), 'the pad adds NW twice as NWx2, keyboard down');
      await phone.tap('.lf-chips [data-i="4"]');
      check(await phone.locator('.lf-chips .lf-e.sel').count() === 1 && await phone.evaluate(() => !document.activeElement?.matches('input, textarea')),
        'a tap on an entry selects it, keyboard down');
      if (shots) await phone.locator('.inspector').screenshot({ path: join(shots, '7e-phone-deal-list.png') });
      await phone.tap('.lf-ctx .stepper-n');
      await phone.fill('.lf-ctx .stepper-in', '5');
      await phone.tap('.lf-chips [data-i="1"]');
      check(await listText() === '(E SE)x6 NWx5', `tapping another entry commits an open count edit ("${await listText()}")`);
      await phone.tap('.lf-chips [data-i="4"]');
      await phone.tap('.lf-ctx .stepper-n');
      await phone.fill('.lf-ctx .stepper-in', '9');
      await phone.tap('.lf-ctx .lf-del');
      check(await listText() === '(E SE)x6' && (await dealTo()).length === 12 &&
        await phone.isVisible('.lf-caret.on') && !(await phone.locator('.lf-text.typing').count()) &&
        await phone.evaluate(() => !document.activeElement?.matches('input, textarea')),
      `✕ takes out the selected entry, keeping the keyboard down with the passive insertion mark ("${await listText()}")`);
      // A tap just inside the group opens the keyboard and scrolls the edit box
      // to the top of the screen so the pad stays clear; tapping the pad while
      // typing adds at the cursor and keeps the cursor and keyboard active.
      const e0 = await phone.locator('.lf-chips [data-i="1"]').boundingBox();
      await tap([e0.x - 1, e0.y + e0.height / 2]);
      await phone.waitForTimeout(350);
      const topAfterGap = await phone.evaluate(() => document.querySelector('.lf-text').getBoundingClientRect().top);
      check(await phone.evaluate(() => document.activeElement?.classList.contains('lf-type')) &&
        await phone.locator('.lf-text.typing').count() === 1 && !(await phone.isVisible('.lf-caret.on')) &&
        topAfterGap >= 20 && topAfterGap <= 60,
      `a tap in a gap focuses the typing box and scrolls the edit box to the top (top ${topAfterGap.toFixed(0)}px)`);
      await phone.tap('.lf-pad-side[data-side="3"]');
      check(await listText() === '(W E SE)x6' &&
        await phone.locator('.lf-text.typing').count() === 1 && !(await phone.isVisible('.lf-caret.on')) &&
        await phone.evaluate(() => document.activeElement?.classList.contains('lf-type')),
      `a tap in the group, then the pad: added at the cursor while keeping the cursor and keyboard active ("${await listText()}")`);
    }
    // A shoe's card pad on a phone: vertical swipes scroll the page without
    // adding a card; horizontal or diagonal starts lock out scrolling for runs,
    // corner-to-corner decks and dragging off the pad to cancel.
    const shoeLv = LEVELS.find((lv) => lv.croupiers.includes('shoe'));
    if (shoeLv) {
      const at = shoeLv.floor.find((x) => !shoeLv.fixed.some((c) => c.at.join() === x.join()));
      await phone.evaluate(([id, at]) => {
        const s = JSON.parse(localStorage.getItem('stacked-deck-v1') || '{"levels":{}}');
        s.levels[id] = { cells: [{ at, kind: 'shoe', out: 0, deck: ['JC'] }] };
        localStorage.setItem('stacked-deck-v1', JSON.stringify(s));
      }, [shoeLv.id, at]);
      await phone.goto(`${base}?unlockall#/level/${shoeLv.id}`);
      await phone.reload();
      await phone.waitForSelector('svg.board');
      const shoeAt = await hexAt(at);
      await tap([shoeAt[0], shoeAt[1] - 12]);
      await phone.waitForSelector('.inspector .list-field.shoe');
      const listText = () => phone.getAttribute('.inspector .list-field', 'data-text');
      await phone.locator('.lf-grid').scrollIntoViewIfNeeded();
      await phone.waitForTimeout(100);
      const pKeyAt = async (c) => { const r = await phone.locator(`.lf-grid [data-card="${c}"]`).boundingBox(); return [r.x + r.width / 2, r.y + r.height / 2]; };
      // Vertical drag (|dy| > |dx|): scrolls the page, adds nothing.
      const sy0 = await phone.evaluate(() => scrollY);
      const ks0 = await pKeyAt('5D');
      await touch('touchStart', [ks0]);
      for (let i = 1; i <= 6; i++) { await touch('touchMove', [[ks0[0] + 2, ks0[1] - i * 24]]); await phone.waitForTimeout(16); }
      await phone.waitForTimeout(100);
      await touch('touchEnd', []);
      await phone.waitForTimeout(150);
      const sy1 = await phone.evaluate(() => scrollY);
      check(sy1 - sy0 > 30 && await listText() === 'JC', `phone: a vertical drag on the card pad scrolls without adding a card (scroll ${sy0.toFixed(0)} -> ${sy1.toFixed(0)}, "${await listText()}")`);
      // Horizontal drag (|dx| >= |dy|): locks scrolling and adds the run.
      const sy2 = await phone.evaluate(() => scrollY);
      const [p2s, p5s] = [await pKeyAt('2S'), await pKeyAt('5S')];
      await touch('touchStart', [p2s]);
      for (let i = 1; i <= 6; i++) {
        await touch('touchMove', [[p2s[0] + (p5s[0] - p2s[0]) * i / 6, p2s[1] + 10 * i / 6]]);
        await phone.waitForTimeout(16);
      }
      await touch('touchEnd', []);
      await phone.waitForTimeout(150);
      check(Math.abs((await phone.evaluate(() => scrollY)) - sy2) < 2 && await listText() === 'JC 2S-5S',
        `phone: a horizontal drag on the card pad locks scrolling and adds the run ("${await listText()}")`);
      // Diagonal corner-to-corner drag (|dx| >= |dy|): locks scrolling and adds a deck.
      const sy3 = await phone.evaluate(() => scrollY);
      const [pas, pkh] = [await pKeyAt('AS'), await pKeyAt('KH')];
      await touch('touchStart', [pas]);
      for (let i = 1; i <= 8; i++) {
        await touch('touchMove', [[pas[0] + (pkh[0] - pas[0]) * i / 8, pas[1] + (pkh[1] - pas[1]) * i / 8]]);
        await phone.waitForTimeout(16);
      }
      await touch('touchEnd', []);
      await phone.waitForTimeout(150);
      check(Math.abs((await phone.evaluate(() => scrollY)) - sy3) < 2 && await listText() === 'JC 2S-5S deck',
        `phone: a corner-to-corner drag on the card pad adds a new deck without scrolling ("${await listText()}")`);
      // Horizontal start, then dragged off the pad: locks scrolling and cancels on release.
      const sy4 = await phone.evaluate(() => scrollY);
      const [padA, padFour] = [await pKeyAt('AD'), await pKeyAt('4D')];
      const gb = await phone.locator('.lf-grid').boundingBox();
      await touch('touchStart', [padA]);
      for (let i = 1; i <= 4; i++) {
        await touch('touchMove', [[padA[0] + (padFour[0] - padA[0]) * i / 4, padA[1]]]);
        await phone.waitForTimeout(16);
      }
      await touch('touchMove', [[padFour[0], gb.y + gb.height + 24]]);
      await phone.waitForTimeout(30);
      const cancelTip = await phone.textContent('.lf-pad-tip.cancel').catch(() => '');
      const runLit = await phone.locator('.lf-key.lf-run').count();
      await touch('touchEnd', []);
      await phone.waitForTimeout(150);
      check(cancelTip === 'Release to cancel' && runLit === 0 && Math.abs((await phone.evaluate(() => scrollY)) - sy4) < 2 && await listText() === 'JC 2S-5S deck',
        `phone: dragging off the card pad cancels the run without scrolling ("${cancelTip}", "${await listText()}")`);
      if (shots) await phone.locator('.inspector').screenshot({ path: join(shots, '7g-phone-shoe-passive-caret.png') });
      // Tapping in a gap in .lf-chips opens the cursor/keyboard, and tapping a
      // card on the pad inserts at the cursor while keeping cursor & keyboard up.
      await phone.locator('.lf-chips').scrollIntoViewIfNeeded();
      await phone.waitForTimeout(50);
      const jcBox = await phone.locator('.lf-chips [data-i="0"]').boundingBox();
      await tap([jcBox.x + 1, jcBox.y + jcBox.height / 2]);
      await phone.waitForTimeout(350);
      await phone.tap('.lf-grid [data-card="9H"]');
      check(await listText() === '9H JC 2S-5S deck' &&
        await phone.locator('.lf-text.typing').count() === 1 &&
        await phone.evaluate(() => document.activeElement?.classList.contains('lf-type')),
      `phone: tapping a card on the pad while typing inserts at the cursor and keeps cursor & keyboard active ("${await listText()}")`);
    }
    await phone.close();
  }
  check(dealLabel([1, 2, 3, 4, 5, 6]).text === '1-6' && dealLabel([1, 2, 4, 5, 6, 9]).text === '1·2·4-6·9' &&
    dealLabel([1, 3, 5, 7, 9, 11], 26).text === '1·3·…' && dealLabel([1, 3, 5, 7, 9, 11], 20).text === '1·…', 'Deal labels collapse runs, then cut the tail');
    },
    async (check) => {
      const { page, hexPoint, clickHex } = await makeDesktopPage();
      try {
  // Pointing ports: only required ports start with a side (and have no
  // floor option); selecting starts at the first port; each direction key
  // points the active port and moves on; Ctrl+Z goes back a port; a long
  // press (or a Ctrl-click) on an edge opens a menu of the ports; Ctrl+wheel
  // moves the active port.
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
    // A Ctrl-click on an edge opens the menu at once; Ctrl+wheel moves the
    // active port along (and a wheel without Ctrl still zooms).
    await page.keyboard.down('Control');
    await page.mouse.click(ex, ey);
    const ctrlMenu = await page.isVisible('.radial-hub');
    await page.keyboard.up('Control');
    cs = await cellsNow();
    check(ctrlMenu && cs.find(at(free[1])).out.yes === 2, 'a Ctrl-click on an edge opens the port menu, pointing nothing');
    await page.keyboard.press('Escape');
    const activeTag = () => page.textContent('.inspector .port-row.active .port-tag');
    const [hx, hy] = await hexPoint(free[1], 0, 0.3);
    await page.mouse.move(hx, hy);
    const before = await activeTag();
    await page.keyboard.down('Control');
    await page.mouse.wheel(0, 100);
    await page.waitForTimeout(50);
    const after = await activeTag();
    await page.mouse.wheel(0, -100);
    await page.waitForTimeout(50);
    const back = await activeTag();
    await page.keyboard.up('Control');
    check(before !== after && back === before, `Ctrl+wheel moves the active port along and back (${before}, ${after}, ${back})`);
    // With a mouse the edge zones stop at the hex: just outside its east
    // edge (in the empty hex next to it) a long press opens no menu, and
    // letting go opens the picker there, leaving the ports alone.
    const [ox, oy] = await hexPoint(free[1], 0, 1.2);
    const outBefore = JSON.stringify(cs.find(at(free[1])).out);
    await page.mouse.move(ox, oy);
    await page.mouse.down();
    await page.waitForTimeout(650);
    const noMenu = !(await page.isVisible('.radial-hub'));
    await page.mouse.up();
    cs = await cellsNow();
    check(noMenu && JSON.stringify(cs.find(at(free[1])).out) === outBefore && await page.isVisible('.picker'),
      `with a mouse, a press just outside the selected croupier's edge acts on the next hex: no port menu, and the picker opens there (${JSON.stringify(cs.find(at(free[1])).out)})`);
    await page.keyboard.press('Escape');
  }

  // Placing from the floor with a mouse and keys: a click on an empty hex
  // opens the picker (a number key or a click picks); pointing at an empty
  // hex near an edge and pressing a number places that croupier pointing
  // there. Then groups: a Shift-drag box picks them up; ] turns them and M
  // mirrors them (positions and ports; facing is left alone, see
  // test/transform.js); direction keys move them; put down, they take the
  // place of croupiers under them, and any off the floor are deleted; copy,
  // delete, a mouse drag; each put-down is one undo step.
  // [ ] and M turn and mirror a single selected croupier, as does its bar on the
  // floor (with ⇵ and Shift+M top to bottom); Shift-clicks pick up several.
  {
    // The first floor with these croupiers and room for the checks below.
    const key = ([q, r]) => `${q},${r}`;
    const freeRow = (l) => {
      const fixed = new Set(l.fixed.map((c) => key(c.at)));
      const buildable = new Set(l.floor.map(key).filter((k) => !fixed.has(k)));
      return l.floor.map(([q, r]) => [[q, r], [q + 1, r], [q + 2, r]]).find((hs) => hs.every((x) => buildable.has(key(x))) &&
        hs.every(([q, r]) => DIRS.every(([dq, dr]) => buildable.has(key([q + dq, r + dr])) || hs.some((x) => key(x) === key([q + dq, r + dr])))));
    };
    // (Acey-Deucey, as this was written for: its free row is in the middle of
    // a wide floor, away from the controls over the board's edges; else the
    // first floor that fits.)
    const lv = [L.ALL_LEVELS.find((l) => l.id === 'acey-deucey'), ...LEVELS].find((l) => l && ['straight', 'war', 'pass'].every((t) => l.croupiers.includes(t)) && freeRow(l));
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
    // Shift+M, or ⇵, mirrors it top to bottom: SE and NE swap, SW and NW.
    const flipped = (v) => [v[0] + v[1], -v[1]];
    for (const how of ['Shift+M', '⇵']) {
      await shiftBox();
      if (how === 'Shift+M') await page.keyboard.press('Shift+M'); else await page.click('.lift-bar [data-act="flip"]');
      await page.keyboard.press('Enter');
      cs = await cellsNow();
      check(off(cs, 'straight', 'war').join() === flipped(off(orig, 'straight', 'war')).join() &&
        findFn(cs, 'pass').out.out === 0 && findFn(cs, 'war').out.win === 4 && findFn(cs, 'war').dealer === (6 - findFn(orig, 'war').dealer) % 6,
      `${how} then Enter mirrors the group top to bottom, positions and ports (${JSON.stringify(cs.map((c) => [c.fn, c.at, c.out]))})`);
      await page.keyboard.press('Control+z');
    }
    // Moved onto the player (west, a hex at a time): the ones off the floor
    // show red; put down, they are deleted, and undo brings them back.
    const south = ([q, r]) => [q, r + 1];
    const ats = (list) => list.map((c) => c.at.join()).sort().join(' ');
    const liftN = async () => (await page.textContent('.lift-bar').catch(() => '')).match(/^\d+/)?.[0];
    const westToRed = async () => { for (let i = 0; !(await page.locator('.lift-bar.bad').count()) && i < 12; i++) await page.keyboard.press('a'); };
    await shiftBox();
    await westToRed();
    const reds = await page.locator('.board .cell.lifted.bad').count();
    check(reds > 0 && await page.locator('.lift-bar.bad').count() === 1 && !(await page.locator('.lift-bar [data-act="place"]').isDisabled()),
      `moved off the floor, those ones show red, and ✓ is still on (${reds} red)`);
    await page.keyboard.press('Enter');
    cs = await cellsNow();
    check(!(await page.isVisible('.lift-bar')) && cs.length === 3 - reds, `Enter puts the group down, deleting the red ones (${cs.length} croupiers left)`);
    await page.keyboard.press('Control+z');
    check(JSON.stringify(await cellsNow()) === JSON.stringify(orig), 'and one undo brings it all back');
    // Put down on another croupier, one takes its place.
    await clickHex(row[0]);
    await page.keyboard.press('Escape');
    await page.keyboard.down('Shift');
    await clickHex(row[0]);
    await page.keyboard.up('Shift');
    const arrowsN = await page.locator('.board .l-arrows .arrows').count(); // (not the one picked up)
    await page.keyboard.press('d');
    check(await liftN() === '1' && await page.locator('.lift-bar.bad').count() === 0, 'one croupier moved onto another is not red');
    // It is drawn over everything there, the other's ports hidden, and
    // marked with what it would replace.
    check(await page.locator('.board .l-lift .cell.lifted.covers').count() === 1 && await page.locator('.board .l-lift .arrows').count() === 1 &&
      await page.locator('.board .l-arrows .arrows').count() === arrowsN - 1 &&
      /replaces PASS/.test(await page.textContent('.board .cover-tag text').catch(() => '')) && /replaces 1/.test(await page.textContent('.lift-bar')),
    `it floats over the croupier under it, marked "${await page.textContent('.board .cover-tag text').catch(() => '')}", the bar "${await page.textContent('.lift-bar .lift-n')}" (${[
      await page.locator('.board .l-lift .cell.lifted.covers').count(), await page.locator('.board .l-lift .arrows').count(), arrowsN, await page.locator('.board .l-arrows .arrows').count()].join(' ')})`);
    if (shots) await page.screenshot({ path: join(shots, '15-group-covers.png') });
    await page.keyboard.press('Escape');
    cs = await cellsNow();
    check(cs.length === 2 && cs.find(at(row[1]))?.fn === 'straight' && !cs.find(at(row[0])),
      `Esc puts it down, in place of the croupier under it (${JSON.stringify(cs.map((c) => [c.fn, c.at]))})`);
    await page.keyboard.press('Control+z');
    check(JSON.stringify(await cellsNow()) === JSON.stringify(orig), 'and undo brings that one back');
    // Copy: the group goes down, and a copy of it is picked up, off to the
    // nearest place it fits. It's an ordinary group: another croupier can be
    // added to it and put down again.
    await shiftBox();
    await page.click('.lift-bar [data-act="copy"]');
    check(await liftN() === '3' && await page.locator('.lift-bar.bad').count() === 0 && (await cellsNow()).length === 3, `⧉ picks up a copy (${await liftN()} croupiers up)`);
    await clickHex(row[0]);
    check(await liftN() === '4' && await page.locator('.lift-bar.bad').count() === 0 && await page.locator('.board .cell.lifted.bad').count() === 0,
      `a croupier added to the copy goes up with it, not red (${await liftN()} croupiers up)`);
    await clickHex(row[0]);
    check(await liftN() === '3' && JSON.stringify(await cellsNow()) === JSON.stringify(orig), 'and a tap on it puts it down again');
    await page.click('.lift-bar [data-act="place"]');
    check((await cellsNow()).length === 6 && !(await page.isVisible('.lift-bar')), `⧉ then ✓ copies the group (${(await cellsNow()).length} croupiers)`);
    await page.keyboard.press('Control+z');
    check(JSON.stringify(await cellsNow()) === JSON.stringify(orig), 'one undo takes the copy away');
    // ⧉, then a croupier picked from the palette: the copy goes down where it floats.
    await shiftBox();
    await page.click('.lift-bar [data-act="copy"]');
    await page.click('.pal-item[data-tool="pass"]');
    check(!(await page.isVisible('.lift-bar')) && (await cellsNow()).length === 6,
      `⧉, then a croupier picked from the palette: the copy goes down (${(await cellsNow()).length} croupiers)`);
    await page.keyboard.press('Escape');
    await page.keyboard.press('Control+z');
    // Moved, then copied: put down where it was moved to, with a copy up;
    // ⧉ again stamps another; Delete deletes just the copy up.
    {
      await shiftBox();
      await page.keyboard.press('c'); // a hex south-east
      await page.click('.lift-bar [data-act="copy"]');
      const placed = await cellsNow();
      check(ats(placed) === ats(row.map((x) => ({ at: south(x) }))) && await liftN() === '3',
        `moved then ⧉: the group goes down where it was moved, and a copy is up (${ats(placed)})`);
      await page.click('.lift-bar [data-act="copy"]');
      check((await cellsNow()).length === 6 && await liftN() === '3', `⧉ again stamps another copy (${(await cellsNow()).length} croupiers)`);
      await page.keyboard.press('Delete');
      check((await cellsNow()).length === 6 && !(await page.isVisible('.lift-bar')), 'Delete deletes the copy that is up, keeping the ones put down');
      await page.keyboard.press('Control+z');
      await page.keyboard.press('Control+z');
      check(JSON.stringify(await cellsNow()) === JSON.stringify(orig), 'two undos put it all back');
    }
    // A tap on one of the group puts just that one down, where it is; the
    // rest stay up. A red one tapped is deleted.
    {
      await shiftBox();
      await page.keyboard.press('c');
      await clickHex(south(row[0]));
      let now = await cellsNow();
      check(now.length === 3 && now.find(at(south(row[0])))?.fn === 'straight' && now.find(at(row[1])) && now.find(at(row[2])) && await liftN() === '2',
        `moved, then one tapped: it goes down where it was moved to, the rest still up (${ats(now)})`);
      await page.keyboard.press('Escape');
      now = await cellsNow();
      check(ats(now) === ats(row.map((x) => ({ at: south(x) }))), `Esc then puts the rest down there too (${ats(now)})`);
      await page.keyboard.press('Control+z');
      await page.keyboard.press('Control+z');
      check(JSON.stringify(await cellsNow()) === JSON.stringify(orig), 'two undos put them back');
      // Moved, then a croupier picked from the palette: the group goes down
      // where it was moved to.
      await shiftBox();
      await page.keyboard.press('c');
      await page.click('.pal-item[data-tool="pass"]');
      const left = await cellsNow();
      check(!(await page.isVisible('.lift-bar')) && await page.locator('.pal-item.on[data-tool="pass"]').count() === 1 &&
        ats(left) === ats(row.map((x) => ({ at: south(x) }))),
        `moved, then a croupier picked from the palette: the group stays where it was moved to (${ats(left)})`);
      await page.keyboard.press('Escape');
      await page.keyboard.press('Control+z');
      check(JSON.stringify(await cellsNow()) === JSON.stringify(orig), 'one undo puts them back');
      // Moved, then undo: undo takes back the move, and redo brings it back.
      await shiftBox();
      await page.keyboard.press('c');
      await page.keyboard.press('Control+z');
      const undone = JSON.stringify(await cellsNow()) === JSON.stringify(orig) && !(await page.isVisible('.lift-bar'));
      await page.keyboard.press('Control+y');
      check(undone && JSON.stringify(await cellsNow()) === JSON.stringify(left), 'moved, then undo takes back just the move, and redo brings it back');
      await page.keyboard.press('Control+z');
      // A red one tapped is deleted; the rest stay up.
      await shiftBox();
      await westToRed();
      const red = await page.locator('.board .cell.lifted.bad').first().getAttribute('data-at');
      await clickHex(red.split(',').map(Number));
      check(await liftN() === '2' && (await cellsNow()).length === 2, `a red one tapped is deleted (${await liftN()} still up, ${(await cellsNow()).length} on the floor)`);
      await page.keyboard.press('Delete');
      await page.keyboard.press('Control+z');
      await page.keyboard.press('Control+z');
      check(JSON.stringify(await cellsNow()) === JSON.stringify(orig), 'and undo brings it back');
      // Of a copy, one tapped goes down; the rest stay up.
      await shiftBox();
      await page.click('.lift-bar [data-act="copy"]');
      const k = await page.locator('.board .cell.lifted').first().getAttribute('data-at');
      await clickHex(k.split(',').map(Number));
      check((await cellsNow()).length === 4 && await liftN() === '2', `one of a copy tapped goes down (${(await cellsNow()).length} croupiers)`);
      await page.keyboard.press('Escape');
      check((await cellsNow()).length === 6, 'Esc puts the rest of the copy down');
      await page.keyboard.press('Control+z');
      await page.keyboard.press('Control+z');
      check(JSON.stringify(await cellsNow()) === JSON.stringify(orig), 'and two undos take them away');
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
    await page.click('.lift-bar [data-act="place"]');
    cs = await cellsNow();
    check(findFn(cs, 'pass').at.join() === dest.join() && findFn(cs, 'straight').at.join() === [row[0][0], row[0][1] + 1].join(),
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
    // Shift held down: each click adds one more to the group, with the selected one.
    await clickHex(row[0]);
    check(await page.isVisible('.sel-bar') && !(await page.isVisible('.lift-bar')), 'a selected croupier has its own bar on the floor');
    await page.keyboard.down('Shift');
    await clickHex(row[1]);
    await clickHex(row[2]);
    await page.keyboard.up('Shift');
    check(/^3 croupiers/.test(await page.textContent('.lift-bar').catch(() => '')) && !(await page.isVisible('.sel-bar')),
      `Shift-clicks pick up the selected croupier and each one clicked ("${await page.textContent('.lift-bar').catch(() => '')}")`);
    await page.keyboard.press('Escape');
    // [ ] on one selected croupier.
    await clickHex(row[2]);
    await page.keyboard.press(']');
    const war1 = (await cellsNow()).find(at(row[2]));
    check(war1.out.win === (war0.out.win + 1) % 6 && war1.dealer === (war0.dealer + 1) % 6 && war1.facing === undefined, `] turns a selected croupier (${JSON.stringify(war1)})`);
    await page.click('.sel-bar [data-act="mirror"]');
    const war2 = (await cellsNow()).find(at(row[2]));
    check(war2.out.win === (9 - war1.out.win) % 6 && war2.dealer === (9 - war1.dealer) % 6, `⇋ mirrors a selected croupier (${JSON.stringify(war2)})`);
    await page.click('.sel-bar [data-act="flip"]');
    const war3 = (await cellsNow()).find(at(row[2]));
    await page.keyboard.press('Shift+M');
    const war4 = (await cellsNow()).find(at(row[2]));
    check(war3.out.win === (6 - war2.out.win) % 6 && war3.dealer === (6 - war2.dealer) % 6 && JSON.stringify(war4) === JSON.stringify(war2),
      `⇵ and Shift+M mirror a selected croupier top to bottom (${JSON.stringify([war3, war4])})`);
    check(await page.locator('.inspector .insp-head [data-act], .inspector [aria-label^="Turn"]').count() === 0, 'turning and mirroring are on the floor, not in the panel');
    await page.keyboard.press('Escape');
    check(!(await page.isVisible('.sel-bar')), 'deselected, the bar goes');
    // Dragged onto another croupier, one takes its place (marked while it
    // is dragged), as a group put down does; one undo brings the other back.
    {
      const before = await cellsNow();
      const [a, b] = [before.find(at(row[0])), before.find(at(row[1]))];
      const [ax, ay] = await hexPoint(row[0]), [bx, by] = await hexPoint(row[1]);
      await page.mouse.move(ax, ay);
      await page.mouse.down();
      await page.mouse.move(bx, by, { steps: 6 });
      const tag = await page.textContent('.board .cover-tag text').catch(() => '');
      const marked = await page.locator('.board .hex.drop.covers').count() === 1;
      await page.mouse.up();
      const after = await cellsNow();
      check(marked && /^replaces \S/.test(tag) && after.length === before.length - 1 && after.find(at(row[1]))?.fn === a.fn && !after.find(at(row[0])),
        `a croupier dragged onto another replaces it, marked "${tag}" on the way (${JSON.stringify(after.map((c) => [c.fn, c.at]))})`);
      await page.keyboard.press('Control+z');
      check(JSON.stringify(await cellsNow()) === JSON.stringify(before), 'one undo brings the other back');
      await page.keyboard.press('Escape');
      // So does a new one dragged from the palette.
      const pal = await page.locator('.pal-item[data-tool="pass"]').boundingBox();
      await page.mouse.move(pal.x + pal.width / 2, pal.y + pal.height / 2);
      await page.mouse.down();
      await page.mouse.move(ax, ay, { steps: 8 });
      const palTag = await page.textContent('.board .cover-tag text').catch(() => '');
      await page.mouse.up();
      const placed = await cellsNow();
      check(/^replaces \S/.test(palTag) && placed.length === before.length && placed.find(at(row[0]))?.fn === 'pass',
        `a croupier dragged from the palette onto another replaces it, marked "${palTag}" (${JSON.stringify(placed.map((c) => [c.fn, c.at]))})`);
      await page.keyboard.press('Control+z');
      check(JSON.stringify(await cellsNow()) === JSON.stringify(before), 'and one undo brings it back');
      await page.keyboard.press('Escape');
    }
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
      } finally {
        await page.close();
      }
    },
    async (check) => {
      const { page, hexPoint, clickHex } = await makeDesktopPage();
      try {
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
    // The deck typed into the Text view, which puts it into the list when it
    // is left (and stays open while it has a mistake).
    const setDeck = async (text) => {
      if (!(await page.$('.inspector .list-field.as-text'))) await page.click('.inspector [data-view="text"]');
      await page.fill('.lf-textarea', text);
      await page.locator('.lf-textarea').evaluate((el) => el.blur()); // so keys go to the editor again
      if (!(await page.$('.lf-status.bad'))) await page.click('.inspector [data-view="cards"]');
    };
    const listText = () => page.getAttribute('.inspector .list-field', 'data-text');
    const savedDeck = async () => (await page.evaluate((id) => JSON.parse(localStorage.getItem('stacked-deck-v1')).levels[id].cells, lv.id)).find((c) => c.kind === 'shoe')?.deck;
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
    // The deck is text over several lines, with shorthand: runs (xN), suit
    // runs (AH-KH), whole suits and decks, repeated groups.
    await setDeck('AS\nKH\r\n10C x2');
    check(JSON.stringify(await savedDeck()) === JSON.stringify(['AS', 'KH', 'TC', 'TC']) && !(await page.$('.lf-status.bad')), `${lv.id}: a deck over several lines, with 10C x2`);
    check(await listText() === 'AS\nKH\nTCx2', `leaving the Text view tidies it, keeping its lines ("${await listText()}")`);
    await setDeck('(2h-4h)x2 S deck');
    check((await savedDeck())?.length === 6 + 13 + 52, `${lv.id}: a deck with a repeated group, a suit and a new deck (${(await savedDeck())?.length} cards)`);
    // The pad: a drag along a suit adds its run, a card twice is x2.
    const keyAt = async (c) => { const r = await page.locator(`.lf-grid [data-card="${c}"]`).boundingBox(); return [r.x + r.width / 2, r.y + r.height / 2]; };
    await page.mouse.move(...await keyAt('AD'));
    await page.mouse.down();
    await page.mouse.move(...await keyAt('KD'), { steps: 6 });
    check(await page.locator('.lf-key.lf-run').count() === 13, 'dragging along a suit on the pad marks the run');
    await page.mouse.up();
    await page.click('.lf-grid [data-card="QS"]');
    await page.click('.lf-grid [data-card="QS"]');
    check((await listText()).endsWith('deck AD-KD QSx2') && (await savedDeck())?.length === 6 + 13 + 52 + 13 + 2, `the shoe's pad adds AD-KD and QSx2 ("${await listText()}")`);
    if (shots) await page.locator('.inspector .param.col').screenshot({ path: join(shots, '9b-shoe-list.png') });
    // Typing: an entry is added on Space; a mistake stays in the typing box
    // and the deck keeps its cards; undo takes back whole entries.
    const field = await page.locator('.lf-chips').boundingBox();
    await page.mouse.click(field.x + field.width - 4, field.y + field.height - 6);
    await page.keyboard.type('10h ');
    check((await listText()).endsWith('QSx2 TH') && (await savedDeck())?.length === 87, `typing 10h and a space adds 10♥ ("${await listText()}")`);
    await page.keyboard.type('qx ');
    check(/"QX" is not a card/.test(await page.textContent('.lf-status')) && (await savedDeck())?.length === 87 && await page.inputValue('.lf-type') === 'qx',
      'a mistake is reported, stays in the box, and the shoe keeps its deck');
    await page.keyboard.press('Escape');
    await page.keyboard.press('Control+z');
    check((await listText()).endsWith('QSx2') && (await savedDeck())?.length === 86 && !(await page.$('.lf-status.bad')), 'Esc drops it; Ctrl+Z takes back the last entry');
    // Backspace after a count takes just the count; ArrowRight off the end
    // of what is typed adds it.
    await page.keyboard.type('x3 ');
    await page.keyboard.press('Backspace');
    check((await listText()).endsWith('deck AD-KD QS'), `Backspace after QSx3 leaves QS ("${await listText()}")`);
    await page.keyboard.type('5h');
    await page.keyboard.press('ArrowRight');
    check((await listText()).endsWith('QS 5H') && await page.inputValue('.lf-type') === '', `ArrowRight off the end of "5h" adds it ("${await listText()}")`);
    for (let i = 0; i < 3; i++) await page.keyboard.press('Control+z');
    check((await listText()).endsWith('QSx2') && (await savedDeck())?.length === 86, `and undo goes back a step at a time ("${await listText()}")`);
    await page.keyboard.press('Escape'); // out of the field
    // A drag from one corner of the pad to the opposite one adds a new deck;
    // an entry dragged out of the field is taken out.
    await page.mouse.move(...await keyAt('KS'));
    await page.mouse.down();
    await page.mouse.move(...await keyAt('AH'), { steps: 8 });
    check(await page.locator('.lf-key.lf-run').count() === 52, 'dragging corner to corner on the pad marks the whole deck');
    await page.mouse.up();
    check((await listText()).endsWith('QSx2 deck') && (await savedDeck())?.length === 86 + 52, `corner to corner adds a new deck ("${await listText()}")`);
    const padBox = await page.locator('.lf-grid').boundingBox();
    await page.mouse.move(...await keyAt('7H'));
    await page.mouse.down();
    await page.mouse.move(padBox.x - 40, padBox.y + padBox.height / 2, { steps: 6 });
    check(await page.locator('.lf-key.lf-run').count() === 0 && (await page.textContent('.lf-pad-tip.cancel')) === 'Release to cancel',
      'dragging a card selection off the pad clears the highlight and offers to cancel');
    await page.mouse.up();
    check((await listText()).endsWith('QSx2 deck') && (await savedDeck())?.length === 86 + 52, 'releasing off the pad adds nothing');
    const lastChip = await page.locator('.lf-chips .lf-e').last().boundingBox();
    const chipsBox = await page.locator('.lf-chips').boundingBox();
    await page.mouse.move(lastChip.x + lastChip.width / 2, lastChip.y + lastChip.height / 2);
    await page.mouse.down();
    await page.mouse.move(chipsBox.x + chipsBox.width / 2, chipsBox.y + chipsBox.height + 80, { steps: 8 });
    check(await page.locator('.lf-float.out').count() === 1, 'an entry dragged out of the field shows it will be taken out');
    await page.mouse.up();
    check((await listText()).endsWith('QSx2') && (await savedDeck())?.length === 86, `dropped there, it is taken out ("${await listText()}")`);
    await setDeck('');
    check(JSON.stringify(await savedDeck()) === '[]' && !(await page.$('.lf-status.bad')), 'a shoe can be left empty');
    await setDeck('? AS');
    let err = await page.textContent('.lf-status.bad').catch(() => '');
    check(/"\?" is not a card/.test(err) && !/joker|special/i.test(err), `${lv.id}: deck rejects "?" where no special cards are allowed ("${err}")`);
    await openPatched({ specialCards: ['?', '??'] });
    await clickHex(spot.a);
    await setDeck('$$ AS');
    err = await page.textContent('.lf-status.bad').catch(() => '');
    check(/isn't allowed on this floor/.test(err) && /\? \?\?/.test(err), `deck rejects a special card the floor doesn't allow ("${err}")`);
    await openPatched({ specialCards: ['?', '??', '$', '$$'], croupiers: [...lv.croupiers.filter((c) => c !== 'burn' && c !== 'hand'), 'burn', 'hand'] });
    await clickHex(spot.a);
    await setDeck('? ?? $ $$ AS 10H');
    const deck = await savedDeck();
    check(JSON.stringify(deck) === JSON.stringify(['?', '??', '$', '$$', 'AS', 'TH']), `deck accepts allowed special cards: ${JSON.stringify(deck)}`);
    check(await page.locator('.inspector .lf-pad-row .card.spc').count() === 4 && await page.locator('.inspector .lf-chips .card.ad').count() === 2,
      'the pad offers the special cards, and the field draws them');
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
    // Any n up to 52, typed into the stepper's number; out of range is
    // refused; + adds one; a button goes back.
    const typeN = async (v) => {
      await page.click('.inspector [data-param="n-any"] .stepper-n');
      await page.fill('.inspector [data-param="n-any"] .stepper-in', v);
      await page.press('.inspector [data-param="n-any"] .stepper-in', 'Enter');
    };
    await typeN('28');
    const hn = async () => (await page.evaluate((id) => JSON.parse(localStorage.getItem('stacked-deck-v1')).levels[id].cells, lv.id)).find((c) => c.fn === 'hand')?.n;
    check(await hn() === 28 && await page.locator('.inspector [data-param="n"] button.on').count() === 0 &&
      await page.locator('.inspector .n-in.on').count() === 1, 'Hand: n = 28 from the field');
    await typeN('53');
    check(await hn() === 28 && (await page.textContent('.inspector [data-param="n-any"] .stepper-n')) === '28', 'Hand: n = 53 is refused');
    await page.click('.inspector [data-param="n-any"] [aria-label="One more"]');
    check(await hn() === 29, 'Hand: + makes it 29');
    if (shots) await page.locator('.inspector .param.col').first().screenshot({ path: join(shots, '9c-hand-n.png') });
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

    // A bonus floor uses the player's house deck as it is now: before the
    // finale opens its shoes take no special card (and the error doesn't
    // give them away); once it is open they take the ones reached.
    const kept = await page.evaluate(() => localStorage.getItem('stacked-deck-v1'));
    const bonusLv = BONUS_LEVELS.find((l) => l.croupiers.includes('shoe') && pick(l) && LEVELS.findIndex((c) => c.id === [].concat(l.unlockAfter)[0]) >= 0);
    const finale = LEVELS.findIndex((l) => (l.specialCards ?? []).length);
    const solvedUpTo = (n) => Object.fromEntries(LEVELS.slice(0, n).map((l) => [l.id, { solved: true }]));
    const bonusDeck = async (levels, text) => {
      await page.goto(base);
      await page.evaluate((l) => localStorage.setItem('stacked-deck-v1', JSON.stringify({ levels: l })), levels);
      await page.goto(`${base}#/level/${bonusLv.id}`);
      await page.reload();
      await page.waitForSelector('svg.board');
      const at = pick(bonusLv).a;
      await page.click('.pal-item[data-tool="shoe"]');
      await clickHex(at);
      await page.keyboard.press('Escape');
      await clickHex(at);
      await setDeck(text);
      return {
        err: await page.textContent('.lf-status.bad').catch(() => ''),
        deck: (await page.evaluate((id) => JSON.parse(localStorage.getItem('stacked-deck-v1')).levels[id].cells, bonusLv.id)).find((c) => c.kind === 'shoe')?.deck,
      };
    };
    let got = await bonusDeck(solvedUpTo(finale - 3), '? AS');
    check(/"\?" is not a card/.test(got.err) && !/joker|special/i.test(got.err), `${bonusLv.id} (bonus) before the finale: its shoes take no special card ("${got.err}")`);
    got = await bonusDeck(solvedUpTo(LEVELS.length), '? ?? $ $$ AS');
    check(JSON.stringify(got.deck) === JSON.stringify(['?', '??', '$', '$$', 'AS']), `${bonusLv.id} (bonus) after the finale: its shoes take every special card (${JSON.stringify(got.deck)})`);
    await page.goto(base);
    await page.evaluate((k) => (k === null ? localStorage.removeItem('stacked-deck-v1') : localStorage.setItem('stacked-deck-v1', k)), kept);
  }

  // Test-only floors (?testlevels adds test/ui-levels.js to the bonus deck).
  {
    const { BONUS: TB, SOLUTIONS } = await import(pathToFileURL(join(repo, 'test/ui-levels.js')).href);
    const T = `${base}?testlevels`;
    const nBonus = BONUS_LEVELS.length + TB.length;
    const setSave = (levels) => page.evaluate((l) => localStorage.setItem('stacked-deck-v1', JSON.stringify({ levels: l })), levels);
    const getSave = () => page.evaluate(() => JSON.parse(localStorage.getItem('stacked-deck-v1')).levels);
    const twice = TB.find((l) => l.id === 'test-pay-twice');
    const sorted = TB.find((l) => l.id === 'test-sorted');
    await page.goto(T);
    await setSave({});
    await page.reload();
    await page.waitForSelector('.deck.campaign');
    check(await page.locator('.decks').count() === 0 && await page.locator('.marquee .meta-count').count() === 1,
      'with no bonus floor open and nothing played on the floor, there are no deck tabs (the count is in the header)');
    // test-locked opens after the second floor; test-pay-twice needs the first.
    await setSave({ [SECOND]: { solved: true } });
    await page.reload();
    await showDeck(page, 'bonus');
    check(await page.locator('.deck-tab.floor').count() === 0, 'the bonus deck\'s tab shows once one of its floors is open; the floor\'s doesn\'t');
    check(await page.locator('.tile.locked.bonus[data-bonus="test-pay-twice"]').count() === 1 &&
      await page.locator('a.tile[data-level="test-pay-twice"]').count() === 0, 'bonus floor is locked before its unlockAfter floor is solved');
    const lockText = await page.textContent('.tile.locked.bonus[data-bonus="test-pay-twice"]');
    check(lockText.includes(`After ${floorLabel(0).text}`), `locked bonus tile names the floor that opens it ("${lockText.trim()}")`);
    check((await page.textContent('.deck-tab.bonus .deck-count')) === `0 / ${nBonus} cleared`, `the bonus deck's tab counts its floors (0 / ${nBonus})`);
    await page.goto(`${T}#/level/test-pay-twice`);
    await page.waitForSelector('.tile');
    check(await page.locator('svg.board').count() === 0, 'a locked bonus floor cannot be opened by URL');
    if (shots) await page.locator('.deck.bonus').screenshot({ path: join(shots, '12-bonus-deck-locked.png') });

    await setSave({ [FIRST]: { solved: true } });
    await page.goto(T);
    await page.reload();
    await showDeck(page, 'bonus');
    check(await page.locator('.chapter.bonus a.tile.bonus[data-level="test-pay-twice"]').count() === 1 &&
      await page.locator('.chapter.bonus a.tile.bonus[data-level="test-sorted"]').count() === 1 &&
      await page.locator('.tile.locked.bonus[data-bonus="test-locked"]').count() === 1, `solving ${FIRST} opens its bonus floors only`);
    check((await page.textContent('a.tile[data-level="test-pay-twice"] .tile-corner.tl')) === 'A♠' &&
      (await page.textContent('.tile.locked.bonus[data-bonus="test-locked"] .tile-no')).startsWith('B'), 'bonus tiles are labelled by their bonus card (A♠; B… without one)');
    check(await page.locator(`a.tile[data-level="${LEVELS[4].id}"]`).count() === 0, 'open bonus floors leave the campaign window alone');
    // A floor needing a campaign floor and a bonus floor: both are named, the
    // bonus one on a starred chip, and a cleared one is struck through.
    const keys = '.tile.locked.bonus[data-bonus="test-two-keys"]';
    check(await page.locator(`${keys} .req`).count() === 2 &&
      (await page.textContent(`${keys} .req:not(.bonus)`)) === floorLabel(1).text &&
      (await page.textContent(`${keys} .req.campaign`)) === floorLabel(1).text &&
      await page.locator(`${keys} .req.campaign`).evaluate((e) => getComputedStyle(e).backgroundColor) === 'rgb(140, 37, 53)' &&
      (await page.textContent(`${keys} .req.bonus`)) === '★A♠' &&
      await page.locator(`${keys} .req.done`).count() === 0, 'a bonus floor needing two floors names both, the campaign one on a red chip, the bonus one starred');
    await setSave({ [FIRST]: { solved: true }, [SECOND]: { solved: true } });
    await page.reload();
    await showDeck(page, 'bonus');
    check(await page.locator(keys).count() === 1 && await page.locator(`${keys} .req.done:not(.bonus)`).count() === 1 &&
      await page.locator(`${keys} .req.bonus.done`).count() === 0, 'it stays locked with one of the two cleared, which is struck through');
    await setSave({ [FIRST]: { solved: true }, [SECOND]: { solved: true }, 'test-pay-twice': { solved: true } });
    await page.reload();
    await showDeck(page, 'bonus');
    check(await page.locator('a.tile[data-level="test-two-keys"]').count() === 1, 'and opens once both are cleared');
    // The floor: dropped campaign cards, keeping their card, always open.
    {
      const { FLOOR: TF } = await import(pathToFileURL(join(repo, 'test/ui-levels.js')).href);
      // Only floors the player has played are on it (a machine saved counts).
      const played = { cells: SOLUTIONS['test-pay-twice'] };
      await setSave({ 'test-dropped': played, 'test-dropped-later': played });
      await page.reload();
      await showDeck(page, 'floor');
      check(await page.locator('.deck-tab.floor.on').count() === 1 &&
        (await page.textContent('.deck-tab.floor .deck-count')) === `0 / ${TF.length} cleared` &&
        await page.locator('.deck.floor .tile').count() === TF.length, 'the floor has its own tab, showing and counting only the floors played on it');
      check(await page.locator('.deck.floor a.tile[data-level="test-dropped"]').count() === 1 &&
        await page.locator('.deck.floor a.tile[data-level="test-dropped-later"]').count() === 1 &&
        await page.locator('.deck.floor .tile.locked').count() === 0, 'floor cards are open with no campaign floor cleared');
      check((await page.textContent('a.tile[data-level="test-dropped"] .tile-corner.tl')) === 'A♥', 'a floor card keeps its campaign card');
      check(await page.locator('.deck.floor .tiles.scatter').count() === 1, 'the floor\'s cards lie scattered');
      if (shots) await page.locator('.deck.floor').screenshot({ path: join(shots, '12c-the-floor.png') });
    }
    await setSave({ [FIRST]: { solved: true } });
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
    await setSave({ [FIRST]: { solved: true }, 'test-pay-twice': { cells: SOLUTIONS['test-pay-twice'] } });
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
    // `letters`: each hand's letters (AS 5H is NE), and the payouts as a message, lit as paid.
    check((await page.textContent('.queue .q-item:first-child .letter-tag').catch(() => '')) === 'NE' &&
      (await page.textContent('.message').catch(() => '')) === 'NENEZBZBVIVI' && await page.locator('.message .got').count() === ticked,
    'a floor with letters shows hands as letters and the payouts as a message');
    if (shots) {
      await page.screenshot({ path: join(shots, '13-expected-payouts.png') });
      await page.locator('.panel.tests').screenshot({ path: join(shots, '13b-expected-panel.png') });
    }
    // `sealed`: the second test's payouts are face down, its message blank.
    await page.click('.test-chip:nth-child(2)');
    check(await page.locator('.order-tag', { hasText: 'sealed' }).count() === 1 && await page.locator('.paid.expected .card.down').count() === 8 &&
      (await page.textContent('.message').catch(() => '')) === '········', 'a sealed test hides its expected payouts and message');
    if (shots) await page.locator('.panel.tests').screenshot({ path: join(shots, '13c-sealed-panel.png') });
    await page.click('.test-chip:nth-child(1)');
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
    await setSave({ [FIRST]: { solved: true }, [SECOND]: { solved: true }, 'test-hearts': { cells: SOLUTIONS['test-hearts-everything'] } });
    await page.goto(`${T}#/level/test-hearts`);
    await page.reload();
    await page.waitForSelector('svg.board');
    check((await page.textContent('.check-hint').catch(() => '')).includes('8 check deals'), 'the tests panel mentions the check deals before a run');
    await page.click('.speeds .sp:last-child');
    await page.waitForSelector('.toast.bad', { timeout: 20000 });
    const ct = (await page.textContent('.toast')) || '';
    check(/Test 1 passed, but check deal \d failed/.test(ct) && ct.includes('follow the floor'), `fitting the tests fails a check deal: "${ct.slice(0, 80)}..."`);
    check(await page.locator('.test-chip.check').count() === 8 && await page.locator('.test-chip.check.fail').count() >= 1 &&
      await page.locator('.test-chip.check.on').count() === 1, 'the check deals are shown, and the failing one is loaded');
    check((await page.textContent('.tp-round')).includes('Check deal'), 'the transport names the check deal');
    check(!(await getSave())['test-hearts'].solved, 'a floor is not cleared by fitting its tests');
    if (shots) await page.locator('.panel.tests').screenshot({ path: join(shots, '15-check-deal-failed.png') });

    // A croupier bolted to the floor: drawn as such, can't be selected, isn't
    // counted; and a floor where only some card places matter says so.
    await setSave({ [FIRST]: { solved: true }, [SECOND]: { solved: true }, 'test-bolted': { cells: SOLUTIONS['test-bolted'] } });
    await page.goto(`${T}#/level/test-bolted`);
    await page.reload();
    await page.waitForSelector('svg.board');
    check(await page.locator('svg.board .cell.bolted').count() === 1 && await page.locator('svg.board .cell.bolted .bolt').count() === 6, 'a bolted croupier is drawn with its bolts');
    await page.click('svg.board .cell.bolted');
    check(await page.locator('svg.board .cell.selected').count() === 0, 'a bolted croupier cannot be selected');
    check((await page.textContent('.order-tag').catch(() => '')) === 'card places matter' &&
      (await page.textContent('.order-note').catch(() => '')).includes('1st from the top'), 'a floor checking card places says which');
    if (shots) await page.screenshot({ path: join(shots, '15b-bolted.png') });
    await page.click('.speeds .sp:last-child');
    await page.waitForSelector('.modal.results', { timeout: 20000 });
    const lb = (await getSave())['test-bolted'];
    check(lb.solved && lb.best.croupiers === 1, `the bolted croupier doesn't count (${JSON.stringify(lb.best)})`);
    await setSave({});
  }
      } finally {
        await page.close();
      }
    },
    async (check) => {
  // Dev mode (src/ui/dev.js; the checkout served as it is is a 'dev' build):
  // ?dev turns it on and it is remembered; a locked floor can be entered,
  // its par machine loaded and measured (the measured total is par's
  // rounds); turned off, it stays off.
  {
    const devCtx = await browser.newContext({ viewport: { width: 1440, height: 860 } });
    const dp = await devCtx.newPage();
    dp.on('pageerror', (e) => errors.push(e.message));
    await dp.goto(`${base}?dev`);
    await dp.waitForSelector('.deck.campaign');
    check(await dp.locator('.decks').count() === 0, 'dev mode: a new save shows only the campaign');
    await dp.click('.dev-toggle input');
    await dp.waitForSelector('.deck-tab.floor');
    await showDeck(dp, 'floor');
    check(await dp.locator('.deck.floor .tile').count() === FLOOR_LEVELS.length, 'dev mode\'s "Show all levels" shows every deck and every floor on the floor');
    await showDeck(dp, 'bonus');
    check(await dp.locator('.dev-bar').count() === 1 && await dp.locator('.deck.bonus .tile.locked.dev-enter').count() === BONUS_LEVELS.length,
      'dev mode: the dev bar shows and every locked bonus floor can be entered');
    const first = BONUS_LEVELS[0];
    await dp.click(`.tile.locked.dev-enter[data-bonus="${first.id}"]`);
    await dp.waitForSelector('svg.board');
    check(dp.url().endsWith(`#/level/${first.id}`) && (await dp.textContent('.dev-panel')).includes(`Difficulty ${first.difficulty}`),
      `dev mode enters a locked floor, and its panel gives the difficulty (${first.id}: ${first.difficulty})`);
    await dp.click('.dev-panel >> text=Load par machine');
    await dp.waitForFunction((n) => document.querySelectorAll('svg.board .cell.croupier, svg.board .cell.shoe').length === n, first.par.croupiers);
    check(true, `the par machine loads (${first.par.croupiers} croupiers)`);
    await dp.click('.dev-panel >> text=Measure machine');
    await dp.waitForFunction(() => /Total \d+ rounds/.test(document.querySelector('.dev-panel')?.textContent ?? ''), null, { timeout: 60000 });
    const total = Number((await dp.textContent('.dev-panel')).match(/Total (\d+) rounds/)[1]);
    check(total === first.par.rounds && await dp.locator('.dev-measure tbody tr').count() === first.tests.length,
      `measuring the par machine gives each test and par's rounds (${total})`);
    if (shots) await dp.screenshot({ path: join(shots, '16-dev-mode.png') });
    // The frame meter: opened, it records a step and a step back; a switch
    // leaves a part of the drawing out (and turned off again, puts it back).
    await dp.click('.perf-meter > summary');
    await dp.click('.tp[title^="Step ("]');
    await dp.waitForTimeout(600);
    await dp.click('.tp[title^="Step back"]');
    await dp.waitForFunction(() => document.querySelectorAll('.perf-row').length === 2, null, { timeout: 5000 }).catch(() => {});
    const rows = await dp.locator('.perf-row').allInnerTexts();
    check(rows.length === 2 && /^1→0: \d+ frames/.test(rows[0]) && /^0→1: \d+ frames/.test(rows[1]), `the frame meter records a step and a step back (${JSON.stringify(rows)})`);
    const shadow = dp.locator('.perf-switch', { hasText: 'No chip shadows' }).locator('input');
    await shadow.check();
    const hidden = await dp.locator('svg.board .chip-shadow').first().evaluate((e) => getComputedStyle(e).display === 'none');
    await shadow.uncheck();
    check(hidden && await dp.locator('svg.board .chip-shadow').first().evaluate((e) => getComputedStyle(e).display !== 'none'), 'a frame meter switch leaves the chip shadows out, and back in');
    await dp.click('.perf-meter > summary');
    // Outside the live site, a solution scored on a floor that has changed
    // since (here: one saved with no record of its floor) is re-scored on
    // load; dev mode's button re-scores every one.
    const parCells = (await import(pathToFileURL(join(repo, 'solutions/levels', `${first.id}.js`)).href)).default.cells;
    await dp.evaluate(([id, cells, par]) => localStorage.setItem('stacked-deck-v1', JSON.stringify({ levels: { [id]: {
      solved: true, solutions: [{ cells, croupiers: par.croupiers, rounds: 1, at: 1, rules: 0 }],
    } } })), [first.id, parCells, first.par]);
    await dp.goto(base);
    await dp.reload();
    await dp.waitForFunction((id) => JSON.parse(localStorage.getItem('stacked-deck-v1')).levels[id].solutions[0].floor, first.id);
    const sol = await dp.evaluate((id) => JSON.parse(localStorage.getItem('stacked-deck-v1')).levels[id].solutions[0], first.id);
    check(sol.rounds === first.par.rounds && !sol.broken && /^[0-9a-f]{16}$/.test(sol.floor), 'a solution from before its floor changed is re-scored on load');
    await dp.click('.dev-bar >> text=Re-score all solutions');
    await dp.waitForFunction(() => /Re-scored 1 solution\./.test(document.querySelector('.dev-bar')?.textContent ?? ''));
    check(true, 'dev mode re-scores every saved solution');
    await dp.click('.dev-bar >> text=Turn off');
    await dp.reload();
    await showDeck(dp, 'bonus');
    check(await dp.locator('.dev-bar').count() === 0 && await dp.locator('.tile.dev-enter').count() === 0, 'dev mode is remembered, and turned off stays off');
    await devCtx.close();
  }

  // Keeping progress: two tabs of the game don't overwrite each other's
  // progress, the floors list's Save file dialog downloads the save and loads
  // one back (adding to what is there), and a browser that won't keep the
  // save says so and offers the file instead.
  {
    const [l0, l1] = LEVELS;
    const ref = async (lv) => (await import(pathToFileURL(join(repo, 'solutions/levels', `${lv.id}.js`)).href)).default.cells;
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
    const { page } = await makeDesktopPage();
    try {
      const { readdirSync } = await import('node:fs');
      const have = new Set(readdirSync(join(repo, 'solutions/levels')).map((f) => f.replace(/\.js$/, '')));
      for (const lv of [...LEVELS, ...BONUS_LEVELS]) {
        if (!have.has(lv.id)) { console.log(`skip ${lv.id}: no reference solution`); continue; }
        const sol = (await import(pathToFileURL(join(repo, 'solutions/levels', `${lv.id}.js`)).href)).default;
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
    } finally {
      await page.close();
    }
  }
    },
    async (check) => {
  // The title screen: once a visit, when the game opens on the floors list.
  {
    const tctx = await rawContext({ viewport: { width: 1440, height: 860 } });
    const tp = await tctx.newPage();
    tp.on('pageerror', (e) => errors.push(e.message));
    await tp.goto(base);
    await tp.waitForSelector('.title-screen .title-start');
    check(await tp.evaluate(() => document.activeElement?.classList.contains('title-start')), 'the title screen shows, with Start focused');
    const paid = () => tp.evaluate(() => Number(document.querySelector('.title-board .paid-badge-t')?.textContent ?? 0));
    const p0 = await paid();
    await tp.waitForFunction((n) => Number(document.querySelector('.title-board .paid-badge-t')?.textContent ?? 0) > n &&
      document.querySelectorAll('.title-board .scard').length > 10, p0, { timeout: 4000 }).catch(() => {});
    check(await tp.locator('.title-board .scard').count() > 10 && await paid() > p0, 'its machine runs, paying out at its desk');
    if (shots) await tp.screenshot({ path: join(shots, 'title.png') });
    await tp.mouse.wheel(0, 600);
    check(await tp.evaluate(() => window.scrollY) === 0, 'the page under it doesn\'t scroll');
    await tp.click('.title-start');
    await tp.waitForSelector('body.title-deal', { timeout: 3000 });
    if (shots) { await tp.waitForTimeout(250); await tp.screenshot({ path: join(shots, 'title-deal.png') }); }
    await tp.waitForSelector('.title-screen', { state: 'detached', timeout: 6000 });
    const after = await tp.evaluate(() => ({
      body: document.body.className,
      backs: document.querySelectorAll('.deal-back').length,
      moving: [...document.querySelectorAll('.deck .tiles > *')].filter((k) => k.getAnimations().length).length,
      logo: (() => { const r = document.querySelector('.marquee .logo-btn').getBoundingClientRect(); return r.top >= 0 && r.width > 0; })(),
    }));
    check(!after.body.includes('title') && !after.backs && !after.moving && after.logo, `Start deals the floors list's cards and leaves it as it is ${JSON.stringify(after)}`);
    await tp.click(`a.tile[data-level="${LEVELS[0].id}"]`);
    check(await tp.waitForSelector('.story-card').then(() => true, () => false), 'and its cards can be opened');
    await tp.reload();
    await tp.waitForSelector('.story-card');
    await tp.goto(`${base}?again#/`); // (a new page, in the same tab)
    await tp.waitForSelector('.tile');
    await tp.waitForTimeout(200);
    check(await tp.locator('.title-screen').count() === 0, 'not again in the same visit');
    await tp.click('.marquee .logo-btn');
    await tp.waitForSelector('.title-screen .title-start');
    await tp.keyboard.press('Enter');
    await tp.waitForTimeout(200);
    await tp.keyboard.press('x');
    await tp.waitForSelector('.title-screen', { state: 'detached', timeout: 500 }).catch(() => {});
    check(await tp.locator('.title-screen').count() === 0 && await tp.locator('.deal-back').count() === 0,
      'the name opens it again; Enter starts, and a key skips the animation');
    await tctx.close();

    // Opened on a floor: no title. On a phone: Start under the machine, in view.
    const lctx = await rawContext({ viewport: { width: 1440, height: 860 } });
    const lp = await lctx.newPage();
    await lp.goto(`${base}#/level/${LEVELS[0].id}/story`);
    await lp.waitForSelector('.story-card');
    check(await lp.locator('.title-screen').count() === 0, 'opened on a floor, the game doesn\'t show the title');
    await lctx.close();
    const pctx = await rawContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const pp = await pctx.newPage();
    pp.on('pageerror', (e) => errors.push(e.message));
    await pp.goto(base);
    await pp.waitForSelector('.title-start');
    const fits = await pp.evaluate(() => {
      const b = document.querySelector('.title-start').getBoundingClientRect(), l = document.querySelector('.title-logo span').getBoundingClientRect();
      return b.bottom <= innerHeight && b.top > l.bottom && l.left >= 0 && l.right <= innerWidth;
    });
    check(fits, 'on a phone, the name and Start fit the screen');
    if (shots) await pp.screenshot({ path: join(shots, 'title-phone.png') });
    await pp.tap('.title-start');
    await pp.waitForSelector('.title-screen', { state: 'detached', timeout: 6000 });
    check(await pp.locator(`a.tile[data-level="${LEVELS[0].id}"]`).isVisible(), 'and Start deals the floors list');
    await pctx.close();
    // With reduced motion the machine stands still and Start just fades the title.
    const rctx = await rawContext({ viewport: { width: 1440, height: 860 }, reducedMotion: 'reduce' });
    const rp = await rctx.newPage();
    rp.on('pageerror', (e) => errors.push(e.message));
    await rp.goto(base);
    await rp.waitForSelector('.title-start');
    const r0 = await rp.evaluate(() => document.querySelector('.title-board .paid-badge-t')?.textContent);
    await rp.waitForTimeout(500);
    const still = r0 === await rp.evaluate(() => document.querySelector('.title-board .paid-badge-t')?.textContent);
    await rp.click('.title-start');
    await rp.waitForSelector('.title-screen', { state: 'detached', timeout: 1000 }).catch(() => {});
    check(still && await rp.locator('.title-screen').count() === 0, 'with reduced motion, the machine stands still and Start is quick');
    await rctx.close();
  }

  // Moving the player and chip desk (src/score.js: desksMove): starting hexes
  // are ordinary floor hexes (a croupier can take a vacated desk's hex), a
  // selected desk drags from near its edge too, group lift includes movable
  // players and desks with copy/delete disabled and snaps displaced ones to
  // the nearest free hex without overwriting anything, and bolted floors stay put.
  {
    const mctx = await browser.newContext({ viewport: { width: 1440, height: 860 } });
    const mp = await mctx.newPage();
    mp.on('pageerror', (e) => errors.push(e.message));
    mp.on('dialog', (d) => d.accept());
    const open = async (id) => {
      await mp.goto(`${base}?dev#/level/${id}`);
      await mp.waitForSelector('.story-actions .btn.gold, svg.board');
      if (await mp.locator('.story-actions .btn.gold').count()) await mp.click('.story-actions .btn.gold');
      await mp.waitForSelector('svg.board');
    };
    const at = (q, r, dx = 0) => mp.evaluate(([q, r, dx]) => {
      const R = 50, svg = document.querySelector('svg.board');
      const p = new DOMPoint(R * Math.sqrt(3) * (q + r / 2) + dx * R, R * 1.5 * r).matrixTransform(svg.getScreenCTM());
      return [p.x, p.y];
    }, [q, r, dx]);
    const dragHex = async (from, to, dx0 = 0) => {
      const [x0, y0] = await at(from[0], from[1], dx0), [x1, y1] = await at(to[0], to[1]);
      await mp.mouse.move(x0, y0); await mp.mouse.down(); await mp.mouse.move(x1, y1, { steps: 8 }); await mp.mouse.up();
    };
    const work = (id) => mp.evaluate((id) => JSON.parse(localStorage.getItem('stacked-deck-v1')).levels[id], id);
    await open('upper-hand');
    await mp.click('.dev-panel button:has-text("Load par")');
    await mp.waitForFunction(() => document.querySelector('.stats .stat-v')?.textContent.trim() === '4');
    const [px, py] = await at(1, 0);
    await mp.mouse.click(px, py, { button: 'right' }); // remove the Pass by the desk
    await dragHex([2, 0], [1, 0]);
    let w = await work('upper-hand');
    check(JSON.stringify(w.cells.filter((c) => c.kind === 'payout')) === '[{"at":[1,0],"kind":"payout"}]' &&
      await mp.locator('.hex.dock').count() === 0 && await mp.locator('.hex.floor[data-at="2,0"]').count() === 1,
      'moving the chip desk: saved in the machine, and its starting hex is an ordinary floor hex');
    // Vacated starting hex accepts a croupier.
    const [hx, hy] = await at(2, 0);
    await mp.mouse.move(hx, hy);
    await mp.keyboard.press('Escape');
    await mp.keyboard.press('1');
    w = await work('upper-hand');
    check(w.cells.some((c) => c.kind === 'croupier' && c.at.join() === '2,0'), 'a croupier can be placed on the desk\'s vacated starting hex');
    await mp.mouse.click(hx, hy, { button: 'right' }); // remove that Pass again
    await mp.mouse.click(px, py, { button: 'right' });
    await mp.keyboard.press('Delete');
    await mp.mouse.move(px, py);
    await mp.keyboard.press('Escape');
    await mp.keyboard.press('1'); // not on the desk
    w = await work('upper-hand');
    check(w.cells.filter((c) => c.at.join() === '1,0').map((c) => c.kind).join() === 'payout', 'the desk can\'t be deleted, nor a croupier put on it');
    await mp.click('.transport button:has-text("Max")');
    await mp.waitForSelector('.modal .btn.gold, .modal .btn', { timeout: 20000 });
    w = await work('upper-hand');
    check(w.solved && w.best?.croupiers === 3 && w.solutions?.[0]?.cells.some((c) => c.kind === 'payout'), `with the desk moved the floor clears with 3 croupiers (${JSON.stringify(w.best)})`);
    await mp.keyboard.press('Escape');
    await mp.reload();
    await mp.waitForSelector('svg.board');
    check(await mp.locator('.cell.payout[data-at="1,0"]').count() === 1, 'the moved desk is still there after a reload');
    // Selected desk drags cleanly even when grabbed near its edge (dist = 0.7R).
    await mp.mouse.click(px, py);
    await dragHex([1, 0], [2, 0], 0.7);
    w = await work('upper-hand');
    check(await mp.locator('.cell.payout[data-at="2,0"]').count() === 1 && !w.cells.some((c) => c.kind === 'payout'),
      'dragging a selected desk near its edge moves it back, and at its starting place it leaves the machine');
    // Group selection includes movers, disables copy and delete, and snaps
    // a mover dropped off the floor or over a croupier to the nearest free hex.
    await mp.keyboard.press('Escape');
    await mp.keyboard.press('Control+a');
    check(await mp.isVisible('.lift-bar') && /5 picked up/.test(await mp.textContent('.lift-bar')) &&
      await mp.locator('.lift-bar [data-act="copy"]').isDisabled() && await mp.locator('.lift-bar [data-act="delete"]').isDisabled(),
      'Ctrl+A picks up croupiers, player and desk together, with copy and delete disabled');
    await mp.keyboard.press('Delete');
    check(await mp.isVisible('.lift-bar'), 'Delete does nothing when a group contains a player or desk');
    await mp.keyboard.press('Escape');
    // Lift just the desk (Shift-click when selected or Shift-click twice) and move it over a croupier / off the floor.
    await mp.mouse.click(hx, hy);
    await mp.keyboard.down('Shift');
    const [cx0, cy0] = await at(0, 0);
    await mp.mouse.click(cx0, cy0); // lift desk@(2,0) + croupier@(0,0)
    await mp.keyboard.up('Shift');
    await mp.mouse.click(cx0, cy0); // drop croupier@(0,0) back down, leaving desk@(2,0) floating in lift
    check(await mp.isVisible('.lift-bar') && /Chip desk/.test(await mp.textContent('.lift-bar')), 'desk stays picked up in lift');
    for (let i = 0; i < 4; i++) await mp.keyboard.press('d'); // float desk far east into the void (6,0)
    check(await mp.locator('.lift-bar.bad').count() === 0 && await mp.locator('.board .cell.lifted.covers').count() === 1,
      'floating a desk over the void marks it displaced (amber), never deleted (red)');
    await mp.keyboard.press('Enter');
    w = await work('upper-hand');
    check(await mp.locator('.cell.payout[data-at="2,0"]').count() === 1 && w.cells.length === 3,
      'dropping a desk over the void snaps it to the nearest free floor hex without overwriting croupiers');
    // Float desk onto a stationary croupier at (0,0): it marks "replaces" and overwrites it on drop.
    const croupiersBefore = (await work('upper-hand')).cells.filter((c) => c.kind !== 'payout' && c.kind !== 'source').length;
    await mp.mouse.click(hx, hy);
    await mp.keyboard.down('Shift');
    await mp.mouse.click(cx0, cy0);
    await mp.keyboard.up('Shift');
    await mp.mouse.click(cx0, cy0); // leave desk@(2,0) floating
    await mp.keyboard.press('a');
    await mp.keyboard.press('a'); // float desk onto (0,0), where a stationary croupier stands
    check(/replaces 1/.test(await mp.textContent('.lift-bar')) && await mp.locator('.board .cover-tag').count() === 1,
      'floating a lifted desk over a croupier marks that it replaces it');
    await mp.keyboard.press('Enter');
    w = await work('upper-hand');
    check(w.cells.find((c) => c.kind === 'payout')?.at.join() === '0,0' &&
      w.cells.filter((c) => c.kind !== 'payout' && c.kind !== 'source').length === croupiersBefore - 1,
      'dropping a lifted desk on a croupier overwrites that croupier');
    await mp.keyboard.press('Control+z');
    check((await work('upper-hand')).cells.filter((c) => c.kind !== 'payout' && c.kind !== 'source').length === croupiersBefore,
      'undo restores both the desk and the overwritten croupier');
    // Float desk onto the stationary player at (-2,0): can't land there, snaps to nearest empty hex without overwriting anything.
    await mp.mouse.click(hx, hy);
    await mp.keyboard.down('Shift');
    await mp.mouse.click(cx0, cy0);
    await mp.keyboard.up('Shift');
    await mp.mouse.click(cx0, cy0); // leave desk@(2,0) floating
    for (let i = 0; i < 4; i++) await mp.keyboard.press('a'); // float desk onto player at (-2,0)
    check(await mp.locator('.lift-bar.bad').count() === 0 && await mp.locator('.board .cover-tag').count() === 0 &&
      await mp.locator('.board .cell.lifted.covers').count() === 1,
      'floating a desk over the player marks it displaced without a replaces tag');
    await mp.keyboard.press('Enter');
    w = await work('upper-hand');
    const deskAfter = w.cells.find((c) => c.kind === 'payout');
    const croupiersAfter = w.cells.filter((c) => c.kind !== 'payout' && c.kind !== 'source');
    check(croupiersAfter.length === croupiersBefore && deskAfter && deskAfter.at.join() !== '-2,0' &&
      !croupiersAfter.some((c) => c.at.join() === deskAfter.at.join()),
      `dropping a desk over the player snaps it to the nearest empty hex (${JSON.stringify(deskAfter)})`);
    await open('opening-night');
    const [ox, oy] = await at(2, 0);
    await dragHex([2, 0], [1, 0]);
    check(await mp.locator('.cell.payout.bolted[data-at="2,0"]').count() === 1 && !(await work('opening-night'))?.cells?.length && ox > 0 && oy > 0,
      'a bolted floor\'s desk is drawn bolted and doesn\'t move');
    // Multi-player / multi-desk floor (Pot Luck: Player A, Player B, Desk X, Desk Y):
    // each names its seat/desk when selected and saves its seat/desk when moved.
    await open('pot-luck');
    const [ax, ay] = await at(-3, 0);
    await mp.mouse.click(ax, ay);
    check((await mp.textContent('.sel-bar .lift-n')).trim() === 'Player A' && (await mp.textContent('.inspector h3')).trim() === 'Player A',
      'selecting a seated player names its seat (Player A)');
    await dragHex([-3, 0], [-2, 0]);
    await dragHex([2, 0], [1, 0]);
    const plWork = await work('pot-luck');
    check(plWork?.cells?.some((c) => c.kind === 'source' && c.seat === 0 && c.at.join() === '-2,0') &&
      plWork?.cells?.some((c) => c.kind === 'payout' && c.desk === 1 && c.at.join() === '1,0'),
      `multi-desk floor moves seated players and labelled desks independently (${JSON.stringify(plWork?.cells)})`);
    await open('crossed-wires');
    check(await mp.locator('.cell.source.bolted').count() === 3 && await mp.locator('.cell.payout.bolted').count() === 3,
      'Crossed Wires keeps all three players and all three desks bolted');
    await mctx.close();
  }

  // War's default dealer side heuristics, ports footer, keyboard navigation,
  // listField selection/paste fixes, tutorial focus trap, and ARIA labels.
  {
    const kctx = await browser.newContext({ viewport: { width: 1280, height: 820 } });
    const kp = await kctx.newPage();
    kp.on('pageerror', (e) => errors.push(e.message));
    kp.on('dialog', (d) => d.accept());
    const hexCenter = (at) => kp.evaluate(([q, r]) => {
      const R = 50, svg = document.querySelector('svg.board');
      const x = R * Math.sqrt(3) * (q + r / 2), y = R * 1.5 * r;
      const p = new DOMPoint(x, y).matrixTransform(svg.getScreenCTM());
      return [p.x, p.y];
    }, at);
    const clickCenter = async (at) => { const [x, y] = await hexCenter(at); await kp.mouse.click(x, y); };
    const savedCells = (id) => kp.evaluate((k) => JSON.parse(localStorage.getItem('stacked-deck-v1') || '{}').levels?.[k]?.cells ?? [], id);

    // 1. Story screen: Enter on focused "← All floors" returns to #/, and Esc
    // while Help is open closes Help without leaving the story screen.
    await kp.goto(`${base}?unlockall#/level/${FIRST}/story`);
    await kp.waitForSelector('.story-card');
    await kp.keyboard.press('?');
    await kp.waitForSelector('#help .modal.help');
    await kp.keyboard.press('Escape');
    check(await kp.locator('#help .modal.help').count() === 0 && await kp.evaluate(() => document.body.dataset.screen) === 'story',
      'story screen: Esc with Help open closes Help and stays on the story screen');
    await kp.focus('.story-back .btn.ghost');
    await kp.keyboard.press('Enter');
    await kp.waitForSelector('.tile');
    check(await kp.evaluate(() => document.body.dataset.screen) === 'select',
      'story screen: Enter on focused "← All floors" activates the button instead of opening the floor');

    // 2. Tutorial modal: Tab wraps inside .coach-card, Esc dismisses it, and
    // .coach-veil has pointer-events: none during its flight.
    await kp.goto(`${base}?unlockall#/level/${FIRST}`);
    await kp.waitForSelector('.coach-card');
    await kp.focus('.coach-card .coach-next');
    await kp.keyboard.press('Tab');
    const firstTab = await kp.evaluate(() => document.activeElement?.className ?? '');
    await kp.keyboard.press('Tab');
    const secondTab = await kp.evaluate(() => document.activeElement?.className ?? '');
    check(/coach-skip/.test(firstTab) && /coach-next/.test(secondTab),
      `tutorial dialog traps Tab between its buttons ("${firstTab}" -> "${secondTab}")`);
    await kp.keyboard.press('Escape');
    const veilPe = await kp.evaluate(() => document.querySelector('.coach-veil')?.style.pointerEvents ?? 'gone');
    check(veilPe === 'none' || veilPe === 'gone', `tutorial veil ignores pointer events while flying away (${veilPe})`);
    await kp.waitForSelector('.coach-card', { state: 'detached' });
    check(/^2 \/ /.test(((await kp.textContent('.coach:not(.hidden) .coach-count')) || '').trim()),
      'Esc dismisses the tutorial welcome card to step 2');
    await kp.waitForTimeout(350);
    const crawlBefore = await kp.evaluate(() => {
      const r = document.querySelector('.coach-ring');
      r._tag = 1;
      return parseFloat(getComputedStyle(r).strokeDashoffset) || 0;
    });
    const [rx, ry] = await hexCenter([-1, -1]);
    await kp.mouse.move(rx, ry);
    await kp.mouse.move(rx + 32, ry); // cross dist > 0.45 to force a full board.render()
    const crawlAfter = await kp.evaluate(() => {
      const r = document.querySelector('.coach-ring');
      return { rebuilt: !r._tag, off: parseFloat(getComputedStyle(r).strokeDashoffset) || 0, delay: r.style.getPropertyValue('--ring-t') };
    });
    check(crawlAfter.rebuilt && crawlBefore < -3 && crawlAfter.off <= crawlBefore + 0.5,
      `hovering a ringed tutorial hex rebuilds the SVG without resetting the ant crawl (${crawlBefore.toFixed(1)} -> ${crawlAfter.off.toFixed(1)}, ${crawlAfter.delay})`);

    // 3. War default dealer heuristics & PORTS keyboard footer on high-card.
    await kp.goto(`${base}?unlockall#/level/high-card`);
    await kp.waitForSelector('svg.board');
    // Keyboard activation of .pal-item via Enter and Space (Space doesn't start Play).
    await kp.focus('.pal-item[data-tool="pass"]');
    await kp.keyboard.press('Enter');
    check(await kp.getAttribute('.pal-item[data-tool="pass"]', 'aria-pressed') === 'true',
      'palette item activates with Enter and sets aria-pressed="true"');
    await kp.keyboard.press(' ');
    check(await kp.getAttribute('.pal-item[data-tool="pass"]', 'aria-pressed') === 'false' &&
      !(await kp.locator('.transport .tp.main.on').count()),
      'Space on a focused palette button toggles it instead of starting Play');

    // Place Pass at [-1,-1] pointing NE (5): 1 incoming arrow into [-1,0] (from source at [-2,0], d=3)
    // and occupied non-incoming Pass at d=4 ([-1,-1]) -> War at [-1,0] picks d=2 (SW).
    await kp.click('.pal-item[data-tool="pass"]');
    await clickCenter([-1, -1]);
    await kp.keyboard.press('e'); // NE = 5
    const passKeys = await kp.textContent('.inspector .keys');
    check(!/floor|next port/.test(passKeys), `1-port required Pass omits "floor" and "next port" in keys hint ("${passKeys.trim()}")`);
    // With a 1-port Pass selected and focus on body, Tab moves focus to a button instead of trapping.
    await kp.evaluate(() => document.activeElement?.blur?.());
    await kp.keyboard.press('Tab');
    check(await kp.evaluate(() => document.activeElement?.tagName) === 'BUTTON',
      'Tab with a 1-port croupier selected enters button navigation instead of trapping');
    await kp.evaluate(() => document.activeElement?.blur?.());
    await kp.click('.pal-item[data-tool="war"]');
    await clickCenter([-1, 0]);
    let hc = await savedCells('high-card');
    check(hc.find((c) => c.fn === 'war')?.dealer === 2,
      `War with 1 incoming arrow (W) and occupied non-input neighbour (NW) points dealer SW (got ${hc.find((c) => c.fn === 'war')?.dealer})`);
    const warKeys = await kp.textContent('.inspector .keys');
    check(/floor/.test(warKeys) && /next port/.test(warKeys),
      `multi-port War shows both "floor" and "next port" in keys hint ("${warKeys.trim()}")`);

    // 2 incoming arrows into [0,-1]: Pass at [-1,-1] (d=3, pointing E=0) and Pass at [-1,0] (d=2, pointing NE=5).
    await kp.keyboard.press('Delete'); // remove War at [-1,0]
    await clickCenter([-1, -1]);
    await kp.keyboard.press('d'); // E = 0 -> [0,-1]
    await kp.click('.pal-item[data-tool="pass"]');
    await clickCenter([-1, 0]);
    await kp.keyboard.press('e'); // NE = 5 -> [0,-1]; lastSelected is '-1,0' (d=2)
    await kp.click('.pal-item[data-tool="war"]');
    await clickCenter([0, -1]);
    hc = await savedCells('high-card');
    check(hc.find((c) => c.fn === 'war')?.dealer === 3,
      `War with 2 incoming arrows avoids previously-selected Pass (SW) and points dealer W (got ${hc.find((c) => c.fn === 'war')?.dealer})`);
    await kp.keyboard.press('Control+z'); // undo War
    await clickCenter([-1, -1]); // select Pass at [-1,-1], so lastSelected is '-1,-1' (d=3)
    await kp.click('.pal-item[data-tool="war"]');
    await clickCenter([0, -1]);
    hc = await savedCells('high-card');
    check(hc.find((c) => c.fn === 'war')?.dealer === 2,
      `War with 2 incoming arrows avoids previously-selected Pass (W) and points dealer SW (got ${hc.find((c) => c.fn === 'war')?.dealer})`);

    // 0 incoming arrows: clear floor, set lastSide = 4 (NW -> oppLast = 1, SE).
    await kp.click('.pal-tools .btn.danger');
    await kp.click('.pal-item[data-tool="pass"]');
    await clickCenter([-2, 1]);
    await kp.keyboard.press('q'); // NW = 4 -> oppLast = 1 (SE)
    await kp.click('.pal-item[data-tool="war"]');
    await clickCenter([0, -1]); // d=1 ([0,0]) is occupied by fixed desk -> avoids 1, picks 2 (SW)
    hc = await savedCells('high-card');
    check(hc.find((c) => c.fn === 'war' && c.at.join() === '0,-1')?.dealer === 2,
      `War with 0 incoming arrows avoids occupied non-input desk at oppLast (SE) and picks SW (got ${hc.find((c) => c.fn === 'war' && c.at.join() === '0,-1')?.dealer})`);
    await kp.click('.pal-item[data-tool="war"]');
    await clickCenter([-1, -1]); // d=1 ([-1,0]) is empty -> picks oppLast (1) directly
    hc = await savedCells('high-card');
    check(hc.find((c) => c.fn === 'war' && c.at.join() === '-1,-1')?.dealer === 1,
      `War with 0 incoming arrows and empty oppLast hex points dealer opposite lastSide (got ${hc.find((c) => c.fn === 'war' && c.at.join() === '-1,-1')?.dealer})`);

    // 4. listField keyboard: Tab to .lf-ctx-bar, Shift+ArrowLeft, and paste when !sel.
    await kp.click('.pal-tools .btn.danger');
    await kp.click('.pal-item[data-tool="shoe"]');
    await clickCenter([-1, 0]);
    await kp.click('.inspector [data-view="text"]');
    await kp.fill('.lf-textarea', 'AS KH QD');
    await kp.locator('.lf-textarea').evaluate((el) => el.blur());
    await kp.click('.inspector [data-view="cards"]');
    await kp.locator('.lf-chips .lf-e').nth(1).click(); // select KH
    for (let i = 0; i < 3; i++) await kp.keyboard.press('Tab'); // past Cards & Text view buttons into .lf-ctx-bar
    check(await kp.evaluate(() => !!document.activeElement?.closest('.lf-ctx-bar')) && await kp.locator('.lf-chips .lf-e.sel').count() === 1,
      'listField: Tab with a selected chip reaches .lf-ctx-bar without dropping the selection');
    await kp.focus('.lf-chips');
    await kp.keyboard.press('Shift+ArrowLeft');
    check(await kp.locator('.lf-chips .lf-e.sel').count() === 2,
      'listField: Shift+ArrowLeft from a single selected chip extends selection leftward to 2 chips');
    await kp.locator('.lf-chips .lf-e').nth(1).click();
    await kp.keyboard.press('Backspace'); // removes KH, leaving !sel and caret = 1
    await kp.evaluate(() => {
      const dt = new DataTransfer();
      dt.setData('text/plain', 'TC 9D');
      document.querySelector('.lf-chips').dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
    });
    hc = await savedCells('high-card');
    check(JSON.stringify(hc.find((c) => c.kind === 'shoe')?.deck) === JSON.stringify(['AS', 'TC', '9D', 'QD']),
      `listField: pasting with no selection inserts at the caret (${JSON.stringify(hc.find((c) => c.kind === 'shoe')?.deck)})`);

    // 5. ARIA labels on icon buttons & non-colour pass/fail badges on .test-chip.
    await kp.evaluate(() => document.activeElement?.blur?.());
    await kp.keyboard.press('Control+a'); // open .lift-bar
    const unlabelled = await kp.$$eval(
      '.zoom button, .history button, .transport .tp, .lift-bar button, .test-chip',
      (bs) => bs.filter((b) => !b.getAttribute('aria-label')).map((b) => b.className),
    );
    check(unlabelled.length === 0, `icon-only controls and test chips all have aria-labels${unlabelled.length ? ': ' + unlabelled.join(', ') : ''}`);
    await kp.keyboard.press('Escape');
    await clickCenter([-1, 0]);
    const sideUnlabelled = await kp.$$eval('.inspector .side-btn', (bs) => bs.filter((b) => !b.getAttribute('aria-label')).length);
    check(sideUnlabelled === 0 && await kp.locator('.inspector .side-btn').count() === 6, 'inspector side buttons all have aria-labels');
    await kctx.close();
  }

  // The privacy notice, a page of its own (no scripts; checked for CSP
  // errors and requests below).
  {
    const { page } = await makeDesktopPage();
    try {
      await page.goto(`${base}privacy.html`);
      await page.waitForSelector('main.doc h1');
      check(/Delete my data/.test(await page.textContent('main.doc')) && await page.locator('main.doc a[href="./"]').count() === 1,
        'the privacy notice loads, with a way back to the game');
      if (shots) await page.screenshot({ path: join(shots, 'privacy.png'), fullPage: true });
    } finally {
      await page.close();
    }
  }
    },
  ]);

  check(errors.length === 0, `no page errors${errors.length ? ': ' + errors.join(' | ') : ''}`);
  check(external.length === 0, `signed out, no requests to other sites${external.length ? ': ' + external.slice(0, 3).join(' ') : ''}`);
} finally {
  await browser.close();
  server.kill();
}
console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
process.exit(failures ? 1 : 0);
