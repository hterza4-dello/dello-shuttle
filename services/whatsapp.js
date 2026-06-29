/**
 * services/whatsapp.js
 * WhatsApp integration via whatsapp-web.js (regular WA account, QR auth).
 * On first run, scan the QR code printed in the terminal.
 */

const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
require('dotenv').config();

const GROUP_ID = process.env.WHATSAPP_GROUP_ID; // e.g. "XXXXXXXXXX@g.us"

let client = null;
let isReady = false;

/**
 * Initialize the WhatsApp client (call once at server startup).
 */
function initWhatsApp() {
  client = new Client({
    authStrategy: new LocalAuth({ dataPath: './.wwebjs_auth' }),
    puppeteer: {
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    },
  });

  client.on('qr', (qr) => {
    console.log('\n[WhatsApp] Scan the QR code below to authenticate:\n');
    qrcode.generate(qr, { small: true });
  });

  client.on('ready', () => {
    isReady = true;
    console.log('[WhatsApp] Client is ready!');
  });

  client.on('auth_failure', (msg) => {
    console.error('[WhatsApp] Auth failure:', msg);
    isReady = false;
  });

  client.on('disconnected', (reason) => {
    console.warn('[WhatsApp] Disconnected:', reason);
    isReady = false;
  });

  client.initialize();
}

/**
 * Send a message to the Shuttle - Dello WhatsApp group.
 * @param {string} text - Message body
 */
async function sendToGroup(text) {
  if (!client || !isReady) {
    console.warn('[WhatsApp] Client not ready — skipping group message.');
    return;
  }
  if (!GROUP_ID) {
    console.warn('[WhatsApp] GROUP_ID not configured — skipping.');
    return;
  }
  try {
    await client.sendMessage(GROUP_ID, text);
    console.log('[WhatsApp] Message sent to group.');
  } catch (err) {
    console.error('[WhatsApp] Failed to send:', err.message);
  }
}

/**
 * Build WA message for Hotel → FLL booking.
 */
function buildHotelToFLLWA({ name, room, passengers, slot_time, phone }) {
  return (
    `🏨➡️✈️ *New Reservation — Hotel → FLL*\n` +
    `Name: ${name}\n` +
    `Room: ${room}\n` +
    `Passengers: ${passengers}\n` +
    `Time: ${slot_time}\n` +
    `Tel: ${phone}`
  );
}

/**
 * Build WA message for FLL → Hotel pickup.
 */
function buildFLLToHotelWA({ name, letter, passengers, phone }) {
  return (
    `✈️➡️🏨 *Pick-up at FLL*\n` +
    `Name: ${name}\n` +
    `Letter: ${letter}\n` +
    `Passengers: ${passengers}\n` +
    `Tel: ${phone}`
  );
}

module.exports = {
  initWhatsApp,
  sendToGroup,
  buildHotelToFLLWA,
  buildFLLToHotelWA,
};
