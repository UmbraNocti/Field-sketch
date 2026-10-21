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
  assert.ok(first.boxes.some((b) => b.kind === 'corner')); // holder: lower id
  near(second.boxes[0].u0, 24); // the other run starts a cabinet depth in
  near(second.boxes[second.boxes.length - 1].u1, 120);
  near(first.boxes[first.boxes.length - 1].u1, 156);
  near(first.boxes.reduce((t, b) => t + b.size, 0), 156);
});

test('a blind corner is centered on the other run\'s face line, so it sits in from the corner with a filler', () => {
  for (const [opt, width] of [[0, 36], [2, 39], [3, 42]]) {
    const s = kitchen({ runs: [wallRun(1, 'lower', 0, 0, 156), wallRun(2, 'lower', 1, 0, 120)], cornerPicks: { 'lower:1': { wall: 0, opt } } });
    const first = run(s).runs.find((r) => r.run.id === 1);
    const blind = first.boxes.find((b) => b.kind === 'corner');
    near(blind.size, width);
    // The box's center is 24" (the other run's depth) from the corner end of the wall.
    near(156 - (blind.u0 + blind.u1) / 2, 24);
    const filler = first.boxes[first.boxes.length - 1];
    assert.equal(filler.kind, 'filler');
    near(filler.size, 24 - width / 2);
  }
});

test('the diagonal corner has a leg along each wall and a 45 degree front, and both runs start a leg in', () => {
  const s = kitchen({ runs: [wallRun(1, 'lower', 0, 0, 156), wallRun(2, 'lower', 1, 0, 120)], cornerPicks: { 'lower:1': { wall: 0, opt: 1 } } });
  const lay = run(s);
  const diag = lay.runs.flatMap((r) => r.boxes.filter((b) => b.kind === 'diag'));
  assert.equal(diag.length, 1);
  assert.equal(diag[0].label, 'DC36');
  assert.equal(diag[0].poly.length, 5);
  // The corner is the top-right (156, 0): legs run 36" left along the top wall and 36" down the right wall.
  const xs = diag[0].poly.map((p) => Math.round(p.x));
  const ys = diag[0].poly.map((p) => Math.round(p.y));
  assert.equal(Math.min(...xs), 120);
  assert.equal(Math.max(...xs), 156);
  assert.equal(Math.min(...ys), 0);
  assert.equal(Math.max(...ys), 36);
  // The front face is a 45 degree line: (120+... ) the two front points differ equally in x and y.
  const [, , a, b] = diag[0].poly;
  near(Math.abs(a.x - b.x), Math.abs(a.y - b.y), 1e-6);
  const first = lay.runs.find((r) => r.run.id === 1);
  const second = lay.runs.find((r) => r.run.id === 2);
  const plain = first.boxes.filter((b) => b.kind !== 'diag');
  near(plain[plain.length - 1].u1, 120, 1e-6);
  near(second.boxes[0].u0, 36, 1e-6);
  assert.ok(!lay.runs.some((r) => r.boxes.some((b) => b.kind === 'corner')));
});

test('uppers get a 24 inch diagonal', () => {
  const s = kitchen({ runs: [wallRun(1, 'upper', 0, 0, 156), wallRun(2, 'upper', 1, 0, 120)], cornerPicks: { 'upper:1': { wall: 0, opt: 1 } } });
  const d = deriveRoom(s.room);
  const diag = computeLayouts(s, d).upper.runs.flatMap((r) => r.boxes.filter((b) => b.kind === 'diag'));
  assert.equal(diag.length, 1);
  assert.equal(diag[0].label, 'WDC24');
});

test('the smallest box the fill uses is 12 inches', () => {
  const tiny = kitchen({ runs: [wallRun(1, 'lower', 0, 0, 13)] });
  assert.deepEqual(run(tiny).runs[0].boxes.map((b) => b.label), ['F 1', 'B12']);
  // 51" between a window and a corner can now be filled with real boxes rather than slack.
  const s = kitchen({ runs: [wallRun(1, 'lower', 0, 0, 156)] });
  s.room.openings.push(win(0, 0.5, 30));
  for (const r of run(s).runs[0].boxes) assert.ok(r.kind !== 'base' || r.size >= 12);
});

test('a waste marker becomes a box at least as wide as the marker; a microwave never steers the fill', () => {
  const s = kitchen({ runs: [wallRun(1, 'lower', 0, 0, 120)] });
  s.markers.push({ id: 60, type: 'waste', x: 40, y: 12, w: 18 });
  const lay = run(s);
  const w = lay.runs[0].boxes.find((b) => b.type === 'waste');
  assert.ok(w && w.size >= 18);
  assert.match(w.label, /^TB\d+/);
  const before = run(kitchen({ runs: [wallRun(1, 'lower', 0, 0, 120)] })).runs[0].boxes.map((b) => b.label).join();
  const m = kitchen({ runs: [wallRun(1, 'lower', 0, 0, 120)] });
  m.markers.push({ id: 61, type: 'microwave', x: 40, y: 12, w: 30 });
  assert.equal(run(m).runs[0].boxes.map((b) => b.label).join(), before);
  assert.ok(!run(m).notes.some((n) => n.markerId === 61));
});

