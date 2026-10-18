// Lays out the printed sketch: the drawing on the left, the dimension lists down the right, as a
// letter-size landscape PDF. Door and window sizes and positions come first because they matter most.
import { PdfDoc, textWidth, wrapText } from './pdf.js';

const INK = [31, 41, 51];
const MUTED = [110, 120, 135];
const WARN = [194, 87, 12];
const CARD = [243, 245, 248];
const RULE = [200, 206, 214];

const PAGE_W = 792;
const PAGE_H = 612;
const MARGIN = 36;
const TOP = 66;
const BOTTOM = PAGE_H - 40;

class Flow {
  constructor(doc, report, title, firstPage, firstCols) {
    this.doc = doc;
    this.report = report;
    this.title = title;
    this.page = firstPage;
    this.cols = firstCols;
    this.col = 0;
    this.y = TOP;
  }

  get x() {
    return this.cols[this.col].x;
  }

  get w() {
    return this.cols[this.col].w;
  }

  ensure(h) {
    if (this.y + h <= BOTTOM) return;
    if (this.col + 1 < this.cols.length) {
      this.col += 1;
      this.y = TOP;
      return;
    }
    this.page = newPage(this.doc, this.report, `${this.title} (continued)`);
    this.cols = [
      { x: MARGIN, w: 350 },
      { x: MARGIN + 370, w: 350 },
    ];
    this.col = 0;
    this.y = TOP;
  }

  section(text) {
    this.ensure(30);
    this.y += 6;
    this.page.text(this.x, this.y + 8, text.toUpperCase(), { size: 8.5, bold: true, color: MUTED });
    this.page.line(this.x, this.y + 12, this.x + this.w, this.y + 12, { width: 0.6, color: RULE });
    this.y += 20;
  }

  paragraph(str, { size = 9, bold = false, color = INK, gap = 2 } = {}) {
    const lines = wrapText(str, this.w, size, bold);
    this.ensure(lines.length * (size + 2) + gap);
    lines.forEach((ln, i) => this.page.text(this.x, this.y + size + i * (size + 2), ln, { size, bold, color }));
    this.y += lines.length * (size + 2) + gap;
  }

  // A door or window: its name, then one labelled line per measurement.
  card(entry) {
    const labelW = 96;
    const rows = entry.lines.map((l) => ({ ...l, wrapped: wrapText(l.v, this.w - labelW - 14, 9) }));
    const h = 20 + rows.reduce((t, r) => t + r.wrapped.length * 11 + 1, 0) + 6;
    this.ensure(h + 6);
    this.page.rect(this.x, this.y, this.w, h, { fill: CARD });
    this.page.text(this.x + 7, this.y + 14, entry.name, { size: 11, bold: true });
    this.page.text(this.x + this.w - 7 - textWidth(entry.wall, 9.5, true), this.y + 14, entry.wall, { size: 9.5, bold: true, color: MUTED });
    let yy = this.y + 20;
    for (const r of rows) {
      this.page.text(this.x + 7, yy + 9, r.k, { size: 9, color: MUTED });
      r.wrapped.forEach((ln, i) =>
        this.page.text(this.x + 7 + labelW, yy + 9 + i * 11, ln, { size: 9, bold: true, color: r.v.startsWith('?') ? WARN : INK }),
      );
      yy += r.wrapped.length * 11 + 1;
    }
    this.y += h + 6;
  }

  pairs(items) {
    // Two columns of "W1  156"" style entries; the label column is as wide as its longest label.
    const colW = this.w / 2;
    const rowsN = Math.ceil(items.length / 2);
    this.ensure(rowsN * 12 + 4);
    const keyW = [0, 1].map((c) => Math.max(0, ...items.filter((_, i) => i % 2 === c).map((it) => textWidth(it.k, 9, true))) + 8);
    items.forEach((it, i) => {
      const col = i % 2;
      const cx = this.x + col * colW;
      const cy = this.y + Math.floor(i / 2) * 12;
      this.page.text(cx, cy + 9, it.k, { size: 9, bold: true });
      this.page.text(cx + keyW[col], cy + 9, it.v, { size: 9, color: it.warn ? WARN : INK });
    });
    this.y += rowsN * 12 + 4;
  }

  gap(h = 4) {
    this.y += h;
  }
}

function newPage(doc, report, subtitle) {
  const p = doc.addPage(PAGE_W, PAGE_H);
  p.text(MARGIN, 40, report.title, { size: 18, bold: true });
  p.text(MARGIN, 54, subtitle, { size: 9, color: MUTED });
  const date = report.date;
  p.text(PAGE_W - MARGIN - textWidth(date, 9), 40, date, { size: 9, color: MUTED });
  p.text(PAGE_W - MARGIN - textWidth('Field Sketch', 9), 54, 'Field Sketch', { size: 9, color: MUTED });
  p.line(MARGIN, 60, PAGE_W - MARGIN, 60, { width: 0.8 });
  return p;
}

