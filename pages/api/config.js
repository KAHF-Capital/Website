export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    return res.status(200).json({
      dark_pool_exchange_id: 4,
      activity_threshold: 300,
      lookback_days: 90,
      volatility_threshold: 0.1,
      websocket_url: 'wss://socket.polygon.io/stocks',
      rest_api_url: 'https://api.polygon.io',
      version: '1.0.0'
    });

  } catch (error) {
    console.error('Config error:', error);
    return res.status(500).json({ error: 'Failed to get config' });
  }
}
