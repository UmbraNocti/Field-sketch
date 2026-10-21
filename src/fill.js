// The auto-fill: lay standard boxes along one stretch of wall, around the appliance markers that
// sit on it. Pure math, no drawing. Everything is worked out in 1/8" units so measurements that
// don't land on 3" steps still come out exact.
//
// Priority order (from the design notes), strongest first:
//   1. hard constraints   (markers touched, widths fixed, dishwasher near sink, gaps fillable)
//   2. centering          (the sink box on its window)
//   3. clean widths       (as little filler as possible)
//   4. fewest boxes
//   5. drift              (tie-break: stay near where the markers were dropped)
// Symmetry is applied inside each stretch of plain boxes, which are arranged as mirror images
// whenever the sizes allow it.

const U = 8;
const toU = (x) => Math.round(x * U);
const toIn = (u) => u / U;

// ---- how to cover a gap of g units with standard boxes plus a small filler ----

function reach(sizesU, maxU) {
  const boxes = new Int32Array(maxU + 1).fill(-1);
  boxes[0] = 0;
  for (let x = 1; x <= maxU; x++) {
    let best = -1;
    for (const s of sizesU) {
      if (x >= s && boxes[x - s] >= 0) {
        const c = boxes[x - s] + 1;
        if (best < 0 || c < best) best = c;
      }
    }
    boxes[x] = best;
  }
  const top = new Int32Array(maxU + 1);
  let last = 0;
  for (let x = 0; x <= maxU; x++) {
    if (boxes[x] >= 0) last = x;
    top[x] = last;
  }
  return { boxes, top };
}

export function makeGapTable(sizes, maxIn, maxFillerIn, preferredMaxIn) {
  const maxU = toU(maxIn) + 1;
  const all = sizes.map(toU);
  const small = all.filter((s) => s <= toU(preferredMaxIn));
  const t1 = reach(small.length ? small : all, maxU);
  const t2 = reach(all, maxU);
  const maxFillerU = toU(maxFillerIn);
  const sum = new Int32Array(maxU + 1);
  const filler = new Int32Array(maxU + 1);
  const count = new Int32Array(maxU + 1);
  const viol = new Uint8Array(maxU + 1);
  const wide = new Uint8Array(maxU + 1);
  for (let g = 0; g <= maxU; g++) {
    const r1 = g - t1.top[g];
    const r2 = g - t2.top[g];
    // Only reach for the widest boxes when that actually removes slack.
    const useWide = r2 < r1;
    const t = useWide ? t2 : t1;
    sum[g] = t.top[g];
    filler[g] = g - t.top[g];
    count[g] = t.boxes[t.top[g]];
    viol[g] = filler[g] > maxFillerU ? 1 : 0;
    wide[g] = useWide ? 1 : 0;
  }
  return { sum, filler, count, viol, wide, sizesAll: all, sizesSmall: small.length ? small : all, maxU };
}

