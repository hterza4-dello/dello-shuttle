// whatsapp.js — WhatsApp integration via whatsapp-web.js
// Uses a regular WhatsApp account (not Business API), authenticated via QR code.
// Session is persisted locally so QR is only needed once.

const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
require('dotenv').config();

const GROUP_ID = process.env.WHATSAPP_GROUP_ID; // e.g. "120363XXXXXXXX@g.us"

// Create WhatsApp client with local session persistence
const client = new Client({
  authStrategy: new LocalAuth({ dataPath: './.wwebjs_auth' }),
  puppeteer: {
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--single-process',
      '--disable-gpu'
    ]
  }
});

let isReady = false;

// Display QR code in terminal for first-time authentication
client.on('qr', (qr) => {
  console.log('\n[WhatsApp] Scan the QR code below to authenticate:\n');
  qrcode.generate(qr, { small: true });
});

// Mark client as ready once authenticated
client.on('ready', () => {
  isReady = true;
  console.log('[WhatsApp] Client is ready and connected.');
});

// Handle authentication failure
client.on('auth_failure', (msg) => {
  console.error('[WhatsApp] Authentication failed:', msg);
  isReady = false;
});

// Handle disconnection
client.on('disconnected', (reason) => {
  console.warn('[WhatsApp] Client disconnected:', reason);
  isReady = false;
});

/**
 * Initialize the WhatsApp client.
 * Call this once when the server starts.
 */
function initWhatsApp() {
  if (!GROUP_ID || GROUP_ID === 'XXXXXXXXXX@g.us') {
    console.warn('[WhatsApp] WHATSAPP_GROUP_ID not configured — WhatsApp notifications disabled.');
    return;
  }
  console.log('[WhatsApp] Initializing client...');
  client.initialize();
}

/**
 * Send a text message to the configured WhatsApp group.
 * @param {string} text - Message to send
 */
async function sendToGroup(text) {
  if (!GROUP_ID || GROUP_ID === 'XXXXXXXXXX@g.us') {
    console.warn('[WhatsApp] Group ID not configured — skipping message.');
    console.log('[WhatsApp] Message that would have been sent:\n', text);
    return { skipped: true };
  }

  if (!isReady) {
    console.warn('[WhatsApp] Client not ready — skipping message to group.');
    return { skipped: true };
  }

  try {
    await client.sendMessage(GROUP_ID, text);
    console.log('[WhatsApp] Message sent to group', GROUP_ID);
  } catch (err) {
    console.error('[WhatsApp] Failed to send message:', err.message);
    throw err;
  }
}

/**
 * Send WhatsApp notification for a Hotel → FLL booking.
 */
async function notifyHotelToFll(reservation) {
  const { name, room, passengers, time_slot, phone } = reservation;

  // Convert 24h time to 12h for display
  const [hour, minute] = time_slot.split(':').map(Number);
  const period = hour < 12 ? 'AM' : 'PM';
  const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  const displayTime = `${displayHour}:${String(minute).padStart(2, '0')} ${period}`;

  const text =
    `🏨➡️✈️ New Booking — Hotel→FLL\n` +
    `Name: ${name}\n` +
    `Room: ${room}\n` +
    `Passengers: ${passengers}\n` +
    `Time: ${displayTime}\n` +
    `Tel: ${phone}`;

  return sendToGroup(text);
}

/**
 * Send WhatsApp notification for a FLL → Hotel pickup request.
 */
async function notifyFllToHotel(reservation) {
  const { name, letter, passengers, phone } = reservation;

  const text =
    `✈️➡️🏨 FLL Pick-up Request\n` +
    `Name: ${name}\n` +
    `Letter: ${letter}\n` +
    `Passengers: ${passengers}\n` +
    `Tel: ${phone}`;

  return sendToGroup(text);
}

module.exports = { initWhatsApp, notifyHotelToFll, notifyFllToHotel };
