// Reads pencil strokes. Stroke classification works in screen px; wall matching works in world
// inches (callers convert tolerances with the current zoom).
import {
  dist,
  dedupe,
  polylineLength,
  simplifyRDP,
  distToLine,
  closestOnSegment,
  segIntersect,
} from './geometry.js';

function turnAngle(a, b, c) {
  const v1x = b.x - a.x;
  const v1y = b.y - a.y;
  const v2x = c.x - b.x;
  const v2y = c.y - b.y;
  const l1 = Math.hypot(v1x, v1y);
  const l2 = Math.hypot(v2x, v2y);
  if (l1 < 1e-9 || l2 < 1e-9) return 0;
  const cos = (v1x * v2x + v1y * v2y) / (l1 * l2);
  return (Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI;
}

// Returns { type: 'tap' | 'line' | 'arc' | 'scribble' | 'other', pathLen, chord }.
export function classifyStroke(pts) {
  const pathLen = polylineLength(pts);
  if (pts.length < 2 || pathLen < 10) return { type: 'tap', pathLen, chord: 0 };
  const a = pts[0];
  const b = pts[pts.length - 1];
  const chord = dist(a, b);

  const simp = simplifyRDP(dedupe(pts, 2), 6);
  let sharp = 0;
  for (let i = 1; i < simp.length - 1; i++) {
    if (turnAngle(simp[i - 1], simp[i], simp[i + 1]) > 100) sharp++;
  }
  const ratio = pathLen / Math.max(chord, 1);
  if (sharp >= 2 || (sharp >= 1 && ratio > 1.8) || ratio > 3) {
    return { type: 'scribble', pathLen, chord };
  }

  let maxDev = 0;
  for (const p of pts) maxDev = Math.max(maxDev, distToLine(p, a, b));
  const bulge = chord > 0 ? maxDev / chord : 99;
  if (bulge < 0.1) return { type: 'line', pathLen, chord };

  // Arcs turn one way the whole time.
  const rs = dedupe(pts, 6);
  let pos = 0;
  let neg = 0;
  for (let i = 1; i < rs.length - 1; i++) {
    const c = (rs[i].x - rs[i - 1].x) * (rs[i + 1].y - rs[i].y) - (rs[i].y - rs[i - 1].y) * (rs[i + 1].x - rs[i].x);
    if (c > 0.5) pos++;
    else if (c < -0.5) neg++;
  }
  const consistent = pos + neg > 0 && Math.max(pos, neg) / (pos + neg) >= 0.8;
  if (sharp === 0 && bulge >= 0.13 && bulge <= 0.65 && consistent) return { type: 'arc', pathLen, chord };
  return { type: 'other', pathLen, chord };
}

// Straight-wall frames for hit testing: a, b in world inches, unit direction d, drawn length L.
export function wallFrames(verts, construction) {
  const frames = [];
  for (let i = 0; i < verts.length - 1; i++) {
    const a = verts[i];
    const b = verts[i + 1];
    const L = dist(a, b);
    const d = L > 1e-9 ? { x: (b.x - a.x) / L, y: (b.y - a.y) / L } : { x: 1, y: 0 };
    frames.push({ i, a, b, L, d, n: { x: -d.y, y: d.x }, construction: !!(construction && construction[i]) });
  }
  return frames;
}

export function hitWall(p, frames, tol) {
  let best = null;
  for (const f of frames) {
    const c = closestOnSegment(p, f.a, f.b);
    if (c.d <= tol && (!best || c.d < best.d)) best = { i: f.i, d: c.d, u: c.t * f.L };
  }
  return best;
}

export function hitOpening(p, frames, openings, tol, spans) {
  for (const op of openings) {
    const f = frames[op.wall];
    const span = spans.get(op.id);
    if (!f || !span) continue;
    const [u0, u1] = span;
    const c = closestOnSegment(p, f.a, f.b);
    const u = c.t * f.L;
    if (c.d <= tol * 1.5 && u >= u0 - tol && u <= u1 + tol) return op;
  }
  return null;
}

// A short straight stroke that crosses a wall roughly at right angles marks one edge of an opening.
export function findLineCrossing(a, b, frames, tol) {
  const len = dist(a, b);
  if (len < 1e-9) return null;
  const dir = { x: (b.x - a.x) / len, y: (b.y - a.y) / len };
  const p0 = { x: a.x - dir.x * tol, y: a.y - dir.y * tol };
  const p1 = { x: b.x + dir.x * tol, y: b.y + dir.y * tol };
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  let best = null;
  for (const f of frames) {
    if (f.construction) continue;
    const hit = segIntersect(p0, p1, f.a, f.b);
    if (!hit) continue;
    if (Math.abs(dir.x * f.d.x + dir.y * f.d.y) > 0.75) continue;
    const point = { x: f.a.x + (f.b.x - f.a.x) * hit.u, y: f.a.y + (f.b.y - f.a.y) * hit.u };
    const d = dist(point, mid);
    if (!best || d < best.d) best = { wall: f.i, u: hit.u * f.L, d };
  }
  return best;
}

// A quarter-circle arc drawn next to a wall is a door swing: one end sits on the wall (latch),
// the other end is the open leaf tip, directly out from the hinge.
export function arcToDoor(pts, frames, tol) {
  const A = pts[0];
  const B = pts[pts.length - 1];
  let best = null;
  for (const f of frames) {
    if (f.construction) continue;
    const ca = closestOnSegment(A, f.a, f.b);
    const cb = closestOnSegment(B, f.a, f.b);
    const m = Math.min(ca.d, cb.d);
    if (!best || m < best.m) best = { f, ca, cb, m };
  }
  if (!best || best.m > tol) return null;
  const { f } = best;
  const aOnWall = best.ca.d <= best.cb.d;
  const Ew = aOnWall ? A : B;
  const Ef = aOnWall ? B : A;
  const uw = (Ew.x - f.a.x) * f.d.x + (Ew.y - f.a.y) * f.d.y;
  const uf = (Ef.x - f.a.x) * f.d.x + (Ef.y - f.a.y) * f.d.y;
  const h = (Ef.x - f.a.x) * f.n.x + (Ef.y - f.a.y) * f.n.y;
  const w = Math.abs(uw - uf);
  if (Math.abs(h) < w * 0.3) return null;
  if (w < 18) return { error: 'small' };
  const width = Math.min(Math.round(w), Math.floor(f.L));
  const center = Math.max(width / 2, Math.min(f.L - width / 2, (uw + uf) / 2));
  return {
    wall: f.i,
    t: center / f.L,
    drawW: width,
    swing: { hinge: uf < uw ? 0 : 1, side: h >= 0 ? 1 : -1 },
  };
}

function distToPolyline(p, pts) {
  let best = Infinity;
  for (let i = 1; i < pts.length; i++) best = Math.min(best, closestOnSegment(p, pts[i - 1], pts[i]).d);
  return best;
}

// Walls a scribble or swipe touches: crossed by the stroke, or mostly covered by it.
export function constructionTargets(pts, frames, tol) {
  const hits = [];
  for (const f of frames) {
    let hit = false;
    for (let k = 1; k < pts.length && !hit; k++) {
      if (segIntersect(pts[k - 1], pts[k], f.a, f.b)) hit = true;
    }
    if (!hit) {
      let covered = 0;
      const N = 12;
      for (let j = 0; j <= N; j++) {
        const p = { x: f.a.x + ((f.b.x - f.a.x) * j) / N, y: f.a.y + ((f.b.y - f.a.y) * j) / N };
        if (distToPolyline(p, pts) <= tol) covered++;
      }
      if (covered / (N + 1) >= 0.6) hit = true;
    }
    if (hit) hits.push(f.i);
  }
  return hits;
}
