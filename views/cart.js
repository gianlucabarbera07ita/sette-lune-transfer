// Il carrello vive interamente in un cookie firmato lato client (mai in
// memoria del server): così un redeploy o riavvio del servizio Render non
// perde mai un carrello in corso, e non serve alcuno store di sessione.
// Il server non si fida MAI dei prezzi/disponibilità presenti nel cookie:
// li ricalcola sempre dal database ad ogni pagina e soprattutto al checkout.

const COOKIE_NAME = 'sl_cart';
const MAX_AGE_MS = 1000 * 60 * 60 * 6; // 6 ore

function getCartRaw(req) {
  const raw = req.signedCookies && req.signedCookies[COOKIE_NAME];
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function setCartRaw(res, items) {
  res.cookie(COOKIE_NAME, JSON.stringify(items), {
    signed: true,
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: MAX_AGE_MS,
  });
}

function clearCart(res) {
  res.clearCookie(COOKIE_NAME);
}

module.exports = { getCartRaw, setCartRaw, clearCart, COOKIE_NAME };