test('tapping a corner cycles blind 36, diagonal 36, then the other blind corners; the corner can move to the other wall', () => {
  const s = kitchen({ runs: [wallRun(1, 'lower', 0, 0, 156), wallRun(2, 'lower', 1, 0, 120)] });
  const first = run(s).runs[0];
  const c = first.boxes.find((b) => b.kind === 'corner');
  near(c.size, 36);
  assert.equal(c.corner.count, 4);
  s.cornerPicks = { [c.corner.key]: { wall: 0, opt: 2 } };
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

test('pantry cabinets only come in 18, 24, 30 and 36 and a typed width snaps to one', () => {
  for (const [typed, want] of [[null, 24], [18, 18], [26, 24], [28, 30], [34, 36], [42, 36]]) {
    const s = kitchen({ runs: [wallRun(1, 'lower', 0, 0, 156)] });
    s.markers.push({ id: 80, type: 'pantry', x: 60, y: 12, w: typed });
    const p = run(s).runs[0].boxes.find((b) => b.type === 'pantry');
    assert.ok(p, `pantry for ${typed}`);
    near(p.size, want);
    assert.equal(p.kind, 'tall');
  }
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
  s.markers.push({ id: 92, type: 'sink', x: 30, y: 12, w: 24 });
  assert.ok(!computeLayouts(s, d).upper.runs[0].boxes.some((b) => b.type === 'sink'));
});

test('over the range the uppers leave a blank place the width of the range, for the hood', () => {
  const s = kitchen({ runs: [wallRun(1, 'lower', 0, 0, 156), wallRun(2, 'upper', 0, 0, 156)] });
  s.markers.push({ id: 92, type: 'range', x: 100, y: 12, w: 30 }, { id: 93, type: 'gas', x: 100, y: 6 });
  const d = deriveRoom(s.room);
  const { lower, upper } = computeLayouts(s, d);
  const lr = lower.runs[0].boxes.find((b) => b.type === 'range');
  const hood = upper.runs[0].boxes.find((b) => b.kind === 'hood');
  assert.ok(hood, 'a hood place exists');
  near(hood.u0, lr.u0);
  near(hood.u1, lr.u1);
  assert.match(hood.label, /^HOOD 30/);
  near(upper.runs[0].boxes.reduce((t, b) => t + b.size, 0), 156);
});

test('a cooktop gets the same blank hood place as a range, as wide as the cooktop and centered over it', () => {
  const s = kitchen({ runs: [wallRun(1, 'lower', 0, 0, 156), wallRun(2, 'upper', 0, 0, 156)] });
  s.markers.push({ id: 92, type: 'cooktop', x: 100, y: 12, w: 30 }, { id: 93, type: 'gas', x: 100, y: 6 });
  const d = deriveRoom(s.room);
  const { lower, upper } = computeLayouts(s, d);
  const box = lower.runs[0].boxes.find((b) => b.type === 'cooktop');
  const hood = upper.runs[0].boxes.find((b) => b.kind === 'hood');
  assert.ok(box && hood);
  near(hood.size, 30);
  near((hood.u0 + hood.u1) / 2, (box.u0 + box.u1) / 2);
  assert.match(hood.label, /^HOOD 30/);
  near(upper.runs[0].boxes.reduce((t, b) => t + b.size, 0), 156);
  // The cooktop itself never shows up as a cabinet in the uppers, only the blank hood place.
  assert.ok(!upper.runs[0].boxes.some((b) => b.kind === 'flex' || /^CB/.test(b.label)));
});

test('a dishwasher that ends the cabinets gets an end panel on that side; a range never does', () => {
  const s = kitchen({ runs: [wallRun(1, 'lower', 0, 40, 79)] });
  s.markers.push({ id: 1, type: 'dishwasher', x: 72, y: 12, w: 24 }, { id: 2, type: 'outlet', x: 72, y: 6 });
  const lay = run(s);
  const boxes = lay.runs[0].boxes;
  const dw = boxes.find((b) => b.type === 'dishwasher');
  assert.equal(dw, boxes[boxes.length - 1]);
  assert.deepEqual(dw.panels, { left: false, right: true });
  assert.deepEqual(lay.runs[0].extras, ['Dishwasher end panel']);

  const r = kitchen({ runs: [wallRun(1, 'lower', 0, 40, 79)] });
  r.markers.push({ id: 3, type: 'range', x: 72, y: 12, w: 24 }, { id: 4, type: 'gas', x: 72, y: 6 });
  const rl = run(r);
  assert.equal(rl.runs[0].boxes.find((b) => b.type === 'range').panels, undefined);
  assert.deepEqual(rl.runs[0].extras, []);
});

test('no panel on a dishwasher with cabinets on both sides, or one against a wall', () => {
  const mid = kitchen({ runs: [wallRun(1, 'lower', 0, 0, 156)] });
  mid.markers.push({ id: 1, type: 'dishwasher', x: 78, y: 12, w: 24 }, { id: 2, type: 'outlet', x: 78, y: 6 });
  assert.equal(run(mid).runs[0].boxes.find((b) => b.type === 'dishwasher').panels, undefined);
  const wall = kitchen({ runs: [wallRun(1, 'lower', 0, 0, 156)] });
  wall.markers.push({ id: 1, type: 'dishwasher', x: 150, y: 12, w: 24 }, { id: 2, type: 'outlet', x: 150, y: 6 });
  assert.equal(run(wall).runs[0].boxes.find((b) => b.type === 'dishwasher').panels, undefined);
});

test('a dishwasher that ends the cabinets at a doorway gets the panel on the doorway side', () => {
  const s = kitchen({ runs: [wallRun(1, 'lower', 0, 0, 156)] });
  s.room.openings.push(door(0, 0.5));
  s.markers.push({ id: 1, type: 'dishwasher', x: 50, y: 12, w: 24 }, { id: 2, type: 'outlet', x: 50, y: 6 });
  const dw = run(s).runs[0].boxes.find((b) => b.type === 'dishwasher');
  assert.deepEqual(dw.panels, { left: false, right: true });
});

test('runs that stop a little short of a corner still pair up there instead of overlapping', () => {
  const s = kitchen({ runs: [wallRun(1, 'lower', 0, 0, 140), wallRun(2, 'lower', 1, 12, 120)] });
  const lay = run(s);
  const corners = lay.runs.flatMap((r) => r.boxes.filter((b) => b.kind === 'corner'));
  assert.equal(corners.length, 1);
  const second = lay.runs.find((r) => r.run.id === 2);
  assert.ok(second.boxes[0].u0 >= 24 - 1e-6, `second run starts at ${second.boxes[0].u0}`);
  const first = lay.runs.find((r) => r.run.id === 1);
  near(first.boxes[first.boxes.length - 1].u1, 156);
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

test('a diagonal corner can hold a sink or cooktop of 24 inches or less', () => {
  const base = () => kitchen({ runs: [wallRun(1, 'lower', 0, 0, 156), wallRun(2, 'lower', 1, 0, 120)], cornerPicks: { 'lower:1': { wall: 0, opt: 1 } } });
  const find = (s) => run(s).runs.flatMap((r) => r.boxes).find((b) => b.kind === 'diag');
  assert.equal(find(base()).label, 'DC36');
  for (const [type, w, label] of [['sink', 24, 'DSB36'], ['cooktop', 24, 'DCB36']]) {
    const s = base();
    s.markers.push({ id: 70, type, x: 146, y: 10, w });
    const d = find(s);
    assert.equal(d.label, label);
    assert.equal(d.id, 70);
    assert.equal(run(s).markerBoxes.get(70), d);
  }
  const wide = base();
  wide.markers.push({ id: 71, type: 'sink', x: 146, y: 10, w: 30 });
  assert.equal(find(wide).label, 'DC36');
  const fridge = base();
  fridge.markers.push({ id: 72, type: 'fridge', x: 146, y: 10, w: 24 });
  assert.equal(find(fridge).label, 'DC36');
});

test('runs keep 1" of filler at a wall, and 3" between the perpendicular run and a blind corner', () => {
  const s = kitchen({ runs: [wallRun(1, 'lower', 0, 0, 156), wallRun(2, 'lower', 1, 0, 120)] });
  const lay = run(s);
  const a = lay.runs[0].boxes;
  const b = lay.runs[1].boxes;
  // Run 1 starts at the wall (west) with 1" of filler and has the blind corner at the east end.
  assert.equal(a[0].kind, 'filler');
  assert.ok(a[0].size >= 1 - 1e-6);
  assert.ok(a.some((x) => x.kind === 'corner'));
  // Run 2 starts a cabinet depth in, then a 3" filler, then boxes; it ends at the south wall with 1".
  const fillers = b.filter((x) => x.kind === 'filler');
  near(b[0].u0, 24);
  assert.equal(b[0].kind, 'filler');
  near(b[0].size, 3);
  assert.ok(fillers[fillers.length - 1].size >= 1 - 1e-6);
  assert.equal(b[b.length - 1].kind, 'filler');
  near(b[b.length - 1].u1, 120);
});

test('a fridge gets at least 1" of filler against its end panel, in uppers as well', () => {
  const s = kitchen({ runs: [wallRun(1, 'lower', 0, 0, 156), wallRun(2, 'upper', 0, 0, 156)] });
  s.markers.push({ id: 90, type: 'fridge', x: 78, y: 12, w: 36 });
  s.markers.push({ id: 91, type: 'outlet', x: 78, y: 6 });
  for (const layer of ['lower', 'upper']) {
    const bx = run(s, layer).runs[0].boxes;
    const i = bx.findIndex((x) => x.type === 'fridge');
    assert.ok(bx[i - 1].kind === 'filler' && bx[i - 1].size >= 1 - 1e-6, `${layer} left`);
    assert.ok(bx[i + 1].kind === 'filler' && bx[i + 1].size >= 1 - 1e-6, `${layer} right`);
  }
});
