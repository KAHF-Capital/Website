/**
 * Unified options analysis service. Powers:
 *   - /api/options-quote        (live leg pricing for call/put/straddle)
 *   - /api/options-analysis     (historical profitability)
 *   - pages/api/kahf-ai-chat.js (AI scanner context)
 *   - pages/api/mcp.js          (kahf-data MCP tool: get_options_analysis)
 *   - pages/api/automated-scanner.js (email digest)
 *
 * Methodology mirrors the original straddle calculator:
 *   1. Find expiration nearest the requested DTE (default 30d).
 *   2. Pick the ATM strike (closest to spot).
 *   3. Read live mid prices for the relevant leg(s) from Polygon.
 *   4. Pull ~3 years of daily history, build N-day overlapping returns.
 *   5. Count how often the underlying breaches the breakeven(s) implied
 *      by the actual premium. That's the historical hit rate.
 *
 * The math for each strategy:
 *   long call:     profit if price_end > strike + premium
 *   long put:      profit if price_end < strike - premium
 *   long straddle: profit if |price_end - strike| > total_premium
 */

import {
  getCurrentStockPrice,
  getOptionsContracts,
  getOptionsSnapshot,
  findClosestExpiration,
  findATMStrike,
  getHistoricalStockData,
  calculatePriceMovements
} from './polygon-data-service.js';

export const STRATEGIES = ['call', 'put', 'straddle'];

// ---------------------------------------------------------------------------
//  Pure analysis helpers — no I/O
// ---------------------------------------------------------------------------

export function calculateOverlappingMovements(historicalData, daysToExpiration) {
  if (!historicalData || historicalData.length === 0 || daysToExpiration <= 0) return [];
  const sorted = [...historicalData].sort((a, b) => new Date(b.date) - new Date(a.date));
  const movements = [];
  for (let i = 0; i + daysToExpiration < sorted.length; i++) {
    const start = sorted[i];
    const end = sorted[i + daysToExpiration];
    if (start.close > 0 && end.close > 0) {
      movements.push({
        startDate: start.date,
        endDate: end.date,
        startPrice: start.close,
        endPrice: end.close,
        // Match the original convention: positive = price moved up over the window.
        percentMove: (start.close - end.close) / end.close
      });
    }
  }
  return movements;
}

/**
 * Count historical N-day moves that would have been profitable for the
 * given strategy. Returns counts AND the raw averages that the UI needs.
 */
export function analyzeOptionsProfitability(historicalData, { strategy, upperBreakevenPct, lowerBreakevenPct }) {
  const empty = {
    strategy,
    aboveUpper: 0,
    belowLower: 0,
    totalProfitable: 0,
    totalSamples: 0,
    profitableRate: 0,
    maxProfitProbability: 0,
    maxLossProbability: 0,
    aboveUpperPct: 0,
    belowLowerPct: 0,
    upperBreakevenPct: (upperBreakevenPct ?? 0) * 100,
    lowerBreakevenPct: (lowerBreakevenPct ?? 0) * 100,
    avgMove: 0,
    maxMove: 0,
    minMove: 0,
    avgUpMove: 0,
    avgDownMove: 0,
    dataQuality: 'none'
  };
  if (!historicalData || historicalData.length === 0) return empty;

  // Filter outliers; +/-50% over a single N-day window is almost always bad data.
  let filtered = historicalData.filter((m) => Math.abs(m.percentMove) <= 0.5);
  if (filtered.length === 0) filtered = historicalData;

  let aboveUpper = 0;
  let belowLower = 0;
  let upMoves = [];
  let downMoves = [];
  for (const m of filtered) {
    const pct = m.percentMove;
    if (upperBreakevenPct !== undefined && pct > upperBreakevenPct) aboveUpper += 1;
    if (lowerBreakevenPct !== undefined && pct < lowerBreakevenPct) belowLower += 1;
    if (pct > 0) upMoves.push(pct);
    else if (pct < 0) downMoves.push(pct);
  }

  const totalSamples = filtered.length;
  let totalProfitable;
  if (strategy === 'call') totalProfitable = aboveUpper;
  else if (strategy === 'put') totalProfitable = belowLower;
  else totalProfitable = aboveUpper + belowLower;

  const profitableRate = totalSamples ? (totalProfitable / totalSamples) * 100 : 0;
  const avgMove = filtered.reduce((s, m) => s + Math.abs(m.percentMove), 0) / totalSamples;
  const maxMove = Math.max(...filtered.map((m) => Math.abs(m.percentMove)));
  const minMove = Math.min(...filtered.map((m) => Math.abs(m.percentMove)));

  return {
    strategy,
    aboveUpper,
    belowLower,
    totalProfitable,
    totalSamples,
    profitableRate,
    maxProfitProbability: profitableRate,
    maxLossProbability: 100 - profitableRate,
    aboveUpperPct: totalSamples ? (aboveUpper / totalSamples) * 100 : 0,
    belowLowerPct: totalSamples ? (belowLower / totalSamples) * 100 : 0,
    upperBreakevenPct: (upperBreakevenPct ?? 0) * 100,
    lowerBreakevenPct: (lowerBreakevenPct ?? 0) * 100,
    avgMove: avgMove * 100,
    maxMove: maxMove * 100,
    minMove: minMove * 100,
    avgUpMove: upMoves.length ? (upMoves.reduce((a, b) => a + b, 0) / upMoves.length) * 100 : 0,
    avgDownMove: downMoves.length ? (downMoves.reduce((a, b) => a + b, 0) / downMoves.length) * 100 : 0,
    dataQuality:
      totalSamples >= 50 ? 'high' : totalSamples >= 25 ? 'medium' : totalSamples >= 10 ? 'low' : 'limited'
  };
}

