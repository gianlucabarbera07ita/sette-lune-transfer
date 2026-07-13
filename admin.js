const express = require('express');
const router = express.Router();
const prisma = require('../db');
const { formatDateLong, formatTime } = require('../services/format');

function requireAdmin(req, res, next) {
  if (req.session && req.session.isAdmin) return next();
  return res.redirect('/admin/login');
}

router.get('/login', (req, res) => {
  res.render('admin/login', { error: null });
});

router.post('/login', (req, res) => {
  const { password } = req.body;
  if (!process.env.ADMIN_PASSWORD) {
    return res.render('admin/login', { error: 'ADMIN_PASSWORD non configurata sul server.' });
  }
  if (password === process.env.ADMIN_PASSWORD) {
    req.session.isAdmin = true;
    return res.redirect('/admin');
  }
  res.render('admin/login', { error: 'Password errata' });
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/admin/login'));
});

router.get('/', requireAdmin, async (req, res, next) => {
  try {
    const events = await prisma.event.findMany({
      orderBy: { sortOrder: 'asc' },
      include: { slots: { orderBy: { departureAt: 'asc' } } },
    });

    const [pendingCount, paidCount] = await Promise.all([
      prisma.booking.count({ where: { status: 'PENDING' } }),
      prisma.booking.count({ where: { status: 'PAID' } }),
    ]);

    res.render('admin/dashboard', {
      events,
      pendingCount,
      paidCount,
      formatDateLong,
      formatTime,
    });
  } catch (err) {
    next(err);
  }
});

async function getSlotBookings(slotId) {
  return prisma.bookingItem.findMany({
    where: {
      OR: [{ andataSlotId: slotId }, { ritornoSlotId: slotId }],
      booking: { status: 'PAID' },
    },
    include: { booking: true, event: true },
    orderBy: { createdAt: 'asc' },
  });
}

router.get('/slot/:id', requireAdmin, async (req, res, next) => {
  try {
    const slotId = parseInt(req.params.id, 10);
    const slot = await prisma.transferSlot.findUnique({ where: { id: slotId }, include: { event: true } });
    if (!slot) return res.status(404).send('Corsa non trovata');
    const bookingItems = await getSlotBookings(slotId);
    res.render('admin/slot', { slot, bookingItems, formatDateLong, formatTime });
  } catch (err) {
    next(err);
  }
});

function csvEscape(value) {
  const str = String(value === undefined || value === null ? '' : value);
  if (/[",\n;]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

const TYPE_LABELS = {
  SOLO_ANDATA: 'Solo andata',
  SOLO_RITORNO: 'Solo ritorno',
  ANDATA_RITORNO: 'Andata e ritorno',
};

router.get('/slot/:id/export.csv', requireAdmin, async (req, res, next) => {
  try {
    const slotId = parseInt(req.params.id, 10);
    const slot = await prisma.transferSlot.findUnique({ where: { id: slotId }, include: { event: true } });
    if (!slot) return res.status(404).send('Corsa non trovata');
    const bookingItems = await getSlotBookings(slotId);

    const header = ['Codice', 'Nome', 'Email', 'Persone', 'Tipo', 'Data prenotazione'];
    const rows = bookingItems.map((item) => [
      item.booking.code,
      item.booking.customerName,
      item.booking.customerEmail,
      item.numPeople,
      TYPE_LABELS[item.type] || item.type,
      item.booking.paidAt ? item.booking.paidAt.toISOString() : '',
    ]);

    const csv = [header, ...rows].map((row) => row.map(csvEscape).join(';')).join('\n');
    const filename = `${slot.event.slug}-${slot.direction.toLowerCase()}-${slotId}.csv`;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send('﻿' + csv); // BOM esplicito, per aprire correttamente gli accenti in Excel
  } catch (err) {
    next(err);
  }
});

module.exports = router;
