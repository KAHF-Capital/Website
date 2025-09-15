// Automation Configuration Management
// This file centralizes all automation settings and can be easily modified

const AUTOMATION_CONFIG = {
  // Core automation settings
  enabled: process.env.AUTOMATION_ENABLED === 'true',
  logLevel: process.env.LOG_LEVEL || 'info', // 'debug', 'info', 'warn', 'error'
  
  // Dark pool activity filtering
  minDarkPoolActivity: parseFloat(process.env.MIN_DARK_POOL_ACTIVITY) || 3.0, // 300% (3x) minimum
  minPrice: parseFloat(process.env.MIN_PRICE) || 10, // Minimum stock price
  minVolume: parseFloat(process.env.MIN_VOLUME) || 250000000, // Minimum volume ($250M)
  maxTickersToAnalyze: parseInt(process.env.MAX_TICKERS_TO_ANALYZE) || 50,
  
  // Straddle analysis settings
  profitableThreshold: parseFloat(process.env.PROFITABLE_THRESHOLD) || 55, // 55% profitability threshold
  defaultDaysToExpiration: parseInt(process.env.DEFAULT_DAYS_TO_EXPIRATION) || 30,
  maxConcurrentAnalysis: parseInt(process.env.MAX_CONCURRENT_ANALYSIS) || 3, // Reduced for Yahoo Finance
  minDataQuality: process.env.MIN_DATA_QUALITY || 'medium', // 'low', 'medium', 'high'
  
  // Yahoo Finance specific settings
  yahooFinance: {
    enabled: process.env.YAHOO_FINANCE_ENABLED !== 'false', // Default to true
    rateLimitDelay: parseInt(process.env.YAHOO_RATE_LIMIT_DELAY) || 2000, // 2 seconds between batches
    cacheDuration: parseInt(process.env.YAHOO_CACHE_DURATION) || 300000, // 5 minutes
    maxRetries: parseInt(process.env.YAHOO_MAX_RETRIES) || 3,
    fallbackToEstimation: process.env.YAHOO_FALLBACK_TO_ESTIMATION !== 'false' // Default to true
  }
  
  // Notification settings
  sendAlerts: process.env.SEND_ALERTS === 'true',
  smsEnabled: process.env.SMS_ALERTS_ENABLED === 'true',
  emailEnabled: process.env.EMAIL_ALERTS_ENABLED === 'true',
  
  // Twilio SMS configuration
  twilio: {
    accountSid: process.env.TWILIO_ACCOUNT_SID,
    authToken: process.env.TWILIO_AUTH_TOKEN,
    phoneNumber: process.env.TWILIO_PHONE_NUMBER,
    recipientPhoneNumber: process.env.RECIPIENT_PHONE_NUMBER
  },
  
  // Email configuration (for future implementation)
  email: {
    service: process.env.EMAIL_SERVICE || 'gmail',
    user: process.env.EMAIL_USER,
    password: process.env.EMAIL_PASSWORD,
    recipientEmail: process.env.RECIPIENT_EMAIL
  },
  
  // API configuration
  apis: {
    polygonApiKey: process.env.POLYGON_API_KEY,
    alphaVantageApiKey: process.env.ALPHA_VANTAGE_API_KEY,
    nextAuthUrl: process.env.NEXTAUTH_URL || 'http://localhost:3000'
  },
  
  // Scheduling configuration
  schedule: {
    enabled: process.env.SCHEDULE_ENABLED === 'true',
    cronExpression: process.env.CRON_EXPRESSION || '0 9 * * 1-5', // 9 AM weekdays
    timezone: process.env.TIMEZONE || 'America/New_York'
  }
};

// Validation function to check if all required configuration is present
function validateConfiguration() {
  const errors = [];
  const warnings = [];

  // Check required settings for automation
  if (AUTOMATION_CONFIG.enabled) {
    if (!AUTOMATION_CONFIG.apis.polygonApiKey) {
      errors.push('POLYGON_API_KEY is required for automation');
    }
    
    if (AUTOMATION_CONFIG.sendAlerts) {
      if (AUTOMATION_CONFIG.smsEnabled) {
        if (!AUTOMATION_CONFIG.twilio.accountSid) {
          errors.push('TWILIO_ACCOUNT_SID is required for SMS alerts');
        }
        if (!AUTOMATION_CONFIG.twilio.authToken) {
          errors.push('TWILIO_AUTH_TOKEN is required for SMS alerts');
        }
        if (!AUTOMATION_CONFIG.twilio.phoneNumber) {
          errors.push('TWILIO_PHONE_NUMBER is required for SMS alerts');
        }
        if (!AUTOMATION_CONFIG.twilio.recipientPhoneNumber) {
          warnings.push('RECIPIENT_PHONE_NUMBER not set - SMS alerts will not be sent');
        }
      }
    }
  }

  // Check threshold values
  if (AUTOMATION_CONFIG.minDarkPoolActivity < 1.0) {
    warnings.push('MIN_DARK_POOL_ACTIVITY is very low - may result in too many tickers');
  }
  
  if (AUTOMATION_CONFIG.profitableThreshold < 30) {
    warnings.push('PROFITABLE_THRESHOLD is very low - may result in many false positives');
  }
  
  if (AUTOMATION_CONFIG.profitableThreshold > 80) {
    warnings.push('PROFITABLE_THRESHOLD is very high - may result in very few alerts');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

// Get configuration for a specific module
function getModuleConfig(moduleName) {
  switch (moduleName) {
    case 'scanner':
      return {
        minDarkPoolActivity: AUTOMATION_CONFIG.minDarkPoolActivity,
        minPrice: AUTOMATION_CONFIG.minPrice,
        minVolume: AUTOMATION_CONFIG.minVolume,
        maxTickersToAnalyze: AUTOMATION_CONFIG.maxTickersToAnalyze
      };
    
    case 'analysis':
      return {
        profitableThreshold: AUTOMATION_CONFIG.profitableThreshold,
        defaultDaysToExpiration: AUTOMATION_CONFIG.defaultDaysToExpiration,
        maxConcurrentAnalysis: AUTOMATION_CONFIG.maxConcurrentAnalysis,
        minDataQuality: AUTOMATION_CONFIG.minDataQuality
      };
    
    case 'notifications':
      return {
        sendAlerts: AUTOMATION_CONFIG.sendAlerts,
        smsEnabled: AUTOMATION_CONFIG.smsEnabled,
        emailEnabled: AUTOMATION_CONFIG.emailEnabled,
        twilio: AUTOMATION_CONFIG.twilio,
        email: AUTOMATION_CONFIG.email
      };
    
    case 'schedule':
      return AUTOMATION_CONFIG.schedule;
    
    default:
      return AUTOMATION_CONFIG;
  }
}

// Update configuration (for runtime configuration changes)
function updateConfiguration(updates) {
  Object.keys(updates).forEach(key => {
    if (AUTOMATION_CONFIG.hasOwnProperty(key)) {
      AUTOMATION_CONFIG[key] = updates[key];
    }
  });
}

// Export configuration and utilities
module.exports = {
  config: AUTOMATION_CONFIG,
  validateConfiguration,
  getModuleConfig,
  updateConfiguration
};
