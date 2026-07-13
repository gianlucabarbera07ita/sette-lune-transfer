const prisma = require('../db');
const { tryHoldSlot } = require('./availability');
const { generateUniqueBookingCode } = require('./bookingCode');

const HOLD_MINUTES = 15;

class AvailabilityError extends Error {
  constructor(message, details) {
    super(message);
    this.name = 'AvailabilityError';
    this.details = details;
  }
}

/**
 * Crea una prenotazione PENDING a partire dal carrello, bloccando
 * atomicamente i posti necessari per 15 minuti. Se anche un solo elemento
 * del carrello non ha più abbastanza posti liberi, l'intera operazione
 * viene annullata (transazione DB) e non viene bloccato nulla.
 *
 * @param {Array} cartItems - elementi già validati/arricchiti (eventId, type, numPeople, andataSlotId, ritornoSlotId, priceEuroCents, eventSlug per messaggi d'errore)
 * @param {{name: string, email: string, language: string}} customer
 */
async function reserveCart(cartItems, customer) {
  if (!cartItems.length) {
    throw new AvailabilityError('Il carrello è vuoto', []);
  }

  return prisma.$transaction(async (tx) => {
    for (const item of cartItems) {
      if (item.type === 'SOLO_ANDATA' || item.type === 'ANDATA_RITORNO') {
        const ok = await tryHoldSlot(tx, item.andataSlotId, item.numPeople);
        if (!ok) {
          throw new AvailabilityError('Posti andata non più disponibili', {
            eventId: item.eventId,
            slotId: item.andataSlotId,
            direction: 'ANDATA',
          });
        }
      }
      if (item.type === 'SOLO_RITORNO' || item.type === 'ANDATA_RITORNO') {
        const ok = await tryHoldSlot(tx, item.ritornoSlotId, item.numPeople);
        if (!ok) {
          throw new AvailabilityError('Posti ritorno non più disponibili', {
            eventId: item.eventId,
            slotId: item.ritornoSlotId,
            direction: 'RITORNO',
          });
        }
      }
    }

    const totalEuroCents = cartItems.reduce((sum, i) => sum + i.priceEuroCents, 0);
    const holdExpiresAt = new Date(Date.now() + HOLD_MINUTES * 60 * 1000);

    const booking = await tx.booking.create({
      data: {
        customerName: customer.name,
        customerEmail: customer.email,
        language: customer.language,
        status: 'PENDING',
        totalEuroCents,
        holdExpiresAt,
        items: {
          create: cartItems.map((i) => ({
            eventId: i.eventId,
            type: i.type,
            numPeople: i.numPeople,
            priceEuroCents: i.priceEuroCents,
            andataSlotId: i.andataSlotId || null,
            ritornoSlotId: i.ritornoSlotId || null,
          })),
        },
      },
      include: {
        items: { include: { event: true, andataSlot: true, ritornoSlot: true } },
      },
    });

    return booking;
  });
}

/**
 * Conferma una prenotazione come pagata: converte l'hold in posto
 * confermato, genera il codice identificativo. Idempotente: se la
 * prenotazione è già PAID (es. webhook ricevuto due volte, oppure sia il
 * redirect di ritorno da PayPal sia il webhook arrivano quasi insieme),
 * restituisce semplicemente la prenotazione già confermata senza rifare
 * il lavoro né generare un secondo codice.
 */
async function confirmBookingPaid(bookingId, { paymentMethod, paymentRef }) {
  return prisma.$transaction(async (tx) => {
    const booking = await tx.booking.findUnique({
      where: { id: bookingId },
      include: { items: true },
    });
    if (!booking) throw new Error(`Booking ${bookingId} non trovato`);
    if (booking.status === 'PAID') {
      const full = await tx.booking.findUnique({
        where: { id: bookingId },
        include: { items: { include: { event: true, andataSlot: true, ritornoSlot: true } } },
      });
      return { booking: full, alreadyPaid: true };
    }
    if (booking.status !== 'PENDING') {
      throw new Error(`Booking ${bookingId} in stato inatteso: ${booking.status}`);
    }

    for (const item of booking.items) {
      if (item.andataSlotId) {
        await tx.transferSlot.update({
          where: { id: item.andataSlotId },
          data: { capacityHeld: { decrement: item.numPeople }, capacityBooked: { increment: item.numPeople } },
        });
      }
      if (item.ritornoSlotId) {
        await tx.transferSlot.update({
          where: { id: item.ritornoSlotId },
          data: { capacityHeld: { decrement: item.numPeople }, capacityBooked: { increment: item.numPeople } },
        });
      }
    }

    const code = await generateUniqueBookingCode(tx);

    const updated = await tx.booking.update({
      where: { id: bookingId },
      data: { status: 'PAID', code, paymentMethod, paymentRef, paidAt: new Date() },
      include: { items: { include: { event: true, andataSlot: true, ritornoSlot: true } } },
    });
    return { booking: updated, alreadyPaid: false };
  });
}

/**
 * Marca una prenotazione come fallita/annullata e rilascia subito i posti
 * bloccati (invece di aspettare i 15 minuti dell'hold), usato quando
 * Stripe/PayPal ci dicono esplicitamente che il pagamento non è andato a
 * buon fine o è stato annullato dall'utente.
 */
async function markBookingFailed(bookingId) {
  return prisma.$transaction(async (tx) => {
    const booking = await tx.booking.findUnique({ where: { id: bookingId }, include: { items: true } });
    if (!booking || booking.status !== 'PENDING') return booking;

    for (const item of booking.items) {
      if (item.andataSlotId) {
        await tx.transferSlot.update({ where: { id: item.andataSlotId }, data: { capacityHeld: { decrement: item.numPeople } } });
      }
      if (item.ritornoSlotId) {
        await tx.transferSlot.update({ where: { id: item.ritornoSlotId }, data: { capacityHeld: { decrement: item.numPeople } } });
      }
    }

    return tx.booking.update({ where: { id: bookingId }, data: { status: 'FAILED' } });
  });
}

async function getBookingById(bookingId) {
  return prisma.booking.findUnique({
    where: { id: bookingId },
    include: { items: { include: { event: true, andataSlot: true, ritornoSlot: true } } },
  });
}

module.exports = {
  reserveCart,
  confirmBookingPaid,
  markBookingFailed,
  getBookingById,
  AvailabilityError,
  HOLD_MINUTES,
};
