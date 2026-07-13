const test = require('node:test');
const assert = require('node:assert/strict');
const { formatTime, formatDateLong } = require('../src/services/format');

// Questi test sono fondamentali: verificano che gli orari mostrati agli
// utenti siano sempre quelli di Trapani (Europe/Rome), indipendentemente
// dal fuso orario del server (Render gira di solito in UTC).

test('formatTime mostra l\'orario locale corretto per l\'Italia in agosto (CEST, UTC+2)', () => {
  const d = new Date('2026-08-06T11:30:00+02:00');
  assert.equal(formatTime(d, 'it'), '11:30');
});

test('formatTime gestisce correttamente un orario subito dopo mezzanotte', () => {
  const d = new Date('2026-08-07T00:00:00+02:00');
  assert.equal(formatTime(d, 'it'), '00:00');
});

test('formatTime interpreta correttamente un timestamp UTC equivalente', () => {
  // Le 21:00 UTC del 6 agosto sono le 23:00 locali (Trapani, UTC+2)
  const d = new Date('2026-08-06T21:00:00Z');
  assert.equal(formatTime(d, 'it'), '23:00');
});

test('formatDateLong include il giorno della settimana in italiano', () => {
  const d = new Date('2026-08-06T11:30:00+02:00'); // giovedì 6 agosto 2026
  const formatted = formatDateLong(d, 'it');
  assert.match(formatted.toLowerCase(), /gioved/);
});