// All ways to split b units into exactly `count` boxes; pick the most mirror-friendly, most even.
const partitionMemo = new Map();
function partitionFor(b, count, sizesU) {
  if (b === 0 || count === 0) return [];
  const key = `${b}|${count}|${sizesU.join(',')}`;
  if (partitionMemo.has(key)) return partitionMemo.get(key).slice();
  const sorted = sizesU.slice().sort((x, y) => y - x);
  const minS = sorted[sorted.length - 1];
  const maxS = sorted[0];
  let best = null;
  let nodes = 0;
  const cur = [];
  const score = (parts) => {
    const counts = new Map();
    for (const p of parts) counts.set(p, (counts.get(p) || 0) + 1);
    let odd = 0;
    for (const c of counts.values()) if (c % 2) odd++;
    return [odd > 1 ? 1 : 0, Math.max(...parts) - Math.min(...parts)];
  };
  const dfs = (rem, left, idx) => {
    if (++nodes > 40000) return;
    if (left === 0) {
      if (rem === 0) {
        const sc = score(cur);
        if (!best || sc[0] < best.sc[0] || (sc[0] === best.sc[0] && sc[1] < best.sc[1])) best = { parts: cur.slice(), sc };
      }
      return;
    }
    if (rem < left * minS || rem > left * maxS) return;
    for (let i = idx; i < sorted.length; i++) {
      cur.push(sorted[i]);
      dfs(rem - sorted[i], left - 1, i);
      cur.pop();
      if (best && best.sc[0] === 0 && best.sc[1] === 0) return;
    }
  };
  dfs(b, count, 0);
  let parts = best ? best.parts : null;
  if (!parts) {
    // Fallback: spread evenly, then let the last box soak up the difference.
    parts = [];
    let rem = b;
    for (let i = 0; i < count; i++) {
      const target = rem / (count - i);
      const pick = sorted.reduce((a, s) => (Math.abs(s - target) < Math.abs(a - target) ? s : a), sorted[0]);
      parts.push(pick);
      rem -= pick;
    }
  }
  partitionMemo.set(key, parts.slice());
  return parts;
}

// Mirror-image order when the sizes allow it, otherwise biggest first.
function arrange(parts) {
  const counts = new Map();
  for (const p of parts) counts.set(p, (counts.get(p) || 0) + 1);
  const sizes = [...counts.keys()].sort((a, b) => a - b);
  const odd = sizes.filter((s) => counts.get(s) % 2);
  if (odd.length > 1) return parts.slice().sort((a, b) => b - a);
  const left = [];
  for (const s of sizes) for (let i = 0; i < Math.floor(counts.get(s) / 2); i++) left.push(s);
  const mid = odd.length ? [odd[0]] : [];
  return [...left, ...mid, ...left.slice().reverse()];
}

// ---- candidate positions for each appliance ----

function fixedCands(item, M, relaxed, freeShift) {
  const w = toU(item.width);
  const c = toU(item.center);
  const pts = item.points.map(toU);
  const out = [];
  if (item.fixedAt != null) {
    const s0 = toU(item.fixedAt);
    const s = Math.max(0, Math.min(M - w, s0));
    if (M < w) return [];
    out.push({ s, w, center: 0, drift: 0, viol: s === s0 ? 0 : 1 });
    return out;
  }
  let lo;
  let hi;
  if (item.touched) {
    lo = Math.max(...pts) - w;
    hi = Math.min(...pts);
  } else {
    lo = Math.round(c - w / 2 - w * freeShift);
    hi = Math.round(c - w / 2 + w * freeShift);
  }
  lo = Math.max(lo, 0);
  hi = Math.min(hi, M - w);
  if (relaxed) {
    lo = 0;
    hi = M - w;
  }
  for (let s = lo; s <= hi; s++) {
    const contains = pts.every((p) => p >= s && p <= s + w);
    out.push({ s, w, center: 0, drift: Math.abs(s + w / 2 - c), viol: relaxed && !contains ? 1 : 0 });
  }
  return out;
}

function flexCands(item, M, relaxed, sizesU, maxU) {
  const minW = toU(item.width);
  const c = toU(item.center);
  const target = toU(item.target != null ? item.target : item.center);
  const pts = item.points.map(toU);
  let widths = sizesU.filter((s) => s >= minW && s <= Math.max(maxU, minW));
  if (!widths.length) widths = sizesU.filter((s) => s >= minW);
  if (!widths.length) widths = [Math.ceil(minW / 24) * 24];
  const out = [];
  for (const sz of widths) {
    let lo = Math.max(...pts) - sz;
    let hi = Math.min(...pts);
    lo = Math.max(lo, 0);
    hi = Math.min(hi, M - sz);
    if (relaxed) {
      lo = 0;
      hi = M - sz;
    }
    for (let s = lo; s <= hi; s++) {
      const center = s + sz / 2;
      const contains = pts.every((p) => p >= s && p <= s + sz);
      out.push({ s, w: sz, center: Math.abs(center - target), drift: Math.abs(center - c) + 2 * (sz - minW), viol: relaxed && !contains ? 1 : 0 });
    }
  }
  return out;
}

