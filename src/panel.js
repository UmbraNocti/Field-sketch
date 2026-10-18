// Side panel markup: dimension list + keypad on the Walls tab, marker toolbox on Markings.
import { formatInches, formatEntry, FRACTION_LABELS } from './format.js';
import { FIELD_LABELS, openingFields, MARKER_TYPES } from './store.js';
import { markerIcon, MARKER_NAMES, openingTitle, refLabel, positionInfo } from './render.js';
import { sameField, getFieldValue, fieldTitle } from './fields.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

function keypad(state, ui) {
  const a = ui.active;
  const existing = getFieldValue(state, a);
  const shown = ui.entry.fresh ? (existing != null ? formatInches(existing) : '—') : formatEntry(ui.entry);
  const digits = [1, 2, 3, 4, 5, 6, 7, 8, 9]
    .map((d) => `<button class="key" data-act="digit" data-d="${d}">${d}</button>`)
    .join('');
  const fracs = Object.entries(FRACTION_LABELS)
    .map(
      ([e, label]) =>
        `<button class="key frac${ui.entry.frac === Number(e) ? ' on' : ''}" data-act="frac" data-e="${e}">${label}</button>`,
    )
    .join('');
  const last = ui.queue.length === 0;
  return `
    <div class="keypad">
      <div class="kp-title">${esc(fieldTitle(state, a))}</div>
      <div class="kp-display${ui.entry.fresh ? ' fresh' : ''}">${esc(shown)}</div>
      <div class="kp-grid">
        ${digits}
        <button class="key" data-act="back" aria-label="Backspace">⌫</button>
        <button class="key" data-act="digit" data-d="0">0</button>
        <button class="key" data-act="clear">C</button>
      </div>
      <div class="kp-frac">${fracs}</div>
      <div class="kp-actions">
        <button class="btn" data-act="skip">${last ? 'Close' : 'Skip'}</button>
        <button class="btn primary" data-act="next">${last ? 'Done' : 'Next ▸'}</button>
      </div>
    </div>`;
}

function valueCell(v, { approx } = {}) {
  if (v == null) return `<span class="val miss">?${approx ? `<small>≈${esc(formatInches(approx, { quote: false }))}</small>` : ''}</span>`;
  return `<span class="val">${esc(formatInches(v))}</span>`;
}

function wallsPanel(state, derived, ui) {
  const room = state.room;
  if (!room) {
    return `<div class="empty"><p><strong>Draw the room outline</strong> with one finger, in a single stroke. Walls snap straight and close on their own.</p><p>Then fill in each wall here.</p></div>`;
  }
  const rows = room.known
    .map((k, i) => {
      const act = sameField(ui.active, { kind: 'wall', i }) ? ' active' : '';
      const cons = room.construction[i] ? '<em class="tag">open</em>' : '';
      return `<button class="row${k == null ? ' missing' : ' done'}${act}" data-act="field" data-kind="wall" data-i="${i}">
        <span class="idx">W${i + 1}</span>${cons}${valueCell(k, { approx: derived.lens[i] })}</button>`;
    })
    .join('');

  const openings = room.openings
    .map((op) => {
      const chips = openingFields(op.kind)
        .map((field) => {
          const v = op[field];
          const act = ui.active && ui.active.kind === 'opening' && ui.active.id === op.id && ui.active.field === field ? ' active' : '';
          const title = field === 'pos' ? `Position \u00b7 ${refLabel(room, op)}` : FIELD_LABELS[field];
          const approx = field === 'pos' && v == null ? `<i>\u2248${esc(formatInches(positionInfo(room, derived, op).gap, { quote: false }))}</i>` : '';
          return `<button class="chip${v == null ? ' missing' : ' done'}${act}" data-act="field" data-kind="opening" data-id="${op.id}" data-field="${field}">
            <small>${esc(title)}</small><b>${v == null ? '?' : esc(formatInches(v))}${approx}</b></button>`;
        })
        .join('');
      return `<div class="opening">
        <div class="opening-head"><span>${esc(openingTitle(room, op))} <small>on W${op.wall + 1}</small></span>
        <button class="icon-btn" data-act="del-opening" data-id="${op.id}" aria-label="Remove">✕</button></div>
        <div class="chips">${chips}</div></div>`;
    })
    .join('');

  const ceilAct = ui.active && ui.active.kind === 'ceiling' ? ' active' : '';
  const status = derived.closed
    ? '<div class="status ok">Closes up</div>'
    : `<div class="status bad">Walls don’t close — off ${esc(formatInches(derived.gapLen))}. Check the measurements.</div>`;

  return `${status}
    <h3>Room</h3>
    <button class="row${state.ceiling == null ? ' missing' : ' done'}${ceilAct}" data-act="field" data-kind="ceiling"><span class="idx wide">Ceiling height</span>${valueCell(state.ceiling)}</button>
    <h3>Walls</h3>${rows}
    ${room.openings.length ? `<h3>Doors &amp; windows</h3>${openings}` : ''}`;
}

