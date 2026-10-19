// Turns the sketch (walls, openings, markers, drawn runs) into cabinet boxes, per layer.
// Geometry and bookkeeping live here; the fitting itself is in fill.js and the numbers are in
// rules.js. Positions along a run are inches from the run's wall start (wall runs) or from its
// first end (free-standing island runs).
import { RULES, PANTRY_SIZES, MARKER_KIND, APPLIANCE_TYPES, UTILITY_TYPES, APPLIANCE_NAMES } from './rules.js';
import { fillSegment } from './fill.js';
import { wallFrames } from './recognize.js';
import { dist, closestOnSegment, segIntersect } from './geometry.js';
import { formatInches } from './format.js';

const fmt = (v) => formatInches(v, { quote: false });
const EPS = 0.01;

function frameForRun(run, frames, orient) {
  if (run.kind === 'wall') {
    const f = frames[run.wall];
    if (!f || f.construction) return null;
    const L = f.L;
    // A run that stops within a few inches of a corner is treated as reaching it.
    let u0 = Math.max(0, Math.min(L, run.u0));
    let u1 = Math.max(0, Math.min(L, run.u1));
    if (u0 <= RULES.cornerReach) u0 = 0;
    if (u1 >= L - RULES.cornerReach) u1 = L;
    return { a: f.a, d: f.d, n: { x: f.n.x * orient, y: f.n.y * orient }, L, u0, u1, wall: run.wall };
  }
  const L = dist(run.a, run.b);
  if (L < 1) return null;
  const d = { x: (run.b.x - run.a.x) / L, y: (run.b.y - run.a.y) / L };
  return { a: run.a, d, n: { x: -d.y, y: d.x }, L, u0: 0, u1: L, wall: null };
}

const at = (fr, u, out = 0) => ({ x: fr.a.x + fr.d.x * u + fr.n.x * out, y: fr.a.y + fr.d.y * u + fr.n.y * out });

function project(p, fr) {
  const dx = p.x - fr.a.x;
  const dy = p.y - fr.a.y;
  return { u: dx * fr.d.x + dy * fr.d.y, perp: dx * fr.n.x + dy * fr.n.y };
}

// Where cabinets must stop on a wall because of doors and windows.
function blockersFor(layer, state, derived, wall, molding, notes) {
  const out = [];
  state.room.openings.forEach((op) => {
    if (op.wall !== wall) return;
    const span = derived.spans.get(op.id);
    if (!span) return;
    const c = (span[0] + span[1]) / 2;
    const width = span[1] - span[0];
    const ccW = op.cc != null ? op.cc : width + 4;
    let block = true;
    if (op.kind === 'window' && layer === 'lower') {
      if (op.sill == null) {
        block = false;
        notes.push({ level: 'info', text: `Window sill height not entered; lowers assume it is above ${RULES.lowerWindowSill}".`, key: `sill${op.id}` });
      } else block = op.sill < RULES.lowerWindowSill;
    }
    if (!block) return;
    const clear = RULES.casingClearance + (layer === 'upper' ? molding : 0);
    out.push({ u0: c - ccW / 2 - clear, u1: c + ccW / 2 + clear, opId: op.id });
  });
  return out.sort((a, b) => a.u0 - b.u0);
}

// Inside corners where two runs meet: one holds the blind corner cabinet, the other stops short.
function cornerRoles(layer, runs, runFrames, frames, orient, picks, corners) {
  const roles = new Map();
  const n = frames.length;
  const wallRuns = runs.filter((r) => r.kind === 'wall' && runFrames.get(r.id));
  const ext = (r) => runFrames.get(r.id);
  for (const run of wallRuns) {
    const fi = frames[run.wall];
    const er = ext(run);
    for (const end of ['start', 'end']) {
      const atCorner = end === 'start' ? er.u0 <= EPS : er.u1 >= fi.L - EPS;
      if (!atCorner) continue;
      const j = end === 'start' ? (run.wall - 1 + n) % n : (run.wall + 1) % n;
      const fj = frames[j];
      if (!fj || fj.construction) continue;
      const other = wallRuns.find((r) => r.wall === j && (end === 'start' ? ext(r).u1 >= fj.L - EPS : ext(r).u0 <= EPS));
      if (!other || other.id === run.id) continue;
      const first = end === 'start' ? fj : fi;
      const second = end === 'start' ? fi : fj;
      const dot = first.d.x * second.d.x + first.d.y * second.d.y;
      const cross = first.d.x * second.d.y - first.d.y * second.d.x;
      if (Math.abs(dot) > 1e-6 || cross * orient <= 0) continue; // only square inside corners
      const vertex = end === 'start' ? run.wall : (run.wall + 1) % n;
      const key = `${layer}:${vertex}`;
      const pick = picks[key];
      const holderWall = pick && (pick.wall === run.wall || pick.wall === j) ? pick.wall : run.id < other.id ? run.wall : j;
      const opt = pick ? pick.opt % corners.length : 0;
      const choice = corners[opt];
      roles.set(`${run.id}:${end}`, {
        key,
        holder: holderWall === run.wall,
        opt,
        count: corners.length,
        type: choice.type,
        size: choice.type === 'diag' ? choice.leg : choice.width,
        ownerRunId: Math.min(run.id, other.id),
        vertex,
        walls: [run.wall, j],
        end,
      });
    }
  }
  return roles;
}

