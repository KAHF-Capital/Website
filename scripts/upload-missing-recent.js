/**
 * Upload any local data/processed/*.json file from the last N days that is
 * NOT yet present in Vercel Blob.
 *
 * Usage:
 *   node scripts/upload-missing-recent.js          # last 30 days
 *   node scripts/upload-missing-recent.js 60       # last 60 days
 *   node scripts/upload-missing-recent.js --all    # every local JSON file
 */
const fs = require('fs');
const path = require('path');
const { uploadDataFile, listDataFiles } = require('../lib/blob-data');

// .env.local loader (no dotenv dependency)
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
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    console.error('Missing BLOB_READ_WRITE_TOKEN in .env.local');
    process.exit(1);
  }

  const arg = process.argv[2];
  const uploadAll = arg === '--all';
  const days = arg && !uploadAll ? parseInt(arg, 10) : 30;
  if (!uploadAll && (!Number.isFinite(days) || days <= 0)) {
    console.error('Invalid days argument. Use a positive number or --all.');
    process.exit(1);
  }

  const processedDir = path.join(__dirname, '..', 'data', 'processed');
  if (!fs.existsSync(processedDir)) {
    console.error(`Directory not found: ${processedDir}`);
    process.exit(1);
  }

  const cutoff = uploadAll
    ? null
    : (() => {
        const d = new Date();
        d.setUTCDate(d.getUTCDate() - days);
        return d.toISOString().slice(0, 10);
      })();

  const localFiles = fs
    .readdirSync(processedDir)
    .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
    .filter((f) => uploadAll || f.replace('.json', '') >= cutoff)
    .sort();

  if (localFiles.length === 0) {
    console.log('No local files match the window.');
    return;
  }

  console.log(`Checking ${localFiles.length} local file(s) against Vercel Blob...`);
  const blobs = await listDataFiles();
  const blobSet = new Set(blobs.map((b) => b.filename));

  const missing = localFiles.filter((f) => !blobSet.has(f));
  if (missing.length === 0) {
    console.log('Nothing to do — all recent files already in Blob.');
    return;
  }

  console.log(`Uploading ${missing.length} missing file(s):`);
  missing.forEach((f) => console.log(`  - ${f}`));
  console.log('');

  let success = 0;
  let failed = 0;
  for (const file of missing) {
    const filePath = path.join(processedDir, file);
    const body = fs.readFileSync(filePath, 'utf8');
    const sizeMb = (fs.statSync(filePath).size / 1024 / 1024).toFixed(2);
    try {
      const blob = await uploadDataFile(file, body);
      success += 1;
      console.log(`[${success + failed}/${missing.length}] OK   ${file} (${sizeMb} MB) -> ${blob.url}`);
    } catch (err) {
      failed += 1;
      console.error(`[${success + failed}/${missing.length}] FAIL ${file} (${sizeMb} MB): ${err.message}`);
    }
  }

  console.log(`\nDone. ${success} uploaded, ${failed} failed.`);
}

main().catch((err) => {
  console.error('Upload failed:', err);
  process.exit(1);
});
