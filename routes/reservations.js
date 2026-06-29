/**
 * routes/reservations.js
 * Handles all reservation endpoints:
 *   POST /api/reservations/hotel-to-fll
 *   POST /api/reservations/fll-to-hotel
 *   GET  /api/slots?date=YYYY-MM-DD
 */

const express = require('express');
const router  = express.Router();
const db      = require('../db/schema');
const { sendSMS, buildHotelToFLLSMS, buildFLLToHotelSMS } = require('../services/sms');
const { sendToGroup, buildHotelToFLLWA, buildFLLToHotelWA } = require('../services/whatsapp');

const MAX_CAPACITY = 13;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Return today's date as YYYY-MM-DD in local server time */
function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

/** Count passengers already booked on a specific date + slot */
function slotCount(date, slot_time) {
  const row = db.prepare(`
    SELECT COALESCE(SUM(passengers), 0) AS total
    FROM reservations
    WHERE date = ? AND slot_time = ? AND direction = 'hotel_to_fll' AND status = 'active'
  `).get(date, slot_time);
  return row.total;
}

/** Find next available slot on date starting after given slot_time */
function findNextAvailableSlot(date, afterSlot, neededPassengers) {
  const slots = generateSlots();
  const startIdx = slots.indexOf(afterSlot);
  for (let i = startIdx + 1; i < slots.length; i++) {
    const used = slotCount(date, slots[i]);
    if (used + neededPassengers <= MAX_CAPACITY) return slots[i];
  }
  return null;
}

/** Generate all 49 daily slots (04:30 → 00:30) */
function generateSlots() {
  const slots = [];
  // 04:30 AM to 23:30 PM
  for (let h = 4; h <= 23; h++) {
    slots.push(`${String(h).padStart(2,'0')}:00`);
    slots.push(`${String(h).padStart(2,'0')}:30`);
  }
  // Remove 04:00 (start at 04:30)
  slots.shift();
  // Add 00:30 (midnight)
  slots.push('00:30');
  return slots;
}

/** Map terminal number to pickup letter */
function terminalToLetter(terminal) {
  const t = parseInt(terminal);
  if (t === 1 || t === 2) return 'E';
  if (t === 3 || t === 4) return 'F';
  return null; // Terminal 5 = under construction
}

// ─── Validators ───────────────────────────────────────────────────────────────

function validatePhone(phone) {
  return /^\+?[1-9]\d{7,14}$/.test(phone.replace(/[\s\-()]/g, ''));
}

function validatePassengers(n) {
  return Number.isInteger(n) && n >= 1 && n <= MAX_CAPACITY;
}

// ─── GET /api/slots ───────────────────────────────────────────────────────────

router.get('/slots', (req, res) => {
  const date = req.query.date || todayDate();
  const slots = generateSlots();

  const result = slots.map((slot) => {
    const used = slotCount(date, slot);
    return {
      time:      slot,
      used,
      available: MAX_CAPACITY - used,
      full:      used >= MAX_CAPACITY,
    };
  });

  res.json({ date, slots: result });
});

// ─── POST /api/reservations/hotel-to-fll ─────────────────────────────────────

router.post('/hotel-to-fll', async (req, res) => {
  const { name, phone, room, passengers, slot_time, date } = req.body;

  // --- Validation ---
  if (!name || !phone || !room || !passengers || !slot_time) {
    return res.status(400).json({ error: 'All fields are required.' });
  }
  if (!validatePhone(phone)) {
    return res.status(400).json({ error: 'Invalid phone number format.' });
  }
  const pax = parseInt(passengers);
  if (!validatePassengers(pax)) {
    return res.status(400).json({ error: 'Passengers must be between 1 and 13.' });
  }
  const validSlots = generateSlots();
  if (!validSlots.includes(slot_time)) {
    return res.status(400).json({ error: 'Invalid time slot.' });
  }

  const bookingDate = date || todayDate();

  // --- Check capacity ---
  const used = slotCount(bookingDate, slot_time);
  if (used + pax > MAX_CAPACITY) {
    const nextSlot = findNextAvailableSlot(bookingDate, slot_time, pax);
    return res.status(409).json({
      error:     'slot_full',
      message:   `This slot is full (${used}/${MAX_CAPACITY} passengers booked).`,
      nextSlot,
    });
  }

  // --- Save reservation ---
  const stmt = db.prepare(`
    INSERT INTO reservations
      (direction, name, phone, room, passengers, slot_time, date, requested_at, status)
    VALUES ('hotel_to_fll', ?, ?, ?, ?, ?, ?, ?, 'active')
  `);
  const info = stmt.run(
    name.trim(), phone.trim(), room.trim(), pax, slot_time, bookingDate,
    new Date().toISOString()
  );

  // --- Notifications (fire and forget) ---
  const data = { name, phone, room, passengers: pax, slot_time };
  sendSMS(phone, buildHotelToFLLSMS(data)).catch(console.error);
  sendToGroup(buildHotelToFLLWA(data)).catch(console.error);

  res.status(201).json({
    success: true,
    id: info.lastInsertRowid,
    message: `Reservation confirmed for ${slot_time}. A confirmation SMS has been sent.`,
  });
});

// ─── POST /api/reservations/fll-to-hotel ─────────────────────────────────────

router.post('/fll-to-hotel', async (req, res) => {
  const { name, phone, terminal, passengers, date } = req.body;

  // --- Validation ---
  if (!name || !phone || !terminal || !passengers) {
    return res.status(400).json({ error: 'All fields are required.' });
  }
  if (!validatePhone(phone)) {
    return res.status(400).json({ error: 'Invalid phone number format.' });
  }
  const pax = parseInt(passengers);
  if (!validatePassengers(pax)) {
    return res.status(400).json({ error: 'Passengers must be between 1 and 13.' });
  }
  const t = parseInt(terminal);
  if (![1,2,3,4,5].includes(t)) {
    return res.status(400).json({ error: 'Invalid terminal number.' });
  }

  // Terminal 5 — under construction
  if (t === 5) {
    return res.status(422).json({
      error:   'terminal_5',
      message: 'Terminal 5 is currently under construction. Please call the hotel directly for assistance.',
    });
  }

  const letter      = terminalToLetter(t);
  const bookingDate = date || todayDate();

  // --- Check overall FLL→Hotel capacity for that day (no fixed slots, just cap per trip) ---
  // We track FLL requests with slot_time NULL; capacity check is per active ride batch.
  // For simplicity: count active FLL→Hotel pax today and flag if a new batch needed.
  // (Hotel staff dispatches manually based on WA group notifications.)

  // --- Save reservation ---
  const stmt = db.prepare(`
    INSERT INTO reservations
      (direction, name, phone, letter, terminal, passengers, date, requested_at, status)
    VALUES ('fll_to_hotel', ?, ?, ?, ?, ?, ?, ?, 'active')
  `);
  const info = stmt.run(
    name.trim(), phone.trim(), letter, t, pax, bookingDate,
    new Date().toISOString()
  );

  // --- Notifications ---
  const data = { name, phone, letter, passengers: pax };
  sendSMS(phone, buildFLLToHotelSMS(data)).catch(console.error);
  sendToGroup(buildFLLToHotelWA(data)).catch(console.error);

  res.status(201).json({
    success: true,
    id: info.lastInsertRowid,
    letter,
    message: `Your pickup request has been received. Head to Arrivals Letter ${letter}. A confirmation SMS has been sent.`,
  });
});

module.exports = router;
