import test from 'node:test';
import assert from 'node:assert/strict';
import { blankState, newRoom, deriveRoom } from '../src/store.js';
import { computeLayouts, orderSummary } from '../src/layout.js';
import { buildReport } from '../src/report.js';
import { buildSketchPdf } from '../src/export.js';
import { PdfDoc, textWidth, wrapText } from '../src/pdf.js';
import { fileNameFor } from '../src/file.js';

function sample() {
  const s = blankState();
  s.name = 'Smith kitchen';
  s.room = newRoom({ start: { x: 0, y: 0 }, dirs: [0, 2, 4, 6], base: [156, 120, 156, 120] });
  s.room.known = [156, 120, 156, null];
  s.room.openings = [
    { id: 1, wall: 0, kind: 'window', t: 0.5, drawW: 48, ro: 48, cc: 52, sill: 42, h: 40, pos: 24.5, ref: { id: null, side: 'before' }, swing: null },
    { id: 2, wall: 1, kind: 'door', t: 0.85, drawW: 36, ro: 36, cc: 40, sill: null, h: null, pos: 0, ref: { id: null, side: 'after' }, swing: { hinge: 0, side: 1 } },
    { id: 3, wall: 2, kind: 'window', t: 0.3, drawW: 36, ro: null, cc: null, sill: null, h: null, pos: null, ref: { id: null, side: 'before' }, swing: null },
  ];
  s.markers = [
    { id: 5, type: 'plumbing', x: 78, y: 5 },
    { id: 6, type: 'column', x: 100, y: 60, w: 12, d: 16 },
    { id: 7, type: 'sink', x: 78, y: 14, w: 24 },
    { id: 8, type: 'range', x: 128, y: 14, w: 30 },
    { id: 9, type: 'gas', x: 128, y: 5 },
  ];
  s.ceiling = 96;
  s.nextId = 30;
  s.runs = [
    { id: 20, layer: 'lower', kind: 'wall', wall: 0, u0: 0, u1: 156 },
    { id: 21, layer: 'upper', kind: 'wall', wall: 0, u0: 0, u1: 156 },
  ];
  s.upper = { height: 42, crown: 3, rail: 0 };
  return s;
}
const make = () => {
  const s = sample();
  const d = deriveRoom(s.room);
  const l = computeLayouts(s, d);
  return { s, d, l, report: buildReport(s, d, l, new Date('2026-03-02T10:00:00Z')) };
};

test('the report lists every door and window with sizes and where it sits', () => {
  const { report } = make();
  assert.equal(report.openings.length, 3);
  const [w1, door, w2] = report.openings;
  assert.equal(w1.name, 'Window 1');
  assert.equal(w1.wall, 'W1');
  const pos = w1.lines.find((l) => l.k === 'Position');
  assert.equal(pos.v, '24 1/2" from corner W4/W1');
  assert.equal(w1.lines.find((l) => l.k === 'Rough opening').v, '48"');
  assert.equal(w1.lines.find((l) => l.k === 'Casing to casing').v, '52"');
  assert.equal(w1.lines.find((l) => l.k === 'Sill height').v, '42"');
  assert.equal(w1.lines.find((l) => l.k === 'Window height').v, '40"');
  assert.equal(w1.missing, false);
  assert.equal(door.lines.find((l) => l.k === 'Position').v, '0" from corner W2/W3');
  assert.match(door.lines.find((l) => l.k === 'Swing').v, /swings into the room, hinge toward corner W1\/W2/);
  assert.equal(w2.missing, true);
  assert.equal(w2.lines.find((l) => l.k === 'Rough opening').v, '?');
  assert.match(w2.lines.find((l) => l.k === 'Position').v, /^\? \(about .* from corner W2\/W3\)$/);
});

test('walls show measured lengths plainly and estimated ones marked', () => {
  const { report } = make();
  assert.deepEqual(report.walls.map((w) => w.value), ['156"', '120"', '156"', '~120"']);
  assert.deepEqual(report.walls.map((w) => w.measured), [true, true, true, false]);
  assert.equal(report.ceiling, '96"');
});

test('utilities and appliances say which wall, how far along, and how far off it', () => {
  const { report } = make();
  assert.ok(report.utilities.some((u) => u.name === 'Plumbing' && u.where === 'W1, 78" from corner W4/W1, 5" off the wall'));
  assert.ok(report.utilities.some((u) => /^Column 12" x 16"/.test(u.name)));
  assert.ok(report.appliances.some((a) => a.name === 'Sink 24"'));
});

