// Single source of truth for the "latest scanner day" snapshot.
//
// Both /api/darkpool-trades (Scanner UI) and /api/sonnet-chat (KAHF AI)
// MUST read today's per-ticker volume ratio from this function. If they
// recompute it independently they can disagree (typically over weekends
// when one path picks 7 sessions and the other picks 7 calendar days).

const { listDataFiles, getDataFile } = require('./blob-data');

const DEFAULT_AVERAGE_DAYS = 7;

// Build the latest-day snapshot:
//   - latest day's tickers from blob storage
//   - per-ticker 7-day average dark pool volume, computed over the
//     trailing calendar window [latestDate - (averageDays-1), latestDate]
//   - per-ticker volume ratio (today / avg7DayVolume)
//
// Returns null if no data files exist.
async function getScannerSnapshot({ averageDays = DEFAULT_AVERAGE_DAYS } = {}) {
  const files = await listDataFiles();
  if (files.length === 0) return null;

  const latestFile = files[0];
  const latestData = await getDataFile(latestFile.url);
  if (!latestData) return null;

  const filenameDate = latestFile.filename.replace('.json', '');
  const currentDate = new Date(`${filenameDate}T12:00:00Z`);
  const earliest = new Date(currentDate);
  earliest.setUTCDate(currentDate.getUTCDate() - (averageDays - 1));

  const averageWindow = files
    .filter((file) => {
      const stamp = file.filename.replace('.json', '');
      if (!stamp) return false;
      const fileDate = new Date(`${stamp}T12:00:00Z`);
      return fileDate >= earliest && fileDate <= currentDate;
    })
    .slice(0, averageDays);

  const sums = {};
  const counts = {};
  for (const file of averageWindow) {
    try {
      const data = file.url === latestFile.url ? latestData : await getDataFile(file.url);
      if (!data?.tickers) continue;
      for (const t of data.tickers) {
        sums[t.ticker] = (sums[t.ticker] || 0) + (Number(t.total_volume) || 0);
        counts[t.ticker] = (counts[t.ticker] || 0) + 1;
      }
    } catch (e) {
      console.warn(`[scanner-snapshot] skipping ${file.filename}: ${e.message}`);
    }
  }

  const tickers = latestData.tickers.map((t) => {
    const avg = counts[t.ticker] > 0 ? Math.round(sums[t.ticker] / counts[t.ticker]) : 0;
    const ratio = avg > 0 ? Number((t.total_volume / avg).toFixed(2)) : null;
    return {
      ...t,
      avg_7day_volume: avg,
      volume_ratio: ratio
    };
  });

  return {
    date: filenameDate,
    filename: latestFile.filename,
    total_tickers: latestData.total_tickers ?? latestData.tickers.length,
    total_volume: latestData.total_volume,
    last_updated: latestData.processed_at || new Date().toISOString(),
    averageDays,
    averageWindow: averageWindow.map((f) => f.filename),
    tickers,
    files,
    latestFile
  };
}

module.exports = { getScannerSnapshot, DEFAULT_AVERAGE_DAYS };
