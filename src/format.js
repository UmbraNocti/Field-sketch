// Inch formatting and keypad entry helpers. All measurements are inches, rounded to 1/8".

const FRACTIONS = { 1: '1/8', 2: '1/4', 3: '3/8', 4: '1/2', 5: '5/8', 6: '3/4', 7: '7/8' };

export const FRACTION_LABELS = FRACTIONS;

export function roundEighth(v) {
  return Math.round(v * 8) / 8;
}

export function formatInches(v, { quote = true } = {}) {
  if (v == null || !Number.isFinite(v)) return '—';
  const r = roundEighth(v);
  let whole = Math.floor(r + 1e-9);
  let eighths = Math.round((r - whole) * 8);
  if (eighths === 8) {
    whole += 1;
    eighths = 0;
  }
  let s;
  if (eighths === 0) s = String(whole);
  else if (whole === 0) s = FRACTIONS[eighths];
  else s = `${whole} ${FRACTIONS[eighths]}`;
  return quote ? `${s}"` : s;
}

// Keypad entry: whole inches typed as digits, plus one optional fraction in eighths.
export function emptyEntry() {
  return { whole: '', frac: 0, fresh: true, cleared: false };
}

export function entryHasInput(e) {
  return e.whole !== '' || e.frac !== 0;
}

export function entryToInches(e) {
  const w = e.whole === '' ? 0 : parseInt(e.whole, 10);
  return w + e.frac / 8;
}

export function entryPressDigit(e, d) {
  const base = e.fresh ? emptyEntry() : e;
  const whole = base.whole === '0' ? String(d) : base.whole + String(d);
  if (whole.length > 4) return { ...base, fresh: false };
  return { whole, frac: base.frac, fresh: false, cleared: false };
}

export function entryPressFraction(e, eighths) {
  const base = e.fresh ? emptyEntry() : e;
  return { whole: base.whole, frac: base.frac === eighths ? 0 : eighths, fresh: false, cleared: false };
}

export function entryBackspace(e) {
  const base = e.fresh ? emptyEntry() : e;
  if (base.frac !== 0) return { ...base, frac: 0, fresh: false };
  return { whole: base.whole.slice(0, -1), frac: 0, fresh: false, cleared: false };
}

export function entryClear() {
  return { whole: '', frac: 0, fresh: false, cleared: true };
}

export function formatEntry(e) {
  const whole = e.whole === '' ? (e.frac ? '' : '0') : e.whole;
  const frac = e.frac ? FRACTIONS[e.frac] : '';
  return [whole, frac].filter(Boolean).join(' ') + '"';
}
