// The kitchen rules checklist. Each rule is checked where the sketch has the information; the
// rest come back as reminders so nothing gets forgotten. Pure functions: no DOM.
//   status: 'warn'   the sketch breaks the rule
//           'remind' can't be checked from a sketch, or needs a decision from the designer
//           'ok'     checked and fine
//           'na'     doesn't apply to this sketch yet
import { RULES, APPLIANCE_NAMES } from './rules.js';
import { wallFrames } from './recognize.js';
import { segIntersect, closestOnSegment, signedArea } from './geometry.js';
import { formatInches } from './format.js';

const C = RULES.checks;
const fmt = (v) => formatInches(v);
const feet = (v) => `${Math.round((v / 12) * 10) / 10} ft`;
const EPS = 0.01;

const mid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const d2 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const add = (p, v, k) => ({ x: p.x + v.x * k, y: p.y + v.y * k });

function inPoly(p, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

function polysOverlap(A, B) {
  for (let i = 0; i < A.length; i++) {
    for (let j = 0; j < B.length; j++) {
      if (segIntersect(A[i], A[(i + 1) % A.length], B[j], B[(j + 1) % B.length])) return true;
    }
  }
  return inPoly(A[0], B) || inPoly(B[0], A);
}

// Outward normal of edge i of a polygon (any winding).
function edgeNormal(poly, i, sign) {
  const a = poly[i];
  const b = poly[(i + 1) % poly.length];
  const l = d2(a, b) || 1;
  return { x: ((b.y - a.y) / l) * sign, y: (-(b.x - a.x) / l) * sign };
}

// Distance along a ray to the first face that faces back at it, or Infinity.
// `faces`: [{poly, sign}], `walls`: [[a, b]] (room walls count whichever way they face).
function cast(p, dir, max, faces, walls, minFacing = 0.7) {
  const q = add(p, dir, max);
  let best = Infinity;
  for (const f of faces) {
    for (let i = 0; i < f.poly.length; i++) {
      const n = edgeNormal(f.poly, i, f.sign);
      if (n.x * dir.x + n.y * dir.y > -minFacing) continue;
      const hit = segIntersect(p, q, f.poly[i], f.poly[(i + 1) % f.poly.length]);
      if (hit && hit.t * max < best) best = hit.t * max;
    }
  }
  for (const w of walls) {
    const hit = segIntersect(p, q, w[0], w[1]);
    if (hit && hit.t * max < best) best = hit.t * max;
  }
  return best;
}

const COUNTER = new Set(['base', 'corner', 'diag', 'filler', 'flex']);
const isCounter = (b) => COUNTER.has(b.kind) || (b.kind === 'void' && b.type === 'dishwasher');

export function runChecks(state, derived, layouts) {
  const items = [];
  const out = { items, summary: { warn: 0, remind: 0, ok: 0 }, triangle: null };
  const add_ = (id, title, status, detail) => items.push({ id, title, status, detail });
  if (!state.room || !derived || !derived.closed) {
    out.empty = true;
    return out;
  }
  const lower = layouts.lower;
  const upper = layouts.upper;
  const n = derived.n;
  const verts = derived.verts;
  const frames = wallFrames(verts, state.room.construction);
  const area = Math.abs(signedArea(verts.slice(0, n))) / 144;
  const big = area >= C.areaSplit;
  const tier = big ? 'large' : 'small';
  const cooks = (state.kitchen && state.kitchen.cooks) || 1;
  const hasRuns = lower.runs.length > 0;

  // ---- geometry shared by the checks ----
  const rlOf = new Map();
  const sign = signedArea(verts.slice(0, n)) >= 0 ? 1 : -1;
  const faces = [];
  for (const rl of lower.runs) {
    for (const b of rl.boxes) {
      rlOf.set(b, rl);
      if (b.kind !== 'gap') faces.push({ poly: b.poly, sign: signedArea(b.poly) >= 0 ? 1 : -1, rl, box: b });
    }
  }
  const walls = frames.filter((f) => !f.construction).map((f) => [f.a, f.b]);
  void sign;

  const find = (type) =>
    state.markers
      .filter((m) => m.type === type && lower.markerBoxes.has(m.id))
      .map((m) => ({ m, box: lower.markerBoxes.get(m.id), rl: rlOf.get(lower.markerBoxes.get(m.id)) }))
      .filter((x) => x.rl);
  const sinks = find('sink');
  const ranges = find('range');
  const cooktops = find('cooktop');
  const ovens = find('oven');
  const fridges = find('fridge');
  const dws = find('dishwasher');
  const cookers = ranges.length ? ranges : cooktops;
  const front = (it) => mid(it.box.poly[3], it.box.poly[2]);
  const widthOf = (it) => (it.m.w != null ? it.m.w : RULES.defaultWidths[it.m.type] || it.box.size);
  const sorted = (rl) => rl.boxes.slice().sort((a, b) => a.u0 - b.u0);

  // Continuous counter next to an appliance box, going one way along its run.
  const counterBeside = (it, dir) => {
    const list = sorted(it.rl);
    let k = list.indexOf(it.box);
    let total = 0;
    if (it.box.kind === 'flex') total += Math.max(0, (it.box.size - widthOf(it)) / 2);
    for (k += dir; k >= 0 && k < list.length; k += dir) {
      if (!isCounter(list[k])) break;
      total += list[k].size;
    }
    return total;
  };
  const sides = (it) => [counterBeside(it, -1), counterBeside(it, 1)];

  // ---- 1a doorways ----
  const doors = state.room.openings.filter((o) => o.kind === 'door');
  if (!doors.length) add_('1a', 'Doorway at least 32" wide', 'na', 'No door drawn yet.');
  else {
    const narrow = doors.filter((o) => o.ro != null && o.ro - C.doorClearDeduct < C.doorMinClear);
    const missing = doors.filter((o) => o.ro == null);
    if (narrow.length) add_('1a', 'Doorway at least 32" wide', 'warn', `${narrow.length === 1 ? 'A door opens' : `${narrow.length} doors open`} less than ${C.doorMinClear}" clear (rough opening minus about ${C.doorClearDeduct}").`);
    else if (missing.length) add_('1a', 'Doorway at least 32" wide', 'remind', 'Enter every door’s rough opening so the width can be checked.');
    else add_('1a', 'Doorway at least 32" wide', 'ok', `Doorway depth should also stay under ${C.doorMaxDepth}" in the direction of travel.`);
  }

  // ---- 1b / 1c aisles ----
  const workRuns = new Set([...sinks, ...cookers, ...fridges].map((x) => x.rl));
  let walkMin = Infinity;
  let workMin = Infinity;
  let walkWhere = '';
  let workWhere = '';
  for (const rl of lower.runs) {
    const fr = rl.frame;
    for (let u = fr.u0 + 3; u <= fr.u1 - 3 + EPS; u += 6) {
      const p = add(add(fr.a, fr.d, u), fr.n, rl.depth + 0.5);
      const other = faces.filter((f) => f.rl !== rl);
      const t = cast(p, fr.n, 120, other, []);
      if (t === Infinity) continue;
      const aisle = t - 0.5;
      if (aisle < walkMin) {
        walkMin = aisle;
        walkWhere = `Run ${rl.index}`;
      }
      if (workRuns.has(rl) && aisle < workMin) {
        workMin = aisle;
        workWhere = `Run ${rl.index}`;
      }
    }
  }
  const needWork = C.workAisle[cooks];
  if (walkMin === Infinity) add_('1b', 'Walkways at least 36" wide', hasRuns ? 'remind' : 'na', hasRuns ? 'No cabinets face each other here. Check any walkway is at least 36" wide.' : 'No cabinets yet.');
  else if (walkMin < C.walkway - EPS) add_('1b', 'Walkways at least 36" wide', 'warn', `${walkWhere} has only ${fmt(walkMin)} across to the next cabinets.`);
  else add_('1b', 'Walkways at least 36" wide', 'ok', `Narrowest aisle between cabinets is ${fmt(walkMin)}.`);
  if (workMin === Infinity) add_('1c', `Work aisle at least ${needWork}"`, hasRuns ? 'remind' : 'na', hasRuns ? `One cook needs ${C.workAisle[1]}", more than one cook ${C.workAisle[2]}`+'". Nothing faces the work area, check the clear floor by hand.' : 'No cabinets yet.');
  else if (workMin < needWork - EPS) add_('1c', `Work aisle at least ${needWork}"`, 'warn', `${workWhere} work aisle is ${fmt(workMin)}; ${cooks === 2 ? 'more than one cook needs' : 'one cook needs'} ${needWork}". (Cooks is set at the bottom left of Lowers.)`);
  else add_('1c', `Work aisle at least ${needWork}"`, 'ok', `Work aisle is ${fmt(workMin)} (${cooks === 2 ? 'more than one cook' : 'one cook'}).`);

  // ---- 2 work triangle ----
  const S = sinks[0];
  const K = cookers[0];
  const F = fridges[0];
  if (S && K && F) {
    const pts = [front(S), front(K), front(F)];
    const legs = [d2(pts[0], pts[1]), d2(pts[1], pts[2]), d2(pts[2], pts[0])];
    const total = legs[0] + legs[1] + legs[2];
    out.triangle = { pts, legs, total };
    const bad = legs.findIndex((l) => l < C.triangleLeg[0] - EPS || l > C.triangleLeg[1] + EPS);
    const names = ['sink to range', 'range to fridge', 'fridge to sink'];
    const kName = K.m.type === 'range' ? 'range' : 'cooktop';
    const label = (i) => ['sink to ' + kName, kName + ' to fridge', 'fridge to sink'][i] || names[i];
    if (total > C.triangleMax + EPS) add_('2', 'Work triangle 26 ft or less', 'warn', `Total is ${feet(total)} (${legs.map((l) => feet(l)).join(' + ')}). Limit ${feet(C.triangleMax)}.`);
    else if (bad >= 0) add_('2', 'Work triangle legs 4–9 ft', 'warn', `${label(bad)} is ${feet(legs[bad])}; each leg should be 4 to 9 ft.`);
    else add_('2', 'Work triangle', 'ok', `Total ${feet(total)}; legs ${legs.map((l) => feet(l)).join(', ')}. Measured front to front.`);
  } else {
    const miss = [!S && 'sink', !K && 'range or cooktop', !F && 'fridge'].filter(Boolean).join(', ');
    add_('2', 'Work triangle', hasRuns ? 'remind' : 'na', hasRuns ? `Mark the ${miss} on the lowers to check the work triangle (26 ft total, each leg 4–9 ft).` : 'No cabinets yet.');
  }

  // ---- 3 traffic through the triangle ----
  const entries = [];
  state.room.openings.forEach((op) => {
    if (op.kind !== 'door') return;
    const f = frames[op.wall];
    const span = derived.spans.get(op.id);
    if (f && span) entries.push({ name: 'a door', p: add(f.a, f.d, (span[0] + span[1]) / 2) });
  });
  frames.forEach((f) => {
    if (f.construction) entries.push({ name: 'an open wall', p: mid(f.a, f.b) });
  });
  if (out.triangle && entries.length >= 2) {
    const t = out.triangle.pts;
    let crossing = false;
    for (let i = 0; i < entries.length && !crossing; i++) {
      for (let j = i + 1; j < entries.length && !crossing; j++) {
        for (let k = 0; k < 3; k++) {
          if (segIntersect(entries[i].p, entries[j].p, t[k], t[(k + 1) % 3])) crossing = true;
        }
      }
    }
    if (crossing) add_('3', 'No main traffic through the triangle', 'warn', 'A straight path between two entries crosses the work triangle. Confirm it isn’t a main route.');
    else add_('3', 'No main traffic through the triangle', 'ok', 'No door-to-door path crosses the triangle.');
  } else add_('3', 'No main traffic through the triangle', out.triangle ? 'remind' : 'na', out.triangle ? 'Only one way in is drawn. Check the main route through the room stays out of the triangle.' : 'Needs the work triangle.');

  // ---- 4 seating ----
  const islands = lower.runs.filter((r) => r.run.kind === 'free');
  add_('4', 'Seating space', islands.length ? 'remind' : 'na', islands.length ? `If an island or peninsula has seating, leave ${C.seatClear}" behind the stools (${C.seatClearTraffic}" if people walk behind).` : 'No island drawn.');

  // ---- 5 doors that interfere ----
  const swings = [];
  state.room.openings.forEach((op) => {
    if (op.kind !== 'door' || !op.swing) return;
    const f = frames[op.wall];
    const span = derived.spans.get(op.id);
    if (!f || !span) return;
    const w = span[1] - span[0];
    const H = add(f.a, f.d, op.swing.hinge === 0 ? span[0] : span[1]);
    const latch = { x: f.d.x * (op.swing.hinge === 0 ? 1 : -1), y: f.d.y * (op.swing.hinge === 0 ? 1 : -1) };
    const tip = { x: f.n.x * op.swing.side, y: f.n.y * op.swing.side };
    const poly = [H];
    for (let k = 0; k <= 8; k++) {
      const a = (k / 8) * (Math.PI / 2);
      poly.push({ x: H.x + (latch.x * Math.cos(a) + tip.x * Math.sin(a)) * w, y: H.y + (latch.y * Math.cos(a) + tip.y * Math.sin(a)) * w });
    }
    swings.push({ op, poly });
  });
  const hits = [];
  for (const sw of swings) {
    for (const f of faces) {
      if (f.box.kind === 'void' && f.box.type !== 'range' && f.box.type !== 'dishwasher' && f.box.type !== 'fridge') continue;
      if (polysOverlap(sw.poly, f.poly)) {
        hits.push('A door swings into a cabinet or appliance.');
        break;
      }
    }
  }
  for (let i = 0; i < swings.length; i++) {
    for (let j = i + 1; j < swings.length; j++) {
      if (polysOverlap(swings[i].poly, swings[j].poly)) hits.push('Two door swings overlap.');
    }
  }
  if (hits.length) add_('5', 'No door interferes with another', 'warn', [...new Set(hits)].join(' ') + ' Appliance doors (fridge, oven, dishwasher) still need a look by hand.');
  else add_('5', 'No door interferes with another', 'remind', swings.length ? 'No entry door swing hits a cabinet. Check fridge, oven and dishwasher doors can open fully.' : 'Check entry, cabinet and appliance doors all open without hitting each other. Mark each door’s swing to check the entries.');

  // ---- 6, 7, 8 frontage ----
  const wallKinds = new Set(['base', 'corner', 'diag', 'flex']);
  const upperFront = upper.runs.reduce((t, rl) => t + rl.boxes.filter((b) => wallKinds.has(b.kind)).reduce((s, b) => s + b.size, 0), 0);
  const needWall = C.wallFrontage[tier];
  if (!upper.runs.length) add_('6', `Wall cabinets, ${needWall}" of frontage`, 'remind', `Needs ${needWall}" of wall cabinet frontage (${big ? '150 sq ft or more' : 'under 150 sq ft'}; this room is ${Math.round(area)} sq ft). Draw the uppers. Each must be at least 12" deep and ${C.wallMinHeight}" high.`);
  else if (upperFront < needWall - EPS) add_('6', `Wall cabinets, ${needWall}" of frontage`, 'warn', `${fmt(upperFront)} drawn; needs ${needWall}" (room is ${Math.round(area)} sq ft). Counts only cabinets at least ${C.wallMinHeight}" high.`);
  else add_('6', `Wall cabinets, ${needWall}" of frontage`, 'ok', `${fmt(upperFront)} drawn; needs ${needWall}". Keep each at least ${C.wallMinHeight}" high.`);

  if (!S) add_('7', '60" of wall cabinets within 72" of the sink', upper.runs.length ? 'remind' : 'na', 'Mark the sink to check this.');
  else if (!upper.runs.length) add_('7', '60" of wall cabinets within 72" of the sink', 'remind', 'Draw the uppers near the sink to check this.');
  else {
    const sc = front(S);
    let near = 0;
    for (const rl of upper.runs) {
      for (const b of rl.boxes) {
        if (!wallKinds.has(b.kind)) continue;
        const c = mid(mid(b.poly[0], b.poly[1]), mid(b.poly[2], b.poly[3]));
        if (d2(c, sc) <= C.sinkWallReach) near += b.size;
      }
    }
    if (near < C.sinkWallFrontage - EPS) add_('7', '60" of wall cabinets within 72" of the sink', 'warn', `Only ${fmt(near)} of wall cabinets are within ${C.sinkWallReach}" of the sink.`);
    else add_('7', '60" of wall cabinets within 72" of the sink', 'ok', `${fmt(near)} within ${C.sinkWallReach}" of the sink.`);
  }

  const baseKinds = new Set(['base', 'corner', 'diag', 'flex']);
  const baseFront = lower.runs.reduce((t, rl) => t + rl.boxes.filter((b) => baseKinds.has(b.kind)).reduce((s, b) => s + b.size, 0), 0);
  const needBase = C.baseFrontage[tier];
  if (!hasRuns) add_('8', `Base cabinets, ${needBase}" of frontage`, 'remind', `Needs ${needBase}" of base cabinet frontage.`);
  else if (baseFront < needBase - EPS) add_('8', `Base cabinets, ${needBase}" of frontage`, 'warn', `${fmt(baseFront)} drawn; needs ${needBase}" (room is ${Math.round(area)} sq ft).`);
  else add_('8', `Base cabinets, ${needBase}" of frontage`, 'ok', `${fmt(baseFront)} drawn; needs ${needBase}".`);

  // ---- 9, 10, 11 storage ----
  const needDrawer = C.drawerFrontage[tier];
  add_('9', `Drawer or roll-out frontage, ${needDrawer}"`, hasRuns ? (baseFront < needDrawer - EPS ? 'warn' : 'remind') : 'remind',
    baseFront < needDrawer - EPS && hasRuns
      ? `Only ${fmt(baseFront)} of base cabinets drawn, so ${needDrawer}" of drawers or roll-outs can’t be reached.`
      : `Make ${needDrawer}" of the base frontage drawers or roll-out shelves (this room is ${Math.round(area)} sq ft).`);
  add_('10', `At least ${C.storageItems} storage or organizing items at standing height`, 'remind', 'Pick five (pull-outs, tray dividers, spice racks, roll-outs, lazy susan and so on) in the cabinets between about 15" and 48" high.');
  const corner = lower.runs.some((rl) => rl.boxes.some((b) => b.kind === 'corner' || b.kind === 'diag'));
  if (corner) add_('11', 'One functional corner storage unit', 'remind', 'There is a corner cabinet. Specify the inside (lazy susan, blind-corner pull-out, or diagonal door and shelves) so it’s usable.');
  else add_('11', 'One functional corner storage unit', hasRuns ? 'remind' : 'na', hasRuns ? 'No corner cabinet in the plan. Add a lazy susan, blind-corner pull-out or similar.' : 'No cabinets yet.');

  // ---- 12 waste ----
  const wastes = state.markers.filter((m) => m.type === 'waste');
  if (!hasRuns) add_('12', 'Waste receptacle in the plan', 'na', 'No cabinets yet.');
  else if (!wastes.length) add_('12', 'Waste receptacle in the plan', 'warn', 'No waste receptacle marked. Place the Waste marker on a base cabinet (or add a pull-out).');
  else add_('12', 'Waste receptacle in the plan', 'ok', 'Waste receptacle marked.');

  // ---- 13 knee space ----
  const kneeFor = [S && 'sink', cookers.length && (ranges.length ? 'range' : 'cooktop'), ovens.length && 'oven'].filter(Boolean);
  add_('13', 'Knee space at sink, cooking and oven', kneeFor.length ? 'remind' : 'na', kneeFor.length ? `At least one ${C.knee.wide}" wide, ${C.knee.high}" high, ${C.knee.deep}" deep knee space at the ${kneeFor.join(', ')}. This can be a tall-cabinet-free section, a removable base, or a seating end.` : 'Needs a sink, cooktop, range or oven marked.');

  // ---- 14 clear floor space ----
  const floorFor = [...sinks.map((x) => ['sink', x]), ...dws.map((x) => ['dishwasher', x]), ...cookers.map((x) => [x.m.type, x]), ...ovens.map((x) => ['oven', x]), ...fridges.map((x) => ['fridge', x])];
  if (!floorFor.length) add_('14', 'Clear floor 30" × 48" at sink, dishwasher, cooking, oven and fridge', hasRuns ? 'remind' : 'na', hasRuns ? 'Mark the appliances to check clear floor space (30" wide by 48" deep in front of each).' : 'No cabinets yet.');
  else {
    const tight = [];
    for (const [name, it] of floorFor) {
      const fr = it.rl.frame;
      const fc = front(it);
      let min = Infinity;
      for (let off = -C.floorSpace.wide / 2; off <= C.floorSpace.wide / 2 + EPS; off += C.floorSpace.wide / 4) {
        const p = add(add(fc, fr.d, off), fr.n, 0.3);
        const others = faces.filter((f) => f.box !== it.box);
        min = Math.min(min, cast(p, fr.n, C.floorSpace.deep, others, walls, 0.5));
      }
      if (min < C.floorSpace.deep - EPS) tight.push(`${APPLIANCE_NAMES[name]} (${fmt(min + 0.3)})`);
    }
    if (tight.length) add_('14', 'Clear floor 30" × 48" at sink, dishwasher, cooking, oven and fridge', 'warn', `Less than 48" clear in front of: ${tight.join(', ')}.`);
    else add_('14', 'Clear floor 30" × 48" at sink, dishwasher, cooking, oven and fridge', 'ok', 'At least 48" clear in front of each appliance marked.');
  }

  // ---- 15 dishwasher side clearance ----
  if (!dws.length) add_('15', '21" beside the dishwasher at right angles', 'na', 'No dishwasher marked.');
  else {
    const bad = [];
    for (const dw of dws) {
      const fr = dw.rl.frame;
      for (const s of [-1, 1]) {
        const edge = s < 0 ? dw.box.u0 : dw.box.u1;
        const p = add(add(fr.a, fr.d, edge), fr.n, dw.rl.depth + 6);
        const t = cast(p, { x: fr.d.x * s, y: fr.d.y * s }, C.dishwasherSide, faces.filter((f) => f.box !== dw.box), walls, 0.7);
        if (t < C.dishwasherSide - EPS) bad.push(fmt(t));
      }
    }
    if (bad.length) add_('15', '21" beside the dishwasher at right angles', 'warn', `Only ${bad[0]} from the dishwasher edge to a cabinet or wall at a right angle. Needs ${C.dishwasherSide}".`);
    else add_('15', '21" beside the dishwasher at right angles', 'ok', `Nothing within ${C.dishwasherSide}" at a right angle to the dishwasher.`);
  }

  // ---- 16 dishwasher near sink ----
  if (S && dws.length) {
    const gap = d2(front(S), front(dws[0])) - S.box.size / 2 - dws[0].box.size / 2;
    if (gap > C.dishwasherFromSink + EPS) add_('16', 'Dishwasher within 36" of the sink', 'warn', `${fmt(gap)} between them.`);
    else add_('16', 'Dishwasher within 36" of the sink', 'ok', `${fmt(Math.max(0, gap))} between them.`);
  } else add_('16', 'Dishwasher within 36" of the sink', hasRuns ? 'remind' : 'na', !dws.length ? 'No dishwasher marked. Add one if the kitchen has one, within 36" of the sink.' : 'Mark the sink to check this.');

  // ---- 17 sink between or across ----
  if (S && K && F) {
    const sc = front(S);
    const kc = front(K);
    const fc = front(F);
    const between = d2(sc, kc) + d2(sc, fc) <= 1.25 * d2(kc, fc);
    const across = [K, F].some((x) => x.rl !== S.rl && x.rl.frame.n.x * S.rl.frame.n.x + x.rl.frame.n.y * S.rl.frame.n.y < -0.5);
    if (between || across) add_('17', 'Sink between or across from cooking and fridge', 'ok', between ? 'The sink sits between the cooking surface and fridge.' : 'The sink is across from the cooking surface or fridge.');
    else add_('17', 'Sink between or across from cooking and fridge', 'warn', 'The sink is at one end, not between or across from the cooking surface and fridge.');
  } else add_('17', 'Sink between or across from cooking and fridge', hasRuns ? 'remind' : 'na', hasRuns ? 'Needs sink, range or cooktop, and fridge marked.' : 'No cabinets yet.');

  // ---- 18, 19 ----
  add_('18', 'Clear space above the cooking surface', cookers.length ? 'remind' : 'na', cookers.length ? `${C.cookClearProtected}" to a protected surface, ${C.cookClearUnprotected}" to an unprotected one (hood or microwave bottom).` : 'No cooking surface marked.');
  add_('19', 'Cooking ventilation at least 150 CFM', cookers.length ? 'remind' : 'na', cookers.length ? `Specify a hood or downdraft of at least ${C.ventCfm} CFM, vented outside.` : 'No cooking surface marked.');

  // ---- 20 window over cooking ----
  if (!cookers.length) add_('20', 'No cooking surface under an operable window', 'na', 'No cooking surface marked.');
  else {
    const probs = [];
    let unknown = false;
    for (const k of cookers) {
      if (k.box.wall == null) continue;
      for (const op of state.room.openings) {
        if (op.kind !== 'window' || op.wall !== k.box.wall) continue;
        const span = derived.spans.get(op.id);
        if (!span || span[1] <= k.box.u0 + EPS || span[0] >= k.box.u1 - EPS) continue;
        if (op.sill == null) unknown = true;
        else if (op.sill < C.cookSurface + C.windowAboveCook) probs.push(`${APPLIANCE_NAMES[k.m.type]} has a window over it, sill ${fmt(op.sill)}`);
      }
    }
    if (probs.length) add_('20', 'No cooking surface under an operable window', 'warn', `${probs[0]}. The window must be at least ${C.windowAboveCook}" above the cooking surface and set back ${C.windowBehindCook}" or more.`);
    else if (unknown) add_('20', 'No cooking surface under an operable window', 'remind', 'A window is over the cooking surface. Enter its sill height; it needs to be over 24" above the cooktop and 3" behind it.');
    else add_('20', 'No cooking surface under an operable window', 'ok', 'No window over the cooking surface.');
  }

  // ---- 21 microwave ----
  const mws = state.markers.filter((m) => m.type === 'microwave');
  if (!mws.length) add_('21', 'Microwave 24–48" off the floor', 'na', 'No microwave marked.');
  else {
    const issues = [];
    for (const m of mws) {
      let found = null;
      for (const lay of [upper, lower]) {
        for (const rl of lay.runs) {
          for (const b of rl.boxes) {
            if (b.kind === 'gap') continue;
            if (!found && inPoly(m, b.poly)) found = b;
          }
        }
      }
      if (!found) {
        let best = null;
        for (const lay of [upper, lower]) {
          for (const rl of lay.runs) {
            for (const b of rl.boxes) {
              if (b.kind === 'gap') continue;
              for (let i = 0; i < b.poly.length; i++) {
                const c = closestOnSegment(m, b.poly[i], b.poly[(i + 1) % b.poly.length]);
                if (c.d < 18 && (!best || c.d < best.d)) best = { d: c.d, b };
              }
            }
          }
        }
        found = best && best.b;
      }
      if (!found) issues.push('The microwave isn’t on or over a cabinet.');
      else if (found.size < C.microwaveCabinetMin - EPS) issues.push(`The cabinet for the microwave is ${fmt(found.size)}; it needs ${C.microwaveCabinetMin}" or more.`);
    }
    if (issues.length) add_('21', 'Microwave 24–48" off the floor', 'warn', issues[0]);
    else add_('21', 'Microwave 24–48" off the floor', 'remind', `Set the microwave’s bottom between ${C.microwaveHeight[0]}" and ${C.microwaveHeight[1]}" above the floor.`);
  }

  // ---- 22 counter at the sink ----
  if (!S) add_('22', 'Counter beside the sink, 24" and 18"', hasRuns ? 'remind' : 'na', hasRuns ? 'Mark the sink to check counter on both sides (24" one side, 18" the other).' : 'No cabinets yet.');
  else {
    const [a, b] = sides(S);
    const hi = Math.max(a, b);
    const lo = Math.min(a, b);
    if (hi < C.sinkCounter[0] - EPS || lo < C.sinkCounter[1] - EPS) add_('22', 'Counter beside the sink, 24" and 18"', 'warn', `Counter beside the sink is ${fmt(a)} on one side and ${fmt(b)} on the other. Needs ${C.sinkCounter[0]}" on one side and ${C.sinkCounter[1]}" on the other.`);
    else add_('22', 'Counter beside the sink, 24" and 18"', 'ok', `${fmt(hi)} on one side, ${fmt(lo)} on the other.`);
  }

  // ---- 23 microwave landing ----
  add_('23', 'Landing space at the microwave', mws.length ? 'remind' : 'na', mws.length ? `Leave at least ${C.microwaveLanding[0]}" × ${C.microwaveLanding[1]}" of counter or surface beside or just below the microwave.` : 'No microwave marked.');

  // ---- 24 fridge counter ----
  if (!F) add_('24', 'Counter by the fridge, 15" on the latch side', hasRuns ? 'remind' : 'na', hasRuns ? 'Mark the fridge to check counter beside it.' : 'No cabinets yet.');
  else {
    const [a, b] = sides(F);
    const ok = [a, b].filter((v) => v >= C.fridgeCounter - EPS).length;
    if (ok === 0) add_('24', 'Counter by the fridge, 15" on the latch side', 'warn', `Only ${fmt(a)} and ${fmt(b)} of counter beside the fridge. Needs ${C.fridgeCounter}" on the side the door opens toward (both sides for side-by-side).`);
    else if (ok === 1) add_('24', 'Counter by the fridge, 15" on the latch side', 'remind', `One side has ${fmt(Math.max(a, b))} of counter. Make sure it’s the latch side (both sides for a side-by-side).`);
    else add_('24', 'Counter by the fridge, 15" on the latch side', 'ok', `${fmt(a)} on one side and ${fmt(b)} on the other.`);
  }

  // ---- 25 counter beside cooking ----
  const cookish = [...ranges, ...cooktops, ...ovens];
  if (!cookish.length) add_('25', 'Counter beside the range, cooktop or oven', 'na', 'No range, cooktop or oven marked.');
  else {
    const bad = cookish.filter((x) => Math.max(...sides(x)) < C.cookCounter - EPS);
    if (bad.length) add_('25', 'Counter beside the range, cooktop or oven', 'warn', `${APPLIANCE_NAMES[bad[0].m.type]} has no ${C.cookCounter}" of counter next to it.`);
    else add_('25', 'Counter beside the range, cooktop or oven', 'ok', 'At least 15" of counter beside each (and 16" deep).');
  }

  // ---- 26 prep center ----
  if (!S) add_('26', '36" of counter next to the sink for prep', hasRuns ? 'remind' : 'na', hasRuns ? 'Mark the sink to check the prep counter.' : 'No cabinets yet.');
  else {
    const [a, b] = sides(S);
    if (Math.max(a, b) < C.prepCounter - EPS) add_('26', '36" of counter next to the sink for prep', 'warn', `Longest continuous counter next to the sink is ${fmt(Math.max(a, b))}. Needs ${C.prepCounter}" as the main prep center.`);
    else add_('26', '36" of counter next to the sink for prep', 'ok', `${fmt(Math.max(a, b))} of continuous counter beside the sink.`);
  }

  for (const it of items) if (it.status !== 'na') out.summary[it.status]++;
  return out;
}
