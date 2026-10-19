import { createStore, deriveRoom, newRoom, openingFields } from './store.js';
import { strokeToPolygon, nearestReference, dist, dirIndex, DIRS } from './geometry.js';
import {
  classifyStroke,
  wallFrames,
  hitWall,
  hitOpening,
  findLineCrossing,
  arcToDoor,
  constructionTargets,
  strokeCorners,
} from './recognize.js';
import {
  formatInches,
  emptyEntry,
  entryHasInput,
  entryToInches,
  entryPressDigit,
  entryPressFraction,
  entryBackspace,
  entryClear,
} from './format.js';
import { renderScene, markerIcon } from './render.js';
import { computeLayouts, wallBlockers } from './layout.js';
import { computeFit } from './viewfit.js';
import { runChecks } from './checks.js';
import { RULES, APPLIANCE_TYPES, APPLIANCE_NAMES, UTILITY_TYPES } from './rules.js';
import { serializeSketch, parseSketch, fileNameFor } from './file.js';
import { buildReport } from './report.js';
import { buildSketchPdf } from './export.js';
import { panelMarkup } from './panel.js';
import { getFieldValue, setFieldValue, sameField, openingFieldList, wallQueueAfter } from './fields.js';

const $ = (id) => document.getElementById(id);
const svg = $('canvas');
const scene = $('scene');
const preview = $('preview');
const panelEl = $('panel');
const trayEl = $('tray');
const tabsEl = $('tabs');
const hintEl = $('hint');
const toastEl = $('toast');
const emptyEl = $('empty');
const stageEl = $('stage');
const wrapEl = $('canvasWrap');
const cornerEl = $('corner');

const store = createStore(window.localStorage);

const ui = {
  tab: 'walls',
  tool: 'wall',
  markerTool: 'outlet',
  active: null,
  queue: [],
  entry: emptyEntry(),
  selectedMarker: null,
  selectedRun: null,
  cabTool: 'cabinets',
  layouts: null,
  pending: null,
  userMoved: false,
};
const view = { s: 3, ox: 0, oy: 0 };

const TABS = [
  { id: 'walls', label: 'Walls' },
  { id: 'markings', label: 'Markings' },
  { id: 'lowers', label: 'Lowers' },
  { id: 'uppers', label: 'Uppers' },
  { id: 'checklist', label: 'Rules' },
];

const PENCILS = [
  { id: 'wall', label: 'Walls', color: '#3b4452', hint: 'Draw the whole room in one stroke. It snaps straight and closes by itself.' },
  { id: 'door', label: 'Door', color: '#b4600c', hint: 'Door: draw two short lines across a wall, or one arc for the swing.' },
  { id: 'window', label: 'Window', color: '#2563b8', hint: 'Window: draw two short lines across a wall.' },
  { id: 'construction', label: 'Open wall', color: '#8b95a3', hint: 'Open wall: scribble or swipe along a wall to turn it into a construction line. Do it again to restore it.' },
];

function pencilSvg(color) {
  return `<svg viewBox="0 0 24 64" width="26" height="62" aria-hidden="true">
    <path d="M12 2L6 18H18Z" fill="#f1d6a8"/><path d="M12 2L9.7 9H14.3Z" fill="#2b2f36"/>
    <rect x="6" y="18" width="12" height="32" fill="${color}"/><rect x="10" y="18" width="4" height="32" fill="#fff" opacity=".18"/>
    <rect x="6" y="50" width="12" height="6" fill="#c3c9d1"/><rect x="6" y="56" width="12" height="7" rx="2" fill="#e8a3a3"/></svg>`;
}

// ---------- coordinates and view ----------

const toWorld = (p) => ({ x: (p.x - view.ox) / view.s, y: (p.y - view.oy) / view.s });
const canvasSize = () => {
  const r = svg.getBoundingClientRect();
  return { w: r.width, h: r.height };
};

function resetView() {
  const { w, h } = canvasSize();
  view.s = Math.max(1.2, Math.min(w, h) / 220);
  view.ox = 0;
  view.oy = 0;
}

function fitView() {
  const state = store.get();
  const d = deriveRoom(state.room);
  if (!d) return resetView();
  const { w, h } = canvasSize();
  Object.assign(view, computeFit(state, d, w, h));
  ui.userMoved = false;
}

// ---------- toast ----------

let toastTimer = 0;
function toast(msg, action) {
  toastEl.innerHTML = '';
  const span = document.createElement('span');
  span.textContent = msg;
  toastEl.appendChild(span);
  if (action) {
    const b = document.createElement('button');
    b.textContent = action.label;
    b.addEventListener('click', () => {
      action.fn();
      toastEl.classList.remove('show');
    });
    toastEl.appendChild(b);
  }
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), action ? 6000 : 3200);
}

// ---------- rendering ----------

let hintTimer = 0;

