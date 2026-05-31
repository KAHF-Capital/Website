/**
 * /api/top-reads
 *
 * Homepage "Top reads — live performance" set. Loads the AI's recent Trade-grade
 * reads (scripts/build-top-reads.js -> top-reads.json) and marks each to the
 * LIVE market via the shared engine in lib/reads-live.js. Cached a few hours.
 */
import { loadReadsFile, markReads, READS_DISCLAIMER } from '../../lib/reads-live.js';

const CACHE = { data: null, ts: 0 };
const TTL = 3 * 60 * 60 * 1000; // 3h

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (CACHE.data && Date.now() - CACHE.ts < TTL) {
    return res.status(200).json(CACHE.data);
  }

  try {
    const file = loadReadsFile('top-reads.json');
    const reads = Array.isArray(file.reads) ? file.reads : [];
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