function placePlan(doc, page, plan, box) {
  page.rect(box.x, box.y, box.w, box.h, { stroke: RULE, width: 0.6 });
  if (!plan) return;
  const img = doc.addImage(plan.jpeg, plan.w, plan.h);
  const k = Math.min(box.w / plan.w, box.h / plan.h);
  const w = plan.w * k;
  const h = plan.h * k;
  page.image(img, box.x + (box.w - w) / 2, box.y + (box.h - h) / 2, w, h);
}

const PLAN_BOX = { x: MARGIN, y: TOP + 4, w: 412, h: BOTTOM - TOP - 4 };
const SIDE = { x: PLAN_BOX.x + PLAN_BOX.w + 18, w: PAGE_W - MARGIN - (PLAN_BOX.x + PLAN_BOX.w + 18) };

function runsSection(flow, layer, label) {
  if (layer.notes.length) {
    flow.section('Heads-up');
    for (const n of layer.notes) flow.paragraph(`! ${n}`, { size: 8.5, color: WARN, gap: 1 });
  }
  if (layer.runs.length) {
    flow.section(`${label} runs`);
    for (const r of layer.runs) {
      flow.paragraph(`${r.title}  -  ${r.where}  -  ${r.length}`, { size: 9.5, bold: true, gap: 1 });
      flow.paragraph(r.cut.join('   '), { size: 9, gap: 5 });
    }
  }
  if (layer.summary.length) {
    flow.section('Order summary');
    flow.paragraph(layer.summary.map((c) => `${c.label} x${c.count}`).join('    '), { size: 9 });
  }
}

// plans: { room, lower, upper } each { jpeg: Uint8Array, w, h } or null.
export function buildSketchPdf(report, plans) {
  const doc = new PdfDoc({ title: `${report.title} - Field Sketch` });

  // Page 1: the room, with every door and window spelled out.
  const p1 = newPage(doc, report, 'Room, doors and windows');
  placePlan(doc, p1, plans.room, PLAN_BOX);
  const f1 = new Flow(doc, report, 'Room, doors and windows', p1, [SIDE]);
  if (report.closure) f1.paragraph(`! ${report.closure}`, { size: 9, bold: true, color: WARN, gap: 4 });
  f1.section(`Doors & windows (${report.openings.length})`);
  if (!report.openings.length) f1.paragraph('None marked.', { color: MUTED });
  for (const o of report.openings) f1.card(o);
  f1.section('Room');
  f1.pairs([{ k: 'Ceiling', v: report.ceiling || '?', warn: !report.ceiling }]);
  f1.section('Walls');
  f1.pairs(report.walls.map((w) => ({ k: w.label, v: `${w.value}${w.open ? ' (open)' : ''}`, warn: !w.measured })));
  if (report.walls.some((w) => !w.measured)) f1.paragraph('~ not measured yet (estimated from the sketch)', { size: 8, color: MUTED });
  if (report.utilities.length) {
    f1.section('Outlets, gas, plumbing, vents, columns');
    for (const u of report.utilities) f1.paragraph(`${u.name}: ${u.where}`, { size: 8.5, gap: 2 });
  }

  if (report.lower.runs.length || report.appliances.length) {
    const p = newPage(doc, report, 'Lower cabinets');
    placePlan(doc, p, plans.lower, PLAN_BOX);
    const f = new Flow(doc, report, 'Lower cabinets', p, [SIDE]);
    if (report.appliances.length) {
      f.section('Appliances');
      for (const a of report.appliances) f.paragraph(`${a.name}: ${a.where}`, { size: 8.5, gap: 2 });
    }
    runsSection(f, report.lower, 'Lower');
  }

  if (report.upper.runs.length) {
    const p = newPage(doc, report, 'Upper cabinets');
    placePlan(doc, p, plans.upper, PLAN_BOX);
    const f = new Flow(doc, report, 'Upper cabinets', p, [SIDE]);
    f.section('Settings');
    f.pairs([
      { k: 'Height', v: report.upperSettings.height || '?', warn: !report.upperSettings.height },
      { k: 'Crown', v: report.upperSettings.crown },
      { k: 'Light rail', v: report.upperSettings.rail },
    ]);
    runsSection(f, report.upper, 'Upper');
  }

  doc.pages.forEach((pg, i) => {
    const label = `Page ${i + 1} of ${doc.pages.length}`;
    pg.text(PAGE_W - MARGIN - textWidth(label, 8), PAGE_H - 22, label, { size: 8, color: MUTED });
    pg.text(MARGIN, PAGE_H - 22, 'Rough layout from a field sketch. Check all sizes before ordering.', { size: 8, color: MUTED });
  });
  return doc.build();
}
