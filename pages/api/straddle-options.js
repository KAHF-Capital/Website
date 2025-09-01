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

    // First, get available options contracts for this ticker and expiration
    // We'll use the contract overview endpoint to find valid contracts
    const expDate = new Date(expiration);
    const expFormatted = expDate.toISOString().slice(0, 10).replace(/-/g, '');
    
    // Try to find ATM options by testing different strikes
    const strikesToTry = [];
    for (let i = -10; i <= 10; i += 5) {
      const testStrike = atmStrike + i;
      if (testStrike > 0) {
        strikesToTry.push(testStrike);
      }
    }

    let callPrice = 0;
    let putPrice = 0;
    let foundStrike = atmStrike;

    // Try to find valid options contracts
    for (const strike of strikesToTry) {
      const callTicker = `${ticker}${expFormatted}C${strike.toString().padStart(8, '0')}`;
      const putTicker = `${ticker}${expFormatted}P${strike.toString().padStart(8, '0')}`;

      try {
        // First check if the contract exists using contract overview
        const [callContractResponse, putContractResponse] = await Promise.all([
          fetch(`https://api.polygon.io/v3/reference/options/contracts/${callTicker}?apiKey=${POLYGON_API_KEY}`),
          fetch(`https://api.polygon.io/v3/reference/options/contracts/${putTicker}?apiKey=${POLYGON_API_KEY}`)
        ]);

        if (callContractResponse.ok && putContractResponse.ok) {
          // Contracts exist, now get pricing data
          const [callResponse, putResponse] = await Promise.all([
            fetch(`https://api.polygon.io/v1/open-close/${callTicker}/${expiration}?adjusted=true&apiKey=${POLYGON_API_KEY}`),
            fetch(`https://api.polygon.io/v1/open-close/${putTicker}/${expiration}?adjusted=true&apiKey=${POLYGON_API_KEY}`)
          ]);

          if (callResponse.ok && putResponse.ok) {
            const callData = await callResponse.json();
            const putData = await putResponse.json();
            
            callPrice = callData.close || 0;
            putPrice = putData.close || 0;
            
            if (callPrice > 0 && putPrice > 0) {
              foundStrike = strike;
              break;
            }
          }
        }
      } catch (error) {
        console.log(`Skipping strike ${strike}: ${error.message}`);
        continue;
      }
    }

    const totalPremium = callPrice + putPrice;

    return res.status(200).json({
      ticker,
      expiration,
      currentPrice,
      strikePrice: foundStrike,
      callPrice,
      putPrice,
      totalPremium: callPrice + putPrice,
      callTicker: `${ticker}${expFormatted}C${foundStrike.toString().padStart(8, '0')}`,
      putTicker: `${ticker}${expFormatted}P${foundStrike.toString().padStart(8, '0')}`
    });

  } catch (error) {
    console.error('Error fetching straddle options:', error);
    return res.status(500).json({ 
      error: 'Failed to fetch straddle options',
      details: error.message 
    });
  }
}