function markingsPanel(state, ui) {
  const tools = MARKER_TYPES.map(
    (t) =>
      `<button class="tool${ui.markerTool === t ? ' active' : ''}" data-act="marker-tool" data-type="${t}">${markerIcon(t)}<span>${esc(MARKER_NAMES[t])}</span></button>`,
  ).join('');
  const move = `<button class="tool${ui.markerTool === 'select' ? ' active' : ''}" data-act="marker-tool" data-type="select"><svg viewBox="-16 -16 32 32" width="30" height="30" aria-hidden="true"><path class="mk-line" stroke="currentColor" d="M0-11V11M-11 0H11M0-11l-4 4M0-11l4 4M0 11l-4-4M0 11l4-4M-11 0l4-4M-11 0l4 4M11 0l-4-4M11 0l-4 4"/></svg><span>Move</span></button>`;
  const sel = state.markers.find((m) => m.id === ui.selectedMarker);
  const selCard = sel
    ? `<div class="sel-card"><div><b>${esc(MARKER_NAMES[sel.type])}</b> selected</div>
        <div class="sel-actions">${sel.type === 'column' ? `<button class="btn" data-act="edit-column" data-id="${sel.id}">Size</button>` : ''}
        <button class="btn danger" data-act="del-marker" data-id="${sel.id}">Delete</button></div></div>`
    : '';
  const counts = MARKER_TYPES.map((t) => [t, state.markers.filter((m) => m.type === t).length]).filter(([, n]) => n > 0);
  const summary = counts.length
    ? `<p class="muted">${counts.map(([t, n]) => `${n} ${esc(MARKER_NAMES[t].toLowerCase())}`).join(' · ')}</p>`
    : '<p class="muted">Pick a marker, then tap the sketch to place it. Drag a placed marker to move it.</p>';
  return `<div class="tools">${tools}${move}</div>${selCard}${summary}`;
}

function soonPanel(tab) {
  const name = tab === 'lowers' ? 'Lowers' : 'Uppers';
  return `<div class="empty"><p><strong>${name} are next.</strong></p><p>The room and markings stay visible here. Auto-filled cabinets come in the next build.</p></div>`;
}

export function panelMarkup(state, derived, ui) {
  let body;
  let title;
  if (ui.tab === 'walls') {
    title = 'Dimensions';
    body = wallsPanel(state, derived, ui);
  } else if (ui.tab === 'markings') {
    title = 'Markings';
    body = markingsPanel(state, ui);
  } else {
    title = ui.tab === 'lowers' ? 'Lowers' : 'Uppers';
    body = soonPanel(ui.tab);
  }
  return `<div class="panel-head"><h2>${title}</h2></div>
    <div class="panel-scroll">${body}</div>
    ${ui.active ? keypad(state, ui) : ''}`;
}
