import test from 'node:test';
import assert from 'node:assert/strict';
import { blankState, newRoom, deriveRoom } from '../src/store.js';
import { computeLayouts } from '../src/layout.js';

const near = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);

// A 156 x 120 rectangle: wall 0 runs east along the top, wall 1 south on the right, and so on.
function kitchen(extra = {}) {
  const s = blankState();
  s.room = newRoom({ start: { x: 0, y: 0 }, dirs: [0, 2, 4, 6], base: [156, 120, 156, 120] });
  s.room.known = [156, 120, 156, 120];
  s.nextId = 100;
  Object.assign(s, extra);
  return s;
}
let nextOp = 1;
const win = (wall, t, sill = 42, ro = 48) => ({ id: nextOp++, wall, kind: 'window', t, drawW: ro, ro, cc: ro + 4, sill, h: 40, pos: null, ref: { id: null, side: 'before' }, swing: null });
const door = (wall, t, ro = 36) => ({ id: nextOp++, wall, kind: 'door', t, drawW: ro, ro, cc: ro + 4, sill: null, h: null, pos: null, ref: { id: null, side: 'before' }, swing: null });
const wallRun = (id, layer, wall, u0, u1) => ({ id, layer, kind: 'wall', wall, u0, u1 });
const run = (s, layer = 'lower') => {
  const d = deriveRoom(s.room);
  return computeLayouts(s, d)[layer];
};
const sumWidth = (rl) => rl.boxes.reduce((t, b) => t + b.size, 0);

test('a run with nothing in the way is filled end to end', () => {
  const s = kitchen({ runs: [wallRun(1, 'lower', 0, 0, 156)] });
  const lay = run(s);
  assert.equal(lay.runs.length, 1);
  near(sumWidth(lay.runs[0]), 156);
  assert.ok(lay.runs[0].boxes.every((b) => b.depth === 24));
});

test('a low window is kept clear with 1" off the casing, a high one is ignored by lowers', () => {
  const low = kitchen({ runs: [wallRun(1, 'lower', 0, 0, 156)] });
  low.room.openings.push(win(0, 0.5, 30));
  const lay = run(low);
  const zone = [78 - 26 - 1, 78 + 26 + 1];
  for (const b of lay.runs[0].boxes) assert.ok(b.u1 <= zone[0] + 1e-6 || b.u0 >= zone[1] - 1e-6, `${b.label} ${b.u0}-${b.u1}`);

  const high = kitchen({ runs: [wallRun(1, 'lower', 0, 0, 156)] });
  high.room.openings.push(win(0, 0.5, 42));
  near(sumWidth(run(high).runs[0]), 156);
});

test('a window with no sill height is assumed high, with a note', () => {
  const s = kitchen({ runs: [wallRun(1, 'lower', 0, 0, 156)] });
  s.room.openings.push(win(0, 0.5, null));
  const lay = run(s);
  near(sumWidth(lay.runs[0]), 156);
  assert.ok(lay.notes.some((n) => /sill height not entered/.test(n.text)));
});

test('doors are always kept clear', () => {
  const s = kitchen({ runs: [wallRun(1, 'lower', 0, 0, 156)] });
  s.room.openings.push(door(0, 0.5));
  const lay = run(s);
  for (const b of lay.runs[0].boxes) assert.ok(b.u1 <= 78 - 20 - 1 + 1e-6 || b.u0 >= 78 + 20 + 1 - 1e-6);
});

test('uppers stay clear of every window, plus the crown or light rail (whichever is bigger)', () => {
  const s = kitchen({ runs: [wallRun(1, 'upper', 0, 0, 156)], upper: { height: 42, crown: 3, rail: 1 } });
  s.room.openings.push(win(0, 0.5, 42));
  const lay = run(s, 'upper');
  const left = 78 - 26 - 1 - 3;
  const right = 78 + 26 + 1 + 3;
  for (const b of lay.runs[0].boxes) assert.ok(b.u1 <= left + 1e-6 || b.u0 >= right - 1e-6, `${b.label} ${b.u0}-${b.u1}`);
  assert.ok(lay.runs[0].boxes.every((b) => b.depth === 12 || b.kind === 'tall'));
});

test('two runs meeting at an inside corner: one blind corner cabinet, the other stops short', () => {
  const s = kitchen({ runs: [wallRun(1, 'lower', 0, 0, 156), wallRun(2, 'lower', 1, 0, 120)] });
  const lay = run(s);
  const corners = lay.runs.flatMap((r) => r.boxes.filter((b) => b.kind === 'corner'));
  assert.equal(corners.length, 1);
  const first = lay.runs.find((r) => r.run.id === 1);
  const second = lay.runs.find((r) => r.run.id === 2);
  assert.equal(first.boxes[first.boxes.length - 1].kind, 'corner'); // holder: lower id
  near(second.boxes[0].u0, 24); // the other run starts a cabinet depth in
  near(second.boxes[second.boxes.length - 1].u1, 120);
});

