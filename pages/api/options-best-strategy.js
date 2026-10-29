/**
 * /api/options-best-strategy
 *
 * Runs the full volatility read on a ticker — pulls live ATM quotes for all
 * three strategies (call / put / straddle) and runs the historical hit-rate
 * analysis for each, then sorts by historical hit rate so the calculator can
 * show them side by side.
 *
 * The user enters a ticker and expiration. The highest historical hit rate
 * is listed first. That sort is not a trade recommendation.
 */
import { getOptionsQuote, getAllStrategyAnalyses } from '../../lib/options-analysis-service.js';
import { getScannerSnapshot } from '../../lib/scanner-snapshot';
import { getTickerHistory } from '../../lib/scanner-history';
import { SCANNER_MIN_VOLUME, SCANNER_MIN_PRICE } from '../../lib/scanner-signals';

const STRATEGIES = ['call', 'put', 'straddle'];

function slimDay(day) {
  return {
    date: day.date,
    total_volume: day.total_volume,
    avg_price: day.avg_price,
    total_value: day.total_value,
    trade_count: day.trade_count,
    avg_7day_volume: day.avg_7day_volume,
    volume_ratio: day.volume_ratio
  };
}

async function loadDarkPool(ticker) {
  const [snapshot, history] = await Promise.all([
    getScannerSnapshot().catch(() => null),
    getTickerHistory(ticker).catch(() => null)
  ]);
  const days = history?.days || [];
  const live = snapshot?.tickers?.find((row) => row.ticker === ticker) || null;
  let latest = null;
  if (live && snapshot) {
    latest = {
      date: snapshot.date,
      total_volume: live.total_volume,
      avg_price: live.avg_price,
      total_value: live.total_value,
      trade_count: live.trade_count,
      avg_7day_volume: live.avg_7day_volume,
      volume_ratio: live.volume_ratio,
      passesScannerFilters: live.total_value >= SCANNER_MIN_VOLUME && live.avg_price >= SCANNER_MIN_PRICE,
      source: 'scanner'
    };
  } else if (days.length) {
    latest = { ...slimDay(days[days.length - 1]), passesScannerFilters: false, source: 'history' };
  }
  return {
    available: Boolean(latest),
    scannerDate: snapshot?.date || null,
    sameAsScanner: latest?.source === 'scanner',
    lookahead: false,
    sessionCount: days.length,
    firstDate: history?.firstDate || null,
    lastDate: history?.lastDate || null,
    latest,
    recent: days.slice(-12).map(slimDay)
  };
}

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
    const [callQuote, putQuote, straddleQuote, analyses, darkPool] = await Promise.all([
      getOptionsQuote(ticker, expiration, 'call').catch(() => null),
      getOptionsQuote(ticker, expiration, 'put').catch(() => null),
      getOptionsQuote(ticker, expiration, 'straddle').catch(() => null),
      getAllStrategyAnalyses(ticker).catch(() => ({ call: null, put: null, straddle: null })),
      loadDarkPool(ticker)
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
        darkPool,
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
      winner,
      darkPool
    });
  } catch (err) {
    console.error('[options-best-strategy] failed:', err);
    return res.status(500).json({ error: err.message || 'Failed to compare structures' });
  }
}
