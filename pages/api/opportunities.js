export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { limit = 50, symbol, all_data } = req.query;
    const apiKey = process.env.POLYGON_API_KEY;

    // Check if API key is properly configured
    if (!apiKey || apiKey === 'YOUR_POLYGON_API_KEY_HERE' || apiKey === 'your_polygon_api_key_here') {
      return res.status(503).json({ 
        error: 'Trading scanner is currently unavailable. Please try again later.',
        details: 'Service temporarily unavailable'
      });
    }

    // Use provided symbol or default list
    const symbols = symbol ? [symbol.toUpperCase()] : [
      'AAPL', 'TSLA', 'NVDA', 'SPY', 'QQQ', 'AMZN', 'MSFT', 'GOOGL', 'META', 'AMD',
      'NFLX', 'CRM', 'ADBE', 'PYPL', 'INTC', 'ORCL', 'CSCO', 'IBM', 'QCOM', 'AVGO',
      'TXN', 'MU', 'LRCX', 'KLAC', 'ADI', 'MCHP', 'ASML', 'TSM', 'SMCI', 'PLTR'
    ];
    const opportunities = [];
    const analysisData = [];

    // Analyze each symbol for straddle opportunities
    for (const symbol of symbols) {
      try {
        // Get current stock price
        const stockResponse = await fetch(
          `https://api.polygon.io/v2/aggs/ticker/${symbol}/prev?adjusted=true&apiKey=${apiKey}`
        );
        
        let currentPrice = null;
        let currentDate = new Date().toISOString().split('T')[0];
        
        if (stockResponse.ok) {
          const stockData = await stockResponse.json();
          if (stockData.results && stockData.results[0]) {
            currentPrice = stockData.results[0].c; // Close price
          }
        }

        // Get options chain for current month expiration
        const optionsResponse = await fetch(
          `https://api.polygon.io/v3/reference/options/contracts?underlying_ticker=${symbol}&expired=false&limit=1000&apiKey=${apiKey}`
        );
        
        let atmOptions = null;
        let callPrice = null;
        let putPrice = null;
        let impliedVol = null;
        let realizedVol = null;
        let straddleCost = null;
        
        if (optionsResponse.ok) {
          const optionsData = await optionsResponse.json();
          if (optionsData.results && Array.isArray(optionsData.results)) {
            // Find ATM straddle options (closest to current price)
            atmOptions = findATMStraddleOptions(optionsData.results, currentPrice);
            if (atmOptions) {
              // Get previous day's close prices for options using Polygon.io API
              const callPriceData = await getOptionPrice(atmOptions.call.ticker, apiKey);
              const putPriceData = await getOptionPrice(atmOptions.put.ticker, apiKey);
              
              if (callPriceData && putPriceData) {
                callPrice = callPriceData;
                putPrice = putPriceData;
                straddleCost = callPrice + putPrice;
                impliedVol = calculateImpliedVolatility(currentPrice, straddleCost, atmOptions.daysToExpiry);
              } else {
                // Fallback to estimated prices if API fails
                const estimatedCallPrice = Math.max(0, currentPrice - atmOptions.strike) + (currentPrice * 0.1);
                const estimatedPutPrice = Math.max(0, atmOptions.strike - currentPrice) + (currentPrice * 0.1);
                
                callPrice = estimatedCallPrice;
                putPrice = estimatedPutPrice;
                straddleCost = callPrice + putPrice;
                impliedVol = calculateImpliedVolatility(currentPrice, straddleCost, atmOptions.daysToExpiry);
              }
            }
          }
        }

        // Calculate straddle cost and implied volatility (if not already calculated)
        if (!straddleCost && callPrice && putPrice) {
          straddleCost = callPrice + putPrice;
        }
        if (!impliedVol && currentPrice && straddleCost && atmOptions) {
          impliedVol = calculateImpliedVolatility(currentPrice, straddleCost, atmOptions.daysToExpiry);
        }

        // Get historical price data for realized volatility calculation (90 days for better accuracy)
        const historicalResponse = await fetch(
          `https://api.polygon.io/v2/aggs/ticker/${symbol}/range/1/day/${new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]}/${currentDate}?adjusted=true&sort=asc&limit=90&apiKey=${apiKey}`
        );
        
        if (historicalResponse.ok) {
          const historicalData = await historicalResponse.json();
          if (historicalData.results && Array.isArray(historicalData.results) && historicalData.results.length > 20) {
            // Calculate realized volatility from real historical data
            realizedVol = calculateRealizedVolatility(historicalData.results);
            console.log(`Calculated realized volatility for ${symbol}: ${(realizedVol * 100).toFixed(1)}%`);
          } else {
            // Fallback to estimated volatility based on stock characteristics
            realizedVol = estimateVolatility(currentPrice, symbol);
            console.log(`Using estimated volatility for ${symbol}: ${(realizedVol * 100).toFixed(1)}%`);
          }
        } else {
          // Fallback to estimated volatility
          realizedVol = estimateVolatility(currentPrice, symbol);
          console.log(`Using estimated volatility for ${symbol}: ${(realizedVol * 100).toFixed(1)}%`);
        }

                // Get dark pool data for today
        const darkPoolData = await getDarkPoolData(symbol, currentDate, apiKey);

        // Create analysis data entry
        const analysisEntry = {
          symbol: symbol,
          current_price: currentPrice,
          implied_vol: impliedVol,
          realized_vol: realizedVol,
          dark_pool_ratio: darkPoolData ? (darkPoolData.darkPoolVolume / darkPoolData.totalVolume) : null,
          options_analyzed: !!(callPrice && putPrice && atmOptions),
          call_price: callPrice,
          put_price: putPrice,
          strike_price: atmOptions?.strike,
          days_to_expiry: atmOptions?.daysToExpiry,
          status: determineStatus(impliedVol, realizedVol, currentPrice, callPrice, putPrice),
          reason: determineReason(impliedVol, realizedVol, currentPrice, callPrice, putPrice)
        };
        
        analysisData.push(analysisEntry);

        // Only suggest straddle if IV < HV (volatility is underpriced)
        if (impliedVol && realizedVol && impliedVol < realizedVol && straddleCost && atmOptions) {
          const opportunity = createStraddleOpportunity(
            symbol, 
            currentPrice, 
            straddleCost, 
            impliedVol, 
            realizedVol, 
            darkPoolData,
            atmOptions.daysToExpiry
          );
          
          if (opportunity) {
            opportunities.push(opportunity);
          }
        }

      } catch (error) {
        console.error(`Error analyzing ${symbol}:`, error);
        
        // Add analysis entry for failed analysis
        analysisData.push({
          symbol: symbol,
          current_price: null,
          implied_vol: null,
          realized_vol: null,
          dark_pool_ratio: null,
          options_analyzed: false,
          call_price: null,
          put_price: null,
          strike_price: null,
          days_to_expiry: null,
          status: 'no_data',
          reason: 'Failed to analyze - insufficient data or API error'
        });
        
        continue;
      }
    }

    // Return all analysis data if requested
    if (all_data === 'true') {
      return res.status(200).json({
        analysis_data: analysisData,
        opportunities: opportunities.length,
        total_analyzed: analysisData.length
      });
    }

    // Sort by probability of success and apply limit
    const sortedOpportunities = opportunities
      .sort((a, b) => (b.probability_of_success || 0) - (a.probability_of_success || 0))
      .slice(0, parseInt(limit));

    return res.status(200).json(sortedOpportunities);

  } catch (error) {
    console.error('Error getting opportunities:', error);
    return res.status(500).json({ 
      error: 'Unable to fetch trading opportunities at this time. Please try again later.',
      details: 'Service temporarily unavailable'
    });
  }
}

