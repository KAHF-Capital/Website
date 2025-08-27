export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { symbol = 'AAPL', limit = 1000 } = req.query;
    const apiKey = process.env.POLYGON_API_KEY;

    if (!apiKey || apiKey === 'YOUR_POLYGON_API_KEY_HERE') {
      return res.status(400).json({ 
        error: 'Polygon.io API key not configured. Please add your API key to .env.local' 
      });
    }

    // Get today's date in YYYY-MM-DD format
    const today = new Date().toISOString().split('T')[0];
    
    // Fetch trades from Polygon.io REST API
    const response = await fetch(
      `https://api.polygon.io/v3/trades/${symbol}?date=${today}&limit=${limit}&apiKey=${apiKey}`
    );

    if (!response.ok) {
      throw new Error(`Polygon API error: ${response.status}`);
    }

    const data = await response.json();
    
    if (!data.results) {
      return res.status(200).json({ 
        trades: [], 
        dark_pool_trades: [],
        message: 'No trades found for today' 
      });
    }

    // Identify dark pool trades based on Polygon.io documentation
    // Dark pool trades have exchange ID = 4 AND trf_id field present
    const darkPoolTrades = data.results.filter(trade => 
      trade.exchange === 4 && trade.trf_id !== undefined
    );

    // Calculate dark pool activity metrics
    const totalTrades = data.results.length;
    const darkPoolCount = darkPoolTrades.length;
    const darkPoolVolume = darkPoolTrades.reduce((sum, trade) => sum + trade.size, 0);
    const totalVolume = data.results.reduce((sum, trade) => sum + trade.size, 0);
    const darkPoolPercentage = totalVolume > 0 ? (darkPoolVolume / totalVolume) * 100 : 0;

    return res.status(200).json({
      symbol: symbol.toUpperCase(),
      date: today,
      total_trades: totalTrades,
      total_volume: totalVolume,
      dark_pool_trades: darkPoolTrades,
      dark_pool_metrics: {
        count: darkPoolCount,
        volume: darkPoolVolume,
        percentage_of_total: darkPoolPercentage,
        activity_ratio: totalTrades > 0 ? darkPoolCount / totalTrades : 0
      },
      all_trades: data.results.slice(0, 50) // Return first 50 trades for analysis
    });

  } catch (error) {
    console.error('Error fetching trades:', error);
    return res.status(500).json({ 
      error: 'Failed to fetch trades',
      details: error.message 
    });
  }
}
