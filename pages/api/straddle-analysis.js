import { getHistoricalStockData, calculatePriceMovements } from '../../lib/polygon-data-service.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { ticker, strikePrice, totalPremium, daysToExpiration } = req.body;

  if (!ticker || !totalPremium) {
    return res.status(400).json({ error: 'Missing required parameters: ticker and totalPremium are required' });
  }

  if (!process.env.POLYGON_API_KEY) {
    return res.status(500).json({ error: 'Polygon API key not configured' });
  }

  // Use a default strike price if not provided (for manual input cases)
  const effectiveStrikePrice = strikePrice || 100;

  try {
    // Calculate breakeven points
    const upperBreakeven = effectiveStrikePrice + totalPremium;
    const lowerBreakeven = effectiveStrikePrice - totalPremium;
    
    // Calculate percentage moves needed
    const upperBreakevenPct = (upperBreakeven - effectiveStrikePrice) / effectiveStrikePrice;
    const lowerBreakevenPct = (lowerBreakeven - effectiveStrikePrice) / effectiveStrikePrice;

    const dte = daysToExpiration || 30;
    const MIN_PERIODS = 25;

    // Need at least MIN_PERIODS * DTE trading days of history.
    // 1 calendar year ≈ 252 trading days. Fetch up to 5 years to guarantee
    // 25+ non-overlapping intervals even for long-dated expirations.
    const endDate = new Date().toISOString().split('T')[0];
    const calendarDaysNeeded = Math.max(750, Math.ceil((MIN_PERIODS * dte) / 0.7) + 60);
    const startDate = new Date(Date.now() - calendarDaysNeeded * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const historicalData = await getHistoricalStockData(ticker, startDate, endDate);

    // Use non-overlapping intervals; fall back to overlapping if we can't reach MIN_PERIODS
    let movements = calculatePriceMovements(historicalData, dte);

    if (movements.length < MIN_PERIODS) {
      movements = calculateOverlappingMovements(historicalData, dte);
    }
    
    const analysis = analyzeHistoricalProfitability(
      movements, 
      upperBreakevenPct, 
      lowerBreakevenPct
    );

    analysis.periodsRequested = MIN_PERIODS;
    analysis.periodsFound = movements.length;
    analysis.historyYears = historicalData.length > 0
      ? ((new Date(historicalData[historicalData.length - 1].date) - new Date(historicalData[0].date)) / (365.25 * 24 * 60 * 60 * 1000)).toFixed(1)
      : 0;

    res.status(200).json(analysis);
  } catch (error) {
    console.error('Error in straddle analysis:', error);
    res.status(500).json({ error: 'Failed to perform analysis' });
  }
}



// Analyze historical profitability
function analyzeHistoricalProfitability(historicalData, upperBreakevenPct, lowerBreakevenPct) {
  let aboveUpperCount = 0;
  let belowLowerCount = 0;
  let totalValidSamples = 0;
  
  // Ensure we have data to work with
  if (!historicalData || historicalData.length === 0) {
    return {
      aboveUpper: 0,
      belowLower: 0,
      totalProfitable: 0,
      totalSamples: 0,
      profitableRate: 0,
      maxProfitProbability: 0,
      maxLossProbability: 0,
      aboveUpperPct: 0,
      belowLowerPct: 0,
      upperBreakevenPct: upperBreakevenPct * 100,
      lowerBreakevenPct: lowerBreakevenPct * 100,
      avgMove: 0,
      maxMove: 0,
      minMove: 0,
      dataQuality: 'none'
    };
  }
  
  // Filter out extreme outliers (more than 50% moves in either direction)
  let filteredData = historicalData.filter(movement => {
    const absMove = Math.abs(movement.percentMove);
    return absMove <= 0.5; // Filter out moves > 50%
  });
  
  if (filteredData.length === 0) {
    // If all data is filtered out, use original data
    filteredData = historicalData;
  }
  
  filteredData.forEach(movement => {
    const percentMove = movement.percentMove;
    
    if (percentMove > upperBreakevenPct) {
      aboveUpperCount++;
    }
    if (percentMove < lowerBreakevenPct) {
      belowLowerCount++;
    }
    totalValidSamples++;
  });
  
  const totalProfitable = aboveUpperCount + belowLowerCount;
  const profitableRate = totalValidSamples > 0 ? (totalProfitable / totalValidSamples) * 100 : 0;
  const maxProfitProbability = profitableRate; // Max profit occurs when price moves beyond breakeven points
  const maxLossProbability = totalValidSamples > 0 ? ((totalValidSamples - totalProfitable) / totalValidSamples) * 100 : 0;
  
  // Calculate additional metrics safely
  const avgMove = filteredData.length > 0 ? 
    filteredData.reduce((sum, m) => sum + Math.abs(m.percentMove), 0) / filteredData.length : 0;
  const maxMove = filteredData.length > 0 ? 
    Math.max(...filteredData.map(m => Math.abs(m.percentMove))) : 0;
  const minMove = filteredData.length > 0 ? 
    Math.min(...filteredData.map(m => Math.abs(m.percentMove))) : 0;
  
  return {
    aboveUpper: aboveUpperCount,
    belowLower: belowLowerCount,
    totalProfitable,
    totalSamples: totalValidSamples,
    profitableRate,
    maxProfitProbability,
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

// Overlapping (rolling-window) movements — used as fallback when non-overlapping
// can't produce enough periods (e.g. recently listed stocks or long DTEs).
function calculateOverlappingMovements(historicalData, daysToExpiration) {
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
