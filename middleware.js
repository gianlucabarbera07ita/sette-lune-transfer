const it = require('./it.json');
const en = require('./en.json');
const es = require('./es.json');

const DICTIONARIES = { it, en, es };
const SUPPORTED_LANGS = ['it', 'en', 'es'];
const DEFAULT_LANG = 'it';

function isSupported(lang) {
  return SUPPORTED_LANGS.includes(lang);
}

// Legge una chiave annidata tipo "cart.title" da un dizionario.
function lookup(dict, key) {
  return key.split('.').reduce((acc, part) => (acc && acc[part] !== undefined ? acc[part] : undefined), dict);
}

function translate(lang, key, vars) {
  const dict = DICTIONARIES[lang] || DICTIONARIES[DEFAULT_LANG];
  let str = lookup(dict, key);
  if (str === undefined) {
    // Fallback all'italiano se manca una chiave in un'altra lingua,
    // così il sito non mostra mai una chiave grezza tipo "cart.title".
    str = lookup(DICTIONARIES[DEFAULT_LANG], key);
  }
  if (str === undefined) return key;
  if (vars) {
    Object.keys(vars).forEach((v) => {
      str = str.replace(new RegExp(`{{${v}}}`, 'g'), vars[v]);
    });
  }
  return str;
}

// Middleware Express: legge la lingua dal prefisso URL /:lang/... e la
// espone come req.lang e come helper t() nelle view EJS.
function i18nMiddleware(req, res, next) {
  const segments = req.path.split('/').filter(Boolean);
  const first = segments[0];

  if (isSupported(first)) {
    req.lang = first;
    // rimuove il prefisso lingua per il routing successivo
    req.url = '/' + segments.slice(1).join('/') + (req.url.includes('?') ? '?' + req.url.split('?')[1] : '');
    if (req.url === '/') req.url = '/';
  } else {
    req.lang = DEFAULT_LANG;
    // redirige a /it/... (o lingua rilevata dal browser) mantenendo il path
    const browserLang = (req.acceptsLanguages(SUPPORTED_LANGS) || DEFAULT_LANG);
    const lang = isSupported(browserLang) ? browserLang : DEFAULT_LANG;
    return res.redirect(302, `/${lang}${req.originalUrl}`);
  }

  res.locals.lang = req.lang;
  res.locals.t = (key, vars) => translate(req.lang, key, vars);
  res.locals.supportedLangs = SUPPORTED_LANGS;
  res.locals.currentPath = segments.slice(1).join('/');
  next();
}

module.exports = { i18nMiddleware, translate, SUPPORTED_LANGS, DEFAULT_LANG, isSupported };
