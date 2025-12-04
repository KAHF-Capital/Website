// Twilio SMS Service for VolAlert Pro
const twilio = require('twilio');

// Initialize Twilio client
const getTwilioClient = () => {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  
  if (!accountSid || !authToken) {
    throw new Error('Twilio credentials not configured');
  }
  
  return twilio(accountSid, authToken);
};

// Send SMS alert for dark pool activity
async function sendDarkPoolAlert(phoneNumber, ticker, volumeRatio, totalValue) {
  try {
    const client = getTwilioClient();
    const fromNumber = process.env.TWILIO_PHONE_NUMBER;
    
    if (!fromNumber) {
      throw new Error('Twilio phone number not configured');
    }
    
    const formattedValue = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      notation: 'compact',
      maximumFractionDigits: 1
    }).format(totalValue);
    
    const message = await client.messages.create({
      body: `🔥 KAHF Alert: ${ticker} showing ${volumeRatio}x dark pool volume ratio (${formattedValue} total value). Check scanner for details.`,
      from: fromNumber,
      to: phoneNumber
    });
    
    console.log(`SMS sent to ${phoneNumber}: ${message.sid}`);
    return { success: true, messageId: message.sid };
  } catch (error) {
    console.error(`Failed to send SMS to ${phoneNumber}:`, error.message);
    return { success: false, error: error.message };
  }
}

// Send batch alerts to multiple subscribers
async function sendBatchAlerts(subscribers, alerts) {
  const results = [];
  
  for (const subscriber of subscribers) {
    // Check subscriber preferences
    const subscriberAlerts = alerts.filter(alert => {
      // Apply subscriber filters if they have them
      if (subscriber.minVolumeRatio && parseFloat(alert.volumeRatio) < subscriber.minVolumeRatio) {
        return false;
      }
      if (subscriber.watchlist && subscriber.watchlist.length > 0) {
        return subscriber.watchlist.includes(alert.ticker);
      }
      return true;
    });
    
    // Send alert for each qualifying ticker (max 3 per batch to avoid spam)
    const alertsToSend = subscriberAlerts.slice(0, 3);
    
    for (const alert of alertsToSend) {
      const result = await sendDarkPoolAlert(
        subscriber.phoneNumber,
        alert.ticker,
        alert.volumeRatio,
        alert.totalValue
      );
      results.push({
        subscriberId: subscriber.id,
        ticker: alert.ticker,
        ...result
      });
      
      // Small delay between messages to respect rate limits
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }
  
  return results;
}

// Send welcome message to new subscriber
async function sendWelcomeMessage(phoneNumber) {
  try {
    const client = getTwilioClient();
    const fromNumber = process.env.TWILIO_PHONE_NUMBER;
    
    const message = await client.messages.create({
      body: `Welcome to VolAlert Pro! 🚀 You'll receive SMS alerts when dark pool activity spikes above normal levels. Reply STOP to unsubscribe.`,
      from: fromNumber,
      to: phoneNumber
    });
    
    console.log(`Welcome SMS sent to ${phoneNumber}: ${message.sid}`);
    return { success: true, messageId: message.sid };
  } catch (error) {
    console.error(`Failed to send welcome SMS to ${phoneNumber}:`, error.message);
    return { success: false, error: error.message };
  }
}

// Verify phone number format
function validatePhoneNumber(phoneNumber) {
  // Remove any non-digit characters except +
  const cleaned = phoneNumber.replace(/[^\d+]/g, '');
  
  // Check if it's a valid US number format
  if (cleaned.startsWith('+1') && cleaned.length === 12) {
    return { valid: true, formatted: cleaned };
  }
  
  // If it's 10 digits, assume US and add +1
  if (/^\d{10}$/.test(cleaned)) {
    return { valid: true, formatted: `+1${cleaned}` };
  }
  
  // If it starts with 1 and is 11 digits, add +
  if (cleaned.startsWith('1') && cleaned.length === 11) {
    return { valid: true, formatted: `+${cleaned}` };
  }
  
  return { valid: false, formatted: null };
}

module.exports = {
  sendDarkPoolAlert,
  sendBatchAlerts,
  sendWelcomeMessage,
  validatePhoneNumber
};


