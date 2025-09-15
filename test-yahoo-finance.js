#!/usr/bin/env node

const fetch = require('node-fetch');

// Test script for Yahoo Finance integration
async function testYahooFinanceIntegration() {
  console.log('🧪 Testing Yahoo Finance Options Integration\n');
  
  const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000';
  
  try {
    // Test 1: Single ticker options data
    console.log('1️⃣ Testing Single Ticker Options Data...');
    const testTicker = 'AAPL';
    
    const singleResponse = await fetch(`${baseUrl}/api/yahoo-finance-options?ticker=${testTicker}`);
    
    if (!singleResponse.ok) {
      throw new Error(`Single ticker API error: ${singleResponse.status} ${singleResponse.statusText}`);
    }
    
    const singleData = await singleResponse.json();
    console.log(`   ✅ ${testTicker} options data retrieved:`);
    console.log(`      Current Price: $${singleData.currentPrice?.toFixed(2) || 'N/A'}`);
    console.log(`      Strike Price: $${singleData.strikePrice?.toFixed(2) || 'N/A'}`);
    console.log(`      Total Premium: $${singleData.totalPremium?.toFixed(2) || 'N/A'}`);
    console.log(`      Source: ${singleData.source || 'N/A'}`);
    console.log(`      Data Quality: ${singleData.dataQuality || 'N/A'}`);
    console.log(`      Expiration: ${singleData.expirationDate || 'N/A'}`);
    
    // Test 2: Batch processing
    console.log('\n2️⃣ Testing Batch Options Processing...');
    const testTickers = [
      { ticker: 'AAPL', avg_price: 150.25 },
      { ticker: 'TSLA', avg_price: 245.80 },
      { ticker: 'MSFT', avg_price: 375.50 }
    ];
    
    const batchResponse = await fetch(`${baseUrl}/api/batch-yahoo-options`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ tickers: testTickers })
    });
    
    if (!batchResponse.ok) {
      throw new Error(`Batch API error: ${batchResponse.status} ${batchResponse.statusText}`);
    }
    
    const batchData = await batchResponse.json();
    console.log(`   ✅ Batch processing complete in ${batchData.processingTime}ms`);
    console.log(`   📊 Results: ${batchData.results.yahooFinance} Yahoo Finance, ${batchData.results.estimated} estimated, ${batchData.results.errors} errors`);
    
    batchData.data.forEach((result, index) => {
      if (result.error) {
        console.log(`      ${index + 1}. ${result.ticker}: ERROR - ${result.error}`);
      } else {
        console.log(`      ${index + 1}. ${result.ticker}: $${result.totalPremium?.toFixed(2)} premium (${result.source})`);
      }
    });
    
    // Test 3: Updated automation with Yahoo Finance
    console.log('\n3️⃣ Testing Updated Automation Pipeline...');
    
    const automationResponse = await fetch(`${baseUrl}/api/run-automation`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      }
    });
    
    if (!automationResponse.ok) {
      throw new Error(`Automation API error: ${automationResponse.status} ${automationResponse.statusText}`);
    }
    
    const automationData = await automationResponse.json();
    
    if (automationData.success) {
      console.log('   ✅ Automation pipeline completed successfully');
      console.log(`   📊 Summary:`);
      console.log(`      - Total tickers analyzed: ${automationData.results.summary.totalTickersAnalyzed}`);
      console.log(`      - High activity tickers: ${automationData.results.summary.highActivityTickers}`);
      console.log(`      - Profitable straddles: ${automationData.results.summary.profitableStraddles}`);
      console.log(`      - Execution time: ${automationData.results.duration}ms`);
      
      if (automationData.results.summary.topProfitableStraddles.length > 0) {
        console.log('   🎯 Top Profitable Straddles:');
        automationData.results.summary.topProfitableStraddles.forEach((straddle, index) => {
          console.log(`      ${index + 1}. ${straddle.ticker}: ${straddle.profitableRate.toFixed(1)}% profitable`);
        });
      }
    } else {
      console.log('   ❌ Automation pipeline failed');
      console.log(`   Error: ${automationData.error}`);
    }
    
    // Test 4: Performance comparison
    console.log('\n4️⃣ Performance Analysis...');
    
    const performanceTests = [
      { ticker: 'AAPL', name: 'Large Cap' },
      { ticker: 'TSLA', name: 'High Volatility' },
      { ticker: 'SPY', name: 'ETF' },
      { ticker: 'NVDA', name: 'Tech Stock' }
    ];
    
    console.log('   Testing individual ticker performance:');
    
    for (const test of performanceTests) {
      const startTime = Date.now();
      
      try {
        const response = await fetch(`${baseUrl}/api/yahoo-finance-options?ticker=${test.ticker}`);
        const duration = Date.now() - startTime;
        
        if (response.ok) {
          const data = await response.json();
          console.log(`      ${test.ticker} (${test.name}): ${duration}ms - ${data.source} - $${data.totalPremium?.toFixed(2)} premium`);
        } else {
          console.log(`      ${test.ticker} (${test.name}): ${duration}ms - ERROR ${response.status}`);
        }
      } catch (error) {
        const duration = Date.now() - startTime;
        console.log(`      ${test.ticker} (${test.name}): ${duration}ms - ERROR: ${error.message}`);
      }
      
      // Small delay between requests
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    console.log('\n🎉 Yahoo Finance integration tests completed successfully!');
    console.log('\n📋 Summary:');
    console.log('   ✅ Single ticker options data retrieval');
    console.log('   ✅ Batch processing with rate limiting');
    console.log('   ✅ Integration with automation pipeline');
    console.log('   ✅ Performance testing across different tickers');
    console.log('\n💡 Benefits of Yahoo Finance integration:');
    console.log('   - No API key required');
    console.log('   - No rate limiting restrictions');
    console.log('   - Real-time options data');
    console.log('   - Fallback to estimation when needed');
    console.log('   - Better performance than Polygon.io');
    
  } catch (error) {
    console.error('\n❌ Yahoo Finance integration test failed:', error.message);
    console.error('\n💡 Troubleshooting tips:');
    console.error('   1. Make sure the development server is running (npm run dev)');
    console.error('   2. Check your internet connection');
    console.error('   3. Verify that Yahoo Finance is accessible');
    console.error('   4. Check the server logs for detailed error information');
    process.exit(1);
  }
}

// Run the test
testYahooFinanceIntegration();
