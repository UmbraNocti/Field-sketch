import test from 'node:test';
import assert from 'node:assert/strict';
import { serializeSketch, parseSketch, fileNameFor } from '../src/file.js';
import { normalizeState, blankState, newRoom } from '../src/store.js';

function sampleState() {
  const room = newRoom({ start: { x: 5, y: 6 }, dirs: [0, 2, 4, 6], base: [144, 120, 144, 120] });
  room.known = [144.125, 120, null, null];
  room.construction[2] = true;
  room.openings.push({
    id: 3, wall: 1, kind: 'window', t: 0.5, drawW: 36, ro: 36, cc: 40, sill: 42, h: 48.5, pos: 12, ref: { id: null, side: 'after' }, swing: null,
  });
  room.openings.push({
    id: 4, wall: 0, kind: 'door', t: 0.3, drawW: 36, ro: 36, cc: 40, sill: null, h: null, pos: null, ref: { id: null, side: 'before' }, swing: { hinge: 0, side: 1 },
  });
  return {
    room,
    markers: [
      { id: 5, type: 'outlet220', x: 10, y: 20 },
      { id: 6, type: 'column', x: 50, y: 60, w: 12, d: 16 },
    ],
    ceiling: 96,
    name: 'Smith kitchen',
    nextId: 7,
  };
}

test('a saved sketch reads back exactly', () => {
  const s = sampleState();
  const res = parseSketch(serializeSketch(s));
  assert.ok(!res.error);
  assert.deepEqual(res.state, s);
});

test('the file is readable JSON that names the app', () => {
  const data = JSON.parse(serializeSketch(sampleState(), new Date('2026-03-02T10:00:00Z')));
  assert.equal(data.app, 'field-sketch');
  assert.equal(data.saved, '2026-03-02T10:00:00.000Z');
  assert.equal(data.name, 'Smith kitchen');
});

test('files that are not sketches are refused with a message', () => {
  assert.match(parseSketch('not json').error, /isn.t a Field Sketch file/);
  assert.match(parseSketch('{"hello":1}').error, /isn.t a Field Sketch file/);
  assert.match(parseSketch(JSON.stringify({ app: 'field-sketch', version: 1, state: { markers: 'x' } })).error, /damaged/);
  assert.match(parseSketch(JSON.stringify({ app: 'field-sketch', version: 99, state: blankState() })).error, /newer/);
});

test('a room whose pieces disagree is rejected, bad openings and markers are dropped', () => {
  const s = sampleState();
  const broken = JSON.parse(JSON.stringify(s));
  broken.room.base.pop();
  assert.equal(normalizeState(broken), null);

  const messy = JSON.parse(JSON.stringify(s));
  messy.room.openings.push({ id: 9, wall: 77, kind: 'door', t: 0.5, drawW: 30 });
  messy.room.openings.push({ id: 10, wall: 0, kind: 'sunroof', t: 0.5, drawW: 30 });
  messy.markers.push({ id: 11, type: 'laser', x: 1, y: 1 });
  messy.markers.push({ id: 12, type: 'outlet', x: 'left', y: 1 });
  const n = normalizeState(messy);
  assert.equal(n.room.openings.length, 2);
  assert.equal(n.markers.length, 2);
});

test('older sketches without positions load, and the next id never collides', () => {
  const s = sampleState();
  const old = JSON.parse(JSON.stringify(s));
  for (const o of old.room.openings) {
    delete o.pos;
    delete o.ref;
  }
  old.nextId = 1;
  const n = normalizeState(old);
  assert.equal(n.room.openings[0].pos, null);
  assert.deepEqual(n.room.openings[0].ref, { id: null, side: 'before' });
  assert.ok(n.nextId > 6);
});

test('file names come from the job name and date', () => {
  const d = new Date('2026-03-02T10:00:00Z');
  assert.equal(fileNameFor({ name: 'Smith  Kitchen #2!' }, d), 'smith-kitchen-2-2026-03-02.fieldsketch.json');
  assert.equal(fileNameFor({ name: '' }, d), 'kitchen-sketch-2026-03-02.fieldsketch.json');
  assert.equal(fileNameFor({ name: '***' }, d), 'kitchen-sketch-2026-03-02.fieldsketch.json');
});
