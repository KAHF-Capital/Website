#!/usr/bin/env node

const fetch = require('node-fetch');

// Test script for the automation system
async function testAutomation() {
  console.log('🧪 Testing Dark Pool Straddle Automation System\n');
  
  const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000';
  
  try {
    // Test 1: Automated Scanner
    console.log('1️⃣ Testing Automated Scanner...');
    const scannerResponse = await fetch(`${baseUrl}/api/automated-scanner`);
    
    if (!scannerResponse.ok) {
      throw new Error(`Scanner API error: ${scannerResponse.status} ${scannerResponse.statusText}`);
    }
    
    const scannerData = await scannerResponse.json();
    console.log(`   ✅ Found ${scannerData.high_activity_tickers} high activity tickers`);
    console.log(`   📊 Total tickers analyzed: ${scannerData.total_tickers_analyzed}`);
    
    if (scannerData.tickers.length === 0) {
      console.log('   ⚠️  No high activity tickers found. Check your data and thresholds.');
      return;
    }
    
    // Test 2: Straddle Analysis (with first few tickers)
    console.log('\n2️⃣ Testing Straddle Analysis...');
    const testTickers = scannerData.tickers.slice(0, 3); // Test with first 3 tickers
    console.log(`   🔍 Analyzing ${testTickers.length} tickers: ${testTickers.map(t => t.ticker).join(', ')}`);
    
    const analysisResponse = await fetch(`${baseUrl}/api/automated-straddle-analysis`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ tickers: testTickers })
    });
    
    if (!analysisResponse.ok) {
      throw new Error(`Analysis API error: ${analysisResponse.status} ${analysisResponse.statusText}`);
    }
    
    const analysisData = await analysisResponse.json();
    console.log(`   ✅ Analysis complete: ${analysisData.profitable_straddles} profitable straddles found`);
    
    if (analysisData.profitable_straddles_list.length > 0) {
      console.log('   🎯 Profitable straddles:');
      analysisData.profitable_straddles_list.forEach((straddle, index) => {
        console.log(`      ${index + 1}. ${straddle.ticker}: ${straddle.profitableRate.toFixed(1)}% profitable`);
      });
    }
    
    // Test 3: SMS Alerts (if profitable straddles found)
    if (analysisData.profitable_straddles_list.length > 0) {
      console.log('\n3️⃣ Testing SMS Alerts...');
      
      const smsResponse = await fetch(`${baseUrl}/api/send-sms-alert`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          profitableStraddles: analysisData.profitable_straddles_list,
          analysisSummary: {
            totalTickers: scannerData.total_tickers_analyzed,
            highActivityTickers: scannerData.high_activity_tickers,
            analyzedTickers: analysisData.total_tickers_analyzed,
            profitableStraddles: analysisData.profitable_straddles
          }
        })
      });
      
      if (!smsResponse.ok) {
        throw new Error(`SMS API error: ${smsResponse.status} ${smsResponse.statusText}`);
      }
      
      const smsData = await smsResponse.json();
      console.log(`   ✅ SMS notification sent: ${smsData.notifications.sms.success}`);
      if (smsData.notifications.sms.error) {
        console.log(`   ⚠️  SMS error: ${smsData.notifications.sms.error}`);
      }
    } else {
      console.log('\n3️⃣ Skipping SMS test (no profitable straddles found)');
    }
    
    // Test 4: Full Automation Pipeline
    console.log('\n4️⃣ Testing Full Automation Pipeline...');
    
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
      console.log('   ✅ Full automation pipeline completed successfully');
      console.log(`   📊 Summary:`);
      console.log(`      - Total tickers analyzed: ${automationData.results.summary.totalTickersAnalyzed}`);
      console.log(`      - High activity tickers: ${automationData.results.summary.highActivityTickers}`);
      console.log(`      - Profitable straddles: ${automationData.results.summary.profitableStraddles}`);
      console.log(`      - Execution time: ${automationData.results.duration}ms`);
    } else {
      console.log('   ❌ Automation pipeline failed');
      console.log(`   Error: ${automationData.error}`);
    }
    
    console.log('\n🎉 All tests completed successfully!');
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error('\n💡 Troubleshooting tips:');
    console.error('   1. Make sure the development server is running (npm run dev)');
    console.error('   2. Check that CSV data has been processed (npm run process-csv)');
    console.error('   3. Verify environment variables are set correctly');
    console.error('   4. Check the logs for more detailed error information');
    process.exit(1);
  }
}

// Run the test
testAutomation();
