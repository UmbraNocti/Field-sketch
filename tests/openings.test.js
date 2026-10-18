import test from 'node:test';
import assert from 'node:assert/strict';
import { computeSpans, nearestReference } from '../src/geometry.js';

const near = (a, b, tol = 1e-9) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);
const op = (o) => ({ ro: null, drawW: 36, pos: null, ref: null, t: 0.5, ...o });

test('an opening without a position sits where it was drawn', () => {
  const spans = computeSpans([op({ id: 1, t: 0.25, drawW: 30 })], 120);
  near(spans.get(1)[0], 15);
  near(spans.get(1)[1], 45);
});

test('rough opening width replaces the drawn width, keeping the center', () => {
  const spans = computeSpans([op({ id: 1, t: 0.5, drawW: 30, ro: 40 })], 120);
  near(spans.get(1)[0], 40);
  near(spans.get(1)[1], 80);
});

test('position from the start corner puts the near edge exactly that far in', () => {
  const spans = computeSpans([op({ id: 1, ro: 36, pos: 18, ref: { id: null, side: 'before' } })], 144);
  near(spans.get(1)[0], 18);
  near(spans.get(1)[1], 54);
});

test('position from the end corner measures from the far end', () => {
  const spans = computeSpans([op({ id: 1, ro: 36, pos: 10, ref: { id: null, side: 'after' } })], 144);
  near(spans.get(1)[1], 134);
  near(spans.get(1)[0], 98);
});

test('a position measured from another opening follows that opening', () => {
  const ops = [
    op({ id: 1, ro: 36, pos: 20, ref: { id: null, side: 'before' } }),
    op({ id: 2, ro: 30, pos: 12, ref: { id: 1, side: 'before' } }),
  ];
  const spans = computeSpans(ops, 200);
  near(spans.get(1)[1], 56);
  near(spans.get(2)[0], 68);
  const moved = computeSpans([{ ...ops[0], pos: 40 }, ops[1]], 200);
  near(moved.get(2)[0], 88);
});

test('positions keep working when the wall length changes', () => {
  const o = [op({ id: 1, ro: 36, pos: 10, ref: { id: null, side: 'after' } })];
  near(computeSpans(o, 144).get(1)[1], 134);
  near(computeSpans(o, 150).get(1)[1], 140);
});

test('a missing reference opening falls back to the wall corner', () => {
  const spans = computeSpans([op({ id: 2, ro: 30, pos: 12, ref: { id: 99, side: 'before' } })], 100);
  near(spans.get(2)[0], 12);
});

test('spans are clamped inside the wall', () => {
  const spans = computeSpans([op({ id: 1, ro: 36, pos: 500, ref: { id: null, side: 'before' } })], 100);
  near(spans.get(1)[1], 100);
});

test('nearestReference picks the closest corner or neighbour', () => {
  assert.deepEqual(nearestReference([10, 46], 200, []), { id: null, side: 'before' });
  assert.deepEqual(nearestReference([150, 190], 200, []), { id: null, side: 'after' });
  assert.deepEqual(nearestReference([100, 136], 200, [{ id: 7, span: [40, 90] }]), { id: 7, side: 'before' });
  assert.deepEqual(nearestReference([100, 136], 200, [{ id: 8, span: [140, 180] }]), { id: 8, side: 'after' });
});
