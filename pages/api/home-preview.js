/**
 * /api/home-preview
 *
 * Powers the scripted "sample" conversation on the homepage. Returns 2-3 real
 * scanner signals with live (15-min delayed) prices so the demo never shows
 * stale or invented numbers like "NVDA at $125" when NVDA isn't actually
 * trading at $125.
 *
 * Cached for 5 minutes at the edge so a viral homepage doesn't hammer Polygon.
 */
import { getScannerSnapshot } from '../../lib/scanner-snapshot';

const POLYGON_API_BASE = 'https://api.massive.com';
const SCANNER_MIN_VOLUME = parseInt(process.env.KAHF_AI_SCANNER_MIN_VOLUME || '250000000', 10);
const SCANNER_MIN_PRICE = parseFloat(process.env.KAHF_AI_SCANNER_MIN_PRICE || '50');

async function fetchSnapshotPrice(ticker) {
  if (!process.env.POLYGON_API_KEY) return null;
  try {
    const url = `${POLYGON_API_BASE}/v2/snapshot/locale/us/markets/stocks/tickers/${encodeURIComponent(ticker)}?apiKey=${process.env.POLYGON_API_KEY}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const snap = data.ticker;
    if (!snap) return null;
    // Polygon returns 0 for fields with no data (weekends, halts). Skip those.
    const firstPositive = (...xs) => xs.find((v) => typeof v === 'number' && v > 0) ?? null;
    const price = firstPositive(snap.lastTrade?.p, snap.day?.c, snap.prevDay?.c);
    if (!price) return null;
    return {
      price: Number(price.toFixed(2)),
      changePct: typeof snap.todaysChangePerc === 'number' ? Number(snap.todaysChangePerc.toFixed(2)) : null,
      asOf: snap.lastTrade?.t ? new Date(Math.floor(snap.lastTrade.t / 1e6)).toISOString() : null
    };
  } catch (err) {
    console.warn(`[home-preview] snapshot for ${ticker} failed:`, err.message);
    return null;
  }
}

export default async function handler(req, res) {
  try {
    const snapshot = await getScannerSnapshot();
    if (!snapshot || !snapshot.tickers?.length) {
      return res.status(200).json({ available: false, reason: 'No scanner data yet' });
    }

    // Top 3 by volume ratio that pass scanner filters.
    const top = snapshot.tickers
      .filter((t) =>
        typeof t.total_value === 'number' && t.total_value >= SCANNER_MIN_VOLUME &&
        typeof t.avg_price === 'number' && t.avg_price >= SCANNER_MIN_PRICE &&
        typeof t.volume_ratio === 'number'
      )
      .sort((a, b) => b.volume_ratio - a.volume_ratio)
      .slice(0, 3);

    if (top.length === 0) {
      return res.status(200).json({ available: false, reason: 'No qualifying signals today' });
    }

    const enriched = await Promise.all(
      top.map(async (t) => {
        const quote = await fetchSnapshotPrice(t.ticker);
        return {
          ticker: t.ticker,
          volumeRatio: Number(t.volume_ratio.toFixed(2)),
          darkPoolAvgPrice: Number(t.avg_price.toFixed(2)),
          darkPoolValue: t.total_value,
          tradeCount: t.trade_count,
          currentPrice: quote?.price ?? null,
          changePct: quote?.changePct ?? null,
          asOf: quote?.asOf ?? null
        };
      })
    );

    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
    return res.status(200).json({
      available: true,
      generatedAt: new Date().toISOString(),
      scannerDate: snapshot.last_updated || null,
      signals: enriched
    });
  } catch (err) {
    console.error('[home-preview] failed:', err);
    return res.status(200).json({ available: false, reason: err.message });
  }
}
