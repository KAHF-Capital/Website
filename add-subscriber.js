// Add an email subscriber for the daily digest (bypasses Stripe)
// Usage: node add-subscriber.js you@email.com

const { addSubscriber } = require('./lib/subscribers-store');

const email = process.argv[2];

if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
  console.error('Usage: node add-subscriber.js you@email.com');
  process.exit(1);
}

const subscriber = addSubscriber({
  stripeCustomerId: `manual_${Date.now()}`,
  email,
  minVolumeRatio: 3.0,
  maxAlertsPerDay: 25
});

console.log(`\nSubscriber added:`);
console.log(`  Email: ${email}`);
console.log(`  ID: ${subscriber.id}`);
console.log(`  Min volume ratio: ${subscriber.preferences.minVolumeRatio}x`);
console.log(`\nYou'll receive the daily digest email at 10 AM ET on trading days.`);
