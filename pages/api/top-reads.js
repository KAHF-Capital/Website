/**
 * /api/top-reads
 *
 * Homepage "Top reads — live performance" set. Loads the AI's recent Trade-grade
 * reads (scripts/build-top-reads.js -> top-reads.json) and marks each to the
 * LIVE market via the shared engine in lib/reads-live.js. Cached a few hours.
 */
import { markReads, READS_DISCLAIMER } from '../../lib/reads-live.js';
import { isExcluded } from '../../lib/read-filters.js';
import { getReadsJson } from '../../lib/blob-data';
// Bundled fallback so the homepage works on a cold deploy. At runtime we prefer
// the Blob copy (refreshed daily by scripts/refresh-track-record.js) so the
// scoreboard updates without a redeploy. (Static fs reads return empty on
// Vercel because dynamically-read files aren't traced into the bundle.)
import bundled from '../../top-reads.json';

// Short in-memory TTL so new reads appear quickly; the CDN header below
// absorbs traffic so Polygon isn't hammered on cache misses.
const CACHE = { data: null, ts: 0 };
const TTL = 15 * 60 * 1000; // 15 min

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  res.setHeader('Cache-Control', 'public, s-maxage=900, stale-while-revalidate=3600');

  if (CACHE.data && Date.now() - CACHE.ts < TTL) {
    return res.status(200).json(CACHE.data);
  }

  try {
    const fromBlob = await getReadsJson('top-reads.json').catch(() => null);
    const file = fromBlob && Array.isArray(fromBlob.reads) ? fromBlob : bundled;
    // Drop manually-excluded tickers at serve time so a stale Blob copy can't
    // surface a known-bad read before the next daily refresh rewrites it.
    const reads = (Array.isArray(file.reads) ? file.reads : []).filter((r) => !isExcluded(r.ticker));
    const { marked, summary } = await markReads(reads);

    const payload = {
      generated_at: new Date().toISOString(),
      window_days: file.window_days || 90,
      summary,
      reads: marked,
      disclaimer: READS_DISCLAIMER
    };

    CACHE.data = payload;
    CACHE.ts = Date.now();
    return res.status(200).json(payload);
  } catch (err) {
    console.error('[api/top-reads] error:', err);
    return res.status(500).json({ error: 'Failed to load top reads' });
  }
}
