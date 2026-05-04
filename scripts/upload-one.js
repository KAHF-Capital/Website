/**
 * Upload a single processed scanner JSON file to Vercel Blob.
 * Usage: node scripts/upload-one.js 2026-04-30
 */
const fs = require('fs');
const path = require('path');
const { uploadDataFile, listDataFiles } = require('../lib/blob-data');

const envPath = path.join(__dirname, '..', '.env.local');
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8').split('\n').forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) return;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (key && !process.env[key]) process.env[key] = value;
  });
}

async function main() {
  const date = process.argv[2];
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    console.error('Usage: node scripts/upload-one.js YYYY-MM-DD');
    process.exit(1);
  }
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    console.error('Missing BLOB_READ_WRITE_TOKEN in .env.local');
    process.exit(1);
  }

  const filename = `${date}.json`;
  const filePath = path.join(__dirname, '..', 'data', 'processed', filename);
  if (!fs.existsSync(filePath)) {
    console.error(`Local file not found: ${filePath}`);
    process.exit(1);
  }

  const body = fs.readFileSync(filePath, 'utf8');
  const stats = fs.statSync(filePath);
  console.log(`Uploading ${filename} (${(stats.size / 1024 / 1024).toFixed(2)} MB) to Vercel Blob...`);

  const blob = await uploadDataFile(filename, body);
  console.log(`Uploaded: ${blob.url}`);

  console.log('\nVerifying via blob list...');
  const listed = await listDataFiles();
  const match = listed.find((f) => f.filename === filename);
  if (match) {
    console.log(`Confirmed in blob index: ${match.filename} -> ${match.url}`);
  } else {
    console.warn('WARNING: file not found in blob index. May take a few seconds to propagate.');
  }
}

main().catch((err) => {
  console.error('Upload failed:', err);
  process.exit(1);
});
