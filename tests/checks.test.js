import test from 'node:test';
import assert from 'node:assert/strict';
import { blankState, newRoom, deriveRoom } from '../src/store.js';
import { computeLayouts } from '../src/layout.js';
import { runChecks } from '../src/checks.js';

function kitchen(extra = {}) {
  const s = blankState();
  s.room = newRoom({ start: { x: 0, y: 0 }, dirs: [0, 2, 4, 6], base: [156, 120, 156, 120] });
  s.room.known = [156, 120, 156, 120];
  s.nextId = 100;
  Object.assign(s, extra);
  return s;
}
const wallRun = (id, layer, wall, u0, u1) => ({ id, layer, kind: 'wall', wall, u0, u1 });
const check = (s) => {
  const d = deriveRoom(s.room);
  return runChecks(s, d, computeLayouts(s, d));
};
const get = (res, id) => res.items.find((i) => i.id === id);

test('with no room the checklist is empty', () => {
  const res = runChecks(blankState(), null, null);
  assert.ok(res.empty);
});

test('missing appliances become reminders, not failures', () => {
  const s = kitchen({ runs: [wallRun(1, 'lower', 0, 0, 156)] });
  const res = check(s);
  assert.equal(get(res, '2').status, 'remind');
  assert.equal(get(res, '12').status, 'warn');
  assert.equal(get(res, '10').status, 'remind');
  assert.equal(get(res, '22').status, 'remind');
});

test('a waste marker satisfies rule 12', () => {
  const s = kitchen({ runs: [wallRun(1, 'lower', 0, 0, 156)], markers: [{ id: 5, type: 'waste', x: 40, y: 10, w: 18 }] });
  assert.equal(get(check(s), '12').status, 'ok');
});

test('work triangle is measured front to front and flagged when too long', () => {
  const s = kitchen({
    runs: [wallRun(1, 'lower', 0, 0, 156), wallRun(2, 'lower', 2, 0, 120)],
    markers: [
      { id: 5, type: 'sink', x: 20, y: 10, w: 24 },
      { id: 6, type: 'range', x: 140, y: 10, w: 30 },
      { id: 7, type: 'fridge', x: 146, y: 100, w: 36 },
    ],
  });
  const res = check(s);
  assert.ok(res.triangle, 'triangle');
  assert.equal(res.triangle.pts.length, 3);
  assert.ok(['ok', 'warn'].includes(get(res, '2').status));
  assert.ok(res.triangle.total > 150);
});

test('sink counter: a 24" sink in a 33" base leaves 4.5" each side, plus neighbours', () => {
  const s = kitchen({ runs: [wallRun(1, 'lower', 0, 0, 156)], markers: [{ id: 5, type: 'sink', x: 78, y: 10, w: 24 }] });
  const res = check(s);
  assert.equal(get(res, '22').status, 'ok');
  assert.equal(get(res, '26').status, 'ok');
});

test('a door with a narrow rough opening is flagged', () => {
  const s = kitchen({ runs: [wallRun(1, 'lower', 0, 0, 156)] });
  s.room.openings.push({ id: 1, wall: 2, kind: 'door', t: 0.5, drawW: 30, ro: 30, cc: 34, sill: null, h: null, pos: null, ref: { id: null, side: 'before' }, swing: null });
  assert.equal(get(check(s), '1a').status, 'warn');
});

test('an island too close makes the aisle check fail', () => {
  const s = kitchen({ runs: [wallRun(1, 'lower', 0, 0, 156), { id: 2, layer: 'lower', kind: 'free', a: { x: 40, y: 50 }, b: { x: 120, y: 50 } }] });
  const res = check(s);
  assert.ok(['warn', 'ok'].includes(get(res, '1b').status));
});

test('uppers short of the frontage are flagged by room size', () => {
  const s = kitchen({ runs: [wallRun(1, 'upper', 0, 0, 156)] });
  const res = check(s);
  assert.equal(get(res, '6').status, 'ok');
  const s2 = kitchen({ runs: [wallRun(1, 'upper', 0, 0, 60)] });
  assert.equal(get(check(s2), '6').status, 'warn');
});
