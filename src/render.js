// Builds the SVG for the sketch. Everything is placed in screen px so line widths and text stay
// the same size at any zoom.
import { wallFrames } from './recognize.js';
import { formatInches } from './format.js';
import { APPLIANCE_TYPES, RULES } from './rules.js';

const r1 = (n) => Math.round(n * 10) / 10;
const fmt = (v) => formatInches(v, { quote: false });
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

export const MARKER_NAMES = {
  sink: 'Sink',
  cooktop: 'Cooktop',
  range: 'Range',
  fridge: 'Fridge',
  oven: 'Oven',
  dishwasher: 'Dishwasher',
  pantry: 'Pantry',
  plumbing: 'Plumbing',
  outlet: 'Outlet 120V',
  outlet220: 'Outlet 220V',
  gas: 'Gas',
  vent: 'HVAC vent',
  column: 'Column',
};

// Marker symbols are drawn around (0,0), about 24px across.
export function markerSymbol(type) {
  switch (type) {
    case 'outlet':
      return (
        '<circle r="11" class="mk-body mk-outlet"/>' +
        '<path class="mk-line mk-outlet-line" d="M-3.5 -5V1M3.5 -5V1M-3 6h6"/>'
      );
    case 'outlet220':
      return '<circle r="12" class="mk-body mk-outlet220"/><text class="mk-text220" y="1" text-anchor="middle" dominant-baseline="middle">220</text>';
    case 'plumbing':
      return '<path class="mk-body mk-plumbing" d="M0-12C7-3 9 2 9 5A9 9 0 0 1-9 5C-9 2-7-3 0-12Z"/>';
    case 'gas':
      return '<path class="mk-body mk-gas" d="M0-13L13 0 0 13-13 0Z"/><text class="mk-text" y="1" text-anchor="middle" dominant-baseline="middle">G</text>';
    case 'vent':
      return (
        '<rect class="mk-body mk-vent" x="-13" y="-9" width="26" height="18" rx="2"/>' +
        '<path class="mk-line mk-vent-line" d="M-8-3.5H8M-8 0H8M-8 3.5H8"/>'
      );
    case 'column':
      return '<rect class="mk-body mk-column" x="-10" y="-10" width="20" height="20"/><path class="mk-line mk-column-line" d="M-10-10L10 10M10-10L-10 10"/>';
    case 'sink':
      return '<rect class="mk-body mk-sink" x="-14" y="-10" width="28" height="20" rx="3"/><rect class="mk-line mk-sink-line" x="-9" y="-4" width="18" height="11" rx="2"/><circle class="mk-dot mk-sink-line" cx="0" cy="-7" r="1.4"/>';
    case 'cooktop':
      return '<rect class="mk-body mk-cooktop" x="-13" y="-13" width="26" height="26" rx="3"/><circle class="mk-line mk-cooktop-line" cx="-5" cy="-5" r="3.5"/><circle class="mk-line mk-cooktop-line" cx="5" cy="-5" r="3.5"/><circle class="mk-line mk-cooktop-line" cx="-5" cy="5" r="3.5"/><circle class="mk-line mk-cooktop-line" cx="5" cy="5" r="3.5"/>';
    case 'range':
      return '<rect class="mk-body mk-range" x="-13" y="-14" width="26" height="28" rx="3"/><circle class="mk-line mk-range-line" cx="-5" cy="-7" r="3"/><circle class="mk-line mk-range-line" cx="5" cy="-7" r="3"/><rect class="mk-line mk-range-line" x="-9" y="1" width="18" height="9" rx="1.5"/>';
    case 'fridge':
      return '<rect class="mk-body mk-fridge" x="-9" y="-14" width="18" height="28" rx="2"/><path class="mk-line mk-fridge-line" d="M-9-3H9M-5-9v3M-5 1v5"/>';
    case 'oven':
      return '<rect class="mk-body mk-oven" x="-12" y="-12" width="24" height="24" rx="2"/><rect class="mk-line mk-oven-line" x="-8" y="-3" width="16" height="11" rx="1"/><path class="mk-line mk-oven-line" d="M-6-8H6"/>';
    case 'dishwasher':
      return '<rect class="mk-body mk-dw" x="-12" y="-12" width="24" height="24" rx="2"/><text class="mk-text mk-dwtext" y="1" text-anchor="middle" dominant-baseline="middle">DW</text>';
    case 'pantry':
      return '<rect class="mk-body mk-pantry" x="-8" y="-14" width="16" height="28" rx="2"/><path class="mk-line mk-pantry-line" d="M-8-5H8M-8 4H8"/>';
    default:
      return '';
  }
}

