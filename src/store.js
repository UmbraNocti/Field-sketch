// Sketch state, derived geometry, undo history and local autosave.
import { solveLengths, buildVerts, signedArea, computeSpans, dist } from './geometry.js';
import { APPLIANCE_TYPES, UTILITY_TYPES } from './rules.js';

const KEY = 'fieldsketch.v1';
const HISTORY_LIMIT = 100;

export const MARKER_TYPES = [...UTILITY_TYPES, ...APPLIANCE_TYPES];

export const FIELD_LABELS = {
  ro: 'Rough opening',
  cc: 'Casing to casing',
  pos: 'Position',
  sill: 'Sill height',
  h: 'Window height',
};

export function openingFields(kind) {
  return kind === 'window' ? ['ro', 'cc', 'pos', 'sill', 'h'] : ['ro', 'cc', 'pos'];
}

export function blankState() {
  return {
    room: null,
    markers: [],
    ceiling: null,
    name: '',
    nextId: 1,
    runs: [],
    cornerPicks: {},
    upper: { height: null, crown: 0, rail: 0 },
  };
}

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const numOrNull = (v) => (isNum(v) && v > 0 ? v : null);

// Accepts anything that was saved before (browser storage or a file) and returns a clean state,
// dropping pieces that don't make sense. Returns null if it isn't a sketch at all.
export function normalizeState(raw) {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.markers)) return null;
  let room = null;
  if (raw.room) {
    const r = raw.room;
    const n = Array.isArray(r.dirs) ? r.dirs.length : 0;
    const okArr = (a) => Array.isArray(a) && a.length === n;
    if (
      n < 3 ||
      !r.start ||
      !isNum(r.start.x) ||
      !isNum(r.start.y) ||
      !r.dirs.every((d) => Number.isInteger(d) && d >= 0 && d < 8) ||
      !okArr(r.base) ||
      !r.base.every((b) => isNum(b) && b > 0)
    ) {
      return null;
    }
    const openings = [];
    for (const o of Array.isArray(r.openings) ? r.openings : []) {
      if (!o || !Number.isInteger(o.id) || !Number.isInteger(o.wall) || o.wall < 0 || o.wall >= n) continue;
      if (o.kind !== 'door' && o.kind !== 'window') continue;
      if (!isNum(o.t) || !isNum(o.drawW) || o.drawW <= 0) continue;
      const swing = o.swing && (o.swing.hinge === 0 || o.swing.hinge === 1) && (o.swing.side === 1 || o.swing.side === -1)
        ? { hinge: o.swing.hinge, side: o.swing.side }
        : null;
      const ref = o.ref && (o.ref.side === 'before' || o.ref.side === 'after')
        ? { id: Number.isInteger(o.ref.id) ? o.ref.id : null, side: o.ref.side }
        : { id: null, side: 'before' };
      openings.push({
        id: o.id,
        wall: o.wall,
        kind: o.kind,
        t: Math.max(0, Math.min(1, o.t)),
        drawW: o.drawW,
        ro: numOrNull(o.ro),
        cc: numOrNull(o.cc),
        sill: numOrNull(o.sill),
        h: numOrNull(o.h),
        pos: o.pos != null && isNum(o.pos) && o.pos >= 0 ? o.pos : null,
        ref,
        swing: o.kind === 'door' ? swing : null,
      });
    }
    room = {
      start: { x: r.start.x, y: r.start.y },
      dirs: r.dirs.slice(),
      base: r.base.slice(),
      known: r.dirs.map((_, i) => (okArr(r.known) ? numOrNull(r.known[i]) : null)),
      construction: r.dirs.map((_, i) => !!(okArr(r.construction) && r.construction[i])),
      openings,
    };
  }
  const markers = [];
  for (const m of raw.markers) {
    if (!m || !Number.isInteger(m.id) || !MARKER_TYPES.includes(m.type) || !isNum(m.x) || !isNum(m.y)) continue;
    const out = { id: m.id, type: m.type, x: m.x, y: m.y };
    if (m.type === 'column') {
      out.w = numOrNull(m.w);
      out.d = numOrNull(m.d);
    } else if (APPLIANCE_TYPES.includes(m.type)) {
      out.w = numOrNull(m.w);
    }
    markers.push(out);
  }

  // Cabinet runs only make sense with a room to hang them on.
  const runs = [];
  if (room && Array.isArray(raw.runs)) {
    for (const r of raw.runs) {
      if (!r || !Number.isInteger(r.id) || (r.layer !== 'lower' && r.layer !== 'upper')) continue;
      if (r.kind === 'wall') {
        if (!Number.isInteger(r.wall) || r.wall < 0 || r.wall >= room.dirs.length || !isNum(r.u0) || !isNum(r.u1)) continue;
        const u0 = Math.max(0, Math.min(r.u0, r.u1));
        const u1 = Math.max(r.u0, r.u1);
        if (u1 - u0 < 1) continue;
        runs.push({ id: r.id, layer: r.layer, kind: 'wall', wall: r.wall, u0, u1 });
      } else if (r.kind === 'free') {
        const ok = (p) => p && isNum(p.x) && isNum(p.y);
        if (!ok(r.a) || !ok(r.b) || Math.hypot(r.a.x - r.b.x, r.a.y - r.b.y) < 1) continue;
        runs.push({ id: r.id, layer: r.layer, kind: 'free', a: { x: r.a.x, y: r.a.y }, b: { x: r.b.x, y: r.b.y } });
      }
    }
  }
  const cornerPicks = {};
  if (raw.cornerPicks && typeof raw.cornerPicks === 'object') {
    for (const [k, v] of Object.entries(raw.cornerPicks)) {
      if (/^(lower|upper):\d+$/.test(k) && v && Number.isInteger(v.wall) && Number.isInteger(v.opt) && v.opt >= 0 && v.opt < 20) {
        cornerPicks[k] = { wall: v.wall, opt: v.opt };
      }
    }
  }
  const up = raw.upper && typeof raw.upper === 'object' ? raw.upper : {};
  const zeroOk = (v) => (isNum(v) && v >= 0 ? v : 0);
  const upper = { height: numOrNull(up.height), crown: zeroOk(up.crown), rail: zeroOk(up.rail) };

  const ids = [...(room ? room.openings.map((o) => o.id) : []), ...markers.map((m) => m.id), ...runs.map((r) => r.id)];
  return {
    room,
    markers,
    ceiling: numOrNull(raw.ceiling),
    name: typeof raw.name === 'string' ? raw.name.slice(0, 80) : '',
    nextId: Math.max(isNum(raw.nextId) ? Math.floor(raw.nextId) : 1, ...ids.map((i) => i + 1), 1),
    runs,
    cornerPicks,
    upper,
  };
}

