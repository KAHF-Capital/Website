import fetch from 'node-fetch';

// SMS Configuration
const SMS_CONFIG = {
  twilioAccountSid: process.env.TWILIO_ACCOUNT_SID,
  twilioAuthToken: process.env.TWILIO_AUTH_TOKEN,
  twilioPhoneNumber: process.env.TWILIO_PHONE_NUMBER,
  recipientPhoneNumber: process.env.RECIPIENT_PHONE_NUMBER, // Your phone number
  enabled: process.env.SMS_ALERTS_ENABLED === 'true'
};

// Format profitable straddle data for SMS
function formatStraddleAlert(profitableStraddles) {
  if (profitableStraddles.length === 0) {
    return "🔍 Dark Pool Scanner: No profitable straddles found today.";
  }

  const topStraddles = profitableStraddles.slice(0, 3); // Top 3 most profitable
  let message = `🚀 PROFITABLE STRADDLES ALERT 🚀\n\n`;
  
  topStraddles.forEach((straddle, index) => {
    message += `${index + 1}. ${straddle.ticker} - ${straddle.profitableRate.toFixed(1)}% profitable\n`;
    message += `   Price: $${straddle.currentPrice.toFixed(2)}\n`;
    message += `   Premium: $${straddle.estimatedPremium.toFixed(2)}\n`;
    message += `   Breakeven: $${straddle.upperBreakeven.toFixed(2)} / $${straddle.lowerBreakeven.toFixed(2)}\n\n`;
  });

  if (profitableStraddles.length > 3) {
    message += `+${profitableStraddles.length - 3} more profitable straddles found.\n\n`;
  }

  message += `📊 Total analyzed: ${profitableStraddles.length} tickers\n`;
  message += `⏰ ${new Date().toLocaleString()}`;

  return message;
}

// Send SMS using Twilio
async function sendSMS(message, phoneNumber) {
  if (!SMS_CONFIG.enabled) {
    console.log('SMS alerts disabled. Message would be:', message);
    return { success: true, message: 'SMS disabled' };
  }

  if (!SMS_CONFIG.twilioAccountSid || !SMS_CONFIG.twilioAuthToken || !SMS_CONFIG.twilioPhoneNumber) {
    throw new Error('Twilio configuration missing. Please set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_PHONE_NUMBER environment variables.');
  }

  const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${SMS_CONFIG.twilioAccountSid}/Messages.json`;
  
  const body = new URLSearchParams({
    From: SMS_CONFIG.twilioPhoneNumber,
    To: phoneNumber,
    Body: message
  });

  const response = await fetch(twilioUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${Buffer.from(`${SMS_CONFIG.twilioAccountSid}:${SMS_CONFIG.twilioAuthToken}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: body.toString()
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Twilio API error: ${response.status} - ${errorText}`);
  }

  const result = await response.json();
  return { success: true, messageId: result.sid };
}

// Send email notification as backup (using a simple service like EmailJS or similar)
async function sendEmailAlert(profitableStraddles) {
  // This is a placeholder for email functionality
  // You can implement this using services like SendGrid, Mailgun, or EmailJS
  console.log('Email alert would be sent for:', profitableStraddles.length, 'profitable straddles');
  return { success: true, message: 'Email alert sent' };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { profitableStraddles, analysisSummary } = req.body;

    if (!profitableStraddles || !Array.isArray(profitableStraddles)) {
      return res.status(400).json({ 
        error: 'Missing or invalid profitableStraddles array'
      });
    }

    console.log(`Sending SMS alert for ${profitableStraddles.length} profitable straddles`);

    // Format the alert message
    const alertMessage = formatStraddleAlert(profitableStraddles);

    // Send SMS notification
    let smsResult = null;
    if (SMS_CONFIG.recipientPhoneNumber) {
      try {
        smsResult = await sendSMS(alertMessage, SMS_CONFIG.recipientPhoneNumber);
        console.log('SMS sent successfully:', smsResult.messageId);
      } catch (error) {
        console.error('Failed to send SMS:', error.message);
        smsResult = { success: false, error: error.message };
      }
    } else {
      console.log('No recipient phone number configured');
      smsResult = { success: false, error: 'No recipient phone number configured' };
    }

    // Send email as backup
    let emailResult = null;
    try {
      emailResult = await sendEmailAlert(profitableStraddles);
    } catch (error) {
      console.error('Failed to send email:', error.message);
      emailResult = { success: false, error: error.message };
    }

    const response = {
      timestamp: new Date().toISOString(),
      profitableStraddlesCount: profitableStraddles.length,
      notifications: {
        sms: smsResult,
        email: emailResult
      },
      message: alertMessage
    };

    return res.status(200).json(response);

  } catch (error) {
    console.error('Error in send-sms-alert:', error);
    return res.status(500).json({ 
      error: 'Failed to send alert notifications',
      details: process.env.NODE_ENV === 'development' ? error.message : 'Please try again later'
    });
  }
}