export function markerIcon(type) {
  return `<svg viewBox="-16 -16 32 32" width="30" height="30" aria-hidden="true">${markerSymbol(type)}</svg>`;
}

function label(x, y, text, cls = '', angle = 0) {
  const rot = angle ? ` transform="rotate(${r1(angle)} ${r1(x)} ${r1(y)})"` : '';
  return `<text class="lbl ${cls}" x="${r1(x)}" y="${r1(y)}" text-anchor="middle" dominant-baseline="middle"${rot}>${esc(text)}</text>`;
}

// Text along a wall reads left to right or bottom to top, never upside down.
function readableAngle(d) {
  let a = (Math.atan2(d.y, d.x) * 180) / Math.PI;
  if (a > 90) a -= 180;
  if (a <= -90) a += 180;
  return a;
}

function line(a, b, cls) {
  return `<line class="${cls}" x1="${r1(a.x)}" y1="${r1(a.y)}" x2="${r1(b.x)}" y2="${r1(b.y)}"/>`;
}

const add = (p, v, k) => ({ x: p.x + v.x * k, y: p.y + v.y * k });

function activeIs(ui, kind, key, val) {
  const a = ui.active;
  return !!a && a.kind === kind && a[key] === val;
}

export function openingTitle(room, op) {
  const sameKind = room.openings.filter((o) => o.kind === op.kind);
  const n = sameKind.indexOf(op) + 1;
  return `${op.kind === 'window' ? 'Window' : 'Door'} ${n}`;
}

// What an opening's position is measured from: a wall corner or the neighbouring opening.
export function refLabel(room, op) {
  const ref = op.ref || { id: null, side: 'before' };
  if (ref.id != null) {
    const o = room.openings.find((x) => x.id === ref.id);
    if (o) return openingTitle(room, o);
  }
  const n = room.dirs.length;
  const i = op.wall;
  return ref.side === 'before' ? `corner W${((i - 1 + n) % n) + 1}/W${i + 1}` : `corner W${i + 1}/W${((i + 1) % n) + 1}`;
}

// Distance from the reference to the near edge of the opening, as currently drawn.
export function positionInfo(room, derived, op) {
  const span = derived.spans.get(op.id);
  const a = derived.verts[op.wall];
  const b = derived.verts[op.wall + 1];
  const L = Math.hypot(b.x - a.x, b.y - a.y);
  const ref = op.ref || { id: null, side: 'before' };
  const rs = ref.id != null ? derived.spans.get(ref.id) : null;
  const anchorU = ref.side === 'before' ? (rs ? rs[1] : 0) : rs ? rs[0] : L;
  const gap = ref.side === 'before' ? span[0] - anchorU : anchorU - span[1];
  return { gap: Math.max(0, gap), anchorU, side: ref.side, label: refLabel(room, op) };
}

const polyStr = (poly, S) =>
  poly
    .map((p) => {
      const q = S(p);
      return `${r1(q.x)},${r1(q.y)}`;
    })
    .join(' ');

