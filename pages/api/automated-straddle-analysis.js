import fetch from 'node-fetch';

// Configuration for automation
const AUTOMATION_CONFIG = {
  profitableThreshold: 50, // 50% profitability threshold for alerts
  maxConcurrentAnalysis: 3, // Maximum concurrent API calls
  defaultDaysToExpiration: 30, // Default days to expiration for analysis
  minDataQuality: 'medium', // Minimum data quality required
  analyzeAllExpirations: true, // Analyze all available expiration dates
  maxExpirationsPerTicker: 10 // Maximum expirations to analyze per ticker
};

// Fetch historical data for analysis
async function fetchHistoricalData(ticker, daysToExpiration = 30) {
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
  const volatility = 0.02; // 2% daily volatility (more realistic for options analysis)
  const samples = Math.min(250, Math.max(100, 500 - daysToExpiration)); // More samples for better analysis
  
  for (let i = 0; i < samples; i++) {
    // Simulate more realistic price movements with mean reversion
    let cumulativeMove = 0;
    let currentPrice = basePrice;
    
    for (let day = 0; day < daysToExpiration; day++) {
      // Random walk with slight mean reversion and volatility clustering
      const randomMove = (Math.random() - 0.5) * volatility * 2;
      const meanReversion = (basePrice - currentPrice) * 0.0005; // Slight pull toward base price
      const dailyMove = randomMove + meanReversion;
      
      cumulativeMove += dailyMove;
      currentPrice = currentPrice * (1 + dailyMove);
    }
    
    // Generate realistic dates
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - (samples - i) * 2); // Spread out over time
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
    aboveUpperPct: totalValidSamples > 0 ? (aboveUpperCount / totalValidSamples) * 100 : 0,
    belowLowerPct: totalValidSamples > 0 ? (belowLowerCount / totalValidSamples) * 100 : 0,
    upperBreakevenPct: upperBreakevenPct * 100,
    lowerBreakevenPct: lowerBreakevenPct * 100,
    avgMove: avgMove * 100,
    maxMove: maxMove * 100,
    minMove: minMove * 100,
    dataQuality: totalValidSamples >= 100 ? 'high' : totalValidSamples >= 50 ? 'medium' : 'low'
  };
}

// Get straddle data from Yahoo Finance
async function getStraddleDataFromYahoo(ticker, currentPrice, daysToExpiration = 30) {
  try {
    const response = await fetch(`${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/api/yahoo-finance-options?ticker=${ticker}`);
    
    if (!response.ok) {
      throw new Error(`Yahoo Finance API error: ${response.status}`);
    }
    
    const data = await response.json();
    
    return {
      ticker,
      currentPrice: data.currentPrice || currentPrice,
      strikePrice: data.strikePrice || currentPrice,
      totalPremium: data.totalPremium,
      source: data.source || 'yahoo_finance',
      dataQuality: data.dataQuality || 'medium',
      expirationDate: data.expirationDate,
      executionDate: data.executionDate
    };
  } catch (error) {
    console.error(`Error fetching Yahoo Finance data for ${ticker}:`, error.message);
    // Fallback to estimation
    return {
      ticker,
      currentPrice,
      strikePrice: currentPrice,
      totalPremium: estimateStraddlePremium(currentPrice, daysToExpiration),
      source: 'estimation',
      dataQuality: 'low',
      note: 'Yahoo Finance data unavailable, using estimation'
    };
  }
}

// Estimate straddle premium using Black-Scholes approximation (fallback)
function estimateStraddlePremium(currentPrice, daysToExpiration) {
  // Simple approximation: premium is typically 2-5% of stock price for 30-day options
  const basePremiumRate = 0.03; // 3% base rate
  const timeDecayFactor = Math.sqrt(daysToExpiration / 30); // Square root time decay
  const volatilityFactor = 1.2; // Assume higher volatility for high dark pool activity stocks
  
  return currentPrice * basePremiumRate * timeDecayFactor * volatilityFactor;
}

