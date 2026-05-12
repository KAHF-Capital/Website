// Aggregated ticker data for /ticker/[symbol] SEO pages.
// Pulls last N days of dark pool prints from blob storage.
// Server-side, cached per ticker for 5 minutes.
import { listDataFiles, getDataFile } from '../../lib/blob-data';

const TICKER_RE = /^[A-Z]{1,6}$/;
const CACHE = new Map(); // symbol -> { data, ts }
const TTL = 5 * 60 * 1000;
const LOOKBACK_FILES = 30;

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const symbol = String(req.query.symbol || '').toUpperCase();
  if (!TICKER_RE.test(symbol)) {
    return res.status(400).json({ error: 'Invalid ticker' });
  }

  const cached = CACHE.get(symbol);
  if (cached && Date.now() - cached.ts < TTL) {
    return res.status(200).json(cached.data);
  }

  try {
    const files = (await listDataFiles()).slice(0, LOOKBACK_FILES);
    const history = [];

    for (const file of files) {
      let data;
      try {
        data = await getDataFile(file.url);
      } catch {
        continue;
      }
      if (!data?.tickers) continue;
      const t = data.tickers.find((x) => x.ticker === symbol);
      const date = (file.filename.match(/(\d{4}-\d{2}-\d{2})/) || [])[1] || data.date;
      if (t) {
        history.push({
          date,
          total_volume: Number(t.total_volume || 0),
          total_value: Number(t.total_value || 0),
          avg_price: Number(t.avg_price || 0),
          trade_count: Number(t.trade_count || 0),
          volume_ratio: Number(t.volume_ratio || 0)
        });
      }
    }

    history.sort((a, b) => a.date.localeCompare(b.date));

    const latest = history[history.length - 1] || null;
    const peak = history.reduce((m, h) => (!m || h.volume_ratio > m.volume_ratio ? h : m), null);
    const totalNotional = history.reduce((s, h) => s + h.total_value, 0);

    const payload = {
      symbol,
      generated_at: new Date().toISOString(),
      lookback_days: LOOKBACK_FILES,
      has_data: history.length > 0,
      latest,
      peak,
      total_notional_30d: totalNotional,
      avg_volume_ratio: history.length ? +(history.reduce((s, h) => s + h.volume_ratio, 0) / history.length).toFixed(2) : 0,
      history
    };

    CACHE.set(symbol, { data: payload, ts: Date.now() });
    return res.status(200).json(payload);
  } catch (err) {
    console.error('[api/ticker-summary] error:', err);
    return res.status(500).json({ error: 'Failed to load ticker data' });
  }
}
