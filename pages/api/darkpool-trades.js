const db = require('../../lib/database');

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { refresh = 'false', include_history = 'false' } = req.query;
    const apiKey = process.env.POLYGON_API_KEY;
    
    console.log('API Request:', { refresh, include_history });

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
    
    // FORCE REFRESH - Always do fresh analysis when refresh=true
    if (refresh === 'true') {
      console.log('FORCE REFRESH: Starting fresh dark pool analysis...');
      
      try {
        const analysis = await performFullDarkPoolAnalysis(currentDate, apiKey);
        
        let trades = analysis.trades;
        
        // Add historical data if requested
        if (include_history === 'true') {
          console.log('Adding historical data to fresh results...');
          trades = await addHistoricalDataToTrades(trades, apiKey);
        }
        
        return res.status(200).json({
          date: currentDate,
          trades: trades,
          total_tickers: trades.length,
          last_updated: analysis.last_updated,
          cached: false,
          has_history: include_history === 'true'
        });
        
      } catch (error) {
        console.error('Error during force refresh analysis:', error);
        return res.status(500).json({
          error: 'Unable to analyze dark pool data',
          details: error.message
        });
      }
    }

    // Check if we already have today's analysis cached
    const cachedAnalysis = db.getTodayAnalysis(currentDate);
    
    if (cachedAnalysis && cachedAnalysis.trades.length > 0) {
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

    // If no cached data, do the full analysis
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
  console.log('Adding 7-day historical data to trades...');
  
  const tradesWithHistory = await Promise.all(
    trades.map(async (trade) => {
      try {
        const historicalData = await get7DayDarkPoolHistory(trade.ticker, apiKey);
        return {
          ...trade,
          avg_7day_volume: historicalData.avgVolume,
          avg_7day_trades: historicalData.avgTrades,
          volume_ratio: historicalData.avgVolume > 0 ? trade.total_volume / historicalData.avgVolume : 0
        };
      } catch (error) {
        console.error(`Error fetching historical data for ${trade.ticker}:`, error);
        return {
          ...trade,
          avg_7day_volume: 0,
          avg_7day_trades: 0,
          volume_ratio: 0
        };
      }
    })
  );
  
  console.log('Historical data added successfully');
  return tradesWithHistory;
}

