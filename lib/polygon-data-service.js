/**
 * Polygon Data Service
 * Fetches real options and historical stock data from Polygon API
 * NO ESTIMATIONS - ONLY REAL MARKET DATA
 */

const POLYGON_API_KEY = process.env.POLYGON_API_KEY;

/**
 * Get current stock price from Polygon using last trade
 * @param {string} ticker - Stock ticker symbol
 * @returns {Promise<number>} - Current stock price
 */
export async function getCurrentStockPrice(ticker) {
  try {
    const response = await fetch(
      `https://api.polygon.io/v2/aggs/ticker/${ticker}/prev?adjusted=true&apiKey=${POLYGON_API_KEY}`
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch stock price: ${response.status}`);
    }

    const data = await response.json();
    // Use close price from previous day (most reliable)
    const price = data.results?.[0]?.c;

    if (!price || price <= 0) {
      throw new Error('Invalid stock price data');
    }

    return price;
  } catch (error) {
    console.error(`Error fetching stock price for ${ticker}:`, error);
    throw error;
  }
}

/**
 * Get historical stock data from Polygon
 * @param {string} ticker - Stock ticker symbol
 * @param {string} from - Start date (YYYY-MM-DD)
 * @param {string} to - End date (YYYY-MM-DD)
 * @returns {Promise<Array>} - Historical price data
 */
export async function getHistoricalStockData(ticker, from, to) {
  try {
    const response = await fetch(
      `https://api.polygon.io/v2/aggs/ticker/${ticker}/range/1/day/${from}/${to}?adjusted=true&sort=asc&apiKey=${POLYGON_API_KEY}`
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch historical data: ${response.status}`);
    }

    const data = await response.json();
    const results = data.results || [];

    if (results.length === 0) {
      throw new Error('No historical data available');
    }

    // Convert to our format
    return results.map(day => ({
      date: new Date(day.t).toISOString().split('T')[0],
      open: day.o,
      high: day.h,
      low: day.l,
      close: day.c,
      volume: day.v
    })).sort((a, b) => new Date(a.date) - new Date(b.date));

  } catch (error) {
    console.error(`Error fetching historical data for ${ticker}:`, error);
    throw error;
  }
}

/**
 * Get available options contracts for a ticker
 * @param {string} ticker - Stock ticker symbol
 * @returns {Promise<Array>} - Available options contracts
 */
export async function getOptionsContracts(ticker) {
  try {
    const response = await fetch(
      `https://api.polygon.io/v3/reference/options/contracts?underlying_ticker=${ticker}&limit=1000&apiKey=${POLYGON_API_KEY}`
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch options contracts: ${response.status}`);
    }

    const data = await response.json();
    return data.results || [];

  } catch (error) {
    console.error(`Error fetching options contracts for ${ticker}:`, error);
    throw error;
  }
}

/**
 * Get options snapshot data for specific contracts using individual contract endpoint
 * @param {string} ticker - Stock ticker symbol
 * @param {Array} contractTickers - Array of option contract tickers
 * @returns {Promise<Object>} - Options snapshot data
 */
export async function getOptionsSnapshot(ticker, contractTickers) {
  const snapshotData = {};

  for (const contractTicker of contractTickers) {
    try {
      const response = await fetch(
        `https://api.polygon.io/v3/snapshot/options/${ticker}/${contractTicker}?apiKey=${POLYGON_API_KEY}`
      );

      if (response.ok) {
        const data = await response.json();
        if (data.results) {
          // Use the last trade price if available, otherwise use last quote midpoint
          let price = 0;
          
          if (data.results.last_trade?.p) {
            price = data.results.last_trade.p;
          } else if (data.results.last_quote?.b && data.results.last_quote?.a) {
            // Use bid-ask midpoint as fallback
            price = (data.results.last_quote.b + data.results.last_quote.a) / 2;
          } else if (data.results.last_quote?.p) {
            price = data.results.last_quote.p;
          }
          
          snapshotData[contractTicker] = {
            price: price,
            bid: data.results.last_quote?.b || 0,
            ask: data.results.last_quote?.a || 0,
            volume: data.results.day?.v || 0,
            openInterest: data.results.open_interest || 0,
            impliedVolatility: data.results.implied_volatility || 0,
            greeks: data.results.greeks || null
          };
        } else {
          // No results returned from API
          snapshotData[contractTicker] = {
            price: 0,
            bid: 0,
            ask: 0,
            volume: 0,
            openInterest: 0,
            impliedVolatility: 0,
            greeks: null
          };
        }
      } else {
        // HTTP error response
        console.error(`HTTP ${response.status} fetching snapshot for ${contractTicker}`);
        snapshotData[contractTicker] = {
          price: 0,
          bid: 0,
          ask: 0,
          volume: 0,
          openInterest: 0,
          impliedVolatility: 0,
          greeks: null
        };
      }
    } catch (error) {
      console.error(`Error fetching snapshot for ${contractTicker}:`, error);
      snapshotData[contractTicker] = {
        price: 0,
        bid: 0,
        ask: 0,
        volume: 0,
        openInterest: 0,
        impliedVolatility: 0,
        greeks: null
      };
    }
  }

  return snapshotData;
}

