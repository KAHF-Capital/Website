export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { symbol } = req.query;
    const apiKey = process.env.POLYGON_API_KEY;

    if (!symbol) {
      return res.status(400).json({ error: 'Symbol is required' });
    }

    // If no API key, return mock data
    if (!apiKey || apiKey === 'YOUR_POLYGON_API_KEY_HERE') {
      return res.status(200).json(getMockAnalytics(symbol));
    }

    const today = new Date().toISOString().split('T')[0];
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    // Fetch current day trades
    const currentResponse = await fetch(
      `https://api.polygon.io/v3/trades/${symbol}?date=${today}&limit=50000&apiKey=${apiKey}`
    );

    if (!currentResponse.ok) {
      throw new Error(`Polygon API error: ${currentResponse.status}`);
    }

    const currentData = await currentResponse.json();
    
    // Fetch historical trades (90 days ago)
    const historicalResponse = await fetch(
      `https://api.polygon.io/v3/trades/${symbol}?date=${ninetyDaysAgo}&limit=50000&apiKey=${apiKey}`
    );

    if (!historicalResponse.ok) {
      throw new Error(`Polygon API error: ${historicalResponse.status}`);
    }

    const historicalData = await historicalResponse.json();

    // Analyze dark pool activity
    const analytics = analyzeDarkPoolActivity(symbol, currentData.results || [], historicalData.results || []);

    return res.status(200).json(analytics);

  } catch (error) {
    console.error('Error getting stock analytics:', error);
    // Fallback to mock data
    return res.status(200).json(getMockAnalytics(req.query.symbol));
  }
}

function analyzeDarkPoolActivity(symbol, currentTrades, historicalTrades) {
  // Identify dark pool trades (exchange = 4 AND trf_id present)
  const currentDarkPoolTrades = currentTrades.filter(trade => 
    trade.exchange === 4 && trade.trf_id !== undefined
  );
  
  const historicalDarkPoolTrades = historicalTrades.filter(trade => 
    trade.exchange === 4 && trade.trf_id !== undefined
  );

  // Calculate current activity metrics
  const currentTotalVolume = currentTrades.reduce((sum, trade) => sum + trade.size, 0);
  const currentDarkPoolVolume = currentDarkPoolTrades.reduce((sum, trade) => sum + trade.size, 0);
  const currentAvgPrice = currentTrades.length > 0 ? 
    currentTrades.reduce((sum, trade) => sum + trade.price, 0) / currentTrades.length : 0;
  const currentDarkPoolRatio = currentTotalVolume > 0 ? currentDarkPoolVolume / currentTotalVolume : 0;

  // Calculate historical activity metrics
  const historicalTotalVolume = historicalTrades.reduce((sum, trade) => sum + trade.size, 0);
  const historicalDarkPoolVolume = historicalDarkPoolTrades.reduce((sum, trade) => sum + trade.size, 0);
  const historicalDarkPoolRatio = historicalTotalVolume > 0 ? historicalDarkPoolVolume / historicalTotalVolume : 0;

  // Calculate activity ratio (current vs historical)
  const activityRatio = historicalDarkPoolRatio > 0 ? currentDarkPoolRatio / historicalDarkPoolRatio : 0;

  // Determine if this is an opportunity
  const isOpportunity = activityRatio >= 3.0 && currentTotalVolume > 100000;
  const opportunityScore = isOpportunity ? Math.min(100, Math.floor(activityRatio * 20)) : 0;

  // Get recent trades for display
  const recentTrades = currentTrades.slice(0, 10).map(trade => ({
    price: trade.price,
    size: trade.size,
    timestamp: new Date(trade.sip_timestamp).toISOString(),
    conditions: trade.conditions || [],
    is_dark_pool: trade.exchange === 4 && trade.trf_id !== undefined
  }));

  return {
    symbol: symbol.toUpperCase(),
    current_activity: {
      volume: currentTotalVolume,
      trades: currentTrades.length,
      avg_price: currentAvgPrice,
      activity_ratio: activityRatio,
      dark_pool_volume: currentDarkPoolVolume,
      dark_pool_trades: currentDarkPoolTrades.length,
      dark_pool_percentage: currentTotalVolume > 0 ? (currentDarkPoolVolume / currentTotalVolume) * 100 : 0
    },
    historical_activity: {
      volume: historicalTotalVolume,
      trades: historicalTrades.length,
      avg_price: historicalTrades.length > 0 ? 
        historicalTrades.reduce((sum, trade) => sum + trade.price, 0) / historicalTrades.length : 0,
      dark_pool_volume: historicalDarkPoolVolume,
      dark_pool_trades: historicalDarkPoolTrades.length,
      dark_pool_percentage: historicalTotalVolume > 0 ? (historicalDarkPoolVolume / historicalTotalVolume) * 100 : 0
    },
    volatility: {
      implied: 0.25 + (activityRatio - 1) * 0.1, // Mock implied volatility
      historical: 0.20 + (activityRatio - 1) * 0.05, // Mock realized volatility
      spread: (activityRatio - 1) * 0.05 // Volatility spread
    },
    is_opportunity: isOpportunity,
    opportunity_score: opportunityScore,
    last_updated: new Date().toISOString(),
    recent_trades: recentTrades,
    dark_pool_analysis: {
      current_ratio: currentDarkPoolRatio,
      historical_ratio: historicalDarkPoolRatio,
      activity_multiplier: activityRatio,
      threshold_met: activityRatio >= 3.0,
      volume_threshold_met: currentTotalVolume > 100000
    }
  };
}

function getMockAnalytics(symbol) {
  return {
    symbol: symbol.toUpperCase(),
    current_activity: {
      volume: Math.floor(Math.random() * 2000000) + 500000,
      trades: Math.floor(Math.random() * 100) + 20,
      avg_price: Math.floor(Math.random() * 200) + 50,
      activity_ratio: (Math.random() * 5) + 1
    },
    historical_activity: {
      volume: Math.floor(Math.random() * 5000000) + 1000000,
      trades: Math.floor(Math.random() * 500) + 100,
      avg_price: Math.floor(Math.random() * 200) + 50
    },
    volatility: {
      implied: (Math.random() * 0.5) + 0.1,
      historical: (Math.random() * 0.5) + 0.1,
      spread: (Math.random() * 0.2) - 0.1
    },
    is_opportunity: Math.random() > 0.5,
    opportunity_score: Math.floor(Math.random() * 100) + 50,
    last_updated: new Date().toISOString(),
    recent_trades: Array.from({ length: 10 }, (_, i) => ({
      price: Math.floor(Math.random() * 200) + 50,
      size: Math.floor(Math.random() * 10000) + 1000,
      timestamp: new Date(Date.now() - i * 60000).toISOString(),
      conditions: [],
      is_dark_pool: Math.random() > 0.7
    }))
  };
}
