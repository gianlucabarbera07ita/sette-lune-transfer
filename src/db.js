// Singleton del client Prisma. Va sempre importato da qui (mai istanziato
// altrove) per evitare di aprire troppe connessioni al database durante
// lo sviluppo con hot-reload o su Render con più richieste concorrenti.
const { PrismaClient } = require('@prisma/client');

const globalForPrisma = globalThis;

const prisma =
  globalForPrisma.__prisma ||
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV === 'development') {
  globalForPrisma.__prisma = prisma;
}

module.exports = prisma;
