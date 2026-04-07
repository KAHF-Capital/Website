// Add yourself as a subscriber for SMS alerts (bypasses Stripe)
// Usage: node add-subscriber.js +15551234567

const { addSubscriber } = require('./lib/subscribers-store');
const { validatePhoneNumber } = require('./lib/twilio-service');

const phone = process.argv[2];

if (!phone) {
  console.error('Usage: node add-subscriber.js +15551234567');
  process.exit(1);
}

const { valid, formatted } = validatePhoneNumber(phone);
if (!valid) {
  console.error(`Invalid phone number: ${phone}`);
  console.error('Use format: +15551234567 or 5551234567');
  process.exit(1);
}

const subscriber = addSubscriber({
  stripeCustomerId: `manual_${Date.now()}`,
  phoneNumber: formatted,
  email: 'owner@kahfcapital.com',
  minVolumeRatio: 3.0,
  maxAlertsPerDay: 25
});

console.log(`Subscriber added: ${formatted}`);
console.log(`ID: ${subscriber.id}`);
console.log(`Min volume ratio: ${subscriber.preferences.minVolumeRatio}x`);
console.log(`\nYou'll receive the daily 3x+ digest at 9 AM ET.`);
