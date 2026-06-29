/**
 * services/sms.js
 * Sends SMS confirmations to passengers via Telnyx API.
 */

const axios = require('axios');
require('dotenv').config();

const TELNYX_API_KEY   = process.env.TELNYX_API_KEY;
const TELNYX_FROM      = process.env.TELNYX_PHONE_NUMBER;
const TELNYX_BASE_URL  = 'https://api.telnyx.com/v2/messages';

/**
 * Send an SMS via Telnyx.
 * @param {string} to   - Destination phone in E.164 format (+1XXXXXXXXXX)
 * @param {string} text - Message body
 */
async function sendSMS(to, text) {
  if (!TELNYX_API_KEY || !TELNYX_FROM) {
    console.warn('[SMS] Telnyx credentials not configured — skipping SMS.');
    return;
  }
  try {
    const res = await axios.post(
      TELNYX_BASE_URL,
      { from: TELNYX_FROM, to, text },
      {
        headers: {
          Authorization: `Bearer ${TELNYX_API_KEY}`,
          'Content-Type': 'application/json',
        },
      }
    );
    console.log(`[SMS] Sent to ${to} — id: ${res.data.data.id}`);
  } catch (err) {
    console.error('[SMS] Failed:', err.response?.data || err.message);
  }
}

/**
 * Confirmation message for Hotel → FLL reservation.
 */
function buildHotelToFLLSMS({ name, slot_time, passengers, room }) {
  return (
    `Hi ${name}! Your Dello shuttle to FLL is confirmed.\n` +
    `Pickup: ${slot_time} | Room: ${room} | Passengers: ${passengers}\n` +
    `Please be ready 5 min early. — Hotel Dello`
  );
}

/**
 * Confirmation message for FLL → Hotel reservation.
 */
function buildFLLToHotelSMS({ name, letter, passengers }) {
  return (
    `Hi ${name}! Your Dello shuttle request was received.\n` +
    `Pickup point: Arrivals Letter ${letter} | Passengers: ${passengers}\n` +
    `Our driver will contact you shortly. — Hotel Dello`
  );
}

module.exports = { sendSMS, buildHotelToFLLSMS, buildFLLToHotelSMS };
