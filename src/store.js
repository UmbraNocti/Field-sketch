// Sketch state, derived geometry, undo history and local autosave.
import { solveLengths, buildVerts, signedArea } from './geometry.js';

const KEY = 'fieldsketch.v1';
const HISTORY_LIMIT = 100;

export const MARKER_TYPES = ['plumbing', 'outlet', 'gas', 'vent', 'column'];

export const FIELD_LABELS = {
  ro: 'Rough opening',
  cc: 'Casing to casing',
  sill: 'Sill height',
  h: 'Window height',
};

export function openingFields(kind) {
  return kind === 'window' ? ['ro', 'cc', 'sill', 'h'] : ['ro', 'cc'];
}

export function blankState() {
  return { room: null, markers: [], ceiling: null, nextId: 1 };
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
  return {
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
      const s = JSON.parse(raw);
      if (!s || !Array.isArray(s.markers)) return null;
      return { ...blankState(), ...s };
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
    reset() {
      undoStack.push(snapshot());
      redoStack.length = 0;
      state = blankState();
      persist();
      notify();
    },
  };
}