test('the order summary leaves out appliance openings and hood places', () => {
  const { l } = make();
  const lower = orderSummary(l.lower).map((c) => c.label);
  assert.ok(lower.some((x) => /^SB/.test(x)));
  assert.ok(!lower.some((x) => /^RNG/.test(x)));
  const upper = orderSummary(l.upper).map((c) => c.label);
  assert.ok(!upper.some((x) => /^HOOD/.test(x)));
  assert.ok(upper.every((x) => /^(W\d|F )/.test(x)));
});

test('the PDF is a real, well-formed document with the lists in it', () => {
  const { report } = make();
  const img = { jpeg: new Uint8Array([0xff, 0xd8, 0xff, 0xd9]), w: 10, h: 10 };
  const bytes = buildSketchPdf(report, { room: img, lower: img, upper: img });
  const text = Buffer.from(bytes).toString('latin1');
  assert.ok(text.startsWith('%PDF-1.4'));
  assert.ok(text.trimEnd().endsWith('%%EOF'));
  assert.equal((text.match(/\/Type \/Page /g) || []).length, 3);
  for (const needle of ['Smith kitchen', 'Window 1', '24 1/2\\" from corner W4/W1'.replace('\\"', '"'), 'Door 1', 'Rough opening', 'Casing to casing', 'Swing']) {
    assert.ok(text.includes(needle.replace(/\(/g, '\\(')) || text.includes(needle), needle);
  }
  // The cross-reference table points at every object.
  const startxref = Number(text.match(/startxref\n(\d+)/)[1]);
  assert.ok(text.slice(startxref).startsWith('xref'));
  const offsets = [...text.slice(startxref).matchAll(/^(\d{10}) 00000 n $/gm)].map((m) => Number(m[1]));
  offsets.forEach((o, i) => assert.ok(text.slice(o).startsWith(`${i + 1} 0 obj`), `object ${i + 1} at ${o}`));
});

test('lower and upper pages only appear when there is something on them', () => {
  const s = sample();
  s.runs = [];
  s.markers = [];
  const d = deriveRoom(s.room);
  const report = buildReport(s, d, computeLayouts(s, d));
  const img = { jpeg: new Uint8Array([0xff, 0xd8, 0xff, 0xd9]), w: 10, h: 10 };
  const bytes = buildSketchPdf(report, { room: img, lower: null, upper: null });
  assert.equal((Buffer.from(bytes).toString('latin1').match(/\/Type \/Page /g) || []).length, 1);
});

test('a long list spills onto a continuation page instead of running off the sheet', () => {
  const s = sample();
  for (let i = 0; i < 14; i++) s.room.openings.push({ id: 40 + i, wall: 2, kind: 'window', t: 0.05 * i + 0.1, drawW: 12, ro: 12, cc: 14, sill: 40, h: 30, pos: 5, ref: { id: null, side: 'before' }, swing: null });
  const d = deriveRoom(s.room);
  const report = buildReport(s, d, computeLayouts(s, d));
  const img = { jpeg: new Uint8Array([0xff, 0xd8, 0xff, 0xd9]), w: 10, h: 10 };
  const text = Buffer.from(buildSketchPdf(report, { room: img, lower: img, upper: img })).toString('latin1');
  assert.ok((text.match(/\/Type \/Page /g) || []).length > 3);
  assert.ok(text.includes('\\(continued\\)'));
});

test('text is measured and wrapped to fit a column', () => {
  assert.ok(textWidth('Window 1', 10) > 30);
  const lines = wrapText('swings into the room, hinge toward corner W1/W2', 100, 9);
  assert.ok(lines.length > 1);
  assert.ok(lines.every((l) => textWidth(l, 9) <= 100 + 1e-6));
});

test('odd characters become something Helvetica can print', () => {
  const d = new PdfDoc({ title: 'x' });
  d.addPage().text(10, 10, 'W1 · 36″ ≈ 中 (a) \\');
  const text = Buffer.from(d.build()).toString('latin1');
  assert.ok(text.includes('\\(a\\)'));
  assert.ok(text.includes('36"'));
  assert.ok(!text.includes('中'));
});

test('export file names carry the job name, date and kind', () => {
  const d = new Date('2026-03-02T10:00:00Z');
  assert.equal(fileNameFor({ name: 'Smith Kitchen' }, d, '.pdf'), 'smith-kitchen-2026-03-02.pdf');
  assert.equal(fileNameFor({ name: 'Smith Kitchen' }, d, '-lowers.png'), 'smith-kitchen-2026-03-02-lowers.png');
});
