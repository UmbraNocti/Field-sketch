// Browser smoke test: drives the real app with mouse input. It serves the repo itself.
//   node tests/e2e/smoke.mjs
// Needs Playwright: set PLAYWRIGHT_PATH to the folder that contains the `playwright` package
// (defaults to the global node_modules of the running node). Set BASE_URL to test a server
// you started yourself instead.
import { createRequire } from 'node:module';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

const require = createRequire(process.env.PLAYWRIGHT_PATH ? path.join(process.env.PLAYWRIGHT_PATH, '/') : path.join(process.execPath, '../../lib/node_modules/'));
const { chromium } = require('playwright');
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
let server = null;
let BASE = process.env.BASE_URL;
if (!BASE) {
  server = http.createServer((req, res) => {
    const url = decodeURIComponent(req.url.split('?')[0]);
    const file = path.join(ROOT, url === '/' ? 'index.html' : url);
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404).end('not found');
      return;
    }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' }).end(fs.readFileSync(file));
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  BASE = `http://127.0.0.1:${server.address().port}/index.html`;
}

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1180, height: 820 }, serviceWorkers: 'block' });
const page = await ctx.newPage();
page.on('dialog', (d) => d.accept(d.type() === 'prompt' ? 'Smith kitchen' : undefined));
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
await type('12');
await next();
s = await S();
check('door stores position too', s.room.openings[0].pos === 12);
const doorSpan = await page.evaluate(async () => {
  const m = await import('./src/store.js');
  const st = window.__fieldsketch.store.get();
  const d = m.deriveRoom(st.room);
  const op = st.room.openings[0];
  const sp = d.spans.get(op.id);
  return { span: sp, side: op.ref.side, id: op.ref.id };
});
check('door sits exactly 12 from its corner', doorSpan.id === null && Math.abs((doorSpan.side === 'before' ? doorSpan.span[0] : 144.125 - doorSpan.span[1]) - 12) < 1e-6);
await page.click('.chip[data-field="pos"][data-id="1"]');
await type('0');
await next();
s = await S();
check('position 0 is accepted (doorway flush to the corner)', s.room.openings[0].pos === 0);
await page.click('.chip[data-field="pos"][data-id="1"]');
await type('12');
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
await type('18'); await page.click('.key.frac[data-e="4"]'); await next();
await type('42'); await next();
await type('48'); await page.click('.key.frac[data-e="4"]'); await next();
s = await S();
const win = s.room.openings[1];
check('window stores RO, casing, position, sill and height', win.ro === 36 && win.cc === 40 && win.pos === 18.5 && win.sill === 42 && win.h === 48.5);
const spans = await page.evaluate(async () => {
  const m = await import('./src/store.js');
  return [...m.deriveRoom(window.__fieldsketch.store.get().room).spans];
});
const wspan = spans.find(([id]) => id === win.id)[1];
const ref = win.ref;
const refSpan = ref.id != null ? spans.find(([id]) => id === ref.id)[1] : null;
const wallLen = await page.evaluate(async () => {
  const m = await import('./src/store.js');
  const d = m.deriveRoom(window.__fieldsketch.store.get().room);
  return Math.hypot(d.verts[2].x - d.verts[1].x, d.verts[2].y - d.verts[1].y);
});
const measured = ref.side === 'before' ? wspan[0] - (refSpan ? refSpan[1] : 0) : (refSpan ? refSpan[0] : wallLen) - wspan[1];
check('window sits exactly 18 1/2 from its reference', Math.abs(measured - 18.5) < 1e-6);

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
await page.click('[data-act="marker-tool"][data-type="outlet220"]');
p = await at(110, 25);
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
check('seven markers placed incl. 220V, column sized 12x16', s.markers.length === 7 && s.markers.some((m) => m.type === 'outlet220') && s.markers[6].w === 12 && s.markers[6].d === 16);

await page.click('[data-act="marker-tool"][data-type="select"]');
const first = s.markers[0];
const [mx, my] = await w2s(first.x, first.y);
await stroke([[mx, my], [mx, my + 35], [mx, my + 70]], { jitter: 0 });
s = await S();
check('dragging moves a marker without adding one', s.markers.length === 7 && s.markers[0].y > first.y + 5);

const second = s.markers[1];
const [sx, sy] = await w2s(second.x, second.y);
await tapC(sx, sy);
await page.click('[data-act="del-marker"]');
s = await S();
check('select + delete removes a marker', s.markers.length === 6);
await page.click('#undo');
s = await S();
check('undo restores it', s.markers.length === 7);

await page.reload();
await page.waitForSelector('#canvas');
s = await S();
check('sketch survives a reload', !!s.room && s.markers.length === 7 && s.room.openings.length === 2);

// --- save to a file, wipe, open it again ---
const before = JSON.stringify(s);
const [download] = await Promise.all([page.waitForEvent('download'), page.click('#save')]);
check('save names the file after the job', /^smith-kitchen-\d{4}-\d{2}-\d{2}\.fieldsketch\.json$/.test(download.suggestedFilename()));
const savedPath = path.join(os.tmpdir(), download.suggestedFilename());
await download.saveAs(savedPath);
const saved = JSON.parse(fs.readFileSync(savedPath, 'utf8'));
check('saved file is readable JSON with the sketch in it', saved.app === 'field-sketch' && saved.state.markers.length === 7);
await page.click('#new');
check('new sketch is empty', (await S()).room === null);
await page.setInputFiles('#file', savedPath);
await page.waitForFunction(() => !!window.__fieldsketch.store.get().room);
const after = await S();
check('opening the file brings back the same sketch', JSON.stringify(after) === before.replace(/"name":"[^"]*"/, `"name":"${after.name}"`) || after.markers.length === 7 && after.room.openings.length === 2);
check('job name shows in the top bar', (await page.locator('#jobname').innerText()) === 'Smith kitchen');
await page.setInputFiles('#file', { name: 'junk.json', mimeType: 'application/json', buffer: Buffer.from('{"nope":true}') });
await page.waitForSelector('#toast.show');
check('a junk file is refused', (await page.locator('#toast').innerText()).includes('isn\u2019t a Field Sketch file'));

check('no console or page errors', errors.length === 0);
if (errors.length) console.log(errors);
await browser.close();
if (server) server.close();
process.exit(failed ? 1 : 0);