/**
 * Find closest expiration date to requested date
 * @param {Array} contracts - Array of options contracts
 * @param {string} requestedDate - Requested expiration date (YYYY-MM-DD)
 * @returns {string} - Closest expiration date
 */
export function findClosestExpiration(contracts, requestedDate) {
  const requested = new Date(requestedDate);
  let closestDate = null;
  let minDiff = Infinity;

  for (const contract of contracts) {
    if (contract.expiration_date) {
      const contractDate = new Date(contract.expiration_date);
      const diff = Math.abs(contractDate - requested);
      if (diff < minDiff) {
        minDiff = diff;
        closestDate = contract.expiration_date;
      }
    }
  }

  return closestDate;
}

/**
 * Find ATM strike price closest to current price
 * @param {Array} contracts - Array of options contracts
 * @param {number} currentPrice - Current stock price
 * @param {string} contractType - 'call' or 'put'
 * @returns {number} - Closest ATM strike price
 */
export function findATMStrike(contracts, currentPrice, contractType) {
  const filteredContracts = contracts.filter(c => c.contract_type === contractType);
  
  if (filteredContracts.length === 0) return null;

  let closestStrike = null;
  let minDiff = Infinity;

  for (const contract of filteredContracts) {
    const diff = Math.abs(contract.strike_price - currentPrice);
    if (diff < minDiff) {
      minDiff = diff;
      closestStrike = contract.strike_price;
    }
  }

  return closestStrike;
}

/**
 * Get straddle options data
 * @param {string} ticker - Stock ticker symbol
 * @param {string} expiration - Expiration date
 * @returns {Promise<Object>} - Straddle options data
 */
export async function getStraddleOptions(ticker, expiration) {
  try {
    // Get current stock price
    const currentPrice = await getCurrentStockPrice(ticker);

    // Get options contracts
    const contracts = await getOptionsContracts(ticker);
    if (contracts.length === 0) {
      throw new Error('No options contracts found');
    }

    // Find closest expiration
    const closestExpiration = findClosestExpiration(contracts, expiration);
    if (!closestExpiration) {
      throw new Error('No valid expiration dates found');
    }

    // Filter contracts by expiration
    const expirationContracts = contracts.filter(c => c.expiration_date === closestExpiration);

    // Find ATM strikes
    const callStrike = findATMStrike(expirationContracts, currentPrice, 'call');
    const putStrike = findATMStrike(expirationContracts, currentPrice, 'put');

    if (!callStrike || !putStrike) {
      throw new Error('No ATM options found for this expiration');
    }

    // Find the contracts
    const callContract = expirationContracts.find(c => 
      c.contract_type === 'call' && c.strike_price === callStrike
    );
    const putContract = expirationContracts.find(c => 
      c.contract_type === 'put' && c.strike_price === putStrike
    );

    if (!callContract || !putContract) {
      throw new Error('Matching call and put contracts not found');
    }

    // Get real-time pricing data
    const snapshotData = await getOptionsSnapshot(ticker, [callContract.ticker, putContract.ticker]);

    const callData = snapshotData[callContract.ticker] || { price: 0 };
    const putData = snapshotData[putContract.ticker] || { price: 0 };

    return {
      ticker: ticker.toUpperCase(),
      currentPrice,
      expiration: closestExpiration,
      requestedExpiration: expiration,
      strikePrice: callStrike,
      callPrice: callData.price,
      putPrice: putData.price,
      totalPremium: callData.price + putData.price,
      callTicker: callContract.ticker,
      putTicker: putContract.ticker,
      callData,
      putData,
      dataSource: 'polygon_real_time',
      dataQuality: (callData.price > 0 && putData.price > 0) ? 'high' : 'low'
    };

  } catch (error) {
    console.error(`Error getting straddle options for ${ticker}:`, error);
    throw error;
  }
}

/**
 * Get iron condor options data
 * @param {string} ticker - Stock ticker symbol
 * @param {string} expiration - Expiration date
 * @param {number} wingWidth - Width of the wings (default 10)
 * @returns {Promise<Object>} - Iron condor options data
 */
