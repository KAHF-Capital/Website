// Add yourself as a subscriber for SMS + email alerts (bypasses Stripe)
// Usage: node add-subscriber.js +15551234567 you@email.com

const { addSubscriber } = require('./lib/subscribers-store');
const { validatePhoneNumber } = require('./lib/twilio-service');

const phone = process.argv[2];
const email = process.argv[3];

if (!phone && !email) {
  console.error('Usage: node add-subscriber.js <phone> [email]');
  console.error('  node add-subscriber.js +15551234567 you@email.com');
  console.error('  node add-subscriber.js - you@email.com        (email only)');
  process.exit(1);
}

let formatted = null;
if (phone && phone !== '-') {
  const result = validatePhoneNumber(phone);
  if (!result.valid) {
    console.error(`Invalid phone number: ${phone}`);
    process.exit(1);
  }
  formatted = result.formatted;
}

const subscriber = addSubscriber({
  stripeCustomerId: `manual_${Date.now()}`,
  phoneNumber: formatted,
  email: email || null,
  minVolumeRatio: 3.0,
  maxAlertsPerDay: 25
});

console.log(`\nSubscriber added:`);
if (formatted) console.log(`  Phone: ${formatted}`);
if (email) console.log(`  Email: ${email}`);
console.log(`  ID: ${subscriber.id}`);
console.log(`  Min volume ratio: ${subscriber.preferences.minVolumeRatio}x`);
console.log(`\nYou'll receive the daily 3x+ digest at 9 AM ET.`);
