// Pure geometry for the wall sketch. World units are inches, screen y points down.

export const MIN_WALL = 1;

function clean(v) {
  if (Math.abs(v) < 1e-12) return 0;
  if (Math.abs(Math.abs(v) - 1) < 1e-12) return Math.sign(v);
  return v;
}

// Eight directions in 45 degree steps. 0 = east, 2 = south (down on screen), 4 = west, 6 = north.
export const DIRS = Array.from({ length: 8 }, (_, k) => {
  const a = (k * Math.PI) / 4;
  return { x: clean(Math.cos(a)), y: clean(Math.sin(a)) };
});

export function dirIndex(dx, dy) {
  const k = Math.round(Math.atan2(dy, dx) / (Math.PI / 4));
  return ((k % 8) + 8) % 8;
}

export const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

export function polylineLength(pts) {
  let t = 0;
  for (let i = 1; i < pts.length; i++) t += dist(pts[i - 1], pts[i]);
  return t;
}

export function dedupe(pts, minD) {
  const out = [];
  for (const p of pts) {
    if (!out.length || dist(out[out.length - 1], p) >= minD) out.push(p);
  }
  if (pts.length && out[out.length - 1] !== pts[pts.length - 1]) out.push(pts[pts.length - 1]);
  return out;
}

export function distToLine(p, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-9) return dist(p, a);
  return Math.abs((p.x - a.x) * dy - (p.y - a.y) * dx) / len;
}

export function simplifyRDP(pts, eps) {
  if (pts.length < 3) return pts.slice();
  const keep = new Array(pts.length).fill(false);
  keep[0] = keep[pts.length - 1] = true;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [s, e] = stack.pop();
    let maxD = 0;
    let idx = -1;
    for (let i = s + 1; i < e; i++) {
      const d = distToLine(pts[i], pts[s], pts[e]);
      if (d > maxD) {
        maxD = d;
        idx = i;
      }
    }
    if (idx !== -1 && maxD > eps) {
      keep[idx] = true;
      stack.push([s, idx], [idx, e]);
    }
  }
  return pts.filter((_, i) => keep[i]);
}

export function closestOnSegment(p, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  let t = l2 < 1e-12 ? 0 : ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2;
  t = Math.max(0, Math.min(1, t));
  const point = { x: a.x + dx * t, y: a.y + dy * t };
  return { t, point, d: dist(p, point) };
}

// Intersection of segments p-p2 and q-q2. Returns parameters along each, or null.
export function segIntersect(p, p2, q, q2) {
  const rx = p2.x - p.x;
  const ry = p2.y - p.y;
  const sx = q2.x - q.x;
  const sy = q2.y - q.y;
  const den = rx * sy - ry * sx;
  if (Math.abs(den) < 1e-12) return null;
  const qpx = q.x - p.x;
  const qpy = q.y - p.y;
  const t = (qpx * sy - qpy * sx) / den;
  const u = (qpx * ry - qpy * rx) / den;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return { t, u };
}

export function signedArea(pts) {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
}

// Walls run in fixed directions. Known lengths stay fixed; unknown walls are adjusted (least
// change from their sketched lengths) so the loop closes. When the unknown walls can't absorb the
// error, the leftover is returned as `gap` (end point minus start point) instead of being hidden.
export function solveLengths(dirs, base, known) {
  const n = dirs.length;
  const lens = base.map((b, i) => (known[i] != null ? known[i] : b));
  const unknown = [];
  for (let i = 0; i < n; i++) if (known[i] == null) unknown.push(i);

  if (unknown.length) {
    let rx = 0;
    let ry = 0;
    for (let i = 0; i < n; i++) {
      if (known[i] != null) {
        rx -= known[i] * DIRS[dirs[i]].x;
        ry -= known[i] * DIRS[dirs[i]].y;
      }
    }
    let sx = rx;
    let sy = ry;
    let m00 = 0;
    let m01 = 0;
    let m11 = 0;
    for (const i of unknown) {
      const d = DIRS[dirs[i]];
      sx -= base[i] * d.x;
      sy -= base[i] * d.y;
      m00 += d.x * d.x;
      m01 += d.x * d.y;
      m11 += d.y * d.y;
    }
    const det = m00 * m11 - m01 * m01;
    if (det > 1e-6) {
      const dx = (m11 * sx - m01 * sy) / det;
      const dy = (-m01 * sx + m00 * sy) / det;
      for (const i of unknown) {
        const d = DIRS[dirs[i]];
        lens[i] = base[i] + d.x * dx + d.y * dy;
      }
    } else {
      // All unknown walls are parallel: fix only the component along their shared axis.
      const u = DIRS[dirs[unknown[0]]];
      const need = sx * u.x + sy * u.y;
      for (const i of unknown) {
        const d = DIRS[dirs[i]];
        const sign = d.x * u.x + d.y * u.y;
        lens[i] = base[i] + (sign * need) / unknown.length;
      }
    }
    for (const i of unknown) lens[i] = Math.max(MIN_WALL, lens[i]);
  }

  let gx = 0;
  let gy = 0;
  for (let i = 0; i < n; i++) {
    gx += lens[i] * DIRS[dirs[i]].x;
    gy += lens[i] * DIRS[dirs[i]].y;
  }
  return { lens, gap: { x: gx, y: gy } };
}

