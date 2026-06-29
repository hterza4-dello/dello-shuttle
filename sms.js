// sms.js — Telnyx SMS sender
const Telnyx = require('telnyx');
require('dotenv').config();

// Initialize Telnyx client with API key from environment
const telnyx = Telnyx(process.env.TELNYX_API_KEY);

/**
 * Send an SMS message via Telnyx.
 * @param {string} to   - Recipient phone number in E.164 format (e.g. +13055551234)
 * @param {string} text - Message body
 * @returns {Promise<object>} Telnyx API response
 */
async function sendSMS(to, text) {
  if (!process.env.TELNYX_API_KEY || process.env.TELNYX_API_KEY === 'your_telnyx_api_key') {
    console.warn('[SMS] Telnyx API key not configured — skipping SMS to', to);
    console.log('[SMS] Message that would have been sent:', text);
    return { skipped: true };
  }

  try {
    const response = await telnyx.messages.create({
      from: process.env.TELNYX_FROM_NUMBER,
      to,
      text,
    });
    console.log('[SMS] Sent successfully to', to, '| ID:', response.data.id);
    return response.data;
  } catch (err) {
    console.error('[SMS] Failed to send to', to, ':', err.message);
    throw err;
  }
}

/**
 * Build and send confirmation SMS for Hotel → FLL booking.
 */
async function sendHotelToFllSMS(reservation) {
  const { name, phone, time_slot, passengers, room } = reservation;

  // Convert 24h time_slot (e.g. "04:30") to 12h format for readability
  const [hour, minute] = time_slot.split(':').map(Number);
  const period = hour < 12 ? 'AM' : 'PM';
  const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  const displayTime = `${displayHour}:${String(minute).padStart(2, '0')} ${period}`;

  const text =
    `Hi ${name}! Your shuttle from Hotel Dello to FLL is confirmed.\n` +
    `Time: ${displayTime} | Passengers: ${passengers} | Room: ${room}\n` +
    `Thank you for choosing Hotel Dello!`;

  return sendSMS(phone, text);
}

/**
 * Build and send confirmation SMS for FLL → Hotel pickup request.
 */
async function sendFllToHotelSMS(reservation) {
  const { name, phone, letter, passengers } = reservation;

  const text =
    `Hi ${name}! We received your shuttle request from FLL to Hotel Dello.\n` +
    `Pickup: Arrivals Letter ${letter} | Passengers: ${passengers}\n` +
    `Our driver will be in touch shortly. Thank you!`;

  return sendSMS(phone, text);
}

module.exports = { sendHotelToFllSMS, sendFllToHotelSMS };