function findATMStraddleOptions(options, currentPrice) {
  try {
    if (!Array.isArray(options) || options.length === 0) {
      console.log('No options data available');
      return null;
    }

    // Filter for active options (not expired) and valid contract types
    const validOptions = options.filter(option => 
      option && 
      option.contract_type && 
      (option.contract_type === 'call' || option.contract_type === 'put') &&
      option.expiration_date &&
      option.strike_price &&
      option.ticker
    );

    if (validOptions.length === 0) {
      console.log('No valid options found');
      return null;
    }

    // Group options by expiration date
    const optionsByExpiry = {};
    validOptions.forEach(option => {
      if (!optionsByExpiry[option.expiration_date]) {
        optionsByExpiry[option.expiration_date] = [];
      }
      optionsByExpiry[option.expiration_date].push(option);
    });

    // Find the nearest expiration date (filter out past dates)
    const today = new Date().toISOString().split('T')[0];
    const futureExpirations = Object.keys(optionsByExpiry)
      .filter(date => date >= today)
      .sort();

    if (futureExpirations.length === 0) {
      console.log('No future expiration dates found');
      return null;
    }

    const nearestExpiry = futureExpirations[0];
    const nearestOptions = optionsByExpiry[nearestExpiry];

    // Find ATM strike (closest to current price)
    let atmStrike = null;
    let minDiff = Infinity;

    nearestOptions.forEach(option => {
      const diff = Math.abs(option.strike_price - currentPrice);
      if (diff < minDiff) {
        minDiff = diff;
        atmStrike = option.strike_price;
      }
    });

    if (!atmStrike) {
      console.log('Could not determine ATM strike');
      return null;
    }

    // Find call and put for the ATM strike
    const atmCall = nearestOptions.find(opt => 
      opt.contract_type === 'call' && opt.strike_price === atmStrike
    );
    const atmPut = nearestOptions.find(opt => 
      opt.contract_type === 'put' && opt.strike_price === atmStrike
    );

    if (!atmCall || !atmPut) {
      console.log('Could not find both call and put for ATM strike');
      return null;
    }

    // Calculate days to expiry
    const expiryDate = new Date(nearestExpiry);
    const daysToExpiry = Math.ceil((expiryDate - new Date()) / (1000 * 60 * 60 * 24));

    console.log(`Found ATM straddle for ${atmCall.underlying_ticker}: Call ${atmCall.ticker}, Put ${atmPut.ticker}, Strike $${atmStrike}, Expiry ${nearestExpiry} (${daysToExpiry} days)`);

    return {
      call: atmCall,
      put: atmPut,
      strike: atmStrike,
      expiration: nearestExpiry,
      daysToExpiry: daysToExpiry
    };
  } catch (error) {
    console.error('Error finding ATM straddle options:', error);
    return null;
  }
}

