export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { ticker } = req.query;

  if (!ticker) {
    return res.status(400).json({ error: 'Ticker symbol is required' });
  }

  try {
    // Using Alpha Vantage API (free tier)
    const apiKey = process.env.ALPHA_VANTAGE_API_KEY || 'demo';
    const url = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${ticker}&apikey=${apiKey}`;
    
    const response = await fetch(url);
    const data = await response.json();

    if (data['Error Message']) {
      return res.status(400).json({ error: 'Invalid ticker symbol' });
    }

    if (data['Note']) {
      // API limit reached, return mock data for demo
      return res.status(200).json({ 
        price: Math.random() * 200 + 50, // Random price between 50-250
        note: 'Using demo data due to API limit'
      });
    }

    const quote = data['Global Quote'];
    if (!quote || !quote['05. price']) {
      return res.status(404).json({ error: 'Stock price not found' });
    }

    const price = parseFloat(quote['05. price']);

    res.status(200).json({ price });
  } catch (error) {
    console.error('Error fetching stock price:', error);
    res.status(500).json({ error: 'Failed to fetch stock price' });
  }
}
