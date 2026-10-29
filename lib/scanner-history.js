// Full dark-pool history for every ticker in the archive.
//
// Daily blob files are large (every print, every ticker). The history index
// (data/history-index locally, darkpool-history/ in Vercel Blob) stores one
// compact series per ticker plus one board per session. Volume ratios are
// recomputed with annotateVolumeRatios, so a past session cannot see later days.
//
// The latest Scanner day still comes from getScannerSnapshot, which reads the
// same daily files the Scanner page uses. When that day is newer than the
// index, it is overlaid onto the series so "today" cannot drift.

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { get } = require('@vercel/blob');
const { getScannerSnapshot } = require('./scanner-snapshot');
const {
  VOLUME_RATIO_METHOD,
  shardId,
  annotateVolumeRatios,
  addUtcDays
} = require('./scanner-math');

const LOCAL_ROOT = path.join(process.cwd(), 'data', 'history-index');
const BLOB_PREFIX = 'darkpool-history/';
const DEFAULT_MIN_VALUE = 250000000;
const DEFAULT_MIN_PRICE = 50;

const manifestCache = { key: '', at: 0, value: null };
const shardCache = new Map();
const dayCache = new Map();
const CACHE_MS = 5 * 60 * 1000;
const SHARD_CACHE_MAX = 24;

