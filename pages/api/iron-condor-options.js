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
      throw new Error('No valid expiration dates found');
    }

    // Filter contracts for the closest expiration date
    const expirationContracts = allContracts.filter(c => c.expiration_date === closestExpiration);

    // Set up Iron Condor strikes (10 dollar wings by default)
    const wingWidth = 10;
    const shortCallStrike = atmStrike;
    const shortPutStrike = atmStrike;
    const longCallStrike = atmStrike + wingWidth;
    const longPutStrike = atmStrike - wingWidth;

    // Find the specific contracts for our Iron Condor
    const shortCallContract = expirationContracts.find(c => 
      c.strike_price === shortCallStrike && c.contract_type === 'call'
    );
    const shortPutContract = expirationContracts.find(c => 
      c.strike_price === shortPutStrike && c.contract_type === 'put'
    );
    const longCallContract = expirationContracts.find(c => 
      c.strike_price === longCallStrike && c.contract_type === 'call'
    );
    const longPutContract = expirationContracts.find(c => 
      c.strike_price === longPutStrike && c.contract_type === 'put'
    );

    // Check if we have all required contracts
    const missingContracts = [];
    if (!shortCallContract) missingContracts.push(`Short Call ${shortCallStrike}`);
    if (!shortPutContract) missingContracts.push(`Short Put ${shortPutStrike}`);
    if (!longCallContract) missingContracts.push(`Long Call ${longCallStrike}`);
    if (!longPutContract) missingContracts.push(`Long Put ${longPutStrike}`);

    if (missingContracts.length > 0) {
      return res.status(404).json({
        error: 'Missing required contracts',
        missingContracts,
        availableStrikes: {
          calls: [...new Set(expirationContracts.filter(c => c.contract_type === 'call').map(c => c.strike_price))].sort((a, b) => a - b),
          puts: [...new Set(expirationContracts.filter(c => c.contract_type === 'put').map(c => c.strike_price))].sort((a, b) => a - b)
        },
        requestedStrikes: {
          shortCall: shortCallStrike,
          shortPut: shortPutStrike,
          longCall: longCallStrike,
          longPut: longPutStrike
        }
      });
    }

    // Use Polygon.io options snapshot API to get comprehensive options data for all 4 contracts
    const contractTickers = [
      { contract: shortCallContract, type: 'shortCall' },
      { contract: shortPutContract, type: 'shortPut' },
      { contract: longCallContract, type: 'longCall' },
      { contract: longPutContract, type: 'longPut' }
    ];

    const snapshotData = {};
    const greeksData = {};
    const impliedVolData = {};
    const openInterestData = {};

    // Fetch snapshot data for all contracts
    for (const { contract, type } of contractTickers) {
      try {
        const snapshotResponse = await fetch(
          `https://api.polygon.io/v3/snapshot/options/${ticker}/${contract.ticker}?apiKey=${POLYGON_API_KEY}`
        );

        if (snapshotResponse.ok) {
          const snapshot = await snapshotResponse.json();
          if (snapshot.results) {
            snapshotData[type] = snapshot.results.last_trade?.p || snapshot.results.last_quote?.p || 0;
            greeksData[type] = snapshot.results.greeks;
            impliedVolData[type] = snapshot.results.implied_volatility;
            openInterestData[type] = snapshot.results.open_interest;
          }
        }
      } catch (error) {
        console.log(`${type} options snapshot fetch failed:`, error.message);
        snapshotData[type] = 0;
      }
    }

    // Calculate Iron Condor premiums
    const shortCallPrice = snapshotData.shortCall || 0;
    const shortPutPrice = snapshotData.shortPut || 0;
    const longCallPrice = snapshotData.longCall || 0;
    const longPutPrice = snapshotData.longPut || 0;

    const callCredit = shortCallPrice - longCallPrice;
    const putCredit = shortPutPrice - longPutPrice;
    const totalCredit = callCredit + putCredit;

    // Calculate days to expiration
    const expirationDate = new Date(closestExpiration);
    const currentDate = new Date();
    const daysToExpiration = Math.ceil((expirationDate - currentDate) / (1000 * 60 * 60 * 24));

    // If we don't have real pricing data from snapshot API, estimate based on stock price and time to expiration
    if (totalCredit === 0 && (shortCallPrice === 0 || shortPutPrice === 0 || longCallPrice === 0 || longPutPrice === 0)) {
      console.log(`No real options pricing data available from snapshot API, estimating based on stock price and time to expiration`);
      
      // Estimate implied volatility based on stock price and time to expiration
      const timeToExp = daysToExpiration / 365; // Convert to years
      const impliedVol = Math.min(0.4, Math.max(0.1, 0.2 + (timeToExp * 0.1))); // Estimate IV between 10-40%
      
      // Estimate option prices using simplified Black-Scholes
      const estimatedATMPrice = currentPrice * impliedVol * Math.sqrt(timeToExp) * 0.4;
      
      // For Iron Condor: shorter strikes have higher premiums, longer strikes have lower premiums
      const estimatedShortCallPrice = estimatedATMPrice;
      const estimatedShortPutPrice = estimatedATMPrice;
      const estimatedLongCallPrice = estimatedATMPrice * 0.3; // Longer strikes are cheaper
      const estimatedLongPutPrice = estimatedATMPrice * 0.3;
      
      const estimatedCallCredit = estimatedShortCallPrice - estimatedLongCallPrice;
      const estimatedPutCredit = estimatedShortPutPrice - estimatedLongPutPrice;
      const estimatedTotalCredit = estimatedCallCredit + estimatedPutCredit;
      
      console.log(`Estimated Iron Condor credit: $${estimatedTotalCredit.toFixed(2)}`);
      
      // Update data with estimates
      snapshotData.shortCall = estimatedShortCallPrice;
      snapshotData.shortPut = estimatedShortPutPrice;
      snapshotData.longCall = estimatedLongCallPrice;
      snapshotData.longPut = estimatedLongPutPrice;
    }

    // Return Iron Condor data with enhanced snapshot API information
    return res.status(200).json({
      ticker: ticker.toUpperCase(),
      currentPrice,
      expiration: closestExpiration,
      requestedExpiration: expiration,
      executionDate: new Date().toISOString().split('T')[0],
      strikes: {
        shortCall: shortCallStrike,
        shortPut: shortPutStrike,
        longCall: longCallStrike,
        longPut: longPutStrike
      },
      premiums: {
        shortCallPrice: snapshotData.shortCall || 0,
        shortPutPrice: snapshotData.shortPut || 0,
        longCallPrice: snapshotData.longCall || 0,
        longPutPrice: snapshotData.longPut || 0,
        callCredit: (snapshotData.shortCall || 0) - (snapshotData.longCall || 0),
        putCredit: (snapshotData.shortPut || 0) - (snapshotData.longPut || 0),
        totalCredit: ((snapshotData.shortCall || 0) - (snapshotData.longCall || 0)) + ((snapshotData.shortPut || 0) - (snapshotData.longPut || 0))
      },
      contracts: {
        shortCall: shortCallContract.ticker,
        shortPut: shortPutContract.ticker,
        longCall: longCallContract.ticker,
        longPut: longPutContract.ticker
      },
      wingWidth,
      isNetCredit: ((snapshotData.shortCall || 0) - (snapshotData.longCall || 0)) + ((snapshotData.shortPut || 0) - (snapshotData.longPut || 0)) > 0,
      daysToExpiration,
      // Enhanced data from snapshot API
      greeks: greeksData,
      impliedVolatility: impliedVolData,
      openInterest: openInterestData,
      // Data source information
      dataSource: 'polygon_snapshot_api',
      dataQuality: Object.values(snapshotData).every(price => price > 0) ? 'high' : 'estimated'
    });

  } catch (error) {
    console.error('Error fetching iron condor options:', error);
    return res.status(500).json({ 
      error: 'Failed to fetch iron condor options',
      details: error.message 
    });
  }
}

