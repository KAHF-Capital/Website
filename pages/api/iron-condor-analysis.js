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

  if (!ticker || !shortCallStrike || !shortPutStrike || !longCallStrike || !longPutStrike) {
    return res.status(400).json({ 
      error: 'Missing required parameters: ticker and all strike prices are required' 
    });
  }

  // Validate Iron Condor setup
  if (longPutStrike >= shortPutStrike || shortPutStrike >= shortCallStrike || 
      shortCallStrike >= longCallStrike) {
    return res.status(400).json({ 
      error: 'Invalid Iron Condor setup. Strikes must follow: Long Put < Short Put < Short Call < Long Call' 
    });
  }

  const effectivePrice = currentPrice || shortCallStrike;

  try {
    const netCredit = (totalCredit || 0) - (totalDebit || 0);
    
    // Calculate breakeven points
    const upperBreakeven = parseFloat(shortCallStrike) + netCredit;
    const lowerBreakeven = parseFloat(shortPutStrike) - netCredit;
    
    const upperBreakevenPct = (upperBreakeven - effectivePrice) / effectivePrice;
    const lowerBreakevenPct = (lowerBreakeven - effectivePrice) / effectivePrice;

    // Fetch historical data for analysis
    const historicalData = await fetchHistoricalData(ticker, daysToExpiration || 30);
    
    // Analyze historical profitability for Iron Condor
    const analysis = analyzeIronCondorProfitability(
      historicalData, 
      upperBreakevenPct, 
      lowerBreakevenPct,
      parseFloat(shortCallStrike),
      parseFloat(shortPutStrike),
      netCredit
    );

    res.status(200).json(analysis);
  } catch (error) {
    console.error('Error in Iron Condor analysis:', error);
    res.status(500).json({ error: 'Failed to perform analysis' });
  }
}

// Fetch historical price data
async function fetchHistoricalData(ticker, daysToExpiration) {
  try {
    // Using Alpha Vantage API for historical data
    const apiKey = process.env.ALPHA_VANTAGE_API_KEY || 'demo';
    const url = `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol=${ticker}&apikey=${apiKey}`;
    
    const response = await fetch(url);
    const data = await response.json();

    if (data['Error Message']) {
      console.log(`Alpha Vantage error for ${ticker}:`, data['Error Message']);
      throw new Error('Invalid ticker symbol');
    }

    if (data['Note']) {
      // API limit reached, return mock historical data
      console.log(`Alpha Vantage API limit reached for ${ticker}, using mock data`);
      return generateMockHistoricalData(daysToExpiration);
    }

    const timeSeries = data['Time Series (Daily)'];
    if (!timeSeries) {
      console.log(`No time series data for ${ticker}`);
      throw new Error('No historical data available');
    }

    // Convert to array and sort by date
    const historicalPrices = Object.entries(timeSeries)
      .map(([date, values]) => ({
        date,
        price: parseFloat(values['4. close'])
      }))
      .filter(item => !isNaN(item.price) && item.price > 0) // Filter out invalid prices
      .sort((a, b) => new Date(a.date) - new Date(b.date));

    if (historicalPrices.length === 0) {
      console.log(`No valid price data for ${ticker}`);
      throw new Error('No valid historical price data');
    }

    // Calculate price movements for the specified period
    const movements = calculatePriceMovements(historicalPrices, daysToExpiration);
    
    if (movements.length === 0) {
      console.log(`No price movements calculated for ${ticker}, using mock data`);
      return generateMockHistoricalData(daysToExpiration);
    }

    // Use all available movements, even if less than traditional minimums
    console.log(`Found ${movements.length} price movements for ${ticker} Iron Condor analysis`);
    return movements;
  } catch (error) {
    console.error(`Error fetching historical data for ${ticker}:`, error.message);
    // Return mock data as fallback
    return generateMockHistoricalData(daysToExpiration);
  }
}

// Calculate price movements over specified period
function calculatePriceMovements(historicalPrices, daysToExpiration) {
  const movements = [];
  
  // Ensure we have enough data points
  if (historicalPrices.length < daysToExpiration + 1) {
    return movements;
  }
  
  for (let i = 0; i < historicalPrices.length - daysToExpiration; i++) {
    const startPrice = historicalPrices[i].price;
    const endPrice = historicalPrices[i + daysToExpiration].price;
    
    // Only include valid price data
    if (startPrice > 0 && endPrice > 0) {
      const percentMove = (endPrice - startPrice) / startPrice;
      
      movements.push({
        startDate: historicalPrices[i].date,
        endDate: historicalPrices[i + daysToExpiration].date,
        startPrice,
        endPrice,
        percentMove
      });
    }
  }
  
  return movements;
}

