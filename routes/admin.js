/**
 * routes/admin.js
 * Admin API endpoints (password-protected via middleware).
 *   GET  /api/admin/reservations?date=YYYY-MM-DD&direction=hotel_to_fll|fll_to_hotel
 *   GET  /api/admin/slots?date=YYYY-MM-DD
 *   POST /api/admin/cancel/:id
 *   POST /api/admin/reschedule/:id
 *   POST /api/admin/login
 */

const express = require('express');
const router  = express.Router();
const db      = require('../db/schema');
require('dotenv').config();

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'dello2024';

// ─── Auth middleware ──────────────────────────────────────────────────────────

function requireAdmin(req, res, next) {
  const token = req.headers['x-admin-token'] || req.query.token;
  if (token === ADMIN_PASSWORD) return next();
  return res.status(401).json({ error: 'Unauthorized.' });
}

// ─── POST /api/admin/login ────────────────────────────────────────────────────

router.post('/login', (req, res) => {
  const { password } = req.body;
  if (password === ADMIN_PASSWORD) {
    res.json({ success: true, token: ADMIN_PASSWORD });
  } else {
    res.status(401).json({ error: 'Invalid password.' });
  }
});

// ─── GET /api/admin/reservations ─────────────────────────────────────────────

router.get('/reservations', requireAdmin, (req, res) => {
  const date      = req.query.date      || new Date().toISOString().slice(0, 10);
  const direction = req.query.direction || null; // optional filter

  let query = `SELECT * FROM reservations WHERE date = ?`;
  const params = [date];

  if (direction) {
    query += ` AND direction = ?`;
    params.push(direction);
  }

  query += ` ORDER BY slot_time ASC, requested_at ASC`;

  const rows = db.prepare(query).all(...params);
  res.json({ date, count: rows.length, reservations: rows });
});

// ─── GET /api/admin/slots ─────────────────────────────────────────────────────

router.get('/slots', requireAdmin, (req, res) => {
  const date = req.query.date || new Date().toISOString().slice(0, 10);

  // Generate all slots and attach passenger counts
  const slots = [];
  const addSlot = (h, m) => `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;

  for (let h = 4; h <= 23; h++) {
    if (h === 4) { slots.push(addSlot(4, 30)); continue; }
    slots.push(addSlot(h, 0));
    slots.push(addSlot(h, 30));
  }
  slots.push('00:30');

  const result = slots.map((slot) => {
    const row = db.prepare(`
      SELECT COALESCE(SUM(passengers), 0) AS used
      FROM reservations
      WHERE date = ? AND slot_time = ? AND direction = 'hotel_to_fll' AND status = 'active'
    `).get(date, slot);
    return { time: slot, used: row.used, available: 13 - row.used };
  });

  res.json({ date, slots: result });
});

// ─── POST /api/admin/cancel/:id ───────────────────────────────────────────────

router.post('/cancel/:id', requireAdmin, (req, res) => {
  const { id } = req.params;
  const info = db.prepare(`
    UPDATE reservations SET status = 'cancelled' WHERE id = ? AND status = 'active'
  `).run(id);

  if (info.changes === 0) {
    return res.status(404).json({ error: 'Reservation not found or already cancelled.' });
  }
  res.json({ success: true, message: `Reservation #${id} cancelled.` });
});

// ─── POST /api/admin/reschedule/:id ──────────────────────────────────────────

router.post('/reschedule/:id', requireAdmin, (req, res) => {
  const { id }       = req.params;
  const { slot_time } = req.body;

  if (!slot_time) {
    return res.status(400).json({ error: 'slot_time is required.' });
  }

  // Get the reservation
  const reservation = db.prepare(`SELECT * FROM reservations WHERE id = ?`).get(id);
  if (!reservation) return res.status(404).json({ error: 'Reservation not found.' });
  if (reservation.status === 'cancelled') {
    return res.status(400).json({ error: 'Cannot reschedule a cancelled reservation.' });
  }

  // Check capacity on new slot
  const used = db.prepare(`
    SELECT COALESCE(SUM(passengers), 0) AS total
    FROM reservations
    WHERE date = ? AND slot_time = ? AND direction = 'hotel_to_fll'
      AND status = 'active' AND id != ?
  `).get(reservation.date, slot_time, id).total;

  if (used + reservation.passengers > 13) {
    return res.status(409).json({ error: `New slot is full (${used}/13 booked).` });
  }

  db.prepare(`UPDATE reservations SET slot_time = ? WHERE id = ?`).run(slot_time, id);
  res.json({ success: true, message: `Reservation #${id} moved to ${slot_time}.` });
});

module.exports = router;
