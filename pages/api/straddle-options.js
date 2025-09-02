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

    // First, get all available expiration dates for this ticker
    const allContractsResponse = await fetch(
      `https://api.polygon.io/v3/reference/options/contracts?underlying_ticker=${ticker}&limit=1000&apiKey=${POLYGON_API_KEY}`
    );

    if (!allContractsResponse.ok) {
      throw new Error('Failed to fetch options contracts');
    }

    const allContractsData = await allContractsResponse.json();
    const allContracts = allContractsData.results || [];

    if (allContracts.length === 0) {
      throw new Error('No options contracts found for this ticker');
    }

    console.log(`Found ${allContracts.length} total contracts for ${ticker}`);
    console.log(`Available expiration dates:`, [...new Set(allContracts.map(c => c.expiration_date))].slice(0, 10));

    // Find the closest available expiration date to the requested date
    const requestedDate = new Date(expiration);
    let closestExpiration = null;
    let minDateDiff = Infinity;

    for (const contract of allContracts) {
      if (contract.expiration_date) {
        const contractDate = new Date(contract.expiration_date);
        const dateDiff = Math.abs(contractDate - requestedDate);
        if (dateDiff < minDateDiff) {
          minDateDiff = dateDiff;
          closestExpiration = contract.expiration_date;
        }
      }
    }

    if (!closestExpiration) {
      throw new Error('No valid expiration dates found for this ticker');
    }

    console.log(`Requested expiration: ${expiration}, Using closest available: ${closestExpiration}`);
    console.log(`Current stock price: ${currentPrice}, Target ATM strike: ${atmStrike}`);

    // Now get contracts for the closest available expiration date
    const contractsResponse = await fetch(
      `https://api.polygon.io/v3/reference/options/contracts?underlying_ticker=${ticker}&expiration_date=${closestExpiration}&contract_type=call&limit=1000&apiKey=${POLYGON_API_KEY}`
    );

    if (!contractsResponse.ok) {
      throw new Error('Failed to fetch call options contracts');
    }

    const contractsData = await contractsResponse.json();
    const callContracts = contractsData.results || [];

    // Get put contracts for the same expiration
    const putContractsResponse = await fetch(
      `https://api.polygon.io/v3/reference/options/contracts?underlying_ticker=${ticker}&expiration_date=${closestExpiration}&contract_type=put&limit=1000&apiKey=${POLYGON_API_KEY}`
    );

    if (!putContractsResponse.ok) {
      throw new Error('Failed to fetch put options contracts');
    }

    const putContractsData = await putContractsResponse.json();
    const putContracts = putContractsData.results || [];

    if (callContracts.length === 0 || putContracts.length === 0) {
      throw new Error(`No options contracts found for ${ticker} expiring ${closestExpiration}`);
    }

    console.log(`Found ${callContracts.length} call contracts and ${putContracts.length} put contracts for ${closestExpiration}`);
    console.log(`Available strikes:`, [...new Set(callContracts.map(c => c.strike_price))].slice(0, 10));

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

    // Get today's date and find the last trading day
    const today = new Date();
    let lastTradingDay = null;
    
    // Try today first, then go backwards to find the last trading day
    for (let i = 0; i <= 5; i++) {
      const testDate = new Date(today);
      testDate.setDate(testDate.getDate() - i);
      const testDateStr = testDate.toISOString().slice(0, 10);
      
      try {
        // Test if we can get stock data for this date (to verify it's a trading day)
        const stockTestResponse = await fetch(
          `https://api.polygon.io/v2/aggs/ticker/${ticker}/prev?adjusted=true&apiKey=${POLYGON_API_KEY}`
        );
        if (stockTestResponse.ok) {
          const stockTestData = await stockTestResponse.json();
          if (stockTestData.results && stockTestData.results.length > 0) {
            lastTradingDay = testDateStr;
            break;
          }
        }
      } catch (error) {
        console.log(`No stock data for ${testDateStr}, trying next day`);
        continue;
      }
    }
    
    if (!lastTradingDay) {
      throw new Error('Could not find recent trading data');
    }
    
    console.log(`Using last trading day: ${lastTradingDay} as execution date`);
    
    // Now get the options pricing data for the user's selected expiration date
    // We'll use the most recent available options data (usually from the last trading day)
    const [callResponse, putResponse] = await Promise.all([
      fetch(`https://api.polygon.io/v1/open-close/${bestCall.ticker}/${lastTradingDay}?adjusted=true&apiKey=${POLYGON_API_KEY}`),
      fetch(`https://api.polygon.io/v1/open-close/${bestPut.ticker}/${lastTradingDay}?adjusted=true&apiKey=${POLYGON_API_KEY}`)
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
      expiration: closestExpiration,  // Return the actual expiration date used
      requestedExpiration: expiration, // Keep track of what was requested
      executionDate: lastTradingDay,  // The date we're using as execution date (last trading day)
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
