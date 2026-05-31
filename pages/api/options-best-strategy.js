/**
 * /api/options-best-strategy
 *
 * Runs the full volatility read on a ticker — pulls live ATM quotes for all
 * three strategies (call / put / straddle) and runs the historical hit-rate
 * analysis for each, then picks the strongest as the recommendation.
 *
 * This is what powers the calculator's "Find best strategy" mode. The user
 * never picks a strategy themselves — they just enter a ticker + expiration,
 * we figure out the best play.
 */
import { getOptionsQuote, getAllStrategyAnalyses } from '../../lib/options-analysis-service.js';

const STRATEGIES = ['call', 'put', 'straddle'];

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const ticker = String(req.query.ticker || '').toUpperCase().trim();
  const expiration = String(req.query.expiration || '').trim();
  if (!ticker) return res.status(400).json({ error: 'ticker is required' });
  if (!expiration) return res.status(400).json({ error: 'expiration is required (YYYY-MM-DD)' });

  try {
    // Parallel: live quotes for all 3 strategies + 3 historical analyses.
    const [callQuote, putQuote, straddleQuote, analyses] = await Promise.all([
      getOptionsQuote(ticker, expiration, 'call').catch(() => null),
      getOptionsQuote(ticker, expiration, 'put').catch(() => null),
      getOptionsQuote(ticker, expiration, 'straddle').catch(() => null),
      getAllStrategyAnalyses(ticker).catch(() => ({ call: null, put: null, straddle: null }))
    ]);

    const quoteByStrategy = { call: callQuote, put: putQuote, straddle: straddleQuote };

    // Merge quote + analysis for each strategy. Skip ones that have no quote OR no analysis.
    const candidates = STRATEGIES.map((s) => {
      const quote = quoteByStrategy[s];
      const analysis = analyses[s];
      if (!quote || !analysis) return null;
      return {
        strategy: s,
        label: s === 'call' ? 'Long Call' : s === 'put' ? 'Long Put' : 'ATM Straddle',
        quote: {
          strikePrice: quote.strikePrice,
          expiration: quote.expiration,
          premium: quote.premium,
          callPrice: quote.callPrice,
          putPrice: quote.putPrice,
          callBid: quote.callBid,
          callAsk: quote.callAsk,
          putBid: quote.putBid,
          putAsk: quote.putAsk
        },
        analysis: {
          successRate: analysis.successRate,
          totalProfitable: analysis.totalProfitable,
          totalSamples: analysis.totalSamples,
          historyYears: analysis.historyYears,
          dataQuality: analysis.dataQuality,
          aboveUpper: analysis.aboveUpper,
          aboveUpperPct: analysis.aboveUpperPct,
          belowLower: analysis.belowLower,
          belowLowerPct: analysis.belowLowerPct,
          profitableRate: analysis.profitableRate,
          daysToExpiration: analysis.daysToExpiration,
          executionDate: analysis.executionDate
        }
      };
    }).filter(Boolean);

    if (candidates.length === 0) {
      return res.status(200).json({
        ticker,
        expiration,
        available: false,
        reason: 'No live quotes + analysis available for this ticker / expiration.'
      });
    }

    // Pick the winner: highest historical hit rate.
    // Tiebreak: prefer higher samples (more data), then lower premium (cheaper to wrong).
    const winner = [...candidates].sort((a, b) => {
      if (b.analysis.successRate !== a.analysis.successRate) {
        return b.analysis.successRate - a.analysis.successRate;
      }
      if (b.analysis.totalSamples !== a.analysis.totalSamples) {
        return b.analysis.totalSamples - a.analysis.totalSamples;
      }
      return (a.quote.premium || 0) - (b.quote.premium || 0);
    })[0];

    return res.status(200).json({
      ticker,
      expiration: winner.quote.expiration,
      requestedExpiration: expiration,
      available: true,
      bestStrategy: winner.strategy,
      candidates,
      winner
    });
  } catch (err) {
    console.error('[options-best-strategy] failed:', err);
    return res.status(500).json({ error: err.message || 'Failed to compute best strategy' });
  }
}
