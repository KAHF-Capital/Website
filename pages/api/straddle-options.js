import { getStraddleOptions } from '../../lib/polygon-data-service.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { ticker, expiration } = req.query;

  if (!ticker || !expiration) {
    return res.status(400).json({ error: 'Ticker and expiration date are required' });
  }

  if (!process.env.POLYGON_API_KEY) {
    return res.status(500).json({ error: 'Polygon API key not configured' });
  }

  try {
    // Use the data service to get real options data
    const straddleData = await getStraddleOptions(ticker, expiration);

    // Calculate days to expiration
    const expirationDate = new Date(straddleData.expiration);
    const currentDate = new Date();
    const daysToExpiration = Math.ceil((expirationDate - currentDate) / (1000 * 60 * 60 * 24));

    return res.status(200).json({
      ...straddleData,
      daysToExpiration,
      executionDate: new Date().toISOString().split('T')[0]
    });

  } catch (error) {
    console.error('Error fetching straddle options:', error);
    
    // Provide more specific error messages
    let errorMessage = 'Failed to fetch straddle options';
    if (error.message.includes('No options contracts found')) {
      errorMessage = 'No options contracts found for this ticker. Please verify the ticker symbol.';
    } else if (error.message.includes('No valid expiration dates')) {
      errorMessage = 'No valid expiration dates found. Please try a different date.';
    } else if (error.message.includes('Stock price not available')) {
      errorMessage = 'Unable to fetch current stock price. Please verify the ticker symbol.';
    } else if (error.message.includes('No matching call and put contracts')) {
      errorMessage = 'No matching call and put contracts found for this expiration date.';
    } else if (error.message.includes('Invalid stock price data')) {
      errorMessage = 'Invalid stock price data received from Polygon API.';
    }
    
    return res.status(500).json({ 
      error: errorMessage,
      details: error.message 
    });
  }
}
