// The numbers the app asks for, addressed as "fields": a wall length, an opening size, the
// ceiling height, or a column size. The keypad edits one field at a time.
import { FIELD_LABELS, openingFields } from './store.js';
import { openingTitle, refLabel } from './render.js';

export const sameField = (a, b) =>
  !!a && !!b && a.kind === b.kind && a.i === b.i && a.id === b.id && a.field === b.field;

export function findOpening(state, id) {
  return state.room ? state.room.openings.find((o) => o.id === id) : undefined;
}

export function getFieldValue(state, f) {
  switch (f.kind) {
    case 'wall':
      return state.room ? state.room.known[f.i] : null;
    case 'opening': {
      const op = findOpening(state, f.id);
      return op ? op[f.field] : null;
    }
    case 'ceiling':
      return state.ceiling;
    case 'marker': {
      const m = state.markers.find((x) => x.id === f.id);
      return m ? m[f.field] : null;
    }
    default:
      return null;
  }
}

export function setFieldValue(state, f, value) {
  switch (f.kind) {
    case 'wall':
      if (state.room) state.room.known[f.i] = value;
      break;
    case 'opening': {
      const op = findOpening(state, f.id);
      if (op) op[f.field] = value;
      break;
    }
    case 'ceiling':
      state.ceiling = value;
      break;
    case 'marker': {
      const m = state.markers.find((x) => x.id === f.id);
      if (m) m[f.field] = value;
      break;
    }
    default:
  }
}

export function fieldTitle(state, f) {
  switch (f.kind) {
    case 'wall':
      return `Wall ${f.i + 1} length`;
    case 'opening': {
      const op = findOpening(state, f.id);
      if (!op) return '';
      if (f.field === 'pos') return `${openingTitle(state.room, op)} · Position, to ${refLabel(state.room, op)}`;
      return `${openingTitle(state.room, op)} · ${FIELD_LABELS[f.field]}`;
    }
    case 'ceiling':
      return 'Ceiling height';
    case 'marker':
      return f.field === 'w' ? 'Column width' : 'Column depth (skip = square)';
    default:
      return '';
  }
}

export function openingFieldList(op) {
  return openingFields(op.kind).map((field) => ({ kind: 'opening', id: op.id, field }));
}

// Walls still missing a length, starting after wall i and wrapping around.
export function wallQueueAfter(state, i) {
  const n = state.room.dirs.length;
  const q = [];
  for (let k = 1; k < n; k++) {
    const j = (i + k) % n;
    if (state.room.known[j] == null) q.push({ kind: 'wall', i: j });
  }
  return q;
}
