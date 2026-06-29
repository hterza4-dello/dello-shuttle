/**
 * db/schema.js
 * Initializes SQLite database and creates tables if they don't exist.
 */

const Database = require('better-sqlite3');
const path = require('path');
require('dotenv').config();

const DB_PATH = process.env.DB_PATH || './db/dello.db';

const db = new Database(path.resolve(DB_PATH));

// Enable WAL mode for better concurrent read performance
db.pragma('journal_mode = WAL');

// ─── Create reservations table ───────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS reservations (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    direction   TEXT    NOT NULL CHECK(direction IN ('hotel_to_fll','fll_to_hotel')),
    name        TEXT    NOT NULL,
    phone       TEXT    NOT NULL,
    room        TEXT,               -- hotel room number (hotel_to_fll only)
    letter      TEXT,               -- pickup letter E or F (fll_to_hotel only)
    terminal    INTEGER,            -- terminal number 1-5 (fll_to_hotel only)
    passengers  INTEGER NOT NULL CHECK(passengers >= 1 AND passengers <= 13),
    slot_time   TEXT,               -- HH:MM format (hotel_to_fll only)
    date        TEXT    NOT NULL,   -- YYYY-MM-DD
    requested_at TEXT   NOT NULL,   -- ISO timestamp
    status      TEXT    NOT NULL DEFAULT 'active' CHECK(status IN ('active','cancelled')),
    notes       TEXT
  );
`);

// ─── Index for fast slot queries ─────────────────────────────────────────────
db.exec(`
  CREATE INDEX IF NOT EXISTS idx_reservations_date_slot
  ON reservations(date, slot_time, direction, status);
`);

module.exports = db;
