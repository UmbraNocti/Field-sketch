import { createStore, deriveRoom, newRoom, openingFields } from './store.js';
import { strokeToPolygon, openingSpan } from './geometry.js';
import {
  classifyStroke,
  wallFrames,
  hitWall,
  hitOpening,
  findLineCrossing,
  arcToDoor,
  constructionTargets,
} from './recognize.js';
import {
  emptyEntry,
  entryHasInput,
  entryToInches,
  entryPressDigit,
  entryPressFraction,
  entryBackspace,
  entryClear,
} from './format.js';
import { renderScene } from './render.js';
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

const store = createStore(window.localStorage);

const ui = {
  tab: 'walls',
  tool: 'wall',
  markerTool: 'outlet',
  active: null,
  queue: [],
  entry: emptyEntry(),
  selectedMarker: null,
  pending: null,
  userMoved: false,
};
const view = { s: 3, ox: 0, oy: 0 };

const TABS = [
  { id: 'walls', label: 'Walls' },
  { id: 'markings', label: 'Markings' },
  { id: 'lowers', label: 'Lowers', soon: true },
  { id: 'uppers', label: 'Uppers', soon: true },
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
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of d.verts) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  for (const m of state.markers) {
    minX = Math.min(minX, m.x);
    minY = Math.min(minY, m.y);
    maxX = Math.max(maxX, m.x);
    maxY = Math.max(maxY, m.y);
  }
  const pad = Math.max(36, Math.min(95, 0.11 * Math.min(w, h))) + (state.room.openings.length ? 28 : 0);
  const bw = Math.max(maxX - minX, 24);
  const bh = Math.max(maxY - minY, 24);
  view.s = Math.min(10, (w - 2 * pad) / bw, (h - 2 * pad) / bh);
  view.ox = w / 2 - ((minX + maxX) / 2) * view.s;
  view.oy = h / 2 - ((minY + maxY) / 2) * view.s;
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

function render() {
  const state = store.get();
  const derived = deriveRoom(state.room);
  scene.innerHTML = renderScene({ state, derived, view, ui });
  emptyEl.hidden = !!state.room || ui.tab !== 'walls';
  stageEl.classList.toggle('kp-open', !!ui.active);

  const scroller = panelEl.querySelector('.panel-scroll');
  const keep = scroller ? scroller.scrollTop : 0;
  panelEl.innerHTML = panelMarkup(state, derived, ui);
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
    (t) => `<button class="tab${ui.tab === t.id ? ' active' : ''}${t.soon ? ' soon' : ''}" data-tab="${t.id}">${t.label}</button>`,
  ).join('');

  const showTray = ui.tab === 'walls';
  trayEl.hidden = !showTray;
  if (showTray) {
    trayEl.innerHTML = PENCILS.map(
      (p) => `<button class="pencil${ui.tool === p.id ? ' active' : ''}" data-tool="${p.id}">${pencilSvg(p.color)}<span>${p.label}</span></button>`,
    ).join('');
  }

  let hint = '';
  if (ui.tab === 'walls') {
    if (ui.pending) hint = 'Now draw the second line to set the other edge.';
    else if (ui.tool === 'wall' && state.room) hint = 'Drawing a new outline replaces this room. Undo brings it back.';
    else hint = PENCILS.find((p) => p.id === ui.tool).hint;
  } else if (ui.tab === 'markings') {
    hint = ui.markerTool === 'select' ? 'Drag a marker to move it. Tap one to select it.' : 'Tap the sketch to place a marker. Drag a placed one to move it.';
  } else {
    hint = 'Cabinets are the next build. The sketch is read-only here.';
  }
  if (hintEl.textContent !== hint) {
    hintEl.textContent = hint;
    hintEl.classList.remove('fade');
    clearTimeout(hintTimer);
    hintTimer = setTimeout(() => hintEl.classList.add('fade'), 5000);
  }

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
    if (v <= 0) return;
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

function overlaps(room, wall, u0, u1, ignoreId) {
  const f = frames()[wall];
  return room.openings.some((o) => {
    if (o.wall !== wall || o.id === ignoreId) return false;
    const [a, b] = openingSpan(o, f.L);
    return u0 < b && u1 > a;
  });
}

function createOpening(kind, wall, center, width, swing) {
  const f = frames()[wall];
  const w = Math.min(Math.max(12, width), f.L);
  const c = Math.max(w / 2, Math.min(f.L - w / 2, center));
  if (overlaps(store.get().room, wall, c - w / 2, c + w / 2)) return toast('That overlaps another opening.');
  let created = null;
  store.mutate((s) => {
    created = { id: s.nextId++, wall, kind, t: c / f.L, drawW: Math.round(w), ro: null, cc: null, sill: null, h: null, swing: swing || null };
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
  const c = door.t * f.L;
  const span0 = c - door.drawW / 2;
  const span1 = c + door.drawW / 2;
  const existing = state.room.openings.find((o) => {
    if (o.wall !== door.wall || o.kind !== 'door') return false;
    const [u0, u1] = openingSpan(o, f.L);
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
  const op = hitOpening(w, fr, state.room.openings, tolW(16));
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
  for (let i = state.markers.length - 1; i >= 0; i--) {
    const m = state.markers[i];
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

function placeMarker(p) {
  const type = ui.markerTool;
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
    }
    s.markers.push(created);
  });
  ui.selectedMarker = null;
  if (type === 'column') {
    setActive({ kind: 'marker', id: created.id, field: 'w' }, [{ kind: 'marker', id: created.id, field: 'd' }]);
    render();
  }
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
  if (ui.tab === 'lowers' || ui.tab === 'uppers') return;
  if (ui.tab === 'markings') {
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
  if (ui.tab === 'walls') preview.setAttribute('points', stroke.pts.map((q) => `${q.x.toFixed(1)},${q.y.toFixed(1)}`).join(' '));
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
  ui.pending = null;
  setActive(null);
  ui.selectedMarker = null;
  render();
});

trayEl.addEventListener('click', (e) => {
  const b = e.target.closest('[data-tool]');
  if (!b) return;
  ui.tool = b.dataset.tool;
  ui.pending = null;
  render();
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
        s.room.openings = s.room.openings.filter((o) => o.id !== Number(d.id));
      });
      if (ui.active && ui.active.kind === 'opening' && ui.active.id === Number(d.id)) setActive(null);
      render();
      break;
    case 'marker-tool':
      ui.markerTool = d.type;
      ui.selectedMarker = null;
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
