import fetch from 'node-fetch';

// Configuration for the automation pipeline
const AUTOMATION_CONFIG = {
  enabled: process.env.AUTOMATION_ENABLED === 'true',
  profitableThreshold: parseFloat(process.env.PROFITABLE_THRESHOLD) || 55,
  minDarkPoolActivity: parseFloat(process.env.MIN_DARK_POOL_ACTIVITY) || 3.0,
  maxTickersToAnalyze: parseInt(process.env.MAX_TICKERS_TO_ANALYZE) || 50,
  sendAlerts: process.env.SEND_ALERTS === 'true',
  logLevel: process.env.LOG_LEVEL || 'info'
};

// Logging utility
function log(level, message, data = null) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] [${level.toUpperCase()}] ${message}`;
  
  if (AUTOMATION_CONFIG.logLevel === 'debug' || level === 'error' || level === 'info') {
    console.log(logMessage);
    if (data) {
      console.log(JSON.stringify(data, null, 2));
    }
  }
}

// Step 1: Get high activity tickers from automated scanner
async function getHighActivityTickers() {
  try {
    log('info', 'Step 1: Fetching high activity tickers from automated scanner');
    
    const response = await fetch(`${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/api/automated-scanner`);
    
    if (!response.ok) {
      throw new Error(`Automated scanner API error: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    
    log('info', `Found ${data.high_activity_tickers} high activity tickers out of ${data.total_tickers_analyzed} total tickers`);
    
    return {
      success: true,
      data: data,
      tickers: data.tickers
    };
  } catch (error) {
    log('error', 'Failed to get high activity tickers', { error: error.message });
    return {
      success: false,
      error: error.message
    };
  }
}

// Step 2: Analyze straddle profitability for all tickers
async function analyzeStraddleProfitability(tickers) {
  try {
    log('info', `Step 2: Analyzing straddle profitability for ${tickers.length} tickers`);
    
    const response = await fetch(`${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/api/automated-straddle-analysis`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ tickers })
    });
    
    if (!response.ok) {
      throw new Error(`Straddle analysis API error: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    
    log('info', `Analysis complete: ${data.profitable_straddles} profitable straddles found out of ${data.total_tickers_analyzed} analyzed`);
    
    return {
      success: true,
      data: data,
      profitableStraddles: data.profitable_straddles_list
    };
  } catch (error) {
    log('error', 'Failed to analyze straddle profitability', { error: error.message });
    return {
      success: false,
      error: error.message
    };
  }
}

// Step 3: Send notifications for profitable straddles
async function sendNotifications(profitableStraddles, analysisSummary) {
  if (!AUTOMATION_CONFIG.sendAlerts || profitableStraddles.length === 0) {
    log('info', `Skipping notifications: sendAlerts=${AUTOMATION_CONFIG.sendAlerts}, profitableStraddles=${profitableStraddles.length}`);
    return {
      success: true,
      message: 'Notifications skipped'
    };
  }

  try {
    log('info', `Step 3: Sending notifications for ${profitableStraddles.length} profitable straddles`);
    
    const response = await fetch(`${process.env.NEXTAUTH_URL || 'http://localhost:3000'}/api/send-sms-alert`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ 
        profitableStraddles,
        analysisSummary 
      })
    });
    
    if (!response.ok) {
      throw new Error(`SMS alert API error: ${response.status} ${response.statusText}`);
    }
    
    const data = await response.json();
    
    log('info', 'Notifications sent successfully', { 
      sms: data.notifications.sms.success,
      email: data.notifications.email.success 
    });
    
    return {
      success: true,
      data: data
    };
  } catch (error) {
    log('error', 'Failed to send notifications', { error: error.message });
    return {
      success: false,
      error: error.message
    };
  }
}

// Main automation pipeline
async function runAutomationPipeline() {
  const startTime = Date.now();
  log('info', '🚀 Starting Dark Pool Straddle Automation Pipeline');
  log('info', 'Configuration', AUTOMATION_CONFIG);
  
  const results = {
    timestamp: new Date().toISOString(),
    config: AUTOMATION_CONFIG,
    steps: {},
    summary: {},
    duration: 0
  };

  try {
    // Step 1: Get high activity tickers
    const tickerResult = await getHighActivityTickers();
    results.steps.getTickers = tickerResult;
    
    if (!tickerResult.success) {
      throw new Error(`Step 1 failed: ${tickerResult.error}`);
    }

    // Step 2: Analyze straddle profitability
    const analysisResult = await analyzeStraddleProfitability(tickerResult.tickers);
    results.steps.analyzeStraddles = analysisResult;
    
    if (!analysisResult.success) {
      throw new Error(`Step 2 failed: ${analysisResult.error}`);
    }

    // Step 3: Send notifications
    const notificationResult = await sendNotifications(
      analysisResult.profitableStraddles,
      {
        totalTickers: tickerResult.data.total_tickers_analyzed,
        highActivityTickers: tickerResult.data.high_activity_tickers,
        analyzedTickers: analysisResult.data.total_tickers_analyzed,
        profitableStraddles: analysisResult.data.profitable_straddles
      }
    );
    results.steps.sendNotifications = notificationResult;

    // Compile summary
    results.summary = {
      totalTickersAnalyzed: tickerResult.data.total_tickers_analyzed,
      highActivityTickers: tickerResult.data.high_activity_tickers,
      straddlesAnalyzed: analysisResult.data.total_tickers_analyzed,
      profitableStraddles: analysisResult.data.profitable_straddles,
      notificationsSent: notificationResult.success,
      topProfitableStraddles: analysisResult.profitableStraddles.slice(0, 5).map(s => ({
        ticker: s.ticker,
        profitableRate: s.profitableRate,
        currentPrice: s.currentPrice
      }))
    };

    const duration = Date.now() - startTime;
    results.duration = duration;

    log('info', '✅ Automation pipeline completed successfully', results.summary);
    log('info', `⏱️ Total execution time: ${duration}ms`);

    return {
      success: true,
      results: results
    };

  } catch (error) {
    const duration = Date.now() - startTime;
    results.duration = duration;
    results.error = error.message;

    log('error', '❌ Automation pipeline failed', { error: error.message, duration });
    
    return {
      success: false,
      error: error.message,
      results: results
    };
  }
}

// API endpoint handler
export default async function handler(req, res) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Check if automation is enabled
  if (!AUTOMATION_CONFIG.enabled) {
    return res.status(200).json({
      success: false,
      message: 'Automation is disabled. Set AUTOMATION_ENABLED=true to enable.',
      config: AUTOMATION_CONFIG
    });
  }

  try {
    log('info', 'Automation API endpoint called');
    
    const result = await runAutomationPipeline();
    
    if (result.success) {
      return res.status(200).json(result);
    } else {
      return res.status(500).json(result);
    }

  } catch (error) {
    log('error', 'Unexpected error in automation API', { error: error.message });
    return res.status(500).json({
      success: false,
      error: 'Unexpected error occurred',
      details: process.env.NODE_ENV === 'development' ? error.message : 'Please try again later'
    });
  }
}
