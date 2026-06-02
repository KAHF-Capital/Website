const { put, list, del, get } = require('@vercel/blob');

const BLOB_PREFIX = 'darkpool-data/';
// Auto-generated track-record / homepage reads live here. Kept separate from the
// raw dark-pool data so the daily process-csv run can refresh them independently.
const READS_PREFIX = 'reads/';

async function listDataFiles() {
  const { blobs } = await list({ prefix: BLOB_PREFIX });

  return blobs
    .map(blob => {
      const filename = blob.pathname.replace(BLOB_PREFIX, '');
      if (!filename.endsWith('.json') || !/^\d{4}-\d{2}-\d{2}\.json$/.test(filename)) {
        return null;
      }
      return { filename, url: blob.url, pathname: blob.pathname };
    })
    .filter(Boolean)
    .sort((a, b) => b.filename.localeCompare(a.filename));
}

async function getDataFile(filenameOrUrl) {
  let url = filenameOrUrl;

  if (!filenameOrUrl.startsWith('http')) {
    const files = await listDataFiles();
    const match = files.find(f => f.filename === filenameOrUrl);
    if (!match) return null;
    url = match.url;
  }

  const result = await get(url, { access: 'private' });
  if (!result || result.statusCode !== 200) return null;

  const text = await new Response(result.stream).text();
  return JSON.parse(text);
}

async function uploadDataFile(filename, data) {
  const key = BLOB_PREFIX + filename;
  const body = typeof data === 'string' ? data : JSON.stringify(data, null, 2);

  const blob = await put(key, body, {
    access: 'private',
    contentType: 'application/json',
    addRandomSuffix: false,
  });

  return blob;
}

async function deleteDataFile(filename) {
  const files = await listDataFiles();
  const match = files.find(f => f.filename === filename);
  if (match) {
    await del(match.url);
  }
}

// --- Reads (track record + homepage) --------------------------------------
// Stored under reads/ so the daily refresh can overwrite them without a redeploy.
// The site reads these at runtime (falling back to the bundled JSON if absent).
async function uploadReadsJson(filename, data) {
  const key = READS_PREFIX + filename;
  const body = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
  // Fixed filenames that get refreshed daily — overwrite in place.
  return put(key, body, {
    access: 'private',
    contentType: 'application/json',
    addRandomSuffix: false,
    allowOverwrite: true,
  });
}

async function getReadsJson(filename) {
  try {
    const { blobs } = await list({ prefix: READS_PREFIX });
    const match = blobs.find(b => b.pathname === READS_PREFIX + filename);
    if (!match) return null;
    const result = await get(match.url, { access: 'private' });
    if (!result || result.statusCode !== 200) return null;
    const text = await new Response(result.stream).text();
    return JSON.parse(text);
  } catch {
    return null;
  }
}

module.exports = { listDataFiles, getDataFile, uploadDataFile, deleteDataFile, uploadReadsJson, getReadsJson, BLOB_PREFIX, READS_PREFIX };