function isIsoDate(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function normalizeTicker(ticker) {
  const sym = String(ticker || '').trim().toUpperCase();
  if (!sym || sym.length > 15 || /[\\/]/.test(sym)) return null;
  return sym;
}

function decodeTuple(tuple) {
  return {
    date: tuple[0],
    total_volume: Number(tuple[1]) || 0,
    avg_price: Number(tuple[2]) || 0,
    total_value: Number(tuple[3]) || 0,
    trade_count: Number(tuple[4]) || 0
  };
}

function decodeDayRow(tuple) {
  return {
    ticker: tuple[0],
    total_volume: Number(tuple[1]) || 0,
    avg_price: Number(tuple[2]) || 0,
    total_value: Number(tuple[3]) || 0,
    trade_count: Number(tuple[4]) || 0,
    volume_ratio: tuple[5] == null ? null : Number(tuple[5]),
    avg_7day_volume: Number(tuple[6]) || 0
  };
}

async function readBlobBuffer(pathname) {
  try {
    const result = await get(pathname, { access: 'private' });
    if (!result || result.statusCode !== 200 || !result.stream) return null;
    return Buffer.from(await new Response(result.stream).arrayBuffer());
  } catch (error) {
    if (error?.name === 'BlobNotFoundError' || error?.statusCode === 404) return null;
    throw error;
  }
}

async function readAsset(relPath) {
  const safe = relPath.replace(/\\/g, '/');
  if (safe.includes('..')) return null;
  const local = path.join(LOCAL_ROOT, safe);
  if (fs.existsSync(local)) {
    const buf = fs.readFileSync(local);
    const text = safe.endsWith('.gz') ? zlib.gunzipSync(buf).toString('utf8') : buf.toString('utf8');
    return JSON.parse(text);
  }
  const blobPath = BLOB_PREFIX + safe;
  const buf = await readBlobBuffer(blobPath);
  if (!buf) return null;
  const text = safe.endsWith('.gz') ? zlib.gunzipSync(buf).toString('utf8') : buf.toString('utf8');
  return JSON.parse(text);
}

async function getHistoryManifest() {
  const localManifest = path.join(LOCAL_ROOT, 'manifest.json');
  let key = 'blob';
  if (fs.existsSync(localManifest)) {
    key = `local:${fs.statSync(localManifest).mtimeMs}`;
  }
  if (manifestCache.value && manifestCache.key === key && Date.now() - manifestCache.at < CACHE_MS) {
    return manifestCache.value;
  }
  const value = await readAsset('manifest.json');
  manifestCache.key = key;
  manifestCache.at = Date.now();
  manifestCache.value = value;
  return value;
}

async function loadShard(id) {
  const hit = shardCache.get(id);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value;
  const value = (await readAsset(`shards/${id}.json.gz`)) || { tickers: {} };
  shardCache.set(id, { at: Date.now(), value });
  if (shardCache.size > SHARD_CACHE_MAX) {
    const oldest = shardCache.keys().next().value;
    shardCache.delete(oldest);
  }
  return value;
}

async function loadDayFile(date) {
  if (!isIsoDate(date)) return null;
  const hit = dayCache.get(date);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value;
  const value = await readAsset(`days/${date}.json.gz`);
  dayCache.set(date, { at: Date.now(), value });
  return value;
}

function snapshotRow(snapshot, ticker) {
  if (!snapshot?.tickers) return null;
  const live = snapshot.tickers.find((t) => t.ticker === ticker);
  if (!live) return null;
  return {
    date: snapshot.date,
    total_volume: Number(live.total_volume) || 0,
    avg_price: Number(live.avg_price) || 0,
    total_value: Number(live.total_value) || 0,
    trade_count: Number(live.trade_count) || 0,
    avg_7day_volume: Number(live.avg_7day_volume) || 0,
    volume_ratio: live.volume_ratio == null ? null : Number(live.volume_ratio),
    window_days: null,
    window_start: null,
    source: 'scanner-snapshot'
  };
}

async function getTickerHistory(ticker, { asOf = null } = {}) {
  const sym = normalizeTicker(ticker);
  if (!sym) return { available: false, ticker: String(ticker || ''), reason: 'Invalid ticker' };

  const manifest = await getHistoryManifest();
  const shard = await loadShard(shardId(sym));
  const tuples = shard?.tickers?.[sym];
  let raw = Array.isArray(tuples) ? tuples.map(decodeTuple) : [];

  let snapshot = null;
  const cutoff = isIsoDate(asOf) ? asOf : null;
  const indexLatest = manifest?.latestDate || null;
  const needLive = !cutoff || !indexLatest || cutoff >= indexLatest;
  if (needLive) {
    try {
      snapshot = await getScannerSnapshot();
    } catch (error) {
      console.warn(`[scanner-history] snapshot overlay skipped for ${sym}: ${error.message}`);
    }
  }

  if (snapshot && (!cutoff || cutoff >= snapshot.date)) {
    const live = snapshot.tickers?.find((t) => t.ticker === sym);
    if (live) {
      const idx = raw.findIndex((row) => row.date === snapshot.date);
      const next = {
        date: snapshot.date,
        total_volume: Number(live.total_volume) || 0,
        avg_price: Number(live.avg_price) || 0,
        total_value: Number(live.total_value) || 0,
        trade_count: Number(live.trade_count) || 0
      };
      if (idx >= 0) raw[idx] = next;
      else raw.push(next);
    }
  }

  let days = annotateVolumeRatios(raw);
  if (snapshot && (!cutoff || cutoff >= snapshot.date)) {
    const live = snapshotRow(snapshot, sym);
    const idx = days.findIndex((row) => row.date === snapshot.date);
    if (live && idx >= 0) {
      days[idx] = {
        ...days[idx],
        total_volume: live.total_volume,
        avg_price: live.avg_price,
        total_value: live.total_value,
        trade_count: live.trade_count,
        avg_7day_volume: live.avg_7day_volume,
        volume_ratio: live.volume_ratio,
        source: 'scanner-snapshot'
      };
    }
  }

  const withheld = cutoff ? days.filter((row) => row.date > cutoff).length : 0;
  if (cutoff) days = days.filter((row) => row.date <= cutoff);

  return {
    available: days.length > 0,
    ticker: sym,
    asOf: cutoff || days[days.length - 1]?.date || null,
    lookahead: false,
    method: VOLUME_RATIO_METHOD,
    source: snapshot ? 'history-index+scanner-snapshot' : 'history-index',
    firstDate: days[0]?.date || null,
    lastDate: days[days.length - 1]?.date || null,
    dayCount: days.length,
    daysWithheldAfterAsOf: withheld,
    archive: manifest
      ? {
          firstDate: manifest.firstDate,
          latestDate: manifest.latestDate,
          dayCount: Array.isArray(manifest.dates) ? manifest.dates.length : null,
          tickerCount: manifest.tickerCount || null,
          builtAt: manifest.builtAt || null
        }
      : null,
    reason: days.length > 0 ? null : 'No dark pool prints for this ticker',
    days
  };
}

function applyDayFilters(rows, { ticker, minVolumeRatio, minValue, minPrice, universe }) {
  let filtered = rows;
  if (ticker) {
    const sym = normalizeTicker(ticker);
    filtered = filtered.filter((row) => row.ticker === sym);
    return filtered;
  }
  if (universe === 'all') return filtered;
  const valueFloor = minValue == null ? DEFAULT_MIN_VALUE : Number(minValue);
  const priceFloor = minPrice == null ? DEFAULT_MIN_PRICE : Number(minPrice);
  filtered = filtered.filter((row) => row.total_value >= valueFloor && row.avg_price >= priceFloor);
  if (minVolumeRatio != null) {
    filtered = filtered.filter((row) => row.volume_ratio != null && row.volume_ratio >= Number(minVolumeRatio));
  }
  return filtered;
}

async function rowsForDate(date) {
  const snapshot = await getScannerSnapshot().catch(() => null);
  if (snapshot && date === snapshot.date) {
    return {
      source: 'scanner-snapshot',
      rows: snapshot.tickers.map((t) => ({
        ticker: t.ticker,
        total_volume: Number(t.total_volume) || 0,
        avg_price: Number(t.avg_price) || 0,
        total_value: Number(t.total_value) || 0,
        trade_count: Number(t.trade_count) || 0,
        volume_ratio: t.volume_ratio == null ? null : Number(t.volume_ratio),
        avg_7day_volume: Number(t.avg_7day_volume) || 0
      }))
    };
  }
  const file = await loadDayFile(date);
  if (!file?.rows) return null;
  return { source: 'history-index', rows: file.rows.map(decodeDayRow) };
}

async function resolveSessionDate(requested) {
  if (!isIsoDate(requested)) return { requested: null, sessionDate: null };
  const snapshot = await getScannerSnapshot().catch(() => null);
  if (snapshot?.date === requested) return { requested, sessionDate: requested, source: 'scanner-snapshot' };
  const manifest = await getHistoryManifest();
  const dates = Array.isArray(manifest?.dates) ? manifest.dates : [];
  if (dates.includes(requested)) return { requested, sessionDate: requested, source: 'history-index' };
  let sessionDate = null;
  for (const date of dates) {
    if (date <= requested) sessionDate = date;
    else break;
  }
  if (snapshot?.date && snapshot.date <= requested && (!sessionDate || snapshot.date > sessionDate)) {
    sessionDate = snapshot.date;
  }
  return { requested, sessionDate, source: sessionDate === snapshot?.date ? 'scanner-snapshot' : 'history-index' };
}

async function getScannerDay(date, options = {}) {
  const resolved = await resolveSessionDate(date);
  if (!resolved.sessionDate) {
    return {
      available: false,
      requestedDate: date || null,
      lookahead: false,
      reason: 'No dark pool session on or before that date'
    };
  }
  const loaded = await rowsForDate(resolved.sessionDate);
  if (!loaded) {
    return {
      available: false,
      requestedDate: resolved.requested,
      date: resolved.sessionDate,
      lookahead: false,
      reason: 'Session file missing from the history index'
    };
  }

  const universe = options.universe === 'all' ? 'all' : 'signals';
  const matched = applyDayFilters(loaded.rows, { ...options, universe });
  matched.sort((a, b) => (b.volume_ratio || 0) - (a.volume_ratio || 0) || b.total_value - a.total_value);

  const offset = Math.max(0, Number(options.offset) || 0);
  const limitCap = universe === 'all' ? 200 : 100;
  const limit = Math.max(1, Math.min(Number(options.limit) || (universe === 'all' ? 50 : 25), limitCap));
  const page = matched.slice(offset, offset + limit);

  let history = null;
  if (options.includeHistory && options.ticker) {
    history = await getTickerHistory(options.ticker, { asOf: resolved.sessionDate });
  }

  return {
    available: true,
    requestedDate: resolved.requested,
    date: resolved.sessionDate,
    adjustedToPriorSession: resolved.sessionDate !== resolved.requested,
    lookahead: false,
    method: VOLUME_RATIO_METHOD,
    source: loaded.source,
    universe,
    totalPrinted: loaded.rows.length,
    matched: matched.length,
    offset,
    limit,
    nextOffset: offset + limit < matched.length ? offset + limit : null,
    rows: page,
    history
  };
}

async function getRecentSignalBoards({ asOf = null, days = 8, minVolumeRatio = 2, limitPerDay = 5 } = {}) {
  const manifest = await getHistoryManifest();
  const snapshot = await getScannerSnapshot().catch(() => null);
  const archiveDates = Array.isArray(manifest?.dates) ? manifest.dates : [];
  const end = isIsoDate(asOf) ? asOf : (snapshot?.date || manifest?.latestDate || null);
  if (!end) return { available: false, lookahead: false, sessions: [], reason: 'No scanner dates' };

  const dateSet = new Set(archiveDates);
  if (snapshot?.date && snapshot.date <= end) dateSet.add(snapshot.date);
  const dates = [...dateSet].filter((d) => d <= end).sort().slice(-Math.max(1, Math.min(days, 40)));

  const sessions = [];
  for (const date of dates) {
    const board = await getScannerDay(date, {
      universe: 'signals',
      minVolumeRatio,
      limit: limitPerDay,
      offset: 0
    });
    sessions.push({
      date,
      available: board.available,
      source: board.source || null,
      top: (board.rows || []).map((row) => ({
        ticker: row.ticker,
        volumeRatio: row.volume_ratio,
        darkPoolAvgPrice: typeof row.avg_price === 'number' ? Number(row.avg_price.toFixed(2)) : null,
        darkPoolVolume: row.total_volume,
        darkPoolValue: row.total_value
      }))
    });
  }

  return {
    available: sessions.length > 0,
    asOf: end,
    lookahead: false,
    method: VOLUME_RATIO_METHOD,
    sessions
  };
}

function clearHistoryCache() {
  manifestCache.key = '';
  manifestCache.at = 0;
  manifestCache.value = null;
  shardCache.clear();
  dayCache.clear();
}

module.exports = {
  LOCAL_ROOT,
  BLOB_PREFIX,
  getHistoryManifest,
  getTickerHistory,
  getScannerDay,
  getRecentSignalBoards,
  clearHistoryCache,
  addUtcDays
};
