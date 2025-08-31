const db = require('../../lib/database');

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { refresh = 'false', include_history = 'false' } = req.query;
    const apiKey = process.env.POLYGON_API_KEY;

    if (!apiKey || apiKey === 'YOUR_POLYGON_API_KEY_HERE' || apiKey === 'your_polygon_api_key_here') {
      return res.status(503).json({ 
        error: 'Dark Pool Scanner is currently unavailable. Please try again later.',
        details: 'Service temporarily unavailable'
      });
    }

    // Initialize database
    db.initializeDatabase();
    
    const currentDate = new Date().toISOString().split('T')[0];
    
    // Check if we already have today's analysis cached
    const cachedAnalysis = db.getTodayAnalysis(currentDate);
    
    if (cachedAnalysis && cachedAnalysis.trades && cachedAnalysis.trades.length > 0) {
      console.log('Returning cached analysis for today');
      
      let trades = cachedAnalysis.trades;
      
      // Only add historical data if explicitly requested and not already cached
      if (include_history === 'true' && !cachedAnalysis.has_history) {
        console.log('Adding historical data to cached results...');
        try {
          // Use a very short timeout for historical data
          const historicalPromise = addHistoricalDataToTrades(trades, apiKey);
          const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Historical data timeout')), 15000)
          );
          
          trades = await Promise.race([historicalPromise, timeoutPromise]);
          
          // Update cache with historical data
          db.saveTodayAnalysis(currentDate, {
            ...cachedAnalysis,
            trades: trades,
            has_history: true
          });
        } catch (error) {
          console.error('Error adding historical data:', error);
          // Return cached data without historical data if it fails
        }
      }
      
      return res.status(200).json({
        date: currentDate,
        trades: trades,
        total_tickers: trades.length,
        last_updated: cachedAnalysis.last_updated,
        cached: true,
        has_history: include_history === 'true' && cachedAnalysis.has_history
      });
    }

    // If refresh is requested, fetch new data from Polygon with strict timeout
    if (refresh === 'true') {
      console.log('Refreshing dark pool data...');
      try {
        const refreshPromise = refreshTopTickersData(currentDate, apiKey);
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Refresh timeout')), 20000)
        );
        
        await Promise.race([refreshPromise, timeoutPromise]);
      } catch (error) {
        console.error('Error refreshing data:', error);
        // Continue with existing data if refresh fails
      }
    }

    // Get all today's dark pool trades grouped by ticker (top 25)
    let trades = db.getAllTodayDarkPoolTrades(currentDate).slice(0, 25);
    
    // If no data exists, fetch initial data with very strict timeout
    if (trades.length === 0) {
      console.log('No data found, fetching initial data for top tickers...');
      try {
        const initialPromise = refreshTopTickersData(currentDate, apiKey, true);
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Initial data fetch timeout')), 15000)
        );
        
        await Promise.race([initialPromise, timeoutPromise]);
        trades = db.getAllTodayDarkPoolTrades(currentDate).slice(0, 25);
      } catch (error) {
        console.error('Error fetching initial data:', error);
        // Return empty data if initial fetch fails
        return res.status(200).json({
          date: currentDate,
          trades: [],
          total_tickers: 0,
          last_updated: new Date().toISOString(),
          cached: false,
          has_history: false,
          message: 'No data available. Please try refreshing.'
        });
      }
    }

    // Only add historical data if explicitly requested with strict timeout
    let tradesWithHistory = trades;
    if (include_history === 'true') {
      console.log('Adding historical data...');
      try {
        const historicalPromise = addHistoricalDataToTrades(trades, apiKey);
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Historical data timeout')), 15000)
        );
        
        tradesWithHistory = await Promise.race([historicalPromise, timeoutPromise]);
      } catch (error) {
        console.error('Error adding historical data:', error);
        // Use trades without historical data if it fails
        tradesWithHistory = trades.map(trade => ({
          ...trade,
          avg_90day_volume: 0,
          avg_90day_trades: 0,
          volume_ratio: 0
        }));
      }
    } else {
      // Add placeholder historical data
      tradesWithHistory = trades.map(trade => ({
        ...trade,
        avg_90day_volume: 0,
        avg_90day_trades: 0,
        volume_ratio: 0
      }));
    }

    // Cache the results
    db.saveTodayAnalysis(currentDate, {
      trades: tradesWithHistory,
      last_updated: new Date().toISOString(),
      has_history: include_history === 'true'
    });

    return res.status(200).json({
      date: currentDate,
      trades: tradesWithHistory,
      total_tickers: tradesWithHistory.length,
      last_updated: new Date().toISOString(),
      cached: false,
      has_history: include_history === 'true'
    });

  } catch (error) {
    console.error('Error in dark pool trades API:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? error.message : 'Please try again later'
    });
  }
}

