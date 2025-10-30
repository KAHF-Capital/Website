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

    // Fetch historical data from Polygon
    const endDate = new Date().toISOString().split('T')[0];
    const startDate = new Date(Date.now() - (daysToExpiration + 30) * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    
    const historicalData = await getHistoricalStockData(ticker, startDate, endDate);
    
    // Calculate price movements for analysis
    const movements = calculatePriceMovements(historicalData, daysToExpiration || 30);
    
    // Analyze historical profitability
    const analysis = analyzeHistoricalProfitability(
      movements, 
      upperBreakevenPct, 
      lowerBreakevenPct
    );

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
    dataQuality: totalValidSamples >= 50 ? 'high' : totalValidSamples >= 20 ? 'medium' : totalValidSamples >= 5 ? 'low' : 'limited'
  };
}
