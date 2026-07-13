// Logica di calcolo prezzi. Pure functions, nessuna dipendenza esterna:
// testabile senza npm install (vedi tests/pricing.test.js).

/**
 * Calcola il prezzo totale (in centesimi di euro) per una singola riga di
 * carrello, dato l'elenco delle regole prezzo dell'evento.
 * @param {Array<{type: string, priceEuroCents: number}>} priceRules
 * @param {string} type - 'SOLO_ANDATA' | 'SOLO_RITORNO' | 'ANDATA_RITORNO'
 * @param {number} numPeople
 * @returns {number} prezzo totale in centesimi
 */
function computeItemPriceCents(priceRules, type, numPeople) {
  if (!Number.isInteger(numPeople) || numPeople < 1) {
    throw new Error('Numero di persone non valido');
  }
  const rule = priceRules.find((r) => r.type === type);
  if (!rule) {
    throw new Error(`Nessuna regola di prezzo trovata per il tipo ${type}`);
  }
  return rule.priceEuroCents * numPeople;
}

function computeCartTotalCents(items) {
  return items.reduce((sum, item) => sum + item.priceEuroCents, 0);
}

function formatEuro(cents) {
  return (cents / 100).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

module.exports = { computeItemPriceCents, computeCartTotalCents, formatEuro };
