export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { limit = 50 } = req.query;
    const apiKey = process.env.POLYGON_API_KEY;

    // Check if API key is configured
    if (!apiKey || apiKey === 'YOUR_POLYGON_API_KEY_HERE') {
      return res.status(400).json({ 
        error: 'Polygon.io API key not configured. Please add your API key to .env.local' 
      });
    }

    // List of stocks to analyze for opportunities
    const symbols = ['AAPL', 'TSLA', 'NVDA', 'SPY', 'QQQ', 'AMZN', 'MSFT', 'GOOGL', 'META', 'AMD'];
    const opportunities = [];

    // Analyze each symbol for dark pool opportunities
    for (const symbol of symbols) {
      try {
        // Get current day trades
        const currentTradesResponse = await fetch(
          `https://api.polygon.io/v3/trades/${symbol}?date=${new Date().toISOString().split('T')[0]}&limit=1000&apiKey=${apiKey}`
        );
        
        if (!currentTradesResponse.ok) {
          console.error(`Failed to fetch current trades for ${symbol}: ${currentTradesResponse.status}`);
          continue;
        }
        
        const currentTradesData = await currentTradesResponse.json();
        if (!currentTradesData.results) {
          console.error(`No results for current trades for ${symbol}`);
          continue;
        }

        // Get historical trades (last 90 days)
        const historicalResponse = await fetch(
          `https://api.polygon.io/v3/trades/${symbol}?date=${new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]}&limit=50000&apiKey=${apiKey}`
        );
        
        if (!historicalResponse.ok) {
          console.error(`Failed to fetch historical trades for ${symbol}: ${historicalResponse.status}`);
          continue;
        }
        
        const historicalData = await historicalResponse.json();
        if (!historicalData.results) {
          console.error(`No results for historical trades for ${symbol}`);
          continue;
        }

        // Analyze dark pool activity
        const opportunity = analyzeDarkPoolOpportunity(symbol, currentTradesData.results, historicalData.results);
        
        if (opportunity) {
          opportunities.push(opportunity);
        }

      } catch (error) {
        console.error(`Error analyzing ${symbol}:`, error);
        continue;
      }
    }

    // Sort by opportunity score and apply limit
    const sortedOpportunities = opportunities
      .sort((a, b) => b.opportunity_score - a.opportunity_score)
      .slice(0, parseInt(limit));

    return res.status(200).json(sortedOpportunities);

  } catch (error) {
    console.error('Error getting opportunities:', error);
    return res.status(500).json({ 
      error: 'Failed to fetch trading opportunities',
      details: error.message 
    });
  }
}

function analyzeDarkPoolOpportunity(symbol, currentTrades, historicalTrades) {
  // Identify dark pool trades (exchange = 4 AND trf_id present)
  const currentDarkPoolTrades = currentTrades.filter(trade => 
    trade.exchange === 4 && trade.trf_id !== undefined
  );
  
  const historicalDarkPoolTrades = historicalTrades.filter(trade => 
    trade.exchange === 4 && trade.trf_id !== undefined
  );

  // Calculate current dark pool activity
  const currentDarkPoolVolume = currentDarkPoolTrades.reduce((sum, trade) => sum + trade.size, 0);
  const currentTotalVolume = currentTrades.reduce((sum, trade) => sum + trade.size, 0);
  const currentDarkPoolRatio = currentTotalVolume > 0 ? currentDarkPoolVolume / currentTotalVolume : 0;

  // Calculate historical dark pool activity (90-day average)
  const historicalDarkPoolVolume = historicalDarkPoolTrades.reduce((sum, trade) => sum + trade.size, 0);
  const historicalTotalVolume = historicalTrades.reduce((sum, trade) => sum + trade.size, 0);
  const historicalDarkPoolRatio = historicalTotalVolume > 0 ? historicalDarkPoolVolume / historicalTotalVolume : 0;

  // Calculate activity ratio (current vs historical)
  const activityRatio = historicalDarkPoolRatio > 0 ? currentDarkPoolRatio / historicalDarkPoolRatio : 0;

  // Check if this meets our opportunity criteria
  // 1. Dark pool activity > 300% of historical average
  // 2. Sufficient volume for analysis
  if (activityRatio >= 3.0 && currentTotalVolume > 100000) {
    // Calculate opportunity score based on activity ratio and volume
    const opportunityScore = Math.min(100, Math.floor(activityRatio * 20 + (currentTotalVolume / 1000000) * 10));
    
    // Determine strategy type based on activity level
    let strategyType = "Long Straddle";
    if (activityRatio >= 5.0) {
      strategyType = "Volatility Explosion Play";
    } else if (activityRatio >= 4.0) {
      strategyType = "Long Volatility Play";
    }

    // Calculate expected profit based on activity ratio and volume
    const baseProfit = 1000;
    const profitMultiplier = Math.min(3, activityRatio / 3);
    const expectedProfit = Math.floor(baseProfit * profitMultiplier);

    return {
      id: Date.now() + Math.random(),
      symbol: symbol,
      strategy_type: strategyType,
      vol_spread: (activityRatio - 1) * 100, // Convert to percentage
      implied_vol: 0.25 + (activityRatio - 1) * 0.1, // Mock implied volatility
      realized_vol: 0.20 + (activityRatio - 1) * 0.05, // Mock realized volatility
      expected_profit: expectedProfit,
      confidence: Math.min(95, Math.floor(opportunityScore)),
      risk_level: activityRatio >= 5.0 ? "high" : activityRatio >= 3.5 ? "medium" : "low",
      dark_pool_activity_ratio: activityRatio,
      created_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      metadata: {
        activity_ratio: activityRatio,
        total_volume: currentTotalVolume,
        total_trades: currentTrades.length,
        dark_pool_volume: currentDarkPoolVolume,
        dark_pool_trades: currentDarkPoolTrades.length,
        historical_avg_ratio: historicalDarkPoolRatio
      }
    };
  }

  return null;
}
