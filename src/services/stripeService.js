const Stripe = require('stripe');
const { translate } = require('../i18n/middleware');
const { eventName, TYPE_TO_I18N_KEY } = require('./localize');

let stripeClient;
function getStripe() {
  if (!stripeClient) {
    if (!process.env.STRIPE_SECRET_KEY) {
      throw new Error('STRIPE_SECRET_KEY non configurata');
    }
    stripeClient = new Stripe(process.env.STRIPE_SECRET_KEY);
  }
  return stripeClient;
}

/**
 * Crea una Stripe Checkout Session per l'intero carrello (un booking può
 * contenere più tratte su più giorni: ogni riga del carrello diventa una
 * riga separata nella pagina di pagamento Stripe, per chiarezza).
 */
async function createCheckoutSession(booking, baseUrl) {
  const lang = booking.language || 'it';
  const stripe = getStripe();

  const lineItems = booking.items.map((item) => {
    const unitAmount = Math.round(item.priceEuroCents / item.numPeople);
    const typeLabel = translate(lang, `home.${TYPE_TO_I18N_KEY[item.type]}`);
    return {
      price_data: {
        currency: 'eur',
        unit_amount: unitAmount,
        product_data: {
          name: `${eventName(item.event, lang)} – ${typeLabel}`,
        },
      },
      quantity: item.numPeople,
    };
  });

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    payment_method_types: ['card'],
    customer_email: booking.customerEmail,
    line_items: lineItems,
    metadata: { bookingId: String(booking.id) },
    success_url: `${baseUrl}/${lang}/conferma/${booking.id}?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${baseUrl}/${lang}/carrello?payment=cancelled`,
    expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
  });

  return session;
}

function constructWebhookEvent(rawBody, signature) {
  const stripe = getStripe();
  if (!process.env.STRIPE_WEBHOOK_SECRET) {
    throw new Error('STRIPE_WEBHOOK_SECRET non configurata');
  }
  return stripe.webhooks.constructEvent(rawBody, signature, process.env.STRIPE_WEBHOOK_SECRET);
}

module.exports = { getStripe, createCheckoutSession, constructWebhookEvent };