// Get all available expiration dates for a ticker
async function getAllExpirationDates(ticker) {
  try {
    const response = await fetch(`${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/api/available-expirations-yahoo?ticker=${ticker}`);
    
    if (!response.ok) {
      throw new Error(`Failed to get expiration dates: ${response.status}`);
    }
    
    const data = await response.json();
    return data.expirations || [];
  } catch (error) {
    console.error(`Error getting expiration dates for ${ticker}:`, error.message);
    return [];
  }
}

// Analyze a single ticker for straddle profitability across ALL expiration dates
async function analyzeTickerStraddle(ticker, currentPrice) {
  try {
    console.log(`Analyzing ${ticker} across all available expiration dates...`);
    
    // Get all available expiration dates
    const availableExpirations = await getAllExpirationDates(ticker);
    
    if (availableExpirations.length === 0) {
      console.log(`No expiration dates available for ${ticker}`);
      return {
        ticker,
        currentPrice,
        error: 'No expiration dates available',
        isProfitable: false
      };
    }
    
    // Limit to max expirations to avoid too many API calls
    const expirationsToAnalyze = availableExpirations.slice(0, AUTOMATION_CONFIG.maxExpirationsPerTicker);
    console.log(`Analyzing ${expirationsToAnalyze.length} expiration dates for ${ticker}`);
    
    const results = [];
    
    // Analyze each expiration date
    for (const expiration of expirationsToAnalyze) {
      try {
        const daysToExpiration = expiration.daysFromNow;
        
        // Get straddle data for this specific expiration
        const straddleData = await getStraddleDataFromYahoo(ticker, currentPrice, daysToExpiration, expiration.date);
        
        if (straddleData.source === 'expiration_not_available') {
          console.log(`Skipping ${expiration.date} for ${ticker} - not available`);
          continue;
        }
        
        const strikePrice = straddleData.strikePrice;
        const totalPremium = straddleData.totalPremium;
        
        // Calculate breakeven points
        const upperBreakeven = strikePrice + totalPremium;
        const lowerBreakeven = strikePrice - totalPremium;
        
        // Calculate percentage moves needed
        const upperBreakevenPct = (upperBreakeven - strikePrice) / strikePrice;
        const lowerBreakevenPct = (lowerBreakeven - strikePrice) / strikePrice;

        // Fetch historical data for analysis
        const historicalData = await fetchHistoricalData(ticker, daysToExpiration);
        
        // Analyze historical profitability
        const analysis = analyzeHistoricalProfitability(
          historicalData, 
          upperBreakevenPct, 
          lowerBreakevenPct
        );

        const result = {
          ticker,
          currentPrice: straddleData.currentPrice,
          strikePrice,
          totalPremium,
          upperBreakeven,
          lowerBreakeven,
          upperBreakevenPct: upperBreakevenPct * 100,
          lowerBreakevenPct: lowerBreakevenPct * 100,
          daysToExpiration,
          analysis,
          isProfitable: analysis.profitableRate >= AUTOMATION_CONFIG.profitableThreshold,
          dataQuality: analysis.dataQuality,
          source: straddleData.source,
          expirationDate: expiration.date,
          displayDate: expiration.displayDate,
          executionDate: straddleData.executionDate,
          note: straddleData.note
        };
        
        results.push(result);
        
        // Small delay between expiration analyses to be respectful to APIs
        await new Promise(resolve => setTimeout(resolve, 500));
        
      } catch (error) {
        console.error(`Error analyzing ${ticker} for expiration ${expiration.date}:`, error.message);
        // Continue with other expirations
      }
    }
    
    if (results.length === 0) {
      return {
        ticker,
        currentPrice,
        error: 'No valid expiration dates could be analyzed',
        isProfitable: false
      };
    }
    
    // Find the most profitable expiration
    const mostProfitable = results.reduce((best, current) => {
      return current.analysis.profitableRate > best.analysis.profitableRate ? current : best;
    });
    
    console.log(`Best expiration for ${ticker}: ${mostProfitable.expirationDate} (${mostProfitable.analysis.profitableRate.toFixed(1)}% profitable)`);
    
    return {
      ...mostProfitable,
      allExpirations: results,
      totalExpirationsAnalyzed: results.length
    };
    
  } catch (error) {
    console.error(`Error analyzing ticker ${ticker}:`, error);
    return {
      ticker,
      currentPrice,
      error: error.message,
      isProfitable: false
    };
  }
}

