const express = require('express');
const router = express.Router();

const prisma = require('../db');
const { getEventsWithAvailability, getEventById } = require('../services/availability');
const { computeItemPriceCents } = require('../services/pricing');
const { getCartRaw, setCartRaw } = require('../services/cart');

const VALID_TYPES = ['SOLO_ANDATA', 'SOLO_RITORNO', 'ANDATA_RITORNO'];
const MAX_PEOPLE_PER_ITEM = 16;

router.get('/', async (req, res, next) => {
  try {
    const events = await getEventsWithAvailability();
    const cartCount = getCartRaw(req).length;
    res.render('index', { events, justAdded: req.query.added === '1', cartCount });
  } catch (err) {
    next(err);
  }
});

// Aggiunge una riga al carrello (cookie firmato). Valida sempre contro il
// database: non ci si fida di nessun dato mandato dal form oltre agli id.
router.post('/cart/add', async (req, res, next) => {
  try {
    const eventId = parseInt(req.body.eventId, 10);
    const type = req.body.type;
    const numPeople = parseInt(req.body.numPeople, 10);
    const andataSlotId = req.body.andataSlotId ? parseInt(req.body.andataSlotId, 10) : null;
    const ritornoSlotId = req.body.ritornoSlotId ? parseInt(req.body.ritornoSlotId, 10) : null;

    if (!VALID_TYPES.includes(type)) {
      return res.status(400).send('Tipo di transfer non valido');
    }
    if (!Number.isInteger(numPeople) || numPeople < 1 || numPeople > MAX_PEOPLE_PER_ITEM) {
      return res.status(400).send('Numero di persone non valido');
    }

    const event = await getEventById(eventId);
    if (!event) return res.status(404).send('Evento non trovato');

    if ((type === 'SOLO_ANDATA' || type === 'ANDATA_RITORNO')) {
      const slot = event.andataSlots.find((s) => s.id === andataSlotId);
      if (!slot) return res.status(400).send('Orario andata non valido per questo evento');
    }
    if ((type === 'SOLO_RITORNO' || type === 'ANDATA_RITORNO')) {
      const slot = event.ritornoSlots.find((s) => s.id === ritornoSlotId);
      if (!slot) return res.status(400).send('Orario ritorno non valido per questo evento');
    }

    const cart = getCartRaw(req);
    cart.push({
      eventId,
      type,
      numPeople,
      andataSlotId: type === 'SOLO_RITORNO' ? null : andataSlotId,
      ritornoSlotId: type === 'SOLO_ANDATA' ? null : ritornoSlotId,
    });
    setCartRaw(res, cart);

    // Resta sulla pagina dei transfer (invece di saltare al carrello):
    // l'utente può continuare a scegliere altre corse per altri giorni e
    // andare al carrello solo quando è pronto a pagare.
    res.redirect(`/${req.lang}/?added=1`);
  } catch (err) {
    next(err);
  }
});

router.post('/cart/remove/:index', (req, res) => {
  const idx = parseInt(req.params.index, 10);
  const cart = getCartRaw(req);
  if (Number.isInteger(idx) && idx >= 0 && idx < cart.length) {
    cart.splice(idx, 1);
  }
  setCartRaw(res, cart);
  res.redirect(`/${req.lang}/carrello`);
});

// Ricalcola sempre dal database: prezzo corrente e disponibilità corrente
// per ogni riga del carrello, non ci si fida mai di ciò che è nel cookie
// oltre agli id scelti dall'utente.
async function enrichCart(rawCart) {
  const enriched = [];
  let hasIssue = false;

  for (const raw of rawCart) {
    const event = await getEventById(raw.eventId);
    if (!event) {
      hasIssue = true;
      continue;
    }
    const rule = event.priceRules.find((r) => r.type === raw.type);
    if (!rule) {
      hasIssue = true;
      continue;
    }

    const andataSlot = raw.andataSlotId ? event.andataSlots.find((s) => s.id === raw.andataSlotId) : null;
    const ritornoSlot = raw.ritornoSlotId ? event.ritornoSlots.find((s) => s.id === raw.ritornoSlotId) : null;

    const seatsAvailable = Math.min(
      andataSlot ? andataSlot.seatsAvailable : Infinity,
      ritornoSlot ? ritornoSlot.seatsAvailable : Infinity
    );
    const insufficient = seatsAvailable < raw.numPeople;
    if (insufficient) hasIssue = true;

    enriched.push({
      ...raw,
      event,
      andataSlot,
      ritornoSlot,
      priceEuroCents: computeItemPriceCents(event.priceRules, raw.type, raw.numPeople),
      seatsAvailable,
      insufficient,
    });
  }

  return { enriched, hasIssue };
}

router.get('/carrello', async (req, res, next) => {
  try {
    const rawCart = getCartRaw(req);
    const { enriched, hasIssue } = await enrichCart(rawCart);
    const total = enriched.reduce((sum, i) => sum + i.priceEuroCents, 0);
    res.render('cart', {
      items: enriched,
      total,
      hasIssue,
      paymentCancelled: req.query.payment === 'cancelled',
      errorType: req.query.error || null,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = { router, enrichCart };
