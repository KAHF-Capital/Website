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
    // Try to get today's data first, fallback to previous close
    const today = new Date().toISOString().slice(0, 10);
    let stockResponse = await fetch(
      `https://api.polygon.io/v2/aggs/ticker/${ticker}/range/1/day/${today}/${today}?adjusted=true&apiKey=${POLYGON_API_KEY}`
    );
    
    if (!stockResponse.ok) {
      // Fallback to previous close
      stockResponse = await fetch(
        `https://api.polygon.io/v2/aggs/ticker/${ticker}/prev?adjusted=true&apiKey=${POLYGON_API_KEY}`
      );
    }

    if (!stockResponse.ok) {
      throw new Error('Failed to fetch stock price');
    }

    const stockData = await stockResponse.json();
    console.log('Stock data response:', JSON.stringify(stockData, null, 2));
    
    const currentPrice = stockData.results && stockData.results.length > 0 ? stockData.results[0].c : 0;
    console.log('Extracted current price:', currentPrice);

    if (!currentPrice) {
      console.error('No stock price found in response:', stockData);
      return res.status(404).json({ error: 'Stock price not found', response: stockData });
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

    console.log(`Looking for expiration closest to: ${expiration}`);
    console.log(`Available expirations:`, allContracts.map(c => c.expiration_date).filter(Boolean).slice(0, 10));

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
    console.log(`Fetching call contracts for ${ticker} expiring ${closestExpiration}...`);
    const contractsResponse = await fetch(
      `https://api.polygon.io/v3/reference/options/contracts?underlying_ticker=${ticker}&expiration_date=${closestExpiration}&contract_type=call&limit=1000&apiKey=${POLYGON_API_KEY}`
    );

    if (!contractsResponse.ok) {
      console.error(`Call contracts request failed: ${contractsResponse.status} - ${contractsResponse.statusText}`);
      throw new Error('Failed to fetch call options contracts');
    }

    const contractsData = await contractsResponse.json();
    const callContracts = contractsData.results || [];
    console.log(`Found ${callContracts.length} call contracts for ${closestExpiration}`);

    // Get put contracts for the same expiration
    console.log(`Fetching put contracts for ${ticker} expiring ${closestExpiration}...`);
    const putContractsResponse = await fetch(
      `https://api.polygon.io/v3/reference/options/contracts?underlying_ticker=${ticker}&expiration_date=${closestExpiration}&contract_type=put&limit=1000&apiKey=${POLYGON_API_KEY}`
    );

    if (!putContractsResponse.ok) {
      console.error(`Put contracts request failed: ${putContractsResponse.status} - ${putContractsResponse.statusText}`);
      throw new Error('Failed to fetch put options contracts');
    }

    const putContractsData = await putContractsResponse.json();
    const putContracts = putContractsData.results || [];
    console.log(`Found ${putContracts.length} put contracts for ${closestExpiration}`);

    if (callContracts.length === 0 || putContracts.length === 0) {
      throw new Error(`No options contracts found for ${ticker} expiring ${closestExpiration}`);
    }

    console.log(`Found ${callContracts.length} call contracts and ${putContracts.length} put contracts for ${closestExpiration}`);
    console.log(`Available strikes:`, [...new Set(callContracts.map(c => c.strike_price))].slice(0, 10));
    console.log(`Current price: ${currentPrice}, Target ATM strike: ${atmStrike}`);

    // Find the closest ATM options (closest strike to current price)
    let bestCall = null;
    let bestPut = null;
    let minStrikeDiff = Infinity;

    console.log(`Looking for matching call/put contracts at same strike price...`);
    
    for (const callContract of callContracts) {
      for (const putContract of putContracts) {
        if (callContract.strike_price === putContract.strike_price) {
          const strikeDiff = Math.abs(callContract.strike_price - currentPrice);
          console.log(`Found matching strike: ${callContract.strike_price} (diff from current: ${strikeDiff})`);
          if (strikeDiff < minStrikeDiff) {
            minStrikeDiff = strikeDiff;
            bestCall = callContract;
            bestPut = putContract;
            console.log(`New best match - Strike: ${callContract.strike_price}, Call: ${callContract.ticker}, Put: ${putContract.ticker}`);
          }
        }
      }
    }

    if (!bestCall || !bestPut) {
      console.error('Contract matching failed:');
      console.error('- Available call strikes:', callContracts.map(c => c.strike_price).slice(0, 10));
      console.error('- Available put strikes:', putContracts.map(c => c.strike_price).slice(0, 10));
      console.error('- Current price:', currentPrice);
      console.error('- Target ATM strike:', atmStrike);
      throw new Error('No matching call and put contracts found for this expiration');
    }

    // Get today's date and find the last trading day
    const currentDate = new Date();
    let lastTradingDay = null;
    
    // Try today first, then go backwards to find the last trading day
    for (let i = 0; i <= 5; i++) {
      const testDate = new Date(currentDate);
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
    console.log(`Fetching options data for call: ${bestCall.ticker} and put: ${bestPut.ticker} on date: ${lastTradingDay}`);
    
    // Get options pricing data using the most reliable endpoint
    let callPrice = 0;
    let putPrice = 0;
    
    // Use the /v2/aggs/ticker/{ticker}/prev endpoint which gets the most recent available data
    // This is more reliable than trying specific dates that might not have data
    try {
      const callResponse = await fetch(`https://api.polygon.io/v2/aggs/ticker/${bestCall.ticker}/prev?adjusted=true&apiKey=${POLYGON_API_KEY}`);
      if (callResponse.ok) {
        const callData = await callResponse.json();
        callPrice = callData.results?.[0]?.c || 0;
        console.log(`Call options data (prev close):`, callData);
      } else {
        console.warn(`Call options request failed: ${callResponse.status} - ${callResponse.statusText}`);
      }
    } catch (error) {
      console.log(`Call options data fetch failed:`, error.message);
    }
    
    try {
      const putResponse = await fetch(`https://api.polygon.io/v2/aggs/ticker/${bestPut.ticker}/prev?adjusted=true&apiKey=${POLYGON_API_KEY}`);
      if (putResponse.ok) {
        const putData = await putResponse.json();
        putPrice = putData.results?.[0]?.c || 0;
        console.log(`Put options data (prev close):`, putData);
      } else {
        console.warn(`Put options request failed: ${putResponse.status} - ${putResponse.statusText}`);
      }
    } catch (error) {
      console.log(`Put options data fetch failed:`, error.message);
    }

    const foundStrike = bestCall.strike_price;
    const totalPremium = callPrice + putPrice;

    console.log(`Final pricing - Call: ${callPrice}, Put: ${putPrice}, Total: ${totalPremium}`);
    console.log(`Strike: ${foundStrike}, Current Price: ${currentPrice}`);

    // Check if we actually got valid pricing data
    if (callPrice === 0 || putPrice === 0) {
      console.warn(`Missing pricing data - Call: ${callPrice}, Put: ${putPrice}`);
      console.warn(`This might be due to no trading data available for ${lastTradingDay}`);
    }

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