// One layer's boxes. `ghost` draws them faint and unlabeled (the lowers under the uppers).
function drawLayout(layout, S, view, ui, ghost, labels) {
  let out = '';
  for (const rl of layout.runs) {
    const fr = rl.frame;
    const ang = readableAngle(fr.d);
    for (const b of rl.boxes) {
      const pts = b.poly.map(S);
      const cls = `bx bx-${b.kind}${ghost ? ' ghost' : ''}`;
      out += `<polygon class="${cls}" points="${pts.map((p) => `${r1(p.x)},${r1(p.y)}`).join(' ')}"/>`;
      if (ghost) continue;
      if (b.kind === 'void') {
        out += line(pts[0], pts[2], 'bx-x') + line(pts[1], pts[3], 'bx-x');
      }
      if (b.panels) {
        if (b.panels.left) out += line(pts[0], pts[3], 'panel-bar');
        if (b.panels.right) out += line(pts[1], pts[2], 'panel-bar');
      }
      const c = { x: (pts[0].x + pts[2].x) / 2, y: (pts[0].y + pts[2].y) / 2 };
      const along = (b.u1 - b.u0) * view.s;
      const deep = b.depth * view.s;
      const text = b.kind === 'corner' ? `${b.label} \u21bb` : b.label;
      if (along >= 22 && deep >= 14) {
        const fits = along >= text.length * 6.4 + 6;
        const shown = fits ? text : fmt(b.u1 - b.u0);
        labels.push(label(c.x, c.y, along >= shown.length * 6.4 ? shown : '', 'small box', ang));
      }
    }
    if (ui.selectedRun === rl.run.id) {
      const sel = [at0(fr, fr.u0, 0), at0(fr, fr.u1, 0), at0(fr, fr.u1, rl.depth), at0(fr, fr.u0, rl.depth)];
      out += `<polygon class="sel-run" points="${polyStr(sel, S)}"/>`;
    }
    if (rl.tooClose) {
      const sel = [at0(fr, 0, 0), at0(fr, fr.L, 0), at0(fr, fr.L, rl.depth), at0(fr, 0, rl.depth)];
      out += `<polygon class="bad-run" points="${polyStr(sel, S)}"/>`;
    }
  }
  return out;
}

const at0 = (fr, u, out) => ({ x: fr.a.x + fr.d.x * u + fr.n.x * out, y: fr.a.y + fr.d.y * u + fr.n.y * out });

