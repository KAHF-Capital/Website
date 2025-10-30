import { getHistoricalStockData, calculatePriceMovements } from '../../lib/polygon-data-service.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { 
    ticker, 
    shortCallStrike, 
    shortPutStrike, 
    longCallStrike, 
    longPutStrike,
    totalCredit,
    totalDebit,
    currentPrice,
    daysToExpiration 
  } = req.body;

  // Parse and validate strike prices
  const parsedShortCallStrike = parseFloat(shortCallStrike);
  const parsedShortPutStrike = parseFloat(shortPutStrike);
  const parsedLongCallStrike = parseFloat(longCallStrike);
  const parsedLongPutStrike = parseFloat(longPutStrike);

  if (!ticker || isNaN(parsedShortCallStrike) || isNaN(parsedShortPutStrike) || 
      isNaN(parsedLongCallStrike) || isNaN(parsedLongPutStrike)) {
    return res.status(400).json({ 
      error: 'Missing required parameters: ticker and all strike prices are required',
      details: {
        ticker: !!ticker,
        shortCallStrike: parsedShortCallStrike,
        shortPutStrike: parsedShortPutStrike,
        longCallStrike: parsedLongCallStrike,
        longPutStrike: parsedLongPutStrike
      }
    });
  }

  if (!process.env.POLYGON_API_KEY) {
    return res.status(500).json({ error: 'Polygon API key not configured' });
  }

  // Validate Iron Condor setup
  // Correct Iron Condor structure: Long Put < Short Put ≤ Short Call < Long Call
  if (parsedLongPutStrike >= parsedShortPutStrike || 
      parsedShortPutStrike > parsedShortCallStrike || 
      parsedShortCallStrike >= parsedLongCallStrike) {
    return res.status(400).json({ 
      error: 'Invalid Iron Condor setup. Strikes must follow: Long Put < Short Put ≤ Short Call < Long Call',
      details: {
        longPutStrike: parsedLongPutStrike,
        shortPutStrike: parsedShortPutStrike,
        shortCallStrike: parsedShortCallStrike,
        longCallStrike: parsedLongCallStrike,
        validation: {
          longPutLessThanShortPut: parsedLongPutStrike < parsedShortPutStrike,
          shortPutLessOrEqualShortCall: parsedShortPutStrike <= parsedShortCallStrike,
          shortCallLessThanLongCall: parsedShortCallStrike < parsedLongCallStrike
        }
      }
    });
  }

  const effectivePrice = currentPrice || parsedShortCallStrike;

  try {
    const netCredit = (totalCredit || 0) - (totalDebit || 0);
    
    // Calculate breakeven points
    const upperBreakeven = parsedShortCallStrike + netCredit;
    const lowerBreakeven = parsedShortPutStrike - netCredit;
    
    // Validate effective price to prevent division by zero
    if (!effectivePrice || effectivePrice <= 0) {
      throw new Error(`Invalid effective price: ${effectivePrice}. Please provide a valid current price.`);
    }
    
    const upperBreakevenPct = (upperBreakeven - effectivePrice) / effectivePrice;
    const lowerBreakevenPct = (lowerBreakeven - effectivePrice) / effectivePrice;
    
    // Validate breakeven calculations
    if (!isFinite(upperBreakevenPct) || !isFinite(lowerBreakevenPct)) {
      throw new Error(`Invalid breakeven calculations. Upper: ${upperBreakevenPct}, Lower: ${lowerBreakevenPct}`);
    }

    // Fetch historical data from Polygon
    const endDate = new Date().toISOString().split('T')[0];
    const startDate = new Date(Date.now() - (daysToExpiration + 30) * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    
    const historicalData = await getHistoricalStockData(ticker, startDate, endDate);
    
    // Calculate price movements for analysis
    const movements = calculatePriceMovements(historicalData, daysToExpiration || 30);
    
    // Analyze historical profitability for Iron Condor
    const analysis = analyzeIronCondorProfitability(
      movements, 
      upperBreakevenPct, 
      lowerBreakevenPct,
      parsedShortCallStrike,
      parsedShortPutStrike,
      netCredit
    );

    res.status(200).json(analysis);
  } catch (error) {
    console.error('Error in Iron Condor analysis:', error);
    
    res.status(500).json({ 
      error: 'Failed to perform analysis',
      details: process.env.NODE_ENV === 'development' ? error.message : 'Please try again later',
      errorType: error.name,
      ticker: ticker
    });
  }
}