// Process multiple tickers with concurrency control
async function processTickersConcurrently(tickers, maxConcurrent = AUTOMATION_CONFIG.maxConcurrentAnalysis) {
  const results = [];
  
  for (let i = 0; i < tickers.length; i += maxConcurrent) {
    const batch = tickers.slice(i, i + maxConcurrent);
    const batchPromises = batch.map(ticker => 
      analyzeTickerStraddle(ticker.ticker, ticker.avg_price, AUTOMATION_CONFIG.defaultDaysToExpiration)
    );
    
    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults);
    
    // Add delay between batches to be respectful to Yahoo Finance
    // Yahoo Finance is more lenient than Polygon.io, but we still want to be respectful
    if (i + maxConcurrent < tickers.length) {
      await new Promise(resolve => setTimeout(resolve, 2000)); // 2 second delay
    }
  }
  
  return results;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { tickers } = req.body;

    if (!tickers || !Array.isArray(tickers) || tickers.length === 0) {
      return res.status(400).json({ 
        error: 'Missing or invalid tickers array',
        message: 'Please provide an array of ticker objects with ticker and avg_price properties'
      });
    }

    console.log(`Starting automated straddle analysis for ${tickers.length} tickers`);

    // Process all tickers concurrently
    const results = await processTickersConcurrently(tickers);

    // Filter for profitable straddles
    const profitableStraddles = results.filter(result => 
      result.isProfitable && 
      result.analysis && 
      result.analysis.dataQuality !== 'none'
    );

    // Sort by profitability rate
    profitableStraddles.sort((a, b) => b.analysis.profitableRate - a.analysis.profitableRate);

    const response = {
      timestamp: new Date().toISOString(),
      config: AUTOMATION_CONFIG,
      total_tickers_analyzed: results.length,
      profitable_straddles: profitableStraddles.length,
      results: results,
      profitable_straddles_list: profitableStraddles.map(result => ({
        ticker: result.ticker,
        currentPrice: result.currentPrice,
        estimatedPremium: result.estimatedPremium,
        profitableRate: result.analysis.profitableRate,
        upperBreakeven: result.upperBreakeven,
        lowerBreakeven: result.lowerBreakeven,
        dataQuality: result.analysis.dataQuality,
        totalSamples: result.analysis.totalSamples
      }))
    };

    console.log(`Analysis complete: ${profitableStraddles.length} profitable straddles found out of ${results.length} analyzed`);

    return res.status(200).json(response);

  } catch (error) {
    console.error('Error in automated-straddle-analysis:', error);
    return res.status(500).json({ 
      error: 'Failed to perform automated straddle analysis',
      details: process.env.NODE_ENV === 'development' ? error.message : 'Please try again later'
    });
  }
}

// Configuration for automation
const AUTOMATION_CONFIG = {
  profitableThreshold: 55, // 55% profitability threshold for alerts
  maxConcurrentAnalysis: 5, // Maximum concurrent API calls
  defaultDaysToExpiration: 30, // Default days to expiration for analysis
  minDataQuality: 'medium' // Minimum data quality required
};

