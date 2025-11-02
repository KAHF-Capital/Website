/**
 * Polygon/Massive Data Service
 * Fetches real options and historical stock data from Massive.com API (formerly Polygon.io)
 * NO ESTIMATIONS - ONLY REAL MARKET DATA
 */

const POLYGON_API_KEY = process.env.POLYGON_API_KEY;
const API_BASE_URL = 'https://api.massive.com';

/**
 * Get current stock price from Massive.com using last trade
 * @param {string} ticker - Stock ticker symbol
 * @returns {Promise<number>} - Current stock price
 */
export async function getCurrentStockPrice(ticker) {
  try {
    const response = await fetch(
      `${API_BASE_URL}/v2/aggs/ticker/${ticker}/prev?adjusted=true&apiKey=${POLYGON_API_KEY}`
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
 * Get historical stock data from Massive.com
 * @param {string} ticker - Stock ticker symbol
 * @param {string} from - Start date (YYYY-MM-DD)
 * @param {string} to - End date (YYYY-MM-DD)
 * @returns {Promise<Array>} - Historical price data
 */
export async function getHistoricalStockData(ticker, from, to) {
  try {
    const response = await fetch(
      `${API_BASE_URL}/v2/aggs/ticker/${ticker}/range/1/day/${from}/${to}?adjusted=true&sort=asc&apiKey=${POLYGON_API_KEY}`
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
      `${API_BASE_URL}/v3/reference/options/contracts?underlying_ticker=${ticker}&limit=1000&apiKey=${POLYGON_API_KEY}`
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
 * Get previous day close price for an option contract using /v2/aggs/ticker/{optionsTicker}/prev
 * @param {string} contractTicker - Option contract ticker (e.g., "O:AAPL230616C00150000")
 * @returns {Promise<number>} - Close price from previous day, or 0 if not available
 */
async function getOptionPreviousDayClose(contractTicker) {
  try {
    const response = await fetch(
      `${API_BASE_URL}/v2/aggs/ticker/${contractTicker}/prev?adjusted=true&apiKey=${POLYGON_API_KEY}`
    );

    if (!response.ok) {
      return 0;
    }

    const data = await response.json();
    
    // According to Massive.com API docs, results is an array with one object containing 'c' (close price)
    if (data.results && Array.isArray(data.results) && data.results.length > 0) {
      return data.results[0].c || 0;
    }
    
    return 0;
  } catch (error) {
    console.error(`Error fetching previous day close for ${contractTicker}:`, error);
    return 0;
  }
}

/**
 * Get options snapshot data for specific contracts using the new Massive.com endpoint
 * Uses /v3/snapshot/options/{underlyingAsset} which returns all options for the underlying asset
 * Falls back to previous day close price if real-time pricing is not available
 * @param {string} ticker - Stock ticker symbol
 * @param {Array} contractTickers - Array of option contract tickers to find
 * @returns {Promise<Object>} - Options snapshot data keyed by contract ticker
 */
export async function getOptionsSnapshot(ticker, contractTickers) {
  const snapshotData = {};

  // Initialize all requested contract tickers with default values
  contractTickers.forEach(contractTicker => {
    snapshotData[contractTicker] = {
      price: 0,
      bid: 0,
      ask: 0,
      volume: 0,
      openInterest: 0,
      impliedVolatility: 0,
      greeks: null
    };
  });

  try {
    // Use the new Massive.com endpoint to get all options for the underlying asset
    const response = await fetch(
      `${API_BASE_URL}/v3/snapshot/options/${ticker}?limit=250&apiKey=${POLYGON_API_KEY}`
    );

    if (!response.ok) {
      console.error(`HTTP ${response.status} fetching options snapshot for ${ticker}`);
      // Fallback to previous day close prices if snapshot endpoint fails
      await fetchPreviousDayPrices(contractTickers, snapshotData);
      return snapshotData;
    }

    const data = await response.json();
    
    if (!data.results || !Array.isArray(data.results)) {
      console.error('Invalid response format from options snapshot API');
      // Fallback to previous day close prices
      await fetchPreviousDayPrices(contractTickers, snapshotData);
      return snapshotData;
    }

    // Create a map for quick lookup of contract tickers (case-insensitive)
    const contractTickerMap = new Map(
      contractTickers.map(ct => [ct.toLowerCase(), ct])
    );

    // Process each result and match it to our requested contracts
    for (const option of data.results) {
      // Match by contract ticker from details object
      // The details object contains the contract identifier
      const optionTicker = option.details?.ticker || option.ticker;
      
      if (!optionTicker) continue;

      // Find matching contract ticker (case-insensitive match)
      const matchedOriginalTicker = contractTickerMap.get(optionTicker.toLowerCase());
      
      // Also try matching without the "O:" prefix if present
      const optionTickerWithoutPrefix = optionTicker.replace(/^O:/i, '');
      const matchedTicker = matchedOriginalTicker || 
        contractTickers.find(ct => ct.replace(/^O:/i, '').toLowerCase() === optionTickerWithoutPrefix.toLowerCase());

      if (matchedTicker) {
        // Extract pricing data from the option result
        let price = 0;
        
        if (option.last_trade?.p) {
          price = option.last_trade.p;
        } else if (option.last_quote?.b && option.last_quote?.a) {
          // Use bid-ask midpoint as fallback
          price = (option.last_quote.b + option.last_quote.a) / 2;
        } else if (option.last_quote?.p) {
          price = option.last_quote.p;
        }
        
        snapshotData[matchedTicker] = {
          price: price,
          bid: option.last_quote?.b || 0,
          ask: option.last_quote?.a || 0,
          volume: option.day?.v || 0,
          openInterest: option.open_interest || 0,
          impliedVolatility: option.implied_volatility || 0,
          greeks: option.greeks || null
        };
      }
    }

    // For any contracts that still have price = 0, fetch previous day close prices as fallback
    const contractsNeedingFallback = contractTickers.filter(ct => snapshotData[ct].price === 0);
    if (contractsNeedingFallback.length > 0) {
      console.log(`Fetching previous day close prices for ${contractsNeedingFallback.length} contracts without real-time pricing`);
      await fetchPreviousDayPrices(contractsNeedingFallback, snapshotData);
    }

    // Handle pagination if needed (check for next_url)
    if (data.next_url && contractTickers.some(ct => snapshotData[ct].price === 0)) {
      // If we didn't find all contracts and there's a next page, we could fetch it
      // For now, we'll return what we have as the API typically returns enough results
      console.warn(`Some contracts not found in first page. Consider implementing pagination if needed.`);
    }

  } catch (error) {
    console.error(`Error fetching options snapshot for ${ticker}:`, error);
    // Fallback to previous day close prices on error
    await fetchPreviousDayPrices(contractTickers, snapshotData);
  }

  return snapshotData;
}

/**
 * Fetch previous day close prices for option contracts that don't have real-time pricing
 * @param {Array} contractTickers - Array of contract tickers to fetch prices for
 * @param {Object} snapshotData - The snapshot data object to update
 */
async function fetchPreviousDayPrices(contractTickers, snapshotData) {
  // Fetch previous day prices in parallel for all contracts
  const pricePromises = contractTickers.map(async (contractTicker) => {
    const closePrice = await getOptionPreviousDayClose(contractTicker);
    if (closePrice > 0 && snapshotData[contractTicker].price === 0) {
      snapshotData[contractTicker].price = closePrice;
      console.log(`Using previous day close price for ${contractTicker}: $${closePrice}`);
    }
  });
  
  await Promise.all(pricePromises);
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
 * Calculate historical price movements for analysis using non-overlapping backward-looking intervals
 * For DTE=18: compares Nov 2 vs Oct 14, then Oct 14 vs Sep 24, etc.
 * Each interval is exactly DTE trading days long, going backward in time
 * @param {Array} historicalData - Historical price data (should be trading days only)
 * @param {number} daysToExpiration - Days to expiration (DTE)
 * @returns {Array} - Price movements for each non-overlapping time interval
 */
export function calculatePriceMovements(historicalData, daysToExpiration) {
  const movements = [];
  
  if (!historicalData || historicalData.length === 0 || daysToExpiration <= 0) {
    return movements;
  }

  // Ensure data is sorted by date (most recent first)
  const sortedData = [...historicalData].sort((a, b) => new Date(b.date) - new Date(a.date));
  
  // Use up to 200 non-overlapping intervals
  const maxPeriods = 200;
  
  // Need at least DTE+1 data points for one interval
  if (sortedData.length < daysToExpiration + 1) {
    return movements;
  }
  
  // Start from the most recent date and work backward in non-overlapping intervals
  let currentIndex = 0;
  let periodCount = 0;
  
  while (currentIndex + daysToExpiration < sortedData.length && periodCount < maxPeriods) {
    const startData = sortedData[currentIndex];
    const endData = sortedData[currentIndex + daysToExpiration];
    
    if (startData.close > 0 && endData.close > 0) {
      // Calculate percent move: (current_price - past_price) / past_price
      // This tells us how much the price changed from the past to now
      const percentMove = (startData.close - endData.close) / endData.close;
      
      movements.push({
        startDate: startData.date,      // More recent date (e.g., Nov 2)
        endDate: endData.date,           // DTE days earlier (e.g., Oct 14)
        startPrice: startData.close,     // Price on start date
        endPrice: endData.close,         // Price on end date
        percentMove
      });
      
      // Move to the next interval: the end date of this interval becomes the start of the next
      // So we jump forward by DTE trading days
      currentIndex += daysToExpiration;
      periodCount++;
    } else {
      // Invalid data, skip forward by 1
      currentIndex++;
    }
  }

  return movements;
}

