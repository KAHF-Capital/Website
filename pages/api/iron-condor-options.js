import { getIronCondorOptions } from '../../lib/polygon-data-service.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { ticker, expiration, wingWidth } = req.query;

  if (!ticker || !expiration) {
    return res.status(400).json({ error: 'Ticker and expiration date are required' });
  }

  if (!process.env.POLYGON_API_KEY) {
    return res.status(500).json({ error: 'Polygon API key not configured' });
  }

  try {
    // Use the data service to get real options data
    const ironCondorData = await getIronCondorOptions(ticker, expiration, parseInt(wingWidth) || 10);

    // Calculate days to expiration
    const expirationDate = new Date(ironCondorData.expiration);
    const currentDate = new Date();
    const daysToExpiration = Math.ceil((expirationDate - currentDate) / (1000 * 60 * 60 * 24));

    return res.status(200).json({
      ...ironCondorData,
      daysToExpiration,
      executionDate: new Date().toISOString().split('T')[0]
    });

  } catch (error) {
    console.error('Error fetching iron condor options:', error);
    
    // Provide more specific error messages
    let errorMessage = 'Failed to fetch iron condor options';
    if (error.message.includes('No options contracts found')) {
      errorMessage = 'No options contracts found for this ticker. Please verify the ticker symbol.';
    } else if (error.message.includes('No valid expiration dates')) {
      errorMessage = 'No valid expiration dates found. Please try a different date.';
    } else if (error.message.includes('Stock price not available')) {
      errorMessage = 'Unable to fetch current stock price. Please verify the ticker symbol.';
    } else if (error.message.includes('Missing contracts')) {
      errorMessage = error.message;
    } else if (error.message.includes('Invalid stock price data')) {
      errorMessage = 'Invalid stock price data received from Polygon API.';
    }
    
    return res.status(500).json({ 
      error: errorMessage,
      details: error.message 
    });
  }
}

