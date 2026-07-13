const prisma = require('../db');

function withSeatsAvailable(slot) {
  return {
    ...slot,
    seatsAvailable: Math.max(0, slot.capacityTotal - slot.capacityBooked - slot.capacityHeld),
  };
}

function formatEventAvailability(event) {
  const slots = event.slots.map(withSeatsAvailable);
  return {
    ...event,
    andataSlots: slots.filter((s) => s.direction === 'ANDATA'),
    ritornoSlots: slots.filter((s) => s.direction === 'RITORNO'),
  };
}

async function getEventsWithAvailability() {
  const events = await prisma.event.findMany({
    orderBy: { sortOrder: 'asc' },
    include: {
      slots: { orderBy: { departureAt: 'asc' } },
      priceRules: true,
    },
  });
  return events.map(formatEventAvailability);
}

async function getEventById(eventId) {
  const event = await prisma.event.findUnique({
    where: { id: eventId },
    include: {
      slots: { orderBy: { departureAt: 'asc' } },
      priceRules: true,
    },
  });
  if (!event) return null;
  return formatEventAvailability(event);
}

// Aggiorna in modo atomico (safe sotto concorrenza) il conteggio posti
// "in attesa di pagamento" di una corsa, solo se c'è abbastanza capienza
// libera. Usa una UPDATE condizionale: Postgres blocca la riga durante
// l'update, quindi due richieste concorrenti sull'ultimo posto non possono
// entrambe avere successo.
async function tryHoldSlot(tx, slotId, numPeople) {
  const affected = await tx.$executeRaw`
    UPDATE "TransferSlot"
    SET "capacityHeld" = "capacityHeld" + ${numPeople}
    WHERE id = ${slotId}
      AND ("capacityTotal" - "capacityBooked" - "capacityHeld") >= ${numPeople}
  `;
  return affected === 1;
}

module.exports = {
  getEventsWithAvailability,
  getEventById,
  formatEventAvailability,
  withSeatsAvailable,
  tryHoldSlot,
};
