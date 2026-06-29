/**
 * server.js
 * Main entry point for the Hotel Dello Shuttle backend.
 * Serves static frontend files and mounts API routes.
 */

require('dotenv').config();

const express     = require('express');
const cors        = require('cors');
const path        = require('path');
const rateLimit   = require('express-rate-limit');
const { initWhatsApp } = require('./services/whatsapp');

const reservationRoutes = require('./routes/reservations');
const adminRoutes       = require('./routes/admin');

const app  = express();
const PORT = process.env.PORT || 3000;

// ─── Middleware ───────────────────────────────────────────────────────────────

app.use(cors({
  origin: [
    'https://determinaxion.com',
    'http://localhost:3000',
  ],
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rate limiting — protect reservation endpoint from abuse
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50,
  message: { error: 'Too many requests. Please try again later.' },
});
app.use('/api/reservations', limiter);

// Serve static frontend files
app.use(express.static(path.join(__dirname, '../frontend')));

// ─── API Routes ───────────────────────────────────────────────────────────────

app.use('/api/reservations', reservationRoutes);
app.use('/api/admin',        adminRoutes);

// Health check
app.get('/api/health', (req, res) => res.json({ status: 'ok', ts: new Date().toISOString() }));

// ─── SPA Fallback (serve index.html for any unknown route) ───────────────────

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// ─── Start Server ─────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`\n🏨 Hotel Dello Shuttle — running on http://localhost:${PORT}`);
  console.log(`   Admin panel: http://localhost:${PORT}/admin\n`);
});

// ─── Initialize WhatsApp ──────────────────────────────────────────────────────
// Only initialize if WhatsApp group ID is configured
if (process.env.WHATSAPP_GROUP_ID && process.env.WHATSAPP_GROUP_ID !== 'XXXXXXXXXX@g.us') {
  initWhatsApp();
} else {
  console.log('⚠️  WhatsApp not configured — skipping initialization.');
}