function segmentsOf(lo, hi, blockers) {
  const segs = [];
  let cursor = lo;
  for (const b of blockers) {
    if (b.u1 <= cursor) continue;
    if (b.u0 > cursor) segs.push({ lo: cursor, hi: Math.min(b.u0, hi) });
    cursor = Math.max(cursor, b.u1);
    if (cursor >= hi) break;
  }
  if (cursor < hi) segs.push({ lo: cursor, hi });
  return segs.filter((s) => s.hi - s.lo > EPS);
}

function labelFor(layer, box) {
  const size = fmt(box.u1 - box.u0);
  switch (box.kind) {
    case 'base':
      return `${layer === 'upper' ? 'W' : 'B'}${size}`;
    case 'filler':
      return `F ${size}`;
    case 'gap':
      return `gap ${size}`;
    case 'corner':
      return `${layer === 'upper' ? 'WBC' : 'BBC'}${size}`;
    case 'diag':
      return `${layer === 'upper' ? 'WDC' : 'DC'}${size}`;
    case 'flex':
      return box.type === 'sink' ? `SB${size}` : box.type === 'waste' ? `TB${size}` : `CB${size}`;
    case 'void':
      return box.type === 'range' ? `RNG ${size}` : `DW ${size}`;
    case 'hood':
      return `HOOD ${size}`;
    case 'tall':
      if (box.type === 'fridge') return `REF ${size}`;
      if (box.type === 'oven') return `OVN ${size}`;
      if (box.type === 'pantry') return `PNT ${size}`;
      return `T${size}`;
    default:
      return size;
  }
}

function segDist(a, b, c, d) {
  if (segIntersect(a, b, c, d)) return 0;
  return Math.min(closestOnSegment(a, c, d).d, closestOnSegment(b, c, d).d, closestOnSegment(c, a, b).d, closestOnSegment(d, a, b).d);
}

// A diagonal corner cabinet: a leg along each wall and a 45 degree front. It is built from the
// corner point and the directions running away from it along both walls.
function diagonalBox(layer, role, frames, orient, fr, depth) {
  const n = frames.length;
  const wall = role.walls[0];
  const other = role.walls[1];
  const fa = frames[wall];
  const fb = frames[other];
  const atStart = role.end === 'start';
  const C = atStart ? fa.a : fa.b;
  const dA = atStart ? fa.d : { x: -fa.d.x, y: -fa.d.y };
  const dB = atStart ? { x: -fb.d.x, y: -fb.d.y } : fb.d;
  const nA = { x: fa.n.x * orient, y: fa.n.y * orient };
  const nB = { x: fb.n.x * orient, y: fb.n.y * orient };
  const leg = role.size;
  const P = (a, b, c, d) => ({ x: C.x + dA.x * a + nA.x * b + dB.x * c + nB.x * d, y: C.y + dA.y * a + nA.y * b + dB.y * c + nB.y * d });
  void n;
  return {
    kind: 'diag',
    u0: atStart ? 0 : fr.L - leg,
    u1: atStart ? leg : fr.L,
    runId: undefined,
    depth,
    corner: { key: role.key, opt: role.opt, count: role.count },
    cornerWalls: role.walls,
    poly: [
      { x: C.x, y: C.y },
      P(leg, 0, 0, 0),
      P(leg, depth, 0, 0),
      P(0, 0, leg, depth),
      P(0, 0, leg, 0),
    ],
  };
}