function trayMarkup() {
  if (ui.tab === 'walls') {
    return PENCILS.map(
      (p) => `<button class="pencil${ui.tool === p.id ? ' active' : ''}" data-tool="${p.id}">${pencilSvg(p.color)}<span>${p.label}</span></button>`,
    ).join('');
  }
  const pencil = `<button class="pencil${ui.cabTool === 'cabinets' ? ' active' : ''}" data-cab="cabinets">${pencilSvg('#8a5a2b')}<span>Cabinets</span></button>`;
  const moveTile = `<button class="tool-tile${ui.cabTool === 'select' ? ' active' : ''}" data-cab="select"><svg viewBox="-16 -16 32 32" width="30" height="30" aria-hidden="true"><path class="mk-line" stroke="currentColor" d="M0-11V11M-11 0H11M0-11l-4 4M0-11l4 4M0 11l-4-4M0 11l4-4M-11 0l4-4M-11 0l4 4M11 0l-4-4M11 0l-4 4"/></svg><span>Move</span></button>`;
  if (ui.tab === 'uppers') {
    return pencil + `<button class="tool-tile${ui.cabTool === 'microwave' ? ' active' : ''}" data-cab="microwave">${markerIcon('microwave')}<span>Microwave</span></button>` + moveTile;
  }
  const tiles = APPLIANCE_TYPES.map(
    (t) => `<button class="tool-tile${ui.cabTool === t ? ' active' : ''}" data-cab="${t}">${markerIcon(t)}<span>${APPLIANCE_NAMES[t]}</span></button>`,
  ).join('');
  const move = `<button class="tool-tile${ui.cabTool === 'select' ? ' active' : ''}" data-cab="select"><svg viewBox="-16 -16 32 32" width="30" height="30" aria-hidden="true"><path class="mk-line" stroke="currentColor" d="M0-11V11M-11 0H11M0-11l-4 4M0-11l4 4M0 11l-4-4M0 11l4-4M-11 0l4-4M-11 0l4 4M11 0l-4-4M11 0l-4 4"/></svg><span>Move</span></button>`;
  return pencil + tiles + move;
}

function cooksMarkup(state) {
  const n = (state.kitchen && state.kitchen.cooks) || 1;
  return `<button data-act="cooks"><small>Cooks</small><b>${n === 2 ? 'More than one' : 'One'}</b></button>`;
}

function cornerMarkup(state) {
  const u = state.upper || {};
  const chip = (field, title, val, zeroNote) => {
    const on = ui.active && ui.active.kind === 'upper' && ui.active.field === field ? ' on' : '';
    const text = val == null ? '\u2014' : formatInches(val);
    return `<button class="${on.trim()}" data-act="corner-field" data-field="${field}"><small>${title}</small><b>${text}${zeroNote && val === 0 ? ' (none)' : ''}</b></button>`;
  };
  return chip('height', 'Upper height', u.height, false) + chip('crown', 'Crown', u.crown, true) + chip('rail', 'Light rail', u.rail, true);
}

function render() {
  const state = store.get();
  const derived = deriveRoom(state.room);
  const layouts = computeLayouts(state, derived);
  ui.layouts = layouts;
  ui.checks = runChecks(state, derived, layouts);
  scene.innerHTML = renderScene({ state, derived, view, ui, layouts });
  emptyEl.hidden = !!state.room || ui.tab !== 'walls';
  stageEl.classList.toggle('kp-open', !!ui.active);

  const scroller = panelEl.querySelector('.panel-scroll');
  const keep = scroller ? scroller.scrollTop : 0;
  panelEl.innerHTML = panelMarkup(state, derived, ui, layouts);
  const sc = panelEl.querySelector('.panel-scroll');
  if (sc) {
    sc.scrollTop = keep;
    const act = sc.querySelector('.active');
    if (act) {
      const a = act.getBoundingClientRect();
      const b = sc.getBoundingClientRect();
      if (a.top < b.top || a.bottom > b.bottom) act.scrollIntoView({ block: 'nearest' });
    }
  }

  tabsEl.innerHTML = TABS.map(
    (t) => `<button class="tab${ui.tab === t.id ? ' active' : ''}${t.soon ? ' soon' : ''}" data-tab="${t.id}">${t.label}${t.id === 'checklist' && ui.checks && ui.checks.summary.warn ? `<i class="badge">${ui.checks.summary.warn}</i>` : ''}</button>`,
  ).join('');

  const showTray = ui.tab === 'walls' || ui.tab === 'lowers' || ui.tab === 'uppers';
  trayEl.hidden = !showTray;
  trayEl.classList.toggle('scroll', ui.tab === 'lowers');
  if (showTray) trayEl.innerHTML = trayMarkup();

  cornerEl.hidden = ui.tab !== 'uppers' && ui.tab !== 'lowers';
  if (!cornerEl.hidden) cornerEl.innerHTML = ui.tab === 'uppers' ? cornerMarkup(state) : cooksMarkup(state);

  let hint = '';
  if (ui.tab === 'walls') {
    if (ui.pending) hint = 'Now draw the second line to set the other edge.';
    else if (ui.tool === 'wall' && state.room) hint = 'Drawing a new outline replaces this room. Undo brings it back.';
    else hint = PENCILS.find((p) => p.id === ui.tool).hint;
  } else if (ui.tab === 'markings') {
    hint = ui.markerTool === 'select' ? 'Drag a marker to move it. Tap one to select it.' : 'Tap the sketch to place a marker. Drag a placed one to move it.';
  } else if (ui.tab === 'checklist') {
    hint = 'The kitchen rules, checked against your sketch. The dashed triangle is the work triangle.';
  } else if (ui.cabTool === 'cabinets') {
    hint =
      ui.tab === 'lowers'
        ? 'Drag along a wall to fill it with cabinets, or in open floor for an island. Tap a corner cabinet to change its size.'
        : 'Drag along a wall to hang uppers. Windows and doors stay clear. Crown and light rail are set at the bottom left.';
  } else if (ui.cabTool === 'select') {
    hint = 'Drag a marker to move it. Tap one to select it.';
  } else {
    hint = `Tap to drop the ${APPLIANCE_NAMES[ui.cabTool].toLowerCase()}. It steers the layout; drag it to adjust.`;
  }
  if (hintEl.textContent !== hint) {
    hintEl.textContent = hint;
    hintEl.classList.remove('fade');
    clearTimeout(hintTimer);
    hintTimer = setTimeout(() => hintEl.classList.add('fade'), 5000);
  }

  const jn = $('jobname');
  jn.textContent = state.name || 'Untitled sketch';
  jn.classList.toggle('unnamed', !state.name);
  $('undo').disabled = !store.canUndo();
  $('redo').disabled = !store.canRedo();
}

