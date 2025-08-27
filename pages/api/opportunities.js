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
    
    // Filter active opportunities (not expired)
    const activeOpportunities = mockOpportunities.filter(opp => 
      new Date(opp.expires_at) > new Date()
    );

    // Apply limit
    const limitedOpportunities = activeOpportunities.slice(0, parseInt(limit));

    return res.status(200).json(limitedOpportunities);

  } catch (error) {
    console.error('Error getting opportunities:', error);
    return res.status(500).json({ error: 'Failed to get opportunities' });
  }
}
