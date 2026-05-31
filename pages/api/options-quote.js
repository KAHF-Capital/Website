// Live options pricing for a single strategy + expiration.
// GET /api/options-quote?ticker=AAPL&expiration=2026-06-20&strategy=call
//   strategy: call | put | straddle  (default: straddle)
//
// Returns the ATM strike and the relevant leg prices, plus a normalized
// `premium` field (single-leg or call+put depending on strategy).
import { getOptionsQuote, STRATEGIES } from '../../lib/options-analysis-service';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { ticker, expiration } = req.query;
  const strategy = (req.query.strategy || 'straddle').toLowerCase();

  if (!ticker || !expiration) {
    return res.status(400).json({ error: 'ticker and expiration are required' });
  }
  if (!STRATEGIES.includes(strategy)) {
    return res.status(400).json({ error: `strategy must be one of: ${STRATEGIES.join(', ')}` });
  }
  if (!process.env.POLYGON_API_KEY) {
    return res.status(500).json({ error: 'Polygon API key not configured' });
  }

  try {
    const quote = await getOptionsQuote(ticker, expiration, strategy);
    const daysToExpiration = Math.ceil(
      (new Date(quote.expiration) - new Date()) / (1000 * 60 * 60 * 24)
    );

    return res.status(200).json({
      ...quote,
      daysToExpiration,
      executionDate: new Date().toISOString().split('T')[0]
    });
  } catch (error) {
    console.error('[api/options-quote] error:', error.message);
    let message = 'Failed to fetch options quote';
    if (/No options contracts found/i.test(error.message)) {
      message = 'No options contracts found for this ticker.';
    } else if (/No valid expiration dates/i.test(error.message)) {
      message = 'No valid expiration dates found.';
    } else if (/No ATM options/i.test(error.message)) {
      message = 'No ATM options found for this expiration.';
    } else if (/Stock price not available/i.test(error.message)) {
      message = 'Unable to fetch the current stock price.';
    }
    return res.status(500).json({ error: message, details: error.message });
  }
}
