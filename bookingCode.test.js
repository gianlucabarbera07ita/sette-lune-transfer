const test = require('node:test');
const assert = require('node:assert/strict');
const { generateBookingCode } = require('../src/services/bookingCode');

test('generateBookingCode produce un codice nel formato atteso', () => {
  const code = generateBookingCode();
  assert.match(code, /^SL-[A-Z0-9]{6}$/);
});

test('generateBookingCode non genera mai caratteri ambigui (0, O, 1, I)', () => {
  for (let i = 0; i < 500; i++) {
    const code = generateBookingCode();
    assert.doesNotMatch(code, /[0O1I]/);
  }
});

test('generateBookingCode produce codici diversi tra loro', () => {
  const codes = new Set();
  for (let i = 0; i < 200; i++) codes.add(generateBookingCode());
  // Su 200 generazioni da uno spazio di ~32^6 possibilità, non ci devono
  // essere collisioni: se ce ne fossero, indicherebbe un bug nel PRNG.
  assert.equal(codes.size, 200);
});