export function renderScene({ state, derived, view, ui, layouts }) {
  const S = (p) => ({ x: p.x * view.s + view.ox, y: p.y * view.s + view.oy });
  const room = state.room;
  let out = '';
  const boxLabels = [];

  if (room && derived) {
    const frames = wallFrames(derived.verts, room.construction);
    const orient = derived.orient;

    const poly = derived.verts
      .slice(0, derived.n)
      .map((p) => {
        const q = S(p);
        return `${r1(q.x)},${r1(q.y)}`;
      })
      .join(' ');
    out += `<polygon class="room-fill" points="${poly}"/>`;

    // Walls (cut where openings sit) and construction lines.
    for (const f of frames) {
      const act = activeIs(ui, 'wall', 'i', f.i) ? ' active' : '';
      if (f.construction) {
        out += line(S(f.a), S(f.b), 'cons' + act);
        continue;
      }
      const spans = room.openings
        .filter((o) => o.wall === f.i)
        .map((o) => derived.spans.get(o.id))
        .sort((p, q) => p[0] - q[0]);
      let cursor = 0;
      const free = [];
      for (const [u0, u1] of spans) {
        if (u0 > cursor) free.push([cursor, u0]);
        cursor = Math.max(cursor, u1);
      }
      if (cursor < f.L) free.push([cursor, f.L]);
      for (const [u0, u1] of free) {
        out += line(S(add(f.a, f.d, u0)), S(add(f.a, f.d, u1)), 'wall' + act);
      }
    }

    // Openings: gap marks, door swing or window glass, and the off-the-side dimension callouts.
    for (const op of room.openings) {
      const f = frames[op.wall];
      if (!f) continue;
      const [u0, u1] = derived.spans.get(op.id);
      const P0 = S(add(f.a, f.d, u0));
      const P1 = S(add(f.a, f.d, u1));
      const n = f.n;
      const wpx = (u1 - u0) * view.s;
      out += line(add(P0, n, -7), add(P0, n, 7), 'tick');
      out += line(add(P1, n, -7), add(P1, n, 7), 'tick');

      if (op.kind === 'window') {
        out += line(add(P0, n, -2.5), add(P1, n, -2.5), 'win-line');
        out += line(add(P0, n, 2.5), add(P1, n, 2.5), 'win-line');
      } else if (op.swing) {
        const hingeP = op.swing.hinge === 0 ? P0 : P1;
        const latchP = op.swing.hinge === 0 ? P1 : P0;
        const tip = add(hingeP, n, op.swing.side * wpx);
        out += line(hingeP, tip, 'door-leaf');
        const ax = tip.x - hingeP.x;
        const ay = tip.y - hingeP.y;
        const bx = latchP.x - hingeP.x;
        const by = latchP.y - hingeP.y;
        const sweep = ax * by - ay * bx > 0 ? 1 : 0;
        out += `<path class="door-arc" d="M${r1(tip.x)} ${r1(tip.y)}A${r1(wpx)} ${r1(wpx)} 0 0 ${sweep} ${r1(latchP.x)} ${r1(latchP.y)}"/>`;
      }

      // Callouts sit outside the room.
      const out_n = { x: -n.x * orient, y: -n.y * orient };
      const center = f.L ? (u0 + u1) / 2 : 0;
      const ang = readableAngle(f.d);
      const C = S(add(f.a, f.d, center));
      const width = u1 - u0;
      const dims = [
        { key: 'ro', off: 24, prefix: 'RO', span: width, val: op.ro },
        { key: 'cc', off: 44, prefix: 'CC', span: op.cc != null ? op.cc : width + 5, val: op.cc },
      ];
      for (const dm of dims) {
        const half = (dm.span * view.s) / 2;
        const mid = add(C, out_n, dm.off);
        const a = add(mid, f.d, -half);
        const b = add(mid, f.d, half);
        const miss = dm.val == null;
        out += line(a, b, 'dim-line' + (miss ? ' dashed' : ''));
        out += line(add(a, out_n, -4), add(a, out_n, 4), 'dim-line');
        out += line(add(b, out_n, -4), add(b, out_n, 4), 'dim-line');
        const act = activeIs(ui, 'opening', 'id', op.id) && ui.active.field === dm.key ? ' active' : '';
        out += label(mid.x, mid.y, `${dm.prefix} ${miss ? '?' : formatInches(dm.val, { quote: false })}`, (miss ? 'missing' : '') + act, ang);
      }
      {
        // Position from the nearest corner or neighbouring opening. Windows keep their sill/height
        // line closer in, so theirs sits further out; doors sit just outside the casing line.
        const posOff = op.kind === 'window' ? 88 : 64;
        const pi = positionInfo(room, derived, op);
        const edgeU = pi.side === 'before' ? u0 : u1;
        const A = S(add(f.a, f.d, pi.anchorU));
        const E = S(add(f.a, f.d, edgeU));
        const miss = op.pos == null;
        const pa = add(A, out_n, posOff);
        const pe = add(E, out_n, posOff);
        out += line(add(A, out_n, 8), add(A, out_n, posOff + 6), 'dim-line');
        out += line(add(E, out_n, 8), add(E, out_n, posOff + 6), 'dim-line');
        out += line(pa, pe, 'dim-line' + (miss ? ' dashed' : ''));
        const pm = { x: (pa.x + pe.x) / 2, y: (pa.y + pe.y) / 2 };
        const act = activeIs(ui, 'opening', 'id', op.id) && ui.active.field === 'pos' ? ' active' : '';
        out += label(pm.x, pm.y, `${miss ? '?' : formatInches(op.pos, { quote: false })} to ${pi.label}`, 'small' + (miss ? ' missing' : '') + act, ang);
      }
      if (op.kind === 'window') {
        const mid = add(C, out_n, 64);
        const sv = op.sill == null ? '?' : formatInches(op.sill, { quote: false });
        const hv = op.h == null ? '?' : formatInches(op.h, { quote: false });
        const act = activeIs(ui, 'opening', 'id', op.id) && (ui.active.field === 'sill' || ui.active.field === 'h') ? ' active' : '';
        const miss = op.sill == null || op.h == null ? ' missing' : '';
        out += label(mid.x, mid.y, `sill ${sv} \u00b7 ht ${hv}`, 'small' + miss + act, ang);
      }
    }

    // Wall lengths on the inside of each wall.
    for (const f of frames) {
      const mid = S({ x: (f.a.x + f.b.x) / 2, y: (f.a.y + f.b.y) / 2 });
      const inN = { x: f.n.x * orient, y: f.n.y * orient };
      const p = add(mid, inN, 18);
      const known = room.known[f.i];
      const act = activeIs(ui, 'wall', 'i', f.i) ? ' active' : '';
      if (known != null) out += label(p.x, p.y, formatInches(known, { quote: false }), act);
      else out += label(p.x, p.y, `W${f.i + 1} ?`, 'missing' + act);
    }

    if (!derived.closed) {
      const a = S(derived.verts[derived.n]);
      const b = S(derived.verts[0]);
      out += line(a, b, 'gap-line');
      out += label((a.x + b.x) / 2, (a.y + b.y) / 2 - 14, `off ${formatInches(derived.gapLen)}`, 'bad');
    }

    if (ui.pending) {
      const f = frames[ui.pending.wall];
      if (f) {
        const P = S(add(f.a, f.d, ui.pending.u));
        out += line(add(P, f.n, -16), add(P, f.n, 16), 'pending');
      }
    }
  }

  // Cabinets (lowers and uppers tabs).
  if (room && derived && layouts && (ui.tab === 'lowers' || ui.tab === 'uppers')) {
    if (ui.tab === 'lowers') {
      for (const z of layouts.lower.zones) out += `<polygon class="zone" points="${polyStr(z, S)}"/>`;
      out += drawLayout(layouts.lower, S, view, ui, false, boxLabels);
    } else {
      out += drawLayout(layouts.lower, S, view, ui, true, boxLabels);
      out += drawLayout(layouts.upper, S, view, ui, false, boxLabels);
    }
  }

  // Markers on top.
  for (const m of state.markers) {
    const p = S(m);
    const sel = ui.selectedMarker === m.id ? ' selected' : '';
    if (m.type === 'column') {
      const w = Math.max(16, (m.w || 12) * view.s);
      const d = Math.max(16, (m.d || m.w || 12) * view.s);
      out += `<g class="marker${sel}" transform="translate(${r1(p.x)} ${r1(p.y)})">`;
      out += `<rect class="mk-body mk-column" x="${r1(-w / 2)}" y="${r1(-d / 2)}" width="${r1(w)}" height="${r1(d)}"/>`;
      out += `<path class="mk-line mk-column-line" d="M${r1(-w / 2)} ${r1(-d / 2)}L${r1(w / 2)} ${r1(d / 2)}M${r1(w / 2)} ${r1(-d / 2)}L${r1(-w / 2)} ${r1(d / 2)}"/>`;
      if (m.w) out += label(0, d / 2 + 13, `${formatInches(m.w, { quote: false })}×${formatInches(m.d || m.w, { quote: false })}`, 'small');
      if (sel) out += `<rect class="sel-ring" x="${r1(-w / 2 - 5)}" y="${r1(-d / 2 - 5)}" width="${r1(w + 10)}" height="${r1(d + 10)}" rx="4"/>`;
      out += '</g>';
    } else if (APPLIANCE_TYPES.includes(m.type)) {
      // Appliances only show where they matter; elsewhere they sit back, or are hidden.
      if (ui.tab === 'walls') continue;
      const faint = ui.tab !== 'lowers' ? ' faint' : '';
      const w = m.w || RULES.defaultWidths[m.type];
      out += `<g class="marker${sel}${faint}" transform="translate(${r1(p.x)} ${r1(p.y)})">${markerSymbol(m.type)}${sel ? '<circle class="sel-ring" r="21"/>' : ''}`;
      if (w) out += label(0, 24, fmt(w), 'small');
      const note = layouts && ui.tab === 'lowers' && layouts.lower.notes.find((n) => n.markerId === m.id && n.hookup);
      if (note) out += label(0, 38, 'No hookups marked', 'small missing');
      out += '</g>';
    } else {
      const faint = ui.tab === 'uppers' ? ' faint' : '';
      out += `<g class="marker${sel}${faint}" transform="translate(${r1(p.x)} ${r1(p.y)})">${markerSymbol(m.type)}${sel ? '<circle class="sel-ring" r="19"/>' : ''}</g>`;
    }
  }

  return out + boxLabels.join('');
}