store.subscribe(render);

// ---------- keypad / fields ----------

function setActive(field, queue = []) {
  ui.active = field;
  ui.queue = queue;
  ui.entry = emptyEntry();
}

function applyEntry() {
  const a = ui.active;
  if (!a || ui.entry.fresh) return;
  const e = ui.entry;
  if (entryHasInput(e)) {
    const v = entryToInches(e);
    // Zero is a real position (a doorway flush to a corner) and "no crown"; other sizes need a value.
    const zeroOk = (a.kind === 'opening' && a.field === 'pos') || (a.kind === 'upper' && (a.field === 'crown' || a.field === 'rail'));
    if (v < 0 || (v === 0 && !zeroOk)) return;
    store.mutate((s) => setFieldValue(s, a, v));
    if (a.kind === 'wall' && !ui.userMoved) fitView();
  } else if (e.cleared) {
    store.mutate((s) => setFieldValue(s, a, null));
  }
}

function advance() {
  if (ui.queue.length) {
    const next = ui.queue.shift();
    ui.active = next;
    ui.entry = emptyEntry();
  } else {
    ui.active = null;
    ui.queue = [];
    ui.entry = emptyEntry();
  }
}

function openField(field, queue) {
  applyEntry();
  if (sameField(ui.active, field)) return render();
  setActive(field, queue);
  render();
}

function openOpening(op) {
  const list = openingFieldList(op);
  const firstMissing = list.findIndex((f) => getFieldValue(store.get(), f) == null);
  const start = firstMissing === -1 ? 0 : firstMissing;
  setActive(list[start], list.slice(start + 1));
}

// ---------- stroke handling: walls tab ----------

function frames() {
  const state = store.get();
  const d = deriveRoom(state.room);
  return d ? wallFrames(d.verts, state.room.construction) : [];
}

const tolW = (px) => px / view.s;

function handleWallStroke(pts) {
  const poly = strokeToPolygon(pts, view.s);
  if (!poly) return toast('Couldn’t read that as a room. Draw the outline in one stroke.');
  const replaced = !!store.get().room;
  store.mutate((s) => {
    s.room = newRoom({ start: toWorld(poly.start), dirs: poly.dirs, base: poly.base });
    s.nextId = s.nextId || 1;
  });
  ui.pending = null;
  fitView();
  setActive({ kind: 'wall', i: 0 }, wallQueueAfter(store.get(), 0));
  render();
  if (replaced) toast('Room redrawn.', { label: 'Undo', fn: () => store.undo() });
}

function overlaps(room, spans, wall, u0, u1) {
  return room.openings.some((o) => {
    if (o.wall !== wall) return false;
    const sp = spans.get(o.id);
    return !!sp && u0 < sp[1] && u1 > sp[0];
  });
}

function createOpening(kind, wall, center, width, swing) {
  const state = store.get();
  const d = deriveRoom(state.room);
  const f = frames()[wall];
  const w = Math.min(Math.max(12, width), f.L);
  const c = Math.max(w / 2, Math.min(f.L - w / 2, center));
  const span = [c - w / 2, c + w / 2];
  if (overlaps(state.room, d.spans, wall, span[0], span[1])) return toast('That overlaps another opening.');
  const others = state.room.openings.filter((o) => o.wall === wall).map((o) => ({ id: o.id, span: d.spans.get(o.id) }));
  const ref = nearestReference(span, f.L, others);
  let created = null;
  store.mutate((s) => {
    created = { id: s.nextId++, wall, kind, t: c / f.L, drawW: Math.round(w), ro: null, cc: null, sill: null, h: null, pos: null, ref, swing: swing || null };
    s.room.openings.push(created);
  });
  ui.pending = null;
  openOpening(created);
  render();
}

function handleOpeningLine(kind, pts) {
  const fr = frames();
  const a = toWorld(pts[0]);
  const b = toWorld(pts[pts.length - 1]);
  const hit = findLineCrossing(a, b, fr, tolW(10));
  if (!hit) return toast('Draw the line across a wall, roughly at right angles.');
  const p = ui.pending;
  if (p && p.kind === kind && p.wall === hit.wall) {
    const width = Math.abs(hit.u - p.u);
    if (width < 12) return toast('Those lines are too close together.');
    return createOpening(kind, hit.wall, (hit.u + p.u) / 2, Math.round(width), null);
  }
  ui.pending = { kind, wall: hit.wall, u: hit.u };
  render();
}

function handleDoorStroke(pts, cls) {
  if (cls.type === 'line') return handleOpeningLine('door', pts);
  if (cls.type !== 'arc') return toast('Door: draw two short lines across a wall, or one arc for the swing.');
  const wpts = pts.map(toWorld);
  const door = arcToDoor(wpts, frames(), tolW(22));
  if (!door) return toast('Start the arc on a wall, sweeping out into the room.');
  if (door.error) return toast('That’s too narrow for a door.');
  const state = store.get();
  const f = frames()[door.wall];
  const spans = deriveRoom(state.room).spans;
  const c = door.t * f.L;
  const span0 = c - door.drawW / 2;
  const span1 = c + door.drawW / 2;
  const existing = state.room.openings.find((o) => {
    if (o.wall !== door.wall || o.kind !== 'door') return false;
    const [u0, u1] = spans.get(o.id);
    const oc = (u0 + u1) / 2;
    return (oc >= span0 && oc <= span1) || (c >= u0 && c <= u1);
  });
  if (existing) {
    store.mutate(() => {
      existing.swing = door.swing;
    });
    return toast('Door swing set.');
  }
  createOpening('door', door.wall, c, door.drawW, door.swing);
}

