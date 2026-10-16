import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DIRS,
  dirIndex,
  solveLengths,
  buildVerts,
  strokeToPolygon,
  simplifyRDP,
  openingSpan,
  segIntersect,
} from '../src/geometry.js';

const near = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);

// Deterministic jitter so tests are repeatable.
function rng(seed) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

function strokeThrough(corners, { jitter = 0, step = 6, seed = 1 } = {}) {
  const r = rng(seed);
  const pts = [];
  for (let i = 0; i < corners.length - 1; i++) {
    const a = corners[i];
    const b = corners[i + 1];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const n = Math.max(1, Math.round(len / step));
    for (let j = 0; j < n; j++) {
      const t = j / n;
      pts.push({
        x: a.x + (b.x - a.x) * t + (r() - 0.5) * jitter,
        y: a.y + (b.y - a.y) * t + (r() - 0.5) * jitter,
      });
    }
  }
  pts.push({ ...corners[corners.length - 1] });
  return pts;
}

test('dirIndex snaps to the nearest 45 degrees', () => {
  assert.equal(dirIndex(10, 1), 0);
  assert.equal(dirIndex(1, 10), 2);
  assert.equal(dirIndex(-10, 2), 4);
  assert.equal(dirIndex(1, -10), 6);
  assert.equal(dirIndex(10, 9), 1);
  assert.equal(dirIndex(-10, -9), 5);
});

test('a wobbly rectangle becomes four square walls that close', () => {
  const px = strokeThrough(
    [
      { x: 100, y: 100 },
      { x: 480, y: 108 },
      { x: 470, y: 330 },
      { x: 95, y: 322 },
      { x: 104, y: 112 },
    ],
    { jitter: 4 },
  );
  const poly = strokeToPolygon(px, 2);
  assert.ok(poly);
  assert.equal(poly.dirs.length, 4);
  assert.deepEqual([...poly.dirs].sort(), [0, 2, 4, 6]);
  const v = buildVerts({ x: 0, y: 0 }, poly.dirs, poly.base);
  near(v[4].x, 0, 1e-6);
  near(v[4].y, 0, 1e-6);
  // Opposite walls end up the same length.
  const byDir = Object.fromEntries(poly.dirs.map((d, i) => [d, poly.base[i]]));
  near(byDir[0], byDir[4], 1e-6);
  near(byDir[2], byDir[6], 1e-6);
});

test('an open U stroke is closed with a fourth wall', () => {
  const px = strokeThrough([
    { x: 100, y: 100 },
    { x: 400, y: 100 },
    { x: 400, y: 300 },
    { x: 100, y: 300 },
  ]);
  const poly = strokeToPolygon(px, 1);
  assert.ok(poly);
  assert.equal(poly.dirs.length, 4);
});

test('an L shaped room gives six walls', () => {
  const px = strokeThrough([
    { x: 100, y: 100 },
    { x: 400, y: 100 },
    { x: 400, y: 220 },
    { x: 250, y: 220 },
    { x: 250, y: 380 },
    { x: 100, y: 380 },
    { x: 100, y: 100 },
  ]);
  const poly = strokeToPolygon(px, 2);
  assert.ok(poly);
  assert.equal(poly.dirs.length, 6);
});

test('a 45 degree corner is kept', () => {
  const px = strokeThrough([
    { x: 100, y: 100 },
    { x: 300, y: 100 },
    { x: 400, y: 200 },
    { x: 400, y: 350 },
    { x: 100, y: 350 },
    { x: 100, y: 100 },
  ]);
  const poly = strokeToPolygon(px, 2);
  assert.ok(poly);
  assert.equal(poly.dirs.length, 5);
  assert.ok(poly.dirs.includes(1));
});

test('tiny doodles and short strokes are rejected', () => {
  assert.equal(strokeToPolygon(strokeThrough([{ x: 0, y: 0 }, { x: 20, y: 0 }]), 1), null);
  assert.equal(strokeToPolygon(strokeThrough([{ x: 0, y: 0 }, { x: 300, y: 0 }]), 1), null);
});

test('solveLengths: three known walls fix the fourth exactly', () => {
  const dirs = [0, 2, 4, 6];
  const base = [100, 80, 100, 80];
  const { lens, gap } = solveLengths(dirs, base, [120.5, 90, 120.5, null]);
  near(lens[3], 90);
  near(gap.x, 0);
  near(gap.y, 0);
});

test('solveLengths: unknown walls absorb a changed known wall', () => {
  const dirs = [0, 2, 4, 6];
  const base = [100, 80, 100, 80];
  const { lens, gap } = solveLengths(dirs, base, [150, null, null, null]);
  near(gap.x, 0, 1e-9);
  near(gap.y, 0, 1e-9);
  near(lens[0], 150);
  near(lens[2], 150);
  near(lens[1], lens[3]);
});

test('solveLengths: fully measured walls that disagree report the gap', () => {
  const dirs = [0, 2, 4, 6];
  const { lens, gap } = solveLengths(dirs, [1, 1, 1, 1], [120, 96, 118.5, 96]);
  assert.deepEqual(lens, [120, 96, 118.5, 96]);
  near(gap.x, 1.5);
  near(gap.y, 0);
});

test('solveLengths: only one unknown wall that cannot close the loop leaves a gap', () => {
  const dirs = [0, 2, 4, 6];
  const { gap } = solveLengths(dirs, [100, 80, 100, 80], [100, 70, 100, null]);
  near(gap.x, 0);
  near(gap.y, 0);
  const second = solveLengths(dirs, [100, 80, 100, 80], [100, 70, 90, null]);
  near(second.gap.x, 10);
});

test('solveLengths never returns a wall shorter than the minimum', () => {
  const dirs = [0, 2, 4, 6];
  const { lens } = solveLengths(dirs, [100, 80, 100, 80], [5, 200, 5, null]);
  assert.ok(lens[3] >= 1);
});

test('openingSpan stays inside its wall', () => {
  const [a, b] = openingSpan({ t: 0.01, drawW: 36, ro: null }, 100);
  near(a, 0);
  near(b, 36);
  const [c, d] = openingSpan({ t: 0.99, drawW: 36, ro: 30 }, 100);
  near(d, 100);
  near(c, 70);
});

test('segIntersect and RDP basics', () => {
  const hit = segIntersect({ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }, { x: 10, y: 0 });
  near(hit.t, 0.5);
  near(hit.u, 0.5);
  assert.equal(segIntersect({ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }), null);
  const s = simplifyRDP(
    [
      { x: 0, y: 0 },
      { x: 5, y: 0.1 },
      { x: 10, y: 0 },
    ],
    1,
  );
  assert.equal(s.length, 2);
  assert.equal(DIRS.length, 8);
});
