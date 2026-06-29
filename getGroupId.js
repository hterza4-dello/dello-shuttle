/**
 * getGroupId.js
 * Run this ONCE after WhatsApp is authenticated to find the group ID.
 * Usage: node getGroupId.js
 */

const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');

const client = new Client({
  authStrategy: new LocalAuth({ dataPath: './.wwebjs_auth' }),
  puppeteer: { headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] },
});

client.on('qr', (qr) => {
  console.log('Scan the QR code:');
  qrcode.generate(qr, { small: true });
});

client.on('ready', async () => {
  console.log('\nFetching groups...\n');
  const chats = await client.getChats();
  const groups = chats.filter((c) => c.isGroup);
  groups.forEach((g) => {
    console.log(`Group: "${g.name}" | ID: ${g.id._serialized}`);
  });
  console.log('\nCopy the ID of "Shuttle - Dello" and paste it in your .env as WHATSAPP_GROUP_ID');
  process.exit(0);
});

client.initialize();
