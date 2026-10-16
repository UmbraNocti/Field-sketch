// Browser smoke test: drives the real app with mouse input.
//   python3 -m http.server 8080 &      (from the repo root)
//   node tests/e2e/smoke.mjs
// Needs Playwright: set PLAYWRIGHT_PATH to the folder that contains the `playwright` package
// (defaults to the global node_modules of the running node) and BASE_URL if not on :8080.
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(process.env.PLAYWRIGHT_PATH ? path.join(process.env.PLAYWRIGHT_PATH, '/') : path.join(process.execPath, '../../lib/node_modules/'));
const { chromium } = require('playwright');
const BASE = process.env.BASE_URL || 'http://localhost:8080/index.html';

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1180, height: 820 }, serviceWorkers: 'block' });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.goto(BASE);
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.waitForSelector('#canvas');

let failed = 0;
const check = (name, ok) => {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`);
};

const box = () => page.locator('#canvas').boundingBox();
const S = () => page.evaluate(() => JSON.parse(JSON.stringify(window.__fieldsketch.store.get())));
const V = () => page.evaluate(() => ({ ...window.__fieldsketch.view }));
// World inches -> canvas px
const w2s = async (x, y) => {
  const v = await V();
  return [x * v.s + v.ox, y * v.s + v.oy];
};
async function stroke(pts, { step = 5, jitter = 2 } = {}) {
  const b = await box();
  const P = pts.map(([x, y]) => [b.x + x, b.y + y]);
  await page.mouse.move(...P[0]);
  await page.mouse.down();
  for (let i = 1; i < P.length; i++) {
    const [ax, ay] = P[i - 1];
    const [bx, by] = P[i];
    const n = Math.max(1, Math.round(Math.hypot(bx - ax, by - ay) / step));
    for (let j = 1; j <= n; j++) {
      await page.mouse.move(ax + ((bx - ax) * j) / n + (Math.random() - 0.5) * jitter, ay + ((by - ay) * j) / n + (Math.random() - 0.5) * jitter);
    }
  }
  await page.mouse.up();
}
const tapC = async (x, y) => {
  const b = await box();
  await page.mouse.click(b.x + x, b.y + y);
};
const type = async (str) => {
  for (const ch of str) await page.click(`.key[data-d="${ch}"]`);
};
const next = () => page.click('[data-act="next"]');

// --- walls ---
await stroke([[120, 120], [520, 128], [510, 360], [118, 352], [126, 124]]);
let s = await S();
check('wobbly rectangle becomes 4 walls', s.room && s.room.dirs.length === 4);

await type('144');
await page.click('.key.frac[data-e="1"]');
await next();
await type('120');
await next();
await type('144');
await page.click('.key.frac[data-e="1"]');
await next();
s = await S();
check('keypad enters 144 1/8 and 120', s.room.known[0] === 144.125 && s.room.known[1] === 120 && s.room.known[2] === 144.125);
check('fourth wall is solved, not entered', s.room.known[3] === null && (await page.locator('.status.ok').count()) === 1);

await page.click('[data-act="field"][data-kind="wall"][data-i="3"]');
await type('119');
await next();
check('mismatched wall flags the gap', (await page.locator('.status.bad').count()) === 1);
await page.click('[data-act="field"][data-kind="wall"][data-i="3"]');
await type('120');
await next();
check('fixing it closes again', (await page.locator('.status.ok').count()) === 1);

await page.click('[data-act="field"][data-kind="ceiling"]');
await type('96');
await next();
s = await S();
check('ceiling height saved', s.ceiling === 96);

// --- door arc ---
await page.click('.pencil[data-tool="door"]');
const st = s.room.start;
let v = await V();
let [x0, y0] = await w2s(st.x, st.y);
const hx = x0 + 30 * v.s;
const arc = [];
for (let i = 0; i <= 24; i++) {
  const a = (i / 24) * (Math.PI / 2);
  arc.push([hx + 36 * v.s * Math.cos(a), y0 + 36 * v.s * Math.sin(a)]);
}
await stroke(arc, { step: 4, jitter: 0.5 });
s = await S();
check('door arc makes a door with a swing', s.room.openings.length === 1 && s.room.openings[0].kind === 'door' && !!s.room.openings[0].swing);
await type('36');
await next();
await type('40');
await next();

// --- window: two lines across the right wall ---
await page.click('.pencil[data-tool="window"]');
v = await V();
const [xr, yr] = await w2s(st.x + 144.125, st.y);
await stroke([[xr - 14, yr + 60 * v.s], [xr + 14, yr + 60 * v.s]], { jitter: 0.5 });
check('first window line waits for the second', await page.evaluate(() => !!window.__fieldsketch.ui.pending));
await stroke([[xr - 14, yr + 96 * v.s], [xr + 14, yr + 96 * v.s]], { jitter: 0.5 });
s = await S();
check('two lines make a window', s.room.openings.length === 2 && s.room.openings[1].kind === 'window');
await type('36'); await next();
await type('40'); await next();
await type('42'); await next();
await type('48'); await page.click('.key.frac[data-e="4"]'); await next();
s = await S();
const win = s.room.openings[1];
check('window stores RO, casing, sill and height', win.ro === 36 && win.cc === 40 && win.sill === 42 && win.h === 48.5);

// --- construction line ---
await page.click('.pencil[data-tool="construction"]');
const [xb, yb] = await w2s(st.x + 144.125, st.y + 120);
await stroke([[xb - 20, yb - 10], [xb - 200, yb + 10], [xb - 40, yb - 6], [xb - 220, yb + 8]], { jitter: 0.5 });
s = await S();
check('scribble turns the bottom wall into a construction line', s.room.construction[2] === true);

// --- markings ---
await page.click('.tab[data-tab="markings"]');
const at = async (wx, wy) => w2s(st.x + wx, st.y + wy);
await page.click('[data-act="marker-tool"][data-type="outlet"]');
let p = await at(30, 20);
await tapC(...p);
p = await at(60, 20);
await tapC(...p);
await page.click('[data-act="marker-tool"][data-type="plumbing"]');
p = await at(20, 100);
await tapC(...p);
await page.click('[data-act="marker-tool"][data-type="gas"]');
p = await at(120, 60);
await tapC(...p);
await page.click('[data-act="marker-tool"][data-type="vent"]');
p = await at(80, 60);
await tapC(...p);
await page.click('[data-act="marker-tool"][data-type="column"]');
p = await at(90, 90);
await tapC(...p);
await type('12');
await next();
await type('16');
await next();
s = await S();
check('six markers placed, column sized 12x16', s.markers.length === 6 && s.markers[5].w === 12 && s.markers[5].d === 16);

await page.click('[data-act="marker-tool"][data-type="select"]');
const first = s.markers[0];
const [mx, my] = await w2s(first.x, first.y);
await stroke([[mx, my], [mx, my + 35], [mx, my + 70]], { jitter: 0 });
s = await S();
check('dragging moves a marker without adding one', s.markers.length === 6 && s.markers[0].y > first.y + 5);

const second = s.markers[1];
const [sx, sy] = await w2s(second.x, second.y);
await tapC(sx, sy);
await page.click('[data-act="del-marker"]');
s = await S();
check('select + delete removes a marker', s.markers.length === 5);
await page.click('#undo');
s = await S();
check('undo restores it', s.markers.length === 6);

await page.reload();
await page.waitForSelector('#canvas');
s = await S();
check('sketch survives a reload', !!s.room && s.markers.length === 6 && s.room.openings.length === 2);

check('no console or page errors', errors.length === 0);
if (errors.length) console.log(errors);
await browser.close();
process.exit(failed ? 1 : 0);