function thin(cands, limit) {
  if (cands.length <= limit) return cands;
  const step = Math.ceil(cands.length / limit);
  return cands.filter((_, i) => i % step === 0);
}

// ---- the search ----

// A gap next to an item that needs an end-panel filler: reserve `need` units of filler first (only
// when there is a gap at all), and tile what's left. Returns the table index to use plus the
// reserved filler and a violation if the gap is too small to hold it.
const reserve = (g, need) => (need > 0 && g > 0 ? (g < need ? [0, 0, 1] : [g - need, need, 0]) : [g, 0, 0]);

function solveDP(items, M, tab, dwMaxU) {
  const k = items.length;
  const gapAt = (g) => (g < 0 || g > tab.maxU ? null : g);
  if (k === 0) {
    return { picks: [], viol: tab.viol[M], filler: tab.filler[M], boxes: tab.count[M] };
  }
  const rows = [];
  for (let i = 0; i < k; i++) {
    const cands = items[i].cands;
    const n = cands.length;
    if (!n) return null;
    rows.push({ n, V: new Float64Array(n), C: new Float64Array(n), F: new Float64Array(n), B: new Float64Array(n), D: new Float64Array(n), prev: new Int32Array(n).fill(-1) });
  }
  const better = (v, c, f, b, d, bv, bc, bf, bb, bd) => {
    if (v !== bv) return v < bv;
    if (c !== bc) return c < bc;
    if (f !== bf) return f < bf;
    if (b !== bb) return b < bb;
    return d < bd;
  };
  // First appliance: gap from the start.
  {
    const r = rows[0];
    items[0].cands.forEach((c, j) => {
      const [g, ex, pen] = reserve(c.s, c.need || 0);
      r.V[j] = c.viol + pen + tab.viol[g];
      r.C[j] = c.center;
      r.F[j] = tab.filler[g] + ex;
      r.B[j] = tab.count[g];
      r.D[j] = c.drift;
    });
  }
  for (let i = 1; i < k; i++) {
    const r = rows[i];
    const p = rows[i - 1];
    const pc = items[i - 1].cands;
    const sinkDw =
      (items[i - 1].type === 'sink' && items[i].type === 'dishwasher') || (items[i - 1].type === 'dishwasher' && items[i].type === 'sink');
    items[i].cands.forEach((c, j) => {
      let bv = Infinity;
      let bc = Infinity;
      let bf = Infinity;
      let bb = Infinity;
      let bd = Infinity;
      let bp = -1;
      for (let q = 0; q < p.n; q++) {
        const e = pc[q].s + pc[q].w;
        const g0 = c.s - e;
        if (g0 < 0) continue;
        const [g, ex, pen] = reserve(g0, (c.need || 0) + (pc[q].need || 0));
        const v = p.V[q] + c.viol + pen + tab.viol[g] + (sinkDw && g0 > dwMaxU ? 1 : 0);
        const cc = p.C[q] + c.center;
        const f = p.F[q] + tab.filler[g] + ex;
        const b = p.B[q] + tab.count[g];
        const d = p.D[q] + c.drift;
        if (better(v, cc, f, b, d, bv, bc, bf, bb, bd)) {
          bv = v;
          bc = cc;
          bf = f;
          bb = b;
          bd = d;
          bp = q;
        }
      }
      r.V[j] = bv;
      r.C[j] = bc;
      r.F[j] = bf;
      r.B[j] = bb;
      r.D[j] = bd;
      r.prev[j] = bp;
    });
  }
  const last = rows[k - 1];
  const lc = items[k - 1].cands;
  let best = -1;
  let tv = Infinity;
  let tc = Infinity;
  let tf = Infinity;
  let tb = Infinity;
  let td = Infinity;
  for (let j = 0; j < last.n; j++) {
    if (!Number.isFinite(last.V[j])) continue;
    const g0 = M - (lc[j].s + lc[j].w);
    if (g0 < 0) continue;
    const [g, ex, pen] = reserve(g0, lc[j].need || 0);
    const v = last.V[j] + pen + tab.viol[g];
    const c = last.C[j];
    const f = last.F[j] + tab.filler[g] + ex;
    const b = last.B[j] + tab.count[g];
    const d = last.D[j];
    if (better(v, c, f, b, d, tv, tc, tf, tb, td)) {
      tv = v;
      tc = c;
      tf = f;
      tb = b;
      td = d;
      best = j;
    }
  }
  if (best < 0) return null;
  const picks = new Array(k);
  let j = best;
  for (let i = k - 1; i >= 0; i--) {
    picks[i] = items[i].cands[j];
    j = rows[i].prev[j];
  }
  void gapAt;
  return { picks, viol: tv, filler: tf, boxes: tb };
}

