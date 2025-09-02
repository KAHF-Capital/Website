const POLYGON_API_KEY = process.env.POLYGON_API_KEY;

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { ticker } = req.query;

  if (!ticker) {
    return res.status(400).json({ error: 'Ticker is required' });
  }

  if (!POLYGON_API_KEY) {
    return res.status(500).json({ error: 'Polygon API key not configured' });
  }

  try {
    console.log(`Testing options data for ticker: ${ticker}`);
    
    // Test 1: Get stock price
    const stockResponse = await fetch(
      `https://api.polygon.io/v2/aggs/ticker/${ticker}/prev?adjusted=true&apiKey=${POLYGON_API_KEY}`
    );
    
    if (!stockResponse.ok) {
      throw new Error(`Stock price request failed: ${stockResponse.status}`);
    }
    
    const stockData = await stockResponse.json();
    console.log('Stock data:', stockData);
    
    // Test 2: Get available options contracts
    const contractsResponse = await fetch(
      `https://api.polygon.io/v3/reference/options/contracts?underlying_ticker=${ticker}&limit=10&apiKey=${POLYGON_API_KEY}`
    );
    
    if (!contractsResponse.ok) {
      throw new Error(`Contracts request failed: ${contractsResponse.status}`);
    }
    
    const contractsData = await contractsResponse.json();
    console.log('Contracts data:', contractsData);
    
    // Test 3: Get a specific options contract
    if (contractsData.results && contractsData.results.length > 0) {
      const firstContract = contractsData.results[0];
      console.log('First contract:', firstContract);
      
      // Test 4: Get options pricing data
      const optionsResponse = await fetch(
        `https://api.polygon.io/v1/open-close/${firstContract.ticker}/${firstContract.expiration_date}?adjusted=true&apiKey=${POLYGON_API_KEY}`
      );
      
      if (optionsResponse.ok) {
        const optionsData = await optionsResponse.json();
        console.log('Options pricing data:', optionsData);
      } else {
        console.log('Options pricing request failed:', optionsResponse.status);
      }
    }
    
    return res.status(200).json({
      ticker,
      stockData,
      contractsData,
      message: 'Test completed - check server logs'
    });

  } catch (error) {
    console.error('Test error:', error);
    return res.status(500).json({ 
      error: 'Test failed',
      details: error.message 
    });
  }
}