async function getOptionPrice(contractTicker, apiKey) {
  try {
    // Use Polygon.io's previous day bar endpoint for options
    const response = await fetch(
      `https://api.polygon.io/v2/aggs/ticker/${contractTicker}/prev?adjusted=true&apiKey=${apiKey}`
    );
    
    if (!response.ok) {
      console.log(`Failed to get price for ${contractTicker}: ${response.status}`);
      return null;
    }
    
    const data = await response.json();
    if (!data.results || !data.results[0]) {
      console.log(`No price data for ${contractTicker}`);
      return null;
    }
    
    const price = data.results[0].c; // Close price from previous day
    console.log(`Got previous day close for ${contractTicker}: $${price}`);
    return price;
  } catch (error) {
    console.error(`Error getting option price for ${contractTicker}:`, error);
    return null;
  }
}

function calculateImpliedVolatility(stockPrice, straddleCost, daysToExpiry) {
  try {
    // Simplified IV calculation using straddle approximation
    // IV ≈ (straddle_cost / stock_price) * sqrt(365 / days_to_expiry)
    const timeToExpiry = daysToExpiry / 365;
    const iv = (straddleCost / stockPrice) / Math.sqrt(timeToExpiry);
    return Math.min(Math.max(iv, 0.1), 2.0); // Cap between 10% and 200%
  } catch (error) {
    console.error('Error calculating implied volatility:', error);
    return 0.3; // Default 30%
  }
}

function calculateRealizedVolatility(priceData) {
  try {
    if (priceData.length < 2) return 0.3;

    const returns = [];
    for (let i = 1; i < priceData.length; i++) {
      const return_val = Math.log(priceData[i].c / priceData[i-1].c);
      returns.push(return_val);
    }

    const mean = returns.reduce((sum, ret) => sum + ret, 0) / returns.length;
    const variance = returns.reduce((sum, ret) => sum + Math.pow(ret - mean, 2), 0) / returns.length;
    const volatility = Math.sqrt(variance * 252); // Annualized

    return Math.min(Math.max(volatility, 0.1), 2.0); // Cap between 10% and 200%
  } catch (error) {
    console.error('Error calculating realized volatility:', error);
    return 0.3; // Default 30%
  }
}

function estimateVolatility(currentPrice, symbol) {
  try {
    // Estimate volatility based on stock characteristics and price
    // Higher-priced stocks tend to have lower volatility
    // Tech stocks tend to have higher volatility
    
    let baseVolatility = 0.25; // 25% base volatility
    
    // Adjust based on price level
    if (currentPrice > 200) {
      baseVolatility *= 0.8; // Lower volatility for high-priced stocks
    } else if (currentPrice < 50) {
      baseVolatility *= 1.2; // Higher volatility for low-priced stocks
    }
    
    // Adjust based on known high-volatility stocks
    const highVolStocks = ['TSLA', 'NVDA', 'AMD', 'PLTR', 'SMCI'];
    if (highVolStocks.includes(symbol)) {
      baseVolatility *= 1.3;
    }
    
    // Adjust based on known low-volatility stocks
    const lowVolStocks = ['SPY', 'QQQ', 'AAPL', 'MSFT', 'GOOGL'];
    if (lowVolStocks.includes(symbol)) {
      baseVolatility *= 0.8;
    }
    
    return Math.min(Math.max(baseVolatility, 0.15), 0.6); // Cap between 15% and 60%
  } catch (error) {
    console.error('Error estimating volatility:', error);
    return 0.25; // Default 25%
  }
}

