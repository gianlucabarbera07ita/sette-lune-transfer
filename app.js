const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');
const session = require('express-session');

const { i18nMiddleware } = require('./i18n/middleware');
const webhooksRouter = require('./routes/webhooks');
const healthRouter = require('./routes/health');
const adminRouter = require('./routes/admin');
const { router: publicRouter } = require('./routes/public');
const checkoutRouter = require('./routes/checkout');

const { formatEuro } = require('./services/pricing');
const { formatTime, formatDateLong, formatDateShort } = require('./services/format');
const { eventName, eventDescription, TYPE_TO_I18N_KEY } = require('./services/localize');

const app = express();

// Helper disponibili in tutte le view EJS senza doverli passare ogni volta
// esplicitamente da ogni route.
app.locals.formatEuro = formatEuro;
app.locals.formatTime = formatTime;
app.locals.formatDateLong = formatDateLong;
app.locals.formatDateShort = formatDateShort;
app.locals.eventName = eventName;
app.locals.eventDescription = eventDescription;
app.locals.TYPE_TO_I18N_KEY = TYPE_TO_I18N_KEY;

// Render gira dietro un proxy/load balancer: serve per rilevare correttamente
// HTTPS (cookie "secure") e l'host reale nelle URL generate.
app.set('trust proxy', 1);
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '..', 'views'));

app.use('/assets', express.static(path.join(__dirname, '..', 'public')));

// Le route webhook hanno bisogno del body "grezzo" per verificare le firme
// di Stripe/PayPal: vanno montate PRIMA di express.json(), altrimenti il
// body arriverebbe già parsato e la verifica firma fallirebbe sempre.
app.use('/webhooks', webhooksRouter);

app.use('/', healthRouter);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

if (!process.env.CART_COOKIE_SECRET) {
  console.warn('ATTENZIONE: CART_COOKIE_SECRET non impostata, uso un valore di default non sicuro per lo sviluppo locale.');
}
app.use(cookieParser(process.env.CART_COOKIE_SECRET || 'dev-cart-secret-non-usare-in-produzione'));

if (!process.env.SESSION_SECRET) {
  console.warn('ATTENZIONE: SESSION_SECRET non impostata, uso un valore di default non sicuro per lo sviluppo locale.');
}
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'dev-session-secret-non-usare-in-produzione',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 1000 * 60 * 60 * 8, // 8 ore, sufficiente per una sessione di lavoro admin
    },
  })
);

// Il pannello admin non ha prefisso di lingua (è ad uso interno, sempre in
// italiano) e va montato prima del middleware i18n.
app.use('/admin', adminRouter);

app.use(i18nMiddleware);
app.use('/', publicRouter);
app.use('/', checkoutRouter);

app.use((req, res) => {
  res.status(404).send('Pagina non trovata');
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('Errore non gestito:', err);
  res.status(500).send('Si è verificato un errore imprevisto. Riprova tra qualche istante.');
});

module.exports = app;
