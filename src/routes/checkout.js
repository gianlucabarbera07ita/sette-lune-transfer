const express = require('express');
const router = express.Router();

const { enrichCart } = require('./public');
const { getCartRaw, clearCart } = require('../services/cart');
const { reserveCart, confirmBookingPaid, markBookingFailed, getBookingById, AvailabilityError } = require('../services/booking');
const { createCheckoutSession } = require('../services/stripeService');
const { createOrder, captureOrder } = require('../services/paypalService');
const { sendCustomerConfirmation, sendInternalNotification } = require('../services/email');
const prisma = require('../db');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function baseUrlFrom(req) {
  return process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;
}

router.post('/checkout', async (req, res, next) => {
  try {
    const { name, email, emailConfirm, paymentMethod } = req.body;

    if (!name || !name.trim()) {
      return res.redirect(`/${req.lang}/carrello?error=name`);
    }
    if (!email || !EMAIL_RE.test(email) || email.trim().toLowerCase() !== (emailConfirm || '').trim().toLowerCase()) {
      return res.redirect(`/${req.lang}/carrello?error=email`);
    }
    if (!['stripe', 'paypal'].includes(paymentMethod)) {
      return res.redirect(`/${req.lang}/carrello?error=payment`);
    }

    const rawCart = getCartRaw(req);
    const { enriched, hasIssue } = await enrichCart(rawCart);
    if (hasIssue || !enriched.length) {
      return res.redirect(`/${req.lang}/carrello?error=availability`);
    }

    const cartItems = enriched.map((i) => ({
      eventId: i.eventId,
      type: i.type,
      numPeople: i.numPeople,
      andataSlotId: i.andataSlotId,
      ritornoSlotId: i.ritornoSlotId,
      priceEuroCents: i.priceEuroCents,
    }));

    let booking;
    try {
      booking = await reserveCart(cartItems, { name: name.trim(), email: email.trim(), language: req.lang });
    } catch (err) {
      if (err instanceof AvailabilityError) {
        return res.redirect(`/${req.lang}/carrello?error=availability`);
      }
      throw err;
    }

    // Il carrello ora "vive" come prenotazione PENDING nel database: lo
    // svuotiamo dal cookie per evitare doppie prenotazioni se l'utente
    // torna indietro col browser.
    clearCart(res);

    const baseUrl = baseUrlFrom(req);

    // Se Stripe/PayPal rifiutano la richiesta (es. chiavi non ancora
    // configurate, servizio momentaneamente giù), rilasciamo SUBITO i posti
    // appena bloccati invece di lasciarli "in attesa" fino allo scadere dei
    // 15 minuti: altrimenti un tentativo fallito terrebbe inutilmente
    // occupati posti che nessuno ha davvero pagato.
    try {
      if (paymentMethod === 'stripe') {
        const session = await createCheckoutSession(booking, baseUrl);
        await prisma.booking.update({ where: { id: booking.id }, data: { paymentRef: session.id } });
        return res.redirect(303, session.url);
      }

      // paypal
      const { orderId, approveUrl } = await createOrder(booking, baseUrl);
      await prisma.booking.update({ where: { id: booking.id }, data: { paymentRef: orderId } });
      return res.redirect(303, approveUrl);
    } catch (paymentErr) {
      console.error('Errore avvio pagamento, rilascio i posti bloccati:', paymentErr);
      await markBookingFailed(booking.id).catch((e) => console.error('Errore nel rilascio posti:', e));
      return res.redirect(`/${req.lang}/carrello?error=payment_setup`);
    }
  } catch (err) {
    next(err);
  }
});

// L'utente torna qui da PayPal dopo aver approvato il pagamento sul loro
// sito. Catturiamo (incassiamo) subito l'ordine qui per una UX rapida; il
// webhook PAYMENT.CAPTURE.COMPLETED resta comunque la conferma
// "ufficiale" e gestisce il caso in cui l'utente chiuda il browser prima
// di tornare su questa pagina.
router.get('/checkout/paypal/return', async (req, res) => {
  const bookingId = parseInt(req.query.bookingId, 10);
  const orderId = req.query.token;

  if (!Number.isInteger(bookingId) || !orderId) {
    return res.redirect(`/${req.lang}/`);
  }

  try {
    const captureResult = await captureOrder(orderId);
    if (captureResult.completed || captureResult.alreadyCaptured) {
      const { booking, alreadyPaid } = await confirmBookingPaid(bookingId, {
        paymentMethod: 'PAYPAL',
        paymentRef: orderId,
      });
      if (!alreadyPaid) {
        sendCustomerConfirmation(booking).catch((e) => console.error('Errore invio email cliente:', e));
        sendInternalNotification(booking).catch((e) => console.error('Errore invio email interna:', e));
      }
    }
  } catch (err) {
    console.error('Errore cattura PayPal su return_url:', err);
    // Non blocchiamo la pagina: se il pagamento è comunque andato a buon
    // fine, il webhook lo confermerà a breve e la pagina di conferma si
    // aggiornerà da sola.
  }

  res.redirect(`/${req.lang}/conferma/${bookingId}`);
});

router.get('/conferma/:bookingId', async (req, res, next) => {
  try {
    const bookingId = parseInt(req.params.bookingId, 10);
    const booking = await getBookingById(bookingId);
    if (!booking) return res.status(404).send('Prenotazione non trovata');
    res.render('confirmation', { booking });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