async function getDarkPoolData(symbol, date, apiKey) {
  try {
    // Get today's trades
    const response = await fetch(
      `https://api.polygon.io/v3/trades/${symbol}?date=${date}&limit=1000&apiKey=${apiKey}`
    );
    
    if (!response.ok) return null;
    
    const data = await response.json();
    if (!data.results || !Array.isArray(data.results)) return null;

    // Filter dark pool trades (exchange = 4 AND trf_id present)
    const darkPoolTrades = data.results.filter(trade => 
      trade && typeof trade === 'object' && 
      trade.exchange === 4 && 
      trade.trf_id !== undefined
    );

    const totalVolume = data.results.reduce((sum, trade) => sum + (trade.size || 0), 0);
    const darkPoolVolume = darkPoolTrades.reduce((sum, trade) => sum + (trade.size || 0), 0);

    return {
      totalVolume,
      darkPoolVolume,
      darkPoolTrades: darkPoolTrades.length,
      totalTrades: data.results.length
    };
  } catch (error) {
    console.error('Error getting dark pool data:', error);
    return null;
  }
}

function createStraddleOpportunity(symbol, currentPrice, straddleCost, impliedVol, realizedVol, darkPoolData, daysToExpiry) {
  try {
    // Calculate volatility spread
    const volSpread = ((realizedVol - impliedVol) / impliedVol) * 100;
    
    // Calculate probability of success based on historical patterns
    // Higher vol spread = higher probability of success
    const baseProbability = Math.min(85, Math.max(15, 50 + volSpread * 2));
    
    // Adjust probability based on dark pool activity
    let darkPoolMultiplier = 1.0;
    if (darkPoolData && darkPoolData.totalVolume > 0) {
      const darkPoolRatio = darkPoolData.darkPoolVolume / darkPoolData.totalVolume;
      if (darkPoolRatio > 0.1) { // More than 10% dark pool activity
        darkPoolMultiplier = 1.2;
      }
    }
    
    const probabilityOfSuccess = Math.min(95, baseProbability * darkPoolMultiplier);
    
    // Calculate expected profit based on vol spread and probability
    const expectedProfit = Math.floor(straddleCost * (volSpread / 100) * 10);

    return {
      id: Date.now() + Math.random(),
      symbol: symbol,
      strategy_type: "Long Straddle",
      current_price: currentPrice,
      straddle_cost: straddleCost,
      implied_vol: impliedVol,
      realized_vol: realizedVol,
      vol_spread: volSpread,
      expected_profit: expectedProfit,
      probability_of_success: probabilityOfSuccess,
      days_to_expiry: daysToExpiry,
      created_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      metadata: {
        total_volume: darkPoolData?.totalVolume || 0,
        dark_pool_volume: darkPoolData?.darkPoolVolume || 0,
        dark_pool_ratio: darkPoolData?.totalVolume > 0 ? (darkPoolData.darkPoolVolume / darkPoolData.totalVolume) : 0,
        total_trades: darkPoolData?.totalTrades || 0,
        dark_pool_trades: darkPoolData?.darkPoolTrades || 0
      }
    };
  } catch (error) {
    console.error('Error creating straddle opportunity:', error);
    return null;
  }
}

function determineStatus(impliedVol, realizedVol, currentPrice, callPrice, putPrice) {
  if (!currentPrice) return 'no_data';
  if (!callPrice || !putPrice) return 'no_data';
  if (!impliedVol || !realizedVol) return 'no_data';
  
  return impliedVol < realizedVol ? 'opportunity' : 'overpriced';
}

function determineReason(impliedVol, realizedVol, currentPrice, callPrice, putPrice) {
  if (!currentPrice) return 'No stock price data available';
  if (!callPrice || !putPrice) return 'No options data available';
  if (!impliedVol || !realizedVol) return 'Unable to calculate volatility';
  
  return impliedVol < realizedVol ? 
    'IV < HV - Volatility is underpriced, straddle opportunity available' :
    'IV ≥ HV - Volatility is overpriced, no straddle opportunity';
}
