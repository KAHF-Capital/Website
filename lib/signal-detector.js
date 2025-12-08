// Enhanced Signal Detection for Dark Pool Activity
// Generates actionable signals with severity levels and classifications

/**
 * Signal types and their characteristics
 */
const SIGNAL_TYPES = {
  VOLUME_SPIKE: {
    name: 'Volume Spike',
    emoji: '🔥',
    description: 'Dark pool volume significantly above average'
  },
  ACCUMULATION: {
    name: 'Accumulation',
    emoji: '📈',
    description: 'Consistent above-average buying over multiple days'
  },
  DISTRIBUTION: {
    name: 'Distribution',
    emoji: '📉',
    description: 'Large volume at lower prices suggests selling'
  },
  BREAKOUT_SETUP: {
    name: 'Breakout Setup',
    emoji: '🚀',
    description: 'Volume spike with price near highs'
  },
  SECTOR_CLUSTER: {
    name: 'Sector Cluster',
    emoji: '🔗',
    description: 'Multiple tickers in same sector showing activity'
  }
};

/**
 * Severity levels for signals
 */
const SEVERITY_LEVELS = {
  HOT: { min: 3.0, color: 'red', priority: 1, label: '🔥 HOT' },
  WARM: { min: 2.0, color: 'orange', priority: 2, label: '🌡️ WARM' },
  WATCH: { min: 1.5, color: 'yellow', priority: 3, label: '👀 WATCH' }
};

/**
 * Analyze a single ticker for signals
 * @param {Object} ticker - Ticker data with volume, price, etc.
 * @param {Object} historicalData - Historical data for context
 * @returns {Object} Signal analysis result
 */
function analyzeTicker(ticker, historicalData = {}) {
  const signals = [];
  const volumeRatio = parseFloat(ticker.volume_ratio) || 0;
  
  // Determine severity level
  let severity = null;
  if (volumeRatio >= SEVERITY_LEVELS.HOT.min) {
    severity = SEVERITY_LEVELS.HOT;
  } else if (volumeRatio >= SEVERITY_LEVELS.WARM.min) {
    severity = SEVERITY_LEVELS.WARM;
  } else if (volumeRatio >= SEVERITY_LEVELS.WATCH.min) {
    severity = SEVERITY_LEVELS.WATCH;
  }
  
  if (!severity) {
    return { hasSignal: false, signals: [], severity: null };
  }
  
  // Volume Spike Signal
  signals.push({
    type: SIGNAL_TYPES.VOLUME_SPIKE,
    severity: severity,
    volumeRatio: volumeRatio,
    message: `${volumeRatio.toFixed(1)}x average dark pool volume`
  });
  
  // Check for Accumulation pattern (if we have historical data)
  if (historicalData.recentDays && historicalData.recentDays.length >= 3) {
    const aboveAverageDays = historicalData.recentDays.filter(d => 
      d.volumeRatio > 1.2
    ).length;
    
    if (aboveAverageDays >= 3) {
      signals.push({
        type: SIGNAL_TYPES.ACCUMULATION,
        severity: severity,
        message: `${aboveAverageDays} consecutive days of elevated volume`
      });
    }
  }
  
  // Check for Breakout Setup (high volume near price highs)
  if (ticker.avg_price && ticker.max_price) {
    const priceNearHigh = ticker.avg_price >= ticker.max_price * 0.95;
    if (priceNearHigh && volumeRatio >= 2.0) {
      signals.push({
        type: SIGNAL_TYPES.BREAKOUT_SETUP,
        severity: SEVERITY_LEVELS.HOT,
        message: 'Volume spike with price near highs'
      });
    }
  }
  
  // Check for Distribution (high volume at lower prices)
  if (ticker.avg_price && ticker.max_price) {
    const priceNearLow = ticker.avg_price <= ticker.min_price * 1.05;
    if (priceNearLow && volumeRatio >= 2.0) {
      signals.push({
        type: SIGNAL_TYPES.DISTRIBUTION,
        severity: SEVERITY_LEVELS.WARM,
        message: 'Volume spike at lower prices'
      });
    }
  }
  
  return {
    hasSignal: signals.length > 0,
    signals: signals,
    severity: severity,
    primarySignal: signals[0] || null
  };
}

