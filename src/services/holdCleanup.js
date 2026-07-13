const prisma = require('../db');

/**
 * Libera i posti bloccati dalle prenotazioni PENDING il cui hold di 15
 * minuti è scaduto senza che il pagamento sia arrivato (utente che ha
 * abbandonato il checkout, pagamento mai completato, ecc.).
 * Va chiamata periodicamente (vedi setInterval in server.js).
 */
async function releaseExpiredHolds() {
  const expired = await prisma.booking.findMany({
    where: { status: 'PENDING', holdExpiresAt: { lt: new Date() } },
    include: { items: true },
  });

  for (const booking of expired) {
    try {
      await prisma.$transaction(async (tx) => {
        for (const item of booking.items) {
          if (item.andataSlotId) {
            await tx.transferSlot.update({
              where: { id: item.andataSlotId },
              data: { capacityHeld: { decrement: item.numPeople } },
            });
          }
          if (item.ritornoSlotId) {
            await tx.transferSlot.update({
              where: { id: item.ritornoSlotId },
              data: { capacityHeld: { decrement: item.numPeople } },
            });
          }
        }
        await tx.booking.update({ where: { id: booking.id }, data: { status: 'EXPIRED' } });
      });
    } catch (err) {
      // Non blocchiamo il ciclo per un singolo errore: verrà ritentato al
      // prossimo giro se il problema persiste, e loggato per essere notato.
      console.error(`Errore rilasciando hold scaduto per booking ${booking.id}:`, err);
    }
  }

  return expired.length;
}

function startHoldCleanupJob(intervalMs = 60 * 1000) {
  const timer = setInterval(() => {
    releaseExpiredHolds().catch((err) => console.error('Errore nel job di pulizia hold:', err));
  }, intervalMs);
  // Non deve impedire al processo di terminare pulitamente
  if (timer.unref) timer.unref();
  return timer;
}

module.exports = { releaseExpiredHolds, startHoldCleanupJob };