export function computeLayout(layer, state, derived, lowerLayout) {
  const empty = { layer, runs: [], zones: [], notes: [], tall: new Map(), markerBoxes: new Map() };
  if (!state.room || !derived) return empty;
  const rules = RULES[layer];
  const frames = wallFrames(derived.verts, state.room.construction);
  const orient = derived.orient;
  const runs = (state.runs || []).filter((r) => r.layer === layer);
  const notes = [];
  const molding = layer === 'upper' ? Math.max((state.upper && state.upper.crown) || 0, (state.upper && state.upper.rail) || 0) : 0;
  const picks = state.cornerPicks || {};
  const out = { layer, runs: [], zones: [], notes, tall: new Map(), markerBoxes: new Map() };

  // Uppers care about the full-height pieces, the pantry, and the blank place over a range or cooktop.
  const appliances = state.markers.filter((m) => APPLIANCE_TYPES.includes(m.type) && MARKER_KIND[m.type] !== 'none' && (layer === 'lower' || MARKER_KIND[m.type] === 'tall' || m.type === 'range' || m.type === 'cooktop'));
  const utilities = state.markers.filter((m) => UTILITY_TYPES.includes(m.type));

  // Frames for every run, then give each appliance marker to the run it sits against.
  const runFrames = new Map();
  for (const run of runs) {
    const fr = frameForRun(run, frames, orient);
    if (fr) runFrames.set(run.id, fr);
    else notes.push({ level: 'warn', text: 'A cabinet run is on a wall that is now open. Delete it or redraw it.', runId: run.id });
  }
  const roles = cornerRoles(layer, runs, runFrames, frames, orient, picks, rules.corners);
  const assigned = new Map();
  const placedMarkers = new Set();
  for (const m of appliances) {
    let best = null;
    for (const run of runs) {
      const fr = runFrames.get(run.id);
      if (!fr) continue;
      const pr = project(m, fr);
      if (pr.u < fr.u0 - 12 || pr.u > fr.u1 + 12) continue;
      if (pr.perp < -RULES.markerReach.behind || pr.perp > RULES.markerReach.out) continue;
      const score = Math.abs(pr.perp - rules.depth / 2);
      if (!best || score < best.score) best = { run, pr, score };
    }
    if (best) {
      if (!assigned.has(best.run.id)) assigned.set(best.run.id, []);
      assigned.get(best.run.id).push({ m, u: best.pr.u, perp: best.pr.perp });
      placedMarkers.add(m.id);
    }
  }

  const sorted = runs.slice().sort((a, b) => a.id - b.id);
  sorted.forEach((run, runIndex) => {
    const fr = runFrames.get(run.id);
    if (!fr) return;
    const depth = rules.depth;
    let lo = fr.u0;
    let hi = fr.u1;
    let startBlind = null;
    let endBlind = null;
    const diagBoxes = [];
    const sr = roles.get(`${run.id}:start`);
    const er = roles.get(`${run.id}:end`);
    // A blind corner cabinet is centered on the other run's face line, so it sits in from the
    // corner by (depth - width / 2) with a filler closing the gap. A diagonal corner is a leg
    // along each wall with a 45 degree front; both runs start a full leg in from the corner.
    const applyCorner = (role, atStart) => {
      if (!role) return;
      if (role.type === 'blind') {
        if (role.holder) {
          const blind = { width: role.size, offset: Math.max(0, depth - role.size / 2), role };
          if (atStart) startBlind = blind;
          else endBlind = blind;
        } else if (atStart) lo += depth;
        else hi -= depth;
        return;
      }
      if (atStart) lo += role.size;
      else hi -= role.size;
      if (role.ownerRunId === run.id) diagBoxes.push(diagonalBox(layer, role, frames, orient, fr, depth));
    };
    applyCorner(sr, true);
    applyCorner(er, false);
    const blockers = run.kind === 'wall' ? blockersFor(layer, state, derived, run.wall, molding, notes) : [];
    const segs = segmentsOf(lo, hi, blockers);
    const boxes = [];
    const myMarkers = assigned.get(run.id) || [];
    const usedMarkers = new Set();

    segs.forEach((seg, si) => {
      const first = Math.abs(seg.lo - lo) < EPS;
      const last = Math.abs(seg.hi - hi) < EPS;
      const sb = first ? startBlind : null;
      const eb = last ? endBlind : null;
      const segLen = seg.hi - seg.lo;
      // Markers that belong to this stretch: nearest stretch wins.
      const mine = myMarkers.filter((mk) => {
        let bestSeg = 0;
        let bestD = Infinity;
        segs.forEach((s2, i2) => {
          const d = mk.u < s2.lo ? s2.lo - mk.u : mk.u > s2.hi ? mk.u - s2.hi : 0;
          if (d < bestD) {
            bestD = d;
            bestSeg = i2;
          }
        });
        return bestSeg === si;
      });
      const items = [];
      for (const mk of mine) {
        // In the uppers a cooktop is just a blank place for the hood, the same as a range.
        const kind = layer === 'upper' && mk.m.type === 'cooktop' ? 'void' : MARKER_KIND[mk.m.type];
        let width = mk.m.w || RULES.defaultWidths[mk.m.type];
        if (mk.m.type === 'pantry') width = PANTRY_SIZES.reduce((best, sz) => (Math.abs(sz - width) < Math.abs(best - width) ? sz : best), PANTRY_SIZES[0]);
        const center = Math.max(0, Math.min(segLen, mk.u - seg.lo));
        const reach = RULES.hookupReach;
        const need = RULES.hookups[mk.m.type] || [];
        const touched = [];
        for (const ut of utilities) {
          if (!need.includes(ut.type)) continue;
          const pr = project(ut, fr);
          if (pr.perp < -6 || pr.perp > reach.out) continue;
          if (pr.u < mk.u - width / 2 - reach.along || pr.u > mk.u + width / 2 + reach.along) continue;
          touched.push(Math.max(0, Math.min(segLen, pr.u - seg.lo)));
        }
        if (layer === 'lower' && need.length && !touched.length) {
          notes.push({
            level: 'warn',
            text: `${APPLIANCE_NAMES[mk.m.type]} ${fmt(width)}: no ${mk.m.type === 'sink' ? 'plumbing' : 'hookups'} marked.`,
            markerId: mk.m.id,
            hookup: true,
          });
        }
        const item = { id: mk.m.id, type: mk.m.type, kind, width, center, points: [center, ...touched], touched: touched.length > 0 };
        if (layer === 'upper') {
          // Full-height pieces sit in the same place as in the lowers.
          const lb = lowerLayout && lowerLayout.markerBoxes.get(mk.m.id);
          const centre = lb && run.kind === 'wall' && lb.wall === run.wall ? (lb.u0 + lb.u1) / 2 : mk.u;
          item.fixedAt = centre - width / 2 - seg.lo;
        }
        if (kind === 'flex') {
          item.target = center;
          if (mk.m.type === 'sink' && run.kind === 'wall') {
            // A window behind the sink pulls the box to the window's center.
            for (const op of state.room.openings) {
              if (op.wall !== run.wall || op.kind !== 'window') continue;
              const sp = derived.spans.get(op.id);
              if (sp && sp[1] > mk.u - width / 2 && sp[0] < mk.u + width / 2) item.target = Math.max(0, Math.min(segLen, (sp[0] + sp[1]) / 2 - seg.lo));
            }
          }
        }
        items.push(item);
        usedMarkers.add(mk.m.id);
      }

      const res = fillSegment({
        len: segLen,
        sizes: rules.sizes,
        maxFiller: RULES.maxFiller,
        preferredMax: RULES.preferredMax,
        flexMax: RULES.flexMax,
        dwMax: RULES.dishwasherMaxFromSink,
        freeShift: RULES.freeShiftWidths,
        startBlind: sb ? { width: sb.width, offset: sb.offset, extra: { corner: { key: sb.role.key, opt: sb.role.opt, count: sb.role.count } } } : null,
        endBlind: eb ? { width: eb.width, offset: eb.offset, extra: { corner: { key: eb.role.key, opt: eb.role.opt, count: eb.role.count } } } : null,
        items,
      });
      for (const id of res.dropped) {
        const m = state.markers.find((x) => x.id === id);
        notes.push({ level: 'warn', text: `Couldn't fit the ${APPLIANCE_NAMES[m.type].toLowerCase()} in Run ${runIndex + 1}.`, markerId: id });
        usedMarkers.delete(id);
      }
      if (res.viol > 0 && !res.boxes.some((b) => b.kind === 'gap')) {
        notes.push({ level: 'warn', text: `Run ${runIndex + 1} is tight: not every rule could be met.`, runId: run.id });
      }
      const segBoxes = res.boxes.map((b) => ({ ...b, u0: b.u0 + seg.lo, u1: b.u1 + seg.lo, runId: run.id }));

      // Fridge panels go on any side that isn't a wall, a corner, or another full-height cabinet.
      const wallStart = first && run.kind === 'wall' && fr.u0 <= EPS;
      const wallEnd = last && run.kind === 'wall' && fr.u1 >= fr.L - EPS;
      segBoxes.forEach((b, i) => {
        const prev = segBoxes[i - 1];
        const next = segBoxes[i + 1];
        if (b.kind === 'tall' && b.type === 'fridge') {
          const closedL = prev ? prev.kind === 'tall' || prev.kind === 'corner' : first && (wallStart || !!sb);
          const closedR = next ? next.kind === 'tall' || next.kind === 'corner' : last && (wallEnd || !!eb);
          b.panels = { left: !closedL, right: !closedR };
        } else if (layer === 'lower' && b.kind === 'void' && b.type === 'dishwasher') {
          // A dishwasher needs an end panel only where it is the end of the cabinets (a range doesn't).
          const closedL = prev ? true : first && (wallStart || !!sb);
          const closedR = next ? true : last && (wallEnd || !!eb);
          if (!closedL || !closedR) b.panels = { left: !closedL, right: !closedR };
        }
        // Over the range the uppers leave a blank place for the hood.
        if (layer === 'upper' && b.kind === 'void' && (b.type === 'range' || b.type === 'cooktop')) b.kind = 'hood';
      });
      boxes.push(...segBoxes);
    });

    // Anything the segments couldn't place (e.g. markers over a blocked stretch).
    for (const mk of myMarkers) {
      if (!usedMarkers.has(mk.m.id) && !notes.some((n) => n.markerId === mk.m.id && /fit/.test(n.text))) {
        notes.push({ level: 'info', text: `${APPLIANCE_NAMES[mk.m.type]} marker is over a stretch with no cabinets.`, markerId: mk.m.id });
      }
    }

    boxes.push(...diagBoxes);
    boxes.sort((a, b) => a.u0 - b.u0);
    boxes.forEach((b) => {
      b.label = labelFor(layer, b);
      b.size = b.u1 - b.u0;
      // Full-height cabinets are the same 24" deep in both layers.
      b.depth = b.kind === 'tall' ? RULES.lower.depth : depth;
      if (!b.poly) b.poly = [at(fr, b.u0), at(fr, b.u1), at(fr, b.u1, b.depth), at(fr, b.u0, b.depth)];
      if (b.kind === 'gap') notes.push({ level: 'warn', text: `${fmt(b.size)}" left over in Run ${runIndex + 1}.`, runId: run.id });
      if (b.id != null && (b.kind === 'tall' || b.kind === 'void' || b.kind === 'flex' || b.kind === 'hood')) {
        b.wall = run.kind === 'wall' ? run.wall : null;
        out.markerBoxes.set(b.id, b);
        if (b.kind === 'tall') out.tall.set(b.id, { wall: run.kind === 'wall' ? run.wall : null, u0: b.u0, u1: b.u1 });
      }
    });
    for (const b of boxes) if (b.kind === 'corner') b.cornerWalls = (b.side === 'start' ? sr : er).walls;
    const extras = [];
    for (const b of boxes) {
      if (!b.panels) continue;
      const name = b.type === 'fridge' ? 'Fridge panel' : 'Dishwasher end panel';
      if (b.panels.left) extras.push(name);
      if (b.panels.right) extras.push(name);
    }
    out.runs.push({ run, index: runIndex + 1, frame: fr, depth, boxes, extras, cut: boxes.map((b) => b.label) });
  });

  if (layer === 'lower') {
    const anyRuns = out.runs.length > 0;
    if (anyRuns && !state.markers.some((m) => m.type === 'dishwasher')) {
      notes.push({ level: 'info', text: 'No dishwasher marked.', dishwasher: true });
    }
    // Markers that aren't against any run.
    if (anyRuns) {
      for (const m of appliances) {
        if (!placedMarkers.has(m.id)) notes.push({ level: 'info', text: `${APPLIANCE_NAMES[m.type]} marker isn’t on a cabinet run.`, markerId: m.id });
      }
    }
    // Dishwasher within reach of the sink.
    const sink = [...out.markerBoxes.values()].find((b) => b.type === 'sink');
    const dw = [...out.markerBoxes.values()].find((b) => b.type === 'dishwasher');
    if (sink && dw) {
      const cs = { x: (sink.poly[0].x + sink.poly[1].x) / 2, y: (sink.poly[0].y + sink.poly[1].y) / 2 };
      const cd = { x: (dw.poly[0].x + dw.poly[1].x) / 2, y: (dw.poly[0].y + dw.poly[1].y) / 2 };
      const gap = dist(cs, cd) - sink.size / 2 - dw.size / 2;
      if (gap > RULES.dishwasherMaxFromSink + EPS) {
        notes.push({ level: 'warn', text: `Dishwasher is ${fmt(gap)}" from the sink (limit ${RULES.dishwasherMaxFromSink}").`, markerId: dw.id });
      }
    }
    // Keep-clear zones in front of wall runs, and islands that are too close.
    const wallRunsOut = out.runs.filter((r) => r.run.kind === 'wall');
    for (const r of wallRunsOut) {
      const fr = r.frame;
      out.zones.push([at(fr, fr.u0, r.depth), at(fr, fr.u1, r.depth), at(fr, fr.u1, r.depth + RULES.islandClearance), at(fr, fr.u0, r.depth + RULES.islandClearance)]);
    }
    for (const isl of out.runs.filter((r) => r.run.kind === 'free')) {
      const fr = isl.frame;
      const corners = [at(fr, 0), at(fr, fr.L), at(fr, fr.L, isl.depth), at(fr, 0, isl.depth)];
      let min = Infinity;
      for (const w of wallRunsOut) {
        const f2 = w.frame;
        const A = at(f2, f2.u0, w.depth);
        const B = at(f2, f2.u1, w.depth);
        for (let i = 0; i < 4; i++) min = Math.min(min, segDist(corners[i], corners[(i + 1) % 4], A, B));
      }
      if (min < RULES.islandClearance - EPS) {
        notes.push({ level: 'warn', text: `Island ${isl.index} is ${fmt(min)}" from the cabinets across from it (needs ${RULES.islandClearance}").`, runId: isl.run.id });
        isl.tooClose = true;
      }
    }
  }

  // De-duplicate notes by text+marker.
  const seen = new Set();
  out.notes = notes.filter((n) => {
    const k = n.key || `${n.text}|${n.markerId || ''}|${n.runId || ''}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  return out;
}

// Where cabinets must stop on one wall, for snapping a freshly drawn run to the doors and windows.
export function wallBlockers(layer, state, derived, wall) {
  const molding = layer === 'upper' ? Math.max((state.upper && state.upper.crown) || 0, (state.upper && state.upper.rail) || 0) : 0;
  return blockersFor(layer, state, derived, wall, molding, []);
}

let cache = { sig: null, value: null };
export function computeLayouts(state, derived) {
  const sig = JSON.stringify([
    state.runs,
    state.cornerPicks,
    state.upper,
    state.kitchen,
    state.markers,
    state.room && [state.room.start, state.room.dirs, state.room.base, state.room.known, state.room.construction, state.room.openings],
  ]);
  if (cache.sig === sig) return cache.value;
  const lower = computeLayout('lower', state, derived, null);
  const upper = computeLayout('upper', state, derived, lower);
  cache = { sig, value: { lower, upper } };
  return cache.value;
}

// What would go on an order: cabinets, corner cabinets, sink/cooktop bases, tall cabinets (not the
// fridge itself), fillers and panels. Appliance openings, hood places and gaps are left out.
export function orderSummary(layout) {
  const counts = new Map();
  const add = (label) => counts.set(label, (counts.get(label) || 0) + 1);
  for (const rl of layout.runs) {
    for (const b of rl.boxes) {
      const orderable = ['base', 'corner', 'diag', 'flex', 'filler'].includes(b.kind) || (b.kind === 'tall' && b.type !== 'fridge');
      if (orderable) add(b.label);
    }
    for (const e of rl.extras || []) add(e);
  }
  return [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
}
