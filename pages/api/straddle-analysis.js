export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { ticker, strikePrice, totalPremium, daysToExpiration } = req.body;

  if (!ticker || !totalPremium) {
    return res.status(400).json({ error: 'Missing required parameters: ticker and totalPremium are required' });
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

    // Fetch historical data for analysis
    const historicalData = await fetchHistoricalData(ticker, daysToExpiration || 30);
    
    // Analyze historical profitability
    const analysis = analyzeHistoricalProfitability(
      historicalData, 
      upperBreakevenPct, 
      lowerBreakevenPct
    );

    res.status(200).json(analysis);
  } catch (error) {
    console.error('Error in straddle analysis:', error);
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
      // API limit reached, throw error
      throw new Error('API limit reached. Please try again later.');
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
      throw new Error('No valid price movements could be calculated from historical data');
    }

    // Use all available movements, even if less than 250
    console.log(`Found ${movements.length} price movements for ${ticker} analysis`);
    return movements;
  } catch (error) {
    console.error(`Error fetching historical data for ${ticker}:`, error.message);
    throw error; // Re-throw the error instead of using mock data
  }
}

// Calculate price movements over specified period
function calculatePriceMovements(historicalPrices, daysToExpiration) {
  const movements = [];
  
  // Ensure we have enough data points
  if (historicalPrices.length < daysToExpiration + 1) {
    return movements;
  }
  
  // Limit to maximum 100 instances for better performance
  const maxInstances = 100;
  const availableInstances = historicalPrices.length - daysToExpiration;
  const instancesToUse = Math.min(availableInstances, maxInstances);
  
  // Start from the most recent data if we have more than 100 instances
  const startIndex = availableInstances > maxInstances ? availableInstances - maxInstances : 0;
  
  for (let i = startIndex; i < startIndex + instancesToUse; i++) {
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