test('tapping a corner cycles its size; the corner can move to the other wall', () => {
  const s = kitchen({ runs: [wallRun(1, 'lower', 0, 0, 156), wallRun(2, 'lower', 1, 0, 120)] });
  const first = run(s).runs[0];
  const c = first.boxes.find((b) => b.kind === 'corner');
  near(c.size, 36);
  s.cornerPicks = { [c.corner.key]: { wall: 0, opt: 1 } };
  near(run(s).runs[0].boxes.find((b) => b.kind === 'corner').size, 39);
  s.cornerPicks = { [c.corner.key]: { wall: 1, opt: 0 } };
  const lay = run(s);
  assert.ok(lay.runs.find((r) => r.run.id === 2).boxes.some((b) => b.kind === 'corner'));
  assert.ok(!lay.runs.find((r) => r.run.id === 1).boxes.some((b) => b.kind === 'corner'));
});

test('a run that reaches a corner with no neighbouring run gets a plain end', () => {
  const s = kitchen({ runs: [wallRun(1, 'lower', 0, 0, 156)] });
  assert.ok(!run(s).runs[0].boxes.some((b) => b.kind === 'corner'));
});

test('a sink marker centers its box on the window behind it and covers the plumbing', () => {
  const s = kitchen({ runs: [wallRun(1, 'lower', 0, 0, 156)] });
  s.room.openings.push(win(0, 0.5, 42));
  s.markers.push({ id: 50, type: 'sink', x: 70, y: 12, w: 24 });
  s.markers.push({ id: 51, type: 'plumbing', x: 74, y: 6 });
  const lay = run(s);
  const sink = lay.runs[0].boxes.find((b) => b.kind === 'flex');
  assert.ok(sink.size >= 24);
  assert.ok(sink.u0 <= 74 && sink.u1 >= 74);
  near((sink.u0 + sink.u1) / 2, 78, 1);
  assert.ok(!lay.notes.some((n) => n.markerId === 50 && n.hookup));
});

test('an appliance with nothing to hook up to is flagged but still placed', () => {
  const s = kitchen({ runs: [wallRun(1, 'lower', 0, 0, 156)] });
  s.markers.push({ id: 60, type: 'range', x: 100, y: 12, w: 30 });
  const lay = run(s);
  assert.ok(lay.notes.some((n) => n.markerId === 60 && n.hookup));
  assert.ok(lay.runs[0].boxes.some((b) => b.type === 'range' && Math.abs(b.size - 30) < 1e-6));
});

test('ranges want 220V or gas; fridges and dishwashers want a standard outlet', () => {
  const s = kitchen({ runs: [wallRun(1, 'lower', 0, 0, 156)] });
  s.markers.push({ id: 60, type: 'range', x: 100, y: 12, w: 30 });
  s.markers.push({ id: 61, type: 'outlet', x: 100, y: 6 });
  assert.ok(run(s).notes.some((n) => n.markerId === 60 && n.hookup)); // 120V does not count for a range
  s.markers.push({ id: 62, type: 'outlet220', x: 100, y: 6 });
  assert.ok(!run(s).notes.some((n) => n.markerId === 60 && n.hookup));
  s.markers.push({ id: 63, type: 'fridge', x: 30, y: 12, w: 36 });
  assert.ok(run(s).notes.some((n) => n.markerId === 63 && n.hookup));
  s.markers.push({ id: 64, type: 'outlet', x: 30, y: 6 });
  assert.ok(!run(s).notes.some((n) => n.markerId === 63 && n.hookup));
});

test('a range touching its gas marker stays on it', () => {
  const s = kitchen({ runs: [wallRun(1, 'lower', 0, 0, 156)] });
  s.markers.push({ id: 60, type: 'range', x: 120, y: 12, w: 30 });
  s.markers.push({ id: 61, type: 'gas', x: 126, y: 6 });
  const r = run(s).runs[0].boxes.find((b) => b.type === 'range');
  assert.ok(r.u0 <= 126 && r.u1 >= 126);
});

test('no dishwasher marker gives a note, a dishwasher marker removes it', () => {
  const s = kitchen({ runs: [wallRun(1, 'lower', 0, 0, 156)] });
  assert.ok(run(s).notes.some((n) => n.dishwasher));
  s.markers.push({ id: 70, type: 'dishwasher', x: 60, y: 12, w: 24 });
  assert.ok(!run(s).notes.some((n) => n.dishwasher));
});

test('no runs, no dishwasher nag', () => {
  assert.equal(run(kitchen()).notes.length, 0);
});

test('a pantry marker makes the box under it full height', () => {
  const s = kitchen({ runs: [wallRun(1, 'lower', 0, 0, 156)] });
  s.markers.push({ id: 80, type: 'pantry', x: 10, y: 12 });
  const lay = run(s);
  const tall = lay.runs[0].boxes.find((b) => b.kind === 'tall');
  assert.ok(tall && tall.u0 <= 10 && tall.u1 >= 10);
  assert.equal(tall.depth, 24);
});