export function buildVerts(start, dirs, lens) {
  const v = [{ x: start.x, y: start.y }];
  for (let i = 0; i < dirs.length; i++) {
    const d = DIRS[dirs[i]];
    const p = v[i];
    v.push({ x: p.x + d.x * lens[i], y: p.y + d.y * lens[i] });
  }
  return v;
}

// Turn a freehand stroke (screen px) into a closed polygon of walls at 45 degree steps.
// Returns { start (px), dirs, base (inches) } or null if the stroke can't be read as a room.
export function strokeToPolygon(ptsPx, scale) {
  const pathLen = polylineLength(ptsPx);
  if (ptsPx.length < 3 || pathLen < 60) return null;
  const vs = simplifyRDP(dedupe(ptsPx, 2), Math.max(7, pathLen * 0.025));
  if (vs.length < 3) return null;

  const first = vs[0];
  const last = vs[vs.length - 1];
  const closed = dist(first, last) < Math.max(36, pathLen * 0.12);
  if (closed) vs[vs.length - 1] = { x: first.x, y: first.y };
  else vs.push({ x: first.x, y: first.y });

  let segs = [];
  for (let i = 0; i < vs.length - 1; i++) {
    const dx = vs[i + 1].x - vs[i].x;
    const dy = vs[i + 1].y - vs[i].y;
    const len = Math.hypot(dx, dy);
    if (len < 1) continue;
    segs.push({ k: dirIndex(dx, dy), l: len });
  }

  // Drop tiny segments; the closure solve below redistributes what they covered.
  const minSeg = Math.max(16, pathLen * 0.04);
  for (;;) {
    if (segs.length <= 3) break;
    let idx = -1;
    let shortest = minSeg;
    segs.forEach((s, i) => {
      if (s.l < shortest) {
        shortest = s.l;
        idx = i;
      }
    });
    if (idx === -1) break;
    segs.splice(idx, 1);
  }

  // Merge neighbours that run the same way (or back on themselves) after snapping.
  let changed = true;
  while (changed && segs.length >= 3) {
    changed = false;
    for (let i = 0; i < segs.length; i++) {
      const j = (i + 1) % segs.length;
      if (j === i) break;
      const a = segs[i];
      const b = segs[j];
      if (a.k === b.k) {
        a.l += b.l;
        segs.splice(j, 1);
        changed = true;
        break;
      }
      if ((a.k + 4) % 8 === b.k) {
        const net = a.l - b.l;
        if (Math.abs(net) < 1e-6) {
          segs.splice(Math.max(i, j), 1);
          segs.splice(Math.min(i, j), 1);
        } else if (net > 0) {
          a.l = net;
          segs.splice(j, 1);
        } else {
          b.l = -net;
          segs.splice(i, 1);
        }
        changed = true;
        break;
      }
    }
  }
  if (segs.length < 3) return null;

  const dirs = segs.map((s) => s.k);
  const base = segs.map((s) => s.l / scale);
  const solved = solveLengths(dirs, base, base.map(() => null));
  if (solved.lens.some((l) => l < 3)) return null;
  if (Math.hypot(solved.gap.x, solved.gap.y) > 0.01) return null;
  return { start: { x: first.x, y: first.y }, dirs, base: solved.lens };
}

// Where along an opening's wall it sits, in inches from the wall start. Clamped inside the wall.
export function openingSpan(op, wallLen) {
  const w = Math.min(op.ro != null ? op.ro : op.drawW, wallLen);
  let c = op.t * wallLen;
  c = Math.max(w / 2, Math.min(wallLen - w / 2, c));
  return [c - w / 2, c + w / 2];
}

// Spans (inches from the wall start) of every opening on one wall, keyed by opening id.
// An opening with a position (`pos`) is placed exactly that far from its reference: a corner of
// the wall or the facing edge of a neighbouring opening. References always point at openings made
// earlier, so resolving in id order never loops.
export function computeSpans(ops, wallLen) {
  const spans = new Map();
  const sorted = ops.slice().sort((a, b) => a.id - b.id);
  for (const op of sorted) {
    const w = Math.min(op.ro != null ? op.ro : op.drawW, wallLen);
    let u0;
    if (op.pos != null && op.ref) {
      const ref = op.ref.id != null ? spans.get(op.ref.id) : null;
      if (op.ref.side === 'before') u0 = (ref ? ref[1] : 0) + op.pos;
      else u0 = (ref ? ref[0] : wallLen) - op.pos - w;
    } else {
      const c = Math.max(w / 2, Math.min(wallLen - w / 2, op.t * wallLen));
      u0 = c - w / 2;
    }
    u0 = Math.max(0, Math.min(wallLen - w, u0));
    spans.set(op.id, [u0, u0 + w]);
  }
  return spans;
}

// The closest thing to measure a new opening from: a wall corner or a neighbouring opening.
export function nearestReference(span, wallLen, others) {
  let best = { id: null, side: 'before', gap: span[0] };
  if (wallLen - span[1] < best.gap) best = { id: null, side: 'after', gap: wallLen - span[1] };
  for (const o of others) {
    if (o.span[1] <= span[0] + 1e-9) {
      const gap = span[0] - o.span[1];
      if (gap < best.gap) best = { id: o.id, side: 'before', gap };
    } else if (o.span[0] >= span[1] - 1e-9) {
      const gap = o.span[0] - span[1];
      if (gap < best.gap) best = { id: o.id, side: 'after', gap };
    }
  }
  return { id: best.id, side: best.side };
}
