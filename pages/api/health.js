export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const apiKey = process.env.POLYGON_API_KEY;
    const hasApiKey = apiKey && apiKey !== 'YOUR_POLYGON_API_KEY_HERE' && apiKey !== 'your_polygon_api_key_here';
    
    return res.status(200).json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      api_configured: hasApiKey,
      environment: process.env.NODE_ENV || 'development',
      services: {
        opportunities: hasApiKey ? 'available' : 'unavailable',
        analytics: hasApiKey ? 'available' : 'unavailable',
        trades: hasApiKey ? 'available' : 'unavailable'
      }
    });

  } catch (error) {
    console.error('Health check error:', error);
    return res.status(500).json({ 
      status: 'unhealthy',
      error: 'Service health check failed',
      timestamp: new Date().toISOString()
    });
  }
}
