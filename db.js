// db.js — SQLite database setup and schema initialization
const Database = require('better-sqlite3');
const path = require('path');
require('dotenv').config();

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'dello.db');

// Open (or create) the SQLite database
const db = new Database(DB_PATH);

// Enable WAL mode for better concurrent read performance
db.pragma('journal_mode = WAL');

// Create the reservations table if it doesn't exist
db.exec(`
  CREATE TABLE IF NOT EXISTS reservations (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    direction        TEXT    NOT NULL,        -- 'hotel_to_fll' or 'fll_to_hotel'
    name             TEXT    NOT NULL,
    phone            TEXT    NOT NULL,
    room             TEXT,                    -- hotel_to_fll only
    letter           TEXT,                    -- fll_to_hotel only ('E' or 'F')
    passengers       INTEGER NOT NULL,
    time_slot        TEXT,                    -- hotel_to_fll: 'HH:MM' (24h)
    date             TEXT    NOT NULL,        -- YYYY-MM-DD (local date of reservation)
    request_datetime TEXT,                    -- fll_to_hotel: ISO timestamp
    status           TEXT    DEFAULT 'active',-- 'active' or 'cancelled'
    created_at       TEXT    DEFAULT (datetime('now'))
  );
`);

module.exports = db;
