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

// ------------------------
// Helpers
// ------------------------

function toStartOfDayUtcNs(date) {
  const d = new Date(date + 'T00:00:00.000Z');
  return d.getTime() * 1_000_000; // ms -> ns
}

function toEndOfDayUtcNs(date) {
  const d = new Date(date + 'T23:59:59.999Z');
  return d.getTime() * 1_000_000; // ms -> ns
}

function nsToIso(tsNs) {
  if (!tsNs) return new Date().toISOString();
  const ms = Math.floor(Number(tsNs) / 1_000_000);
  return new Date(ms).toISOString();
}

async function fetchAllTradesPaginated(url, apiKey) {
  let nextUrl = url.includes('apiKey=') ? url : `${url}&apiKey=${apiKey}`;
  const all = [];
  let safety = 0;
  while (nextUrl && safety < 50) {
    const resp = await fetch(nextUrl, { headers: { 'Accept': 'application/json' } });
    if (!resp.ok) {
      console.log('fetchAllTradesPaginated failed', resp.status, resp.statusText);
      break;
    }
    const data = await resp.json();
    if (Array.isArray(data.results)) all.push(...data.results);
    nextUrl = data.next_url || null;
    safety++;
  }
  return all;
}

// ------------------------
// Historical (7-day) enrichment
// ------------------------

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
    const start = new Date();
    start.setDate(start.getDate() - 7);
    const startNs = toStartOfDayUtcNs(start.toISOString().split('T')[0]);
    const endNs = toEndOfDayUtcNs(endDate.toISOString().split('T')[0]);

    const baseUrl = `https://api.polygon.io/v3/trades/${ticker}?timestamp.gte=${startNs}&timestamp.lte=${endNs}&limit=50000&sort=timestamp&order=asc`;
    const results = await fetchAllTradesPaginated(baseUrl, apiKey);

    console.log(`${ticker}: historical results count: ${results.length}`);
    if (results.length === 0) {
      return { avgVolume: 0, avgTrades: 0 };
    }

    // Filter dark pool trades (exchange:4 AND trf_id)
    const darkPoolTrades = results.filter(trade => 
      trade && typeof trade === 'object' && 
      trade.exchange === 4 && 
      trade.trf_id !== undefined
    );

    console.log(`${ticker}: dark pool trades in 7d: ${darkPoolTrades.length}`);

    const dailyData = {};
    for (const trade of darkPoolTrades) {
      const ts = trade.trf_timestamp || trade.participant_timestamp || trade.sip_timestamp;
      const iso = nsToIso(ts);
      const day = iso.split('T')[0];
      if (!dailyData[day]) dailyData[day] = { volume: 0, trades: 0 };
      dailyData[day].volume += Number(trade.size || 0);
      dailyData[day].trades += 1;
    }

    const days = Object.keys(dailyData).length;
    if (days === 0) return { avgVolume: 0, avgTrades: 0 };

    const totalVolume = Object.values(dailyData).reduce((sum, d) => sum + d.volume, 0);
    const totalTrades = Object.values(dailyData).reduce((sum, d) => sum + d.trades, 0);

    return {
      avgVolume: Math.round(totalVolume / days),
      avgTrades: Math.round(totalTrades / days)
    };
    
  } catch (error) {
    console.error(`Error fetching 7-day historical data for ${ticker}:`, error);
    return { avgVolume: 0, avgTrades: 0 };
  }
}

// ------------------------
// Daily analysis (today)
// ------------------------

async function performFullDarkPoolAnalysis(date, apiKey) {
  console.log('Starting full dark pool analysis...');
  
  const activeTickers = await getMostActiveTickers(date, apiKey);
  console.log(`Found ${activeTickers.length} active tickers for analysis`);
  
  const allDarkPoolTrades = [];
  for (const ticker of activeTickers) {
    try {
      const trades = await getDarkPoolTradesForTicker(ticker, date, apiKey);
      allDarkPoolTrades.push(...trades);
      await new Promise(resolve => setTimeout(resolve, 150));
    } catch (error) {
      console.error(`Error analyzing ${ticker}:`, error);
    }
  }
  
  const tickerSummary = {};
  for (const trade of allDarkPoolTrades) {
    if (!tickerSummary[trade.ticker]) {
      tickerSummary[trade.ticker] = {
        ticker: trade.ticker,
        total_volume: 0,
        trade_count: 0,
        first_trade: null,
        last_trade: null
      };
    }
    const entry = tickerSummary[trade.ticker];
    entry.total_volume += trade.volume;
    entry.trade_count += 1;
    if (!entry.first_trade || new Date(trade.timestamp) < new Date(entry.first_trade)) entry.first_trade = trade.timestamp;
    if (!entry.last_trade || new Date(trade.timestamp) > new Date(entry.last_trade)) entry.last_trade = trade.timestamp;
  }
  
  const results = Object.values(tickerSummary)
    .sort((a, b) => b.total_volume - a.total_volume)
    .slice(0, 50);
  
  return {
    trades: results,
    last_updated: new Date().toISOString()
  };
}

async function getMostActiveTickers(date, apiKey) {
  try {
    // Use grouped aggregates to find most active tickers by volume for today
    const url = `https://api.polygon.io/v2/aggs/grouped/locale/us/market/stocks/${date}?adjusted=true&include_otc=false&apiKey=${apiKey}`;
    const resp = await fetch(url, { headers: { 'Accept': 'application/json' } });
    if (!resp.ok) {
      console.log('getMostActiveTickers failed', resp.status, resp.statusText);
      return getFallbackTickers();
    }
    const data = await resp.json();
    if (!Array.isArray(data.results)) return getFallbackTickers();
    const sorted = data.results
      .filter(r => r && r.T)
      .sort((a, b) => (b.v || 0) - (a.v || 0))
      .slice(0, 120) // take top 120, we will later cap to 50 display
      .map(r => r.T);
    return sorted.length ? sorted : getFallbackTickers();
  } catch (e) {
    console.error('getMostActiveTickers error', e);
    return getFallbackTickers();
  }
}

function getFallbackTickers() {
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
    const startNs = toStartOfDayUtcNs(date);
    const endNs = toEndOfDayUtcNs(date);

    const baseUrl = `https://api.polygon.io/v3/trades/${ticker}?timestamp.gte=${startNs}&timestamp.lte=${endNs}&limit=50000&sort=timestamp&order=asc`;
    const results = await fetchAllTradesPaginated(baseUrl, apiKey);

    if (!Array.isArray(results) || results.length === 0) return [];

    // Filter dark pool trades (exchange:4 AND trf_id present)
    const darkPoolTrades = results.filter(trade => 
      trade && typeof trade === 'object' && 
      trade.exchange === 4 && 
      trade.trf_id !== undefined
    );

    return darkPoolTrades.map(trade => ({
      ticker: ticker.toUpperCase(),
      exchange_id: trade.exchange,
      trf_id: trade.trf_id,
      volume: Number(trade.size || 0),
      price: Number(trade.price || 0),
      timestamp: nsToIso(trade.trf_timestamp || trade.participant_timestamp || trade.sip_timestamp),
      trade_date: date
    }));
    
  } catch (error) {
    console.error(`Error fetching dark pool trades for ${ticker}:`, error);
    return [];
  }
}