test('a fridge needs panels on open sides, none against a wall', () => {
  const s = kitchen({ runs: [wallRun(1, 'lower', 0, 0, 156)] });
  s.markers.push({ id: 90, type: 'fridge', x: 78, y: 12, w: 36 });
  s.markers.push({ id: 91, type: 'outlet', x: 78, y: 6 });
  const mid = run(s).runs[0].boxes.find((b) => b.type === 'fridge');
  assert.deepEqual(mid.panels, { left: true, right: true });
  s.markers = [{ id: 90, type: 'fridge', x: 14, y: 12, w: 36 }, { id: 91, type: 'outlet', x: 14, y: 6 }];
  const end = run(s).runs[0].boxes.find((b) => b.type === 'fridge');
  assert.equal(end.panels.left, false);
  assert.equal(end.panels.right, true);
});

test('full-height pieces sit in the same place in the uppers as in the lowers', () => {
  const s = kitchen({ runs: [wallRun(1, 'lower', 0, 0, 156), wallRun(2, 'upper', 0, 0, 156)] });
  s.markers.push({ id: 90, type: 'fridge', x: 100, y: 12, w: 36 });
  s.markers.push({ id: 91, type: 'outlet', x: 100, y: 6 });
  const d = deriveRoom(s.room);
  const { lower, upper } = computeLayouts(s, d);
  const lf = lower.runs[0].boxes.find((b) => b.type === 'fridge');
  const uf = upper.runs[0].boxes.find((b) => b.type === 'fridge');
  near(uf.u0, lf.u0);
  near(uf.u1, lf.u1);
  // Appliances that aren't full height don't show up in the uppers.
  s.markers.push({ id: 92, type: 'range', x: 30, y: 12, w: 30 });
  assert.ok(!computeLayouts(s, d).upper.runs[0].boxes.some((b) => b.type === 'range'));
});

test('an island closer than 36" to the cabinets is flagged', () => {
  const s = kitchen({ runs: [wallRun(1, 'lower', 0, 0, 156), { id: 2, layer: 'lower', kind: 'free', a: { x: 40, y: 45 }, b: { x: 110, y: 45 } }] });
  assert.ok(run(s).notes.some((n) => /Island 2/.test(n.text)));
  s.runs[1] = { id: 2, layer: 'lower', kind: 'free', a: { x: 40, y: 65 }, b: { x: 110, y: 65 } };
  assert.ok(!run(s).notes.some((n) => /Island/.test(n.text)));
});

test('keep-clear zones are drawn in front of wall runs only', () => {
  const s = kitchen({ runs: [wallRun(1, 'lower', 0, 0, 156)] });
  assert.equal(run(s).zones.length, 1);
});

test('a dishwasher far from the sink is flagged', () => {
  const s = kitchen({ runs: [wallRun(1, 'lower', 0, 0, 156)] });
  s.markers.push({ id: 1, type: 'sink', x: 20, y: 12, w: 24 }, { id: 2, type: 'plumbing', x: 20, y: 6 });
  s.markers.push({ id: 3, type: 'dishwasher', x: 140, y: 12, w: 24 }, { id: 4, type: 'outlet', x: 140, y: 6 });
  const lay = run(s);
  const dw = lay.runs[0].boxes.find((b) => b.type === 'dishwasher');
  const sink = lay.runs[0].boxes.find((b) => b.type === 'sink');
  const gap = dw.u0 >= sink.u1 ? dw.u0 - sink.u1 : sink.u0 - dw.u1;
  assert.ok(gap <= 36 + 1e-6 || lay.notes.some((n) => /from the sink/.test(n.text)));
});

test('a run on a wall that has since become open is reported, not drawn', () => {
  const s = kitchen({ runs: [wallRun(1, 'lower', 0, 0, 156)] });
  s.room.construction[0] = true;
  const lay = run(s);
  assert.equal(lay.runs.length, 0);
  assert.ok(lay.notes.some((n) => /open/.test(n.text)));
});

test('labels name the pieces for the order list', () => {
  const s = kitchen({ runs: [wallRun(1, 'lower', 0, 0, 156), wallRun(2, 'upper', 0, 0, 156)] });
  s.markers.push({ id: 5, type: 'sink', x: 78, y: 12, w: 24 }, { id: 6, type: 'plumbing', x: 78, y: 6 });
  const d = deriveRoom(s.room);
  const { lower, upper } = computeLayouts(s, d);
  const labels = lower.runs[0].boxes.map((b) => b.label);
  assert.ok(labels.some((l) => /^SB\d+/.test(l)));
  assert.ok(labels.some((l) => /^B\d+/.test(l)));
  assert.ok(upper.runs[0].boxes.every((b) => /^W\d+/.test(b.label) || b.kind !== 'base'));
});
