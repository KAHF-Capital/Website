// Mock data for trading opportunities
const mockOpportunities = [
  {
    id: 1,
    symbol: "AAPL",
    strategy_type: "Long Volatility Play",
    vol_spread: 4.2,
    implied_vol: 0.28,
    realized_vol: 0.235,
    expected_profit: 1250,
    confidence: 87,
    risk_level: "medium",
    dark_pool_activity_ratio: 3.2,
    created_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    metadata: {
      activity_ratio: 3.2,
      total_volume: 1500000,
      total_trades: 45
    }
  },
  {
    id: 2,
    symbol: "TSLA", 
    strategy_type: "Vol Crush Trade",
    vol_spread: -6.8,
    implied_vol: 0.65,
    realized_vol: 0.72,
    expected_profit: 2100,
    confidence: 92,
    risk_level: "high",
    dark_pool_activity_ratio: 4.1,
    created_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    metadata: {
      activity_ratio: 4.1,
      total_volume: 2200000,
      total_trades: 67
    }
  },
  {
    id: 3,
    symbol: "NVDA",
    strategy_type: "Long Straddle",
    vol_spread: 5.3,
    implied_vol: 0.42,
    realized_vol: 0.365,
    expected_profit: 1680,
    confidence: 85,
    risk_level: "medium",
    dark_pool_activity_ratio: 3.8,
    created_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    metadata: {
      activity_ratio: 3.8,
      total_volume: 1800000,
      total_trades: 52
    }
  },
  {
    id: 4,
    symbol: "SPY",
    strategy_type: "Calendar Spread",
    vol_spread: 2.1,
    implied_vol: 0.18,
    realized_vol: 0.16,
    expected_profit: 850,
    confidence: 78,
    risk_level: "low",
    dark_pool_activity_ratio: 2.9,
    created_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    metadata: {
      activity_ratio: 2.9,
      total_volume: 950000,
      total_trades: 28
    }
  },
  {
    id: 5,
    symbol: "QQQ",
    strategy_type: "Iron Condor",
    vol_spread: -3.2,
    implied_vol: 0.22,
    realized_vol: 0.255,
    expected_profit: 920,
    confidence: 81,
    risk_level: "low",
    dark_pool_activity_ratio: 2.7,
    created_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    metadata: {
      activity_ratio: 2.7,
      total_volume: 1100000,
      total_trades: 33
    }
  },
  {
    id: 6,
    symbol: "AMZN",
    strategy_type: "Volatility Spread",
    vol_spread: 3.7,
    implied_vol: 0.35,
    realized_vol: 0.315,
    expected_profit: 1425,
    confidence: 89,
    risk_level: "medium",
    dark_pool_activity_ratio: 3.5,
    created_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    metadata: {
      activity_ratio: 3.5,
      total_volume: 1650000,
      total_trades: 48
    }
  }
];

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { limit = 50 } = req.query;
    const apiKey = process.env.POLYGON_API_KEY;

    // If no API key, return mock data
    if (!apiKey || apiKey === 'YOUR_POLYGON_API_KEY_HERE') {
      return res.status(200).json(getMockOpportunities(limit));
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
        
        if (!currentTradesResponse.ok) continue;
        
        const currentTradesData = await currentTradesResponse.json();
        if (!currentTradesData.results) continue;

        // Get historical trades (last 90 days)
        const historicalResponse = await fetch(
          `https://api.polygon.io/v3/trades/${symbol}?date=${new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]}&limit=50000&apiKey=${apiKey}`
        );
        
        if (!historicalResponse.ok) continue;
        
        const historicalData = await historicalResponse.json();
        if (!historicalData.results) continue;

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
    // Fallback to mock data
    return res.status(200).json(getMockOpportunities(limit));
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

function getMockOpportunities(limit) {
  const mockOpportunities = [
    {
      id: 1,
      symbol: "AAPL",
      strategy_type: "Long Volatility Play",
      vol_spread: 4.2,
      implied_vol: 0.28,
      realized_vol: 0.235,
      expected_profit: 1250,
      confidence: 87,
      risk_level: "medium",
      dark_pool_activity_ratio: 3.2,
      created_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      metadata: {
        activity_ratio: 3.2,
        total_volume: 1500000,
        total_trades: 45
      }
    },
    {
      id: 2,
      symbol: "TSLA", 
      strategy_type: "Vol Crush Trade",
      vol_spread: -6.8,
      implied_vol: 0.65,
      realized_vol: 0.72,
      expected_profit: 2100,
      confidence: 92,
      risk_level: "high",
      dark_pool_activity_ratio: 4.1,
      created_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      metadata: {
        activity_ratio: 4.1,
        total_volume: 2200000,
        total_trades: 67
      }
    },
    {
      id: 3,
      symbol: "NVDA",
      strategy_type: "Long Straddle",
      vol_spread: 5.3,
      implied_vol: 0.42,
      realized_vol: 0.365,
      expected_profit: 1680,
      confidence: 85,
      risk_level: "medium",
      dark_pool_activity_ratio: 3.8,
      created_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      metadata: {
        activity_ratio: 3.8,
        total_volume: 1800000,
        total_trades: 52
      }
    }
  ];

  return mockOpportunities.slice(0, parseInt(limit));
}