function computeBreakevens({ strategy, strikePrice, premium, callPremium, putPremium }) {
  if (strategy === 'call') {
    const p = Number(premium ?? callPremium ?? 0);
    return {
      premium: p,
      upper: strikePrice + p,
      lower: null,
      upperBreakevenPct: p / strikePrice,
      lowerBreakevenPct: undefined,
      maxLoss: p
    };
  }
  if (strategy === 'put') {
    const p = Number(premium ?? putPremium ?? 0);
    return {
      premium: p,
      upper: null,
      lower: strikePrice - p,
      upperBreakevenPct: undefined,
      lowerBreakevenPct: -(p / strikePrice),
      maxLoss: p
    };
  }
  // straddle
  const cp = Number(callPremium ?? 0);
  const pp = Number(putPremium ?? 0);
  const total = premium != null ? Number(premium) : cp + pp;
  return {
    premium: total,
    upper: strikePrice + total,
    lower: strikePrice - total,
    upperBreakevenPct: total / strikePrice,
    lowerBreakevenPct: -(total / strikePrice),
    maxLoss: total
  };
}

// ---------------------------------------------------------------------------
//  Historical analysis given a strategy + concrete numbers (called by API)
// ---------------------------------------------------------------------------

export async function runHistoricalAnalysis({
  ticker,
  strategy,
  strikePrice,
  premium,
  callPremium,
  putPremium,
  daysToExpiration
}) {
  if (!STRATEGIES.includes(strategy)) {
    throw new Error(`Invalid strategy: ${strategy}. Must be one of ${STRATEGIES.join(', ')}.`);
  }
  if (!strikePrice || strikePrice <= 0) throw new Error('strikePrice is required');

  const dte = daysToExpiration || 30;
  const MIN_PERIODS = 25;

  const breakevens = computeBreakevens({ strategy, strikePrice, premium, callPremium, putPremium });
  if (breakevens.premium <= 0) throw new Error('premium must be > 0');

  const endDate = new Date().toISOString().split('T')[0];
  const calendarDaysNeeded = Math.max(750, Math.ceil((MIN_PERIODS * dte) / 0.7) + 60);
  const startDate = new Date(Date.now() - calendarDaysNeeded * 24 * 60 * 60 * 1000)
    .toISOString()
    .split('T')[0];

  const historicalData = await getHistoricalStockData(ticker, startDate, endDate);

  let movements = calculatePriceMovements(historicalData, dte);
  if (movements.length < MIN_PERIODS) {
    movements = calculateOverlappingMovements(historicalData, dte);
  }

  const analysis = analyzeOptionsProfitability(movements, {
    strategy,
    upperBreakevenPct: breakevens.upperBreakevenPct,
    lowerBreakevenPct: breakevens.lowerBreakevenPct
  });

  analysis.periodsRequested = MIN_PERIODS;
  analysis.periodsFound = movements.length;
  analysis.historyYears =
    historicalData.length > 0
      ? +(
          (new Date(historicalData[historicalData.length - 1].date) -
            new Date(historicalData[0].date)) /
          (365.25 * 24 * 60 * 60 * 1000)
        ).toFixed(1)
      : 0;
  analysis.breakevens = breakevens;
  analysis.daysToExpiration = dte;
  analysis.strikePrice = strikePrice;
  analysis.ticker = ticker;

  return analysis;
}