// Fetch historical data for analysis
async function fetchHistoricalData(ticker, daysToExpiration = 30) {
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
  const volatility = 0.02; // 2% daily volatility (more realistic for options analysis)
  const samples = Math.min(250, Math.max(100, 500 - daysToExpiration)); // More samples for better analysis
  
  for (let i = 0; i < samples; i++) {
    // Simulate more realistic price movements with mean reversion
    let cumulativeMove = 0;
    let currentPrice = basePrice;
    
    for (let day = 0; day < daysToExpiration; day++) {
      // Random walk with slight mean reversion and volatility clustering
      const randomMove = (Math.random() - 0.5) * volatility * 2;
      const meanReversion = (basePrice - currentPrice) * 0.0005; // Slight pull toward base price
      const dailyMove = randomMove + meanReversion;
      
      cumulativeMove += dailyMove;
      currentPrice = currentPrice * (1 + dailyMove);
    }
    
    // Generate realistic dates
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - (samples - i) * 2); // Spread out over time
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
    aboveUpperPct: totalValidSamples > 0 ? (aboveUpperCount / totalValidSamples) * 100 : 0,
    belowLowerPct: totalValidSamples > 0 ? (belowLowerCount / totalValidSamples) * 100 : 0,
    upperBreakevenPct: upperBreakevenPct * 100,
    lowerBreakevenPct: lowerBreakevenPct * 100,
    avgMove: avgMove * 100,
    maxMove: maxMove * 100,
    minMove: minMove * 100,
    dataQuality: totalValidSamples >= 100 ? 'high' : totalValidSamples >= 50 ? 'medium' : 'low'
  };
}

// Get straddle data from Yahoo Finance
async function getStraddleDataFromYahoo(ticker, currentPrice, daysToExpiration = 30) {
  try {
    const response = await fetch(`${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/api/yahoo-finance-options?ticker=${ticker}`);
    
    if (!response.ok) {
      throw new Error(`Yahoo Finance API error: ${response.status}`);
    }
    
    const data = await response.json();
    
    return {
      ticker,
      currentPrice: data.currentPrice || currentPrice,
      strikePrice: data.strikePrice || currentPrice,
      totalPremium: data.totalPremium,
      source: data.source || 'yahoo_finance',
      dataQuality: data.dataQuality || 'medium',
      expirationDate: data.expirationDate,
      executionDate: data.executionDate
    };
  } catch (error) {
    console.error(`Error fetching Yahoo Finance data for ${ticker}:`, error.message);
    // Fallback to estimation
    return {
      ticker,
      currentPrice,
      strikePrice: currentPrice,
      totalPremium: estimateStraddlePremium(currentPrice, daysToExpiration),
      source: 'estimation',
      dataQuality: 'low',
      note: 'Yahoo Finance data unavailable, using estimation'
    };
  }
}

// Estimate straddle premium using Black-Scholes approximation (fallback)
function estimateStraddlePremium(currentPrice, daysToExpiration) {
  // Simple approximation: premium is typically 2-5% of stock price for 30-day options
  const basePremiumRate = 0.03; // 3% base rate
  const timeDecayFactor = Math.sqrt(daysToExpiration / 30); // Square root time decay
  const volatilityFactor = 1.2; // Assume higher volatility for high dark pool activity stocks
  
  return currentPrice * basePremiumRate * timeDecayFactor * volatilityFactor;
}

