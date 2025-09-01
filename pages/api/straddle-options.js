const POLYGON_API_KEY = process.env.POLYGON_API_KEY;

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { ticker, expiration } = req.query;

  if (!ticker || !expiration) {
    return res.status(400).json({ error: 'Ticker and expiration date are required' });
  }

  if (!POLYGON_API_KEY) {
    return res.status(500).json({ error: 'Polygon API key not configured' });
  }

  try {
    // First, get the current stock price to determine ATM strike
    const stockResponse = await fetch(
      `https://api.polygon.io/v2/aggs/ticker/${ticker}/prev?adjusted=true&apiKey=${POLYGON_API_KEY}`
    );

    if (!stockResponse.ok) {
      throw new Error('Failed to fetch stock price');
    }

    const stockData = await stockResponse.json();
    const currentPrice = stockData.results[0]?.c || 0;

    if (!currentPrice) {
      return res.status(404).json({ error: 'Stock price not found' });
    }

    // Find the closest ATM strike price (round to nearest $5 for all prices)
    const strikeIncrement = 5;
    let atmStrike = Math.round(currentPrice / strikeIncrement) * strikeIncrement;

    // Use the All Contracts endpoint to find available options contracts
    // This is much more reliable than guessing ticker symbols
    const contractsResponse = await fetch(
      `https://api.polygon.io/v3/reference/options/contracts?underlying_ticker=${ticker}&expiration_date=${expiration}&contract_type=call&limit=1000&apiKey=${POLYGON_API_KEY}`
    );

    if (!contractsResponse.ok) {
      throw new Error('Failed to fetch options contracts');
    }

    const contractsData = await contractsResponse.json();
    const callContracts = contractsData.results || [];

    // Get put contracts for the same expiration
    const putContractsResponse = await fetch(
      `https://api.polygon.io/v3/reference/options/contracts?underlying_ticker=${ticker}&expiration_date=${expiration}&contract_type=put&limit=1000&apiKey=${POLYGON_API_KEY}`
    );

    if (!putContractsResponse.ok) {
      throw new Error('Failed to fetch put options contracts');
    }

    const putContractsData = await putContractsResponse.json();
    const putContracts = putContractsData.results || [];

    // Find the closest ATM options (closest strike to current price)
    let bestCall = null;
    let bestPut = null;
    let minStrikeDiff = Infinity;

    for (const callContract of callContracts) {
      for (const putContract of putContracts) {
        if (callContract.strike_price === putContract.strike_price) {
          const strikeDiff = Math.abs(callContract.strike_price - currentPrice);
          if (strikeDiff < minStrikeDiff) {
            minStrikeDiff = strikeDiff;
            bestCall = callContract;
            bestPut = putContract;
          }
        }
      }
    }

    if (!bestCall || !bestPut) {
      throw new Error('No matching call and put contracts found for this expiration');
    }

    // Now get the pricing data using the actual contract tickers
    const [callResponse, putResponse] = await Promise.all([
      fetch(`https://api.polygon.io/v1/open-close/${bestCall.ticker}/${expiration}?adjusted=true&apiKey=${POLYGON_API_KEY}`),
      fetch(`https://api.polygon.io/v1/open-close/${bestPut.ticker}/${expiration}?adjusted=true&apiKey=${POLYGON_API_KEY}`)
    ]);

    let callPrice = 0;
    let putPrice = 0;

    if (callResponse.ok) {
      const callData = await callResponse.json();
      callPrice = callData.close || 0;
    }

    if (putResponse.ok) {
      const putData = await putResponse.json();
      putPrice = putData.close || 0;
    }

    const foundStrike = bestCall.strike_price;

    const totalPremium = callPrice + putPrice;

    return res.status(200).json({
      ticker,
      expiration,
      currentPrice,
      strikePrice: foundStrike,
      callPrice,
      putPrice,
      totalPremium: callPrice + putPrice,
      callTicker: bestCall.ticker,  // Use actual contract ticker from API
      putTicker: bestPut.ticker     // Use actual contract ticker from API
    });

  } catch (error) {
    console.error('Error fetching straddle options:', error);
    return res.status(500).json({ 
      error: 'Failed to fetch straddle options',
      details: error.message 
    });
  }
}
