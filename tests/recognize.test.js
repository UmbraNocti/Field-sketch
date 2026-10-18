import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyStroke, wallFrames, findLineCrossing, arcToDoor, constructionTargets, hitWall } from '../src/recognize.js';
import { buildVerts } from '../src/geometry.js';

// A 120" x 96" room: walls run east, south, west, north starting at the origin.
const verts = buildVerts({ x: 0, y: 0 }, [0, 2, 4, 6], [120, 96, 120, 96]);
const frames = wallFrames(verts, [false, false, false, false]);

function line(a, b, n = 20) {
  return Array.from({ length: n + 1 }, (_, i) => ({ x: a.x + ((b.x - a.x) * i) / n, y: a.y + ((b.y - a.y) * i) / n }));
}

function quarterArc(center, r, from, to, n = 24) {
  return Array.from({ length: n + 1 }, (_, i) => {
    const a = from + ((to - from) * i) / n;
    return { x: center.x + r * Math.cos(a), y: center.y + r * Math.sin(a) };
  });
}

test('classifies taps, lines, arcs and scribbles', () => {
  assert.equal(classifyStroke([{ x: 0, y: 0 }, { x: 2, y: 1 }]).type, 'tap');
  assert.equal(classifyStroke(line({ x: 0, y: 0 }, { x: 100, y: 5 })).type, 'line');
  assert.equal(classifyStroke(quarterArc({ x: 0, y: 0 }, 80, 0, Math.PI / 2)).type, 'arc');
  const zig = [];
  for (let i = 0; i < 6; i++) zig.push(...line({ x: i % 2 ? 80 : 0, y: i * 6 }, { x: i % 2 ? 0 : 80, y: i * 6 + 6 }, 8));
  assert.equal(classifyStroke(zig).type, 'scribble');
  const outAndBack = [...line({ x: 0, y: 0 }, { x: 100, y: 0 }), ...line({ x: 100, y: 0 }, { x: 5, y: 3 })];
  assert.equal(classifyStroke(outAndBack).type, 'scribble');
});

test('a line across a wall reports the wall and distance along it', () => {
  const hit = findLineCrossing({ x: 40, y: -10 }, { x: 40, y: 12 }, frames, 4);
  assert.equal(hit.wall, 0);
  assert.ok(Math.abs(hit.u - 40) < 1e-6);
});

test('a line running along a wall is not an opening edge', () => {
  assert.equal(findLineCrossing({ x: 10, y: 3 }, { x: 60, y: 3 }, frames, 4), null);
});

test('construction lines are skipped when finding opening edges', () => {
  const f = wallFrames(verts, [true, false, false, false]);
  assert.equal(findLineCrossing({ x: 40, y: -10 }, { x: 40, y: 12 }, f, 4), null);
});

test('a door arc becomes a door with hinge, width and swing side', () => {
  // Hinge at x=30 on the top wall, latch at x=66, door swings into the room (down).
  const pts = quarterArc({ x: 30, y: 0 }, 36, 0, Math.PI / 2).reverse();
  // Arc now starts on the wall at the latch (66,0) and ends at the leaf tip below the hinge (30,36).
  const door = arcToDoor(pts, frames, 6);
  assert.equal(door.wall, 0);
  assert.equal(door.drawW, 36);
  assert.ok(Math.abs(door.t * 120 - 48) < 1);
  assert.equal(door.swing.hinge, 0);
  // Wall 0 runs east; its normal (-dy, dx) points down, so a swing into the room is side +1.
  assert.equal(door.swing.side, 1);
});

test('an arc far from any wall is not a door, and a tiny one is flagged', () => {
  const far = quarterArc({ x: 60, y: 48 }, 20, 0, Math.PI / 2);
  assert.equal(arcToDoor(far, frames, 6), null);
  const tiny = quarterArc({ x: 30, y: 0 }, 8, 0, Math.PI / 2);
  assert.deepEqual(arcToDoor(tiny, frames, 6), { error: 'small' });
});

test('construction targets: crossing or swiping the length of a wall', () => {
  const cross = constructionTargets(line({ x: 60, y: -10 }, { x: 60, y: 10 }), frames, 4);
  assert.deepEqual(cross, [0]);
  const swipe = constructionTargets(line({ x: 0, y: 8 }, { x: 120, y: 8 }), frames, 12);
  assert.ok(swipe.includes(0));
});

test('hitWall finds the nearest wall within tolerance', () => {
  assert.equal(hitWall({ x: 60, y: 3 }, frames, 6).i, 0);
  assert.equal(hitWall({ x: 60, y: 48 }, frames, 6), null);
});

test('big, shaky arcs still read as arcs; an S curve does not', () => {
  const noisy = (scale, jitter) => {
    const r = 36 * scale;
    const pts = [];
    for (let i = 0; i <= 90; i++) {
      const a = (i / 90) * (Math.PI / 2);
      pts.push({ x: r * Math.cos(a) + (((i * 7919) % 13) / 13 - 0.5) * jitter, y: r * Math.sin(a) + (((i * 104729) % 17) / 17 - 0.5) * jitter });
    }
    return pts;
  };
  for (const scale of [2, 3.5, 4.4, 6, 9]) {
    assert.equal(classifyStroke(noisy(scale, 1.5)).type, 'arc', `scale ${scale}`);
  }
  const s = [];
  for (let i = 0; i <= 60; i++) s.push({ x: i * 4, y: 40 * Math.sin((i / 60) * Math.PI * 2) });
  assert.notEqual(classifyStroke(s).type, 'arc');
});
