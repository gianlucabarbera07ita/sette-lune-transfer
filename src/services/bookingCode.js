// Generazione del codice identificativo di prenotazione (es. SL-7K2QX9).
// Pure function, nessuna dipendenza esterna: testabile senza npm install.

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // niente 0/O/1/I per evitare ambiguità a voce

function randomCode(length = 6) {
  let out = '';
  for (let i = 0; i < length; i++) {
    out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return out;
}

function generateBookingCode() {
  return `SL-${randomCode(6)}`;
}

// Genera un codice garantito univoco, riprovando in caso di collisione
// (estremamente improbabile ma controlliamo comunque contro il DB).
async function generateUniqueBookingCode(prisma) {
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = generateBookingCode();
    const existing = await prisma.booking.findUnique({ where: { code } });
    if (!existing) return code;
  }
  throw new Error('Impossibile generare un codice prenotazione univoco dopo 10 tentativi');
}

module.exports = { generateBookingCode, generateUniqueBookingCode };