/**
 * Analyze all tickers and group by signal strength
 * @param {Array} tickers - Array of ticker data
 * @param {Object} options - Analysis options
 * @returns {Object} Categorized signals
 */
function analyzeAllTickers(tickers, options = {}) {
  const { 
    minVolumeRatio = 1.5,
    minTotalValue = 100000000, // $100M minimum
    maxResults = 25
  } = options;
  
  const results = {
    hot: [],
    warm: [],
    watch: [],
    sectorClusters: [],
    summary: {
      totalAnalyzed: tickers.length,
      signalsFound: 0,
      timestamp: new Date().toISOString()
    }
  };
  
  // Analyze each ticker
  tickers.forEach(ticker => {
    // Skip low-value tickers
    if (ticker.total_value < minTotalValue) return;
    
    const analysis = analyzeTicker(ticker);
    
    if (analysis.hasSignal) {
      const signalData = {
        ticker: ticker.ticker,
        volumeRatio: ticker.volume_ratio,
        totalValue: ticker.total_value,
        avgPrice: ticker.avg_price,
        tradeCount: ticker.trade_count,
        signals: analysis.signals,
        severity: analysis.severity
      };
      
      if (analysis.severity === SEVERITY_LEVELS.HOT) {
        results.hot.push(signalData);
      } else if (analysis.severity === SEVERITY_LEVELS.WARM) {
        results.warm.push(signalData);
      } else {
        results.watch.push(signalData);
      }
      
      results.summary.signalsFound++;
    }
  });
  
  // Sort each category by volume ratio
  results.hot.sort((a, b) => parseFloat(b.volumeRatio) - parseFloat(a.volumeRatio));
  results.warm.sort((a, b) => parseFloat(b.volumeRatio) - parseFloat(a.volumeRatio));
  results.watch.sort((a, b) => parseFloat(b.volumeRatio) - parseFloat(a.volumeRatio));
  
  // Limit results
  results.hot = results.hot.slice(0, maxResults);
  results.warm = results.warm.slice(0, maxResults);
  results.watch = results.watch.slice(0, maxResults);
  
  return results;
}

/**
 * Format signal for SMS message
 * @param {Object} signal - Signal data
 * @returns {string} Formatted SMS message
 */
function formatSMSMessage(signal) {
  const severity = signal.severity.label;
  const value = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    notation: 'compact',
    maximumFractionDigits: 1
  }).format(signal.totalValue);
  
  return `${severity} ${signal.ticker}\n` +
         `Volume: ${signal.volumeRatio}x avg\n` +
         `Value: ${value}\n` +
         `${signal.signals[0]?.message || ''}\n` +
         `Check scanner for details.`;
}

/**
 * Generate daily summary message
 * @param {Object} analysis - Full analysis results
 * @returns {string} Summary message
 */
function generateDailySummary(analysis) {
  const hotCount = analysis.hot.length;
  const warmCount = analysis.warm.length;
  const watchCount = analysis.watch.length;
  
  let message = `📊 KAHF Daily Signal Summary\n\n`;
  
  if (hotCount > 0) {
    message += `🔥 HOT (${hotCount}): `;
    message += analysis.hot.slice(0, 3).map(s => s.ticker).join(', ');
    if (hotCount > 3) message += ` +${hotCount - 3} more`;
    message += '\n';
  }
  
  if (warmCount > 0) {
    message += `🌡️ WARM (${warmCount}): `;
    message += analysis.warm.slice(0, 3).map(s => s.ticker).join(', ');
    if (warmCount > 3) message += ` +${warmCount - 3} more`;
    message += '\n';
  }
  
  message += `\nTotal signals: ${hotCount + warmCount + watchCount}`;
  message += `\nVisit kahfcapital.com/scanner`;
  
  return message;
}

module.exports = {
  SIGNAL_TYPES,
  SEVERITY_LEVELS,
  analyzeTicker,
  analyzeAllTickers,
  formatSMSMessage,
  generateDailySummary
};

