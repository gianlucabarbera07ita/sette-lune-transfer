const test = require('node:test');
const assert = require('node:assert/strict');
const { computeItemPriceCents, computeCartTotalCents, formatEuro } = require('../src/services/pricing');

test('computeItemPriceCents calcola il prezzo corretto per persona', () => {
  const rules = [
    { type: 'SOLO_ANDATA', priceEuroCents: 2000 },
    { type: 'ANDATA_RITORNO', priceEuroCents: 3000 },
  ];
  assert.equal(computeItemPriceCents(rules, 'SOLO_ANDATA', 3), 6000);
  assert.equal(computeItemPriceCents(rules, 'ANDATA_RITORNO', 2), 6000);
});

test('computeItemPriceCents lancia errore per tipo senza regola prezzo', () => {
  assert.throws(() => computeItemPriceCents([], 'SOLO_ANDATA', 1));
});

test('computeItemPriceCents lancia errore per numero persone non valido', () => {
  const rules = [{ type: 'SOLO_ANDATA', priceEuroCents: 2000 }];
  assert.throws(() => computeItemPriceCents(rules, 'SOLO_ANDATA', 0));
  assert.throws(() => computeItemPriceCents(rules, 'SOLO_ANDATA', -1));
  assert.throws(() => computeItemPriceCents(rules, 'SOLO_ANDATA', 1.5));
});

test('computeCartTotalCents somma correttamente più righe', () => {
  const items = [{ priceEuroCents: 2000 }, { priceEuroCents: 3000 }];
  assert.equal(computeCartTotalCents(items), 5000);
});

test('formatEuro formatta correttamente i centesimi in euro', () => {
  assert.equal(formatEuro(2000), '20,00');
  assert.equal(formatEuro(1250), '12,50');
  assert.equal(formatEuro(0), '0,00');
});
