export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { symbol = 'AAPL', days = 90 } = req.query;
    const apiKey = process.env.POLYGON_API_KEY;

    // Check if API key is properly configured
    if (!apiKey || apiKey === 'YOUR_POLYGON_API_KEY_HERE') {
      return res.status(503).json({ 
        error: 'Historical data service is currently unavailable. Please try again later.',
        details: 'Service temporarily unavailable'
      });
    }

    // Calculate date range for historical data
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(endDate.getDate() - parseInt(days));
    
    const startDateStr = startDate.toISOString().split('T')[0];
    const endDateStr = endDate.toISOString().split('T')[0];

    // Fetch historical trades from Polygon.io
    const response = await fetch(
      `https://api.polygon.io/v3/trades/${symbol}?date=${startDateStr}&limit=50000&apiKey=${apiKey}`
    );

    if (!response.ok) {
      throw new Error(`Polygon API error: ${response.status}`);
    }

    const data = await response.json();
    
    if (!data.results) {
      return res.status(200).json({ 
        historical_trades: [],
        dark_pool_summary: {
          total_days: 0,
          avg_daily_dark_pool_trades: 0,
          avg_daily_dark_pool_volume: 0,
          total_dark_pool_trades: 0,
          total_dark_pool_volume: 0
        }
      });
    }

    // Group trades by date and identify dark pool activity
    const tradesByDate = {};
    
    data.results.forEach(trade => {
      const tradeDate = new Date(trade.sip_timestamp).toISOString().split('T')[0];
      
      if (!tradesByDate[tradeDate]) {
        tradesByDate[tradeDate] = {
          total_trades: 0,
          total_volume: 0,
          dark_pool_trades: 0,
          dark_pool_volume: 0
        };
      }
      
      tradesByDate[tradeDate].total_trades++;
      tradesByDate[tradeDate].total_volume += trade.size;
      
      // Check if this is a dark pool trade (exchange = 4 AND trf_id present)
      if (trade.exchange === 4 && trade.trf_id !== undefined) {
        tradesByDate[tradeDate].dark_pool_trades++;
        tradesByDate[tradeDate].dark_pool_volume += trade.size;
      }
    });

    // Calculate historical averages
    const dates = Object.keys(tradesByDate);
    const totalDays = dates.length;
    
    const totalDarkPoolTrades = dates.reduce((sum, date) => 
      sum + tradesByDate[date].dark_pool_trades, 0
    );
    
    const totalDarkPoolVolume = dates.reduce((sum, date) => 
      sum + tradesByDate[date].dark_pool_volume, 0
    );

    const avgDailyDarkPoolTrades = totalDays > 0 ? totalDarkPoolTrades / totalDays : 0;
    const avgDailyDarkPoolVolume = totalDays > 0 ? totalDarkPoolVolume / totalDays : 0;

    return res.status(200).json({
      symbol: symbol.toUpperCase(),
      date_range: {
        start: startDateStr,
        end: endDateStr,
        days: totalDays
      },
      historical_trades: tradesByDate,
      dark_pool_summary: {
        total_days: totalDays,
        avg_daily_dark_pool_trades: avgDailyDarkPoolTrades,
        avg_daily_dark_pool_volume: avgDailyDarkPoolVolume,
        total_dark_pool_trades: totalDarkPoolTrades,
        total_dark_pool_volume: totalDarkPoolVolume
      }
    });

  } catch (error) {
    console.error('Error fetching historical trades:', error);
    return res.status(500).json({ 
      error: 'Unable to fetch historical data at this time. Please try again later.',
      details: 'Service temporarily unavailable'
    });
  }
}
