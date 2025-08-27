export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { symbol, limit = 10, all_data } = req.query;
    const apiKey = process.env.POLYGON_API_KEY;

    if (!apiKey || apiKey === 'YOUR_POLYGON_API_KEY_HERE' || apiKey === 'your_polygon_api_key_here') {
      return res.status(503).json({ 
        error: 'Dark Pool Scanner is currently unavailable. Please try again later.',
        details: 'Service temporarily unavailable'
      });
    }

    const currentDate = new Date().toISOString().split('T')[0];
    
    // Use provided symbol or default list
    const symbols = symbol ? [symbol.toUpperCase()] : [
      'AAPL', 'TSLA', 'NVDA', 'SPY', 'QQQ', 'AMZN', 'MSFT', 'GOOGL', 'META', 'AMD',
      'NFLX', 'CRM', 'ADBE', 'PYPL', 'INTC', 'ORCL', 'CSCO', 'IBM', 'QCOM', 'AVGO',
      'TXN', 'MU', 'LRCX', 'KLAC', 'ADI', 'MCHP', 'ASML', 'TSM', 'SMCI', 'PLTR'
    ];

    const darkPoolData = [];

    // Analyze each symbol for dark pool activity
    for (const symbol of symbols) {
      try {
        console.log(`Analyzing dark pool activity for ${symbol}...`);
        
        // Get current stock price
        const stockResponse = await fetch(
          `https://api.polygon.io/v2/aggs/ticker/${symbol}/prev?adjusted=true&apiKey=${apiKey}`
        );
        
        let currentPrice = null;
        if (stockResponse.ok) {
          const stockData = await stockResponse.json();
          if (stockData.results && stockData.results[0]) {
            currentPrice = stockData.results[0].c; // Close price
          }
        }

        // Get today's dark pool data
        const todayDarkPool = await getDarkPoolData(symbol, currentDate, apiKey);
        
        // Get 90-day historical dark pool data for average calculation
        const historicalDarkPool = await getHistoricalDarkPoolData(symbol, currentDate, apiKey);

        if (todayDarkPool && historicalDarkPool) {
          const activityRatio = todayDarkPool.darkPoolVolume / historicalDarkPool.avgDailyDarkPoolVolume;
          
          darkPoolData.push({
            symbol: symbol,
            current_price: currentPrice,
            today_dark_pool_volume: todayDarkPool.darkPoolVolume,
            today_total_volume: todayDarkPool.totalVolume,
            today_dark_pool_ratio: (todayDarkPool.darkPoolVolume / todayDarkPool.totalVolume) * 100,
            avg_90day_dark_pool_volume: historicalDarkPool.avgDailyDarkPoolVolume,
            avg_90day_total_volume: historicalDarkPool.avgDailyTotalVolume,
            activity_ratio: activityRatio,
            status: activityRatio >= 2.0 ? 'high_activity' : 'normal_activity'
          });
        } else {
          darkPoolData.push({
            symbol: symbol,
            current_price: currentPrice,
            today_dark_pool_volume: 0,
            today_total_volume: 0,
            today_dark_pool_ratio: 0,
            avg_90day_dark_pool_volume: 0,
            avg_90day_total_volume: 0,
            activity_ratio: 0,
            status: 'no_data'
          });
        }

      } catch (error) {
        console.error(`Error analyzing ${symbol}:`, error);
        
        darkPoolData.push({
          symbol: symbol,
          current_price: null,
          today_dark_pool_volume: 0,
          today_total_volume: 0,
          today_dark_pool_ratio: 0,
          avg_90day_dark_pool_volume: 0,
          avg_90day_total_volume: 0,
          activity_ratio: 0,
          status: 'error'
        });
        
        continue;
      }
    }

    // Return all data if requested
    if (all_data === 'true') {
      return res.status(200).json({
        dark_pool_data: darkPoolData,
        total_analyzed: darkPoolData.length
      });
    }

    // Sort by dark pool volume and return top results
    const sortedData = darkPoolData
      .filter(item => item.status === 'high_activity')
      .sort((a, b) => (b.today_dark_pool_volume || 0) - (a.today_dark_pool_volume || 0))
      .slice(0, parseInt(limit));

    return res.status(200).json(sortedData);

  } catch (error) {
    console.error('Error in dark pool API:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

async function getDarkPoolData(symbol, date, apiKey) {
  try {
    // Get today's trades
    const response = await fetch(
      `https://api.polygon.io/v3/trades/${symbol}?date=${date}&limit=1000&apiKey=${apiKey}`
    );
    
    if (!response.ok) return null;
    
    const data = await response.json();
    if (!data.results || !Array.isArray(data.results)) return null;

    // Filter dark pool trades (exchange = 4 AND trf_id present)
    const darkPoolTrades = data.results.filter(trade => 
      trade && typeof trade === 'object' && 
      trade.exchange === 4 && 
      trade.trf_id !== undefined
    );

    const totalVolume = data.results.reduce((sum, trade) => sum + (trade.size || 0), 0);
    const darkPoolVolume = darkPoolTrades.reduce((sum, trade) => sum + (trade.size || 0), 0);

    return {
      totalVolume,
      darkPoolVolume,
      darkPoolTrades: darkPoolTrades.length,
      totalTrades: data.results.length
    };
  } catch (error) {
    console.error('Error getting dark pool data:', error);
    return null;
  }
}

async function getHistoricalDarkPoolData(symbol, currentDate, apiKey) {
  try {
    // Get 90 days of historical data (sampling every 3 days to avoid rate limits)
    const startDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const endDate = new Date(currentDate);
    
    let totalDarkPoolVolume = 0;
    let totalVolume = 0;
    let daysWithData = 0;

    // Sample every 3 days to get a good representation
    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 3)) {
      const dateStr = d.toISOString().split('T')[0];
      
      try {
        const response = await fetch(
          `https://api.polygon.io/v3/trades/${symbol}?date=${dateStr}&limit=1000&apiKey=${apiKey}`
        );
        
        if (response.ok) {
          const data = await response.json();
          if (data.results && Array.isArray(data.results)) {
            let dayVolume = 0;
            let dayDarkPoolVolume = 0;

            data.results.forEach(trade => {
              const volume = trade.size || 0;
              dayVolume += volume;

              // Dark pool identification: exchange = 4 AND trf_id present
              if (trade.exchange === 4 && trade.trf_id !== undefined) {
                dayDarkPoolVolume += volume;
              }
            });

            if (dayVolume > 0) {
              totalVolume += dayVolume;
              totalDarkPoolVolume += dayDarkPoolVolume;
              daysWithData++;
            }
          }
        }
      } catch (error) {
        console.log(`Error getting historical data for ${symbol} on ${dateStr}:`, error.message);
        continue;
      }
    }

    if (daysWithData === 0) {
      return {
        avgDailyDarkPoolVolume: 0,
        avgDailyTotalVolume: 0
      };
    }

    return {
      avgDailyDarkPoolVolume: totalDarkPoolVolume / daysWithData,
      avgDailyTotalVolume: totalVolume / daysWithData
    };
  } catch (error) {
    console.error(`Error getting historical dark pool data for ${symbol}:`, error);
    return {
      avgDailyDarkPoolVolume: 0,
      avgDailyTotalVolume: 0
    };
  }
}
