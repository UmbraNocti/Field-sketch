import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatInches,
  emptyEntry,
  entryPressDigit,
  entryPressFraction,
  entryBackspace,
  entryToInches,
  formatEntry,
} from '../src/format.js';

test('formats whole, fractional and mixed inches', () => {
  assert.equal(formatInches(36), '36"');
  assert.equal(formatInches(36.125), '36 1/8"');
  assert.equal(formatInches(0.5), '1/2"');
  assert.equal(formatInches(null), '—');
  assert.equal(formatInches(35.99), '36"');
  assert.equal(formatInches(96.5, { quote: false }), '96 1/2');
});

test('rounds to the nearest eighth', () => {
  assert.equal(formatInches(10.06), '10"');
  assert.equal(formatInches(10.07), '10 1/8"');
});

test('keypad entry builds whole inches and a fraction', () => {
  let e = emptyEntry();
  e = entryPressDigit(e, 3);
  e = entryPressDigit(e, 6);
  e = entryPressFraction(e, 1);
  assert.equal(entryToInches(e), 36.125);
  assert.equal(formatEntry(e), '36 1/8"');
});

test('tapping the same fraction again clears it, backspace removes fraction first', () => {
  let e = entryPressDigit(emptyEntry(), 9);
  e = entryPressFraction(e, 4);
  assert.equal(formatEntry(e), '9 1/2"');
  e = entryPressFraction(e, 4);
  assert.equal(formatEntry(e), '9"');
  e = entryPressFraction(e, 2);
  e = entryBackspace(e);
  assert.equal(formatEntry(e), '9"');
  e = entryBackspace(e);
  assert.equal(formatEntry(e), '0"');
});

test('entry is capped at four digits and ignores leading zeros', () => {
  let e = emptyEntry();
  for (const d of [0, 0, 1, 2, 3, 4, 5]) e = entryPressDigit(e, d);
  assert.equal(e.whole, '1234');
});
