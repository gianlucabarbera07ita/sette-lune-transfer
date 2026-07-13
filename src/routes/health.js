const express = require('express');
const router = express.Router();
const prisma = require('../db');

// Endpoint usato da Render per sapere se il servizio è vivo e riavviarlo
// automaticamente in caso di crash. Controlla anche che il database
// risponda, così un problema di connessione al DB viene rilevato subito.
router.get('/health', async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.status(200).json({ status: 'ok' });
  } catch (err) {
    res.status(503).json({ status: 'error', detail: err.message });
  }
});

module.exports = router;