function handleWindowStroke(pts, cls) {
  if (cls.type !== 'line') return toast('Window: draw two short lines across a wall.');
  handleOpeningLine('window', pts);
}

function handleConstructionStroke(pts) {
  const room = store.get().room;
  if (!room) return;
  const targets = constructionTargets(pts.map(toWorld), frames(), tolW(14));
  if (!targets.length) return toast('Swipe or scribble across a wall to open it up.');
  const allOpen = targets.every((i) => room.construction[i]);
  let dropped = 0;
  store.mutate((s) => {
    for (const i of targets) s.room.construction[i] = !allOpen;
    if (!allOpen) {
      const before = s.room.openings.length;
      s.room.openings = s.room.openings.filter((o) => !targets.includes(o.wall));
      dropped = before - s.room.openings.length;
    }
  });
  ui.pending = null;
  if (dropped) toast(`Removed ${dropped} door/window on the open wall.`, { label: 'Undo', fn: () => store.undo() });
}

function handleTap(p) {
  const state = store.get();
  if (ui.tab !== 'walls' || !state.room) {
    if (ui.active) {
      applyEntry();
      setActive(null);
      render();
    }
    return;
  }
  const fr = frames();
  const w = toWorld(p);
  const op = hitOpening(w, fr, state.room.openings, tolW(16), deriveRoom(state.room).spans);
  if (op) {
    applyEntry();
    openOpening(op);
    return render();
  }
  const hit = hitWall(w, fr, tolW(16));
  if (hit) {
    openField({ kind: 'wall', i: hit.i }, wallQueueAfter(state, hit.i));
    return;
  }
  if (ui.active) {
    applyEntry();
    setActive(null);
  }
  ui.pending = null;
  render();
}

function finishWallsStroke(pts) {
  const cls = classifyStroke(pts);
  if (cls.type === 'tap') return handleTap(pts[0]);
  if (ui.tool === 'wall') return handleWallStroke(pts);
  if (!store.get().room) return toast('Draw the room outline first.');
  if (ui.tool === 'door') return handleDoorStroke(pts, cls);
  if (ui.tool === 'window') return handleWindowStroke(pts, cls);
  if (ui.tool === 'construction') return handleConstructionStroke(pts);
}

// ---------- markers ----------

function markerAt(p) {
  const state = store.get();
  const editable = ui.tab === 'lowers' ? APPLIANCE_TYPES : ui.tab === 'uppers' ? ['microwave'] : UTILITY_TYPES;
  for (let i = state.markers.length - 1; i >= 0; i--) {
    const m = state.markers[i];
    if (!editable.includes(m.type)) continue;
    const sx = m.x * view.s + view.ox;
    const sy = m.y * view.s + view.oy;
    let hw = 22;
    let hh = 22;
    if (m.type === 'column') {
      hw = Math.max(22, ((m.w || 12) * view.s) / 2 + 6);
      hh = Math.max(22, ((m.d || m.w || 12) * view.s) / 2 + 6);
    }
    if (Math.abs(p.x - sx) <= hw && Math.abs(p.y - sy) <= hh) return m;
  }
  return null;
}

function placeMarker(p, type = ui.markerTool) {
  if (type === 'select') {
    ui.selectedMarker = null;
    return render();
  }
  const w = toWorld(p);
  let created = null;
  store.mutate((s) => {
    created = { id: s.nextId++, type, x: w.x, y: w.y };
    if (type === 'column') {
      created.w = null;
      created.d = null;
    } else if (APPLIANCE_TYPES.includes(type)) {
      created.w = RULES.defaultWidths[type];
    }
    s.markers.push(created);
  });
  ui.selectedMarker = null;
  if (type === 'column') {
    setActive({ kind: 'marker', id: created.id, field: 'w' }, [{ kind: 'marker', id: created.id, field: 'd' }]);
    render();
  } else if (APPLIANCE_TYPES.includes(type)) {
    // Ask how wide; skipping keeps the usual size.
    setActive({ kind: 'marker', id: created.id, field: 'w' }, []);
    render();
  }
}

// ---------- cabinets ----------

const layerOfTab = () => (ui.tab === 'uppers' ? 'upper' : 'lower');

