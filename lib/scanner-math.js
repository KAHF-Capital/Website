// Point-in-time dark-pool volume ratio.
//
// This is the same window the Scanner page uses (lib/scanner-snapshot.js):
// for session date D, average this ticker's dark-pool share volume on sessions
// dated from D-6 calendar days through D, inclusive. Sessions after D are
// never included. A later spike cannot change an earlier day's ratio.

const AVERAGE_DAYS = 7;

const VOLUME_RATIO_METHOD =
  'volume_ratio = that session\'s dark-pool share volume divided by the rounded average of this ticker\'s dark-pool volume on sessions dated from (session minus 6 calendar days) through that session, inclusive. Sessions after the date are never included. This is the same window the Scanner page uses.';

function addUtcDays(dateStr, days) {
  const d = new Date(`${dateStr}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function windowStart(dateStr, averageDays = AVERAGE_DAYS) {
  return addUtcDays(dateStr, -(averageDays - 1));
}

function volumeRatioFromSamples(sum, count, todayVolume) {
  if (!(count > 0)) {
    return { avg7DayVolume: 0, volumeRatio: null, windowDays: 0 };
  }
  const avg7DayVolume = Math.round(sum / count);
  const volumeRatio = avg7DayVolume > 0 ? Number((todayVolume / avg7DayVolume).toFixed(2)) : null;
  return { avg7DayVolume, volumeRatio, windowDays: count };
}

function shardId(ticker) {
  const cleaned = String(ticker || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return (cleaned.slice(0, 2) || '_').padEnd(2, '_');
}

function dedupeSessions(series) {
  const sorted = [...(series || [])]
    .filter((row) => row && row.date)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const clean = [];
  for (const row of sorted) {
    const prev = clean[clean.length - 1];
    const volume = Number(row.total_volume) || 0;
    if (prev && prev.date === row.date) {
      if (volume > prev.total_volume) clean[clean.length - 1] = { ...row, total_volume: volume };
      continue;
    }
    clean.push({ ...row, total_volume: volume });
  }
  return clean;
}

/**
 * series: [{ date, total_volume, avg_price, total_value, trade_count }]
 * Dates must be YYYY-MM-DD. Output is sorted ascending. Each row's ratio
 * uses only rows on or before that row's date.
 */
function annotateVolumeRatios(series, averageDays = AVERAGE_DAYS) {
  const clean = dedupeSessions(series);
  const out = [];
  for (let i = 0; i < clean.length; i++) {
    const row = clean[i];
    const start = windowStart(row.date, averageDays);
    let sum = 0;
    let count = 0;
    for (let j = i; j >= 0; j--) {
      if (clean[j].date < start) break;
      sum += clean[j].total_volume;
      count += 1;
    }
    const { avg7DayVolume, volumeRatio, windowDays } = volumeRatioFromSamples(sum, count, row.total_volume);
    out.push({
      date: row.date,
      total_volume: row.total_volume,
      avg_price: Number(row.avg_price) || 0,
      total_value: Number(row.total_value) || 0,
      trade_count: Number(row.trade_count) || 0,
      avg_7day_volume: avg7DayVolume,
      volume_ratio: volumeRatio,
      window_days: windowDays,
      window_start: start
    });
  }
  return out;
}

module.exports = {
  AVERAGE_DAYS,
  VOLUME_RATIO_METHOD,
  addUtcDays,
  windowStart,
  volumeRatioFromSamples,
  shardId,
  annotateVolumeRatios
};
