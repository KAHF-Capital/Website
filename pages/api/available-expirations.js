const POLYGON_API_KEY = process.env.POLYGON_API_KEY;

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { ticker } = req.query;

  if (!ticker) {
    return res.status(400).json({ error: 'Ticker is required' });
  }

  if (!POLYGON_API_KEY) {
    return res.status(500).json({ error: 'Polygon API key not configured' });
  }

  try {
    // Get all available options contracts for this ticker
    const response = await fetch(
      `https://api.polygon.io/v3/reference/options/contracts?underlying_ticker=${ticker}&limit=1000&apiKey=${POLYGON_API_KEY}`
    );

    if (!response.ok) {
      throw new Error('Failed to fetch options contracts');
    }

    const data = await response.json();
    const contracts = data.results || [];

    if (contracts.length === 0) {
      return res.status(200).json({ expirations: [] });
    }

    // Extract unique expiration dates and sort them
    const expirations = [...new Set(contracts.map(c => c.expiration_date))]
      .filter(date => date) // Remove any null/undefined dates
      .sort((a, b) => new Date(a) - new Date(b));

    return res.status(200).json({
      ticker,
      expirations,
      totalContracts: contracts.length
    });

  } catch (error) {
    console.error('Error fetching available expirations:', error);
    return res.status(500).json({ 
      error: 'Failed to fetch available expirations',
      details: error.message 
    });
  }
}