// ---------------------------------------------------------------------------
//  Live quote: fetch ATM strike + leg prices for a strategy at an expiration
// ---------------------------------------------------------------------------

export async function getOptionsQuote(ticker, expiration, strategy = 'straddle') {
  if (!STRATEGIES.includes(strategy)) {
    throw new Error(`Invalid strategy: ${strategy}`);
  }

  const currentPrice = await getCurrentStockPrice(ticker);
  const contracts = await getOptionsContracts(ticker);
  if (contracts.length === 0) throw new Error('No options contracts found');

  const closestExpiration = findClosestExpiration(contracts, expiration);
  if (!closestExpiration) throw new Error('No valid expiration dates found');

  const expirationContracts = contracts.filter((c) => c.expiration_date === closestExpiration);

  let callStrike = null;
  let putStrike = null;
  let callContract = null;
  let putContract = null;

  if (strategy === 'call' || strategy === 'straddle') {
    callStrike = findATMStrike(expirationContracts, currentPrice, 'call');
    if (callStrike) {
      callContract = expirationContracts.find((c) => c.contract_type === 'call' && c.strike_price === callStrike);
    }
  }
  if (strategy === 'put' || strategy === 'straddle') {
    putStrike = findATMStrike(expirationContracts, currentPrice, 'put');
    if (putStrike) {
      putContract = expirationContracts.find((c) => c.contract_type === 'put' && c.strike_price === putStrike);
    }
  }

  // For straddle we want a single strike. Prefer the call strike (matches legacy behavior).
  const strikePrice = strategy === 'put' ? putStrike : callStrike || putStrike;
  if (!strikePrice) throw new Error('No ATM options found for this expiration');

  const tickersToQuote = [callContract?.ticker, putContract?.ticker].filter(Boolean);
  const snapshotData = tickersToQuote.length > 0
    ? await getOptionsSnapshot(ticker, tickersToQuote)
    : {};

  const callData = callContract ? snapshotData[callContract.ticker] || { price: 0, bid: 0, ask: 0 } : null;
  const putData = putContract ? snapshotData[putContract.ticker] || { price: 0, bid: 0, ask: 0 } : null;

  const callPrice = callData?.price || 0;
  const putPrice = putData?.price || 0;

  let premium;
  if (strategy === 'call') premium = callPrice;
  else if (strategy === 'put') premium = putPrice;
  else premium = callPrice + putPrice;

  return {
    ticker: ticker.toUpperCase(),
    strategy,
    currentPrice,
    expiration: closestExpiration,
    requestedExpiration: expiration,
    strikePrice,
    callStrike,
    putStrike,
    callPrice,
    putPrice,
    premium,
    totalPremium: callPrice + putPrice, // legacy alias
    callBid: callData?.bid ?? null,
    callAsk: callData?.ask ?? null,
    putBid: putData?.bid ?? null,
    putAsk: putData?.ask ?? null,
    callTicker: callContract?.ticker ?? null,
    putTicker: putContract?.ticker ?? null,
    callData,
    putData
  };
}

// ---------------------------------------------------------------------------
//  Full ticker scan: live quote + historical hit rate + liquidity + IV
// ---------------------------------------------------------------------------

