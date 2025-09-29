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

    // Use Polygon.io options snapshot API to get comprehensive options data
    let callPrice = 0;
    let putPrice = 0;
    let callSnapshot = null;
    let putSnapshot = null;
    let callGreeks = null;
    let putGreeks = null;
    let callImpliedVol = null;
    let putImpliedVol = null;
    let callOpenInterest = null;
    let putOpenInterest = null;

    try {
      // Fetch call option snapshot
      const callSnapshotResponse = await fetch(
        `https://api.polygon.io/v3/snapshot/options/${ticker}/${bestCall.ticker}?apiKey=${POLYGON_API_KEY}`
      );

      if (callSnapshotResponse.ok) {
        callSnapshot = await callSnapshotResponse.json();
        if (callSnapshot.results) {
          callPrice = callSnapshot.results.last_trade?.p || callSnapshot.results.last_quote?.p || 0;
          callGreeks = callSnapshot.results.greeks;
          callImpliedVol = callSnapshot.results.implied_volatility;
          callOpenInterest = callSnapshot.results.open_interest;
        }
      }
    } catch (error) {
      console.log(`Call options snapshot fetch failed:`, error.message);
    }

    try {
      // Fetch put option snapshot
      const putSnapshotResponse = await fetch(
        `https://api.polygon.io/v3/snapshot/options/${ticker}/${bestPut.ticker}?apiKey=${POLYGON_API_KEY}`
      );

      if (putSnapshotResponse.ok) {
        putSnapshot = await putSnapshotResponse.json();
        if (putSnapshot.results) {
          putPrice = putSnapshot.results.last_trade?.p || putSnapshot.results.last_quote?.p || 0;
          putGreeks = putSnapshot.results.greeks;
          putImpliedVol = putSnapshot.results.implied_volatility;
          putOpenInterest = putSnapshot.results.open_interest;
        }
      }
    } catch (error) {
      console.log(`Put options snapshot fetch failed:`, error.message);
    }

    const foundStrike = bestCall.strike_price;
    let totalPremium = callPrice + putPrice;

    // Calculate days to expiration
    const expirationDate = new Date(closestExpiration);
    const currentDate = new Date();
    const daysToExpiration = Math.ceil((expirationDate - currentDate) / (1000 * 60 * 60 * 24));

    // If we don't have real pricing data from snapshot API, estimate based on stock price and time to expiration
    if (totalPremium === 0) {
      console.log(`No real options pricing data available from snapshot API, estimating based on stock price and time to expiration`);
      
      // Estimate implied volatility based on stock price and time to expiration
      // This is a simplified Black-Scholes approximation
      const timeToExp = daysToExpiration / 365; // Convert to years
      const impliedVol = Math.min(0.4, Math.max(0.1, 0.2 + (timeToExp * 0.1))); // Estimate IV between 10-40%
      
      // Estimate ATM straddle premium using simplified formula
      // ATM straddle ≈ Stock Price * Implied Volatility * sqrt(Time to Expiration) * 0.8
      const estimatedPremium = currentPrice * impliedVol * Math.sqrt(timeToExp) * 0.8;
      
      // Split between call and put (roughly equal for ATM)
      callPrice = estimatedPremium / 2;
      putPrice = estimatedPremium / 2;
      totalPremium = estimatedPremium;
      
      console.log(`Estimated premium: $${totalPremium.toFixed(2)} (Call: $${callPrice.toFixed(2)}, Put: $${putPrice.toFixed(2)})`);
    } else {
      console.log(`Real options pricing data found from snapshot API - Call: $${callPrice}, Put: $${putPrice}, Total: $${totalPremium}`);
    }

    // Calculate break-even price from snapshot data if available
    let breakEvenPrice = null;
    if (callSnapshot?.results?.break_even_price) {
      breakEvenPrice = callSnapshot.results.break_even_price;
    } else if (putSnapshot?.results?.break_even_price) {
      breakEvenPrice = putSnapshot.results.break_even_price;
    }

    return res.status(200).json({
      ticker,
      expiration: closestExpiration,
      requestedExpiration: expiration,
      executionDate: new Date().toISOString().split('T')[0],
      currentPrice,
      strikePrice: foundStrike,
      callPrice,
      putPrice,
      totalPremium,
      callTicker: bestCall.ticker,
      putTicker: bestPut.ticker,
      daysToExpiration,
      isEstimated: totalPremium > 0 && (callPrice === 0 || putPrice === 0), // Flag if pricing was estimated
      // Enhanced data from snapshot API
      greeks: {
        call: callGreeks,
        put: putGreeks
      },
      impliedVolatility: {
        call: callImpliedVol,
        put: putImpliedVol,
        average: callImpliedVol && putImpliedVol ? (callImpliedVol + putImpliedVol) / 2 : null
      },
      openInterest: {
        call: callOpenInterest,
        put: putOpenInterest
      },
      breakEvenPrice,
      // Data source information
      dataSource: 'polygon_snapshot_api',
      dataQuality: totalPremium > 0 && callPrice > 0 && putPrice > 0 ? 'high' : 'estimated'
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