async function fetchAndStoreDarkPoolTrades(ticker, date, apiKey) {
  try {
    console.log(`Fetching dark pool trades for ${ticker} on ${date}...`);
    
    // Get trades from Polygon.io with timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout to prevent timeouts
    
    const response = await fetch(
      `https://api.polygon.io/v3/trades/${ticker}?date=${date}&limit=5000&apiKey=${apiKey}`,
      { signal: controller.signal }
    );
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      console.log(`Failed to get trades for ${ticker} on ${date}: ${response.status}`);
      return;
    }
    
    const data = await response.json();
    if (!data.results || !Array.isArray(data.results)) {
      console.log(`No trade data for ${ticker} on ${date}`);
      return;
    }

    // Filter dark pool trades (exchange = 4 AND trf_id present)
    const darkPoolTrades = data.results.filter(trade => 
      trade && typeof trade === 'object' && 
      trade.exchange === 4 && 
      trade.trf_id !== undefined
    );

    console.log(`${ticker}: Found ${darkPoolTrades.length} dark pool trades out of ${data.results.length} total trades`);

    // Save each dark pool trade to database
    let savedCount = 0;
    for (const trade of darkPoolTrades) {
      const tradeData = {
        ticker: ticker.toUpperCase(),
        exchange_id: trade.exchange,
        trf_id: trade.trf_id,
        volume: trade.size || 0,
        price: trade.p || 0,
        timestamp: trade.t || new Date().toISOString(),
        trade_date: date
      };

      if (db.saveDarkPoolTrade(tradeData)) {
        savedCount++;
      }
    }

    console.log(`${ticker}: Saved ${savedCount} dark pool trades to database`);
    
  } catch (error) {
    if (error.name === 'AbortError') {
      console.log(`Timeout fetching data for ${ticker}`);
    } else {
      console.error(`Error fetching dark pool trades for ${ticker}:`, error);
    }
  }
}

async function get90DayDarkPoolHistory(ticker, apiKey) {
  try {
    console.log(`Fetching 90-day historical data for ${ticker}...`);
    
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 7); // Reduced to 7 days to prevent timeouts
    
    const startDateStr = startDate.toISOString().split('T')[0];
    const endDateStr = endDate.toISOString().split('T')[0];
    
    // Get historical trades from Polygon.io with shorter timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout
    
    const response = await fetch(
      `https://api.polygon.io/v3/trades/${ticker}?timestamp.gte=${startDateStr}&timestamp.lte=${endDateStr}&limit=2000&apiKey=${apiKey}`,
      { signal: controller.signal }
    );
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      console.log(`Failed to get historical trades for ${ticker}: ${response.status}`);
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

    console.log(`${ticker}: 7-day average - ${Math.round(totalVolume / days)} volume, ${Math.round(totalTrades / days)} trades per day`);

    return {
      avgVolume: Math.round(totalVolume / days),
      avgTrades: Math.round(totalTrades / days)
    };
    
  } catch (error) {
    if (error.name === 'AbortError') {
      console.log(`Timeout fetching historical data for ${ticker}`);
    } else {
      console.error(`Error fetching historical data for ${ticker}:`, error);
    }
    return { avgVolume: 0, avgTrades: 0 };
  }
}

async function refreshTopTickersData(date, apiKey, limited = false) {
  try {
    // Focus on the most liquid stocks that are likely to have dark pool activity
    const tickers = limited ? [
      // Top 5 most liquid stocks for initial load (aggressive optimization)
      'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA'
    ] : [
      // Top 10 most liquid stocks for complete refresh (aggressive optimization)
      'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA', 'NVDA', 'META', 'NFLX', 'CRM', 'ADBE'
    ];

    console.log(`Refreshing data for ${tickers.length} tickers (limited: ${limited})...`);

    // Process tickers in parallel with strict concurrency limit
    const concurrencyLimit = 2; // Process only 2 tickers at a time
    const chunks = [];
    for (let i = 0; i < tickers.length; i += concurrencyLimit) {
      chunks.push(tickers.slice(i, i + concurrencyLimit));
    }

    for (const chunk of chunks) {
      try {
        await Promise.allSettled(
          chunk.map(ticker => fetchAndStoreDarkPoolTrades(ticker, date, apiKey))
        );
        
        // Delay between chunks to respect rate limits
        await new Promise(resolve => setTimeout(resolve, 200));
        
      } catch (error) {
        console.error(`Error processing chunk:`, error);
      }
    }

    console.log('Top tickers refresh completed');
    
  } catch (error) {
    console.error('Error refreshing top tickers data:', error);
  }
}

// Optimized function to add historical data with better error handling
async function addHistoricalDataToTrades(trades, apiKey) {
  try {
    console.log('Adding historical data to trades...');
    
    // Limit to top 5 tickers to prevent timeouts
    const limitedTrades = trades.slice(0, 5);
    
    const tradesWithHistory = await Promise.allSettled(
      limitedTrades.map(async (trade) => {
        try {
          const historicalData = await get90DayDarkPoolHistory(trade.ticker, apiKey);
          return {
            ...trade,
            avg_90day_volume: historicalData.avgVolume,
            avg_90day_trades: historicalData.avgTrades,
            volume_ratio: historicalData.avgVolume > 0 ? trade.total_volume / historicalData.avgVolume : 0
          };
        } catch (error) {
          console.error(`Error fetching historical data for ${trade.ticker}:`, error);
          return {
            ...trade,
            avg_90day_volume: 0,
            avg_90day_trades: 0,
            volume_ratio: 0
          };
        }
      })
    );

    // Process results and handle rejected promises
    const processedTrades = tradesWithHistory.map((result, index) => {
      if (result.status === 'fulfilled') {
        return result.value;
      } else {
        console.error(`Failed to get historical data for ${limitedTrades[index].ticker}:`, result.reason);
        return {
          ...limitedTrades[index],
          avg_90day_volume: 0,
          avg_90day_trades: 0,
          volume_ratio: 0
        };
      }
    });

    // Add remaining trades without historical data
    const remainingTrades = trades.slice(5).map(trade => ({
      ...trade,
      avg_90day_volume: 0,
      avg_90day_trades: 0,
      volume_ratio: 0
    }));

    return [...processedTrades, ...remainingTrades];
  } catch (error) {
    console.error('Error adding historical data to trades:', error);
    return trades.map(trade => ({
      ...trade,
      avg_90day_volume: 0,
      avg_90day_trades: 0,
      volume_ratio: 0
    }));
  }
}


