const express = require('express');
const router = express.Router();

const { constructWebhookEvent } = require('../services/stripeService');
const { verifyWebhookSignature, captureOrder } = require('../services/paypalService');
const { confirmBookingPaid, markBookingFailed } = require('../services/booking');
const { sendCustomerConfirmation, sendInternalNotification } = require('../services/email');

// IMPORTANTE: queste route usano express.raw() per ricevere il body grezzo,
// necessario per verificare la firma crittografica di Stripe. Vanno quindi
// montate PRIMA di qualsiasi express.json()/urlencoded() globale (vedi
// src/app.js), altrimenti il body arriverebbe già parsato e la verifica
// firma fallirebbe sempre.

router.post('/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
  let event;
  try {
    event = constructWebhookEvent(req.body, req.headers['stripe-signature']);
  } catch (err) {
    console.error('Webhook Stripe: firma non valida:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const bookingId = parseInt(session.metadata && session.metadata.bookingId, 10);
      if (Number.isInteger(bookingId)) {
        const { booking, alreadyPaid } = await confirmBookingPaid(bookingId, {
          paymentMethod: 'STRIPE',
          paymentRef: session.id,
        });
        if (!alreadyPaid) {
          sendCustomerConfirmation(booking).catch((e) => console.error('Errore invio email cliente:', e));
          sendInternalNotification(booking).catch((e) => console.error('Errore invio email interna:', e));
        }
      }
    } else if (event.type === 'checkout.session.expired') {
      const session = event.data.object;
      const bookingId = parseInt(session.metadata && session.metadata.bookingId, 10);
      if (Number.isInteger(bookingId)) {
        await markBookingFailed(bookingId);
      }
    }
    res.json({ received: true });
  } catch (err) {
    console.error('Errore elaborazione webhook Stripe:', err);
    // 500 cosi' Stripe ritenta automaticamente piu' tardi
    res.status(500).json({ error: 'internal error' });
  }
});

router.post('/paypal', express.raw({ type: 'application/json' }), async (req, res) => {
  let parsed;
  try {
    parsed = JSON.parse(req.body.toString('utf8'));
  } catch (err) {
    return res.status(400).send('Invalid JSON');
  }

  let valid;
  try {
    valid = await verifyWebhookSignature(req.headers, parsed);
  } catch (err) {
    console.error('Errore verifica webhook PayPal:', err);
    return res.status(500).send('verification error');
  }
  if (!valid) {
    console.error('Webhook PayPal: firma non valida');
    return res.status(400).send('Invalid signature');
  }

  try {
    const eventType = parsed.event_type;
    const resource = parsed.resource || {};

    if (eventType === 'CHECKOUT.ORDER.APPROVED') {
      // Rete di sicurezza: se l'utente ha approvato su PayPal ma non è mai
      // tornato sul nostro return_url (browser chiuso, connessione persa),
      // catturiamo comunque l'ordine da qui in modo che il pagamento non
      // resti "appeso" e la prenotazione possa comunque confermarsi.
      await captureOrder(resource.id).catch((e) =>
        console.error('Errore cattura da webhook CHECKOUT.ORDER.APPROVED:', e)
      );
    } else if (eventType === 'PAYMENT.CAPTURE.COMPLETED') {
      const bookingId = parseInt(resource.custom_id, 10);
      if (Number.isInteger(bookingId)) {
        const { booking, alreadyPaid } = await confirmBookingPaid(bookingId, {
          paymentMethod: 'PAYPAL',
          paymentRef: resource.id,
        });
        if (!alreadyPaid) {
          sendCustomerConfirmation(booking).catch((e) => console.error('Errore invio email cliente:', e));
          sendInternalNotification(booking).catch((e) => console.error('Errore invio email interna:', e));
        }
      }
    } else if (eventType === 'PAYMENT.CAPTURE.DENIED' || eventType === 'CHECKOUT.ORDER.VOIDED') {
      const bookingId = parseInt(resource.custom_id, 10);
      if (Number.isInteger(bookingId)) {
        await markBookingFailed(bookingId);
      }
    }
    res.json({ received: true });
  } catch (err) {
    console.error('Errore elaborazione webhook PayPal:', err);
    res.status(500).json({ error: 'internal error' });
  }
});

module.exports = router;
