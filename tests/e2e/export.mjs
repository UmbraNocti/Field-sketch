// Browser test for Export: the PDF and the image come out with the dimension lists in them.
//   node tests/e2e/export.mjs
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { loadPlaywright, serve } from './helpers.mjs';

const { chromium } = loadPlaywright();
const server = await serve();
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1180, height: 820 }, serviceWorkers: 'block', acceptDownloads: true });
const page = await ctx.newPage();
page.on('dialog', (d) => d.accept(d.type() === 'prompt' ? 'Smith kitchen' : undefined));
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

let failed = 0;
const check = (name, ok) => {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`);
};

const preset = {
  name: '',
  room: {
    start: { x: 0, y: 0 },
    dirs: [0, 2, 4, 6],
    base: [156, 120, 156, 120],
    known: [156, 120, 156, 120],
    construction: [false, false, false, false],
    openings: [
      { id: 1, wall: 0, kind: 'window', t: 0.5, drawW: 48, ro: 48, cc: 52, sill: 42, h: 40, pos: 24.5, ref: { id: null, side: 'before' }, swing: null },
      { id: 2, wall: 1, kind: 'door', t: 0.85, drawW: 36, ro: 36, cc: 40, sill: null, h: null, pos: 0, ref: { id: null, side: 'after' }, swing: { hinge: 0, side: 1 } },
    ],
  },
  markers: [
    { id: 5, type: 'plumbing', x: 78, y: 5 },
    { id: 6, type: 'sink', x: 78, y: 14, w: 24 },
    { id: 7, type: 'range', x: 128, y: 14, w: 30 },
    { id: 8, type: 'gas', x: 128, y: 5 },
  ],
  ceiling: 96,
  nextId: 30,
  runs: [
    { id: 20, layer: 'lower', kind: 'wall', wall: 0, u0: 0, u1: 156 },
    { id: 21, layer: 'upper', kind: 'wall', wall: 0, u0: 0, u1: 156 },
  ],
  cornerPicks: {},
  upper: { height: 42, crown: 3, rail: 0 },
};
await page.goto(server.base);
await page.evaluate((s) => localStorage.setItem('fieldsketch.v1', JSON.stringify(s)), preset);
await page.reload();
await page.waitForSelector('#canvas');

await page.click('#export');
check('the export sheet offers PDF and Image', (await page.locator('#sheet [data-export]').count()) === 3);
const [pdf] = await Promise.all([page.waitForEvent('download'), page.click('[data-export="pdf"]')]);
const pdfPath = path.join(os.tmpdir(), pdf.suggestedFilename());
await pdf.saveAs(pdfPath);
check('the PDF is named for the job', /^smith-kitchen-\d{4}-\d{2}-\d{2}\.pdf$/.test(pdf.suggestedFilename()));
const head = fs.readFileSync(pdfPath).subarray(0, 8).toString('latin1');
check('it is a PDF', head.startsWith('%PDF-1.4'));
let text = '';
try {
  text = execFileSync('pdftotext', ['-layout', pdfPath, '-'], { encoding: 'utf8' });
} catch {
  console.log('SKIP pdftotext not installed: checking raw bytes instead');
  text = fs.readFileSync(pdfPath).toString('latin1');
}
check('page one lists the window and door with sizes and positions', ['Window 1', 'Door 1', '48"', '52"', '24 1/2" from corner W4/W1', '0" from corner W2/W3', 'Sill height', 'Swing'].every((t) => text.includes(t)));
check('the walls and ceiling are listed', text.includes('156"') && text.includes('Ceiling') && text.includes('96"'));
check('the cabinet pages list the runs and the order summary', /SB\d+/.test(text) && text.includes('ORDER SUMMARY') && text.includes('HOOD'));
check('upper settings are printed', text.includes('Crown') && text.includes('3"'));

await page.click('.tab[data-tab="lowers"]');
await page.click('#export');
const [png] = await Promise.all([page.waitForEvent('download'), page.click('[data-export="png"]')]);
const pngPath = path.join(os.tmpdir(), png.suggestedFilename());
await png.saveAs(pngPath);
const sig = fs.readFileSync(pngPath).subarray(0, 8);
check('the image is a PNG named for the tab', sig.equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) && /-lowers\.png$/.test(png.suggestedFilename()));

await page.click('#export');
await page.click('[data-export="cancel"]');
check('cancel closes the sheet', await page.locator('#sheet').isHidden());

await page.setViewportSize({ width: 390, height: 844 });
check('all the top bar buttons still fit on a phone', await page.evaluate(() => {
  const bar = document.querySelector('.bar-actions').getBoundingClientRect();
  return bar.right <= window.innerWidth && document.documentElement.scrollWidth <= window.innerWidth;
}));

check('no console or page errors', errors.length === 0);
if (errors.length) console.log(errors);
await browser.close();
server.close();
process.exit(failed ? 1 : 0);