// Analyze profitability specifically for Iron Condor strategy
function analyzeIronCondorProfitability(historicalData, upperBreakevenPct, lowerBreakevenPct, shortCallStrike, shortPutStrike, netCredit) {
  try {
    console.log(`Starting Iron Condor profitability analysis with ${historicalData ? historicalData.length : 0} data points`);
    console.log(`Breakeven percentages: upper=${upperBreakevenPct}, lower=${lowerBreakevenPct}`);
    
    let inProfitZoneCount = 0;
    let aboveUpperBreakevenCount = 0;
    let belowLowerBreakevenCount = 0;
    let totalValidSamples = 0;
    
    // Ensure we have data to work with
    if (!historicalData || historicalData.length === 0) {
      console.log('No historical data available for analysis');
      return {
        inProfitZone: 0,
        aboveUpperBreakeven: 0,
        belowLowerBreakeven: 0,
        totalSamples: 0,
        profitableRate: 0,
        maxProfitProbability: 0,
        maxLossProbability: 0,
        upperBreakevenPct: (upperBreakevenPct || 0) * 100,
        lowerBreakevenPct: (lowerBreakevenPct || 0) * 100,
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
    
    // Iron Condor is profitable when price stays between breakeven points
    if (percentMove < upperBreakevenPct && percentMove > lowerBreakevenPct) {
      inProfitZoneCount++;
    }
    
    // Track losses outside profit zone
    if (percentMove >= upperBreakevenPct) {
      aboveUpperBreakevenCount++;
    }
    if (percentMove <= lowerBreakevenPct) {
      belowLowerBreakevenCount++;
    }
    
    totalValidSamples++;
  });
  
  const profitableRate = totalValidSamples > 0 ? (inProfitZoneCount / totalValidSamples) * 100 : 0;
  const maxProfitProbability = profitableRate; // Max profit occurs when price stays in profit zone
  const maxLossProbability = totalValidSamples > 0 ? ((aboveUpperBreakevenCount + belowLowerBreakevenCount) / totalValidSamples) * 100 : 0;
  
  // Calculate additional metrics safely
  const avgMove = filteredData.length > 0 ? 
    filteredData.reduce((sum, m) => sum + Math.abs(m.percentMove), 0) / filteredData.length : 0;
  const maxMove = filteredData.length > 0 ? 
    Math.max(...filteredData.map(m => Math.abs(m.percentMove))) : 0;
  const minMove = filteredData.length > 0 ? 
    Math.min(...filteredData.map(m => Math.abs(m.percentMove))) : 0;
  
    console.log(`Analysis completed: ${inProfitZoneCount}/${totalValidSamples} profitable (${profitableRate.toFixed(1)}%)`);
    
    return {
      inProfitZone: inProfitZoneCount,
      aboveUpperBreakeven: aboveUpperBreakevenCount,
      belowLowerBreakeven: belowLowerBreakevenCount,
      totalSamples: totalValidSamples,
      profitableRate,
      maxProfitProbability,
      maxLossProbability,
      upperBreakevenPct: (upperBreakevenPct || 0) * 100,
      lowerBreakevenPct: (lowerBreakevenPct || 0) * 100,
      avgMove: avgMove * 100,
      maxMove: maxMove * 100,
      minMove: minMove * 100,
      dataQuality: totalValidSamples >= 50 ? 'high' : totalValidSamples >= 20 ? 'medium' : totalValidSamples >= 5 ? 'low' : 'limited'
    };
    
  } catch (error) {
    console.error('Error in analyzeIronCondorProfitability:', error);
    return {
      inProfitZone: 0,
      aboveUpperBreakeven: 0,
      belowLowerBreakeven: 0,
      totalSamples: 0,
      profitableRate: 0,
      maxProfitProbability: 0,
      maxLossProbability: 0,
      upperBreakevenPct: (upperBreakevenPct || 0) * 100,
      lowerBreakevenPct: (lowerBreakevenPct || 0) * 100,
      avgMove: 0,
      maxMove: 0,
      minMove: 0,
      dataQuality: 'error',
      error: error.message
    };
  }
}

