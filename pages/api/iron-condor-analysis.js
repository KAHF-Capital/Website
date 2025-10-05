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
    
    const upperBreakevenPct = (upperBreakeven - effectivePrice) / effectivePrice;
    const lowerBreakevenPct = (lowerBreakeven - effectivePrice) / effectivePrice;

    // Debug logging
    console.log(`Iron Condor Analysis for ${ticker}:`, {
      strikes: { 
        shortCallStrike: parsedShortCallStrike, 
        shortPutStrike: parsedShortPutStrike, 
        longCallStrike: parsedLongCallStrike, 
        longPutStrike: parsedLongPutStrike 
      },
      netCredit,
      breakevens: { upperBreakeven, lowerBreakeven },
      breakevenPcts: { upperBreakevenPct, lowerBreakevenPct },
      effectivePrice,
      daysToExpiration: daysToExpiration || 30
    });

    // Fetch historical data for analysis
    console.log(`Fetching historical data for ${ticker} with ${daysToExpiration || 30} days to expiration`);
    const historicalData = await fetchHistoricalData(ticker, daysToExpiration || 30);
    console.log(`Retrieved ${historicalData ? historicalData.length : 0} historical data points`);
    
    // Analyze historical profitability for Iron Condor
    console.log(`Analyzing Iron Condor profitability with breakevens: ${upperBreakevenPct.toFixed(4)}, ${lowerBreakevenPct.toFixed(4)}`);
    const analysis = analyzeIronCondorProfitability(
      historicalData, 
      upperBreakevenPct, 
      lowerBreakevenPct,
      parsedShortCallStrike,
      parsedShortPutStrike,
      netCredit
    );
    console.log(`Analysis completed:`, analysis);

    res.status(200).json(analysis);
  } catch (error) {
    console.error('Error in Iron Condor analysis:', error);
    res.status(500).json({ 
      error: 'Failed to perform analysis',
      details: process.env.NODE_ENV === 'development' ? error.message : 'Please try again later',
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}

// Fetch historical price data
async function fetchHistoricalData(ticker, daysToExpiration) {
  try {
    console.log(`Starting historical data fetch for ${ticker}`);
    
    // Using Alpha Vantage API for historical data
    const apiKey = process.env.ALPHA_VANTAGE_API_KEY || 'demo';
    const url = `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol=${ticker}&apikey=${apiKey}`;
    
    console.log(`Fetching from Alpha Vantage API: ${url.replace(apiKey, '***')}`);
    const response = await fetch(url);
    
    if (!response.ok) {
      console.error(`Alpha Vantage API response not ok: ${response.status} ${response.statusText}`);
      throw new Error(`API request failed: ${response.status}`);
    }
    
    const data = await response.json();
    console.log(`Alpha Vantage API response received for ${ticker}`);

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

    // Use all available movements, even if less than traditional minimums
    console.log(`Found ${movements.length} price movements for ${ticker} Iron Condor analysis`);
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

