// Browser test for the Lowers and Uppers tabs: draw runs, drop appliance markers, tap corners.
//   node tests/e2e/cabinets.mjs
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { loadPlaywright, serve } from './helpers.mjs';

const { chromium } = loadPlaywright();
const server = await serve();
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1180, height: 820 }, serviceWorkers: 'block' });
const page = await ctx.newPage();
page.on('dialog', (d) => d.accept(d.type() === 'prompt' ? 'Cabinet test' : undefined));
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

let failed = 0;
const check = (name, ok) => {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`);
};

// A 156 x 120 room: a window over the sink on the top wall, a door on the right wall.
const preset = {
  name: '',
  room: {
    start: { x: 0, y: 0 },
    dirs: [0, 2, 4, 6],
    base: [156, 120, 156, 120],
    known: [156, 120, 156, 120],
    construction: [false, false, false, false],
    openings: [
      { id: 1, wall: 0, kind: 'window', t: 0.5, drawW: 48, ro: 48, cc: 52, sill: 42, h: 40, pos: null, ref: { id: null, side: 'before' }, swing: null },
      { id: 2, wall: 1, kind: 'door', t: 0.85, drawW: 36, ro: 36, cc: 40, sill: null, h: null, pos: null, ref: { id: null, side: 'before' }, swing: { hinge: 0, side: 1 } },
    ],
  },
  markers: [
    { id: 3, type: 'plumbing', x: 78, y: 5 },
    { id: 4, type: 'outlet', x: 20, y: 5 },
    { id: 5, type: 'gas', x: 128, y: 5 },
  ],
  ceiling: 96,
  nextId: 10,
  runs: [],
  cornerPicks: {},
  upper: { height: null, crown: 0, rail: 0 },
};
await page.goto(server.base);
await page.evaluate((s) => localStorage.setItem('fieldsketch.v1', JSON.stringify(s)), preset);
await page.reload();
await page.waitForSelector('#canvas');

const box = () => page.locator('#canvas').boundingBox();
const S = () => page.evaluate(() => JSON.parse(JSON.stringify(window.__fieldsketch.store.get())));
const V = () => page.evaluate(() => ({ ...window.__fieldsketch.view }));
const w2s = async (x, y) => {
  const v = await V();
  return [x * v.s + v.ox, y * v.s + v.oy];
};
async function stroke(pts, step = 6) {
  const b = await box();
  const P = pts.map(([x, y]) => [b.x + x, b.y + y]);
  await page.mouse.move(...P[0]);
  await page.mouse.down();
  for (let i = 1; i < P.length; i++) {
    const [ax, ay] = P[i - 1];
    const [bx, by] = P[i];
    const n = Math.max(1, Math.round(Math.hypot(bx - ax, by - ay) / step));
    for (let j = 1; j <= n; j++) await page.mouse.move(ax + ((bx - ax) * j) / n, ay + ((by - ay) * j) / n);
  }
  await page.mouse.up();
}
const dragWorld = async (a, b) => stroke([await w2s(...a), await w2s(...b)]);
const tapWorld = async (x, y) => {
  const b = await box();
  const [sx, sy] = await w2s(x, y);
  await page.mouse.click(b.x + sx, b.y + sy);
};
const layouts = () =>
  page.evaluate(async () => {
    const st = await import('./src/store.js');
    const lay = await import('./src/layout.js');
    const state = window.__fieldsketch.store.get();
    const l = lay.computeLayouts(state, st.deriveRoom(state.room));
    const strip = (x) => x.runs.map((r) => ({ id: r.run.id, boxes: r.boxes.map((b) => ({ k: b.kind, t: b.type, l: b.label, u0: b.u0, u1: b.u1 })) }));
    return { lower: strip(l.lower), upper: strip(l.upper), notes: l.lower.notes.map((n) => n.text) };
  });

await page.click('.tab[data-tab="lowers"]');
check('the Lowers tab shows the cabinet pencil and appliance tools', (await page.locator('#tray [data-cab]').count()) === 11);

// Run along the whole top wall, drawn a little inside the wall.
await dragWorld([3, 12], [153, 12]);
let s = await S();
check('a drag along the wall makes a run snapped to both corners', s.runs.length === 1 && s.runs[0].u0 === 0 && s.runs[0].u1 === 156 && s.runs[0].wall === 0);
let L = await layouts();
check('the run is filled edge to edge', Math.abs(L.lower[0].boxes.reduce((t, b) => t + (b.u1 - b.u0), 0) - 156) < 1e-6);
check('the missing dishwasher is called out', L.notes.some((n) => /No dishwasher/.test(n)));

// Sink under the window, dishwasher beside it, range on the gas.
await page.click('[data-cab="sink"]');
await tapWorld(76, 14);
check('dropping a sink asks how wide', (await page.locator('.kp-title').innerText()).includes('Sink width'));
for (const ch of '27') await page.click(`.key[data-d="${ch}"]`);
await page.click('[data-act="next"]');
await page.click('[data-cab="dishwasher"]');
await tapWorld(104, 14);
await page.click('[data-act="next"]');
await page.click('[data-cab="range"]');
await tapWorld(128, 14);
await page.click('[data-act="next"]');
s = await S();
check('sink took the width typed in', s.markers.find((m) => m.type === 'sink').w === 27);
L = await layouts();
const labels = L.lower[0].boxes.map((b) => b.l);
check('sink box, dishwasher and range are all in the run', labels.some((l) => /^SB/.test(l)) && labels.some((l) => /^DW/.test(l)) && labels.some((l) => /^RNG 30/.test(l)));
check('no dishwasher note once one is marked', !L.notes.some((n) => /No dishwasher/.test(n)));
const sink = L.lower[0].boxes.find((b) => b.t === 'sink');
check('the sink box covers the plumbing and sits on the window center', sink.u0 <= 78 && sink.u1 >= 78 && Math.abs((sink.u0 + sink.u1) / 2 - 78) < 3);
const rng = L.lower[0].boxes.find((b) => b.t === 'range');
check('the range stays over its gas hookup', rng.u0 <= 128 && rng.u1 >= 128);

// Dragging an appliance marker re-lays the run.
await page.click('[data-cab="select"]');
const dw = s.markers.find((m) => m.type === 'dishwasher');
const [mx, my] = await w2s(dw.x, dw.y);
await stroke([[mx, my], [mx + 20, my + 4], [mx + 40, my + 4]], 4);
s = await S();
check('dragging a marker moves it', s.markers.find((m) => m.type === 'dishwasher').x > dw.x + 5);

// Second run down the right wall makes a blind corner; tap it to cycle.
await page.click('[data-cab="cabinets"]');
await dragWorld([144, 4], [144, 117]);
s = await S();
check('a run on the next wall is created', s.runs.length === 2 && s.runs[1].wall === 1);
L = await layouts();
const corners = L.lower.flatMap((r) => r.boxes.filter((b) => b.k === 'corner'));
check('exactly one blind corner cabinet', corners.length === 1);
const before = corners[0].l;
await tapWorld(corners[0].u1 - 6, 12);
L = await layouts();
const diag = L.lower.flatMap((r) => r.boxes.filter((b) => b.k === 'diag'));
check(`tapping the corner goes blind ${before} -> diagonal ${diag[0] && diag[0].l}`, diag.length === 1 && diag[0].l === 'DC36' && !L.lower.some((r) => r.boxes.some((b) => b.k === 'corner')));
s = await S();
check('the choice is saved', Object.keys(s.cornerPicks).length === 1);
// Tapping the diagonal goes on to the next blind size, then round again.
const centre = await page.evaluate(async () => {
  const st = await import('./src/store.js');
  const lay = await import('./src/layout.js');
  const state = window.__fieldsketch.store.get();
  const l = lay.computeLayouts(state, st.deriveRoom(state.room));
  const b = l.lower.runs.flatMap((r) => r.boxes).find((x) => x.kind === 'diag');
  return { x: b.poly.reduce((t, q) => t + q.x, 0) / b.poly.length, y: b.poly.reduce((t, q) => t + q.y, 0) / b.poly.length };
});
await tapWorld(centre.x, centre.y);
L = await layouts();
check('next tap gives the 39 blind corner', L.lower.some((r) => r.boxes.some((b) => b.k === 'corner' && /39/.test(b.l))));
await tapWorld(144, 12);
await tapWorld(144, 12);
L = await layouts();
check('and it cycles back round to the blind 36', L.lower.some((r) => r.boxes.some((b) => b.k === 'corner' && b.l === 'BBC36')));

// Delete a run from the panel.
await tapWorld(144, 70);
check('tapping a box selects its run', (await page.locator('.run.sel').count()) === 1);
await page.click('[data-act="del-run"]');
s = await S();
check('delete run removes it', s.runs.length === 1);

// Island in open floor.
await dragWorld([40, 80], [110, 80]);
s = await S();
check('a drag in open floor makes an island', s.runs.length === 2 && s.runs[1].kind === 'free');

// Uppers.
await page.click('.tab[data-tab="uppers"]');
await page.click('[data-act="corner-field"][data-field="crown"]');
await page.click('.key[data-d="3"]');
await page.click('[data-act="next"]');
s = await S();
check('crown is set per drawing', s.upper.crown === 3);
await page.click('[data-act="corner-field"][data-field="rail"]');
await page.click('.key[data-d="0"]');
await page.click('[data-act="next"]');
s = await S();
check('light rail accepts 0', s.upper.rail === 0);
await page.click('[data-act="corner-field"][data-field="height"]');
for (const ch of '42') await page.click(`.key[data-d="${ch}"]`);
await page.click('[data-act="next"]');
s = await S();
check('upper height is saved', s.upper.height === 42);
await dragWorld([3, 4], [153, 4]);
L = await layouts();
const up = L.upper[0].boxes;
check('uppers keep clear of the window plus crown', up.every((b) => b.u1 <= 78 - 26 - 1 - 3 + 1e-6 || b.u0 >= 78 + 26 + 1 + 3 - 1e-6));
await page.screenshot({ path: path.join(os.tmpdir(), 'cabinets-uppers.png') });

// Save and open keep the cabinets.
const [download] = await Promise.all([page.waitForEvent('download'), page.click('#save')]);
const file = path.join(os.tmpdir(), download.suggestedFilename());
await download.saveAs(file);
const before2 = await S();
await page.click('#new');
check('new sketch clears the runs', (await S()).runs.length === 0);
await page.setInputFiles('#file', file);
await page.waitForFunction(() => window.__fieldsketch.store.get().runs.length > 0);
const after2 = await S();
check('opening the file brings the cabinets back', after2.runs.length === before2.runs.length && after2.upper.crown === 3 && Object.keys(after2.cornerPicks).length === 1);

// One swipe around an inside corner makes a run on each wall (not a diagonal).
await page.evaluate((st) => localStorage.setItem('fieldsketch.v1', JSON.stringify(st)), preset);
await page.reload();
await page.waitForSelector('#canvas');
await page.click('.tab[data-tab="lowers"]');
{
  const [a, b, c] = [await w2s(3, 12), await w2s(144, 12), await w2s(144, 117)];
  await stroke([a, b, c]);
  s = await S();
  check('one swipe around a corner makes two runs, one per wall', s.runs.length === 2 && s.runs.map((r) => r.wall).sort().join() === '0,1');
  check('neither run is a diagonal island', s.runs.every((r) => r.kind === 'wall'));
  L = await layouts();
  check('they meet in a blind corner', L.lower.flatMap((r) => r.boxes.filter((bx) => bx.k === 'corner')).length === 1);
  check('and they do not overlap', L.lower.every((r) => r.boxes.every((bx, i, arr) => i === 0 || bx.u0 >= arr[i - 1].u1 - 1e-6)));
}

// Two swipes that meet near the corner also pair up instead of overlapping.
await page.evaluate((st) => localStorage.setItem('fieldsketch.v1', JSON.stringify(st)), preset);
await page.reload();
await page.waitForSelector('#canvas');
await page.click('.tab[data-tab="lowers"]');
await dragWorld([3, 12], [150, 12]);
await dragWorld([144, 18], [144, 117]);
s = await S();
check('two swipes near the corner both snap into it', s.runs.length === 2 && s.runs[0].u1 === 156 && s.runs[1].u0 === 0);
L = await layouts();
const second = L.lower.find((r) => r.id === s.runs[1].id);
check('the second run stops short of the first one\'s cabinets', second.boxes[0].u0 >= 24 - 1e-6);

// Rules tab, waste and microwave markers, cooks toggle.
await page.click('.tab[data-tab="checklist"]');
check('the Rules tab lists the kitchen rules', (await page.locator('.rule').count()) >= 15);
check('rules are grouped by need', (await page.locator('.panel-scroll h3').allInnerTexts()).some((t) => /check these/i.test(t)));
await page.click('.tab[data-tab="lowers"]');
check('the Lowers tab says how many rules need attention', (await page.locator('.rules-banner').count()) === 1);
const cooks0 = await page.locator('#corner [data-act="cooks"] b').innerText();
await page.click('#corner [data-act="cooks"]');
check('the cooks chip toggles one / more than one', (await page.locator('#corner [data-act="cooks"] b').innerText()) !== cooks0 && (await S()).kitchen.cooks === 2);
await page.click('.tab[data-tab="uppers"]');
check('the Uppers tab offers the microwave', (await page.locator('#tray [data-cab="microwave"]').count()) === 1);
await page.click('[data-cab="microwave"]');
await tapWorld(40, 10);
await page.click('[data-act="next"]');
s = await S();
check('a microwave marker is placed with its width', s.markers.some((m) => m.type === 'microwave' && m.w === 30));

check('no console or page errors', errors.length === 0);
if (errors.length) console.log(errors);
await browser.close();
server.close();
process.exit(failed ? 1 : 0);
