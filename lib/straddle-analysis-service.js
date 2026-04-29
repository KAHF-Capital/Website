/**
 * Shared straddle analysis logic used by:
 *   - pages/api/straddle-analysis.js   (interactive calculator)
 *   - pages/api/automated-scanner.js   (daily email digest)
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

// ---------------------------------------------------------------------------
//  Core analysis helpers
// ---------------------------------------------------------------------------

export function analyzeHistoricalProfitability(historicalData, upperBreakevenPct, lowerBreakevenPct) {
  let aboveUpperCount = 0;
  let belowLowerCount = 0;
  let totalValidSamples = 0;

  if (!historicalData || historicalData.length === 0) {
    return {
      aboveUpper: 0, belowLower: 0, totalProfitable: 0, totalSamples: 0,
      profitableRate: 0, maxProfitProbability: 0, maxLossProbability: 0,
      aboveUpperPct: 0, belowLowerPct: 0,
      upperBreakevenPct: upperBreakevenPct * 100,
      lowerBreakevenPct: lowerBreakevenPct * 100,
      avgMove: 0, maxMove: 0, minMove: 0, dataQuality: 'none'
    };
  }

  let filteredData = historicalData.filter(m => Math.abs(m.percentMove) <= 0.5);
  if (filteredData.length === 0) filteredData = historicalData;

  filteredData.forEach(movement => {
    const pct = movement.percentMove;
    if (pct > upperBreakevenPct) aboveUpperCount++;
    if (pct < lowerBreakevenPct) belowLowerCount++;
    totalValidSamples++;
  });

  const totalProfitable = aboveUpperCount + belowLowerCount;
  const profitableRate = totalValidSamples > 0 ? (totalProfitable / totalValidSamples) * 100 : 0;
  const maxLossProbability = totalValidSamples > 0 ? ((totalValidSamples - totalProfitable) / totalValidSamples) * 100 : 0;

  const avgMove = filteredData.length > 0
    ? filteredData.reduce((s, m) => s + Math.abs(m.percentMove), 0) / filteredData.length : 0;
  const maxMove = filteredData.length > 0
    ? Math.max(...filteredData.map(m => Math.abs(m.percentMove))) : 0;
  const minMove = filteredData.length > 0
    ? Math.min(...filteredData.map(m => Math.abs(m.percentMove))) : 0;

  return {
    aboveUpper: aboveUpperCount,
    belowLower: belowLowerCount,
    totalProfitable,
    totalSamples: totalValidSamples,
    profitableRate,
    maxProfitProbability: profitableRate,
    maxLossProbability,
    aboveUpperPct: totalValidSamples > 0 ? (aboveUpperCount / totalValidSamples) * 100 : 0,
    belowLowerPct: totalValidSamples > 0 ? (belowLowerCount / totalValidSamples) * 100 : 0,
    upperBreakevenPct: upperBreakevenPct * 100,
    lowerBreakevenPct: lowerBreakevenPct * 100,
    avgMove: avgMove * 100,
    maxMove: maxMove * 100,
    minMove: minMove * 100,
    dataQuality: totalValidSamples >= 50 ? 'high' : totalValidSamples >= 25 ? 'medium' : totalValidSamples >= 10 ? 'low' : 'limited'
  };
}

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
        percentMove: (start.close - end.close) / end.close
      });
    }
  }

  return movements;
}

// ---------------------------------------------------------------------------
//  High-level: compute straddle success rate for a single ticker
//  Uses ~30-day expiration, ATM strike, real premium from Polygon.
//  Returns { successRate, dte, strikePrice, totalPremium, dataQuality }
//  or null if data is unavailable.
// ---------------------------------------------------------------------------

export async function getStraddleSuccessRate(ticker) {
  try {
    const currentPrice = await getCurrentStockPrice(ticker);
    const contracts = await getOptionsContracts(ticker);
    if (contracts.length === 0) return null;

    // Find expiration closest to 30 calendar days out
    const target30 = new Date();
    target30.setDate(target30.getDate() + 30);
    const targetDate = target30.toISOString().split('T')[0];
    const expiration = findClosestExpiration(contracts, targetDate);
    if (!expiration) return null;

    const dte = Math.ceil((new Date(expiration) - new Date()) / (1000 * 60 * 60 * 24));
    if (dte <= 0) return null;

    const expirationContracts = contracts.filter(c => c.expiration_date === expiration);
    const callStrike = findATMStrike(expirationContracts, currentPrice, 'call');
    const putStrike = findATMStrike(expirationContracts, currentPrice, 'put');
    if (!callStrike || !putStrike) return null;

    const callContract = expirationContracts.find(c => c.contract_type === 'call' && c.strike_price === callStrike);
    const putContract = expirationContracts.find(c => c.contract_type === 'put' && c.strike_price === putStrike);
    if (!callContract || !putContract) return null;

    const snapshotData = await getOptionsSnapshot(ticker, [callContract.ticker, putContract.ticker]);
    const callData = snapshotData[callContract.ticker] || { price: 0 };
    const putData = snapshotData[putContract.ticker] || { price: 0 };
    const totalPremium = callData.price + putData.price;
    if (totalPremium <= 0) return null;

    const strikePrice = callStrike;
    const upperBreakevenPct = totalPremium / strikePrice;
    const lowerBreakevenPct = -(totalPremium / strikePrice);

    // Fetch historical data
    const MIN_PERIODS = 25;
    const endDate = new Date().toISOString().split('T')[0];
    const calendarDaysNeeded = Math.max(750, Math.ceil((MIN_PERIODS * dte) / 0.7) + 60);
    const startDate = new Date(Date.now() - calendarDaysNeeded * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const historicalData = await getHistoricalStockData(ticker, startDate, endDate);

    let movements = calculatePriceMovements(historicalData, dte);
    if (movements.length < MIN_PERIODS) {
      movements = calculateOverlappingMovements(historicalData, dte);
    }

    const analysis = analyzeHistoricalProfitability(movements, upperBreakevenPct, lowerBreakevenPct);

    const callSpread = callData.ask > 0 && callData.bid > 0 ? callData.ask - callData.bid : null;
    const putSpread = putData.ask > 0 && putData.bid > 0 ? putData.ask - putData.bid : null;
    const callMid = callData.price > 0 ? callData.price : null;
    const putMid = putData.price > 0 ? putData.price : null;
    const callSpreadPct = callSpread !== null && callMid ? Number(((callSpread / callMid) * 100).toFixed(1)) : null;
    const putSpreadPct = putSpread !== null && putMid ? Number(((putSpread / putMid) * 100).toFixed(1)) : null;

    const callVolume = callData.volume || 0;
    const putVolume = putData.volume || 0;
    const callOI = callData.openInterest || 0;
    const putOI = putData.openInterest || 0;
    const totalDayVolume = callVolume + putVolume;
    const totalOI = callOI + putOI;

    let liquidityRating = 'low';
    if (totalDayVolume >= 2000 && totalOI >= 5000) liquidityRating = 'high';
    else if (totalDayVolume >= 500 && totalOI >= 1000) liquidityRating = 'medium';

    return {
      successRate: Math.round(analysis.profitableRate),
      dte,
      expiration,
      strikePrice,
      totalPremium: totalPremium.toFixed(2),
      totalSamples: analysis.totalSamples,
      dataQuality: analysis.dataQuality,
      liquidity: {
        rating: liquidityRating,
        callVolume,
        putVolume,
        callOpenInterest: callOI,
        putOpenInterest: putOI,
        totalDayVolume,
        totalOpenInterest: totalOI,
        callBidAskSpread: callSpread !== null ? Number(callSpread.toFixed(2)) : null,
        putBidAskSpread: putSpread !== null ? Number(putSpread.toFixed(2)) : null,
        callBidAskSpreadPct: callSpreadPct,
        putBidAskSpreadPct: putSpreadPct
      },
      impliedVolatility: {
        call: callData.impliedVolatility ? Number((callData.impliedVolatility * 100).toFixed(1)) : null,
        put: putData.impliedVolatility ? Number((putData.impliedVolatility * 100).toFixed(1)) : null
      }
    };
  } catch (error) {
    console.error(`Straddle analysis failed for ${ticker}:`, error.message);
    return null;
  }
}
