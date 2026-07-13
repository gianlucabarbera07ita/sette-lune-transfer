// Popola (in modo idempotente: si può eseguire più volte senza duplicare
// o azzerare nulla) gli eventi, le corse e i prezzi del piano trasporti.
// Viene eseguito automaticamente ad ogni deploy (vedi "release" in
// package.json), così anche se lo schema o i dati vengono aggiornati in
// futuro non serve intervenire a mano su Render.
//
// NOTA SUGLI ORARI DOPO MEZZANOTTE: alcune corse di ritorno (e alcune di
// andata dell'8 agosto) avvengono tecnicamente nelle prime ore del giorno
// SUCCESSIVO rispetto alla data "etichetta" dell'evento (es. il ritorno
// delle 00:00 e 01:30 del 6 agosto è nella notte tra il 6 e il 7 agosto).
// Le date qui sotto riportano quindi la data di calendario REALE della
// partenza, non la data dell'evento. Verificare con l'organizzatore prima
// del lancio che questa interpretazione corrisponda alla realtà operativa.

const prisma = require('../src/db');

function dt(dateStr, timeStr) {
  // Sicilia in agosto è sempre CEST (UTC+2), nessun problema di ora legale.
  return new Date(`${dateStr}T${timeStr}:00+02:00`);
}

async function upsertEvent(data) {
  return prisma.event.upsert({
    where: { slug: data.slug },
    update: data,
    create: data,
  });
}

async function upsertSlot(eventId, direction, departureAt, capacityTotal) {
  return prisma.transferSlot.upsert({
    where: { eventId_direction_departureAt: { eventId, direction, departureAt } },
    update: { capacityTotal },
    create: { eventId, direction, departureAt, capacityTotal },
  });
}

async function upsertPriceRule(eventId, type, priceEuroCents) {
  return prisma.priceRule.upsert({
    where: { eventId_type: { eventId, type } },
    update: { priceEuroCents },
    create: { eventId, type, priceEuroCents },
  });
}

async function main() {
  // --- Evento 1: Giovedì 6 agosto - Agriturismo Tenute Pispisa ---
  const ev1 = await upsertEvent({
    slug: 'giovedi-6-agosto-tenute-pispisa',
    labelDate: dt('2026-08-06', '00:00'),
    nameIt: 'Agriturismo Tenute Pispisa',
    nameEn: 'Tenute Pispisa Farmhouse',
    nameEs: 'Agriturismo Tenute Pispisa',
    descriptionIt: 'Giovedì 6 agosto',
    descriptionEn: 'Thursday 6 August',
    descriptionEs: 'Jueves 6 de agosto',
    travelMinutes: 50,
    sortOrder: 1,
    isSecretLocation: false,
  });

  for (const time of ['11:30', '12:20', '13:10', '14:00', '14:50', '15:40', '16:30', '17:20']) {
    await upsertSlot(ev1.id, 'ANDATA', dt('2026-08-06', time), 16);
  }
  await upsertSlot(ev1.id, 'RITORNO', dt('2026-08-06', '22:00'), 32);
  await upsertSlot(ev1.id, 'RITORNO', dt('2026-08-07', '00:00'), 32);
  await upsertSlot(ev1.id, 'RITORNO', dt('2026-08-07', '01:30'), 32);

  await upsertPriceRule(ev1.id, 'SOLO_ANDATA', 2000);
  await upsertPriceRule(ev1.id, 'SOLO_RITORNO', 2000);
  await upsertPriceRule(ev1.id, 'ANDATA_RITORNO', 3000);

  // --- Evento 2: Venerdì 7 agosto - Il Baglio, Fontanasalsa ---
  const ev2 = await upsertEvent({
    slug: 'venerdi-7-agosto-il-baglio',
    labelDate: dt('2026-08-07', '00:00'),
    nameIt: 'Il Baglio – Fontanasalsa',
    nameEn: 'Il Baglio – Fontanasalsa',
    nameEs: 'Il Baglio – Fontanasalsa',
    descriptionIt: 'Venerdì 7 agosto',
    descriptionEn: 'Friday 7 August',
    descriptionEs: 'Viernes 7 de agosto',
    travelMinutes: 20,
    sortOrder: 2,
    isSecretLocation: false,
  });

  for (const time of ['10:00', '10:30', '12:30', '13:00', '17:00', '17:30', '18:00', '18:30', '19:00', '19:30']) {
    await upsertSlot(ev2.id, 'ANDATA', dt('2026-08-07', time), 16);
  }
  for (const time of ['05:00', '06:00', '07:00', '08:00']) {
    await upsertSlot(ev2.id, 'RITORNO', dt('2026-08-08', time), 32);
  }

  await upsertPriceRule(ev2.id, 'SOLO_ANDATA', 1200);
  await upsertPriceRule(ev2.id, 'SOLO_RITORNO', 1200);
  await upsertPriceRule(ev2.id, 'ANDATA_RITORNO', 2000);

  // --- Evento 3: Sabato 8 agosto - Secret Location, Fontanasalsa ---
  const ev3 = await upsertEvent({
    slug: 'sabato-8-agosto-secret-location',
    labelDate: dt('2026-08-08', '00:00'),
    nameIt: 'Secret Location – Fontanasalsa',
    nameEn: 'Secret Location – Fontanasalsa',
    nameEs: 'Secret Location – Fontanasalsa',
    descriptionIt: 'Sabato 8 agosto — la posizione esatta verrà comunicata il giorno stesso.',
    descriptionEn: 'Saturday 8 August — the exact location will be revealed on the day.',
    descriptionEs: 'Sábado 8 de agosto — la ubicación exacta se revelará el mismo día.',
    travelMinutes: 20,
    sortOrder: 3,
    isSecretLocation: true,
  });

  for (const time of ['22:30', '23:00']) {
    await upsertSlot(ev3.id, 'ANDATA', dt('2026-08-08', time), 16);
  }
  for (const time of ['00:00', '01:00', '02:00']) {
    await upsertSlot(ev3.id, 'ANDATA', dt('2026-08-09', time), 16);
  }
  for (const time of ['04:30', '05:30', '06:30', '07:30']) {
    await upsertSlot(ev3.id, 'RITORNO', dt('2026-08-09', time), 32);
  }

  await upsertPriceRule(ev3.id, 'SOLO_ANDATA', 1200);
  await upsertPriceRule(ev3.id, 'SOLO_RITORNO', 1200);
  await upsertPriceRule(ev3.id, 'ANDATA_RITORNO', 2000);

  console.log('Seed completato: 3 eventi, corse e prezzi creati/aggiornati.');
}

main()
  .catch((err) => {
    console.error('Errore durante il seed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
