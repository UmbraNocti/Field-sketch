// A very small PDF writer: pages with text (the built-in Helvetica fonts), lines, rectangles and
// JPEG pictures. That is all the printed sketch needs, so there is no library to load or update.

// Helvetica glyph widths (per 1000 em) for ASCII 32 to 126.
const HELV = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556,
  1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556,
  333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584,
];

// Characters outside plain ASCII that Helvetica (WinAnsi) can print, and plain stand-ins for the rest.
const WIN = { '·': 0xb7, '×': 0xd7, '°': 0xb0, '’': 0x92, '‘': 0x91, '—': 0x97, '–': 0x96 };
const PLAIN = { '″': '"', '“': '"', '”': '"', '≈': '~', '→': '->', '•': '*' };

function toWin(str) {
  let out = '';
  for (const ch of String(str)) {
    const code = ch.codePointAt(0);
    if (code >= 32 && code < 127) out += ch;
    else if (WIN[ch]) out += String.fromCharCode(WIN[ch]);
    else if (PLAIN[ch]) out += PLAIN[ch];
    else out += '?';
  }
  return out;
}

export function textWidth(str, size, bold = false) {
  let w = 0;
  for (const ch of toWin(str)) {
    const c = ch.charCodeAt(0);
    w += c >= 32 && c < 127 ? HELV[c - 32] : 556;
  }
  return (w / 1000) * size * (bold ? 1.06 : 1);
}

export function wrapText(str, width, size, bold = false) {
  const words = String(str).split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = '';
  for (const word of words) {
    const next = cur ? `${cur} ${word}` : word;
    if (textWidth(next, size, bold) <= width || !cur) cur = next;
    else {
      lines.push(cur);
      cur = word;
    }
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [''];
}

const esc = (s) => toWin(s).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
const num = (n) => (Math.round(n * 100) / 100).toString();
const rgb = (c) => c.map((v) => num(v / 255)).join(' ');

class Page {
  constructor(doc, w, h) {
    this.doc = doc;
    this.w = w;
    this.h = h;
    this.ops = [];
    this.images = new Set();
  }

  // x, y are points from the top-left; y is the text baseline.
  text(x, y, str, { size = 10, bold = false, color = [0, 0, 0] } = {}) {
    this.ops.push(`BT /${bold ? 'F2' : 'F1'} ${num(size)} Tf ${rgb(color)} rg ${num(x)} ${num(this.h - y)} Td (${esc(str)}) Tj ET`);
  }

  line(x1, y1, x2, y2, { width = 0.75, color = [0, 0, 0], dash = null } = {}) {
    this.ops.push(`q ${num(width)} w ${rgb(color)} RG ${dash ? `[${dash.join(' ')}] 0 d ` : ''}${num(x1)} ${num(this.h - y1)} m ${num(x2)} ${num(this.h - y2)} l S Q`);
  }

  rect(x, y, w, h, { fill = null, stroke = null, width = 0.75 } = {}) {
    const parts = ['q'];
    if (fill) parts.push(`${rgb(fill)} rg`);
    if (stroke) parts.push(`${rgb(stroke)} RG ${num(width)} w`);
    parts.push(`${num(x)} ${num(this.h - y - h)} ${num(w)} ${num(h)} re ${fill && stroke ? 'B' : fill ? 'f' : 'S'} Q`);
    this.ops.push(parts.join(' '));
  }

  image(img, x, y, w, h) {
    this.images.add(img.id);
    this.ops.push(`q ${num(w)} 0 0 ${num(h)} ${num(x)} ${num(this.h - y - h)} cm /Im${img.id} Do Q`);
  }
}

export class PdfDoc {
  constructor({ title = '', author = 'Field Sketch' } = {}) {
    this.title = title;
    this.author = author;
    this.pages = [];
    this.imgs = [];
  }

  addPage(w = 792, h = 612) {
    const p = new Page(this, w, h);
    this.pages.push(p);
    return p;
  }

  // jpeg: Uint8Array of a baseline JPEG, with its pixel size.
  addImage(jpeg, width, height) {
    const img = { id: this.imgs.length + 1, jpeg, width, height };
    this.imgs.push(img);
    return img;
  }

  build() {
    const chunks = [];
    let length = 0;
    const offsets = [];
    const push = (data) => {
      const bytes = typeof data === 'string' ? Uint8Array.from(data, (c) => c.charCodeAt(0) & 0xff) : data;
      chunks.push(bytes);
      length += bytes.length;
    };
    const obj = (id, body) => {
      offsets[id] = length;
      push(`${id} 0 obj\n`);
      push(body);
      push('\nendobj\n');
    };

    // Object numbers: 1 catalog, 2 pages, 3-4 fonts, 5 info, then images, then page + content pairs.
    const imgBase = 6;
    const pageBase = imgBase + this.imgs.length;
    const pageId = (i) => pageBase + i * 2;
    push('%PDF-1.4\n%\xe2\xe3\xcf\xd3\n');
    obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
    obj(2, `<< /Type /Pages /Count ${this.pages.length} /Kids [${this.pages.map((_, i) => `${pageId(i)} 0 R`).join(' ')}] >>`);
    obj(3, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
    obj(4, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
    obj(5, `<< /Title (${esc(this.title)}) /Producer (${esc(this.author)}) >>`);
    this.imgs.forEach((img, i) => {
      const id = imgBase + i;
      offsets[id] = length;
      push(`${id} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${img.width} /Height ${img.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${img.jpeg.length} >>\nstream\n`);
      push(img.jpeg);
      push('\nendstream\nendobj\n');
    });
    this.pages.forEach((p, i) => {
      const id = pageId(i);
      const stream = p.ops.join('\n');
      const xo = [...p.images].map((n) => `/Im${n} ${imgBase + n - 1} 0 R`).join(' ');
      obj(id, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${num(p.w)} ${num(p.h)}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> /XObject << ${xo} >> >> /Contents ${id + 1} 0 R >>`);
      offsets[id + 1] = length;
      const bytes = Uint8Array.from(stream, (c) => c.charCodeAt(0) & 0xff);
      push(`${id + 1} 0 obj\n<< /Length ${bytes.length} >>\nstream\n`);
      push(bytes);
      push('\nendstream\nendobj\n');
    });
    const count = pageBase + this.pages.length * 2;
    const xref = length;
    push(`xref\n0 ${count}\n0000000000 65535 f \n`);
    for (let id = 1; id < count; id++) push(`${String(offsets[id]).padStart(10, '0')} 00000 n \n`);
    push(`trailer\n<< /Size ${count} /Root 1 0 R /Info 5 0 R >>\nstartxref\n${xref}\n%%EOF\n`);

    const out = new Uint8Array(length);
    let at = 0;
    for (const c of chunks) {
      out.set(c, at);
      at += c.length;
    }
    return out;
  }
}