// Generate mock historical data for demo purposes
function generateMockHistoricalData(daysToExpiration) {
  const movements = [];
  const basePrice = 100;
  const volatility = 0.02; // 2% daily volatility
  // Use all available data points, no arbitrary limits
  const samples = Math.max(10, Math.min(500 - daysToExpiration, 1000));
  
  for (let i = 0; i < samples; i++) {
    let cumulativeMove = 0;
    let currentPrice = basePrice;
    
    for (let day = 0; day < daysToExpiration; day++) {
      const randomMove = (Math.random() - 0.5) * volatility * 2;
      const meanReversion = (basePrice - currentPrice) * 0.0005;
      const dailyMove = randomMove + meanReversion;
      
      cumulativeMove += dailyMove;
      currentPrice = currentPrice * (1 + dailyMove);
    }
    
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - (samples - i) * 2);
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + daysToExpiration);
    
    movements.push({
      startDate: startDate.toISOString().split('T')[0],
      endDate: endDate.toISOString().split('T')[0],
      startPrice: basePrice,
      endPrice: basePrice * (1 + cumulativeMove),
      percentMove: cumulativeMove
    });
  }
  
  return movements;
}

// Analyze profitability specifically for Iron Condor strategy
function analyzeIronCondorProfitability(historicalData, upperBreakevenPct, lowerBreakevenPct, shortCallStrike, shortPutStrike, netCredit) {
  let inProfitZoneCount = 0;
  let aboveUpperBreakevenCount = 0;
  let belowLowerBreakevenCount = 0;
  let totalValidSamples = 0;
  
  // Ensure we have data to work with
  if (!historicalData || historicalData.length === 0) {
    return {
      inProfitZone: 0,
      aboveUpperBreakeven: 0,
      belowLowerBreakeven: 0,
      totalSamples: 0,
      profitableRate: 0,
      maxLossCount: 0,
      maxProfitCount: 0,
      upperBreakevenPct: upperBreakevenPct * 100,
      lowerBreakevenPct: lowerBreakevenPct * 100,
      avgReturn: 0,
      maxReturn: 0,
      minReturn: 0,
      dataQuality: 'none'
    };
  }
  
  // Filter out extreme outliers
  let filteredData = historicalData.filter(movement => {
    const absMove = Math.abs(movement.percentMove);
    return absMove <= 1.0; // Filter out moves > 100%
  });
  
  if (filteredData.length === 0) {
    filteredData = historicalData;
  }
  
  filteredData.forEach(movement => {
    const percentMove = movement.percentMove;
    const priceLevel = 1 + percentMove; // Current price as percentage change
    
    // Iron Condor is profitable when price stays between breakeven points
    if (priceLevel < upperBreakevenPct && priceLevel > lowerBreakevenPct) {
      inProfitZoneCount++;
    }
    
    // Track losses outside profit zone
    if (priceLevel >= upperBreakevenPct || priceLevel <= lowerBreakevenPct) {
      if (priceLevel >= upperBreakevenPct) {
        aboveUpperBreakevenCount++;
      } else {
        belowLowerBreakevenCount++;
      }
    }
    
    totalValidSamples++;
  });
  
  // Calculate Iron Condor-specific metrics
  const profitableRate = totalValidSamples > 0 ? (inProfitZoneCount / totalValidSamples) * 100 : 0;
  const maxLossRate = totalValidSamples > 0 ? ((aboveUpperBreakevenCount + belowUpperBreakevenCount) / totalValidSamples) * 100 : 0;
  
  // Calculate additional statistics
  const avgReturn = filteredData.length > 0 ? 
    filteredData.reduce((sum, m) => sum + Math.abs(m.percentMove), 0) / filteredData.length : 0;
  const maxReturn = filteredData.length > 0 ? 
    Math.max(...filteredData.map(m => Math.abs(m.percentMove))) : 0;
  const minReturn = filteredData.length > 0 ? 
    Math.min(...filteredData.map(m => Math.abs(m.percentMove))) : 0;
  
  return {
    inProfitZone: inProfitZoneCount,
    aboveUpperBreakeven: aboveUpperBreakevenCount,
    belowLowerBreakeven: belowLowerBreakevenCount,
    totalSamples: totalValidSamples,
    profitableRate,
    maxLossRate,
    upperBreakevenPct: upperBreakevenPct * 100,
    lowerBreakevenPct: lowerBreakevenPct * 100,
    avgReturn: avgReturn * 100,
    maxReturn: maxReturn * 100,
    minReturn: minReturn * 100,
    dataQuality: totalValidSamples >= 50 ? 'high' : totalValidSamples >= 20 ? 'medium' : totalValidSamples >= 5 ? 'low' : 'limited',
    spreadAnalysis: {
      callSpreadRange: `$${shortPutStrike} - $${shortCallStrike}`, 
      putSpreadRange: `${shortPutStrike} - ${longCallStrike}`
    },
    strategyInsight: profitableRate > 70 ? 'Conservative strategy with good profit probability' :
                    profitableRate > 50 ? 'Moderate risk strategy' :
                    profitableRate > 30 ? 'Higher risk strategy' :
                    'High risk strategy - consider adjusting strikes'
  };
}