function inPoly(p, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

function cycleCorner(rl, b) {
  const layer = layerOfTab();
  const c = b.corner;
  const next = (c.opt + 1) % c.count;
  const prev = store.get().cornerPicks[c.key];
  store.mutate((s) => {
    s.cornerPicks[c.key] = { wall: prev ? prev.wall : rl.run.wall, opt: next };
  });
  ui.selectedRun = rl.run.id;
  render();
  const o = RULES[layer].corners[next];
  const what = o.type === 'diag' ? `Diagonal corner, ${formatInches(o.leg)} each way` : `Blind corner ${formatInches(o.width)}`;
  toast(`${what} (${next + 1} of ${c.count}). Tap again for the next one.`);
}

function handleCabTap(p) {
  const layer = layerOfTab();
  const lay = ui.layouts && ui.layouts[layer];
  const w = toWorld(p);
  if (lay) {
    for (const rl of lay.runs) {
      for (const b of rl.boxes) {
        if (inPoly(w, b.poly)) {
          if (b.kind === 'corner' || b.kind === 'diag') return cycleCorner(rl, b);
          ui.selectedRun = rl.run.id;
          ui.selectedMarker = null;
          return render();
        }
      }
    }
  }
  if (ui.active) {
    applyEntry();
    setActive(null);
  }
  ui.selectedRun = null;
  ui.selectedMarker = null;
  render();
}

// The wall a stretch of finger-drag lies along (parallel to it, within a cabinet's reach of it).
function matchWall(A, B, frames, orient, depth) {
  const chord = dist(A, B);
  let best = null;
  for (const f of frames) {
    if (f.construction) continue;
    const par = Math.abs((B.x - A.x) * f.d.x + (B.y - A.y) * f.d.y) / chord;
    if (par < 0.9) continue;
    const proj = (P) => ({
      u: (P.x - f.a.x) * f.d.x + (P.y - f.a.y) * f.d.y,
      perp: (P.x - f.a.x) * f.n.x * orient + (P.y - f.a.y) * f.n.y * orient,
    });
    const pa = proj(A);
    const pb = proj(B);
    const ok = (v) => v >= -24 && v <= depth + RULES.wallSnapOut;
    if (!ok(pa.perp) || !ok(pb.perp)) continue;
    if (Math.max(pa.u, pb.u) < 0 || Math.min(pa.u, pb.u) > f.L) continue;
    const score = (Math.abs(pa.perp - depth / 2) + Math.abs(pb.perp - depth / 2)) / 2;
    if (!best || score < best.score) best = { f, ua: pa.u, ub: pb.u, score };
  }
  return best;
}

// Tidy the ends of a run on a wall: into the corner if close, up against a door or window's
// clearance if close, to the half inch. Returns null if it is too short to be a run.
function finishWallRun(layer, state, derived, f, u0, u1) {
  const L = f.L;
  u0 = Math.max(0, u0);
  u1 = Math.min(L, u1);
  const snap = RULES.snapDistance;
  if (u0 < RULES.cornerReach) u0 = 0;
  if (L - u1 < RULES.cornerReach) u1 = L;
  for (const bl of wallBlockers(layer, state, derived, f.i)) {
    if (Math.abs(u0 - bl.u1) < snap && u0 >= bl.u0) u0 = bl.u1;
    if (Math.abs(u1 - bl.u0) < snap && u1 <= bl.u1) u1 = bl.u0;
  }
  u0 = Math.round(u0 * 2) / 2;
  u1 = Math.round(u1 * 2) / 2;
  return u1 - u0 < 12 ? null : { u0, u1 };
}

function addRuns(layer, list) {
  let last = null;
  store.mutate((s) => {
    for (const run of list) {
      if (run.kind === 'wall') {
        s.runs = s.runs.filter((r) => !(r.layer === layer && r.kind === 'wall' && r.wall === run.wall && r.u0 < run.u1 && r.u1 > run.u0));
      }
      last = s.nextId++;
      s.runs.push({ id: last, layer, ...run });
    }
  });
  ui.selectedRun = last;
  render();
}

function handleRunStroke(pts) {
  const state = store.get();
  const derived = deriveRoom(state.room);
  if (!derived) return toast('Draw the room outline first.');
  const layer = layerOfTab();
  const depth = RULES[layer].depth;
  const fr = wallFrames(derived.verts, state.room.construction);
  const verts = strokeCorners(pts).map(toWorld);

  // One swipe around a corner (down one wall, then along the next) makes a run on each wall,
  // meeting in that corner.
  if (verts.length >= 3) {
    const ms = [];
    let ok = true;
    for (let i = 0; i < verts.length - 1 && ok; i++) {
      if (dist(verts[i], verts[i + 1]) < 6) continue;
      const m = matchWall(verts[i], verts[i + 1], fr, derived.orient, depth);
      if (!m) {
        ok = false;
        break;
      }
      const prev = ms[ms.length - 1];
      if (prev && prev.f.i === m.f.i) prev.ub = m.ub;
      else ms.push({ ...m });
    }
    if (ok && ms.length >= 2) {
      const n = fr.length;
      const runs = ms.map((m) => ({ f: m.f, u0: Math.min(m.ua, m.ub), u1: Math.max(m.ua, m.ub) }));
      for (let k = 0; k < runs.length - 1; k++) {
        const a = runs[k];
        const b = runs[k + 1];
        if (b.f.i === (a.f.i + 1) % n) {
          a.u1 = a.f.L;
          b.u0 = 0;
        } else if (b.f.i === (a.f.i - 1 + n) % n) {
          a.u0 = 0;
          b.u1 = b.f.L;
        }
      }
      const made = [];
      for (const r of runs) {
        const t = finishWallRun(layer, state, derived, r.f, r.u0, r.u1);
        if (t) made.push({ kind: 'wall', wall: r.f.i, ...t });
      }
      if (made.length) {
        addRuns(layer, made);
        if (made.length > 1) toast(`${made.length} runs, one along each wall, meeting in the corner.`);
        return;
      }
    }
  }

  const A = toWorld(pts[0]);
  const B = toWorld(pts[pts.length - 1]);
  const chord = dist(A, B);
  if (chord < 12) return toast('Drag a little further to draw a run.');
  const best = matchWall(A, B, fr, derived.orient, depth);
  if (best) {
    const t = finishWallRun(layer, state, derived, best.f, Math.min(best.ua, best.ub), Math.max(best.ua, best.ub));
    if (!t) return toast('That run is too short. Drag further along the wall.');
    return addRuns(layer, [{ kind: 'wall', wall: best.f.i, ...t }]);
  }
  if (layer === 'upper') return toast('Uppers hang on walls. Drag along a wall.');
  const dir = DIRS[dirIndex(B.x - A.x, B.y - A.y)];
  const len = Math.round(chord);
  if (len < 15) return toast('That island is too short.');
  const a = { x: Math.round(A.x * 2) / 2, y: Math.round(A.y * 2) / 2 };
  addRuns(layer, [{ kind: 'free', a, b: { x: a.x + dir.x * len, y: a.y + dir.y * len } }]);
}

function finishCabStroke(pts) {
  const layer = layerOfTab();
  const cls = classifyStroke(pts);
  const p = pts[pts.length - 1];
  const markerTool = layer === 'lower' ? APPLIANCE_TYPES.includes(ui.cabTool) : ui.cabTool === 'microwave';
  if (markerTool) {
    if (Math.hypot(p.x - pts[0].x, p.y - pts[0].y) < 40) placeMarker(p, ui.cabTool);
    return;
  }
  if (ui.cabTool === 'select') return handleCabTap(p);
  if (cls.type === 'tap') return handleCabTap(p);
  if (cls.type === 'scribble') return toast('Drag one straight line along the wall.');
  handleRunStroke(pts);
}

// ---------- pointer input ----------

const pointers = new Map();
let stroke = null;
let drag = null;
let nav = null;

const pt = (e) => {
  const r = svg.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
};

function clearPreview() {
  preview.setAttribute('points', '');
}

function startNav() {
  const [a, b] = [...pointers.values()];
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  nav = {
    mid,
    dist: Math.hypot(a.x - b.x, a.y - b.y) || 1,
    view: { ...view },
    anchor: { x: (mid.x - view.ox) / view.s, y: (mid.y - view.oy) / view.s },
  };
}

function doNav() {
  const [a, b] = [...pointers.values()];
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
  view.s = Math.max(0.3, Math.min(30, nav.view.s * (d / nav.dist)));
  view.ox = mid.x - nav.anchor.x * view.s;
  view.oy = mid.y - nav.anchor.y * view.s;
  ui.userMoved = true;
  render();
}

svg.addEventListener('pointerdown', (e) => {
  try {
    svg.setPointerCapture(e.pointerId);
  } catch {
    // Capture can fail for synthetic or already-ended pointers; drawing still works without it.
  }
  const p = pt(e);
  pointers.set(e.pointerId, p);
  if (pointers.size === 2) {
    stroke = null;
    drag = null;
    clearPreview();
    startNav();
    return;
  }
  if (pointers.size > 2) return;
  if (ui.tab === 'markings' || ui.tab === 'lowers' || ui.tab === 'uppers') {
    const m = markerAt(p);
    if (m) {
      const w = toWorld(p);
      drag = { id: m.id, dx: m.x - w.x, dy: m.y - w.y, moved: false, start: p };
      ui.selectedMarker = m.id;
      render();
      return;
    }
  }
  stroke = { pts: [p] };
});

svg.addEventListener('pointermove', (e) => {
  if (!pointers.has(e.pointerId)) return;
  const p = pt(e);
  pointers.set(e.pointerId, p);
  if (nav && pointers.size >= 2) return doNav();
  if (drag) {
    if (!drag.moved && Math.hypot(p.x - drag.start.x, p.y - drag.start.y) < 4) return;
    const first = !drag.moved;
    drag.moved = true;
    const w = toWorld(p);
    store.mutate(
      (s) => {
        const m = s.markers.find((x) => x.id === drag.id);
        if (m) {
          m.x = w.x + drag.dx;
          m.y = w.y + drag.dy;
        }
      },
      { snapshot: first },
    );
    return;
  }
  if (!stroke) return;
  const last = stroke.pts[stroke.pts.length - 1];
  if (Math.hypot(p.x - last.x, p.y - last.y) < 1.5) return;
  stroke.pts.push(p);
  if (ui.tab === 'walls' || ((ui.tab === 'lowers' || ui.tab === 'uppers') && ui.cabTool === 'cabinets')) {
    preview.setAttribute('points', stroke.pts.map((q) => `${q.x.toFixed(1)},${q.y.toFixed(1)}`).join(' '));
  }
});

function endPointer(e) {
  if (!pointers.has(e.pointerId)) return;
  const p = pt(e);
  pointers.delete(e.pointerId);
  if (nav) {
    if (pointers.size < 2) nav = null;
    return;
  }
  if (drag) {
    const d = drag;
    drag = null;
    if (!d.moved) render();
    return;
  }
  if (!stroke) return;
  const s = stroke;
  stroke = null;
  clearPreview();
  if (e.type === 'pointercancel') return;
  s.pts.push(p);
  if (ui.tab === 'walls') finishWallsStroke(s.pts);
  else if (ui.tab === 'lowers' || ui.tab === 'uppers') finishCabStroke(s.pts);
  else if (ui.tab === 'markings') {
    const moved = Math.hypot(p.x - s.pts[0].x, p.y - s.pts[0].y);
    if (moved < 40) placeMarker(p);
  }
}
svg.addEventListener('pointerup', endPointer);
svg.addEventListener('pointercancel', endPointer);

svg.addEventListener(
  'wheel',
  (e) => {
    e.preventDefault();
    const p = pt(e);
    const k = Math.exp(-e.deltaY * 0.0015);
    const s = Math.max(0.3, Math.min(30, view.s * k));
    const wx = (p.x - view.ox) / view.s;
    const wy = (p.y - view.oy) / view.s;
    view.s = s;
    view.ox = p.x - wx * s;
    view.oy = p.y - wy * s;
    ui.userMoved = true;
    render();
  },
  { passive: false },
);

// ---------- buttons ----------

tabsEl.addEventListener('click', (e) => {
  const b = e.target.closest('[data-tab]');
  if (!b) return;
  applyEntry();
  ui.tab = b.dataset.tab;
  if (ui.tab === 'uppers' && ui.cabTool !== 'microwave' && ui.cabTool !== 'select') ui.cabTool = 'cabinets';
  ui.pending = null;
  setActive(null);
  ui.selectedMarker = null;
  render();
});

trayEl.addEventListener('click', (e) => {
  const cab = e.target.closest('[data-cab]');
  if (cab) {
    ui.cabTool = cab.dataset.cab;
    ui.selectedMarker = null;
    render();
    return;
  }
  const b = e.target.closest('[data-tool]');
  if (!b) return;
  ui.tool = b.dataset.tool;
  ui.pending = null;
  render();
});

cornerEl.addEventListener('click', (e) => {
  if (e.target.closest('[data-act="cooks"]')) {
    store.mutate((s) => {
      s.kitchen = { cooks: s.kitchen && s.kitchen.cooks === 2 ? 1 : 2 };
    });
    return;
  }
  const b = e.target.closest('[data-field]');
  if (!b) return;
  openField({ kind: 'upper', field: b.dataset.field }, []);
});

panelEl.addEventListener('click', (e) => {
  const b = e.target.closest('[data-act]');
  if (!b) return;
  const state = store.get();
  const d = b.dataset;
  switch (d.act) {
    case 'field': {
      if (d.kind === 'wall') openField({ kind: 'wall', i: Number(d.i) }, wallQueueAfter(state, Number(d.i)));
      else if (d.kind === 'ceiling') openField({ kind: 'ceiling' }, []);
      else if (d.kind === 'opening') {
        const op = state.room.openings.find((o) => o.id === Number(d.id));
        const list = openingFieldList(op);
        const at = list.findIndex((f) => f.field === d.field);
        openField(list[at], list.slice(at + 1));
      }
      break;
    }
    case 'digit':
      ui.entry = entryPressDigit(ui.entry, Number(d.d));
      render();
      break;
    case 'frac':
      ui.entry = entryPressFraction(ui.entry, Number(d.e));
      render();
      break;
    case 'back':
      ui.entry = entryBackspace(ui.entry);
      render();
      break;
    case 'clear':
      ui.entry = entryClear();
      render();
      break;
    case 'next':
      applyEntry();
      advance();
      render();
      break;
    case 'skip':
      advance();
      render();
      break;
    case 'del-opening':
      store.mutate((s) => {
        const gone = Number(d.id);
        s.room.openings = s.room.openings.filter((o) => o.id !== gone);
        // Anything measured from the removed opening falls back to its nearest corner.
        for (const o of s.room.openings) {
          if (o.ref && o.ref.id === gone) {
            o.ref = { id: null, side: o.ref.side };
            o.pos = null;
          }
        }
      });
      if (ui.active && ui.active.kind === 'opening' && ui.active.id === Number(d.id)) setActive(null);
      render();
      break;
    case 'marker-tool':
      ui.markerTool = d.type;
      ui.selectedMarker = null;
      render();
      break;
    case 'pick-run':
      ui.selectedRun = ui.selectedRun === Number(d.id) ? null : Number(d.id);
      render();
      break;
    case 'del-run':
      store.mutate((s) => {
        s.runs = s.runs.filter((r) => r.id !== Number(d.id));
      });
      ui.selectedRun = null;
      render();
      break;
    case 'swap-corner':
      store.mutate((s) => {
        s.cornerPicks[d.key] = { wall: Number(d.wall), opt: Number(d.opt) };
      });
      break;
    case 'goto-rules':
      ui.tab = 'checklist';
      render();
      break;
    case 'edit-width':
      setActive({ kind: 'marker', id: Number(d.id), field: 'w' }, []);
      render();
      break;
    case 'del-marker':
      store.mutate((s) => {
        s.markers = s.markers.filter((m) => m.id !== Number(d.id));
      });
      ui.selectedMarker = null;
      render();
      break;
    case 'edit-column':
      setActive({ kind: 'marker', id: Number(d.id), field: 'w' }, [{ kind: 'marker', id: Number(d.id), field: 'd' }]);
      render();
      break;
    default:
  }
});

$('undo').addEventListener('click', () => {
  setActive(null);
  store.undo();
});
$('redo').addEventListener('click', () => {
  setActive(null);
  store.redo();
});
$('fit').addEventListener('click', () => {
  fitView();
  render();
});
function renameSketch() {
  const cur = store.get().name || '';
  const n = window.prompt('Name this sketch (customer or job):', cur);
  if (n === null) return false;
  store.mutate(
    (s) => {
      s.name = n.trim().slice(0, 80);
    },
    { snapshot: false },
  );
  return true;
}

// Hands a file to the user: the share sheet on a tablet (it offers "Save to Files"), a normal
// download elsewhere.
async function deliver(blob, name, mime, title) {
  const file = new File([blob], name, { type: mime });
  if (window.matchMedia('(pointer: coarse)').matches && navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title });
      return toast('Saved.');
    } catch (err) {
      if (err && err.name === 'AbortError') return;
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  toast(`Saved ${name}`);
}