export function newRoom({ start, dirs, base }) {
  return {
    start,
    dirs,
    base,
    known: dirs.map(() => null),
    construction: dirs.map(() => false),
    openings: [],
  };
}

export function deriveRoom(room) {
  if (!room) return null;
  const { lens, gap } = solveLengths(room.dirs, room.base, room.known);
  const verts = buildVerts(room.start, room.dirs, lens);
  const gapLen = Math.hypot(gap.x, gap.y);
  const area = signedArea(verts.slice(0, room.dirs.length));
  const spans = new Map();
  for (let i = 0; i < room.dirs.length; i++) {
    const ops = room.openings.filter((o) => o.wall === i);
    if (!ops.length) continue;
    const L = dist(verts[i], verts[i + 1]);
    for (const [id, span] of computeSpans(ops, L)) spans.set(id, span);
  }
  return {
    spans,
    n: room.dirs.length,
    lens,
    verts,
    gap,
    gapLen,
    closed: gapLen < 0.05,
    orient: area >= 0 ? 1 : -1,
  };
}

export function createStore(storage) {
  let state = load() || blankState();
  const undoStack = [];
  const redoStack = [];
  const subs = new Set();

  function load() {
    try {
      const raw = storage && storage.getItem(KEY);
      if (!raw) return null;
      return normalizeState(JSON.parse(raw));
    } catch {
      return null;
    }
  }

  function persist() {
    try {
      if (storage) storage.setItem(KEY, JSON.stringify(state));
    } catch {
      // Storage can be unavailable (private mode); the sketch still works in memory.
    }
  }

  function notify() {
    for (const fn of subs) fn(state);
  }

  const snapshot = () => JSON.stringify(state);

  return {
    get: () => state,
    subscribe(fn) {
      subs.add(fn);
      return () => subs.delete(fn);
    },
    // Run an edit. Pass { snapshot: false } for the follow-up steps of a drag.
    mutate(fn, { snapshot: snap = true } = {}) {
      if (snap) {
        undoStack.push(snapshot());
        if (undoStack.length > HISTORY_LIMIT) undoStack.shift();
        redoStack.length = 0;
      }
      fn(state);
      persist();
      notify();
    },
    undo() {
      if (!undoStack.length) return false;
      redoStack.push(snapshot());
      state = JSON.parse(undoStack.pop());
      persist();
      notify();
      return true;
    },
    redo() {
      if (!redoStack.length) return false;
      undoStack.push(snapshot());
      state = JSON.parse(redoStack.pop());
      persist();
      notify();
      return true;
    },
    canUndo: () => undoStack.length > 0,
    canRedo: () => redoStack.length > 0,
    // Swap in a whole new sketch (opening a file). Undoable.
    replace(next) {
      undoStack.push(snapshot());
      redoStack.length = 0;
      state = next;
      persist();
      notify();
    },
    reset() {
      undoStack.push(snapshot());
      redoStack.length = 0;
      state = blankState();
      persist();
      notify();
    },
  };
}
