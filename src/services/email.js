const nodemailer = require('nodemailer');
const { translate } = require('../i18n/middleware');
const { formatEuro } = require('./pricing');
const { formatDateLong, formatTime } = require('./format');
const { eventName, TYPE_TO_I18N_KEY } = require('./localize');

let transporter;
function getTransporter() {
  if (!transporter) {
    if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
      throw new Error('GMAIL_USER / GMAIL_APP_PASSWORD non configurate');
    }
    transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD,
      },
    });
  }
  return transporter;
}

function itemLine(item, lang) {
  const typeLabel = translate(lang, `home.${TYPE_TO_I18N_KEY[item.type]}`);
  const name = eventName(item.event, lang);
  const parts = [`${name} (${formatDateLong(item.event.labelDate, lang)}) – ${typeLabel} – ${item.numPeople}x`];
  if (item.andataSlot) {
    parts.push(`${translate(lang, 'home.outbound')}: ${formatTime(item.andataSlot.departureAt, lang)}`);
  }
  if (item.ritornoSlot) {
    parts.push(`${translate(lang, 'home.return')}: ${formatTime(item.ritornoSlot.departureAt, lang)}`);
  }
  parts.push(`${formatEuro(item.priceEuroCents)} €`);
  return parts.join(' — ');
}

function buildSummaryHtml(booking, lang) {
  const rows = booking.items
    .map(
      (item) => `<li style="margin-bottom:8px;">${itemLine(item, lang)}</li>`
    )
    .join('');
  return `<ul style="padding-left:20px;">${rows}</ul>`;
}

function buildSummaryText(booking, lang) {
  return booking.items.map((item) => `- ${itemLine(item, lang)}`).join('\n');
}

/**
 * Invia l'email di conferma al cliente, nella lingua da lui scelta al
 * momento della prenotazione, con il codice identificativo che gli verrà
 * chiesto prima di salire sul transfer.
 */
async function sendCustomerConfirmation(booking) {
  const lang = booking.language || 'it';
  const t = (key, vars) => translate(lang, key, vars);
  const subject = t('email.confirmationSubject', { code: booking.code });

  const html = `
    <div style="font-family: Arial, sans-serif; max-width:600px; margin:0 auto;">
      <h2>${t('confirmation.titlePaid')}</h2>
      <p style="font-size:20px;"><strong>${t('confirmation.code')}: ${booking.code}</strong></p>
      <p>${t('confirmation.codeNotice')}</p>
      <h3>${t('confirmation.summary')}</h3>
      ${buildSummaryHtml(booking, lang)}
      <p><strong>${t('cart.total')}: ${formatEuro(booking.totalEuroCents)} €</strong></p>
      <hr />
      <p>Sette Lune Festival – Piazza Sant'Agostino, Trapani</p>
    </div>
  `;

  const text = `${t('confirmation.titlePaid')}\n\n${t('confirmation.code')}: ${booking.code}\n${t('confirmation.codeNotice')}\n\n${t('confirmation.summary')}:\n${buildSummaryText(booking, lang)}\n\n${t('cart.total')}: ${formatEuro(booking.totalEuroCents)} €`;

  await getTransporter().sendMail({
    from: `Sette Lune Transfer <${process.env.GMAIL_USER}>`,
    to: booking.customerEmail,
    subject,
    html,
    text,
  });
}

/**
 * Invia la notifica interna (organizzatore + servizio transfer) con i
 * dettagli della nuova prenotazione pagata, per monitorare in tempo reale
 * chi ha acquistato cosa.
 */
async function sendInternalNotification(booking) {
  const recipients = (process.env.INTERNAL_NOTIFICATION_EMAILS || '')
    .split(',')
    .map((e) => e.trim())
    .filter(Boolean);
  if (!recipients.length) return;

  const lang = 'it'; // le notifiche interne restano sempre in italiano
  const subject = translate(lang, 'email.internalSubject', { code: booking.code });

  const html = `
    <div style="font-family: Arial, sans-serif; max-width:600px; margin:0 auto;">
      <h2>Nuova prenotazione pagata</h2>
      <p><strong>Codice:</strong> ${booking.code}</p>
      <p><strong>Cliente:</strong> ${booking.customerName} — ${booking.customerEmail}</p>
      <p><strong>Metodo di pagamento:</strong> ${booking.paymentMethod}</p>
      <h3>Dettaglio</h3>
      ${buildSummaryHtml(booking, lang)}
      <p><strong>Totale incassato: ${formatEuro(booking.totalEuroCents)} €</strong></p>
    </div>
  `;

  await getTransporter().sendMail({
    from: `Sette Lune Transfer <${process.env.GMAIL_USER}>`,
    to: recipients.join(','),
    subject,
    html,
  });
}

module.exports = { sendCustomerConfirmation, sendInternalNotification };
