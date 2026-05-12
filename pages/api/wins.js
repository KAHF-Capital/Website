// Public track record. Reads manually-curated trade entries from Firestore.
// Edit entries at /admin/wins (admin only).
import { listTrackRecordEntries, isFirebaseAdminConfigured } from '../../lib/firebase-admin';

const CACHE = { data: null, ts: 0 };
const TTL = 60 * 1000; // 1 min — short, since admin edits should appear fast
const LOOKBACK_DAYS = 60;

function safeNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalize(entry) {
  return {
    id: entry.id,
    date: String(entry.date || ''),
    ticker: String(entry.ticker || '').toUpperCase(),
    volume_ratio: safeNumber(entry.volume_ratio),
    total_value: safeNumber(entry.total_value),
    avg_price: safeNumber(entry.avg_price),
    result: ['win', 'loss', 'flat'].includes(entry.result) ? entry.result : 'flat',
    estimated_return_pct: safeNumber(entry.estimated_return_pct),
    note: String(entry.note || '')
  };
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (CACHE.data && Date.now() - CACHE.ts < TTL) {
    return res.status(200).json(CACHE.data);
  }

  try {
    if (!isFirebaseAdminConfigured()) {
      return res.status(200).json({
        generated_at: new Date().toISOString(),
        lookback_days: LOOKBACK_DAYS,
        summary: { total: 0, wins: 0, losses: 0, flats: 0, hit_rate: 0, avg_winner: 0, avg_loser: 0 },
        alerts: [],
        disclaimer: 'No verified trades published yet. Track record will appear here once entries are added in /admin/wins.'
      });
    }

    const { entries } = await listTrackRecordEntries({ limit: 500 });
    const list = entries
      .map(normalize)
      .filter((e) => e.date && e.ticker)
      .sort((a, b) => (a.date < b.date ? 1 : -1));

    const winners = list.filter((w) => w.result === 'win');
    const losers = list.filter((w) => w.result === 'loss');
    const flats = list.filter((w) => w.result === 'flat');

    const summary = {
      total: list.length,
      wins: winners.length,
      losses: losers.length,
      flats: flats.length,
      hit_rate: list.length ? Math.round((winners.length / list.length) * 100) : 0,
      avg_winner: winners.length
        ? +(winners.reduce((s, w) => s + w.estimated_return_pct, 0) / winners.length).toFixed(1)
        : 0,
      avg_loser: losers.length
        ? +(losers.reduce((s, w) => s + w.estimated_return_pct, 0) / losers.length).toFixed(1)
        : 0
    };

    const payload = {
      generated_at: new Date().toISOString(),
      lookback_days: LOOKBACK_DAYS,
      summary,
      alerts: list,
      disclaimer: 'Manually-published trade alerts. Returns are recorded by KAHF Capital based on the trade outcome; this is not advice. Past performance is not indicative of future results.'
    };

    CACHE.data = payload;
    CACHE.ts = Date.now();
    return res.status(200).json(payload);
  } catch (err) {
    console.error('[api/wins] error:', err);
    return res.status(500).json({ error: 'Failed to load track record' });
  }
}
