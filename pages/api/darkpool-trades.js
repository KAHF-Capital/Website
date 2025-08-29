const db = require('../../lib/database');

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { refresh = 'false', include_history = 'false' } = req.query;
    const apiKey = process.env.POLYGON_API_KEY;

    // Check if API key is properly configured
    if (!apiKey || apiKey === 'YOUR_POLYGON_API_KEY_HERE' || apiKey === 'your_polygon_api_key_here') {
      console.error('Polygon API key not configured properly');
      return res.status(503).json({ 
        error: 'Dark Pool Scanner is currently unavailable. Please check API configuration.',
        details: 'Service temporarily unavailable - API key not configured'
      });
    }

    // Initialize database
    db.initializeDatabase();
    
    const currentDate = new Date().toISOString().split('T')[0];
    
    // Check if we already have today's analysis cached
    const cachedAnalysis = db.getTodayAnalysis(currentDate);
    
    if (cachedAnalysis && cachedAnalysis.trades.length > 0 && refresh !== 'true') {
      console.log('Returning cached analysis for today');
      
      let trades = cachedAnalysis.trades;
      
      // Add historical data if requested
      if (include_history === 'true') {
        console.log('Adding historical data to cached results...');
        trades = await addHistoricalDataToTrades(trades, apiKey);
      }
      
      return res.status(200).json({
        date: currentDate,
        trades: trades,
        total_tickers: trades.length,
        last_updated: cachedAnalysis.last_updated,
        cached: true,
        has_history: include_history === 'true'
      });
    }

    // If refresh is requested or no cached data, do the full analysis
    console.log('Starting full dark pool analysis for today...');
    
    try {
      const analysis = await performFullDarkPoolAnalysis(currentDate, apiKey);
      
      let trades = analysis.trades;
      
      // Add historical data if requested
      if (include_history === 'true') {
        console.log('Adding historical data to fresh results...');
        trades = await addHistoricalDataToTrades(trades, apiKey);
      }
      
      // Cache the results for the rest of the day
      db.saveTodayAnalysis(currentDate, { ...analysis, trades: trades });
      
      return res.status(200).json({
        date: currentDate,
        trades: trades,
        total_tickers: trades.length,
        last_updated: analysis.last_updated,
        cached: false,
        has_history: include_history === 'true'
      });
      
    } catch (error) {
      console.error('Error during full analysis:', error);
      
      // If analysis fails, return cached data if available
      if (cachedAnalysis && cachedAnalysis.trades.length > 0) {
        console.log('Analysis failed, returning cached data');
        
        let trades = cachedAnalysis.trades;
        
        // Add historical data if requested
        if (include_history === 'true') {
          console.log('Adding historical data to cached fallback...');
          trades = await addHistoricalDataToTrades(trades, apiKey);
        }
        
        return res.status(200).json({
          date: currentDate,
          trades: trades,
          total_tickers: trades.length,
          last_updated: cachedAnalysis.last_updated,
          cached: true,
          has_history: include_history === 'true',
          message: 'Using cached data due to analysis error'
        });
      }
      
      // If no cached data, return error
      return res.status(500).json({
        error: 'Unable to analyze dark pool data',
        details: error.message
      });
    }

  } catch (error) {
    console.error('Error in dark pool trades API:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      details: error.message 
    });
  }
}

async function addHistoricalDataToTrades(trades, apiKey) {
  console.log('Adding 30-day historical data to trades...');
  
  const tradesWithHistory = await Promise.all(
    trades.map(async (trade) => {
      try {
        const historicalData = await get30DayDarkPoolHistory(trade.ticker, apiKey);
        return {
          ...trade,
          avg_30day_volume: historicalData.avgVolume,
          avg_30day_trades: historicalData.avgTrades,
          volume_ratio: historicalData.avgVolume > 0 ? trade.total_volume / historicalData.avgVolume : 0
        };
      } catch (error) {
        console.error(`Error fetching historical data for ${trade.ticker}:`, error);
        return {
          ...trade,
          avg_30day_volume: 0,
          avg_30day_trades: 0,
          volume_ratio: 0
        };
      }
    })
  );
  
  console.log('Historical data added successfully');
  return tradesWithHistory;
}

