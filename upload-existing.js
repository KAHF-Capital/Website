const fs = require('fs');
const path = require('path');
const { uploadDataFile } = require('./lib/blob-data');

const envPath = path.join(__dirname, '.env.local');
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
    const [key, ...vals] = line.split('=');
    if (key && vals.length) process.env[key.trim()] = vals.join('=').trim();
  });
}

const PROCESSED_DIR = path.join(__dirname, 'data', 'processed');

async function uploadAll() {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    console.error('Missing BLOB_READ_WRITE_TOKEN. Add it to .env.local');
    process.exit(1);
  }

  const files = fs.readdirSync(PROCESSED_DIR)
    .filter(f => f.endsWith('.json') && /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
    .sort();

  console.log(`Found ${files.length} JSON files to upload\n`);

  let success = 0;
  let failed = 0;

  for (const file of files) {
    try {
      const data = fs.readFileSync(path.join(PROCESSED_DIR, file), 'utf8');
      await uploadDataFile(file, data);
      success++;
      console.log(`[${success + failed}/${files.length}] Uploaded ${file}`);
    } catch (err) {
      failed++;
      console.error(`[${success + failed}/${files.length}] FAILED ${file}: ${err.message}`);
    }
  }

  console.log(`\nDone. ${success} uploaded, ${failed} failed.`);
}

uploadAll();
