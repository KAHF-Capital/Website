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
    let stockResponse = await fetch(
      `https://api.polygon.io/v2/aggs/ticker/${ticker}/prev?adjusted=true&apiKey=${POLYGON_API_KEY}`
    );

    if (!stockResponse.ok) {
      throw new Error('Failed to fetch stock price');
    }

    const stockData = await stockResponse.json();
    const currentPrice = stockData.results && stockData.results.length > 0 ? stockData.results[0].c : 0;

    if (!currentPrice) {
      throw new Error('Stock price not available');
    }

    // Find the closest ATM strike price (round to nearest $5 for all prices)
    const strikeIncrement = 5;
    let atmStrike = Math.round(currentPrice / strikeIncrement) * strikeIncrement;

    // Get all options contracts for this ticker
    const contractsResponse = await fetch(
      `https://api.polygon.io/v3/reference/options/contracts?underlying_ticker=${ticker}&limit=1000&apiKey=${POLYGON_API_KEY}`
    );

    if (!contractsResponse.ok) {
      throw new Error('Failed to fetch options contracts');
    }

    const contractsData = await contractsResponse.json();
    const allContracts = contractsData.results || [];

    if (allContracts.length === 0) {
      throw new Error('No options contracts found for this ticker');
    }

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

    // Filter contracts by expiration date and type
    const callContracts = allContracts.filter(c => 
      c.expiration_date === closestExpiration && c.contract_type === 'call'
    );
    const putContracts = allContracts.filter(c => 
      c.expiration_date === closestExpiration && c.contract_type === 'put'
    );

    if (callContracts.length === 0 || putContracts.length === 0) {
      throw new Error(`No options contracts found for ${ticker} expiring ${closestExpiration}`);
    }

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

    // Calculate the last trading day (previous weekday)
    const currentDate = new Date();
    let lastTradingDay = null;
    
    // Start from yesterday and go backwards until we find a weekday
    for (let i = 1; i <= 7; i++) {
      const testDate = new Date(currentDate);
      testDate.setDate(testDate.getDate() - i);
      
      const dayOfWeek = testDate.getDay();
      if (dayOfWeek >= 1 && dayOfWeek <= 5) {
        const testDateStr = testDate.toISOString().slice(0, 10);
        
        try {
          const stockTestResponse = await fetch(
            `https://api.polygon.io/v2/aggs/ticker/${ticker}/range/1/day/${testDateStr}/${testDateStr}?adjusted=true&apiKey=${POLYGON_API_KEY}`
          );
          if (stockTestResponse.ok) {
            const stockTestData = await stockTestResponse.json();
            if (stockTestData.results && stockTestData.results.length > 0) {
              lastTradingDay = testDateStr;
              break;
            }
          }
        } catch (error) {
          continue;
        }
      }
    }
    
    if (!lastTradingDay) {
      throw new Error('Could not find recent trading data');
    }
    
    // Get options pricing data
    let callPrice = 0;
    let putPrice = 0;
    
    try {
      const callResponse = await fetch(`https://api.polygon.io/v1/open-close/${bestCall.ticker}/${lastTradingDay}?adjusted=true&apiKey=${POLYGON_API_KEY}`);
      if (callResponse.ok) {
        const callData = await callResponse.json();
        callPrice = callData.close || 0;
      }
    } catch (error) {
      console.log(`Call options data fetch failed:`, error.message);
    }
    
    try {
      const putResponse = await fetch(`https://api.polygon.io/v1/open-close/${bestPut.ticker}/${lastTradingDay}?adjusted=true&apiKey=${POLYGON_API_KEY}`);
      if (putResponse.ok) {
        const putData = await putResponse.json();
        putPrice = putData.close || 0;
      }
    } catch (error) {
      console.log(`Put options data fetch failed:`, error.message);
    }

    const foundStrike = bestCall.strike_price;
    const totalPremium = callPrice + putPrice;

    // Calculate days to expiration
    const expirationDate = new Date(closestExpiration);
    const executionDate = new Date(lastTradingDay);
    const daysToExpiration = Math.ceil((expirationDate - executionDate) / (1000 * 60 * 60 * 24));

    // Check if we actually got valid pricing data
    if (callPrice === 0 || putPrice === 0) {
      console.warn(`Missing pricing data - Call: ${callPrice}, Put: ${putPrice}`);
    }

    return res.status(200).json({
      ticker,
      expiration: closestExpiration,
      requestedExpiration: expiration,
      executionDate: lastTradingDay,
      currentPrice,
      strikePrice: foundStrike,
      callPrice,
      putPrice,
      totalPremium: callPrice + putPrice,
      callTicker: bestCall.ticker,
      putTicker: bestPut.ticker,
      daysToExpiration
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
    }
    
    return res.status(500).json({ 
      error: errorMessage,
      details: error.message 
    });
  }
}
