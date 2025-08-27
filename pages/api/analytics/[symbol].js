export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { symbol } = req.query;

    if (!symbol) {
      return res.status(400).json({ error: 'Symbol is required' });
    }

    // Mock analytics data
    const mockAnalytics = {
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
        conditions: []
      }))
    };

    return res.status(200).json(mockAnalytics);

  } catch (error) {
    console.error('Error getting stock analytics:', error);
    return res.status(500).json({ error: 'Failed to get stock analytics' });
  }
}
