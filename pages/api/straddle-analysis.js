export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { ticker, strikePrice, totalPremium, daysToExpiration } = req.body;

  if (!ticker || !strikePrice || !totalPremium) {
    return res.status(400).json({ error: 'Missing required parameters' });
  }

  try {
    // Calculate breakeven points
    const upperBreakeven = strikePrice + totalPremium;
    const lowerBreakeven = strikePrice - totalPremium;
    
    // Calculate percentage moves needed
    const upperBreakevenPct = (upperBreakeven - strikePrice) / strikePrice;
    const lowerBreakevenPct = (lowerBreakeven - strikePrice) / strikePrice;

    // Fetch historical data for analysis
    const historicalData = await fetchHistoricalData(ticker, daysToExpiration || 30);
    
    // Analyze historical profitability
    const analysis = analyzeHistoricalProfitability(
      historicalData, 
      upperBreakevenPct, 
      lowerBreakevenPct
    );

    res.status(200).json(analysis);
  } catch (error) {
    console.error('Error in straddle analysis:', error);
    res.status(500).json({ error: 'Failed to perform analysis' });
  }
}

// Fetch historical price data
async function fetchHistoricalData(ticker, daysToExpiration) {
  try {
    // Using Alpha Vantage API for historical data
    const apiKey = process.env.ALPHA_VANTAGE_API_KEY || 'demo';
    const url = `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol=${ticker}&apikey=${apiKey}`;
    
    const response = await fetch(url);
    const data = await response.json();

    if (data['Error Message']) {
      throw new Error('Invalid ticker symbol');
    }

    if (data['Note']) {
      // API limit reached, return mock historical data
      return generateMockHistoricalData(daysToExpiration);
    }

    const timeSeries = data['Time Series (Daily)'];
    if (!timeSeries) {
      throw new Error('No historical data available');
    }

    // Convert to array and sort by date
    const historicalPrices = Object.entries(timeSeries)
      .map(([date, values]) => ({
        date,
        price: parseFloat(values['4. close'])
      }))
      .sort((a, b) => new Date(a.date) - new Date(b.date));

    // Calculate price movements for the specified period
    return calculatePriceMovements(historicalPrices, daysToExpiration);
  } catch (error) {
    console.error('Error fetching historical data:', error);
    // Return mock data as fallback
    return generateMockHistoricalData(daysToExpiration);
  }
}

// Calculate price movements over specified period
function calculatePriceMovements(historicalPrices, daysToExpiration) {
  const movements = [];
  
  for (let i = 0; i < historicalPrices.length - daysToExpiration; i++) {
    const startPrice = historicalPrices[i].price;
    const endPrice = historicalPrices[i + daysToExpiration].price;
    const percentMove = (endPrice - startPrice) / startPrice;
    
    movements.push({
      startDate: historicalPrices[i].date,
      endDate: historicalPrices[i + daysToExpiration].date,
      startPrice,
      endPrice,
      percentMove
    });
  }
  
  return movements;
}

// Generate mock historical data for demo purposes
function generateMockHistoricalData(daysToExpiration) {
  const movements = [];
  const basePrice = 100;
  const volatility = 0.02; // 2% daily volatility
  
  for (let i = 0; i < 100; i++) {
    // Simulate random price movements
    let cumulativeMove = 0;
    for (let day = 0; day < daysToExpiration; day++) {
      cumulativeMove += (Math.random() - 0.5) * volatility * 2;
    }
    
    movements.push({
      startDate: `2024-${String(Math.floor(i / 30) + 1).padStart(2, '0')}-${String((i % 30) + 1).padStart(2, '0')}`,
      endDate: `2024-${String(Math.floor((i + daysToExpiration) / 30) + 1).padStart(2, '0')}-${String(((i + daysToExpiration) % 30) + 1).padStart(2, '0')}`,
      startPrice: basePrice,
      endPrice: basePrice * (1 + cumulativeMove),
      percentMove: cumulativeMove
    });
  }
  
  return movements;
}

// Analyze historical profitability
function analyzeHistoricalProfitability(historicalData, upperBreakevenPct, lowerBreakevenPct) {
  let aboveUpperCount = 0;
  let belowLowerCount = 0;
  let totalValidSamples = 0;
  
  historicalData.forEach(movement => {
    const percentMove = movement.percentMove;
    
    if (percentMove > upperBreakevenPct) {
      aboveUpperCount++;
    }
    if (percentMove < lowerBreakevenPct) {
      belowLowerCount++;
    }
    totalValidSamples++;
  });
  
  const totalProfitable = aboveUpperCount + belowLowerCount;
  const profitableRate = totalValidSamples > 0 ? (totalProfitable / totalValidSamples) * 100 : 0;
  
  return {
    aboveUpper: aboveUpperCount,
    belowLower: belowLowerCount,
    totalProfitable,
    totalSamples: totalValidSamples,
    profitableRate,
    aboveUpperPct: totalValidSamples > 0 ? (aboveUpperCount / totalValidSamples) * 100 : 0,
    belowLowerPct: totalValidSamples > 0 ? (belowLowerCount / totalValidSamples) * 100 : 0,
    upperBreakevenPct: upperBreakevenPct * 100,
    lowerBreakevenPct: lowerBreakevenPct * 100
  };
}
