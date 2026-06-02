// Public track record. Auto-generated from KAHF AI's scored dark pool reads
// (scripts/build-top-reads.js --out track-record-reads) and marked to the LIVE
// options market via the shared engine in lib/reads-live.js — the same engine
// that powers the homepage scoreboard, so the two never disagree.
import { markReads, READS_DISCLAIMER } from '../../lib/reads-live.js';
import { getReadsJson } from '../../lib/blob-data';
// Bundled fallback so the page works on a cold deploy. At runtime we prefer the
// Blob copy (refreshed daily by scripts/refresh-track-record.js) so new reads
// appear without a redeploy.
import bundled from '../../track-record-reads.json';

const CACHE = { data: null, ts: 0 };
const TTL = 3 * 60 * 60 * 1000; // 3h

function toAlert(r) {
  const result = r.returnPct === null ? 'flat' : r.returnPct > 0 ? 'win' : r.returnPct < 0 ? 'loss' : 'flat';
  const held = r.status === 'open' ? 'open — marked to market' : 'held to expiry';
  return {
    date: r.date,
    ticker: r.ticker,
    volume_ratio: r.volumeRatio || 0,
    total_value: r.darkPoolValue || 0,
    avg_price: 0,
    result,
    estimated_return_pct: r.returnPct ?? 0,
    hypothetical: true,
    note: `${r.structureLabel} · ${held} · as-of edge ${r.asofHitRate}%`
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
    const fromBlob = await getReadsJson('track-record-reads.json').catch(() => null);
    const file = fromBlob && Array.isArray(fromBlob.reads) ? fromBlob : bundled;
    const reads = Array.isArray(file.reads) ? file.reads : [];
    const { marked, summary } = await markReads(reads);
    const alerts = marked.map(toAlert);

    const payload = {
      generated_at: new Date().toISOString(),
      summary: {
        total: summary.total,
        wins: summary.winners,
        losses: summary.losers,
        flats: summary.total - summary.winners - summary.losers,
        hit_rate: summary.hitRate,
        avg_winner: summary.avgWinner,
        avg_loser: summary.avgLoser
      },
      alerts,
      has_hypothetical: alerts.length > 0,
      disclaimer: READS_DISCLAIMER
    };

    CACHE.data = payload;
    CACHE.ts = Date.now();
    return res.status(200).json(payload);
  } catch (err) {
    console.error('[api/wins] error:', err);
    return res.status(500).json({ error: 'Failed to load track record' });
  }
}
