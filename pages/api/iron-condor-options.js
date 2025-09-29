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

    // Get current prices for all contracts
    const contractTickers = [
      shortCallContract.ticker,
      shortPutContract.ticker,
      longCallContract.ticker,
      longPutContract.ticker
    ];

    const pricesResponse = await fetch(
      `https://api.polygon.io/v2/last/trade/${contractTickers.join(',')}?apiKey=${POLYGON_API_KEY}`
    );

    if (!pricesResponse.ok) {
      throw new Error('Failed to fetch option prices');
    }

    const pricesData = await pricesResponse.json();
    const prices = {};

    // Process price data
    if (pricesData.results) {
      pricesData.results.forEach(result => {
        prices[result.T] = result.p; // T = ticker, p = price
      });
    }

    // Calculate Iron Condor premiums
    const shortCallPrice = prices[shortCallContract.ticker] || 0;
    const shortPutPrice = prices[shortPutContract.ticker] || 0;
    const longCallPrice = prices[longCallContract.ticker] || 0;
    const longPutPrice = prices[longPutContract.ticker] || 0;

    const callCredit = shortCallPrice - longCallPrice;
    const putCredit = shortPutPrice - longPutPrice;
    const totalCredit = callCredit + putCredit;

    // Return Iron Condor data
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
        shortCallPrice,
        shortPutPrice,
        longCallPrice,
        longPutPrice,
        callCredit,
        putCredit,
        totalCredit
      },
      contracts: {
        shortCall: shortCallContract.ticker,
        shortPut: shortPutContract.ticker,
        longCall: longCallContract.ticker,
        longPut: longPutContract.ticker
      },
      wingWidth,
      isNetCredit: totalCredit > 0
    });

  } catch (error) {
    console.error('Error fetching iron condor options:', error);
    return res.status(500).json({ 
      error: 'Failed to fetch iron condor options',
      details: error.message 
    });
  }
}

