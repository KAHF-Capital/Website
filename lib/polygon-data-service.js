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
    let allResults = [];
    let url = `${API_BASE_URL}/v3/reference/options/contracts?underlying_ticker=${ticker}&expired=false&limit=1000&apiKey=${POLYGON_API_KEY}`;
    const maxPages = 10;
    let page = 0;

    while (url && page < maxPages) {
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`Failed to fetch options contracts: ${response.status}`);
      }

      const data = await response.json();
      const results = data.results || [];
      allResults = allResults.concat(results);

      // Polygon returns next_url for pagination
      url = data.next_url ? `${data.next_url}&apiKey=${POLYGON_API_KEY}` : null;
      page++;
    }

    return allResults;

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

  // Fetch each contract individually for precise pricing
  const fetchPromises = contractTickers.map(async (contractTicker) => {
    try {
      const response = await fetch(
        `${API_BASE_URL}/v3/snapshot/options/${ticker}/${contractTicker}?apiKey=${POLYGON_API_KEY}`
      );

      if (!response.ok) {
        console.warn(`Snapshot not available for ${contractTicker} (${response.status}), trying prev close`);
        const closePrice = await getOptionPreviousDayClose(contractTicker);
        if (closePrice > 0) {
          snapshotData[contractTicker].price = closePrice;
        }
        return;
      }

      const data = await response.json();
      const option = data.results;

      if (!option) {
        const closePrice = await getOptionPreviousDayClose(contractTicker);
        if (closePrice > 0) snapshotData[contractTicker].price = closePrice;
        return;
      }

      let price = 0;
      if (option.last_trade?.p) {
        price = option.last_trade.p;
      } else if (option.last_quote?.b > 0 && option.last_quote?.a > 0) {
        price = (option.last_quote.b + option.last_quote.a) / 2;
      }

      snapshotData[contractTicker] = {
        price: price || 0,
        bid: option.last_quote?.b || 0,
        ask: option.last_quote?.a || 0,
        volume: option.day?.v || 0,
        openInterest: option.open_interest || 0,
        impliedVolatility: option.implied_volatility || 0,
        greeks: option.greeks || null
      };

      // Fall back to prev close if still no price
      if (snapshotData[contractTicker].price === 0) {
        const closePrice = await getOptionPreviousDayClose(contractTicker);
        if (closePrice > 0) {
          snapshotData[contractTicker].price = closePrice;
          console.log(`Using prev close for ${contractTicker}: $${closePrice}`);
        }
      }
    } catch (error) {
      console.error(`Error fetching snapshot for ${contractTicker}:`, error.message);
      const closePrice = await getOptionPreviousDayClose(contractTicker);
      if (closePrice > 0) snapshotData[contractTicker].price = closePrice;
    }
  });

  await Promise.all(fetchPromises);
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

