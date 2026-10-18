// Saving a sketch to a file and reading it back. The file is plain JSON so it can be inspected,
// emailed, or kept in a job folder.
import { normalizeState } from './store.js';

export const FILE_APP = 'field-sketch';
export const FILE_VERSION = 1;

export function serializeSketch(state, now = new Date()) {
  return JSON.stringify(
    {
      app: FILE_APP,
      version: FILE_VERSION,
      saved: now.toISOString(),
      name: state.name || '',
      state: {
        room: state.room,
        markers: state.markers,
        ceiling: state.ceiling,
        name: state.name || '',
        nextId: state.nextId,
        runs: state.runs,
        cornerPicks: state.cornerPicks,
        upper: state.upper,
      },
    },
    null,
    1,
  );
}

// Returns { state } on success or { error } with a message fit to show the user.
export function parseSketch(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return { error: 'That file isn\u2019t a Field Sketch file.' };
  }
  if (!data || data.app !== FILE_APP || !data.state) return { error: 'That file isn\u2019t a Field Sketch file.' };
  if (typeof data.version === 'number' && data.version > FILE_VERSION) {
    return { error: 'That sketch was saved by a newer version of the app.' };
  }
  const state = normalizeState(data.state);
  if (!state) return { error: 'That sketch file looks damaged.' };
  if (!state.name && typeof data.name === 'string') state.name = data.name.slice(0, 80);
  return { state };
}

export function fileNameFor(state, now = new Date(), ext = '.fieldsketch.json') {
  const base = (state.name || 'kitchen-sketch')
    .trim()
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase() || 'kitchen-sketch';
  const d = now.toISOString().slice(0, 10);
  return `${base}-${d}${ext}`;
}