async function saveSketch() {
  if (!store.get().name && !renameSketch()) return;
  const state = store.get();
  const blob = new Blob([serializeSketch(state)], { type: 'application/json' });
  await deliver(blob, fileNameFor(state), 'application/json', state.name || 'Field sketch');
}

// ---------- export (PDF / image) ----------

function pageCss() {
  let css = '';
  for (const sheet of document.styleSheets) {
    try {
      for (const rule of sheet.cssRules) css += `${rule.cssText}\n`;
    } catch {
      // Cross-origin sheets can't be read; there are none here.
    }
  }
  return css;
}

// Draws one tab's picture (walls and openings, lowers, or uppers) at a given size, as an image.
async function planImage(tab, w, h, { jpeg = true, scale = 3 } = {}) {
  const state = store.get();
  const derived = deriveRoom(state.room);
  if (!derived) return null;
  const layouts = computeLayouts(state, derived);
  const v = computeFit(state, derived, w, h);
  const pui = { tab, active: null, selectedRun: null, selectedMarker: null, pending: null, print: true };
  const inner = renderScene({ state, derived, view: v, ui: pui, layouts });
  const svgText = `<svg xmlns="http://www.w3.org/2000/svg" width="${w * scale}" height="${h * scale}" viewBox="0 0 ${w} ${h}"><style>${pageCss()}</style><rect width="${w}" height="${h}" fill="#ffffff"/>${inner}</svg>`;
  const url = URL.createObjectURL(new Blob([svgText], { type: 'image/svg+xml' }));
  const img = new Image();
  await new Promise((resolve, reject) => {
    img.onload = resolve;
    img.onerror = () => reject(new Error('Could not draw the sketch.'));
    img.src = url;
  });
  const canvas = document.createElement('canvas');
  canvas.width = w * scale;
  canvas.height = h * scale;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  URL.revokeObjectURL(url);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, jpeg ? 'image/jpeg' : 'image/png', 0.92));
  return { blob, w: canvas.width, h: canvas.height, jpeg: new Uint8Array(await blob.arrayBuffer()) };
}

