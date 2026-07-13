// Formattazione di date/orari sempre nel fuso orario di Trapani (Europe/Rome),
// indipendentemente dal fuso orario del server (Render di solito gira in UTC).
// Fondamentale per non mostrare orari sbagliati agli utenti.

const LOCALE_MAP = { it: 'it-IT', en: 'en-GB', es: 'es-ES' };

function formatTime(date, lang = 'it') {
  return new Intl.DateTimeFormat(LOCALE_MAP[lang] || 'it-IT', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Rome',
  }).format(new Date(date));
}

function formatDateLong(date, lang = 'it') {
  return new Intl.DateTimeFormat(LOCALE_MAP[lang] || 'it-IT', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'Europe/Rome',
  }).format(new Date(date));
}

function formatDateShort(date, lang = 'it') {
  return new Intl.DateTimeFormat(LOCALE_MAP[lang] || 'it-IT', {
    day: 'numeric',
    month: 'short',
    timeZone: 'Europe/Rome',
  }).format(new Date(date));
}

module.exports = { formatTime, formatDateLong, formatDateShort };
