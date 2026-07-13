// Integrazione PayPal via chiamate dirette alle REST API (Orders v2 +
// verifica firma webhook), senza SDK: usa il fetch nativo di Node 22.
// Le REST API di PayPal sono stabili da anni, a differenza degli SDK npm
// che sono stati più volte deprecati/sostituiti - questo approccio riduce
// il rischio di usare un pacchetto non più mantenuto.

function getBaseUrl() {
  return process.env.PAYPAL_ENV === 'live'
    ? 'https://api-m.paypal.com'
    : 'https://api-m.sandbox.paypal.com';
}

let cachedToken = null;
let cachedTokenExpiryMs = 0;

async function getAccessToken() {
  if (cachedToken && Date.now() < cachedTokenExpiryMs - 60000) return cachedToken;

  if (!process.env.PAYPAL_CLIENT_ID || !process.env.PAYPAL_CLIENT_SECRET) {
    throw new Error('PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET non configurate');
  }

  const creds = Buffer.from(`${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`).toString('base64');
  const res = await fetch(`${getBaseUrl()}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${creds}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });

  if (!res.ok) {
    throw new Error(`PayPal OAuth fallito: ${res.status} ${await res.text()}`);
  }

  const data = await res.json();
  cachedToken = data.access_token;
  cachedTokenExpiryMs = Date.now() + data.expires_in * 1000;
  return cachedToken;
}

/**
 * Crea un Order PayPal per l'intero carrello e restituisce il link di
 * approvazione a cui reindirizzare l'utente.
 */
async function createOrder(booking, baseUrl) {
  const token = await getAccessToken();
  const lang = booking.language || 'it';
  const totalEuro = (booking.totalEuroCents / 100).toFixed(2);

  const res = await fetch(`${getBaseUrl()}/v2/checkout/orders`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      intent: 'CAPTURE',
      purchase_units: [
        {
          reference_id: String(booking.id),
          custom_id: String(booking.id),
          description: `Sette Lune - prenotazione transfer #${booking.id}`,
          amount: { currency_code: 'EUR', value: totalEuro },
        },
      ],
      application_context: {
        brand_name: 'Sette Lune',
        user_action: 'PAY_NOW',
        return_url: `${baseUrl}/${lang}/checkout/paypal/return?bookingId=${booking.id}`,
        cancel_url: `${baseUrl}/${lang}/carrello?payment=cancelled`,
      },
    }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(`Creazione ordine PayPal fallita: ${res.status} ${JSON.stringify(data)}`);
  }

  const approveLink = (data.links || []).find((l) => l.rel === 'approve');
  return { orderId: data.id, approveUrl: approveLink && approveLink.href };
}

/**
 * Cattura (incassa) un Order PayPal già approvato dall'utente. Gestisce in
 * modo tollerante il caso in cui sia già stato catturato in precedenza
 * (es. return_url e webhook arrivati quasi insieme).
 */
async function captureOrder(orderId) {
  const token = await getAccessToken();
  const res = await fetch(`${getBaseUrl()}/v2/checkout/orders/${orderId}/capture`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  const data = await res.json();
  if (!res.ok) {
    const alreadyCaptured =
      data.details && data.details.some((d) => d.issue === 'ORDER_ALREADY_CAPTURED');
    if (alreadyCaptured) return { alreadyCaptured: true };
    throw new Error(`Cattura ordine PayPal fallita: ${res.status} ${JSON.stringify(data)}`);
  }

  const status = data.status;
  const completed = status === 'COMPLETED';
  return { data, completed };
}

/**
 * Verifica la firma di un webhook PayPal chiamando l'endpoint ufficiale
 * di verifica (evita di dover implementare a mano la crittografia).
 */
async function verifyWebhookSignature(headers, parsedBody) {
  if (!process.env.PAYPAL_WEBHOOK_ID) {
    throw new Error('PAYPAL_WEBHOOK_ID non configurato');
  }
  const token = await getAccessToken();
  const res = await fetch(`${getBaseUrl()}/v1/notifications/verify-webhook-signature`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      auth_algo: headers['paypal-auth-algo'],
      cert_url: headers['paypal-cert-url'],
      transmission_id: headers['paypal-transmission-id'],
      transmission_sig: headers['paypal-transmission-sig'],
      transmission_time: headers['paypal-transmission-time'],
      webhook_id: process.env.PAYPAL_WEBHOOK_ID,
      webhook_event: parsedBody,
    }),
  });
  const data = await res.json();
  return data.verification_status === 'SUCCESS';
}

module.exports = { getAccessToken, createOrder, captureOrder, verifyWebhookSignature };