async function exportPdf() {
  const state = store.get();
  const derived = deriveRoom(state.room);
  if (!derived) return toast('Draw the room first.');
  if (!state.name && !renameSketch()) return;
  toast('Making the PDF\u2026');
  try {
    const layouts = computeLayouts(store.get(), derived);
    const report = buildReport(store.get(), derived, layouts);
    const plans = {
      room: await planImage('walls', 380, 462),
      lower: report.lower.runs.length || report.appliances.length ? await planImage('lowers', 380, 462) : null,
      upper: report.upper.runs.length ? await planImage('uppers', 380, 462) : null,
    };
    const bytes = buildSketchPdf(report, plans);
    const cur = store.get();
    await deliver(new Blob([bytes], { type: 'application/pdf' }), fileNameFor(cur, new Date(), '.pdf'), 'application/pdf', cur.name || 'Field sketch');
  } catch (err) {
    toast(err && err.message ? err.message : 'Could not make the PDF.');
  }
}

async function exportImage() {
  const state = store.get();
  if (!deriveRoom(state.room)) return toast('Draw the room first.');
  if (!state.name && !renameSketch()) return;
  const tab = ui.tab === 'lowers' || ui.tab === 'uppers' ? ui.tab : 'walls';
  try {
    const plan = await planImage(tab, 1000, 720, { jpeg: false, scale: 2 });
    const cur = store.get();
    await deliver(plan.blob, fileNameFor(cur, new Date(), `-${tab}.png`), 'image/png', cur.name || 'Field sketch');
  } catch (err) {
    toast(err && err.message ? err.message : 'Could not make the image.');
  }
}

