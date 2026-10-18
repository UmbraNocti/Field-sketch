// Works out the zoom and pan that fit the whole sketch (walls, markers, island runs, and the
// dimension callouts that stand outside doors and windows) into a w x h area.
import { wallFrames } from './recognize.js';

// Callouts for doors and windows stand this many px outside their wall, so the fit leaves room.
const CALLOUT_PX = { door: 84, window: 108 };

export function computeFit(state, derived, w, h) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const grow = (p) => {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  };
  derived.verts.forEach(grow);
  state.markers.forEach(grow);
  for (const r of state.runs || []) {
    if (r.kind === 'free') {
      grow(r.a);
      grow(r.b);
    }
  }

  // Position callouts have text that can stand beyond the corner they measure from; leave room.
  const pad = Math.max(30, Math.min(70, 0.08 * Math.min(w, h))) + (state.room.openings.length ? 26 : 0);
  const extra = { l: 0, r: 0, t: 0, b: 0 };
  const fr = wallFrames(derived.verts, state.room.construction);
  for (const op of state.room.openings) {
    const f = fr[op.wall];
    const px = CALLOUT_PX[op.kind];
    const ox = -f.n.x * derived.orient * px;
    const oy = -f.n.y * derived.orient * px;
    extra.r = Math.max(extra.r, ox);
    extra.l = Math.max(extra.l, -ox);
    extra.b = Math.max(extra.b, oy);
    extra.t = Math.max(extra.t, -oy);
  }
  const bw = Math.max(maxX - minX, 24);
  const bh = Math.max(maxY - minY, 24);
  const availW = w - 2 * pad - extra.l - extra.r;
  const availH = h - 2 * pad - extra.t - extra.b;
  const s = Math.max(0.3, Math.min(10, availW / bw, availH / bh));
  return {
    s,
    ox: pad + extra.l + (availW - bw * s) / 2 - minX * s,
    oy: pad + extra.t + (availH - bh * s) / 2 - minY * s,
  };
}
