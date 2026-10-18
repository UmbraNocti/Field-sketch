import test from 'node:test';
import assert from 'node:assert/strict';
import { fillSegment, makeGapTable } from '../src/fill.js';

const SIZES = [15, 18, 21, 24, 27, 30, 33, 36, 39, 42];
const near = (a, b, tol = 1e-9) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);
const widths = (r) => r.boxes.map((b) => b.u1 - b.u0);
const total = (r) => r.boxes.reduce((t, b) => t + (b.u1 - b.u0), 0);

test('plain runs are covered edge to edge with no overlaps', () => {
  for (let len = 15; len <= 300; len += 0.5) {
    const r = fillSegment({ len, sizes: SIZES });
    near(total(r), len, 1e-6);
    let cursor = 0;
    for (const b of r.boxes) {
      near(b.u0, cursor, 1e-6);
      cursor = b.u1;
    }
  }
});

test('72 inches is two 36s and 144 is four 36s (fewest boxes, widest preferred size 36)', () => {
  assert.deepEqual(widths(fillSegment({ len: 72, sizes: SIZES })), [36, 36]);
  assert.deepEqual(widths(fillSegment({ len: 144, sizes: SIZES })), [36, 36, 36, 36]);
});

test('boxes are mirror images where the sizes allow it', () => {
  for (const len of [54, 90, 102, 120, 156, 171]) {
    const w = widths(fillSegment({ len, sizes: SIZES })).filter((x) => x >= 15);
    assert.deepEqual(w, w.slice().reverse(), `len ${len}: ${w}`);
  }
});

test('boxes only use standard sizes, and 39/42 stay unused unless the preferred maximum allows them', () => {
  const r = fillSegment({ len: 78, sizes: SIZES });
  assert.ok(widths(r).every((x) => SIZES.includes(x) && x <= 36));
  assert.deepEqual(widths(fillSegment({ len: 42, sizes: SIZES })), [21, 21]);
  // Raising the preferred maximum to 42 lets the fewest-boxes rule reach for the widest size.
  assert.deepEqual(widths(fillSegment({ len: 42, sizes: SIZES, preferredMax: 42 })), [42]);
});

test('slack under the filler limit becomes a filler; over it is flagged as a gap', () => {
  const small = fillSegment({ len: 51, sizes: SIZES, maxFiller: 3 });
  assert.equal(small.viol, 0);
  const odd = fillSegment({ len: 10, sizes: SIZES, maxFiller: 3 });
  assert.ok(odd.boxes.some((b) => b.kind === 'gap'));
  assert.ok(odd.viol > 0);
  const awkward = fillSegment({ len: 50.5, sizes: SIZES, maxFiller: 3 });
  assert.ok(awkward.boxes.some((b) => b.kind === 'filler'));
  assert.equal(awkward.viol, 0);
});

test('a fixed appliance keeps its width, stays on its marker, and nothing overlaps it', () => {
  const r = fillSegment({
    len: 120,
    sizes: SIZES,
    items: [{ id: 1, type: 'range', kind: 'void', width: 30, center: 60, points: [60], touched: false }],
  });
  const range = r.boxes.find((b) => b.type === 'range');
  near(range.u1 - range.u0, 30);
  assert.ok(range.u0 <= 60 + 30 && range.u1 >= 60 - 30);
  near(total(r), 120, 1e-6);
});

test('an appliance touching a hookup always still covers the hookup', () => {
  for (const hook of [20, 45, 60, 80, 100]) {
    const r = fillSegment({
      len: 120,
      sizes: SIZES,
      items: [{ id: 1, type: 'range', kind: 'void', width: 30, center: hook, points: [hook], touched: true }],
    });
    const range = r.boxes.find((b) => b.type === 'range');
    assert.ok(range.u0 <= hook + 1e-9 && range.u1 >= hook - 1e-9, `hook ${hook}: ${range.u0}-${range.u1}`);
  }
});

test('the sink box is at least the sink width and centers on its window when it can', () => {
  const r = fillSegment({
    len: 144,
    sizes: SIZES,
    items: [{ id: 1, type: 'sink', kind: 'flex', width: 24, center: 72, points: [72], touched: false, target: 72 }],
  });
  const sink = r.boxes.find((b) => b.type === 'sink');
  assert.ok(sink.u1 - sink.u0 >= 24);
  near((sink.u0 + sink.u1) / 2, 72, 0.5);
});

test('a 24 inch sink may sit in a bigger box when that is what fits the run', () => {
  const r = fillSegment({
    len: 60,
    sizes: SIZES,
    items: [{ id: 1, type: 'sink', kind: 'flex', width: 24, center: 30, points: [30], touched: false, target: 30 }],
  });
  const sink = r.boxes.find((b) => b.type === 'sink');
  assert.ok(sink.u1 - sink.u0 >= 24);
  near(total(r), 60, 1e-6);
  assert.equal(r.viol, 0);
});

test('the dishwasher ends up within 36 inches of the sink', () => {
  const r = fillSegment({
    len: 180,
    sizes: SIZES,
    items: [
      { id: 1, type: 'sink', kind: 'flex', width: 24, center: 40, points: [40], touched: false, target: 40 },
      { id: 2, type: 'dishwasher', kind: 'void', width: 24, center: 140, points: [140], touched: false },
    ],
  });
  const sink = r.boxes.find((b) => b.type === 'sink');
  const dw = r.boxes.find((b) => b.type === 'dishwasher');
  const gap = dw.u0 >= sink.u1 ? dw.u0 - sink.u1 : sink.u0 - dw.u1;
  assert.ok(gap <= 36 + 1e-9, `gap ${gap}`);
});

test('an appliance wider than the stretch is dropped, not forced in', () => {
  const r = fillSegment({
    len: 30,
    sizes: SIZES,
    items: [{ id: 7, type: 'fridge', kind: 'tall', width: 36, center: 15, points: [15], touched: false }],
  });
  assert.deepEqual(r.dropped, [7]);
  near(total(r), 30, 1e-6);
});

test('a blind corner locks to its end and the rest fills what is left', () => {
  const r = fillSegment({ len: 120, sizes: SIZES, startBlind: { width: 36 } });
  assert.equal(r.boxes[0].kind, 'corner');
  near(r.boxes[0].u1, 36);
  near(total(r), 120, 1e-6);
  const e = fillSegment({ len: 120, sizes: SIZES, endBlind: { width: 39 } });
  const last = e.boxes[e.boxes.length - 1];
  assert.equal(last.kind, 'corner');
  near(last.u0, 81);
  near(total(e), 120, 1e-6);
});

test('exact positions (uppers matching lowers) are honoured', () => {
  const r = fillSegment({
    len: 120,
    sizes: SIZES,
    items: [{ id: 1, type: 'fridge', kind: 'tall', width: 36, center: 60, points: [60], touched: false, fixedAt: 30 }],
  });
  const fridge = r.boxes.find((b) => b.type === 'fridge');
  near(fridge.u0, 30);
  near(fridge.u1, 66);
});

test('an empty stretch and a stretch of zero length are fine', () => {
  assert.deepEqual(fillSegment({ len: 0, sizes: SIZES }).boxes, []);
  const t = makeGapTable(SIZES, 100, 3, 36);
  assert.equal(t.filler[0], 0);
});
