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
    
    // Use provided symbol or get top tickers by dark pool activity
    let symbols;
    if (symbol) {
      symbols = [symbol.toUpperCase()];
    } else {
      // Get top tickers by dark pool activity
      symbols = await getTopTickersByDarkPoolActivity(apiKey, currentDate);
    }

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

        if (todayDarkPool && historicalDarkPool && historicalDarkPool.avgDailyDarkPoolVolume !== null) {
          const activityRatio = todayDarkPool.darkPoolVolume / historicalDarkPool.avgDailyDarkPoolVolume;
          
          console.log(`${symbol} comparison: Today DP=${todayDarkPool.darkPoolVolume.toLocaleString()}, 90-day avg=${historicalDarkPool.avgDailyDarkPoolVolume.toLocaleString()}, ratio=${activityRatio.toFixed(2)}x`);
          
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
          console.log(`${symbol}: Missing data - today: ${!!todayDarkPool}, historical: ${!!historicalDarkPool}, historical avg: ${historicalDarkPool?.avgDailyDarkPoolVolume}`);
          darkPoolData.push({
            symbol: symbol,
            current_price: currentPrice,
            today_dark_pool_volume: todayDarkPool?.darkPoolVolume || 0,
            today_total_volume: todayDarkPool?.totalVolume || 0,
            today_dark_pool_ratio: todayDarkPool ? (todayDarkPool.darkPoolVolume / todayDarkPool.totalVolume) * 100 : 0,
            avg_90day_dark_pool_volume: historicalDarkPool?.avgDailyDarkPoolVolume || null,
            avg_90day_total_volume: historicalDarkPool?.avgDailyTotalVolume || null,
            activity_ratio: null,
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

async function getTopTickersByDarkPoolActivity(apiKey, date) {
  try {
    console.log('Scanning for top tickers by dark pool activity...');
    
    // Start with a broad list of popular stocks to scan
    const candidateSymbols = [
      // Major tech stocks
      'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'META', 'TSLA', 'NVDA', 'AMD', 'NFLX', 'CRM',
      'ADBE', 'PYPL', 'INTC', 'ORCL', 'CSCO', 'IBM', 'QCOM', 'AVGO', 'TXN', 'MU',
      'LRCX', 'KLAC', 'ADI', 'MCHP', 'ASML', 'TSM', 'SMCI', 'PLTR', 'SNOW', 'ZM',
      'SHOP', 'SQ', 'ROKU', 'SPOT', 'UBER', 'LYFT', 'DASH', 'ABNB', 'COIN', 'HOOD',
      
      // ETFs and indices
      'SPY', 'QQQ', 'IWM', 'VTI', 'VOO', 'ARKK', 'TQQQ', 'SQQQ', 'UVXY', 'VIXY',
      
      // Financial stocks
      'JPM', 'BAC', 'WFC', 'GS', 'MS', 'C', 'USB', 'PNC', 'COF', 'AXP',
      
      // Healthcare
      'JNJ', 'PFE', 'UNH', 'ABBV', 'MRK', 'TMO', 'DHR', 'ABT', 'BMY', 'AMGN',
      
      // Consumer
      'HD', 'LOW', 'WMT', 'TGT', 'COST', 'SBUX', 'NKE', 'MCD', 'DIS', 'NFLX',
      
      // Energy
      'XOM', 'CVX', 'COP', 'EOG', 'SLB', 'PSX', 'VLO', 'MPC', 'HAL', 'BKR',
      
      // Industrial
      'CAT', 'DE', 'BA', 'LMT', 'RTX', 'GE', 'MMM', 'HON', 'UPS', 'FDX',
      
      // More tech
      'ZM', 'DOCU', 'CRWD', 'OKTA', 'TEAM', 'WDAY', 'VEEV', 'NOW', 'SERV', 'ESTC'
    ];

    const tickerScores = [];

    // Scan each candidate symbol for dark pool activity
    for (const symbol of candidateSymbols) {
      try {
        const darkPoolData = await getDarkPoolData(symbol, date, apiKey);
        
        if (darkPoolData && darkPoolData.darkPoolVolume > 0) {
          tickerScores.push({
            symbol: symbol,
            darkPoolVolume: darkPoolData.darkPoolVolume,
            totalVolume: darkPoolData.totalVolume,
            darkPoolRatio: (darkPoolData.darkPoolVolume / darkPoolData.totalVolume) * 100
          });
        }
        
        // Add small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 50));
        
      } catch (error) {
        console.log(`Error scanning ${symbol}:`, error.message);
        continue;
      }
    }

    // Sort by dark pool volume and take top 25
    const topTickers = tickerScores
      .sort((a, b) => b.darkPoolVolume - a.darkPoolVolume)
      .slice(0, 25)
      .map(item => item.symbol);

    console.log(`Found top 25 tickers by dark pool activity: ${topTickers.join(', ')}`);
    
    return topTickers;
  } catch (error) {
    console.error('Error getting top tickers:', error);
    // Fallback to a smaller list if scanning fails
    return ['AAPL', 'TSLA', 'NVDA', 'SPY', 'QQQ', 'AMZN', 'MSFT', 'GOOGL', 'META', 'AMD'];
  }
}

async function getDarkPoolData(symbol, date, apiKey) {
  try {
    // Get today's trades
    const response = await fetch(
      `https://api.polygon.io/v3/trades/${symbol}?date=${date}&limit=1000&apiKey=${apiKey}`
    );
    
    if (!response.ok) {
      console.log(`Failed to get trades for ${symbol} on ${date}: ${response.status}`);
      return null;
    }
    
    const data = await response.json();
    if (!data.results || !Array.isArray(data.results)) {
      console.log(`No trade data for ${symbol} on ${date}`);
      return null;
    }

    // Filter dark pool trades (exchange = 4 AND trf_id present)
    const darkPoolTrades = data.results.filter(trade => 
      trade && typeof trade === 'object' && 
      trade.exchange === 4 && 
      trade.trf_id !== undefined
    );

    const totalVolume = data.results.reduce((sum, trade) => sum + (trade.size || 0), 0);
    const darkPoolVolume = darkPoolTrades.reduce((sum, trade) => sum + (trade.size || 0), 0);

    console.log(`${symbol} today: Total trades=${data.results.length}, Dark pool trades=${darkPoolTrades.length}, Total volume=${totalVolume.toLocaleString()}, Dark pool volume=${darkPoolVolume.toLocaleString()}`);

    return {
      totalVolume,
      darkPoolVolume,
      darkPoolTrades: darkPoolTrades.length,
      totalTrades: data.results.length
    };
  } catch (error) {
    console.error(`Error getting dark pool data for ${symbol}:`, error);
    return null;
  }
}

async function getHistoricalDarkPoolData(symbol, currentDate, apiKey) {
  try {
    // Get 90 days of historical data with more comprehensive sampling
    const startDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const endDate = new Date(currentDate);
    
    let totalDarkPoolVolume = 0;
    let totalVolume = 0;
    let daysWithData = 0;
    let sampleDays = 0;
    let successfulDays = 0;

    // Sample every 7 days to get ~13 data points over 90 days (more reliable)
    // Exclude today from historical calculation
    for (let d = new Date(startDate); d < endDate; d.setDate(d.getDate() + 7)) {
      const dateStr = d.toISOString().split('T')[0];
      
      // Skip if this is today's date
      if (dateStr === currentDate) {
        console.log(`Skipping today's date ${dateStr} for historical calculation`);
        continue;
      }
      
      sampleDays++;
      
      try {
        // Add a delay to avoid rate limiting
        if (sampleDays > 1) {
          await new Promise(resolve => setTimeout(resolve, 200));
        }

        console.log(`Fetching historical data for ${symbol} on ${dateStr}...`);
        const response = await fetch(
          `https://api.polygon.io/v3/trades/${symbol}?date=${dateStr}&limit=1000&apiKey=${apiKey}`
        );
        
        if (response.ok) {
          const data = await response.json();
          if (data.results && Array.isArray(data.results) && data.results.length > 0) {
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
              successfulDays++;
              console.log(`${symbol} ${dateStr}: Total=${dayVolume.toLocaleString()}, Dark Pool=${dayDarkPoolVolume.toLocaleString()}`);
            } else {
              console.log(`${symbol} ${dateStr}: No volume data`);
            }
          } else {
            console.log(`${symbol} ${dateStr}: No trade results`);
          }
        } else {
          console.log(`${symbol} ${dateStr}: API error ${response.status}`);
        }
      } catch (error) {
        console.log(`Error getting historical data for ${symbol} on ${dateStr}:`, error.message);
        continue;
      }
    }

    console.log(`Historical analysis for ${symbol}: ${successfulDays} successful days with data out of ${sampleDays} sampled days`);
    console.log(`Date range: ${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]} (excluding today)`);

    if (daysWithData === 0) {
      console.log(`${symbol}: No historical data available`);
      return {
        avgDailyDarkPoolVolume: null,
        avgDailyTotalVolume: null
      };
    }

    // Calculate average daily volumes
    const avgDailyDarkPoolVolume = totalDarkPoolVolume / daysWithData;
    const avgDailyTotalVolume = totalVolume / daysWithData;

    console.log(`${symbol} 90-day averages: Dark Pool ${avgDailyDarkPoolVolume.toLocaleString()}, Total ${avgDailyTotalVolume.toLocaleString()}`);
    console.log(`${symbol} Today's data will be compared against this 90-day average`);

    return {
      avgDailyDarkPoolVolume: avgDailyDarkPoolVolume,
      avgDailyTotalVolume: avgDailyTotalVolume
    };
  } catch (error) {
    console.error(`Error getting historical dark pool data for ${symbol}:`, error);
    return {
      avgDailyDarkPoolVolume: null,
      avgDailyTotalVolume: null
    };
  }
}