export async function getIronCondorOptions(ticker, expiration, wingWidth = 10) {
  try {
    // Get current stock price
    const currentPrice = await getCurrentStockPrice(ticker);

    // Get options contracts
    const contracts = await getOptionsContracts(ticker);
    if (contracts.length === 0) {
      throw new Error('No options contracts found');
    }

    // Find closest expiration
    const closestExpiration = findClosestExpiration(contracts, expiration);
    if (!closestExpiration) {
      throw new Error('No valid expiration dates found');
    }

    // Filter contracts by expiration
    const expirationContracts = contracts.filter(c => c.expiration_date === closestExpiration);

    // Calculate strikes (round to nearest $5)
    const strikeIncrement = 5;
    const atmStrike = Math.round(currentPrice / strikeIncrement) * strikeIncrement;
    
    const shortCallStrike = atmStrike;
    const shortPutStrike = atmStrike;
    const longCallStrike = atmStrike + wingWidth;
    const longPutStrike = atmStrike - wingWidth;

    // Find the contracts
    const shortCallContract = expirationContracts.find(c => 
      c.contract_type === 'call' && c.strike_price === shortCallStrike
    );
    const shortPutContract = expirationContracts.find(c => 
      c.contract_type === 'put' && c.strike_price === shortPutStrike
    );
    const longCallContract = expirationContracts.find(c => 
      c.contract_type === 'call' && c.strike_price === longCallStrike
    );
    const longPutContract = expirationContracts.find(c => 
      c.contract_type === 'put' && c.strike_price === longPutStrike
    );

    // Check if all contracts exist
    const missingContracts = [];
    if (!shortCallContract) missingContracts.push(`Short Call ${shortCallStrike}`);
    if (!shortPutContract) missingContracts.push(`Short Put ${shortPutStrike}`);
    if (!longCallContract) missingContracts.push(`Long Call ${longCallStrike}`);
    if (!longPutContract) missingContracts.push(`Long Put ${longPutStrike}`);

    if (missingContracts.length > 0) {
      throw new Error(`Missing contracts: ${missingContracts.join(', ')}`);
    }

    // Get real-time pricing data for all contracts
    const contractTickers = [
      shortCallContract.ticker,
      shortPutContract.ticker,
      longCallContract.ticker,
      longPutContract.ticker
    ];

    const snapshotData = await getOptionsSnapshot(ticker, contractTickers);

    const shortCallData = snapshotData[shortCallContract.ticker] || { price: 0 };
    const shortPutData = snapshotData[shortPutContract.ticker] || { price: 0 };
    const longCallData = snapshotData[longCallContract.ticker] || { price: 0 };
    const longPutData = snapshotData[longPutContract.ticker] || { price: 0 };

    const callCredit = shortCallData.price - longCallData.price;
    const putCredit = shortPutData.price - longPutData.price;
    const totalCredit = callCredit + putCredit;

    return {
      ticker: ticker.toUpperCase(),
      currentPrice,
      expiration: closestExpiration,
      requestedExpiration: expiration,
      strikes: {
        shortCall: shortCallStrike,
        shortPut: shortPutStrike,
        longCall: longCallStrike,
        longPut: longPutStrike
      },
      premiums: {
        shortCallPrice: shortCallData.price,
        shortPutPrice: shortPutData.price,
        longCallPrice: longCallData.price,
        longPutPrice: longPutData.price,
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
      snapshotData: {
        shortCall: shortCallData,
        shortPut: shortPutData,
        longCall: longCallData,
        longPut: longPutData
      },
      wingWidth,
      isNetCredit: totalCredit > 0,
      dataSource: 'polygon_real_time',
      dataQuality: Object.values(snapshotData).every(data => data.price > 0) ? 'high' : 'low'
    };

  } catch (error) {
    console.error(`Error getting iron condor options for ${ticker}:`, error);
    throw error;
  }
}

/**
 * Calculate historical price movements for analysis
 * @param {Array} historicalData - Historical price data
 * @param {number} daysToExpiration - Days to expiration
 * @returns {Array} - Price movements
 */
export function calculatePriceMovements(historicalData, daysToExpiration) {
  const movements = [];
  
  if (historicalData.length < daysToExpiration + 1) {
    return movements;
  }

  // Use up to 100 historical periods for analysis
  const maxPeriods = 100;
  const availablePeriods = historicalData.length - daysToExpiration;
  const periodsToUse = Math.min(availablePeriods, maxPeriods);
  
  const startIndex = availablePeriods > maxPeriods ? availablePeriods - maxPeriods : 0;

  for (let i = startIndex; i < startIndex + periodsToUse; i++) {
    const startPrice = historicalData[i].close;
    const endPrice = historicalData[i + daysToExpiration].close;
    
    if (startPrice > 0 && endPrice > 0) {
      const percentMove = (endPrice - startPrice) / startPrice;
      
      movements.push({
        startDate: historicalData[i].date,
        endDate: historicalData[i + daysToExpiration].date,
        startPrice,
        endPrice,
        percentMove
      });
    }
  }

  return movements;
}

