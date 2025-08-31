export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const apiKey = process.env.POLYGON_API_KEY;
    const hasApiKey = apiKey && 
                     apiKey !== 'YOUR_POLYGON_API_KEY_HERE' && 
                     apiKey !== 'your_polygon_api_key_here';

    return res.status(200).json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development',
      hasApiKey: hasApiKey,
      apiKeyConfigured: !!apiKey,
      version: '1.1.0'
    });
  } catch (error) {
    console.error('Health check error:', error);
    return res.status(500).json({
      status: 'unhealthy',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
}