$('export').addEventListener('click', () => {
  $('sheet').hidden = false;
});
$('sheet').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-export]');
  if (!b && e.target.id !== 'sheet') return;
  $('sheet').hidden = true;
  if (!b) return;
  if (b.dataset.export === 'pdf') await exportPdf();
  else if (b.dataset.export === 'png') await exportImage();
});

$('save').addEventListener('click', saveSketch);
$('jobname').addEventListener('click', () => {
  renameSketch();
});
$('open').addEventListener('click', () => $('file').click());
$('file').addEventListener('change', async (e) => {
  const f = e.target.files && e.target.files[0];
  e.target.value = '';
  if (!f) return;
  const res = parseSketch(await f.text());
  if (res.error) return toast(res.error);
  const cur = store.get();
  if ((cur.room || cur.markers.length) && !window.confirm(`Open "${res.state.name || f.name}" and replace the sketch on screen? You can undo this right after.`)) return;
  store.replace(res.state);
  setActive(null);
  ui.pending = null;
  ui.selectedMarker = null;
  fitView();
  render();
  toast(`Opened ${res.state.name || f.name}`, { label: 'Undo', fn: () => store.undo() });
});

$('new').addEventListener('click', () => {
  const s = store.get();
  if (!s.room && !s.markers.length) return;
  if (!window.confirm('Start a new sketch? You can undo this right after.')) return;
  store.reset();
  setActive(null);
  ui.pending = null;
  ui.selectedMarker = null;
  resetView();
  render();
  toast('New sketch.', { label: 'Undo', fn: () => store.undo() });
});

document.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
    e.preventDefault();
    setActive(null);
    if (e.shiftKey) store.redo();
    else store.undo();
    return;
  }
  if (ui.active) {
    if (/^[0-9]$/.test(e.key)) ui.entry = entryPressDigit(ui.entry, Number(e.key));
    else if (e.key === 'Backspace') ui.entry = entryBackspace(ui.entry);
    else if (e.key === 'Enter') {
      applyEntry();
      advance();
    } else if (e.key === 'Escape') setActive(null);
    else return;
    e.preventDefault();
    render();
    return;
  }
  if ((e.key === 'Delete' || e.key === 'Backspace') && ui.selectedMarker != null) {
    const id = ui.selectedMarker;
    store.mutate((s) => {
      s.markers = s.markers.filter((m) => m.id !== id);
    });
    ui.selectedMarker = null;
    render();
  }
});

// ---------- start ----------

let resizeTimer = 0;
function onResize() {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    if (store.get().room && !ui.userMoved) fitView();
    else if (!store.get().room) resetView();
    render();
  }, 60);
}
window.addEventListener('resize', onResize);
if ('ResizeObserver' in window) new ResizeObserver(onResize).observe(wrapEl);

resetView();
if (store.get().room) fitView();
render();

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

window.__fieldsketch = { store, ui, view, fitView, render };
