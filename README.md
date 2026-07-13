# Sette Lune – Piattaforma prenotazione transfer

Piattaforma di prenotazione online per i transfer del festival Sette Lune
(provincia di Trapani, 6-8 agosto 2026). Permette di prenotare andata/ritorno
su più giorni in un unico pagamento (carta via Stripe o PayPal), con posti
aggiornati in tempo reale, email di conferma con codice identificativo in
IT/EN/ES, e un pannello per l'organizzatore con l'elenco prenotati per ogni
corsa.

Il progetto è stato scritto interamente in un ambiente cloud che **non aveva
accesso a internet per scaricare le librerie npm** (un blocco di rete della
sessione, non modificabile da qui). Questo significa che il codice non è mai
stato eseguito/testato dal vivo prima di essere consegnato: è stato scritto
con la massima attenzione e la logica pura (calcolo prezzi, generazione
codici prenotazione, formattazione orari) è stata verificata con dei test
automatici che NON richiedono librerie esterne (vedi sezione Test). **Il
primo vero test end-to-end va fatto su Render** seguendo questa guida, prima
di passare a incassare pagamenti veri.

## 1. Struttura del progetto

```
src/
  app.js              - configurazione Express
  server.js            - avvio del server
  db.js                 - client Prisma (database)
  i18n/                 - traduzioni IT/EN/ES
  services/             - logica di business (prezzi, disponibilità, pagamenti, email)
  routes/                - le pagine e le API
views/                  - template HTML (EJS)
public/                 - CSS e JS statici
prisma/
  schema.prisma          - struttura del database
  seed.js                 - dati iniziali (eventi, corse, prezzi dal tuo piano trasporti)
tests/                   - test automatici (eseguibili senza npm install)
render.yaml             - configurazione per il deploy automatico su Render
```

## 2. Cosa serve prima di iniziare

- Un repository GitHub (hai detto di averne già uno pronto).
- Un account Render (già presente).
- Un account **Stripe** (per i pagamenti con carta).
- Un account **PayPal Business** (per i pagamenti PayPal).
- La tua Gmail, con una **App Password** generata (per inviare le email di
  conferma senza bisogno di un dominio).

## 3. IMPORTANTE — verifica gli orari dopo mezzanotte prima di andare live

Nel seed (`prisma/seed.js`) alcune corse sono state spostate al giorno di
calendario successivo perché avvengono dopo mezzanotte, cioè tecnicamente
"il giorno dopo" anche se fanno parte della stessa nottata:

- Ritorni delle 00:00 e 01:30 del 6 agosto → salvati come mattina del **7
  agosto**.
- Ritorni delle 05:00-08:00 del 7 agosto → salvati come mattina dell'**8
  agosto**.
- Andate delle 00:00, 01:00, 02:00 dell'8 agosto → salvate come notte del **9
  agosto**.
- Ritorni delle 04:30-07:30 dell'8 agosto → salvati come mattina del **9
  agosto**.

È l'interpretazione più logica (corse dopo mezzanotte = notte successiva),
ma **confermala tu prima del lancio**: se qualcosa non torna, si corregge
in due minuti modificando le date in `prisma/seed.js` (sono scritte in
chiaro, es. `dt('2026-08-07', '00:00')`) e ridistribuendo.

## 4. Deploy su Render (il modo più veloce per testare davvero)

1. Carica questo codice su un repository GitHub (nuovo o quello che avevi già,
   ripulito).
2. Su Render: **New → Blueprint**, collega il repository. Render leggerà
   `render.yaml` e creerà automaticamente sia il database Postgres sia il
   servizio web.
3. Dopo la creazione, vai nelle **Environment Variables** del servizio web e
   inserisci quelle non gestite automaticamente (vedi sezioni 5, 6, 7 sotto
   per come ottenerle):
   - `BASE_URL` → l'URL pubblico che Render ti assegna (es.
     `https://sette-lune-transfer.onrender.com`), da inserire DOPO il primo
     deploy quando lo conosci.
   - `ADMIN_PASSWORD` → una password a tua scelta per il pannello `/admin`.
   - `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`
   - `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_WEBHOOK_ID`
   - `GMAIL_USER`, `GMAIL_APP_PASSWORD`
   - `INTERNAL_NOTIFICATION_EMAILS` → la tua email (o più email separate da
     virgola) dove ricevere le notifiche di ogni nuova prenotazione pagata.
4. Salva: Render farà un nuovo deploy con le variabili impostate.
5. Ad ogni deploy futuro (ogni volta che aggiorni il codice su GitHub),
   Render esegue automaticamente `prisma db push` e il seed **prima** di
   mettere online la nuova versione: è la parte che garantisce che gli
   orari non spariscano mai più dopo un deploy, a differenza del sito
   precedente.

## 5. Configurare Stripe

1. Crea/accedi al tuo account su https://dashboard.stripe.com
2. Per i primi test usa le chiavi in modalità **Test** (interruttore in alto
   a destra nella dashboard): Developers → API keys → copia la "Secret key"
   (`sk_test_...`) in `STRIPE_SECRET_KEY`.
3. Developers → Webhooks → Add endpoint:
   - URL: `https://IL-TUO-SITO.onrender.com/webhooks/stripe`
   - Evento da ascoltare: `checkout.session.completed` (e opzionalmente
     `checkout.session.expired`)
   - Copia il "Signing secret" (`whsec_...`) in `STRIPE_WEBHOOK_SECRET`.
4. Fai un pagamento di prova con una carta di test Stripe (es.
   `4242 4242 4242 4242`, qualsiasi data futura, qualsiasi CVC) per
   verificare tutto il flusso (vedi sezione 8).