// Analyze a single ticker for straddle profitability
async function analyzeTickerStraddle(ticker, currentPrice, daysToExpiration = 30) {
  try {
    // Get straddle data from Yahoo Finance (with fallback to estimation)
    const straddleData = await getStraddleDataFromYahoo(ticker, currentPrice, daysToExpiration);
    
    const strikePrice = straddleData.strikePrice;
    const totalPremium = straddleData.totalPremium;
    
    // Calculate breakeven points
    const upperBreakeven = strikePrice + totalPremium;
    const lowerBreakeven = strikePrice - totalPremium;
    
    // Calculate percentage moves needed
    const upperBreakevenPct = (upperBreakeven - strikePrice) / strikePrice;
    const lowerBreakevenPct = (lowerBreakeven - strikePrice) / strikePrice;

    // Fetch historical data for analysis
    const historicalData = await fetchHistoricalData(ticker, daysToExpiration);
    
    // Analyze historical profitability
    const analysis = analyzeHistoricalProfitability(
      historicalData, 
      upperBreakevenPct, 
      lowerBreakevenPct
    );

    return {
      ticker,
      currentPrice: straddleData.currentPrice,
      strikePrice,
      totalPremium,
      upperBreakeven,
      lowerBreakeven,
      upperBreakevenPct: upperBreakevenPct * 100,
      lowerBreakevenPct: lowerBreakevenPct * 100,
      daysToExpiration,
      analysis,
      isProfitable: analysis.profitableRate >= AUTOMATION_CONFIG.profitableThreshold,
      dataQuality: analysis.dataQuality,
      source: straddleData.source,
      expirationDate: straddleData.expirationDate,
      executionDate: straddleData.executionDate,
      note: straddleData.note
    };
  } catch (error) {
    console.error(`Error analyzing ticker ${ticker}:`, error);
    return {
      ticker,
      currentPrice,
      error: error.message,
      isProfitable: false
    };
  }
}

// Process multiple tickers with concurrency control
async function processTickersConcurrently(tickers, maxConcurrent = AUTOMATION_CONFIG.maxConcurrentAnalysis) {
  const results = [];
  
  for (let i = 0; i < tickers.length; i += maxConcurrent) {
    const batch = tickers.slice(i, i + maxConcurrent);
    const batchPromises = batch.map(ticker => 
      analyzeTickerStraddle(ticker.ticker, ticker.avg_price, AUTOMATION_CONFIG.defaultDaysToExpiration)
    );
    
    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults);
    
    // Add delay between batches to be respectful to Yahoo Finance
    // Yahoo Finance is more lenient than Polygon.io, but we still want to be respectful
    if (i + maxConcurrent < tickers.length) {
      await new Promise(resolve => setTimeout(resolve, 2000)); // 2 second delay
    }
  }
  
  return results;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { tickers } = req.body;

    if (!tickers || !Array.isArray(tickers) || tickers.length === 0) {
      return res.status(400).json({ 
        error: 'Missing or invalid tickers array',
        message: 'Please provide an array of ticker objects with ticker and avg_price properties'
      });
    }

    console.log(`Starting automated straddle analysis for ${tickers.length} tickers`);

    // Process all tickers concurrently
    const results = await processTickersConcurrently(tickers);

    // Filter for profitable straddles
    const profitableStraddles = results.filter(result => 
      result.isProfitable && 
      result.analysis && 
      result.analysis.dataQuality !== 'none'
    );

    // Sort by profitability rate
    profitableStraddles.sort((a, b) => b.analysis.profitableRate - a.analysis.profitableRate);

    const response = {
      timestamp: new Date().toISOString(),
      config: AUTOMATION_CONFIG,
      total_tickers_analyzed: results.length,
      profitable_straddles: profitableStraddles.length,
      results: results,
      profitable_straddles_list: profitableStraddles.map(result => ({
        ticker: result.ticker,
        currentPrice: result.currentPrice,
        estimatedPremium: result.estimatedPremium,
        profitableRate: result.analysis.profitableRate,
        upperBreakeven: result.upperBreakeven,
        lowerBreakeven: result.lowerBreakeven,
        dataQuality: result.analysis.dataQuality,
        totalSamples: result.analysis.totalSamples
      }))
    };

    console.log(`Analysis complete: ${profitableStraddles.length} profitable straddles found out of ${results.length} analyzed`);

    return res.status(200).json(response);

  } catch (error) {
    console.error('Error in automated-straddle-analysis:', error);
    return res.status(500).json({ 
      error: 'Failed to perform automated straddle analysis',
      details: process.env.NODE_ENV === 'development' ? error.message : 'Please try again later'
    });
  }
}