function summarizeLiquidity(callData, putData) {
  const callVolume = callData?.volume || 0;
  const putVolume = putData?.volume || 0;
  const callOI = callData?.openInterest || 0;
  const putOI = putData?.openInterest || 0;
  const totalVolume = callVolume + putVolume;
  const totalOI = callOI + putOI;

  let rating = 'low';
  if (totalVolume >= 2000 && totalOI >= 5000) rating = 'high';
  else if (totalVolume >= 500 && totalOI >= 1000) rating = 'medium';

  const spread = (mid, bid, ask) =>
    bid > 0 && ask > 0 && mid > 0
      ? { abs: Number((ask - bid).toFixed(2)), pct: Number((((ask - bid) / mid) * 100).toFixed(1)) }
      : { abs: null, pct: null };

  return {
    rating,
    callVolume,
    putVolume,
    callOpenInterest: callOI,
    putOpenInterest: putOI,
    totalDayVolume: totalVolume,
    totalOpenInterest: totalOI,
    callBidAskSpread: spread(callData?.price, callData?.bid, callData?.ask).abs,
    callBidAskSpreadPct: spread(callData?.price, callData?.bid, callData?.ask).pct,
    putBidAskSpread: spread(putData?.price, putData?.bid, putData?.ask).abs,
    putBidAskSpreadPct: spread(putData?.price, putData?.bid, putData?.ask).pct
  };
}

/**
 * High-level: pick a ~30-day ATM contract for the given strategy, score its
 * historical hit rate, return everything an analyst (or the AI) needs.
 *
 * Returns null if data is unavailable.
 */
export async function getOptionsSuccessRate(ticker, { strategy = 'straddle', targetDays = 30 } = {}) {
  try {
    if (!STRATEGIES.includes(strategy)) {
      throw new Error(`Invalid strategy: ${strategy}`);
    }

    const target = new Date();
    target.setDate(target.getDate() + targetDays);
    const targetDate = target.toISOString().split('T')[0];

    const quote = await getOptionsQuote(ticker, targetDate, strategy);
    if (!quote || quote.premium <= 0) return null;

    const dte = Math.ceil((new Date(quote.expiration) - new Date()) / (1000 * 60 * 60 * 24));
    if (dte <= 0) return null;

    const analysis = await runHistoricalAnalysis({
      ticker,
      strategy,
      strikePrice: quote.strikePrice,
      premium: quote.premium,
      daysToExpiration: dte
    });

    return {
      strategy,
      ticker,
      successRate: Math.round(analysis.profitableRate),
      dte,
      expiration: quote.expiration,
      strikePrice: quote.strikePrice,
      premium: Number(quote.premium.toFixed(2)),
      callPrice: Number(quote.callPrice.toFixed(2)),
      putPrice: Number(quote.putPrice.toFixed(2)),
      totalSamples: analysis.totalSamples,
      dataQuality: analysis.dataQuality,
      breakevens: analysis.breakevens,
      liquidity: summarizeLiquidity(quote.callData, quote.putData),
      impliedVolatility: {
        call: quote.callData?.impliedVolatility
          ? Number((quote.callData.impliedVolatility * 100).toFixed(1))
          : null,
        put: quote.putData?.impliedVolatility
          ? Number((quote.putData.impliedVolatility * 100).toFixed(1))
          : null
      },
      avgUpMove: analysis.avgUpMove,
      avgDownMove: analysis.avgDownMove,
      maxMove: analysis.maxMove,
      aboveUpper: analysis.aboveUpper,
      belowLower: analysis.belowLower,
      // For straddle, give the directional skew so the AI can see whether the
      // hit rate comes more from up moves or down moves.
      upBias:
        analysis.aboveUpper + analysis.belowLower > 0
          ? Number(((analysis.aboveUpper / (analysis.aboveUpper + analysis.belowLower)) * 100).toFixed(0))
          : null
    };
  } catch (error) {
    console.error(`[options-analysis] ${strategy} analysis failed for ${ticker}:`, error.message);
    return null;
  }
}

/**
 * Convenience: run all three strategies (call/put/straddle) for one ticker.
 * Used by the AI to give the user a full volatility read.
 */
export async function getAllStrategyAnalyses(ticker, { targetDays = 30 } = {}) {
  const [call, put, straddle] = await Promise.all([
    getOptionsSuccessRate(ticker, { strategy: 'call', targetDays }),
    getOptionsSuccessRate(ticker, { strategy: 'put', targetDays }),
    getOptionsSuccessRate(ticker, { strategy: 'straddle', targetDays })
  ]);
  return { call, put, straddle };
}