async function get30DayDarkPoolHistory(ticker, apiKey) {
  try {
    console.log(`Fetching 30-day historical data for ${ticker}...`);
    
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 30);
    
    const startDateStr = startDate.toISOString().split('T')[0];
    
    // Get historical trades from Polygon.io with shorter timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second timeout
    
    const response = await fetch(
      `https://api.polygon.io/v3/trades/${ticker}?timestamp=${startDateStr}&limit=50000&apiKey=${apiKey}`,
      { 
        signal: controller.signal,
        headers: {
          'Accept': 'application/json'
        }
      }
    );
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      console.log(`Failed to get historical trades for ${ticker}: ${response.status} ${response.statusText}`);
      return { avgVolume: 0, avgTrades: 0 };
    }
    
    const data = await response.json();
    if (!data.results || !Array.isArray(data.results)) {
      console.log(`No historical trade data for ${ticker}`);
      return { avgVolume: 0, avgTrades: 0 };
    }

    // Filter dark pool trades and group by date
    const darkPoolTrades = data.results.filter(trade => 
      trade && typeof trade === 'object' && 
      trade.exchange === 4 && 
      trade.trf_id !== undefined
    );

    // Group by date and calculate daily totals
    const dailyData = {};
    darkPoolTrades.forEach(trade => {
      const tradeDate = new Date(trade.t).toISOString().split('T')[0];
      if (!dailyData[tradeDate]) {
        dailyData[tradeDate] = { volume: 0, trades: 0 };
      }
      dailyData[tradeDate].volume += trade.size || 0;
      dailyData[tradeDate].trades += 1;
    });

    // Calculate averages
    const days = Object.keys(dailyData).length;
    if (days === 0) {
      return { avgVolume: 0, avgTrades: 0 };
    }

    const totalVolume = Object.values(dailyData).reduce((sum, day) => sum + day.volume, 0);
    const totalTrades = Object.values(dailyData).reduce((sum, day) => sum + day.trades, 0);

    console.log(`${ticker}: 30-day average - ${Math.round(totalVolume / days)} volume, ${Math.round(totalTrades / days)} trades per day`);

    return {
      avgVolume: Math.round(totalVolume / days),
      avgTrades: Math.round(totalTrades / days)
    };
    
  } catch (error) {
    if (error.name === 'AbortError') {
      console.log(`Timeout fetching 30-day historical data for ${ticker}`);
    } else {
      console.error(`Error fetching 30-day historical data for ${ticker}:`, error);
    }
    return { avgVolume: 0, avgTrades: 0 };
  }
}

async function performFullDarkPoolAnalysis(date, apiKey) {
  console.log('Starting full dark pool analysis...');
  
  // Step 1: Get the most active tickers for today
  const activeTickers = await getMostActiveTickers(date, apiKey);
  console.log(`Found ${activeTickers.length} active tickers for analysis`);
  
  // Step 2: Download dark pool trades for each active ticker
  const allDarkPoolTrades = [];
  
  for (const ticker of activeTickers) {
    try {
      console.log(`Analyzing dark pool trades for ${ticker}...`);
      const trades = await getDarkPoolTradesForTicker(ticker, date, apiKey);
      allDarkPoolTrades.push(...trades);
      
      // Small delay to avoid rate limits
      await new Promise(resolve => setTimeout(resolve, 200));
      
    } catch (error) {
      console.error(`Error analyzing ${ticker}:`, error);
      // Continue with other tickers
    }
  }
  
  // Step 3: Group and summarize by ticker
  const tickerSummary = {};
  
  allDarkPoolTrades.forEach(trade => {
    if (!tickerSummary[trade.ticker]) {
      tickerSummary[trade.ticker] = {
        ticker: trade.ticker,
        total_volume: 0,
        trade_count: 0,
        first_trade: null,
        last_trade: null
      };
    }
    
    tickerSummary[trade.ticker].total_volume += trade.volume;
    tickerSummary[trade.ticker].trade_count += 1;
    
    if (!tickerSummary[trade.ticker].first_trade || 
        new Date(trade.timestamp) < new Date(tickerSummary[trade.ticker].first_trade)) {
      tickerSummary[trade.ticker].first_trade = trade.timestamp;
    }
    
    if (!tickerSummary[trade.ticker].last_trade || 
        new Date(trade.timestamp) > new Date(tickerSummary[trade.ticker].last_trade)) {
      tickerSummary[trade.ticker].last_trade = trade.timestamp;
    }
  });
  
  // Step 4: Convert to array and sort by volume
  const results = Object.values(tickerSummary)
    .sort((a, b) => b.total_volume - a.total_volume)
    .slice(0, 50); // Top 50 by volume
  
  console.log(`Analysis complete: Found ${results.length} tickers with dark pool activity`);
  
  return {
    trades: results,
    last_updated: new Date().toISOString()
  };
}

