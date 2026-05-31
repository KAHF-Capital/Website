// Historical profitability for a call / put / straddle on a given ticker.
// POST /api/options-analysis
//   body: { ticker, strategy, strikePrice, premium, daysToExpiration }
//   For straddle, `premium` is the total (call + put). For call/put, it's
//   the single-leg mid.
import { runHistoricalAnalysis, STRATEGIES } from '../../lib/options-analysis-service';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { ticker, strategy = 'straddle', strikePrice, premium, callPremium, putPremium, daysToExpiration } = req.body || {};

  if (!ticker) return res.status(400).json({ error: 'ticker is required' });
  if (!STRATEGIES.includes(strategy)) {
    return res.status(400).json({ error: `strategy must be one of: ${STRATEGIES.join(', ')}` });
  }
  if (!premium && !callPremium && !putPremium) {
    return res.status(400).json({ error: 'premium (or callPremium/putPremium for straddle) is required' });
  }
  if (!process.env.POLYGON_API_KEY) {
    return res.status(500).json({ error: 'Polygon API key not configured' });
  }

  try {
    const analysis = await runHistoricalAnalysis({
      ticker,
      strategy,
      strikePrice: strikePrice || 100,
      premium,
      callPremium,
      putPremium,
      daysToExpiration: daysToExpiration || 30
    });
    return res.status(200).json(analysis);
  } catch (error) {
    console.error('[api/options-analysis] error:', error.message);
    return res.status(500).json({ error: error.message || 'Failed to run analysis' });
  }
}