// ---- main entry ----
//
// opts (inches, positions relative to the start of the stretch):
//   len, sizes, maxFiller, preferredMax, dwMax, freeShift
//   startBlind / endBlind : { width }  a corner cabinet locked to that end
//   items : [{ id, type, kind: 'void'|'tall'|'flex', width, center, points, touched, target, fixedAt }]
// Returns { boxes, dropped, viol } where boxes are { u0, u1, kind, ... } in inches.
export function fillSegment(opts) {
  const { len, sizes, maxFiller = 3, preferredMax = 36, flexMax = 36, dwMax = 36, freeShift = 1, startBlind = null, endBlind = null, startFiller = 0, endFiller = 0 } = opts;
  const N = toU(len);
  const boxes = [];
  let loU = 0;
  let hiU = N;
  // A blind corner sits `offset` in from the corner (centered on the other run's face), with a
  // filler strip closing the space to the wall.
  if (startBlind) {
    const off = toU(startBlind.offset || 0);
    loU = Math.min(N, off + toU(startBlind.width));
    if (off > 0) boxes.push({ u0: 0, u1: toIn(off), kind: 'filler', cornerFiller: true });
    boxes.push({ u0: toIn(off), u1: toIn(loU), kind: 'corner', side: 'start', ...(startBlind.extra || {}) });
  }
  if (endBlind) {
    const off = toU(endBlind.offset || 0);
    hiU = Math.max(loU, N - off - toU(endBlind.width));
    boxes.push({ u0: toIn(hiU), u1: toIn(N - off), kind: 'corner', side: 'end', ...(endBlind.extra || {}) });
    if (off > 0) boxes.push({ u0: toIn(N - off), u1: len, kind: 'filler', cornerFiller: true });
  }
  // A run that ends at a wall keeps a small filler there.
  if (startFiller > 0 && !startBlind) {
    const f = Math.min(toU(startFiller), hiU - loU);
    boxes.push({ u0: toIn(loU), u1: toIn(loU + f), kind: 'filler', wallFiller: true });
    loU += f;
  }
  if (endFiller > 0 && !endBlind) {
    const f = Math.min(toU(endFiller), hiU - loU);
    boxes.push({ u0: toIn(hiU - f), u1: toIn(hiU), kind: 'filler', wallFiller: true });
    hiU -= f;
  }
  const M = hiU - loU;
  const tab = makeGapTable(sizes, Math.max(len, 1), maxFiller, preferredMax);
  const sizesU = sizes.map(toU);

  const shifted = (opts.items || [])
    .map((it) => ({
      ...it,
      center: it.center - toIn(loU),
      points: it.points.map((p) => p - toIn(loU)),
      target: it.target != null ? it.target - toIn(loU) : null,
      fixedAt: it.fixedAt != null ? it.fixedAt - toIn(loU) : null,
    }))
    .sort((a, b) => a.center - b.center);

  const dropped = [];
  let working = shifted.slice();
  let solved = null;
  let used = null;

  const attempt = (list, relaxed, limited) => {
    const items = list.map((it) => {
      const cands = it.kind === 'flex' ? flexCands(it, M, relaxed, sizesU, limited ? toU(flexMax) : Infinity) : fixedCands(it, M, relaxed, freeShift);
      const need = toU(it.panelFiller || 0);
      return { ...it, cands: thin(cands, 2500).map((c) => (need ? { ...c, need } : c)) };
    });
    return { items, res: solveDP(items, M, tab, toU(dwMax)) };
  };

  for (;;) {
    for (const relaxed of [false, true]) {
      // Keep sink/cooktop boxes to a sensible size, unless only a bigger box makes the stretch work.
      const a = attempt(working, relaxed, true);
      const b = attempt(working, relaxed, false);
      const pick = a.res && b.res ? (b.res.viol < a.res.viol ? b : a) : a.res ? a : b.res ? b : null;
      if (pick) {
        solved = pick.res;
        used = pick.items;
        break;
      }
    }
    if (solved || !working.length) break;
    // Nothing fits: drop the widest appliance and try again.
    let wi = 0;
    working.forEach((it, i) => {
      if (it.width > working[wi].width) wi = i;
    });
    dropped.push(working[wi].id);
    working = working.filter((_, i) => i !== wi);
  }
  if (!solved) {
    // Not even an empty stretch (can't happen with filler) - leave it all as one gap.
    solved = { picks: [], viol: 1, filler: M, boxes: 0 };
    used = [];
  }

  const pushGap = (a0, b0, where, needL = 0, needR = 0) => {
    if (b0 - a0 <= 0) return;
    // Filler reserved beside a fridge goes right against its panel.
    let a = a0;
    let b = b0;
    if (needL + needR > b0 - a0) {
      needL = 0;
      needR = 0;
    }
    if (needL > 0) {
      boxes.push({ u0: toIn(loU + a), u1: toIn(loU + a + needL), kind: 'filler', panelFiller: true });
      a += needL;
    }
    if (needR > 0) {
      boxes.push({ u0: toIn(loU + b - needR), u1: toIn(loU + b), kind: 'filler', panelFiller: true });
      b -= needR;
    }
    const g = b - a;
    if (g <= 0) return;
    const gi = Math.min(g, tab.maxU);
    const sum = tab.sum[gi];
    const r = g - sum;
    const sz = tab.wide[gi] ? tab.sizesAll : tab.sizesSmall;
    const parts = arrange(partitionFor(sum, tab.count[gi], sz));
    const out = [];
    let x = a;
    const addFiller = () => {
      if (r > 0) {
        out.push({ u0: toIn(loU + x), u1: toIn(loU + x + r), kind: r > toU(maxFiller) ? 'gap' : 'filler' });
        x += r;
      }
    };
    if (where === 'start') addFiller();
    for (const p of parts) {
      out.push({ u0: toIn(loU + x), u1: toIn(loU + x + p), kind: 'base' });
      x += p;
    }
    if (where !== 'start') addFiller();
    boxes.push(...out);
  };

  let cursor = 0;
  used.forEach((it, i) => {
    const c = solved.picks[i];
    pushGap(cursor, c.s, i === 0 ? 'start' : 'mid', i > 0 ? solved.picks[i - 1].need || 0 : 0, c.need || 0);
    boxes.push({
      u0: toIn(loU + c.s),
      u1: toIn(loU + c.s + c.w),
      kind: it.kind === 'flex' ? 'flex' : it.kind,
      type: it.type,
      id: it.id,
    });
    cursor = c.s + c.w;
  });
  pushGap(cursor, M, used.length ? 'end' : 'start', used.length ? solved.picks[used.length - 1].need || 0 : 0, 0);

  boxes.sort((a, b) => a.u0 - b.u0);
  return { boxes, dropped, viol: solved.viol };
}