5. Solo quando sei sicuro che tutto funzioni: passa alla modalità **Live**
   nella dashboard Stripe, ripeti i punti 2-3 con le chiavi live
   (`sk_live_...` / webhook live) e aggiorna le variabili su Render.

## 6. Configurare PayPal

1. Vai su https://developer.paypal.com/dashboard/applications e crea una
   "App" (modalità Sandbox per i test) collegata al tuo account PayPal
   Business.
2. Copia "Client ID" e "Secret" in `PAYPAL_CLIENT_ID` / `PAYPAL_CLIENT_SECRET`.
   Lascia `PAYPAL_ENV=sandbox` per i test.
3. Nella stessa dashboard, configura un Webhook per l'app puntando a:
   `https://IL-TUO-SITO.onrender.com/webhooks/paypal`
   Eventi da selezionare: `CHECKOUT.ORDER.APPROVED`,
   `PAYMENT.CAPTURE.COMPLETED`, `PAYMENT.CAPTURE.DENIED`,
   `CHECKOUT.ORDER.VOIDED`. Copia il "Webhook ID" in `PAYPAL_WEBHOOK_ID`.
4. Testa un pagamento con un account sandbox PayPal (la dashboard developer
   te ne fornisce uno automaticamente in Sandbox → Accounts).
5. Quando sei pronto per incassare davvero: crea una App "Live" (stesso
   procedimento ma fuori sandbox), aggiorna le credenziali su Render e
   imposta `PAYPAL_ENV=live`.

## 7. Configurare l'invio email (Gmail)

1. Attiva la verifica in due passaggi sul tuo account Google, se non è già
   attiva (richiesta obbligatoria per le App Password).
2. Vai su https://myaccount.google.com/apppasswords, crea una nuova App
   Password (nome a piacere, es. "Sette Lune sito").
3. Copia la password di 16 caratteri generata in `GMAIL_APP_PASSWORD` (NON è
   la tua password Gmail normale). `GMAIL_USER` è il tuo indirizzo Gmail.

## 8. Come testare tutto prima di andare live

1. Con le chiavi Stripe/PayPal in modalità test/sandbox, apri il sito e
   prova una prenotazione completa: aggiungi un paio di transfer al
   carrello, vai al pagamento, paga con una carta di test o un account
   sandbox PayPal.
2. Verifica che: il posto sparisca dalla disponibilità dopo il pagamento,
   arrivi l'email di conferma con codice, arrivi anche la notifica interna,
   il pannello `/admin` mostri la prenotazione e permetta di esportarla in
   CSV.
3. Prova ad abbandonare un pagamento a metà (chiudi la pagina di Stripe
   senza pagare): dopo 15 minuti il posto deve tornare disponibile in
   automatico (controlla su `/admin`, oppure aspetta e ricarica la home).
4. Fai un piccolo commit "a vuoto" e un push su GitHub per simulare un
   redeploy: verifica che tutte le prenotazioni fatte finora restino
   visibili nel pannello admin (questo è il test più importante, quello che
   verifica che il vecchio problema non si ripresenti).
5. Solo dopo che tutti questi controlli sono andati bene, passa le chiavi
   Stripe e PayPal a modalità Live.

## 9. Pannello organizzatore

Vai su `https://IL-TUO-SITO.onrender.com/admin`, accedi con la
`ADMIN_PASSWORD` scelta. Da lì vedi, per ogni corsa, quanti posti sono
prenotati/in attesa di pagamento/liberi, e puoi esportare in CSV l'elenco
di chi ha prenotato quella specifica corsa (nome, email, numero persone,
codice), utile da avere stampato o sul telefono il giorno del transfer.

## 10. Sviluppo locale (opzionale)

Se vuoi provare il codice sul tuo computer prima di mandarlo su Render, ti
serve Node.js 20+ e un database Postgres (anche via Docker):

```bash
npm install
cp .env.example .env   # poi compila i valori nel file .env
npx prisma db push
npm run seed
npm run dev
```

Il sito sarà su http://localhost:3000 (ti reindirizza automaticamente a
`/it/`).

## 11. Test automatici

I test in `tests/` verificano la logica di calcolo prezzi, generazione
codici prenotazione, e formattazione corretta degli orari nel fuso orario
di Trapani — non richiedono un database né librerie esterne:

```bash
npm test
```

## 12. Prezzi attuali (da `prisma/seed.js`, modificabili lì)

| Giorno | Solo andata / solo ritorno | Andata e ritorno |
|---|---|---|
| 6 agosto — Tenute Pispisa | 20 € | 30 € |
| 7 agosto — Il Baglio | 12 € | 20 € |
| 8 agosto — Secret Location | 12 € | 20 € |

## 13. Cose da sapere / limiti attuali

- L'email di notifica interna va, per ora, sulla tua Gmail personale
  (`INTERNAL_NOTIFICATION_EMAILS`): quando avrai un indirizzo dedicato basta
  cambiare quella variabile su Render, nessuna modifica al codice.
- L'invio email passa dalla tua Gmail personale via SMTP: per i volumi di un
  festival di questa dimensione va benissimo; se in futuro il volume di
  email crescesse molto, si può migrare a un servizio come Resend senza
  toccare il resto della piattaforma (cambia solo `src/services/email.js`).
- Il carrello vive in un cookie del browser (non nella memoria del server):
  questo significa che un redeploy o riavvio di Render non fa mai perdere un
  carrello in corso.
- Ogni prenotazione blocca i posti per 15 minuti in attesa del pagamento; se
  il pagamento non arriva, i posti tornano automaticamente disponibili.