async function getMostActiveTickers(date, apiKey) {
  console.log('Getting most active tickers for today...');
  
  // Get today's trades from Polygon to find most active tickers
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout
  
  try {
    const response = await fetch(
      `https://api.polygon.io/v3/trades?date=${date}&limit=50000&apiKey=${apiKey}`,
      { 
        signal: controller.signal,
        headers: {
          'Accept': 'application/json'
        }
      }
    );
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      console.log(`Failed to get trades: ${response.status} ${response.statusText}`);
      // Fallback to top liquid stocks if API fails
      return getFallbackTickers();
    }
    
    const data = await response.json();
    if (!data.results || !Array.isArray(data.results)) {
      console.log('No trade data available, using fallback tickers');
      return getFallbackTickers();
    }

    // Count trades by ticker
    const tickerCounts = {};
    data.results.forEach(trade => {
      if (trade.s && trade.s.length > 0) {
        tickerCounts[trade.s] = (tickerCounts[trade.s] || 0) + 1;
      }
    });
    
    // Get top 100 most active tickers
    const activeTickers = Object.entries(tickerCounts)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 100)
      .map(([ticker]) => ticker);
    
    console.log(`Found ${activeTickers.length} active tickers`);
    return activeTickers;
    
  } catch (error) {
    console.error('Error getting active tickers:', error);
    return getFallbackTickers();
  }
}

function getFallbackTickers() {
  // Fallback to top liquid stocks if we can't get real-time data
  return [
    'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META', 'TSLA', 'NVDA', 'AMD', 'NFLX', 'CRM',
    'ADBE', 'PYPL', 'INTC', 'ORCL', 'CSCO', 'IBM', 'QCOM', 'AVGO', 'TXN', 'MU',
    'LRCX', 'KLAC', 'ADI', 'MCHP', 'ASML', 'TSM', 'SMCI', 'PLTR', 'SNOW', 'ZM',
    'SHOP', 'SQ', 'ROKU', 'SPOT', 'UBER', 'LYFT', 'DASH', 'ABNB', 'COIN', 'HOOD',
    'SPY', 'QQQ', 'IWM', 'VTI', 'VOO', 'ARKK', 'TQQQ', 'SQQQ', 'UVXY', 'VIXY'
  ];
}

async function getDarkPoolTradesForTicker(ticker, date, apiKey) {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second timeout
    
    const response = await fetch(
      `https://api.polygon.io/v3/trades/${ticker}?date=${date}&limit=50000&apiKey=${apiKey}`,
      { 
        signal: controller.signal,
        headers: {
          'Accept': 'application/json'
        }
      }
    );
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      console.log(`Failed to get trades for ${ticker}: ${response.status} ${response.statusText}`);
      return [];
    }
    
    const data = await response.json();
    if (!data.results || !Array.isArray(data.results)) {
      return [];
    }

    // Filter dark pool trades (exchange = 4 AND trf_id present)
    const darkPoolTrades = data.results.filter(trade => 
      trade && typeof trade === 'object' && 
      trade.exchange === 4 && 
      trade.trf_id !== undefined
    );

    console.log(`${ticker}: Found ${darkPoolTrades.length} dark pool trades out of ${data.results.length} total trades`);

    // Convert to our format
    return darkPoolTrades.map(trade => ({
      ticker: ticker.toUpperCase(),
      exchange_id: trade.exchange,
      trf_id: trade.trf_id,
      volume: trade.size || 0,
      price: trade.p || 0,
      timestamp: trade.t || new Date().toISOString(),
      trade_date: date
    }));
    
  } catch (error) {
    if (error.name === 'AbortError') {
      console.log(`Timeout fetching data for ${ticker}`);
    } else {
      console.error(`Error fetching dark pool trades for ${ticker}:`, error);
    }
    return [];
  }
}