async function get7DayDarkPoolHistory(ticker, apiKey) {
  try {
    console.log(`Fetching 7-day historical data for ${ticker}...`);
    
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 7); // 7 days back
    
    const startDateStr = startDate.toISOString().split('T')[0];
    const endDateStr = endDate.toISOString().split('T')[0];
    
    console.log(`${ticker}: Fetching data from ${startDateStr} to ${endDateStr}`);
    
    // Paginate across all historical results in window
    const baseUrl = `https://api.polygon.io/v3/trades/${ticker}?timestamp.gte=${startDateStr}&timestamp.lte=${endDateStr}&limit=50000`;
    const allResults = await fetchAllTradesPaginated(baseUrl, apiKey);
    console.log(`${ticker}: Historical results fetched: ${allResults.length}`);
    if (!allResults || allResults.length === 0) {
      console.log(`No historical trade data for ${ticker}`);
      return { avgVolume: 0, avgTrades: 0 };
    }

    // Log first trade structure for debugging
    if (allResults.length > 0) {
      console.log(`${ticker}: Sample trade structure:`, JSON.stringify(allResults[0], null, 2));
    }
    
    // Check what exchanges we have
    const exchanges = [...new Set(allResults.map(trade => trade.exchange))];
    console.log(`${ticker}: Available exchanges:`, exchanges);
    
    // Check what trades have trf_id
    const tradesWithTrf = allResults.filter(trade => trade.trf_id !== undefined);
    console.log(`${ticker}: Trades with TRF ID: ${tradesWithTrf.length} out of ${allResults.length}`);
    
    // Check for exchange 4 trades specifically
    const exchange4Trades = allResults.filter(trade => trade.exchange === 4);
    console.log(`${ticker}: Exchange 4 trades: ${exchange4Trades.length}`);
    
    // Filter dark pool trades according to Polygon.io documentation
    // Dark pool trades must have BOTH exchange: 4 AND trf_id field
    const darkPoolTrades = allResults.filter(trade => 
      trade && typeof trade === 'object' && 
      trade.exchange === 4 && 
      trade.trf_id !== undefined
    );
    
    console.log(`${ticker}: Dark pool trades (exchange:4 + trf_id): ${darkPoolTrades.length}`);

    console.log(`${ticker}: Using ${darkPoolTrades.length} dark pool trades in 7-day period`);

    // Group by date and calculate daily totals
    const dailyData = {};
    darkPoolTrades.forEach(trade => {
      // Use participant_timestamp for more accurate date grouping
      const timestamp = trade.participant_timestamp || trade.t || trade.sip_timestamp;
      if (!timestamp) {
        console.log(`${ticker}: Trade missing timestamp:`, trade);
        return;
      }
      
      const tradeDate = new Date(timestamp).toISOString().split('T')[0];
      if (!dailyData[tradeDate]) {
        dailyData[tradeDate] = { volume: 0, trades: 0 };
      }
      dailyData[tradeDate].volume += trade.size || 0;
      dailyData[tradeDate].trades += 1;
    });

    // Calculate averages
    const days = Object.keys(dailyData).length;
    console.log(`${ticker}: Daily data summary:`, dailyData);
    console.log(`${ticker}: Number of days with data: ${days}`);
    
    if (days === 0) {
      console.log(`${ticker}: No daily data found - checking if we have any trades at all`);
      console.log(`${ticker}: Total trades received: ${allResults.length}`);
      console.log(`${ticker}: Exchange 4 trades: ${exchange4Trades.length}`);
      console.log(`${ticker}: Trades with TRF ID: ${tradesWithTrf.length}`);
      return { avgVolume: 0, avgTrades: 0 };
    }

    const totalVolume = Object.values(dailyData).reduce((sum, day) => sum + day.volume, 0);
    const totalTrades = Object.values(dailyData).reduce((sum, day) => sum + day.trades, 0);

    console.log(`${ticker}: 7-day average - ${Math.round(totalVolume / days)} volume, ${Math.round(totalTrades / days)} trades per day`);

    return {
      avgVolume: Math.round(totalVolume / days),
      avgTrades: Math.round(totalTrades / days)
    };
    
  } catch (error) {
    if (error.name === 'AbortError') {
      console.log(`Timeout fetching 7-day historical data for ${ticker}`);
    } else {
      console.error(`Error fetching 7-day historical data for ${ticker}:`, error);
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
    .slice(0, 100); // Top 100 by volume
  
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
      throw new Error(`API failed: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    if (!data.results || !Array.isArray(data.results)) {
      console.log('No trade data available');
      throw new Error('No trade data available from Polygon API');
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
    
    console.log(`Found ${activeTickers.length} active tickers from real data`);
    return activeTickers;
    
  } catch (error) {
    console.error('Error getting active tickers:', error);
    throw error; // Don't use fallback, let it fail
  }
}

async function getDarkPoolTradesForTicker(ticker, date, apiKey) {
  try {
    // Paginate today's trades for the ticker
    const baseUrl = `https://api.polygon.io/v3/trades/${ticker}?date=${date}&limit=50000`;
    const allResults = await fetchAllTradesPaginated(baseUrl, apiKey);
    if (!allResults || allResults.length === 0) return [];

    console.log(`${ticker}: Total trades fetched: ${allResults.length}`);

    // RELAXED FILTERING - Let's see what we're actually getting
    // Check all trades, not just dark pool ones
    const allTrades = allResults.filter(trade => 
      trade && typeof trade === 'object'
    );

    console.log(`${ticker}: Valid trades: ${allTrades.length}`);

    // Check what exchanges we have
    const exchanges = [...new Set(allTrades.map(trade => trade.exchange))];
    console.log(`${ticker}: Available exchanges:`, exchanges);
    
    // Check what trades have trf_id
    const tradesWithTrf = allTrades.filter(trade => trade.trf_id !== undefined);
    console.log(`${ticker}: Trades with TRF ID: ${tradesWithTrf.length} out of ${allTrades.length}`);
    
    // Check for exchange 4 trades specifically
    const exchange4Trades = allTrades.filter(trade => trade.exchange === 4);
    console.log(`${ticker}: Exchange 4 trades: ${exchange4Trades.length}`);

    // Now apply the original dark pool filtering
    const darkPoolTrades = allTrades.filter(trade => 
      trade.exchange === 4 && 
      trade.trf_id !== undefined
    );

    console.log(`${ticker}: Dark pool trades (exchange:4 + trf_id): ${darkPoolTrades.length}`);

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

// Helper to paginate Polygon trades API using next_url
async function fetchAllTradesPaginated(baseUrl, apiKey) {
  try {
    let nextUrl = baseUrl.includes('apiKey=') ? baseUrl : `${baseUrl}&apiKey=${apiKey}`;
    const all = [];
    let safety = 0;
    console.log(`Starting pagination for: ${baseUrl}`);
    
    while (nextUrl && safety < 100) {
      console.log(`Fetching page ${safety + 1}: ${nextUrl.substring(0, 100)}...`);
      const resp = await fetch(nextUrl, { 
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(15000) // 15 second timeout per request
      });
      
      if (!resp.ok) {
        console.log(`fetchAllTradesPaginated failed: ${resp.status} ${resp.statusText}`);
        break;
      }
      
      const data = await resp.json();
      console.log(`Page ${safety + 1}: Got ${data.results?.length || 0} results, next_url: ${data.next_url ? 'yes' : 'no'}`);
      
      if (Array.isArray(data.results)) {
        all.push(...data.results);
      }
      
      nextUrl = data.next_url || null;
      safety++;
      
      // Small delay to avoid rate limits
      if (nextUrl) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    console.log(`Pagination complete: ${all.length} total results across ${safety} pages`);
    return all;
  } catch (e) {
    console.error('fetchAllTradesPaginated error:', e);
    return [];
  }
}


