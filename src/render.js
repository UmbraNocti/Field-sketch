// Builds the SVG for the sketch. Everything is placed in screen px so line widths and text stay
// the same size at any zoom.
import { openingSpan } from './geometry.js';
import { wallFrames } from './recognize.js';
import { formatInches } from './format.js';

const r1 = (n) => Math.round(n * 10) / 10;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

export const MARKER_NAMES = {
  plumbing: 'Plumbing',
  outlet: 'Outlet',
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

export function renderScene({ state, derived, view, ui }) {
  const S = (p) => ({ x: p.x * view.s + view.ox, y: p.y * view.s + view.oy });
  const room = state.room;
  let out = '';

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
        .map((o) => openingSpan(o, f.L))
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
      const [u0, u1] = openingSpan(op, f.L);
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
    } else {
      out += `<g class="marker${sel}" transform="translate(${r1(p.x)} ${r1(p.y)})">${markerSymbol(m.type)}${sel ? '<circle class="sel-ring" r="19"/>' : ''}</g>`;
    }
  }

  return out;
}
