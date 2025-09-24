import fetch from 'node-fetch';

const POLYGON_API_KEY = process.env.POLYGON_API_KEY;

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { ticker } = req.query;

  if (!ticker) {
    return res.status(400).json({ error: 'Ticker symbol is required' });
  }

  if (!POLYGON_API_KEY) {
    return res.status(500).json({ error: 'Polygon API key not configured' });
  }

  try {
    // Get current price and previous close
    const [currentResponse, previousResponse] = await Promise.all([
      fetch(`https://api.polygon.io/v1/last/trade/${ticker}?apikey=${POLYGON_API_KEY}`),
      fetch(`https://api.polygon.io/v2/aggs/ticker/${ticker}/prev?adjusted=true&apiKey=${POLYGON_API_KEY}`)
    ]);

    if (!currentResponse.ok || !previousResponse.ok) {
      throw new Error('Failed to fetch stock data');
    }

    const [currentData, previousData] = await Promise.all([
      currentResponse.json(),
      previousResponse.json()
    ]);

    const currentPrice = currentData.results?.p || 0;
    const previousClose = previousData.results?.[0]?.c || 0;

    if (!currentPrice || !previousClose) {
      return res.status(404).json({ error: 'Stock data not found' });
    }

    const change = currentPrice - previousClose;
    const changePercent = (change / previousClose) * 100;

    res.status(200).json({
      ticker: ticker.toUpperCase(),
      currentPrice,
      previousClose,
      change,
      changePercent
    });

  } catch (error) {
    console.error('Error fetching stock price change:', error);
    res.status(500).json({ error: 'Failed to fetch stock price change' });
  }
}
