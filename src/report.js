// The facts that go on a printed sketch: every wall, every door and window with its sizes and where
// it sits, the utilities, and the cabinet lists. Pure data, no drawing; the PDF is laid out from it.
import { formatInches } from './format.js';
import { openingTitle, refLabel, positionInfo, MARKER_NAMES } from './render.js';
import { wallFrames } from './recognize.js';
import { closestOnSegment } from './geometry.js';
import { APPLIANCE_TYPES, APPLIANCE_NAMES } from './rules.js';
import { orderSummary } from './layout.js';

const fmt = (v) => formatInches(v);
const val = (v) => (v == null ? '?' : fmt(v));

const startCorner = (i, n) => `corner W${((i - 1 + n) % n) + 1}/W${i + 1}`;

// Where a point sits: nearest wall, how far along from that wall's start corner, how far off it.
function whereIs(p, frames) {
  let best = null;
  for (const f of frames) {
    const c = closestOnSegment(p, f.a, f.b);
    if (!best || c.d < best.d) best = { f, u: c.t * f.L, d: c.d };
  }
  if (!best) return '';
  const n = frames.length;
  return `W${best.f.i + 1}, ${fmt(best.u)} from ${startCorner(best.f.i, n)}, ${fmt(best.d)} off the wall`;
}

function openingEntry(state, derived, op) {
  const room = state.room;
  const n = room.dirs.length;
  const pi = positionInfo(room, derived, op);
  const lines = [
    { k: 'Rough opening', v: val(op.ro) },
    { k: 'Casing to casing', v: val(op.cc) },
    {
      k: 'Position',
      v: op.pos != null ? `${fmt(op.pos)} from ${pi.label}` : `? (about ${fmt(pi.gap)} from ${pi.label})`,
    },
  ];
  if (op.kind === 'window') {
    lines.push({ k: 'Sill height', v: val(op.sill) });
    lines.push({ k: 'Window height', v: val(op.h) });
  } else {
    let swing = 'no swing marked';
    if (op.swing) {
      const into = op.swing.side === derived.orient;
      const hinge = op.swing.hinge === 0 ? startCorner(op.wall, n) : `corner W${op.wall + 1}/W${((op.wall + 1) % n) + 1}`;
      swing = `${into ? 'swings into the room' : 'swings out'}, hinge toward ${hinge}`;
    }
    lines.push({ k: 'Swing', v: swing });
  }
  const missing = op.ro == null || op.cc == null || op.pos == null || (op.kind === 'window' && (op.sill == null || op.h == null));
  return { name: openingTitle(room, op), wall: `W${op.wall + 1}`, lines, missing };
}

function layerEntry(layout) {
  return {
    runs: layout.runs.map((rl) => ({
      title: `${rl.run.kind === 'wall' ? 'Run' : 'Island'} ${rl.index}`,
      where: rl.run.kind === 'wall' ? `W${rl.run.wall + 1}` : 'free-standing',
      length: fmt(rl.run.kind === 'wall' ? rl.run.u1 - rl.run.u0 : rl.frame.L),
      cut: rl.boxes.map((b) => b.label).concat((rl.extras || []).map((e) => `+ ${e}`)),
    })),
    summary: orderSummary(layout),
    notes: layout.notes.map((n) => n.text),
  };
}

export function buildReport(state, derived, layouts, now = new Date()) {
  const frames = wallFrames(derived.verts, state.room.construction);
  const n = state.room.dirs.length;
  const walls = state.room.known.map((k, i) => ({
    label: `W${i + 1}`,
    value: k != null ? fmt(k) : `~${fmt(derived.lens[i])}`,
    measured: k != null,
    open: !!state.room.construction[i],
  }));
  const utilities = state.markers
    .filter((m) => !APPLIANCE_TYPES.includes(m.type))
    .map((m) => ({
      name: m.type === 'column' ? `Column ${val(m.w)} x ${val(m.d || m.w)}` : MARKER_NAMES[m.type],
      where: whereIs(m, frames),
    }));
  const appliances = state.markers
    .filter((m) => APPLIANCE_TYPES.includes(m.type))
    .map((m) => ({ name: `${APPLIANCE_NAMES[m.type]}${m.w ? ` ${fmt(m.w)}` : ''}`, where: whereIs(m, frames) }));
  const up = state.upper || {};
  return {
    title: state.name || 'Kitchen sketch',
    date: now.toISOString().slice(0, 10),
    ceiling: state.ceiling != null ? fmt(state.ceiling) : null,
    closure: derived.closed ? null : `The measured walls don't close: off ${fmt(derived.gapLen)}.`,
    walls,
    openings: state.room.openings.map((op) => openingEntry(state, derived, op)),
    utilities,
    appliances,
    upperSettings: { height: up.height != null ? fmt(up.height) : null, crown: fmt(up.crown || 0), rail: fmt(up.rail || 0) },
    lower: layerEntry(layouts.lower),
    upper: layerEntry(layouts.upper),
    wallCount: n,
  };
}
