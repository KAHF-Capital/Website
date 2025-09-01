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

    // Find the closest ATM strike price (round to nearest $5 or $1 depending on price)
    const strikeIncrement = currentPrice > 50 ? 5 : 1;
    let atmStrike = Math.round(currentPrice / strikeIncrement) * strikeIncrement;

    // Format the expiration date for options ticker
    const expDate = new Date(expiration);
    const expFormatted = expDate.toISOString().slice(0, 10).replace(/-/g, '');

    // Construct options tickers for call and put
    const callTicker = `${ticker}${expFormatted}C${atmStrike.toString().padStart(8, '0')}`;
    const putTicker = `${ticker}${expFormatted}P${atmStrike.toString().padStart(8, '0')}`;

    // Fetch both call and put option data
    const [callResponse, putResponse] = await Promise.all([
      fetch(`https://api.polygon.io/v1/open-close/${callTicker}/${expiration}?adjusted=true&apiKey=${POLYGON_API_KEY}`),
      fetch(`https://api.polygon.io/v1/open-close/${putTicker}/${expiration}?adjusted=true&apiKey=${POLYGON_API_KEY}`)
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

    const totalPremium = callPrice + putPrice;

    // If exact ATM options not found, try to find closest strikes
    if (totalPremium === 0) {
      // Try strikes within ±$5 of ATM
      const strikesToTry = [];
      for (let i = -5; i <= 5; i += strikeIncrement) {
        const testStrike = atmStrike + i;
        if (testStrike > 0) {
          strikesToTry.push(testStrike);
        }
      }

      for (const strike of strikesToTry) {
        const testCallTicker = `${ticker}${expFormatted}C${strike.toString().padStart(8, '0')}`;
        const testPutTicker = `${ticker}${expFormatted}P${strike.toString().padStart(8, '0')}`;

        const [testCallResponse, testPutResponse] = await Promise.all([
          fetch(`https://api.polygon.io/v1/open-close/${testCallTicker}/${expiration}?adjusted=true&apiKey=${POLYGON_API_KEY}`),
          fetch(`https://api.polygon.io/v1/open-close/${testPutTicker}/${expiration}?adjusted=true&apiKey=${POLYGON_API_KEY}`)
        ]);

        if (testCallResponse.ok && testPutResponse.ok) {
          const testCallData = await testCallResponse.json();
          const testPutData = await testPutResponse.json();
          
          const testCallPrice = testCallData.close || 0;
          const testPutPrice = testPutData.close || 0;
          const testTotalPremium = testCallPrice + testPutPrice;

          if (testTotalPremium > 0) {
            callPrice = testCallPrice;
            putPrice = testPutPrice;
            atmStrike = strike;
            break;
          }
        }
      }
    }

    return res.status(200).json({
      ticker,
      expiration,
      currentPrice,
      strikePrice: atmStrike,
      callPrice,
      putPrice,
      totalPremium: callPrice + putPrice,
      callTicker: `${ticker}${expFormatted}C${atmStrike.toString().padStart(8, '0')}`,
      putTicker: `${ticker}${expFormatted}P${atmStrike.toString().padStart(8, '0')}`
    });

  } catch (error) {
    console.error('Error fetching straddle options:', error);
    return res.status(500).json({ 
      error: 'Failed to fetch straddle options',
      details: error.message 
    });
  }
}
