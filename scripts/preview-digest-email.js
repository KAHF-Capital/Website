// Renders the daily digest email (with a sample new read) to preview-email.html
// so you can eyeball design changes without sending anything.
// Usage: node scripts/preview-digest-email.js [--no-read] [--quiet]
const path = require('path');
const fs = require('fs');
const { buildDailyDigestEmail } = require('../lib/email-service');

const args = process.argv.slice(2);
const withRead = !args.includes('--no-read');
const quiet = args.includes('--quiet');

const sampleRead = {
  ticker: 'NVDA',
  structure: 'call',
  strike: 187.5,
  expiration: '2026-08-14',
  dte: 32,
  entry_premium: 9.85,
  volume_ratio: 4.6,
  asof_hit_rate: 62.5,
  asof_samples: 48
};

const sampleTickers = [
  { ticker: 'NVDA', avg_price: 184.12, volume_ratio: '4.60', total_value: 812_000_000, straddleRate: 62, straddleDTE: 32 },
  { ticker: 'AVGO', avg_price: 291.55, volume_ratio: '3.85', total_value: 540_000_000, straddleRate: 55, straddleDTE: 29 },
  { ticker: 'MSFT', avg_price: 512.4, volume_ratio: '3.42', total_value: 495_000_000, straddleRate: 41, straddleDTE: 31 },
  { ticker: 'LLY', avg_price: 806.02, volume_ratio: '3.18', total_value: 377_000_000, straddleRate: 38, straddleDTE: 30 },
  { ticker: 'JPM', avg_price: 288.9, volume_ratio: '3.05', total_value: 310_000_000, straddleRate: null, straddleDTE: null }
];

const sampleUnsubUrl = 'https://www.kahfcapital.com/api/unsubscribe?email=you%40example.com&token=sample';

const { subject, html, text } = buildDailyDigestEmail(
  sampleTickers,
  new Date().toISOString().slice(0, 10),
  quiet,
  withRead ? [sampleRead] : [],
  sampleUnsubUrl
);

const out = path.join(__dirname, '..', 'preview-email.html');
fs.writeFileSync(out, html);
console.log(`Subject: ${subject}\n`);
console.log(`HTML preview: ${out}`);
console.log(`\n--- Plain-text version ---\n${text.slice(0, 600)}…`);
